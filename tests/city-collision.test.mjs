import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalyticCityCollisionWorld,
  copySurfaceSample,
  createCityMoveResultBuffer,
  createImplicitGroundSurfaceSample,
} from "../app/lib/map/cityCollision.ts";
import { CityFixedStepRunner } from "../app/lib/map/cityFixedStep.ts";
import {
  ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR,
  BIKE_COLLISION_RADIUS_METERS,
  CITY_PHYSICS_FIXED_DT_SECONDS,
} from "../app/lib/map/cityCollisionTypes.ts";

const closeTo = (actual, expected, epsilon = 1e-6, message = "") => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message || "values differ"}: expected ${expected}, got ${actual}`,
  );
};

function wall(overrides = {}) {
  return {
    ownerId: "fixture-wall",
    ownerGeneration: 1,
    canonicalSegmentId: 1,
    canonicalVertexAId: 10,
    canonicalVertexBId: 11,
    ax: -10,
    az: 0,
    bx: 10,
    bz: 0,
    minY: -1,
    maxY: 4,
    nx: 0,
    nz: -1,
    ...overrides,
  };
}

function move(world, overrides = {}) {
  const startSurface = overrides.startSurface
    ?? createImplicitGroundSurfaceSample(world.worldId, world.documentGeneration);
  const request = {
    startX: 0,
    startZ: -2,
    microDtSeconds: 0.2,
    velocityX: 0,
    velocityZ: 10,
    motionSign: 1,
    bodyHeading: 0,
    drifting: false,
    ...overrides,
    startSurface,
  };
  return world.resolveCityMove(request, createCityMoveResultBuffer(world.worldId, world.documentGeneration));
}

function stateFor(world, overrides = {}) {
  return {
    x: 0,
    z: 0,
    velocityX: 0,
    velocityZ: 10,
    motionSign: 1,
    bodyHeading: 0,
    drifting: false,
    surface: createImplicitGroundSurfaceSample(world.worldId, world.documentGeneration),
    ...overrides,
  };
}

test("moving circle stops at the hand-computed thin-wall TOI without tunnelling", () => {
  const world = new AnalyticCityCollisionWorld([wall()]);
  const result = move(world);
  closeTo(result.z, -BIKE_COLLISION_RADIUS_METERS - 0.002, 1e-9, "skin-backed contact");
  closeTo(result.x, 0);
  assert.equal(result.velocityX, 0);
  assert.equal(result.velocityZ, 0);
  assert.equal(result.motionSign, 0);
  assert.equal(result.impactCount, 1);
  assert.equal(result.impactEvents[0].kind, "contact-begin");
  closeTo(result.impactEvents[0].normalX, 0);
  closeTo(result.impactEvents[0].normalZ, -1);
  closeTo(result.impactEvents[0].normalImpactSpeed, 10);
});

test("finite segment endpoint uses the analytic circle quadratic", () => {
  const world = new AnalyticCityCollisionWorld([
    wall({ ax: 0, bx: 2, canonicalSegmentId: 2, canonicalVertexAId: 20, canonicalVertexBId: 21 }),
  ]);
  const result = move(world, {
    startX: -2,
    startZ: 0,
    velocityX: 3,
    velocityZ: 0,
    microDtSeconds: 1,
    bodyHeading: Math.PI / 2,
  });
  closeTo(result.x, -BIKE_COLLISION_RADIUS_METERS - 0.002, 1e-9);
  closeTo(result.z, 0);
  assert.equal(result.impactEvents[0].contact?.featureKind, "vertex");
  assert.equal(result.impactEvents[0].contact?.canonicalFeatureId, 20);
  closeTo(result.impactEvents[0].normalX, -1);
  assert.equal(result.velocityX, 0);
});

test("45-degree wall projects both residual displacement and authoritative velocity onto its tangent", () => {
  const inverseRootTwo = Math.SQRT1_2;
  const world = new AnalyticCityCollisionWorld([
    wall({
      ax: -5,
      az: -5,
      bx: 5,
      bz: 5,
      nx: inverseRootTwo,
      nz: -inverseRootTwo,
      canonicalSegmentId: 3,
      canonicalVertexAId: 30,
      canonicalVertexBId: 31,
    }),
  ]);
  const result = move(world, {
    startX: 2,
    startZ: -2,
    velocityX: 0,
    velocityZ: 20,
    microDtSeconds: 0.2,
  });
  const normal = result.impactEvents[0];
  closeTo(Math.hypot(normal.normalX, normal.normalZ), 1);
  assert.ok(result.velocityX > 0 && result.velocityZ > 0, "slide follows the +x,+z wall tangent");
  closeTo(result.velocityX, result.velocityZ, 1e-8);
  const expectedMagnitude = 20
    - ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR * (20 * Math.SQRT1_2);
  closeTo(Math.hypot(result.velocityX, result.velocityZ), expectedMagnitude, 1e-8,
    "impact magnitude uses the legacy TREE_SPEED_LOSS=0.75 response");
  assert.ok(result.velocityX * normal.normalX + result.velocityZ * normal.normalZ >= -1e-9);
  const signedDistance = (result.x - -5) * normal.normalX + (result.z - -5) * normal.normalZ;
  assert.ok(signedDistance >= BIKE_COLLISION_RADIUS_METERS, "final centre remains outside the wall");
});

test("parallel grazing is non-blocking, while TOI=0 distinguishes inward from outward motion", () => {
  const world = new AnalyticCityCollisionWorld([wall()]);
  const grazing = move(world, {
    startX: -2,
    startZ: -BIKE_COLLISION_RADIUS_METERS,
    velocityX: 4,
    velocityZ: 0,
    microDtSeconds: 0.5,
    bodyHeading: Math.PI / 2,
  });
  closeTo(grazing.x, 0);
  closeTo(grazing.z, -BIKE_COLLISION_RADIUS_METERS);
  assert.equal(grazing.impactCount, 0);

  const inward = move(world, {
    startZ: -BIKE_COLLISION_RADIUS_METERS,
    velocityZ: 4,
    microDtSeconds: 0.25,
  });
  closeTo(inward.z, -BIKE_COLLISION_RADIUS_METERS);
  assert.equal(inward.velocityZ, 0);
  assert.equal(inward.impactCount, 1);

  world.resetRiderContacts();
  const outward = move(world, {
    startZ: -BIKE_COLLISION_RADIUS_METERS,
    velocityZ: -4,
    microDtSeconds: 0.25,
    bodyHeading: Math.PI,
  });
  closeTo(outward.z, -BIKE_COLLISION_RADIUS_METERS - 1);
  assert.equal(outward.velocityZ, -4);
  assert.equal(outward.impactCount, 0);
});

test("initial shallow penetration recovers horizontally and walls outside the rider Y band are ignored", () => {
  const world = new AnalyticCityCollisionWorld([wall()]);
  const recovered = move(world, {
    startZ: -0.1,
    velocityZ: 0,
    microDtSeconds: 0,
    motionSign: 0,
  });
  closeTo(recovered.z, -BIKE_COLLISION_RADIUS_METERS - 0.002, 1e-9);
  assert.equal(recovered.impactCount, 0, "depenetration is independent from impact begin");

  const overhead = new AnalyticCityCollisionWorld([wall({ minY: 3, maxY: 5 })]);
  const passed = move(overhead);
  closeTo(passed.z, 0);
  assert.equal(passed.impactCount, 0);

  const elevatedSurface = createImplicitGroundSurfaceSample(overhead.worldId, overhead.documentGeneration);
  elevatedSurface.height = 3;
  const elevated = move(overhead, { startSurface: elevatedSurface });
  assert.ok(elevated.z < 0, "the same wall participates when the frozen start Y band overlaps it");
  assert.equal(elevated.transitionCount, 0, "PR6b-1 does not implement surface transitions");
  assert.equal(elevated.surface.height, 3, "the microstep preserves its frozen start surface");
});

test("simultaneous corner contacts are stable under wall input permutation and stop the circle", () => {
  const horizontal = wall({ ownerId: "horizontal", canonicalSegmentId: 4, canonicalVertexAId: 40, canonicalVertexBId: 41 });
  const vertical = wall({
    ownerId: "vertical",
    canonicalSegmentId: 5,
    canonicalVertexAId: 50,
    canonicalVertexBId: 51,
    ax: 0,
    az: -10,
    bx: 0,
    bz: 10,
    nx: -1,
    nz: 0,
  });
  const run = (walls) => move(new AnalyticCityCollisionWorld(walls, { worldId: 77 }), {
    startX: -2,
    startZ: -2,
    velocityX: 10,
    velocityZ: 10,
    microDtSeconds: 0.2,
    bodyHeading: Math.PI / 4,
  });
  const first = run([horizontal, vertical]);
  const second = run([vertical, horizontal]);
  closeTo(first.x, second.x, 1e-12);
  closeTo(first.z, second.z, 1e-12);
  closeTo(first.velocityX, 0);
  closeTo(first.velocityZ, 0);
  assert.equal(first.impactCount, 1, "a TOI tie emits one dominant begin event");
  assert.ok(first.x <= -BIKE_COLLISION_RADIUS_METERS);
  assert.ok(first.z <= -BIKE_COLLISION_RADIUS_METERS);
});

test("collide-and-slide discards residual motion after the fourth blocking hit", () => {
  // Four bevels form a deterministic zig-zag contact chain within one long move.
  const endpoints = [
    [-6.30, -5.38, 15.02, 3.47],
    [10.11, -6.19, 7.80, 10.79],
    [9.58, -0.98, 4.97, -0.23],
    [18.38, -10.53, 7.29, -2.50],
  ];
  const walls = endpoints.map(([ax, az, bx, bz], index) => {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    return wall({
      ownerId: `limit-${index}`,
      canonicalSegmentId: 100 + index,
      canonicalVertexAId: 200 + index * 2,
      canonicalVertexBId: 201 + index * 2,
      ax,
      az,
      bx,
      bz,
      nx: -dz / length,
      nz: dx / length,
    });
  });
  const world = new AnalyticCityCollisionWorld(walls);
  const result = move(world, {
    startX: -5,
    startZ: -5,
    velocityX: 14,
    velocityZ: 11,
    microDtSeconds: 1.5,
    bodyHeading: Math.atan2(14, 11),
  });
  assert.equal(result.hitLimitReached, true);
  assert.equal(result.impactCount, 4);
  assert.deepEqual(
    result.impactEvents.map((event) => event.contact?.ownerId),
    ["limit-0", "limit-2", "limit-1", "limit-3"],
  );
});

test("persistent sliding contact does not repeatedly emit impact begin or scrub speed", () => {
  const world = new AnalyticCityCollisionWorld([wall()]);
  const first = move(world, {
    startX: -1,
    startZ: -2,
    velocityX: 5,
    velocityZ: 10,
    microDtSeconds: 0.2,
    bodyHeading: Math.atan2(5, 10),
  });
  assert.equal(first.impactCount, 1);
  assert.ok(world.activeContactCount() > 0);
  const second = move(world, {
    startX: first.x,
    startZ: first.z,
    velocityX: first.velocityX,
    velocityZ: first.velocityZ,
    microDtSeconds: 0.1,
    bodyHeading: first.bodyHeading,
    startSurface: first.surface,
  });
  assert.equal(second.impactCount, 0);
  closeTo(second.velocityX, first.velocityX, 1e-9);
  closeTo(second.velocityZ, 0, 1e-9);
});

test("fixed-step replay is render-rate independent at 30/60/120/144Hz", () => {
  const simulate = (renderHz) => {
    const world = new AnalyticCityCollisionWorld([]);
    const runner = new CityFixedStepRunner();
    const state = stateFor(world, { velocityZ: 10 });
    let fixedSteps = 0;
    for (let frame = 0; frame < renderHz; frame += 1) {
      fixedSteps += runner.advance(1 / renderHz, state, world).fixedSteps;
    }
    return { state, runner, fixedSteps };
  };
  const runs = [30, 60, 120, 144].map(simulate);
  for (const run of runs) {
    assert.equal(run.fixedSteps, 120);
    closeTo(run.runner.simulationTimeSeconds, 1, 1e-12);
    closeTo(run.state.z, 10, 1e-10);
  }
});

test("fixed-step runner limits catch-up, slices 38m/s, and feeds updated velocity into the next microstep", () => {
  const world = new AnalyticCityCollisionWorld([]);
  const calls = [];
  const resolver = {
    resolveCityMove(request, out) {
      calls.push({ velocityX: request.velocityX, microDtSeconds: request.microDtSeconds });
      const result = world.resolveCityMove(request, out);
      if (calls.length === 1) result.velocityX *= 0.5;
      return result;
    },
  };
  const runner = new CityFixedStepRunner();
  const state = stateFor(world, {
    velocityX: 38,
    velocityZ: 0,
    bodyHeading: Math.PI / 2,
  });
  const frame = runner.advance(CITY_PHYSICS_FIXED_DT_SECONDS, state, resolver);
  assert.equal(frame.fixedSteps, 1);
  assert.equal(frame.microsteps, 2);
  closeTo(calls[0].microDtSeconds, 1 / 240);
  closeTo(calls[0].velocityX, 38);
  closeTo(calls[1].velocityX, 19, 1e-12, "second microstep uses collision-updated velocity");
  closeTo(state.x, 38 / 240 + 19 / 240, 1e-12);

  const droppedRunner = new CityFixedStepRunner();
  const stopped = stateFor(world, { velocityZ: 0, motionSign: 0 });
  const catchUp = droppedRunner.advance(0.1, stopped, world);
  assert.equal(catchUp.fixedSteps, 6);
  closeTo(catchUp.droppedSeconds, 0.05, 1e-12);
  closeTo(catchUp.accumulatorSeconds, 0, 1e-12);
});

test("38m/s fixed tick cannot cross a thin wall", () => {
  const world = new AnalyticCityCollisionWorld([wall()]);
  const runner = new CityFixedStepRunner();
  const state = stateFor(world, {
    z: -0.75,
    velocityZ: 38,
  });
  const frame = runner.advance(CITY_PHYSICS_FIXED_DT_SECONDS, state, world);
  assert.equal(frame.microsteps, 2);
  assert.ok(state.z <= -BIKE_COLLISION_RADIUS_METERS);
  assert.equal(state.velocityZ, 0);
});

test("surface/result buffers remain distinct across A-to-B reuse", () => {
  const world = new AnalyticCityCollisionWorld([]);
  const surfaceA = createImplicitGroundSurfaceSample(world.worldId, world.documentGeneration);
  const resultB = createCityMoveResultBuffer(world.worldId, world.documentGeneration);
  const result = world.resolveCityMove({
    startX: 0,
    startZ: 0,
    microDtSeconds: 0,
    velocityX: 0,
    velocityZ: 0,
    motionSign: 0,
    bodyHeading: 0,
    drifting: false,
    startSurface: surfaceA,
  }, resultB);
  assert.notEqual(result.surface, surfaceA);
  assert.notEqual(result.surface.handle, surfaceA.handle);
  const surfaceA2 = createImplicitGroundSurfaceSample();
  copySurfaceSample(surfaceA2, result.surface);
  assert.notEqual(surfaceA2.handle, result.surface.handle);
  assert.deepEqual(surfaceA2, result.surface);
});
