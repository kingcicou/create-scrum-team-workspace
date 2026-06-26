#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROLE_SLOTS = [
  {
    id: "po",
    roleCode: "PO_PM",
    title: "产品负责人 PO（兼 PM）",
    shortTitle: "PO",
    identity: "价值掌舵者",
    hats: "PO, PM",
    skills: "Product, Discovery, Prioritization",
    backup: "SM 临时代主持评审",
    worktree: false,
    branchRole: "po-pm",
    soul:
      "负责产品愿景、价值排序、Backlog、AC、验收与发布取舍。反人格是需求传声筒和许愿池。",
  },
  {
    id: "sm",
    roleCode: "SM",
    title: "Scrum Master",
    shortTitle: "SM",
    identity: "流程守护者",
    hats: "SM",
    skills: "Facilitation, Coaching, Flow",
    backup: "敏捷教练或轮值 SM",
    worktree: false,
    branchRole: "sm",
    soul:
      "负责事件引导、障碍清除、流程健康、总表追踪和持续改进。反人格是派活、催进度、做考核的项目经理化。",
  },
  {
    id: "tl",
    roleCode: "TL_SrBE",
    title: "技术负责人 / 高级后端 TL & Sr.BE",
    shortTitle: "TL/Sr.BE",
    identity: "演进式架构守护者",
    hats: "Tech Lead, Architect, Sr.BE",
    skills: "BE, Architecture, Review",
    backup: "FS 备份架构讨论",
    worktree: true,
    branchRole: "tl-sr-be",
    soul:
      "负责架构演进、ADR、技术拆分、关键 PR、后端核心实现与技术债治理。反人格是只画图不落地的象牙塔架构师。",
  },
  {
    id: "midbe",
    roleCode: "MidBE_QA",
    title: "中级后端 Mid.BE（兼 QA 接口侧）",
    shortTitle: "Mid.BE",
    identity: "业务逻辑精准执行者",
    hats: "Mid.BE, QA API/Integration",
    skills: "BE, QA, Integration Test",
    backup: "TL/Sr.BE 指导",
    worktree: true,
    branchRole: "mid-be-qa",
    soul:
      "负责业务接口、服务逻辑、单元/集成测试、边界场景和缺陷修复。反人格是本地跑通就提测的侥幸提交者。",
  },
  {
    id: "srfe",
    roleCode: "SrFE_UX",
    title: "高级前端 Sr.FE（兼 UX/UI）",
    shortTitle: "Sr.FE/UX",
    identity: "体验守护者",
    hats: "Sr.FE, UX/UI",
    skills: "FE, UX, Design System",
    backup: "Mid.FE 备份组件实现",
    worktree: true,
    branchRole: "sr-fe-ux",
    soul:
      "负责前端架构、交互体验、设计系统、性能、可访问性和关键组件。反人格是只还原像素、不管体验质量的切图执行者。",
  },
  {
    id: "midfe",
    roleCode: "MidFE_QA",
    title: "中级前端 Mid.FE（兼 QA 前端侧）",
    shortTitle: "Mid.FE",
    identity: "组件落地与体验协作者",
    hats: "Mid.FE, QA E2E/Snapshot",
    skills: "FE, QA, E2E",
    backup: "Sr.FE 指导",
    worktree: true,
    branchRole: "mid-fe-qa",
    soul:
      "负责页面与组件落地、接口联调、前端测试、快照/E2E 和视觉回归。反人格是提交后破坏基线而不自测。",
  },
  {
    id: "fs",
    roleCode: "FS_DevOps",
    title: "全栈工程师 FS（兼 DevOps）",
    shortTitle: "FS/DevOps",
    identity: "全链路闭环者",
    hats: "Full-stack, DevOps",
    skills: "FS, DevOps, CI/CD",
    backup: "TL 备份后端，Sr.FE 备份前端",
    worktree: true,
    branchRole: "fs-devops",
    soul:
      "负责端到端闭环、Sprint 集成分支、CI/CD、部署验证、回滚和跨端风险。反人格是靠手工救火而不沉淀自动化。",
  },
];

