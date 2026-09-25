const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`;

const NO_TOOLS_TRAILER =
  "\n\nREMINDER: Do NOT call any tools. Respond with plain text only — " +
  "an <analysis> block followed by a <summary> block. Tool calls will be rejected and you will fail the task.";

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
   - Note any security-relevant instructions or constraints the user stated (e.g., sensitive files or data to avoid, operations that must not be performed, credential or secret handling rules). These MUST be preserved verbatim in the summary so they continue to apply after compaction.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent. Preserve any security-relevant instructions or constraints verbatim so they remain in effect after compaction.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages:${" "}
    - [Detailed non tool use user message]
    - [...]

7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.${" "}

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>`;

export type CompactPromptVersion = "v1" | "v2";

const V2_COMPACT_PROMPT = `You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

The previous compaction summary, if present in the conversation above, is the authoritative baseline for stable facts. Copy every still-valid stable entry verbatim. Do not silently paraphrase, shorten, normalize, or replace it. Only update a stable entry when newer explicit evidence appears; record the old value and the new evidence under Superseded Information.

Return exactly one outer <summary>...</summary> block and no other XML wrapper. Do not put any unique fact only in hidden reasoning. Do not call tools and do not reproduce full source files or full tool output.

Use this exact structure:

<summary>
## Stable User Preferences
- Preserve exact user preferences, prohibitions, security constraints, and explicit instructions. Quote user wording when it matters.

## Stable Project References
- Preserve exact absolute paths, URLs, repository names, branch names, and reference projects. Never replace a path or URL with a nickname, relative path, or phrase such as "the project".

## Stable Environment Facts
- Preserve exact confirmed OS, workspace, runtime, configuration keys, protocol identifiers, and other facts needed to continue. Mark unknown values as UNVERIFIED.

## Active Requirements and Acceptance Criteria
- Preserve the current requested outcome, scope boundaries, and acceptance criteria. Do not turn optional suggestions into requested work.

## Decisions and Architectural Constraints
- Record decisions that remain in force, their rationale, and boundaries that must not be crossed.

## Current Progress
- Record concrete changes, files, symbols, commands, and the current point of work. Prefer path plus symbol plus behavior over copied source.

## Verification
- Record exact validation commands and their results. Distinguish passed, failed, skipped, and not run.

## Open Issues and Unverified Assumptions
- Record unresolved questions and label every unconfirmed fact UNVERIFIED. Never guess missing paths, versions, or results.

## Superseded Information
- Record explicit changes as old value -> new value and include the evidence or user instruction that caused the change. Do not present superseded decisions as active.

## Explicit Next Action
- State only the work explicitly requested or already in progress. If there is no explicit next action, write "None".
</summary>

Preservation rules:
- Stable User Preferences, Stable Project References, and Stable Environment Facts are a compact ledger: deduplicate them, keep one canonical line per fact, and never drop them to make room for background detail.
- If the previous summary and current workspace or system context disagree, current verified workspace/system facts win; record the correction instead of silently changing history.
- Preserve exact spelling, casing, punctuation, drive letters, and path separators for paths, URLs, identifiers, and configuration keys.
- Summarize completed exploration instead of carrying it forward. Spend the remaining budget on active constraints, decisions, verification, and open issues.
- Do not list every historical user message. Preserve the effective requirement and quote the original wording only when necessary to prevent ambiguity.
- The summary is a handoff record, not a transcript. The next model must continue the explicit task without asking for confirmation or starting optional follow-up work.`;

export function buildCompactPrompt(
  customInstructions: string | undefined,
  version: CompactPromptVersion = "v2",
): string {
  const basePrompt = version === "v2" ? V2_COMPACT_PROMPT : BASE_COMPACT_PROMPT;
  const customInstructionBlock = customInstructions?.trim()
    ? version === "v2"
      ? `\n\nAdditional Instructions (supplement the required format; do not override preservation rules):\n${customInstructions}`
      : `\n\nAdditional Instructions:\n${customInstructions}`
    : "";

  return `${NO_TOOLS_PREAMBLE}${basePrompt}${customInstructionBlock}${NO_TOOLS_TRAILER}`;
}

export function formatCompactSummary(text: string | undefined): string {
  let formatted = text?.trim() ?? "";
  if (!formatted) return "";

  formatted = formatted.replace(/<analysis>[\s\S]*?<\/analysis>/, "");
  const summaryMatch = formatted.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    const summary = summaryMatch[1] || "";
    formatted = formatted.replace(/<summary>[\s\S]*?<\/summary>/, `Summary:\n${summary.trim()}`);
  }

  return formatted.replace(/\n\n+/g, "\n\n").trim();
}

export function buildCompactSummaryMessage(
  summary: string,
  options: {
    recentMessagesPreserved?: boolean;
    replStateCleared?: boolean;
    suppressFollowup?: boolean;
    transcriptPath?: string;
  } = {},
): string {
  let message = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${formatCompactSummary(summary)}`;

  if (options.transcriptPath) {
    message += `\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${options.transcriptPath}`;
  }

  if (options.recentMessagesPreserved) {
    message += "\n\nRecent messages are preserved verbatim.";
  }

  if (options.replStateCleared) {
    message +=
      "\n\nYour REPL VM state has been cleared as part of this compaction. Variables defined in REPL calls before this point are no longer accessible — redefine any you still need.";
  }

  if (options.suppressFollowup) {
    message +=
      '\nContinue the conversation from where it left off without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I\'ll continue" or similar. Pick up the last task as if the break never happened.';
  }

  return message;
}
