# 角色工作区与 Git 身份引导规范

## 1. 目的

在角色确认后一次性建立可复现的编码环境，使 TL/Sr.BE、Mid.BE、Sr.FE、Mid.FE、FS 各自拥有独立工作目录、分支和 Git 身份。PO、SM 保留在角色配置中，但默认不创建编码 worktree。

## 2. 生成前确认门

生成器必须先展示并确认以下信息：

| 信息 | 规则 |
| --- | --- |
| 角色槽位 | 职责稳定，名称可调整 |
| 显示名称 | 团队内唯一，用于目录和提交者 |
| 邮箱 | 格式有效且团队内唯一 |
| 编码工作区 | 仅为 `worktree: true` 的角色创建 |
| 初始 Sprint | 决定集成分支和个人分支名称 |
| 远端地址 | 可留空；配置远端不等于推送 |

确认后的 `00_项目导航/roles.config.json` 是角色配置事实源。重建工作区时优先复用配置文件，不依赖口头记忆。

## 3. 仓库与分支模型

推荐代码仓库独立初始化：

```text
<project>/
  10_代码仓库/<repo>/
    main
    sprint-<n>
    TeamWork/
      <Name_Role>/
```

分支必须避免 Git 引用前缀冲突：

```text
main
sprint-4
feature/sprint-4/login-flow-evan-mid-fe-qa
```

不能同时创建 `sprint-4` 和 `sprint-4/...`。Git 会把前者存为引用文件、后者视为同路径下目录，二者冲突。因此个人分支统一使用：

```text
feature/sprint-<n>/<short-topic>-<name>-<role>
```

## 4. 身份隔离的正确方式

普通的：

```bash
git -C TeamWork/Evan_MidFE_QA config user.name "Evan"
```

会修改共享仓库配置，并不能隔离多个 worktree。正确流程是：

```bash
git config extensions.worktreeConfig true
git -C TeamWork/Evan_MidFE_QA config --worktree user.name "Evan"
git -C TeamWork/Evan_MidFE_QA config --worktree user.email "evan@example.com"
```

审计命令：

```bash
git -C TeamWork/Evan_MidFE_QA config --worktree --get user.name
git -C TeamWork/Evan_MidFE_QA config --worktree --get user.email
git -C TeamWork/Evan_MidFE_QA log -1 --format="%an <%ae>"
```

## 5. 初始化提交与角色测试提交

| 提交 | 默认策略 | 理由 |
| --- | --- | --- |
| 仓库初始化提交 | 创建，由 FS 身份署名 | 建立 `main` 和 Sprint 分支共同基线 |
| 角色身份测试提交 | 可选，留在各角色分支 | 验证目录、分支和提交身份，不污染 `main` |
| 合并测试提交 | 禁止自动合并 | 就绪证据不是产品增量 |

测试提交只写入 `.team/readiness/<role>.md`，提交信息使用 `test(team): verify <role> workspace identity`。验证完成后，可保留分支作审计证据，也可由 FS 关闭/删除。

## 6. 远端安全边界

- `--remote=<url>` 只配置 `origin`。
- `--push` 才推送 `main`、`sprint-n` 和角色分支。
- 远端推送前必须把全部 `@example.com` 占位邮箱替换为可追溯邮箱。
- 不使用强制推送，不覆盖已有远端历史。
- 远端非空或受保护时，推送失败应停止并由 FS 检查，不自动改写历史。
- SSH 凭据、Token、仓库创建和成员授权仍由组织平台管理，不写入模板。

## 7. 验收清单

- [ ] 角色名称、邮箱唯一且与 `roles.config.json` 一致。
- [ ] `main`、`sprint-n` 和 5 个个人分支存在。
- [ ] `git worktree list` 显示 1 个集成目录和 5 个角色目录。
- [ ] 每个 worktree 的 `--worktree user.name/user.email` 正确。
- [ ] `TeamWork/` 已被代码仓 `.gitignore` 忽略。
- [ ] 选择测试提交时，作者身份与对应角色一致。
- [ ] 选择远端推送时，远端分支齐全且没有强制覆盖。

## 8. 文档工作区的提交署名

worktree 身份隔离解决的是**代码仓**的作者归属；**文档工作区**（`00_项目导航` ~ `07_度量改进`
等直接提交到 `main` 的 Markdown）同样需要真实作者，否则 `git blame` 失去归属，
覆盖/误改难以发现（真实事故见 `13_文档协作与并发控制规范.md` §8）。

1. 文档产出由**本人提交**；若由 SM/scribe 代提，必须保留真实作者：

   ```bash
   git commit --author="<Name> <email>" -m "docs(<role>): ..."
   ```

2. commit message 前缀（如 `docs(evan):`）是补充，不替代 `--author`。
3. **禁止统一账号代提**（与 §4 一致）：作者应与改动路径 owner（Frontmatter / CODEOWNERS）一致，不一致视为审计缺陷。
4. 审计：`git log --format="%an <%ae> | %s"` 抽查作者与 owner 是否匹配。

## 9. 反模式

| 反模式 | 后果 | 修正 |
| --- | --- | --- |
| 文档全部由一个账号（如 SM）代提 | git blame 失去归属，覆盖难发现 | 本人提交或 `--author` 保留真实作者 |
| 复制 5 份目录但不使用 Git | 来源和合并关系不可追溯 | 使用 worktree |
| 用普通 local config 配多个 worktree | 最后一次配置覆盖所有角色 | 启用 `worktreeConfig` 和 `--worktree` |
| 个人分支命名为 `sprint-n/...` | 与集成分支 `sprint-n` 冲突 | 改为 `feature/sprint-n/...` |
| 自动把就绪提交合入 main | 产品历史混入无价值提交 | 测试提交只留角色分支 |
| 提供远端就自动 push | 可能向错误仓库写入 | 配置和推送分成两个确认动作 |
