# @zcode/shared

跨包共享的协议与类型，无运行时业务状态。是协议契约和平台抽象的单一权威位置。

## 职责边界

- 协议改动必须同步更新 `src/zcode-protocol/index.ts`，提供严格类型与运行时校验。
- 平台操作抽象在 `src/platform.ts`（`IPlatformService`），UI 和其它包通过它访问平台能力，不直接调 `window.zcode`。
- 本包只放协议、类型和平台抽象；不放业务实现、服务或状态。
- 跨包导入走公开入口；其它包不深入 `src/` 内部路径。

## 入口

公开入口见 `package.json` 的 `exports`，主要是 `./src/index.ts` 及 `./src/zcode-protocol/index.ts` 等多个协议与工具入口。

## 目录结构

```txt
src/
  zcode-protocol/       ZCode Protocol 契约（单一权威，协议改动在此更新）
  zcode-protocol-v4/    V4 协议：apply、attachment-ref、command、controller、core、coalesce 等
  browser-use/          浏览器自动化协议：backend、commands、snapshot、result、nodeReplBroker
  node/                 Node 端共享工具：atomicFileLock、officialPluginCache、subagentMarkdownMigration 等
  # 顶层有 index.ts、platform.ts 及各协议入口
```

每个子目录的文件计数运行 `pnpm architecture:context shared`。

## 不要在这里做

- 不要在 shared 放业务实现或服务逻辑；它是协议与类型的权威层。
- 不要绕过 `src/zcode-protocol/index.ts` 在别处另定义协议契约。
- 不要让本包依赖上层业务包（shared 是底层依赖，方向只能向下）。

## 相关

- 行为权威：`AGENTS.md` § 进程、协议与远程控制、§ UI 与平台边界、§ Workspace Identity。
- 模块声明：`architecture-policy.yaml`（id: `shared`，被 `session`/`storage` 等依赖）。
- 导航索引：`docs/modules.md`；深度上下文：`pnpm architecture:context shared`。
