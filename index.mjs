#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { HAT_LABELS } from "./template/tools/lib/team-model.mjs";

const HAT_LABELS_MAP = HAT_LABELS;

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

// 默认邮箱 “+” 后缀映射：大部分 slot.id 直接对应，TL 兼 Sr.BE 使用 tl_srbe。
const ROLE_EMAIL_TAG = Object.fromEntries(ROLE_SLOTS.map((s) => [s.id, s.id]));
ROLE_EMAIL_TAG.tl = "tl_srbe";
const DEFAULT_EMAIL_BASE = "kingcicou.zmh";
const DEFAULT_EMAIL_DOMAIN = "gmail.com";
// 占位邮箱正则：匹配默认 Gmail "+" 地址和旧版 @example.com。
const PLACEHOLDER_EMAIL_RE = new RegExp(
  `(kingcicou\\.zmh\\+[a-z0-9_]+@gmail\\.com$|@(example\\.(com|org|net)|localhost)$)`,
  "i",
);

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

// ──────────────────────────────────────────────────────────────
// v1.1.0: 团队档位（TEAM_PROFILES）与启动模式（STARTUP_MODES）
// ──────────────────────────────────────────────────────────────

const TEAM_PROFILES = {
  "full-7": {
    label: "全员 7 人（兼容 rc.8）",
    members: ROLE_SLOTS.map((s) => ({
      id: s.id,
      primarySlot: s.id,
      title: s.title,
      shortTitle: s.shortTitle,
      identity: s.identity,
      hats: s.hats,
      hatIds:
        s.id === "tl" ? ["tl", "architecture"]
        : s.id === "midbe" ? ["backend", "qa"]
        : s.id === "srfe" ? ["frontend", "ux"]
        : s.id === "midfe" ? ["frontend", "qa"]
        : s.id === "fs" ? ["fs", "devops"]
        : [],
      skills: s.skills,
      backup: s.backup,
      soul: s.soul,
      roleCode: s.roleCode,
      branchRole: s.branchRole,
      status: "active",
      worktree: s.worktree,
    })),
    scrum: {
      productOwner: "po",
      scrumMaster: "sm",
      developers: ["tl", "midbe", "srfe", "midfe", "fs"],
    },
  },

  core: {
    label: "核心启动组（PO/SM/TL 激活，其余待定）",
    members: ROLE_SLOTS.map((s) => ({
      id: s.id,
      primarySlot: s.id,
      title: s.title,
      shortTitle: s.shortTitle,
      identity: s.identity,
      hats: s.hats,
      hatIds:
        s.id === "tl" ? ["tl", "architecture"]
        : s.id === "midbe" ? ["backend", "qa"]
        : s.id === "srfe" ? ["frontend", "ux"]
        : s.id === "midfe" ? ["frontend", "qa"]
        : s.id === "fs" ? ["fs", "devops"]
        : [],
      skills: s.skills,
      backup: s.backup,
      soul: s.soul,
      roleCode: s.roleCode,
      branchRole: s.branchRole,
      status:
        ["po", "sm", "tl"].includes(s.id) ? "active"
        : s.id === "srfe" ? "optional" : "planned",
      worktree: s.id === "tl",
    })),
    scrum: {
      productOwner: "po",
      scrumMaster: "sm",
      developers: ["tl", "midbe", "srfe", "midfe", "fs"],
    },
  },

  "balanced-5": {
    label: "平衡 5 人小队",
    members: [
      {
        id: "po", primarySlot: "po",
        title: "产品负责人 PO", shortTitle: "PO",
        identity: "价值掌舵者", hats: "PO", hatIds: [],
        skills: "Product, Discovery, Prioritization",
        backup: "SM 临时代主持评审", soul: ROLE_SLOTS[0].soul,
        roleCode: "PO_PM", branchRole: "po-pm",
        status: "active", worktree: false,
      },
      {
        id: "sm", primarySlot: "sm",
        title: "Scrum Master", shortTitle: "SM",
        identity: "流程守护者", hats: "SM", hatIds: [],
        skills: "Facilitation, Coaching, Flow",
        backup: "敏捷教练或轮值 SM", soul: ROLE_SLOTS[1].soul,
        roleCode: "SM", branchRole: "sm",
        status: "active", worktree: false,
      },
      {
        id: "tl", primarySlot: "tl",
        title: "技术负责人 / 高级后端", shortTitle: "TL/Sr.BE",
        identity: "演进式架构守护者", hats: "Tech Lead, Architect, Sr.BE",
        hatIds: ["tl", "architecture"],
        skills: "BE, Architecture, Review",
        backup: "fefs 备份架构讨论", soul: ROLE_SLOTS[2].soul,
        roleCode: "TL_SrBE", branchRole: "tl-sr-be",
        status: "active", worktree: true,
      },
      {
        id: "beqa", primarySlot: "midbe",
        title: "后端工程师（兼 QA 接口侧）", shortTitle: "BE/QA",
        identity: "业务逻辑精准执行者", hats: "Mid.BE, QA API/Integration",
        hatIds: ["backend", "qa"],
        skills: "BE, QA, Integration Test",
        backup: "TL 指导", soul: ROLE_SLOTS[3].soul,
        roleCode: "MidBE_QA", branchRole: "mid-be-qa",
        status: "active", worktree: true,
      },
      {
        id: "fefs", primarySlot: "fs",
        title: "前端全栈工程师（兼 DevOps）", shortTitle: "FE/FS/DevOps",
        identity: "全链路闭环者", hats: "Sr.FE, Full-stack, DevOps",
        hatIds: ["frontend", "fs", "devops"],
        skills: "FE, FS, DevOps, CI/CD",
        backup: "TL 备份后端", soul: ROLE_SLOTS[6].soul,
        roleCode: "SrFE_FS_DevOps", branchRole: "fe-fs-devops",
        status: "active", worktree: true,
      },
    ],
    scrum: {
      productOwner: "po",
      scrumMaster: "sm",
      developers: ["tl", "beqa", "fefs"],
    },
  },

  "lean-3": {
    label: "精简 3 人交付组",
    members: [
      {
        id: "product-coach", primarySlot: "po",
        title: "产品教练（PO+SM）", shortTitle: "PO/SM",
        identity: "价值掌舵与流程守护", hats: "PO, SM", hatIds: [],
        skills: "Product, Scrum, Prioritization",
        backup: "tech-builder 临时代主持", soul: ROLE_SLOTS[0].soul,
        roleCode: "PO_SM", branchRole: "po-sm",
        status: "active", worktree: false,
      },
      {
        id: "tech-builder", primarySlot: "tl",
        title: "技术构建者（TL+后端+QA）", shortTitle: "TL/BE/QA",
        identity: "演进式架构与交付", hats: "Tech Lead, Backend, QA",
        hatIds: ["tl", "architecture", "backend", "qa"],
        skills: "BE, Architecture, QA, Review",
        backup: "delivery-builder 备份后端", soul: ROLE_SLOTS[2].soul,
        roleCode: "TL_BE_QA", branchRole: "tl-be-qa",
        status: "active", worktree: true,
      },
      {
        id: "delivery-builder", primarySlot: "fs",
        title: "交付构建者（前端+全栈+DevOps）", shortTitle: "FE/FS/DevOps",
        identity: "全链路闭环者", hats: "Frontend, Full-stack, DevOps",
        hatIds: ["frontend", "fs", "devops"],
        skills: "FE, FS, DevOps, CI/CD",
        backup: "tech-builder 备份前端", soul: ROLE_SLOTS[6].soul,
        roleCode: "FE_FS_DevOps", branchRole: "fe-fs-devops",
        status: "active", worktree: true,
      },
    ],
    scrum: {
      productOwner: "product-coach",
      scrumMaster: "product-coach",
      developers: ["tech-builder", "delivery-builder"],
    },
  },

  "lean-2": {
    label: "极简 2 人交付组",
    members: [
      {
        id: "lead-a", primarySlot: "po",
        title: "负责人 A（PO+TL+后端）", shortTitle: "PO/TL/BE",
        identity: "价值掌舵与架构落地", hats: "PO, Tech Lead, Backend, Architecture",
        hatIds: ["architecture", "backend"],
        skills: "Product, BE, Architecture, Review",
        backup: "lead-b 备份后端", soul: ROLE_SLOTS[2].soul,
        roleCode: "PO_TL_BE", branchRole: "po-tl-be",
        status: "active", worktree: true,
      },
      {
        id: "lead-b", primarySlot: "sm",
        title: "负责人 B（SM+前端+全栈+DevOps+QA）", shortTitle: "SM/FE/FS/DevOps/QA",
        identity: "流程守护与全链路交付", hats: "SM, Frontend, Full-stack, DevOps, QA",
        hatIds: ["frontend", "fs", "devops", "qa"],
        skills: "FE, FS, DevOps, QA, Scrum",
        backup: "lead-a 备份前端", soul: ROLE_SLOTS[6].soul,
        roleCode: "SM_FE_FS_DevOps_QA", branchRole: "sm-fe-fs-devops-qa",
        status: "active", worktree: true,
      },
    ],
    scrum: {
      productOwner: "lead-a",
      scrumMaster: "lead-b",
      developers: ["lead-a", "lead-b"],
    },
  },
};

