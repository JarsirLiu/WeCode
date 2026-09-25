# 套餐模块生命周期与访问规范

本文档定义套餐模块的目标行为边界，作为后续实现模块注册表、生命周期开关、官方 Start Plan 关闭和自有套餐接入的行为依据。

## 行为

- 每个套餐是独立模块。当前模块包括官方 Z.ai Start Plan、官方 BigModel Start Plan、个人 Coding Plan、团队 Coding Plan；未来自有套餐使用新的模块标识。
- 每个模块具有以下生命周期之一：
  - `enabled`：允许 catalog、身份、权益、额度、模型准入和运行时凭据能力按模块策略工作。
  - `catalog-disabled`：不读取或展示该模块的 catalog、预览、购买或激活入口；是否保留已有运行时访问必须由明确策略决定，不能由调用方自行推断。
  - `runtime-disabled`：不允许新的模型准入、额度刷新或运行时凭据解析；旧缓存和旧 provider 配置不能授权新请求。默认同时停止 catalog 展示。
  - `retired`：不再注册新选择或新请求；仍可读取旧的持久化选择以执行显式迁移，不能静默回退到其他套餐。
- 模块能力分为六类：
  - `catalog`：产品名称、描述、权益预览、模型展示、购买或激活链接。
  - `identity`：登录/会话要求和账号身份查询。
  - `entitlement`：待生效、有效、过期或不可用状态。
  - `quota`：剩余额度、重置时间、套餐关联和用量展示。
  - `admission`：模型白名单、有效时间、并发限制和服务端请求授权。
  - `billing`：购买、续期、激活和支付操作。
- 模块关闭默认采用 fail-closed 语义：不请求被关闭模块的远端 catalog、权益或额度接口，不暴露其模型，不解析其运行时凭据，不显示其购买入口。
- 模块关闭、远端请求失败、未登录、没有权益、权益待生效、权益过期、额度耗尽、模型不在白名单和凭据不可用必须是可区分的规范化状态，不能依赖厂商错误文本或 UI 文案推断。
- “当前未选中”不等于“没有权益”。选择状态、账号身份、权益状态、额度状态和运行时准入必须独立保存和判断。

## 所有者与边界

- 模块注册表是生命周期和能力开关的唯一所有者。UI store 不得成为套餐启停状态的权威来源。
- 套餐 adapter 是远端协议、响应校验、endpoint、凭据格式和厂商字段映射的唯一所有者。官方 Start Plan adapter 与未来自有套餐 adapter 必须独立。
- `packages/shared` 负责跨包共享的模块标识、生命周期类型、规范化快照和运行时校验 schema。
- `packages/services` 负责 registry、adapter 装配、远端请求、缓存命名空间、权益/额度查询、模型准入和运行时授权。
- `packages/ui` 通过 service hooks 消费规范化 catalog、权益和额度快照，并触发用户操作；UI 不得直接调用套餐 endpoint，也不得以隐藏组件替代 runtime 门禁。
- 模型 registry/provider projection 只能消费经过模块生命周期和准入检查的规范化结果。Start Plan 的空模型结果是本轮权威结果，不能保留上一轮已失效白名单。
- runtime credential resolution 是最终安全边界。即使 UI、缓存或旧 provider config 表示可用，runtime 仍必须重新确认模块未关闭、身份有效、权益有效、模型获准和凭据可用。
- 禁用或退役模块的持久化选择由选择迁移边界负责：保留旧标识以显示明确 unavailable，或在具备明确映射和新权益时执行一次显式迁移；不得自动选择普通 Coding Plan 作为替代。

## 能力门控

| 生命周期 | catalog | identity | entitlement | quota | admission | billing |
| --- | --- | --- | --- | --- | --- | --- |
| `enabled` | 可用 | 按 adapter 策略 | 可查询 | 可查询 | 可授权 | 按模块支持情况可用 |
| `catalog-disabled` | 禁止 | 可按 runtime 策略查询 | 可按 runtime 策略查询 | 可按 runtime 策略查询 | 仅在显式策略允许时可用 | 禁止购买/激活入口 |
| `runtime-disabled` | 默认禁止 | 不得用于授权 | 禁止用于新请求 | 禁止刷新 | 禁止 | 禁止 |
| `retired` | 禁止新展示 | 仅允许迁移读取 | 禁止新请求 | 禁止新请求 | 禁止 | 禁止 |

