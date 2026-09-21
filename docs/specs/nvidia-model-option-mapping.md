# NVIDIA 模型请求参数映射

## 行为

- 使用 NVIDIA NIM OpenAI-compatible endpoint（`https://integrate.api.nvidia.com/v1`）时，模型请求不得继承通用 GLM 推理参数映射。
- NVIDIA endpoint 的 reasoning option 映射为空，保留模型选择和 UI 档位事实，但不向请求体注入 `reasoning`、`enable_thinking`、`thinking` 或 `reasoning_effort` 等未经该 endpoint 确认的方言字段。
- NVIDIA endpoint 使用 NIM 兼容的 `max_tokens` 输出 token 字段。
- 普通 OpenAI-compatible GLM 也不使用通用推理方言；OpenCode Zen 等已有 provider-site 专属映射继续优先于通用规则。

## 所有者与边界

- `config/provider/zcode-builtin.json` 的 provider-site model rule 是 endpoint 级参数映射的唯一配置来源。
- `packages/provider/src/config/ModelConfigRules` 按规则顺序 overlay；NVIDIA endpoint 规则在通用 model-api 规则之后，因此只覆盖 reasoning map，不改变模型能力、档位值域或其他 provider 的配置。
- 请求适配器只消费解析后的 `optionSpecs`，不按 provider 名称再猜测参数方言。

## 验收场景

1. NVIDIA endpoint + `glm-5.3-flash` 的解析结果中，reasoning map 为 `{}`，max output map 为 `max_tokens`。
2. NVIDIA endpoint + `nvidia/nemotron-3-ultra-550b-a55b` 不继承 GLM reasoning map。
3. 非 NVIDIA endpoint + 裸名 `glm-5.3-flash` 不注入推理方言。
4. OpenCode Zen + `glm-5.3-flash` 仍使用该 endpoint 的 `reasoning_effort` 映射。
