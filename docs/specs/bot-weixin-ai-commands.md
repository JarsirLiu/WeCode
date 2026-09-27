# 微信 Bot AI 命令

## 范围

本规格只覆盖已绑定的微信 Bot 在现有 Agent task 中通过自然语言调用 Bot 命令。微信扫码登录、注册轮询和 `/bind` 仍由桌面配置页或用户手动发送命令完成，不由模型或 `bot_command` 工具代办。

本规格不实现飞书、Telegram 的结构化卡片，不开启链路 B Web/LAN 的 Agent 会话，也不实现链路 C 手机远控、公网 relay 或 attachment。

## 双轨入口

```text
微信入站消息
  ├─ 以 / 开头或命中既有选择上下文 -> parseBotCommand -> 现有手动命令处理
  └─ 普通文本 -> 现有 Bot Agent task -> bot_command -> IBotsService
```

手动命令和 AI 工具共用 `IBotsService` 的命令执行事实与授权边界。AI 不可用时，手动命令仍必须可用；不得用 AI 超时替代或阻塞现有手动命令。

## 支持范围

微信 `bot_command` 支持：

- `model`: 列出供应商、列出模型、设置模型。
- `workspace`: 列出允许工作区、切换工作区。
- `task`: 列出任务、切换任务、新建或停止任务。
- `status`: 查询当前 Bot 上下文和任务状态。
- `reconnect`: 重连链路 A 远程工作区。
- `thoughtLevel`: 在当前模型支持时查询和设置思考级别。

微信不支持或禁止：

- `login`、`bind`：必须人工完成。
- `reply`：微信没有该配置能力，返回明确错误。
- `mode`：Bot 永远锁定 `yolo`，返回明确错误。
- 任意模型输入提供的 `workspaceIdentity`、`remoteSessionId`、`botId` 或渠道覆盖值：服务端使用受信 Runtime 会话元数据。

## 状态所有者

- Bot 配置、绑定关系、Bot context、任务选择和命令副作用由当前 Host 的 `IBotsService` 所有。
- Agent Runtime 只保存模型对话历史和工具调用结果，不保存第二份 Bot accepted state。
- 手动多步选择的 `pendingSelectionsByContext` 继续由 `botsService.ts` 所有。AI 多步选择由模型上下文承接，不写入另一套 pending selection map。
- 任务与 Session 事实由当前 workspace 所属的 `IZCodeTaskService` / session service 所有。
- `workspaceIdentity?.trim() || workspacePath` 是隔离和路由键；`workspacePath` 只用于执行和展示。

## 事件顺序

```text
用户: 换模型
  -> 普通文本进入已有 Bot Agent task
  -> 模型调用 bot_command(model, list)
  -> IBotsService 返回微信 textGuidance
  -> 模型回复供应商文本选项
  -> 用户回复选择
  -> 普通文本进入同一 task
  -> 模型调用 bot_command(model, set, providerId/modelId)
  -> IBotsService 校验当前上下文并提交变更
  -> 模型回复成功文本
```

如果用户在 AI 多轮选择期间发送 `/model`、`/workspace` 等手动命令，`parseBotCommand` 优先处理该消息；已有手动 pending selection 规则保持不变。微信轮询的 ACK、cursor、delivery dedupe 和 actor 串行队列不改变。

## Port 与协议边界

`bot_command` 通过 Core Runtime 的 `BotsServicePort` 调用当前 Host 的 `IBotsService`，不得让 Core 深入导入 services 实现。协议桥必须从受信 session 注入 `botId`、`channel: "weixin"`、`workspaceIdentity`、`remoteSessionId` 和 `clientMode`，忽略模型输入中的替代值。

Port 缺失、服务未绑定、workspace 不允许、远端断开或请求超时都返回结构化失败结果；不得伪装成成功，也不得由 relay/Main 保存任务队列或快照。

链路 A 远程工作区的命令在持有任务和模型事实的远端 Host 执行。本规格不把链路 B 当前的文件访问能力扩展为 Agent 会话，也不把链路 C 的类型占位视为已实现手机远控。

## 渠道返回

微信只返回短文本引导和稳定选项 id；不返回按钮卡片。工具结果可以包含 `step`、`options`、`textGuidance`、`currentValue`、`message` 和 `error`，不得包含凭据、密钥或不必要的内部连接细节。

## 验收场景

1. 已绑定微信用户发送“换模型”，收到供应商文本选项，选择供应商后收到模型文本选项，选择模型后变更成功。
2. 发送“切到远程项目”，只操作当前允许的 `workspaceIdentity`，远端事实仍由链路 A Host 持有。
3. 发送“现在状态”和“重连一下”，分别返回状态和重连结果。
4. 发送“调高思考级别”，模型不支持时返回明确失败，支持时可查询和设置。
5. `/help`、`/bind`、`/model`、数字选择和其他既有手动命令继续工作。
6. AI 工具不可用时，手动命令仍能切换模型和工作区。
7. 扫码登录、微信轮询、ACK、cursor 和重复消息去重行为不回归。
8. Web/LAN 与手机远控没有因本规格获得未实现的 Agent/attach 能力。
