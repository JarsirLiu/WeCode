import type { CodingPlanSubscriptionProviderId, StartPlanPreviewConfig } from "@zcode/shared";
import { useCallback, useEffect, useState } from "react";
import { useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import { normalizeErrorMessage as normalizeCodingPlanErrorMessage } from "@/settings/model-provider-section/useCodingPlanProducts.js";

interface StartPlanPreviewState {
  preview: StartPlanPreviewConfig | null;
  loading: boolean;
  error: string | null;
}

const START_PLAN_PREVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const previewCache = new Map<
  CodingPlanSubscriptionProviderId,
  { preview: StartPlanPreviewConfig | null; expiresAt: number }
>();
const previewRequest = new Map<
  CodingPlanSubscriptionProviderId,
  Promise<StartPlanPreviewConfig | null>
>();

export function useStartPlanPreview(options: {
  providerId: CodingPlanSubscriptionProviderId;
  enabled?: boolean;
}) {
  const services = useOptionalServices();
  const service = services?.codingPlanSubscriptionService;
  const enabled = options.enabled !== false;
  const [state, setState] = useState<StartPlanPreviewState>({
    // cache 只有重新通过 catalog gate 后才能进入 state，避免关闭模块时闪现旧 preview。
    preview: null,
    loading: enabled && Boolean(service),
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({
        preview: previewCache.get(options.providerId)?.preview ?? null,
        loading: false,
        error: null,
      });
      return;
    }
    if (!service || typeof service.getStartPlanPreview !== "function") {
      setState({
        preview: null,
        loading: false,
        error: "service_unavailable",
      });
      return;
    }

    setState({
      // gate 重新确认完成前不显示旧缓存，避免模块关闭后短暂暴露旧 preview。
      preview: null,
      loading: true,
      error: null,
    });

    try {
      const preview = await loadStartPlanPreview(service, options.providerId);
      setState({
        preview,
        loading: false,
        error: null,
      });
    } catch (error) {
      // Start Plan preview 和套餐列表共用 client/configs。
      // 远端返回 HTML/非 JSON 时也不能把解析错误原样显示到升级面板。
      const message = normalizeCodingPlanErrorMessage(error);
      logger.warn("[useStartPlanPreview] 读取 Start Plan 预览失败", {
        error: message,
      });
      setState({
        preview: null,
        loading: false,
        error: message,
      });
    }
  }, [enabled, options.providerId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

async function loadStartPlanPreview(
  service: NonNullable<ReturnType<typeof useOptionalServices>>["codingPlanSubscriptionService"],
  providerId: CodingPlanSubscriptionProviderId,
): Promise<StartPlanPreviewConfig | null> {
  const now = Date.now();
  if (typeof service.isPlanModuleCatalogEnabled === "function") {
    // 缓存命中前重新检查生命周期，避免模块关闭后继续展示旧 preview。
    if (!(await service.isPlanModuleCatalogEnabled(providerId))) {
      previewCache.delete(providerId);
      return null;
    }
  }
  const cached = previewCache.get(providerId);
  if (cached && cached.expiresAt > now) {
    return cached.preview;
  }
  const pending = previewRequest.get(providerId);
  if (pending) {
    return pending;
  }

  // 预览缓存按 provider 隔离，避免一个 Start 模块的结果绕过另一个模块的 catalog 关闭状态。
  const request = service.getStartPlanPreview({ providerId });
  previewRequest.set(providerId, request);
  try {
    const preview = await request;
    // 修复：catalog 关闭时 service 返回 null；null 不能写入 24h 缓存，
    // 否则关闭状态会被固化，模块重新启用后缓存仍宣称"已加载且为空"。
    if (preview !== null) {
      previewCache.set(providerId, {
        preview,
        expiresAt: now + START_PLAN_PREVIEW_CACHE_TTL_MS,
      });
    } else {
      previewCache.delete(providerId);
    }
    return preview;
  } finally {
    if (previewRequest.get(providerId) === request) {
      previewRequest.delete(providerId);
    }
  }
}
