# 远程控制能力边界

本文档用于快速定位「远程控制」相关的代码模块与已实现的功能边界，作为判断「能做 / 不能做」的依据。远程控制在本仓库不是单一能力，而是三条相互独立的链路；把三者混用会得到错误的设计判断。

## 三条链路

判断能力的第一个岔口。三者不可互相替代。

| 链路 | 连接方向 | 会话单元 | 状态 |
| --- | --- | --- | --- |
| A. 远程工作空间 | 本机主动外联（SSH / WSL / Docker） | 在远端机器上起**新的** agent 进程 | 已上线，功能完整 |
| B. Web / 局域网访问 | 远端客户端拨入本机 `zcode-server` | 访问本机正在运行的服务 | 部分：可看文件，**不能开会话** |
| C. 手机远控与公网 hub | 双方经外部 relay 中转 | **attach** 到桌面已有会话 | 未实现，仅类型契约 |

- A 是「在远端跑 agent」，会话数据落在远端机器；C 是「接入别人已存在的会话」，会话数据留在桌面。这是两种不同的寻址范式。
- B 是链路 A 的传输底座被 Web 客户端复用，但能力被刻意裁剪。

## 链路 A：远程工作空间（已上线）

### 行为

- 本机经 `ssh2`（纯 JS 库，非系统 ssh）外联目标机器，默认端口 22 且可配置；支持 SSH / WSL / Docker 三种 backend。
- 远端**不监听任何端口**：连上后 `exec` 起 `~/.zcode/server/node ~/.zcode/server/zcode-server.cjs`，全部 RPC 跑在 exec channel 的 stdin / stdout 上。无反向隧道、无端口映射。
- 首次连接经 SFTP 上传 node + server bundle + node-pty 到 `~/.zcode/server`；SFTP 失败降级为 `cat > file` 走 exec pipe（部分网关会把 exec 与 SFTP 落到不同文件系统视图）。
- 远端进程以 `SERVICE_AUTHORITY_MODE="desktop-attached-remote"` 标记自身权威模式。
- 对话、任务、工具调用、终端、git、文件监听、MCP、插件、hooks、subagents、记忆、模型与 Provider 设置全部可用。

### 所有者与边界

- `packages/shared/src/remoteTarget.ts` 与 `packages/shared/src/validation.ts` 定义 `RemoteTarget = ssh | wsl | docker`。新增 kind 必须同步 4 处穷尽 switch（TS 会强制标红）。
- `packages/server/src/remote/` 拥有全部传输实现：`sshAuth.ts`、`ssh-backend.ts`、`wsl-backend.ts`、`docker-backend.ts`、`deploy.ts`、`connect.ts`、`handshake.ts`、`stdio-socket.ts`。默认端口在 `sshAuth.ts` 的 `port: input.port ?? 22`。
- `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts` 拥有远端服务装配（约 :311-364 的注册块）。
- **脑分裂是有意设计**：执行面（`IZCodeAgentService` / task / session / file / git / terminal）在远端；身份与凭据（`ISettingService` / `ICredentialService` / `IBroadcastService` / `ICodingPlanSubscriptionService` / `IClientConfigService`）保留在桌面本地。远端 agent 使用本地注入的凭据发起模型请求，产品 endpoint 经 `REMOTE_RUNTIME_ENV_KEYS` 白名单透传给远端进程。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化。远程 identity 格式为 `remote:ssh:<host>:<port>:<username>:<posixPath>`，构造与解析只走 `packages/shared/src/remote-workspace-identity.ts`。
- `remoteSessionId` 必须配 `workspaceIdentity`，硬不变量在 `packages/shared/src/zcode-protocol-v4/controller.ts`（superRefine 校验，缺失即报 `remote task address requires workspaceIdentity`）。

### 前置条件

- 目标机器 SSH 可达（22 或自定义端口）。**跨公网需用户自行做隧道或组网，本仓库不提供任何穿透能力。**
- WSL 走本机 `wsl.exe` spawn、Docker 走 `docker exec -i`，二者都不需要 22 端口。

## 链路 B：Web 与局域网访问本机

### 行为

- `zcode --web --host 0.0.0.0 --port 3030 --no-open` 遍历本机非内网网卡，打印每个地址的 `Network: http://<ip>:3030/?token=xxx`。
- `?token=` 首次访问即种 HttpOnly cookie `zcode_lite_token`，后续 `/ws` 握手自动携带；静态资源不鉴权，仅 `/ws`、`/ws/*`、`/api/*` 受保护。
- 非 loopback host 自动强制生成 token，无 CORS 与 host allowlist 实现，安全性依赖 token 与同源。
- **无任何发现机制**：无 mDNS / bonjour、无二维码、无设备配对码。手机获知本机地址的唯一途径是人工粘贴终端打印的 URL。

