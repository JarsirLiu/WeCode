# Agent Note: MCP tool contract validation

Status: implemented

中文：[中文版](2026-10-06-mcp-tool-contract-validation.zh.md)

## Problem

The MCP tool list described manually maintained JSON schemas while the Host handler accepted unchecked records. This allowed advertised options to be ignored and undocumented aliases to be silently accepted.

## Decision

The server treats the MCP contracts package as the sole definition of externally visible tool inputs. Transport-specific inputs remain distinct from AI ToolEntry inputs; commonality is enforced at the Host service operation, not by reusing a handler with a different trust context.

## Root cause

MCP tool descriptions and schemas were copied into the server adapter instead of being executable contracts. The `read_session` schema exposed incremental-read options that its Host call dropped, and `send_session_message` accepted an undocumented `text` alias.

## Fix

The MCP-facing Zod schemas and descriptions now live in the contracts package. MCP `tools/list` derives JSON Schema from them and Host dispatch validates every call against the same runtime schema. `read_session` forwards `messageLimit` and `afterSeq`; undeclared fields are rejected. Application AI keeps its separate ToolEntry and caller-session execution context while both surfaces call the same Host services.

## Affected surfaces

The contracts package, MCP server adapter and Host handler, MCP specification, and no-secret server protocol tests are updated. The server bundles the workspace contracts package as part of its existing server runtime.

## Alternatives considered

**Call application AI handlers directly:** rejected because those handlers require the AI caller session, ToolExecutor permission and cancellation context, while MCP identifies an externally managed target session and applies Host workspace authorization.

**Keep handwritten MCP JSON Schema and trust callers:** rejected because schema and runtime behavior had already drifted, and the MCP SDK does not perform this Host-level validation for tool arguments.

**Accept aliases or infer missing arguments:** rejected because it hides client/schema errors and can route an operation with unintended data.

## Consequences

MCP's public arguments remain transport-specific, but their advertised and executed contracts cannot drift independently. Invalid or undocumented inputs fail explicitly; callers must use the schema returned by `tools/list`.
