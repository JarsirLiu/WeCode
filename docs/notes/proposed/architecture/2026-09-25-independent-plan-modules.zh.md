# Agent Note: Independent plan modules and lifecycle controls

Status: proposed

[English](2026-09-25-independent-plan-modules.md)

## 问题

当前 Coding Plan 和 Start Plan 把套餐预览、账号身份、权益查询、额度快照、模型准入、运行时凭据和购买流程耦合在一起。Start Plan 的展示来自远端 `client/configs`，权益来自 `billing/balance`，但 UI 把它们表现为同一个 provider family 体验。

这使得关闭官方 Start Plan 时容易误伤普通 Coding Plan，也使未来替换为自有套餐需要修改过多既有代码。当前还缺少明确契约来区分未登录用户能否看到套餐预览与能否真正使用套餐模型。

## 提案

将每个套餐族视为可独立控制的套餐模块。Start Plan、个人 Coding Plan、团队 Coding Plan 和未来的自有套餐都实现相同的能力端口，同时保留各自独立的 provider 适配器。

模块契约拆分为：

1. `catalog`：名称、描述、权益预览、模型展示以及购买或激活链接。
2. `identity`：登录/会话要求和账号身份查询。
3. `entitlement`：待生效、有效、过期或不可用状态。
4. `quota`：剩余额度、重置时间、额度桶归属和用量展示。
5. `admission`：模型白名单和服务端请求授权。
6. `billing`：套餐支持时的购买、续期、激活和支付操作。

每个模块拥有明确生命周期策略：

- `enabled`：可以展示 catalog、查询权益、发布模型并授权请求。
- `catalog-disabled`：不拉取或渲染 catalog/预览；已有有效账号是否继续使用必须由策略明确决定。
- `runtime-disabled`：不允许新的模型准入或额度刷新；缓存状态不能授权新请求。
- `retired`：不再注册新选择，但迁移代码仍可读取和转换旧的持久化选择。

关闭模块的默认策略是 fail-closed：不请求远端 catalog、权益或额度，不暴露模型，不解析运行时凭据，也不展示购买入口。每个模块自己拥有 endpoint、响应校验、缓存命名空间、provider 标识和 feature flag。共享 UI/runtime 只消费规范化快照，不根据厂商套餐名称分支。

迁移期间保留现有 Start Plan 代码作为参考适配器。官方 preview 加载器独立于权益和余额适配器启停。未来自有模块实现相同的规范化端口，但不修改 BigModel 或 Z.ai 适配器。

## Module boundary

```text
套餐模块注册表
  -> 生命周期策略与能力开关
  -> 套餐适配器（官方 Start / 个人 / 团队 / 自有）
  -> 规范化 catalog、权益、额度与准入快照
  -> UI hooks 与模型注册表投影
  -> runtime 请求授权
```

注册表负责启用状态和注册关系。适配器负责远端协议和凭据。`packages/shared` 负责规范化类型和严格校验。`packages/services` 负责适配器、endpoint、缓存和运行时授权。`packages/ui` 只通过 service hooks 负责展示和用户操作，不得直接调用套餐 endpoint。

模块不能把“当前未选中”当成“没有权益”。选择状态、账号身份、权益状态和运行时准入必须保持为不同事实。

## Start Plan 生命周期与访问契约

当前实现的真实行为如下：

- 未登录用户在远端存在 `data.configs.startPlanPreview` 且 Start Plan 卡片启用时，可以看到 Start Plan 预览。这只是 catalog 展示。
- 未登录用户不能使用 Start Plan 模型。请求路径要求 `zcodejwttoken`；`planKind: "start-plan"` 的请求鉴权服务会解析该 token，缺失时拒绝请求。
- 登录仍然不够。可用性检查还会请求 `billing/balance`，并要求成功响应中存在 active Start Plan。缺少 token、鉴权失败、没有有效套餐、套餐过期或服务端没有允许的模型，都会阻止准入。
- Start Plan 不一定是购买得到的套餐。服务端认可的 active 领取或赠送权益也可以通过；UI 的 disconnected 或 not-purchased 只是权益结果的展示。
- 待生效套餐可以展示，但在生效时间到达且服务端确认 active 前不能授权请求。
- 额度耗尽、模型不在白名单、并发限制和运行时凭据失败都是独立拒绝条件。

未来自有套餐应保留同样的顺序：身份、权益、额度和模型准入，最后在 runtime 边界解析请求凭据。UI 状态或缓存 catalog 绝不能单独授权模型请求。

## Module boundary implementation direction

1. 引入模块注册表和生命周期策略，不改变规范化 UI/runtime 契约。
2. 将官方 Start Plan 和 Coding Plan 注册为独立适配器。
3. 先关闭官方 Start Plan catalog 加载，验证普通 Coding Plan 的 catalog 与购买流程。
4. 再关闭官方 Start Plan runtime 与 quota 能力，验证持久化选择变成明确 unavailable，而不是静默回退。
5. 增加自有适配器和自有服务端准入路径，使用独立模块开关。
6. 显式迁移用户和持久化选择，再将官方适配器标记为 retired。迁移和回滚窗口结束前保留适配器及测试。

## 曾考虑的替代方案

**立即删除官方 Start Plan 代码：** 否决。这样会丢失 catalog、JWT 运行时鉴权、权益、额度归属、待生效状态和模型白名单的可用参考。

**使用一个全局 `codingPlanEnabled` 开关：** 否决。关闭 Start Plan 会连同个人和团队套餐一起关闭，也无法表达只关闭 catalog 或只关闭 runtime。

**继续增加 `if (isStartPlan)` 分支：** 否决。厂商特定行为会扩散到多个包，自有替换也会被官方名称绑定。

**把登录视为足够访问条件：** 否决。服务端还会独立检查 active 权益、模型资格和额度。

## 验收标准

- 每个套餐模块都可独立设置为 enabled、catalog-disabled、runtime-disabled 或 retired，不改变无关模块。
- 关闭官方 Start Plan 后，按策略停止其 preview/catalog、权益/余额、模型投影、运行时凭据解析和购买入口。
- 未登录用户只有在 catalog 启用时才能看到预览，但不能使用 Start Plan 模型。
- 已登录但没有服务端 active 权益的用户不能使用 Start Plan 模型。
- 待生效、过期、耗尽或模型不符合资格的套餐不能授权请求。
- 被禁用或 retired 模块的持久化选择必须显示明确 unavailable，不能静默回退。
- 未来自有模块可以复用规范化 UI/runtime 契约，而不导入官方适配器或厂商 endpoint 代码。
- 测试覆盖生命周期门控、未登录预览与运行时拒绝、有效权益准入、待生效/过期、额度耗尽以及持久化选择迁移。

## 风险

- catalog 和 runtime 分开开关可能让用户看到无法使用的套餐；除非提供迁移提示，否则 runtime 关闭时应默认同时关闭 catalog。
- 缓存快照可能在关闭后误授权；runtime 准入消费缓存前必须检查生命周期。
- 退役标识可能使持久化选择失效；删除别名前必须完成并验证显式迁移。
- 保留官方适配器会增加维护成本，也可能保留过时 endpoint 假设；自有模块启用后应标记为 legacy。
- 规范化契约可能掩盖厂商差异；适配器应拒绝含义不明确的响应，不得强制转换成 active 权益。
