# {{PROJECT_NAME}}

**项目背景类型：** {{PROJECT_TYPE_LABEL}}

**本 Sprint 仓库策略：** {{REPO_STRATEGY_LABEL}}

**角色套装：** {{ROLE_PRESET_LABEL}}
**团队档位：** {{TEAM_PROFILE_LABEL}}
**启动模式：** {{STARTUP_MODE_LABEL}}
**创建日期：** {{CREATED_DATE}}

这是一个 Scrum 团队协同工作区，包含项目运行、工程设计、质量发布、度量改进和代码仓库治理；仅在所选策略需要时生成新代码仓骨架。

> **启动模式说明**：`discovery-first` 仅建文档治理仓，代码仓在 Sprint 0 审批后由 `setup-code-repo.mjs` 创建；`delivery-ready` 在创建时即建立文档仓 + 独立代码仓双仓模式，并按团队档位创建成员 worktree。

## 快速入口

| 想做什么 | 入口 |
| --- | --- |
| 看项目首页 | `00_项目导航/00_项目首页.md` |
| 看团队角色 | `00_项目导航/02_角色与联系方式.md` |
| 调整角色命名玩法 | `00_项目导航/07_角色命名玩法指南.md` |
| 看 SM 作战手册 | `00_项目导航/SM_作战手册_Sutherland.md` |
| 上报状态、纠偏或生成 SM 播报 | `00_项目导航/09_SM教练查询与回复模板.md` |
| 看 Sprint 0 计划 | `03_迭代运行/Sprint-0-启动/00_Sprint计划.md` |
| 找到自己的任务、依赖和证据 | `03_迭代运行/Sprint-0-启动/01_Sprint任务表与流程看板.md` §4 |
| 关闭Sprint并判断下一轮准入 | `03_迭代运行/Sprint-0-启动/07_Sprint关闭与准入检查表.md` |
| 写首批 Backlog | `02_产品待办/02_Stories/Sprint1_候选Backlog.md` |
| 做工程设计 | `04_工程设计/00_技术全景.md` |
| 查看仓库角色、来源和切换状态 | `10_代码仓库/00_仓库清单.md` |
| 查看辅助工具用法 | 本文“辅助工具”一节 |

## 目录结构

```text
{{PROJECT_NAME}}/
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

## 最小启动顺序

1. 全员从 `00_项目导航/00_项目首页.md` 的“30 分钟上手”开始。
2. PO/TL/资深成员确认 Goal、Story/AC、模块拆分和任务复杂度。
3. 执行成员在 Sprint 任务表找到自己的 Task，只更新状态和证据。
4. 执行仓库动作：{{REPO_ACTION}}。
5. Sprint 结束前分别确认 Goal、遗留和下一轮准入。

## 辅助工具

`tools/` 目录下包含以下辅助工具，所有工具均只读、不自动执行修改。

| 工具 | 谁用 | 何时用 | 用法 |
| --- | --- | --- | --- |
| `signoff.mjs` | SM / 创建者 | 签核编排 | `node tools/signoff.mjs bootstrap --actor=sm --due=+72h` |
| `team.mjs` | SM | 成员入队/换帽 | `node tools/team.mjs add --member=<id> --name=<名> --status=active` |
| `setup-code-repo.mjs` | FS / TL | 代码仓创建 | `node tools/setup-code-repo.mjs propose --strategy=<策略> --repo=<名>` |
| `review-status.mjs` | SM | Review 后 | `node tools/review-status.mjs <review.md>` |
| `generate_doc_index.py` | SM | Sprint 末 | `python tools/generate_doc_index.py` |
| `lint-frontmatter.mjs` | SM / TL | 治理审计 | `node tools/lint-frontmatter.mjs --dir=.` |
| `sprint-close.mjs` | SM | Sprint 关闭前 | `node tools/sprint-close.mjs <sprint目录>` |
| `flow-status.mjs` | SM | Daily 前 | `node tools/flow-status.mjs <sprint目录>` |
| `template-diff.mjs` | SM / TL | 模板更新后 | `node tools/template-diff.mjs --content` |
| `project-drift.mjs` | SM / TL | Retro/审计 | `node tools/project-drift.mjs` |
