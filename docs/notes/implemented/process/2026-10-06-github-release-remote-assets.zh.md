# Agent Note: 将远程连接资源发布到 GitHub Releases

Status: implemented

English | [中文](2026-10-06-github-release-remote-assets.md)

## Problem

CI 虽然构建了远程连接资源，但运行时 URL 与 GitHub Release 的资产布局不一致。Release 资产是扁平命名空间，不同平台的同名文件可能互相覆盖；缺少 tag 的基址也无法定位实际发布资产。

## Decision

打 tag 构建时，将精确的 `https://github.com/<repo>/releases/download/<tag>` 基址编译进桌面端。运行时识别这个已经固定到 GitHub Release 的地址，不再追加普通 zcode CDN 路径。打包器为每个组件归一化平台前缀，发布阶段从扁平化的 artifact 目录严格校验并上传五个平台的 manifest 与唯一命名的归档文件。

手动 workflow 构建保持 Release 基址为空，因此继续使用普通开发态/默认 CDN 行为；手动构建不会创建 Release。

## Workflow change

发布 workflow 为每个矩阵任务只选择一个远程平台，严格校验五个平台的归一化 manifest，并在唯一拥有 Release 写权限的任务中按 manifest 和文件名前缀收集扁平资产。桌面测试覆盖 URL 解析，同时继续要求类型检查、Lint、架构、大小棘轮和文档门禁。

## Alternatives considered

- 发布资产继续回退到 zcode CDN，会掩盖 Release 上传不完整的问题，也会让生产资源来源不明确。
- 保留 artifact 子目录不可行，因为 GitHub Release 资产按文件名寻址，不保留目录层级。

## Consequences

Release 资产可以独立寻址，不同平台组件不会互相覆盖。发布前必须存在五个平台的 manifest 及对应归档文件。既有非 Release CDN 行为保持不变。
