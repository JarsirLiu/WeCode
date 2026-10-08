// 会话编排工具专属 UI 的守卫测试：
// 1. 七个工具统一解析到 session-orchestration family 并命中专属 renderer；
// 2. 其他工具（Bash/Read/Skill）的 renderer 选择不受影响（隔离边界）；
// 3. 三连链路的 SessionBot 聚合不受影响，未聚合链路回落到逐行专属卡而非 raw JSON 兜底。
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolCallRow } from "@zcode/shared/zcode-protocol-v4";
import { resolveToolCallRenderer } from "@/ToolCallBlocks/resolveRenderer.js";
import { ExecuteToolCallBlock } from "@/ToolCallBlocks/renderers/execute.js";
import { ReadToolCallBlock } from "@/ToolCallBlocks/renderers/read.js";
import {
  readOutputFields,
  SessionOrchestrationToolCallBlock,
} from "@/ToolCallBlocks/renderers/session-orchestration.js";
import { readListSessionsInput } from "@/ToolCallBlocks/renderers/session-orchestration-list-sessions.js";
import { SkillToolCallBlock } from "@/ToolCallBlocks/renderers/skill.js";
import { ToolDiscoveryToolCallBlock } from "@/ToolCallBlocks/renderers/tool-discovery.js";
import type { ToolCallBlockRenderContext } from "@/ToolCallBlocks/fileSummaryTypes.js";
import { resolveToolCallIdentity } from "@/lib/toolIdentity.js";
import type { ToolDisplayModel } from "@/lib/toolDisplay.js";
import { buildSessionBotWorkItem } from "@/v4/sessionBotWorkItem.js";

const SESSION_TOOL_NAMES = [
  "CreateSession",
  "ReadSession",
  "SendSessionMessage",
  "StopSessionGeneration",
  "SetSessionModel",
  "CompactSession",
  "ResolveSessionPermission",
  "WorkspaceList",
  "ListSessions",
  "workspace_list",
  "list_sessions",
] as const;
const DISCOVERY_TOOL_NAMES = ["ToolSearch", "LoadToolSet", "tool_search", "load_tool_set"] as const;

const displayModel: ToolDisplayModel = {
  inlinePreview: { type: "none" },
  planResult: null,
  viewerSource: null,
  viewerLabelId: "codeViewer.viewCode",
  showSummaryFileLink: false,
  showInput: true,
  showOutput: true,
  showKind: false,
};

function contextFor(toolCall: Record<string, unknown>): ToolCallBlockRenderContext {
  return {
    toolCallNode: {
      toolCall,
      childToolCalls: [],
    } as ToolCallBlockRenderContext["toolCallNode"],
    workspacePath: "/example/workspace",
    displayModel,
    viewerSource: null,
    rawFileSummaries: [],
    isRunning: false,
    statusLabel: "",
    childToolList: null,
  } as ToolCallBlockRenderContext;
}

function toolCallFor(toolName: string): Record<string, unknown> {
  return {
    toolId: `tool-${toolName}`,
    toolName,
    kind: toolName,
    title: toolName,
    status: "completed",
    input: { taskId: "task-1", sessionId: "task-1" },
    output: "{}",
    raw: {},
  };
}

test("session orchestration tool ui: resolves every session orchestration tool to the dedicated family", () => {
  for (const toolName of SESSION_TOOL_NAMES) {
    const identity = resolveToolCallIdentity({ toolName });
    assert.equal(identity.family, "session-orchestration");
    assert.equal(identity.isLegacy, false);
  }
});

test("session orchestration tool ui: renders session orchestration tools with the dedicated card", () => {
  for (const toolName of SESSION_TOOL_NAMES) {
    const renderer = resolveToolCallRenderer(contextFor(toolCallFor(toolName)));
    assert.equal(renderer, SessionOrchestrationToolCallBlock);
  }
});

