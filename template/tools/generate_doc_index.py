#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文档索引生成器（Scrum 团队工作区通用版）

用途：
    扫描项目工作区所有正式 Markdown 文档的 Frontmatter 元数据，按
    【角色 / 迭代 / 领域 / 阶段 / 状态】多维度聚合，生成可点击的 Markdown
    索引表；对缺失字段的文档按路径/文件名推断兜底，并输出“缺字段报告”与
    只读“停滞/协作完整性审计”。

设计原则：
    - 纯标准库，无外部依赖（不需要 pip install）。
    - Markdown 仍是唯一事实源；索引可随时重新生成，与文档零漂移。
    - Frontmatter 显式字段为权威，路径推断仅作兜底并标注“(推断)”。
    - 角色显示名从 `00_项目导航/roles.config.json` 运行时读取，适配任意命名预设。

用法：
    python tools/generate_doc_index.py
    生成结果写入 00_项目导航/文档索引/ 下。

依据规范：05 §12（Frontmatter Schema）、§13（产出契约/三要素）、
         07（治理健康度）、知识库/Scrum/13（协作）。
"""

from __future__ import annotations

import datetime
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent  # 项目根目录

SCAN_DIRS = [
    "00_项目导航", "01_产品发现", "02_产品待办", "03_迭代运行",
    "04_工程设计", "05_质量验证", "06_发布运维", "07_度量改进",
    "90_会议与决策",
]

# 排除目录（代码仓 / 知识库 / 草稿暂存 / 临时 / 索引输出本身）
EXCLUDE_PARTS = {
    "知识库", "10_代码仓库", "99_归档", "Temp",
    ".git", "node_modules", "文档索引", "评估产物",
}

OUT_DIR = ROOT / "00_项目导航" / "文档索引"

DOMAIN_ORDER = ["PM", "PO", "BE", "FE", "QA", "OPS", "UX", "未分类"]
PHASE_ORDER = ["需求", "概要设计", "详细设计", "编码", "测试", "部署运维", "治理", "未分类"]
STATUS_ORDER = ["draft", "review", "approved", "locked", "未标注"]
STATUS_ICON = {"approved": "✅", "review": "🟡", "draft": "⚪", "locked": "🔒", "未标注": "❓"}

STALE_DAYS = 3  # 非终态超过多少天未更新视为“停滞”
COLLAB_DOC_HINTS = ("Retro", "Review", "回顾", "评审纪要", "评审记录")
REQUIRED_FIELDS = ["id", "title", "owner", "domain", "phase", "sprint", "type", "status"]


def load_role_names():
    """从 roles.config.json 读取角色显示名。返回 (names_set, role_to_person)。
    未生成（仍是占位符）或缺失时返回空。"""
    cfg = ROOT / "00_项目导航" / "roles.config.json"
    names, r2p = set(), {}
    try:
        data = json.loads(cfg.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return names, r2p

    def walk(obj):
        if isinstance(obj, dict):
            nm = obj.get("name") or obj.get("displayName")
            if isinstance(nm, str) and nm.strip():
                names.add(nm.strip())
            rid = obj.get("id") or obj.get("role")
            if isinstance(rid, str) and isinstance(nm, str) and nm.strip():
                r2p[rid.strip()] = nm.strip()
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(data)
    return names, r2p


KNOWN_PEOPLE, ROLE_TO_PERSON = load_role_names()


# ---------------------------------------------------------------------------
# Frontmatter 解析
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    block = text[3:end].strip("\n")
    data: dict = {}
    for line in block.splitlines():
        line = line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            data[key] = [x.strip() for x in val[1:-1].split(",") if x.strip()]
        else:
            data[key] = val
    return data


# ---------------------------------------------------------------------------
# 路径 / 文件名推断（兜底）
# ---------------------------------------------------------------------------

def infer_owner(path: Path):
    parts = path.stem.split("_")
    if parts and parts[-1] in KNOWN_PEOPLE:
        return parts[-1]
    return None


def infer_domain(path: Path) -> str:
    name = path.name
    for tok, dom in (("BE_", "BE"), ("FE_", "FE"), ("UX_", "UX"),
                     ("QA_", "QA"), ("OPS_", "OPS"), ("PO_", "PO")):
        if name.startswith(tok) or ("_" + tok) in name:
            return dom
    p = str(path)
    if "04_前端设计系统" in p:
        return "FE"
    if "01_产品发现" in p or "02_产品待办" in p:
        return "PO"
    if "04_工程设计" in p:
        return "BE"
    if "05_质量验证" in p:
        return "QA"
    if "06_发布运维" in p:
        return "OPS"
    if "00_项目导航" in p or "03_迭代运行" in p or "90_会议与决策" in p or "07_度量改进" in p:
        return "PM"
    return "未分类"


def infer_phase(path: Path) -> str:
    p = str(path)
    if "01_产品发现" in p or "02_产品待办" in p:
        return "需求"
    if "00_技术全景" in p or "04_前端设计系统" in p:
        return "概要设计"
    if "01_ADR" in p or "02_API契约" in p or "03_数据模型" in p:
        return "详细设计"
    if "05_质量验证" in p:
        return "测试"
    if "06_发布运维" in p:
        return "部署运维"
    if any(x in p for x in ("00_项目导航", "03_迭代运行", "90_会议与决策", "07_度量改进")):
        return "治理"
    return "未分类"


def infer_sprint(path: Path) -> str:
    m = re.search(r"Sprint-(\d+)", str(path))
    if m:
        return f"Sprint-{m.group(1)}"
    return "跨迭代"


def infer_type(path: Path) -> str:
    name = path.name
    if "ADR" in name:
        return "ADR"
    if "规范" in name:
        return "规范"
    if "测试用例" in name or "测试策略" in name:
        return "测试用例"
    if "Runbook" in name:
        return "Runbook"
    if "会议" in name or "纪要" in name:
        return "会议纪要"
    if "决策" in name:
        return "决策"
    return "评估报告"


# ---------------------------------------------------------------------------
# 记录
# ---------------------------------------------------------------------------

class Doc:
    def __init__(self, path: Path, fm: dict):
        self.rel = path.relative_to(ROOT).as_posix()
        self.missing: list[str] = []
        self.inferred: list[str] = []

        self.id = self._field(fm, "id", lambda: "-", path)
        self.title = self._field(fm, "title", lambda: path.stem, path)
        owner = fm.get("owner")
        if not owner:
            owner = infer_owner(path) or "-"
            if owner != "-":
                self.inferred.append("owner")
            self.missing.append("owner")
        self.owner = ROLE_TO_PERSON.get(str(owner), str(owner))
        self.domain = self._field(fm, "domain", lambda: infer_domain(path), path)
        self.phase = self._field(fm, "phase", lambda: infer_phase(path), path)
        self.sprint = self._field(fm, "sprint", lambda: infer_sprint(path), path)
        self.type = self._field(fm, "type", lambda: infer_type(path), path)
        self.status = self._field(fm, "status", lambda: "未标注", path)
        self.version = str(fm.get("version", "-"))
        self.updated = str(fm.get("last-updated", "-"))

    def _field(self, fm, key, fallback, path):
        val = fm.get(key)
        if val:
            return str(val)
        if key != "title":
            self.missing.append(key)
        guess = fallback()
        if guess not in ("-", "未分类", "未标注") and key != "title":
            self.inferred.append(key)
        return guess


def _relpath(target: Path, start: Path) -> str:
    import os
    return os.path.relpath(target, start)


def collect() -> list[Doc]:
    docs: list[Doc] = []
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for path in base.rglob("*.md"):
            if any(part in EXCLUDE_PARTS for part in path.parts):
                continue
            if path.name.upper() == "README.md":
                continue
            fm = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
            if not fm:
                doc = Doc(path, {})
                doc.missing = ["frontmatter"]
                docs.append(doc)
                continue
            docs.append(Doc(path, fm))
    return docs


# ---------------------------------------------------------------------------
# 渲染
# ---------------------------------------------------------------------------

TABLE_HEADER = (
    "| ID | 标题 | Owner | 领域 | 阶段 | 迭代 | 类型 | 状态 | 版本 | 更新 |\n"
    "|----|------|-------|------|------|------|------|------|------|------|"
)

BANNER = (
    "> ⚙️ **本文件由 `tools/generate_doc_index.py` 自动生成，请勿手工编辑。**\n"
    "> 重新生成：在项目根目录运行 `python tools/generate_doc_index.py`。\n"
    "> 字段标注 `(推断)` 表示该文档 Frontmatter 缺失、由路径推断得出，建议补录。\n\n"
)


def frontmatter(title="") -> str:
    today = datetime.date.today().isoformat()
    return (f"---\nid: -\ntitle: {title}\nowner: SM\ndomain: PM\n"
            f"phase: 治理\nsprint: 跨迭代\ntype: 索引\nstatus: auto\n"
            f"version: auto\nlast-updated: {today}\n---\n\n")


def write(name: str, title: str, body: str):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / name).write_text(
        frontmatter(title=title) + f"# {title}\n\n" + BANNER + body, encoding="utf-8")


def row(doc: Doc) -> str:
    icon = STATUS_ICON.get(doc.status, "")
    link = Path(_relpath(ROOT / doc.rel, OUT_DIR)).as_posix()
    return (f"| {doc.id} | [{doc.title}]({link}) | {doc.owner} | {doc.domain} | "
            f"{doc.phase} | {doc.sprint} | {doc.type} | {icon} {doc.status} | "
            f"{doc.version} | {doc.updated} |")


def group_index(docs, key_fn, order, title, filename):
    from collections import defaultdict
    groups = defaultdict(list)
    for d in docs:
        groups[key_fn(d)].append(d)
    keys = [k for k in order if k in groups] + sorted(k for k in groups if k not in order)
    parts = [f"共 **{len(docs)}** 份文档，按 **{title}** 分组。\n"]
    for k in keys:
        items = sorted(groups[k], key=lambda d: (d.sprint, d.id))
        parts.append(f"\n## {k}（{len(items)}）\n\n{TABLE_HEADER}")
        parts.extend(row(d) for d in items)
    write(filename, title, "\n".join(parts) + "\n")


def status_board(docs):
    from collections import defaultdict
    groups = defaultdict(list)
    for d in docs:
        groups[d.status].append(d)
    keys = [k for k in STATUS_ORDER if k in groups] + sorted(k for k in groups if k not in STATUS_ORDER)
    total = len(docs) or 1
    approved = len(groups.get("approved", []))
    parts = [f"共 **{len(docs)}** 份文档。已批准 **{approved}**（{approved * 100 // total}%）。\n"]
    for k in keys:
        items = sorted(groups[k], key=lambda d: (d.domain, d.id))
        parts.append(f"\n## {STATUS_ICON.get(k, '')} {k}（{len(items)}）\n\n{TABLE_HEADER}")
        parts.extend(row(d) for d in items)
    write("05_索引_按状态看板.md", "文档索引 · 按状态看板", "\n".join(parts) + "\n")


def gap_report(docs):
    flagged = [d for d in docs if d.missing]
    total = len(docs) or 1
    parts = [
        f"共 **{len(flagged)}** 份文档存在缺字段或推断字段，占全部 {len(docs)} 份的 "
        f"{len(flagged) * 100 // total}%。\n",
        "\n> 按“先核心产出、后治理产出”顺序补录 Frontmatter，缺字段视为治理债（依据 05 §12）。\n",
        "\n| 文档 | 缺失字段 | 推断字段 |", "|------|---------|---------|",
    ]
    for d in sorted(flagged, key=lambda x: x.rel):
        link = Path(_relpath(ROOT / d.rel, OUT_DIR)).as_posix()
        parts.append(f"| [{d.rel}]({link}) | {', '.join(d.missing) or '—'} | {', '.join(d.inferred) or '—'} |")
    write("99_缺字段报告.md", "文档索引 · 缺字段报告", "\n".join(parts) + "\n")


def collab_issues():
    """协作完整性审计：Retro/Review 多人追加文档的重复段/角色锚点问题（知识库/Scrum/13 §8）。"""
    from collections import Counter
    out = []
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for path in base.rglob("*.md"):
            if any(p in EXCLUDE_PARTS for p in path.parts):
                continue
            if not any(h in path.name for h in COLLAB_DOC_HINTS):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            probs = []
            dup2 = sorted({h for h, c in Counter(re.findall(r"^##\s+(.+?)\s*$", text, re.M)).items() if c > 1})
            if dup2:
                probs.append("重复二级标题: " + " / ".join(dup2))
            opens = Counter(re.findall(r"<!--\s*append:role=([\w-]+)\s*-->", text))
            closes = Counter(re.findall(r"<!--\s*/append:role=([\w-]+)\s*-->", text))
            if opens or closes:
                unmatched = sorted(r for r in set(opens) | set(closes) if opens[r] != closes[r])
                dup = sorted(r for r, c in opens.items() if c > 1)
                if unmatched:
                    probs.append("锚点未配对: " + ", ".join(unmatched))
                if dup:
                    probs.append("重复锚点: " + ", ".join(dup))
            out.append((path.relative_to(ROOT).as_posix(), "; ".join(probs) if probs else "OK"))
    return out


def stale_audit(docs):
    today = datetime.date.today()
    stale, non_terminal = [], []
    for d in docs:
        if d.status not in ("draft", "review"):
            continue
        non_terminal.append(d)
        try:
            age = (today - datetime.date.fromisoformat(d.updated)).days
        except ValueError:
            age = None
        if age is not None and age >= STALE_DAYS:
            stale.append((age, d))
    stale.sort(key=lambda x: -x[0])
    parts = [
        f"非终态（draft/review）共 **{len(non_terminal)}** 份；其中超 **{STALE_DAYS}** 天未更新 "
        f"**{len(stale)}** 份。\n",
        "\n> 只读审计，不拦人。停滞 = review/draft 长期未收尾（ACK 未闭环或无人定版）。\n",
        f"\n## ⏰ 停滞（≥ {STALE_DAYS} 天）\n\n| 龄期(天) | 文档 | Owner | 状态 | 最后更新 |",
        "|:--:|------|-------|------|------|",
    ]
    if not stale:
        parts.append("| — | （无） | — | — | — |")
    for age, d in stale:
        link = Path(_relpath(ROOT / d.rel, OUT_DIR)).as_posix()
        parts.append(f"| {age} | [{d.title}]({link}) | {d.owner} | {STATUS_ICON.get(d.status, '')} {d.status} | {d.updated} |")

    ci = collab_issues()
    bad = [x for x in ci if x[1] != "OK"]
    parts.append(
        f"\n## 🧩 协作完整性审计（Retro/Review · Scrum/13 §8）\n\n"
        f"共检 **{len(ci)}** 份多人追加文档，**{len(bad)}** 份有问题（重复段/锚点异常）。\n\n"
        "| 文档 | 检查结果 |\n|------|---------|")
    if not ci:
        parts.append("| — | （无 Retro/Review 文档） |")
    for rel, res in sorted(ci):
        icon = "✅" if res == "OK" else "⚠️"
        link = Path(_relpath(ROOT / rel, OUT_DIR)).as_posix()
        parts.append(f"| [{Path(rel).name}]({link}) | {icon} {res} |")

    parts.append(
        "\n## 🔎 SM 需人工核对的审计项\n\n"
        "- 非终态是否都带“原因 + 责任对象 + 起始日期”三要素？裸状态 = 审计缺陷（05 §13.3）。\n"
        "- 任务表标 blocked 的项，`03_风险与障碍.md` 是否有对应登记？不一致 = 事实源矛盾。\n"
        "- 提交 author 是否本人/真实署名，未用统一账号代提？（Scrum/11 §8）\n"
    )
    write("06_停滞审计.md", "文档索引 · 停滞与审计", "\n".join(parts) + "\n")


def overview(docs):
    from collections import Counter
    dom, pha = Counter(d.domain for d in docs), Counter(d.phase for d in docs)
    spr, sta = Counter(d.sprint for d in docs), Counter(d.status for d in docs)
    total = len(docs) or 1
    gaps = sum(1 for d in docs if d.missing)
    unlabeled = sum(1 for d in docs if d.status == "未标注")
    orphan = sum(1 for d in docs if d.id in ("-", ""))
    approved = sta.get("approved", 0)

    def line(counter, order):
        keys = [k for k in order if k in counter] + sorted(k for k in counter if k not in order)
        return " · ".join(f"{k}:{counter[k]}" for k in keys)

    body = f"""共收录 **{len(docs)}** 份正式文档。缺字段 **{gaps}** 份。