const STARTUP_MODES = {
  "discovery-first": {
    label: "先探索（仅文档仓 Git，不建代码仓）",
    gitRoot: "workspace",
    createCodeRepo: false,
    createWorktrees: false,
  },
  "delivery-ready": {
    label: "直接交付（文档仓 + 独立代码仓 + worktree）",
    gitRoot: "workspace",
    createCodeRepo: true,
    createWorktrees: true,
  },
};

function isOldRepoMode(options) {
  return options.gitRoot === "repo" && options._gitRootFromCli && options.startupMode !== "delivery-ready";
}

function resolveDefaults(options) {
  // 兼容旧参数：--team-stage → --team-profile
  if (options.teamStage && !options.teamProfile) {
    options.teamProfile = options.teamStage === "core" ? "core" : "full-7";
  }
  // 兼容旧参数：--preset → --name-preset
  if (options.preset && !options.namePreset) {
    options.namePreset = options.preset;
  }
  // 兼容旧参数：--code-repo → --startup-mode
  if (options._codeRepoFromCli && !options.startupMode) {
    options.startupMode = options.gitRoot === "repo" ? "delivery-ready" : "discovery-first";
  }
  // 兼容旧参数：--git-root=repo → 不映射到 delivery-ready（旧单仓模式继续工作）

  if (!options.teamProfile) options.teamProfile = options._teamStageFromCli ? (options.teamStage === "core" ? "core" : "full-7") : "full-7";
  if (!options.namePreset) options.namePreset = options.preset || "tech";

  // startup-mode 默认推导
  if (!options.startupMode) {
    if (options.gitRoot === "repo" && options._gitRootFromCli) {
      // 旧 --git-root=repo 继续工作，不映射到 delivery-ready
      options.startupMode = "discovery-first";
    } else if (options.teamProfile === "core") {
      options.startupMode = "discovery-first";
    } else if (["lean-2", "lean-3", "balanced-5"].includes(options.teamProfile)) {
      options.startupMode = "delivery-ready";
    } else {
      options.startupMode = "discovery-first";
    }
  }

  // team-profile 默认推导（仅当用户指定了 startup-mode 但没指定 team-profile）
  if (options._startupModeFromCli && !options._teamProfileFromCli && !options._teamStageFromCli) {
    if (options.startupMode === "delivery-ready" && options.teamProfile === "full-7") {
      options.teamProfile = "balanced-5";
    } else if (options.startupMode === "discovery-first" && options.teamProfile === "full-7") {
      // 用户显式选 discovery-first，默认推荐 core
      // 但如果同时指定了 team-profile，则尊重用户选择
    }
  }

  // 同步 gitRoot：delivery-ready 的 gitRoot 保持 workspace（双仓模式）
  const mode = STARTUP_MODES[options.startupMode];
  if (mode && !options._gitRootFromCli) {
    options.gitRoot = mode.gitRoot;
  }

  // delivery-ready 模式下自动设置 setupWorktrees
  if (mode && mode.createWorktrees && !options._worktreesFromCli) {
    options.setupWorktrees = true;
  }
  // discovery-first 模式下不创建 worktree（但旧 --git-root=repo 模式保持原行为）
  if (mode && !mode.createWorktrees && !options._worktreesFromCli && !isOldRepoMode(options)) {
    options.setupWorktrees = false;
  }
  // 旧 --git-root=repo 模式：默认创建 worktree（除非用户显式 --no-worktrees）
  if (isOldRepoMode(options) && !options._worktreesFromCli) {
    options.setupWorktrees = true;
  }

  return options;
}

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
const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
).version;

