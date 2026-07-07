#!/usr/bin/env node

/**
 * template-diff.mjs — 知识库文件清单差异提示
 *
 * 对比项目侧知识库与模板侧知识库的文件清单，输出三类差异：
 * 1. 仅项目侧有（可能是运行中增量，或待回流到模板）
 * 2. 仅模板侧有（可能是模板新增，项目侧尚未同步）
 * 3. 两侧均有（可进一步比较内容）
 *
 * 不强制同步，只提供差异信息供 SM/TL 判断。
 *
 * 用法：
 *   node tools/template-diff.mjs [--project=<dir>] [--template=<dir>]
 *   node tools/template-diff.mjs --content   # 同时比较内容摘要
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function collectFiles(dir, base) {
  const results = new Map();
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [rel, abs] of collectFiles(full, base)) {
        results.set(rel, abs);
      }
    } else if (entry.isFile()) {
      const rel = path.relative(base, full);
      results.set(rel, full);
    }
  }
  return results;
}

function fileHash(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function main() {
  const args = process.argv.slice(2);
  let projectDir = "";
  let templateDir = "";
  let compareContent = false;

  for (const arg of args) {
    if (arg.startsWith("--project=")) projectDir = path.resolve(arg.slice("--project=".length));
    else if (arg.startsWith("--template=")) templateDir = path.resolve(arg.slice("--template=".length));
    else if (arg === "--content" || arg === "-c") compareContent = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("用法: node tools/template-diff.mjs [--project=<dir>] [--template=<dir>] [--content]");
      console.log("\n对比项目侧知识库与模板侧知识库的文件清单差异。");
      console.log("默认路径：project=cwd/知识库，template=cwd/10_代码仓库/create-scrum-team-workspace/template/知识库");
      console.log("--content 同时比较文件内容摘要（sha256 前 12 位）");
      process.exit(0);
    }
  }

  const cwd = process.cwd();
  if (!projectDir) projectDir = path.join(cwd, "知识库");
  if (!templateDir) {
    // Try to find template dir relative to cwd
    const candidates = [
      path.join(cwd, "10_代码仓库", "create-scrum-team-workspace", "template", "知识库"),
      path.join(cwd, "..", "10_代码仓库", "create-scrum-team-workspace", "template", "知识库"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { templateDir = c; break; }
    }
    if (!templateDir) templateDir = candidates[0];
  }

  if (!fs.existsSync(projectDir)) {
    console.error(`项目侧知识库目录不存在：${projectDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(templateDir)) {
    console.error(`模板侧知识库目录不存在：${templateDir}`);
    process.exit(1);
  }

  const projectFiles = collectFiles(projectDir, projectDir);
  const templateFiles = collectFiles(templateDir, templateDir);

  const projectOnly = [];
  const templateOnly = [];
  const both = [];
  const bothSame = [];

  for (const [rel] of projectFiles) {
    if (templateFiles.has(rel)) {
      if (compareContent) {
        const ph = fileHash(projectFiles.get(rel));
        const th = fileHash(templateFiles.get(rel));
        if (ph === th) {
          bothSame.push({ rel, projectHash: ph, templateHash: th });
        } else {
          both.push({ rel, projectHash: ph, templateHash: th });
        }
      } else {
        both.push({ rel });
      }
    } else {
      projectOnly.push(rel);
    }
  }

  for (const [rel] of templateFiles) {
    if (!projectFiles.has(rel)) {
      templateOnly.push(rel);
    }
  }

  // Sort all arrays
  projectOnly.sort();
  templateOnly.sort();
  both.sort((a, b) => a.rel.localeCompare(b.rel));
  bothSame.sort((a, b) => a.rel.localeCompare(b.rel));

  console.log(`\n${"=".repeat(50)}`);
  console.log("知识库文件差异报告");
  console.log(`${"=".repeat(50)}`);
  console.log(`项目侧：${projectDir}`);
  console.log(`模板侧：${templateDir}`);
  console.log(`项目侧文件：${projectFiles.size}，模板侧文件：${templateFiles.size}\n`);

  // 1. Project-only files
  console.log(`--- 仅项目侧有（${projectOnly.length} 个）---`);
  if (projectOnly.length === 0) {
    console.log("  无");
  } else {
    for (const rel of projectOnly) {
      console.log(`  + ${rel}`);
    }
    console.log("\n  说明：可能是项目运行中的增量文档，或经过复盘后待回流到模板的稳定知识。");
    console.log("  行动：SM/TL 评估是否值得吸收回模板。");
  }
  console.log();

  // 2. Template-only files
  console.log(`--- 仅模板侧有（${templateOnly.length} 个）---`);
  if (templateOnly.length === 0) {
    console.log("  无");
  } else {
    for (const rel of templateOnly) {
      console.log(`  - ${rel}`);
    }
    console.log("\n  说明：模板新增或修改的文件，项目侧尚未同步。");
    console.log("  行动：SM 评估是否需要更新项目侧对应文件。");
  }
  console.log();

  // 3. Both
  if (compareContent) {
    console.log(`--- 两侧均有但内容不同（${both.length} 个）---`);
    if (both.length === 0) {
      console.log("  无");
    } else {
      for (const { rel, projectHash, templateHash } of both) {
        console.log(`  ~ ${rel}  (project:${projectHash} template:${templateHash})`);
      }
      console.log("\n  说明：两侧文件内容存在差异，需人工判断哪侧为准。");
    }
    console.log();

    console.log(`--- 两侧完全一致（${bothSame.length} 个）---`);
    console.log("  ✅ 无需操作");
  } else {
    console.log(`--- 两侧均有（${both.length} 个）---`);
    if (both.length === 0) {
      console.log("  无");
    } else {
      for (const { rel } of both) {
        console.log(`  ~ ${rel}`);
      }
      console.log("\n  提示：使用 --content 参数比较内容摘要。");
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`汇总：项目独有 ${projectOnly.length} + 模板独有 ${templateOnly.length} + 共有 ${both.length + bothSame.length}`);
  console.log("⚠️  本报告仅提供信息，不执行任何同步操作。");
}

main();
