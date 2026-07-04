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
import subprocess
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
VALID_DOMAINS = {"PM", "PO", "BE", "FE", "QA", "OPS", "UX"}
VALID_PHASES = {"需求", "概要设计", "详细设计", "编码", "测试", "部署运维", "治理"}
VALID_TYPES = {
    "评估报告", "规范", "ADR", "API契约", "数据模型", "测试用例",
    "Runbook", "度量", "会议纪要", "决策", "Backlog", "计划", "风险",
}
VALID_STATUSES = {"draft", "review", "approved", "locked"}


def load_role_names():
    """从 roles.config.json 读取角色显示名。返回姓名、角色映射、邮箱和配置。
    未生成（仍是占位符）或缺失时返回空。"""
    cfg = ROOT / "00_项目导航" / "roles.config.json"
    names, r2p, emails, config = set(), {}, {}, {}
    try:
        data = json.loads(cfg.read_text(encoding="utf-8"))
        config = data
    except (OSError, ValueError):
        return names, r2p, emails, config

    def walk(obj):
        if isinstance(obj, dict):
            nm = obj.get("name") or obj.get("displayName")
            if isinstance(nm, str) and nm.strip():
                names.add(nm.strip())
            rid = obj.get("id") or obj.get("role")
            if isinstance(rid, str) and isinstance(nm, str) and nm.strip():
                r2p[rid.strip()] = nm.strip()
                if isinstance(obj.get("email"), str):
                    emails[rid.strip()] = obj["email"].strip()
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(data)
    for rid, name in data.get("roles", {}).items():
        if isinstance(name, str):
            names.add(name.strip())
            r2p[rid] = name.strip()
    for rid, email in data.get("emails", {}).items():
        if isinstance(email, str):
            emails[rid] = email.strip()
    return names, r2p, emails, config


