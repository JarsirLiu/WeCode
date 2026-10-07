# Agent Note: 将安装包下载链接放在 Release 资产列表上方

Status: implemented

[English](2026-10-07-release-installer-download-section.md) | 中文

## Problem

Release Assets 中同时包含安装包和大量远程连接资源，用户需要在资源列表中查找桌面安装包。GitHub 不提供工作流可控的 Assets 置顶排序。

## Decision

发布 job 在 Release 描述顶部生成 `Download installers` 区域，按 Linux、macOS、Windows 和架构列出 13 个安装包的稳定下载链接。重试时只替换这一段并保留下方 changelog。远程资源 manifest 和归档仍作为 Assets 发布，但不放入安装包下载区。

## Workflow change

`.github/workflows/release-desktop.yml` 维护安装包列表，并通过 `gh release edit --notes-file` 写回 Release 描述。发布流程测试会检查安装包链接契约和重试更新路径。

## Alternatives considered

- 依赖 GitHub Assets 排序：拒绝，因为排序不是稳定契约。
- 上传带前缀的重复安装包：拒绝，因为会增加体积并造成下载选择歧义。
- 从 Release 删除远程资源：拒绝，因为客户端仍需从同一 tag 下载这些资源。

## Consequences

用户可以在长 Assets 列表之前直接找到安装包链接；资源文件名和远程下载契约不变。
