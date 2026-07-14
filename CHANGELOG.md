# CHANGELOG

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 的精简版本，所有显著改动按版本记录。

版本号使用语义化版本（SemVer）：`MAJOR.MINOR.PATCH`。

## [Unreleased]

## [1.1.0-rc.5] - 2026-07-14

### Added

- **代码开工预检**：新增 `tools/code-preflight.mjs`，按 memberId 校验代码仓、
  feature 分支、Sprint 基线祖先关系以及 worktree Git 姓名/邮箱，减少直推集成分支和统一账号代提。
- **Sprint 例外与裁决区**：任务表内置一张仅异常时填写的例外表；正常事实仍只写任务行、
  PR/MR、CI 或 Review，不新增日报和事实流水账。

### Changed

- **启动责任显式化**：任务表新增 Sprint 启动门禁，明确 PO 锁 Goal、SM 组织播报、
  TL/资深拆分与指派 Reviewer、FS 建仓/分支/worktree，避免 SM 代替专业角色决策。
- **代码评审证据平台无关**：PR/MR 仍为首选；平台暂不可用时，要求 reviewer、commit range、
  测试结果、verdict、merge actor 五项等价证据。
- **关闭检查增强**：`sprint-close.mjs` 检查已完成任务证据、未裁决例外和无有效去向的
  carry-over；归档改为链接运行目录，不再复制第二套 Sprint 正文。
- **轻量治理取舍**：只在启动、首次开工、合并、关闭四个门禁快速确认；正常通过不留痕，
  避免“点检表 + 事实表 + 偏离表”三套并行维护。

## [1.1.0-rc.4] - 2026-07-13

### Changed

- **文档索引改为本地可重建产物**：模板 `.gitignore` 忽略
  `00_项目导航/文档索引/*`，但保留 `README.md` 作为入口说明，避免每次运行
  `generate_doc_index.py` 后产生噪音提交。
- **导航入口改为生成说明**：项目首页与角色行动手册不再把生成索引文件当作固定事实源，
  而是指向 `文档索引/README.md`，明确正式证据应沉淀到 Sprint 记录、签核事件或行动手册变更记录中。

## [1.1.0-rc.3] - 2026-07-08

### Changed

- **交互选项序号化**：`askChoice` 为所有选项添加序号前缀，用户可输入序号或
  原始 key 进行选择。默认值提示也从 `key - 描述` 改为 `序号 - 描述` 格式，
  降低交互模式下选项输入的认知成本。

## [1.1.0-rc.2] - 2026-07-08

### Fixed

- **交互模式提问顺序**：`startup-mode` 和 `team-profile` 提前到 `git-root` 之前，
  避免 git-root 选项被 startup-mode 推导覆盖。移除交互模式中过时的 `repo` 选项
  （已被 `delivery-ready` 双仓模式取代），仅保留 `workspace`（推荐）和 `none`。
- **lean 档首签 actor 解析**：`setupInitialSignoff` 硬编码 `--actor=sm`，在 lean-2/lean-3
  下 SM 的 memberId 不是 `sm`（如 `lead-b`）导致首签失败。改为从 team profile 解析
  `scrum.scrumMaster` 获取实际 memberId。
- **`.gitignore` 注释残留**：`delivery-ready` 模式下添加活跃 gitignore 条目时，
  同时移除模板中被注释掉的对应行，避免活跃行与注释行并存。

### Added

- **lean-2 端到端首签测试**：覆盖 `lean-2 + delivery-ready + auto signoff` 完整流程，
  验证首签在文档仓运行、campaign 只覆盖 2 个 active 成员、`.gitignore` 无注释残留、
  worktree 数量正确。
- **Python 自动探测**：测试脚本新增 `resolvePython` 帮助函数，按 `PYTHON` 环境变量
  → `python3` → `python` → `py` 顺序自动探测可用 Python 可执行文件，
  解决 Windows Store stub 导致的 `python` 命令不可用问题。

### Changed

- README 测试章节补充 Python 环境要求和 Windows `PYTHON` 环境变量说明。

## [1.1.0-rc.1] - 2026-07-08

### Added

- **团队档位系统**：`--team-profile` 将原有的 2 档（core/full）扩展为 5 档预设：
  - `full-7`：7 人完整团队（兼容 rc.8 行为）
  - `core`：3 人核心团队（PO/SM/TL active，其余 planned）
  - `balanced-5`：5 人精简团队（PO/SM/TL + BE+QA + FE+FS+DevOps）
  - `lean-3`：3 人小队（PO+SM / TL+BE+QA / FE+FS+DevOps）
  - `lean-2`：2 人极小队（PO+TL+BE / SM+FE+FS+DevOps+QA）
  每档包含成员定义（id/primarySlot/hats/status/worktree）、scrum 责任分配和帽子 assignments。
- **启动模式**：`--startup-mode` 决定仓库和 worktree 策略：
  - `discovery-first`：只建文档治理仓，不建代码仓和 worktree（兼容默认）
  - `delivery-ready`：双仓模式——文档治理仓 Git（项目根）+ 独立代码仓 Git（`10_代码仓库/{repo}`），
    按档位创建成员 worktree。不等于旧 `--git-root=repo` 单仓模式。
- **`--name-preset`**：`--preset` 的别名，语义更清晰（预设的是名字风格而非角色配置）。
- **`roles.config.json` v2 升级**：生成 v2 `member-hat-v1` 格式（members/scrum/hats/assignments），
  同时保留 `teamStage` 兼容字段。`teamProfile`/`startupMode` 作为非破坏性字段加入。
- **`delivery-ready` 双仓模式**：文档仓 `.gitignore` 排除代码仓目录；代码仓独立 Git init，
  创建 sprint 分支和成员 worktree（`TeamWork/` 下）；首签在文档仓运行。
- **worktree 规则**：只承担 PO/SM 管理责任的成员不创建 worktree；承担编码帽子的成员创建 worktree。
- **`architecture` 帽子**：加入 `HAT_LABELS`，在 lean-3 的 tech-builder 成员中作为 hatId 出现。
- **11 个 v1.1.0 回归测试**：覆盖 5 档成员数/worktree 数、向后兼容、邮箱格式、双仓独立 Git、首签在文档仓。

### Changed

- `buildRoles` 从 `ROLE_SLOTS.map` 改为 `TEAM_PROFILES[profile].members.map`，支持一人多帽。
- `renderTaskExecutionTable` 从硬编码 7 slot ID 改为按 member 动态生成。
- `setupGitWorkspace` 的 FS 执行人查找从 `roles.find(r => r.id === "fs")` 改为按 hatId 查找。
- `generate_doc_index.py` v2 模式下 `signoff_audit` 使用显示标签（PO/SM 等）而非成员 ID。
- `setupInitialSignoff` 从 `roleStatusFor(role.id, teamStage)` 改为 `role.status === "active"`。
- `--git-root=repo` 旧单仓模式继续工作，不受 `--startup-mode` 默认推导影响。

