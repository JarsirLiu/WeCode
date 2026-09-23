/**
 * Shared structural source of truth for the Agent Note tree. Lifecycle and class
 * sets are closed under docs/notes/README.md; importing this module is pure.
 */

import { globSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const noteRoot = resolve(import.meta.dirname, "../../docs/notes");

/** The closed set of active Agent Note lifecycles (top-level folders under docs/notes/). */
const LIFECYCLES = ["proposed", "implemented", "rejected"];

/**
 * The closed set of Agent Note classes (nested folder under each lifecycle). Adding a
 * class is a deliberate act: extend this list AND the README's Classification section.
 * The gate rejects any folder not listed here.
 */
export const CLASSES = [
  "feature",
  "bug-fix",
  "simplification",
  "architecture",
  "process",
  "testing",
];

/** Historical implemented notes live outside the active lifecycle tree. */
const ARCHIVE = "archived";

/** Non-Agent Note Markdown allowed to sit directly at a lifecycle root. */
const ROOT_ALLOWLIST = new Set([
  "README.md",
  "README.zh.md",
  "template.md",
  "template.zh.md",
  "AGENTS.md",
]);

/**
 * @typedef {Object} AgentNote
 * @property {string} lifecycle - proposed / implemented / rejected / archived.
 * @property {string} rel - path relative to docs/notes.
 * @property {string} date - `yyyy-mm-dd` from the filename.
 */

/** Normalize glob output to forward slashes. */
const norm = (p) => p.split(sep).join("/");

/** Filename must be yyyy-mm-dd-topic.md. */
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

/**
 * Walk the Agent Note tree, enforcing the structure rules. Returns every valid Agent Note
 * plus one error string per violation (unknown lifecycle or class folder, bad
 * depth, or bad filename). Callers treat a non-empty error list as fatal.
 */
export function walkAgentNoteTree() {
  const notes = [];
  const errors = [];

  // Check top-level directories against the closed lifecycle set.
  for (const entry of readdirSync(noteRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ARCHIVE) continue;
    if (!LIFECYCLES.includes(entry.name)) {
      errors.push(
        `structure: ${entry.name}/ — unknown lifecycle folder (allowed: ${LIFECYCLES.join(", ")}, plus ${ARCHIVE}/)`,
      );
    }
  }

  // Walk each lifecycle folder.
  for (const lifecycle of LIFECYCLES) {
    const matches = globSync(`${lifecycle}/**/*.md`, { cwd: noteRoot }).map(norm).sort();

    for (const match of matches) {
      // Chinese counterparts are the SAME note, indexed via the English filename.
      if (match.endsWith(".zh.md")) continue;

      const segs = match.split("/");
      // Allowlisted file directly at the lifecycle root.
      if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1])) continue;

      const cls = segs[1];
      const base = segs[2];
      if (segs.length !== 3 || !cls || !base) {
        errors.push(
          `structure: ${match} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})`,
        );
        continue;
      }
      if (!CLASSES.includes(cls)) {
        errors.push(
          `structure: ${match} — unknown class folder "${cls}" (allowed: ${CLASSES.join(", ")})`,
        );
        continue;
      }
      if (!FILENAME_RE.test(base)) {
        errors.push(`structure: ${match} — filename must be yyyy-mm-dd-topic.md`);
        continue;
      }
      notes.push({ lifecycle, rel: match, date: base.slice(0, 10) });
    }
  }

  // Walk the archive (only implemented notes can be archived).
  const archiveMatches = globSync(`${ARCHIVE}/**/*.md`, { cwd: noteRoot }).map(norm).sort();
  for (const match of archiveMatches) {
    if (match.endsWith(".zh.md")) continue;
    const segs = match.split("/");
    const cls = segs[1];
    const base = segs[2];
    if (segs.length !== 3 || !cls || !base) {
      errors.push(
        `structure: ${match} — expected archived/{class}/file.md (got depth ${segs.length})`,
      );
      continue;
    }
    if (!CLASSES.includes(cls)) {
      errors.push(
        `structure: ${match} — unknown class folder "${cls}" (allowed: ${CLASSES.join(", ")})`,
      );
      continue;
    }
    if (!FILENAME_RE.test(base)) {
      errors.push(`structure: ${match} — filename must be yyyy-mm-dd-topic.md`);
      continue;
    }
    notes.push({ lifecycle: "archived", rel: match, date: base.slice(0, 10) });
  }

  return { notes, errors };
}

// --- CLI entry ---

const isMain = (() => {
  try {
    return (
      process.argv[1] &&
      resolve(process.argv[1]).replace(/\\/g, "/") ===
        fileURLToPath(import.meta.url).replace(/\\/g, "/")
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  const { notes, errors } = walkAgentNoteTree();
  if (errors.length > 0) {
    console.error("agent-note-tree: violations found:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`agent-note-tree: ${notes.length} note(s) checked, tree structure valid.`);
}
