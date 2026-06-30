# 代码仓库区

本区域登记项目使用过的代码仓库及其生命周期。当前策略：

```text
{{REPO_STRATEGY_LABEL}}
代码位置：{{REPO_WORKSPACE_LOCATION}}
```

`reuse` 不会在项目工作区复制既有代码，也不会创建新的 Git 历史；其他策略
会生成目标仓库骨架。统一状态见 `00_仓库清单.md`。

## 协作原则

- 主代码仓库保持唯一事实源。
- FS 维护 `sprint-x` 集成分支。
- 编码角色使用 `git worktree` 或独立 clone 并行工作。
- 本地协同目录使用 `TeamWork/`，已加入 `.gitignore`。
- 分支名使用英文小写 hyphen，例如 `feature/sprint-1/initial-work-evan-mid-fe-qa`。
- 文档主事实源在外层项目工作区，代码仓库不维护重复的工程文档中心。

## 可能结构

```text
10_代码仓库/
  00_仓库清单.md              # 仓库角色、状态、切换和回退事实源
  {{REPO_NAME}}/              # 非 reuse 策略生成的目标仓库
    apps/
    infra/
    TeamWork/                 # 本地协同目录，不提交
      <Name_Role_Duty>/       # 角色 worktree/clone
```

目标仓存在时，详细命令见 `{{REPO_NAME}}/README.md`。复用现仓时，团队在
现有仓库内按协作 SOP 创建 Sprint 分支和角色工作区。
