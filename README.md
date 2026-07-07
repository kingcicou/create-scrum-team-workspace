# create-scrum-team-workspace

一个面向 Scrum 团队协作的项目工作区生成器。

它不是单人全栈工程模板，而是用于生成“团队运行 + 工程骨架 + 角色协同 + Sprint 0”的完整工作区。

零依赖、跨平台、开箱即用。

## 🚀 使用方式

### 方式一：Bash 一键执行（macOS / Linux / WSL / Git Bash）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.0.0-rc.8/create.sh) my-project
```

可叠加任意 CLI 选项：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.0.0-rc.8/create.sh) my-project --type=new --preset=tech
```

### 方式二：PowerShell 一键执行（Windows）

```powershell
irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.0.0-rc.8/create.ps1 | iex
```

执行后会进入交互式创建。也可提前设环境变量传项目名与额外参数：

```powershell
$env:PROJECT_NAME="my-project"
$env:SCRUM_TEMPLATE_ARGS="--type=new --preset=tech"
irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.0.0-rc.8/create.ps1 | iex
```

### 方式三：npx（全平台，需 Node.js >= 24）

```bash
# 直接从 GitHub 执行（推荐，与参考仓库一致）
npx -y github:kingcicou/create-scrum-team-workspace#v1.0.0-rc.8 my-project

# 仅预览不写盘
npx -y github:kingcicou/create-scrum-team-workspace#v1.0.0-rc.8 my-project --dry-run

# 交互式
npx -y github:kingcicou/create-scrum-team-workspace#v1.0.0-rc.8 --interactive
```

> 未发布到 npm registry，请使用 `github:` 前缀。

### 方式四：本地 clone

```bash
git clone https://github.com/kingcicou/create-scrum-team-workspace.git
cd create-scrum-team-workspace
node index.mjs my-project --type=new --preset=tech
```

## 特性

- 零依赖 Node.js CLI。
- 支持从零新项目、存量项目重构、成熟产品迭代、原型转正四类项目。
- 项目背景与 Sprint 仓库策略解耦，支持复用现仓、代码导入、新栈重写和从零建仓。
- 内置多套角色命名预设：世界技术大神、中国神话、武侠风格、航海罗盘、独立工作室、希腊神话。
- 支持单个角色改名，例如 `--role.midfe=Aurora`。
- 交互式先列出全部角色，可按槽位调整名称与邮箱，最终统一确认。
- 自动生成角色表、角色 Soul 卡、能力矩阵、备份机制、Sprint 0 分工。
- 默认只初始化文档治理仓；代码仓在 Sprint 0 明确技术方案后，经 PO/TL 审批再创建或接入。
- 使用 worktree 级 Git 配置隔离五个角色的提交身份。
- 支持可选角色就绪测试提交、origin 配置和显式远端推送。
- 自动生成产品、Backlog、Sprint、工程设计、质量、发布、度量、会议决策目录。
- 复用 QFD_Ark Sprint 0 实践沉淀的 `05_输入输出管理规范`、`06_团队输入输出总表` 和 `SM_作战手册` 机制。
- 自动生成 Sprint 任务与流程监控台，展示父项、任务级别、复杂度、Owner、依赖、证据和门禁。
- 首页自动生成可直接发群的首次团队启动通知，按“现在可并行/等待输入”列出每个
  角色的首个 Task；它与角色规范首签 Notice 分离。
- Sprint 0 任务行包含可开始条件、具体动作、DoD 和明确不包含；FS 默认只负责
  仓库与角色工作区就绪，CI/CD、部署和发布按变化与门禁另立任务。
- 自动生成依赖时间线、并行泳道和汇合门，并提供成员状态包、SM 确认与状态纠偏闭环。
- SM/教练可直接生成适合群聊转发的快报、Sprint 流程全景和单角色状态卡。
- SM 查询入口提供“问题→模板”选择和真实示例；`review-status.mjs` 跨平台检查
  Review/Retro 追加名单与重复标题。
- 首次入队签核支持 `bootstrap`：项目创建者确认角色和 workspace Git 后，一次生成
  initial Campaign 与不可变 Notice；SM 原样转发、跟踪和关闭，成员只执行本人命令。
