#!/usr/bin/env node
// 延后创建/登记代码仓（RC3）。
// 文档治理工作区先成立，代码仓在 Sprint 0 技术选型清晰后由本工具落地。
//
// 用法：
//   node tools/setup-code-repo.mjs --strategy=create  --repo=my-app [--sprint=0] [--remote=<url>] [--push] [--worktrees]
//   node tools/setup-code-repo.mjs --strategy=reuse   --repo=my-app --source=<url|path>
//   node tools/setup-code-repo.mjs --strategy=import  --repo=my-app --source=<url|path>
//   node tools/setup-code-repo.mjs --strategy=rewrite --repo=my-app --source=<旧仓url|path>
//
// 策略行为：
//   create  创建独立代码仓、初始化分支和可选角色 worktree（先写 .gitignore，再嵌套 git init）
//   reuse   登记现有仓库；默认不复制、不改写历史
//   import  创建目标仓与导入清单，不自动执行危险历史迁移
//   rewrite 创建候选替代仓，登记旧仓、切换门禁与回退路径

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STRATEGIES = new Set(["create", "reuse", "import", "rewrite"]);

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const options = {};
  for (const item of argv) {
    if (!item.startsWith("--")) fail(`未知参数：${item}`);
    const [key, ...value] = item.slice(2).split("=");
    options[key] = value.length ? value.join("=") : true;
  }
  return options;
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

function readConfig() {
  const file = path.join(PROJECT_ROOT, "00_项目导航", "roles.config.json");
  if (!fs.existsSync(file)) fail(`缺少角色事实源：${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function docRepoIsGit() {
  return git(PROJECT_ROOT, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true }).status === 0;
}

function roleIdentity(config, roleId) {
  const detail = (config.roleDetails || []).find((role) => role.id === roleId);
  const name = detail?.name || config.roles?.[roleId];
  const email = detail?.email || config.emails?.[roleId];
  if (!name || !email) fail(`角色 ${roleId} 缺少姓名或邮箱，请先完善 roles.config.json。`);
  return { name, email };
}

function ignoreCodeDirInDocRepo(relCodeDir) {
  // 关键：代码仓位于文档仓内部时，必须先把精确路径写入文档仓 .gitignore，
  // 再执行嵌套 git init，避免文档仓误跟踪代码。
  const gitignore = path.join(PROJECT_ROOT, ".gitignore");
  const entry = `${relCodeDir}/`;
  let text = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
  if (!text.split(/\r?\n/).some((line) => line.trim() === entry)) {
    if (text && !text.endsWith("\n")) text += "\n";
    text += `# 代码仓由 setup-code-repo.mjs 独立管理，文档仓不跟踪\n${entry}\n`;
    fs.writeFileSync(gitignore, text, "utf8");
  }
}

function updateInventory(repoName, strategy, source, state) {
  const file = path.join(PROJECT_ROOT, "10_代码仓库", "00_仓库清单.md");
  if (!fs.existsSync(file)) return;
  const row = `| ${repoName} | ${strategy} | ${source || "—"} | ${state} | ${new Date().toISOString().slice(0, 10)} |`;
  fs.appendFileSync(file, `\n${row}\n`, "utf8");
}

function updateDecisionCard(repoName, strategy) {
  const candidates = fs.existsSync(path.join(PROJECT_ROOT, "03_迭代运行"))
    ? fs.readdirSync(path.join(PROJECT_ROOT, "03_迭代运行"))
        .map((name) => path.join(PROJECT_ROOT, "03_迭代运行", name, "仓库决策卡.md"))
        .filter((file) => fs.existsSync(file))
    : [];
  for (const card of candidates) {
    let text = fs.readFileSync(card, "utf8");
    text = text
      .replace(/状态[:：]\s*pending/gi, `状态：decided（${strategy}）`)
      .replace(/仓库名[:：].*/g, `仓库名：${repoName}`);
    fs.writeFileSync(card, text, "utf8");
  }
}

function commitDocRepo(message) {
  if (!docRepoIsGit()) return;
  git(PROJECT_ROOT, ["add", "--", ".gitignore", "10_代码仓库/00_仓库清单.md", "03_迭代运行"], { allowFailure: true });
  git(PROJECT_ROOT, ["commit", "-m", message], { allowFailure: true });
}

