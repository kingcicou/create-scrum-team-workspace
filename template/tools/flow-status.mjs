#!/usr/bin/env node

/**
 * flow-status.mjs — Sprint 流程状态快速检查
 *
 * 定位：SM Daily 前的辅助判断工具。读取任务表和工作流阶段表，
 * 输出当前阶段推断、阻塞项、等待项和可并行项。
 * 不替代 SM 对上下文的解释，只提供结构化摘要。
 *
 * 用法：
 *   node tools/flow-status.mjs <sprint-dir>
 *   node tools/flow-status.mjs 03_迭代运行/Sprint-0-奠基
 */

import fs from "node:fs";
import path from "node:path";

const STATUS_EMOJI = {
  active: "🟢",
  blocked: "🔴",
  waiting: "⏸️",
  pending: "🔵",
  done: "✅",
  not_started: "⚪",
};

function findFile(dir, patterns) {
  for (const entry of fs.readdirSync(dir)) {
    for (const pattern of patterns) {
      if (pattern.test(entry) && entry.endsWith(".md")) {
        return path.join(dir, entry);
      }
    }
  }
  return null;
}

function parseWorkflowStages(file) {
  if (!file || !fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const stages = [];

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    if (/工作流|Workflow/i.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;

    const workflow = cells[0];
    const stage = cells[1];
    const status = cells[3];
    const gap = cells[4];

    if (!workflow || workflow === "工作流") continue;
    stages.push({ workflow, stage, status, gap });
  }

  return stages;
}

function parseTasks(file) {
  if (!file || !fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let headerIndices = null;

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;

    // Detect header row to find column indices
    if (/^\s*ID\s*$/i.test(cells[0]) && !headerIndices) {
      headerIndices = {};
      for (let i = 0; i < cells.length; i++) {
        const h = cells[i].toLowerCase();
        if (/^id$/i.test(h)) headerIndices.id = i;
        if (/task|任务/i.test(h)) headerIndices.title = i;
        if (/owner/i.test(h)) headerIndices.owner = i;
        if (/状态|status/i.test(h)) headerIndices.status = i;
      }
      continue;
    }

    if (!headerIndices) continue;

    const id = cells[headerIndices.id];
    const title = cells[headerIndices.title] || cells[Math.min(2, cells.length - 1)];
    const owner = cells[headerIndices.owner] || "";
    const status = cells[headerIndices.status] || "";
    if (!id) continue;

    tasks.push({ id, title, owner, status });
  }

  return tasks;
}

function classifyStatus(statusText) {
  const s = (statusText || "").toLowerCase();
  if (/完成|done|✅|closed/i.test(s)) return "done";
  if (/阻塞|blocked|🔴/i.test(s)) return "blocked";
  if (/等待|waiting|⏸|待输入/i.test(s)) return "waiting";
  if (/进行中|in.?progress|🟢/i.test(s)) return "active";
  if (/未开始|🔵|pending/i.test(s)) return "pending";
  return "pending";
}

function inferPhase(stages, tasks) {
  const taskStatuses = tasks.map((t) => classifyStatus(t.status));
  const doneRatio = taskStatuses.filter((s) => s === "done").length / Math.max(tasks.length, 1);
  const activeCount = taskStatuses.filter((s) => s === "active").length;
  const blockedCount = taskStatuses.filter((s) => s === "blocked").length;

  if (doneRatio >= 0.8) return { phase: "收尾与验证", confidence: "高" };
  if (activeCount > tasks.length * 0.4) return { phase: "集中执行", confidence: "中" };
  if (blockedCount > 2) return { phase: "阻塞密集，需 SM 干预", confidence: "高" };
  if (activeCount === 0 && doneRatio < 0.2) return { phase: "启动与准备", confidence: "中" };
  return { phase: "混合推进", confidence: "低" };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("用法: node tools/flow-status.mjs <sprint-dir>");
    console.log("\n示例: node tools/flow-status.mjs 03_迭代运行/Sprint-0-奠基");
    console.log("\n读取任务表和工作流阶段表，输出阶段推断和行动建议。不替代 SM 判断。");
    process.exit(0);
  }

  const sprintDir = path.resolve(args[0]);
  if (!fs.existsSync(sprintDir) || !fs.statSync(sprintDir).isDirectory()) {
    console.error(`Sprint 目录不存在：${sprintDir}`);
    process.exit(1);
  }

  const taskFile = findFile(sprintDir, [/任务表|流程看板|流程监控台/i]);
  const taskTableFile = taskFile;
  const stages = parseWorkflowStages(taskFile);
  const tasks = parseTasks(taskTableFile);

  const sprintName = path.basename(sprintDir);
  const inference = inferPhase(stages, tasks);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Sprint 流程状态 — ${sprintName}`);
  console.log(`${"=".repeat(50)}\n`);

  // 阶段推断
  console.log(`📍 推断阶段：${inference.phase}（置信度：${inference.confidence}）`);
  console.log(`   任务总数：${tasks.length}，按状态分类如下\n`);

  // 按状态分组
  const groups = { done: [], active: [], blocked: [], waiting: [], pending: [] };
  for (const task of tasks) {
    const cls = classifyStatus(task.status);
    groups[cls].push(task);
  }

  for (const [cls, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    console.log(`${STATUS_EMOJI[cls]} ${cls.toUpperCase()}（${items.length} 项）`);
    for (const t of items) {
      console.log(`   ${t.id} ${t.title} — ${t.owner} [${t.status}]`);
    }
    console.log();
  }

  // 工作流阶段（如果有）
  if (stages.length > 0) {
    console.log("--- 工作流阶段 ---\n");
    for (const s of stages) {
      console.log(`  ${s.status} ${s.workflow}: ${s.stage}`);
      if (s.gap && s.gap.trim()) console.log(`     缺口: ${s.gap}`);
    }
    console.log();
  }

  // 行动建议
  console.log("--- SM 行动建议 ---\n");

  if (groups.blocked.length > 0) {
    console.log(`🔴 阻塞 ${groups.blocked.length} 项 — 优先清障：`);
    for (const t of groups.blocked) {
      console.log(`   → ${t.id} ${t.title} (${t.owner})`);
    }
    console.log();
  }

  if (groups.waiting.length > 0) {
    console.log(`⏸️  等待输入 ${groups.waiting.length} 项 — 确认可否先行准备：`);
    for (const t of groups.waiting) {
      console.log(`   → ${t.id} ${t.title} (${t.owner})`);
    }
    console.log();
  }

  if (groups.active.length > 0 && groups.pending.length > 0) {
    console.log(`🟢 进行中 ${groups.active.length} 项 + 🔵 待开始 ${groups.pending.length} 项`);
    console.log(`   检查是否有可并行的待开始任务。\n`);
  }

  if (groups.done.length === tasks.length && tasks.length > 0) {
    console.log("✅ 全部任务已完成，可启动 Sprint 关闭流程。");
    console.log("   运行: node tools/sprint-close.mjs " + args[0]);
  }

  console.log(`\n⚠️  以上为工具辅助推断，SM 需结合上下文做出最终判断。`);
}

main();