- SM 对后续角色手册签核负责编排和闭环；`prepare --from-audit` 自动生成逐角色纠偏
  范围，`publish` 提交不可变 Notice；成员命令摘要不匹配时
  `sign` 拒绝，项目全局仍有缺口时 `close` 也会拒绝。
- Sprint 经验回流采用“来源、L2 知识、L3 操作、验证、发布、项目闭环”六层
  DoD，避免只修项目或模板功能却遗漏知识传承。
- 角色签核采用 Change/Campaign/Event 文件模型；命令级身份无需改仓库 Git
  配置，同一工作目录的签核写入由互斥锁串行化，事件创建后不可修改。
- **显式文档治理**：普通任务只更新 Sprint 任务表；长期正式产物标记
  `governance: managed`，历史/入口/骨架不追溯清债；高冲突时才升级 PR/CODEOWNERS。
- **成员/帽子模型**：同一成员可承担多个工程帽子；签核按成员一次覆盖其当前责任，
  `team.mjs` 负责入队、换帽、状态和派生视图同步。
- **Sprint关闭经验（v0.5.0）**：提炼QFD_Ark外部评审六条教训，分离时间盒、Goal、遗留处置和下一轮准入，并生成轻量关闭检查表；详见`知识库/Scrum/14_Sprint关闭与证据治理规范.md`。
- **Sprint关闭收口（v0.9.2）**：区分计划周期、工作完成和正式关闭；关闭时
  切换首页/日历/角色入口，以单一事实源归档，并采用平台无关的 CI 最小证据。
- **分级任务执行（v0.7.0）**：高阶角色负责目标、模块拆分、复杂度和 Review；普通执行任务默认只维护状态与证据。
- 项目首页提供 30 分钟上手路径；成员按当前 Task 和角色查阅知识，不要求通读知识库。
- 按仓库策略生成仓库决策卡与清单；显式 `--git-root=repo` 才在创建时生成代码骨架和
  `TeamWork/`，默认由 `setup-code-repo.mjs` 延后执行。
- 代码仓库不维护重复 `01-docs` 文档中心；项目工作区文档是主事实源，代码仓库保留可执行资产和链接。

## 用法详解

```bash
node index.mjs my-project
```

指定项目类型与角色套装：

```bash
node index.mjs acme-ark --type=legacy --preset=greek
```

复用成熟产品的现有代码仓：

```bash
node index.mjs acme-ark \
  --type=product \
  --repo-strategy=reuse \
  --source-repo=https://example.com/acme/ark.git
```

在后续 Sprint 以新技术栈建立候选替代仓：

```bash
node index.mjs acme-next \
  --type=product \
  --repo-strategy=rewrite \
  --source-repo=https://example.com/acme/ark.git \
  --repo=acme-next \
  --sprint=4
```

调整某个角色名称：

```bash
node index.mjs acme-ark --preset=tech --role.midfe=Aurora --role.fs=Atlas
```

为某个角色配置真实邮箱：

```bash
node index.mjs acme-ark --email.po=jobs@acme.com --email.sm=sm@acme.com
```

交互式创建（含“摘要确认”）：

```bash
node index.mjs --interactive
```

仅预览将创建的文件（不写盘）：

```bash
node index.mjs acme-ark --dry-run
```

从 JSON 配置文件读取参数（CLI 优先级更高）：

```bash
node index.mjs --config=./scrum.config.json
```

配置文件示例：

```json
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
  "initialSignoff": "auto",
  "initialSignoffDue": "+72h",
  "roles": { "midfe": "Aurora" },
  "emails": { "po": "po@example.com" }
}
```

把 `10_代码仓库/<repo>` 初始化为独立 Git 主仓库：

```bash
node index.mjs acme-ark --git-root=repo
```

创建角色 worktree，并在各角色分支生成身份就绪测试提交：

```bash
node index.mjs acme-ark --role-test-commits
```

配置远端但暂不推送：

```bash
node index.mjs acme-ark --remote=git@github.com:acme/acme-ark-app.git
```

确认远端为空或允许接收初始化分支后，显式推送：

```bash
node index.mjs acme-ark \
  --config=./team.config.json \
  --remote=git@github.com:acme/acme-ark-app.git \
  --role-test-commits \
  --push
```

