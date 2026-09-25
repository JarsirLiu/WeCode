// 本模块不导入 electron：globalShortcut 由 main 进程入口注入，node:test 才能直接加载本文件。

type SummonShortcutProvider = {
  register(accelerator: string, handler: () => void): boolean;
  unregister(accelerator: string): void;
};

type SummonShortcutLogger = {
  info: (message: string) => void;
  warn: (...args: unknown[]) => void;
};

type SummonShortcutOptions = {
  accelerator: string;
  summon: () => void | Promise<void>;
  shortcut: SummonShortcutProvider;
  logger: SummonShortcutLogger;
};

let shortcut: SummonShortcutProvider | null = null;
let registeredAccelerator: string | null = null;

export function registerSummonShortcut(options: SummonShortcutOptions): void {
  if (registeredAccelerator === options.accelerator) {
    return;
  }

  unregisterSummonShortcut();

  try {
    const registered = options.shortcut.register(options.accelerator, () => {
      // 快捷键回调里的异常不能冒泡到消息循环；失败只记录告警，保留快捷键注册。
      Promise.resolve(options.summon()).catch((error) => {
        options.logger.warn(`[summon-shortcut] summon failed for ${options.accelerator}`, error);
      });
    });

    if (!registered) {
      options.logger.warn(
        `[summon-shortcut] accelerator ${options.accelerator} is already in use; global summon shortcut disabled`,
      );
      return;
    }
  } catch (error) {
    options.logger.warn(`[summon-shortcut] failed to register ${options.accelerator}`, error);
    return;
  }

  shortcut = options.shortcut;
  registeredAccelerator = options.accelerator;
  options.logger.info(`[summon-shortcut] registered global shortcut ${options.accelerator}`);
}

export function unregisterSummonShortcut(): void {
  if (registeredAccelerator == null || shortcut == null) {
    return;
  }

  try {
    shortcut.unregister(registeredAccelerator);
  } catch {
    // 进程退出时注销失败不影响退出流程。
  } finally {
    registeredAccelerator = null;
    shortcut = null;
  }
}
