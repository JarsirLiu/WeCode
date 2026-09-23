/**
 * Reminder: consider writing an Agent Note when source files change.
 * Warns but does not block. Zero dependencies, only Node built-ins.
 *
 * 用法：node scripts/docs/verify-agent-note-reminder.mjs
 */

import { execSync } from "node:child_process";

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
    });
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const stagedFiles = getStagedFiles();

const hasSrcChanges = stagedFiles.some(
  (f) =>
    (f.endsWith(".ts") || f.endsWith(".tsx")) &&
    (f.startsWith("packages/") || f.startsWith("apps/")),
);

if (!hasSrcChanges) process.exit(0);

const hasNoteChanges = stagedFiles.some(
  (f) =>
    f.startsWith("docs/notes/proposed/") ||
    f.startsWith("docs/notes/implemented/") ||
    f.startsWith("docs/notes/rejected/"),
);

if (hasNoteChanges) process.exit(0);

console.log("");
console.log("  Reminder: source files changed but no Agent Note found.");
console.log("  If this change involves a decision, architecture change,");
console.log("  or behavior change, consider adding an Agent Note under");
console.log("  docs/notes/. See docs/notes/README.md for format rules.");
console.log("");

process.exit(0);
