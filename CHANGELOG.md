# CHANGELOG

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 的精简版本，所有显著改动按版本记录。

版本号使用语义化版本（SemVer）：`MAJOR.MINOR.PATCH`。

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
