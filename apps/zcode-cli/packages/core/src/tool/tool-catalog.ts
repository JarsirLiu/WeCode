// ============================================================
// Tool Catalog - Central registry for dynamic tool loading
// ============================================================
// 工具目录层：维护 toolName -> ToolEntry 的映射。
// 职责：提供统一的工具查询接口，与具体工具导入解耦。
// 扩展机制：新增工具时仅需在此注册，LoadToolSet 无需修改。
// 未来可演进为从文件/DB/远程配置加载，策略独立变换。

import type { ToolEntry } from "./types.js";
import { readToolEntry } from "./handlers/read.js";
import { writeToolEntry } from "./handlers/write.js";
import { editToolEntry } from "./handlers/edit.js";
import { bashToolEntry } from "./handlers/bash.js";
import { globToolEntry } from "./handlers/glob.js";
import { grepToolEntry } from "./handlers/grep.js";
import { webFetchToolEntry } from "./handlers/webfetch.js";
import { webSearchToolEntry } from "./handlers/websearch.js";
import { todoReadToolEntry, todoWriteToolEntry } from "./handlers/todo.js";
import { cronCreateToolEntry, cronDeleteToolEntry, cronListToolEntry, cronUpdateToolEntry } from "./handlers/cron.js";
import { offPeakCreateToolEntry, offPeakListToolEntry } from "./handlers/off-peak.js";
import { enterPlanModeToolEntry, exitPlanModeToolEntry } from "./handlers/plan-mode.js";
import { askUserQuestionToolEntry } from "./handlers/ask-user-question.js";
import { botCommandToolEntry } from "./handlers/bot-command.js";
import { compactSessionToolEntry } from "./handlers/compact-session.js";
import { createSessionToolEntry } from "./handlers/create-session.js";
import { readSessionToolEntry } from "./handlers/read-session.js";
import { resolveSessionPermissionToolEntry } from "./handlers/resolve-session-permission.js";
import { sendMessageToolEntry } from "./handlers/send-message.js";
import { sendSessionMessageToolEntry } from "./handlers/send-session-message.js";
import { setSessionModelToolEntry } from "./handlers/set-session-model.js";
import { stopSessionGenerationToolEntry } from "./handlers/stop-session-generation.js";
import { respondToCoordinatorToolEntry } from "./handlers/respond-to-coordinator.js";
import { submitResultToolEntry } from "./handlers/submit-result.js";
import { escalateToolEntry } from "./handlers/escalate.js";
import { resolveWorkflowQuestionToolEntry } from "./handlers/resolve-workflow-question.js";
import { taskOutputToolEntry } from "./handlers/task-output.js";
import { taskStopToolEntry } from "./handlers/task-stop.js";
import { readSessionContextToolEntry } from "./handlers/read-session-context.js";
import { amendWorkflowToolEntry } from "./handlers/amend-workflow.js";
import { createWorkflowToolEntry } from "./handlers/create-workflow.js";
import { saveWorkflowToolEntry } from "./handlers/save-workflow.js";
import { listSavedWorkflowsToolEntry } from "./handlers/list-saved-workflows.js";
import { listModelsToolEntry } from "./handlers/list-models.js";
import { evalWorkflowSnippetToolEntry } from "./handlers/eval-workflow-snippet.js";
import { listWorkflowRunsToolEntry } from "./handlers/list-workflow-runs.js";
import { getWorkflowRunToolEntry } from "./handlers/get-workflow-run.js";
import { resumeWorkflowRunToolEntry } from "./handlers/resume-workflow-run.js";
import { agentToolEntry } from "./handlers/agent.js";
import { taskToolEntry } from "./handlers/agent.js";
import { skillToolEntry } from "./handlers/skill.js";
import { jsToolEntry } from "./handlers/node-repl.js";

/**
 * 全局工具目录：toolName -> ToolEntry 的不可变映射。
 * 这是所有 48 个工具导入的唯一入口。
 *
 * 扩展方式：
 * 1. 新工具提供 ToolEntry 实例时，只需在此导入并注册。
 * 2. 不需修改 LoadToolSet handler 或工具集定义。
 * 3. 工具集的成员关系在 load-tool-set.ts 中声明（纯数据），与此目录解耦。
 *
 * 设计目标：
 * - 确定性：所有工具都可在编译期被发现和验证。
 * - 单点注册：避免工具散落在多个地方而无法追踪。
 * - 策略独立：未来可从文件、DB 或动态构造加载，此接口保持稳定。
 */