function createStrategy(config, options) {
  const repoName = String(options.repo || config.repoName || "").trim();
  if (!repoName) fail("create 需要 --repo=<仓库名>。");
  const relCodeDir = `10_代码仓库/${repoName}`;
  const codeDir = path.join(PROJECT_ROOT, relCodeDir);
  const gitDir = path.join(codeDir, ".git");
  if (fs.existsSync(gitDir)) fail(`代码仓已存在 Git：${codeDir}`);

  const branch = String(options.branch || config.defaultBranch || "main");
  const sprint = options.sprint != null ? String(options.sprint) : String(config.sprintNumber ?? 0);
  const sprintBranch = `sprint-${sprint}`;
  const fs_ = roleIdentity(config, "fs");

  // 1) 先在文档仓忽略代码目录，再嵌套 init
  ignoreCodeDirInDocRepo(relCodeDir);
  commitDocRepo(`chore(repo): ignore ${relCodeDir} before nested code repo init`);

  // 2) 初始化独立代码仓
  fs.mkdirSync(codeDir, { recursive: true });
  git(codeDir, ["init", "-b", branch]);
  const readme = path.join(codeDir, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, `# ${repoName}\n\n本代码仓由 setup-code-repo.mjs 于 Sprint ${sprint} 技术决策后创建。\n`, "utf8");
  }
  git(codeDir, ["add", "."]);
  git(codeDir, ["commit", "-m", "chore: initialize code repository"], { identity: fs_ });
  git(codeDir, ["branch", sprintBranch, branch], { allowFailure: true });
  git(codeDir, ["config", "extensions.worktreeConfig", "true"]);
  git(codeDir, ["config", "--worktree", "user.name", fs_.name]);
  git(codeDir, ["config", "--worktree", "user.email", fs_.email]);

  // 3) 可选角色 worktree
  const worktrees = [];
  if (options.worktrees) {
    const teamwork = path.join(codeDir, "TeamWork");
    fs.mkdirSync(teamwork, { recursive: true });
    for (const role of (config.roleDetails || []).filter((item) => item.worktree)) {
      const wt = path.join(teamwork, role.dirName);
      if (fs.existsSync(wt)) continue;
      git(codeDir, ["worktree", "add", wt, "-b", role.branchName, sprintBranch]);
      git(wt, ["config", "--worktree", "user.name", role.name]);
      git(wt, ["config", "--worktree", "user.email", role.email]);
      worktrees.push(role.dirName);
    }
  }

  // 4) 可选远端
  if (options.remote) {
    git(codeDir, ["remote", "add", "origin", String(options.remote)], { allowFailure: true });
    if (options.push) {
      git(codeDir, ["push", "-u", "origin", branch, sprintBranch]);
    }
  }

  updateInventory(repoName, "create", "", "现行");
  updateDecisionCard(repoName, "create");
  commitDocRepo(`chore(repo): record code repo ${repoName} (create)`);
  console.log(`[OK] 已创建独立代码仓：${relCodeDir}（分支 ${branch}/${sprintBranch}）`);
  if (worktrees.length) console.log(`[OK] 角色 worktree：${worktrees.join(", ")}`);
  console.log("[INFO] 文档仓已忽略该代码目录，二者 Git 历史相互独立。");
}

function registerStrategy(config, options, strategy) {
  const repoName = String(options.repo || config.repoName || "").trim();
  if (!repoName) fail(`${strategy} 需要 --repo=<仓库名>。`);
  const source = String(options.source || "").trim();
  if (strategy !== "reuse" && !source) {
    // import/rewrite 建议给来源，但不强制
  }
  const notes = {
    reuse: "登记现有仓库；不复制、不改写历史。团队在现有仓库上建立 Sprint 集成分支与角色 worktree。",
    import: "创建目标仓与导入清单；去敏与清单核对由人工完成，本工具不自动迁移历史。",
    rewrite: "创建候选替代仓；旧仓保持可维护，达到切换门禁前不得替换生产主仓，保留回退路径。",
  };
  updateInventory(repoName, strategy, source, strategy === "reuse" ? "现行(外部)" : "候选");
  updateDecisionCard(repoName, strategy);
  commitDocRepo(`chore(repo): record code repo ${repoName} (${strategy})`);
  console.log(`[OK] 已登记代码仓 ${repoName}（${strategy}）。`);
  console.log(`[INFO] ${notes[strategy]}`);
  if (source) console.log(`[INFO] 来源：${source}`);
  console.log("[INFO] 危险历史迁移（import/rewrite）必须人工评审后执行，本工具不自动进行。");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const strategy = String(options.strategy || "");
  if (!STRATEGIES.has(strategy)) {
    fail("必须指定 --strategy=create|reuse|import|rewrite。");
  }
  const config = readConfig();
  if (strategy === "create") createStrategy(config, options);
  else registerStrategy(config, options, strategy);
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