`catalog-disabled` 不得被解释成已授权或已撤销授权。若产品需要在隐藏 catalog 后保留已有用户访问，必须在模块策略中显式声明，并仍经过 runtime admission；默认实现采用关闭 catalog 和 runtime 的组合策略。

## Start Plan 访问契约

- 未登录用户可以在 Start Plan 模块处于 `enabled` 且远端返回合法 preview 时看到 catalog preview。这只表示产品展示，不授予模型访问权。
- 未登录用户不能使用 Start Plan 模型。Start Plan runtime 请求必须具备账号身份和 `zcodejwttoken`；缺少 token 时，凭据解析和请求必须失败。
- 登录不是充分条件。运行时还必须满足：
  - 服务端确认存在 active Start Plan entitlement；
  - 当前请求模型存在于服务端返回的允许模型白名单；
  - 当前时间已达到生效时间且未超过失效时间；
  - 额度、并发和其他 admission 条件满足；
  - runtime 能解析出有效请求凭据。
- pending、expired、no active plan、quota exhausted、model not allowed 和 credential unavailable 都不能授权模型请求。
- Start Plan entitlement 可以来自服务端认可的领取、赠送或购买权益；UI 的 `disconnected` 或 `not-purchased` 只是展示状态，不能替代服务端 entitlement 判断。

## 请求事件顺序

```text
模块生命周期检查
  -> 账号身份检查
  -> entitlement 检查
  -> effectiveAt/expiry/quota 检查
  -> server model allow-list 检查
  -> provider model projection
  -> runtime credential resolution
  -> 发起模型请求
```

- 任一步骤失败都必须停止后续步骤，并返回规范化不可用原因。
- lifecycle 检查必须发生在读取缓存快照之前或同时发生；模块关闭后，缓存不能恢复模型准入。
- catalog 请求与 runtime admission 是独立链路，但 runtime admission 永远不依赖 catalog 缓存作为授权依据。
- Start Plan、个人 Coding Plan、团队 Coding Plan 和未来自有套餐的刷新与授权不能互相触发或互相覆盖。

## 持久化选择与迁移

- `enabled` 模块的持久化选择按正常流程解析。
- `catalog-disabled` 或 `runtime-disabled` 模块的旧选择保留其模块身份，并显示明确 unavailable；不得静默替换为其他套餐。
- `retired` 模块的旧选择只能进入显式迁移流程：迁移必须验证目标模块身份、权益和 provider 配置，并保证重复执行幂等。
- 没有可验证目标权益时，迁移结果必须是 unavailable，而不是自动选择普通 Coding Plan。
- 本地路径、workspace identity、远程 session identity 和 provider selection 的关联键必须保持现有 identity 语义，不能只按展示路径或 provider family 猜测迁移对象。

## 验收场景

1. 所有模块默认处于 `enabled` 时，现有个人、团队和 Start Plan catalog、权益、额度、模型投影和 runtime 行为不变。
2. Start Plan 为 `catalog-disabled` 时，不发起其 preview/catalog 请求，不构造其静态产品，不显示其购买入口；个人和团队 Coding Plan 仍可加载和使用。
3. Start Plan 为 `runtime-disabled` 时，不发起其 entitlement/quota 刷新，不投影其模型，不解析其 JWT；旧缓存和旧 provider config 不能发起新请求。
4. 未登录用户在 catalog 启用时可以看到 Start Plan preview，但调用 Start Plan 模型必然因缺少身份或 `zcodejwttoken` 被拒绝。
5. 已登录但没有 active Start Plan entitlement 的用户不能使用 Start Plan 模型。
6. pending、expired、quota exhausted 或模型不在服务端白名单的 Start Plan 不能通过 admission。
7. disabled 或 retired 模块的持久化选择不会静默回退；有明确目标权益时迁移成功，无目标权益时显示 unavailable。
8. 官方 Start Plan 模块关闭不会改变个人 Coding Plan、团队 Coding Plan、其他 provider 或未来自有套餐的状态。
9. 测试能够分别验证 catalog、entitlement、quota、model projection、runtime credential 和 selection migration 的生命周期门控。
