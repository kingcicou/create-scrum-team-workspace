#!/usr/bin/env node

/**
 * sprint-close.mjs — Sprint 关闭收口助手
 *
 * 定位：SM 辅助工具，不自动关闭。读取任务表和质量门禁清单，生成：
 * 1. annotated tag message（Goal / 证据 / 门禁 / carry-over）
 * 2. 更新提醒（首页、日历、归档）
 *
 * 是否打 tag、是否归档仍由 SM 明确确认。
 *
 * 用法：
 *   node tools/sprint-close.mjs <sprint-dir>
 *   node tools/sprint-close.mjs 03_迭代运行/Sprint-0-奠基
 */

import fs from "node:fs";
import path from "node:path";

function findTaskTable(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (/任务表|流程看板|流程监控台/i.test(entry) && entry.endsWith(".md")) {
      return path.join(dir, entry);
    }
  }
  return null;
}

function findGateChecklist(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (/质量门禁|门禁清单/i.test(entry) && entry.endsWith(".md")) {
      return path.join(dir, entry);
    }
  }
  return null;
}

function findSprintPlan(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (/Sprint计划/i.test(entry) && entry.endsWith(".md")) {
      return path.join(dir, entry);
    }
  }
  return null;
}

function extractGoal(planFile) {
  if (!planFile || !fs.existsSync(planFile)) return "（未找到 Sprint 计划）";
  const text = fs.readFileSync(planFile, "utf8");
  const match = text.match(/Sprint Goal[：:]\s*\*?\*?\s*(.+)/i)
    || text.match(/\*\*Sprint Goal[：:]\*\*\s*(.+)/i)
    || text.match(/Goal[：:]\s*(.+)/i);
  return match ? match[1].trim().replace(/^\*+|\*+$/g, "") : "（未提取到 Sprint Goal）";
}

function parseTaskTable(file) {
  if (!file || !fs.existsSync(file)) return { tasks: [], statuses: { done: [], pending: [], blocked: [], waiting: [] } };
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  const tasks = [];
  const statuses = { done: [], pending: [], blocked: [], waiting: [] };
  let headerIndices = null;

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;

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

    tasks.push({ id, title, owner, status, updated: "" });

    const statusLower = (status || "").toLowerCase();
    if (/完成|done|✅|closed/i.test(statusLower)) {
      statuses.done.push(id);
    } else if (/阻塞|blocked|🔴/i.test(statusLower)) {
      statuses.blocked.push(id);
    } else if (/等待|waiting|⏸/i.test(statusLower)) {
      statuses.waiting.push(id);
    } else {
      statuses.pending.push(id);
    }
  }

  return { tasks, statuses };
}

