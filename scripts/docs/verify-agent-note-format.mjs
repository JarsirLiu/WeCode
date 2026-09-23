/**
 * Enforce Agent Note headers, lifecycle-specific sections, alternatives, and
 * banned-heading rules. Classification and filenames belong to the sibling tree
 * gate; translation structure belongs to the pairing gate. Exact format and
 * rules live in docs/notes/README.md § The file format.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walkAgentNoteTree, noteRoot } from "./agent-note-tree.mjs";

/** Status-line grammar per lifecycle folder. */
const STATUS = {
  proposed: /^Status: proposed$/,
  implemented: /^Status: implemented$/,
  rejected: /^Status: rejected — .+$/,
};

/** Required `##` headings per lifecycle, beyond the universal `## Problem` opener. */
const REQUIRED = {
  proposed: ["## Proposal", "## Acceptance criteria", "## Risks"],
  implemented: ["## Decision", "## Consequences"],
  rejected: ["## Proposal"],
};

/** Headings banned in `implemented/` — proposal-era spec-speak. */
const BANNED_IMPLEMENTED = /^## (?:Proposal\b|Plan\b|Migration plan\b|Acceptance criteria\b)/i;

/**
 * Required class-specific `##` headings, in addition to lifecycle sections.
 * Applies to `proposed/` and `implemented/` notes only; `rejected/` notes are
 * frozen proposals and exempt. Class is the second path segment.
 */
const CLASS_REQUIRED = {
  feature: ["## Affected surfaces"],
  "bug-fix": ["## Root cause", "## Fix"],
  simplification: ["## What was removed", "## Reintroduction guard"],
  architecture: ["## Module boundary"],
  process: ["## Workflow change"],
  testing: ["## Test scope"],
};

const { notes, errors } = walkAgentNoteTree();

for (const note of notes) {
  const fail = (msg) => errors.push(`format: ${note.rel} — ${msg}`);
  const raw = readFileSync(resolve(noteRoot, note.rel), "utf8");
  const lines = raw.split("\n");

  // Strip fenced code blocks so format tokens inside examples are not document structure.
  let inFence = false;
  const prose = lines.filter((l) => {
    if (l.startsWith("```")) {
      inFence = !inFence;
      return false;
    }
    return !inFence;
  });

  // --- Header block ---

  if (!/^# Agent Note: \S/.test(lines[0] ?? "")) {
    fail("line 1 must be `# Agent Note: <title>`");
  }
  if (lines[1] !== "") fail("line 2 must be blank");

  if (note.lifecycle === "archived") {
    // Archived notes: must be implemented, must have an Archived line.
    if (!/^Status: implemented$/.test(lines[2] ?? "")) {
      fail("archived note must have `Status: implemented`");
    }
    if (lines[3] !== "" && !/^Archived: \d{4}-\d{2}-\d{2}$/.test(lines[3] ?? "")) {
      fail("line 4 must be blank or `Archived: YYYY-MM-DD`");
    }
    // Archived notes are frozen — skip section requirements.
    continue;
  }

  const statusRe = STATUS[note.lifecycle];
  if (statusRe && !statusRe.test(lines[2] ?? "")) {
    fail(`line 3 must match the ${note.lifecycle} status grammar (${statusRe})`);
  }
  if (lines[3] !== "") fail("line 4 must be blank");

  // The Status line must be the only one in the file.
  const statusLines = prose.filter((l) => l.startsWith("Status:") && l !== lines[2]);
  if (statusLines.length > 0) fail("the line-3 `Status:` line must be the only one in the file");

  // --- Section skeleton ---

  const h2s = prose.filter((l) => l.startsWith("## ")).map((l) => l.trimEnd());
  if (h2s[0] !== "## Problem") {
    fail(`the first section must be \`## Problem\` (got ${JSON.stringify(h2s[0] ?? "<none>")})`);
  }

  for (const required of REQUIRED[note.lifecycle] ?? []) {
    if (!h2s.includes(required)) fail(`missing the required \`${required}\` section`);
  }

  // Class-specific sections — required for proposed and implemented, not rejected.
  if (note.lifecycle !== "rejected") {
    const segs = note.rel.split("/");
    const cls = segs[1];
    for (const required of CLASS_REQUIRED[cls] ?? []) {
      if (!h2s.includes(required))
        fail(
          `missing class-specific \`${required}\` section for class "${cls}" (see docs/notes/README.md § Class-specific sections)`,
        );
    }
  }

  if (note.lifecycle === "implemented") {
    for (const h2 of h2s.filter((h) => BANNED_IMPLEMENTED.test(h))) {
      fail(
        `\`${h2}\` is a proposal-era heading; an implemented Agent Note states what is (fold it into Decision/Consequences/Testing)`,
      );
    }
  }

  // Alternatives considered — mandatory.
  if (!h2s.includes("## Alternatives considered")) {
    fail(
      "missing `## Alternatives considered` section (see docs/notes/README.md § The file format)",
    );
  }
}

if (errors.length === 0) {
  console.log(
    `verify-agent-note-format: ${notes.length} note(s) checked, all conform to docs/notes/README.md § The file format.`,
  );
  process.exit(0);
}

console.error("verify-agent-note-format: violations found:");
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
