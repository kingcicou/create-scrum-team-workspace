#!/usr/bin/env node
// 团队视图与校验（member-hat-v1）。
// list / validate：只读，展示与校验成员-帽子模型（旧配置自动投影）。
// add / assign：写入 roles.config（首次写入会迁移为 schemaVersion=2/member-hat-v1）。
// 约束：写前/写后都 validate；成员身份仅按 member.id，不按姓名/邮箱自动合并。

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
const VALID_MEMBER_STATUS = new Set(["active", "optional", "planned"]);
const VALID_ASSIGN_STATUS = new Set(["active", "optional", "planned"]);

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
  if (existed) {
    existed.kind = kind;
    existed.status = status;
  } else {
    config.assignments.push({ memberId, hatId, kind, status });
  }

  return { memberId, hatId };
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
  } else if (command === "add" || command === "assign") {
    // 写前先校验当前模型，避免在坏状态上继续写入。
    validatedModelOrFail(config, "写前校验");
    const migrated = !isV2(config);
    const writable = toWritableV2(config);
    if (command === "add") {
      const memberId = addMember(writable, options);
      validatedModelOrFail(writable, "add 写后校验");
      writeConfig(file, writable);
      console.log(`[OK] 已新增成员：${memberId}`);
      if (migrated) {
        console.log("[INFO] 首次写入已把 roles.config 迁移为 schemaVersion=2 / member-hat-v1（无自动合并）。");
      }
      const smId = writable.scrum?.scrumMaster || "sm";
      console.log(`[NEXT] 建议由 SM 运行 onboarding 批次：node tools/signoff.mjs prepare --from-audit --actor=${smId} --due=+72h --due-mode=advisory`);
    } else {
      const { memberId, hatId } = assignHat(writable, options);
      validatedModelOrFail(writable, "assign 写后校验");
      writeConfig(file, writable);
      console.log(`[OK] 已更新 assignment：${memberId} -> ${hatId}`);
      if (migrated) {
        console.log("[INFO] 首次写入已把 roles.config 迁移为 schemaVersion=2 / member-hat-v1（无自动合并）。");
      }
      const smId = writable.scrum?.scrumMaster || "sm";
      console.log(`[NEXT] 建议由 SM 发起 role-change 批次：node tools/signoff.mjs prepare --from-audit --actor=${smId} --due=+72h --due-mode=advisory`);
    }
  } else {
    fail(`未知命令：${command}（list|validate|add|assign）`);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
