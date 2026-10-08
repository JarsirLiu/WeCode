type DetailField = { labelId: string; value?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export function readWorkspaceOutputFields(parsed: unknown): DetailField[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.workspaces)) return [];
  const fields: DetailField[] = [
    { labelId: "chat.toolCall.sessionOrchestration.field.workspaces", value: String(parsed.workspaces.length) },
  ];
  for (const item of parsed.workspaces) {
    if (!isRecord(item)) continue;
    const workspacePath = readString(item, "workspacePath");
    const workspaceIdentity = readString(item, "workspaceIdentity") ?? workspacePath;
    const value = [
      readString(item, "label") ?? workspaceIdentity,
      workspaceIdentity,
      readString(item, "kind"),
      workspacePath,
      readString(item, "workspacePurpose"),
      readString(item, "lastConnectionStatus"),
    ].filter(Boolean).join(" · ");
    if (value) fields.push({ labelId: "chat.toolCall.sessionOrchestration.field.workspaceItem", value });
  }
  return fields;
}