const ROLE_PRESETS = {
  tech: {
    label: "世界技术大神（默认）",
    names: {
      po: "Jobs",
      sm: "Sutherland",
      tl: "Fowler",
      midbe: "Ritchie",
      srfe: "Norman",
      midfe: "Evan",
      fs: "Torvalds",
    },
  },
  myth: {
    label: "中国神话/上古",
    names: {
      po: "Fuxi",
      sm: "Nuwa",
      tl: "Dayu",
      midbe: "Shennong",
      srfe: "Zhinu",
      midfe: "Jingwei",
      fs: "Nezha",
    },
  },
  wuxia: {
    label: "武侠风格（拼音）",
    names: {
      po: "ZhangSanfeng",
      sm: "HongQigong",
      tl: "HuangYaoshi",
      midbe: "GuoJing",
      srfe: "HuangRong",
      midfe: "YangGuo",
      fs: "LinghuChong",
    },
  },
  compass: {
    label: "航海罗盘",
    names: {
      po: "Northstar",
      sm: "Harbor",
      tl: "Compass",
      midbe: "Anchor",
      srfe: "Horizon",
      midfe: "Sail",
      fs: "Voyager",
    },
  },
  studio: {
    label: "独立工作室",
    names: {
      po: "Muse",
      sm: "Tempo",
      tl: "Forge",
      midbe: "Kernel",
      srfe: "Canvas",
      midfe: "Pixel",
      fs: "Bridge",
    },
  },
  greek: {
    label: "希腊神话",
    names: {
      po: "Zeus",
      sm: "Hermes",
      tl: "Daedalus",
      midbe: "Hephaestus",
      srfe: "Apollo",
      midfe: "Iris",
      fs: "Prometheus",
    },
  },
};

const PROJECT_TYPES = {
  new: "从零新项目",
  legacy: "存量项目重构",
  product: "成熟产品迭代",
  prototype: "原型转正",
};

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(rootDir, "template");

