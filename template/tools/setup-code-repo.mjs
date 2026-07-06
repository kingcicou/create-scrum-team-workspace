#!/usr/bin/env node
// 代码仓创建：propose → approve → check → apply（RC3 修订）。
// 仓库决策是"技术与投资决定"（PO/TL 审批），与"人员规范签核"是不同工件，
// 不共用同一 Campaign，避免"签了规范 ≟ 批准 Rust 重写"的语义混乱。
//
// 用法：
//   node tools/setup-code-repo.mjs propose --strategy=create --repo=my-app [--source=<url|path>]
//       [--tech=<技术栈>] [--rationale=<ADR/Spike依据>] [--remote=<url,不含凭据>]
//       [--reason=<为什么现在建>] [--impact=<不建的影响>] [--switch=<切换与回退,import/rewrite必填>]
//   node tools/setup-code-repo.mjs approve --decision=REPO-001 --actor=po|tl
//   node tools/setup-code-repo.mjs check   --decision=REPO-001
//   node tools/setup-code-repo.mjs apply   --decision=REPO-001 [--yes]
//   node tools/setup-code-repo.mjs status  [--decision=REPO-001]
//
// 策略：create 新建独立代码仓；reuse 登记现有仓；import 建目标仓+导入清单（不自动迁移历史）；
//       rewrite 建候选仓+登记旧仓/切换门禁/回退（危险迁移人工执行）。

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadTeamModel, validateTeamModel } from "./lib/team-model.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DECISION_DIR = path.join(PROJECT_ROOT, ".team", "repo-decisions");
const STRATEGIES = new Set(["create", "reuse", "import", "rewrite"]);
const APPROVAL_ROLES = ["po", "tl"];

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

