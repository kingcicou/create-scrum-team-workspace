# 工程实施与 TeamWork 协同规范

## 1. 核心原则

编码阶段的目标不是制造多个代码副本，而是让并行开发、阶段集成和责任追溯清晰。

| 原则 | 说明 |
| --- | --- |
| 主仓库唯一事实源 | 稳定分支、Sprint 集成分支、最终合并记录都在主仓库 |
| TeamWork 本地协同 | 每个编码角色一个 worktree/clone，互不污染 |
| FS 统筹集成 | FS 维护 `sprint-x`，不替所有人编码 |
| Git 身份可追溯 | 每个工作区配置本地 `user.name` 和 `user.email` |
| 小批量合入 | 减少冲突和集成风险 |

## 2. 推荐目录

```text
10_代码仓库/
  <RepoName>/
    apps/
      frontend/
      backend/
    infra/
    TeamWork/                 # 本地目录，.gitignore 忽略
      <Name_Role_Duty>/
```

## 3. 分支命名

推荐：

```text
sprint-<number>/<short-topic>-<name>-<role>
```

示例：

```text
sprint-1/login-flow-evan-mid-fe-qa
sprint-1/api-contract-ritchie-mid-be-qa
sprint-1/ci-baseline-torvalds-fs-devops
```

连接符建议：

| 连接符 | 建议 |
| --- | --- |
| hyphen `-` | 推荐，适合 URL、CI、脚本 |
| underscore `_` | 可用，但长分支可读性略差 |
| 中文 | 不推荐，跨平台和 CI 可能有编码问题 |
| 空格/括号 | 禁止 |

## 4. worktree 示例

```bash
git switch -c sprint-1
mkdir -p TeamWork
git worktree add TeamWork/Evan_MidFE_QA -b sprint-1/login-flow-evan-mid-fe-qa sprint-1
git worktree add TeamWork/Ritchie_MidBE_QA -b sprint-1/api-contract-ritchie-mid-be-qa sprint-1
```

配置 Git 身份：

```bash
git -C TeamWork/Evan_MidFE_QA config user.name "Evan"
git -C TeamWork/Evan_MidFE_QA config user.email "evan@example.com"
```

## 5. FS 集成职责

| 职责 | 动作 |
| --- | --- |
| 创建 Sprint 集成分支 | 从主线创建 `sprint-x` |
| 初始化 TeamWork | 创建本地协同目录和角色 worktree |
| 维护合并节奏 | 每日或 Story 完成后合入 |
| 处理冲突 | 协调相关角色一起解决 |
| 维护 CI 状态 | `sprint-x` 保持可构建、可测试 |
| 准备 Review | 确保展示真实可运行增量 |

## 6. Story 工作区必须记录

```markdown
## 代码协作信息

- 主工作分支：
- 协作分支：
- 负责人：
- PR / MR：
- CI 结果：
- 本地验证命令：
- 测试证据：
- 合入目标：
- FS 集成结论：
```

没有分支、PR、测试证据和集成结论的 Story，不应标记为 Done。

## 7. 禁止事项

- 禁止直接在 `main` 开发。
- 禁止手工复制代码目录后开发而不管理 Git 来源。
- 禁止多个角色共用一个工作目录。
- 禁止提交 `TeamWork/`。
- 禁止长期让特性分支落后 `sprint-x`。
- 禁止用统一账号代替真实提交身份。
