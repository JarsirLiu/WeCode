// ============================================================
// LoadToolSet Tool - Dynamically load tool groups at runtime
// ============================================================

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const LOAD_TOOL_SET_TOOL_NAME = "LoadToolSet";

/**
 * ToolSetSpec 定义一个工具集：id、描述、包含的工具列表、是否默认启用。
 * 不涉及工具的加载函数——那部分由运行时内部处理。
 */
export const ToolSetSpecSchema = z
  .object({
    id: z.string().min(1).describe("Unique identifier for this tool set"),
    description: z.string().min(1).describe("Human-readable description of what this toolset does"),
    keywords: z
      .array(z.string())
      .describe("Search keywords for discovering this toolset"),
    tools: z
      .array(z.string())
      .describe("List of tool names included in this toolset"),
    defaultEnabled: z
      .boolean()
      .describe("Whether this toolset is loaded by default at session start"),
  })
  .strict();

export type ToolSetSpec = z.infer<typeof ToolSetSpecSchema>;

/**
 * 模型入参：指定要加载的工具集 ID。
 * 没有权限验证字段（不需要批准——工具本身默认就全部可用，动态加载只是补充能力）。
 */
export const LoadToolSetModelInputSchema = z
  .object({
    toolset_id: z
      .string()
      .min(1)
      .describe(
        "The exact ID of one of the available toolsets listed in the tool description.",
      ),
  })
  .strict();

export type LoadToolSetModelInput = z.infer<typeof LoadToolSetModelInputSchema>;

/**
 * 运行时输入：模型面字段。
 * （暂无回填项，保持简洁）
 */
export const LoadToolSetInputSchema = LoadToolSetModelInputSchema.strict();

export type LoadToolSetInput = z.infer<typeof LoadToolSetInputSchema>;

export const LoadToolSetInputJsonSchema = toToolJsonSchema(LoadToolSetModelInputSchema);

/**
 * 输出：加载成功的工具列表与工具集元数据。
 */
export const LoadToolSetOutputSchema = z
  .object({
    toolset_id: z.string().describe("The ID of the loaded toolset"),
    toolset_spec: ToolSetSpecSchema.describe("Metadata about the loaded toolset"),
    loaded_tools: z
      .array(z.string())
      .describe("Names of tools that were successfully loaded"),
    already_loaded_tools: z
      .array(z.string())
      .describe("Names of tools that were already loaded (no-op)"),
    total_tools: z
      .number()
      .int()
      .nonnegative()
      .describe("Total count of tools in this toolset"),
  })
  .strict();

export type LoadToolSetOutput = z.infer<typeof LoadToolSetOutputSchema>;

export const LoadToolSetOutputJsonSchema = toToolJsonSchema(LoadToolSetOutputSchema);

/**
 * 错误输出：工具集不存在或加载失败时的错误信息。
 */
export const LoadToolSetErrorSchema = z
  .object({
    code: z.enum(["TOOLSET_NOT_FOUND", "LOAD_FAILED", "INVALID_TOOLSET_ID"]),
    message: z.string(),
    available_toolsets: z
      .array(z.string())
      .optional()
      .describe("List of available toolset IDs for reference"),
  })
  .strict();

export type LoadToolSetError = z.infer<typeof LoadToolSetErrorSchema>;
