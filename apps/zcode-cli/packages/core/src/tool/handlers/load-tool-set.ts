// ============================================================
// LoadToolSet Tool Handler - Dynamic tool group loading
// ============================================================

import {
  LOAD_TOOL_SET_TOOL_NAME,
  LoadToolSetInputJsonSchema,
  LoadToolSetOutputJsonSchema,
  LoadToolSetInputSchema,
  LoadToolSetOutputSchema,
  createCoreError,
  CoreErrorType,
  type LoadToolSetInput,
  type LoadToolSetOutput,
  type ToolSetSpec,
} from "@zcode/contracts";
import type { ToolEntry, ToolExecutionContext } from "../types.js";

/**
 * 内部工具集定义 - 运行时加载的完整工具集规范。
 * 这些定义与 spec 中的 ToolSetLoader 对应，但只包含 spec 部分（不含加载函数）。
 */
const TOOL_SETS: Record<string, { spec: ToolSetSpec; toolNames: string[] }> = {
  core: {
    spec: {
      id: "core",
      description: "Core file/terminal/web operations and task tracking (always active)",
      keywords: ["file", "read", "write", "edit", "bash", "terminal", "web", "fetch", "search", "todo", "task"],
      tools: ["Read", "Write", "Edit", "Bash", "WebFetch", "WebSearch", "TodoRead", "TodoWrite", "Glob", "Grep"],
      defaultEnabled: true,
    },
    toolNames: ["Read", "Write", "Edit", "Bash", "WebFetch", "WebSearch", "TodoRead", "TodoWrite", "Glob", "Grep"],
  },

  "task-control": {
    spec: {
      id: "task-control",
      description: "Background task control (TaskOutput, TaskStop) - always active for main session",
      keywords: ["task", "background", "output", "stop", "control"],
      tools: ["TaskOutput", "TaskStop"],
      defaultEnabled: true,
    },
    toolNames: ["TaskOutput", "TaskStop"],
  },

  plan: {
    spec: {
      id: "plan",
      description: "Planning & reasoning mode (EnterPlanMode, ExitPlanMode)",
      keywords: ["plan", "mode", "enter", "exit", "reasoning"],
      tools: ["EnterPlanMode", "ExitPlanMode", "AskUserQuestion"],
      defaultEnabled: false,
    },
    toolNames: ["EnterPlanMode", "ExitPlanMode", "AskUserQuestion"],
  },

  automation: {
    spec: {
      id: "automation",
      description: "Automation & scheduling (CronCreate, CronList, CronUpdate, CronDelete, OffPeakCreate, OffPeakList)",
      keywords: ["automation", "cron", "schedule", "off-peak", "idle"],
      tools: ["CronCreate", "CronList", "CronUpdate", "CronDelete", "OffPeakCreate", "OffPeakList"],
      defaultEnabled: false,
    },
    toolNames: ["CronCreate", "CronList", "CronUpdate", "CronDelete", "OffPeakCreate", "OffPeakList"],
  },

  session: {
    spec: {
      id: "session",
      description: "AI Session Orchestration (CreateSession, SendSessionMessage, ReadSession, etc.)",
      keywords: ["session", "orchestration", "create", "message", "read", "stop", "model"],
      tools: [
        "CreateSession",
        "SendSessionMessage",
        "ReadSession",
        "StopSessionGeneration",
        "SetSessionModel",
        "CompactSession",
        "ResolveSessionPermission",
        "ListSessions",
      ],
      defaultEnabled: false,
    },
    toolNames: [
      "CreateSession",
      "SendSessionMessage",
      "ReadSession",
      "StopSessionGeneration",
      "SetSessionModel",
      "CompactSession",
      "ResolveSessionPermission",
      "ListSessions",
    ],
  },

  subagent: {
    spec: {
      id: "subagent",
      description: "Subagent control & coordination (Agent, Task, SendMessage, RespondToCoordinator)",
      keywords: ["subagent", "agent", "task", "message", "coordinator"],
      tools: ["Agent", "Task", "SendMessage", "RespondToCoordinator"],
      defaultEnabled: false,
    },
    toolNames: ["Agent", "Task", "SendMessage", "RespondToCoordinator"],
  },

  workflow: {
    spec: {
      id: "workflow",
      description:
        "Dynamic workflow creation & management (CreateWorkflow, AmendWorkflow, SaveWorkflow, ListSavedWorkflows, ListModels, etc.)",
      keywords: ["workflow", "create", "amend", "save", "list", "run", "resume"],
      tools: [
        "CreateWorkflow",
        "AmendWorkflow",
        "SaveWorkflow",
        "ListSavedWorkflows",
        "ListModels",
        "EvalWorkflowSnippet",
        "ListWorkflowRuns",
        "GetWorkflowRun",
        "ResumeWorkflowRun",
        "ResolveWorkflowQuestion",
      ],
      defaultEnabled: false,
    },
    toolNames: [
      "CreateWorkflow",
      "AmendWorkflow",
      "SaveWorkflow",
      "ListSavedWorkflows",
      "ListModels",
      "EvalWorkflowSnippet",
      "ListWorkflowRuns",
      "GetWorkflowRun",
      "ResumeWorkflowRun",
      "ResolveWorkflowQuestion",
    ],
  },

  js: {
    spec: {
      id: "js",
      description: "JavaScript/Node.js REPL (node_repl)",
      keywords: ["javascript", "node", "repl", "js", "execute"],
      tools: ["node_repl"],
      defaultEnabled: false,
    },
    toolNames: ["node_repl"],
  },

  bot: {
    spec: {
      id: "bot",
      description: "Bot command interface (BotCommand)",
      keywords: ["bot", "command", "wechat", "telegram"],
      tools: ["BotCommand"],
      defaultEnabled: false,
    },
    toolNames: ["BotCommand"],
  },
};

