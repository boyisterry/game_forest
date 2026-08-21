import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePendingDriveGate,
  shouldResumeDriveAfterRebuild,
} from "../app/lib/map/driveModeGate.ts";
import { InputController } from "../app/lib/map/input.ts";

test("pending drive waits for both a rider and required city collision in either order", () => {
  const base = {
    requested: true,
    cityCollisionRequired: true,
  };

  assert.equal(resolvePendingDriveGate({
    ...base,
    riderReady: false,
    cityCollisionReady: false,
  }), "waiting-rider-and-city-collision");
  assert.equal(resolvePendingDriveGate({
    ...base,
    riderReady: true,
    cityCollisionReady: false,
  }), "waiting-city-collision");
  assert.equal(resolvePendingDriveGate({
    ...base,
    riderReady: false,
    cityCollisionReady: true,
  }), "waiting-rider");
  assert.equal(resolvePendingDriveGate({
    ...base,
    riderReady: true,
    cityCollisionReady: true,
  }), "ready");
});

test("forest and non-document city rides do not wait for document collision", () => {
  assert.equal(resolvePendingDriveGate({
    requested: true,
    riderReady: true,
    cityCollisionRequired: false,
    cityCollisionReady: false,
  }), "ready");
  assert.equal(resolvePendingDriveGate({
    requested: true,
    riderReady: false,
    cityCollisionRequired: false,
    cityCollisionReady: false,
  }), "waiting-rider");
});

test("readiness cannot start a ride after the pending request is cancelled", () => {
  assert.equal(resolvePendingDriveGate({
    requested: false,
    riderReady: true,
    cityCollisionRequired: true,
    cityCollisionReady: true,
  }), "idle");
});

test("internal rebuilds retain active and pending ride requests without inventing one", () => {
  assert.equal(shouldResumeDriveAfterRebuild({ driveMode: true, pendingDrive: false }), true);
  assert.equal(shouldResumeDriveAfterRebuild({ driveMode: false, pendingDrive: true }), true);
  assert.equal(shouldResumeDriveAfterRebuild({ driveMode: true, pendingDrive: true }), true);
  assert.equal(shouldResumeDriveAfterRebuild({ driveMode: false, pendingDrive: false }), false);
});

test("Escape emits one drive-exit intent only while input is attached", () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  let exitIntents = 0;
  const input = new InputController(() => { exitIntents += 1; });

  try {
    input.attach();
    const firstEscape = new Event("keydown", { cancelable: true });
    Object.defineProperties(firstEscape, {
      key: { value: "Escape" },
      code: { value: "Escape" },
    });
    fakeWindow.dispatchEvent(firstEscape);
    assert.equal(exitIntents, 1);

    input.detach();
    const detachedEscape = new Event("keydown", { cancelable: true });
    Object.defineProperties(detachedEscape, {
      key: { value: "Escape" },
      code: { value: "Escape" },
    });
    fakeWindow.dispatchEvent(detachedEscape);
    assert.equal(exitIntents, 1);
  } finally {
    input.detach();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
