#!/usr/bin/env node

/**
 * lint-frontmatter.mjs — Frontmatter 元数据轻量检查
 *
 * 只检查 governance: managed 的文档；exempt 和没有 Frontmatter 的文件跳过。
 * 定位为"辅助提示"，不阻断流程。退出码：0=全部合规，1=有警告。
 *
 * 依据：05_输入输出管理规范 §12（Frontmatter Schema）
 *
 * 用法：
 *   node tools/lint-frontmatter.mjs [--dir=<root>] [--verbose]
 */

import fs from "node:fs";
import path from "node:path";

const SCAN_DIRS = [
  "00_项目导航", "01_产品发现", "02_产品待办", "03_迭代运行",
  "04_工程设计", "05_质量验证", "06_发布运维", "07_度量改进",
  "90_会议与决策",
];

const EXCLUDE_PARTS = new Set([
  "知识库", "10_代码仓库", "99_归档", "Temp", ".git",
  "node_modules", "文档索引", "评估产物",
]);

const REQUIRED_FIELDS = [
  "id", "title", "owner", "domain", "phase",
  "sprint", "type", "status", "version", "last-updated", "governance",
];

const ENUM_DOMAIN = new Set(["PM", "PO", "BE", "FE", "QA", "OPS", "UX"]);
const ENUM_PHASE = new Set([
  "需求", "概要设计", "详细设计", "编码", "测试", "部署运维", "治理",
]);
const ENUM_TYPE = new Set([
  "评估报告", "规范", "ADR", "API契约", "数据模型", "测试用例",
  "Runbook", "度量", "会议纪要", "决策",
]);
const ENUM_STATUS = new Set(["draft", "review", "approved", "locked"]);

function parseFrontmatter(text) {
  const stripped = text.replace(/^\uFEFF/, "");
  if (!stripped.startsWith("---")) return null;
  const end = stripped.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = stripped.slice(3, end).trim();
  const result = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.+?)\s*$/);
    if (match) {
      let value = match[2].trim();
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
      }
      result[match[1]] = value;
    }
  }
  return result;
}

function collectMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_PARTS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function lintFile(filePath, verbose) {
  const text = fs.readFileSync(filePath, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    if (verbose) console.log(`  skip (no frontmatter): ${filePath}`);
    return null;
  }
  if (fm.governance !== "managed") {
    if (verbose) console.log(`  skip (exempt): ${filePath}`);
    return null;
  }

  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === "") {
      warnings.push(`missing field: ${field}`);
    }
  }

  if (fm.domain && !ENUM_DOMAIN.has(fm.domain)) {
    warnings.push(`invalid domain: "${fm.domain}" (expected: ${[...ENUM_DOMAIN].join("/")})`);
  }
  if (fm.phase && !ENUM_PHASE.has(fm.phase)) {
    warnings.push(`invalid phase: "${fm.phase}" (expected: ${[...ENUM_PHASE].join("/")})`);
  }
  if (fm.type && !ENUM_TYPE.has(fm.type)) {
    warnings.push(`invalid type: "${fm.type}"`);
  }
  if (fm.status && !ENUM_STATUS.has(fm.status)) {
    warnings.push(`invalid status: "${fm.status}" (expected: ${[...ENUM_STATUS].join("/")})`);
  }
  if (fm["last-updated"] && !/^\d{4}-\d{2}-\d{2}$/.test(String(fm["last-updated"]))) {
    warnings.push(`invalid last-updated format: "${fm["last-updated"]}" (expected YYYY-MM-DD)`);
  }

  return warnings.length > 0 ? { file: filePath, warnings } : null;
}

function main() {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith("--dir=")) rootDir = path.resolve(arg.slice("--dir=".length));
    else if (arg === "--verbose" || arg === "-v") verbose = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("用法: node tools/lint-frontmatter.mjs [--dir=<root>] [--verbose]");
      console.log("\n只检查 governance: managed 的文档。exempt 和无 Frontmatter 的文件跳过。");
      console.log("退出码：0=全部合规，1=有警告。");
      process.exit(0);
    }
  }

  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...collectMarkdownFiles(path.join(rootDir, dir)));
  }

  const results = [];
  let managedCount = 0;

  for (const file of allFiles) {
    const result = lintFile(file, verbose);
    if (result) {
      results.push(result);
    }
    const text = fs.readFileSync(file, "utf8");
    const fm = parseFrontmatter(text);
    if (fm && fm.governance === "managed") managedCount++;
  }

  console.log(`\nFrontmatter lint — scanned ${allFiles.length} files, ${managedCount} managed.\n`);

  if (results.length === 0) {
    console.log("✅ All managed documents have valid Frontmatter.");
    process.exit(0);
  }

  let totalWarnings = 0;
  for (const { file, warnings } of results) {
    const rel = path.relative(rootDir, file);
    console.log(`⚠️  ${rel}`);
    for (const w of warnings) {
      console.log(`   - ${w}`);
      totalWarnings++;
    }
  }

  console.log(`\n${totalWarnings} warning(s) in ${results.length} file(s).`);
  console.log("提示：L0/exempt 文档不受检查。如需纳入治理，请添加 governance: managed。");
  process.exit(1);
}

main();
