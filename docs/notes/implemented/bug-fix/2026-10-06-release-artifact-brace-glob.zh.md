# Agent Note: 修复 GitHub Release 安装包上传 glob

Status: implemented

English | [English](2026-10-06-release-artifact-brace-glob.md)

## Problem

Linux 和 macOS 安装包构建步骤已经产出文件，但 `actions/upload-artifact` 在上传阶段将 `*.{dmg,zip}` 和 `*.{AppImage,deb,rpm,pkg.tar.zst}` 当作字面路径，导致发布任务失败。

## Root cause

`actions/upload-artifact` 使用 `@actions/glob` 解析路径，不执行 shell 的 brace expansion。工作流把 shell 语法误用于 action 输入，构建器因此无法匹配任何产物。

## Decision

发布 workflow 对每种安装包扩展名使用一条显式的 `@actions/glob` 规则，构建和发布阶段继续复用现有产物名称与校验边界。

## Fix

每个安装包扩展名改为独立的 glob 行，保留构建、文件名校验和发布资产选择逻辑不变，并增加静态 workflow 测试防止 brace glob 回归。

## Alternatives considered

**上传整个 dist 目录：** 会把 blockmap、yml 或临时目录等非发布安装包带入 artifact，扩大诊断和发布边界，因此不采用。

**依赖 shell 预展开路径：** action 输入由 action 自己解析，shell 不会处理该字段；不可靠，因此不采用。

## Consequences

构建产物和上传 artifact 的边界保持明确，Linux 四种格式与 macOS 两种格式都能被 action 匹配。工作流增加少量重复路径，但避免了“构建成功、上传失败”的发布故障。
