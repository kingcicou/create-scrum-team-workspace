# 文档索引说明

本目录保存 `tools/generate_doc_index.py` 生成的本地查询视图与审计视图。

这些文件是可重建产物，不作为项目事实源提交。正式事实源保留在各业务文档、Sprint 文档、`.team/signoffs/`、角色配置与行动手册中。

常用命令：

```bash
python tools/generate_doc_index.py
```

生成后可本地查看：

- `00_总览.md`
- `06_停滞审计.md`
- `07_签核状态.json`
- `99_缺字段报告.md`

提交规则：

- 提交本说明文件。
- 不提交本目录下由脚本生成的索引、审计 JSON 或缺字段报告。
- 需要形成正式证据时，沉淀到 Sprint Review、Retro、关闭记录、签核事件或行动手册变更记录中。
