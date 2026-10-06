import type { ISettingService } from "../setting/setting.js";
import type { WorkspaceIndexServiceExecutor } from "./workspaceIndexServiceExecutor.js";

export function createWorkspaceIndexServiceExecutor(options: {
  readSettingService: () => ISettingService | undefined;
}): WorkspaceIndexServiceExecutor {
  return {
    listWorkspaces: async () => {
      const service = options.readSettingService();
      if (!service) throw new Error("Host workspace index service not available");
      return service.listWorkspaces();
    },
  };
}
