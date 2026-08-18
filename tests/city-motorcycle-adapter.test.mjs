import assert from "node:assert/strict";
import test from "node:test";

import { DocumentCityCollisionWorld } from "../app/lib/map/cityDocumentCollision.ts";
import { CityMotorcycleAdapter } from "../app/lib/map/cityMotorcycleAdapter.ts";
import {
  ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR,
  CITY_PHYSICS_FIXED_DT_SECONDS,
} from "../app/lib/map/cityCollisionTypes.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";

function closeTo(actual, expected, epsilon = 1e-8, message = "") {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message || "values differ"}: expected ${expected}, got ${actual}`,
  );
}

function emptySources() {
  return deriveRoadCollisionSources({ nodes: [], edges: [], intersectionOverrides: {} });
}

function roadSources() {
  return deriveRoadCollisionSources({
    nodes: [{ id: "a", x: -20, z: 0 }, { id: "b", x: 20, z: 0 }],
    edges: [{ id: "road", a: "a", b: "b", profile: createRoadProfile("two-way-1") }],
    intersectionOverrides: {},
  });
}

function proxyWorld(base, resolveCityMove) {
  return {
    worldId: base.worldId,
    documentGeneration: base.documentGeneration,
    sampleCitySurface(x, z, query, out) {
      return base.sampleCitySurface(x, z, query, out);
    },
    resolveCityMove(request, out) {
      return resolveCityMove(request, out, base);
    },
    resetRiderContacts() {
      base.resetRiderContacts();
    },
  };
}

test("38m/s fixed tick uses two <=0.25m microsteps and feeds forward collision velocity", () => {
  const base = new DocumentCityCollisionWorld([], emptySources());
  const calls = [];
  const world = proxyWorld(base, (request, out, source) => {
    calls.push({ velocityX: request.velocityX, velocityZ: request.velocityZ, dt: request.microDtSeconds });
    const result = source.resolveCityMove(request, out);
    if (calls.length === 1) result.velocityX *= 0.5;
    return result;
  });
  const adapter = new CityMotorcycleAdapter(world);
  const distance = 38 * CITY_PHYSICS_FIXED_DT_SECONDS;
  adapter.beginFixedStep(0, 0, CITY_PHYSICS_FIXED_DT_SECONDS, Math.PI * 0.5, false);
  const result = adapter.resolveBike(
    { x: distance, z: 0, r: 0.55 },
    { x: 1, z: 0 },
    38,
    Math.PI * 0.5,
  );

  assert.equal(adapter.lastMicrostepCount, 2);
  assert.equal(calls.length, 2);
  closeTo(calls[0].dt, 1 / 240);
  closeTo(calls[0].velocityX, 38);
  closeTo(calls[1].velocityX, 19, 1e-12, "second segment must use the prior result velocity");
  closeTo(result.x, 38 / 240 + 19 / 240);
  closeTo(result.speed, 19);
});

test("riding up or down any ordinary curb preserves speed and heading", () => {
  const upAdapter = new CityMotorcycleAdapter(new DocumentCityCollisionWorld([], roadSources()));
  upAdapter.beginFixedStep(0, -6, 0.2, { heading: Math.PI, drifting: false });
  const up = upAdapter.resolveBike(
    { x: 0, z: -10, r: 0.55 },
    { x: 0, z: -1 },
    20,
    Math.PI,
  );
  closeTo(up.speed, 20);
  closeTo(up.heading, Math.PI);
  assert.equal(upAdapter.getSurfaceSample().profileId, "sidewalk");
  assert.equal(upAdapter.getSurfaceSample().speedCap, 12);

  const downAdapter = new CityMotorcycleAdapter(new DocumentCityCollisionWorld([], roadSources()));
  downAdapter.beginFixedStep(0, -10, 0.2, 0, false);
  const down = downAdapter.resolveBike(
    { x: 0, z: -6, r: 0.55 },
    { x: 0, z: 1 },
    20,
    0,
  );
  closeTo(down.speed, 20);
  closeTo(down.heading, 0);
  assert.equal(downAdapter.getSurfaceSample().profileId, "bike-lane");

  const upBump = upAdapter.consumePresentationBump();
  const downBump = downAdapter.consumePresentationBump();
  assert.ok(upBump.active && downBump.active);
  assert.ok(upBump.pitch > 0, "up curb uses the positive pitch impulse");
  assert.ok(downBump.pitch < 0, "down curb uses the negative pitch impulse");
});

test("curb bump is bounded, returns to zero at 0.22s, and one boundary cannot double-stack", () => {
  const base = new DocumentCityCollisionWorld([], emptySources());
  const stableHandle = Object.freeze({
    kind: "road",
    worldId: base.worldId,
    documentGeneration: base.documentGeneration,
    roadEdgeId: "same-road",
    side: "left",
    curbRun: 0,
  });
  const world = proxyWorld(base, (request, out, source) => {
    const result = source.resolveCityMove(request, out);
    const event = result.transitionEvents[0];
    event.kind = "road-curb";
    event.boundaryHandle = stableHandle;
    event.stepDeltaY = 0.24;
    event.bumpStrength = 1;
    result.transitionCount = 1;
    return result;
  });
  const adapter = new CityMotorcycleAdapter(world);
  const distance = 38 * CITY_PHYSICS_FIXED_DT_SECONDS;
  adapter.beginFixedStep(0, 0, CITY_PHYSICS_FIXED_DT_SECONDS, Math.PI * 0.5, false);
  adapter.resolveBike({ x: distance, z: 0, r: 0.55 }, { x: 1, z: 0 }, 38, Math.PI * 0.5);

  const initial = adapter.consumePresentationBump();
  assert.equal(initial.sequence, 1, "two microstep reports for one handle collapse into one impulse");
  assert.ok(initial.y <= 0.12);
  assert.ok(Math.abs(initial.pitch) <= 0.10);
  const duplicateConsumer = adapter.consumePresentationBump();
  assert.equal(duplicateConsumer.y, 0, "rider/camera must share one consumed sample rather than add two");
  assert.equal(duplicateConsumer.pitch, 0);

  adapter.advancePresentationBump(0.11);
  const middle = adapter.consumePresentationBump();
  assert.ok(middle.y >= 0 && middle.y <= 0.12);
  assert.ok(Math.abs(middle.pitch) <= 0.10);
  adapter.advancePresentationBump(0.11);
  const ended = adapter.consumePresentationBump();
  assert.deepEqual(ended, { y: 0, pitch: 0, active: false, sequence: 1 });
});

test("thin-wall response returns authoritative speed/heading and emits an impact callback", () => {
  const impacts = [];
  const wall = {
    ownerId: "thin-wall",
    ownerGeneration: 1,
    canonicalSegmentId: 1,
    canonicalVertexAId: 2,
    canonicalVertexBId: 3,
    ax: -10,
    az: 0,
    bx: 10,
    bz: 0,
    minY: -1,
    maxY: 4,
    nx: 0,
    nz: -1,
  };
  const adapter = new CityMotorcycleAdapter(
    new DocumentCityCollisionWorld([wall], emptySources()),
    { onImpact: (impact) => impacts.push(impact) },
  );
  const startZ = -0.75;
  adapter.beginFixedStep(0, startZ, CITY_PHYSICS_FIXED_DT_SECONDS, 0, false);
  const result = adapter.resolveBike(
    { x: 0, z: startZ + 38 * CITY_PHYSICS_FIXED_DT_SECONDS, r: 0.55 },
    { x: 0, z: 1 },
    38,
    0,
  );

  assert.equal(adapter.lastMicrostepCount, 2);
  assert.ok(result.z <= -0.552 + 1e-9, "sweep stops outside the wall skin");
  assert.equal(result.speed, 0);
  assert.equal(result.heading, 0);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].contact.ownerId, "thin-wall");
  closeTo(impacts[0].normalImpactSpeed, 38);

  const diagonalNormal = Math.SQRT1_2;
  const diagonalAdapter = new CityMotorcycleAdapter(new DocumentCityCollisionWorld([{
    ...wall,
    ownerId: "diagonal-wall",
    ax: -5,
    az: -5,
    bx: 5,
    bz: 5,
    nx: diagonalNormal,
    nz: -diagonalNormal,
  }], emptySources()));
  diagonalAdapter.beginFixedStep(2, -2, 0.2, 0, false);
  const slide = diagonalAdapter.resolveBike(
    { x: 2, z: 2, r: 0.55 },
    { x: 0, z: 1 },
    20,
    0,
  );
  closeTo(
    slide.speed,
    20 - ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR * 20 * Math.SQRT1_2,
  );
  closeTo(slide.heading, Math.PI * 0.25, 1e-8, "adapter propagates tangent-aligned wall heading");
  closeTo(slide.velHeading, Math.PI * 0.25, 1e-8, "adapter preserves projected travel direction");
  assert.equal(slide.drifting, false);
});

test("sampleBoundary exposes packed surface height and sidewalk speed cap", () => {
  const adapter = new CityMotorcycleAdapter(new DocumentCityCollisionWorld([], roadSources()));
  const asphalt = adapter.sampleBoundary(0, 0);
  const sidewalk = adapter.sampleBoundary(0, -10);
  assert.equal(asphalt.height, 0);
  assert.equal(asphalt.speedCap, Infinity);
  assert.equal(sidewalk.height, 0.24);
  assert.equal(sidewalk.speedCap, 12);
  assert.equal(sidewalk.steep, false);
  assert.equal(sidewalk.ax, 0);
  assert.equal(sidewalk.az, 0);
});
