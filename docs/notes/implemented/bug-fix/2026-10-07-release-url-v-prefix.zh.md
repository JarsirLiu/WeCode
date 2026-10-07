# Agent Note: Recognize v-prefixed release URLs

Status: implemented

[English](2026-10-07-release-url-v-prefix.md) | 中文

## Problem

运行时收到的 GitHub Release 基址以 `v3.14.3` 结尾，而应用版本是 `3.14.3`。解析器按字面比较字符串，先生成了无意义的 `/v3.14.3/3.14.3/` 请求，再请求正确地址。在慢网络上，这会消耗 manifest 超时时间，让有效的 Release 看起来像不可用。

## Decision

Release URL 解析会先去掉 URL 最后路径段的可选前导 `v`，再与唯一的应用版本比较。当前版本的 GitHub Release 基址只生成一个候选；未固定和版本不匹配的基址保持原有候选顺序。

## Root cause

固定基址检测只匹配 `/${version}` 后缀，没有归一化 Git tag 的前导 `v`。

## Fix

固定基址检测解析 URL 最后的路径段，并在比较前去掉可选的前导 `v`。

## Alternatives considered

- **把 Release URL 改成不带 `v`：** 拒绝，因为 GitHub tag 触发的 Release URL 规范上带 `v`。
- **用更长超时隐藏第一次请求：** 拒绝，因为这会保留错误请求，并让每次部署都变慢。

## Consequences

有效的 GitHub Release manifest 不再产生重复版本请求。回放测试锁定 `v` 前缀行为，同时保留未固定和版本不匹配基址的显式候选。
