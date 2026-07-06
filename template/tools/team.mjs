#!/usr/bin/env node
// 团队视图与校验（member-hat-v1）。
// list / validate：只读，展示与校验成员-帽子模型（旧配置自动投影）。
// add / assign：写操作需 v2-aware 签核/审计（R4.3b），当前先用 list/validate 视图确认。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTeamModel,
  validateTeamModel,
  memberResponsibilities,
  activeMemberIds,
} from "./lib/team-model.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
  const { command } = parseArgs(process.argv.slice(2));
  const model = loadTeamModel(readConfig());
  if (command === "list") {
    list(model);
  } else if (command === "validate") {
    process.exitCode = validate(model) ? 2 : 0;
  } else if (command === "add" || command === "assign") {
    fail(
      `${command} 需要 v2-aware 签核/审计（R4.3b）。写成员/帽子会把配置迁移为 schemaVersion 2，`
      + "需先让 signoff.mjs 与 generate_doc_index.py 以 scrum.scrumMaster 解析 SM、按成员聚合。"
      + "当前请用 `team.mjs list` / `validate` 查看与校验。",
    );
  } else {
    fail(`未知命令：${command}（list|validate）`);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