function parseArgs(argv) {
  const result = {
    projectName: "",
    repoName: "",
    type: "new",
    preset: "tech",
    roleOverrides: {},
    emailOverrides: {},
    gitRoot: "workspace",
    interactive: false,
    force: false,
    listPresets: false,
    dryRun: false,
    configPath: "",
  };

  for (const arg of argv) {
    if (!arg.startsWith("--") && !result.projectName) {
      result.projectName = arg;
      continue;
    }
    if (arg === "--no-git") result.gitRoot = "none";
    else if (arg === "--git") result.gitRoot = "workspace";
    else if (arg.startsWith("--git-root=")) result.gitRoot = arg.slice("--git-root=".length);
    else if (arg === "--list-presets") result.listPresets = true;
    else if (arg === "--interactive" || arg === "-i") result.interactive = true;
    else if (arg === "--force") result.force = true;
    else if (arg === "--dry-run" || arg === "-n") result.dryRun = true;
    else if (arg.startsWith("--config=")) result.configPath = arg.slice("--config=".length);
    else if (arg.startsWith("--type=")) result.type = arg.slice("--type=".length);
    else if (arg.startsWith("--preset=")) result.preset = arg.slice("--preset=".length);
    else if (arg.startsWith("--roles=")) result.preset = arg.slice("--roles=".length);
    else if (arg.startsWith("--repo=")) result.repoName = arg.slice("--repo=".length);
    else if (arg.startsWith("--role.")) {
      const [key, value = ""] = arg.slice("--role.".length).split("=");
      if (key && value) result.roleOverrides[normalizeRoleId(key)] = value;
    } else if (arg.startsWith("--email.")) {
      const [key, value = ""] = arg.slice("--email.".length).split("=");
      if (key && value) result.emailOverrides[normalizeRoleId(key)] = value;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function loadConfigFile(options) {
  if (!options.configPath) return options;
  const resolved = path.resolve(process.cwd(), options.configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`配置文件不存在：${resolved}`);
  }
  let raw;
  try {
    const text = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`配置文件解析失败：${resolved}\n${error.message}`);
  }
  if (typeof raw !== "object" || raw === null) return options;
  if (!options.projectName && raw.projectName) options.projectName = String(raw.projectName);
  if (!options.repoName && raw.repoName) options.repoName = String(raw.repoName);
  if (raw.type && !options._typeFromCli) options.type = String(raw.type);
  if (raw.preset && !options._presetFromCli) options.preset = String(raw.preset);
  if (raw.gitRoot && !options._gitRootFromCli) options.gitRoot = String(raw.gitRoot);
  if (raw.roles && typeof raw.roles === "object") {
    for (const [key, value] of Object.entries(raw.roles)) {
      const id = normalizeRoleId(key);
      if (!options.roleOverrides[id] && value) options.roleOverrides[id] = String(value);
    }
  }
  if (raw.emails && typeof raw.emails === "object") {
    for (const [key, value] of Object.entries(raw.emails)) {
      const id = normalizeRoleId(key);
      if (!options.emailOverrides[id] && value) options.emailOverrides[id] = String(value);
    }
  }
  return options;
}

function normalizeRoleId(id) {
  const key = id.toLowerCase().replace(/[-_]/g, "");
  const aliases = {
    productowner: "po",
    pm: "po",
    po: "po",
    scrummaster: "sm",
    sm: "sm",
    techlead: "tl",
    architect: "tl",
    srbe: "tl",
    tl: "tl",
    backend: "midbe",
    midbe: "midbe",
    be: "midbe",
    srfe: "srfe",
    ux: "srfe",
    midfe: "midfe",
    fe: "midfe",
    fs: "fs",
    fullstack: "fs",
    devops: "fs",
  };
  return aliases[key] || id.toLowerCase();
}

async function completeOptions(options) {
  const shouldPrompt = options.interactive || !options.projectName;
  if (!shouldPrompt) return options;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!options.projectName) {
      options.projectName = await ask(rl, "项目工作区名称", "my-scrum-project");
    }
    options.type = await askChoice(rl, "项目类型", PROJECT_TYPES, options.type);
    if (!options.repoName) {
      const defaultRepo = `${slug(options.projectName)}-app`;
      options.repoName = await ask(rl, "代码仓库名（10_代码仓库/<repo>）", defaultRepo);
    }
    options.gitRoot = await askChoice(
      rl,
      "Git 初始化模式",
      {
        workspace: "整个项目工作区作为 Git 仓库（默认）",
        repo: "只把代码仓库初始化为 Git",
        none: "不自动初始化",
      },
      options.gitRoot,
    );
    options.preset = await askChoice(
      rl,
      "角色命名套装",
      Object.fromEntries(Object.entries(ROLE_PRESETS).map(([key, value]) => [key, value.label])),
      options.preset,
    );

    const customize = await ask(rl, "是否调整角色名称和邮箱？(y/N)", "N");
    if (customize.trim().toLowerCase().startsWith("y")) {
      const base = buildRoles(options.preset, options.roleOverrides, options.emailOverrides);
      for (const slot of ROLE_SLOTS) {
        const currentRole = base.find((role) => role.id === slot.id);
        const currentName = currentRole?.name || "";
        const nextName = await ask(rl, `${slot.shortTitle} 名称`, currentName);
        if (nextName && nextName !== currentName) options.roleOverrides[slot.id] = nextName;
        const effectiveName = nextName || currentName;
        const defaultEmail = options.emailOverrides[slot.id] || `${slug(effectiveName, slot.id)}@example.com`;
        const nextEmail = await ask(rl, `${slot.shortTitle} 邮箱`, defaultEmail);
        if (nextEmail && nextEmail !== defaultEmail) options.emailOverrides[slot.id] = nextEmail;
      }
    }

    if (!PROJECT_TYPES[options.type]) options.type = "new";
    if (!ROLE_PRESETS[options.preset]) options.preset = "tech";
    if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "workspace";

    const summaryRoles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides);
    console.log("\n=== 即将创建的工作区 ===");
    console.log(`项目名称：${options.projectName}`);
    console.log(`项目类型：${PROJECT_TYPES[options.type]}`);
    console.log(`代码仓库：${options.repoName || `${slug(options.projectName)}-app`}`);
    console.log(`Git 模式：${options.gitRoot}`);
    console.log(`角色套装：${ROLE_PRESETS[options.preset].label}`);
    console.log("角色与邮箱：");
    for (const role of summaryRoles) {
      console.log(`  - ${role.shortTitle.padEnd(10)} ${role.name.padEnd(16)} ${role.email}`);
    }
    if (options.dryRun) console.log("模式：dry-run（不写入文件）");
    console.log("========================\n");
    const confirm = await ask(rl, "确认开始生成？(Y/n)", "Y");
    if (confirm.trim().toLowerCase().startsWith("n")) {
      console.log("已取消。");
      process.exit(0);
    }
  } finally {
    rl.close();
  }
  return options;
}