function git(cwd, args, { allowFailure = false, identity = null } = {}) {
  const config = identity
    ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`]
    : [];
  const result = spawnSync("git", ["-C", cwd, ...config, ...args], { encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(" ")} 失败：${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readConfig() {
  const file = path.join(PROJECT_ROOT, "00_项目导航", "roles.config.json");
  if (!fs.existsSync(file)) fail(`缺少角色事实源：${file}`);
  return readJson(file);
}

function docRepoIsGit() {
  return git(PROJECT_ROOT, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true }).status === 0;
}

function teamContext(config) {
  const model = loadTeamModel(config);
  const validation = validateTeamModel(model);
  if (validation.errors.length) {
    fail(`团队模型无效：\n- ${validation.errors.join("\n- ")}`);
  }
  const members = Object.fromEntries(model.members.map((member) => [member.id, member]));
  const activeAssignment = (hatIds) => model.assignments.find(
    (item) => hatIds.includes(item.hatId)
      && item.status === "active"
      && members[item.memberId]?.status === "active",
  );
  const tl = activeAssignment(["tl"]);
  const executor = activeAssignment(["fs", "devops"]) || tl;
  const responsibilityIds = {
    po: model.scrum.productOwner,
    tl: tl?.memberId || null,
    fs: executor?.memberId || null,
  };
  return { model, members, responsibilityIds };
}

function resolveMemberId(team, token) {
  const value = String(token || "").trim();
  return team.responsibilityIds[value] || value;
}

function roleIdentity(team, token) {
  const memberId = resolveMemberId(team, token);
  const member = team.members[memberId];
  if (!member?.name || !member?.email) {
    fail(`责任 ${token} 未映射到有效成员，请先完善 members/scrum/assignments。`);
  }
  return { id: memberId, name: member.name, email: member.email };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function decisionPath(id) {
  return path.join(DECISION_DIR, `${id}.json`);
}

function loadDecision(id) {
  const file = decisionPath(id);
  if (!fs.existsSync(file)) fail(`决策不存在：${id}（先运行 propose）`);
  return { file, data: readJson(file) };
}

function nextDecisionId() {
  const seqs = fs.existsSync(DECISION_DIR)
    ? fs.readdirSync(DECISION_DIR)
      .map((name) => /^REPO-(\d{3})\.json$/.exec(name)?.[1])
      .filter(Boolean)
      .map(Number)
    : [];
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `REPO-${String(next).padStart(3, "0")}`;
}

function hasCredentials(remote) {
  return /\/\/[^/@\s]+:[^/@\s]+@/.test(String(remote || ""));
}

function commitDoc(message, identity) {
  if (!docRepoIsGit()) return;
  git(PROJECT_ROOT, ["add", "--", ".team/repo-decisions", ".gitignore", "10_代码仓库/00_仓库清单.md"]);
  const staged = git(PROJECT_ROOT, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (staged.status === 0) fail(`没有可提交的仓库决策变化：${message}`);
  git(PROJECT_ROOT, ["commit", "-m", message], { identity });
}

function relCodeDir(repo) {
  return `10_代码仓库/${repo}`;
}

// ---- 门禁：apply 前的可复核条件 ----
function evaluateGates(config, team, decision) {
  const blockers = [];
  if (decision.status === "applied") blockers.push("决策已 applied（幂等：不再重复建仓）");
  if (decision.status === "rejected") blockers.push("决策已 rejected");
  if (decision.status !== "approved" && decision.status !== "applied") {
    blockers.push(`决策状态为 ${decision.status}，需先经 PO 与 TL approve`);
  }
  for (const role of APPROVAL_ROLES) {
    if (!decision.approvals?.[role]) blockers.push(`缺少 ${role.toUpperCase()} 审批`);
  }
  const expectedDeciders = {
    po: team.responsibilityIds.po,
    tl: team.responsibilityIds.tl,
  };
  for (const role of APPROVAL_ROLES) {
    if (!expectedDeciders[role]) blockers.push(`当前团队缺少 ${role.toUpperCase()} 决策人`);
    const recorded = decision.deciders?.[role]
      || (Array.isArray(decision.deciders) ? role : null);
    if (recorded && recorded !== expectedDeciders[role] && recorded !== role) {
      blockers.push(`${role.toUpperCase()} 决策人已变化：提案=${recorded}，当前=${expectedDeciders[role]}`);
    }
  }
  if (!docRepoIsGit()) blockers.push("文档工作区不是 Git 仓库");
  else {
    const dirty = git(PROJECT_ROOT, ["status", "--porcelain", "--", ":!00_项目导航/文档索引"], { allowFailure: true }).stdout.trim();
    if (dirty) blockers.push("文档工作区有未提交变化（生成型索引除外），请先提交");
  }
  const codeDir = path.join(PROJECT_ROOT, relCodeDir(decision.repo));
  if (fs.existsSync(path.join(codeDir, ".git"))) blockers.push(`代码仓已存在 Git：${relCodeDir(decision.repo)}`);
  if (decision.strategy === "create" && fs.existsSync(codeDir) && fs.readdirSync(codeDir).length) {
    blockers.push(`目标目录非空，拒绝初始化：${relCodeDir(decision.repo)}`);
  }
  if (hasCredentials(decision.remote)) blockers.push("远端地址包含凭据（user:pass@），拒绝");
  if (["import", "rewrite"].includes(decision.strategy) && !decision.switchRollback) {
    blockers.push(`${decision.strategy} 必须填写切换与回退（--switch）`);
  }
  return blockers;
}

// ---- 命令：propose ----
function propose(config, team, options) {
  const strategy = String(options.strategy || "");
  if (!STRATEGIES.has(strategy)) fail("propose 需要 --strategy=create|reuse|import|rewrite。");
  const repo = String(options.repo || config.repoName || "").trim();
  if (!repo) fail("propose 需要 --repo=<仓库名>。");
  if (hasCredentials(options.remote)) fail("远端地址不得包含凭据。");
  const id = nextDecisionId();
  const decision = {
    decisionId: id,
    strategy,
    repo,
    source: String(options.source || ""),
    techStack: String(options.tech || "待 Sprint 0 技术决策"),
    rationale: String(options.rationale || "见 ADR/Spike"),
    target: relCodeDir(repo),
    remote: String(options.remote || ""),
    reasonNow: String(options.reason || "Sprint 0 已明确需要代码承载"),
    impactIfNot: String(options.impact || "发现工作可继续，但无法开始实现"),
    switchRollback: String(options.switch || ""),
    deciders: {
      po: team.responsibilityIds.po,
      tl: team.responsibilityIds.tl,
    },
    executor: team.responsibilityIds.fs,
    status: "proposed",
    approvals: {},
    createdAt: today(),
  };
  writeJson(decisionPath(id), decision);
  commitDoc(`repo(propose): ${id} ${strategy} ${repo}`, roleIdentity(team, "fs"));
  console.log(`[OK] 已生成仓库决策提案：${id}（${strategy} · ${repo}），状态 proposed。`);
  console.log("[DRY-RUN] apply 时将执行：");
  if (strategy === "create") {
    console.log(`  · 在文档仓 .gitignore 追加 ${decision.target}/`);
    console.log(`  · 在 ${decision.target} 独立 git init（分支 ${config.defaultBranch || "main"}/sprint-${config.sprintNumber ?? 0}）`);
    if (decision.remote) console.log(`  · 配置远端 ${decision.remote}`);
  } else {
    console.log(`  · 登记 ${strategy} 仓库到 00_仓库清单.md（不复制/不自动迁移历史）`);
  }
  console.log(`[NEXT] PO/TL 审批：node tools/setup-code-repo.mjs approve --decision=${id} --actor=po`);
}

// ---- 命令：approve ----
function approve(config, team, options) {
  const actorInput = String(options.actor || "").trim();
  const actor = APPROVAL_ROLES.find(
    (role) => actorInput === role || actorInput === team.responsibilityIds[role],
  );
  if (!actor) {
    fail(`approve 只能由当前 PO/TL 执行：${team.responsibilityIds.po}/${team.responsibilityIds.tl}`);
  }
  const { file, data } = loadDecision(String(options.decision || ""));
  if (data.status === "applied" || data.status === "rejected") fail(`决策已 ${data.status}，不可再审批。`);
  const identity = roleIdentity(team, actor);
  data.approvals = data.approvals || {};
  data.approvals[actor] = { by: identity.name, at: today() };
  if (APPROVAL_ROLES.every((role) => data.approvals[role])) data.status = "approved";
  writeJson(file, data);
  commitDoc(`repo(approve): ${data.decisionId} by ${actor}`, identity);
  console.log(`[OK] ${actor.toUpperCase()} 已审批 ${data.decisionId}。当前状态：${data.status}。`);
  if (data.status === "approved") {
    console.log(`[NEXT] node tools/setup-code-repo.mjs apply --decision=${data.decisionId}`);
  }
}

// ---- 命令：check ----
function check(config, team, options) {
  const { data } = loadDecision(String(options.decision || ""));
  const blockers = evaluateGates(config, team, data);
  console.log(`Check ${data.decisionId}: ${blockers.length ? "BLOCKED" : "READY"} · status=${data.status}`);
  for (const item of blockers) console.log(`- ${item}`);
  return blockers;
}

// ---- apply 执行器 ----
function applyCreate(config, team, decision) {
  const codeDir = path.join(PROJECT_ROOT, decision.target);
  const stagingDir = path.join(
    path.dirname(codeDir),
    `.setup-${decision.repo}-${process.pid}-${Date.now()}`,
  );
  const branch = config.defaultBranch || "main";
  const sprintBranch = `sprint-${config.sprintNumber ?? 0}`;
  const fs_ = roleIdentity(team, "fs");

  // 在同卷临时目录完成全部 Git 操作，再原子改名到目标位置。
  // .gitignore 与决策状态由 apply() 在同一文档提交中落证。
  const gitignore = path.join(PROJECT_ROOT, ".gitignore");
  const entry = `${decision.target}/`;
  const originalGitignore = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : null;
  let text = originalGitignore || "";
  fs.mkdirSync(path.dirname(codeDir), { recursive: true });
  try {
    fs.mkdirSync(stagingDir);
    git(stagingDir, ["init", "-b", branch]);
    fs.writeFileSync(
      path.join(stagingDir, "README.md"),
      `# ${decision.repo}\n\n经 ${decision.decisionId} 审批后创建（${decision.techStack}）。\n`,
      "utf8",
    );
    git(stagingDir, ["add", "."]);
    git(stagingDir, ["commit", "-m", "chore: initialize code repository"], { identity: fs_ });
    git(stagingDir, ["branch", sprintBranch, branch]);
    if (decision.remote) git(stagingDir, ["remote", "add", "origin", decision.remote]);
    if (!text.split(/\r?\n/).some((line) => line.trim() === entry)) {
      if (text && !text.endsWith("\n")) text += "\n";
      text += `# 代码仓由 setup-code-repo.mjs 独立管理，文档仓不跟踪\n${entry}\n`;
      fs.writeFileSync(gitignore, text, "utf8");
    }
    fs.renameSync(stagingDir, codeDir);
  } catch (error) {
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    if (fs.existsSync(codeDir)) fs.rmSync(codeDir, { recursive: true, force: true });
    if (originalGitignore === null) fs.rmSync(gitignore, { force: true });
    else fs.writeFileSync(gitignore, originalGitignore, "utf8");
    throw error;
  }
  console.log(`[OK] 已创建独立代码仓：${decision.target}（分支 ${branch}/${sprintBranch}）。`);
  return () => {
    if (fs.existsSync(codeDir)) fs.rmSync(codeDir, { recursive: true, force: true });
    if (originalGitignore === null) fs.rmSync(gitignore, { force: true });
    else fs.writeFileSync(gitignore, originalGitignore, "utf8");
  };
}

