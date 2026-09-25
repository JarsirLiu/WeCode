# Agent Note: Stealth mode for capture-content exclusion

Status: proposed

[中文](2026-09-25-stealth-mode-invisible-capture.zh.md)

## Problem

Office users often run WeCode alongside remote meetings, screen shares, and recordings. The application can display conversation history, model output, and sensitive configuration that the presenter does not want in a shared capture.

The required behavior is narrower than an absolute invisibility guarantee: on supported Windows versions, WeCode should remain usable locally while its pixels are excluded from ordinary OS-level capture. The feature must not claim that WeCode disappears from a meeting client's window picker, that every capture implementation can be blocked, or that macOS and Linux provide equivalent behavior.

WeCode already has product-internal capture paths for screenshots, browser recording, and CUA readiness. A capture-exclusion setting therefore needs an explicit boundary between external capture protection and captures intentionally initiated by WeCode itself.

## Proposal

Add a desktop-only `stealthModeEnabled` setting in the General settings section. When enabled, the desktop main process applies Electron's existing `BrowserWindow.setContentProtection(true)` to each eligible WeCode top-level window; when disabled, it applies `setContentProtection(false)` without requiring a restart.

On Windows 10 version 2004 and later, Electron documents this API as calling `SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE`, which removes the window's pixels from supported capture output. Older Windows versions can produce a black captured window because the system falls back to `WDA_MONITOR`; they must be reported as degraded rather than presented as fully invisible.

On macOS, Electron uses `NSWindowSharingNone`, but its own Electron 41 type documentation warns that newer ScreenCaptureKit-based applications may still capture the window. On Linux the API is unsupported. The setting therefore remains available only where the desktop product chooses to expose it, and its UI must show a platform limitation whenever the current platform or capture path cannot provide the documented Windows behavior.

The implementation will not add a Node-API module or invent X11/Wayland capture protocols. Electron already owns the Windows and macOS native calls, while no equivalent public Linux primitive exists in the current stack.

The main process will centralize an eligible-window policy and apply the setting to every eligible top-level window at creation time and when the setting changes. The policy will cover the independently created application windows identified in the desktop package, while excluding CUA indicator windows and other windows that are intentionally not part of the application surface. Newly created windows must receive the setting before they are shown; re-application after show, hide, maximize, unmaximize, or display changes will be added only where platform testing demonstrates that the state can be lost.

The first implementation will define internal capture behavior explicitly: WeCode's own screenshot and browser-recording flows remain opt-in product actions and must not silently inherit a policy that makes their intended source incomplete. CUA screen-capture readiness and operation indicators must remain functional. A per-source exception API is deferred until these existing paths have documented tests and ownership.

## Affected surfaces

- **Settings contract** — `packages/shared/src/validationAppSettings.ts` and `packages/shared/src/protocol.ts`: add `stealthModeEnabled`, defaulting to `false`, to the object schema, patch schema, and hand-maintained `AppSettings` type.
- **Settings persistence** — the existing settings service writes and reads the new key through the current schema; no settings-sync category is added because this is a local desktop behavior.
- **Renderer settings UI** — `packages/ui/src/settingsPageHelpers.tsx` and `packages/ui/src/SettingsPage.tsx`: add one desktop-only General-section row and an honest limitation description; use the existing settings update path without adding a telemetry event.
- **Locale resources** — `packages/ui/src/i18n/locales/en-US.ts` and `packages/ui/src/i18n/locales/zh-CN.ts`: add the label, description, active state, and degraded-support text using the repository's TypeScript locale format.
- **Main-process settings application** — `packages/desktop/src/main/index.ts`: extend `syncImmediateAppSettings` and the initial settings read so existing and newly created eligible windows are updated.
- **Window lifecycle** — `packages/desktop/src/main/desktopWindowChrome.ts`, `packages/desktop/src/main/desktopWindowLifecycle.ts`, and the independent `BrowserWindow` creation sites in the desktop package: apply the persisted value before showing each eligible window and avoid silently omitting secondary windows.
- **Internal capture paths** — `packages/ui/src/components/ai-elements/prompt-input-actions.tsx`, `packages/desktop/src/main/browserView/electronBrowserWebmRecorder.ts`, and the CUA capture/readiness code: document and test whether each path intentionally includes or excludes WeCode content; do not add a future exception interface without an owner.
- **Packaging** — no native binary, `asarUnpack` entry, electron-rebuild step, or platform-specific signing path is added by this proposal.
- **Telemetry** — no new remote event is emitted for enabling or disabling this privacy control.