async function ask(rl, label, defaultValue) {
  const answer = await rl.question(`${label} (${defaultValue}): `);
  return answer.trim() || defaultValue;
}

async function askChoice(rl, label, choices, defaultKey) {
  const lines = Object.entries(choices).map(([key, value]) => `  ${key}: ${value}`).join("\n");
  const defaultLabel = choices[defaultKey] ? `${defaultKey} - ${choices[defaultKey]}` : defaultKey;
  const answer = await rl.question(`${label}:\n${lines}\n选择 (${defaultLabel}): `);
  const key = (answer.trim() || defaultKey).toLowerCase();
  return choices[key] ? key : defaultKey;
}

function buildRoles(presetKey, overrides, emailOverrides = {}) {
  const preset = ROLE_PRESETS[presetKey] || ROLE_PRESETS.tech;
  return ROLE_SLOTS.map((slot) => {
    const name = overrides[slot.id] || preset.names[slot.id];
    const nameSlug = slug(name, slot.id);
    const email = emailOverrides[slot.id] || `${nameSlug}@example.com`;
    return {
      ...slot,
      name,
      dirName: `${safePathSegment(name, slot.id)}_${slot.roleCode}`,
      branchName: `sprint-1/${slug("initial-work")}-${nameSlug}-${slot.branchRole}`,
      email,
    };
  });
}

function slug(value, fallback = "item") {
  return String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || fallback;
}

function safePathSegment(value, fallback = "member") {
  return (
    String(value)
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .replace(/\s+/g, "")
      .replace(/\.+$/g, "") || fallback
  );
}