### Fixed

- **`.gitignore` 注释匹配 bug**：模板 `.gitignore` 中被注释掉的 `# 10_代码仓库/repoName/`
  会被 `includes()` 误判为已有规则，导致 `delivery-ready` 模式下代码仓目录未被 gitignore。
  修复为逐行精确匹配（非注释行）。
- **`setupWorktrees` 被错误覆盖**：`discovery-first` 模式的 `createWorktrees: false` 会覆盖
  `--git-root=repo` 旧模式下应创建 worktree 的行为。添加 `isOldRepoMode()` 检查。
- **`teamStage` 字段缺失**：`ROLE_JSON` 未写入 `teamStage` 兼容字段，导致下游工具读取失败。

### Backward Compatibility

- `--team-stage=core` → `--team-profile=core`
- `--team-stage=full` → `--team-profile=full-7`
- `--preset=tech` → `--name-preset=tech`
- `--git-root=repo` 旧单仓模式继续工作
- 无新参数时等价 rc.8 行为（`full-7` + `discovery-first`）

## [1.0.0-rc.8] - 2026-07-07

### Changed

- **默认邮箱改为 Gmail "+" 地址**：7 个角色默认邮箱从 `{name}@example.com` 改为
  `kingcicou.zmh+{slotid}@gmail.com`，其中 TL 兼 Sr.BE 使用 `+tl_srbe`。
  占位邮箱检测和 `--push` 校验同步更新，兼容新旧两种格式。
- **引导脚本版本号同步**：`create.ps1`、`create.sh`、`README.md` 全部指向 v1.0.0-rc.8。

## [1.0.0-rc.7] - 2026-07-07

### Added

- **L2 合并协议轻量模板**：`知识库/Scrum/13_文档协作与并发控制规范.md` 新增附录 A，
  提供分区边界、合并窗口、冲突仲裁、回滚策略和降级条件模板。仅 L2 高冲突文档启用，
  不增加普通文档治理负担。
- **质量门禁清单模板**：`03_迭代运行/Sprint-0-启动/质量门禁清单.md`，一页以内，
  Planning 时由 TL/领域负责人与 SM 共同填写，Review 时逐条核对。含 Q01-Q06 默认门禁
  （DoR/API契约/评审/CI/AC/DoD）+ Q07 自定义行。
- **三个轻量只读辅助工具**：
  - `tools/lint-frontmatter.mjs`：只检查 `governance: managed` 文档的 Frontmatter 完整性，
    exempt/L0 跳过，不阻断流程（exit 1=有警告）。
  - `tools/sprint-close.mjs`：SM 收口助手，读取任务表和门禁清单，生成 annotated tag message
    和更新提醒。不自动执行任何操作。
  - `tools/flow-status.mjs`：Daily 前流程状态快速检查，读取任务表推断当前阶段，
    输出阻塞/等待/可并行事项。自适应不同列格式的任务表。
  - `tools/template-diff.mjs`：知识库文件清单差异提示，对比项目侧与模板侧文件，
    输出"仅项目侧有/仅模板侧有/两侧均有"三类差异，支持 `--content` 比较内容摘要。
  - `tools/project-drift.mjs`：项目偏差检查，检测未替换占位符、项目独有文件
    （回流候选）和编号一致性问题。只提供提示，不执行修改。

### Changed

- **工具使用文档补全**：README.md 新增“辅助工具”章节，包含工具总览表（谁用/何时用/作用）
  和分组使用示例；模板侧 `template/README.md` 新增工具快速入口；`03_工具与权限清单.md`
  新增“内置辅助工具”节，与模板侧同步。

## [1.0.0-rc.6] - 2026-07-06

### Changed

- **项目创建与代码开工解耦**：默认 `--git-root=workspace` 只生成可追溯的文档治理仓，
  不再预建代码骨架；`reuse` 同样保留文档 Git。技术方案明确后，PO/TL 通过
  `setup-code-repo.mjs propose → approve → check → apply` 创建或接入代码仓。
- **团队生命周期闭环**：`team.mjs` 扩展
  `add/assign/update/set-status/unassign/sync`。有效入队、激活和帽子变化自动登记
  Change ID、提升手册基线、同步任务/联系人视图，并以当前 SM 的命令级身份提交；
  `prepare --from-audit` 因而能产生真实 onboarding/role-change Campaign。
- **成员/帽子模型贯通仓库审批**：仓库工具统一读取 `member-hat-v1`，从 Scrum 责任和
  活跃帽子解析 PO、TL 与执行人；legacy 配置继续通过投影视图兼容。
- **历史身份采用工件快照**：Campaign、Notice、Closure 固化创建者/发布者/关闭者身份；
  Event 按 Campaign participant 快照验证。成员后续改名或换邮箱不再破坏历史 Campaign，
  Node 与 Python 审计结果保持一致。

### Fixed

- `create` 仓库目标只要非空即阻断，不能再把预存文件吸收入初始化提交。
- 建仓改为同卷暂存目录完成 Git 初始化后原子改名；代码仓、`.gitignore` 和决策状态在
  文档提交失败时回滚，Git 分支/远端/提交失败不再被静默吞掉。
- 团队模型校验补齐成员 ID/状态/邮箱、重复邮箱、assignment kind/status/重复项、
  Scrum developers 悬空/重复及 active 责任引用。
- 测试使用 `process.env.PYTHON`，不再硬编码 `python`。

### Tests

- 新增成员变更→Change→Python 审计、v2 团队仓库审批、任意非空目标拒绝、历史身份
  变化后 Campaign/Closure 仍有效等跨模块回归；全量测试增至 34 项。

## [1.0.0-rc.5] - 2026-07-06

### Added

- **R4.4 任务 Owner 语义升级**：Sprint 任务执行表改为 `Owner（memberId） + 责任帽子`
  双字段，避免“姓名看起来像角色”造成混淆。任务分派以成员 ID 为唯一身份，帽子只表示
  本任务责任语义（如 `devops` / `backend` / `qa`），与成员身份解耦。启动通知同步强调
  `Owner(memberId+responsibleHat)` 确认。
- **R4.3b Signoff 的 SM 解析去硬编码**：`tools/signoff.mjs` 在加载上下文时统一通过
  `loadTeamModel` 读取团队模型，并以 `scrum.scrumMaster` 作为 SM 身份与门禁来源。
  因而 v2 `member-hat-v1` 配置下可使用非 `sm` 的成员 ID 作为 SM；legacy 配置仍投影为
  `sm`，行为保持兼容。新增回归测试覆盖该路径（29/29）。
