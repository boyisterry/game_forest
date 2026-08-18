import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { deriveCityMinimapWorld } from "../app/lib/map/cityMinimap.ts";

test("city minimap preserves disconnected graph edges and samples document routes", () => {
  const world = deriveCityMinimapWorld({
    nodes: [
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 10, z: 0 },
      { id: "c", x: 100, z: 0 },
      { id: "d", x: 130, z: 0 },
    ],
    edges: [
      { a: "a", b: "b" },
      { a: "c", b: "d" },
    ],
  }, 3);

  assert.deepEqual(world.roadLines, [
    [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    [{ x: 100, z: 0 }, { x: 130, z: 0 }],
  ]);
  assert.deepEqual(world.stops, [
    { x: 10, z: 0 },
    { x: 110, z: 0 },
    { x: 120, z: 0 },
  ]);
  assert.equal(Object.isFrozen(world), true);
  assert.equal(Object.isFrozen(world.roadLines), true);
  assert.equal(Object.isFrozen(world.stops), true);
});

test("city minimap has no stops when the authoritative graph has no roads", () => {
  assert.deepEqual(deriveCityMinimapWorld({ nodes: [], edges: [] }, 8), {
    roadLines: [],
    stops: [],
  });
});

test("city minimap renderer draws independent document lines without a legacy grid", async () => {
  const source = await readFile(new URL("../app/lib/map/Minimap.ts", import.meta.url), "utf8");
  assert.match(source, /setCityWorld\(roadLines:/);
  assert.match(source, /for \(const line of this\.roadLines\)/);
  assert.match(source, /if \(line\.length < 2\) continue;/);
  assert.doesNotMatch(source, /\[-820, -360, 120, 500, 820\]/);
  assert.doesNotMatch(source, /\[-640, -180, 280, 700\]/);
  assert.doesNotMatch(source, /this\.roadCache/);
});
