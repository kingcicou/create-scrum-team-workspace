# CHANGELOG

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 的精简版本，所有显著改动按版本记录。

版本号使用语义化版本（SemVer）：`MAJOR.MINOR.PATCH`。

## [0.3.1] - 2026-06-29

### Added

- 新增知识库目录 `知识库/运维与环境/`，同步创建 `README.md` 作为通用骨架与边界说明，明确区分与 `06_发布运维/` 、`03_迭代运行/` 的职责差异。
- `00_知识库总目录.md` 、`知识库/README.md` 、`Scrum/99_来源索引.md` 、`项目模板/01_模板需求提取与差距修正.md` 同步登记新目录。
- 测试补一条 case：验证生成产物含 `知识库/运维与环境/README.md` 且占位符被正确替换。

### 设计动机

- **仅回流骨架、不回流项目专属内容**：QFD_Ark 的 `Hermes保活配置指南.md` 是特定服务的实践详情，属于 [项目专属]，不进模板；模板仅保留**目录与骨架**，顺应 `02_模板演进与反向回流指南.md` 中“不应回流到模板的内容”原则。
- **与其他目录的边界**：`06_发布运维/` 是项目当期部署决策；`03_迭代运行/<Sprint-x>/` 是一次性故障复盘；`知识库/运维与环境/` 是“下个项目也可用”的稳定环境配置指南。

## [0.3.0] - 2026-06-29

### Added

- 角色确认后自动创建 TL、Mid.BE、Sr.FE、Mid.FE、FS 五个 worktree。
- 新增 `--worktrees`、`--role-test-commits`、`--remote`、`--push`、`--sprint` 和 `--default-branch`。
- 支持可选角色身份就绪提交，以及显式推送默认、Sprint、角色分支。
- 新增 `Scrum/11_角色工作区与Git身份引导规范.md` 和本轮迭代计划。
- 新增 `test/index.test.mjs` 基于 Node 内置 `node:test`，覆盖：角色 worktree 与身份隔离、`--config` 重放、`--dry-run` 不写盘、`--no-worktrees` 跳过 worktree、`--remote + --push` 推送到本地 bare 远端、`--push` 拒绝 `@example.com` 占位邮箱。
- `package.json` 新增 `scripts.test`；`npm test` 一条命令跑全部测试。

### Changed

- 默认 Git 模式由 `workspace` 改为独立代码仓 `repo`。
- 交互流程先展示角色全表，再按槽位调整名称与邮箱。
- 个人分支改为 `feature/sprint-<n>/...`，避免与 `sprint-<n>` 引用冲突。
- `roles.config.json` 增加角色邮箱。
- `08_团队开发协作SOP.md §4.3` 明确：生成器已自动配置身份，本节命令仅用于手动重建或修正。
- `知识库/项目模板/02_模板演进与反向回流指南.md` 提案分为"轻量提案"与"迭代计划"两种形式，后者范本指向 `03_角色工作区自动化迭代计划.md`；L3 检查项新增"`npm test` 全绿"。

### Fixed

- worktree Git 身份改用 `extensions.worktreeConfig` 与 `git config --worktree`，防止角色身份互相覆盖。
- 修复 JSON 配置的 CLI 优先级标记未设置问题。
- 独立代码仓 `.gitignore` 纳入自动化验证，确保 `TeamWork/` 不会误提交。

## [0.2.1] - 2026-06-26

### Added

- 项目导航新增 `00_项目导航/08_团队开发协作 SOP.md`：面向全员的开发操作 SOP，覆盖准备、Git 模式识别、worktree、分支命名、提交、PR、Done 判定与 10 个 FAQ。
- 知识库新增 `知识库/Scrum/10_Git仓库布局与提交模式解析.md`：解释为什么两层仓库、三种 Git 模式取舍、worktree 原理、何时应 A→C 升级、提交身份设计、本轮迭代 8 条 FAQ 释疑归档。
- 项目首页与知识库总目录同步登记上述两份文档。

### Changed

- `template/_gitignore` 关于“代码仓库独立成 git”的注释段从狭义的“生产上线”改写为完整的 4 条触发条件，并指向新增的“Git 仓库布局与提交模式解析”指南。

### 设计动机

- **为什么双轨放（项目导航 + 知识库）**：操作 SOP 面向“现在怎么做”，需要与角色联系、总表、SM 手册同居；原理释疑面向“为什么这样”，属于稳定方法论，不随 Sprint 变动。这与知识库“当期执行产物不进知识库”原则一致。
- **为什么 FAQ 要归档**：本次迭代产生的八条释疑是未来新成员、多项目点看双仓库设计时都会反复提问的，不归档就会反复要重复解释。

