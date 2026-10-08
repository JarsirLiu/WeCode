type DetailField = {
  labelId: string;
  value?: string;
  valueLabelId?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export function readListSessionsInput(input: unknown): {
  primaryText?: string;
  secondaryText?: string;
  fields: DetailField[];
} {
  if (!isRecord(input)) return { fields: [] };

  const workspaceIdentity = readString(input, "workspaceIdentity");
  const workspacePath = readString(input, "workspacePath");
  const includeArchived = input.includeArchived === true;
  const limit = typeof input.limit === "number" && Number.isInteger(input.limit) ? input.limit : 50;
  const fields: DetailField[] = [];

  if (workspaceIdentity) {
    fields.push({
      labelId: "chat.toolCall.sessionOrchestration.field.workspaceIdentity",
      value: workspaceIdentity,
    });
  }
  if (workspacePath) {
    fields.push({ labelId: "chat.toolCall.sessionOrchestration.field.workspacePath", value: workspacePath });
  }
  fields.push({
    labelId: "chat.toolCall.sessionOrchestration.field.includeArchived",
    valueLabelId: includeArchived
      ? "chat.toolCall.sessionOrchestration.yes"
      : "chat.toolCall.sessionOrchestration.no",
  });
  fields.push({ labelId: "chat.toolCall.sessionOrchestration.field.limit", value: String(limit) });

  return {
    primaryText: workspaceIdentity ?? workspacePath,
    secondaryText: workspacePath,
    fields,
  };
}
