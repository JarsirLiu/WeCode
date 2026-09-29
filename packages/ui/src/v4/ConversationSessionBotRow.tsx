import { TID_V4_ROW, testId } from "@zcode/shared";
import { SessionBotToolCallBlock } from "@/ToolCallBlocks/renderers/session-bot.js";
import type { SessionBotWorkItem } from "@/v4/sessionBotWorkItem.js";

export function ConversationSessionBotRow({ item }: { item: SessionBotWorkItem }) {
  return (
    <div
      data-row-id={item.rowId}
      data-conversation-selectable="true"
      data-testid={testId(TID_V4_ROW, String(item.rowId))}
    >
      <SessionBotToolCallBlock item={item} />
    </div>
  );
}
