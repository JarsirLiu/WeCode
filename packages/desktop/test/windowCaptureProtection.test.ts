import assert from "node:assert/strict";
import test from "node:test";
import {
  getWindowCaptureProtectionEnabled,
  registerWindowForCaptureProtection,
  resetWindowCaptureProtectionForTests,
  setWindowCaptureProtectionEnabled,
} from "../src/main/windowCaptureProtection.js";

type FakeWindow = {
  destroyed: boolean;
  calls: boolean[];
  taskbarCalls: boolean[];
  closedHandler?: () => void;
  isDestroyed: () => boolean;
  once: (event: "closed", handler: () => void) => void;
  setContentProtection: (enabled: boolean) => void;
  setSkipTaskbar: (skip: boolean) => void;
};

function createFakeWindow(): FakeWindow {
  return {
    destroyed: false,
    calls: [],
    taskbarCalls: [],
    isDestroyed() {
      return this.destroyed;
    },
    once(_event, handler) {
      this.closedHandler = handler;
    },
    setContentProtection(enabled) {
      this.calls.push(enabled);
    },
    setSkipTaskbar(skip) {
      this.taskbarCalls.push(skip);
    },
  };
}

test.afterEach(() => {
  resetWindowCaptureProtectionForTests();
});

test("applies the current setting when a window is registered", () => {
  const win = createFakeWindow();

  setWindowCaptureProtectionEnabled(true);
  registerWindowForCaptureProtection(win);

  assert.equal(getWindowCaptureProtectionEnabled(), true);
  assert.deepEqual(win.calls, [true]);
  assert.deepEqual(win.taskbarCalls, [true]);
});

test("updates every registered window and unregisters closed windows", () => {
  const first = createFakeWindow();
  const second = createFakeWindow();

  registerWindowForCaptureProtection(first);
  registerWindowForCaptureProtection(second);
  setWindowCaptureProtectionEnabled(true);
  first.closedHandler?.();
  setWindowCaptureProtectionEnabled(false);

  assert.deepEqual(first.calls, [false, true]);
  assert.deepEqual(first.taskbarCalls, [false, true]);
  assert.deepEqual(second.calls, [false, true, false]);
  assert.deepEqual(second.taskbarCalls, [false, true, false]);
});

test("does not register an already destroyed window", () => {
  const win = createFakeWindow();
  win.destroyed = true;

  registerWindowForCaptureProtection(win);
  setWindowCaptureProtectionEnabled(true);

  assert.deepEqual(win.calls, []);
});