function applyRegister(config, decision) {
  const file = path.join(PROJECT_ROOT, "10_代码仓库", "00_仓库清单.md");
  const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (fs.existsSync(file)) {
    const row = `| ${decision.repo} | ${decision.strategy} | ${decision.source || "—"} | ${decision.strategy === "reuse" ? "现行(外部)" : "候选"} | ${today()} |`;
    fs.appendFileSync(file, `\n${row}\n`, "utf8");
  }
  console.log(`[OK] 已登记 ${decision.strategy} 仓库 ${decision.repo}（不复制/不自动迁移历史）。`);
  return () => {
    if (original === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, original, "utf8");
  };
}

// ---- 命令：apply ----
async function apply(config, team, options) {
  const { file, data } = loadDecision(String(options.decision || ""));
  const originalDecision = fs.readFileSync(file, "utf8");
  const blockers = evaluateGates(config, team, data);
  if (blockers.length) {
    fail(`apply 门禁未通过：\n- ${blockers.join("\n- ")}`);
  }
  // 交互确认（--yes 只跳过人工输入，不绕过上面的审批门禁）
  if (!options.yes) {
    const approvals = APPROVAL_ROLES.map((role) => `${role.toUpperCase()}=${data.approvals[role] ? "approved" : "缺"}`).join("，");
    process.stdout.write(
      `即将按 ${data.decisionId} 创建/登记代码仓 ${data.repo}（${data.strategy}）。\n审批：${approvals}。\n是否执行？[y/N] `,
    );
    const answer = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.once("line", (line) => { rl.close(); resolve(line.trim().toLowerCase()); });
    });
    if (answer !== "y" && answer !== "yes") fail("已取消（未确认）。", 1);
  }
  let rollback = null;
  try {
    if (data.strategy === "create") rollback = applyCreate(config, team, data);
    else rollback = applyRegister(config, data);
    data.status = "applied";
    data.appliedAt = today();
    writeJson(file, data);
    commitDoc(`repo(apply): ${data.decisionId} ${data.strategy} ${data.repo}`, roleIdentity(team, "fs"));
  } catch (error) {
    rollback?.();
    fs.writeFileSync(file, originalDecision, "utf8");
    if (docRepoIsGit()) {
      git(
        PROJECT_ROOT,
        ["reset", "--", ".team/repo-decisions", ".gitignore", "10_代码仓库/00_仓库清单.md"],
        { allowFailure: true },
      );
    }
    throw error;
  }
  console.log(`[OK] ${data.decisionId} 已 applied。文档仓与代码仓 Git 历史相互独立。`);
}

function statusCmd(config, options) {
  if (options.decision) {
    const { data } = loadDecision(String(options.decision));
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (!fs.existsSync(DECISION_DIR)) { console.log("暂无仓库决策。"); return; }
  for (const name of fs.readdirSync(DECISION_DIR).filter((n) => n.endsWith(".json")).sort()) {
    const d = readJson(path.join(DECISION_DIR, name));
    console.log(`${d.decisionId} · ${d.strategy} · ${d.repo} · ${d.status}`);
  }
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const team = teamContext(config);
  if (command === "propose") propose(config, team, options);
  else if (command === "approve") approve(config, team, options);
  else if (command === "check") { const b = check(config, team, options); process.exitCode = b.length ? 2 : 0; }
  else if (command === "apply") await apply(config, team, options);
  else if (command === "status") statusCmd(config, options);
  else fail(`未知命令：${command}（propose|approve|check|apply|status）`);
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
