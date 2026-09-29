import type {
  ModelSelection,
  PeerSessionCreation,
  ZCodeAgentMcpServer,
  ZCodeProvider,
  ZCodeTaskMode,
} from "@zcode/shared";

/** 创建 task 的稳定服务输入；AI 创建关系只在受信 Host 链路填充。 */
export interface ZCodeTaskCreateParams {
  workspacePath: string;
  workspaceIdentity?: string;
  provider?: ZCodeProvider;
  mode?: ZCodeTaskMode;
  modelSelection?: ModelSelection;
  model?: string;
  thoughtLevel?: string;
  draftSessionId?: string;
  forkedFromTaskId?: string;
  mcpServers?: ZCodeAgentMcpServer[];
  automationId?: string;
  offPeakTaskId?: string;
  deferPersistenceUntilFirstPrompt?: boolean;
  v4Create?: boolean;
  peerSessionRelation?: PeerSessionCreation;
}
