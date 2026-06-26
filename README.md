# create-scrum-team-workspace

一个面向 Scrum 团队协作的项目工作区生成器。

它不是单人全栈工程模板，而是用于生成“团队运行 + 工程骨架 + 角色协同 + Sprint 0”的完整工作区。

零依赖、跨平台、开箱即用。

## 🚀 使用方式

### 方式一：Bash 一键执行（macOS / Linux / WSL / Git Bash）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/main/create.sh) my-project
```

可叠加任意 CLI 选项：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/main/create.sh) my-project --type=new --preset=tech
```

### 方式二：PowerShell 一键执行（Windows）

```powershell
irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/main/create.ps1 | iex
```

执行后会进入交互式创建。也可提前设环境变量传项目名与额外参数：

```powershell
$env:PROJECT_NAME="my-project"
$env:SCRUM_TEMPLATE_ARGS="--type=new --preset=tech"
irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/main/create.ps1 | iex
```

### 方式三：npx（全平台，需 Node.js >= 18）

```bash
# 直接从 GitHub 执行（推荐，与参考仓库一致）
npx -y github:kingcicou/create-scrum-team-workspace my-project

# 仅预览不写盘
npx -y github:kingcicou/create-scrum-team-workspace my-project --dry-run

# 交互式
npx -y github:kingcicou/create-scrum-team-workspace --interactive
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
- 内置多套角色命名预设：世界技术大神、中国神话、武侠风格、航海罗盘、独立工作室、希腊神话。
- 支持单个角色改名，例如 `--role.midfe=Aurora`。
- 支持交互式逐个确认角色名，也支持 `--list-presets` 查看全部套装。
- 自动生成角色表、角色 Soul 卡、能力矩阵、备份机制、Sprint 0 分工。
- 自动生成产品、Backlog、Sprint、工程设计、质量、发布、度量、会议决策目录。
- 复用 QFD_Ark Sprint 0 实践沉淀的 `05_输入输出管理规范`、`06_团队输入输出总表` 和 `SM_作战手册` 机制。
- 内置代码仓库骨架和 `TeamWork/` 协同工作区规范。
- 代码仓库不维护重复 `01-docs` 文档中心；项目工作区文档是主事实源，代码仓库保留可执行资产和链接。

## 用法详解

```bash
node index.mjs my-project
```

指定项目类型与角色套装：

```bash
node index.mjs acme-ark --type=legacy --preset=greek
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
  "preset": "tech",
  "gitRoot": "workspace",
  "roles": { "midfe": "Aurora" },
  "emails": { "po": "po@example.com" }
}
```

把 `10_代码仓库/<repo>` 初始化为独立 Git 主仓库：

```bash
node index.mjs acme-ark --git-root=repo
```

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
| 默认 / `--git-root=workspace` | 把整个项目工作区初始化为一个 Git 仓库 |
| `--git-root=repo` | 只把 `10_代码仓库/<repo>` 初始化为 Git 仓库，适合独立代码仓库协作 |
| `--git-root=none` / `--no-git` | 不自动初始化 Git |

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
- 本工具生成的是 Scrum 团队工作区：包含项目运行层、工程设计层、代码仓库骨架和角色协同规范。
- 外层项目工作区是文档主事实源，代码仓库只放 `apps/`、`infra/`、CI/CD、测试脚本等可执行资产。
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

## 仓库发布

参考 `CHANGELOG.md` 与 `DESIGN.md` 中的“演进决策”小节。发布时需同步更新：

- `package.json` 的 `version`
- `CHANGELOG.md` 追加一条 `[x.y.z] - YYYY-MM-DD`
- 打 git tag，例如 `git tag v0.2.0 && git push --tags`

详细回流规则见生成工作区中的 `知识库/项目模板/02_模板演进与反向回流指南.md`。

## License

MIT
