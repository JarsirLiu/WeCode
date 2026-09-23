/**
 * 模块文档覆盖门禁：源文件数达到阈值的模块必须有一份手写导向卡片
 * （README.md / README.zh.md / AGENTS.md / MODULE.md / CONTRACT.md）。
 *
 * 阈值以下的模块可一次读穿，不强制卡片，避免文档噪音。
 * 卡片放在模块根或其父目录（包目录）均可被识别。
 *
 * 用法：node scripts/docs/verify-module-coverage.mjs
 */

import path from "node:path";

import { discoverFiles, loadPolicy, moduleForFile } from "../architecture/policy.mjs";
import { moduleDocPaths } from "../architecture/index.mjs";
import { MODULE_COVERAGE_THRESHOLD } from "./generate-module-index.mjs";

const root = path.resolve(import.meta.dirname, "../..");

const policy = await loadPolicy(root);
const files = await discoverFiles(policy);
const errors = [];
const coverage = [];
for (const module of policy.modules) {
  const moduleFiles = files.filter((file) => moduleForFile(file, policy)?.id === module.id);
  const docs = await moduleDocPaths(module, root);
  const hasCard = docs.length > 0;
  coverage.push({ id: module.id, files: moduleFiles.length, hasCard });
  if (moduleFiles.length >= MODULE_COVERAGE_THRESHOLD && !hasCard) {
    errors.push(
      `module ${module.id}: ${moduleFiles.length} source files (≥${MODULE_COVERAGE_THRESHOLD}) but no orientation card — add README.md at ${module.roots[0].replace(/\\/g, "/")} or its package dir`,
    );
  }
}

if (errors.length > 0) {
  console.error(
    `verify-module-coverage: ${errors.length} module(s) above the ${MODULE_COVERAGE_THRESHOLD}-file threshold lack an orientation card:`,
  );
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
const covered = coverage.filter((row) => row.files >= MODULE_COVERAGE_THRESHOLD).length;
console.log(
  `verify-module-coverage: ${covered}/${coverage.length} modules above threshold all have cards.`,
);
