/**
 * 执行上下文构建器 — 负责组装 ToolExecutionContext 的所有字段。
 * 这是一个纯构建函数，无副作用，便于测试和独立维护。
 */

import type {
  SessionEvent,
  ToolExecutionContext,
} from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { resolveEmbeddedSearchBranchCapability } from "../../embedded-search/capability.js";
import { createToolModelStatusSink, withDefaultToolModelStatusSink } from "./model-status-sink.js";
import type { ToolExecutionSpanWriter } from "@zcode/contracts";
import type { SkillTelemetryMetadata } from "@zcode/contracts";
import type { ExecutableToolCall } from "../types.js";

export interface ExecutionContextBuilderInput {
  canonicalToolCall: ExecutableToolCall;
  toolCallId: string;
  telemetry?: ToolExecutionSpanWriter;
  automationTurn?: boolean;
  offPeakTurn?: boolean;
  traceContext: any; // TraceContext
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  executionAbortController: AbortController;
  startTime: number;
  turnId?: string;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  deps: ToolExecutorDeps;
  // 状态回调，用于更新 call-runner.ts 中的本地变量
  onReadFileStateMetadata?: (metadata: any) => void;
  onSkillTelemetryMetadata?: (metadata: SkillTelemetryMetadata) => void;
}

export function buildExecutionContext(input: ExecutionContextBuilderInput): ToolExecutionContext {
  const { deps, canonicalToolCall, toolCallId, traceContext, traceId, spanId, parentSpanId,
    executionAbortController, telemetry, automationTurn, offPeakTurn, emitEvent, startTime, turnId,
    onReadFileStateMetadata, onSkillTelemetryMetadata } = input;

  const model = deps.model;
  const bashShellSelection = deps.getBashShellSelection?.() ?? deps.bashShellSelection;
  const embeddedSearchDecision = resolveEmbeddedSearchBranchCapability({
    bashAvailable: deps.registry.has("Bash"),
  });

  return {
    toolCallId,
    telemetry,
    automationTurn,
    offPeakTurn,
    traceContext,
    traceId,
    spanId,
    parentSpanId,
    abortSignal: executionAbortController.signal,
    backgroundTaskControlPort: deps.backgroundTaskControlPort,
    emitEvent,
    executionPort: deps.executionPort,
    browserControlPort: deps.browserControlPort,
    botsServicePort: deps.botsServicePort,
    zcodeTaskPort: deps.zcodeTaskPort,
    zcodeSessionPort: deps.zcodeSessionPort,
    zcodePermissionPort: deps.zcodePermissionPort,
    browserDocumentationRoot: deps.browserDocumentationRoot,
    fileSystemPort: deps.fileSystemPort,
    httpClientPort: deps.httpClientPort,
    imageProcessorPort: deps.imageProcessorPort,
    pdfDocumentPort: deps.pdfDocumentPort,
    model: withDefaultToolModelStatusSink(
      model,
      createToolModelStatusSink({ emitEvent, sessionId: deps.sessionId, turnId, traceId }),
    ),
    subagentModelOverride: deps.subagentModelOverride,
    embeddedSearch: {
      ...(deps.embeddedSearchBackend ? { backend: deps.embeddedSearchBackend } : {}),
      enabled: embeddedSearchDecision?.useEmbeddedSearchBranch ?? false,
      ...(deps.nativeSearchEnhancementsEnabled === false ? { findAndGrepEnabled: false } : {}),
    },
    skillPort: deps.skillPort,
    subagentPort: deps.subagentPort,
    coordinatorResponsePort: deps.coordinatorResponsePort,
    workflowSubmitPort: deps.workflowSubmitPort,
    workflowEscalatePort: deps.workflowEscalatePort,
    artifactStore: deps.artifactStore,
    automationPort: deps.automationPort,
    offPeakPort: deps.offPeakPort,
    sessionStore: deps.sessionStore,
    sessionModePort: deps.sessionModePort,
    workflowPort: deps.workflowPort,
    dynamicWorkflowRunPort: deps.dynamicWorkflowRunPort,
    dynamicWorkflowSnippetPort: deps.dynamicWorkflowSnippetPort,
    modelCatalogPort: deps.modelCatalogPort,
    toolSetLoaderPort: deps.toolSetLoaderPort,
    runtimeTaskRegistry: deps.runtimeTaskRegistry,
    readFileState: deps.readFileState,
    recordReadFileStateMetadata: (metadata) => {
      onReadFileStateMetadata?.(metadata);
    },
    recordSkillTelemetryMetadata: (metadata: SkillTelemetryMetadata) => {
      onSkillTelemetryMetadata?.(metadata);
    },
    bashShellSelection,
    setWorkingDirectory: deps.setWorkingDirectory,
    workingDirectory: deps.getWorkingDirectory(),
    workspaceRoot: deps.getWorkspaceRoot(),
    workspaceIdentity: deps.workspaceIdentity,
    remoteSessionId: deps.remoteSessionId,
    clientMode: deps.clientMode,
    deliveryKind: deps.deliveryKind,
    memoryRoot: deps.getMemoryRoot?.(),
    runtimeScope: deps.runtimeScope,
    providerVisibleToolNames: deps.registry
      .list()
      .filter((name) => deps.registry.getMetadata(name)?.providerVisible !== false),
    sessionId: deps.sessionId,
    turnId,
  };
}

