# Sprint 0 · 启动与奠基

**项目背景类型：** {{PROJECT_TYPE_LABEL}}

**本 Sprint 仓库策略：** {{REPO_STRATEGY_LABEL}}
**Sprint Goal：** 建立团队共同语言、目录体系、首批 Backlog 和工程落地基线。

---

## 1. Sprint 0 分工

{{SPRINT0_ASSIGNMENTS}}

---

## 2. 类型化启动策略

| 项目类型 | Sprint 0 重点 |
| --- | --- |
| 从零新项目 | 建工程骨架、产品愿景、架构草案、首批 Backlog |
| 存量项目重构 | 现状诊断、参考源冻结、升级路线图、风险清单 |
| 成熟产品迭代 | Backlog 梳理、容量规划、质量门禁、发布节奏 |
| 原型转正 | 复核技术选型、重建目录、补齐质量和安全基线 |

---

## 3. 代码仓库决策卡

> 项目背景类型通常稳定，仓库策略必须在每个 Sprint Planning 重新确认。

| 决策项 | 当前结论 |
| --- | --- |
| 本 Sprint 策略 | `{{REPO_STRATEGY}}`：{{REPO_STRATEGY_LABEL}} |
| 来源/现行仓库 | {{SOURCE_REPO}} |
| 目标仓库 | {{REPO_NAME}} |
| 默认/基线分支 | {{DEFAULT_BRANCH}} |
| 当前动作 | {{REPO_ACTION}} |
| 旧仓维护责任 | TL / FS；重写期间仍需处理生产缺陷 |
| 切换门禁 | 待填写：功能、性能、数据、回滚和 PO 验收 |
| 回退路径 | 待填写：旧版本、数据兼容和恢复时限 |
| 决策证据 | 待填写 ADR / Spike / 基准测试链接 |

如果 Sprint 中途提出 Rust、Svelte 等大规模技术栈切换，先登记候选 ADR 和
Spike；下一次 Planning 决定继续复用还是进入 `rewrite`，不得直接在现行主仓
覆盖式改写。

---

## 4. Sprint 0 门禁

- [ ] 团队角色和职责确认。
- [ ] 项目愿景和用户场景初版完成。
- [ ] 首批 Backlog 候选完成。
- [ ] 工程技术全景初版完成。
- [ ] 质量策略和发布策略初版完成。
- [ ] 仓库策略、来源和目标已记录在 `10_代码仓库/00_仓库清单.md`。
- [ ] 所选仓库可访问；`rewrite` 已明确旧仓维护、切换门禁和回退路径。
- [ ] Sprint 1 候选 Story 满足基本 DoR。

> Sprint 0 时间盒结束不等于 Sprint 1 自动准入。最终判定见
> `07_Sprint关闭与准入检查表.md`。
