#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];

if (!file) {
  console.error("Usage: node tools/review-status.mjs <review-or-retro.md>");
  process.exit(1);
}

const absolute = path.resolve(file);
if (!fs.existsSync(absolute)) {
  console.error(`File not found: ${absolute}`);
  process.exit(1);
}

const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
const sectionStarts = [];

for (let index = 0; index < lines.length; index += 1) {
  if (/^##\s+评审意见追加\s*$/.test(lines[index])) {
    sectionStarts.push(index);
  }
}

if (sectionStarts.length !== 1) {
  console.error(`Expected one "## 评审意见追加" section, found ${sectionStarts.length}.`);
  process.exit(2);
}

const headings = [];
for (let index = sectionStarts[0] + 1; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^##\s+/.test(line)) break;
  const match = line.match(/^###\s+(.+?)\s*$/);
  if (!match) continue;

  const label = match[1].split(/\s+(?:·|—)\s+/u)[0].trim();
  if (!/^关闭后裁决(?:\s|$)/u.test(label)) headings.push(label);
}

const counts = new Map();
for (const heading of headings) {
  counts.set(heading, (counts.get(heading) ?? 0) + 1);
}

console.log(`Review entries (${counts.size}):`);
for (const [heading, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`- ${heading}${count > 1 ? ` (duplicate x${count})` : ""}`);
}

if ([...counts.values()].some((count) => count > 1)) {
  console.error("Duplicate review headings found.");
  process.exit(2);
}
