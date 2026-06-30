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

const REPO_STRATEGIES = {
  reuse: "复用现有代码仓库",
  import: "整理已有代码并导入新仓库",
  rewrite: "新技术栈并行重写后切换",
  create: "从零创建代码仓库",
};

const DEFAULT_REPO_STRATEGY = {
  new: "create",
  legacy: "rewrite",
  product: "reuse",
  prototype: "import",
};

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(rootDir, "template");

function parseArgs(argv) {
  const result = {
    projectName: "",
    repoName: "",
    type: "new",
    repoStrategy: "",
    sourceRepo: "",
    preset: "tech",
    roleOverrides: {},
    emailOverrides: {},
    gitRoot: "repo",
    setupWorktrees: true,
    roleTestCommits: false,
    remoteUrl: "",
    pushRemote: false,
    defaultBranch: "main",
    sprintNumber: 1,
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
    if (arg === "--no-git") {
      result.gitRoot = "none";
      result.setupWorktrees = false;
      result._gitRootFromCli = true;
      result._worktreesFromCli = true;
    } else if (arg === "--git") {
      result.gitRoot = "repo";
      result._gitRootFromCli = true;
    } else if (arg.startsWith("--git-root=")) {
      result.gitRoot = arg.slice("--git-root=".length);
      result._gitRootFromCli = true;
    }
    else if (arg === "--worktrees") {
      result.setupWorktrees = true;
      result._worktreesFromCli = true;
    }
    else if (arg === "--no-worktrees") {
      result.setupWorktrees = false;
      result._worktreesFromCli = true;
    }
    else if (arg === "--role-test-commits") {
      result.roleTestCommits = true;
      result._roleTestCommitsFromCli = true;
    }
    else if (arg === "--no-role-test-commits") {
      result.roleTestCommits = false;
      result._roleTestCommitsFromCli = true;
    }
    else if (arg.startsWith("--remote=")) {
      result.remoteUrl = arg.slice("--remote=".length);
      result._remoteFromCli = true;
    }
    else if (arg === "--push") {
      result.pushRemote = true;
      result._pushFromCli = true;
    }
    else if (arg === "--no-push") {
      result.pushRemote = false;
      result._pushFromCli = true;
    }
    else if (arg.startsWith("--default-branch=")) {
      result.defaultBranch = arg.slice("--default-branch=".length);
      result._defaultBranchFromCli = true;
    }
    else if (arg.startsWith("--sprint=")) {
      result.sprintNumber = Number(arg.slice("--sprint=".length));
      result._sprintFromCli = true;
    }
    else if (arg === "--list-presets") result.listPresets = true;
    else if (arg === "--interactive" || arg === "-i") result.interactive = true;
    else if (arg === "--force") result.force = true;
    else if (arg === "--dry-run" || arg === "-n") result.dryRun = true;
    else if (arg.startsWith("--config=")) result.configPath = arg.slice("--config=".length);
    else if (arg.startsWith("--type=")) {
      result.type = arg.slice("--type=".length);
      result._typeFromCli = true;
    }
    else if (arg.startsWith("--repo-strategy=")) {
      result.repoStrategy = arg.slice("--repo-strategy=".length);
      result._repoStrategyFromCli = true;
    }
    else if (arg.startsWith("--source-repo=")) {
      result.sourceRepo = arg.slice("--source-repo=".length);
      result._sourceRepoFromCli = true;
    }
    else if (arg.startsWith("--preset=")) {
      result.preset = arg.slice("--preset=".length);
      result._presetFromCli = true;
    }
    else if (arg.startsWith("--roles=")) {
      result.preset = arg.slice("--roles=".length);
      result._presetFromCli = true;
    }
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
  if (raw.repoStrategy && !options._repoStrategyFromCli) {
    options.repoStrategy = String(raw.repoStrategy);
  }
  if (raw.sourceRepo && !options._sourceRepoFromCli) options.sourceRepo = String(raw.sourceRepo);
  if (raw.preset && !options._presetFromCli) options.preset = String(raw.preset);
  if (raw.gitRoot && !options._gitRootFromCli) {
    options.gitRoot = String(raw.gitRoot);
    options._gitRootFromConfig = true;
  }
  if (typeof raw.setupWorktrees === "boolean" && !options._worktreesFromCli) {
    options.setupWorktrees = raw.setupWorktrees;
    options._worktreesFromConfig = true;
  }
  if (typeof raw.roleTestCommits === "boolean" && !options._roleTestCommitsFromCli) {
    options.roleTestCommits = raw.roleTestCommits;
  }
  if (raw.remoteUrl && !options._remoteFromCli) options.remoteUrl = String(raw.remoteUrl);
  if (typeof raw.pushRemote === "boolean" && !options._pushFromCli) options.pushRemote = raw.pushRemote;
  if (raw.defaultBranch && !options._defaultBranchFromCli) options.defaultBranch = String(raw.defaultBranch);
  if (raw.sprintNumber && !options._sprintFromCli) options.sprintNumber = Number(raw.sprintNumber);
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
    if (!options.repoStrategy) {
      options.repoStrategy = DEFAULT_REPO_STRATEGY[options.type] || "create";
    }
    options.repoStrategy = await askChoice(
      rl,
      "本 Sprint 代码仓库策略",
      REPO_STRATEGIES,
      options.repoStrategy,
    );
    if (["reuse", "import", "rewrite"].includes(options.repoStrategy)) {
      options.sourceRepo = await ask(
        rl,
        "现有/来源代码仓库地址或路径（暂未确定可留空）",
        options.sourceRepo,
      );
    }
    if (!options.repoName) {
      const defaultRepo = `${slug(options.projectName)}-app`;
      const repoPrompt = options.repoStrategy === "reuse"
        ? "现有代码仓库名称（仅登记，不创建副本）"
        : "目标代码仓库名（10_代码仓库/<repo>）";
      options.repoName = await ask(rl, repoPrompt, defaultRepo);
    }
    if (options.repoStrategy === "reuse" && !options._gitRootFromCli) {
      options.gitRoot = "none";
      options.setupWorktrees = false;
    }
    options.gitRoot = await askChoice(
      rl,
      "Git 初始化模式",
      options.repoStrategy === "reuse"
        ? {
            none: "不初始化代码仓（推荐，复用现有仓库）",
            workspace: "仅将项目工作区初始化为文档仓",
          }
        : {
            repo: "目标代码仓独立初始化（推荐，可自动创建角色 worktree）",
            workspace: "整个项目工作区作为 Git 仓库",
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

    console.log("\n当前角色配置：");
    printRoleSummary(buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber));
    const customize = await ask(
      rl,
      "要调整哪些角色？输入槽位并用逗号分隔（po,sm,tl,midbe,srfe,midfe,fs），all=全部，none=不调整",
      "none",
    );
    if (customize.trim().toLowerCase() !== "none") {
      const base = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber);
      const requested = customize.trim().toLowerCase() === "all"
        ? new Set(ROLE_SLOTS.map((slot) => slot.id))
        : new Set(customize.split(",").map((id) => normalizeRoleId(id.trim())));
      for (const slot of ROLE_SLOTS.filter((item) => requested.has(item.id))) {
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
    if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "repo";
    if (options.gitRoot === "repo") {
      const setup = await ask(rl, "是否统一创建 5 个编码角色 worktree？(Y/n)", "Y");
      options.setupWorktrees = !setup.trim().toLowerCase().startsWith("n");
      if (options.setupWorktrees) {
        const testCommits = await ask(rl, "是否为每个角色创建身份就绪测试提交？(y/N)", "N");
        options.roleTestCommits = testCommits.trim().toLowerCase().startsWith("y");
      }
      options.remoteUrl = await ask(rl, "远端代码仓库地址（留空则不配置）", "");
      if (options.remoteUrl) {
        const push = await ask(rl, "是否推送 main、Sprint 分支和角色分支到远端？(y/N)", "N");
        options.pushRemote = push.trim().toLowerCase().startsWith("y");
      }
    } else {
      options.setupWorktrees = false;
      options.roleTestCommits = false;
    }

    const summaryRoles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber);
    validateOptions(options);
    validateRoles(summaryRoles, options.pushRemote);
    console.log("\n=== 即将创建的工作区 ===");
    console.log(`项目名称：${options.projectName}`);
    console.log(`项目类型：${PROJECT_TYPES[options.type]}`);
    console.log(`仓库策略：${REPO_STRATEGIES[options.repoStrategy]}`);
    console.log(`来源仓库：${options.sourceRepo || "无 / 待确认"}`);
    console.log(`代码仓库：${options.repoName || `${slug(options.projectName)}-app`}`);
    console.log(`Git 模式：${options.gitRoot}`);
    console.log(`角色工作区：${options.setupWorktrees ? "统一创建" : "不创建"}`);
    console.log(`角色测试提交：${options.roleTestCommits ? "创建" : "不创建"}`);
    console.log(`远端：${options.remoteUrl || "不配置"}${options.pushRemote ? "（生成后推送）" : ""}`);
    console.log(`角色套装：${ROLE_PRESETS[options.preset].label}`);
    console.log("角色与邮箱：");
    printRoleSummary(summaryRoles);
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

function printRoleSummary(roles) {
  for (const role of roles) {
    const workspace = role.worktree ? role.dirName : "（无编码工作区）";
    console.log(`  - ${role.id.padEnd(6)} ${role.shortTitle.padEnd(10)} ${role.name.padEnd(16)} ${role.email.padEnd(28)} ${workspace}`);
  }
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

function buildRoles(presetKey, overrides, emailOverrides = {}, sprintNumber = 1) {
  const preset = ROLE_PRESETS[presetKey] || ROLE_PRESETS.tech;
  return ROLE_SLOTS.map((slot) => {
    const name = overrides[slot.id] || preset.names[slot.id];
    const nameSlug = slug(name, slot.id);
    const email = emailOverrides[slot.id] || `${nameSlug}@example.com`;
    return {
      ...slot,
      name,
      dirName: `${safePathSegment(name, slot.id)}_${slot.roleCode}`,
      branchName: slot.worktree
        ? `feature/sprint-${sprintNumber}/initial-work-${nameSlug}-${slot.branchRole}`
        : "",
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

function validateOptions(options) {
  if (!REPO_STRATEGIES[options.repoStrategy]) {
    throw new Error("--repo-strategy 必须是 reuse、import、rewrite 或 create。");
  }
  if (!Number.isInteger(options.sprintNumber) || options.sprintNumber < 0) {
    throw new Error("--sprint 必须是大于或等于 0 的整数。");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.defaultBranch)) {
    throw new Error("--default-branch 只能包含字母、数字、点、下划线和连字符。");
  }
  if (options.pushRemote && !options.remoteUrl) {
    throw new Error("--push 必须与 --remote=<url> 一起使用。");
  }
  if (options.repoStrategy === "reuse" && options.gitRoot === "repo") {
    throw new Error("reuse 策略不会初始化或复制现有代码仓；请使用 --git-root=none 或 workspace。");
  }
  if (options.setupWorktrees && options.gitRoot !== "repo") {
    throw new Error("自动角色 worktree 仅支持 --git-root=repo；请改用独立代码仓模式或加 --no-worktrees。");
  }
  if (options.roleTestCommits && !options.setupWorktrees) {
    throw new Error("--role-test-commits 需要启用角色 worktree。");
  }
}

function validateRoles(roles, requireRealEmails = false) {
  const names = new Set();
  const emails = new Set();
  for (const role of roles) {
    const normalizedName = role.name.trim().toLowerCase();
    const normalizedEmail = role.email.trim().toLowerCase();
    if (!role.name.trim()) throw new Error(`角色 ${role.id} 的名称不能为空。`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(role.email)) {
      throw new Error(`角色 ${role.id} 的邮箱格式无效：${role.email}`);
    }
    if (requireRealEmails && /@(example\.(com|org|net)|localhost)$/i.test(role.email)) {
      throw new Error(`推送远端前必须为角色 ${role.id} 配置真实邮箱，当前为：${role.email}`);
    }
    if (names.has(normalizedName)) throw new Error(`角色名称不能重复：${role.name}`);
    if (emails.has(normalizedEmail)) throw new Error(`角色邮箱不能重复：${role.email}`);
    names.add(normalizedName);
    emails.add(normalizedEmail);
  }
}

function safeRemoteUrl(remoteUrl) {
  if (!remoteUrl) return "";
  try {
    const parsed = new URL(remoteUrl);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return remoteUrl;
  }
}

function markdownCell(value, fallback = "待确认") {
  const text = String(value || fallback).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  return text || fallback;
}

function renderRepoInventory(options, repoName) {
  const source = markdownCell(safeRemoteUrl(options.sourceRepo));
  const sprint = `Sprint ${options.sprintNumber}`;
  const target = markdownCell(repoName);
  const baseline = markdownCell(options.defaultBranch);

  if (options.repoStrategy === "reuse") {
    return `| R01 | ${target} | 当前主仓 | ${source} | ${baseline} | 复用现有技术栈 | 使用中 | ${sprint}确认 | FS |`;
  }
  if (options.repoStrategy === "import") {
    return [
      `| R01 | 来源代码 | 导入源 | ${source} | 待确认 | 只读基线 | 待冻结 | ${sprint} | TL / FS |`,
      `| R02 | ${target} | 目标主仓 | 新建 | ${baseline} | 整理后技术栈 | 准备中 | ${sprint} | FS |`,
    ].join("\n");
  }
  if (options.repoStrategy === "rewrite") {
    return [
      `| R01 | 现有系统 | 现行主仓 | ${source} | 待确认 | 原技术栈 | 维护中 | ${sprint} | TL / FS |`,
      `| R02 | ${target} | 候选替代仓 | 新建 | ${baseline} | 新技术栈 | 验证中 | ${sprint} | TL / FS |`,
    ].join("\n");
  }
  return `| R01 | ${target} | 新项目主仓 | 新建 | ${baseline} | 待技术选型 | 准备中 | ${sprint} | FS |`;
}

function buildReplacements(options, roles) {
  const preset = ROLE_PRESETS[options.preset] || ROLE_PRESETS.tech;
  const projectName = options.projectName;
  const repoName = options.repoName || `${slug(projectName)}-app`;
  const today = new Date().toISOString().slice(0, 10);
  const worktreeRoles = roles.filter((role) => role.worktree);
  const sourceRepo = safeRemoteUrl(options.sourceRepo) || "待确认";
  const isReuse = options.repoStrategy === "reuse";
  const repoWorkspaceLocation = isReuse
    ? `现有仓库：${sourceRepo}`
    : `10_代码仓库/${repoName}/`;
  const repoAction = {
    reuse: "取得现有仓库权限，基于当前稳定分支建立 Sprint 集成分支；不复制代码历史",
    import: "冻结来源快照，完成去敏与清单核对后导入目标仓库",
    rewrite: "旧仓保持可维护，新仓验证新技术栈；达到切换门禁前不得替换生产主仓",
    create: "完成技术选型、代码骨架、CI 和首个可运行增量",
  }[options.repoStrategy];

  return {
    PROJECT_NAME: projectName,
    PROJECT_NAME_UPPER: projectName.toUpperCase(),
    PROJECT_SLUG: slug(projectName),
    PROJECT_TYPE: options.type,
    PROJECT_TYPE_LABEL: PROJECT_TYPES[options.type] || PROJECT_TYPES.new,
    REPO_STRATEGY: options.repoStrategy,
    REPO_STRATEGY_LABEL: REPO_STRATEGIES[options.repoStrategy],
    SOURCE_REPO: sourceRepo,
    REPO_WORKSPACE_LOCATION: repoWorkspaceLocation,
    REPO_ACTION: repoAction,
    REPO_INVENTORY_ROWS: renderRepoInventory(options, repoName),
    REPO_SOP_SETUP_NOTE: isReuse
      ? `当前为 reuse：生成器不会复制现有代码。先克隆 ${sourceRepo}，再在该克隆中创建 Sprint 分支和角色 worktree。`
      : `当前为 ${options.repoStrategy}：目标仓位于 10_代码仓库/${repoName}/；生成器启用 worktree 时已统一创建角色工作区。`,
    CODE_WORKSPACE_REPO_ENTRY: isReuse
      ? ""
      : `,\n    { "path": "10_代码仓库/${repoName}", "name": "Code Repo" }`,
    REPO_NAME: repoName,
    ROLE_PRESET: options.preset,
    ROLE_PRESET_LABEL: preset.label,
    CREATED_DATE: today,
    SPRINT_NUMBER: String(options.sprintNumber),
    DEFAULT_BRANCH: options.defaultBranch,
    TEAMWORK_STATUS: options.setupWorktrees ? "✅" : "🔵",
    TEAMWORK_OUTPUT_TIME: options.setupWorktrees ? today : "-",
    TEAMWORK_CHANGE: options.setupWorktrees
      ? "生成器创建角色 worktree"
      : isReuse
        ? "待在现有仓库创建角色工作区"
        : "待手工创建角色 worktree",
    TEAMWORK_NOTE: options.setupWorktrees
      ? "验证身份和远端权限"
      : isReuse
        ? "取得现有仓库权限后，参考 08_团队开发协作SOP.md §4.1 建立工作区"
        : "参考 08_团队开发协作SOP.md §4.1 手工创建",
    TEAMWORK_FLOW_STAGE: options.setupWorktrees
      ? "工作区就绪"
      : isReuse
        ? "现有仓接入"
        : "工作区准备",
    TEAMWORK_FLOW_STATE: options.setupWorktrees ? "🟢" : "🔵",
    TEAMWORK_FLOW_GAP: options.setupWorktrees
      ? "验证身份和远端权限"
      : isReuse
        ? "确认仓库权限、基线分支和角色工作区"
        : "创建 Git 仓库和角色 worktree",
    ROLE_PO_NAME: roleNameById(roles, "po"),
    ROLE_SM_NAME: roleNameById(roles, "sm"),
    ROLE_TL_NAME: roleNameById(roles, "tl"),
    ROLE_MIDBE_NAME: roleNameById(roles, "midbe"),
    ROLE_SRFE_NAME: roleNameById(roles, "srfe"),
    ROLE_MIDFE_NAME: roleNameById(roles, "midfe"),
    ROLE_FS_NAME: roleNameById(roles, "fs"),
    ROLE_TABLE: renderRoleTable(roles),
    ROLE_CARDS: renderRoleCards(roles),
    ABILITY_MATRIX: renderAbilityMatrix(roles),
    BACKUP_TABLE: renderBackupTable(roles),
    TASK_EXECUTION_TABLE: renderTaskExecutionTable(roles, today, options),
    WORKTREE_DIRS: worktreeRoles.map((role) => `  ${role.dirName}/`).join("\n"),
    WORKTREE_COMMANDS: worktreeRoles
      .map((role) => `git worktree add TeamWork/${role.dirName} -b ${role.branchName} sprint-${options.sprintNumber}`)
      .join("\n"),
    GIT_IDENTITY_COMMANDS: worktreeRoles
      .map(
        (role) =>
          `git -C TeamWork/${role.dirName} config --worktree user.name "${role.name}"\ngit -C TeamWork/${role.dirName} config --worktree user.email "${role.email}"`,
      )
      .join("\n\n"),
    SPRINT0_ASSIGNMENTS: renderSprint0Assignments(roles),
    ROLE_JSON: JSON.stringify(
      {
        projectName,
        repoName,
        type: options.type,
        repoStrategy: options.repoStrategy,
        sourceRepo: safeRemoteUrl(options.sourceRepo),
        preset: options.preset,
        gitRoot: options.gitRoot,
        setupWorktrees: options.setupWorktrees,
        roleTestCommits: options.roleTestCommits,
        remoteUrl: safeRemoteUrl(options.remoteUrl),
        pushRemote: false,
        defaultBranch: options.defaultBranch,
        sprintNumber: options.sprintNumber,
        roles: Object.fromEntries(roles.map((role) => [role.id, role.name])),
        emails: Object.fromEntries(roles.map((role) => [role.id, role.email])),
        roleDetails: roles.map(({ id, name, email, roleCode, title, hats, skills, backup, worktree, dirName, branchName }) => ({
          id,
          name,
          email,
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
    "| 槽位 | 名称 | 邮箱 | 主身份 | 兼任帽子 | 编码工作区 | 备份机制 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...roles.map((role) => `| ${role.id} | ${role.name} | ${role.email} | ${role.title} | ${role.hats} | ${role.worktree ? role.dirName : "不创建"} | ${role.backup} |`),
  ].join("\n");
}

function roleNameById(roles, id) {
  return roles.find((role) => role.id === id)?.name ?? id;
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

function renderTaskExecutionTable(roles, today, options) {
  const byId = Object.fromEntries(roles.map((role) => [role.id, role]));
  const fsTask = options.repoStrategy === "reuse"
    ? "接入现仓：权限、基线分支、CI、角色工作区"
    : "建立目标仓、CI、Sprint 分支和角色工作区";
  const rows = [
    ["T01", "Sprint Goal", "确认价值目标、Story 与 AC", "D 决策", "M", "po", "sm", "-", "Backlog / AC"],
    ["T02", "T01", "拆分节奏、依赖和准入门禁", "D 流程", "S", "sm", "po", "T01", "Sprint 计划 / 任务表"],
    ["T03", "T01", "技术全景、模块边界与关键 ADR", "A 架构", "L", "tl", "fs", "T01", "技术全景 / ADR"],
    ["T04", "T03", "API、数据与后端实现切片", "I 实现", "M", "midbe", "tl", "T03", "代码 / 测试 / PR"],
    ["T05", "T01/T03", "体验基线与前端架构切片", "A 架构", "M", "srfe", "tl", "T01,T03", "设计约束 / 关键 PR"],
    ["T06", "T04/T05", "页面、联调与自动化验证切片", "I/V 实现验证", "S", "midfe", "srfe", "T04,T05", "代码 / 测试证据"],
    ["T07", "T03", fsTask, "O 工程环境", "M", "fs", "tl", "T03", "仓库清单 / CI / 操作说明"],
  ];
  return [
    "| ID | 父项 | 任务 | 级别 | 复杂度 | Owner | Reviewer | 状态 | 前置 | 输出/证据 | 更新 |",
    "| --- | --- | --- | --- | :---: | --- | --- | --- | --- | --- | --- |",
    ...rows.map(([id, parent, task, level, complexity, owner, reviewer, predecessor, evidence]) =>
      `| ${id} | ${parent} | ${task} | ${level} | ${complexity} | ${byId[owner].name} | ${byId[reviewer].name} | 未开始 | ${predecessor} | ${evidence} | ${today} |`
    ),
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
  if (next === "_github") next = ".github";
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

function filterTemplatePlan(plan, target, replacements, options) {
  if (options.repoStrategy !== "reuse") return plan;
  const repoRoot = path.resolve(target, "10_代码仓库", replacements.REPO_NAME);
  return plan.filter((item) => {
    const candidate = path.resolve(item.dest);
    const relative = path.relative(repoRoot, candidate);
    return relative.startsWith("..") || path.isAbsolute(relative);
  });
}

function applyTemplatePlan(plan, replacements) {
  for (const item of plan) {
    if (item.type === "dir") {
      fs.mkdirSync(item.dest, { recursive: true });
    } else {
      const text = fs.readFileSync(item.src, "utf8").replace(/^\uFEFF/, "");
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

function runGit(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Git 命令失败：git ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

function commitEnvironment(role) {
  return {
    GIT_AUTHOR_NAME: role.name,
    GIT_AUTHOR_EMAIL: role.email,
    GIT_COMMITTER_NAME: role.name,
    GIT_COMMITTER_EMAIL: role.email,
  };
}

function setupGitWorkspace(target, options, repoName, roles) {
  if (options.gitRoot === "none") return { gitTarget: "", worktrees: [] };

  const gitTarget = options.gitRoot === "repo"
    ? path.join(target, "10_代码仓库", repoName)
    : target;
  const fsRole = roles.find((role) => role.id === "fs");
  const sprintBranch = `sprint-${options.sprintNumber}`;

  runGit(gitTarget, ["init", "-b", options.defaultBranch]);
  runGit(gitTarget, ["add", "."]);
  const commit = runGit(
    gitTarget,
    ["commit", "-m", "chore: initialize scrum team workspace"],
    { env: commitEnvironment(fsRole), allowFailure: true },
  );
  const hasHead = runGit(gitTarget, ["rev-parse", "--verify", "HEAD"], { allowFailure: true }).status === 0;
  if (!hasHead) {
    const detail = (commit.stderr || commit.stdout || "").trim();
    throw new Error(`Git 首次提交失败。${detail ? `\n${detail}` : ""}`);
  }

  runGit(gitTarget, ["config", "extensions.worktreeConfig", "true"]);
  runGit(gitTarget, ["config", "--worktree", "user.name", fsRole.name]);
  runGit(gitTarget, ["config", "--worktree", "user.email", fsRole.email]);

  const sprintExists = runGit(gitTarget, ["show-ref", "--verify", "--quiet", `refs/heads/${sprintBranch}`], {
    allowFailure: true,
  }).status === 0;
  if (!sprintExists) runGit(gitTarget, ["branch", sprintBranch, options.defaultBranch]);

  if (options.remoteUrl) {
    const currentRemote = runGit(gitTarget, ["remote", "get-url", "origin"], { allowFailure: true });
    if (currentRemote.status === 0 && currentRemote.stdout.trim() !== options.remoteUrl) {
      throw new Error(`origin 已存在且地址不同：${currentRemote.stdout.trim()}`);
    }
    if (currentRemote.status !== 0) runGit(gitTarget, ["remote", "add", "origin", options.remoteUrl]);
  }

  const worktrees = [];
  if (options.setupWorktrees) {
    const teamworkDir = path.join(gitTarget, "TeamWork");
    fs.mkdirSync(teamworkDir, { recursive: true });
    for (const role of roles.filter((item) => item.worktree)) {
      const worktreePath = path.join(teamworkDir, role.dirName);
      if (fs.existsSync(worktreePath)) {
        throw new Error(`角色工作区已存在，拒绝覆盖：${worktreePath}`);
      }
      runGit(gitTarget, ["worktree", "add", worktreePath, "-b", role.branchName, sprintBranch]);
      runGit(worktreePath, ["config", "--worktree", "user.name", role.name]);
      runGit(worktreePath, ["config", "--worktree", "user.email", role.email]);

      if (options.roleTestCommits) {
        const readinessDir = path.join(worktreePath, ".team", "readiness");
        fs.mkdirSync(readinessDir, { recursive: true });
        const readinessFile = path.join(readinessDir, `${role.id}.md`);
        fs.writeFileSync(
          readinessFile,
          `# ${role.name} workspace readiness\n\n- Role: ${role.title}\n- Branch: ${role.branchName}\n- Git email: ${role.email}\n- Generated: ${new Date().toISOString()}\n`,
          "utf8",
        );
        runGit(worktreePath, ["add", `.team/readiness/${role.id}.md`]);
        runGit(worktreePath, ["commit", "-m", `test(team): verify ${role.id} workspace identity`]);
      }
      worktrees.push({ role, path: worktreePath });
    }
  }

  if (options.pushRemote) {
    const branches = [options.defaultBranch, sprintBranch, ...worktrees.map(({ role }) => role.branchName)];
    runGit(gitTarget, ["push", "-u", "origin", ...branches]);
  }

  return { gitTarget, worktrees, sprintBranch };
}

function printHelp() {
  console.log(`create-scrum-team-workspace

用法:
  node index.mjs <project-name> [options]

选项:
  --type=new|legacy|product|prototype
  --repo-strategy=reuse|import|rewrite|create
  --source-repo=<url-or-path>   现有/来源仓库，仅登记并用于迁移决策
  --preset=tech|myth|wuxia|compass|studio|greek
  --repo=<repo-name>
  --role.<slot>=<name>           槽位: po|sm|tl|midbe|srfe|midfe|fs
  --email.<slot>=<email>         为某角色配置真实邮箱
  --worktrees | --no-worktrees  是否创建 5 个编码角色 worktree（repo 模式默认创建）
  --role-test-commits           每个角色分支创建一条身份就绪测试提交
  --remote=<url>                配置代码仓库 origin，不会自动推送
  --push | --no-push            是否将 main、sprint 和角色分支推送到 origin
  --default-branch=<name>       默认分支名，默认 main
  --sprint=<number>             初始 Sprint 编号，默认 1
  --config=<path.json>           从 JSON 配置文件读取参数（CLI 优先级更高）
  --interactive | -i             交互式创建（含摘要确认）
  --dry-run | -n                 仅预览将创建的文件，不写入磁盘
  --list-presets
  --git-root=repo|workspace|none（默认 repo）
  --no-git
  --force                        允许写入非空目录

示例:
  node index.mjs acme-ark --type=product --repo-strategy=reuse --source-repo=https://example.com/acme.git
  node index.mjs acme-next --type=legacy --repo-strategy=rewrite --source-repo=https://example.com/acme.git
  node index.mjs acme-ark --remote=git@github.com:acme/ark.git --role-test-commits --push
  node index.mjs acme-ark --config=./scrum.config.json --dry-run

配置文件示例 (JSON):
  {
    "projectName": "acme-ark",
    "repoName": "acme-ark-app",
    "type": "new",
    "repoStrategy": "create",
    "sourceRepo": "",
    "preset": "tech",
    "gitRoot": "repo",
    "setupWorktrees": true,
    "roleTestCommits": false,
    "remoteUrl": "git@github.com:acme/acme-ark-app.git",
    "pushRemote": false,
    "defaultBranch": "main",
    "sprintNumber": 1,
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
  if (!options.repoStrategy) {
    options.repoStrategy = DEFAULT_REPO_STRATEGY[options.type] || "create";
  }
  if (!REPO_STRATEGIES[options.repoStrategy]) options.repoStrategy = "create";
  if (!ROLE_PRESETS[options.preset]) options.preset = "tech";
  if (
    options.repoStrategy === "reuse"
    && !options._gitRootFromCli
    && !options._gitRootFromConfig
  ) {
    options.gitRoot = "none";
  }
  if (
    options.repoStrategy === "reuse"
    && !options._worktreesFromCli
    && !options._worktreesFromConfig
  ) {
    options.setupWorktrees = false;
  }
  if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "repo";
  if (options.gitRoot !== "repo" && !options._worktreesFromCli) options.setupWorktrees = false;
  if (!options.setupWorktrees) options.roleTestCommits = false;

  validateOptions(options);
  const roles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber);
  validateRoles(roles, options.pushRemote);
  const replacements = buildReplacements(options, roles);
  const target = path.resolve(process.cwd(), options.projectName);

  const plan = filterTemplatePlan(
    collectTemplatePlan(templateDir, target, replacements, []),
    target,
    replacements,
    options,
  );

  if (options.dryRun) {
    console.log(`\n[dry-run] 目标目录：${target}`);
    console.log(`[dry-run] 项目类型：${replacements.PROJECT_TYPE_LABEL}`);
    console.log(`[dry-run] 仓库策略：${replacements.REPO_STRATEGY_LABEL}`);
    console.log(`[dry-run] 来源仓库：${replacements.SOURCE_REPO}`);
    console.log(`[dry-run] 角色套装：${replacements.ROLE_PRESET_LABEL}`);
    console.log(`[dry-run] 代码位置：${replacements.REPO_WORKSPACE_LOCATION}`);
    console.log(`[dry-run] Git 模式：${options.gitRoot}`);
    console.log(`[dry-run] 角色 worktree：${options.setupWorktrees ? "5 个" : "不创建"}`);
    console.log(`[dry-run] 角色测试提交：${options.roleTestCommits ? "创建" : "不创建"}`);
    console.log(`[dry-run] 远端：${options.remoteUrl || "不配置"}${options.pushRemote ? "（将推送）" : ""}`);
    console.log(`[dry-run] 计划创建 ${plan.filter((i) => i.type === "dir").length} 个目录、${plan.filter((i) => i.type === "file").length} 个文件。`);
    for (const item of plan) {
      const rel = path.relative(target, item.dest) || ".";
      console.log(`  ${item.type === "dir" ? "DIR " : "FILE"}  ${rel}`);
    }
    return;
  }

  ensureCanWrite(target, options.force);
  applyTemplatePlan(plan, replacements);
  const gitResult = setupGitWorkspace(target, options, replacements.REPO_NAME, roles);

  console.log(`\n已创建 Scrum 团队协同工作区：${target}`);
  console.log(`项目类型：${replacements.PROJECT_TYPE_LABEL}`);
  console.log(`仓库策略：${replacements.REPO_STRATEGY_LABEL}`);
  console.log(`角色套装：${replacements.ROLE_PRESET_LABEL}`);
  console.log(`代码位置：${replacements.REPO_WORKSPACE_LOCATION}`);
  if (gitResult.gitTarget) {
    console.log(`Git 仓库：${gitResult.gitTarget}`);
    console.log(`Sprint 集成分支：${gitResult.sprintBranch}`);
    console.log(`角色 worktree：${gitResult.worktrees.length} 个`);
  }
  console.log("\n下一步：");
  console.log("1. 打开 00_项目导航/00_项目首页.md");
  console.log("2. 检查 00_项目导航/02_角色与联系方式.md");
  console.log("3. 确认本 Sprint 仓库策略，完善 10_代码仓库/00_仓库清单.md");
  console.log("4. 校准 03_迭代运行/Sprint-0-启动/01_Sprint流程监控台.md");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