function buildReplacements(options, roles) {
  const preset = ROLE_PRESETS[options.preset] || ROLE_PRESETS.tech;
  const projectName = options.projectName;
  const repoName = options.repoName || `${slug(projectName)}-app`;
  const today = new Date().toISOString().slice(0, 10);
  const worktreeRoles = roles.filter((role) => role.worktree);

  return {
    PROJECT_NAME: projectName,
    PROJECT_NAME_UPPER: projectName.toUpperCase(),
    PROJECT_SLUG: slug(projectName),
    PROJECT_TYPE: options.type,
    PROJECT_TYPE_LABEL: PROJECT_TYPES[options.type] || PROJECT_TYPES.new,
    REPO_NAME: repoName,
    ROLE_PRESET: options.preset,
    ROLE_PRESET_LABEL: preset.label,
    CREATED_DATE: today,
    ROLE_TABLE: renderRoleTable(roles),
    ROLE_CARDS: renderRoleCards(roles),
    ABILITY_MATRIX: renderAbilityMatrix(roles),
    BACKUP_TABLE: renderBackupTable(roles),
    WORKTREE_DIRS: worktreeRoles.map((role) => `  ${role.dirName}/`).join("\n"),
    WORKTREE_COMMANDS: worktreeRoles
      .map((role) => `git worktree add TeamWork/${role.dirName} -b ${role.branchName} sprint-1`)
      .join("\n"),
    GIT_IDENTITY_COMMANDS: worktreeRoles
      .map(
        (role) =>
          `git -C TeamWork/${role.dirName} config user.name "${role.name}"\ngit -C TeamWork/${role.dirName} config user.email "${role.email}"`,
      )
      .join("\n\n"),
    SPRINT0_ASSIGNMENTS: renderSprint0Assignments(roles),
    ROLE_JSON: JSON.stringify(
      {
        preset: options.preset,
        presetLabel: preset.label,
        roles: roles.map(({ id, name, roleCode, title, hats, skills, backup, worktree, dirName, branchName }) => ({
          id,
          name,
          roleCode,
          title,
          hats,
          skills,
          backup,
          worktree,
          dirName,
          branchName,
        })),
      },
      null,
      2,
    ),
    ROLE_PRESET_OPTIONS: renderPresetOptions(),
  };
}

function renderPresetOptions() {
  return [
    "| preset | 风格 | PO | SM | TL/Sr.BE | Mid.BE | Sr.FE | Mid.FE | FS |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...Object.entries(ROLE_PRESETS).map(([key, value]) => {
      const names = value.names;
      return `| \`${key}\` | ${value.label} | ${names.po} | ${names.sm} | ${names.tl} | ${names.midbe} | ${names.srfe} | ${names.midfe} | ${names.fs} |`;
    }),
  ].join("\n");
}

function renderRoleTable(roles) {
  return [
    "| 槽位 | 名称 | 主身份 | 兼任帽子 | 技能重点 | 备份机制 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...roles.map((role) => `| ${role.id} | ${role.name} | ${role.title} | ${role.hats} | ${role.skills} | ${role.backup} |`),
  ].join("\n");
}

function renderRoleCards(roles) {
  return roles
    .map(
      (role) => `## ${role.name} · ${role.title}

**人格定位：** ${role.identity}  
**帽子：** ${role.hats}  
**技能：** ${role.skills}  
**备份：** ${role.backup}

${role.soul}
`,
    )
    .join("\n---\n\n");
}

function renderAbilityMatrix(roles) {
  const score = {
    po: ["·", "·", "·", "·", "·", "·", "○"],
    sm: ["·", "·", "·", "·", "·", "·", "·"],
    tl: ["◎", "·", "○", "○", "○", "◎", "·"],
    midbe: ["◎", "·", "·", "◎", "·", "○", "·"],
    srfe: ["·", "◎", "○", "○", "·", "·", "◎"],
    midfe: ["·", "◎", "·", "◎", "·", "·", "○"],
    fs: ["○", "○", "◎", "○", "◎", "○", "·"],
  };
  return [
    "| 成员 | BE | FE | FS | QA | DevOps | 架构 | UX/UI | 帽子 |",
    "| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |",
    ...roles.map((role) => `| ${role.name} | ${(score[role.id] || []).join(" | ")} | ${role.hats} |`),
  ].join("\n");
}

function renderBackupTable(roles) {
  return [
    "| 帽子 | 主担 | 备份/兜底 |",
    "| --- | --- | --- |",
    ...roles.map((role) => `| ${role.hats} | ${role.name} | ${role.backup} |`),
  ].join("\n");
}

