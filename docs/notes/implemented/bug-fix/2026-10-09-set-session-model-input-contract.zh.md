# Agent Note: SetSessionModel 输入契约

Status: implemented

English：[English](2026-10-09-set-session-model-input-contract.md)

## Problem

模型目录行曾被直接作为工具输入转发，`enabled` 等展示字段进入严格的 `task/setModel` 协议，导致 Host 拒绝请求。需要推理档位的模型也可能通过工具边界，却在 V4 执行阶段才因 `thought` 为空失败。

## Root cause

工具契约使用了开放记录而不是协议模型选择形状，handler 也没有在转发前从模型目录补齐默认推理档位。

## Decision

contracts 包严格校验 `SetSessionModel.modelSelection`，只允许 `providerId`、`modelId` 和可选的 `options.reasoningLevel`。调用方未提供推理档位时，handler 从当前模型目录读取默认值并补齐。送入 task port 的对象始终是协议形状的模型选择。

## Fix

contracts 边界使用与协议等价的本地严格 schema，避免 workspace 包之间 Zod 类型实例不兼容。handler 在调用 `setModel` 前对已校验选择进行归一化。

## Alternatives considered

放宽 Host 协议、把完整目录行转发后由 Host 静默清洗，或要求所有调用方自行填写推理档位，都会模糊边界或重复目录逻辑，因此不采用。输入归一化由工具边界负责，默认值仍由模型目录提供。

## Consequences

包含展示字段的目录对象会在发送 task 命令前失败，不会产生副作用。目录提供默认档位的模型不会再因空 `thought` 延迟失败。没有默认档位的模型仍由 Host 返回明确的校验错误。

## Testing

无密钥 `SetSessionModel` wiring 回放覆盖了展示字段的严格拒绝，以及默认推理档位经 executor 和 task port 的转发。
