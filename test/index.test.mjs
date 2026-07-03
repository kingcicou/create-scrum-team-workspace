import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cliPath = path.join(packageDir, "index.mjs");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function runCli(args, opts = {}) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    ...opts,
  });
}

test("creates isolated coding-role worktrees and identities", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([
      target,
      "--preset=studio",
      "--repo=demo-app",
      "--sprint=4",
      "--role-test-commits",
    ]);

    const repo = path.join(target, "10_代码仓库", "demo-app");
    const branches = git(repo, ["branch", "--format=%(refname:short)"]).split(/\r?\n/);
    assert.ok(branches.includes("main"));
    assert.ok(branches.includes("sprint-4"));
    assert.equal(branches.filter((branch) => branch.startsWith("feature/sprint-4/")).length, 5);
    assert.equal(git(repo, ["check-ignore", "TeamWork"]), "TeamWork");

    const generatedConfig = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(generatedConfig.gitRoot, "repo");
    assert.equal(generatedConfig.repoStrategy, "create");
    assert.equal(generatedConfig.sprintNumber, 4);
    assert.equal(generatedConfig.pushRemote, false);
    assert.ok(
      fs
        .readFileSync(
          path.join(
            target,
            "03_迭代运行",
            "Sprint-0-启动",
            "01_Sprint任务表与流程看板.md",
          ),
          "utf8",
        )
        .includes("| 代码协同流 | 工作区就绪 |"),
      "default repo mode should mark code collaboration workspace ready",
    );

    const roles = generatedConfig.roleDetails.filter((role) => role.worktree);
    assert.equal(roles.length, 5);

    for (const role of roles) {
      const worktree = path.join(repo, "TeamWork", role.dirName);
      assert.equal(git(worktree, ["config", "--worktree", "--get", "user.name"]), role.name);
      assert.equal(git(worktree, ["config", "--worktree", "--get", "user.email"]), role.email);
      assert.equal(git(worktree, ["log", "-1", "--format=%an <%ae>"]), `${role.name} <${role.email}>`);
    }

    const replayTarget = path.join(sandbox, "replay");
    runCli([
      replayTarget,
      `--config=${path.join(target, "00_项目导航", "roles.config.json")}`,
      "--no-git",
    ]);
    assert.equal(fs.existsSync(path.join(replayTarget, ".git")), false);
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(replayTarget, "00_项目导航", "roles.config.json"), "utf8"),
      ).roles.fs,
      "Bridge",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("--dry-run does not write files or initialize git", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-dry-"));
  const target = path.join(sandbox, "project");
  const envWithoutPath = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
  );

  try {
    const output = runCli(
      [target, "--dry-run", "--repo=dry-app"],
      { env: { ...envWithoutPath, PATH: "" } },
    );

    assert.ok(output.includes("[dry-run]"), "should print dry-run banner");
    assert.ok(output.includes("dry-app"), "should mention substituted repo name in preview");
    assert.equal(fs.existsSync(target), false, "no target dir should be created");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("--no-worktrees skips role worktree creation but keeps repo init", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-now-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=lean-app", "--no-worktrees"]);

    const repo = path.join(target, "10_代码仓库", "lean-app");
    assert.ok(fs.existsSync(path.join(repo, ".git")), "code repo should still be a git repo");

    const branches = git(repo, ["branch", "--format=%(refname:short)"]).split(/\r?\n/);
    assert.ok(branches.includes("main"), "main branch should exist");
    assert.equal(
      branches.filter((b) => b.startsWith("feature/sprint-")).length,
      0,
      "no feature branches without worktrees",
    );

    assert.equal(
      fs.existsSync(path.join(repo, "TeamWork")),
      false,
      "TeamWork should not be created",
    );

    const config = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(config.setupWorktrees, false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("product reuse records the existing repo without creating a code copy", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-reuse-"));
  const target = path.join(sandbox, "project");
  const sourceRepo = "https://example.com/acme/qfd.git";

  try {
    runCli([
      target,
      "--type=product",
      `--source-repo=${sourceRepo}`,
      "--repo=qfd",
    ]);

    assert.equal(
      fs.existsSync(path.join(target, "10_代码仓库", "qfd")),
      false,
      "reuse must not create a second code tree",
    );
    assert.equal(
      fs.existsSync(path.join(target, "10_代码仓库", "qfd", ".git")),
      false,
      "reuse must not initialize a new Git history",
    );

    const config = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(config.type, "product");
    assert.equal(config.repoStrategy, "reuse");
    assert.equal(config.sourceRepo, sourceRepo);
    assert.equal(config.gitRoot, "none");
    assert.equal(config.setupWorktrees, false);

    const workspaceFile = fs
      .readdirSync(target)
      .find((name) => name.endsWith(".code-workspace"));
    const workspace = JSON.parse(fs.readFileSync(path.join(target, workspaceFile), "utf8"));
    assert.equal(
      workspace.folders.some((folder) => folder.name === "Code Repo"),
      false,
      "reuse workspace must not point at a non-existent generated code folder",
    );

    const inventory = fs.readFileSync(
      path.join(target, "10_代码仓库", "00_仓库清单.md"),
      "utf8",
    );
    assert.ok(inventory.includes("| R01 | qfd | 当前主仓 |"));
    assert.ok(inventory.includes(sourceRepo));
    assert.ok(inventory.includes("复用现有技术栈"));

    const sprintPlan = fs.readFileSync(
      path.join(target, "03_迭代运行", "Sprint-0-启动", "00_Sprint计划.md"),
      "utf8",
    );
    assert.ok(sprintPlan.includes("`reuse`：复用现有代码仓库"));
    assert.ok(sprintPlan.includes("每个 Sprint Planning 重新确认"));

    const monitor = fs.readFileSync(
      path.join(target, "03_迭代运行", "Sprint-0-启动", "01_Sprint任务表与流程看板.md"),
      "utf8",
    );
    assert.ok(monitor.includes("接入现仓：权限、基线分支、CI、角色工作区"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rewrite keeps the source repo visible and creates a candidate target repo", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-rewrite-"));
  const target = path.join(sandbox, "project");
  const sourceRepo = "https://example.com/acme/legacy.git";

  try {
    runCli([
      target,
      "--type=product",
      "--repo-strategy=rewrite",
      `--source-repo=${sourceRepo}`,
      "--repo=rust-svelte-next",
      "--sprint=4",
      "--no-git",
    ]);

    assert.ok(
      fs.existsSync(
        path.join(target, "10_代码仓库", "rust-svelte-next", "apps", "backend", "README.md"),
      ),
      "rewrite should create the candidate target skeleton",
    );

    const inventory = fs.readFileSync(
      path.join(target, "10_代码仓库", "00_仓库清单.md"),
      "utf8",
    );
    assert.ok(inventory.includes("| R01 | 现有系统 | 现行主仓 |"));
    assert.ok(inventory.includes("| R02 | rust-svelte-next | 候选替代仓 |"));
    assert.ok(inventory.includes("旧仓仍是生产事实源"));

    const technicalOverview = fs.readFileSync(
      path.join(target, "04_工程设计", "00_技术全景.md"),
      "utf8",
    );
    assert.ok(technicalOverview.includes("## 当前/现行技术栈"));
    assert.ok(technicalOverview.includes("## 目标技术栈"));
    assert.ok(technicalOverview.includes("新技术栈并行重写后切换"));

    const config = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(config.type, "product", "project background should remain product");
    assert.equal(config.repoStrategy, "rewrite");
    assert.equal(config.sprintNumber, 4);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("--remote + --push pushes all branches to a local bare remote", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-push-"));
  const target = path.join(sandbox, "project");
  const bareRemote = path.join(sandbox, "remote.git");

  try {
    fs.mkdirSync(bareRemote);
    execFileSync("git", ["init", "--bare", bareRemote], { stdio: "ignore" });

    const remoteUrl = pathToFileURL(bareRemote).href;

    runCli([
      target,
      "--preset=studio",
      "--repo=pushed-app",
      "--sprint=2",
      `--remote=${remoteUrl}`,
      "--push",
      "--email.po=po@acme.com",
      "--email.sm=sm@acme.com",
      "--email.tl=tl@acme.com",
      "--email.midbe=midbe@acme.com",
      "--email.srfe=srfe@acme.com",
      "--email.midfe=midfe@acme.com",
      "--email.fs=fs@acme.com",
    ]);

    const remoteBranches = execFileSync("git", ["-C", bareRemote, "branch", "--format=%(refname:short)"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/);

    assert.ok(remoteBranches.includes("main"), "remote should have main");
    assert.ok(remoteBranches.includes("sprint-2"), "remote should have sprint-2");
    assert.equal(
      remoteBranches.filter((b) => b.startsWith("feature/sprint-2/")).length,
      5,
      "remote should have 5 personal feature branches",
    );

    const repo = path.join(target, "10_代码仓库", "pushed-app");
    const originUrl = git(repo, ["remote", "get-url", "origin"]);
    assert.equal(originUrl, remoteUrl);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("--push refuses placeholder @example.com emails", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-guard-"));
  const target = path.join(sandbox, "project");
  const bareRemote = path.join(sandbox, "remote.git");

  try {
    fs.mkdirSync(bareRemote);
    execFileSync("git", ["init", "--bare", bareRemote], { stdio: "ignore" });
    const remoteUrl = pathToFileURL(bareRemote).href;

    let threw = false;
    try {
      runCli([target, "--repo=guard-app", `--remote=${remoteUrl}`, "--push"], { stdio: "pipe" });
    } catch (error) {
      threw = true;
      const combined = `${error.stdout || ""}${error.stderr || ""}`;
      assert.ok(
        /example\.com|占位|placeholder/i.test(combined),
        `error message should mention placeholder email, got: ${combined.slice(0, 200)}`,
      );
    }
    assert.ok(threw, "CLI should exit non-zero when pushing with placeholder emails");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("generates operations guidance using the repository inventory", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-ops-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=ops-app", "--no-git", "--no-worktrees"]);

    const readme = path.join(target, "知识库", "运维与环境", "README.md");
    assert.ok(fs.existsSync(readme), "ops knowledge README should exist");

    const content = fs.readFileSync(readme, "utf8");
    assert.ok(
      content.includes("10_代码仓库/00_仓库清单.md"),
      "operations guidance should resolve the active repo through the inventory",
    );
    assert.ok(
      !/__REPO_NAME__|\{\{REPO_NAME\}\}|\{\{PROJECT_NAME\}\}/.test(content),
      "no raw placeholders should remain",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("generates one Sprint task table with named owners and dependency flow", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-flow-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--preset=studio", "--repo=flow-app", "--no-git"]);

    const sprintDir = path.join(target, "03_迭代运行", "Sprint-0-启动");
    const monitor = path.join(sprintDir, "01_Sprint任务表与流程看板.md");
    const oldMonitor = path.join(sprintDir, "01_Sprint流程监控台.md");
    const oldProgress = path.join(sprintDir, "01_工作进度表.md");
    const coachGuide = path.join(
      target,
      "知识库",
      "Scrum",
      "12_SM流程监控与角色行动决策规范.md",
    );
    const responseTemplate = path.join(
      target,
      "00_项目导航",
      "09_SM教练查询与回复模板.md",
    );

    assert.ok(fs.existsSync(monitor), "Sprint task board should exist");
    assert.equal(fs.existsSync(oldMonitor), false, "old monitor name should not be generated");
    assert.equal(fs.existsSync(oldProgress), false, "old progress table should not be generated");
    assert.ok(fs.existsSync(coachGuide), "SM coaching decision guide should exist");
    assert.ok(fs.existsSync(responseTemplate), "SM standard response template should exist");

    const content = fs.readFileSync(monitor, "utf8");
    assert.ok(content.includes("| T01 | Sprint Goal |"), "task table should be prefilled");
    assert.ok(content.includes("| Muse | Tempo |"), "decision task should use preset PO/SM names");
    assert.ok(content.includes("| Bridge | Forge |"), "environment task should use preset FS/TL names");
    assert.ok(content.includes("建立目标仓、CI、Sprint 分支和角色工作区"));
    assert.ok(content.includes("## 4. Sprint 任务执行表"));
    assert.ok(content.includes("不为普通实现任务另写报告"));
    assert.ok(content.includes("| CI 红灯 | 超过 2 小时 | ⚪ |"));
    assert.ok(content.includes("铁律：Sprint 结束后归档本监控台"));
    assert.ok(content.includes("## 3. 依赖时间线与并行泳道"));
    assert.ok(content.includes("G1 Sprint 1 工程准入"));
    assert.ok(content.includes("flowchart LR"));
    assert.ok(content.includes("外部环境待验证"), "environment verification should not be a blocker");
    assert.ok(
      content.includes("创建 Git 仓库和角色 worktree"),
      "--no-git should keep code collaboration flow pending",
    );
    assert.equal(
      /\{\{TASK_EXECUTION_TABLE\}\}|\{\{CREATED_DATE\}\}|\{\{TEAMWORK_[A-Z_]+\}\}/.test(content),
      false,
    );

    const onboarding = fs.readFileSync(
      path.join(target, "知识库", "Scrum", "09_角色学习路径与成长指南.md"),
      "utf8",
    );
    const glossary = fs.readFileSync(
      path.join(target, "00_项目导航", "04_术语表.md"),
      "utf8",
    );
    assert.ok(onboarding.includes("## 1. 唯一上手入口"));
    assert.ok(onboarding.includes("01_Sprint任务表与流程看板.md` §4"));
    assert.ok(onboarding.includes("它是拆分概念，不是固定目录"));
    assert.ok(glossary.includes("由 `00_项目导航/00_项目首页.md` 显式指向"));

    const ledgerDir = path.join(target, "00_项目导航", "06_团队输入输出总表");
    const ledgerIndex = fs.readFileSync(path.join(ledgerDir, "00_索引.md"), "utf8");
    const ledgerA = fs.readFileSync(path.join(ledgerDir, "A_项目管理.md"), "utf8");
    const ledgerE = fs.readFileSync(path.join(ledgerDir, "E_发布运维.md"), "utf8");
    assert.ok(ledgerIndex.includes("[A_项目管理.md](A_项目管理.md)"), "index should link to A");
    assert.ok(ledgerIndex.includes("owner: SM"), "index frontmatter should declare owner");
    assert.ok(ledgerA.includes("| A07 | P0 | Sprint 0 任务表与流程看板 |"));
    assert.ok(ledgerA.includes("| A08 | P1 | 团队协作交互协议与 SM 播报模板 |"));
    assert.ok(ledgerA.includes("| A09 | P2 | 文档协作与并发控制规范"));
    assert.ok(ledgerA.includes("| A11 | P0 | Sprint关闭与证据治理规范"));
    assert.ok(ledgerA.includes("| A12 | P0 | Sprint 0关闭与Sprint 1准入检查表"));
    assert.ok(
      ledgerE.includes("待手工创建角色 worktree"),
      "--no-git should render the manual TeamWork path",
    );
    assert.ok(ledgerE.includes("参考 08_团队开发协作SOP.md §4.1 手工创建"));
    assert.equal(/\{\{TEAMWORK_[A-Z_]+\}\}/.test(ledgerE), false);

    const responseContent = fs.readFileSync(responseTemplate, "utf8");
    for (const protocolPart of [
      "## 3. 成员向 SM 上报",
      "### 3.1 状态包",
      "### 3.2 SM 确认",
      "### 3.3 状态纠偏",
      "## 4. SM 群聊快报",
      "## 5. SM 流程全景",
      "## 6. 单角色状态卡",
    ]) {
      assert.ok(
        responseContent.includes(protocolPart),
        `interaction protocol should include ${protocolPart}`,
      );
    }
    assert.ok(responseContent.includes("关键链："));
    assert.ok(responseContent.includes("并行工作："));
    assert.ok(responseContent.includes("完成后解锁："));
    assert.ok(responseContent.includes("没有状态变化时不重复上报"));

    const agreement = fs.readFileSync(
      path.join(target, "00_项目导航", "01_团队工作协议.md"),
      "utf8",
    );
    assert.ok(agreement.includes("## 状态同步"));
    assert.ok(agreement.includes("不另建日报或重复台账"));

    const guideContent = fs.readFileSync(coachGuide, "utf8");
    assert.ok(guideContent.includes("属于选读材料"));
    assert.ok(guideContent.includes("本规范只解释 SM 如何判定，不再重复操作模板"));

    const home = fs.readFileSync(
      path.join(target, "00_项目导航", "00_项目首页.md"),
      "utf8",
    );
    assert.ok(home.includes("## 30 分钟上手"));
    assert.ok(home.includes("不要求通读知识库"));

    const roleOnboarding = fs.readFileSync(
      path.join(target, "知识库", "Scrum", "09_角色学习路径与成长指南.md"),
      "utf8",
    );
    assert.ok(roleOnboarding.includes("能开始交付后，再按问题查阅一份指南"));
    assert.ok(roleOnboarding.includes("普通执行角色不必先读"));
    assert.equal(roleOnboarding.includes("每位成员都应保留"), false);

    const knowledgeCatalog = fs.readFileSync(
      path.join(target, "知识库", "00_知识库总目录.md"),
      "utf8",
    );
    assert.ok(knowledgeCatalog.includes("固定生成 `93` 个 Markdown 文件"));
    assert.ok(knowledgeCatalog.includes("| 项目导航 | 18 |"));
    assert.ok(knowledgeCatalog.includes("### 可预见与不可预见"));
    assert.ok(knowledgeCatalog.includes("数量和内容不可预见"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("keeps advanced document controls available but optional", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-04-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--preset=tech", "--repo=v04-app", "--no-git", "--no-worktrees"]);

    const ledgerDir = path.join(target, "00_项目导航", "06_团队输入输出总表");
    const oldFile = path.join(target, "00_项目导航", "06_团队输入输出总表.md");

    assert.equal(fs.existsSync(oldFile), false, "old single-file ledger should be removed");
    assert.ok(fs.existsSync(ledgerDir), "ledger directory should exist");

    const subFiles = ["00_索引.md", "A_项目管理.md", "B_产品发现.md", "C_工程设计.md", "D_质量验证.md", "E_发布运维.md", "F_度量改进.md"];
    for (const file of subFiles) {
      const full = path.join(ledgerDir, file);
      assert.ok(fs.existsSync(full), `${file} should be generated`);
      const content = fs.readFileSync(full, "utf8");
      assert.ok(/^---\r?\nowner:/m.test(content), `${file} should have frontmatter with owner`);
      assert.ok(/status:\s*(draft|review|approved|locked)/m.test(content), `${file} status should be valid`);
    }

    // Owner mapping per file
    const expectations = {
      "A_项目管理.md": /owner:\s*SM/,
      "B_产品发现.md": /owner:\s*PO/,
      "C_工程设计.md": /owner:\s*TL/,
      "D_质量验证.md": /owner:\s*Mid\.BE\b/,
      "E_发布运维.md": /owner:\s*FS/,
      "F_度量改进.md": /owner:\s*SM/,
    };
    for (const [file, regex] of Object.entries(expectations)) {
      const content = fs.readFileSync(path.join(ledgerDir, file), "utf8");
      assert.match(content, regex, `${file} owner mismatch`);
    }

    // v0.4.1: D file must use segmented-owner pattern, NOT owner array
    const dContent = fs.readFileSync(path.join(ledgerDir, "D_质量验证.md"), "utf8");
    assert.equal(
      /owner:\s*\[/m.test(dContent),
      false,
      "D file must not use array owner (v0.4.1 ban on dual primary owner)",
    );
    assert.match(dContent, /coOwners:\s*\[Mid\.FE\]/, "D should declare Mid.FE as coOwner");
    assert.match(
      dContent,
      /§1[^\n]*\(owner:\s*Mid\.BE/,
      "D §1 should be owned by Mid.BE",
    );
    assert.match(
      dContent,
      /§2[^\n]*\(owner:\s*Mid\.FE/,
      "D §2 should be owned by Mid.FE",
    );

    // CODEOWNERS generated with real role names substituted in comments
    const codeowners = path.join(target, ".github", "CODEOWNERS");
    assert.ok(fs.existsSync(codeowners), "CODEOWNERS should be emitted under .github/");
    const owners = fs.readFileSync(codeowners, "utf8");
    assert.ok(owners.includes("Jobs"), "tech preset PO name should be substituted");
    assert.ok(owners.includes("Sutherland"), "tech preset SM name should be substituted");
    assert.ok(owners.includes("Torvalds"), "tech preset FS name should be substituted");
    assert.ok(owners.includes("06_团队输入输出总表/A_*"), "owners should cover ledger sub-files");
    assert.ok(owners.includes("@<sm-github>"), "placeholders for github user kept");

    // 13 spec and 04 iteration plan must exist in knowledge base
    assert.ok(
      fs.existsSync(path.join(target, "知识库", "Scrum", "13_文档协作与并发控制规范.md")),
      "13 spec should exist",
    );
    const concurrencyGuide = fs.readFileSync(
      path.join(target, "知识库", "Scrum", "13_文档协作与并发控制规范.md"),
      "utf8",
    );
    assert.ok(concurrencyGuide.includes("| L0 默认 |"));
    assert.ok(concurrencyGuide.includes("CODEOWNERS 可用"));
    assert.ok(concurrencyGuide.includes("只对 L1/L2 启用"));
    assert.ok(
      fs.existsSync(path.join(target, "知识库", "项目模板", "04_文档协作机制迭代计划.md")),
      "04 iteration plan should exist",
    );

    // 05 management spec should reference 13 spec
    const mgmtSpec = fs.readFileSync(path.join(target, "00_项目导航", "05_输入输出管理规范.md"), "utf8");
    assert.ok(mgmtSpec.includes("13_文档协作与并发控制规范"), "05 spec should link to 13");
    assert.match(mgmtSpec, /^---\r?\nowner:\s*SM/m, "05 spec should have frontmatter");

    // 00 home page index should point to new ledger entry
    const home = fs.readFileSync(path.join(target, "00_项目导航", "00_项目首页.md"), "utf8");
    assert.ok(
      home.includes("06_团队输入输出总表/00_索引.md"),
      "home page should link to ledger index",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.5.0 generates lightweight Sprint closure guidance", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-05-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=closure-app", "--no-git", "--no-worktrees"]);

    const sprintDir = path.join(target, "03_迭代运行", "Sprint-0-启动");
    const closure = path.join(sprintDir, "07_Sprint关闭与准入检查表.md");
    const closureGuide = path.join(
      target,
      "知识库",
      "Scrum",
      "14_Sprint关闭与证据治理规范.md",
    );

    for (const file of [closure, closureGuide]) {
      assert.ok(fs.existsSync(file), `${path.basename(file)} should be generated`);
    }

    const guide = fs.readFileSync(closureGuide, "utf8");
    for (const lesson of [
      "Approve、门禁通过和交付不能混用",
      "正式文档状态必须一致",
      "事实冲突先裁决再同步",
      "门禁标准必须提前写硬",
      "统计必须可复算",
      "SM 的责任边界",
    ]) {
      assert.ok(guide.includes(lesson), `closure guide should preserve lesson: ${lesson}`);
    }

    const checklist = fs.readFileSync(closure, "utf8");
    assert.ok(checklist.includes("时间盒"));
    assert.ok(checklist.includes("Sprint Goal"));
    assert.ok(checklist.includes("carry-over"));
    assert.ok(checklist.includes("Sprint 1 准入"));

    assert.equal(
      fs.existsSync(path.join(sprintDir, "07_证据清单.json")),
      false,
      "lightweight template should not generate a mandatory evidence manifest",
    );
    assert.equal(
      fs.existsSync(path.join(target, "tools", "verify-sprint-evidence.mjs")),
      false,
      "lightweight template should not generate a mandatory verifier",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.9.1 scopes governance debt and keeps onboarding non-blocking", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-091-"));
  const target = path.join(sandbox, "project");
  const python = process.env.PYTHON || "python";

  try {
    runCli([target, "--repo=governed-app", "--no-git", "--no-worktrees"]);

    const home = fs.readFileSync(
      path.join(target, "00_项目导航", "00_项目首页.md"),
      "utf8",
    );
    const roleManual = fs.readFileSync(
      path.join(target, "00_项目导航", "11_角色行动手册.md"),
      "utf8",
    );
    const smallTeam = fs.readFileSync(
      path.join(target, "知识库", "项目模板", "05_小团队角色裁剪指南.md"),
      "utf8",
    );
    assert.ok(home.includes("08_团队开发协作SOP.md"));
    assert.equal(home.includes("08_团队开发协作 SOP.md"), false);
    assert.ok(roleManual.includes("签核不是 Sprint 开工门禁"));
    assert.ok(roleManual.includes("governance: managed"));
    assert.ok(roleManual.includes("resign-roles: []"));
    assert.ok(smallTeam.includes("实验性手工方案"));
    assert.ok(smallTeam.includes("--no-worktrees"));

    const invalidDoc = path.join(target, "04_工程设计", "INVALID_受管文档.md");
    fs.writeFileSync(
      invalidDoc,
      `---
id: Z99
title: 非法阶段验证
owner: Fowler
domain: BE
phase: 错误阶段
sprint: Sprint-0
type: ADR
status: draft
version: V1.0
last-updated: 2026-07-01
governance: managed
---

# 非法阶段验证
`,
      "utf8",
    );

    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
    });

    const overview = fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "00_总览.md"),
      "utf8",
    );
    const debt = fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "99_缺字段报告.md"),
      "utf8",
    );
    const audit = fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "06_停滞审计.md"),
      "utf8",
    );
    assert.ok(overview.includes("显式纳管"));
    assert.ok(overview.includes("历史、入口、骨架和 exempt 文档不形成治理债"));
    assert.ok(debt.includes("phase=错误阶段"));
    assert.ok(audit.includes("模式：**initial**"));
    assert.ok(audit.includes("应签范围：**PO、SM、TL、Mid.BE/QA、Sr.FE/UX、Mid.FE/QA、FS/DevOps**"));
    assert.ok(audit.includes("待签：CHG-100"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.9.2 generates actionable closure and review integrity guidance", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-092-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=closure-app", "--no-git", "--no-worktrees"]);

    const nav = path.join(target, "00_项目导航");
    const smGuide = fs.readFileSync(
      path.join(nav, "09_SM教练查询与回复模板.md"),
      "utf8",
    );
    const roleManual = fs.readFileSync(
      path.join(nav, "11_角色行动手册.md"),
      "utf8",
    );
    const closure = fs.readFileSync(
      path.join(target, "03_迭代运行", "Sprint-0-启动", "07_Sprint关闭与准入检查表.md"),
      "utf8",
    );
    const closureGuide = fs.readFileSync(
      path.join(target, "知识库", "Scrum", "14_Sprint关闭与证据治理规范.md"),
      "utf8",
    );

    assert.ok(smGuide.includes("先查什么、选哪个模板"));
    assert.ok(smGuide.includes("Review/Retro 评审完整性检查"));
    assert.ok(roleManual.includes("稳定流水线只做触发验证"));
    assert.ok(roleManual.includes("Sprint 关闭事实同步"));
    assert.ok(closure.includes("工作完成"));
    assert.ok(closure.includes("正式关闭"));
    assert.ok(closureGuide.includes("平台无关的 CI 最小证据"));
    assert.ok(closureGuide.includes("单一事实源归档"));

    const review = path.join(target, "review.md");
    fs.writeFileSync(
      review,
      `# Review

## 评审意见追加

### Alice (TL) · 2026-07-03

通过。

### Bob (FS) · 2026-07-03

通过。
`,
      "utf8",
    );

    const tool = path.join(target, "tools", "review-status.mjs");
    const output = execFileSync(process.execPath, [tool, review], {
      cwd: target,
      encoding: "utf8",
    });
    assert.ok(output.includes("Review entries (2)"));
    assert.ok(output.includes("Alice (TL)"));
    assert.ok(output.includes("Bob (FS)"));

    fs.appendFileSync(review, "\n### Alice (TL) · 2026-07-04\n", "utf8");
    assert.throws(
      () => execFileSync(process.execPath, [tool, review], {
        cwd: target,
        stdio: "pipe",
      }),
      (error) => error.status === 2,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.9.3 keeps signoff orchestration with SM and normalizes role scope", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-093-"));
  const target = path.join(sandbox, "project");
  const python = process.env.PYTHON || "python";

  try {
    runCli([target, "--repo=signoff-app", "--no-git", "--no-worktrees"]);

    const nav = path.join(target, "00_项目导航");
    const smGuide = fs.readFileSync(
      path.join(nav, "09_SM教练查询与回复模板.md"),
      "utf8",
    );
    const manualPath = path.join(nav, "11_角色行动手册.md");
    let roleManual = fs.readFileSync(manualPath, "utf8");
    const smPlaybook = fs.readFileSync(
      path.join(nav, "SM_作战手册_Sutherland.md"),
      "utf8",
    );

    assert.ok(smGuide.includes("入队首签通知"));
    assert.ok(smGuide.includes("误派纠偏通知"));
    assert.ok(smGuide.includes("完成闭环通知"));
    assert.ok(roleManual.includes("签核编排协议"));
    assert.ok(roleManual.includes("不能把签核编排任务转给其他成员"));
    assert.ok(roleManual.includes("仅 SM 自签"));
    assert.ok(smPlaybook.includes("编排角色手册签核"));

    roleManual = roleManual
      .replace(
        /\| CHG-100 \| V1\.3 \| [^|]+ \| 首版；含关闭同步、变化触发式 CI、签核编排与事件模型 \| ALL \|/,
        "| CHG-100 | V1.3 | 2026-07-03 | 别名匹配验证 | SM,FS |",
      )
      .replace(
        /\| SIGN-INIT-001 \| initial \| V1\.3 \| CHG-100 \| ALL \| [^|]+ \| 由 SM 确认 \| open \| — \|/,
        "| SIGN-ALIAS-001 | incremental | V1.3 | CHG-100 | SM,FS | 2026-07-03 | 2026-07-04 | open | — |",
      );
    fs.writeFileSync(manualPath, roleManual, "utf8");

    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
    });
    const audit = fs.readFileSync(
      path.join(nav, "文档索引", "06_停滞审计.md"),
      "utf8",
    );

    assert.ok(audit.includes("模式：**incremental**"));
    assert.ok(audit.includes("应签范围：**SM、FS/DevOps**"));
    assert.match(audit, /\| SM \| .*⚠️ 待签：CHG-100/);
    assert.match(audit, /\| FS\/DevOps \| .*⚠️ 待签：CHG-100/);
    assert.match(audit, /\| Mid\.BE\/QA \| .*○ 当前无受影响变更/);
    assert.ok(audit.includes("不得把汇总、通知或验收转交给被签核成员"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.9.4 preserves Sprint lessons across knowledge, operations, and source trace", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-094-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=learning-app", "--no-git", "--no-worktrees"]);

    const scrum = path.join(target, "知识库", "Scrum");
    const lessons = fs.readFileSync(
      path.join(scrum, "06_经验教训与反模式清单.md"),
      "utf8",
    );
    const quality = fs.readFileSync(
      path.join(scrum, "08_质量门禁与测试金字塔指南.md"),
      "utf8",
    );
    const smKnowledge = fs.readFileSync(
      path.join(scrum, "12_SM流程监控与角色行动决策规范.md"),
      "utf8",
    );
    const sources = fs.readFileSync(path.join(scrum, "99_来源索引.md"), "utf8");
    const backflow = fs.readFileSync(
      path.join(target, "知识库", "项目模板", "02_模板演进与反向回流指南.md"),
      "utf8",
    );

    for (const lesson of [
      "关闭后必须切换当前入口",
      "计划周期不能被结果日期覆盖",
      "CI 证据统一语义而非平台字段",
      "稳定 CI 不必每个 Sprint 重建",
      "测试数量不代表测试稳定",
      "SM 的通知也是交付物",
      "SM 把签核编排转给开发成员",
    ]) {
      assert.ok(lessons.includes(lesson), `missing backflow lesson: ${lesson}`);
    }
    assert.ok(quality.includes("不能单独证明“全部通过”或"));
    assert.ok(smKnowledge.includes("SM 先识别问题类型，再选择模板"));
    assert.ok(smKnowledge.includes("唯一编排责任"));
    assert.ok(sources.includes("Sprint-1/02_Sprint1_Review纪要.md"));
    assert.ok(sources.includes("07_度量改进/05_Sprint0-2阶段复盘.md"));
    assert.ok(sources.includes("签核误派"));
    assert.ok(backflow.includes("完整回流 Definition of Done"));
    assert.ok(backflow.includes("只完成 L1 项目修复"));
    assert.ok(backflow.includes("项目闭环"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.9.5 traces catch-up coverage and keeps rebaseline history honest", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-095-"));
  const target = path.join(sandbox, "project");
  const python = process.env.PYTHON || "python";

  try {
    runCli([target, "--repo=event-app", "--no-git", "--no-worktrees"]);

    const nav = path.join(target, "00_项目导航");
    const manualPath = path.join(nav, "11_角色行动手册.md");
    let manual = fs.readFileSync(manualPath, "utf8");
    manual = manual
      .replace("version: 1.3", "version: 1.4")
      .replace(
        /\| CHG-100 \| V1\.3 \| [^|]+ \| 首版；含关闭同步、变化触发式 CI、签核编排与事件模型 \| ALL \|/,
        `| CHG-100 | V1.0 | 2026-07-01 | 首版 | FS/DevOps |
| CHG-120 | V1.2 | 2026-07-02 | CI 变化触发 | FS |
| CHG-130 | V1.3 | 2026-07-02 | SM 编排 | SM |
| CHG-140 | V1.4 | 2026-07-03 | CI 证据契约 | FS/DevOps |`,
      )
      .replace(
        /\| SIGN-INIT-001 \| initial \| V1\.3 \| CHG-100 \| ALL \| [^|]+ \| 由 SM 确认 \| open \| — \|/,
        "| SIGN-CATCHUP-001 | catch-up | V1.4 | CHG-120,CHG-140 | FS | 2026-07-03 | 2026-07-04 | open | — |",
      )
      .replace(
        "|---|---|---|---|---|---|---|---|---|---|\n\n当前有效性",
        `|---|---|---|---|---|---|---|---|---|---|
| EVT-FS-001 | LEGACY | FS/DevOps | Atlas | — | V1.0 | CHG-100 | 2026-07-01 | unverified | accepted |
| EVT-FS-002 | SIGN-CATCHUP-001 | FS | Atlas | V1.0 | V1.4 | CHG-120,CHG-140 | 2026-07-03 | auto | accepted |

当前有效性`,
      );
    fs.writeFileSync(manualPath, manual, "utf8");

    execFileSync("git", ["init", "-b", "main"], { cwd: target, stdio: "pipe" });
    git(target, ["config", "user.name", "Atlas"]);
    git(target, ["config", "user.email", "atlas@example.test"]);
    git(target, ["add", "."]);
    git(target, ["commit", "-m", "test: add catch-up signoff events"]);

    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
    });
    let audit = fs.readFileSync(
      path.join(nav, "文档索引", "06_停滞审计.md"),
      "utf8",
    );
    assert.ok(audit.includes("批次：**SIGN-CATCHUP-001**"));
    assert.ok(audit.includes("模式：**catch-up**"));
    assert.match(audit, /\| FS\/DevOps \| .*V1\.4.*✅ 当前有效；⚠️ 历史证据缺口/);
    assert.ok(audit.includes("EVT-FS-002"));
    assert.ok(audit.includes("CHG-120,CHG-140"));
    assert.equal(audit.includes("FS/DevOps | Atlas | V1.2"), false);
    assert.match(audit, /\| SM \| .*⚠️ 待签：CHG-130/);

    manual = fs.readFileSync(manualPath, "utf8")
      .replace("version: 1.4", "version: 1.5")
      .replace(
        "| CHG-140 | V1.4 | 2026-07-03 | CI 证据契约 | FS/DevOps |",
        `| CHG-140 | V1.4 | 2026-07-03 | CI 证据契约 | FS/DevOps |
| CHG-150 | V1.5 | 2026-07-03 | 事件模型迁移 | ALL |`,
      )
      .replace(
        "| SIGN-CATCHUP-001 | catch-up | V1.4 | CHG-120,CHG-140 | FS | 2026-07-03 | 2026-07-04 | open | — |",
        `| SIGN-CATCHUP-001 | catch-up | V1.4 | CHG-120,CHG-140 | FS | 2026-07-03 | 2026-07-04 | closed | EVT-FS-002 |
| SIGN-RESET-001 | full-rebaseline | V1.5 | BASELINE-V1.5 | ALL | 2026-07-03 | 2026-07-04 | open | — |`,
      )
      .replace(
        "| EVT-FS-002 | SIGN-CATCHUP-001 | FS | Atlas | V1.0 | V1.4 | CHG-120,CHG-140 | 2026-07-03 | auto | accepted |",
        `| EVT-FS-002 | SIGN-CATCHUP-001 | FS | Atlas | V1.0 | V1.4 | CHG-120,CHG-140 | 2026-07-03 | auto | accepted |
| EVT-FS-003 | SIGN-RESET-001 | FS/DevOps | Atlas | V1.4 | V1.5 | BASELINE-V1.5 | 2026-07-03 | auto | accepted |`,
      );
    fs.writeFileSync(manualPath, manual, "utf8");
    git(target, ["add", path.relative(target, manualPath)]);
    git(target, ["commit", "-m", "test: add full rebaseline event"]);

    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
    });
    audit = fs.readFileSync(path.join(nav, "文档索引", "06_停滞审计.md"), "utf8");
    assert.ok(audit.includes("批次：**SIGN-RESET-001**"));
    assert.match(audit, /\| FS\/DevOps \| .*V1\.5.*✅ 当前有效；⚠️ 历史证据缺口/);
    assert.match(audit, /\| PO \| .*⚠️ 待签：CHG-150/);
    assert.ok(audit.includes("恢复当前有效性但保留旧历史缺口"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