- **R4.3b 团队写入命令与审计 v2 兼容**：`tools/team.mjs` 新增 `add/assign` 写能力：
  写前/写后都执行 `validateTeamModel`；首次写入自动迁移 `roles.config` 到
  `schemaVersion=2 / model=member-hat-v1`（不按姓名/邮箱自动合并）；`add` 会建议 SM
  发起 onboarding 批次，`assign` 会建议发起 role-change 批次。同步增强
  `tools/generate_doc_index.py`：支持从 v2 `members` 计算 active 成员，`closure` 证据按
  `scrum.scrumMaster` 解析 SM 身份，`signoff_audit` 在 v2 下按成员 ID 聚合。新增回归测试：
  `team add/assign` 写入迁移、Python 审计 v2 路径；全量 31/31。
- **R4.3 团队视图与校验命令（只读）**：`tools/team.mjs list` 打印当前团队模型（成员
  及其 `responsibilities`、scrum 的 PO/SM/Developers、帽子 assignment）；`team.mjs
  validate` 运行 `validateTeamModel` 输出 WARN/ERROR（有 error 时退出码 2）。两者纯读、
  不改写 `roles.config`。`add`/`assign` 目前给出提示并指向后续的 v2 写入增强（R4.3b，
  需先让 signoff/审计以 `scrum.scrumMaster` 解析 SM，而非硬编码 `sm`）。
- **R4.2b 成员式签核**：`sign --member=<成员ID>`（`--role` 兼容，legacy 下 member id
  === role id）。有 `participants` 的 Campaign 按**快照身份**（name/email）验证并提交，
  Event 记录 `memberId`、快照姓名/邮箱、本次接受的 `responsibilities`、覆盖 Change ID
  与 Git 作者证据。审计对每个 Event 以其**自身存储的成员/邮箱**（即快照）验签，因此
  成员后来改名/换邮箱**不会使历史 Event 失效**。旧 Campaign（无 participants）走原路径。
- **R4.2a Campaign participants 快照**：`prepare`/`bootstrap` 创建 Campaign 时用团队
  模型固化 `participants`（每成员的姓名/邮箱/`responsibilities`/`coverage` 快照）。
  历史 Event 将按此快照验证，不因成员后来改名/换邮箱而失效；不动态读取当前 assignments。
  加法字段，不进 Notice 摘要，现有 role 签核流与摘要保持不变（26/26）。
- **R4.1 团队模型加载层（member-hat-v1）**：`tools/lib/team-model.mjs` 把两种
  `roles.config` 归一为标准视图 `members + scrum + hats + assignments`。旧七角色
  配置**投影**为等价 member-hat 视图（PO/SM→scrum 责任，编码角色→帽子 assignment；
  Mid.BE/QA→backend+qa 等），纯读、不改写文件、不按姓名/邮箱合并身份。含
  `validateTeamModel`（重复邮箱、悬空引用、PO=SM 警告）。**纯读，不改变签核/审计行为**
  （QFD_Ark 审计内容前后一致，仅 generatedAt/sourceHead 每次运行自然变化）。
- 角色行动手册 §6「分阶段团队与分批签核」；交互式创建新增「团队档位」（full/core）。

## [1.0.0-rc.4] - 2026-07-06

### Added

- **代码仓创建改为 `propose → approve → check → apply` 结构化审批**（`setup-code-repo.mjs`）：
  决策工件 `.team/repo-decisions/REPO-NNN.json` 带 Decision ID + PO/TL 审批；apply 门禁
  （状态=approved、双审批、文档仓干净、目标空、已 gitignore、无凭据、幂等）+ 交互确认
  （`--yes` 不绕审批）。人员签核与仓库审批分属不同工件。
- **分阶段团队模型（核心启动团队 ≠ 交付团队）**：`roles.config.json` 每角色新增
  `status`（active/optional/planned）+ 顶层 `teamStage`。`--team-stage=core` 只激活
  PO/SM/TL（srfe 可选、其余 planned）；默认 `full`（全员 active，向后兼容）。
- `bootstrap`、启动通知门禁与签核审计（Node 与 Python）**只读 active 角色**：
  修复"必须凑齐 7 人才能首签"的循环依赖——现在核心团队（PO/SM/TL 三人）即可
  完成 initial-core 首签并启动 Sprint 0，交付成员在模块清晰后再激活并增量首签。
- 首签自动发布的占位邮箱检查只针对 active 角色，planned 成员不阻塞核心首签。

### Fixed

- 修复项目侧生成器 `active_canon` 引用了未定义的 `ACTIVE_ROLE_IDS` 导致的
  `NameError`（补齐 `_active_role_ids` 定义）。

### Notes

- 待办 RC4：`team.mjs add` 增量入队自动化 + 成员/帽子数据模型（成员↔多帽子）。

## [1.0.0-rc.3] - 2026-07-06

### Changed

- **代码仓从"创建时前置"改为"Sprint 0 后按需"**：默认 `create` 只初始化
  **文档治理工作区（doc-git）**，不再创建代码仓；产物是"先把人和规范就位的
  治理工作区"，代码仓退化为技术选型清晰后的下游动作。
- 默认 `gitRoot=workspace`（文档 Git）。`--repo=<name>` 视为"现在建代码仓"
  （兼容旧行为，测试与显式建仓路径不变）；新增 `--code-repo=now|defer`
  显式切换；`--git-root=repo` 仍可用于旧式立即建仓。
- 首签只依赖文档仓：默认路径下 `.team/signoffs` 位于文档工作区，与代码仓解耦。
- 术语校正：Sprint 0 表述为"模板约定的启动与发现阶段"（Scrum Guide 未定义
  Sprint 0）；首签证明"已确认阅读并接受角色责任"，非"已理解"，真正内化证据是
  完成首个真实任务并满足 DoD。首页启动通知的前提改为"首签 Campaign 关闭之后"。

### Added

- `tools/setup-code-repo.mjs`：延后创建/登记代码仓，支持 `create/reuse/import/rewrite`。
  代码仓位于文档仓内部时，**先把精确路径写入文档仓 `.gitignore`，再嵌套 `git init`**，
  保证两者 Git 历史独立、文档仓不误跟踪代码；`import/rewrite` 不自动执行危险历史迁移。
- Sprint 0 `仓库决策卡.md`（status=pending）：清晰说明先决条件与四策略创建命令。

### Notes

- 团队裁剪（full/lean/custom 与成员/帽子数据模型）为独立数据模型升级，延后至 RC4，
  不在本轮范围，避免用"重复姓名/邮箱"破坏任务归属与签核审计。

## [1.0.0-rc.2] - 2026-07-06

### Fixed

- 分离“项目创建后的首次团队启动通知”与“角色手册首签 Notice”：首页自动生成可
  直接发群的启动通知，说明当前阶段、并行任务、等待输入、首个输出和状态入口；
  首签 Notice 只承担规范确认，不再被误解为首次派工通知。