/** ToolSearch and LoadToolSet must read the same catalog to keep IDs discoverable. */
export function listToolSetDefinitions(): readonly { spec: ToolSetSpec; toolNames: readonly string[] }[] {
  return Object.values(TOOL_SETS);
}

const MAX_LOAD_TOOL_SET_BYTES = 50_000;
const LOAD_TOOL_SET_TIMEOUT_MS = 5_000;

// LoadToolSet 只把 builtin 工具组注册进当前会话的 registry，不触达工作区/网络/Git，
// 因此 sideEffectScope = "session"。被加载的工具自身各自声明权限与副作用。
export const loadToolSetToolEntry: ToolEntry = {
  capability: "Dynamically load a builtin tool group (plan, automation, workflow, session, etc.) into the current session's tool registry",
  metadata: {
    name: LOAD_TOOL_SET_TOOL_NAME,
    description: "Dynamically load a tool group at runtime",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: LOAD_TOOL_SET_TIMEOUT_MS,
    maxOutputBytes: MAX_LOAD_TOOL_SET_BYTES,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: loadToolSetHandler,
  inputSchema: LoadToolSetInputJsonSchema,
  outputSchema: LoadToolSetOutputJsonSchema,
  runtimeInputSchema: LoadToolSetInputSchema,
  runtimeOutputSchema: LoadToolSetOutputSchema,
  executionMode: "client",
  permission: {
    permission: "zcode.tool.load",
    reason: "LoadToolSet registers builtin tool groups into the session tool registry",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_LOAD_TOOL_SET_BYTES,
    maxModelBytes: MAX_LOAD_TOOL_SET_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_LOAD_TOOL_SET_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: LOAD_TOOL_SET_TIMEOUT_MS,
    maxMs: LOAD_TOOL_SET_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "LoadToolSet was cancelled before the toolset finished loading",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

async function loadToolSetHandler(
  input: unknown,
  context: ToolExecutionContext,
): Promise<LoadToolSetOutput> {
  const parsed = LoadToolSetInputSchema.parse(input) as LoadToolSetInput;
  const toolsetId = parsed.toolset_id;

  const toolsetDef = TOOL_SETS[toolsetId];
  if (!toolsetDef) {
    const availableIds = Object.keys(TOOL_SETS);
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      `Tool set "${toolsetId}" not found. Available tool sets: ${availableIds.join(", ")}`,
      {
        context: {
          toolCallId: context.toolCallId,
          toolName: LOAD_TOOL_SET_TOOL_NAME,
          requestedToolset: toolsetId,
          availableToolsets: availableIds,
        },
        recoverable: true,
      },
    );
  }

  // 检查工具集加载端口是否可用
  if (!context.toolSetLoaderPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      `ToolSetLoaderPort is not available in the current runtime. Dynamic tool loading is not supported in this session.`,
      {
        context: {
          toolCallId: context.toolCallId,
          toolName: LOAD_TOOL_SET_TOOL_NAME,
          requestedToolset: toolsetId,
        },
        recoverable: true,
      },
    );
  }

  const loadedTools: string[] = [];
  const alreadyLoadedTools: string[] = [];
  const notFoundTools: string[] = [];

  // 从工具目录批量查询工具集中的所有工具
  const { getToolEntries } = await import("../tool-catalog.js");
  const { found: toolEntries, notFound } = getToolEntries(toolsetDef.toolNames);

  notFoundTools.push(...notFound);

  // 遍历找到的工具，检查注册状态并加载
  const entriesToRegister: ToolEntry[] = [];

  for (const toolName of Object.keys(toolEntries)) {
    // 检查工具是否已在 registry 中
    if (context.toolSetLoaderPort.isToolRegistered(toolName)) {
      alreadyLoadedTools.push(toolName);
    } else {
      // 工具未加载，收集到待注册列表
      const toolEntry = toolEntries[toolName];
      if (toolEntry) {
        entriesToRegister.push(toolEntry);
        loadedTools.push(toolName);
      }
    }
  }

  // 批量注册新工具
  if (entriesToRegister.length > 0) {
    try {
      context.toolSetLoaderPort.registerTools(entriesToRegister);
      // 注册后失效工具缓存，使模型能看到最新的工具列表
      context.toolSetLoaderPort.invalidateToolCache();
    } catch (err) {
      throw createCoreError(
        CoreErrorType.ToolExecutionFailed,
        `Failed to load toolset "${toolsetId}": ${err instanceof Error ? err.message : String(err)}`,
        {
          context: {
            toolCallId: context.toolCallId,
            toolName: LOAD_TOOL_SET_TOOL_NAME,
            requestedToolset: toolsetId,
            failedToolCount: entriesToRegister.length,
          },
          recoverable: true,
        },
      );
    }
  }

  const totalTools = toolsetDef.toolNames.length;

  return {
    toolset_id: toolsetId,
    toolset_spec: toolsetDef.spec,
    loaded_tools: loadedTools,
    already_loaded_tools: alreadyLoadedTools,
    total_tools: totalTools,
  };
}