### 所有者与边界

- `scripts/zcode-distribution/runner.mjs` 拥有端口选择、token 生成与 Network URL 打印（`serve` 函数内）。
- `packages/server/src/http.ts` 拥有 HTTP / WebSocket 服务。`POST /api/connect-remote` + `GET /ws/remote/:id` 可桥接远端连接，但**只注册 file / git / system / terminal 四个服务，不含 `IZCodeAgentService`** —— 浏览器能看远端文件，开不了会话。该桥是单消费者、`Math.random()` 生成 id、无归属与过期撤销。
- `packages/zcode-server-cli/src/server-core/http.ts` **fail-closed**（约 :126-132）：只白名单 `127.0.0.1` / `::1` / `localhost` 三个精确字符串，非 loopback 直接 throw。这是 Core 模式禁止公网暴露的闸门，原因是它尚未接入 token middleware。
- Web 端远程工作空间入口被硬关闭：`packages/web/src/main.tsx` 中 `allowRemoteWorkspace={false}`。整条 `onOpenRemoteConnection` 链路挂在 `allowRemoteWorkspace ? ... : undefined` 后面。

## 链路 C：手机远控与公网 hub（未实现）

### 现状：仅有类型契约与枚举占位

- `relay_bridge` 枚举（`packages/shared/src/task-realtime.ts` / `task-realtime-core.ts`）：**零生产者**，所有 host 实际都落回 `desktop_window`。
- `clientKind: "mobileRemote" | "mobileApp"`（`packages/shared/src/zcode-protocol-v4/transport.ts`）：**零生产者**，实际只发 `desktop` / `web`。
- `VITE_ZCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL`（`packages/web/src/env.d.ts`）：**零消费者**，Vite 的 `define` 块也未注入它。纯占位声明。
- `attachRemoteWorkspaceSessionHost`（`packages/desktop/src/main/desktopRemoteSessions.ts`）：函数体已写好、clientMode 即为 `web-remote-replayable`，但**未挂到任何 IPC，当前构建里是死代码**。
- `DELIVERY_PROFILES`（`packages/shared/src/zcode-protocol-v4/core.ts` 约 :34-59）：定义了 `continuous` 与 `replayable` 两档交付参数（flush 窗口 30ms → 150ms、只保留 `text` 流路径、`streamOutputCapBytes: 0`、开启 `toolProgress`），但**全仓库零引用**，host 侧硬编码 `"continuous"`。
- 外部 relay 域名：`.env.example` 中不存在；ARMS 路径白名单里 `remote-control`、`workspace-bridge`、`mobile-view-state` 三段已登记但**零调用点**。

### 架构约束（硬边界）

`AGENTS.md` 与 `packages/desktop/README.md` 明确规定：

> 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，**不保存任务队列、快照等业务状态**。

这条约束同时是机遇与限制：hub 必须无状态、可水平扩容；但也意味着 hub 做不了「帮我找一台设备」这类有状态能力，发现与配对必须拆给另一个服务。

## 判定：能做与不能做

**能做（今天就有，无需等新功能）**

- 在桌面 app 里新建会话并让它运行在另一台机器上，获得与本地等同的对话、任务、工具、终端能力。
- 通过 SSH / WSL / Docker 三种方式连接，非标准 SSH 端口可配置。
- 在任意局域网设备（含手机浏览器）粘贴 URL 访问本机正在运行的服务。

**不能做（现有设计明确排除）**

- 不能给 hub 加业务状态存储（任务队列、快照），这违反 relay 职责边界。
- 不能让手机获得 `onDynamicCuaPermissionObservation`、本地 TTFT 观测、媒体 previewSource 直连权限。`zcodeAgentConnectionScope.ts` 已逐条裁定这些仅属 terminal + desktop-continuous，手机 replay attachment 只能消费可恢复的对话事实。
- 不能把 `mobileRemote` 当成已实现的权限档位：它当前没有区别于 `web` 的任何行为，全部逻辑只看 `clientMode`。
- 不能复用 `/api/rpc-host-capability` 票据做公网接入凭证：它是 30 秒 TTL、纯内存 `Map`、32 字节随机串、无签名、无目标绑定，只能证明「可达 loopback HTTP」。跨公网需要新的可持久化、可撤销、绑定 device 与 session 的凭证设计。
- 不能把 relay 塞进 `RemoteTarget` 新增 kind：`RemoteTarget` 是「本机 SSH 出去」范式，relay 是「接入他人已有会话」范式，硬塞会污染 `stripRemoteTargetSecrets` 与 workspace identity 格式契约。
- 不能让 `zcode-server-cli` Core 模式监听非 loopback 地址；fail-closed 是刻意的。
- 不能靠 `relay_bridge` 枚举直接扩出手机投递：`taskRealtimeBus` 只按 `workspaceKeys` 过滤，`deliveryKind` 不参与路由，且该链路**没有活着的消费端**（`task_stream_mirror_batch`、`deliveryPurpose` 全部零消费者）。
- 没有 MCP server 端实现，**不能把本机 agent 暴露为可被其他 agent 调用的服务**。MCP 只有消费侧（`apps/zcode-cli/packages/adapters/src/mcp/`），全部是 client、pool、oauth、stdio-transport。

