import assert from "node:assert/strict";
import test from "node:test";

import {
  CITY_RIDE_CAMERA_FAR_METERS,
  CITY_RENDER_IDLE_DELAY_MS,
  chooseCameraDepthBudget,
  chooseDynamicPixelRatio,
  shouldSkipIdleCityRender,
} from "../app/lib/map/renderPerformanceBudget.ts";

test("city driving preserves distant streets instead of clipping the projection at a few blocks", () => {
  assert.deepEqual(chooseCameraDepthBudget({
    city: true,
    driveMode: true,
    currentNear: 4,
    currentFar: 220,
  }), { near: 0.5, far: CITY_RIDE_CAMERA_FAR_METERS });
  assert.deepEqual(chooseCameraDepthBudget({
    city: true,
    driveMode: true,
    currentNear: 2,
    currentFar: 8_000,
  }), { near: 0.5, far: CITY_RIDE_CAMERA_FAR_METERS });
  assert.deepEqual(chooseCameraDepthBudget({
    city: true,
    driveMode: false,
    currentNear: 3,
    currentFar: 4_500,
  }), { near: 3, far: 4_500 });
});

test("dynamic DPR degrades gradually under sustained slow frames and recovers with headroom", () => {
  assert.equal(chooseDynamicPixelRatio({
    current: 1.25, maximum: 1.25, samples: 120, frameTimeP95Ms: 29, framesOver25MsRatio: 0.24,
  }), 1.1);
  assert.equal(chooseDynamicPixelRatio({
    current: 0.85, maximum: 1.25, samples: 120, frameTimeP95Ms: 15, framesOver25MsRatio: 0,
  }), 0.95);
  assert.equal(chooseDynamicPixelRatio({
    current: 1.1, maximum: 1.25, samples: 20, frameTimeP95Ms: 40, framesOver25MsRatio: 1,
  }), 1.1);
});

test("only an inactive city browse frame becomes render-idle", () => {
  const idle = {
    city: true,
    driveMode: false,
    pendingDrive: false,
    browseMoving: false,
    forceRenderFrames: 0,
    elapsedSinceInteractionMs: CITY_RENDER_IDLE_DELAY_MS,
  };
  assert.equal(shouldSkipIdleCityRender(idle), true);
  assert.equal(shouldSkipIdleCityRender({ ...idle, driveMode: true }), false);
  assert.equal(shouldSkipIdleCityRender({ ...idle, browseMoving: true }), false);
  assert.equal(shouldSkipIdleCityRender({ ...idle, forceRenderFrames: 1 }), false);
  assert.equal(shouldSkipIdleCityRender({ ...idle, city: false }), false);
});