function parseArgs(argv) {
  const result = {
    projectName: "",
    repoName: "",
    type: "new",
    repoStrategy: "",
    sourceRepo: "",
    preset: "tech",
    namePreset: "",
    teamStage: "",
    teamProfile: "",
    startupMode: "",
    roleOverrides: {},
    emailOverrides: {},
    gitRoot: "workspace",
    setupWorktrees: true,
    roleTestCommits: false,
    remoteUrl: "",
    pushRemote: false,
    defaultBranch: "main",
    sprintNumber: 1,
    initialSignoff: "auto",
    initialSignoffDue: "+72h",
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
    else if (arg.startsWith("--code-repo=")) {
      // RC3：now=现在建代码仓（旧行为）；defer=默认只文档 Git，代码仓延后
      const mode = arg.slice("--code-repo=".length);
      result.gitRoot = mode === "now" ? "repo" : "workspace";
      result._gitRootFromCli = true;
      result._codeRepoFromCli = true;
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
    else if (arg.startsWith("--team-stage=")) {
      // 兼容：--team-stage=core → teamProfile=core；--team-stage=full → teamProfile=full-7
      const stage = arg.slice("--team-stage=".length);
      result.teamStage = stage;
      result.teamProfile = stage === "core" ? "core" : "full-7";
      result._teamStageFromCli = true;
      result._teamProfileFromCli = true;
    }
    else if (arg.startsWith("--team-profile=")) {
      result.teamProfile = arg.slice("--team-profile=".length);
      result._teamProfileFromCli = true;
    }
    else if (arg.startsWith("--startup-mode=")) {
      result.startupMode = arg.slice("--startup-mode=".length);
      result._startupModeFromCli = true;
    }
    else if (arg.startsWith("--name-preset=")) {
      result.namePreset = arg.slice("--name-preset=".length);
      result._namePresetFromCli = true;
      result.preset = result.namePreset;
      result._presetFromCli = true;
    }
    else if (arg.startsWith("--initial-signoff=")) {
      result.initialSignoff = arg.slice("--initial-signoff=".length);
      result._initialSignoffFromCli = true;
    }
    else if (arg.startsWith("--initial-signoff-due=")) {
      result.initialSignoffDue = arg.slice("--initial-signoff-due=".length);
      result._initialSignoffDueFromCli = true;
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
      // 兼容：--preset → namePreset
      result.preset = arg.slice("--preset=".length);
      result.namePreset = result.preset;
      result._presetFromCli = true;
      result._namePresetFromCli = true;
    }
    else if (arg.startsWith("--roles=")) {
      result.preset = arg.slice("--roles=".length);
      result.namePreset = result.preset;
      result._presetFromCli = true;
      result._namePresetFromCli = true;
    }
    else if (arg.startsWith("--repo=")) {
      result.repoName = arg.slice("--repo=".length);
      result._repoNameFromCli = true;
    }
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
  // RC3：显式命名代码仓（--repo）默认视为“现在建”，除非显式 --git-root/--code-repo。
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
  if (raw.preset && !options._presetFromCli) {
    options.preset = String(raw.preset);
    if (!options._namePresetFromCli) options.namePreset = options.preset;
  }
  if (raw.namePreset && !options._namePresetFromCli) {
    options.namePreset = String(raw.namePreset);
    options.preset = options.namePreset;
  }
  if (raw.teamProfile && !options._teamProfileFromCli) {
    options.teamProfile = String(raw.teamProfile);
  }
  if (raw.startupMode && !options._startupModeFromCli) {
    options.startupMode = String(raw.startupMode);
  }
  if (raw.teamStage && !options._teamStageFromCli) {
    options.teamStage = String(raw.teamStage);
    if (!options._teamProfileFromCli) {
      options.teamProfile = raw.teamStage === "core" ? "core" : "full-7";
    }
  }
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
  if (raw.initialSignoff && !options._initialSignoffFromCli) {
    options.initialSignoff = String(raw.initialSignoff);
  }
  if (raw.initialSignoffDue && !options._initialSignoffDueFromCli) {
    options.initialSignoffDue = String(raw.initialSignoffDue);
  }
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
    // ── 启动路线（先问 startup-mode，再推导 gitRoot，避免先选 gitRoot 后被覆盖） ──
    options.startupMode = await askChoice(
      rl,
      "启动模式",
      Object.fromEntries(Object.entries(STARTUP_MODES).map(([key, value]) => [key, value.label])),
      options.startupMode || "discovery-first",
    );
    options.teamProfile = await askChoice(
      rl,
      "团队档位",
      Object.fromEntries(Object.entries(TEAM_PROFILES).map(([key, value]) => [key, value.label])),
      options.teamProfile || "full-7",
    );
    options.preset = await askChoice(
      rl,
      "角色命名套装",
      Object.fromEntries(Object.entries(ROLE_PRESETS).map(([key, value]) => [key, value.label])),
      options.preset,
    );

    // 从 startup-mode 推导 gitRoot 和 setupWorktrees（delivery-ready 和 discovery-first 均为 workspace）
    const mode = STARTUP_MODES[options.startupMode];
    if (mode && !options._gitRootFromCli) options.gitRoot = mode.gitRoot;
    if (mode && !options._worktreesFromCli) options.setupWorktrees = mode.createWorktrees;

    // 仅在非 CLI 指定时，交互确认是否跳过 Git
    if (!options._gitRootFromCli) {
      options.gitRoot = await askChoice(
        rl,
        "Git 初始化",
        {
          workspace: options.startupMode === "delivery-ready"
            ? "初始化文档治理仓 + 独立代码仓（双仓模式，推荐）"
            : "初始化文档治理仓（推荐）",
          none: "完全不初始化 Git",
        },
        options.gitRoot,
      );
    }

    options.initialSignoff = await askChoice(
      rl,
      "首次入队签核",
      {
        auto: "条件满足时自动生成 Campaign 与 Notice（推荐）",
        guide: "只生成后续操作指引",
        off: "暂不启用",
      },
      options.initialSignoff,
    );
    if (options.initialSignoff !== "off") {
      options.initialSignoffDue = await ask(
        rl,
        "首签提醒截止（+72h 或带时区的时间）",
        options.initialSignoffDue,
      );
    }

    console.log("\n当前角色配置：");
    printRoleSummary(buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber, options.teamProfile));
    const customize = await ask(
      rl,
      "要调整哪些成员？输入 memberId 并用逗号分隔，all=全部，none=不调整",
      "none",
    );
    if (customize.trim().toLowerCase() !== "none") {
      const base = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber, options.teamProfile);
      const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
      const requested = customize.trim().toLowerCase() === "all"
        ? new Set(profile.members.map((m) => m.id))
        : new Set(customize.split(",").map((id) => id.trim()));
      for (const member of profile.members.filter((m) => requested.has(m.id))) {
        const currentRole = base.find((role) => role.id === member.id);
        const currentName = currentRole?.name || "";
        const nextName = await ask(rl, `${member.shortTitle} 名称`, currentName);
        if (nextName && nextName !== currentName) options.roleOverrides[member.id] = nextName;
        const effectiveName = nextName || currentName;
        const emailTag = member.id.replace(/-/g, "_");
        const defaultEmail = options.emailOverrides[member.id] || `${DEFAULT_EMAIL_BASE}+${emailTag}@${DEFAULT_EMAIL_DOMAIN}`;
        const nextEmail = await ask(rl, `${member.shortTitle} 邮箱`, defaultEmail);
        if (nextEmail && nextEmail !== defaultEmail) options.emailOverrides[member.id] = nextEmail;
      }
    }

    if (!PROJECT_TYPES[options.type]) options.type = "new";
    if (!ROLE_PRESETS[options.preset]) options.preset = "tech";
    if (!TEAM_PROFILES[options.teamProfile]) options.teamProfile = "full-7";
    if (!STARTUP_MODES[options.startupMode]) options.startupMode = "discovery-first";
    if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "workspace";
    // delivery-ready 或旧 repo 模式下可创建 worktree
    if ((options.startupMode === "delivery-ready" || options.gitRoot === "repo") && options.setupWorktrees) {
      const setup = await ask(rl, "是否统一创建编码角色 worktree？(Y/n)", "Y");
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

    const summaryRoles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber, options.teamProfile);
    validateOptions(options);
    validateRoles(summaryRoles, options.pushRemote);
    console.log("\n=== 即将创建的工作区 ===");
    console.log(`项目名称：${options.projectName}`);
    console.log(`项目类型：${PROJECT_TYPES[options.type]}`);
    console.log(`仓库策略：${REPO_STRATEGIES[options.repoStrategy]}`);
    console.log(`来源仓库：${options.sourceRepo || "无 / 待确认"}`);
    console.log(`代码仓库：${options.repoName || `${slug(options.projectName)}-app`}`);
    console.log(`Git 模式：${options.gitRoot}（启动模式：${options.startupMode}）`);
    console.log(`团队档位：${TEAM_PROFILES[options.teamProfile]?.label || options.teamProfile}`);
    console.log(`首次签核：${options.initialSignoff}（${options.initialSignoffDue}）`);
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
  const entries = Object.entries(choices);
  const lines = entries
    .map(([key, value], idx) => `  ${idx + 1}. ${value}  [${key}]`)
    .join("\n");
  const defaultIdx = entries.findIndex(([key]) => key === defaultKey);
  const defaultLabel =
    defaultIdx >= 0
      ? `${defaultIdx + 1} - ${entries[defaultIdx][1]}`
      : defaultKey;
  const answer = await rl.question(`${label}:\n${lines}\n选择 (序号或名称，默认 ${defaultLabel}): `);
  const trimmed = answer.trim();
  if (!trimmed) return defaultKey;
  // 纯数字 → 按序号选择
  if (/^\d+$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    if (idx >= 0 && idx < entries.length) return entries[idx][0];
    return defaultKey;
  }
  // 否则按 key 匹配
  const key = trimmed.toLowerCase();
  return choices[key] ? key : defaultKey;
}

