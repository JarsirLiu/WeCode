import type { BrowserWindow } from "electron";

type CaptureProtectionLogger = {
  warn: (...args: unknown[]) => void;
};

type WindowCaptureProtectionOptions = {
  logger: CaptureProtectionLogger;
  onEnabledChanged?: (enabled: boolean) => void;
};

const registeredWindows = new Set<BrowserWindow>();
let enabled = false;
let logger: CaptureProtectionLogger | undefined;
let onEnabledChanged: ((enabled: boolean) => void) | undefined;

function applyToWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    registeredWindows.delete(win);
    return;
  }

  try {
    win.setContentProtection(enabled);
  } catch (error) {
    logger?.warn("[window-capture-protection] failed to apply content protection", {
      enabled,
      error,
    });
  }

  // 任务栏条目属于系统桌面区域，会被截图和屏幕分享捕获。
  // 隐身开启时移除任务栏入口；窗口本身因内容保护仍对用户可见。
  try {
    win.setSkipTaskbar(enabled);
  } catch (error) {
    logger?.warn("[window-capture-protection] failed to apply taskbar visibility", {
      enabled,
      error,
    });
  }
}

export function configureWindowCaptureProtection(options: WindowCaptureProtectionOptions): void {
  logger = options.logger;
  onEnabledChanged = options.onEnabledChanged;
}

export function setWindowCaptureProtectionEnabled(nextEnabled: boolean): void {
  if (enabled === nextEnabled) {
    return;
  }

  enabled = nextEnabled;
  for (const win of registeredWindows) {
    applyToWindow(win);
  }
  onEnabledChanged?.(enabled);
}

export function registerWindowForCaptureProtection(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  registeredWindows.add(win);
  win.once("closed", () => {
    registeredWindows.delete(win);
  });
  applyToWindow(win);
}

export function unregisterWindowForCaptureProtection(win: BrowserWindow): void {
  registeredWindows.delete(win);
}

export function getWindowCaptureProtectionEnabled(): boolean {
  return enabled;
}

export function resetWindowCaptureProtectionForTests(): void {
  registeredWindows.clear();
  enabled = false;
  logger = undefined;
  onEnabledChanged = undefined;
}
