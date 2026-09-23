/**
 * 文档词预算门禁。
 * 从 scripts/doc-budgets.manifest.json 读取上限，超限则报错。
 * 词数 = 空白分隔的 token 数（wc -w 风格）。
 *
 * 用法：node scripts/docs/verify-doc-budgets.mjs [--list]
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(root, "scripts/doc-budgets.manifest.json");

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

const listOnly = process.argv.includes("--list");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const failures = [];
const rows = [];

for (const [path, ceiling] of Object.entries(manifest)) {
  if (!Number.isInteger(ceiling) || ceiling <= 0) {
    rows.push(`BAD   ${"—".padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`);
    failures.push(`${path}: 上限必须是正整数，当前为 ${ceiling}`);
    continue;
  }

  const abs = resolve(root, path);
  if (!existsSync(abs)) {
    rows.push(`MISS  ${"—".padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`);
    failures.push(`${path}: 文件不存在（已重命名或删除？请在同次变更中更新 manifest）`);
    continue;
  }

  const words = countWords(readFileSync(abs, "utf8"));
  rows.push(
    `${words <= ceiling ? "ok  " : "OVER"}  ${String(words).padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`,
  );
  if (words > ceiling) {
    failures.push(
      `${path}: ${words} 字，超出 ${ceiling} 字上限 — 迁移或压缩（上调上限需在 PR 中说明）`,
    );
  }
}

if (listOnly) {
  console.log(rows.join("\n"));
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify-doc-budgets 失败：\n");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`verify-doc-budgets: ${Object.keys(manifest).length} 个文档均在预算内。`);
process.exit(0);