- 项目创建者改为一次性初始化身份，不再默认等于 FS。只有创建者本人兼任 FS 时，
  才由 FS 执行 bootstrap 和初始化推送。
- 收窄 FS 首轮任务：只负责代码仓接入、分支/身份/角色工作区的可访问性验证；
  CI/CD 改为技术栈、构建方式或平台变化时另立 Task，部署和发布在门禁开放前不分配。
- Sprint 0 任务表新增可开始条件、具体动作、DoD 和“不包含”，消除“任务名称存在但
  不知道该做什么、做到什么程度”的歧义。

## [1.0.0-rc.1] - 2026-07-06

### Added

- 新增 `signoff bootstrap --actor=sm --due=+72h`：从实时全局审计建立唯一首签
  initial Campaign，并连续提交不可变 Notice；已有 Campaign、角色覆盖不全、事实源
  不干净或审计不可用时拒绝。
- 生成器新增 `--initial-signoff=auto|guide|off` 与
  `--initial-signoff-due=<相对/绝对时间>`。workspace Git、真实角色邮箱及 Python
  均就绪时自动发起；`repo/none/reuse`、占位邮箱或缺 Python 时安全降级为操作指引。
- `signoff.mjs version` / `--version` 输出生成时注入的工具版本。
- 新增首签自动发布、重复 bootstrap 拒绝及无 Git 降级的回归测试。

### Changed

- 首签职责明确为“创建者/FS 准备并推送、工具生成范围和 Notice、SM 原样转发与
  跟踪关闭、成员本人执行”；SM 不再临场重写首签通知。
- 截止参数支持 `+Nm/+Nh/+Nd`；首签默认 `+72h` advisory。
- RC 支持基线调整为 Node.js >=24，CI 验证 Node 24/26 × Linux/Windows/macOS。
- 首页、09 操作入口、角色手册、SM 作战手册及 Scrum/12 原位升级，未新增重复规范。

### Known limits

- 自动首签只在整个项目工作区已进入同一 Git 事实源时执行；默认独立代码仓模式只
  给出引导。普通成员签核仅需 Node/Git，创建者和 SM 的实时审计仍需 Python。
- 本地互斥锁只保护同一 Git common-dir；跨机器并发仍依赖 pull/push、分支保护和
  团队串行约定。
- 本版本为 RC；建议至少用一个全新项目完成 create → bootstrap → 全员 sign →
  close → 干净克隆复算后再发布 `v1.0.0`。

## [0.10.7] - 2026-07-06

### Fixed

- 修复 Windows CI 的 Python stdout 编码崩溃：`generate_doc_index.py` 启动时
  `sys.stdout/stderr.reconfigure(encoding="utf-8")`。GitHub Actions Windows 运行器
  默认 stdout 为 cp1252，`print()` 中文抛 `UnicodeEncodeError` 使进程非零退出，
  导致依赖生成器的 6 个签核测试失败。在脚本内自愈，不依赖 `PYTHONUTF8`/`PYTHONIOENCODING`
  等调用方环境变量。
- 测试去除日期耦合：`v0.10.4 publishes immutable notices` 用当日本地日期动态拼接
  Campaign（`SIGN-<today>-001`）与 Event（`EVT-PO-<today>-001`）ID，不再硬编码
  `20260704`；此前非 2026-07-04 当日运行会因 ID 不匹配导致 CI 失败。

## [0.10.6] - 2026-07-05

### Fixed

- 首次尝试修复 Windows Python 中文 stdout 编码，向索引生成器增加 UTF-8 环境处理。
  该提交未完全消除不同 Windows runner 的编码差异，后由 v0.10.7 的脚本内
  `stdout/stderr.reconfigure()` 取代；保留本条用于补齐已发布 tag 的历史。

## [0.10.5] - 2026-07-04

### Changed

- 截止时间默认改为 **advisory**：逾期仍可签核，Event 记录 `late=true` 与迟到时长；
  保留可选 `--due-mode=hard`（强制未来截止，过期拒签）。
- `sign` 与 Python 解耦：`publish` 固化审计快照（`auditInputHash`/`inputPaths`/
  `pendingAssignments`）到 Notice，`sign` 用 Node/Git 重算并作**三级漂移判断**
  （审计输入漂移拒签、代码漂移仅提示、仅签核工件漂移放行）；`close` 仍运行 Python
  做实时全局审计作为权威门禁。成员签核只依赖 Node/Git/Notice。
- Notice「通知凭证」术语改为「Notice 一致性摘要」，明确非秘密、非身份认证、非阅读证明。
- 工具版本改由生成器注入（模板用 `{{TOOL_VERSION}}` 占位，`index.mjs` 注入
  package.json 版本），生成项目无根 package.json 时不再运行时读取；保留一致性测试。
- 当前 SOP（首页第 6 步、角色手册 SM 五步与签核编排协议、Scrum/12）统一为
  `prepare → publish → sign`；历史 `notify` 内容保留为 legacy 叙述。

### Added

- v0.10.5 反向测试：advisory 逾期签核记录 late、hard 模式过期拒签、审计输入漂移拒签。
- ADR「签核身份保证与签名提交高保证路线」：记录命令级身份的边界与签名提交升级路线。

### Fixed

- 修正评审中「根除代签」「无安全漏洞」的过强表述：命令级身份只保证「工件与声明身份
  一致」，非操作者认证；系统适用于受信任团队的流程完整性与审计追踪，高保证环境仍需
  平台账号、保护分支、签名提交或审批认证（见 DESIGN「安全边界与适用范围」）。
- Scrum/12、锁边界文档：明确 common-dir 锁仅覆盖同一 Git common-dir 的并发，
  跨机器由 pull/push、分支保护与冲突处理保证。

## [0.10.4] - 2026-07-04

### Added

- 新增 `publish --campaign=<ID> --actor=sm`，生成并提交不可变 Notice 工件。
- Notice 为每个角色生成带完整 `--notice=<sha256>` 的签核命令。

### Changed

- `prepare` 强制要求可解析且晚于当前时间的 `--due`。
- `sign` 必须校验 Notice 文件、SM 首次作者、canonical 内容和命令摘要。
- 旧 `notify` 命令停用，避免预览文本被误当成正式通知。

### Fixed

- 修复 SM 手工压缩角色范围、使用区间表达、补写过期截止时间后，错误通知仍能
  驱动成员签核的问题。

## [0.10.3] - 2026-07-04

### Changed

- legacy 签核证据必须是当前 `HEAD` 的祖先提交，不再以本地对象库中“对象存在”
  作为有效依据。

### Fixed

- 修复悬空 Git 对象只在某个成员本地存在，导致同一 HEAD 在原工作区与干净克隆
  得到不同签核范围的问题。
