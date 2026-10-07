# Agent Note: Agent Note 校验兼容换行格式

Status: implemented

[English](2026-10-07-agent-note-crlf-format-check.md) | 中文

## Problem

文档门禁只按 LF 分割 Agent Note。Windows checkout 使用 CRLF 时，即使可见结构正确，也会因行尾回车导致标题校验失败。

## Root cause

`verify-agent-note-format.mjs` 使用 `raw.split("\\n")`，没有消除 CRLF 文件行尾的回车字符。

## Decision

校验器现在按 `/\\r?\\n/` 处理行尾，保持相同的结构规则，同时兼容 LF 与 CRLF。不会修改历史文档内容。

## Fix

将换行边界归一化放在校验器内部，避免对整个文档树进行无关的换行格式改写。

## Alternatives considered

- 把所有历史 Note 统一转换为 LF：拒绝，因为会产生无关的全量文档变更。
- 在每个字段比较处单独 trim：拒绝，因为统一分割更明确且更易维护。

## Consequences

Windows 与 Unix checkout 的文档检查结果一致；其他真实格式错误仍会按原规则失败。
