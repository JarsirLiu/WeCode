export type PermissionResolutionErrorCode =
  | "not_authorized"
  | "request_not_found"
  | "runtime_unavailable";

/** Stable business classification for session permission resolution failures. */
export class PermissionResolutionError extends Error {
  readonly code: PermissionResolutionErrorCode;

  constructor(code: PermissionResolutionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermissionResolutionError";
    this.code = code;
  }
}
