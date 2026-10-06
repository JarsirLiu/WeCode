# Agent Note: 将 Bootstrap 纳入根类型检查门禁

Status: implemented

English: [English version](2026-10-06-bootstrap-typecheck-gate.md)

## 问题

桌面启动流程会构建 `@zcode/bootstrap`，但根目录 `pnpm typecheck` 没有包含这个项目。因此 workspace index 接线新增的跨包选项可以通过日常类型检查，却在桌面启动时才失败。

## 决策

根目录 typecheck 项目列表加入 `apps/zcode-cli/packages/bootstrap/tsconfig.json`。Bootstrap 仍可独立构建；本次只扩大已有预检门禁，使其覆盖桌面启动必然编译的包。

## Workflow change

启动 `pnpm dev:desktop` 前先运行 `pnpm typecheck`；共享命令现在会在常规预检中检查 Bootstrap。

## Alternatives considered

**只依赖 `pnpm dev:desktop`** 被否决，因为它发现类型错误太晚且会启动长时间运行的构建流程。**增加一个未文档化的独立命令** 被否决，因为贡献者仍会继续使用不完整的根门禁。

## 后果

协议装配与 `ZCodeAppOptions` 之间的跨包契约漂移会在启动 Electron 前被发现。但这不替代 bootstrap 构建：打包器、导出和生成产物错误仍需桌面构建流程验证。

## 验证

Bootstrap 独立类型检查已通过，根目录 typecheck 现在会和现有 services、client、server、desktop host 项目一起检查它。
