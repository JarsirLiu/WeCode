# Agent Note: Keep remote release platform keys canonical

Status: implemented

## Problem

远程资源打包器在生成 GitHub Release 制品时把 Linux 平台改名为 electron-builder 的 `linux-x86_64` 和 `linux-aarch64`。运行时请求并校验的是 canonical key `linux-x64` 和 `linux-arm64`，导致 Linux 远程部署在下载组件前就失败。

## Decision

远程资源生产端和消费端统一使用 `linux-x64`、`linux-arm64`、`darwin-x64`、`darwin-arm64`。打包器使用源平台 key 生成输出目录、manifest 文件名、manifest 的 `platformArch` 和归档文件名前缀；发布 workflow 也校验并发布同一组 key。

## Root cause

打包器把 electron-builder 的架构词汇带到了 GitHub Release 边界，而运行时契约使用 Node 风格的环境归一化名称。CI 只检查 manifest 内部完整性，没有检查文件名和 `platformArch` 是否与运行时请求一致。

## Fix

移除发布边界的平台重命名，并增加 canonical 平台集合以及 workflow、打包器中禁止 Linux 别名的回归覆盖。

## Alternatives considered

**在运行时增加别名 fallback** 被否决，因为会长期保留两套公开命名契约并允许生产端再次漂移。**保留别名并修改运行时探测** 被否决，因为本地 mock-cdn 和现有运行时路径已经使用 canonical key。

## Consequences

已有错误命名的 Release 需要重新上传修正后的制品；修复运行会覆盖同名制品，并应删除旧的错误命名制品。后续远程 Release 只有一套明确的平台词汇。
