import assert from "node:assert/strict";
import test from "node:test";
import { appSettingsSchema } from "@zcode/shared";

test("MCP setting defaults to enabled for existing users", () => {
  assert.equal(appSettingsSchema.parse({}).mcpEnabled, true);
  assert.equal(appSettingsSchema.parse({ mcpEnabled: false }).mcpEnabled, false);
});
