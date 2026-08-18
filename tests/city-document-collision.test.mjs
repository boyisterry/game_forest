import assert from "node:assert/strict";
import test from "node:test";

import { createCityMoveResultBuffer, createImplicitGroundSurfaceSample } from "../app/lib/map/cityCollision.ts";
import { buildLegacyMassingWalls, DocumentCityCollisionWorld } from "../app/lib/map/cityDocumentCollision.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";

function sources() {
  return deriveRoadCollisionSources({
    nodes: [{ id: "a", x: -20, z: 0 }, { id: "b", x: 20, z: 0 }],
    edges: [{ id: "road", a: "a", b: "b", profile: createRoadProfile("two-way-1") }],
    intersectionOverrides: {},
  });
}

function move(world, overrides = {}) {
  const startSurface = createImplicitGroundSurfaceSample(world.worldId, world.documentGeneration);
  world.sampleCitySurface(overrides.startX ?? 0, overrides.startZ ?? -6, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.3,
  }, startSurface);
  return world.resolveCityMove({
    startX: 0,
    startZ: -6,
    microDtSeconds: 0.2,
    velocityX: 0,
    velocityZ: -20,
    motionSign: 1,
    bodyHeading: Math.PI,
    drifting: false,
    ...overrides,
    startSurface,
  }, createCityMoveResultBuffer(world.worldId, world.documentGeneration));
}

test("curb transition preserves authoritative velocity and emits one strong presentation event", () => {
  const world = new DocumentCityCollisionWorld([], sources());
  const result = move(world);
  assert.equal(result.transitionCount, 1);
  assert.equal(result.transitionEvents[0].kind, "road-curb");
  assert.equal(result.transitionEvents[0].stepDeltaY, 0.24);
  assert.equal(result.transitionEvents[0].bumpStrength, 1);
  assert.equal(result.velocityZ, -20);
  assert.equal(result.surface.profileId, "sidewalk");
  assert.equal(result.surface.speedCap, 12);
});

test("a wall activated by the new sidewalk Y-band is swept after crossing", () => {
  const world = new DocumentCityCollisionWorld([{
    ownerId: "raised-rail",
    ownerGeneration: 1,
    canonicalSegmentId: 1,
    canonicalVertexAId: 2,
    canonicalVertexBId: 3,
    ax: -10,
    az: -8.5,
    bx: 10,
    bz: -8.5,
    minY: 2.5,
    maxY: 3,
    nx: 0,
    nz: 1,
  }], sources());
  const result = move(world, { microDtSeconds: 0.3 });
  assert.equal(result.transitionCount, 1);
  assert.equal(result.impactCount, 1);
  assert.ok(result.z > -8.5);
  assert.equal(result.velocityZ, 0);
});

test("a nearer wall prevents a farther curb transition from committing", () => {
  const world = new DocumentCityCollisionWorld([{
    ownerId: "road-block",
    ownerGeneration: 1,
    canonicalSegmentId: 1,
    canonicalVertexAId: 2,
    canonicalVertexBId: 3,
    ax: -10,
    az: -6.6,
    bx: 10,
    bz: -6.6,
    minY: 0,
    maxY: 2,
    nx: 0,
    nz: 1,
  }], sources());
  const result = move(world);
  assert.equal(result.transitionCount, 0);
  assert.equal(result.surface.profileId, "bike-lane");
});

test("legacy collision uses the exact box-part geometry and ignores windows", () => {
  const walls = buildLegacyMassingWalls([{
    id: "legacy-1",
    catalogId: "legacy-massing-block",
    poseKind: "legacy-massing",
    x: 10,
    z: 20,
    yawRadians: 0,
    width: 20,
    depth: 12,
    height: 30,
    roofHeight: 4,
    color: 0xabcdef,
    district: "test",
  }]);
  // body, plinth, roof, two trims, door and awning; window parts are ignored.
  assert.equal(walls.length, 7 * 4);
  const body = walls.slice(0, 4);
  assert.deepEqual(body.map((wall) => [wall.ax, wall.az, wall.bx, wall.bz]), [
    [0, 14, 20, 14],
    [20, 14, 20, 26],
    [20, 26, 0, 26],
    [0, 26, 0, 14],
  ]);
  assert.ok(Math.abs(body[0].minY - 0.6) < 1e-12);
  assert.ok(Math.abs(body[0].maxY - 30.6) < 1e-12);
});
