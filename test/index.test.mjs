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

  try {
    const output = runCli([target, "--dry-run", "--repo=dry-app"]);

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

    const teamWork = path.join(repo, "TeamWork");
    if (fs.existsSync(teamWork)) {
      const entries = fs
        .readdirSync(teamWork, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      assert.equal(entries.length, 0, "TeamWork must contain no role subdirs");
    }

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