KNOWN_PEOPLE, ROLE_TO_PERSON, ROLE_EMAILS, ROLE_CONFIG = load_role_names()
SIGNOFF_REPO = (
    ROOT / "10_代码仓库" / str(ROLE_CONFIG.get("repoName", ""))
    if ROLE_CONFIG.get("gitRoot") == "repo"
    else ROOT
)
SIGNOFF_STORE = SIGNOFF_REPO / ".team" / "signoffs"


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
        self.governance = str(fm.get("governance", "exempt")).lower()
        self.managed = self.governance == "managed"
        self.missing: list[str] = []
        self.inferred: list[str] = []
        self.invalid: list[str] = []

        self.id = self._field(fm, "id", lambda: "-", path, self.managed)
        self.title = self._field(fm, "title", lambda: path.stem, path, self.managed)
        owner = fm.get("owner")
        if not owner:
            owner = infer_owner(path) or "-"
            if owner != "-":
                self.inferred.append("owner")
            if self.managed:
                self.missing.append("owner")
        self.owner = ROLE_TO_PERSON.get(str(owner), str(owner))
        self.domain = self._field(fm, "domain", lambda: infer_domain(path), path, self.managed)
        self.phase = self._field(fm, "phase", lambda: infer_phase(path), path, self.managed)
        self.sprint = self._field(fm, "sprint", lambda: infer_sprint(path), path, self.managed)
        self.type = self._field(fm, "type", lambda: infer_type(path), path, self.managed)
        self.status = self._field(fm, "status", lambda: "未标注", path, self.managed)
        self.version = str(fm.get("version", "-"))
        self.updated = str(fm.get("last-updated", "-"))
        if self.managed:
            for key, value, allowed in (
                ("domain", self.domain, VALID_DOMAINS),
                ("phase", self.phase, VALID_PHASES),
                ("type", self.type, VALID_TYPES),
                ("status", self.status, VALID_STATUSES),
            ):
                if value not in allowed:
                    self.invalid.append(f"{key}={value}")

    def _field(self, fm, key, fallback, path, record_missing):
        val = fm.get(key)
        if val:
            return str(val)
        if record_missing and key != "title":
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
            if any(part in EXCLUDE_PARTS for part in path.relative_to(ROOT).parts):
                continue
            if path.name.upper() == "README.md":
                continue
            fm = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
            if not fm:
                docs.append(Doc(path, {}))
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
    "> 字段标注 `(推断)` 仅用于查询；只有 `governance: managed` 文档需要补录。\n\n"
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
    managed = [d for d in docs if d.managed]
    flagged = [d for d in managed if d.missing or d.invalid]
    parts = [
        f"显式纳管 **{len(managed)}** 份；其中 **{len(flagged)}** 份存在缺失或非法字段。\n",
        "\n> 只有 `governance: managed` 的长期正式产物进入治理债；"
        "历史、入口、骨架和未纳管材料不追溯补录。\n",
        "\n| 文档 | 缺失字段 | 非法字段 | 推断字段 |",
        "|------|---------|---------|---------|",
    ]
    for d in sorted(flagged, key=lambda x: x.rel):
        link = Path(_relpath(ROOT / d.rel, OUT_DIR)).as_posix()
        parts.append(
            f"| [{d.rel}]({link}) | {', '.join(d.missing) or '—'} | "
            f"{', '.join(d.invalid) or '—'} | {', '.join(d.inferred) or '—'} |"
        )
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
            if any(p in EXCLUDE_PARTS for p in path.relative_to(ROOT).parts):
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
            section = re.search(
                r"^##\s+评审意见追加\s*$([\s\S]*?)(?=^##\s+|\Z)", text, re.M
            )
            entry_count = 0
            if section:
                entry_count = sum(
                    1 for heading in re.findall(r"^###\s+(.+?)\s*$", section.group(1), re.M)
                    if not re.match(r"^关闭后裁决(?:\s|$)", heading)
                )
            strict_anchors = "append-policy: anchors-v1" in text or bool(opens or closes)
            if strict_anchors and entry_count and not opens:
                probs.append("追加条目缺少角色锚点")
            if opens or closes:
                unmatched = sorted(r for r in set(opens) | set(closes) if opens[r] != closes[r])
                dup = sorted(r for r, c in opens.items() if c > 1)
                if unmatched:
                    probs.append("锚点未配对: " + ", ".join(unmatched))
                if dup:
                    probs.append("重复锚点: " + ", ".join(dup))
                if strict_anchors and entry_count != sum(opens.values()):
                    probs.append(f"追加标题/锚点数量不一致: {entry_count}/{sum(opens.values())}")
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

    sa = signoff_audit()
    if sa is not None:
        cur = sa["current"]
        srows = sa["rows"]
        mode = sa["mode"]
        scope = sa["scope"]
        badc = sum(1 for r in srows if r[3].startswith(("⚠️", "🟡")))
        scope_text = "、".join(scope) if scope else "无"
        closed_conflict = badc > 0 and not scope and bool(sa["closed_campaign"])
        if badc == 0 and scope:
            next_action = "审计已无待处理；SM 可登记关闭证据、关闭批次并发布闭环通知。"
        elif closed_conflict:
            next_action = (
                f"已关闭批次 {sa['closed_campaign']} 后发现待处理；保留原记录，"
                "SM 立即建立 corrective 批次并逐人纠偏。"
            )
        elif badc > 0 and not scope:
            next_action = "当前无活动批次但仍有待处理；SM 立即建立 incremental/corrective 批次。"
        elif mode == "initial":
            next_action = "SM 按 09 §10.1 发起首签；成员在事件台账追加本人 Event ID。"
        elif mode == "full-rebaseline":
            next_action = "SM 按 09 §10.6 发起全量重基线；恢复当前有效性但保留旧历史缺口。"
        elif scope == ["SM"]:
            next_action = "仅涉及 SM：SM 直接追加本人事件、重跑审计并发布闭环通知。"
        elif scope:
            next_action = "SM 按批次逐人通知；不得把汇总、通知或验收转交给被签核成员。"
        else:
            next_action = "当前无活动批次；仅在入队或职责/边界/IO 实质变化时建立新批次。"
        parts.append(
            f"\n## ✍️ 签核状态（现行手册基线 = V{str(cur).replace('V', '')}）\n\n"
            f"- 批次：**{sa['campaign']}**\n"
            f"- 模式：**{mode}**\n"
            f"- 应签范围：**{scope_text}**\n"
            f"- 待处理：**{badc}** 名\n"
            + (
                f"- 事实冲突：**已关闭批次 {sa['closed_campaign']} 与当前待处理并存**\n"
                if closed_conflict else ""
            )
            + f"- SM 下一动作：{next_action}\n\n"
            "| 角色 | 成员 | 最新目标基线 | 状态 |\n|------|------|:--:|------|")
        for role, member, ver, state in srows:
            parts.append(f"| {role} | {member} | {ver} | {state} |")
        parts.append(
            "\n### 签核事件证据\n\n"
            "| Event ID | 角色 | 目标 | 覆盖 | Git/迁移证据 | 结果 |\n"
            "|---|---|:--:|---|---|---|")
        if not sa["events"]:
            parts.append("| — | — | — | — | — | 暂无事件 |")
        for event in sa["events"]:
            parts.append("| " + " | ".join(event) + " |")

        audit_json = {
            "schemaVersion": 2,
            "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "sourceHead": _git_head(),
            "currentBaseline": f"V{str(cur).replace('V', '')}",
            "campaignId": sa["campaign"],
            "closedCampaignId": sa.get("latest_closed_campaign") or None,
            "pendingCount": badc,
            "pendingAssignments": sa.get("pending_assignments", {}),
            "roles": [
                {
                    "role": role,
                    "member": member,
                    "latestBaseline": ver,
                    "state": state,
                }
                for role, member, ver, state in srows
            ],
        }
        (OUT_DIR / "07_签核状态.json").write_text(
            json.dumps(audit_json, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    write("06_停滞审计.md", "文档索引 · 停滞与审计", "\n".join(parts) + "\n")


def role_monitor(docs):
    """按角色索引 + 顶部“角色监控视图”（每角色产出健康度）。"""
    from collections import defaultdict
    groups = defaultdict(list)
    for d in docs:
        groups[d.owner].append(d)
    parts = [f"共 **{len(docs)}** 份文档，按 **角色** 分组。\n",
             "\n## 角色监控视图（产出健康度）\n\n"
             "| 角色 | 文档数 | approved | draft/review | 缺字段 |\n"
             "|------|:--:|:--:|:--:|:--:|"]
    for owner in sorted(groups):
        items = groups[owner]
        ap = sum(1 for d in items if d.status == "approved")
        nt = sum(1 for d in items if d.status in ("draft", "review"))
        gap = sum(1 for d in items if d.managed and (d.missing or d.invalid))
        parts.append(f"| {owner} | {len(items)} | {ap} | {nt} | {gap} |")
    for owner in sorted(groups):
        items = sorted(groups[owner], key=lambda d: (d.sprint, d.id))
        parts.append(f"\n## {owner}（{len(items)}）\n\n{TABLE_HEADER}")
        parts.extend(row(d) for d in items)
    write("01_索引_按角色.md", "文档索引 · 按角色", "\n".join(parts) + "\n")


def _table_rows(text, first_header):
    """按首列标题读取 Markdown 表；返回表头到值的字典列表。"""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        headers = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not headers or headers[0] != first_header:
            continue
        rows = []
        for row_line in lines[index + 2:]:
            if not row_line.startswith("|"):
                break
            values = [cell.strip() for cell in row_line.strip().strip("|").split("|")]
            if len(values) != len(headers):
                continue
            rows.append(dict(zip(headers, values)))
        return rows
    return []


def _version_key(value):
    nums = re.findall(r"\d+", str(value))
    return tuple(int(n) for n in nums) if nums else (0,)


def _split_values(value):
    return [item.strip() for item in re.split(r"[,，;；、]", str(value)) if item.strip()]


def _git_event_evidence(event_id, method, member=""):
    """验证可从 HEAD 追溯的 legacy commit，或定位 Event ID 当前行作者。"""
    if method.startswith("legacy:"):
        ref = method.split(":", 1)[1].strip()
        check = subprocess.run(
            ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", ref, "HEAD"],
            capture_output=True, text=True, check=False,
        )
        return (
            f"✅ {ref}"
            if check.returncode == 0
            else f"⚠️ 无效 legacy:{ref}（不可从 HEAD 追溯）"
        )
    if method == "auto":
        # 用 blame 定位签核行的当前作者，而非 pickaxe -S 的首现提交：
        # 后者会把预先脚手架铺好的空行归因给铺行者，无法反映真实签核人，
        # 也无法发现代提。blame 取当前行作者才是真实署名。
        blame = subprocess.run(
            [
                "git", "-C", str(ROOT), "blame", "--line-porcelain",
                "-L", f"/{event_id}/,+1", "HEAD", "--",
                "00_项目导航/11_角色行动手册.md",
            ],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            check=False,
        )
        lines = (blame.stdout or "").splitlines()
        if blame.returncode != 0 or not lines:
            return "🟡 待 Git 提交"
        commit = lines[0].split()[0][:9]
        author = ""
        adate = ""
        for ln in lines:
            if ln.startswith("author "):
                author = ln[len("author "):].strip()
            elif ln.startswith("author-time "):
                try:
                    adate = datetime.datetime.fromtimestamp(
                        int(ln.split()[1])
                    ).strftime("%Y-%m-%d")
                except (ValueError, IndexError):
                    adate = ""
        tail = f"{commit} · {author}" + (f" · {adate}" if adate else "")
        if member and member not in ("—", "") and author and author != member:
            return f"⚠️ 疑似代签：{tail}（应为 {member}）"
        return f"✅ {tail}"
    return "🟡 历史不可验证" if method == "unverified" else f"🟡 {method or '未指定'}"


def _git_file_evidence(relative_path, member="", email=""):
    """事件文件只允许一次创建提交；首次作者和邮箱必须匹配角色事实源。"""
    rel = Path(relative_path).as_posix()
    dirty = subprocess.run(
        ["git", "-C", str(SIGNOFF_REPO), "status", "--porcelain", "--", rel],
        capture_output=True, text=True, check=False,
    )
    if dirty.stdout.strip():
        return f"🟡 待 Git 提交：{dirty.stdout.strip()}"
    found = subprocess.run(
        [
            "git", "-C", str(SIGNOFF_REPO), "log",
            "--format=%H%x1f%an%x1f%ae%x1f%aI", "--", rel,
        ],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
    )
    history = [line for line in found.stdout.splitlines() if line.strip()]
    if not history:
        return "🟡 待 Git 提交"
    if len(history) != 1:
        return f"⚠️ 事件文件创建后被修改 {len(history) - 1} 次"
    commit, author, author_email, authored = history[-1].split("\x1f", 3)
    if member and author != member:
        return f"⚠️ 首次作者 {author}，应为 {member}"
    if email and author_email.lower() != email.lower():
        return f"⚠️ 首次邮箱 {author_email}，应为 {email}"
    return f"✅ {commit[:9]} · {author} <{author_email}> · {authored}"


def _git_head():
    try:
        return subprocess.run(
            ["git", "-C", str(SIGNOFF_REPO), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _load_file_signoffs():
    campaigns, events = [], []
    campaign_dir = SIGNOFF_STORE / "campaigns"
    closure_dir = SIGNOFF_STORE / "closures"
    event_root = SIGNOFF_STORE / "events"
    if campaign_dir.exists():
        for file in sorted(campaign_dir.glob("*.json")):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            closure = closure_dir / file.name
            closure_evidence = ""
            state = "open"
            if closure.exists():
                sm_name = ROLE_TO_PERSON.get("sm", "")
                sm_email = ROLE_EMAILS.get("sm", "")
                closure_evidence = _git_file_evidence(
                    closure.relative_to(SIGNOFF_REPO), sm_name, sm_email
                )
                if closure_evidence.startswith("✅"):
                    state = "closed"
            assignments = data.get("assignments", {})
            campaigns.append({
                "Campaign ID": data.get("campaignId", file.stem),
                "模式": data.get("mode", "incremental"),
                "目标基线": data.get("targetBaseline", "?"),
                "覆盖范围": ",".join(sorted({
                    item for assignment in assignments.values()
                    for item in assignment.get("coverage", [])
                })),
                "应签角色": ",".join(assignments.keys()),
                "发起时间": data.get("createdAt", "—"),
                "截止时间": data.get("dueAt", "由 SM 确认"),
                "状态": state,
                "关闭证据": closure_evidence or "—",
                "_source": "event-file",
            })
    if event_root.exists():
        for file in sorted(event_root.glob("*/*.json")):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            events.append({
                "Event ID": data.get("eventId", file.stem),
                "Campaign ID": data.get("campaignId", file.parent.name),
                "角色": data.get("role", ""),
                "成员": data.get("member", ""),
                "从基线": data.get("fromBaseline", "—"),
                "目标基线": data.get("targetBaseline", "?"),
                "覆盖 Change ID": ",".join(data.get("coverage", [])),
                "签核时间": data.get("signedAt", "—"),
                "证据方式": "event-file",
                "结果/备注": data.get("result", "accepted"),
                "_path": file.relative_to(SIGNOFF_REPO).as_posix(),
                "_email": data.get("email", ""),
            })
    return campaigns, events


def signoff_audit():
    """从变更、批次和追加式事件计算当前签核状态；兼容 v0.9.4 以前的快照表。"""
    charter = ROOT / "00_项目导航" / "11_角色行动手册.md"
    if not charter.exists():
        return None
    text = charter.read_text(encoding="utf-8", errors="replace")
    fm = parse_frontmatter(text)
    cur = str(fm.get("version", "?"))
    roles = ("PO", "SM", "TL", "Mid.BE/QA", "Sr.FE/UX", "Mid.FE/QA", "FS/DevOps")
    aliases = {
        "po": "PO", "sm": "SM", "tl": "TL",
        "midbe": "Mid.BE/QA", "srfe": "Sr.FE/UX",
        "midfe": "Mid.FE/QA", "fs": "FS/DevOps",
        "PO/PM": "PO",
        "TL/Sr.BE": "TL",
        "Mid.BE": "Mid.BE/QA",
        "Mid.FE": "Mid.FE/QA",
        "Sr.FE": "Sr.FE/UX",
        "FS": "FS/DevOps",
    }
    canonical = lambda role: aliases.get(str(role).strip(), str(role).strip())
    role_ids = {
        "PO": ("po", "PO"), "SM": ("sm", "SM"), "TL": ("tl", "TL"),
        "Mid.BE/QA": ("midbe", "Mid.BE"), "Sr.FE/UX": ("srfe", "Sr.FE"),
        "Mid.FE/QA": ("midfe", "Mid.FE"), "FS/DevOps": ("fs", "FS"),
    }
    members = {}
    for role, keys in role_ids.items():
        members[role] = next((ROLE_TO_PERSON[k] for k in keys if k in ROLE_TO_PERSON), "—")

    changes = _table_rows(text, "Change ID")
    campaigns = _table_rows(text, "Campaign ID")
    event_rows = _table_rows(text, "Event ID")
    file_campaigns, file_events = _load_file_signoffs()
    campaigns.extend(file_campaigns)
    event_rows.extend(file_events)
    if changes or event_rows or str(fm.get("signoff-model", "")).startswith("events"):
        change_map = {}
        for change in changes:
            affected = {canonical(role) for role in _split_values(change.get("影响角色", ""))}
            if "ALL" in affected:
                affected = set(roles)
            change_map[change["Change ID"]] = {
                "version": change.get("手册基线", "?"),
                "affected": affected,
            }

        active = [
            campaign for campaign in campaigns
            if campaign.get("状态", "").lower() in ("open", "active", "进行中")
            or (
                not file_campaigns
                and campaign.get("状态", "").lower() in ("planned", "待创建")
            )
        ]
        campaign = (
            max(
                enumerate(active),
                key=lambda pair: (_version_key(pair[1].get("目标基线", "")), pair[0]),
            )[1]
            if active else None
        )
        all_closed = [
            item for item in campaigns
            if item.get("状态", "").lower() in ("closed", "关闭", "已关闭")
        ]
        latest_closed_campaign = (
            max(
                enumerate(all_closed),
                key=lambda pair: (_version_key(pair[1].get("目标基线", "")), pair[0]),
            )[1].get("Campaign ID", "")
            if all_closed else ""
        )
        closed = [
            item for item in all_closed
            if _version_key(item.get("目标基线", "")) >= _version_key(cur)
        ]
        closed_campaign = (
            max(
                enumerate(closed),
                key=lambda pair: (_version_key(pair[1].get("目标基线", "")), pair[0]),
            )[1].get("Campaign ID", "")
            if closed else ""
        )
        scope = []
        if campaign:
            raw_scope = {canonical(role) for role in _split_values(campaign.get("应签角色", ""))}
            scope = list(roles) if "ALL" in raw_scope else [role for role in roles if role in raw_scope]

        accepted = []
        rendered_events = []
        for event in event_rows:
            role = canonical(event.get("角色", ""))
            result = event.get("结果/备注", "")
            evidence = (
                _git_file_evidence(
                    event.get("_path", ""),
                    event.get("成员", ""),
                    event.get("_email", ""),
                )
                if event.get("证据方式") == "event-file"
                else _git_event_evidence(
                    event.get("Event ID", ""),
                    event.get("证据方式", ""),
                    event.get("成员", ""),
                )
            )
            rendered_events.append((
                event.get("Event ID", "—"),
                role or "—",
                event.get("目标基线", "—"),
                event.get("覆盖 Change ID", "—"),
                evidence,
                result or "—",
            ))
            if result.lower().startswith("accepted"):
                accepted.append((event, role, evidence))

        state_rows = []
        pending_assignments = {}
        for role in roles:
            relevant_changes = {
                change_id for change_id, meta in change_map.items()
                if role in meta["affected"] and _version_key(meta["version"]) <= _version_key(cur)
            }
            verified_covered = set()
            historical_covered = set()
            anomalous_covered = set()
            pending_covered = set()
            role_events = []
            for event, event_role, evidence in accepted:
                if event_role != role:
                    continue
                role_events.append((event, evidence))
                coverage = set(_split_values(event.get("覆盖 Change ID", "")))
                target = event.get("目标基线", "")
                if any(item.startswith("BASELINE-") for item in coverage):
                    covered_by_event = {
                        change_id for change_id, meta in change_map.items()
                        if role in meta["affected"]
                        and _version_key(meta["version"]) <= _version_key(target)
                    }
                else:
                    covered_by_event = coverage
                method = event.get("证据方式", "")
                if evidence.startswith("✅"):
                    verified_covered.update(covered_by_event)
                elif evidence.startswith("⚠️"):
                    anomalous_covered.update(covered_by_event)
                elif method == "unverified" and event.get("Campaign ID", "") == "LEGACY":
                    historical_covered.update(covered_by_event)
                else:
                    pending_covered.update(covered_by_event)
            never = sorted(
                relevant_changes
                - verified_covered - historical_covered - anomalous_covered - pending_covered
            )
            resign = sorted((relevant_changes & anomalous_covered) - verified_covered)
            pending = sorted(
                (relevant_changes & pending_covered) - verified_covered - anomalous_covered
            )
            role_events.sort(key=lambda item: _version_key(item[0].get("目标基线", "")))
            latest = role_events[-1][0].get("目标基线", "—") if role_events else "—"
            latest_evidence = role_events[-1][1] if role_events else ""
            latest_evidence_ok = latest_evidence.startswith("✅")
            history_gap = any(not evidence.startswith("✅") for _, evidence in role_events[:-1])
            if not relevant_changes:
                state = "○ 当前无受影响变更"
            elif never or resign or pending:
                pending_assignments[role_ids[role][0]] = sorted(set(never + resign + pending))
                parts = []
                if never:
                    parts.append("待签：" + ",".join(never))
                if resign:
                    parts.append("待重签（疑似代签/无效）：" + ",".join(resign))
                if pending:
                    parts.append("待提交/验证：" + ",".join(pending))
                state = "⚠️ " + "；".join(parts)
            else:
                state = "✅ 当前有效" + ("；⚠️ 历史证据缺口" if history_gap else "")
            state_rows.append((role, members[role], latest, state))

        return {
            "current": cur,
            "rows": state_rows,
            "mode": campaign.get("模式", "无活动批次") if campaign else "无活动批次",
            "scope": scope,
            "campaign": campaign.get("Campaign ID", "无") if campaign else "无",
            "closed_campaign": closed_campaign,
            "latest_closed_campaign": latest_closed_campaign,
            "events": rendered_events,
            "pending_assignments": pending_assignments,
        }

    # v0.9.4 及更早版本：从“每角色最新基线”快照读取。
    affected = {canonical(role) for role in fm.get("resign-roles", [])}
    norm = lambda v: str(v).replace("V", "").replace("v", "").strip()
    parsed = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cols) < 7 or cols[0] not in roles:
            continue
        parsed.append((cols[0], cols[1], cols[5]))
    initial = bool(parsed) and all(ver in ("—", "", "-") for _, _, ver in parsed)
    required = set(roles) if initial else affected
    mode = "入队首签" if initial else ("变更重签" if required else "无活动签核")
    rows = []
    for role, member, ver in parsed:
        if ver in ("—", "", "-") and initial:
            state = "⚠️ 待首签（非代码开工门禁）"
        elif ver in ("—", "", "-") and role in required:
            state = "⚠️ 待重签（无旧基线）"
        elif ver in ("—", "", "-"):
            state = "○ 未签（需 SM 确认是否新入队）"
        elif norm(ver) != norm(cur) and role in affected:
            state = f"⚠️ 过期（签于 {ver}，现行 V{norm(cur)}）"
        elif norm(ver) != norm(cur):
            state = "✅ 有效（未受本次变更影响）"
        else:
            state = "✅ 最新"
        rows.append((role, member, ver, state))
    scope = [role for role in roles if role in required]
    return {
        "current": cur, "rows": rows, "mode": mode, "scope": scope,
        "campaign": "legacy-snapshot", "closed_campaign": "",
        "latest_closed_campaign": "", "events": [],
        "pending_assignments": {},
    }


def overview(docs):
    from collections import Counter
    dom, pha = Counter(d.domain for d in docs), Counter(d.phase for d in docs)
    spr, sta = Counter(d.sprint for d in docs), Counter(d.status for d in docs)
    total = len(docs) or 1
    managed = [d for d in docs if d.managed]
    managed_total = len(managed) or 1
    gaps = sum(1 for d in managed if d.missing or d.invalid)
    unlabeled = sum(1 for d in managed if d.status == "未标注")
    orphan = sum(1 for d in managed if d.id in ("-", ""))
    approved = sta.get("approved", 0)

    def line(counter, order):
        keys = [k for k in order if k in counter] + sorted(k for k in counter if k not in order)
        return " · ".join(f"{k}:{counter[k]}" for k in keys)

    body = f"""共收录 **{len(docs)}** 份可查询文档；显式纳管 **{len(managed)}** 份。

## 治理健康度

> 仅统计 `governance: managed` 文档；历史、入口、骨架和 exempt 文档不形成治理债。

| 指标 | 当前值 | 说明 |
|------|:--:|------|
| 元数据缺失/非法率 | **{gaps * 100 // managed_total}%**（{gaps}/{len(managed)}） | 只处理纳管产物 |
| 状态未标注率 | **{unlabeled * 100 // managed_total}%**（{unlabeled}/{len(managed)}） | 纳管产物必须有状态 |
| 孤儿率（无 id） | **{orphan * 100 // managed_total}%**（{orphan}/{len(managed)}） | 仅纳管产物要求挂长期账本 |
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
| 治理债 | [缺字段报告](99_缺字段报告.md) | {gaps} 份纳管文档待处理 |

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
    role_monitor(docs)
    group_index(docs, lambda d: d.sprint, [], "文档索引 · 按迭代", "02_索引_按迭代.md")
    group_index(docs, lambda d: d.domain, DOMAIN_ORDER, "文档索引 · 按领域", "03_索引_按领域.md")
    group_index(docs, lambda d: d.phase, PHASE_ORDER, "文档索引 · 按阶段", "04_索引_按阶段.md")
    status_board(docs)
    stale_audit(docs)
    gap_report(docs)
    managed = [d for d in docs if d.managed]
    debt = sum(1 for d in managed if d.missing or d.invalid)
    print(f"[OK] 已收录 {len(docs)} 份文档，纳管 {len(managed)} 份，治理债 {debt} 份。")
    print(f"[OK] 角色名来源：roles.config.json（{len(KNOWN_PEOPLE)} 个）")
    print(f"[OK] 索引输出目录：{OUT_DIR.relative_to(ROOT).as_posix()}/")


if __name__ == "__main__":
    main()
