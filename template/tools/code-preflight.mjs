#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTeamModel } from "./lib/team-model.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 2;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function git(repo, args, allowFailure = false) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return { status: result.status, value: (result.stdout || "").trim() };
}

function valueArg(args, name) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

function readIdentity(repo, key) {
  const worktree = git(repo, ["config", "--worktree", "--get", key], true);
  if (worktree.status === 0 && worktree.value) return worktree.value;
  return git(repo, ["config", "--get", key], true).value;
}

function resolveBase(repo, base) {
  for (const ref of [base, `origin/${base}`]) {
    if (git(repo, ["rev-parse", "--verify", "--quiet", ref], true).status === 0) return ref;
  }
  return "";
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("用法: node tools/code-preflight.mjs --repo=<path> --member=<memberId> --base=<sprint-x> [--allow-base]");
    return;
  }

  const repoArg = valueArg(args, "repo");
  const memberId = valueArg(args, "member");
  const base = valueArg(args, "base");
  if (!repoArg || !memberId || !base) {
    fail("必须提供 --repo、--member 和 --base");
    return;
  }

  const configFile = path.join(projectRoot, "00_项目导航", "roles.config.json");
  if (!fs.existsSync(configFile)) {
    fail(`找不到角色事实源：${configFile}`);
    return;
  }
  const model = loadTeamModel(JSON.parse(fs.readFileSync(configFile, "utf8")));
  const member = model.members.find((item) => item.id === memberId && item.status === "active");
  if (!member) {
    fail(`找不到 active 成员：${memberId}`);
    return;
  }

  const repo = path.resolve(projectRoot, repoArg);
  if (!fs.existsSync(repo) || git(repo, ["rev-parse", "--is-inside-work-tree"], true).value !== "true") {
    fail(`不是可用 Git 工作区：${repo}`);
    return;
  }
  pass(`Git 工作区：${repo}`);

  const branch = git(repo, ["branch", "--show-current"]).value;
  if (!branch) fail("当前处于 detached HEAD");
  else if (!args.includes("--allow-base") && [base, "main", "master"].includes(branch)) {
    fail(`当前分支 ${branch} 是集成/稳定分支，请切换到 feature 分支`);
  } else if (!args.includes("--allow-base") && !/^feature\/sprint-[^/]+\/.+/.test(branch)) {
    fail(`当前分支 ${branch} 不符合 feature/sprint-<编号>/<主题> 命名`);
  } else {
    pass(`当前分支：${branch}`);
  }

  const baseRef = resolveBase(repo, base);
  if (!baseRef) fail(`找不到基线分支：${base} 或 origin/${base}`);
  else if (git(repo, ["merge-base", "--is-ancestor", baseRef, "HEAD"], true).status !== 0) {
    fail(`HEAD 不是 ${baseRef} 的后代，请从正确基线重建或同步分支`);
  } else pass(`基线祖先关系：${baseRef} -> HEAD`);

  const actualName = readIdentity(repo, "user.name");
  const actualEmail = readIdentity(repo, "user.email");
  if (actualName !== member.name) fail(`Git 姓名不匹配：期望 ${member.name}，实际 ${actualName || "空"}`);
  else pass(`Git 姓名：${actualName}`);
  if (actualEmail.toLowerCase() !== String(member.email).toLowerCase()) {
    fail(`Git 邮箱不匹配：期望 ${member.email}，实际 ${actualEmail || "空"}`);
  } else pass(`Git 邮箱：${actualEmail}`);

  if (!process.exitCode) console.log("READY: 代码任务可以开工。");
}

main();