## Alternatives considered

**Add a new cross-platform native module:** Rejected because Windows would duplicate the API Electron 41 already calls, macOS still cannot guarantee exclusion from ScreenCaptureKit, and Linux has no equivalent public application-side primitive. It would add native build, packaging, signing, and maintenance cost without improving the supported guarantee.

**Promise true invisibility on Windows, macOS, and Linux:** Rejected because capture behavior is controlled by the operating system and the capture client. The implementation can exclude pixels on supported Windows capture paths, but it cannot remove the window from another process's window enumeration or guarantee protection from driver-level and compositor-specific capture.

**Use `_NET_WM_BYPASS_COMPOSITOR`, Dock window types, or foreign-toplevel protocols on Linux:** Rejected because those mechanisms do not define screen-capture exclusion and are not present in the current desktop integration.

**Hide or move WeCode to another virtual desktop:** Rejected because it changes user desktop behavior, does not provide a stable capture guarantee, and breaks the meeting workflow that requires the user to keep reading WeCode locally.

**Use CSS or canvas masking:** Rejected because it only affects renderer-controlled screenshots and cannot control OS-level screen capture.

**Put the toggle in a separate Privacy section:** Rejected for this iteration because the General section already owns desktop-only behavior switches; revisit when meeting recording and per-source capture policy become independently owned features.

## Acceptance criteria

- Enabling the setting updates all eligible existing desktop windows without a restart, and disabling it restores normal capture behavior.
- On Windows 10 version 2004 or later with normal DWM composition, an automated desktop test confirms that an eligible window's pixels are excluded from the tested OS capture path without a black rectangle or replacement layout occupying its bounds.
- The UI does not claim that the window is removed from Teams, Zoom, or another client's window picker, and does not claim protection from driver-level, virtual-machine, or compositor-specific capture.
- Windows versions below 2004 show a degraded-support explanation because the documented fallback may capture a black window.
- macOS shows a limitation for ScreenCaptureKit-based capture, and Linux does not report the Windows guarantee as supported.
- Every eligible independently created `BrowserWindow` receives the persisted setting before it is shown; CUA indicator windows retain their existing behavior.
- The setting behavior survives the tested show, hide, maximize, unmaximize, and window-recreation paths without silently reverting.
- WeCode's own screenshot, browser-recording, and CUA capture flows have explicit tests describing whether they intentionally include or exclude WeCode content.
- The setting is visible only on the desktop General settings surface, persists across restarts through the existing setting service, and emits no new telemetry event.

## Risks

- Windows capture exclusion is not a security or DRM feature. A capture client can still enumerate the window, use a different capture path, or read the display below the operating-system window-affinity layer.
- Older Windows versions may show a black capture result, so the UI must distinguish degraded support from the supported Windows 2004+ behavior.
- macOS ScreenCaptureKit and Linux compositor behavior can bypass or lack the requested exclusion; the product must not present those platforms as equivalent.
- Applying protection to every secondary window can hide dialogs that the user expects to share. The eligible-window policy and internal capture tests must make the ownership boundary explicit.
- WeCode's own screenshot and recording features can produce incomplete captures if they inherit external capture protection without an explicit product decision.
- The feature touches several independent window creation sites. Missing one creates inconsistent privacy behavior, so the window inventory and lifecycle tests must be maintained with the implementation.