## 治理健康度

> 对应《07_度量改进/00_度量口径.md · 治理健康度》。自动计算的客观指标。

| 指标 | 当前值 | 说明 |
|------|:--:|------|
| 元数据缺字段率 | **{gaps * 100 // total}%**（{gaps}/{len(docs)}） | 缺字段视为治理债，目标持续下降 |
| 状态未标注率 | **{unlabeled * 100 // total}%**（{unlabeled}/{len(docs)}） | 无 `status`，无法进入状态看板 |
| 孤儿率（无 id） | **{orphan * 100 // total}%**（{orphan}/{len(docs)}） | 未挂 06 总表行，可追溯性弱 |
| approved 占比 | **{approved * 100 // total}%**（{approved}/{len(docs)}） | 已批准正式产物占比 |

## 分维度视图

| 维度 | 索引 | 分布 |
|------|------|------|
| 角色 | [按角色](01_索引_按角色.md) | 见分表 |
| 迭代 | [按迭代](02_索引_按迭代.md) | {line(spr, [])} |
| 领域 | [按领域](03_索引_按领域.md) | {line(dom, DOMAIN_ORDER)} |
| 阶段 | [按阶段](04_索引_按阶段.md) | {line(pha, PHASE_ORDER)} |
| 状态 | [按状态看板](05_索引_按状态看板.md) | {line(sta, STATUS_ORDER)} |
| 停滞审计 | [停滞与审计](06_停滞审计.md) | 非终态超 {STALE_DAYS} 天未动 + 协作完整性 |
| 缺字段 | [缺字段报告](99_缺字段报告.md) | {gaps} 份待补 |

## 使用方式

- 按领域读某类文档 → [按领域](03_索引_按领域.md)。
- 看某迭代产出全貌 → [按迭代](02_索引_按迭代.md)。
- 按研发阶段浏览 → [按阶段](04_索引_按阶段.md)。
- 看某人负责什么 → [按角色](01_索引_按角色.md)。
- 看整体健康度与悬空项 → [按状态看板](05_索引_按状态看板.md) / [停滞与审计](06_停滞审计.md)。
"""
    write("00_总览.md", "文档索引 · 总览", body)


def main():
    docs = collect()
    overview(docs)
    group_index(docs, lambda d: d.owner, [], "文档索引 · 按角色", "01_索引_按角色.md")
    group_index(docs, lambda d: d.sprint, [], "文档索引 · 按迭代", "02_索引_按迭代.md")
    group_index(docs, lambda d: d.domain, DOMAIN_ORDER, "文档索引 · 按领域", "03_索引_按领域.md")
    group_index(docs, lambda d: d.phase, PHASE_ORDER, "文档索引 · 按阶段", "04_索引_按阶段.md")
    status_board(docs)
    stale_audit(docs)
    gap_report(docs)
    print(f"[OK] 已收录 {len(docs)} 份文档，缺字段 {sum(1 for d in docs if d.missing)} 份。")
    print(f"[OK] 角色名来源：roles.config.json（{len(KNOWN_PEOPLE)} 个）")
    print(f"[OK] 索引输出目录：{OUT_DIR.relative_to(ROOT).as_posix()}/")


if __name__ == "__main__":
    main()