- 修复 SIGN-20260704-004 在 SM 本地漏掉 Mid.BE `CHG-100`、干净克隆却重新检出
  该缺口的跨克隆审计不一致。

## [0.10.2] - 2026-07-04

### Added

- Campaign V3 新增 `repositoryTree` 与 `auditSourceState=clean`，补充可复现来源证明。
- `prepare`、`verify`、`notify`、`sign`、`close` 在审计前检查工作区事实源。

### Changed

- 全局审计 Campaign 只有在 `auditScopeHash` 与当前范围完全一致时才允许生成通知。
- 生成型文档索引可保持未提交，不影响事实源检查；其他已跟踪或未跟踪变化均会阻断审计操作。

### Fixed

- 修复脏工作区中的未提交事实可进入 Campaign 指纹、推送后无法在干净克隆复现的问题。
- 修复 `verify` 显示 `exact=no` 时仍可生成一份过期或缩减范围通知的问题。

## [0.10.1] - 2026-07-04

### Added

- Campaign V3 记录工具版本、仓库 HEAD、审计生成时间、审计来源 HEAD 和范围指纹。
- 新增 `signoff.mjs verify`，逐角色比较 Campaign 与当前全局待处理 Change ID。

### Changed

- `prepare` 在提交 Campaign 前校验全局覆盖；显式范围漏项时直接拒绝并提示
  `--from-audit`。
- `notify` 每次刷新全局审计并先运行覆盖验证；验证失败不输出通知。
- `sign` 同样执行前置验证，防止绕过错误通知继续签核。

### Fixed

- 修复错误或过期 Campaign 可以生成通知、直到 close 才暴露范围缺口的问题。
- 修复通知无法证明使用了哪个工具版本、仓库提交与审计范围的问题。

## [0.10.0] - 2026-07-04

### Added

- `generate_doc_index.py` 输出机器可读的 `07_签核状态.json`，包含全局待处理人数
  和逐角色 Change ID。
- `signoff.mjs prepare --from-audit --actor=sm` 自动生成 corrective Campaign、
  角色范围和连续 Campaign ID。
- Campaign V2 保存目的、摘要、阅读范围、截止时间和时区，`notify` 可直接转发。

### Changed

- 签核提交改用命令级 Git 身份，不再要求成员反复修改共享仓库
  `user.name/user.email`。
- 同一工作目录中的 prepare/sign/close 使用 Git common-dir 互斥锁串行写入。
- `close` 同时检查 Campaign 局部覆盖和项目全局审计；全局仍有缺口时拒绝关闭。

### Fixed

- 修复 SIGN-20260704-001 局部 `CHG-160` 已关闭、全局仍有三人待处理的状态分裂。
- 修复多人共用单 worktree 时 Git 配置互相覆盖和签核提交竞争的问题。

## [0.9.9] - 2026-07-04

### Added

- 新增 `tools/signoff.mjs`：SM `prepare/close`、成员 `sign`、全员 `status/notify`。
- Campaign、Event、Closure 改为 `.team/signoffs/` 下的独立 JSON 文件；成员
  assignment、姓名、邮箱、日期和覆盖范围由工具生成。
- 回归测试覆盖身份错误、非 SM 关闭、待处理关闭、他人预铺后空格洗白及有效补签。

### Changed

- 手册旧事件表降为只读兼容；新 Event 文件只允许一次创建提交，首次作者和邮箱
  必须匹配 `roles.config.json`。
- 签核机制升级登记为全员新基线变化；纠偏批次应同时覆盖旧缺口和新规则。

### Fixed

- 修复通知统一示例造成 Change ID 覆盖不足、共享表并发覆盖、当前 blame 可被
  空格修改洗白、非 SM 错误关闭及同基线 closed Campaign 选择错误。

## [0.9.8] - 2026-07-04

### Fixed

- 统一 README、PowerShell/Bash 引导脚本与 npm 制品版本，默认安装 `v0.9.8`。
- 新 `auto` 签核事件在 Git 提交前不再计入当前覆盖；`LEGACY + unverified`
  继续按迁移兼容规则处理。
- Campaign 关闭后仍有待处理时，审计明确报告事实冲突并要求建立
  `corrective` 批次；关闭前必须待处理归零。
- 默认 Review/Retro 增加空“评审意见追加”区，`review-status.mjs` 增加缺失、
  重复、嵌套和未配对锚点检查。

### Added

- 发布入口一致性、默认 Review/Retro、待提交覆盖、关闭后纠偏的回归测试。
- 项目侧 V1.5 关闭后异常作为来源回流到既有 Scrum/06、12、13 与来源索引。

## [0.9.7] - 2026-07-03

### Fixed

- 签核有效覆盖算法：⚠️ 异常（疑似代签/无效）事件覆盖的 CHG 不再计入已验证
  覆盖，拆分为「待签」（从未签）与「待重签（疑似代签/无效）」，修复「旧代签
  占位 + 新本人补签」可伪装成「当前有效」的漏洞；🟡 未验证历史证据沿用
  v0.9.5「计入覆盖但标历史缺口」语义。
- 版本发布事实对齐：补齐 v0.9.6 变更记录并发布 v0.9.7，使 Git 标签、npm
  制品版本与 CHANGELOG 一致（不重写已公开的 v0.9.6 标签）。

### Added

- 代签检测反向测试：作者与成员不匹配→⚠️、异常事件占位后本人补签仍待重签、
  未提交事件→🟡、本人重签清除异常。
- 知识回流：DESIGN 演进决策、Scrum/06 反模式、Scrum/12 SM 签核审计规则、
  Scrum/13 评审追加署名、Scrum/99 来源索引同步。

### Changed

- 术语定位：blame 反查为「Git 署名一致性检测」，用于发现作者与成员不一致，
  不等同于不可伪造的身份认证；后续可扩展 author-mail 与角色邮箱共同校验。

## [0.9.6] - 2026-07-03

### Added

- 签核审计新增**代签检测**：`auto` 证据用 `git blame` 反查签核行当前作者并与
  「成员」列比对，作者≠成员标「⚠️ 疑似代签」，状态表相应显示「证据异常，需本人重签」。
- 手册 §5 新增 **CHG 评判标准**（何时该登记新 Change ID）；首页「30 分钟上手」
  第 6 步细化签核流程（确认范围→本人追加→本人身份提交）。

### Changed

- 签核证据反查从 `git log -S`（pickaxe，取字符串首现提交）改为 `git blame`
  （取当前行真实作者）。修复预铺签核行时证据被错误归因给脚手架作者、且无法
  发现他人代提的问题。手册 §4 明确"本人在本人提交中追加，不得代提或预铺空行"。

### Fixed

## [0.9.5] - 2026-07-03

### Added

