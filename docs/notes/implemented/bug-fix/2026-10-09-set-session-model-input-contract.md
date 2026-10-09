# Agent Note: SetSessionModel input contract

Status: implemented

中文：[中文版](2026-10-09-set-session-model-input-contract.zh.md)

## Problem

The model-facing tool accepted arbitrary model catalog objects and forwarded display-only fields such as `enabled` to the strict `task/setModel` protocol. Requests could therefore fail at the Host boundary. Models that require a reasoning level could also pass the tool boundary and fail later during V4 execution.

## Root cause

The tool contract used an open-ended record instead of the shared wire shape, and the handler forwarded that record without consulting the model catalog for a default reasoning level.

## Decision

The contracts package validates `SetSessionModel.modelSelection` as a strict `providerId`/`modelId` selection with an optional `options.reasoningLevel`. The handler looks up the active model catalog and supplies its default reasoning level when the caller omitted one. Only this protocol-shaped selection is sent to the task port.

## Fix

The contracts boundary now uses a local strict schema equivalent to the protocol selection shape, avoiding the incompatible Zod package types across workspace packages. The handler normalizes the validated selection before calling `setModel`.

## Alternatives considered

Widening the Host protocol schema, forwarding catalog rows and silently stripping fields in the Host, or making every model caller provide a reasoning level were rejected. The tool boundary owns input normalization and the model catalog remains the source for its default.

## Consequences

Invalid catalog display objects fail before any task command is sent. Models with a catalog default no longer fail later because `thought` was empty. If a model has no default, the Host still returns its explicit validation error.

## Testing

The no-key `SetSessionModel` wiring replay verifies strict rejection of display fields and forwarding of a default reasoning level through the executor and task port.
