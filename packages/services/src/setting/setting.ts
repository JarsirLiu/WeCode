import type { AppSettings } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface WorkspaceSummary {
  kind: "local" | "remote";
  workspacePath: string;
  workspaceIdentity?: string;
  label: string;
  workspacePurpose?: string;
  lastConnectionStatus?: "connected" | "failed";
}

export interface ISettingService {
  get(): Promise<AppSettings>;
  /** Read the Host-owned local/remote workspace index for external clients. */
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  update(
    patch: Partial<AppSettings>,
    expectedAccountSettings?: Pick<
      AppSettings,
      "providerFamilyDomain" | "providerFamilyConnectionSelections"
    >,
  ): Promise<void>;
  /** Change the data base directory: copy data from old → new location, then persist the setting. */
  updateDataBaseDir(newDir: string | undefined): Promise<void>;
  ensureDefaultProject(homedir: string): Promise<{ path: string; created: boolean }>;
}

export const ISettingService = createServiceDescriptor<ISettingService>(ServiceChannels.Setting);
