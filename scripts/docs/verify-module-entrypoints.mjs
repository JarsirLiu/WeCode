/**
 * 校验 architecture-policy.yaml 中声明的 publicEntrypoints 在磁盘上实际存在。
 * 防止策略里指向已删除或重命名的契约文件，导致「公开入口」成为断链。
 *
 * 用法：node scripts/docs/verify-module-entrypoints.mjs
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { loadPolicy } from "../architecture/policy.mjs";

const root = path.resolve(import.meta.dirname, "../..");

const errors = [];
const policy = await loadPolicy(root);
for (const module of policy.modules) {
  for (const entry of module.publicEntrypoints) {
    const candidates = [
      path.resolve(root, entry),
      ...module.roots.map((moduleRoot) => path.resolve(moduleRoot, entry)),
    ];
    if (!candidates.some((candidate) => existsSync(candidate))) {
      errors.push(
        `module ${module.id}: declared publicEntrypoint "${entry}" does not exist on disk`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    `verify-module-entrypoints: ${errors.length} stale or missing declared entrypoint(s) (fix in architecture-policy.yaml):`,
  );
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("verify-module-entrypoints: all declared publicEntrypoints exist.");
