/**
 * 校验并密封 Agent Note 归档区（docs/notes/archived/）。
 * 归档笔记是冻结的历史快照：任何改动都会改变内容哈希，
 * 与 manifest.json 中记录的 sha256 不符即失败。
 *
 * 用法：
 *   node scripts/docs/verify-archived-agent-notes.mjs            # 校验
 *   node scripts/docs/verify-archived-agent-notes.mjs --write    # 重新密封
 */

import { createHash } from "node:crypto";
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const ARCHIVE_ROOT = resolve(root, "docs/notes/archived");
const MANIFEST_PATH = resolve(ARCHIVE_ROOT, "manifest.json");

const norm = (p) => p.split(sep).join("/");

function contentHash(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function scanArchive() {
  const files = globSync("**/*.md", { cwd: ARCHIVE_ROOT });
  const map = {};
  for (const rel of files) {
    map[norm(rel)] = contentHash(readFileSync(resolve(ARCHIVE_ROOT, rel), "utf8"));
  }
  return map;
}

function loadManifest() {
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.version === 1 &&
      typeof parsed.files === "object"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const writeMode = process.argv.slice(2).includes("--write");

if (writeMode) {
  const files = scanArchive();
  const manifest = { version: 1, files };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`verify-archived-agent-notes: 已密封 ${Object.keys(files).length} 个归档笔记。`);
  process.exit(0);
}

const manifest = loadManifest();
const errors = [];
const actual = scanArchive();

if (manifest === null) {
  errors.push("manifest.json 缺失或格式非法——归档区未密封，运行 --write 初始密封");
} else {
  for (const [rel, expected] of Object.entries(manifest.files)) {
    const current = actual[rel];
    if (current === undefined) {
      errors.push(`${rel}: 已从归档区消失或被改名`);
    } else if (current !== expected) {
      errors.push(`${rel}: 内容被修改（归档不可编辑，如需修正请新写笔记并链接旧笔记）`);
    }
  }
  for (const rel of Object.keys(actual)) {
    if (!(rel in manifest.files)) {
      errors.push(`${rel}: 未登记进 manifest（新归档需运行 --write 密封）`);
    }
  }
}

if (errors.length === 0) {
  console.log(
    `verify-archived-agent-notes: ${Object.keys(actual).length} 个归档笔记与 manifest 一致。`,
  );
  process.exit(0);
}

console.error(`verify-archived-agent-notes: ${errors.length} 个归档违规：\n`);
for (const e of errors) console.error(`  → ${e}`);
process.exit(1);
