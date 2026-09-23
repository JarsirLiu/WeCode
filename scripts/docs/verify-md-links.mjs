/**
 * Verify that every relative Markdown link in docs/ resolves to an existing file,
 * and that #fragment anchors match a heading slug or explicit <a id> anchor.
 * External URLs, mailto, and data links are skipped.
 */

import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";

const docsRoot = resolve(import.meta.dirname, "../../docs");
const errors = [];

/** Normalize glob output to forward slashes. */
const norm = (p) => p.split(sep).join("/");

/** Markdown link regex: [text](url). */
const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Extract heading text from a markdown heading line. */
function extractHeadings(text) {
  const headings = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) headings.push(m[2].trim());
  }
  return headings;
}

/** Convert heading text to a GitHub-style slug. */
function headingToSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Extract explicit <a id="..."> and <a name="..."> anchors. */
function extractAnchorIds(text) {
  const anchors = [];
  const re = /<a\s+(?:id|name)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(text)) !== null) anchors.push(m[1]);
  return anchors;
}

/** Find all .md files under docs/. */
const mdFiles = globSync("**/*.md", { cwd: docsRoot }).map(norm).sort();

/** Cache target file content for anchor checks. */
const targetCache = new Map();

for (const file of mdFiles) {
  const filePath = resolve(docsRoot, file);
  const content = readFileSync(filePath, "utf8");
  const fileDir = dirname(file);

  // Strip fenced code blocks so links inside examples are not checked.
  let inFence = false;
  const prose = content
    .split("\n")
    .filter((l) => {
      if (l.startsWith("```")) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join("\n");

  // Strip inline code spans.
  const cleaned = prose.replace(/`[^`]*`/g, "");

  let match;
  while ((match = linkRe.exec(cleaned)) !== null) {
    const text = match[1];
    const url = match[2].trim();

    // Skip external URLs.
    if (url.startsWith("http://") || url.startsWith("https://")) continue;
    // Skip anchor-only links (in-page).
    if (url.startsWith("#")) continue;
    // Skip mailto and other protocols.
    if (url.startsWith("mailto:") || url.startsWith("data:")) continue;

    // Extract fragment before stripping.
    const fragment = url.includes("#") ? url.split("#").slice(1).join("#") : "";
    // Strip fragment, title, query.
    let linkPath = url.replace(/\s+"[^"]*"\s*$/, "");
    linkPath = linkPath.split("#")[0];
    linkPath = linkPath.split("?")[0];
    linkPath = linkPath.trim();
    if (!linkPath) continue;

    // Resolve relative to the file's directory.
    const targetPath = resolve(docsRoot, fileDir, linkPath);

    if (!existsSync(targetPath)) {
      errors.push(`${file}: broken link — [${text}](${url})`);
      continue;
    }

    // Anchor validation: only for markdown files with a fragment.
    if (fragment && targetPath.endsWith(".md")) {
      let targetText = targetCache.get(targetPath);
      if (targetText === undefined) {
        try {
          targetText = readFileSync(targetPath, "utf8");
          targetCache.set(targetPath, targetText);
        } catch {
          targetCache.set(targetPath, null);
          targetText = null;
        }
      }
      if (targetText) {
        const slugs = extractHeadings(targetText).map(headingToSlug);
        const anchors = extractAnchorIds(targetText);
        if (!slugs.includes(fragment) && !anchors.includes(fragment)) {
          errors.push(
            `${file}: broken anchor — [${text}](${url}) (target has: ${slugs.slice(0, 5).join(", ")}${slugs.length > 5 ? "…" : ""})`,
          );
        }
      }
    }
  }
}

if (errors.length === 0) {
  console.log(`verify-md-links: ${mdFiles.length} file(s) checked, all links resolve.`);
  process.exit(0);
}

console.error("verify-md-links: broken links found:");
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
