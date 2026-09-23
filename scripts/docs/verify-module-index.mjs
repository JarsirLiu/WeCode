/**
 * 校验 docs/modules.md 与生成器输出一致，防止提交的索引腐烂。
 * docs/modules.md 是生成产物：改动模块后必须重跑 `pnpm docs:modules --write`。
 *
 * 用法：
 *   node scripts/docs/verify-module-index.mjs            # 校验一致性
 *   node scripts/docs/verify-module-index.mjs --write     # 重写 docs/modules.md
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateModuleIndex } from "./generate-module-index.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const target = path.join(root, "docs/modules.md");

const generated = `${await generateModuleIndex()}\n`;
const write = process.argv.includes("--write");
if (write) {
  writeFileSync(target, generated);
  console.log(`wrote ${path.relative(root, target)}`);
  process.exit(0);
}

let committed;
try {
  committed = readFileSync(target, "utf8");
} catch {
  console.error(
    "verify-module-index: docs/modules.md does not exist. Run `pnpm docs:modules --write` to create it.",
  );
  process.exit(1);
}
if (committed !== generated) {
  console.error(
    "verify-module-index: docs/modules.md is stale. Run `pnpm docs:modules --write` to regenerate.",
  );
  process.exit(1);
}
console.log("verify-module-index: docs/modules.md is up to date.");
