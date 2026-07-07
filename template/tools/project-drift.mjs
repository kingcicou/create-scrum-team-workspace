#!/usr/bin/env node

/**
 * project-drift.mjs — 项目配置与模板偏差检查
 *
 * 检查项目侧文件与模板约定之间的偏差：
 * 1. 未替换的占位符（{{KEY}} 或 __KEY__）
 * 2. 项目侧有但模板中没有的新增文件（潜在回流候选）
 * 3. 文件编号规则一致性提示
 *
 * 定位为"差异提示"，不强制同步，不重命名文件。
 *
 * 用法：
 *   node tools/project-drift.mjs [--project=<dir>] [--template=<dir>]
 */

import fs from "node:fs";
import path from "node:path";

const SCAN_DIRS = [
  "00_项目导航", "01_产品发现", "02_产品待办", "03_迭代运行",
  "04_工程设计", "05_质量验证", "06_发布运维", "07_度量改进",
  "90_会议与决策",
];

const PLACEHOLDER_RE_CONTENT = /\{\{([A-Z0-9_]+)\}\}/g;
const PLACEHOLDER_RE_PATH = /__([A-Z0-9_]+)__/g;

const KNOWN_PLACEHOLDERS = new Set([
  "PROJECT_NAME", "PROJECT_NAME_UPPER", "PROJECT_TYPE",
  "REPO_STRATEGY", "SPRINT_NUMBER", "SPRINT_START", "SPRINT_END",
  "ROLE_JSON", "TEAM_SIZE", "WORKSPACE_NAME",
  "OWNER_NAME", "SM_NAME", "PO_NAME", "TL_NAME",
]);

const NUMBERING_RE = /^(\d{2})_/;

function collectAllFiles(dir, base) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" ||
        entry.name === "Temp" || entry.name === "99_归档" ||
        entry.name === "10_代码仓库" || entry.name === "TeamWork" ||
        entry.name === "知识库" || entry.name === "评估产物") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAllFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push({ abs: full, rel: path.relative(base, full) });
    }
  }
  return results;
}

function collectTemplateFiles(dir, base) {
  const results = new Set();
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const rel of collectTemplateFiles(full, base)) {
        results.add(rel);
      }
    } else if (entry.isFile()) {
      results.add(path.relative(base, full));
    }
  }
  return results;
}

