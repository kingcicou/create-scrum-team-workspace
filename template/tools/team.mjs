#!/usr/bin/env node
// 团队视图与校验（member-hat-v1）。
// list / validate：只读，展示与校验成员-帽子模型（旧配置自动投影）。
// add / assign / update / set-status / unassign：维护成员-帽子事实与签核变化。
// 约束：写前/写后都 validate；成员身份仅按 member.id，不按姓名/邮箱自动合并。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadTeamModel,
  validateTeamModel,
  memberResponsibilities,
  activeMemberIds,
} from "./lib/team-model.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_MEMBER_STATUS = new Set(["active", "optional", "planned", "inactive"]);
const VALID_ASSIGN_STATUS = new Set(["active", "optional", "planned", "inactive"]);
const ROLE_MANUAL = path.join(PROJECT_ROOT, "00_项目导航", "11_角色行动手册.md");
const TASK_BOARD = path.join(
  PROJECT_ROOT,
  "03_迭代运行",
  "Sprint-0-启动",
  "01_Sprint任务表与流程看板.md",
);
const CONTACTS = path.join(PROJECT_ROOT, "00_项目导航", "02_角色与联系方式.md");

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const [command = "list", ...rest] = argv;
  const options = {};
  for (const item of rest) {
    if (!item.startsWith("--")) fail(`未知参数：${item}`);
    const [key, ...value] = item.slice(2).split("=");
    options[key] = value.length ? value.join("=") : true;
  }
  return { command, options };
}

