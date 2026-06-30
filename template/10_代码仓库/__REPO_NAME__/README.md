# {{REPO_NAME}}

这是 `{{PROJECT_NAME}}` 在 `{{REPO_STRATEGY}}` 策略下的目标代码仓库骨架。
`rewrite` 时它是候选替代仓，在切换门禁通过前不得宣称为生产主仓。

## 目录

```text
{{REPO_NAME}}/
  apps/
    frontend/                 # 前端应用
    backend/                  # 后端应用
  infra/                      # 基础设施、迁移、部署资源
  .vscode/                    # 仓库级任务
  TeamWork/                   # 本地协同目录，不提交
```

> 文档主事实源在项目工作区外层目录，例如 `../../04_工程设计/`、`../../05_质量验证/`、`../../06_发布运维/`。代码仓库内不再维护第二套 `01-docs`，避免同一信息两处更新。

## Sprint 集成分支

生成器默认已经创建集成分支。手工初始化时执行：

```bash
git switch -c sprint-{{SPRINT_NUMBER}}
```

## 角色工作区

在仓库目录下执行：

```bash
mkdir -p TeamWork
{{WORKTREE_COMMANDS}}
```

如果 Windows PowerShell 不支持 `mkdir -p`，可使用：

```powershell
New-Item -ItemType Directory -Force -Path TeamWork
```

## Git 身份

每个角色工作区都要配置本地身份：

```bash
git config extensions.worktreeConfig true
{{GIT_IDENTITY_COMMANDS}}
```

## 分支命名

推荐：

```text
feature/sprint-<number>/<short-topic>-<name>-<role>
```

示例：

```text
feature/sprint-1/initial-work-evan-mid-fe-qa
```

## 最小验证命令

在真实技术栈落地后，把命令补到这里：

```bash
# frontend

# backend

# test
```

## 与 Scrum 工件的关系

- Story、AC、变更记录在 `../../02_产品待办/`。
- Sprint 计划、风险、评审和回顾在 `../../03_迭代运行/`。
- 架构、API、数据模型和 ADR 在 `../../04_工程设计/`。
- 测试策略和证据在 `../../05_质量验证/`，代码仓库只保留可执行测试、脚本和报告产物链接。
- 发布策略、部署、回滚和 Runbook 在 `../../06_发布运维/`，可执行部署脚本放在 `infra/`。