## [0.2.0] - 2026-06-26

### Added

- CLI 新增 `--dry-run` / `-n`：只预览将创建的目录与文件清单，不写盘。
- CLI 新增 `--config=<path.json>`：从 JSON 配置文件读取参数（CLI 优先级更高），兼容 UTF-8 BOM。
- CLI 新增 `--email.<slot>=<email>`：为指定角色配置真实邮箱；同时接入交互流程和配置文件。
- 交互流程升级：补齐"代码仓库名 → Git 模式 → 角色 → 邮箱"询问，并新增**摘要确认**页，输入 Y 才写盘。
- 模板内置知识库新增四份指南：
  - `知识库/Scrum/07_产品发现与价值排序指南.md`（PO 视角、价值假设、优先级模型）
  - `知识库/Scrum/08_质量门禁与测试金字塔指南.md`（质量左移、CI 最小要求、缺陷分级）
  - `知识库/Scrum/09_角色学习路径与成长指南.md`（入职、能力进阶、个人成长产物）
  - `知识库/项目模板/02_模板演进与反向回流指南.md`（Retro → 模板的回流流程与版本规则）

### Changed

- 占位符约定明确化：**文件内容用 `{{KEY}}`、路径名用 `__KEY__`**。模板内 `PROJECT_NAME.code-workspace` 重命名为 `__PROJECT_NAME__.code-workspace`，`10_代码仓库/REPO_NAME/` 重命名为 `10_代码仓库/__REPO_NAME__/`。`renderName` 改为只匹配 `__([A-Z0-9_]+)__`，杜绝子串误伤。
- 模板拷贝改为两阶段：`collectTemplatePlan` 先收集计划，`applyTemplatePlan` 再落盘，为 `--dry-run` 提供基础。
- `maybeGitInit` 在 init/commit 失败时透出 stderr，便于排查。
- 交互式 `askChoice` 默认值同时显示 key 与 label。
- 知识库总目录与差距修正清单同步登记新增的四份指南。
- 在 `知识库/Scrum/99_来源索引.md` 新增"模板内沉淀"小节，标明新增文档不是单一原始文件的迁移。

### Removed

- 删除死代码 `OBSOLETE_TEMPLATE_PATHS`（其引用的过时路径模板早已不存在）。
- 项目根知识库去重：删除非规范命名的 `Evan_学习心得.md` 与 `Ritchie_学习心得与知识总结.md`，保留与总目录命名一致的 `学习心得_<Name>.md`。

### Fixed

- 配置文件解析增加 UTF-8 BOM 容错，避免 PowerShell `Out-File -Encoding utf8` 写入的 BOM 导致 `JSON.parse` 失败。

### 决策动机摘要

详见 `DESIGN.md` 中的"演进决策"小节。要点：
- **`__KEY__` 占位符**：原 `PROJECT_NAME` 裸字符串替换在文件名层是安全的，但缺乏自描述性，且面向未来扩展（新增其它需要进路径的占位符）容易踩坑。统一为 `__KEY__` 后，与文档正文 `{{KEY}}` 形成对称、明确的两套规则。
- **`--dry-run`**：模板生成会写几十个文件，缺少预览手段使评审与故障复现都很别扭。两阶段化后既能 dry-run，也降低写盘失败时部分写入的风险。
- **`--config`**：交互模式适合首次使用，但项目重建/对比实验需要"可重放"能力。
- **交互摘要确认**：原交互流程一旦回车就开始写盘，错填没有撤销窗口。摘要页是低成本高收益的护栏。
- **去重学习心得**：同一人两份命名近似的文件违反"主事实源唯一"原则，自相矛盾。

## [0.1.0] - 2026-06-26

### Added

- 初始版本：基于 QFD_Ark Sprint 0 实践沉淀，生成 Scrum 团队协同工作区。
- 内置目录：`00_项目导航/` ~ `07_度量改进/` + `10_代码仓库/` + `90_会议与决策/` + `知识库/`。
- 六套角色命名预设：`tech` / `myth` / `wuxia` / `compass` / `studio` / `greek`。
- CLI 选项：`--type` / `--preset` / `--repo` / `--role.<slot>` / `--interactive` / `--list-presets` / `--git-root` / `--no-git` / `--force`。
- 自动生成角色表、Soul 卡、能力矩阵、备份机制、Sprint 0 分工。
- 内置模板知识库：`Scrum/00~06` + `99_来源索引` + `项目模板/00~01`。