function buildRoles(presetKey, overrides, emailOverrides = {}, sprintNumber = 1, teamProfile = "full-7") {
  const preset = ROLE_PRESETS[presetKey] || ROLE_PRESETS.tech;
  const profile = TEAM_PROFILES[teamProfile] || TEAM_PROFILES["full-7"];
  return profile.members.map((member) => {
    const slotId = member.primarySlot;
    const name = overrides[member.id] || preset.names[slotId] || member.id;
    const nameSlug = slug(name, member.id);
    const emailTag = member.id.replace(/-/g, "_");
    const email = emailOverrides[member.id] || `${DEFAULT_EMAIL_BASE}+${emailTag}@${DEFAULT_EMAIL_DOMAIN}`;
    return {
      ...member,
      name,
      dirName: `${safePathSegment(name, member.id)}_${member.id.replace(/-/g, "_")}`,
      branchName: member.worktree
        ? `feature/sprint-${sprintNumber}/initial-work-${nameSlug}-${member.branchRole}`
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
  if (options.repoStrategy === "reuse" && (options.gitRoot === "repo" || options.startupMode === "delivery-ready")) {
    throw new Error("reuse 策略不会初始化或复制现有代码仓；请使用 --git-root=none 或 workspace，或 --startup-mode=discovery-first。");
  }
  // v1.1.0: delivery-ready 双仓模式下也允许 worktree（gitRoot=workspace + 独立代码仓）
  if (options.setupWorktrees && options.gitRoot !== "repo" && options.startupMode !== "delivery-ready") {
    throw new Error("自动角色 worktree 仅支持 --git-root=repo 或 --startup-mode=delivery-ready；请改用 --no-worktrees。");
  }
  if (options.roleTestCommits && !options.setupWorktrees) {
    throw new Error("--role-test-commits 需要启用角色 worktree。");
  }
  // v1.1.0: team-profile 和 startup-mode 合法性校验
  if (options.teamProfile && !TEAM_PROFILES[options.teamProfile]) {
    throw new Error(`--team-profile 值非法：${options.teamProfile}。可用值：${Object.keys(TEAM_PROFILES).join(", ")}`);
  }
  if (options.startupMode && !STARTUP_MODES[options.startupMode]) {
    throw new Error(`--startup-mode 值非法：${options.startupMode}。可用值：${Object.keys(STARTUP_MODES).join(", ")}`);
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
    if (requireRealEmails && PLACEHOLDER_EMAIL_RE.test(role.email)) {
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

// v1.1.0: roleStatusFor 已移除，状态直接在 TEAM_PROFILES member.status 中

function buildReplacements(options, roles) {
  const preset = ROLE_PRESETS[options.preset] || ROLE_PRESETS.tech;
  const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
  const projectName = options.projectName;
  const repoName = options.repoName || `${slug(projectName)}-app`;
  const today = new Date().toISOString().slice(0, 10);
  const worktreeRoles = roles.filter((role) => role.worktree);
  const sourceRepo = safeRemoteUrl(options.sourceRepo) || "待确认";
  const isReuse = options.repoStrategy === "reuse";
  // delivery-ready 双仓模式或旧 --git-root=repo 都意味着代码仓已创建
  const codeRepoNow = options.gitRoot === "repo" || options.startupMode === "delivery-ready";
  const repoWorkspaceLocation = codeRepoNow
    ? `10_代码仓库/${repoName}/`
    : isReuse
      ? `待接入现有仓库：${sourceRepo}`
      : "Sprint 0 仓库决策卡待审核；尚未创建代码仓";
  const repoAction = {
    reuse: "取得现有仓库权限，基于当前稳定分支建立 Sprint 集成分支；不复制代码历史",
    import: "冻结来源快照，完成去敏与清单核对后导入目标仓库",
    rewrite: "旧仓保持可维护，新仓验证新技术栈；达到切换门禁前不得替换生产主仓",
    create: "完成技术选型、代码骨架、CI 和首个可运行增量",
  }[options.repoStrategy];

  // v2 member-hat-v1 格式生成
  const members = roles.map((role) => ({
    id: role.id,
    name: role.name,
    email: role.email,
    status: role.status,
  }));
  const scrum = profile.scrum;
  const hats = {};
  const assignments = [];
  for (const member of profile.members) {
    for (const hatId of member.hatIds || []) {
      if (!hats[hatId]) {
        const label = HAT_LABELS_MAP[hatId] || hatId;
        hats[hatId] = { label };
      }
      assignments.push({
        memberId: member.id,
        hatId,
        kind: "primary",
        status: member.status === "active" ? "active" : member.status,
      });
    }
  }
  const worktreeRecords = worktreeRoles.map((role) => ({
    memberId: role.id,
    dirName: role.dirName,
    branchName: role.branchName,
  }));

  // 从 scrum 查找 PO/SM/TL 名称
  const poName = roles.find((r) => r.id === scrum.productOwner)?.name ?? scrum.productOwner;
  const smName = roles.find((r) => r.id === scrum.scrumMaster)?.name ?? scrum.scrumMaster;
  const tlId = scrum.developers.find((id) => profile.members.find((m) => m.id === id)?.hatIds?.includes("tl")) || scrum.developers[0];
  const tlName = roles.find((r) => r.id === tlId)?.name ?? tlId;
  // FS 执行人：从 hat 找，不找固定 memberId
  const fsMemberId = profile.members.find((m) => m.hatIds?.includes("fs"))?.id || "fs";
  const fsName = roles.find((r) => r.id === fsMemberId)?.name ?? fsMemberId;
  // 后端执行人
  const beMemberId = profile.members.find((m) => m.hatIds?.includes("backend"))?.id || "midbe";
  const beName = roles.find((r) => r.id === beMemberId)?.name ?? beMemberId;
  // 前端执行人
  const feMemberId = profile.members.find((m) => m.hatIds?.includes("frontend"))?.id || "srfe";
  const feName = roles.find((r) => r.id === feMemberId)?.name ?? feMemberId;
  // QA 执行人
  const qaMemberId = profile.members.find((m) => m.hatIds?.includes("qa"))?.id || "midfe";
  const qaName = roles.find((r) => r.id === qaMemberId)?.name ?? qaMemberId;

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
    REPO_SOP_SETUP_NOTE: codeRepoNow
      ? `代码仓已按 ${options.repoStrategy} 策略初始化于 10_代码仓库/${repoName}/。`
      : `代码仓尚未创建或接入。PO/TL 先审核 Sprint-0/仓库决策卡，再由执行人运行 tools/setup-code-repo.mjs。`,
    CODE_WORKSPACE_REPO_ENTRY: !codeRepoNow
      ? ""
      : `,\n    { "path": "10_代码仓库/${repoName}", "name": "💻 Code Repo" }`,
    REPO_NAME: repoName,
    ROLE_PRESET: options.preset,
    ROLE_PRESET_LABEL: preset.label,
    TEAM_PROFILE: options.teamProfile,
    TEAM_PROFILE_LABEL: profile.label,
    STARTUP_MODE: options.startupMode,
    STARTUP_MODE_LABEL: (STARTUP_MODES[options.startupMode]?.label) || options.startupMode,
    TOOL_VERSION: CLI_VERSION,
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
    ROLE_PO_NAME: poName,
    ROLE_SM_NAME: smName,
    ROLE_TL_NAME: tlName,
    ROLE_MIDBE_NAME: beName,
    ROLE_SRFE_NAME: feName,
    ROLE_MIDFE_NAME: qaName,
    ROLE_FS_NAME: fsName,
    ROLE_TABLE: renderRoleTable(roles),
    ROLE_CARDS: renderRoleCards(roles),
    ABILITY_MATRIX: renderAbilityMatrix(roles),
    BACKUP_TABLE: renderBackupTable(roles),
    TASK_EXECUTION_TABLE: renderTaskExecutionTable(roles, today, options),
    KICKOFF_NOTICE: renderKickoffNotice(roles, options, repoName),
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
    SPRINT0_ASSIGNMENTS: renderSprint0Assignments(roles, profile),
    // v2 member-hat-v1 格式：members/scrum/hats/assignments + teamProfile/startupMode
    // worktrees 为派生记录，不作为团队事实源
    ROLE_JSON: JSON.stringify(
      {
        schemaVersion: 2,
        model: "member-hat-v1",
        teamProfile: options.teamProfile,
        teamStage: options.teamStage || options.teamProfile, // 兼容旧字段
        startupMode: options.startupMode,
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
        initialSignoff: options.initialSignoff,
        initialSignoffDue: options.initialSignoffDue,
        members,
        scrum,
        hats,
        assignments,
        // worktrees 为派生记录：创建时生成，团队事实不从 worktrees 反推
        worktrees: worktreeRecords,
        // 兼容字段：保留 roles/emails/roleDetails 供旧工具读取
        roles: Object.fromEntries(roles.map((role) => [role.id, role.name])),
        emails: Object.fromEntries(roles.map((role) => [role.id, role.email])),
        roleDetails: roles.map(({ id, name, email, roleCode, title, hats: roleHats, skills, backup, worktree, dirName, branchName, status }) => ({
          id,
          name,
          email,
          roleCode,
          title,
          hats: roleHats,
          skills,
          backup,
          worktree,
          dirName,
          branchName,
          status,
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
    "| 成员 | 名称 | 邮箱 | 主身份 | 兼任帽子 | 状态 | 编码工作区 | 备份机制 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...roles.map((role) => `| ${role.id} | ${role.name} | ${role.email} | ${role.title} | ${role.hats} | ${role.status} | ${role.worktree ? role.dirName : "不创建"} | ${role.backup} |`),
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
  // v1.1.0: 从 hatIds 动态生成能力矩阵，不再硬编码 slot ID
  const columns = ["backend", "frontend", "fs", "qa", "devops", "architecture", "ux"];
  const columnLabels = ["BE", "FE", "FS", "QA", "DevOps", "架构", "UX/UI"];
  return [
    `| 成员 | ${columnLabels.join(" | ")} | 帽子 |`,
    `| --- | ${columnLabels.map(() => ":-:").join(" | ")} | --- |`,
    ...roles.map((role) => {
      const hatIds = role.hatIds || [];
      const cells = columns.map((col) => hatIds.includes(col) ? "◎" : "·");
      return `| ${role.name} | ${cells.join(" | ")} | ${role.hats} |`;
    }),
  ].join("\n");
}

function renderBackupTable(roles) {
  return [
    "| 帽子 | 主担 | 备份/兜底 |",
    "| --- | --- | --- |",
    ...roles.map((role) => `| ${role.hats} | ${role.name} | ${role.backup} |`),
  ].join("\n");
}

function findMemberByScrumRole(profile, roles, scrumRole) {
  const id = profile.scrum[scrumRole];
  if (!id) return null;
  return roles.find((r) => r.id === id);
}

function findMemberByHat(profile, roles, hatId) {
  const member = profile.members.find((m) => m.hatIds?.includes(hatId));
  if (!member) return null;
  return roles.find((r) => r.id === member.id);
}

function renderTaskExecutionTable(roles, today, options) {
  const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
  const poRole = findMemberByScrumRole(profile, roles, "productOwner");
  const smRole = findMemberByScrumRole(profile, roles, "scrumMaster");
  const tlRole = findMemberByHat(profile, roles, "tl") || roles.find((r) => r.id === profile.scrum.developers[0]);
  const beRole = findMemberByHat(profile, roles, "backend");
  const feRole = findMemberByHat(profile, roles, "frontend");
  const qaRole = findMemberByHat(profile, roles, "qa");
  const fsRole = findMemberByHat(profile, roles, "fs");
  const fsTask = options.repoStrategy === "reuse"
    ? "接入现有代码仓并验证角色工作区"
    : "验证目标代码仓与角色工作区";
  const fsActions = options.repoStrategy === "reuse"
    ? "确认远端地址/权限/基线分支；建立或验证 Sprint 分支与编码角色工作区；逐人确认可拉取"
    : "核对仓库清单；验证 main、Sprint 分支、角色工作区和 Git 身份；逐人确认可拉取";
  const rows = [
    {
      id: "T01", parent: "Sprint Goal", title: "确认价值目标与首批候选 Story", level: "D 决策",
      complexity: "M", ownerRole: poRole, reviewerRole: smRole, start: "立即；项目背景已知",
      responsibleHat: "po",
      actions: "写清 Sprint Goal；排序候选 Story；为最高优先项补 AC",
      dod: "Goal 可判定；至少 1 个候选 Story 有 AC 和优先级", excludes: "不决定技术实现",
    },
    {
      id: "T02", parent: "Sprint Goal", title: "校准启动节奏、依赖与事实入口", level: "D 流程",
      complexity: "S", ownerRole: smRole, reviewerRole: poRole, start: "立即；无需等待 T01 完成",
      responsibleHat: "sm",
      actions: "发布启动通知；确认任务 Owner(memberId+responsibleHat)；把新增等待/阻塞登记到唯一任务表",
      dod: "全员知道首个动作、前置和状态更新位置", excludes: "不替 PO/TL/FS 作专业决策",
    },
    {
      id: "T03", parent: "T01", title: "形成技术全景与模块拆分草案", level: "A 架构",
      complexity: "L", ownerRole: tlRole, reviewerRole: poRole, start: "可立即起草；定版等待 T01",
      responsibleHat: "tl",
      actions: "记录现状/目标架构；划模块边界；标出需 ADR/Spike 的高风险决策",
      dod: "模块可分派；关键风险、接口和待决策项有明确 Owner", excludes: "不包办各模块实现",
    },
    {
      id: "T04", parent: "T03", title: "后端/API/数据切片准备", level: "I/V 准备",
      complexity: "M", ownerRole: beRole, reviewerRole: tlRole, start: "等待 T03 给出模块边界；可先列风险",
      responsibleHat: "backend",
      actions: "细化接口与数据候选；补异常场景和测试点；估算可实现切片",
      dod: "首个后端切片具备输入、输出、AC、测试点和复杂度", excludes: "Sprint 0 不默认要求完整编码",
    },
    {
      id: "T05", parent: "T01/T03", title: "体验基线与前端切片准备", level: "A/I 准备",
      complexity: "M", ownerRole: feRole, reviewerRole: tlRole, start: "可先做体验草案；定版等待 T01/T03",
      responsibleHat: "frontend",
      actions: "明确关键页面/状态/可访问性约束；给出前端模块和首个切片",
      dod: "关键体验约束可验收；前端切片可交给实现角色", excludes: "不要求完成全部视觉稿",
    },
    {
      id: "T06", parent: "T04/T05", title: "联调与 E2E 验证切片准备", level: "V 验证",
      complexity: "S", ownerRole: qaRole, reviewerRole: feRole, start: "等待 T04/T05 的首个切片",
      responsibleHat: "qa",
      actions: "把 AC 转成联调/E2E 场景；确认测试数据、运行入口和证据格式",
      dod: "至少 1 条关键路径可执行、可失败、可留证", excludes: "不为等待中的接口伪造通过证据",
    },
    {
      id: "T07", parent: "工程准入", title: fsTask, level: "O 工程环境",
      complexity: "S", ownerRole: fsRole, reviewerRole: tlRole, start: "立即；仓库策略和角色信息已生成",
      responsibleHat: "devops",
      actions: fsActions,
      dod: "仓库清单准确；编码角色知道仓库/分支/工作区；至少完成一次访问验证",
      excludes: "不默认新建 CI、部署环境或发布流水线",
    },
  ];
  return [
    "| ID | 父项 | 任务 | 级别 | 复杂度 | Owner（memberId） | 责任帽子 | Reviewer | 可开始条件 | 具体动作 | 完成标准（DoD） | 不包含 | 状态 | 更新 |",
    "| --- | --- | --- | --- | :---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      `| ${row.id} | ${row.parent} | ${row.title} | ${row.level} | ${row.complexity} | ${row.ownerRole?.name || "待定"} (${row.ownerRole?.id || "待定"}) | ${row.responsibleHat} | ${row.reviewerRole?.name || "待定"} | ${row.start} | ${row.actions} | ${row.dod} | ${row.excludes} | 未开始 | ${today} |`
    ),
  ].join("\n");
}

function renderKickoffNotice(roles, options, repoName) {
  const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
  const poRole = findMemberByScrumRole(profile, roles, "productOwner");
  const smRole = findMemberByScrumRole(profile, roles, "scrumMaster");
  const tlRole = findMemberByHat(profile, roles, "tl") || roles.find((r) => r.id === profile.scrum.developers[0]);
  const feRole = findMemberByHat(profile, roles, "frontend");
  const beRole = findMemberByHat(profile, roles, "backend");
  const qaRole = findMemberByHat(profile, roles, "qa");
  const fsRole = findMemberByHat(profile, roles, "fs");
  const repoAction = options.repoStrategy === "reuse"
    ? `接入现有仓库 ${safeRemoteUrl(options.sourceRepo) || "（地址待补）"} 并验证角色工作区`
    : `验证目标仓库 10_代码仓库/${repoName}/ 及角色工作区`;
  const lines = [
    `【项目启动通知｜${options.projectName}｜Sprint 0】`,
    `当前阶段：启动与奠基｜项目类型：${PROJECT_TYPES[options.type]}｜仓库策略：${REPO_STRATEGIES[options.repoStrategy]}`,
    "唯一任务入口：03_迭代运行/Sprint-0-启动/01_Sprint任务表与流程看板.md §4",
    "",
    "现在可并行：",
    `@${poRole?.name || "PO"} (${poRole?.id || "po"})｜T01｜确认 Sprint Goal、首批 Story 与 AC｜完成：至少 1 个候选 Story 可判定验收`,
    `@${smRole?.name || "SM"} (${smRole?.id || "sm"})｜T02｜确认全员首个动作、依赖和状态入口｜完成：启动通知已发、Owner(memberId+responsibleHat) 已确认`,
    `@${tlRole?.name || "TL"} (${tlRole?.id || "tl"})｜T03｜起草技术全景与模块边界｜定版等待 T01；完成：模块可分派、风险有 Owner`,
  ];
  if (feRole) {
    lines.push(`@${feRole.name} (${feRole.id})｜T05｜先做体验/前端切片草案｜定版等待 T01/T03`);
  }
  if (fsRole) {
    lines.push(`@${fsRole.name} (${fsRole.id})｜T07｜${repoAction}｜完成：仓库/分支/身份/访问验证可复查`);
  }
  lines.push("", "等待输入，但可先准备：");
  if (beRole) {
    lines.push(`@${beRole.name} (${beRole.id})｜T04｜等待 T03 模块边界；先列 API/数据风险和测试点`);
  }
  if (qaRole && qaRole.id !== beRole?.id) {
    lines.push(`@${qaRole.name} (${qaRole.id})｜T06｜等待 T04/T05 首个切片；先准备联调/E2E 检查清单`);
  }
  lines.push(
    "",
    "明确不做：FS 本轮不默认新建 CI、部署或发布流水线；仅在技术栈、构建方式或平台变化时另建任务。",
    "状态更新：本人只更新任务行的状态、证据和时间；新增等待/阻塞时 @SM。",
    "签核另行处理：收到【签核通知】后，每人只运行 Notice 中本人完整命令；启动通知不等于签核通知。",
  );
  return lines.join("\n");
}

function renderSprint0Assignments(roles, profile) {
  const poRole = findMemberByScrumRole(profile, roles, "productOwner");
  const smRole = findMemberByScrumRole(profile, roles, "scrumMaster");
  const tlRole = findMemberByHat(profile, roles, "tl") || roles.find((r) => r.id === profile.scrum.developers[0]);
  const beRole = findMemberByHat(profile, roles, "backend");
  const feRole = findMemberByHat(profile, roles, "frontend");
  const qaRole = findMemberByHat(profile, roles, "qa");
  const fsRole = findMemberByHat(profile, roles, "fs");
  const poName = poRole?.name || "PO";
  const smName = smRole?.name || "SM";
  const tlName = tlRole?.name || "TL";
  const beName = beRole?.name || "待定";
  const feName = feRole?.name || "待定";
  const qaName = qaRole?.name || "待定";
  const fsName = fsRole?.name || "FS";
  return [
    "| 工作项 | 主责 | 协作 | 输出 |",
    "| --- | --- | --- | --- |",
    `| 产品愿景与首批 Backlog | ${poName} | ${smName}, 全员 | 01_产品发现 / 02_产品待办 |`,
    `| 团队协议与节奏 | ${smName} | 全员 | 00_项目导航 / 03_迭代运行 |`,
    `| 架构草案与 ADR 候选 | ${tlName} | ${fsName}, ${beName} | 04_工程设计 |`,
    `| 后端/API/数据模型初评 | ${tlName} | ${beName} | 04_工程设计/02_API契约 / 03_数据模型 |`,
    `| 前端体验与设计系统初评 | ${feName} | ${qaName} | 04_工程设计/04_前端设计系统 |`,
    `| 测试策略与质量门禁 | ${beName}, ${qaName} | ${tlName} | 05_质量验证 |`,
    `| 代码仓库接入与角色工作区验证 | ${fsName} | ${tlName}, 编码角色 | 仓库清单 / 分支与访问验证 |`,
    `| CI/CD 变化评估（条件触发） | 未分配 | ${fsName}, ${tlName} | 仅技术栈/构建/平台变化时建立 Task |`,
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
  // 旧 --git-root=repo 模式：所有文件在一个 Git 里，不过滤
  if (options.gitRoot === "repo") return plan;
  // delivery-ready 双仓模式：代码仓目录由 setupGitWorkspace 独立处理，从模板计划中排除
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
  if (options.gitRoot === "none") return { gitTarget: "", worktrees: [], codeRepoTarget: "" };

  const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
  // FS 执行人：从 hat 找，不找固定 memberId
  const fsMember = profile.members.find((m) => m.hatIds?.includes("fs"));
  const fsRole = (fsMember && roles.find((r) => r.id === fsMember.id)) || roles[0];
  const sprintBranch = `sprint-${options.sprintNumber}`;
  const isDeliveryReady = options.startupMode === "delivery-ready";
  const isOldRepoMode = options.gitRoot === "repo";

  // ── 旧模式：--git-root=repo（所有文件在一个 Git 里） ──
  if (isOldRepoMode && !isDeliveryReady) {
    const gitTarget = path.join(target, "10_代码仓库", repoName);
    return setupSingleRepoGit(gitTarget, options, roles, fsRole, sprintBranch, repoName, target);
  }

  // ── delivery-ready 双仓模式 或 discovery-first workspace 模式 ──
  // 步骤 1: 文档治理仓 Git init（项目根目录）
  const gitTarget = target;
  runGit(gitTarget, ["init", "-b", options.defaultBranch]);

  // .gitignore 追加代码仓目录（delivery-ready 模式）
  if (isDeliveryReady) {
    const gitignorePath = path.join(gitTarget, ".gitignore");
    const codeRepoEntry = `10_代码仓库/${repoName}/`;
    let gitignoreContent = "";
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    }
    // 检查是否已有非注释的活跃规则
    const hasActiveEntry = gitignoreContent.split("\n").some((line) => line.trim() === codeRepoEntry);
    if (!hasActiveEntry) {
      // 移除模板中的注释行（如 `# 10_代码仓库/signoff-app/`），避免活跃行与注释行并存
      const commentedEntry = `# ${codeRepoEntry}`;
      const lines = gitignoreContent.split("\n").filter((line) => line.trim() !== commentedEntry);
      gitignoreContent = lines.join("\n").trimEnd() + "\n" + codeRepoEntry + "\n";
      fs.writeFileSync(gitignorePath, gitignoreContent, "utf8");
    }
  }

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

  // 文档仓 sprint 分支
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
  let codeRepoTarget = "";

  // ── delivery-ready: 独立代码仓 Git init + worktree ──
  if (isDeliveryReady && options.setupWorktrees) {
    codeRepoTarget = path.join(target, "10_代码仓库", repoName);
    fs.mkdirSync(codeRepoTarget, { recursive: true });

    // 步骤 3: 独立代码仓 Git init
    runGit(codeRepoTarget, ["init", "-b", options.defaultBranch]);
    runGit(codeRepoTarget, ["config", "extensions.worktreeConfig", "true"]);
    runGit(codeRepoTarget, ["config", "--worktree", "user.name", fsRole.name]);
    runGit(codeRepoTarget, ["config", "--worktree", "user.email", fsRole.email]);

    // 步骤 4: 代码仓创建 sprint 分支
    // 代码仓需要一个初始提交才能创建分支
    const readmePath = path.join(codeRepoTarget, "README.md");
    fs.writeFileSync(readmePath, `# ${repoName}\n\n代码仓库（独立 Git）\n`, "utf8");
    runGit(codeRepoTarget, ["add", "."]);
    const codeCommit = runGit(
      codeRepoTarget,
      ["commit", "-m", "chore: initialize code repository"],
      { env: commitEnvironment(fsRole), allowFailure: true },
    );
    const codeHasHead = runGit(codeRepoTarget, ["rev-parse", "--verify", "HEAD"], { allowFailure: true }).status === 0;
    if (!codeHasHead) {
      const detail = (codeCommit.stderr || codeCommit.stdout || "").trim();
      throw new Error(`代码仓首次提交失败。${detail ? `\n${detail}` : ""}`);
    }

    const codeSprintExists = runGit(codeRepoTarget, ["show-ref", "--verify", "--quiet", `refs/heads/${sprintBranch}`], {
      allowFailure: true,
    }).status === 0;
    if (!codeSprintExists) runGit(codeRepoTarget, ["branch", sprintBranch, options.defaultBranch]);

    // 步骤 5: 代码仓创建成员 worktree
    const teamworkDir = path.join(codeRepoTarget, "TeamWork");
    fs.mkdirSync(teamworkDir, { recursive: true });
    for (const role of roles.filter((item) => item.worktree)) {
      const worktreePath = path.join(teamworkDir, role.dirName);
      if (fs.existsSync(worktreePath)) {
        throw new Error(`角色工作区已存在，拒绝覆盖：${worktreePath}`);
      }
      runGit(codeRepoTarget, ["worktree", "add", worktreePath, "-b", role.branchName, sprintBranch]);
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

  // ── 旧 --git-root=repo 模式的 worktree ──
  if (isOldRepoMode && options.setupWorktrees) {
    // 已在 setupSingleRepoGit 中处理
    return setupSingleRepoGit(path.join(target, "10_代码仓库", repoName), options, roles, fsRole, sprintBranch, repoName, target);
  }

  if (options.pushRemote && options.remoteUrl) {
    const branches = [options.defaultBranch, sprintBranch, ...worktrees.map(({ role }) => role.branchName)];
    runGit(gitTarget, ["push", "-u", "origin", ...branches]);
  }

  return { gitTarget, worktrees, sprintBranch, codeRepoTarget };
}

// 旧 --git-root=repo 模式：所有文件在一个 Git 里
function setupSingleRepoGit(gitTarget, options, roles, fsRole, sprintBranch, repoName, target) {
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

  if (options.pushRemote && options.remoteUrl) {
    const branches = [options.defaultBranch, sprintBranch, ...worktrees.map(({ role }) => role.branchName)];
    runGit(gitTarget, ["push", "-u", "origin", ...branches]);
  }

  return { gitTarget, worktrees, sprintBranch, codeRepoTarget: "" };
}

function findPython() {
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON, []]]
    : process.platform === "win32"
      ? [["python", []], ["py", ["-3"]]]
      : [["python3", []], ["python", []]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, "--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return command;
  }
  return "";
}

function setupInitialSignoff(target, options, roles, gitResult) {
  if (options.initialSignoff === "off") return { state: "off", reason: "已由创建者关闭" };
  // v1.1.0: 首签只覆盖 active 成员（状态直接在 member.status 中）
  const activeRoles = roles.filter((role) => role.status === "active");
  const placeholderRoles = activeRoles.filter((role) => PLACEHOLDER_EMAIL_RE.test(role.email));
  const python = findPython();
  // delivery-ready 模式下 gitRoot 仍为 workspace，首签在文档仓运行
  // 旧 --git-root=repo 模式不自动首签（项目根不是 Git 仓）
  const eligible = options.initialSignoff === "auto"
    && options.gitRoot === "workspace"
    && Boolean(gitResult.gitTarget)
    && placeholderRoles.length === 0
    && Boolean(python);
  if (!eligible) {
    const reasons = [];
    if (options.gitRoot !== "workspace") reasons.push("项目规范尚未纳入 workspace Git");
    if (placeholderRoles.length) reasons.push(`仍有占位邮箱：${placeholderRoles.map((role) => role.id).join(",")}`);
    if (!python) reasons.push("创建者环境缺少 Python，无法生成首次全局审计");
    if (options.initialSignoff === "guide") reasons.push("创建者选择 guide 模式");
    return { state: "guide", reason: reasons.join("；") || "当前条件不满足自动发起" };
  }

  // 从 team profile 解析 SM 的 memberId（lean 档的 SM 不是 "sm"）
  const profile = TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"];
  const smMemberId = profile.scrum.scrumMaster;

  const tool = path.join(target, "tools", "signoff.mjs");
  const result = spawnSync(
    process.execPath,
    [tool, "bootstrap", `--actor=${smMemberId}`, `--due=${options.initialSignoffDue}`],
    { cwd: target, encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`首签 bootstrap 失败：${detail}`);
  }
  process.stdout.write(result.stdout);
  if (options.pushRemote) {
    runGit(gitResult.gitTarget, ["push", "origin", options.defaultBranch]);
  }
  return { state: "published", reason: "Campaign 与不可变 Notice 已提交" };
}

function printHelp() {
  console.log(`create-scrum-team-workspace

用法:
  node index.mjs <project-name> [options]

选项:
  --type=new|legacy|product|prototype
  --repo-strategy=reuse|import|rewrite|create
  --source-repo=<url-or-path>   现有/来源仓库，仅登记并用于迁移决策
  --startup-mode=discovery-first|delivery-ready
                                 启动模式：先探索（仅文档仓）或直接交付（双仓+worktree）
  --team-profile=full-7|core|balanced-5|lean-3|lean-2
                                 团队档位：5 档预设
  --name-preset=tech|myth|wuxia|compass|studio|greek
                                 成员名称风格（兼容 --preset）
  --repo=<repo-name>
  --role.<memberId>=<name>       指定成员名称
  --email.<memberId>=<email>     为某成员配置真实邮箱
  --worktrees | --no-worktrees  是否创建编码角色 worktree
  --role-test-commits           每个角色分支创建一条身份就绪测试提交
  --remote=<url>                配置代码仓库 origin，不会自动推送
  --push | --no-push            是否将 main、sprint 和角色分支推送到 origin
  --default-branch=<name>       默认分支名，默认 main
  --sprint=<number>             初始 Sprint 编号，默认 1
  --initial-signoff=auto|guide|off
                                 首签：条件满足时自动发起、仅给指引或关闭；默认 auto
  --initial-signoff-due=+72h    首签提醒截止，支持 +Nm/+Nh/+Nd 或 ISO 时间
  --config=<path.json>           从 JSON 配置文件读取参数（CLI 优先级更高）
  --interactive | -i             交互式创建（含摘要确认）
  --dry-run | -n                 仅预览将创建的文件，不写入磁盘
  --list-presets
  --git-root=repo|workspace|none（兼容旧参数；默认 workspace）
  --no-git
  --force                        允许写入非空目录

兼容参数:
  --team-stage=core|full        → --team-profile=core|full-7
  --preset=<style>              → --name-preset=<style>
  --code-repo=now|defer          → --startup-mode=delivery-ready|discovery-first

示例:
  node index.mjs acme-ark --startup-mode=delivery-ready --team-profile=balanced-5
  node index.mjs acme-ark --startup-mode=delivery-ready --team-profile=lean-3 --name-preset=studio
  node index.mjs acme-ark --startup-mode=discovery-first --team-profile=core
  node index.mjs acme-ark --type=product --repo-strategy=reuse --source-repo=https://example.com/acme.git
  node index.mjs acme-ark --remote=git@github.com:acme/ark.git --role-test-commits --push
  node index.mjs acme-ark --config=./scrum.config.json --dry-run

配置文件示例 (JSON):
  {
    "projectName": "acme-ark",
    "repoName": "acme-ark-app",
    "type": "new",
    "repoStrategy": "create",
    "sourceRepo": "",
    "startupMode": "delivery-ready",
    "teamProfile": "lean-3",
    "namePreset": "tech",
    "setupWorktrees": true,
    "roleTestCommits": false,
    "remoteUrl": "git@github.com:acme/acme-ark-app.git",
    "pushRemote": false,
    "defaultBranch": "main",
    "sprintNumber": 1,
    "initialSignoff": "auto",
    "initialSignoffDue": "+72h",
    "roles": { "tech-builder": "Forge" },
    "emails": { "product-coach": "po@example.com" }
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
  resolveDefaults(parsedOptions);
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
  if (!TEAM_PROFILES[options.teamProfile]) options.teamProfile = "full-7";
  if (!STARTUP_MODES[options.startupMode]) options.startupMode = "discovery-first";
  if (
    options.repoStrategy === "reuse"
    && !options._worktreesFromCli
    && !options._worktreesFromConfig
  ) {
    options.setupWorktrees = false;
  }
  if (!["workspace", "repo", "none"].includes(options.gitRoot)) options.gitRoot = "workspace";
  if (!["auto", "guide", "off"].includes(options.initialSignoff)) options.initialSignoff = "auto";
  // delivery-ready 双仓模式：gitRoot 保持 workspace，worktree 由 setupGitWorkspace 双仓逻辑处理
  if (options.startupMode === "delivery-ready" && !options._worktreesFromCli) {
    options.setupWorktrees = true;
  }
  // discovery-first 模式下不创建 worktree（但旧 --git-root=repo 模式保持原行为：默认创建 worktree）
  if (options.startupMode === "discovery-first" && options.gitRoot !== "repo" && !options._worktreesFromCli) {
    options.setupWorktrees = false;
  }
  // 旧 --git-root=repo 模式：默认创建 worktree
  if (options.gitRoot === "repo" && !options._worktreesFromCli && options.startupMode !== "delivery-ready") {
    options.setupWorktrees = true;
  }
  if (options.gitRoot !== "repo" && options.startupMode !== "delivery-ready" && !options._worktreesFromCli) {
    options.setupWorktrees = false;
  }
  if (!options.setupWorktrees) options.roleTestCommits = false;

  validateOptions(options);
  const roles = buildRoles(options.preset, options.roleOverrides, options.emailOverrides, options.sprintNumber, options.teamProfile);
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
    console.log(`[dry-run] 启动模式：${options.startupMode}`);
    console.log(`[dry-run] 团队档位：${options.teamProfile}（${replacements.TEAM_PROFILE_LABEL}）`);
    console.log(`[dry-run] 计划代码仓：${replacements.REPO_NAME}${options.startupMode === "delivery-ready" ? "（双仓模式：文档仓 + 独立代码仓）" : "（是否创建以 Sprint 0 审批为准）"}`);
    console.log(`[dry-run] 代码位置：${replacements.REPO_WORKSPACE_LOCATION}`);
    console.log(`[dry-run] Git 模式：${options.gitRoot}${options.startupMode === "delivery-ready" ? "（文档仓 Git 在项目根，代码仓 Git 独立）" : ""}`);
    const wtRoles = roles.filter((r) => r.worktree);
    console.log(`[dry-run] 角色 worktree：${options.setupWorktrees ? `${wtRoles.length} 个` : "不创建"}`);
    console.log(`[dry-run] 角色测试提交：${options.roleTestCommits ? "创建" : "不创建"}`);
    console.log(`[dry-run] 首签：${options.initialSignoff}（提醒截止 ${options.initialSignoffDue}）`);
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
  const signoffResult = setupInitialSignoff(target, options, roles, gitResult);

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
  // 解析 SM memberId 用于引导提示（lean 档的 SM 不是 "sm"）
  const smGuideActor = (TEAM_PROFILES[options.teamProfile] || TEAM_PROFILES["full-7"]).scrum.scrumMaster;

  console.log("\n下一步（启动与发现顺序）：");
  console.log("1. 打开 00_项目导航/00_项目首页.md，按 30 分钟上手了解流程。");
  console.log("2. 配置团队：完善 02_角色与联系方式.md 与 roles.config.json 的真实姓名/邮箱。");
  console.log("3. 团队学习各角色“必读最小集”与知识库。");
  console.log("4. 全员规范首签：SM 运行 signoff bootstrap → 成员 sign → SM close。");
  console.log("5. 首签关闭后，SM 从首页复制“启动通知”发群，分配 Sprint 0 工作（≠签核通知）。");
  console.log("6. Sprint 0 弄清目标与技术后，经 PO/TL 审批再建代码仓（见 Sprint-0-启动/仓库决策卡.md）：");
  console.log("   node tools/setup-code-repo.mjs propose --strategy=create --repo=<name>");
  console.log("   → approve --actor=po → approve --actor=tl → check → apply");
  if (signoffResult.state === "published") {
    console.log("6. 首签 Notice 已生成：创建者推送后，SM 转发原文并跟踪 status；成员运行本人命令。");
  } else if (signoffResult.state === "guide") {
    console.log(`6. 首签尚未发起（${signoffResult.reason}）。`);
    console.log("   先将整个项目工作区纳入 Git、提交角色事实源并确认真实邮箱，再运行：");
    console.log(`   node tools/signoff.mjs bootstrap --actor=${smGuideActor} --due=${options.initialSignoffDue}`);
  } else {
    console.log("6. 首签自动化已关闭；需要时由创建者运行 signoff bootstrap。");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
