import { useCallback, useEffect, useState } from "react";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useCodingPlanEntitlements } from "@/settings/model-provider-section/useCodingPlanEntitlements.js";
import {
  BUILTIN_MODEL_PROVIDER_IDS,
  getModelProviderFamilySpec,
  type EnterpriseCodingPlanPricingProduct,
} from "@zcode/shared";
import { buildOwnedEntryPlanList } from "@/lib/codingPlanOwnedEntryPlans.js";
import { resolveAccountProviderInspectionAccess } from "@/lib/accountProviderAccess.js";
import { logger } from "@/logger.js";

export interface CodingPlanEntryInventory {
  entryPlanList: string;
  status: "loading" | "error" | "ready";
  retry: () => void;
}

export function useCodingPlanEntryPlanList(): CodingPlanEntryInventory {
  const { state, reload } = useProviderSettingsView();
  const providerSettingsView = state.status === "ready" ? state.view : null;
  const loading = state.status === "loading";
  const { credentialService, codingPlanSubscriptionService } = useServices();
  const user = useZCodeStore((state) => state.user);
  // 不传当前选中的团队上下文，四种 Start/个人连接分别使用已有权益缓存。
  const { entitlements, refresh } = useCodingPlanEntitlements({
    providerSettingsView,
    suppressProviderFingerprintAutoRefresh: true,
  });
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => {
    if (state.status === "error") reload();
    setGeneration((value) => value + 1);
  }, [state.status, reload]);
  const [teams, setTeams] = useState<{
    user: typeof user;
    view: typeof providerSettingsView;
    sources: { token: string | null; products: EnterpriseCodingPlanPricingProduct[] | null }[];
    catalogEnabled: Record<string, boolean | null> | null;
    catalogReady: boolean;
    generation: number;
  } | null>(null);
  useEffect(() => {
    if (!providerSettingsView) return;
    let cancelled = false;
    const entryProviderIds = [
      BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
      BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
      BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
      BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
      BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan,
      BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan,
    ] as const;
    // 团队订阅以 authenticated pricing/customer 项目快照为准，不用静态商品目录推断已购套餐。
    void Promise.all([
      refresh({ force: true, silent: true }),
      Promise.all(
        entryProviderIds.map(async (providerId) => {
          try {
            return [
              providerId,
              await codingPlanSubscriptionService.isPlanModuleCatalogEnabled(providerId),
            ] as const;
          } catch (error) {
            // 修复：catalog 状态查询失败 ≠ 模块已关闭。失败用 null 记录，
            // 入口过滤对非 true 一律 fail-closed，绝不当作"模块可用"。
            logger.warn("[purchaseTelemetry] 读取套餐模块 catalog 状态失败", {
              providerId,
              error,
            });
            return [providerId, null] as const;
          }
        }),
      ),
      Promise.all(
        (["bigmodel", "zai"] as const).map(async (family) => {
          let token: string | null = null;
          try {
            // catalog-disabled 是确定的关闭结果；不再查询团队 pricing 构造购买入口。
            if (
              !(await codingPlanSubscriptionService.isPlanModuleCatalogEnabled(
                getModelProviderFamilySpec(family).teamCodingPlanProviderId,
              ))
            ) {
              return { token: null, products: [] };
            }
            token = (await credentialService.load(`oauth:${family}:access_token`))?.trim() || null;
            if (!token) return { token, products: [] };
            const result = await codingPlanSubscriptionService.getEnterprisePricing({
              authenticated: true,
              family,
            });
            return { token, products: result.productList };
          } catch (error) {
            logger.warn("[purchaseTelemetry] 读取团队套餐失败", { family, error });
            return { token, products: null };
          }
        }),
      ),
    ]).then(([, catalogEntries, sources]) => {
      if (!cancelled)
        setTeams((previous) => ({
          user,
          view: providerSettingsView,
          generation,
          catalogEnabled: Object.fromEntries(catalogEntries),
          catalogReady: catalogEntries.every(([, enabled]) => enabled !== null),
          sources: sources.map((source, index) => {
            // 刷新失败不等于未购；仅在账号、family 和凭据一致时复用成功结果。
            const cached = previous?.sources[index];
            return source.products === null &&
              source.token &&
              previous?.user === user &&
              cached?.token === source.token
              ? { ...source, products: cached.products }
              : source;
          }),
        }));
    });
    return () => {
      cancelled = true;
    };
  }, [
    credentialService,
    codingPlanSubscriptionService,
    user,
    providerSettingsView,
    generation,
    loading,
    refresh,
  ]);
  const sameIdentity = teams?.user === user && teams.view === providerSettingsView;
  const current = sameIdentity && teams.generation === generation;
  const catalogReady = sameIdentity && teams.catalogReady;
  const usableTeams = sameIdentity && teams.sources.every((source) => source.products !== null);
  const planIds: readonly string[] = [
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
    BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
  ];
  // 账号模型没有 Personal API Key；只把 catalog 明确启用的模块纳入购买入口库存。
  // fail-closed：catalog 状态缺失（未加载或查询失败的 null）一律不进入口，
  // 只有显式 true 才视为可购买，避免查询失败被默认为"模块可用"。
  const required = planIds
    .filter(
      (providerId) =>
        teams?.catalogEnabled?.[providerId] === true &&
        resolveAccountProviderInspectionAccess(providerSettingsView, providerId),
    )
    .map((providerId) => entitlements[providerId]);
  // 错误描述的是本次刷新，不能否定仍可用的历史快照（含成功确认未开通）。
  const missing = required.filter((item) => {
    const snapshot = item?.snapshot;
    return (
      !snapshot ||
      (snapshot.unavailableReason !== "no_plan" &&
        (!snapshot.authenticated || snapshot.unavailableReason))
    );
  });
  const pending = loading || !current || missing.some((item) => item?.loading);
  const failed = !usableTeams || !catalogReady || missing.length > 0;
  const status =
    state.status === "error" ? "error" : pending ? "loading" : failed ? "error" : "ready";
  useEffect(() => {
    logger.debug("[purchaseTelemetry] 套餐入口查询状态", {
      status,
      configuredSources: required.length,
      generation,
    });
  }, [status, required.length, generation]);
  return {
    status,
    retry,
    entryPlanList:
      status === "ready"
        ? buildOwnedEntryPlanList({
            snapshots: required.map((item) => item?.snapshot),
            teamProducts: teams?.sources.flatMap((source) => source.products ?? []) ?? [],
          })
        : "",
  };
}
