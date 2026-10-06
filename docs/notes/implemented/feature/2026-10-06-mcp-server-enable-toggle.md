# Agent Note: MCP server enable toggle and config display

Status: implemented

English | [中文](2026-10-06-mcp-server-enable-toggle.zh.md)

## Problem

The MCP settings page already had an `mcpEnabled` setting and a generated-config component, but the MCP-specific settings entry did not pass a change callback, leaving the switch disabled and preventing users from controlling config visibility.

## Decision

Reuse `AppSettings.mcpEnabled` as the single owner. Missing values remain enabled for backward compatibility; the setting is persisted through `useSettings().update`. The generated desktop-host configuration is rendered only while enabled.

The MCP client configuration has singleton semantics: its server key is always `wecode`, and the generated JSON contains no random ID or timestamp and is not persisted. Copies placed in multiple external agents are owned by those clients, not separate WeCode instances; when paths change, users replace the existing `wecode` entry with the current JSON.

## Affected surfaces

`packages/ui/src/SettingsPage.tsx`, `packages/ui/src/settings/PluginsSection.tsx`, `packages/ui/src/settings/McpSettingsSection.tsx`, and the MCP feature specification.

## Alternatives considered

**Add a second toggle to the MCP store.** Rejected because it would create a second source of truth and could diverge from global settings.

**Generate the configuration in the UI.** Rejected because the desktop host must resolve the runtime-specific executable and CLI path.

## Consequences

The switch is interactive and persists across restarts; disabling it hides the copyable configuration. WeCode does not keep configuration history or an instance list. A configuration already copied into an external client cannot be revoked remotely; runtime authorization remains a later server-side gate.

## Follow-up Boundary

This note does not treat the settings-page toggle as a complete MCP service switch. The release proposal now requires the standalone stdio adapter to connect to or start the local Host, replace the stub tool handler, ship with an independent launcher/Node runtime, and reject new connections and calls at the Host runtime after disable. Electron is development compatibility plumbing only and must not appear in the released external-agent configuration.