function parseGateChecklist(file) {
  if (!file || !fs.existsSync(file)) return { gates: [], summary: "未找到质量门禁清单" };
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  const gates = [];
  let passed = 0;
  let blocked = 0;
  let waiver = 0;
  let unfilled = 0;

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    if (/^\|\s*#\s/i.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;

    const num = cells[0];
    const name = cells[1];
    const status = cells[6];
    if (!num || num === "#" || !name) continue;

    gates.push({ num, name, status });
    if (/通过|✅|🟢/i.test(status)) passed++;
    else if (/阻塞|🔴/i.test(status)) blocked++;
    else if (/waiver|豁免|🟡/i.test(status)) waiver++;
    else unfilled++;
  }

  const summary = `通过: ${passed}, 阻塞: ${blocked}, 豁免: ${waiver}, 待填: ${unfilled}`;
  return { gates, summary, passed, blocked, waiver, unfilled };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("用法: node tools/sprint-close.mjs <sprint-dir>");
    console.log("\n示例: node tools/sprint-close.mjs 03_迭代运行/Sprint-0-奠基");
    console.log("\n生成 Sprint 关闭 tag message 和更新提醒。不自动执行任何操作。");
    process.exit(0);
  }

  const sprintDir = path.resolve(args[0]);
  if (!fs.existsSync(sprintDir) || !fs.statSync(sprintDir).isDirectory()) {
    console.error(`Sprint 目录不存在：${sprintDir}`);
    process.exit(1);
  }

  const sprintName = path.basename(sprintDir);
  const taskTableFile = findTaskTable(sprintDir);
  const gateFile = findGateChecklist(sprintDir);
  const planFile = findSprintPlan(sprintDir);

  const goal = extractGoal(planFile);
  const { tasks, statuses } = parseTaskTable(taskTableFile);
  const { gates, summary, passed = 0, blocked: gateBlocked = 0, waiver = 0, unfilled = 0 } = parseGateChecklist(gateFile);

  // === 输出 tag message ===
  console.log("=".repeat(60));
  console.log(`Sprint 关闭 Tag Message（建议）`);
  console.log("=".repeat(60));
  console.log();
  console.log(`Tag: close/${sprintName.toLowerCase().replace(/\s+/g, "-")}`);
  console.log();
  console.log(`Sprint: ${sprintName}`);
  console.log(`Goal: ${goal}`);
  console.log();

  console.log("--- 任务统计 ---");
  console.log(`总计: ${tasks.length} 项`);
  console.log(`已完成: ${statuses.done.length} 项 ${statuses.done.length > 0 ? "(" + statuses.done.join(", ") + ")" : ""}`);
  console.log(`待处理: ${statuses.pending.length} 项 ${statuses.pending.length > 0 ? "(" + statuses.pending.join(", ") + ")" : ""}`);
  console.log(`阻塞: ${statuses.blocked.length} 项 ${statuses.blocked.length > 0 ? "(" + statuses.blocked.join(", ") + ")" : ""}`);
  console.log(`等待输入: ${statuses.waiting.length} 项 ${statuses.waiting.length > 0 ? "(" + statuses.waiting.join(", ") + ")" : ""}`);
  console.log();

  console.log("--- 质量门禁 ---");
  console.log(summary);
  if (gates.length > 0) {
    for (const g of gates) {
      console.log(`  ${g.num} ${g.name}: ${g.status}`);
    }
  }
  console.log();

  const carryOver = [...statuses.pending, ...statuses.blocked, ...statuses.waiting];
  console.log("--- Carry-over（结转下一 Sprint）---");
  if (carryOver.length === 0) {
    console.log("无");
  } else {
    for (const id of carryOver) {
      const task = tasks.find((t) => t.id === id);
      if (task) console.log(`  ${task.id} ${task.title} (${task.owner}) — ${task.status}`);
    }
  }

  // === 输出提醒 ===
  console.log();
  console.log("=".repeat(60));
  console.log("SM 关闭检查清单（需人工确认）");
  console.log("=".repeat(60));
  console.log();

  const checks = [];
  checks.push({ ok: tasks.length > 0, msg: "任务表已读取", detail: taskTableFile ? `✅ ${path.relative(process.cwd(), taskTableFile)}` : "❌ 未找到任务表文件" });
  checks.push({ ok: true, msg: "质量门禁", detail: gateFile ? `✅ ${summary}` : "⚠️ 未找到质量门禁清单" });
  checks.push({ ok: statuses.blocked.length === 0, msg: "无阻塞任务", detail: statuses.blocked.length === 0 ? "✅" : `⚠️ ${statuses.blocked.length} 项阻塞，需 SM 处置后再关闭` });
  checks.push({ ok: gateBlocked === 0, msg: "门禁无阻塞", detail: gateBlocked === 0 ? "✅" : `⚠️ ${gateBlocked} 项门禁阻塞` });

  for (const c of checks) {
    console.log(`  ${c.detail}  ${c.msg}`);
  }

  console.log();
  console.log("后续动作提醒：");
  console.log("  1. 确认 carry-over 已登记到下一 Sprint 计划。");
  console.log("  2. 更新 00_项目导航/00_项目首页.md 中的 Sprint 状态。");
  console.log("  3. 更新 03_迭代运行/00_迭代节奏与日历.md。");
  console.log("  4. 归档本 Sprint 监控台到 99_归档/已完成迭代/。");
  console.log("  5. 打 annotated tag：");
  console.log(`     git tag -a close/${sprintName.toLowerCase().replace(/\s+/g, "-")} -m "$(上述 tag message)"`);
  console.log();
  console.log("⚠️  本工具不自动执行任何操作。请 SM 逐项确认后手工执行。");
}

main();