- 角色签核升级为 Change/Campaign/Event 追加式模型，支持 initial、
  incremental、catch-up 和 full-rebaseline。
- 签核审计按角色计算未覆盖 Change ID，并从稳定 Event ID 自动反查 Git
  commit、作者和时间。
- SM 通知增加 Campaign、覆盖范围、成员事件回复和全量重基线模板。

### Changed

- 当前有效性与历史完整性分开报告；全量重基线不再抹平旧证据缺口。
- 小团队多帽签核改为按帽子追加事件，不再维护每帽子的最新快照行。

### Fixed

- 修复只保存最新基线导致 V1.2/V1.4 补签历程不可追溯的问题。
- 移除签核行自填自身 commit 的自引用设计，避免误填代码仓 hash。

## [0.9.4] - 2026-07-03

### Added

- 将 Sprint 1-2 的关闭入口、三时间口径、平台无关 CI 证据、变化触发式 CI、
  SM 模板选择、测试统计和签核误派经验补入知识库反模式清单。
- 来源索引登记 Sprint 1、Sprint 2、Sprint 0-2 阶段复盘和签核事故的知识及
  操作落点。
- 反向回流指南新增六层 Definition of Done：来源、L2、L3、验证、发布和
  项目闭环。

### Changed

- SM 知识规范增加问题类型选择和签核编排原则。
- 质量指南明确测试数量不能替代实际命令、commit、结果和失败明细。

## [0.9.3] - 2026-07-03

### Added

- 新增角色手册签核编排协议，区分入队首签、变更重签和仅 SM 自签。
- SM 回复入口新增首签、重签、误派纠偏和完成闭环四类通知模板。
- 签核审计输出签核类型、应签范围、待处理人数和 SM 下一动作。

### Fixed

- 修复 `resign-roles` 使用 `FS`、`Mid.BE` 等短角色名时无法匹配
  `FS/DevOps`、`Mid.BE/QA` 表格角色的问题。
- 明确签核编排责任不可转交给 Ritchie 或其他被签核成员。

## [0.9.2] - 2026-07-03

### Added

- 新增跨平台 `tools/review-status.mjs`，检查 Review/Retro 的追加人员标题、
  重复 section 和重复角色标题。
- SM 查询入口增加“问题→模板”选择、提问示例和完整回复示例。

### Changed

- Sprint 关闭区分计划周期、工作完成和正式关闭，并要求同步首页、日历和
  角色工作入口。
- 归档采用单一正文事实源；tag 后事实错误使用普通修正提交，不移动 tag。
- CI 改为仓库、技术栈、门禁或平台变化触发，不再作为每轮固定重建动作。
- 远端验证使用平台无关的最小证据字段，不强制各 CI 平台提供相同形式。

## [0.9.1] - 2026-07-01

### Changed

- 文档治理改为显式纳管：只有 `governance: managed` 的长期正式产物进入
  缺字段、非法枚举、孤儿率和治理健康度；历史、入口、骨架默认 exempt。
- 签核未完成仅作入队提示，不作为 Sprint 开工门禁；只统计已签但基线过期。
- 文档索引从固定每周运行改为 Sprint 末或异常触发。
- 小团队裁剪明确为实验性手工方案；在“成员 + 多帽子”模型实现前不宣称
  CLI 可以自动合并角色或按实际成员创建 worktree。

### Fixed

- 修正首页 SOP 文件名、锚点/兜底等错字和知识库文档规模。
- 修复 `v0.9.0` 标签与当前主线内容分叉造成的发布歧义；本版本以当前
  `main` 为完整基线，不移动既有标签。

## [0.9.0] - 2026-07-01

### Added

- 新增 `00_项目导航/11_角色行动手册.md`：每角色一页卡（职责/soul/边界/输入输出/行动指南/必读最小集/周期治理职责/当前任务）+ 治理责任表（谁生成谁治理）+ 周期任务清单（含产出后处理）+ 行级签核表 + 签核基线变更日志 + SM 变更→重签 SOP 与通知模板。
- 生成器新增 `role_monitor`（按角色产出健康度监控）与 `signoff_audit`（比对确认基线与手册版本，输出签核状态）。
- 项目首页 30 分钟上手改为“找角色卡 + 跑通真实任务过 DoD + 签核”，明确唯一入口为首页。
- `知识库/项目模板/05_小团队角色裁剪指南` 新增 §5（裁剪后各产物如何适配：帽子稳定只改映射）与 §6（创建之初/缩编/扩编分场景步骤）。

### Design

- 来源：QFD_Ark 管理者痛点——成员难以一目了然获知职责/边界/IO，管理者难以确认清晰度与监控覆盖；且“读资料+写心得”不转化为行为。解法：聚合入口 + 事件驱动行级签核 + 自动监控，学习由“做”发生。

## [0.8.0] - 2026-07-01

### Added

- `tools/generate_doc_index.py`：纯标准库文档索引生成器，按角色/迭代/领域/阶段/状态生成可点击索引、缺字段报告、停滞与协作完整性审计；角色名从 roles.config.json 读取。
- `00_项目导航/05` 新增 §12 Frontmatter 元数据 Schema、§13 产出契约与任务卡（含非终态三要素）。
- `07_度量改进/00_度量口径` 新增“治理健康度”指标（事实源一致率、approved 证据覆盖率、元数据健康度、文档精简度）。
- `知识库/项目模板/05_小团队角色裁剪指南.md`：2-4 人团队的角色合并档位与兼任红线。

### Design

- 来源：QFD_Ark Sprint 0-1 验证的文档治理机制（元数据地基→多维查询→产出契约→治理度量），经反向回流指南 L2/L3 回流。

## [0.7.2] - 2026-07-01

### Added

- `Scrum/13` 新增“多人追加文档的锚点隔离（Retro/Review）”：成对角色锚点、只动自己块、重复 section 去重、高争用拆独立文件。
- `Scrum/11` 新增“文档工作区的提交署名”：文档由本人提交或 `--author` 保留真实作者，禁止统一账号代提。

### Changed

- `Scrum/13`、`Scrum/11` 反模式表各补一行（Retro 覆盖归属、文档统一账号代提）。

### Design

- 来源：QFD_Ark Sprint 1 两起真实事故——Retro 纪要标题被覆盖导致归属错乱、全部提交由 SM 单一账号代提。经一个 Sprint 验证后回流（L2 知识回流）。

## [0.7.1] - 2026-07-01

### Added

- 项目首页增加 30 分钟上手路径；角色指南改为按角色最小阅读和带教责任。
- 知识库总目录增加固定文档数量、规模、Owner 与动态文档估算模型。
- 术语表和角色指南增加 Goal、Story、AC、Task、模块、证据及其事实源地图。

### Changed