function renderSprint0Assignments(roles) {
  const byId = Object.fromEntries(roles.map((role) => [role.id, role.name]));
  return [
    "| 工作项 | 主责 | 协作 | 输出 |",
    "| --- | --- | --- | --- |",
    `| 产品愿景与首批 Backlog | ${byId.po} | ${byId.sm}, 全员 | 01_产品发现 / 02_产品待办 |`,
    `| 团队协议与节奏 | ${byId.sm} | 全员 | 00_项目导航 / 03_迭代运行 |`,
    `| 架构草案与 ADR 候选 | ${byId.tl} | ${byId.fs}, ${byId.midbe} | 04_工程设计 |`,
    `| 后端/API/数据模型初评 | ${byId.tl} | ${byId.midbe} | 04_工程设计/02_API契约 / 03_数据模型 |`,
    `| 前端体验与设计系统初评 | ${byId.srfe} | ${byId.midfe} | 04_工程设计/04_前端设计系统 |`,
    `| 测试策略与质量门禁 | ${byId.midbe}, ${byId.midfe} | ${byId.tl} | 05_质量验证 |`,
    `| 代码仓库与 CI/CD 基线 | ${byId.fs} | ${byId.tl}, ${byId.midfe} | 10_代码仓库 / 06_发布运维 |`,
  ].join("\n");
}

function applyTemplate(text, replacements) {
  return text.replace(/{{([A-Z0-9_]+)}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match;
  });
}

function renderName(name, replacements) {
  let next = name;
  if (next === "_gitignore") next = ".gitignore";
  if (next === "_vscode") next = ".vscode";
  next = applyTemplate(next, replacements);
  next = next.replace(/__([A-Z0-9_]+)__/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) return match;
    return safePathSegment(replacements[key], key.toLowerCase());
  });
  return next;
}

function collectTemplatePlan(src, dest, replacements, plan) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    plan.push({ type: "dir", dest });
    for (const entry of fs.readdirSync(src)) {
      collectTemplatePlan(
        path.join(src, entry),
        path.join(dest, renderName(entry, replacements)),
        replacements,
        plan,
      );
    }
    return plan;
  }
  plan.push({ type: "file", src, dest });
  return plan;
}

function applyTemplatePlan(plan, replacements) {
  for (const item of plan) {
    if (item.type === "dir") {
      fs.mkdirSync(item.dest, { recursive: true });
    } else {
      const text = fs.readFileSync(item.src, "utf8");
      fs.mkdirSync(path.dirname(item.dest), { recursive: true });
      fs.writeFileSync(item.dest, applyTemplate(text, replacements), "utf8");
    }
  }
}

function ensureCanWrite(target, force) {
  if (!fs.existsSync(target)) return;
  const entries = fs.readdirSync(target);
  if (entries.length > 0 && !force) {
    throw new Error(`目标目录已存在且非空：${target}\n可使用 --force 覆盖写入模板文件。`);
  }
}

function maybeGitInit(target, gitRoot, repoName) {
  if (gitRoot === "none") return;
  const gitTarget = gitRoot === "repo" ? path.join(target, "10_代码仓库", repoName) : target;
  const init = spawnSync("git", ["init"], { cwd: gitTarget, encoding: "utf8" });
  if (init.status !== 0) {
    if (init.stderr) console.warn(`git init 失败：${init.stderr.trim()}`);
    return;
  }
  spawnSync("git", ["add", "."], { cwd: gitTarget, stdio: "ignore" });
  const commit = spawnSync("git", ["commit", "-m", "chore: initialize scrum team workspace"], {
    cwd: gitTarget,
    encoding: "utf8",
  });
  if (commit.status !== 0) {
    const detail = (commit.stderr || commit.stdout || "").trim();
    console.warn(
      `Git 已初始化，但首次提交失败。请检查 git user.name/user.email 后手动提交。${detail ? `\n${detail}` : ""}`,
    );
  }
}

