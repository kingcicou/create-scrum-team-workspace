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

test("generates 知识库/运维与环境/README.md with substituted placeholders", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scrum-workspace-test-ops-"));
  const target = path.join(sandbox, "project");

  try {
    runCli([target, "--repo=ops-app", "--no-git", "--no-worktrees"]);

    const readme = path.join(target, "知识库", "运维与环境", "README.md");
    assert.ok(fs.existsSync(readme), "ops knowledge README should exist");

    const content = fs.readFileSync(readme, "utf8");
    assert.ok(content.includes("ops-app"), "REPO_NAME placeholder should be substituted");
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

    assert.ok(fs.existsSync(monitor), "Sprint flow monitor should exist");
    assert.equal(fs.existsSync(oldProgress), false, "old progress table should not be generated");
    assert.ok(fs.existsSync(coachGuide), "SM coaching decision guide should exist");

    const content = fs.readFileSync(monitor, "utf8");
    assert.ok(content.includes("Muse（PO）"), "role action board should use preset names");
    assert.ok(content.includes("Bridge（FS/DevOps）"), "coding role should be rendered");
    assert.ok(content.includes("B01 产品愿景"), "Sprint 0 role actions should be prefilled");
    assert.ok(content.includes("创建 E01/E02"), "FS action should follow --no-git mode");
    assert.ok(content.includes("当前 WIP（成员站会前自填）"));
    assert.ok(content.includes("| CI 红灯 | 超过 2 小时 | ⚪ |"));
    assert.ok(content.includes("铁律：Sprint 结束后归档本监控台"));
    assert.ok(content.includes("等待输入"), "action classification should be present");
    assert.ok(
      content.includes("创建 Git 仓库和角色 worktree"),
      "--no-git should keep code collaboration flow pending",
    );
    assert.equal(
      /\{\{ROLE_ACTION_BOARD\}\}|\{\{CREATED_DATE\}\}|\{\{TEAMWORK_[A-Z_]+\}\}/.test(content),
      false,
    );

    const outputLedger = fs.readFileSync(
      path.join(target, "00_项目导航", "06_团队输入输出总表.md"),
      "utf8",
    );
    assert.ok(
      outputLedger.includes("待手工创建角色 worktree"),
      "--no-git should render the manual TeamWork path",
    );
    assert.ok(outputLedger.includes("参考 08_团队开发协作SOP.md §4.1 手工创建"));
    assert.ok(outputLedger.includes("| A07 | P0 | Sprint 0 流程监控台 |"));
    assert.equal(/\{\{TEAMWORK_[A-Z_]+\}\}/.test(outputLedger), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
