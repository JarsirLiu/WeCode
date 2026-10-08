import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const TOOL_SEARCH_TOOL_NAME = "ToolSearch";

export const ToolSearchInputSchema = z
  .object({
    query: z.string().trim().optional().describe("Optional words to match against toolset IDs, names, descriptions, and keywords"),
  })
  .strict();

export type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>;
export const ToolSearchInputJsonSchema = toToolJsonSchema(ToolSearchInputSchema);

export const ToolSearchResultSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    keywords: z.array(z.string()),
    tools: z.array(z.string()),
    loaded: z.boolean(),
  })
  .strict();

export const ToolSearchOutputSchema = z.object({ results: z.array(ToolSearchResultSchema) }).strict();
export type ToolSearchOutput = z.infer<typeof ToolSearchOutputSchema>;
export const ToolSearchOutputJsonSchema = toToolJsonSchema(ToolSearchOutputSchema);