`--push` 会拒绝 `@example.com` 等占位邮箱；请先在配置文件或
`--email.<slot>` 中为全部角色填写可追溯邮箱。

### 首次入队签核

默认 `--initial-signoff=auto --initial-signoff-due=+72h`。当使用
`--git-root=workspace`、全员邮箱真实且创建者环境有 Python 时，生成器会自动运行：

```bash
node tools/signoff.mjs bootstrap --actor=sm --due=+72h
```

它从全局审计生成全员逐角色范围，并提交 Campaign 与唯一正式 Notice。创建者负责
推送；SM 原样转发 Notice、运行 `status/close`；成员拉取后运行 Notice 中本人
`sign` 命令。普通成员只需 Node.js 与 Git，Python 仅用于创建者/SM 的实时审计。

`repo/none`、占位邮箱或缺 Python 时自动降级为 `guide`，不会假装首签已发起。
先将项目规范纳入可追溯 Git 事实源，再执行上述命令。可显式使用
`--initial-signoff=guide|off`。

查看全部角色套装：

```bash
node index.mjs --list-presets
```

## 项目类型

| type | 含义 |
| --- | --- |
| `new` | 从零新项目 |
| `legacy` | 存量项目重构 |
| `product` | 成熟产品迭代 |
| `prototype` | 原型转正 |

## Sprint 仓库策略

| 参数 | 适用情形 | 生成行为 |
| --- | --- | --- |
| `--repo-strategy=reuse` | 现有仓可继续迭代 | 登记来源，Sprint 0 审核后接入，不复制代码 |
| `--repo-strategy=import` | 散落/未规范代码需整合 | 登记导入决策，审核冻结、去敏和目标仓 |
| `--repo-strategy=rewrite` | Rust/Svelte 等新栈并行替换 | 登记候选仓、现行仓与切换/回退门禁 |
| `--repo-strategy=create` | 完全从零开发 | 登记新建意图，审核后创建独立代码仓 |

项目类型是背景，仓库策略是 Sprint 决策。生成后的
`10_代码仓库/00_仓库清单.md` 是仓库角色和切换状态的事实源。
未显式指定时采用建议值：`new -> create`、`legacy -> rewrite`、
`product -> reuse`、`prototype -> import`；团队可按实际情况覆盖。

仓库策略只声明意图，不等于立即建仓。默认在 Sprint 0 由 PO/TL 审核后执行：

```bash
node tools/setup-code-repo.mjs propose --strategy=create --repo=my-app
node tools/setup-code-repo.mjs approve --decision=REPO-001 --actor=po
node tools/setup-code-repo.mjs approve --decision=REPO-001 --actor=tl
node tools/setup-code-repo.mjs check --decision=REPO-001
node tools/setup-code-repo.mjs apply --decision=REPO-001
```

`apply` 会再次检查文档仓清洁、双审批、目标目录为空及远端安全；实际执行人从当前
成员/帽子模型解析，不固定为名为 `fs` 的成员。

## 团队生命周期

创建时可先用 `--team-stage=core` 激活 PO、SM、TL 等 Sprint 0 核心专家。后续人员
入队或责任变化必须通过团队工具，不直接手改多个视图：

```bash
node tools/team.mjs list
node tools/team.mjs add --member=alice --name=Alice --email=alice@example.com --status=active --developer
node tools/team.mjs assign --member=alice --hat=backend --status=active
node tools/team.mjs update --member=alice --email=alice.new@example.com
node tools/team.mjs set-status --member=alice --status=inactive
node tools/team.mjs unassign --member=alice --hat=backend
```

工具会校验团队模型、同步任务与联系人视图，并由 SM 的命令级 Git 身份提交事实变化。
入队、激活和有效帽子变化会登记 Change ID；随后 SM 按输出运行
`signoff.mjs prepare --from-audit`，新成员会补签基础基线及其受影响变化。

## 角色套装

