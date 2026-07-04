#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLE_ALIASES = {
  po: "po", sm: "sm", tl: "tl",
  midbe: "midbe", "mid.be": "midbe", "mid.be/qa": "midbe",
  srfe: "srfe", "sr.fe": "srfe", "sr.fe/ux": "srfe",
  midfe: "midfe", "mid.fe": "midfe", "mid.fe/qa": "midfe",
  fs: "fs", "fs/devops": "fs",
};

function fail(message, code = 2) {
  console.error(`[ERROR] ${message}`);
  process.exit(code);
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

function git(repo, args, allowFailure = false) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
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
  return { config, roles, repo, store };
}

function currentIdentity(repo) {
  return {
    name: git(repo, ["config", "--get", "user.name"], true).stdout.trim(),
    email: git(repo, ["config", "--get", "user.email"], true).stdout.trim(),
  };
}

function requireIdentity(context, roleId) {
  const expected = context.roles[roleId];
  if (!expected) fail(`未知角色：${roleId}`);
  const actual = currentIdentity(context.repo);
  if (actual.name !== expected.name || actual.email.toLowerCase() !== expected.email.toLowerCase()) {
    fail(
      `Git 身份不匹配。角色 ${roleId} 应为 ${expected.name} <${expected.email}>，`
      + `当前为 ${actual.name || "未配置"} <${actual.email || "未配置"}>。`,
    );
  }
  return expected;
}

function relativeToRepo(context, file) {
  return path.relative(context.repo, file).split(path.sep).join("/");
}

function ensureNoStagedChanges(context) {
  const staged = git(context.repo, ["diff", "--cached", "--name-only"]).stdout.trim();
  if (staged) fail(`存在已暂存内容，拒绝混入签核提交：\n${staged}`);
}

function commitOnly(context, file, message) {
  ensureNoStagedChanges(context);
  const relative = relativeToRepo(context, file);
  git(context.repo, ["add", "--", relative]);
  git(context.repo, ["commit", "-m", message, "--", relative]);
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
  requireIdentity(context, "sm");
  const campaignId = String(options.campaign || "").trim();
  const target = String(options.target || "").trim();
  const coverage = String(options.coverage || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  if (!campaignId || !target || !coverage.length) {
    fail("prepare 需要 --campaign、--target、--coverage。");
  }
  const roleIds = options.roles === "all"
    ? Object.keys(context.roles)
    : String(options.roles || "").split(/[,，]/).map(normalizeRole).filter(Boolean);
  if (!roleIds.length) fail("prepare 需要 --roles=all 或角色列表。");
  for (const roleId of roleIds) if (!context.roles[roleId]) fail(`未知角色：${roleId}`);
  const file = campaignPath(context, campaignId);
  if (fs.existsSync(file)) fail(`Campaign 已存在：${campaignId}`);
  const assignments = Object.fromEntries(roleIds.map((roleId) => [roleId, { coverage }]));
  writeJson(file, {
    schemaVersion: 1,
    campaignId,
    mode: options.mode || "incremental",
    targetBaseline: target,
    sourceCampaignId: options.source || null,
    createdAt: localDate(),
    createdByRole: "sm",
    assignments,
  });
  commitOnly(context, file, `signoff(prepare): ${campaignId} ${target}`);
  console.log(`[OK] Campaign 已创建并由 SM 提交：${relativeToRepo(context, file)}`);
}

function sign(context, options) {
  const campaignId = String(options.campaign || latestCampaignId(context));
  const roleId = normalizeRole(options.role);
  if (!roleId) fail("sign 需要 --role=<角色槽位>。");
  const member = requireIdentity(context, roleId);
  const { data: campaign } = loadCampaign(context, campaignId);
  const assignment = campaign.assignments?.[roleId];
  if (!assignment) fail(`Campaign ${campaignId} 未分配角色 ${roleId}。`);
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
    schemaVersion: 1,
    eventId,
    campaignId,
    role: roleId,
    member: member.name,
    email: member.email,
    targetBaseline: campaign.targetBaseline,
    coverage: assignment.coverage,
    signedAt: localDate(),
    result: "accepted",
  });
  commitOnly(context, file, `sign(${roleId}): ${eventId} · ${campaignId}`);
  const evidence = introduction(context, file, member);
  if (!evidence.ok) fail(`Event 提交后校验失败：${evidence.detail}`);
  console.log(`[OK] ${eventId} · ${member.name} · ${assignment.coverage.join(",")} · ${evidence.detail}`);
}

function close(context, options) {
  requireIdentity(context, "sm");
  const campaignId = String(options.campaign || latestCampaignId(context));
  const status = evaluate(context, campaignId, true);
  if (!status.ready) fail("审计未归零，拒绝关闭 Campaign。");
  const file = closurePath(context, campaignId);
  if (fs.existsSync(file)) fail(`Closure 已存在：${campaignId}`);
  writeJson(file, {
    schemaVersion: 1,
    campaignId,
    closedAt: localDate(),
    closedByRole: "sm",
    result: "closed",
    eventIds: status.events.filter((event) => event.evidence.ok).map((event) => event.data.eventId).sort(),
  });
  commitOnly(context, file, `signoff(close): ${campaignId}`);
  const evidence = introduction(context, file, context.roles.sm);
  if (!evidence.ok) fail(`Closure 提交后校验失败：${evidence.detail}`);
  console.log(`[OK] Campaign 已由 SM 关闭：${campaignId} · ${evidence.detail}`);
}

function notify(context, options) {
  const campaignId = String(options.campaign || latestCampaignId(context));
  const { data: campaign } = loadCampaign(context, campaignId);
  console.log(`【签核通知｜${campaignId}｜${campaign.targetBaseline} ${campaign.mode}】`);
  console.log(`新规则：每人使用 signoff.mjs 创建并提交独立 Event 文件；禁止编辑他人 Event。`);
  for (const [roleId, assignment] of Object.entries(campaign.assignments || {})) {
    const role = context.roles[roleId];
    console.log(`@${role.name} (${roleId})：覆盖 ${assignment.coverage.join(",")}`);
    console.log(`  node tools/signoff.mjs sign --campaign=${campaignId} --role=${roleId}`);
  }
  console.log("关闭：仅 SM 在全员 status=VALID 后执行 close。");
}

const { command, options } = parseArgs(process.argv.slice(2));
const context = loadContext(options);
if (command === "prepare") prepare(context, options);
else if (command === "sign") sign(context, options);
else if (command === "close") close(context, options);
else if (command === "notify") notify(context, options);
else if (command === "status") {
  const campaignId = String(options.campaign || latestCampaignId(context));
  const status = evaluate(context, campaignId, true);
  process.exit(status.closed || status.ready ? 0 : 2);
} else {
  fail(`未知命令：${command}`);
}
