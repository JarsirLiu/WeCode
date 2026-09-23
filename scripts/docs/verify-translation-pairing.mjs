/**
 * Enforce complete English/Chinese pairs with matching H2 section structure and
 * language switcher links for every Agent Note and root-level doc under docs/notes/.
 * Translation quality remains a review responsibility.
 * See docs/notes/README.md § Chinese counterparts.
 */

import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve, basename, sep } from "node:path";
import { noteRoot } from "./agent-note-tree.mjs";

const errors = [];

/** Normalize glob output to forward slashes. */
const norm = (p) => p.split(sep).join("/");

/** Extract H2 headings from prose, skipping fenced code blocks and inline code. */
function extractH2(content) {
  const lines = content.split("\n");
  let inFence = false;
  const h2s = [];
  for (const l of lines) {
    if (l.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (l.startsWith("## ")) h2s.push(l.trimEnd());
  }
  return h2s;
}

/** Check if content contains a markdown link to the target filename. */
function hasLinkTo(content, target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match ](…target with optional anchor or query after.
  return new RegExp(`\\]\\([^)#]*${escaped}[\\s#)]`).test(content);
}

// Discover all Markdown files under docs/notes/.
const allMd = globSync("**/*.md", { cwd: noteRoot })
  .map(norm)
  .filter((p) => !p.endsWith(".zh.md"))
  .sort();

const allZh = globSync("**/*.zh.md", { cwd: noteRoot }).map(norm).sort();

// 1. Every non-.zh.md file must have a Chinese counterpart.
for (const md of allMd) {
  const zh = md.replace(/\.md$/, ".zh.md");
  if (!existsSync(resolve(noteRoot, zh))) {
    errors.push(`${md}: in-scope documentation must pair bilingual; add counterpart ${zh}`);
  }
}

// 2. Every .zh.md must have an English counterpart (catch half-deleted pairs).
for (const zh of allZh) {
  const md = zh.replace(/\.zh\.md$/, ".md");
  if (!existsSync(resolve(noteRoot, md))) {
    errors.push(`${zh}: missing English counterpart ${md}`);
  }
}

// 3. For each complete pair, check structure and language switcher links.
let pairsChecked = 0;
for (const md of allMd) {
  const zh = md.replace(/\.md$/, ".zh.md");
  if (!existsSync(resolve(noteRoot, zh))) continue;

  const enContent = readFileSync(resolve(noteRoot, md), "utf8");
  const zhContent = readFileSync(resolve(noteRoot, zh), "utf8");

  const enH2 = extractH2(enContent);
  const zhH2 = extractH2(zhContent);

  // Same number of H2 sections.
  if (enH2.length !== zhH2.length) {
    errors.push(`${md} ↔ ${zh}: H2 section count mismatch (${enH2.length} vs ${zhH2.length})`);
  }

  // Language switcher: .zh.md must link back to .md.
  const mdBase = basename(md);
  if (!hasLinkTo(zhContent, mdBase)) {
    errors.push(`${zh}: missing language switcher link to ${mdBase}`);
  }

  // Language switcher: .md must link to .zh.md.
  const zhBase = basename(zh);
  if (!hasLinkTo(enContent, zhBase)) {
    errors.push(`${md}: missing language switcher link to ${zhBase}`);
  }

  pairsChecked++;
}

if (errors.length === 0) {
  console.log(`verify-translation-pairing: ${pairsChecked} pair(s) checked, all consistent.`);
  process.exit(0);
}

console.error(
  "verify-translation-pairing: bilingual pairing violations (see docs/notes/README.md § Chinese counterparts):",
);
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