test("session orchestration tool ui: projects ListSessions results into readable session rows", () => {
  const fields = readOutputFields({
    toolId: "list-sessions",
    toolName: "ListSessions",
    status: "completed",
    input: {},
    output: JSON.stringify({
      sessions: [
        {
          sessionId: "sess_123",
          title: "Investigate auth",
          status: "completed",
          mode: "build",
          workspacePath: "D:/work/demo",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }),
    raw: {},
  } as never);

  assert.deepEqual(fields, [
    { labelId: "chat.toolCall.sessionOrchestration.field.sessions", value: "1" },
    {
      labelId: "chat.toolCall.sessionOrchestration.field.sessionItem",
      value: "Investigate auth · sess_123 · completed",
    },
  ]);
});

test("session orchestration tool ui: projects ListSessions target and effective query defaults", () => {
  assert.deepEqual(readListSessionsInput({ workspaceIdentity: "remote:project" }), {
    primaryText: "remote:project",
    secondaryText: undefined,
    fields: [
      {
        labelId: "chat.toolCall.sessionOrchestration.field.workspaceIdentity",
        value: "remote:project",
      },
      {
        labelId: "chat.toolCall.sessionOrchestration.field.includeArchived",
        valueLabelId: "chat.toolCall.sessionOrchestration.no",
      },
      { labelId: "chat.toolCall.sessionOrchestration.field.limit", value: "50" },
    ],
  });

  assert.deepEqual(readListSessionsInput({
    workspaceIdentity: "local:demo",
    workspacePath: "D:/work/demo",
    includeArchived: true,
    limit: 12,
  }), {
    primaryText: "local:demo",
    secondaryText: "D:/work/demo",
    fields: [
      {
        labelId: "chat.toolCall.sessionOrchestration.field.workspaceIdentity",
        value: "local:demo",
      },
      {
        labelId: "chat.toolCall.sessionOrchestration.field.workspacePath",
        value: "D:/work/demo",
      },
      {
        labelId: "chat.toolCall.sessionOrchestration.field.includeArchived",
        valueLabelId: "chat.toolCall.sessionOrchestration.yes",
      },
      { labelId: "chat.toolCall.sessionOrchestration.field.limit", value: "12" },
    ],
  });
});

test("session orchestration tool ui: projects WorkspaceList results into readable workspace rows", () => {
  const fields = readOutputFields({
    toolId: "workspace-list",
    toolName: "WorkspaceList",
    status: "completed",
    input: {},
    output: JSON.stringify({
      workspaces: [
        {
          workspaceIdentity: "local:demo",
          workspacePath: "D:/work/demo",
          label: "Demo",
          kind: "local",
          workspacePurpose: "project",
          lastConnectionStatus: "connected",
        },
      ],
    }),
    raw: {},
  } as never);

  assert.deepEqual(fields, [
    { labelId: "chat.toolCall.sessionOrchestration.field.workspaces", value: "1" },
    {
      labelId: "chat.toolCall.sessionOrchestration.field.workspaceItem",
      value: "Demo · local:demo · local · D:/work/demo · project · connected",
    },
  ]);
});

test("tool discovery ui: keeps current loader and historical search calls on the dedicated card", () => {
  for (const toolName of DISCOVERY_TOOL_NAMES) {
    const identity = resolveToolCallIdentity({ toolName });
    assert.equal(identity.family, "tool-discovery");
    assert.equal(
      resolveToolCallRenderer(contextFor(toolCallFor(toolName))),
      ToolDiscoveryToolCallBlock,
    );
  }
});

test("session orchestration tool ui: keeps other tools on their own renderers (isolation)", () => {
  assert.equal(resolveToolCallRenderer(contextFor(toolCallFor("Bash"))), ExecuteToolCallBlock);
  assert.equal(resolveToolCallRenderer(contextFor(toolCallFor("Read"))), ReadToolCallBlock);
  assert.equal(resolveToolCallRenderer(contextFor(toolCallFor("Skill"))), SkillToolCallBlock);
});

test("session orchestration tool ui: still groups the complete three-step chain and leaves partial chains to per-row cards", () => {
  const row = (rowId: number, toolName: string): ToolCallRow =>
    ({
      kind: "toolCall",
      rowId,
      toolCallId: `tool-${rowId}`,
      toolName,
      status: "success",
      input: {},
      inputText: "",
      startedAt: 1,
    }) as ToolCallRow;

  const complete = buildSessionBotWorkItem([
    row(1, "CreateSession"),
    row(2, "ReadSession"),
    row(3, "SendSessionMessage"),
  ]);
  assert.equal(complete?.kind, "sessionBot");

  // 不完整链路不聚合：两条行各自走 session-orchestration 专属卡，不进 raw JSON 兜底。
  assert.equal(buildSessionBotWorkItem([row(1, "CreateSession"), row(2, "ReadSession")]), null);
});
