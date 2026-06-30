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
            "01_Sprint流程监控台.md",
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
      path.join(target, "03_迭代运行", "Sprint-0-启动", "01_Sprint流程监控台.md"),
      "utf8",
    );
    assert.ok(monitor.includes("确认 E01 现仓清单、权限、基线分支和角色工作区"));
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

test("generates Sprint flow monitor with named role actions and no stale progress file", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-flow-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--preset=studio", "--repo=flow-app", "--no-git"]);

    const sprintDir = path.join(target, "03_迭代运行", "Sprint-0-启动");
    const monitor = path.join(sprintDir, "01_Sprint流程监控台.md");
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

    assert.ok(fs.existsSync(monitor), "Sprint flow monitor should exist");
    assert.equal(fs.existsSync(oldProgress), false, "old progress table should not be generated");
    assert.ok(fs.existsSync(coachGuide), "SM coaching decision guide should exist");
    assert.ok(fs.existsSync(responseTemplate), "SM standard response template should exist");

    const content = fs.readFileSync(monitor, "utf8");
    assert.ok(content.includes("Muse（PO）"), "role action board should use preset names");
    assert.ok(content.includes("Bridge（FS/DevOps）"), "coding role should be rendered");
    assert.ok(content.includes("B01 产品愿景"), "Sprint 0 role actions should be prefilled");
    assert.ok(content.includes("创建 E01/E02"), "FS action should follow --no-git mode");
    assert.ok(content.includes("当前 WIP（成员站会前自填）"));
    assert.ok(content.includes("| CI 红灯 | 超过 2 小时 | ⚪ |"));
    assert.ok(content.includes("铁律：Sprint 结束后归档本监控台"));
    assert.ok(content.includes("## 3. 依赖时间线与并行泳道"));
    assert.ok(content.includes("G1 Sprint 1 工程准入"));
    assert.ok(content.includes("flowchart LR"));
    assert.ok(content.includes("等待输入"), "action classification should be present");
    assert.ok(
      content.includes("创建 Git 仓库和角色 worktree"),
      "--no-git should keep code collaboration flow pending",
    );
    assert.equal(
      /\{\{ROLE_ACTION_BOARD\}\}|\{\{CREATED_DATE\}\}|\{\{TEAMWORK_[A-Z_]+\}\}/.test(content),
      false,
    );

    const ledgerDir = path.join(target, "00_项目导航", "06_团队输入输出总表");
    const ledgerIndex = fs.readFileSync(path.join(ledgerDir, "00_索引.md"), "utf8");
    const ledgerA = fs.readFileSync(path.join(ledgerDir, "A_项目管理.md"), "utf8");
    const ledgerE = fs.readFileSync(path.join(ledgerDir, "E_发布运维.md"), "utf8");
    assert.ok(ledgerIndex.includes("[A_项目管理.md](A_项目管理.md)"), "index should link to A");
    assert.ok(ledgerIndex.includes("owner: SM"), "index frontmatter should declare owner");
    assert.ok(ledgerA.includes("| A07 | P0 | Sprint 0 流程监控台 |"));
    assert.ok(ledgerA.includes("| A08 | P1 | 团队协作交互协议与 SM 播报模板 |"));
    assert.ok(ledgerA.includes("| A09 | P0 | 文档协作与并发控制规范"));
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
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("v0.4.0 splits 06 ledger into per-role tables and emits CODEOWNERS", () => {
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
