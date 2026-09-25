import {
  getBuiltinPlanModuleIds,
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
