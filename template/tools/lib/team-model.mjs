// 团队模型加载层（member-hat-v1）。
// 统一把两种 roles.config 归一为标准视图：members + scrum + hats + assignments。
// - schemaVersion=2 / model=member-hat-v1：直接采用。
// - 旧七角色配置：投影为等价的 member-hat 视图（纯读，不改写文件、不合并身份）。
// 本模块是纯函数，无副作用；R4.1 仅提供视图，不改变签核/审计行为。

// 旧编码角色 → 工程帽子（多对多）。PO/SM 是 Scrum 责任，不是工程帽子。
export const LEGACY_ROLE_HATS = {
  tl: ["tl"],
  midbe: ["backend", "qa"],
  srfe: ["frontend", "ux"],
  midfe: ["frontend", "qa"],
  fs: ["fs", "devops"],
};

export const HAT_LABELS = {
  tl: "TL / Technical Lead",
  backend: "Backend",
  frontend: "Frontend",
  qa: "QA",
  ux: "UX",
  fs: "Full-stack",
  devops: "DevOps",
};

const LEGACY_DEVELOPER_ROLES = ["tl", "midbe", "srfe", "midfe", "fs"];
const MEMBER_STATUSES = new Set(["active", "optional", "planned", "inactive"]);
const ASSIGNMENT_STATUSES = new Set(["active", "optional", "planned", "inactive"]);
const ASSIGNMENT_KINDS = new Set(["primary", "backup"]);

function isMemberHatV2(config) {
  return config && config.schemaVersion === 2 && config.model === "member-hat-v1";
}

function legacyMemberFields(config, id) {
  const detail = (config.roleDetails || []).find((role) => role.id === id);
  return {
    id,
    name: detail?.name || config.roles?.[id] || id,
    email: detail?.email || config.emails?.[id] || "",
    status: detail?.status || "active",
  };
}

// 旧七角色 → member-hat 视图。member id 与旧 role id 同名（不按姓名/邮箱合并）。
export function projectLegacyConfig(config) {
  const ids = new Set([
    ...Object.keys(config.roles || {}),
    ...(config.roleDetails || []).map((role) => role.id).filter(Boolean),
  ]);
  const members = [...ids].map((id) => legacyMemberFields(config, id));

  const scrum = {
    productOwner: ids.has("po") ? "po" : null,
    scrumMaster: ids.has("sm") ? "sm" : null,
    developers: LEGACY_DEVELOPER_ROLES.filter((id) => ids.has(id)),
  };

  const hats = {};
  const assignments = [];
  for (const id of scrum.developers) {
    const member = members.find((m) => m.id === id);
    for (const hatId of LEGACY_ROLE_HATS[id] || []) {
      hats[hatId] = { label: HAT_LABELS[hatId] || hatId };
      assignments.push({
        memberId: id,
        hatId,
        kind: "primary",
        status: member?.status || "active",
      });
    }
  }

  return {
    schemaVersion: 2,
    model: "member-hat-v1",
    _projectedFrom: "legacy-roles",
    members,
    scrum,
    hats,
    assignments,
  };
}

function normalizeV2(config) {
  return {
    schemaVersion: 2,
    model: "member-hat-v1",
    members: (config.members || []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      status: m.status || "active",
    })),
    scrum: {
      productOwner: config.scrum?.productOwner ?? null,
      scrumMaster: config.scrum?.scrumMaster ?? null,
      developers: [...(config.scrum?.developers || [])],
    },
    hats: { ...(config.hats || {}) },
    assignments: (config.assignments || []).map((a) => ({
      memberId: a.memberId,
      hatId: a.hatId,
      kind: a.kind || "primary",
      status: a.status || "active",
    })),
  };
}

export function loadTeamModel(config) {
  return isMemberHatV2(config) ? normalizeV2(config) : projectLegacyConfig(config);
}

