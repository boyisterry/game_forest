import assert from "node:assert/strict";
import test from "node:test";

import { createImplicitGroundSurfaceSample } from "../app/lib/map/cityCollision.ts";
import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import {
  cityCollisionTemplateVariantKey,
  collectCityCollisionTemplatePlacements,
} from "../app/lib/map/cityDocumentCollisionPipeline.ts";
import {
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
  citySurfaceChunkKey,
} from "../app/lib/map/cityCollisionTypes.ts";
import { cloneCityDocument, emptyCityDocument, parseCityMapDocument } from "../app/lib/map/cityDocument.ts";

const HEIGHT_SCALES = [0.6, 1, 1.32, 1.61];
const TRANSFORM = Object.freeze({ x: 12, y: 5, z: -7, yawRadians: 0.37, uniformScale: 1.3 });

function close(actual, expected, epsilon = 2e-5) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} ± ${epsilon}`);
}

function scaleY(positions, heightScale) {
  return positions.map((value, index) => index % 3 === 1 ? value * heightScale : value);
}

function solidPacked(sourceId, heightScale) {
  const positions = [
    // Strict vertical wall.
    0, 0, -2, 0, 3, -2, 0, 3, 2, 0, 0, 2,
    // Disconnected sloped triangle, which compiles through fallback BVH.
    6, 0, 0, 8, 8, 0, 6, 0, 2,
  ];
  return {
    kind: "template",
    sourceId,
    generation: 1,
    triangles: {
      positions: new Float32Array(scaleY(positions, heightScale)),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6]),
      triangleRoles: new Uint8Array(3).fill(PackedCollisionRoleCode.Solid),
      triangleProfileIndices: new Uint16Array(3).fill(SURFACE_PROFILE_INDEX_NONE),
      triangleSurfaceKeys: new Uint32Array(3).fill(NO_SURFACE_KEY),
      sourceTriangleIds: new Uint32Array([10, 11, 40]),
    },
    surfaceProfiles: [],
    surfaceTransitionProfiles: [],
  };
}

const SIDEWALK = Object.freeze({
  id: "height-fixture-sidewalk",
  family: "sidewalk",
  speedCap: 12,
  maxSlopeDegrees: 60,
  selectionPriority: 50,
});
const CURB = Object.freeze({
  id: "height-fixture-curb",
  kind: "road-curb",
  maxStepUpMeters: 2,
  maxStepDownMeters: 2,
  bumpProfile: "curb-strong",
});

function surfacePacked(sourceId, heightScale) {
  const positions = [
    0, 0, 0, 2, 0, 0, 2, 0, 4, 0, 0, 4,
    2, 0.24, 0, 4, 1.24, 0, 4, 1.24, 4, 2, 0.24, 4,
  ];
  return {
    kind: "template",
    sourceId,
    generation: 1,
    chunkX: 0,
    chunkZ: 0,
    chunkKey: citySurfaceChunkKey(0, 0),
    coreBoundsXZ: [0, 0, 64, 64],
    topologyHaloMeters: 0,
    triangles: {
      positions: new Float32Array(scaleY(positions, heightScale)),
      indices: new Uint16Array([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]),
      triangleRoles: new Uint8Array(4).fill(PackedCollisionRoleCode.RideableSurface),
      triangleProfileIndices: new Uint16Array(4),
      triangleSurfaceKeys: new Uint32Array([7, 7, 8, 8]),
      sourceTriangleIds: new Uint32Array([100, 101, 102, 103]),
    },
    surfaceProfiles: [SIDEWALK],
    surfaceTransitionProfiles: [CURB],
    explicitBoundaries: {
      boundaryXZ: new Float32Array([2, 0, 2, 4]),
      boundaryTransitionProfileIndices: new Uint16Array([0]),
      boundaryGroupKeys: new Uint32Array([99]),
      boundarySurfaceKeyPairs: new Uint32Array([7, 8]),
    },
  };
}

function localPointToWorld(x, z) {
  const cos = Math.cos(TRANSFORM.yawRadians);
  const sin = Math.sin(TRANSFORM.yawRadians);
  return {
    x: TRANSFORM.x + TRANSFORM.uniformScale * (cos * x + sin * z),
    z: TRANSFORM.z + TRANSFORM.uniformScale * (-sin * x + cos * z),
  };
}

function localVectorToWorld(x, z) {
  const cos = Math.cos(TRANSFORM.yawRadians);
  const sin = Math.sin(TRANSFORM.yawRadians);
  return {
    x: TRANSFORM.uniformScale * (cos * x + sin * z),
    z: TRANSFORM.uniformScale * (-sin * x + cos * z),
  };
}

function compareHit(actual, expected) {
  assert.ok(actual && expected, JSON.stringify({ actual, expected }));
  for (const key of [
    "ownerId", "ownerGeneration", "sourceTriangleId", "componentId",
    "primitiveKind", "featureKind", "canonicalFeatureId",
  ]) assert.equal(actual[key], expected[key], key);
  for (const key of ["toi", "distance", "normalX", "normalZ"]) close(actual[key], expected[key]);
}

function compareSample(actual, expected) {
  assert.deepEqual(actual.handle, expected.handle);
  assert.equal(actual.profileId, expected.profileId);
  assert.equal(actual.speedCap, expected.speedCap);
  for (const key of ["height", "normalX", "normalY", "normalZ", "gx", "gz"]) {
    close(actual[key], expected[key]);
  }
}

test("height-1 canonical owners match legacy height-baked collision across production scales", async (t) => {
  const canonicalSolid = await compileCollisionSource(solidPacked("canonical-solid", 1));
  const canonicalSurface = await compileCollisionSource(surfacePacked("canonical-surface", 1));

  for (const heightScale of HEIGHT_SCALES) {
    await t.test(`heightScale=${heightScale}`, async () => {
      const bakedSolid = await compileCollisionSource(solidPacked(`baked-solid-${heightScale}`, heightScale));
      const bakedSurface = await compileCollisionSource(surfacePacked(`baked-surface-${heightScale}`, heightScale));
      const createRuntime = (solid, surface, canonical) => new CompiledCityCollisionRuntime([
        {
          ownerId: "solid-owner",
          ownerGeneration: 9,
          source: solid,
          transform: { ...TRANSFORM, heightScale: canonical ? heightScale : 1 },
        },
        {
          ownerId: "surface-owner",
          ownerGeneration: 9,
          source: surface,
          transform: { ...TRANSFORM, heightScale: canonical ? heightScale : 1 },
        },
      ], { worldId: 901, documentGeneration: 9 });
      const legacy = createRuntime(bakedSolid, bakedSurface, false);
      const next = createRuntime(canonicalSolid, canonicalSurface, true);

      for (const ownerId of ["solid-owner", "surface-owner"]) {
        const legacyBounds = legacy.getOwnerWorldBounds(ownerId);
        const nextBounds = next.getOwnerWorldBounds(ownerId);
        assert.ok(legacyBounds && nextBounds);
        for (const key of ["minX", "minY", "minZ", "maxX", "maxY", "maxZ"]) {
          close(nextBounds[key], legacyBounds[key]);
        }
      }

      const wallStart = localPointToWorld(-2, 0);
      const wallDelta = localVectorToWorld(4, 0);
      const wallRequest = {
        startX: wallStart.x,
        startZ: wallStart.z,
        deltaX: wallDelta.x,
        deltaZ: wallDelta.z,
        minY: TRANSFORM.y + 0.5 * TRANSFORM.uniformScale * heightScale,
        maxY: TRANSFORM.y + 2.5 * TRANSFORM.uniformScale * heightScale,
        radius: 0.55 * TRANSFORM.uniformScale,
      };
      compareHit(next.querySweep(wallRequest).hit, legacy.querySweep(wallRequest).hit);

      const fallbackStart = localPointToWorld(4, 0.5);
      const fallbackDelta = localVectorToWorld(4, 0);
      const fallbackRequest = {
        startX: fallbackStart.x,
        startZ: fallbackStart.z,
        deltaX: fallbackDelta.x,
        deltaZ: fallbackDelta.z,
        minY: TRANSFORM.y + 1.8 * TRANSFORM.uniformScale * heightScale,
        maxY: TRANSFORM.y + 2.2 * TRANSFORM.uniformScale * heightScale,
        radius: 0.1 * TRANSFORM.uniformScale,
      };
      const legacyFallback = legacy.querySweep(fallbackRequest);
      const nextFallback = next.querySweep(fallbackRequest);
      assert.ok(legacyFallback.fallbackTriangleCandidateCount > 0);
      assert.equal(nextFallback.fallbackTriangleCandidateCount, legacyFallback.fallbackTriangleCandidateCount);
      compareHit(nextFallback.hit, legacyFallback.hit);

      const rightPoint = localPointToWorld(3, 2);
      const makeSample = () => createImplicitGroundSurfaceSample(901, 9);
      const legacyRight = makeSample();
      const nextRight = makeSample();
      const surfaceQuery = { currentY: 100, previousHandle: null, maxStepUpMeters: 100 };
      legacy.sampleCitySurface(rightPoint.x, rightPoint.z, surfaceQuery, legacyRight);
      next.sampleCitySurface(rightPoint.x, rightPoint.z, surfaceQuery, nextRight);
      compareSample(nextRight, legacyRight);

      const leftPoint = localPointToWorld(1, 2);
      const travel = localVectorToWorld(2, 0);
      const legacyLeft = makeSample();
      const nextLeft = makeSample();
      legacy.sampleCitySurface(leftPoint.x, leftPoint.z, surfaceQuery, legacyLeft);
      next.sampleCitySurface(leftPoint.x, leftPoint.z, surfaceQuery, nextLeft);
      compareSample(nextLeft, legacyLeft);
      const legacyBoundary = legacy.findEarliestSurfaceBoundaryCrossing(
        leftPoint.x, leftPoint.z, travel.x, travel.z, legacyLeft,
      );
      const nextBoundary = next.findEarliestSurfaceBoundaryCrossing(
        leftPoint.x, leftPoint.z, travel.x, travel.z, nextLeft,
      );
      assert.ok(legacyBoundary && nextBoundary);
      for (const key of ["kind", "handle", "fromSurface", "toSurface", "toProfileId"]) {
        assert.deepEqual(nextBoundary[key], legacyBoundary[key], key);
      }
      for (const key of [
        "distance", "fraction", "x", "z", "normalX", "normalZ",
        "fromHeight", "toHeight", "bumpStrength",
      ]) close(nextBoundary[key], legacyBoundary[key]);
      close(
        nextBoundary.toHeight - nextBoundary.fromHeight,
        (0.24 * TRANSFORM.uniformScale + 0.001) * heightScale,
        3e-4,
      );

      legacy.dispose();
      next.dispose();
      bakedSolid.fallback?.geometry.dispose();
      bakedSurface.fallback?.geometry.dispose();
    });
  }

  canonicalSolid.fallback?.geometry.dispose();
  canonicalSurface.fallback?.geometry.dispose();
});

test("heightScale rejects non-finite and non-positive owner transforms", async () => {
  const compiled = await compileCollisionSource(solidPacked("invalid-height-scale", 1));
  for (const heightScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => new CompiledCityCollisionRuntime([{
      ownerId: `invalid-${heightScale}`,
      ownerGeneration: 1,
      source: compiled,
      transform: { heightScale },
    }]), /heightScale|finite/);
  }
  compiled.fallback?.geometry.dispose();
});

test("document height edits keep one canonical compiled variant and move scale to the owner", () => {
  const plans = HEIGHT_SCALES.map((heightScale) => {
    const document = cloneCityDocument(emptyCityDocument());
    document.placements.push({
      id: "height-edited-booth",
      catalogId: "phone-booth",
      poseKind: "world",
      x: 10,
      z: 20,
      yawRadians: 0.4,
      scale: 1.2,
      heightScale,
    });
    return collectCityCollisionTemplatePlacements(parseCityMapDocument(document).document)[0];
  });
  assert.equal(new Set(plans.map(cityCollisionTemplateVariantKey)).size, 1);
  assert.deepEqual(plans.map((plan) => plan.resolvedHeightScale), HEIGHT_SCALES);
  assert.ok(plans.every((plan) => plan.transform.uniformScale === 1.2));
});
