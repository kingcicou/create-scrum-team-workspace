#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL_VERSION = "0.10.1";
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
  const roles = {};
  for (const [id, name] of Object.entries(config.roles || {})) {
    roles[id] = { id, name, email: config.emails?.[id] || "" };
  }
  for (const role of config.roleDetails || []) {
    roles[role.id] = { id: role.id, name: role.name, email: role.email };
  }
  if (!roles.sm?.name || !roles.sm?.email) fail("roles.config.json 缺少 SM 姓名或邮箱。");

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
  return { config, roles, repo, store, lockTimeoutMs };
}

function roleIdentity(context, roleId) {
  const expected = context.roles[roleId];
  if (!expected) fail(`未知角色：${roleId}`);
  if (!expected.name || !expected.email) fail(`角色 ${roleId} 缺少姓名或邮箱。`);
  return expected;
}

function requireActor(options, expectedRole) {
  const actor = normalizeRole(options.actor);
  if (actor !== expectedRole) {
    fail(`本命令只能由角色 ${expectedRole} 执行，请显式传入 --actor=${expectedRole}。`);
  }
}

function relativeToRepo(context, file) {
  return path.relative(context.repo, file).split(path.sep).join("/");
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

function verifyCampaign(context, campaignId, print = true) {
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
  const campaignEvidence = introduction(context, campaignFile, context.roles.sm);
  const events = eventFiles(context, campaignId).map((file) => {
    const data = readJson(file);
    const role = context.roles[data.role];
    const evidence = role
      ? introduction(context, file, role)
      : { ok: false, state: "invalid", detail: `未知角色 ${data.role}` };
    return { file, data, evidence };
  });

  const rows = [];
  for (const [roleId, assignment] of Object.entries(campaign.assignments || {})) {
    const required = new Set(assignment.coverage || []);
    const validCoverage = new Set();
    const roleEvents = events.filter((event) => event.data.role === roleId);
    for (const event of roleEvents) {
      if (event.evidence.ok
        && event.data.member === context.roles[roleId]?.name
        && event.data.email?.toLowerCase() === context.roles[roleId]?.email.toLowerCase()) {
        for (const item of event.data.coverage || []) validCoverage.add(item);
      }
    }
    const missing = [...required].filter((item) => !validCoverage.has(item));
    const invalid = roleEvents.filter((event) => !event.evidence.ok);
    rows.push({ roleId, required: [...required], missing, invalid, roleEvents });
  }

  const closureFile = closurePath(context, campaignId);
  let closure = null;
  if (fs.existsSync(closureFile)) {
    closure = {
      data: readJson(closureFile),
      evidence: introduction(context, closureFile, context.roles.sm),
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
  requireActor(options, "sm");
  const sm = roleIdentity(context, "sm");
  withMutationLock(context, () => {
    const audit = globalAuditOrFail(context);
    let assignments;
    let target = String(options.target || "").trim();
    let mode = options.mode || "incremental";
    let source = options.source || null;
    if (options["from-audit"]) {
      if (!audit.pendingCount || !Object.keys(audit.pendingAssignments || {}).length) {
        fail("全局审计没有待处理角色，无需创建纠偏 Campaign。");
      }
      assignments = Object.fromEntries(
        Object.entries(audit.pendingAssignments).map(([roleId, coverage]) => [
          normalizeRole(roleId),
          { coverage },
        ]),
      );
      target ||= audit.currentBaseline;
      mode = "corrective";
      source ||= audit.closedCampaignId || null;
    } else {
      const coverage = splitValues(options.coverage);
      if (!target || !coverage.length) fail("prepare 需要 --target、--coverage，或使用 --from-audit。");
      const roleIds = options.roles === "all"
        ? Object.keys(context.roles)
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
    const campaign = {
      schemaVersion: 3,
      toolVersion: TOOL_VERSION,
      campaignId,
      mode,
      targetBaseline: target,
      sourceCampaignId: source,
      scopeSource: options["from-audit"] ? "global-audit" : "explicit",
      auditGeneratedAt: audit.generatedAt,
      auditSourceHead: audit.sourceHead || null,
      auditScopeHash: scopeHash(audit),
      repositoryHead: repoHead(context),
      purpose: options.purpose || (options["from-audit"] ? "纠正全局签核缺口" : "确认受影响规范变更"),
      summary: options.summary || "按 Campaign 的逐角色范围完成阅读与签核。",
      readScope: splitValues(options.read || "本人角色卡;责任表;周期任务清单;角色行动手册指定变更章节"),
      dueAt: options.due || "由 SM 确认",
      timezone: options.timezone || "Asia/Shanghai",
      identityMode: "command-scoped",
      createdAt: localDate(),
      createdByRole: "sm",
      assignments,
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
  });
}

function sign(context, options) {
  const roleId = normalizeRole(options.role);
  if (!roleId) fail("sign 需要 --role=<角色槽位>。");
  const member = roleIdentity(context, roleId);
  withMutationLock(context, () => {
    const campaignId = String(options.campaign || latestCampaignId(context));
    const { data: campaign } = loadCampaign(context, campaignId);
    const assignment = campaign.assignments?.[roleId];
    if (!assignment) fail(`Campaign ${campaignId} 未分配角色 ${roleId}。`);
    const verification = verifyCampaign(context, campaignId, false);
    if (!verification.ok) {
      fail("Campaign 未覆盖当前全局待处理，拒绝签核；请由 SM 运行 verify 并新建纠偏批次。");
    }
    const campaignEvidence = introduction(context, campaignPath(context, campaignId), context.roles.sm);
    if (!campaignEvidence.ok) fail(`Campaign 尚未由 SM 有效提交：${campaignEvidence.detail}`);
    if (fs.existsSync(closurePath(context, campaignId))) fail(`Campaign 已存在 closure，拒绝继续签核：${campaignId}`);

    const existing = eventFiles(context, campaignId);
    const prefix = `EVT-${roleId.toUpperCase()}-${compactDate(localDate())}-`;
    let sequence = 1;
    while (existing.some((file) => path.basename(file).startsWith(`${prefix}${String(sequence).padStart(3, "0")}`))) {
      sequence += 1;
    }
    const eventId = options.event || `${prefix}${String(sequence).padStart(3, "0")}`;
    const file = path.join(eventDir(context, campaignId), `${eventId}.json`);
    if (fs.existsSync(file)) fail(`Event 已存在：${eventId}`);
    writeJson(file, {
      schemaVersion: 2,
      eventId,
      campaignId,
      role: roleId,
      member: member.name,
      email: member.email,
      targetBaseline: campaign.targetBaseline,
      coverage: assignment.coverage,
      signedAt: localDate(),
      identityMode: "command-scoped",
      result: "accepted",
    });
    commitOnly(context, file, `sign(${roleId}): ${eventId} · ${campaignId}`, member);
    const evidence = introduction(context, file, member);
    if (!evidence.ok) fail(`Event 提交后校验失败：${evidence.detail}`);
    console.log(`[OK] ${eventId} · ${member.name} · ${assignment.coverage.join(",")} · ${evidence.detail}`);
    console.log("[INFO] 未修改仓库 user.name/user.email；身份仅作用于本次提交。");
  });
}

function close(context, options) {
  requireActor(options, "sm");
  const sm = roleIdentity(context, "sm");
  withMutationLock(context, () => {
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
      closedByRole: "sm",
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

function notify(context, options) {
  const campaignId = String(options.campaign || latestCampaignId(context));
  const verification = verifyCampaign(context, campaignId, false);
  if (!verification.ok) {
    const detail = verification.missing
      .map((item) => `${item.roleId}:${item.coverage.join(",")}`)
      .join("；");
    fail(`拒绝生成通知，Campaign 少覆盖当前全局待处理：${detail}`);
  }
  const campaign = verification.campaign;
  console.log(`【签核通知｜${campaignId}｜${campaign.targetBaseline}｜${campaign.mode}】`);
  console.log(
    `生成依据：tool=${campaign.toolVersion || "legacy"}`
    + `｜scope=${campaign.scopeSource || "legacy"}`
    + `｜audit=${String(campaign.auditScopeHash || "none").slice(0, 12)}`
    + `｜head=${String(campaign.repositoryHead || "none").slice(0, 12)}`,
  );
  if (campaign.sourceCampaignId) console.log(`来源：${campaign.sourceCampaignId}`);
  console.log(`目的：${campaign.purpose || "确认受影响规范变更"}`);
  console.log(`变更摘要：${campaign.summary || "见指定阅读范围"}`);
  console.log(`阅读范围：${(campaign.readScope || []).join("；") || "由 SM 指定"}`);
  console.log(`截止：${campaign.dueAt || "由 SM 确认"}（${campaign.timezone || "Asia/Shanghai"}）`);
  console.log("身份：无需、也禁止为签核反复修改 git user.name/user.email；命令仅对本次提交使用角色事实源。");
  console.log("执行：在共享工作目录中直接运行本人命令；工具会用互斥锁串行提交，锁占用时等待后重试。");
  for (const [roleId, assignment] of Object.entries(campaign.assignments || {})) {
    const role = context.roles[roleId];
    console.log(`@${role.name} (${roleId})：覆盖 ${assignment.coverage.join(",")}`);
    console.log(`  node tools/signoff.mjs sign --campaign=${campaignId} --role=${roleId}`);
  }
  console.log("完成回复：【签核完成】角色/成员 + 命令输出中的 Event ID；无需手填 commit。");
  console.log(`验收：SM 运行 node tools/signoff.mjs status --campaign=${campaignId}`);
  console.log(`关闭：仅 SM 运行 node tools/signoff.mjs close --campaign=${campaignId} --actor=sm；项目全局仍有缺口时工具拒绝关闭。`);
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  const context = loadContext(options);
  if (command === "prepare") prepare(context, options);
  else if (command === "sign") sign(context, options);
  else if (command === "close") close(context, options);
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
