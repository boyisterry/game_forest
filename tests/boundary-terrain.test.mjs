import assert from "node:assert/strict";
import test from "node:test";
import {
  sampleBoundary,
  FOOTHILL_WIDTH,
  STEEP_WIDTH,
} from "../app/lib/map/boundaryTerrain.ts";
import { eastBoundaryX, westBoundaryX, northBoundaryZ, southBoundaryZ } from "../app/lib/map/world.ts";

const SEED = 42;

test("east of foot line: force points west (interior) and becomes steep", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const steepX = foot + FOOTHILL_WIDTH + STEEP_WIDTH * 0.5;
  const s = sampleBoundary(steepX, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.ax < -1, `expect strong west accel, ax=${s.ax}`);
  assert.ok(Math.abs(s.az) < Math.abs(s.ax), "east band force is mostly ±x");
});

test("inside playable flat: zero force, not steep", () => {
  const s = sampleBoundary(0, 0, SEED);
  assert.equal(s.steep, false);
  assert.ok(Math.hypot(s.ax, s.az) < 0.01);
});

test("west of west foot: force points east (interior) and steep", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const x = foot - FOOTHILL_WIDTH - STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.ax > 1, `expect east accel, ax=${s.ax}`);
});

test("north of north foot: force points south", () => {
  const x = 0;
  const foot = northBoundaryZ(x, SEED);
  const z = foot - FOOTHILL_WIDTH - STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az > 1, `expect south accel, az=${s.az}`);
});

test("south of south foot: force points north", () => {
  const x = 0;
  const foot = southBoundaryZ(x, SEED);
  const z = foot + FOOTHILL_WIDTH + STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az < -1, `expect north accel, az=${s.az}`);
});
