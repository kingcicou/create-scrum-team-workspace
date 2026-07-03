# Sprint 0 关闭与 Sprint 1 准入检查表

> 时间盒关闭、目标达成、遗留处置和下一 Sprint 准入分别判定。

## 1. 关闭摘要

| 维度 | 结论 | 证据/说明 |
| --- | --- | --- |
| 计划周期 | YYYY-MM-DD ~ YYYY-MM-DD | Planning 时锁定，不回写 |
| 工作完成 | YYYY-MM-DD HH:mm / 未完成 | Goal 所需工作达到约定结果 |
| 正式关闭 | YYYY-MM-DD HH:mm / 未关闭 | Review、Retro、遗留和事实同步完成 |
| 时间盒 | open / closed |  |
| Sprint Goal | achieved / partial / missed |  |
| 遗留处置 | open / closed |  |
| Sprint 1 准入 | blocked / passed / waived |  |

## 2. 关键门禁

| Gate | 客观通过条件 | 当前状态 | 证据 | 决策人 |
| --- | --- | --- | --- | --- |
| Sprint Goal | Review确认目标结果 | 待判断 |  | PO |
| 质量门禁 | 测试实际运行并满足约定 | 待判断 |  | TL/QA |
| CI门禁 | PR可触发且失败阻断合并 | 待判断 |  | FS/TL |
| Sprint 1准入 | Backlog与必要门禁通过 | blocked |  | PO/TL/FS |

## 3. 未完成事项

| ID | 当前状态 | 处置 | 进入哪个Backlog/台账 | owner | 截止时间 |
| --- | --- | --- | --- | --- | --- |
|  |  | close / carry-over / cancel |  |  |  |

## 4. 事实一致性

- [ ] 总表、Frontmatter、正文和评审记录一致。
- [ ] 测试、CI和部署结论来自实际运行。
- [ ] 总结数字可从ID或路径明细复算。
- [ ] 改进项已进入台账，没有提前记成已交付。
- [ ] 项目首页、迭代日历和角色工作入口已切换。
- [ ] 正式 Sprint 文档已锁定，归档只保留一个正文事实源。

## 5. 关闭确认

- [ ] Review与Retro已完成。
- [ ] PO确认Sprint Goal结论。
- [ ] TL确认技术与质量门禁。
- [ ] FS确认CI、集成与交付门禁。
- [ ] SM确认遗留有去向、事实源无冲突。
- [ ] SM确认首页显示“已关闭 / 下一 Sprint 待 Planning”或新的执行 Sprint。

**最终结论：** 待确认

> 需要tag时使用annotated tag，并在消息中写明Goal、门禁和遗留。tag不等于全部Done或release。
