import assert from "node:assert/strict";
import test from "node:test";
import {
  registerSummonShortcut,
  unregisterSummonShortcut,
} from "../src/main/desktopSummonShortcut.js";

type RecordedRegistration = { accelerator: string; handler: () => void };

type FakeShortcutProvider = {
  registered: RecordedRegistration[];
  unregistered: string[];
  register: (accelerator: string, handler: () => void) => boolean;
  unregister: (accelerator: string) => void;
};

type ProviderOverrides = {
  onRegister?: (accelerator: string, handler: () => void) => boolean;
  onUnregister?: (accelerator: string) => void;
};

function createFakeShortcutProvider(overrides: ProviderOverrides = {}): FakeShortcutProvider {
  const registered: RecordedRegistration[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    register:
      overrides.onRegister ??
      ((accelerator, handler) => {
        registered.push({ accelerator, handler });
        return true;
      }),
    unregister:
      overrides.onUnregister ??
      ((accelerator) => {
        unregistered.push(accelerator);
      }),
  };
}

type FakeLogger = {
  infos: string[];
  warns: Array<{ message: string; extra?: unknown }>;
  info: (message: string) => void;
  warn: (...args: unknown[]) => void;
};

function createFakeLogger(): FakeLogger {
  return {
    infos: [],
    warns: [],
    info(message) {
      this.infos.push(message);
    },
    warn(...args: unknown[]) {
      this.warns.push({ message: String(args[0]), extra: args[1] });
    },
  };
}

// 模块持有进程级注册状态，node:test 默认并发执行测试；每个测试用独立 accelerator，
// 保证用例之间互不影响、结果与执行顺序无关。
test("registers the accelerator and forwards the hotkey press to the summon callback", () => {
  const accelerator = "CmdOrCtrl+Alt+1";
  const shortcut = createFakeShortcutProvider();
  const logger = createFakeLogger();
  let calls = 0;

  registerSummonShortcut({
    accelerator,
    summon: () => {
      calls += 1;
    },
    shortcut,
    logger,
  });

  assert.deepEqual(
    shortcut.registered.map((entry) => entry.accelerator),
    [accelerator],
  );
  assert.deepEqual(logger.infos, [`[summon-shortcut] registered global shortcut ${accelerator}`]);
  assert.equal(logger.warns.length, 0);

  shortcut.registered[0].handler();
  shortcut.registered[0].handler();
  assert.equal(calls, 2);
});

test("re-registering the same accelerator is a no-op", () => {
  const accelerator = "CmdOrCtrl+Alt+2";
  const shortcut = createFakeShortcutProvider();
  const logger = createFakeLogger();

  registerSummonShortcut({ accelerator, summon: () => {}, shortcut, logger });
  registerSummonShortcut({ accelerator, summon: () => {}, shortcut, logger });

  assert.equal(shortcut.registered.length, 1);
  assert.deepEqual(shortcut.unregistered, []);
  assert.equal(logger.infos.length, 1);
});

test("swallows a rejected summon so the shortcut registration survives", async () => {
  const accelerator = "CmdOrCtrl+Alt+3";
  const shortcut = createFakeShortcutProvider();
  const logger = createFakeLogger();
  const failure = new Error("no primary window");

  registerSummonShortcut({
    accelerator,
    summon: () => Promise.reject(failure),
    shortcut,
    logger,
  });

  shortcut.registered[0].handler();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(shortcut.registered.length, 1);
  assert.equal(logger.warns.length, 1);
  assert.match(logger.warns[0].message, /summon failed/);
  assert.equal(logger.warns[0].extra, failure);
});

test("logs a warning and stays unregistered when the accelerator is already in use", () => {
  const accelerator = "CmdOrCtrl+Alt+4";
  const shortcut = createFakeShortcutProvider({ onRegister: () => false });
  const logger = createFakeLogger();

  registerSummonShortcut({ accelerator, summon: () => {}, shortcut, logger });

  assert.equal(logger.warns.length, 1);
  assert.match(logger.warns[0].message, /already in use/);
  assert.deepEqual(logger.infos, []);

  // 未成功注册时注销不应触碰后端。
  unregisterSummonShortcut();
  assert.deepEqual(shortcut.unregistered, []);
});

test("logs a warning and stays unregistered when the provider throws", () => {
  const accelerator = "CmdOrCtrl+Alt+5";
  const failure = new Error("RegisterHotKey failed");
  const shortcut = createFakeShortcutProvider({
    onRegister: () => {
      throw failure;
    },
  });
  const logger = createFakeLogger();

  registerSummonShortcut({ accelerator, summon: () => {}, shortcut, logger });

  assert.equal(logger.warns.length, 1);
  assert.equal(logger.warns[0].extra, failure);
  assert.deepEqual(logger.infos, []);
  assert.deepEqual(shortcut.registered, []);
});

test("unregisters the previous accelerator before switching", () => {
  const firstAccelerator = "CmdOrCtrl+Alt+6";
  const secondAccelerator = "CmdOrCtrl+Shift+6";
  const shortcut = createFakeShortcutProvider();
  const logger = createFakeLogger();

  registerSummonShortcut({ accelerator: firstAccelerator, summon: () => {}, shortcut, logger });
  registerSummonShortcut({
    accelerator: secondAccelerator,
    summon: () => {},
    shortcut,
    logger,
  });

  assert.deepEqual(shortcut.unregistered, [firstAccelerator]);
  assert.deepEqual(
    shortcut.registered.map((entry) => entry.accelerator),
    [firstAccelerator, secondAccelerator],
  );
});

test("unregister clears the registered accelerator and tolerates provider failure", () => {
  const accelerator = "CmdOrCtrl+Alt+7";
  const shortcut = createFakeShortcutProvider();
  const logger = createFakeLogger();

  registerSummonShortcut({ accelerator, summon: () => {}, shortcut, logger });
  unregisterSummonShortcut();

  assert.deepEqual(shortcut.unregistered, [accelerator]);

  // 重复注销是幂等的。
  unregisterSummonShortcut();
  assert.deepEqual(shortcut.unregistered, [accelerator]);

  let unregisterAttempts = 0;
  const failingShortcut = createFakeShortcutProvider({
    onUnregister: () => {
      unregisterAttempts += 1;
      throw new Error("app already exiting");
    },
  });
  registerSummonShortcut({
    accelerator,
    summon: () => {},
    shortcut: failingShortcut,
    logger,
  });
  assert.doesNotThrow(() => unregisterSummonShortcut());
  assert.equal(unregisterAttempts, 1);
  // 注销抛错后仍应清空注册状态，退出重试不会重复调用后端。
  unregisterSummonShortcut();
  assert.equal(unregisterAttempts, 1);
});
