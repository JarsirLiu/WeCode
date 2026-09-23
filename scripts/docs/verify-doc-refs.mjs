/**
 * 反向校验：源码中引用的 docs Markdown 路径是否存在。
 * markdown→文件方向由 verify-md-links 把守；本脚本是代码注释 → 文档方向。
 *
 * 用法：node scripts/docs/verify-doc-refs.mjs [files...]
 */

import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const SCAN_GLOBS = ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"];

const norm = (p) => p.split(sep).join("/");

const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : SCAN_GLOBS.flatMap((pattern) =>
        globSync(pattern, { cwd: root }).map((p) => resolve(root, norm(p))),
      );

/** docs/...md 路径 token。 */
const DOC_REF = /(?<![\w/\\])docs\/[A-Za-z0-9._/-]+\.md/g;

const violations = [];

for (const absPath of files) {
  let text;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(DOC_REF)) {
      const token = match[0];
      if (!existsSync(resolve(root, token))) {
        const rel = norm(absPath.replace(root + sep, "").replace(root + "/", ""));
        violations.push({ file: rel, line: i + 1, token });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`verify-doc-refs: ${files.length} 个 TS 文件，文档引用有效。`);
  process.exit(0);
}

console.error(`verify-doc-refs: ${violations.length} 个断链的文档引用：\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    → ${v.token} 不存在\n`);
}
process.exit(1);
