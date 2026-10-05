/**
 * ToolSetLoaderPort - 运行时端口，用于 LoadToolSet handler 加载和注册工具。
 * 职责：
 * - 查询工具是否已在 registry 中注册
 * - 注册新的工具到 registry
 * - 失效工具缓存，使模型可见最新的工具列表
 *
 * 设计原理：
 * - Handler 不直接访问 ToolRegistry 或运行时内部实现
 * - 通过依赖注入的端口完成所有运行时交互
 * - 便于测试和未来的运行时策略变更（如远程、云端工具加载）
 */

export interface ToolSetLoaderPort {
  /**
   * 检查工具是否已在当前会话的 registry 中注册。
   * @param toolName 工具名称
   * @returns true 如果工具已注册，false 否则
   */
  isToolRegistered(toolName: string): boolean;

  /**
   * 将工具注册到当前会话的 registry。
   * 如果工具已存在，覆盖其定义。
   *
   * @param toolEntry 工具条目（包含元数据、schema、handler）
   * @throws 如果注册失败（如工具定义无效）
   */
  registerTool(toolEntry: unknown): void;

  /**
   * 批量注册多个工具。
   * 用于工具集加载时的原子操作。
   *
   * @param toolEntries 工具条目数组
   * @throws 如果任何工具注册失败，整个操作回滚
   */
  registerTools(toolEntries: unknown[]): void;

  /**
   * 失效工具缓存，使模型在下一轮能看到最新注册的工具。
   * 必须在 registerTool(s) 之后调用，以确保模型能获取最新的工具面。
   */
  invalidateToolCache(): void;
}
