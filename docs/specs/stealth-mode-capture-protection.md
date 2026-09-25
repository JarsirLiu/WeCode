# WeCode stealth mode capture protection

## Product rule

`stealthModeEnabled` is a desktop-only General setting, disabled by default. When enabled, the desktop main process applies Electron content protection to eligible WeCode top-level windows. The feature excludes window pixels only on capture paths supported by the operating system; it does not remove the window from another process's window picker and is not a DRM or security boundary.

Windows 10 version 2004 and later is the primary supported target for the documented behavior. Older Windows versions, macOS ScreenCaptureKit paths, and Linux are degraded or unsupported and must not be described as equivalent to the primary target.

## Ownership and interfaces

The desktop main process owns the mutable `enabled` value and the set of registered eligible `BrowserWindow` instances. Renderer settings persist the value through the existing settings service and send a `Partial<AppSettings>` patch through the existing desktop platform bridge. `syncImmediateAppSettings` is the only main-process settings mutation entry point.

`packages/desktop/src/main/windowCaptureProtection/` exposes a process-local controller with these operations:

- `setEnabled(enabled)`: update the owner state and apply it to every registered window.
- `registerWindow(window)`: register an eligible window and apply the current value before the caller shows it.
- `unregisterWindow(window)`: remove a destroyed or closed window.

The Electron provider calls `BrowserWindow.setContentProtection(enabled)` and `BrowserWindow.setSkipTaskbar(enabled)` for eligible windows. Content protection hides the window's pixels from capture paths supported by the operating system while keeping the window visible on the user's own screen. Removing the taskbar entry prevents the WeCode taskbar button from appearing in screenshots and screen shares. Provider errors do not prevent the application window from opening; they are reported as a warning and the application remains usable.

Stealth mode hides external desktop surfaces that can be captured by screenshots or screen sharing but are not protected by window content protection. The Windows tray icon is destroyed while stealth mode is enabled and recreated when it is disabled. The Windows taskbar entry is removed from eligible windows so it does not appear in captures. Main-process task notifications are suppressed at the main-process `Notification` boundary, including their notification sound signal, because system notifications appear outside the protected application window and can be captured. The WeCode window itself remains visible to the user on their own screen because content protection hides only captured pixels, not the on-screen window; users can switch back to it via Alt+Tab or by clicking the visible window directly. In-window renderer toasts remain allowed because they are pixels inside a protected eligible window.

## Summon shortcut

A system-level global shortcut (`CommandOrControl+Alt+Z`) summons the WeCode window to the foreground: restore when minimized, show when hidden, then focus. It does not enable always-on-top; the window returns to normal Z-order behavior after the user clicks into another application. The shortcut works whether or not stealth mode is enabled and is the recovery affordance for stealth mode, where the taskbar entry and tray icon are hidden.

The desktop main process owns the global shortcut registration. The shortcut is registered once at app ready and unregistered at application quit. Registration failures (for example, the accelerator already being used by another application) are reported as a warning and WeCode continues to run without the shortcut. Summoning reuses the existing primary-window coordinator entry point; it does not create a second window-visibility path.

## Window policy

The shared desktop window factory registers the primary application windows. Independently created update-status windows are registered explicitly. CUA operation-indicator windows retain their existing unconditional protection and are not controlled by this product toggle. Windows used only for internal capture or browser recording are not registered by this feature until their source-specific behavior has an explicit product contract.

Registration happens immediately after `BrowserWindow` construction and before any show operation. Setting changes apply to all currently registered windows without restart. Closing a window unregisters it.

## Event order

```text
General settings switch
  -> setting service persists stealthModeEnabled
  -> desktop platform bridge sends settings patch
  -> main syncImmediateAppSettings
  -> capture protection owner updates enabled
  -> registered BrowserWindow instances receive the provider call

BrowserWindow construction
  -> window factory constructs BrowserWindow
  -> capture protection registers and applies current enabled value
  -> caller loads, positions, and shows the window
```

## Acceptance scenarios

- The default setting is `false` and existing users receive that value through schema defaults.
- Enabling the setting removes eligible windows from the Windows taskbar and destroys the Windows tray icon; disabling it restores taskbar presence and recreates the tray icon without restarting WeCode.
- Enabling the setting suppresses main-process task notifications and their sound signal; disabling it restores normal task notification behavior and recreates the tray icon.
- Enabling and disabling the setting updates capture protection on all registered existing application windows without restarting WeCode.
- A newly created registered window receives the current value before it can be shown.
- Closing a registered window removes it from the controller and later setting changes do not call it.
- Pressing the summon shortcut restores a minimized WeCode window, shows a hidden one, and focuses it without enabling always-on-top.
- The summon shortcut is registered at app ready and unregistered at application quit; a registration conflict logs a warning and does not crash or retry.
- CUA indicator protection remains enabled independently of the setting.
- No renderer code imports Electron or calls `BrowserWindow` APIs.
- The General settings UI is desktop-only and its copy does not promise disappearance from Zoom, Teams, Meet, OBS, or window pickers.
- The setting persists through the existing AppSettings schema and emits no new telemetry event.
- Provider failure leaves the window usable and produces a warning; it does not create a second state or retry loop.

## Deferred boundaries

This first implementation does not add a native Node-API, Rust, C++, or Swift module. It does not promise all-platform or all-capture invisibility. Per-source exceptions for WeCode's own screenshot and browser-recording flows remain deferred until those flows have explicit tests and an owner.