// 成员的 accountabilities/hats（用于 Campaign 快照与任务归属）。
export function memberResponsibilities(model, memberId) {
  const out = [];
  if (model.scrum.productOwner === memberId) out.push("scrum:productOwner");
  if (model.scrum.scrumMaster === memberId) out.push("scrum:scrumMaster");
  if (model.scrum.developers.includes(memberId)) out.push("scrum:developer");
  for (const a of model.assignments) {
    if (a.memberId === memberId && a.status === "active") out.push(`hat:${a.hatId}`);
  }
  return out;
}

// 参与签核/任务的成员：status=active（planned 不进入）。
export function activeMemberIds(model) {
  return model.members.filter((m) => m.status === "active").map((m) => m.id);
}

// 只读校验：返回 { errors, warnings }，不修改配置。
export function validateTeamModel(model) {
  const errors = [];
  const warnings = [];
  const seenId = new Set();
  const emailToMember = new Map();
  for (const m of model.members) {
    if (!m.id) errors.push("存在缺少 id 的成员");
    else if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(m.id)) {
      errors.push(`成员 id 非法：${m.id}`);
    }
    if (seenId.has(m.id)) errors.push(`成员 id 重复：${m.id}`);
    seenId.add(m.id);
    if (!String(m.name || "").trim()) errors.push(`成员 ${m.id || "?"} 缺少姓名`);
    if (!MEMBER_STATUSES.has(m.status)) errors.push(`成员 ${m.id || "?"} 状态非法：${m.status}`);
    const email = String(m.email || "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`成员 ${m.id || "?"} 邮箱非法：${m.email || "空"}`);
    } else {
      if (emailToMember.has(email)) {
        errors.push(`同一邮箱属于两个成员：${email}（${emailToMember.get(email)} 与 ${m.id}）`);
      } else {
        emailToMember.set(email, m.id);
      }
    }
  }
  const assignmentKeys = new Set();
  for (const a of model.assignments) {
    if (!seenId.has(a.memberId)) errors.push(`assignment 指向不存在的成员：${a.memberId}`);
    if (!model.hats[a.hatId]) errors.push(`assignment 指向未定义的帽子：${a.hatId}`);
    if (!ASSIGNMENT_STATUSES.has(a.status)) {
      errors.push(`assignment ${a.memberId}->${a.hatId} 状态非法：${a.status}`);
    }
    if (!ASSIGNMENT_KINDS.has(a.kind)) {
      errors.push(`assignment ${a.memberId}->${a.hatId} kind 非法：${a.kind}`);
    }
    const key = `${a.memberId}\0${a.hatId}`;
    if (assignmentKeys.has(key)) errors.push(`assignment 重复：${a.memberId}->${a.hatId}`);
    assignmentKeys.add(key);
    const member = model.members.find((m) => m.id === a.memberId);
    if (a.status === "active" && member && member.status !== "active") {
      errors.push(`active assignment 指向非 active 成员：${a.memberId}->${a.hatId}`);
    }
  }
  for (const key of ["productOwner", "scrumMaster"]) {
    const id = model.scrum[key];
    if (id && !seenId.has(id)) errors.push(`scrum.${key} 指向不存在的成员：${id}`);
  }
  for (const id of model.scrum.developers) {
    if (!seenId.has(id)) errors.push(`scrum.developers 指向不存在的成员：${id}`);
  }
  if (new Set(model.scrum.developers).size !== model.scrum.developers.length) {
    errors.push("scrum.developers 存在重复成员");
  }
  for (const key of ["productOwner", "scrumMaster"]) {
    const id = model.scrum[key];
    const member = model.members.find((item) => item.id === id);
    if (member && member.status !== "active") {
      errors.push(`scrum.${key} 必须指向 active 成员：${id}`);
    }
  }
  if (model.scrum.productOwner && model.scrum.productOwner === model.scrum.scrumMaster) {
    warnings.push(`PO 与 SM 指向同一成员（${model.scrum.productOwner}）：职责冲突，建议分离`);
  }
  return { errors, warnings };
}
