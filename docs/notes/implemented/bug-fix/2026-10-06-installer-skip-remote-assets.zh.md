# Agent Note: 安装包 job 跳过远程资源准备

Status: implemented

[English](2026-10-06-installer-skip-remote-assets.md) | 中文

## Problem

桌面安装包 job 在打包前重复准备四个平台的远程连接资源。Windows job 因此会下载 Linux arm64 Node 资源，尽管远程资源已经由独立矩阵 job 构建发布。

## Root cause

`prepare-runtime-assets.mjs` 默认执行 `prepare:remote-assets`。发布 workflow 没有把已有的 `ZCODE_SKIP_REMOTE_ASSETS=1` 开关传给安装包 job，导致每个安装包 job 重复执行远程资源流程。

## Decision

五个桌面安装包 job 统一设置 `ZCODE_SKIP_REMOTE_ASSETS=1`。独立的四平台远程资源矩阵仍是唯一准备和发布远程连接资源的 job。

## Fix

在安装包 job 级别设置跳过开关，并由发布 workflow 测试断言每个安装包 job 都设置该开关、远程资源 job 不设置该开关。

## Alternatives considered

**继续在安装包 job 下载：** 这会重复大型网络下载、增加超时风险并混淆安装包与远程资源的所有权，因此不采用。

**只在 Windows 跳过：** Linux 和 macOS 安装包拥有相同的资源边界，只修 Windows 会留下重复工作和不一致行为，因此不采用。

## Consequences

安装包 job 更快，并且不依赖远程资源下载可用性。远程资源仍由独立矩阵完整构建，生产运行时继续解析 GitHub Release 资源。
