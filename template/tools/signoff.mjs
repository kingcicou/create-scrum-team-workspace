#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadTeamModel, memberResponsibilities, activeMemberIds } from "./lib/team-model.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL_VERSION = "{{TOOL_VERSION}}";
// 影响全局审计“含义”的输入：变更定义、角色事实源、审计工具。
// publish 时固化其指纹，sign 时用 Node 重算比对（无需 Python）。
const AUDIT_INPUT_PATHS = [
  "00_项目导航/11_角色行动手册.md",
  "00_项目导航/roles.config.json",
  "tools/generate_doc_index.py",
];
const ROLE_ALIASES = {
  po: "po", sm: "sm", tl: "tl",
  midbe: "midbe", "mid.be": "midbe", "mid.be/qa": "midbe",
  srfe: "srfe", "sr.fe": "srfe", "sr.fe/ux": "srfe",
  midfe: "midfe", "mid.fe": "midfe", "mid.fe/qa": "midfe",
  fs: "fs", "fs/devops": "fs",
};

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const [command = "status", ...rest] = argv;
  const options = {};
  for (const item of rest) {
    if (!item.startsWith("--")) fail(`未知参数：${item}`);
    const [key, ...value] = item.slice(2).split("=");
    options[key] = value.length ? value.join("=") : true;
  }
  return { command, options };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(repo, args, allowFailure = false, identity = null) {
  const config = identity
    ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`]
    : [];
  const result = spawnSync("git", ["-C", repo, ...config, ...args], { encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(" ")} 失败：${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function compactDate(value) {
  return value.replaceAll("-", "");
}

function formatDueInstant(instant, timezone) {
  if (timezone === "Asia/Shanghai") {
    return new Date(instant + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  }
  if (timezone === "UTC") {
    return new Date(instant).toISOString().slice(0, 16).replace("T", " ");
  }
  return new Date(instant).toISOString();
}

function parseDue(value, timezone) {
  const due = String(value || "").trim();
  if (!due) fail("prepare 必须提供 --due=<未来时间>，不得使用待确认或群聊补写。");
  let instant;
  let normalized = due;
  const relative = /^\+(\d+)(m|h|d)$/.exec(due);
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(due);
  if (relative) {
    const factors = { m: 60_000, h: 3_600_000, d: 86_400_000 };
    instant = Date.now() + Number(relative[1]) * factors[relative[2]];
    normalized = formatDueInstant(instant, timezone);
  } else if (local) {
    const offsets = { "Asia/Shanghai": "+08:00", UTC: "Z" };
    const offset = offsets[timezone];
    if (!offset) {
      fail(`截止时间 ${due} 未含时区偏移，当前仅支持 Asia/Shanghai 或 UTC。`);
    }
    instant = Date.parse(`${local[1]}T${local[2]}:${local[3] || "00"}${offset}`);
  } else {
    instant = Date.parse(due);
  }
  if (!Number.isFinite(instant)) fail(`无法解析截止时间：${due}`);
  return { due: normalized, instant };
}

function validateDue(value, timezone) {
  const { due, instant } = parseDue(value, timezone);
  if (instant <= Date.now()) fail(`截止时间必须晚于当前时间：${due}`);
  return due;
}

function splitValues(value) {
  return String(value || "").split(/[,，;]/).map((item) => item.trim()).filter(Boolean);
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableObject(value[key])]),
    );
  }
  return value;
}

function scopeHash(audit) {
  const scope = {
    currentBaseline: audit.currentBaseline,
    pendingAssignments: audit.pendingAssignments || {},
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableObject(scope)))
    .digest("hex");
}

function versionNumber(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : -1;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function normalizeRole(value) {
  const key = String(value || "").trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
}

function loadContext(options) {
  const configPath = path.join(PROJECT_ROOT, "00_项目导航", "roles.config.json");
  if (!fs.existsSync(configPath)) fail(`缺少角色事实源：${configPath}`);
  const config = readJson(configPath);
  // R4.3b：统一从团队模型取身份。旧七角色配置投影为等价 member-hat 视图
  // （scrum.scrumMaster==="sm"，roles 逐字段一致），行为与旧路径不变；
  // v2 配置则按 members + scrum 解析，SM 不再硬编码。
  const model = loadTeamModel(config);
  const roles = {};
  for (const m of model.members) {
    roles[m.id] = { id: m.id, name: m.name, email: m.email, status: m.status || "active" };
  }
  const smId = model.scrum.scrumMaster;
  const poId = model.scrum.productOwner;
  if (!smId || !roles[smId]?.name || !roles[smId]?.email) {
    fail("roles.config.json 缺少 SM（scrum.scrumMaster）姓名或邮箱。");
  }

  // RC3：只有 status=active 的成员需要签核（core 启动团队）；planned/optional 待激活。
  // 旧配置无 status 字段 → 全部视为 active（兼容）。
  const activeRoleIds = new Set(activeMemberIds(model));

  const defaultRepo = config.gitRoot === "repo"
    ? path.join(PROJECT_ROOT, "10_代码仓库", config.repoName)
    : PROJECT_ROOT;
  const repo = options.repo
    ? path.resolve(PROJECT_ROOT, options.repo)
    : defaultRepo;
  if (git(repo, ["rev-parse", "--is-inside-work-tree"], true).status !== 0) {
    fail(`签核证据目录必须位于 Git 仓库：${repo}`);
  }
  const store = path.join(repo, ".team", "signoffs");
  const lockTimeoutMs = Number(options["lock-timeout"] || 60_000);
  return { config, model, roles, smId, poId, activeRoleIds, repo, store, lockTimeoutMs };
}

function roleIdentity(context, roleId) {
  const expected = context.roles[roleId];
  if (!expected) fail(`未知角色：${roleId}`);
  if (!expected.name || !expected.email) fail(`角色 ${roleId} 缺少姓名或邮箱。`);
  return expected;
}

function requireActor(options, expectedRole) {
  const actor = normalizeRole(options.actor);
  if (actor !== normalizeRole(expectedRole)) {
    fail(`本命令只能由角色 ${expectedRole} 执行，请显式传入 --actor=${expectedRole}。`);
  }
}

function relativeToRepo(context, file) {
  return path.relative(context.repo, file).split(path.sep).join("/");
}

function auditSourceChanges(context) {
  const generatedDir = path.dirname(auditPath());
  const generatedRelative = relativeToRepo(context, generatedDir);
  const canIgnoreGenerated = generatedRelative
    && generatedRelative !== "."
    && !generatedRelative.startsWith("../");
  const output = git(
    context.repo,
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
  ).stdout;
  const fields = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    const status = entry.slice(0, 2);
    const changedPath = entry.slice(3).replaceAll("\\", "/");
    if (status.includes("R") || status.includes("C")) index += 1;
    if (canIgnoreGenerated
      && (changedPath === generatedRelative
        || changedPath.startsWith(`${generatedRelative}/`))) {
      continue;
    }
    changes.push(`${status} ${changedPath}`);
  }
  return changes;
}

function ensureCleanAuditSource(context, operation) {
  const changes = auditSourceChanges(context);
  if (changes.length) {
    fail(
      `${operation} 要求可复现的干净事实源；请先提交或撤销以下工作区变化：\n`
      + changes.join("\n"),
    );
  }
}

function ensureNoStagedChanges(context) {
  const staged = git(context.repo, ["diff", "--cached", "--name-only"]).stdout.trim();
  if (staged) fail(`存在已暂存内容，拒绝混入签核提交：\n${staged}`);
}

function commitOnly(context, file, message, identity) {
  ensureNoStagedChanges(context);
  const relative = relativeToRepo(context, file);
  git(context.repo, ["add", "--", relative]);
  git(context.repo, ["commit", "-m", message, "--", relative], false, identity);
}

function withMutationLock(context, action) {
  const commonDirRaw = git(context.repo, ["rev-parse", "--git-common-dir"]).stdout.trim();
  const commonDir = path.isAbsolute(commonDirRaw)
    ? commonDirRaw
    : path.resolve(context.repo, commonDirRaw);
  const lock = path.join(commonDir, "signoff-operation.lock");
  let handle;
  const deadline = Date.now() + context.lockTimeoutMs;
  while (!handle) {
    try {
      handle = fs.openSync(lock, "wx");
      fs.writeFileSync(handle, `${process.pid} ${new Date().toISOString()}\n`, "utf8");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        fail(`等待签核写锁超时：${lock}。确认没有活动签核进程后再处理遗留锁。`);
      }
      sleep(100);
    }
  }
  try {
    return action();
  } finally {
    fs.closeSync(handle);
    fs.rmSync(lock, { force: true });
  }
}

function introduction(context, file, expected) {
  const relative = relativeToRepo(context, file);
  const dirty = git(context.repo, ["status", "--porcelain", "--", relative]).stdout.trim();
  if (dirty) return { ok: false, state: "pending", detail: `未提交：${dirty}` };
  const output = git(
    context.repo,
    ["log", "--format=%H%x1f%an%x1f%ae%x1f%aI", "--", relative],
    true,
  ).stdout.trim();
  if (!output) return { ok: false, state: "pending", detail: "Git 中尚无创建提交" };
  const history = output.split(/\r?\n/).filter(Boolean);
  const [hash, author, email, time] = history.at(-1).split("\x1f");
  if (history.length !== 1) {
    return { ok: false, state: "invalid", detail: `事件文件创建后被修改 ${history.length - 1} 次` };
  }
  if (author !== expected.name || email.toLowerCase() !== expected.email.toLowerCase()) {
    return {
      ok: false,
      state: "invalid",
      detail: `首次作者 ${author} <${email}>，应为 ${expected.name} <${expected.email}>`,
    };
  }
  return { ok: true, state: "valid", detail: `${hash.slice(0, 9)} · ${author} <${email}> · ${time}` };
}

function campaignPath(context, campaignId) {
  return path.join(context.store, "campaigns", `${campaignId}.json`);
}

function noticePath(context, campaignId) {
  return path.join(context.store, "notices", `${campaignId}.json`);
}

function closurePath(context, campaignId) {
  return path.join(context.store, "closures", `${campaignId}.json`);
}

function eventDir(context, campaignId) {
  return path.join(context.store, "events", campaignId);
}

function loadCampaign(context, campaignId) {
  const file = campaignPath(context, campaignId);
  if (!fs.existsSync(file)) fail(`Campaign 不存在：${campaignId}`);
  return { file, data: readJson(file) };
}

function latestCampaignId(context) {
  const dir = path.join(context.store, "campaigns");
  if (!fs.existsSync(dir)) fail("尚无事件文件 Campaign，请先由 SM 执行 prepare。");
  const names = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  if (!names.length) fail("尚无事件文件 Campaign，请先由 SM 执行 prepare。");
  return names.at(-1).slice(0, -5);
}

function eventFiles(context, campaignId) {
  const dir = eventDir(context, campaignId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dir, name));
}

function nextCampaignId(context) {
  const date = compactDate(localDate());
  const dir = path.join(context.store, "campaigns");
  const prefix = `SIGN-${date}-`;
  const sequences = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .map((name) => new RegExp(`^${prefix}(\\d{3})\\.json$`).exec(name)?.[1])
      .filter(Boolean)
      .map(Number)
    : [];
  const next = (sequences.length ? Math.max(...sequences) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function auditPath() {
  return path.join(PROJECT_ROOT, "00_项目导航", "文档索引", "07_签核状态.json");
}

function refreshGlobalAudit(context) {
  const script = path.join(PROJECT_ROOT, "tools", "generate_doc_index.py");
  if (!fs.existsSync(script)) return { available: false, reason: "缺少 generate_doc_index.py" };
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON, []]]
    : process.platform === "win32"
      ? [["python", []], ["py", ["-3"]]]
      : [["python3", []], ["python", []]];
  let result = null;
  for (const [command, prefix] of candidates) {
    result = spawnSync(command, [...prefix, script], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    if (!result.error && result.status === 0) break;
  }
  if (!result || result.error || result.status !== 0) {
    const detail = result?.error?.message || result?.stderr || "找不到 Python";
    return { available: false, reason: `无法刷新全局审计：${String(detail).trim()}` };
  }
  const file = auditPath();
  if (!fs.existsSync(file)) return { available: false, reason: "生成器未输出 07_签核状态.json" };
  return { available: true, data: readJson(file) };
}

function globalAuditOrFail(context) {
  const audit = refreshGlobalAudit(context);
  if (!audit.available) fail(`${audit.reason}。为避免错误关闭，本次操作已停止。`);
  return audit.data;
}

function repoHead(context) {
  return git(context.repo, ["rev-parse", "HEAD"]).stdout.trim();
}

function repoTree(context) {
  return git(context.repo, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
}

function noticeDigest(campaign) {
  const payload = {
    campaignId: campaign.campaignId,
    targetBaseline: campaign.targetBaseline,
    mode: campaign.mode,
    sourceCampaignId: campaign.sourceCampaignId,
    scopeSource: campaign.scopeSource,
    auditScopeHash: campaign.auditScopeHash,
    repositoryHead: campaign.repositoryHead,
    repositoryTree: campaign.repositoryTree,
    purpose: campaign.purpose,
    summary: campaign.summary,
    readScope: campaign.readScope,
    dueAt: campaign.dueAt,
    timezone: campaign.timezone,
    assignments: campaign.assignments,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableObject(payload)))
    .digest("hex");
}

function storedIdentity(value, fallback) {
  if (value?.name && value?.email) return { name: value.name, email: value.email };
  return fallback;
}

function renderNotice(context, campaign, digest) {
  const lines = [
    `【签核通知｜${campaign.campaignId}｜${campaign.targetBaseline}｜${campaign.mode}】`,
    `Notice 一致性摘要：sha256=${digest}（非秘密·可重算·仅防批次漂移，不是身份认证或阅读证明）`,
    `生成依据：tool=${campaign.toolVersion || "legacy"}`
      + `｜scope=${campaign.scopeSource || "legacy"}`
      + `｜audit=${String(campaign.auditScopeHash || "none").slice(0, 12)}`
      + `｜head=${String(campaign.repositoryHead || "none").slice(0, 12)}`
      + `｜tree=${String(campaign.repositoryTree || "none").slice(0, 12)}`,
  ];
  if (campaign.sourceCampaignId) lines.push(`来源：${campaign.sourceCampaignId}`);
  lines.push(`目的：${campaign.purpose || "确认受影响规范变更"}`);
  lines.push(`变更摘要：${campaign.summary || "见指定阅读范围"}`);
  lines.push(`阅读范围：${(campaign.readScope || []).join("；") || "由 SM 指定"}`);
  lines.push(`截止：${campaign.dueAt}（${campaign.timezone}）`);
  lines.push("身份：无需、也禁止为签核反复修改 git user.name/user.email；命令仅对本次提交使用角色事实源。");
  lines.push("执行：只运行本人下方完整命令；--notice 是一致性摘要（非秘密、非身份认证、非阅读证明），缺失或与批次不符时工具拒绝签核。");
  for (const [memberId, assignment] of Object.entries(campaign.assignments || {})) {
    const member = campaign.participants?.[memberId] || context.roles[memberId] || {};
    const memberOption = Number(campaign.schemaVersion || 0) >= 5 ? "member" : "role";
    lines.push(`@${member.name || memberId} (${memberId})：覆盖 ${assignment.coverage.join(",")}`);
    lines.push(
      `  node tools/signoff.mjs sign --campaign=${campaign.campaignId}`
      + ` --${memberOption}=${memberId} --notice=${digest}`,
    );
  }
  lines.push("完成回复：【签核完成】成员 + 命令输出中的 Event ID；无需手填 commit。");
  lines.push(`验收：SM 运行 node tools/signoff.mjs status --campaign=${campaign.campaignId}`);
  lines.push(
    `关闭：仅 SM 运行 node tools/signoff.mjs close --campaign=${campaign.campaignId}`
    + ` --actor=${campaign.createdByRole || context.smId}；项目全局仍有缺口时工具拒绝关闭。`,
  );
  return lines;
}

function coverageIncludes(coverage, changeId, campaignTarget, auditBaseline) {
  if (coverage.includes(changeId)) return true;
  return coverage.some((item) => item.startsWith("BASELINE-"))
    && versionNumber(campaignTarget) >= versionNumber(auditBaseline);
}

function missingCoverage(campaign, audit) {
  const missing = [];
  for (const [roleId, required] of Object.entries(audit.pendingAssignments || {})) {
    const coverage = campaign.assignments?.[roleId]?.coverage || [];
    const absent = required.filter(
      (changeId) => !coverageIncludes(
        coverage,
        changeId,
        campaign.targetBaseline,
        audit.currentBaseline,
      ),
    );
    if (absent.length) missing.push({ roleId, coverage: absent });
  }
  return missing;
}

function computeAuditInputHash() {
  const hash = crypto.createHash("sha256");
  for (const rel of AUDIT_INPUT_PATHS) {
    const file = path.join(PROJECT_ROOT, rel);
    hash.update(rel);
    hash.update("\0");
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from("MISSING"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

// sign 阶段的三级漂移判断（无 Python）：
// - 审计输入漂移（手册/配置/工具变化）→ 拒绝，要求 SM 重建 Campaign
// - 代码漂移（非 .team/signoffs 路径）→ 仅提示，不阻断
// - 正常漂移（仅签核工件）→ 放行；close 仍跑 Python 做实时全局审计
function verifyFrozen(context, campaign, snapshot) {
  const currentInputHash = computeAuditInputHash();
  if (snapshot.inputHash && currentInputHash !== snapshot.inputHash) {
    fail(
      "审计输入已变化（角色手册/角色配置/审计工具），Notice 快照失效；"
      + "请由 SM 在干净事实源重新运行 prepare --from-audit 与 publish 创建新批次。",
    );
  }
  const frozenAudit = {
    currentBaseline: snapshot.currentBaseline,
    pendingAssignments: snapshot.pendingAssignments || {},
  };
  const missing = missingCoverage(campaign, frozenAudit);
  if (missing.length) {
    const detail = missing.map((item) => `${item.roleId}:${item.coverage.join(",")}`).join("；");
    fail(`Campaign 未覆盖 Notice 快照中的全局待处理：${detail}。请由 SM 重建纠偏批次。`);
  }
  const base = campaign.repositoryHead;
  if (base) {
    const head = repoHead(context);
    if (head !== base) {
      const output = git(context.repo, ["diff", "--name-only", base, head], true).stdout || "";
      const changed = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const codeDrift = changed.filter((item) => !item.startsWith(".team/signoffs/"));
      if (codeDrift.length) {
        console.warn(
          `[WARN] 自 Campaign 发布以来有 ${codeDrift.length} 处非签核改动（代码漂移，不阻断签核）：`,
        );
        for (const item of codeDrift.slice(0, 8)) console.warn(`  ~ ${item}`);
      }
    }
  }
}

function verifyCampaign(context, campaignId, print = true) {
  ensureCleanAuditSource(context, "verify");
  const { data: campaign } = loadCampaign(context, campaignId);
  const audit = globalAuditOrFail(context);
  const missing = missingCoverage(campaign, audit);
  const currentHash = scopeHash(audit);
  const exactSource = campaign.scopeSource === "global-audit"
    && campaign.auditScopeHash === currentHash;
  if (print) {
    console.log(
      `Verify: ${missing.length ? "FAILED" : "OK"}`
      + ` · tool=${campaign.toolVersion || "legacy"}`
      + ` · source=${campaign.scopeSource || "legacy"}`
      + ` · audit=${String(campaign.auditScopeHash || "none").slice(0, 12)}`
      + ` · current=${currentHash.slice(0, 12)}`
      + ` · exact=${exactSource ? "yes" : "no"}`,
    );
    for (const item of missing) {
      console.log(`- missing ${item.roleId}: ${item.coverage.join(",")}`);
    }
  }
  return { campaign, audit, missing, currentHash, exactSource, ok: missing.length === 0 };
}

function evaluate(context, campaignId, print = true) {
  const { file: campaignFile, data: campaign } = loadCampaign(context, campaignId);
  const campaignCreator = storedIdentity(
    campaign.createdByIdentity,
    context.roles[campaign.createdByRole || context.smId],
  );
  const campaignEvidence = introduction(context, campaignFile, campaignCreator);
  const events = eventFiles(context, campaignId).map((file) => {
    const data = readJson(file);
    const memberId = data.memberId || data.role;
    const expected = campaign.participants?.[memberId] || context.roles[memberId];
    const evidence = expected
      ? introduction(context, file, expected)
      : { ok: false, state: "invalid", detail: `未知成员 ${memberId}` };
    return { file, data, evidence };
  });

  const rows = [];
  for (const [memberId, assignment] of Object.entries(campaign.assignments || {})) {
    const required = new Set(assignment.coverage || []);
    const validCoverage = new Set();
    const expected = campaign.participants?.[memberId] || context.roles[memberId];
    const roleEvents = events.filter(
      (event) => (event.data.memberId || event.data.role) === memberId,
    );
    for (const event of roleEvents) {
      if (event.evidence.ok
        && event.data.member === expected?.name
        && event.data.email?.toLowerCase() === expected?.email?.toLowerCase()) {
        for (const item of event.data.coverage || []) validCoverage.add(item);
      }
    }
    const missing = [...required].filter((item) => !validCoverage.has(item));
    const invalid = roleEvents.filter((event) => !event.evidence.ok);
    rows.push({ roleId: memberId, required: [...required], missing, invalid, roleEvents });
  }

  const closureFile = closurePath(context, campaignId);
  let closure = null;
  if (fs.existsSync(closureFile)) {
    const data = readJson(closureFile);
    closure = {
      data,
      evidence: introduction(
        context,
        closureFile,
        storedIdentity(
          data.closedByIdentity,
          context.roles[data.closedByRole || campaign.createdByRole || context.smId],
        ),
      ),
    };
  }
  const ready = campaignEvidence.ok
    && rows.every((row) => row.missing.length === 0);
  const closed = ready && closure?.evidence.ok;

  if (print) {
    console.log(`Campaign: ${campaignId} | target=${campaign.targetBaseline} | mode=${campaign.mode}`);
    console.log(`Campaign evidence: ${campaignEvidence.ok ? "OK" : "ERROR"} · ${campaignEvidence.detail}`);
    for (const row of rows) {
      const role = context.roles[row.roleId];
      const state = row.missing.length ? "PENDING" : "VALID";
      console.log(`- ${row.roleId} / ${role?.name || "?"}: ${state}`);
      if (row.missing.length) console.log(`  missing: ${row.missing.join(",")}`);
      for (const event of row.invalid) {
        console.log(`  invalid ${event.data.eventId || path.basename(event.file)}: ${event.evidence.detail}`);
      }
    }
    console.log(`Closure: ${closed ? `CLOSED · ${closure.evidence.detail}` : closure ? `INVALID/PENDING · ${closure.evidence.detail}` : "OPEN"}`);
  }
  return { campaign, campaignEvidence, events, rows, ready, closed, closure };
}

function prepare(context, options) {
  requireActor(options, context.smId);
  const sm = roleIdentity(context, context.smId);
  return withMutationLock(context, () => {
    ensureCleanAuditSource(context, "prepare");
    const timezone = String(options.timezone || "Asia/Shanghai");
    const dueMode = options["due-mode"] === "hard" ? "hard" : "advisory";
    // hard 模式强制未来截止；advisory 为非约束提示，允许逾期/历史截止。
    const dueAt = dueMode === "hard"
      ? validateDue(options.due, timezone)
      : parseDue(options.due, timezone).due;
    const audit = globalAuditOrFail(context);
    let assignments;
    let target = String(options.target || "").trim();
    let mode = options.mode || "incremental";
    let source = options.source || null;
    if (options["from-audit"] || options.bootstrap) {
      if (!audit.pendingCount || !Object.keys(audit.pendingAssignments || {}).length) {
        fail(options.bootstrap
          ? "全局审计没有首签待处理角色；不得重复创建首签 Campaign。"
          : "全局审计没有待处理角色，无需创建纠偏 Campaign。");
      }
      assignments = Object.fromEntries(
        Object.entries(audit.pendingAssignments).map(([roleId, coverage]) => [
          normalizeRole(roleId),
          { coverage },
        ]),
      );
      target ||= audit.currentBaseline;
      mode = options.bootstrap ? "initial" : "corrective";
      source ||= audit.closedCampaignId || null;
    } else {
      const coverage = splitValues(options.coverage);
      if (!target || !coverage.length) fail("prepare 需要 --target、--coverage，或使用 --from-audit。");
      const roleIds = options.roles === "all"
        ? [...context.activeRoleIds]
        : splitValues(options.roles).map(normalizeRole);
      if (!roleIds.length) fail("prepare 需要 --roles=all 或角色列表。");
      assignments = Object.fromEntries(roleIds.map((roleId) => [roleId, { coverage }]));
    }
    for (const roleId of Object.keys(assignments)) {
      if (!context.roles[roleId]) fail(`未知角色：${roleId}`);
    }
    const campaignId = String(options.campaign || nextCampaignId(context)).trim();
    const file = campaignPath(context, campaignId);
    if (fs.existsSync(file)) fail(`Campaign 已存在：${campaignId}`);
    // R4.2：固化成员快照（姓名/邮箱/责任/覆盖）。历史 Event 按此快照验证，
    // 不因成员后来改名/换邮箱而失效；不动态读取当前 assignments。
    const teamModel = loadTeamModel(context.config);
    const participants = {};
    for (const [memberId, assignment] of Object.entries(assignments)) {
      const member = context.roles[memberId] || {};
      participants[memberId] = {
        name: member.name || memberId,
        email: member.email || "",
        responsibilities: memberResponsibilities(teamModel, memberId),
        coverage: assignment.coverage || [],
      };
    }
    const campaign = {
      schemaVersion: 5,
      toolVersion: TOOL_VERSION,
      campaignId,
      mode,
      dueMode,
      targetBaseline: target,
      sourceCampaignId: source,
      scopeSource: options["from-audit"] || options.bootstrap ? "global-audit" : "explicit",
      auditGeneratedAt: audit.generatedAt,
      auditSourceHead: audit.sourceHead || null,
      auditScopeHash: scopeHash(audit),
      repositoryHead: repoHead(context),
      repositoryTree: repoTree(context),
      auditSourceState: "clean",
      purpose: options.purpose
        || (options.bootstrap
          ? "完成团队入队首签"
          : options["from-audit"]
            ? "纠正全局签核缺口"
            : "确认受影响规范变更"),
      summary: options.summary || "按 Campaign 的逐角色范围完成阅读与签核。",
      readScope: splitValues(options.read || "本人角色卡;责任表;周期任务清单;角色行动手册指定变更章节"),
      dueAt,
      timezone,
      identityMode: "command-scoped",
      createdAt: localDate(),
      createdByRole: context.smId,
      createdByIdentity: { memberId: context.smId, name: sm.name, email: sm.email },
      assignments,
      participants,
    };
    const missing = missingCoverage(campaign, audit);
    if (missing.length) {
      const detail = missing
        .map((item) => `${item.roleId}:${item.coverage.join(",")}`)
        .join("；");
      fail(`Campaign 未覆盖当前全局待处理：${detail}。请使用 --from-audit。`);
    }
    writeJson(file, campaign);
    commitOnly(context, file, `signoff(prepare): ${campaignId} ${target}`, sm);
    console.log(`[OK] Campaign 已创建并由 SM 提交：${relativeToRepo(context, file)}`);
    console.log(`[INFO] Campaign ID：${campaignId}`);
    return campaignId;
  });
}

function bootstrap(context, options) {
  requireActor(options, context.smId);
  const campaignsDir = path.join(context.store, "campaigns");
  const existing = fs.existsSync(campaignsDir)
    ? fs.readdirSync(campaignsDir).filter((name) => name.endsWith(".json"))
    : [];
  if (existing.length) {
    fail("bootstrap 仅用于首次入队签核，当前仓库已有 Campaign；后续请使用 prepare/publish。");
  }

  const audit = globalAuditOrFail(context);
  const configuredRoles = [...context.activeRoleIds].sort();
  const pendingRoles = Object.keys(audit.pendingAssignments || {}).map(normalizeRole).sort();
  const absent = configuredRoles.filter((roleId) => !pendingRoles.includes(roleId));
  if (absent.length) {
    fail(`首签审计未覆盖全部激活(active)角色：${absent.join(",")}；请先修正角色手册与审计事实源。`);
  }

  const campaignId = prepare(context, {
    ...options,
    bootstrap: true,
    mode: "initial",
    due: options.due || "+72h",
    "due-mode": options["due-mode"] || "advisory",
    purpose: options.purpose || "完成团队入队首签",
    summary: options.summary || "确认本人角色卡、责任表、周期任务清单及签核操作规则。",
    read: options.read || "本人角色卡;治理责任表;周期任务清单;签核编排协议与本人命令",
  });
  publish(context, { ...options, campaign: campaignId, actor: context.smId });
  console.log(`[OK] 首签已发起：${campaignId}。创建者推送后，SM 仅跟踪 status 与 close。`);
}

function sign(context, options) {
  // R4.2b：优先 --member=<成员ID>；--role 兼容（legacy 下 member id === role id）。
  const memberId = options.member ? String(options.member).trim() : normalizeRole(options.role);
  if (!memberId) fail("sign 需要 --member=<成员ID> 或 --role=<角色槽位>。");
  withMutationLock(context, () => {
    const campaignId = String(options.campaign || latestCampaignId(context));
    const { data: campaign } = loadCampaign(context, campaignId);
    // 身份优先取 Campaign 快照（participants），历史不因成员改名/换邮箱失效；
    // 旧 Campaign 无快照时回落到当前角色事实源。
    const snapshot = campaign.participants?.[memberId];
    const member = snapshot
      ? { name: snapshot.name, email: snapshot.email }
      : roleIdentity(context, memberId);
    const { instant: dueInstant } = parseDue(campaign.dueAt, campaign.timezone);
    const late = Date.now() > dueInstant;
    const lateBySeconds = late ? Math.round((Date.now() - dueInstant) / 1000) : 0;
    if (late && campaign.dueMode === "hard") {
      fail(`Campaign 为 hard 截止模式且已过期（${campaign.dueAt}），拒绝签核；请由 SM 重建批次。`);
    }
    const assignment = campaign.assignments?.[memberId];
    if (!assignment) fail(`Campaign ${campaignId} 未分配成员/角色 ${memberId}。`);
    const campaignEvidence = introduction(
      context,
      campaignPath(context, campaignId),
      storedIdentity(
        campaign.createdByIdentity,
        context.roles[campaign.createdByRole || context.smId],
      ),
    );
    if (!campaignEvidence.ok) fail(`Campaign 尚未由 SM 有效提交：${campaignEvidence.detail}`);
    const noticeFile = noticePath(context, campaignId);
    if (!fs.existsSync(noticeFile)) fail(`Campaign 尚未发布 Notice：${campaignId}`);
    const notice = readJson(noticeFile);
    const digest = noticeDigest(campaign);
    const suppliedDigest = String(options.notice || "");
    if (notice.digest !== digest || suppliedDigest !== digest) {
      fail("Notice 摘要缺失或不匹配；请从 SM 发布的原始 Notice 运行本人完整命令。");
    }
    const noticeEvidence = introduction(
      context,
      noticeFile,
      storedIdentity(notice.publishedByIdentity, context.roles[notice.publishedByRole || context.smId]),
    );
    if (!noticeEvidence.ok) fail(`Notice 未由 SM 有效发布：${noticeEvidence.detail}`);
    if (JSON.stringify(notice.content) !== JSON.stringify(renderNotice(context, campaign, digest))) {
      fail("Notice 内容与 Campaign 不一致，拒绝签核。");
    }
    // 覆盖与漂移校验：优先用 Notice 已发布快照（Node/Git，无需 Python）；
    // 旧 Notice 无快照时回落到实时全局审计（Python）。
    if (notice.auditSnapshot) {
      verifyFrozen(context, campaign, notice.auditSnapshot);
    } else {
      const verification = verifyCampaign(context, campaignId, false);
      if (!verification.ok) {
        fail("Campaign 未覆盖当前全局待处理，拒绝签核；请由 SM 运行 verify 并新建纠偏批次。");
      }
    }
    if (fs.existsSync(closurePath(context, campaignId))) fail(`Campaign 已存在 closure，拒绝继续签核：${campaignId}`);

    const existing = eventFiles(context, campaignId);
    const idSegment = memberId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const prefix = `EVT-${idSegment}-${compactDate(localDate())}-`;
    let sequence = 1;
    while (existing.some((file) => path.basename(file).startsWith(`${prefix}${String(sequence).padStart(3, "0")}`))) {
      sequence += 1;
    }
    const eventId = options.event || `${prefix}${String(sequence).padStart(3, "0")}`;
    const file = path.join(eventDir(context, campaignId), `${eventId}.json`);
    if (fs.existsSync(file)) fail(`Event 已存在：${eventId}`);
    writeJson(file, {
      schemaVersion: 4,
      eventId,
      campaignId,
      role: memberId,
      memberId,
      member: member.name,
      email: member.email,
      responsibilities: snapshot?.responsibilities || [],
      targetBaseline: campaign.targetBaseline,
      coverage: assignment.coverage,
      signedAt: localDate(),
      dueAt: campaign.dueAt,
      dueMode: campaign.dueMode || "advisory",
      late,
      lateBySeconds,
      identityMode: "command-scoped",
      noticeDigest: digest,
      result: "accepted",
    });
    commitOnly(context, file, `sign(${memberId}): ${eventId} · ${campaignId}`, member);
    const evidence = introduction(context, file, member);
    if (!evidence.ok) fail(`Event 提交后校验失败：${evidence.detail}`);
    if (late) {
      console.warn(
        `[WARN] 逾期签核：截止 ${campaign.dueAt}，迟 ${Math.round(lateBySeconds / 60)} 分钟`
        + "（advisory 模式，已在 Event 记录 late=true 与迟到时长）。",
      );
    }
    console.log(`[OK] ${eventId} · ${member.name} · ${assignment.coverage.join(",")} · ${evidence.detail}`);
    console.log("[INFO] 未修改仓库 user.name/user.email；身份仅作用于本次提交。");
  });
}

function close(context, options) {
  requireActor(options, context.smId);
  const sm = roleIdentity(context, context.smId);
  withMutationLock(context, () => {
    ensureCleanAuditSource(context, "close");
    const campaignId = String(options.campaign || latestCampaignId(context));
    const status = evaluate(context, campaignId, true);
    if (!status.ready) fail("Campaign 局部审计未归零，拒绝关闭。");
    const globalAudit = globalAuditOrFail(context);
    if (globalAudit.pendingCount > 0) {
      const detail = Object.entries(globalAudit.pendingAssignments || {})
        .map(([roleId, coverage]) => `${roleId}:${coverage.join(",")}`)
        .join("；");
      fail(`项目全局仍有 ${globalAudit.pendingCount} 名待处理，拒绝关闭：${detail}`);
    }
    const file = closurePath(context, campaignId);
    if (fs.existsSync(file)) fail(`Closure 已存在：${campaignId}`);
    writeJson(file, {
      schemaVersion: 2,
      campaignId,
      closedAt: localDate(),
      closedByRole: context.smId,
      closedByIdentity: { memberId: context.smId, name: sm.name, email: sm.email },
      globalAuditGeneratedAt: globalAudit.generatedAt,
      result: "closed",
      eventIds: status.events.filter((event) => event.evidence.ok).map((event) => event.data.eventId).sort(),
    });
    commitOnly(context, file, `signoff(close): ${campaignId}`, sm);
    const evidence = introduction(context, file, sm);
    if (!evidence.ok) fail(`Closure 提交后校验失败：${evidence.detail}`);
    console.log(`[OK] Campaign 已由 SM 关闭：${campaignId} · ${evidence.detail}`);
  });
}

function publish(context, options) {
  requireActor(options, context.smId);
  const sm = roleIdentity(context, context.smId);
  withMutationLock(context, () => {
  const campaignId = String(options.campaign || latestCampaignId(context));
  const verification = verifyCampaign(context, campaignId, false);
  if (!verification.ok) {
    const detail = verification.missing
      .map((item) => `${item.roleId}:${item.coverage.join(",")}`)
      .join("；");
    fail(`拒绝生成通知，Campaign 少覆盖当前全局待处理：${detail}`);
  }
  if (verification.campaign.scopeSource === "global-audit"
    && !verification.exactSource) {
    fail(
      "拒绝生成通知：Campaign 审计指纹与当前事实源不一致；"
      + "请由 SM 在干净工作区重新运行 prepare --from-audit 创建新批次。",
    );
  }
  const campaign = verification.campaign;
  if (campaign.dueMode === "hard") validateDue(campaign.dueAt, campaign.timezone);
  else parseDue(campaign.dueAt, campaign.timezone);
  const file = noticePath(context, campaignId);
  if (fs.existsSync(file)) fail(`Notice 已存在：${campaignId}`);
  const digest = noticeDigest(campaign);
  const content = renderNotice(context, campaign, digest);
  const audit = verification.audit;
  const auditSnapshot = {
    sourceHead: audit.sourceHead || null,
    currentBaseline: audit.currentBaseline,
    pendingAssignments: audit.pendingAssignments || {},
    generatedAt: audit.generatedAt,
    inputPaths: AUDIT_INPUT_PATHS,
    inputHash: computeAuditInputHash(),
  };
  writeJson(file, {
    schemaVersion: 2,
    campaignId,
    digest,
    publishedAt: localDate(),
    publishedByRole: context.smId,
    publishedByIdentity: { memberId: context.smId, name: sm.name, email: sm.email },
    auditSnapshot,
    content,
  });
  commitOnly(context, file, `signoff(publish): ${campaignId}`, sm);
  const evidence = introduction(context, file, sm);
  if (!evidence.ok) fail(`Notice 发布后校验失败：${evidence.detail}`);
  console.log(`【NOTICE-BEGIN｜${campaignId}｜sha256=${digest}】`);
  for (const line of content) console.log(line);
  console.log(`【NOTICE-END｜${campaignId}｜sha256=${digest}｜禁止修改】`);
  });
}

function notify() {
  fail("notify 已停用；请由 SM 运行 publish --campaign=<ID> --actor=sm 发布不可变 Notice。");
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "--version" || command === "version") {
    console.log(TOOL_VERSION);
    process.exit(0);
  }
  const context = loadContext(options);
  if (command === "bootstrap") bootstrap(context, options);
  else if (command === "prepare") prepare(context, options);
  else if (command === "sign") sign(context, options);
  else if (command === "close") close(context, options);
  else if (command === "publish") publish(context, options);
  else if (command === "notify") notify(context, options);
  else if (command === "verify") {
    const campaignId = String(options.campaign || latestCampaignId(context));
    const verification = verifyCampaign(context, campaignId, true);
    process.exitCode = verification.ok ? 0 : 2;
  }
  else if (command === "status") {
    const campaignId = String(options.campaign || latestCampaignId(context));
    const status = evaluate(context, campaignId, true);
    const globalAudit = refreshGlobalAudit(context);
    if (globalAudit.available) {
      console.log(
        `Global: ${globalAudit.data.pendingCount === 0 ? "READY" : "PENDING"}`
        + ` · pending=${globalAudit.data.pendingCount}`
        + ` · generated=${globalAudit.data.generatedAt}`,
      );
    } else {
      console.log(`Global: UNAVAILABLE · ${globalAudit.reason}`);
    }
    process.exitCode = (status.closed || status.ready)
      && globalAudit.available
      && globalAudit.data.pendingCount === 0
      ? 0
      : 2;
  } else {
    fail(`未知命令：${command}`);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
