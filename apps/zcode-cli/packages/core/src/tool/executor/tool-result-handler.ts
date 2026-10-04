/**
 * 工具成功结果处理 — 负责序列化、hook 处理和结果构建的逻辑。
 * 这是一个独立的职责块，便于测试和维护。
 */

import type { ToolEntry, ToolExecutionResult } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import {
  OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
  attestOfficialCuaFrameContent,
} from "@zcode/zcode-cua/frame-contract";
import { createCoreError, CoreErrorType } from "@zcode/contracts";
import { createToolResultDisplay } from "./result-display.js";
import {
  appendHookAdditionalContexts,
  serializeOutput,
} from "./result-serialization.js";
import {
  runPostToolUseHooks,
} from "./hook-flow.js";
import { mergeToolExecutionTelemetry, readToolExecutionTelemetry } from "../handlers/tool-perf.js";
import { withTerminalToolTurnStop } from "./turn-control.js";
import {
  emitToolCallResult,
} from "./events.js";
import { resolveModelOutputEntry } from "./model-output-entry.js";
import type { ExecutableToolCall } from "../types.js";
import type { SkillTelemetryMetadata } from "@zcode/contracts";

export interface ToolSuccessResultHandlerInput {
  deps: ToolExecutorDeps;
  entry: ToolEntry;
  canonicalToolCall: ExecutableToolCall;
  output: unknown;
  executionInput: unknown;
  preToolHookResult: any;
  traceContext: any;
  turnId?: string;
  executionAbortController: AbortController;
  startTime: number;
  totalStartedAt: number;
  durationMs: number;
  permissionWaitMs: number;
  readFileStateMetadata?: ToolExecutionResult["readFileStateMetadata"];
  skillTelemetryMetadata?: SkillTelemetryMetadata;
}

export async function handleToolSuccessResult(
  input: ToolSuccessResultHandlerInput,
): Promise<ToolExecutionResult> {
  const {
    deps,
    entry,
    canonicalToolCall,
    output,
    executionInput,
    preToolHookResult,
    traceContext,
    turnId,
    executionAbortController,
    startTime,
    totalStartedAt,
    durationMs,
    permissionWaitMs,
    readFileStateMetadata,
    skillTelemetryMetadata,
  } = input;

  // 序列化输出
  const modelOutputEntry = resolveModelOutputEntry(entry, output);
  let serialization = await serializeOutput(
    deps,
    output,
    modelOutputEntry,
    traceContext,
    canonicalToolCall.id,
    executionAbortController.signal,
  );

  // 运行 PostToolUse hook
  const postToolHookResult = await runPostToolUseHooks(
    deps,
    canonicalToolCall,
    executionInput,
    output,
    serialization.artifactPath,
    traceContext,
    undefined,
  );

  // 追加 hook 上下文
  serialization = appendHookAdditionalContexts(
    serialization,
    [...preToolHookResult.additionalContexts, ...postToolHookResult.additionalContexts],
    modelOutputEntry,
  );

  // 创建展示信息
  const display = createToolResultDisplay(canonicalToolCall.name, output, {
    mcp: entry.metadata.mcpPresentation,
    officialCua: entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
  });

  // 合并性能数据
  const perf = mergeToolExecutionTelemetry(readToolExecutionTelemetry(output), {
    permissionWaitMs,
    totalMs: Date.now() - totalStartedAt,
  });

  // 处理最终模型内容
  const finalModelContent = serialization.modelContent ?? serialization.content;
  const modelContentProtection = modelOutputEntry.modelContentProtection
    ? attestOfficialCuaFrameContent(finalModelContent, modelOutputEntry.modelContentProtection)
    : undefined;

  if (
    modelOutputEntry.modelContentProtection &&
    Array.isArray(finalModelContent) &&
    finalModelContent.some((block: any) => block.type === "image") &&
    !modelContentProtection
  ) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "Official CUA frame failed final model-content attestation",
      { recoverable: true },
    );
  }

  // 构建结果
  const result: ToolExecutionResult = withTerminalToolTurnStop(
    {
      toolCallId: canonicalToolCall.id,
      toolName: canonicalToolCall.name,
      success: true,
      output,
      display,
      modelContent: finalModelContent,
      ...(readFileStateMetadata ? { readFileStateMetadata } : {}),
      performance: perf,
      serialization,
      durationMs,
      startedAt: new Date(startTime),
      completedAt: new Date(),
    },
    { entry },
  );

  // 发出结果事件
  await emitToolCallResult(
    deps,
    canonicalToolCall,
    traceContext,
    turnId,
    serialization,
    durationMs,
    display,
    perf,
    skillTelemetryMetadata,
  );

  return result;
}
