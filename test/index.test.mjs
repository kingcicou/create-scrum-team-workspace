import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import {
  loadTeamModel,
  projectLegacyConfig,
  validateTeamModel,
  memberResponsibilities,
  activeMemberIds,
} from "../template/tools/lib/team-model.mjs";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cliPath = path.join(packageDir, "index.mjs");
const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
).version;
// 与 signoff.mjs 的 localDate() 一致（本地时区日期），用于拼接当日生成的 Campaign/Event ID。
const todayCompact = (() => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
})();

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
      "--git-root=repo",
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
    runCli([target, "--repo=lean-app", "--git-root=repo", "--no-worktrees"]);

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
    assert.equal(config.gitRoot, "workspace");
    assert.equal(config.setupWorktrees, false);
    assert.equal(git(target, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");

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
    assert.ok(monitor.includes("接入现有代码仓并验证角色工作区"));
    assert.ok(monitor.includes("不默认新建 CI、部署环境或发布流水线"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rewrite keeps the source repo visible and defers the candidate target repo", () => {
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

    assert.equal(
      fs.existsSync(path.join(target, "10_代码仓库", "rust-svelte-next")),
      false,
      "rewrite should wait for an approved Sprint 0 repository decision",
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
      "--git-root=repo",
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

test("--push refuses placeholder Gmail '+' and @example.com emails", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-guard-"));
  const target = path.join(sandbox, "project");
  const bareRemote = path.join(sandbox, "remote.git");

  try {
    fs.mkdirSync(bareRemote);
    execFileSync("git", ["init", "--bare", bareRemote], { stdio: "ignore" });
    const remoteUrl = pathToFileURL(bareRemote).href;

    let threw = false;
    try {
      runCli([target, "--repo=guard-app", "--git-root=repo", `--remote=${remoteUrl}`, "--push"], { stdio: "pipe" });
    } catch (error) {
      threw = true;
      const combined = `${error.stdout || ""}${error.stderr || ""}`;
      assert.ok(
        /kingcicou\.zmh\+|example\.com|占位|placeholder/i.test(combined),
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

test("generates one Sprint task table with owner memberId + responsibleHat and dependency flow", () => {
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
    assert.ok(content.includes("Owner（memberId）"), "task table should show owner memberId column");
    assert.ok(content.includes("责任帽子"), "task table should show responsibleHat column");
    assert.ok(content.includes("| Muse (po) | po | Tempo |"), "decision task should bind owner memberId and hat");
    assert.ok(content.includes("| Bridge (fs) | devops | Forge |"), "environment task should bind owner memberId and hat");
    assert.ok(content.includes("验证目标代码仓与角色工作区"));
    assert.ok(content.includes("不默认新建 CI、部署环境或发布流水线"));
    assert.ok(content.includes("可开始条件"));
    assert.ok(content.includes("完成标准（DoD）"));
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

    const kickoffHome = fs.readFileSync(
      path.join(target, "00_项目导航", "00_项目首页.md"),
      "utf8",
    );
    assert.ok(kickoffHome.includes("【项目启动通知｜"));
    assert.ok(kickoffHome.includes("现在可并行："));
    assert.ok(kickoffHome.includes("等待输入，但可先准备："));
    assert.ok(kickoffHome.includes("启动通知不等于签核通知"));
    assert.ok(kickoffHome.includes("@Bridge (fs)｜T07"));
    assert.ok(kickoffHome.includes("Owner(memberId+responsibleHat) 已确认"));

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
    assert.ok(smallTeam.includes("members + scrum + hats + assignments"));
    assert.ok(smallTeam.includes("team.mjs assign"));

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

    const tool = path.join(target, "tools", "review-status.mjs");
    for (const generated of [
      path.join(target, "03_迭代运行", "Sprint-0-启动", "04_Sprint评审记录.md"),
      path.join(target, "03_迭代运行", "Sprint-0-启动", "05_Sprint回顾记录.md"),
    ]) {
      const emptyOutput = execFileSync(process.execPath, [tool, generated], {
        cwd: target,
        encoding: "utf8",
      });
      assert.ok(emptyOutput.includes("Review entries (0)"));
    }

    const review = path.join(target, "review.md");
    fs.writeFileSync(
      review,
      `# Review

## 评审意见追加

<!-- append:role=TL -->
### Alice (TL) · 2026-07-03

通过。
<!-- /append:role=TL -->

<!-- append:role=FS -->
### Bob (FS) · 2026-07-03

通过。
<!-- /append:role=FS -->
`,
      "utf8",
    );

    const output = execFileSync(process.execPath, [tool, review], {
      cwd: target,
      encoding: "utf8",
    });
    assert.ok(output.includes("Review entries (2)"));
    assert.ok(output.includes("Alice (TL)"));
    assert.ok(output.includes("Bob (FS)"));

    const unanchored = path.join(target, "review-unanchored.md");
    fs.writeFileSync(
      unanchored,
      "# Review\n\n## 评审意见追加\n\n<!-- append-policy: anchors-v1 -->\n\n### Carol (PO) · 2026-07-03\n\n通过。\n",
      "utf8",
    );
    assert.throws(
      () => execFileSync(process.execPath, [tool, unanchored], {
        cwd: target,
        stdio: "pipe",
      }),
      (error) => error.status === 2,
    );

    fs.appendFileSync(
      review,
      "\n<!-- append:role=TL -->\n### Alice (TL) · 2026-07-04\n<!-- /append:role=TL -->\n",
      "utf8",
    );
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
        /\| CHG-100 \| V1\.5 \| [^|]+ \| 首版；含关闭同步、变化触发式 CI、签核编排、纠偏批次与独立事件文件模型 \| ALL \|/,
        "| CHG-100 | V1.5 | 2026-07-03 | 别名匹配验证 | SM,FS |",
      )
      .replace(
        /\| 由 bootstrap 生成 \| initial \| V1\.5 \| 按全局审计逐角色生成 \| ALL \| 创建时\/建库后 \| 默认 \+72h advisory \| 待创建 \| 创建者运行一次 `signoff bootstrap` \|/,
        "| SIGN-ALIAS-001 | incremental | V1.5 | CHG-100 | SM,FS | 2026-07-03 | 2026-07-04 | open | — |",
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
      .replace("version: 1.5", "version: 1.4")
      .replace(
        /\| CHG-100 \| V1\.5 \| [^|]+ \| 首版；含关闭同步、变化触发式 CI、签核编排、纠偏批次与独立事件文件模型 \| ALL \|/,
        `| CHG-100 | V1.0 | 2026-07-01 | 首版 | FS/DevOps |
| CHG-120 | V1.2 | 2026-07-02 | CI 变化触发 | FS |
| CHG-130 | V1.3 | 2026-07-02 | SM 编排 | SM |
| CHG-140 | V1.4 | 2026-07-03 | CI 证据契约 | FS/DevOps |`,
      )
      .replace(
        /\| 由 bootstrap 生成 \| initial \| V1\.5 \| 按全局审计逐角色生成 \| ALL \| 创建时\/建库后 \| 默认 \+72h advisory \| 待创建 \| 创建者运行一次 `signoff bootstrap` \|/,
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

test("v0.9.6 detects cosigning and excludes anomalous coverage from verified", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-096-"));
  const target = path.join(sandbox, "project");
  const python = process.env.PYTHON || "python";

  const runGen = () =>
    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
    });
  const readAudit = () =>
    fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "06_停滞审计.md"),
      "utf8",
    );
  const fsStateLine = (audit) =>
    audit.split(/\r?\n/).find((line) => /^\| FS\/DevOps \|/.test(line)) || "";

  try {
    runCli([target, "--repo=event-app", "--no-git", "--no-worktrees"]);

    const nav = path.join(target, "00_项目导航");
    const manualPath = path.join(nav, "11_角色行动手册.md");
    let manual = fs.readFileSync(manualPath, "utf8");
    manual = manual
      .replace(
        /\| CHG-100 \| V1\.5 \| [^|]+ \| 首版；含关闭同步、变化触发式 CI、签核编排、纠偏批次与独立事件文件模型 \| ALL \|/,
        `| CHG-100 | V1.0 | 2026-07-01 | 首版 | FS/DevOps |
| CHG-200 | V1.2 | 2026-07-02 | CI 变化触发 | FS/DevOps |`,
      )
      .replace(
        /\| 由 bootstrap 生成 \| initial \| V1\.5 \| 按全局审计逐角色生成 \| ALL \| 创建时\/建库后 \| 默认 \+72h advisory \| 待创建 \| 创建者运行一次 `signoff bootstrap` \|/,
        "| SIGN-096-001 | incremental | V1.5 | CHG-100,CHG-200 | FS | 2026-07-03 | 2026-07-04 | open | — |",
      )
      .replace(
        "|---|---|---|---|---|---|---|---|---|---|\n\n当前有效性",
        `|---|---|---|---|---|---|---|---|---|---|
| EVT-FS-001 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |

当前有效性`,
      );
    fs.writeFileSync(manualPath, manual, "utf8");

    execFileSync("git", ["init", "-b", "main"], { cwd: target, stdio: "pipe" });
    git(target, ["config", "user.name", "Atlas"]);
    git(target, ["config", "user.email", "atlas@example.test"]);
    git(target, ["add", "."]);
    // 代签场景：EVT-FS-001 那一行由 Mallory 提交（作者≠成员 Atlas）
    git(target, [
      "commit",
      "--author=Mallory <mallory@example.test>",
      "-m",
      "cosign: FS row actually filled by Mallory",
    ]);

    // 场景 1：作者不匹配 → ⚠️ 疑似代签
    runGen();
    let audit = readAudit();
    assert.match(audit, /EVT-FS-001 \|.*⚠️ 疑似代签.*应为 Atlas/);
    // 场景 2：异常事件覆盖的 CHG-100 不进入 verified，必须显示待重签（回归 P1 有效覆盖漏洞）
    assert.match(fsStateLine(audit), /待重签（疑似代签\/无效）：.*CHG-100/);
    assert.doesNotMatch(fsStateLine(audit), /^\| FS\/DevOps \|.*✅ 当前有效/);

    // 场景 3：对象库中存在但不可从 HEAD 追溯的 legacy commit 不得算有效证据。
    const tree = git(target, ["rev-parse", "HEAD^{tree}"]).trim();
    const dangling = git(target, ["commit-tree", tree, "-m", "dangling legacy evidence"]).trim();
    const danglingRow =
      `| EVT-FS-DANGLING | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.2 | CHG-200 | 2026-07-03 | legacy:${dangling} | accepted |`;
    manual = fs.readFileSync(manualPath, "utf8").replace(
      "| EVT-FS-001 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |",
      `| EVT-FS-001 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |
${danglingRow}`,
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    runGen();
    audit = readAudit();
    assert.match(audit, /EVT-FS-DANGLING \|.*不可从 HEAD 追溯/);
    assert.match(fsStateLine(audit), /待重签（疑似代签\/无效）：.*CHG-200/);
    manual = fs.readFileSync(manualPath, "utf8").replace(`\n${danglingRow}`, "");
    fs.writeFileSync(manualPath, manual, "utf8");

    // 场景 4：批次被提前关闭时必须报告事实冲突并要求 corrective。
    manual = fs.readFileSync(manualPath, "utf8").replace(
      "| SIGN-096-001 | incremental | V1.5 | CHG-100,CHG-200 | FS | 2026-07-03 | 2026-07-04 | open | — |",
      "| SIGN-096-001 | incremental | V1.5 | CHG-100,CHG-200 | FS | 2026-07-03 | 2026-07-04 | closed | premature |",
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    runGen();
    audit = readAudit();
    assert.ok(audit.includes("已关闭批次 SIGN-096-001 与当前待处理并存"));
    assert.ok(audit.includes("建立 corrective 批次"));
    manual = fs.readFileSync(manualPath, "utf8").replace(
      "| SIGN-096-001 | incremental | V1.5 | CHG-100,CHG-200 | FS | 2026-07-03 | 2026-07-04 | closed | premature |",
      "| SIGN-096-001 | incremental | V1.5 | CHG-100,CHG-200 | FS | 2026-07-03 | 2026-07-04 | open | — |",
    );
    fs.writeFileSync(manualPath, manual, "utf8");

    // 场景 5：未提交的新事件不计覆盖，必须显示待提交/验证。
    manual = fs.readFileSync(manualPath, "utf8").replace(
      "| EVT-FS-001 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |",
      `| EVT-FS-001 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |
| EVT-FS-002 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.2 | CHG-200 | 2026-07-03 | auto | accepted |`,
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    runGen();
    audit = readAudit();
    assert.match(audit, /EVT-FS-002 \|.*🟡 待 Git 提交/);
    assert.match(fsStateLine(audit), /待提交\/验证：.*CHG-200/);

    // 场景 6：本人（Atlas）提交补签 CHG-100 与 CHG-200 → 从待重签转为当前有效
    manual = fs.readFileSync(manualPath, "utf8").replace(
      "| EVT-FS-002 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.2 | CHG-200 | 2026-07-03 | auto | accepted |",
      `| EVT-FS-002 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.2 | CHG-200 | 2026-07-03 | auto | accepted |
| EVT-FS-003 | SIGN-096-001 | FS/DevOps | Atlas | V1.0 | V1.0 | CHG-100 | 2026-07-03 | auto | accepted |`,
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    git(target, ["add", "."]);
    git(target, ["commit", "-m", "resign: Atlas re-signs CHG-100 and CHG-200"]);
    runGen();
    audit = readAudit();
    assert.match(fsStateLine(audit), /✅ 当前有效/);
    assert.doesNotMatch(fsStateLine(audit), /待重签/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("release entrypoints and injected tool version stay pinned to the package version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  const escaped = pkg.version.replace(/\./g, "\\.");
  const read = (name) => fs.readFileSync(path.join(packageDir, name), "utf8");
  assert.match(read("README.md"), new RegExp(`create-scrum-team-workspace#v${escaped}`));
  assert.doesNotMatch(read("README.md"), /create-scrum-team-workspace\/v0\.9\.[1589]\//);
  assert.match(read("create.sh"), new RegExp(`SCRUM_TEMPLATE_REF:-v${escaped}`));
  assert.match(read("create.ps1"), new RegExp(`else \\{ "v${escaped}" \\}`));
  // P-LOW-2：模板用占位符，生成时由 index.mjs 注入 package.json 版本（生成项目无根 package.json）。
  assert.match(read("template/tools/signoff.mjs"), /const TOOL_VERSION = "\{\{TOOL_VERSION\}\}"/);
  assert.match(read("index.mjs"), /TOOL_VERSION: CLI_VERSION/);
});

test("initial signoff auto-publishes only from a traceable workspace fact source", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-bootstrap-"));
  const target = path.join(sandbox, "workspace");
  const roleIds = ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"];
  try {
    const output = runCli([
      target,
      "--git-root=workspace",
      "--no-worktrees",
      ...roleIds.map((id) => `--email.${id}=${id}@example.test`),
    ]);
    assert.match(output, /首签已发起：SIGN-\d{8}-001/);
    const campaignDir = path.join(target, ".team", "signoffs", "campaigns");
    const noticeDir = path.join(target, ".team", "signoffs", "notices");
    const campaigns = fs.readdirSync(campaignDir);
    const notices = fs.readdirSync(noticeDir);
    assert.equal(campaigns.length, 1);
    assert.deepEqual(notices, campaigns);

    const campaign = JSON.parse(fs.readFileSync(path.join(campaignDir, campaigns[0]), "utf8"));
    assert.equal(campaign.mode, "initial");
    assert.equal(campaign.scopeSource, "global-audit");
    assert.equal(campaign.dueMode, "advisory");
    assert.match(campaign.dueAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.deepEqual(Object.keys(campaign.assignments).sort(), roleIds.sort());
    assert.match(git(target, ["log", "-2", "--format=%s"]), /signoff\(publish\):/);
    assert.match(git(target, ["log", "-2", "--format=%s"]), /signoff\(prepare\):/);
    assert.equal(git(target, ["status", "--short"]), "");

    const tool = path.join(target, "tools", "signoff.mjs");
    assert.throws(
      () => execFileSync(process.execPath, [
        tool, "bootstrap", "--actor=sm", "--due=+72h",
      ], { cwd: target, stdio: "pipe" }),
      (error) => error.status === 2,
    );

    const guideTarget = path.join(sandbox, "guide");
    const guide = runCli([guideTarget, "--no-git", "--no-worktrees"]);
    assert.match(guide, /首签尚未发起/);
    assert.match(guide, /node tools\/signoff\.mjs bootstrap --actor=sm --due=\+72h/);
    assert.equal(fs.existsSync(path.join(guideTarget, ".team")), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.10.4 publishes immutable notices before signoff", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-0100-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--repo=event-app",
      "--no-worktrees",
    ]);
    const repo = target;
    const config = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    const tool = path.join(target, "tools", "signoff.mjs");
    const runSignoff = (args, options = {}) =>
      execFileSync(process.execPath, [tool, ...args], {
        cwd: target,
        encoding: "utf8",
        ...options,
      });

    git(repo, ["config", "--worktree", "user.name", "Shared Workspace"]);
    git(repo, ["config", "--worktree", "user.email", "shared@example.test"]);

    const repoReadme = path.join(repo, "README.md");
    const cleanReadme = fs.readFileSync(repoReadme, "utf8");
    fs.appendFileSync(repoReadme, "\nlocal audit source drift\n", "utf8");
    assert.throws(
      () => runSignoff([
        "prepare",
        "--campaign=SIGN-DIRTY-001",
        "--actor=sm",
        "--target=V1.5",
        "--roles=all",
        "--coverage=BASELINE-V1.5",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    fs.writeFileSync(repoReadme, cleanReadme, "utf8");
    assert.throws(
      () => runSignoff([
        "prepare",
        "--campaign=SIGN-NODUE-001",
        "--actor=sm",
        "--target=V1.5",
        "--roles=all",
        "--coverage=BASELINE-V1.5",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );

    runSignoff([
      "prepare",
      "--campaign=SIGN-TEST-001",
      "--actor=sm",
      "--target=V1.5",
      "--mode=corrective",
      "--roles=all",
      "--coverage=BASELINE-V1.5",
      "--purpose=验证全局基线",
      "--summary=签核机制测试",
      "--read=角色卡;责任表;签核规则",
      "--due=2099-07-04 18:00",
    ]);
    const noticeOne = runSignoff([
      "publish",
      "--campaign=SIGN-TEST-001",
      "--actor=sm",
    ]);
    const digestOne = /NOTICE-BEGIN[^]*?sha256=([a-f0-9]{64})/.exec(noticeOne)?.[1];
    assert.match(digestOne || "", /^[a-f0-9]{64}$/);

    for (const id of ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"]) {
      runSignoff([
        "sign",
        "--campaign=SIGN-TEST-001",
        `--role=${id}`,
        `--notice=${digestOne}`,
      ]);
    }
    assert.equal(git(repo, ["config", "--worktree", "--get", "user.name"]).trim(), "Shared Workspace");
    assert.equal(
      git(repo, ["log", "-1", "--format=%an <%ae>", "--", `.team/signoffs/events/SIGN-TEST-001/EVT-PO-${todayCompact}-001.json`]).trim(),
      `${config.roles.po} <${config.emails.po}>`,
    );

    assert.throws(
      () => runSignoff(["close", "--campaign=SIGN-TEST-001", "--actor=po"], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    assert.match(
      runSignoff(["status", "--campaign=SIGN-TEST-001"]),
      /Closure: OPEN/,
    );
    runSignoff(["close", "--campaign=SIGN-TEST-001", "--actor=sm"]);
    assert.match(
      runSignoff(["status", "--campaign=SIGN-TEST-001"]),
      /Closure: CLOSED/,
    );

    runSignoff([
      "prepare",
      "--campaign=SIGN-TEST-002",
      "--actor=sm",
      "--target=V1.5",
      "--mode=corrective",
      "--roles=po",
      "--coverage=BASELINE-V1.5",
      "--source=SIGN-TEST-001",
      "--due=2099-07-05 18:00",
    ]);
    const noticeTwo = runSignoff([
      "publish",
      "--campaign=SIGN-TEST-002",
      "--actor=sm",
    ]);
    const digestTwo = /NOTICE-BEGIN[^]*?sha256=([a-f0-9]{64})/.exec(noticeTwo)?.[1];
    const badDir = path.join(repo, ".team", "signoffs", "events", "SIGN-TEST-002");
    const badFile = path.join(badDir, "EVT-PO-BAD.json");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      badFile,
      `${JSON.stringify({
        schemaVersion: 1,
        eventId: "EVT-PO-BAD",
        campaignId: "SIGN-TEST-002",
        role: "po",
        member: config.roles.po,
        email: config.emails.po,
        targetBaseline: "V1.5",
        coverage: ["BASELINE-V1.5"],
        signedAt: "2026-07-04",
        result: "accepted",
      }, null, 2)}\n`,
      "utf8",
    );
    git(repo, ["add", path.relative(repo, badFile)]);
    git(repo, ["commit", "-m", "test: SM prelays PO event"]);
    fs.appendFileSync(badFile, "\n", "utf8");
    git(repo, ["add", path.relative(repo, badFile)]);
    git(repo, ["commit", "-m", "test: PO whitespace cannot claim event"]);
    assert.throws(
      () => runSignoff(["status", "--campaign=SIGN-TEST-002"], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    runSignoff([
      "sign",
      "--campaign=SIGN-TEST-002",
      "--role=po",
      `--notice=${digestTwo}`,
    ]);
    assert.match(
      runSignoff(["status", "--campaign=SIGN-TEST-002"]),
      /po .*: VALID/,
    );

    const lock = path.join(repo, ".git", "signoff-operation.lock");
    fs.writeFileSync(lock, "another operation\n", "utf8");
    assert.throws(
      () => runSignoff([
        "sign",
        "--campaign=SIGN-TEST-002",
        "--role=po",
        `--notice=${digestTwo}`,
        "--lock-timeout=100",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    fs.rmSync(lock, { force: true });

    const manualPath = path.join(target, "00_项目导航", "11_角色行动手册.md");
    const manual = fs.readFileSync(manualPath, "utf8")
      .replace("version: 1.5", "version: 1.6")
      .replace(
      "| CHG-100 | V1.5 |",
      "| CHG-200 | V1.6 | 2026-07-04 | PO 新增规则 | PO |\n| CHG-100 | V1.5 |",
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    git(repo, ["add", "00_项目导航/11_角色行动手册.md"]);
    git(repo, [
      "-c", `user.name=${config.roles.sm}`,
      "-c", `user.email=${config.emails.sm}`,
      "commit", "-m", "docs: register CHG-200",
    ]);

    assert.throws(
      () => runSignoff(["close", "--campaign=SIGN-TEST-002", "--actor=sm"], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    runSignoff(["prepare", "--from-audit", "--actor=sm", "--due=2099-07-06 18:00"]);
    const autoCampaignId = `SIGN-${todayCompact}-001`;
    const autoCampaign = path.join(repo, ".team", "signoffs", "campaigns", `${autoCampaignId}.json`);
    assert.equal(fs.existsSync(autoCampaign), true);
    const campaign = JSON.parse(fs.readFileSync(autoCampaign, "utf8"));
    assert.deepEqual(campaign.assignments.po.coverage, ["CHG-200"]);
    assert.equal(campaign.mode, "corrective");
    assert.equal(campaign.toolVersion, pkgVersion);
    assert.equal(campaign.scopeSource, "global-audit");
    assert.equal(campaign.auditSourceState, "clean");
    assert.match(campaign.auditScopeHash, /^[a-f0-9]{64}$/);
    assert.match(campaign.repositoryTree, /^[a-f0-9]{40}$/);
    const driftedManual = manual.replace(
      "| CHG-200 | V1.6 |",
      "| CHG-300 | V1.6 | 2026-07-04 | TL 新增规则 | TL |\n| CHG-200 | V1.6 |",
    );
    fs.writeFileSync(manualPath, driftedManual, "utf8");
    assert.throws(
      () => runSignoff([
        "publish",
        `--campaign=${autoCampaignId}`,
        "--actor=sm",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    assert.throws(
      () => runSignoff(["sign", `--campaign=${autoCampaignId}`, "--role=po"], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    fs.writeFileSync(manualPath, manual, "utf8");
    assert.match(
      runSignoff(["verify", `--campaign=${autoCampaignId}`]),
      /Verify: OK/,
    );
    const published = runSignoff([
      "publish",
      `--campaign=${autoCampaignId}`,
      "--actor=sm",
    ]);
    assert.match(
      published,
      new RegExp(
        `生成依据：tool=${pkgVersion.replace(/\./g, "\\.")}.*tree=[a-f0-9]{12}.*--notice=[a-f0-9]{64}`,
        "s",
      ),
    );
    const digest = /NOTICE-BEGIN[^]*?sha256=([a-f0-9]{64})/.exec(published)?.[1];
    assert.throws(
      () => runSignoff([
        "sign",
        `--campaign=${autoCampaignId}`,
        "--role=po",
        "--notice=wrong",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    runSignoff([
      "sign",
      `--campaign=${autoCampaignId}`,
      "--role=po",
      `--notice=${digest}`,
    ]);
    assert.throws(
      () => runSignoff([
        "publish",
        `--campaign=${autoCampaignId}`,
        "--actor=sm",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
    runSignoff(["close", `--campaign=${autoCampaignId}`, "--actor=sm"]);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.10.5 advisory late signing, hard-mode enforcement, and audit-input drift", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-0105-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([target, "--repo=event-app", "--no-worktrees"]);
    const repo = target;
    const tool = path.join(target, "tools", "signoff.mjs");
    const runSignoff = (args, options = {}) =>
      execFileSync(process.execPath, [tool, ...args], {
        cwd: target,
        encoding: "utf8",
        ...options,
      });
    git(repo, ["config", "--worktree", "user.name", "Shared Workspace"]);
    git(repo, ["config", "--worktree", "user.email", "shared@example.test"]);

    // hard 模式强制未来截止：过去时间被拒
    assert.throws(
      () => runSignoff([
        "prepare", "--campaign=SIGN-HARD-001", "--actor=sm",
        "--target=V1.5", "--roles=po", "--coverage=BASELINE-V1.5",
        "--due=2020-01-01 00:00", "--due-mode=hard",
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );

    // advisory 模式允许历史截止 → 逾期签核成功且 Event 记录 late=true
    runSignoff([
      "prepare", "--campaign=SIGN-ADV-001", "--actor=sm",
      "--target=V1.5", "--mode=corrective", "--roles=all",
      "--coverage=BASELINE-V1.5", "--due=2020-01-01 00:00",
    ]);
    const notice = runSignoff(["publish", "--campaign=SIGN-ADV-001", "--actor=sm"]);
    const digest = /NOTICE-BEGIN[^]*?sha256=([a-f0-9]{64})/.exec(notice)?.[1];
    // Notice 术语已改为“一致性摘要”，不再是“通知凭证”
    assert.match(notice, /Notice 一致性摘要：sha256=/);
    assert.doesNotMatch(notice, /通知凭证/);
    for (const id of ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"]) {
      runSignoff(["sign", "--campaign=SIGN-ADV-001", `--role=${id}`, `--notice=${digest}`]);
    }
    const evDir = path.join(repo, ".team", "signoffs", "events", "SIGN-ADV-001");
    const evName = fs.readdirSync(evDir).find((name) => name.startsWith("EVT-PO-"));
    const event = JSON.parse(fs.readFileSync(path.join(evDir, evName), "utf8"));
    assert.equal(event.late, true);
    assert.ok(event.lateBySeconds > 0);
    assert.equal(event.dueMode, "advisory");
    runSignoff(["close", "--campaign=SIGN-ADV-001", "--actor=sm"]);

    // 审计输入漂移：publish 后修改角色手册（审计输入）→ sign 用 Node 重算指纹并拒绝
    runSignoff([
      "prepare", "--campaign=SIGN-ADV-002", "--actor=sm",
      "--target=V1.5", "--mode=corrective", "--roles=po",
      "--coverage=BASELINE-V1.5", "--due=2099-07-05 18:00",
    ]);
    const noticeTwo = runSignoff(["publish", "--campaign=SIGN-ADV-002", "--actor=sm"]);
    const digestTwo = /NOTICE-BEGIN[^]*?sha256=([a-f0-9]{64})/.exec(noticeTwo)?.[1];
    const charter = path.join(target, "00_项目导航", "11_角色行动手册.md");
    fs.appendFileSync(charter, "\n<!-- 审计输入漂移测试 -->\n", "utf8");
    assert.throws(
      () => runSignoff([
        "sign", "--campaign=SIGN-ADV-002", "--role=po", `--notice=${digestTwo}`,
      ], { stdio: "pipe" }),
      (error) => error.status === 2,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("RC3 default create initializes doc-git only and defers the code repo", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-rc3-"));
  const target = path.join(sandbox, "workspace");
  try {
    // 默认：不传 --repo → 只初始化文档 Git，不建代码仓
    runCli([target]);
    assert.equal(git(target, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");

    const codeRoot = path.join(target, "10_代码仓库");
    const generatedCodeDirs = fs.readdirSync(codeRoot)
      .map((name) => path.join(codeRoot, name))
      .filter((entry) => fs.statSync(entry).isDirectory());
    assert.deepEqual(generatedCodeDirs, [], "Sprint 0 审批前不应创建代码骨架目录");

    const card = path.join(target, "03_迭代运行", "Sprint-0-启动", "仓库决策卡.md");
    assert.equal(fs.existsSync(card), true);
    assert.match(fs.readFileSync(card, "utf8"), /状态.*pending/);

    // 延后建仓：propose → approve(PO+TL) → apply（审批门禁，与人员签核分离）
    const tool = path.join(target, "tools", "setup-code-repo.mjs");
    const run = (args) => execFileSync(process.execPath, [tool, ...args], { cwd: target, encoding: "utf8" });
    run(["propose", "--strategy=create", "--repo=my-app"]);
    // 未审批时 apply 被门禁拒绝
    assert.throws(
      () => execFileSync(process.execPath, [tool, "apply", "--decision=REPO-001", "--yes"], { cwd: target, stdio: "pipe" }),
      (error) => error.status === 2,
    );
    run(["approve", "--decision=REPO-001", "--actor=po"]);
    run(["approve", "--decision=REPO-001", "--actor=tl"]);
    assert.match(run(["check", "--decision=REPO-001"]), /READY/);
    run(["apply", "--decision=REPO-001", "--yes"]);
    const codeRepo = path.join(target, "10_代码仓库", "my-app");
    assert.equal(git(codeRepo, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");
    assert.match(fs.readFileSync(path.join(target, ".gitignore"), "utf8"), /10_代码仓库\/my-app\//);
    assert.equal(git(target, ["status", "--short"]).trim(), "");
    // 幂等：再次 apply 被拒
    assert.throws(
      () => execFileSync(process.execPath, [tool, "apply", "--decision=REPO-001", "--yes"], { cwd: target, stdio: "pipe" }),
      (error) => error.status === 2,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("RC3 core team stage bootstraps only the active core roles", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-core-"));
  const target = path.join(sandbox, "workspace");
  const roleIds = ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"];
  try {
    const output = runCli([
      target,
      "--git-root=workspace",
      "--team-stage=core",
      "--no-worktrees",
      ...roleIds.map((id) => `--email.${id}=${id}@example.test`),
    ]);
    // 只用 3 个核心角色即可发起首签，不必凑齐 7 人（修复循环依赖）
    assert.match(output, /首签已发起：SIGN-\d{8}-001/);
    const campaignDir = path.join(target, ".team", "signoffs", "campaigns");
    const campaign = JSON.parse(fs.readFileSync(path.join(campaignDir, fs.readdirSync(campaignDir)[0]), "utf8"));
    assert.deepEqual(Object.keys(campaign.assignments).sort(), ["po", "sm", "tl"]);

    // R4.2：Campaign 固化 participants 快照（姓名/邮箱/责任/覆盖），历史按此验证不因改名失效
    assert.deepEqual(Object.keys(campaign.participants).sort(), ["po", "sm", "tl"]);
    assert.equal(campaign.participants.tl.email, "tl@example.test");
    assert.ok(campaign.participants.po.responsibilities.includes("scrum:productOwner"));
    assert.ok(campaign.participants.tl.responsibilities.includes("hat:tl"));
    assert.ok(campaign.participants.tl.responsibilities.includes("scrum:developer"));

    const cfg = JSON.parse(fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"));
    assert.equal(cfg.teamStage, "core");
    const statusOf = (id) => cfg.roleDetails.find((role) => role.id === id).status;
    assert.equal(statusOf("po"), "active");
    assert.equal(statusOf("srfe"), "optional");
    assert.equal(statusOf("fs"), "planned");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("R4.1 legacy roles.config projects to the member-hat view", () => {
  const legacy = {
    roles: { po: "Jobs", sm: "Sutherland", tl: "Fowler", midbe: "Ritchie", srfe: "Norman", midfe: "Evan", fs: "Torvalds" },
    emails: { po: "jobs@x", sm: "sm@x", tl: "tl@x", midbe: "mb@x", srfe: "sf@x", midfe: "mf@x", fs: "fs@x" },
    roleDetails: [
      { id: "po", name: "Jobs", email: "jobs@x", status: "active" },
      { id: "sm", name: "Sutherland", email: "sm@x", status: "active" },
      { id: "tl", name: "Fowler", email: "tl@x", status: "active" },
      { id: "midbe", name: "Ritchie", email: "mb@x", status: "planned" },
      { id: "srfe", name: "Norman", email: "sf@x", status: "optional" },
      { id: "midfe", name: "Evan", email: "mf@x", status: "planned" },
      { id: "fs", name: "Torvalds", email: "fs@x", status: "planned" },
    ],
  };
  const model = loadTeamModel(legacy);
  assert.equal(model.schemaVersion, 2);
  assert.equal(model.model, "member-hat-v1");
  assert.equal(model.members.length, 7);
  assert.equal(model.scrum.productOwner, "po");
  assert.equal(model.scrum.scrumMaster, "sm");
  assert.deepEqual(model.scrum.developers, ["tl", "midbe", "srfe", "midfe", "fs"]);
  assert.deepEqual(
    model.assignments.filter((a) => a.memberId === "midbe").map((a) => a.hatId).sort(),
    ["backend", "qa"],
  );
  assert.ok(model.hats.tl && model.hats.backend && model.hats.devops);
  assert.deepEqual(memberResponsibilities(model, "po"), ["scrum:productOwner"]);
  assert.deepEqual(memberResponsibilities(model, "tl").sort(), ["hat:tl", "scrum:developer"]);
  // planned/optional 成员不进入 active 集合（只有 po/sm/tl 是 active）
  assert.deepEqual(activeMemberIds(model).sort(), ["po", "sm", "tl"]);
  // 投影是纯读：不篡改原始配置
  assert.equal(legacy.schemaVersion, undefined);
});

test("R4.1 member-hat v2 config passes through, warns on PO=SM", () => {
  const v2 = {
    schemaVersion: 2,
    model: "member-hat-v1",
    members: [
      { id: "m-a", name: "Alice", email: "a@example.test", status: "active" },
      { id: "m-b", name: "Bob", email: "b@example.test", status: "active" },
    ],
    scrum: { productOwner: "m-a", scrumMaster: "m-a", developers: ["m-b"] },
    hats: { tl: { label: "TL" }, backend: { label: "Backend" } },
    assignments: [
      { memberId: "m-b", hatId: "tl", kind: "primary", status: "active" },
      { memberId: "m-b", hatId: "backend", kind: "primary", status: "active" },
    ],
  };
  const model = loadTeamModel(v2);
  assert.equal(model.members.length, 2);
  const result = validateTeamModel(model);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings.join(";"), /PO 与 SM 指向同一成员/);
});

test("R4.1 validation catches duplicate email and dangling references", () => {
  const bad = {
    schemaVersion: 2,
    model: "member-hat-v1",
    members: [
      { id: "m-a", name: "Alice", email: "same@example.test", status: "active" },
      { id: "m-b", name: "Bob", email: "SAME@example.test", status: "active" },
    ],
    scrum: { productOwner: "m-a", scrumMaster: "m-b", developers: ["ghost"] },
    hats: {},
    assignments: [{ memberId: "ghost", hatId: "nope", kind: "primary", status: "active" }],
  };
  const result = validateTeamModel(loadTeamModel(bad));
  assert.ok(result.errors.some((e) => /同一邮箱/.test(e)), "应检出重复邮箱");
  assert.ok(result.errors.some((e) => /不存在的成员/.test(e)), "应检出悬空成员引用");
  assert.ok(result.errors.some((e) => /未定义的帽子/.test(e)), "应检出未定义帽子");
});

test("R4.2b member-based signing records memberId + snapshot responsibilities", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-r42b-"));
  const target = path.join(sandbox, "workspace");
  const roleIds = ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"];
  try {
    runCli([
      target,
      "--git-root=workspace",
      "--team-stage=core",
      "--no-worktrees",
      "--role.tl=Fowler",
      ...roleIds.map((id) => `--email.${id}=${id}@example.test`),
    ]);
    const store = path.join(target, ".team", "signoffs");
    const campaignId = fs.readdirSync(path.join(store, "campaigns"))[0].replace(".json", "");
    const notice = JSON.parse(fs.readFileSync(path.join(store, "notices", `${campaignId}.json`), "utf8"));
    const tool = path.join(target, "tools", "signoff.mjs");

    // 成员式签核：--member=tl（--role 亦兼容）
    execFileSync(process.execPath, [
      tool, "sign", `--campaign=${campaignId}`, "--member=tl", `--notice=${notice.digest}`,
    ], { cwd: target, encoding: "utf8" });

    const evDir = path.join(store, "events", campaignId);
    const evName = fs.readdirSync(evDir).find((n) => n.startsWith("EVT-TL-"));
    const ev = JSON.parse(fs.readFileSync(path.join(evDir, evName), "utf8"));
    assert.equal(ev.memberId, "tl");
    assert.equal(ev.member, "Fowler");            // 来自 Campaign 快照
    assert.equal(ev.email, "tl@example.test");
    assert.ok(ev.responsibilities.includes("hat:tl"));
    assert.ok(ev.responsibilities.includes("scrum:developer"));
    // Git 作者 === 快照身份（命令级身份）
    assert.match(
      git(target, ["log", "-1", "--format=%an <%ae>", "--", `.team/signoffs/events/${campaignId}/${evName}`]),
      /Fowler <tl@example\.test>/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("R4.3 team.mjs list and validate render the member-hat view", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-team-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--no-git", "--no-worktrees", "--role.tl=Fowler", "--email.tl=tl@x.dev"]);
    const tool = path.join(target, "tools", "team.mjs");
    const out = execFileSync(process.execPath, [tool, "list"], { cwd: target, encoding: "utf8" });
    assert.match(out, /成员：/);
    assert.match(out, /tl · Fowler <tl@x\.dev>/);
    assert.match(out, /hat:tl/);
    assert.match(out, /scrum:developer/);
    assert.match(out, /SM=sm/);
    const validated = execFileSync(process.execPath, [tool, "validate"], { cwd: target, encoding: "utf8" });
    assert.match(validated, /Validate: OK/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("R4.3b signoff resolves SM from v2 scrum.scrumMaster (not hardcoded sm)", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-r43b-sm-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--git-root=workspace", "--no-worktrees"]);
    const cfgFile = path.join(target, "00_项目导航", "roles.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    const v2 = {
      ...cfg,
      schemaVersion: 2,
      model: "member-hat-v1",
      members: [
        { id: "po-a", name: "Jobs", email: "po@example.test", status: "active" },
        { id: "sm-a", name: "Sutherland", email: "sm@example.test", status: "active" },
        { id: "dev-a", name: "Fowler", email: "tl@example.test", status: "active" },
      ],
      scrum: { productOwner: "po-a", scrumMaster: "sm-a", developers: ["dev-a"] },
      hats: { tl: { label: "TL" } },
      assignments: [{ memberId: "dev-a", hatId: "tl", kind: "primary", status: "active" }],
      roles: {},
      emails: {},
      roleDetails: [],
    };
    fs.writeFileSync(cfgFile, `${JSON.stringify(v2, null, 2)}\n`, "utf8");
    const tool = path.join(target, "tools", "signoff.mjs");

    // 传入 v2 的 SM（sm-a）应通过角色门禁；后续即使因 Python 审计不支持 v2 失败，
    // 错误也不应是“只能由角色 sm 执行”。
    assert.throws(
      () => execFileSync(process.execPath, [
        tool,
        "prepare",
        "--campaign=SIGN-R43B-001",
        "--actor=sm-a",
        "--target=V1.5",
        "--roles=all",
        "--coverage=BASELINE-V1.5",
        "--due=2099-07-04 18:00",
      ], { cwd: target, encoding: "utf8", stdio: "pipe" }),
      (error) => {
        const stderr = String(error.stderr || "");
        return error.status === 2 && !/本命令只能由角色/.test(stderr);
      },
    );

    // 旧硬编码 sm 现在应被明确拒绝（期望角色是 v2 中的 sm-a）。
    assert.throws(
      () => execFileSync(process.execPath, [
        tool,
        "prepare",
        "--campaign=SIGN-R43B-002",
        "--actor=sm",
        "--target=V1.5",
        "--roles=all",
        "--coverage=BASELINE-V1.5",
        "--due=2099-07-04 18:00",
      ], { cwd: target, encoding: "utf8", stdio: "pipe" }),
      (error) => {
        const stderr = String(error.stderr || "");
        return error.status === 2 && /本命令只能由角色 sm-a 执行/.test(stderr);
      },
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("R4.3b team.mjs add/assign migrates to v2 and enforces validate-before-write", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-r43b-team-write-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--no-git", "--no-worktrees", "--role.tl=Fowler", "--email.tl=tl@x.dev"]);
    const tool = path.join(target, "tools", "team.mjs");
    const cfgFile = path.join(target, "00_项目导航", "roles.config.json");

    const addOut = execFileSync(process.execPath, [
      tool,
      "add",
      "--member=devx",
      "--name=Dev X",
      "--email=devx@x.dev",
      "--status=active",
      "--developer",
    ], { cwd: target, encoding: "utf8" });
    assert.match(addOut, /成员 devx 入队/);
    assert.match(addOut, /CHG-\d+/);
    assert.match(addOut, /prepare --from-audit/);

    const assignOut = execFileSync(process.execPath, [
      tool,
      "assign",
      "--member=devx",
      "--hat=backend",
      "--kind=primary",
      "--status=active",
      "--label=Backend",
    ], { cwd: target, encoding: "utf8" });
    assert.match(assignOut, /成员 devx 新增或调整帽子 backend/);
    assert.match(assignOut, /CHG-\d+/);

    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    assert.equal(cfg.schemaVersion, 2);
    assert.equal(cfg.model, "member-hat-v1");
    assert.ok(cfg.members.some((m) => m.id === "devx" && m.email === "devx@x.dev"));
    assert.ok(cfg.assignments.some((a) => a.memberId === "devx" && a.hatId === "backend"));
    assert.ok(cfg.hats.backend);

    assert.throws(
      () => execFileSync(process.execPath, [
        tool,
        "add",
        "--member=devy",
        "--name=Dev Y",
        "--email=devx@x.dev",
      ], { cwd: target, encoding: "utf8", stdio: "pipe" }),
      (error) => error.status === 2,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("R4.3b generate_doc_index.py works with v2 member-hat config", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-r43b-py-v2-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--no-git", "--no-worktrees"]);
    const cfgFile = path.join(target, "00_项目导航", "roles.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    const v2 = {
      ...cfg,
      schemaVersion: 2,
      model: "member-hat-v1",
      members: [
        { id: "po-a", name: "Jobs", email: "po@example.test", status: "active" },
        { id: "sm-a", name: "Sutherland", email: "sm@example.test", status: "active" },
        { id: "dev-a", name: "Fowler", email: "dev@example.test", status: "active" },
      ],
      scrum: { productOwner: "po-a", scrumMaster: "sm-a", developers: ["dev-a"] },
      hats: { tl: { label: "TL" } },
      assignments: [{ memberId: "dev-a", hatId: "tl", kind: "primary", status: "active" }],
      roles: {},
      emails: {},
      roleDetails: [],
    };
    fs.writeFileSync(cfgFile, `${JSON.stringify(v2, null, 2)}\n`, "utf8");

    const py = path.join(target, "tools", "generate_doc_index.py");
    const python = process.env.PYTHON || "python";
    const pyOut = execFileSync(python, [py], {
      cwd: target,
      encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "cp1252" },
    });
    assert.match(pyOut, /\[OK\] 已收录/);

    const audit = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "文档索引", "07_签核状态.json"), "utf8"),
    );
    assert.equal(typeof audit.pendingAssignments, "object");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("RC6 team mutations create auditable changes and v2 teams can approve a code repo", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-rc6-team-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--initial-signoff=off", "--no-worktrees"]);
    const teamTool = path.join(target, "tools", "team.mjs");
    const runTeam = (args) => execFileSync(process.execPath, [teamTool, ...args], {
      cwd: target, encoding: "utf8",
    });
    const addOut = runTeam([
      "add", "--member=devx", "--name=Dev X", "--email=devx@example.test",
      "--status=active", "--developer",
    ]);
    const addChange = /CHG-\d+/.exec(addOut)?.[0];
    assert.ok(addChange);
    const assignOut = runTeam([
      "assign", "--member=devx", "--hat=backend", "--status=active",
    ]);
    const assignChange = /CHG-\d+/.exec(assignOut)?.[0];
    assert.ok(assignChange);
    assert.notEqual(addChange, assignChange);

    const python = process.env.PYTHON || "python";
    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    const audit = JSON.parse(fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "07_签核状态.json"),
      "utf8",
    ));
    assert.deepEqual(
      new Set(audit.pendingAssignments.devx),
      new Set(["CHG-100", addChange, assignChange]),
    );
    assert.match(
      fs.readFileSync(path.join(target, "00_项目导航", "02_角色与联系方式.md"), "utf8"),
      /Dev X.*hat:backend/,
    );

    const repoTool = path.join(target, "tools", "setup-code-repo.mjs");
    const runRepo = (args) => execFileSync(process.execPath, [repoTool, ...args], {
      cwd: target, encoding: "utf8",
    });
    runRepo(["propose", "--strategy=create", "--repo=v2-app"]);
    runRepo(["approve", "--decision=REPO-001", "--actor=po"]);
    runRepo(["approve", "--decision=REPO-001", "--actor=tl"]);
    assert.match(runRepo(["check", "--decision=REPO-001"]), /READY/);
    runRepo(["apply", "--decision=REPO-001", "--yes"]);
    assert.equal(
      git(path.join(target, "10_代码仓库", "v2-app"), ["rev-parse", "--is-inside-work-tree"]),
      "true",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("RC6 setup-code-repo rejects every non-empty create target", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-rc6-nonempty-"));
  const target = path.join(sandbox, "workspace");
  try {
    runCli([target, "--initial-signoff=off", "--no-worktrees"]);
    const codeDir = path.join(target, "10_代码仓库", "occupied");
    fs.mkdirSync(codeDir, { recursive: true });
    fs.writeFileSync(path.join(codeDir, "existing-secret.txt"), "do not absorb\n", "utf8");
    fs.appendFileSync(path.join(target, ".gitignore"), "\n10_代码仓库/occupied/\n", "utf8");
    git(target, ["add", ".gitignore"]);
    git(target, ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "test: ignore occupied"]);

    const tool = path.join(target, "tools", "setup-code-repo.mjs");
    const run = (args) => execFileSync(process.execPath, [tool, ...args], {
      cwd: target, encoding: "utf8",
    });
    run(["propose", "--strategy=create", "--repo=occupied"]);
    run(["approve", "--decision=REPO-001", "--actor=po"]);
    run(["approve", "--decision=REPO-001", "--actor=tl"]);
    assert.throws(
      () => run(["check", "--decision=REPO-001"]),
      (error) => error.status === 2 && /目标目录非空/.test(String(error.stdout)),
    );
    assert.equal(fs.readFileSync(path.join(codeDir, "existing-secret.txt"), "utf8"), "do not absorb\n");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("RC6 historical Campaign and Closure survive later member identity changes", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-rc6-history-"));
  const target = path.join(sandbox, "workspace");
  const roleIds = ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"];
  try {
    runCli([
      target, "--team-stage=core", "--no-worktrees",
      ...roleIds.map((id) => `--email.${id}=${id}@example.test`),
    ]);
    const store = path.join(target, ".team", "signoffs");
    const campaignId = fs.readdirSync(path.join(store, "campaigns"))[0].replace(".json", "");
    const notice = JSON.parse(fs.readFileSync(
      path.join(store, "notices", `${campaignId}.json`),
      "utf8",
    ));
    const tool = path.join(target, "tools", "signoff.mjs");
    for (const memberId of ["po", "sm", "tl"]) {
      execFileSync(process.execPath, [
        tool, "sign", `--campaign=${campaignId}`, `--member=${memberId}`,
        `--notice=${notice.digest}`,
      ], { cwd: target, encoding: "utf8" });
    }
    execFileSync(process.execPath, [
      tool, "close", `--campaign=${campaignId}`, "--actor=sm",
    ], { cwd: target, encoding: "utf8" });

    const teamTool = path.join(target, "tools", "team.mjs");
    for (const [memberId, email] of [
      ["tl", "tl-new@example.test"],
      ["sm", "sm-new@example.test"],
    ]) {
      execFileSync(process.execPath, [
        teamTool, "update", `--member=${memberId}`, `--email=${email}`,
      ], { cwd: target, encoding: "utf8" });
    }
    const status = execFileSync(process.execPath, [
      tool, "status", `--campaign=${campaignId}`,
    ], { cwd: target, encoding: "utf8" });
    assert.match(status, /tl .*: VALID/);
    assert.match(status, /Closure: CLOSED/);

    const python = process.env.PYTHON || "python";
    execFileSync(python, [path.join(target, "tools", "generate_doc_index.py")], {
      cwd: target,
      encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    const audit = JSON.parse(fs.readFileSync(
      path.join(target, "00_项目导航", "文档索引", "07_签核状态.json"),
      "utf8",
    ));
    assert.equal(audit.pendingCount, 0);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

// ── v1.1.0-rc.1: 团队档位与启动路线 ──

test("v1.1.0 full-7 default generates v2 roles.config.json with backward-compatible v1 fields", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-full7-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([target, "--no-git", "--no-worktrees"]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    // v2 格式
    assert.equal(cfg.schemaVersion, 2);
    assert.equal(cfg.model, "member-hat-v1");
    assert.equal(cfg.teamProfile, "full-7");
    assert.equal(cfg.startupMode, "discovery-first");
    // 兼容字段
    assert.ok(cfg.roles && Object.keys(cfg.roles).length === 7);
    assert.ok(cfg.emails && Object.keys(cfg.emails).length === 7);
    assert.ok(Array.isArray(cfg.roleDetails) && cfg.roleDetails.length === 7);
    // v2 字段
    assert.ok(Array.isArray(cfg.members) && cfg.members.length === 7);
    assert.ok(cfg.scrum);
    assert.ok(cfg.hats);
    assert.ok(Array.isArray(cfg.assignments));
    // teamStage 兼容
    assert.equal(cfg.teamStage, "full-7");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 core + discovery-first produces 3 active members and 0 worktrees", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-core-df-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=discovery-first",
      "--team-profile=core",
      "--no-git",
      "--no-worktrees",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(cfg.teamProfile, "core");
    assert.equal(cfg.startupMode, "discovery-first");
    const active = cfg.roleDetails.filter((r) => r.status === "active");
    assert.equal(active.length, 3);
    assert.deepEqual(
      active.map((r) => r.id).sort(),
      ["po", "sm", "tl"],
    );
    // discovery-first 模式不创建 worktree
    assert.equal(cfg.setupWorktrees, false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 core + delivery-ready produces 3 active and 1 worktree (TL)", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-core-dr-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=core",
      "--repo=core-dr-app",
      "--initial-signoff=off",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(cfg.teamProfile, "core");
    assert.equal(cfg.startupMode, "delivery-ready");
    const active = cfg.roleDetails.filter((r) => r.status === "active");
    assert.equal(active.length, 3);
    // core 档只有 TL 有 worktree（PO/SM 是管理角色不创建 worktree）
    const wtRoles = cfg.roleDetails.filter((r) => r.worktree);
    assert.equal(wtRoles.length, 1);
    assert.equal(wtRoles[0].id, "tl");
    // 双仓模式：文档仓和代码仓是独立 Git
    assert.equal(
      git(target, ["rev-parse", "--is-inside-work-tree"]).trim(),
      "true",
      "doc repo should be a git repo",
    );
    const codeRepo = path.join(target, "10_代码仓库", "core-dr-app");
    assert.equal(
      git(codeRepo, ["rev-parse", "--is-inside-work-tree"]).trim(),
      "true",
      "code repo should be a separate git repo",
    );
    // 文档仓的 Git 不包含代码仓目录
    assert.match(
      fs.readFileSync(path.join(target, ".gitignore"), "utf8"),
      /10_代码仓库\/core-dr-app\//,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 balanced-5 profile has 5 members with correct worktree count", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-bal5-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=balanced-5",
      "--repo=bal5-app",
      "--initial-signoff=off",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(cfg.teamProfile, "balanced-5");
    assert.equal(cfg.roleDetails.length, 5);
    // balanced-5: po, sm, tl, beqa, fefs
    // PO/SM 不创建 worktree；TL/beqa/fefs 创建 worktree → 3 worktrees
    const wtRoles = cfg.roleDetails.filter((r) => r.worktree);
    assert.equal(wtRoles.length, 3);
    assert.deepEqual(
      wtRoles.map((r) => r.id).sort(),
      ["beqa", "fefs", "tl"],
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 lean-3 profile has 3 members with 2 worktrees", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-lean3-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=lean-3",
      "--repo=lean3-app",
      "--initial-signoff=off",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(cfg.teamProfile, "lean-3");
    assert.equal(cfg.roleDetails.length, 3);
    // lean-3: product-coach (PO+SM), tech-builder (TL+backend+qa), delivery-builder (frontend+fs+devops)
    // product-coach 不创建 worktree（只承担 PO/SM 管理责任）
    // tech-builder 和 delivery-builder 创建 worktree → 2 worktrees
    const wtRoles = cfg.roleDetails.filter((r) => r.worktree);
    assert.equal(wtRoles.length, 2);
    assert.deepEqual(
      wtRoles.map((r) => r.id).sort(),
      ["delivery-builder", "tech-builder"],
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 lean-2 profile has 2 members with 2 worktrees", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-lean2-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=lean-2",
      "--repo=lean2-app",
      "--initial-signoff=off",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    assert.equal(cfg.teamProfile, "lean-2");
    assert.equal(cfg.roleDetails.length, 2);
    // lean-2: lead-a (PO+TL+backend), lead-b (SM+frontend+fs+devops+qa)
    // 两个成员都承担编码帽子，都创建 worktree → 2 worktrees
    const wtRoles = cfg.roleDetails.filter((r) => r.worktree);
    assert.equal(wtRoles.length, 2);
    assert.deepEqual(
      wtRoles.map((r) => r.id).sort(),
      ["lead-a", "lead-b"],
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 --team-stage and --preset backward compatibility", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-compat-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--team-stage=core",
      "--preset=tech",
      "--no-git",
      "--no-worktrees",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    // --team-stage=core maps to teamProfile=core
    assert.equal(cfg.teamProfile, "core");
    assert.equal(cfg.teamStage, "core");
    // --preset=tech maps to namePreset=tech (preset field stays for compat)
    assert.equal(cfg.preset, "tech");
    // core profile: 3 active
    const active = cfg.roleDetails.filter((r) => r.status === "active");
    assert.equal(active.length, 3);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 lean-3 email format uses memberId with hyphens converted to underscores", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-email-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=lean-3",
      "--repo=email-app",
      "--no-git",
      "--no-worktrees",
    ]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "00_项目导航", "roles.config.json"), "utf8"),
    );
    // lean-3 member IDs: product-coach, tech-builder, delivery-builder
    // Email should use hyphens converted to underscores
    const coach = cfg.roleDetails.find((r) => r.id === "product-coach");
    assert.ok(coach, "product-coach member should exist");
    assert.match(coach.email, /product_coach@/);
    const builder = cfg.roleDetails.find((r) => r.id === "tech-builder");
    assert.ok(builder, "tech-builder member should exist");
    assert.match(builder.email, /tech_builder@/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 delivery-ready dual-repo: doc repo and code repo have independent Git histories", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-dualrepo-"));
  const target = path.join(sandbox, "project");
  try {
    runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=balanced-5",
      "--repo=dual-app",
      "--initial-signoff=off",
    ]);
    const codeRepo = path.join(target, "10_代码仓库", "dual-app");
    // Both repos should be git repos
    assert.equal(git(target, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");
    assert.equal(git(codeRepo, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");
    // They should have different commit hashes (independent histories)
    const docHead = git(target, ["rev-parse", "HEAD"]);
    const codeHead = git(codeRepo, ["rev-parse", "HEAD"]);
    assert.notEqual(docHead, codeHead, "doc and code repos should have independent HEADs");
    // Code repo should have sprint branch
    const branches = git(codeRepo, ["branch", "--format=%(refname:short)"]).split(/\r?\n/);
    assert.ok(branches.includes("main"));
    assert.ok(branches.some((b) => b.startsWith("sprint-")));
    // Worktrees should exist in code repo's TeamWork/
    const teamworkDir = path.join(codeRepo, "TeamWork");
    assert.ok(fs.existsSync(teamworkDir), "TeamWork directory should exist in code repo");
    const wtDirs = fs.readdirSync(teamworkDir).filter((d) =>
      fs.statSync(path.join(teamworkDir, d)).isDirectory(),
    );
    assert.ok(wtDirs.length >= 1, "at least one worktree directory should exist");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v1.1.0 delivery-ready initial signoff runs in the doc repo", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-v11-signoff-"));
  const target = path.join(sandbox, "project");
  const roleIds = ["po", "sm", "tl", "midbe", "srfe", "midfe", "fs"];
  try {
    const output = runCli([
      target,
      "--startup-mode=delivery-ready",
      "--team-profile=full-7",
      "--repo=signoff-app",
      ...roleIds.map((id) => `--email.${id}=${id}@example.test`),
    ]);
    // 首签应发起在文档仓（项目根），不是代码仓
    assert.match(output, /首签已发起：SIGN-\d{8}-001/);
    const campaignDir = path.join(target, ".team", "signoffs", "campaigns");
    assert.ok(fs.existsSync(campaignDir), "signoff campaigns should be in doc repo (project root)");
    // 代码仓不应有 .team/signoffs
    const codeRepoSignoffs = path.join(target, "10_代码仓库", "signoff-app", ".team", "signoffs");
    assert.equal(
      fs.existsSync(codeRepoSignoffs),
      false,
      "code repo should not have signoff data",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
