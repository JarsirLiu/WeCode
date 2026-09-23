# @zcode/ui

共享 React 组件、hooks 与 Zustand store，被 `packages/desktop`（renderer）和 `packages/web` 复用。本包只渲染和采集交互态，业务状态由服务端拥有。

## 职责边界

- 组件通过 `src/hooks/` 访问服务；**禁止直接调用 Repo、Service 或 Runtime 实现**（架构策略有 `ui-implementation-import` 规则强制）。
- 平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.zcode`。
- Zustand 状态位于 `src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 入口

公开入口见 `package.json` 的 `exports`，主要是 `./src/index.ts`、`./src/useTheme.ts`、`./src/store/remoteWorkspaceSessionStore.ts`、`./src/replay.ts` 等。跨包导入走公开入口，不深入 `src/` 内部路径。

## 目录结构（按能力分组）

```txt
src/
  app-shell/            应用外壳与布局
  store/                Zustand 状态（唯一状态所有者在此）
  hooks/                组件访问服务的唯一通道（IPlatformService、服务调用）
  components/           通用组件（含 ai-elements 子目录）
  presentation/         展示层组件
  lib/                  纯工具与 e2eStoreBridgeBootstrap
  i18n/                 国际化
  assets/               静态资源
  # 聊天与输入
  chat-input-toolbar/  prompt-editor/  mentions/  shortcuts/
  command-center/       quickpick/  slashCommand*
  # Git 面
  GitPane/  git-action-menu/  git-branch-switcher/  git-graph/
  # 浏览器与 CUA
  browser-use/  cua-permission/
  # 远控与终端
  remote-connection/  terminal/  workspace-file-search/  workspace-file-tree/
  # 工作区
  workspace-grouped-tasks/  WorkspaceSidebar*  WorkspaceHeader*
  # 协议 v4 客户端
  v4/
  # 其它
  onboarding/  login/  feedback/  settings*/  resource-manager/  workers/
  ToolCallBlocks/  ModelTrajectory*  previewPane*  WhiteboardPane/  TreemappingPane/
```

顶层有大量页面级组件（`App.tsx`、`Root.tsx`、`SettingsPage.tsx`、`TaskList*.tsx`、`Workspace*.tsx`、`ModelTrajectory*.tsx`、`previewPane*.tsx` 等），按文件名即可定位。完整子目录清单和文件计数运行 `pnpm architecture:context ui`。

## 测试

测试位于 `packages/ui/test`（`src` 的兄弟目录，不在模块根内），运行入口以 `package.json` 为准。

## 不要在这里做

- 不要在组件里直接 `fetch` / 读写文件 / 调子进程；走 `hooks` → 服务。
- 不要把服务端事实复制进组件局部 state；广播字段先防回环。
- 不要新增对 `repo`/`runtime`/`services` 实现路径的导入，架构检查会拒绝。

## 相关

- 行为权威：`AGENTS.md` § UI 与平台边界、`DESIGN.md`（改 UI 前先读）、`CONTEXT.md`（插件商店词汇）。
- 模块声明：`architecture-policy.yaml`（id: `ui`）。
- 导航索引：`docs/modules.md`；深度上下文：`pnpm architecture:context ui`。