const TOOL_CATALOG: Readonly<Record<string, ToolEntry>> = {
  // Core tools (always active)
  Read: readToolEntry,
  Write: writeToolEntry,
  Edit: editToolEntry,
  Bash: bashToolEntry,
  WebFetch: webFetchToolEntry,
  WebSearch: webSearchToolEntry,
  TodoRead: todoReadToolEntry,
  TodoWrite: todoWriteToolEntry,
  Glob: globToolEntry,
  Grep: grepToolEntry,

  // Task control (always active)
  TaskOutput: taskOutputToolEntry,
  TaskStop: taskStopToolEntry,

  // Planning
  EnterPlanMode: enterPlanModeToolEntry,
  ExitPlanMode: exitPlanModeToolEntry,

  // Automation & scheduling
  CronCreate: cronCreateToolEntry,
  CronList: cronListToolEntry,
  CronUpdate: cronUpdateToolEntry,
  CronDelete: cronDeleteToolEntry,
  OffPeakCreate: offPeakCreateToolEntry,
  OffPeakList: offPeakListToolEntry,

  // UI interaction
  AskUserQuestion: askUserQuestionToolEntry,

  // AI Session Orchestration
  CreateSession: createSessionToolEntry,
  SendSessionMessage: sendSessionMessageToolEntry,
  ReadSession: readSessionToolEntry,
  StopSessionGeneration: stopSessionGenerationToolEntry,
  SetSessionModel: setSessionModelToolEntry,
  CompactSession: compactSessionToolEntry,
  ResolveSessionPermission: resolveSessionPermissionToolEntry,

  // Subagent communication
  SendMessage: sendMessageToolEntry,
  Agent: agentToolEntry,
  Task: taskToolEntry,
  RespondToCoordinator: respondToCoordinatorToolEntry,
  submit_result: submitResultToolEntry,
  escalate: escalateToolEntry,

  // Workflow management
  CreateWorkflow: createWorkflowToolEntry,
  AmendWorkflow: amendWorkflowToolEntry,
  SaveWorkflow: saveWorkflowToolEntry,
  EvalWorkflowSnippet: evalWorkflowSnippetToolEntry,
  ListSavedWorkflows: listSavedWorkflowsToolEntry,
  ListWorkflowRuns: listWorkflowRunsToolEntry,
  GetWorkflowRun: getWorkflowRunToolEntry,
  ResumeWorkflowRun: resumeWorkflowRunToolEntry,
  ResolveWorkflowQuestion: resolveWorkflowQuestionToolEntry,
  ListModels: listModelsToolEntry,

  // JavaScript/Node.js runtime
  node_repl: jsToolEntry,

  // Bot command
  BotCommand: botCommandToolEntry,

  // Session context (internal use)
  ReadSessionContext: readSessionContextToolEntry,

  // Skill invocation
  Skill: skillToolEntry,
};

/**
 * 按工具名称查询 ToolEntry。
 * 返回 null 如果工具不存在。
 * 用于 LoadToolSet handler 的核心实现。
 */
export function getToolEntry(toolName: string): ToolEntry | null {
  return TOOL_CATALOG[toolName] || null;
}

/**
 * 批量查询多个工具，返回找到的 ToolEntry 与未找到的名称。
 * 用于 LoadToolSet 报告加载状态。
 */
export function getToolEntries(toolNames: string[]): {
  found: Record<string, ToolEntry>;
  notFound: string[];
} {
  const found: Record<string, ToolEntry> = {};
  const notFound: string[] = [];

  for (const name of toolNames) {
    const entry = getToolEntry(name);
    if (entry) {
      found[name] = entry;
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * 列出所有可用的工具名称。
 * 用于调试、文档生成或发现接口。
 */
export function listAllTools(): readonly string[] {
  return Object.keys(TOOL_CATALOG);
}

/**
 * 检查工具是否存在。
 */
export function hasToolEntry(toolName: string): boolean {
  return toolName in TOOL_CATALOG;
}