function readConfig() {
  const file = path.join(PROJECT_ROOT, "00_项目导航", "roles.config.json");
  if (!fs.existsSync(file)) fail(`缺少角色事实源：${file}`);
  return { file, config: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function writeConfig(file, config) {
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function git(args, allowFailure = false, identity = null) {
  const scoped = identity
    ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`]
    : [];
  const result = spawnSync("git", ["-C", PROJECT_ROOT, ...scoped, ...args], { encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(" ")} 失败：${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function isGitRepo() {
  return git(["rev-parse", "--is-inside-work-tree"], true).status === 0;
}

function ensureCleanSource() {
  if (!isGitRepo()) return;
  const dirty = git([
    "status", "--porcelain", "--",
    ":!00_项目导航/文档索引",
  ]).stdout.trim();
  if (dirty) fail(`团队变更要求干净事实源；请先提交或撤销：\n${dirty}`);
}

function smIdentity(config) {
  const model = loadTeamModel(config);
  const member = model.members.find((item) => item.id === model.scrum.scrumMaster);
  if (!member?.name || !member?.email) fail("团队模型缺少有效 Scrum Master 身份。");
  return member;
}

function commitTeamChange(config, message, files) {
  if (!isGitRepo()) {
    console.warn("[WARN] 当前不是 Git 文档仓；已写文件但未形成可追溯提交。");
    return;
  }
  const relative = files
    .filter((file) => fs.existsSync(file))
    .map((file) => path.relative(PROJECT_ROOT, file).split(path.sep).join("/"));
  git(["add", "--", ...relative]);
  const staged = git(["diff", "--cached", "--quiet"], true);
  if (staged.status === 0) fail("团队变更没有产生可提交差异。");
  git(["commit", "-m", message, "--", ...relative], false, smIdentity(config));
}

function nextBaseline(value) {
  const match = String(value || "1.0").match(/(\d+)\.(\d+)/);
  if (!match) return "1.1";
  return `${match[1]}.${Number(match[2]) + 1}`;
}

function registerChange(memberIds, description) {
  if (!fs.existsSync(ROLE_MANUAL)) fail(`缺少角色行动手册：${ROLE_MANUAL}`);
  let text = fs.readFileSync(ROLE_MANUAL, "utf8");
  const current = /^version:\s*([^\r\n]+)/m.exec(text)?.[1]?.trim() || "1.0";
  const baseline = nextBaseline(current);
  const ids = [...text.matchAll(/\|\s*CHG-(\d+)\s*\|/g)].map((match) => Number(match[1]));
  const next = (ids.length ? Math.max(...ids) : 0) + 10;
  const changeId = `CHG-${next}`;
  const row = `| ${changeId} | V${baseline} | ${new Date().toISOString().slice(0, 10)} | ${description.replaceAll("|", "/")} | ${memberIds.join(",")} |`;
  const lines = text.split(/\r?\n/);
  let insertAt = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\|\s*CHG-\d+\s*\|/.test(lines[index])) insertAt = index + 1;
  }
  if (insertAt < 0) fail("角色行动手册缺少 Change ID 表，无法登记签核变化。");
  lines.splice(insertAt, 0, row);
  text = lines.join("\n").replace(/^version:\s*[^\r\n]+/m, `version: ${baseline}`);
  fs.writeFileSync(ROLE_MANUAL, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return { changeId, baseline };
}

function activeMemberFor(model, selectors) {
  const active = new Set(activeMemberIds(model));
  for (const selector of selectors) {
    if (selector === "po" && active.has(model.scrum.productOwner)) return model.scrum.productOwner;
    if (selector === "sm" && active.has(model.scrum.scrumMaster)) return model.scrum.scrumMaster;
    const assignment = model.assignments.find(
      (item) => item.hatId === selector
        && item.status === "active"
        && active.has(item.memberId),
    );
    if (assignment) return assignment.memberId;
  }
  return null;
}

function syncTeamViews(config) {
  const model = loadTeamModel(config);
  const members = Object.fromEntries(model.members.map((member) => [member.id, member]));
  const ownerSelectors = {
    T01: ["po"], T02: ["sm"], T03: ["tl"], T04: ["backend"],
    T05: ["ux", "frontend"], T06: ["qa", "frontend"], T07: ["devops", "fs", "tl"],
  };
  const reviewerSelectors = {
    T01: ["sm"], T02: ["po"], T03: ["po"], T04: ["tl"],
    T05: ["tl"], T06: ["ux", "frontend", "tl"], T07: ["tl"],
  };
  const label = (id) => id && members[id] ? `${members[id].name} (${id})` : "待分配";

  if (fs.existsSync(TASK_BOARD)) {
    const lines = fs.readFileSync(TASK_BOARD, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\|\s*T0[1-7]\s*\|/.test(lines[index])) continue;
      const cells = lines[index].slice(1, -1).split("|").map((cell) => cell.trim());
      const taskId = cells[0];
      cells[5] = label(activeMemberFor(model, ownerSelectors[taskId] || []));
      cells[7] = label(activeMemberFor(model, reviewerSelectors[taskId] || []));
      lines[index] = `| ${cells.join(" | ")} |`;
    }
    fs.writeFileSync(TASK_BOARD, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  }

  if (fs.existsSync(CONTACTS)) {
    const start = "<!-- TEAM-MODEL:START -->";
    const end = "<!-- TEAM-MODEL:END -->";
    const rows = model.members.map((member) => {
      const responsibilities = memberResponsibilities(model, member.id).join(", ") || "—";
      return `| ${member.id} | ${member.name} | ${member.email} | ${member.status} | ${responsibilities} |`;
    });
    const block = [
      start,
      "## 当前成员与帽子（自动同步）",
      "",
      "| Member ID | 姓名 | 邮箱 | 状态 | Scrum责任/工程帽子 |",
      "|---|---|---|---|---|",
      ...rows,
      end,
    ].join("\n");
    let text = fs.readFileSync(CONTACTS, "utf8");
    const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
    text = pattern.test(text) ? text.replace(pattern, block) : `${text.trimEnd()}\n\n${block}\n`;
    fs.writeFileSync(CONTACTS, text, "utf8");
  }
  return [TASK_BOARD, CONTACTS];
}

function isV2(config) {
  return config?.schemaVersion === 2 && config?.model === "member-hat-v1";
}

function toWritableV2(config) {
  const model = loadTeamModel(config);
  return {
    ...config,
    schemaVersion: 2,
    model: "member-hat-v1",
    members: model.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      status: m.status || "active",
    })),
    scrum: {
      productOwner: model.scrum.productOwner ?? null,
      scrumMaster: model.scrum.scrumMaster ?? null,
      developers: [...(model.scrum.developers || [])],
    },
    hats: { ...(model.hats || {}) },
    assignments: model.assignments.map((a) => ({
      memberId: a.memberId,
      hatId: a.hatId,
      kind: a.kind || "primary",
      status: a.status || "active",
    })),
    // 迁移后不再把 legacy roles/emails/roleDetails 当事实源。
    roles: {},
    emails: {},
    roleDetails: [],
  };
}

function validatedModelOrFail(config, stage) {
  const model = loadTeamModel(config);
  const { errors, warnings } = validateTeamModel(model);
  for (const w of warnings) console.warn(`[WARN] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[ERROR] ${e}`);
    fail(`${stage}失败：团队模型未通过校验（${errors.length} 个错误）。`);
  }
  return model;
}

function requireOption(options, key, label) {
  const value = String(options[key] || "").trim();
  if (!value) fail(`${label} 必填：--${key}=...`);
  return value;
}

function parseStatus(value, allowSet, label) {
  const status = String(value || "active").trim().toLowerCase();
  if (!allowSet.has(status)) {
    fail(`${label} 非法：${status}（允许：${[...allowSet].join("/")}）`);
  }
  return status;
}

function addMember(config, options) {
  const memberId = requireOption(options, "member", "成员ID");
  const name = requireOption(options, "name", "成员姓名");
  const email = requireOption(options, "email", "成员邮箱");
  const status = parseStatus(options.status, VALID_MEMBER_STATUS, "成员状态");

  if ((config.members || []).some((m) => m.id === memberId)) {
    fail(`成员已存在：${memberId}（禁止按姓名/邮箱自动合并，请显式选择新ID）。`);
  }

  config.members.push({ id: memberId, name, email, status });

  // 可选地把新成员挂入 scrum 责任。
  if (options.po) config.scrum.productOwner = memberId;
  if (options.sm) config.scrum.scrumMaster = memberId;
  if (options.developer && !config.scrum.developers.includes(memberId)) {
    config.scrum.developers.push(memberId);
  }

  return memberId;
}

function assignHat(config, options) {
  const memberId = requireOption(options, "member", "成员ID");
  const hatId = requireOption(options, "hat", "帽子ID");
  const kind = String(options.kind || "primary").trim() || "primary";
  const status = parseStatus(options.status, VALID_ASSIGN_STATUS, "assignment状态");

  if (!(config.members || []).some((m) => m.id === memberId)) {
    fail(`assign 失败：成员不存在 ${memberId}`);
  }

  if (!config.hats[hatId]) {
    config.hats[hatId] = { label: String(options.label || hatId) };
  }

  const existed = (config.assignments || []).find(
    (a) => a.memberId === memberId && a.hatId === hatId,
  );
  let changed = false;
  if (existed) {
    changed = existed.kind !== kind || existed.status !== status;
    existed.kind = kind;
    existed.status = status;
  } else {
    config.assignments.push({ memberId, hatId, kind, status });
    changed = true;
  }

  return { memberId, hatId, changed };
}

function updateMember(config, options) {
  const memberId = requireOption(options, "member", "成员ID");
  const member = (config.members || []).find((item) => item.id === memberId);
  if (!member) fail(`成员不存在：${memberId}`);
  const before = { ...member };
  if (options.name !== undefined) member.name = requireOption(options, "name", "成员姓名");
  if (options.email !== undefined) member.email = requireOption(options, "email", "成员邮箱");
  if (options.status !== undefined) {
    member.status = parseStatus(options.status, VALID_MEMBER_STATUS, "成员状态");
  }
  const changed = ["name", "email", "status"].some((key) => before[key] !== member[key]);
  return { memberId, changed, before, after: { ...member } };
}

function setMemberStatus(config, options) {
  requireOption(options, "status", "成员状态");
  return updateMember(config, options);
}

function unassignHat(config, options) {
  const memberId = requireOption(options, "member", "成员ID");
  const hatId = requireOption(options, "hat", "帽子ID");
  const index = (config.assignments || []).findIndex(
    (item) => item.memberId === memberId && item.hatId === hatId,
  );
  if (index < 0) fail(`assignment 不存在：${memberId} -> ${hatId}`);
  const [removed] = config.assignments.splice(index, 1);
  return { memberId, hatId, removed };
}

function describeMutation(command, result) {
  if (command === "add") return `成员 ${result.memberId} 入队`;
  if (command === "assign") return `成员 ${result.memberId} 新增或调整帽子 ${result.hatId}`;
  if (command === "unassign") return `成员 ${result.memberId} 移除帽子 ${result.hatId}`;
  if (command === "set-status") {
    return `成员 ${result.memberId} 状态由 ${result.before.status} 调整为 ${result.after.status}`;
  }
  return `成员 ${result.memberId} 身份资料更新`;
}

function mutationNeedsSignoff(command, result) {
  if (command === "add") return result.status === "active";
  if (command === "assign") return result.changed && result.status === "active";
  if (command === "unassign") return result.removed.status === "active";
  if (command === "set-status") {
    return result.changed
      && (result.before.status === "active" || result.after.status === "active");
  }
  return false;
}

function list(model) {
  console.log(`模型：${model.model}${model._projectedFrom ? `（由 ${model._projectedFrom} 投影）` : ""}`);
  const active = new Set(activeMemberIds(model));
  console.log("\n成员：");
  for (const m of model.members) {
    const resp = memberResponsibilities(model, m.id).join(", ") || "—";
    console.log(`  ${m.id} · ${m.name} <${m.email}> · ${m.status}${active.has(m.id) ? "" : "（非 active，不进任务/签核）"}`);
    console.log(`     职责/帽子：${resp}`);
  }
  console.log(
    `\nScrum：PO=${model.scrum.productOwner || "—"}`
    + ` · SM=${model.scrum.scrumMaster || "—"}`
    + ` · Developers=[${model.scrum.developers.join(",")}]`,
  );
  console.log(`帽子：${Object.keys(model.hats).join(", ") || "—"}`);
}

function validate(model) {
  const { errors, warnings } = validateTeamModel(model);
  for (const w of warnings) console.log(`[WARN] ${w}`);
  for (const e of errors) console.log(`[ERROR] ${e}`);
  console.log(`\nValidate: ${errors.length ? "FAILED" : "OK"} · ${errors.length} 错误 · ${warnings.length} 警告`);
  return errors.length;
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  const { file, config } = readConfig();
  const model = loadTeamModel(config);
  if (command === "list") {
    list(model);
  } else if (command === "validate") {
    process.exitCode = validate(model) ? 2 : 0;
  } else if (["add", "assign", "update", "set-status", "unassign", "sync"].includes(command)) {
    ensureCleanSource();
    validatedModelOrFail(config, "写前校验");
    const migrated = !isV2(config);
    const writable = toWritableV2(config);
    let result = null;
    if (command === "add") {
      const memberId = addMember(writable, options);
      result = {
        memberId,
        status: writable.members.find((item) => item.id === memberId).status,
      };
    } else if (command === "assign") {
      result = assignHat(writable, options);
      result.status = writable.assignments.find(
        (item) => item.memberId === result.memberId && item.hatId === result.hatId,
      ).status;
    } else if (command === "update") {
      result = updateMember(writable, options);
    } else if (command === "set-status") {
      result = setMemberStatus(writable, options);
    } else if (command === "unassign") {
      result = unassignHat(writable, options);
    }

    if (command !== "sync" && result && result.changed === false) {
      console.log("[OK] 请求与当前团队事实一致，无需写入。");
    } else {
      validatedModelOrFail(writable, `${command} 写后校验`);
      const description = command === "sync"
        ? "同步团队派生视图"
        : describeMutation(command, result);
      const signoff = command !== "sync" && mutationNeedsSignoff(command, result)
        ? registerChange([result.memberId], description)
        : null;
      writeConfig(file, writable);
      const views = syncTeamViews(writable);
      const files = [file, ...views, ...(signoff ? [ROLE_MANUAL] : [])];
      commitTeamChange(writable, `team(${command}): ${description}`, files);
      console.log(`[OK] ${description}`);
      if (signoff) {
        console.log(`[AUDIT] ${signoff.changeId} / V${signoff.baseline} 已登记，影响成员：${result.memberId}`);
      }
      if (migrated) {
        console.log("[INFO] 首次写入已把 roles.config 迁移为 schemaVersion=2 / member-hat-v1（无自动合并）。");
      }
      if (signoff) {
        const smId = writable.scrum?.scrumMaster || "sm";
        console.log(`[NEXT] SM 运行：node tools/signoff.mjs prepare --from-audit --actor=${smId} --due=+72h --due-mode=advisory`);
      }
    }
  } else {
    fail(`未知命令：${command}（list|validate|add|assign|update|set-status|unassign|sync）`);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
