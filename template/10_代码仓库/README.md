# 代码仓库区

这里放实际可运行代码仓库。默认生成一个主仓库骨架：

```text
{{REPO_NAME}}/
```

## 协作原则

- 主代码仓库保持唯一事实源。
- FS 维护 `sprint-x` 集成分支。
- 编码角色使用 `git worktree` 或独立 clone 并行工作。
- 本地协同目录使用 `TeamWork/`，已加入 `.gitignore`。
- 分支名使用英文小写 hyphen，例如 `sprint-1/initial-work-evan-mid-fe-qa`。
- 文档主事实源在外层项目工作区，代码仓库不维护重复的工程文档中心。

## 推荐结构

```text
10_代码仓库/
  {{REPO_NAME}}/              # 主代码仓库
    apps/
    infra/
    TeamWork/                 # 本地协同目录，不提交
      <Name_Role_Duty>/       # 角色 worktree/clone
```

详细命令见 `{{REPO_NAME}}/README.md`。
