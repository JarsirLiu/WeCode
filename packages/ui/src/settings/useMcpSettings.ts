/**
 * MCP Settings Hook
 *
 * Encapsulates MCP-related state and callbacks for the settings page.
 */
import { useCallback } from "react";
import type { AppSettings } from "@zcode/shared";
import { runSettingsActionAsync } from "@/lib/userActionTraceCatalog.js";

export interface UseMcpSettingsResult {
  mcpEnabled: boolean;
  handleMcpEnabledChange: (enabled: boolean) => Promise<void>;
}

export function useMcpSettings(
  sharedSettings: AppSettings | null | undefined,
  updateSharedSettings: (settings: Partial<AppSettings>) => Promise<void>,
): UseMcpSettingsResult {
  const mcpEnabled = sharedSettings?.mcpEnabled !== false;

  const handleMcpEnabledChange = useCallback(
    async (enabled: boolean) => {
      await runSettingsActionAsync({
        featureId: "settings.mcp",
        action: "toggle_mcp",
        trigger: "switch",
        operation: () => updateSharedSettings({ mcpEnabled: enabled }),
        completed: {
          resultSource: "shared_settings",
          stateAfter: enabled ? "enabled" : "disabled",
        },
      });
    },
    [updateSharedSettings],
  );

  return { mcpEnabled, handleMcpEnabledChange };
}
