import {
  getBuiltinPlanModuleIds,
  resolvePlanModuleIdByProviderId,
  type PlanModuleId,
  type PlanModuleLifecycle,
} from "@zcode/shared";

export interface PlanModuleRegistryOptions {
  readonly lifecycles?: Partial<Record<PlanModuleId, PlanModuleLifecycle>>;
}

export interface PlanModuleRegistry {
  getLifecycle(moduleId: string): PlanModuleLifecycle | null;
  isRegistered(moduleId: string): moduleId is PlanModuleId;
  isEnabled(moduleId: string): boolean;
  isCatalogEnabled(moduleId: string): boolean;
  isRuntimeEnabled(moduleId: string): boolean;
}

const DEFAULT_LIFECYCLE: PlanModuleLifecycle = "enabled";

export function createPlanModuleRegistry(
  options: PlanModuleRegistryOptions = {},
): PlanModuleRegistry {
  const lifecycles = new Map<PlanModuleId, PlanModuleLifecycle>();
  for (const moduleId of getBuiltinPlanModuleIds()) {
    lifecycles.set(moduleId, options.lifecycles?.[moduleId] ?? DEFAULT_LIFECYCLE);
  }

  const getLifecycle = (moduleId: string): PlanModuleLifecycle | null =>
    lifecycles.get(moduleId as PlanModuleId) ?? null;
  const isRegistered = (moduleId: string): moduleId is PlanModuleId =>
    lifecycles.has(moduleId as PlanModuleId);
  const isEnabled = (moduleId: string): boolean => getLifecycle(moduleId) === "enabled";
  const isCatalogEnabled = (moduleId: string): boolean => getLifecycle(moduleId) === "enabled";
  const isRuntimeEnabled = (moduleId: string): boolean => {
    const lifecycle = getLifecycle(moduleId);
    return lifecycle === "enabled" || lifecycle === "catalog-disabled";
  };

  return Object.freeze({
    getLifecycle,
    isRegistered,
    isEnabled,
    isCatalogEnabled,
    isRuntimeEnabled,
  });
}

/**
 * 判断某个模型 provider 当前是否允许加载套餐目录（catalog）。
 *
 * 这是 catalog 门禁的唯一判定入口，供 subscription service 与测试共用：
 * - 未携带 providerId（历史兼容调用）→ 放行，保持既有行为；
 * - providerId 不属于任何内置套餐模块（如 openai-api）→ 放行，门禁只约束套餐模块；
 * - 命中已注册模块 → 仅 enabled 生命周期放行，catalog-disabled/runtime-disabled/retired 一律关闭；
 * - 任何未知模块 ID 在 registry 侧即 fail-closed。
 */
export function isPlanModuleCatalogEnabledForProvider(
  registry: PlanModuleRegistry,
  providerId?: string,
): boolean {
  if (!providerId) return true;
  const moduleId = resolvePlanModuleIdByProviderId(providerId);
  return moduleId === null || registry.isCatalogEnabled(moduleId);
}
