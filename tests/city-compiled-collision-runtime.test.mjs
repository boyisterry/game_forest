import assert from "node:assert/strict";
import test from "node:test";
import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import {
  CompiledCityCollisionRuntime,
  queryCompiledCollisionSweep,
} from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import {
  IMPLICIT_GROUND_SURFACE_KEY,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
  citySurfaceChunkKey,
} from "../app/lib/map/cityCollisionTypes.ts";
import { createImplicitGroundSurfaceSample } from "../app/lib/map/cityCollision.ts";
import { createCityMoveResultBuffer } from "../app/lib/map/cityCollision.ts";

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} ± ${epsilon}`);
}

function packedSource({
  sourceId,
  positions,
  indices,
  roles,
  sourceTriangleIds,
  profileIndices,
  surfaceKeys,
  surfaceProfiles = [],
  transitionProfiles = [],
  explicitBoundaries,
  chunk = false,
}) {
  const triangleCount = indices.length / 3;
  return {
    kind: "template",
    sourceId,
    generation: 1,
    triangles: {
      positions: new Float32Array(positions),
      indices: new Uint16Array(indices),
      triangleRoles: new Uint8Array(roles ?? Array(triangleCount).fill(PackedCollisionRoleCode.Solid)),
      triangleProfileIndices: new Uint16Array(
        profileIndices ?? Array(triangleCount).fill(SURFACE_PROFILE_INDEX_NONE),
      ),
      triangleSurfaceKeys: new Uint32Array(surfaceKeys ?? Array(triangleCount).fill(NO_SURFACE_KEY)),
      sourceTriangleIds: new Uint32Array(sourceTriangleIds),
    },
    surfaceProfiles,
    surfaceTransitionProfiles: transitionProfiles,
    ...(chunk ? {
      chunkX: 0,
      chunkZ: 0,
      chunkKey: citySurfaceChunkKey(0, 0),
      coreBoundsXZ: [0, 0, 64, 64],
      topologyHaloMeters: 0,
    } : {}),
    ...(explicitBoundaries ? { explicitBoundaries } : {}),
  };
}

function verticalRectangleSource(sourceId = "thin-wall") {
  return packedSource({
    sourceId,
    positions: [
      0, 0, -2,
      0, 3, -2,
      0, 3, 2,
      0, 0, 2,
    ],
    indices: [0, 1, 2, 0, 2, 3],
    sourceTriangleIds: [10, 11],
  });
}

test("ground truth: an infinitely thin compiled wall stops at radius, not at an AABB thickness", async () => {
  const compiled = await compileCollisionSource(verticalRectangleSource());
  assert.equal(compiled.walls.sourceTriangleIds.length, 2);
  assert.equal(compiled.fallback, null);
  const result = queryCompiledCollisionSweep([{
    ownerId: "wall-owner",
    ownerGeneration: 1,
    source: compiled,
  }], {
    startX: -2,
    startZ: 0,
    deltaX: 4,
    deltaZ: 0,
    minY: 0,
    maxY: 2.4,
    radius: 0.55,
  });
  assert.ok(result.hit);
  close(result.hit.toi, (2 - 0.55) / 4);
  close(result.hit.normalX, -1);
  close(result.hit.normalZ, 0);
  assert.equal(result.hit.primitiveKind, "wall");
});

test("ground truth: a 45 degree packed wall returns its analytic TOI and normal", async () => {
  const compiled = await compileCollisionSource(packedSource({
    sourceId: "diagonal-wall",
    positions: [
      -2, 0, 2,
      -2, 3, 2,
      2, 3, -2,
      2, 0, -2,
    ],
    indices: [0, 1, 2, 0, 2, 3],
    sourceTriangleIds: [20, 21],
  }));
  const result = queryCompiledCollisionSweep([{
    ownerId: "diagonal",
    ownerGeneration: 4,
    source: compiled,
  }], {
    startX: -2,
    startZ: -2,
    deltaX: 4,
    deltaZ: 4,
    minY: 0,
    maxY: 2.4,
    radius: 0.55,
  });
  assert.ok(result.hit);
  const startDistance = 2 * Math.SQRT2;
  close(result.hit.distance, startDistance - 0.55, 1e-5);
  close(result.hit.normalX, -Math.SQRT1_2, 1e-6);
  close(result.hit.normalZ, -Math.SQRT1_2, 1e-6);
});

test("packed triangular t/y clipping does not create a min/max ghost wall", async () => {
  const compiled = await compileCollisionSource(packedSource({
    sourceId: "triangular-height-wall",
    positions: [
      0, 0, 0,
      0, 4, 4,
      0, 5, 4,
    ],
    indices: [0, 1, 2],
    sourceTriangleIds: [30],
  }));
  const owner = { ownerId: "height-triangle", ownerGeneration: 1, source: compiled };
  const absent = queryCompiledCollisionSweep([owner], {
    startX: -1,
    startZ: 3,
    deltaX: 2,
    deltaZ: 0,
    minY: 0,
    maxY: 1,
    radius: 0.2,
  });
  assert.equal(absent.hit, null, "the triangle has no geometry in this Y band at z=3");

  const present = queryCompiledCollisionSweep([owner], {
    startX: -1,
    startZ: 0.5,
    deltaX: 2,
    deltaZ: 0,
    minY: 0,
    maxY: 1,
    radius: 0.2,
  });
  assert.ok(present.hit);
  close(present.hit.toi, 0.4);
});

test("fallback uses MeshBVH candidates then exact Y-clipped 2D triangle TOI", async () => {
  const compiled = await compileCollisionSource(packedSource({
    sourceId: "sloped-fallback",
    positions: [
      -1, 0, 0,
      1, 4, 0,
      -1, 0, 2,
    ],
    indices: [0, 1, 2],
    sourceTriangleIds: [40],
  }));
  assert.equal(compiled.walls.sourceTriangleIds.length, 0);
  assert.ok(compiled.fallback);
  const owner = { ownerId: "slope", ownerGeneration: 3, source: compiled };
  const result = queryCompiledCollisionSweep([owner], {
    startX: -2,
    startZ: 0.5,
    deltaX: 4,
    deltaZ: 0,
    minY: 0.9,
    maxY: 1.1,
    radius: 0.1,
  });
  assert.ok(result.fallbackTriangleCandidateCount >= 1);
  assert.ok(result.hit);
  assert.equal(result.hit.primitiveKind, "triangle");
  assert.equal(result.hit.sourceTriangleId, 40);
  close(result.hit.toi, 0.3375, 2e-5);
  close(result.hit.normalX, -1, 1e-5);

  const above = queryCompiledCollisionSweep([owner], {
    startX: -2,
    startZ: 0.5,
    deltaX: 4,
    deltaZ: 0,
    minY: 4.1,
    maxY: 4.4,
    radius: 0.1,
  });
  assert.equal(above.hit, null);
});

test("fallback floors and roofs remain containment data without horizontal XZ response", async () => {
  const compiled = await compileCollisionSource(packedSource({
    sourceId: "horizontal-containment-face",
    positions: [-2, 0, -2, 2, 0, -2, -2, 0, 2],
    indices: [0, 1, 2],
    sourceTriangleIds: [41],
  }));
  assert.ok(compiled.fallback);
  const result = queryCompiledCollisionSweep([{
    ownerId: "floor",
    ownerGeneration: 1,
    source: compiled,
  }], {
    startX: -1,
    startZ: -1,
    deltaX: 2,
    deltaZ: 0,
    minY: 0,
    maxY: 2.4,
    radius: 0.55,
  });
  assert.equal(result.hit, null);
});

test("owner yaw, uniform scale and translation preserve exact world-space contact", async () => {
  const compiled = await compileCollisionSource(verticalRectangleSource("transformed-wall"));
  const result = queryCompiledCollisionSweep([{
    ownerId: "transformed",
    ownerGeneration: 2,
    source: compiled,
    transform: { x: 10, y: 0, z: 5, yawRadians: Math.PI / 2, uniformScale: 2 },
  }], {
    startX: 10,
    startZ: 0,
    deltaX: 0,
    deltaZ: 10,
    minY: 0,
    maxY: 2.4,
    radius: 0.55,
  });
  assert.ok(result.hit);
  close(result.hit.toi, 0.445, 1e-6);
  close(result.hit.normalX, 0, 1e-6);
  close(result.hit.normalZ, -1, 1e-6);
});

test("compiled runtime exposes the live resolveCityMove contract", async () => {
  const compiled = await compileCollisionSource(verticalRectangleSource("live-wall"));
  const runtime = new CompiledCityCollisionRuntime([{
    ownerId: "live-owner",
    ownerGeneration: 9,
    source: compiled,
  }], { worldId: 91, documentGeneration: 6 });
  const surface = createImplicitGroundSurfaceSample(91, 6);
  const out = createCityMoveResultBuffer(91, 6);
  runtime.resolveCityMove({
    startX: -2,
    startZ: 0,
    microDtSeconds: 1,
    velocityX: 4,
    velocityZ: 0,
    motionSign: 1,
    bodyHeading: Math.PI / 2,
    drifting: false,
    startSurface: surface,
  }, out);
  close(out.x, -0.552, 1e-6);
  close(out.z, 0);
  assert.equal(out.impactCount, 1);
  assert.equal(out.impactEvents[0].contact.primitiveKind, "wall");
  assert.ok(out.x < -0.55, "collision skin remains outside the source triangle");
});

test("packed surface chunks sample real planes and expose curb boundaries", async () => {
  const asphalt = {
    id: "sidewalk",
    family: "sidewalk",
    speedCap: 12,
    maxSlopeDegrees: 30,
    selectionPriority: 50,
  };
  const curb = {
    id: "road-curb",
    kind: "road-curb",
    maxStepUpMeters: 0.30,
    maxStepDownMeters: 0.30,
    bumpProfile: "curb-strong",
  };
  const compiled = await compileCollisionSource(packedSource({
    sourceId: "packed-sidewalk",
    positions: [
      1, 0.24, 1,
      3, 0.24, 1,
      3, 0.24, 3,
      1, 0.24, 3,
    ],
    indices: [0, 2, 1, 0, 3, 2],
    roles: [PackedCollisionRoleCode.RideableSurface, PackedCollisionRoleCode.RideableSurface],
    sourceTriangleIds: [50, 51],
    profileIndices: [0, 0],
    surfaceKeys: [7, 7],
    surfaceProfiles: [asphalt],
    transitionProfiles: [curb],
    chunk: true,
    explicitBoundaries: {
      boundaryXZ: new Float32Array([2, 1, 2, 3]),
      boundaryTransitionProfileIndices: new Uint16Array([0]),
      boundaryGroupKeys: new Uint32Array([99]),
      boundarySurfaceKeyPairs: new Uint32Array([7, IMPLICIT_GROUND_SURFACE_KEY]),
    },
  }));
  const runtime = new CompiledCityCollisionRuntime([{
    ownerId: "sidewalk-owner",
    ownerGeneration: 8,
    source: compiled,
  }], { worldId: 77, documentGeneration: 12 });
  const sample = createImplicitGroundSurfaceSample(77, 12);
  runtime.sampleCitySurface(1.5, 2, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.30,
  }, sample);
  assert.equal(sample.handle.kind, "owner-local");
  assert.equal(sample.profileId, "sidewalk");
  close(sample.height, 0.24, 1e-6);
  close(sample.normalY, 1, 1e-6);

  const ground = createImplicitGroundSurfaceSample(77, 12);
  const crossing = runtime.findEarliestSurfaceBoundaryCrossing(2.5, 2, -1, 0, ground);
  assert.ok(crossing);
  assert.equal(crossing.kind, "road-curb");
  assert.equal(crossing.handle.kind, "owner-local");
  assert.equal(crossing.handle.localBoundaryGroupKey, 99);
  close(crossing.toHeight, 0.24, 1e-6);
  close(crossing.bumpStrength, 1, 1e-6);
});
