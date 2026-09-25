import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompactPrompt,
  formatCompactSummary,
} from "../src/compact/prompt.js";

test("compact prompt defaults to the V2 handoff ledger", () => {
  const prompt = buildCompactPrompt(undefined);

  assert.match(prompt, /CONTEXT CHECKPOINT COMPACTION/);
  assert.match(prompt, /Stable Project References/);
  assert.match(prompt, /Superseded Information/);
  assert.match(prompt, /exact absolute paths, URLs/);
  assert.doesNotMatch(prompt, /D:\\\\|C:\\\\/);
});

test("V1 remains an explicit rollback prompt", () => {
  const prompt = buildCompactPrompt(undefined, "v1");

  assert.match(prompt, /detailed summary of the conversation/);
  assert.doesNotMatch(prompt, /Stable Project References/);
});

test("custom instructions supplement, rather than replace, V2 rules", () => {
  const prompt = buildCompactPrompt("Use concise wording.");

  assert.match(prompt, /Additional Instructions \(supplement the required format/);
  assert.match(prompt, /Use concise wording\./);
  assert.match(prompt, /Do not silently paraphrase/);

  const v1Prompt = buildCompactPrompt("Use concise wording.", "v1");
  assert.match(v1Prompt, /Additional Instructions:\nUse concise wording\./);
});

test("V2 output remains compatible with the existing summary formatter", () => {
  const summary = formatCompactSummary(
    "<summary>\n## Stable Project References\n- label: <reference-project-path>\n</summary>",
  );

  assert.equal(summary, "Summary:\n## Stable Project References\n- label: <reference-project-path>");
});
