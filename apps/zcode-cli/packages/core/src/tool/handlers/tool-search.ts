import {
  TOOL_SEARCH_TOOL_NAME,
  ToolSearchInputSchema,
  ToolSearchInputJsonSchema,
  ToolSearchOutputSchema,
  ToolSearchOutputJsonSchema,
  type ToolSearchOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolExecutionContext } from "../types.js";
import { listToolSetDefinitions } from "./load-tool-set.js";

const TOOL_SEARCH_TIMEOUT_MS = 5_000;

async function toolSearchHandler(input: unknown, context: ToolExecutionContext): Promise<ToolSearchOutput> {
  const { query } = ToolSearchInputSchema.parse(input);
  const needle = query?.toLocaleLowerCase() ?? "";
  const results = listToolSetDefinitions()
    .filter(({ spec }) => {
      if (!needle) return true;
      return [spec.id, spec.description, ...spec.keywords, ...spec.tools]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    })
    .map(({ spec, toolNames }) => ({
      id: spec.id,
      description: spec.description,
      keywords: spec.keywords,
      tools: spec.tools,
      loaded: toolNames.every((name) => context.toolSetLoaderPort?.isToolRegistered(name) === true),
    }));
  return { results };
}

export const toolSearchToolEntry: ToolEntry = {
  capability: "Search the catalog of builtin toolsets before calling LoadToolSet",
  metadata: {
    name: TOOL_SEARCH_TOOL_NAME,
    description: "Search available builtin toolsets and return their exact IDs before loading them",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: TOOL_SEARCH_TIMEOUT_MS,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: toolSearchHandler,
  inputSchema: ToolSearchInputJsonSchema,
  outputSchema: ToolSearchOutputJsonSchema,
  runtimeInputSchema: ToolSearchInputSchema,
  runtimeOutputSchema: ToolSearchOutputSchema,
  executionMode: "client",
  permission: {
    permission: "zcode.tool.search",
    reason: "ToolSearch reads the builtin toolset catalog",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  timeout: { defaultMs: TOOL_SEARCH_TIMEOUT_MS, maxMs: TOOL_SEARCH_TIMEOUT_MS, allowCallOverride: false },
  resultBudget: {
    maxInlineBytes: 24_000,
    maxModelBytes: 24_000,
    strategy: "truncate",
    preview: { maxBytes: 24_000, direction: "head" },
  },
  cancellation: { supported: false, cleanup: "none", userVisibleMessage: "ToolSearch cannot be cancelled" },
  trace: { required: true, propagateToAdapters: false, recordInput: "summary", recordOutput: "summary" },
};
