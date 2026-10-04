// ============================================================
// ToolSetLoaderPort Implementation
// ============================================================
// 运行时为 LoadToolSet handler 提供的工具集加载端口实现。
// 职责：管理工具注册、缓存失效等运行时操作。

import type { ToolSetLoaderPort } from "@zcode/contracts";
import type { ToolEntry } from "../../../tool/types.js";
import type { AgentRuntimeInternal } from "../internal.js";

/**
 * 为当前运行时实例创建 ToolSetLoaderPort。
 * 这个端口允许 LoadToolSet handler 通过标准接口加载和注册工具。
 */
export function createToolSetLoaderPort(runtime: AgentRuntimeInternal): ToolSetLoaderPort {
  return {
    isToolRegistered(toolName: string): boolean {
      return runtime.registry.has(toolName);
    },

    registerTool(toolEntry: ToolEntry): void {
      runtime.registry.register(toolEntry);
    },

    registerTools(toolEntries: ToolEntry[]): void {
      // 批量注册：如果任何一个失败，整个操作应该回滚（但当前 registry 不支持原子操作）
      // TODO: 如果需要原子语义，可以在 ToolRegistry 中添加 registerMany + rollback 支持
      for (const entry of toolEntries) {
        runtime.registry.register(entry);
      }
    },

    invalidateToolCache(): void {
      // 调用运行时的缓存失效方法，使模型在下一轮能看到最新的工具列表
      runtime.invalidateToolCache();
    },
  };
}
