// ============================================================
// ZCodeSessionPort Adapter — 将 IZCodeSessionService 适配为 ZCodeSessionPort
// ============================================================
//
// 用于 Host 侧：把 ServiceCollection 里的 IZCodeSessionService 实现转成协议层可用的端口。

import type { IZCodeSessionService } from "./zcodeSession.js";
import type { ZCodeSessionPort } from "@zcode/contracts";
import type {
  ZCodeSessionMode,
  ZCodeSessionStateSnapshot,
  ZCodeWorkspacePresentation,
  ModelSelection,
  ZCodeMessageWithParts,
  ZCodeSessionEvent,
  ZCodeStateUpdatedNotification,
  ZCodePermissionRequestParams,
  ZCodeUserInputRequestParams,
  ZCodeUserInputResponse,
  ZCodeSessionInfo,
  ZCodeSessionPersistence,
  ZCodeSessionImportHistory,
  ZCodeAgentMcpServer,
  TraceId,
  ZCodeDeliveryKind,
} from "@zcode/shared";

export function createZCodeSessionPortAdapter(deps: {
  readSessionService(): IZCodeSessionService | undefined;
}): ZCodeSessionPort {
  const getService = () => {
    const svc = deps.readSessionService();
    if (!svc) throw new Error("IZCodeSessionService unavailable");
    return svc;
  };

  return {
    // ---- Workspace ----
    initializeWorkspace: (params) => getService().initializeWorkspace(params),
    getWorkspaceRuntimeIdentity: (params) => getService().getWorkspaceRuntimeIdentity(params),
    readWorkspacePresentation: (params) => getService().readWorkspacePresentation(params),

    // ---- Session 生命周期 ----
    createSession: (params) => getService().createSession(params),
    resumeSession: (params) => getService().resumeSession(params),
    listSessions: (params) => getService().listSessions(params),
    readSession: (params) => getService().readSession(params),
    readSessionMessages: (params) => getService().readSessionMessages(params),
    readSessionEvents: (params) => getService().readSessionEvents(params),
    promoteDeferredDraftSession: (params) => getService().promoteDeferredDraftSession(params),
    closeSession: (params) => getService().closeSession(params),
    closeDeferredDraftSession: (params) => getService().closeDeferredDraftSession(params),

    // ---- 配置 ----
    setModel: (params) => getService().setModel(params),
    setThoughtLevel: (params) => getService().setThoughtLevel(params),
    setMode: (params) => getService().setMode(params),
  };
}