import { useEffect, useState } from "react";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

/** 六个内置套餐模块的 provider ID；UI 投影统一按它们的显式 catalog 结果过滤。 */
export const BUILTIN_PLAN_PROVIDER_IDS = [
  BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
  BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
  BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
  BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
  BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan,
  BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan,
] as const;

export interface PlanModuleCatalogState {
  /**
   * providerId -> 显式 catalog 结果。只有 true 放行；缺失（含查询失败）按未启用处理。
   * null 表示 service 未暴露门禁方法（旧 Host），投影面按既有行为展示。
   */
  catalogEnabled: Record<string, boolean> | null;
  /** 查询是否已落定。false = 查询中，投影面先隐藏，避免已关闭模块闪现。 */
  ready: boolean;
}

export function isPlanModuleSurfaceVisible(
  catalogState: PlanModuleCatalogState | null | undefined,
  providerId: string,
): boolean {
  // 未接入门禁按既有行为展示，避免未迁移的调用面整体消失。
  if (!catalogState) {
    return true;
  }
  if (!catalogState.ready) {
    // 查询中先隐藏：默认全部 catalog-disabled，闪一帧就是“已经看到了”。
    return false;
  }
  if (catalogState.catalogEnabled === null) {
    // 旧 Host 不暴露门禁方法：保持既有行为，不做 fail-closed 升级。
    return true;
  }
  return catalogState.catalogEnabled[providerId] === true;
}

export function hasAnyPlanModuleSurfaceVisible(
  catalogState: PlanModuleCatalogState | null | undefined,
): boolean {
  return BUILTIN_PLAN_PROVIDER_IDS.some((providerId) =>
    isPlanModuleSurfaceVisible(catalogState, providerId),
  );
}

// 注册表生命周期在进程内不可变；查询落定后缓存即权威，后续挂载不再重复读取。
let cachedState: PlanModuleCatalogState | null = null;
let cachedRead: Promise<PlanModuleCatalogState> | null = null;

function readPlanModuleCatalogState(
  service: Pick<
    ReturnType<typeof useServices>["codingPlanSubscriptionService"],
    "isPlanModuleCatalogEnabled"
  >,
): Promise<PlanModuleCatalogState> {
  const gate = service.isPlanModuleCatalogEnabled;
  if (typeof gate !== "function") {
    // 旧 Host 未实现门禁：不做 fail-closed 升级，投影面保持既有行为。
    return Promise.resolve({ catalogEnabled: null, ready: true });
  }
  return Promise.all(
    BUILTIN_PLAN_PROVIDER_IDS.map(async (providerId) => {
      try {
        return [providerId, await gate(providerId)] as const;
      } catch (error) {
        // 查询失败与已确认关闭分开记录：失败按未启用处理，不默认放行。
        logger.warn("[planModules] 读取套餐模块 catalog 状态失败", { providerId, error });
        return [providerId, false] as const;
      }
    }),
  ).then((entries) => ({
    catalogEnabled: Object.fromEntries(entries),
    ready: true,
  }));
}

export function usePlanModuleCatalogState(): PlanModuleCatalogState {
  const { codingPlanSubscriptionService } = useServices();
  const [state, setState] = useState<PlanModuleCatalogState | null>(cachedState);

  useEffect(() => {
    if (cachedState) {
      return;
    }
    let cancelled = false;
    void (cachedRead ??= readPlanModuleCatalogState(codingPlanSubscriptionService)).then((next) => {
      cachedState = next;
      if (!cancelled) {
        setState(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [codingPlanSubscriptionService]);

  return state ?? { catalogEnabled: null, ready: false };
}
