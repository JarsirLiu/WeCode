import { readSafeLocalStorage, writeSafeLocalStorage } from "./browserEnvironment.js";

export type UiFontFamily = "system" | "pingfang" | "yahei" | "noto-sans-sc" | "segoe";

export const UI_FONT_FAMILY_STORAGE_KEY = "zcode-ui-font-family";

export const UI_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: UiFontFamily;
  labelId: string;
}> = [
  { value: "system", labelId: "settings.uiFontFamily.option.system" },
  { value: "pingfang", labelId: "settings.uiFontFamily.option.pingfang" },
  { value: "yahei", labelId: "settings.uiFontFamily.option.yahei" },
  { value: "noto-sans-sc", labelId: "settings.uiFontFamily.option.notoSansSc" },
  { value: "segoe", labelId: "settings.uiFontFamily.option.segoe" },
];

const DEFAULT_UI_FONT_FAMILY: UiFontFamily = "system";

const UI_FONT_FAMILY_STACKS: Record<UiFontFamily, string> = {
  system:
    '"PingFang SC", "苹方-简", "Segoe UI Variable", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
  pingfang:
    '"PingFang SC", "苹方-简", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
  yahei:
    '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "苹方-简", "Noto Sans SC", "Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
  "noto-sans-sc":
    '"Noto Sans SC", "PingFang SC", "苹方-简", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
  segoe:
    '"Segoe UI Variable", "Segoe UI", "PingFang SC", "苹方-简", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
};

export function normalizeUiFontFamily(value: unknown): UiFontFamily {
  return UI_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
    ? (value as UiFontFamily)
    : DEFAULT_UI_FONT_FAMILY;
}

export function loadUiFontFamily(): UiFontFamily {
  return normalizeUiFontFamily(readSafeLocalStorage(UI_FONT_FAMILY_STORAGE_KEY));
}

export function applyUiFontFamily(fontFamily: UiFontFamily): void {
  const rootStyle = typeof document === "undefined" ? undefined : document.documentElement?.style;
  if (!rootStyle?.setProperty) return;
  rootStyle.setProperty("--font-sans", UI_FONT_FAMILY_STACKS[normalizeUiFontFamily(fontFamily)]);
}

export function persistUiFontFamily(fontFamily: UiFontFamily): UiFontFamily {
  const normalized = normalizeUiFontFamily(fontFamily);
  writeSafeLocalStorage(UI_FONT_FAMILY_STORAGE_KEY, normalized);
  applyUiFontFamily(normalized);
  return normalized;
}