| preset | 风格 | 角色 |
| --- | --- | --- |
| `tech` | 世界技术大神（默认） | Jobs / Sutherland / Fowler / Ritchie / Norman / Evan / Torvalds |
| `myth` | 中国神话/上古 | Fuxi / Nuwa / Dayu / Shennong / Zhinu / Jingwei / Nezha |
| `wuxia` | 武侠风格（拼音） | ZhangSanfeng / HongQigong / HuangYaoshi / GuoJing / HuangRong / YangGuo / LinghuChong |
| `compass` | 航海罗盘 | Northstar / Harbor / Compass / Anchor / Horizon / Sail / Voyager |
| `studio` | 独立工作室 | Muse / Tempo / Forge / Kernel / Canvas / Pixel / Bridge |
| `greek` | 希腊神话 | Zeus / Hermes / Daedalus / Hephaestus / Apollo / Iris / Prometheus |

## 可覆盖角色

```bash
--role.po=<name>
--role.sm=<name>
--role.tl=<name>
--role.midbe=<name>
--role.srfe=<name>
--role.midfe=<name>
--role.fs=<name>
--email.<slot>=<email>
```

## Git 初始化模式

| 参数 | 含义 |
| --- | --- |
| `--git-root=workspace`（默认） | 初始化文档治理仓；不创建代码仓或角色 worktree |
| `--git-root=repo` | 技术方案已明确时立即初始化独立代码仓，并可创建编码角色 worktree |
| `--git-root=none` / `--no-git` | 不自动初始化 Git |

相关开关：

| 参数 | 含义 |
| --- | --- |
| `--worktrees` / `--no-worktrees` | 开启或关闭角色 worktree |
| `--role-test-commits` | 在各角色分支创建身份就绪提交 |
| `--remote=<url>` | 配置 `origin`，不自动 push |
| `--push` | 推送默认、Sprint 和角色分支；必须同时提供 remote |
| `--sprint=<n>` | 初始 Sprint 编号 |
| `--default-branch=<name>` | 默认分支名，默认 `main` |

## 生成目录

```text
<project>/
  00_项目导航/
  01_产品发现/
  02_产品待办/
  03_迭代运行/
  04_工程设计/
  05_质量验证/
  06_发布运维/
  07_度量改进/
  10_代码仓库/
  90_会议与决策/
  知识库/
```

## 设计边界

- `create-fullstack-monorepo` 只作为轻量工程骨架参考，不直接复用。
- 本工具生成的是 Scrum 团队工作区：包含项目运行层、工程设计层、仓库策略/按需代码骨架和角色协同规范。
- 外层项目工作区是文档主事实源，代码仓库只放 `apps/`、`infra/`、CI/CD、测试脚本等可执行资产。
- 个人分支使用 `feature/sprint-<n>/...`，避免与 `sprint-<n>` 集成分支产生 Git 引用冲突。
- 角色就绪提交只留在各自分支，不自动合入 `main`。
- 真实前端、后端、数据库、CI/CD 技术栈仍由团队在 Sprint 0 或 Sprint 1 中确认。

## 设计来源

本模板提炼自 QFD_Ark 知识库中的 Scrum 团队模型、Sprint 0 实践、工程实施协同开发规范，以及 `create-fullstack-monorepo` 的轻量脚手架思路。

## 本地开发

```bash
git clone https://github.com/kingcicou/create-scrum-team-workspace.git
cd create-scrum-team-workspace
node index.mjs verify-local --type=new --no-git --force
# 调试完清理
rm -rf verify-local
```

## 测试

零 npm 运行时依赖，使用 Node 内置 `node:test` runner。需要 Node.js ≥ 24、Git ≥ 2.28；
创建者/SM 执行审计型签核命令时还需 Python 3：

```bash
npm test
```

覆盖：

- 角色 worktree、`feature/sprint-<n>/...` 分支、`extensions.worktreeConfig` 隔离的 Git 身份
- `--config` 配置文件可重放、`--no-git` 关闭 Git 初始化
- `--dry-run` 仅打印计划、不创建任何文件
- `--no-worktrees` 跳过角色 worktree 但保留代码仓 Git 初始化
- `--remote=file://...` + `--push` 推送 `main` + `sprint-<n>` + 5 个个人分支到本地 bare 远端
- `--push` 在角色邮箱仍是 `@example.com` 占位时拒绝执行

## 辅助工具

