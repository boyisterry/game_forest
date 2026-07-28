import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { computeBrowsePanDelta, NO_BROWSE_MOVE } from "../app/lib/map/browsePan.ts";

// Logic tests for the workshop arrow-key browse panning. Imports the TS module
// directly (node --experimental-strip-types) so the direction/scaling math is
// verified, not just the source shape.

const move = (over = {}) => ({ ...NO_BROWSE_MOVE, ...over });

// Camera looking toward -Z (north): position south of the target, above ground.
const camPos = () => new Vector3(0, 40, 60);
const target = () => new Vector3(0, 0, 0);

test("no held keys yields a zero delta", () => {
  const delta = computeBrowsePanDelta(camPos(), target(), move(), 1 / 60);
  assert.equal(delta.lengthSq(), 0);
});

test("ArrowUp pushes the focus away from the camera (into the view)", () => {
  const delta = computeBrowsePanDelta(camPos(), target(), move({ forward: true }), 1 / 60);
  // Camera is at +Z looking toward -Z, so forward pan is toward -Z.
  assert.ok(delta.z < -1e-3, `expected -Z motion, got ${delta.z}`);
  assert.ok(Math.abs(delta.x) < 1e-6);
  assert.ok(Math.abs(delta.y) < 1e-6, "browse pan stays on the ground plane");
});

test("ArrowDown moves opposite ArrowUp", () => {
  const up = computeBrowsePanDelta(camPos(), target(), move({ forward: true }), 1 / 60);
  const down = computeBrowsePanDelta(camPos(), target(), move({ back: true }), 1 / 60);
  assert.ok(down.z > 1e-3, `expected +Z motion, got ${down.z}`);
  assert.ok(Math.abs(up.z + down.z) < 1e-6, "forward and back are mirror images");
});

test("ArrowRight strafes screen-right (+X when looking north)", () => {
  const delta = computeBrowsePanDelta(camPos(), target(), move({ right: true }), 1 / 60);
  assert.ok(delta.x > 1e-3, `expected +X motion, got ${delta.x}`);
  assert.ok(Math.abs(delta.z) < 1e-6);
});

test("ArrowLeft mirrors ArrowRight", () => {
  const right = computeBrowsePanDelta(camPos(), target(), move({ right: true }), 1 / 60);
  const left = computeBrowsePanDelta(camPos(), target(), move({ left: true }), 1 / 60);
  assert.ok(Math.abs(right.x + left.x) < 1e-6, "left and right are mirror images");
});

test("diagonal movement is speed-normalized (not faster than a single axis)", () => {
  const single = computeBrowsePanDelta(camPos(), target(), move({ forward: true }), 1 / 60);
  const diagonal = computeBrowsePanDelta(camPos(), target(), move({ forward: true, right: true }), 1 / 60);
  assert.ok(
    Math.abs(single.length() - diagonal.length()) < 1e-6,
    `diagonal (${diagonal.length()}) should match single-axis speed (${single.length()})`,
  );
});

test("panning speed scales with camera distance (zoomed out sweeps faster)", () => {
  const near = computeBrowsePanDelta(new Vector3(0, 20, 30), target(), move({ forward: true }), 1 / 60);
  const far = computeBrowsePanDelta(new Vector3(0, 200, 300), target(), move({ forward: true }), 1 / 60);
  assert.ok(far.length() > near.length(), "farther camera pans faster");
});

test("opposing keys cancel to a zero delta", () => {
  const delta = computeBrowsePanDelta(camPos(), target(), move({ forward: true, back: true }), 1 / 60);
  assert.equal(delta.lengthSq(), 0);
});

test("a top-down camera (no horizontal facing) yields a zero delta", () => {
  const delta = computeBrowsePanDelta(new Vector3(0, 100, 0), target(), move({ forward: true }), 1 / 60);
  assert.equal(delta.lengthSq(), 0);
});