**做 agent 调 agent 的可行路径**

MCP 客户端配置（`apps/zcode-cli/packages/adapters/src/config/schema.ts`）已支持 `stdio` / `http` / `sse` 三种传输，后两者带 `headers` 与 `oauth`（`client_credentials` / `authorization_code` 两路授权流）。最短路径：在目标机器上包一个 MCP server 暴露该 agent，本机把它配成 `type: "http"` 的 MCP server 加 OAuth。本机侧无需改代码。

## 可复用原语（实现 hub 时直接用）

连接层的「中转该有什么」已生产级实现，集中在 `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts`：

- **路由键**：`namespaceRelayConnectionId` 产出 `relay:<len>:<up><len>:<down>`，长度前缀防分隔符碰撞，opaque 不需业务解析。这是 hub 路由器的核心键。
- **防伪造链**：`withTrustedConnection` 强制清除 5 个可伪造字段（connectionId / clientMode / deliveryProfile / subscriberScope / trusted carrier）后注入 host 真值，逐跳注入，客户端无法自证身份。
- **role 权限矩阵**：`trusted-host-relay` 与 `terminal-client` 的每项权限差异都逐条裁定并带 fault code（`fault.connection.flowControlForbidden`、`fault.subscription.notOwned`、`fault.command.clientMismatch` 等）。
- **握手合同**：`POST /api/rpc-host-capability` 签发一次性票据 → `GET /ws/host` 带 `x-zcode-rpc-host-capability` 头升级。`packages/zcode-server-cli/scripts/verify-remote-ssh.mjs` 是**唯一活着的参考实现**，完整验证 401 门控与一次性票据重放检测。
- **重放语义（v4，已实现）**：`logEpoch` + `seq` 水位、`subscribe{base}` → `ack{mode: snapshot|resume}`、断档 single-flight resync、物理层 crc32 + `logicalFrameId` 幂等。客户端三条恢复规则写在 `packages/ui/src/v4/conversationProjectionStore.ts` 文件头。
- **路由最小面**：`packages/shared/src/zcode-protocol-v4/wire.ts` 明确 service 边界只校验 outer 形状，「ownership 路由只读 topic/subId」——这是 hub 路由器不需要理解业务语义的验收标准。
- **连接流控**：按 connectionId 的 flow state（saturated / closed），手机掉线走同一路径，且必须先 closed 再 unsubscribe，避免留下只能等 TTL 的 paused connection。

## 模块定位

| 关注点 | 模块 ID | 关键入口 |
| --- | --- | --- |
| 传输与远端部署 | `server` | `packages/server/src/remote/` |
| 自托管 server 与 HTTP/WS | `zcode-server-cli` | `packages/zcode-server-cli/src/server-core/http.ts` |
| 协议与身份 | `shared` | `packages/shared/src/zcode-protocol-v4/` |
| 连接角色与路由 | `services` | `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts` |
| 桌面 Host 与服务装配 | `desktop` | `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`、`windowRemoteConnectionRegistry.ts` |
| 客户端 SDK | `client` | `connectViaWebSocket` / `connectViaProtocol` |
| Web 前端 | `web` | `packages/web/src/main.tsx` |
| CLI 与 app-server | `zcode-cli` | `apps/zcode-cli` |

定位方式：`pnpm architecture:context <模块ID>` 取目录图、公开入口、测试与文档。改动跨越 UI、service、protocol、持久化或远端 / runtime 边界时，按 `docs/README.md` 的改动路由第 6 步走 feature-boundary planner。

## 相关缺口

- 本仓库 `docs/notes/` 的 Agent Note（ADR）机制已建立且由门禁强制，但**全仓库零份 Agent Note**：远程连接的 lease 模型、role 权限矩阵、relay 命名空间均无决策记录。架构真相目前只存在于源码注释中。
- 补 hub 前按 `AGENTS.md` 要求先补两份：本文件（当前行为契约）与本文件缺失的 hub 契约部分，以及 `docs/notes/proposed/architecture/` 下的一份决策与取舍记录。
- 远程控制的权威行为描述目前只有 `AGENTS.md` 的「进程、协议与远程控制」一节；各包 README 均明确把行为权威外推给该节。
