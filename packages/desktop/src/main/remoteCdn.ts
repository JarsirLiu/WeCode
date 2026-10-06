import { ZCODE_VERSION, type ZCodeEnv } from "@zcode/shared";

declare const __ZCODE_CDN_BASE_URL__: string | undefined;
const DEFAULT_CDN_BASE_URL = "https://cdn-zcode.z.ai";

export interface ResolveRemoteCdnOptions {
  env?: ZCodeEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

function isGitHubReleaseDownloadBase(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "github.com" && /\/releases\/download\/[^/]+$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl =
    process.env.ZCODE_CDN_BASE_URL?.trim() ||
    (typeof __ZCODE_CDN_BASE_URL__ === "undefined" ? "" : __ZCODE_CDN_BASE_URL__) ||
    DEFAULT_CDN_BASE_URL;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (isGitHubReleaseDownloadBase(normalizedBaseUrl)) {
    return [normalizedBaseUrl];
  }
  return [
    `${normalizedBaseUrl}/zcode/electron/releases/${options.version ?? ZCODE_VERSION}`,
  ];
}