- 新成员完成标准从“读完资料”改为“找到 Task、理解 AC/证据并开始交付”。
- 学习心得和培训材料改为可选知识产物，不再要求按 Sprint 定期输出。
- `01_Sprint流程监控台.md` 更名为 `01_Sprint任务表与流程看板.md`，让任务入口可直接发现。
- Story 工作区改为复杂场景按需创建；普通 Task 不再重复登记输入输出总表。

## [0.7.0] - 2026-06-30

### Added

- Sprint 监控台新增唯一任务执行表，记录父项、任务级别、复杂度、Owner、前置和证据。

### Changed

- 普通实现任务默认只更新状态和证据；高阶成员负责目标、拆分、复杂度与 Review。
- 文档治理从“所有文件强制 Frontmatter/PR”改为 L0/L1/L2 按冲突风险升级。
- 外部 Git/Docker/云环境待验证与真实 Sprint 阻塞分离。
- `Scrum/13` 从 328 行收缩到 120 行，保留高级机制但取消默认强制。

## [0.6.0] - 2026-06-30

### Added

- 新增 Sprint 仓库策略：`reuse`、`import`、`rewrite`、`create`。
- 新增 `--repo-strategy` 与 `--source-repo` 参数，并写入可复现配置。
- 新增 `10_代码仓库/00_仓库清单.md`，管理现行、来源、候选和退役仓库。
- Sprint 计划增加仓库决策卡，记录切换门禁、旧仓责任和回退路径。

### Changed

- 项目背景类型与代码仓库策略解耦；项目类型保持稳定，仓库策略每次 Planning 确认。
- `reuse` 不再生成伪代码骨架或初始化新 Git 历史，只登记现有仓库。
- `rewrite` 使用旧仓生产维护 + 新仓候选验证的双仓模型。
- 技术全景区分当前与目标技术栈，并要求记录迁移与兼容证据。
- 更新 Git 仓库知识指南和通用落地指南，覆盖 Sprint 中途技术栈重写。

## [0.5.0] - 2026-06-30

### Added

- 新增`知识库/Scrum/14_Sprint关闭与证据治理规范.md`：
  - 直接提炼项目侧`14_Sprint0外部评审教训总结.md`的六条教训。
  - 分离时间盒、Sprint Goal、遗留处置和下一Sprint准入。
  - 固化事实冲突裁决、硬门禁、可复算统计和annotated tag规则。
- 新增`03_迭代运行/Sprint-0-启动/07_Sprint关闭与准入检查表.md`。

### Changed

- 04/06/08/12/13规范与知识目录接入14号关闭治理规范。
- Sprint计划、Review、Retro和度量快照增加轻量关闭提示。
- README、项目首页、来源索引和模板差距清单登记关闭指南。
- `09_SM教练查询与回复模板.md` 升级为团队双向交互协议，增加成员状态包、SM 确认、状态纠偏、群聊快报、流程全景和单角色状态卡。
- 团队协议和 Sprint 监控台改为事件触发式同步；无状态变化时不要求重复填报。
- `12_SM流程监控与角色行动决策规范.md` 定位为 SM/流程教练选读原理，删除与 09 重复的回复模板。

### Design

- Sprint close tag表示不可变时间点基线，不等于全部工作Done或release。
- 模板只提供知识指南与检查表；自动化扫描由具体项目按规模选配。
- README、目录和持续台账不机械强制Frontmatter。
- 日常协作采用“09 单一操作入口 + 12 选读原理”，不新增日报、沟通台账或审批节点。

## [0.4.2] - 2026-06-29

### Added

- 補齐 `01_产品发现/` 中长期留白的 02-04 槽位（此前跳号 00/01/05、意图未明示）：
  - `02_价值假设.md`：使用 `07_产品发现与价值排序指南` 中的价值假设模板，含状态列与验证信号
  - `03_竞品与市场.md`：市场容量 TAM/SAM/SOM、竞品/替代方案对照、访谈洞察、差异化定位一句话
  - `04_路线图与北极星指标.md`：北极星指标 + 12 周路线图 + 调整记录
- 所有 6 份产品发现文档加 frontmatter（owner: PO），纳入 13 规范范围
- 06 总表 B 段补 B04/B05/B06/B07 四行：B01-B03 保留原语义不动（B03 仍为首批 Backlog）

### Changed

- `00_项目首页.md` 产品发现入口从 1 行扩为 6 行，覆盖全部槽位
- `知识库/Scrum/07_产品发现与价值排序指南.md` §7 "最小输出物" 表项明确映射到 02/03/04/05 具体文件路径

### 设计动机

- **为什么保留 B03 不动**：B03 “首批 Backlog” 在 9 个文件中被引用，改 ID 会破坏语义。新增槽位用 B04-B07，B03 依赖项加 B04（价值假设）。
- **为什么不是紧凑化（0 → 1 → 2 重编号）**：会破坏 QFD_Ark 项目依赖的 `01_产品发现/05_机会评估与取舍记录.md` 路径。保留原有文件路径不变，只插入中间槽位。
- **为什么这三个槽位而不是别的**：对齐 `07 价值排序指南` 的“产品发现三层证据”（用户/价值/可行）与优先级模型（RICE/WSJF 需市场与路线图数据）。

## [0.4.1] - 2026-06-29

### Fixed

- **修复 v0.4.0 的设计漏洞：双 primary owner 不解决冲突**。
  - 原 `D_质量验证.md` 写为 `owner: [Mid.BE, Mid.FE]`，违反 13 规范 §5"唯一 owner"原则——两人都能改 = 公地悲剧。
  - 改为**分段 owner**：`owner: Mid.BE`（primary，整体一致性兜底）+ `coOwners: [Mid.FE]`（继任权）+ 段级 owner（§1 由 Mid.BE 改，§2 由 Mid.FE 改）+ 表格新增 `row-owner` 列。

### Changed

- `知识库/Scrum/13_文档协作与并发控制规范.md` §5 加 §5.1 铁律"owner 字段唯一"；新增 `coOwners` 字段语义。
- `13_*.md` §10 三类协作模式补充 frontmatter 写法标准；分段 owner 示例升级为 v0.4.1 形态（含 primary + coOwners + 段级 + row-owner）。
- `13_*.md` §12 反模式表追加"`owner: [A, B]` 数组写法"。
- `06_团队输入输出总表/00_索引.md` D 行描述更新为"Mid.BE (primary) + Mid.FE (coOwner, 段级)"。
- `_github/CODEOWNERS` D 行附加注释说明 GitHub 不支持行级，合并由 primary owner 主导。
- 测试 case `v0.4.0 splits 06 ledger ...` 强化：禁止 `owner: [...]` 数组形式；断言 D 文件含 `coOwners` 与段级 owner 标注。

### 设计动机