生成的工作区 `tools/` 目录下包含以下只读辅助工具。所有工具均**不自动执行任何修改操作**，只提供检查、提示或生成建议。

### 工具总览

| 工具 | 谁用 | 何时用 | 作用 |
| --- | --- | --- | --- |
| `signoff.mjs` | SM / 项目创建者 | 首次入队、后续签核编排 | 角色规范签核全生命周期管理（bootstrap → prepare → publish → sign → close） |
| `team.mjs` | SM | 成员入队、换帽、状态变化 | 团队模型管理，同步角色表、联系人视图和任务分工 |
| `setup-code-repo.mjs` | FS / TL | Sprint 0 技术方案确认后 | 代码仓创建/接入四步流程（propose → approve → check → apply） |
| `review-status.mjs` | SM / Review 主持人 | Review/Retro 完成后 | 检查评审纪要追加区唯一性，检测重复标题和锚点问题 |
| `generate_doc_index.py` | SM | Sprint 末或异常触发 | 多维文档索引生成，只处理 `governance: managed` 产物 |
| `lint-frontmatter.mjs` | SM / TL | Sprint 末或治理审计 | 只检查 `governance: managed` 文档的 Frontmatter 完整性 |
| `sprint-close.mjs` | SM | Sprint 关闭前 | 读取任务表和门禁清单，生成 tag message 和更新提醒 |
| `flow-status.mjs` | SM | Daily Scrum 前 | 读取任务表推断当前阶段，输出阻塞/等待/可并行事项 |
| `template-diff.mjs` | SM / TL | 模板更新后或 Retro | 对比项目侧与模板侧知识库文件差异，提示待回流/待同步项 |
| `project-drift.mjs` | SM / TL | Retro 或治理审计 | 检测未替换占位符、项目独有文件和编号一致性问题 |

### 使用示例

**签核与团队管理**

```bash
# 首次入队签核（创建者/SM）
node tools/signoff.mjs bootstrap --actor=sm --due=+72h

# 后续签核编排（SM）
node tools/signoff.mjs prepare --from-audit --actor=sm
node tools/signoff.mjs publish --campaign=<ID> --actor=sm
node tools/signoff.mjs status --campaign=<ID>
node tools/signoff.mjs close --campaign=<ID> --actor=sm

# 成员入队（SM）
node tools/team.mjs add --member=alice --name=Alice --email=alice@example.com --status=active --developer
node tools/team.mjs assign --member=alice --hat=backend --status=active
```

**代码仓创建**

```bash
node tools/setup-code-repo.mjs propose --strategy=create --repo=my-app
node tools/setup-code-repo.mjs approve --decision=REPO-001 --actor=po
node tools/setup-code-repo.mjs approve --decision=REPO-001 --actor=tl
node tools/setup-code-repo.mjs check --decision=REPO-001
node tools/setup-code-repo.mjs apply --decision=REPO-001
```

**Sprint 运行检查**

```bash
# Daily 前状态检查（SM）
node tools/flow-status.mjs 03_迭代运行/Sprint-0-启动

# Sprint 关闭助手（SM）
node tools/sprint-close.mjs 03_迭代运行/Sprint-0-启动

# 评审纪要检查（SM）
node tools/review-status.mjs 03_迭代运行/Sprint-0-启动/02_Sprint0_Review纪要.md
```

**治理与偏差扫描**

```bash
# Frontmatter 检查（只查 governance: managed）
node tools/lint-frontmatter.mjs --dir=. --verbose

# 知识库文件差异（项目侧 vs 模板侧）
node tools/template-diff.mjs --content

# 项目偏差检查（占位符/编号/回流候选）
node tools/project-drift.mjs

# 文档索引生成（需 Python 3）
python tools/generate_doc_index.py
```

## 仓库发布

参考 `CHANGELOG.md` 与 `DESIGN.md` 中的“演进决策”小节。发布时需同步更新：

- `package.json` 的 `version`
- `CHANGELOG.md` 追加一条 `[x.y.z] - YYYY-MM-DD`
- 打 git tag，例如 `git tag v0.2.0 && git push --tags`

详细回流规则见生成工作区中的 `知识库/项目模板/02_模板演进与反向回流指南.md`。

## License

MIT
