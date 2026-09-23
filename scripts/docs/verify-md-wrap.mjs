/**
 * 验证 Markdown 的「一行一段」规范。
 * 规则：每个段落占一个物理行（编辑器软换行即可）。
 * 例外：代码块、表格、列表、标题、frontmatter 不受约束。
 *
 * 用法：node scripts/docs/verify-md-wrap.mjs [files...]
 */

import { globSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const SCAN_GLOBS = ["docs/**/*.md", "README.md"];
const SKIP_PATTERNS = ["node_modules/", "dist/", "out/"];

const norm = (p) => p.split(sep).join("/");

const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : SCAN_GLOBS.flatMap((pattern) =>
        globSync(pattern, { cwd: root }).map((p) => resolve(root, norm(p))),
      );

const uniqueFiles = [...new Set(files)].filter(
  (file) => !SKIP_PATTERNS.some((p) => file.includes(p)),
);

const violations = [];

for (const absPath of uniqueFiles) {
  const relPath = norm(absPath.replace(root + sep, "").replace(root + "/", ""));
  const text = readFileSync(absPath, "utf8");
  const lines = text.split("\n");

  let inCodeBlock = false;
  let inHtmlComment = false;
  let inTable = false;
  let inFrontmatter = false;
  let frontmatterEnded = false;
  let lastLineWasEmpty = false;
  let paragraphStart = -1;
  let paragraphLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // YAML frontmatter 边界
    if (!frontmatterEnded && trimmed === "---") {
      if (!inFrontmatter && i === 0) {
        inFrontmatter = true;
        lastLineWasEmpty = false;
        continue;
      } else if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterEnded = true;
        paragraphStart = -1;
        paragraphLines = 0;
        lastLineWasEmpty = true;
        continue;
      }
    }

    if (inFrontmatter) continue;

    // 代码块边界
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        paragraphStart = -1;
        paragraphLines = 0;
      } else {
        if (paragraphLines > 1) {
          violations.push({
            file: relPath,
            line: paragraphStart + 1,
            reason: `段落跨 ${paragraphLines} 行（应一行一段）`,
          });
        }
        inCodeBlock = true;
      }
      lastLineWasEmpty = false;
      continue;
    }

    if (inCodeBlock) continue;

    // HTML comment blocks (multi-line <!-- ... -->)
    if (inHtmlComment) {
      if (trimmed.includes("-->")) inHtmlComment = false;
      paragraphStart = -1;
      paragraphLines = 0;
      lastLineWasEmpty = false;
      continue;
    }
    if (trimmed.includes("<!--")) {
      if (!trimmed.includes("-->")) inHtmlComment = true;
      if (paragraphLines > 1) {
        violations.push({
          file: relPath,
          line: paragraphStart + 1,
          reason: `段落跨 ${paragraphLines} 行（应一行一段）`,
        });
      }
      paragraphStart = -1;
      paragraphLines = 0;
      lastLineWasEmpty = false;
      continue;
    }

    // 表格行
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      inTable = true;
      lastLineWasEmpty = false;
      continue;
    } else if (inTable && trimmed === "") {
      inTable = false;
    }
    if (inTable) continue;

    // 空行
    if (trimmed === "") {
      if (paragraphLines > 1) {
        violations.push({
          file: relPath,
          line: paragraphStart + 1,
          reason: `段落跨 ${paragraphLines} 行（应一行一段）`,
        });
      }
      paragraphStart = -1;
      paragraphLines = 0;
      lastLineWasEmpty = true;
      continue;
    }

    // 标题、列表项、引用、HTML 标签行
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      /^\d+\.\s/.test(trimmed) ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("<")
    ) {
      if (paragraphLines > 1) {
        violations.push({
          file: relPath,
          line: paragraphStart + 1,
          reason: `段落跨 ${paragraphLines} 行（应一行一段）`,
        });
      }
      paragraphStart = -1;
      paragraphLines = 0;
      lastLineWasEmpty = false;
      continue;
    }

    // 普通段落行
    if (paragraphStart === -1) {
      paragraphStart = i;
      paragraphLines = 1;
    } else {
      if (!lastLineWasEmpty) {
        paragraphLines++;
      } else {
        paragraphStart = i;
        paragraphLines = 1;
      }
    }
    lastLineWasEmpty = false;
  }

  // 文件末尾检查
  if (paragraphLines > 1) {
    violations.push({
      file: relPath,
      line: paragraphStart + 1,
      reason: `段落跨 ${paragraphLines} 行（应一行一段）`,
    });
  }
}

if (violations.length === 0) {
  console.log(`verify-md-wrap: ${uniqueFiles.length} 个文件，一行一段规范通过。`);
  process.exit(0);
}

console.error(`verify-md-wrap: ${violations.length} 个段落问题：\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.reason}`);
}
console.error("");
process.exit(1);