function printHelp() {
  console.log(`create-scrum-team-workspace

用法:
  node index.mjs <project-name> [options]

选项:
  --type=new|legacy|product|prototype
  --preset=tech|myth|wuxia|compass|studio|greek
  --repo=<repo-name>
  --role.<slot>=<name>           槽位: po|sm|tl|midbe|srfe|midfe|fs
  --email.<slot>=<email>         为某角色配置真实邮箱
  --config=<path.json>           从 JSON 配置文件读取参数（CLI 优先级更高）
  --interactive | -i             交互式创建（含摘要确认）
  --dry-run | -n                 仅预览将创建的文件，不写入磁盘
  --list-presets
  --git-root=workspace|repo|none
  --no-git
  --force                        允许写入非空目录

示例:
  node index.mjs acme-ark --type=legacy --preset=greek --role.midfe=Aurora
  node index.mjs acme-ark --config=./scrum.config.json --dry-run

配置文件示例 (JSON):
  {
    "projectName": "acme-ark",
    "repoName": "acme-ark-app",
    "type": "new",
    "preset": "tech",
    "gitRoot": "workspace",
    "roles": { "midfe": "Aurora" },
    "emails": { "po": "po@example.com" }
  }
`);
}

function printPresets() {
  console.log("可用角色命名套装：\n");
  for (const [key, value] of Object.entries(ROLE_PRESETS)) {
    const names = value.names;
    console.log(`${key} - ${value.label}`);
    console.log(`  PO=${names.po}, SM=${names.sm}, TL=${names.tl}, MidBE=${names.midbe}, SrFE=${names.srfe}, MidFE=${names.midfe}, FS=${names.fs}`);
  }
}

async function main() {
  const parsedOptions = parseArgs(process.argv.slice(2));
  if (parsedOptions.listPresets) {
    printPresets();
    process.exit(0);
  }
  loadConfigFile(parsedOptions);
  const options = await completeOptions(parsedOptions);
  if (!options.projectName) {
    printHelp();
    process.exit(1);
  }
  if (!PROJECT_TYPES[options.type]) options.type = "new";
  if (!ROLE_PRESETS[options.preset]) options.preset = "tech";
  if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "workspace";

  const roles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides);
  const replacements = buildReplacements(options, roles);
  const target = path.resolve(process.cwd(), options.projectName);

  const plan = collectTemplatePlan(templateDir, target, replacements, []);

  if (options.dryRun) {
    console.log(`\n[dry-run] 目标目录：${target}`);
    console.log(`[dry-run] 项目类型：${replacements.PROJECT_TYPE_LABEL}`);
    console.log(`[dry-run] 角色套装：${replacements.ROLE_PRESET_LABEL}`);
    console.log(`[dry-run] 代码仓库骨架：10_代码仓库/${replacements.REPO_NAME}`);
    console.log(`[dry-run] Git 模式：${options.gitRoot}`);
    console.log(`[dry-run] 计划创建 ${plan.filter((i) => i.type === "dir").length} 个目录、${plan.filter((i) => i.type === "file").length} 个文件。`);
    for (const item of plan) {
      const rel = path.relative(target, item.dest) || ".";
      console.log(`  ${item.type === "dir" ? "DIR " : "FILE"}  ${rel}`);
    }
    return;
  }

  ensureCanWrite(target, options.force);
  applyTemplatePlan(plan, replacements);
  maybeGitInit(target, options.gitRoot, replacements.REPO_NAME);

  console.log(`\n已创建 Scrum 团队协同工作区：${target}`);
  console.log(`项目类型：${replacements.PROJECT_TYPE_LABEL}`);
  console.log(`角色套装：${replacements.ROLE_PRESET_LABEL}`);
  console.log(`代码仓库骨架：10_代码仓库/${replacements.REPO_NAME}`);
  console.log("\n下一步：");
  console.log("1. 打开 00_项目导航/00_项目首页.md");
  console.log("2. 检查 00_项目导航/02_角色与联系方式.md");
  console.log("3. 根据项目类型完善 03_迭代运行/Sprint-0-启动/00_Sprint计划.md");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
