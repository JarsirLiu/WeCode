import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseZCodeBuiltinModelConfigRules } from "../src/config/schema.js";

const builtinConfigPath = new URL("../../../config/provider/zcode-builtin.json", import.meta.url);

async function loadRules() {
  const release = JSON.parse(await readFile(builtinConfigPath, "utf8")) as {
    config: { modelConfigRules: unknown };
  };
  return parseZCodeBuiltinModelConfigRules(release.config.modelConfigRules);
}

function resolveReasoningMap(
  rules: Awaited<ReturnType<typeof loadRules>>,
  input: { modelId: string; baseUrl: string },
): string | undefined {
  return rules.resolve({
    providerId: "test-provider",
    modelId: input.modelId,
    apiType: "openai-chat-completions",
    baseUrl: input.baseUrl,
  }).optionSpecs?.reasoningLevel?.map;
}

function resolveOptionMaps(
  rules: Awaited<ReturnType<typeof loadRules>>,
  input: { modelId: string; baseUrl: string },
): { reasoning?: string; maxOutputTokens?: string } {
  const config = rules.resolve({
    providerId: "test-provider",
    modelId: input.modelId,
    apiType: "openai-chat-completions",
    baseUrl: input.baseUrl,
  });
  return {
    reasoning: config.optionSpecs?.reasoningLevel?.map,
    maxOutputTokens: config.optionSpecs?.maxOutputTokens?.map,
  };
}

test("NVIDIA endpoint overrides the generic GLM reasoning dialect", async () => {
  const rules = await loadRules();

  assert.equal(
    resolveReasoningMap(rules, {
      modelId: "glm-5.3-flash",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    }),
    "{}",
  );
  assert.equal(
    resolveOptionMaps(rules, {
      modelId: "glm-5.3-flash",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    }).maxOutputTokens,
    '{"max_tokens": maxOutputTokens}',
  );
});

test("NVIDIA endpoint does not give Nemotron a GLM reasoning dialect", async () => {
  const rules = await loadRules();

  assert.equal(
    resolveReasoningMap(rules, {
      modelId: "nvidia/nemotron-3-ultra-550b-a55b",
      baseUrl: "https://integrate.api.nvidia.com/v1/",
    }),
    "{}",
  );
});

test("non-NVIDIA GLM mappings and OpenCode Zen remain endpoint-specific", async () => {
  const rules = await loadRules();

  assert.equal(
    resolveReasoningMap(rules, {
      modelId: "glm-5.3-flash",
      baseUrl: "https://api.example.com/v1",
    }),
    "{}",
  );
  assert.equal(
    resolveReasoningMap(rules, {
      modelId: "glm-5.3-flash",
      baseUrl: "https://opencode.ai/zen/go/v1",
    }),
    '{"reasoning_effort": reasoningLevel}',
  );
});
