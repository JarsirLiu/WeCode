export type PermissionResolutionErrorCode =
  | "not_authorized"
  | "manual_policy"
  | "request_not_found"
  | "allow_always_not_supported"
  | "runtime_unavailable";

/** Stable business classification for delegated approval failures. */
export class PermissionResolutionError extends Error {
  readonly code: PermissionResolutionErrorCode;

  constructor(code: PermissionResolutionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermissionResolutionError";
    this.code = code;
  }
}
