# Infrastructure

这里放数据库迁移、部署脚本、容器配置、环境样例和 CI/CD 相关资源。

## 目录建议

```text
infra/
  database/
    migrations/
```

## 规则

- 可执行脚本进入代码仓库。
- 发布说明、回滚流程和 Runbook 同步到 `../../../06_发布运维/`。
- 环境变量用 `.env.example` 说明，不提交真实密钥。
