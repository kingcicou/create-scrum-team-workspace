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
const anchorCounts = new Map();
const errors = [];
let activeAnchor = null;
const strictAnchors = lines.some((line) => /<!--\s*append-policy:\s*anchors-v1\s*-->/u.test(line))
  || lines.some((line) => /<!--\s*\/?append:role=/u.test(line));
for (let index = sectionStarts[0] + 1; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^##\s+/.test(line)) break;
  const open = line.match(/^<!--\s*append:role=([^\s]+)\s*-->\s*$/u);
  const close = line.match(/^<!--\s*\/append:role=([^\s]+)\s*-->\s*$/u);
  if (open) {
    const key = open[1];
    anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
    if (activeAnchor) errors.push(`Nested append anchor: ${key} inside ${activeAnchor}.`);
    activeAnchor = key;
    continue;
  }
  if (close) {
    const key = close[1];
    if (activeAnchor !== key) errors.push(`Unmatched append anchor close: ${key}.`);
    activeAnchor = null;
    continue;
  }
  const match = line.match(/^###\s+(.+?)\s*$/);
  if (!match) continue;

  const label = match[1].split(/\s+(?:·|—)\s+/u)[0].trim();
  if (!/^关闭后裁决(?:\s|$)/u.test(label)) {
    headings.push(label);
    if (strictAnchors && !activeAnchor) {
      errors.push(`Review heading without append anchor: ${label}.`);
    }
  }
}
if (activeAnchor) errors.push(`Unclosed append anchor: ${activeAnchor}.`);
for (const [key, count] of anchorCounts) {
  if (count > 1) errors.push(`Duplicate append anchor: ${key} (x${count}).`);
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
  errors.push("Duplicate review headings found.");
}
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(2);
}