- **为什么 0.4.0 留下了这个洞**：当时把"质量需要 QA 视角整体一致"和"两个角色各管一摊"混淆为"双 primary owner"。其实 13 规范 §10 已经定义了分段 owner 模式，但 D 实例没用，反而写了含糊的数组。
- **为什么不直接拆 D 为两文件**：D 只 2 行，文件膨胀代价 > 收益；质量策略与测试用例需要 QA 视角一致性；段级 owner 已经够。
- **`coOwners` 与 `reviewers` 的区别**：reviewers 是评审人（写评审段），coOwners 是次要权威（仅在 owner 不可达时由 SM 仲裁后代行）。两者职责不交叉。
- **教训**：规范本身不能保证实例自洽。本轮发现 → 修复 → 测试守护，形成"规范 → 实例 → 测试"三位一体的回归保护。

## [0.4.0] - 2026-06-29

### Added

- **多人协作并发控制机制**（机制级重构）
  - 新增 `知识库/Scrum/13_文档协作与并发控制规范.md`：9 层防御机制，针对 12 类冲突场景（总表竞争、设计文档稀释、评审拥挤等）
  - 新增 `知识库/项目模板/04_文档协作机制迭代计划.md`：本轮需求、候选方案评估、采纳决策、验收与 DoD
- **`06_团队输入输出总表` 拆为按角色分表目录**
  - `00_索引.md`（owner: SM）+ `A-F_*.md` 6 个分表，每份 frontmatter 声明唯一 owner
  - A_项目管理/SM、B_产品发现/PO、C_工程设计/TL、D_质量验证/Mid.BE+Mid.FE、E_发布运维/FS、F_度量改进/SM（允许评审段追加）
  - 保留原有 ID（A01..F0x）不变，仅文件路径从单件移到分件
- **平台护栏**：新增 `template/_github/CODEOWNERS`（生成为 `.github/CODEOWNERS`）
  - 7 角色映射占位符 `<*-github>`，生成时填充真实角色名作为注释
  - 按路径 glob 自动指派 reviewer，覆盖 06 分表、产品、工程、质量、发布、知识库
- **关键协作文档加 Frontmatter**
  - 06 分表、7 个；owner 与评审者明确、`status: review/approved`、`version`、`last-updated`
  - `05_输入输出管理规范.md` 添加 frontmatter 与 §11 多人协作并发控制
- **生成器增强**
  - 新增 `roleNameById` 辅助函数与 7 个 `ROLE_*_NAME` 占位符，供 CODEOWNERS 注释里的角色名替换
  - `renderName` 增加 `_github → .github` 转换，避免 npm publish 丢失 dotfile
  - `applyTemplatePlan` 读取模板时剥离 UTF-8 BOM，防御工具链差异

### Changed

- `00_项目首页.md` 中 06 总表入口改为 `06_团队输入输出总表/00_索引.md`，新增 13 规范与 CODEOWNERS 链接
- `SM 作战手册` 反模式自检加一条：“我是否在替 owner 做内容合并”
- 10 个文档中原指向 `06_团队输入输出总表.md` 的引用批量更新为 `06_团队输入输出总表/00_索引.md`
- 知识库总目录、`知识库/README.md`、`Scrum/99_来源索引.md`、`项目模板/01_模板需求提取与差距修正.md` 同步登记 13 与 04
- 测试补 1 个 case（`v0.4.0 splits 06 ledger ...`）：验证 06 拆分、CODEOWNERS 生成、frontmatter 存在、原 06 单文件已删除

### Removed

- 原 `template/00_项目导航/06_团队输入输出总表.md` 单文件（被拆分为目录）

### Fixed

- 10 个模板 md 文件中意外的 UTF-8 BOM（来自之前 PowerShell `Set-Content -Encoding UTF8` 写入）全部剥离

### 设计动机

- **为什么不采用“SM 统一合并”方案**：SM 成单点瓶颈，违反 Scrum “不替决”原则；且产生“草稿表 + 主表”双事实源。采用 Frontmatter + PR + CODEOWNERS 是业界应对同类问题的成熟机制。
- **为什么 06 总表仅拆到角色粒度**：再拆下去会引入。逻辑聡合问题；F 度量改进是唯一“多人参与”场景，用 §3 评审段追加协议解决。
- **为什么 CODEOWNERS 不默认填充真实账号**：生成器不知道 GitHub 账号与角色的映射；用占位符 + Sprint 0 必做清单让团队显式填入。

## [0.3.4] - 2026-06-29

### Added

- Sprint 流程监控台新增依赖时间线、并行泳道、汇合门和 Mermaid 因果图。
- 新增 `00_项目导航/09_SM教练查询与回复模板.md`，提供完整、精简和无法判断三种标准回复。
- 教练规范新增硬依赖、软依赖、独立并行、反馈依赖和决策门禁五类关系。

### Changed

- SM 回复顺序调整为：快照可信度 -> 关键因果链 -> 并行泳道 -> 汇合门 -> 角色行动 -> 依据。
- 角色行动新增“完成后解锁谁”，避免只有任务清单而没有流程因果。

## [0.3.3] - 2026-06-29

### Added

- 新增 `Scrum/12_SM流程监控与角色行动决策规范.md`，定义阶段门禁、角色五类行动、停止推断条件和教练回复协议。
- Sprint 监控台新增工作流阶段、事实源新鲜度、角色行动板和流程预警。

### Changed

- `01_工作进度表.md` 升级并重命名为 `01_Sprint流程监控台.md`。
- 输入输出总表明确定位为项目级产物账本，不再承担任务派发或角色行动判断。
- SM 作战手册接入流程监控台和教练行动判定算法。
- 角色默认行动抽取为统一常量，便于集中维护和后续本地化。
- WIP 明确为成员站会前自填；流程预警初始状态统一为未校准。

## [0.3.2] - 2026-06-29

### Added

- 新增 GitHub Actions 测试矩阵：Node.js 18/20/22 × Ubuntu/Windows/macOS。
- 自动化测试补齐 `--no-worktrees`、无 Git `--dry-run` 和本地 bare 远端推送契约。

### Changed

- `npm test` 显式运行 `test/index.test.mjs`，兼容 Node.js 18+ 和三大操作系统。
- 精简 Git 仓库模式 FAQ，并指向角色工作区自动化迭代计划。

### 设计动机

- **测试命令显式指向文件**：`node --test test` 在 Node 22/Windows 会把目录当作模块并失败，因此使用 Node 18+ 均支持的 `node --test test/index.test.mjs`。
- **测试不进入发布包**：`package.json.files` 继续不包含 `test/`；CI 使用仓库源码执行测试，npm 消费者只获得运行所需文件。

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

- 项目导航新增 `00_项目导航/08_团队开发协作SOP.md`：面向全员的开发操作 SOP，覆盖准备、Git 模式识别、worktree、分支命名、提交、PR、Done 判定与 10 个 FAQ。
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