function checkPlaceholders(files) {
  const issues = [];
  for (const { abs, rel } of files) {
    // Check file path for __KEY__ patterns
    const pathMatches = rel.match(PLACEHOLDER_RE_PATH);
    if (pathMatches) {
      for (const m of pathMatches) {
        const key = m.replace(/__/g, "");
        if (KNOWN_PLACEHOLDERS.has(key)) {
          issues.push({ rel, type: "path", placeholder: m, severity: "warn" });
        }
      }
    }

    // Check file content for {{KEY}} patterns
    try {
      const text = fs.readFileSync(abs, "utf8");
      let match;
      const seen = new Set();
      while ((match = PLACEHOLDER_RE_CONTENT.exec(text)) !== null) {
        const key = match[1];
        if (KNOWN_PLACEHOLDERS.has(key) && !seen.has(key)) {
          seen.add(key);
          issues.push({ rel, type: "content", placeholder: match[0], severity: "warn" });
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return issues;
}

function checkNumbering(files) {
  const issues = [];
  const byDir = new Map();

  for (const { rel } of files) {
    const dir = path.dirname(rel);
    const base = path.basename(rel);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(base);
  }

  for (const [dir, names] of byDir) {
    const numbered = [];
    const unnumbered = [];
    for (const n of names) {
      if (NUMBERING_RE.test(n)) {
        numbered.push(n);
      } else if (n !== "README.md" && !n.startsWith("_")) {
        unnumbered.push(n);
      }
    }
    if (numbered.length > 0 && unnumbered.length > 0) {
      for (const u of unnumbered) {
        issues.push({
          rel: path.join(dir, u),
          type: "numbering",
          detail: `同目录有编号文件 ${numbered.length} 个，此文件无编号前缀`,
          severity: "info",
        });
      }
    }

    // Check for duplicate numbering
    const numMap = new Map();
    for (const n of numbered) {
      const m = n.match(NUMBERING_RE);
      if (m) {
        const num = m[1];
        if (!numMap.has(num)) numMap.set(num, []);
        numMap.get(num).push(n);
      }
    }
    for (const [num, names] of numMap) {
      if (names.length > 1) {
        issues.push({
          rel: path.join(dir, names[0]),
          type: "duplicate-number",
          detail: `编号 ${num} 被 ${names.length} 个文件共用：${names.join(", ")}`,
          severity: "warn",
        });
      }
    }
  }

  return issues;
}

function checkProjectOnlyFiles(projectFiles, templateFiles) {
  const projectOnly = [];
  for (const { rel } of projectFiles) {
    // Normalize: project files won't have template placeholders
    // Check if any template file matches (ignoring Sprint-specific dirs)
    const normalized = rel.replace(/Sprint-\d+-[^/\\]+/, "Sprint-0-启动");
    if (!templateFiles.has(rel) && !templateFiles.has(normalized)) {
      projectOnly.push(rel);
    }
  }
  return projectOnly;
}

function main() {
  const args = process.argv.slice(2);
  let projectDir = "";
  let templateDir = "";

  for (const arg of args) {
    if (arg.startsWith("--project=")) projectDir = path.resolve(arg.slice("--project=".length));
    else if (arg.startsWith("--template=")) templateDir = path.resolve(arg.slice("--template=".length));
    else if (arg === "--help" || arg === "-h") {
      console.log("用法: node tools/project-drift.mjs [--project=<dir>] [--template=<dir>]");
      console.log("\n检查项目侧文件与模板约定的偏差（占位符/编号/回流候选）。");
      console.log("默认路径：project=cwd，template=cwd/10_代码仓库/create-scrum-team-workspace/template");
      process.exit(0);
    }
  }

  const cwd = process.cwd();
  if (!projectDir) projectDir = cwd;
  if (!templateDir) {
    const candidates = [
      path.join(cwd, "10_代码仓库", "create-scrum-team-workspace", "template"),
      path.join(cwd, "..", "10_代码仓库", "create-scrum-team-workspace", "template"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { templateDir = c; break; }
    }
    if (!templateDir) templateDir = candidates[0];
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("项目偏差检查报告");
  console.log(`${"=".repeat(50)}`);
  console.log(`项目侧：${projectDir}`);
  console.log(`模板侧：${templateDir}\n`);

  // Collect files
  const projectFiles = [];
  for (const d of SCAN_DIRS) {
    const dir = path.join(projectDir, d);
    if (fs.existsSync(dir)) {
      projectFiles.push(...collectAllFiles(dir, projectDir));
    }
  }

  const templateFileSet = collectTemplateFiles(templateDir, templateDir);

  // 1. Unresolved placeholders
  console.log("--- 1. 未替换的占位符 ---");
  const placeholders = checkPlaceholders(projectFiles);
  if (placeholders.length === 0) {
    console.log("  ✅ 无残留占位符\n");
  } else {
    for (const p of placeholders) {
      const icon = p.severity === "warn" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} ${p.rel}  [${p.type}] ${p.placeholder}`);
    }
    console.log(`\n  共 ${placeholders.length} 处未替换占位符。建议检查是否在生成后遗漏了手动替换。\n`);
  }

  // 2. Project-only files (potential backflow candidates)
  console.log("--- 2. 项目侧新增文件（潜在回流候选）---");
  const projectOnly = checkProjectOnlyFiles(projectFiles, templateFileSet);
  if (projectOnly.length === 0) {
    console.log("  ✅ 无项目独有文件\n");
  } else {
    for (const rel of projectOnly.sort()) {
      console.log(`  + ${rel}`);
    }
    console.log(`\n  共 ${projectOnly.length} 个项目独有文件。`);
    console.log("  说明：这些文件在模板中不存在对应文件，可能是项目运行中的增量产物。");
    console.log("  行动：SM/TL 评估是否值得回流到模板（稳定、可复用的知识/工具/规范）。\n");
  }

  // 3. Numbering consistency
  console.log("--- 3. 编号一致性 ---");
  const numbering = checkNumbering(projectFiles);
  if (numbering.length === 0) {
    console.log("  ✅ 编号规则一致\n");
  } else {
    for (const n of numbering) {
      const icon = n.severity === "warn" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} ${n.rel}  [${n.type}] ${n.detail}`);
    }
    console.log(`\n  共 ${numbering.length} 个编号相关提示。\n`);
  }

  // Summary
  console.log(`${"=".repeat(50)}`);
  const total = placeholders.length + projectOnly.length + numbering.length;
  if (total === 0) {
    console.log("✅ 项目偏差检查通过，无需要关注的偏差。");
  } else {
    console.log(`汇总：${placeholders.length} 占位符 + ${projectOnly.length} 新增文件 + ${numbering.length} 编号提示 = ${total} 项`);
    console.log("⚠️  本报告仅提供信息，不执行任何修改操作。");
  }
}

main();
