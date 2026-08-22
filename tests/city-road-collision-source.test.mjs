import assert from "node:assert/strict";
import test from "node:test";

import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import { canonicalTupleKey } from "../app/lib/map/cityCollisionTypes.ts";
import { packRoadCollisionChunks } from "../app/lib/map/cityRoadCollisionSource.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";

function longRoadSources() {
  return deriveRoadCollisionSources({
    nodes: [
      { id: "west", x: -10, z: 0 },
      { id: "east", x: 138, z: 0 },
    ],
    edges: [{ id: "main", a: "west", b: "east", profile: createRoadProfile("two-way-1") }],
    intersectionOverrides: {},
  });
}

function junctionSources() {
  const profile = createRoadProfile("two-way-1");
  return deriveRoadCollisionSources({
    nodes: [
      { id: "center", x: 0, z: 0 },
      { id: "west", x: -80, z: 0 },
      { id: "east", x: 80, z: 0 },
      { id: "north", x: 0, z: -80 },
      { id: "south", x: 0, z: 80 },
    ],
    edges: [
      { id: "west-arm", a: "west", b: "center", profile },
      { id: "east-arm", a: "center", b: "east", profile },
      { id: "north-arm", a: "north", b: "center", profile },
      { id: "south-arm", a: "center", b: "south", profile },
    ],
    intersectionOverrides: {},
  });
}

function tJunctionSources() {
  const profile = createRoadProfile("two-way-1");
  return deriveRoadCollisionSources({
    nodes: [
      { id: "center", x: 0, z: 0 },
      { id: "west", x: -80, z: 0 },
      { id: "east", x: 80, z: 0 },
      { id: "north", x: 0, z: -80 },
    ],
    edges: [
      { id: "west-arm", a: "west", b: "center", profile },
      { id: "east-arm", a: "center", b: "east", profile },
      { id: "north-arm", a: "north", b: "center", profile },
    ],
    intersectionOverrides: {},
  });
}

async function runtimeFor(chunks, generation = 4) {
  const compiled = await Promise.all(chunks.map(async (chunk) => ({
    chunk,
    source: await compileCollisionSource(chunk.source),
  })));
  const runtime = new CompiledCityCollisionRuntime(compiled.map(({ chunk, source }) => ({
    ownerId: canonicalTupleKey(["road-chunk", chunk.source.chunkX, chunk.source.chunkZ]),
    ownerGeneration: generation,
    source,
    roadSurfaceHandles: chunk.surfaceHandles,
    roadBoundaryHandles: chunk.boundaryHandles,
  })), { worldId: 77, documentGeneration: generation });
  return { runtime, compiled };
}

function sampleBuffer(generation = 4) {
  return {
    handle: { kind: "implicit-ground", worldId: 77, documentGeneration: generation },
    profileId: "implicit-ground",
    height: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    gx: 0,
    gz: 0,
    speedCap: Infinity,
  };
}

test("road surfaces compile into 64 m owners and retain one road handle across seams", async (t) => {
  const chunks = packRoadCollisionChunks(longRoadSources(), 4);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.source.kind === "road-chunk"));
  assert.ok(chunks.every((chunk) => chunk.source.coreBoundsXZ[2] - chunk.source.coreBoundsXZ[0] === 64));
  const { runtime, compiled } = await runtimeFor(chunks);
  t.after(() => {
    runtime.dispose();
    for (const item of compiled) item.source.fallback?.geometry.dispose();
  });

  const left = sampleBuffer();
  runtime.sampleCitySurface(63.9, 0, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, left);
  assert.equal(left.profileId, "asphalt");
  assert.equal(left.handle.kind, "road");

  const right = sampleBuffer();
  runtime.sampleCitySurface(64.1, 0, {
    currentY: left.height,
    previousHandle: left.handle,
    maxStepUpMeters: 0.01,
  }, right);
  assert.equal(right.profileId, "asphalt");
  assert.deepEqual(right.handle, left.handle);
});

test("compiled road boundaries are queried through their chunk CSR and expose road handles", async (t) => {
  const chunks = packRoadCollisionChunks(longRoadSources(), 4);
  const { runtime, compiled } = await runtimeFor(chunks);
  t.after(() => {
    runtime.dispose();
    for (const item of compiled) item.source.fallback?.geometry.dispose();
  });
  const current = sampleBuffer();
  runtime.sampleCitySurface(72, 0, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, current);
  const crossing = runtime.findEarliestSurfaceBoundaryCrossing(72, 0, 0, -20, current);
  assert.ok(crossing);
  assert.equal(crossing.kind, "road-curb");
  assert.equal(crossing.handle.kind, "road");
  assert.equal(crossing.handle.roadEdgeId, "main");
});

test("junction sidewalk connectors survive chunk packing and compiled surface queries", async (t) => {
  const chunks = packRoadCollisionChunks(junctionSources(), 4);
  const { runtime, compiled } = await runtimeFor(chunks);
  t.after(() => {
    runtime.dispose();
    for (const item of compiled) item.source.fallback?.geometry.dispose();
  });
  const corner = sampleBuffer();
  runtime.sampleCitySurface(10, -10, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.3,
  }, corner);
  assert.equal(corner.profileId, "sidewalk");
  assert.ok(Math.abs(corner.height - 0.24) < 1e-6);
  assert.equal(corner.handle.kind, "road");
});

test("compiled four-way corners report both inner and outer curb crossings without blocking approach seams", async (t) => {
  const chunks = packRoadCollisionChunks(junctionSources(), 4);
  const { runtime, compiled } = await runtimeFor(chunks);
  t.after(() => {
    runtime.dispose();
    for (const item of compiled) item.source.fallback?.geometry.dispose();
  });

  const asphalt = sampleBuffer();
  runtime.sampleCitySurface(5, -10, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, asphalt);
  assert.equal(asphalt.profileId, "implicit-ground");
  const inner = runtime.findEarliestSurfaceBoundaryCrossing(5, -10, 5, 0, asphalt);
  assert.ok(inner);
  assert.equal(inner.kind, "road-curb");
  assert.equal(inner.handle.kind, "road");
  assert.equal(inner.handle.side, "junction");
  assert.equal(inner.toProfileId, "sidewalk");
  assert.ok(inner.bumpStrength > 0);

  const sidewalk = sampleBuffer();
  runtime.sampleCitySurface(18, -18, {
    currentY: 0.24,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, sidewalk);
  assert.equal(sidewalk.profileId, "sidewalk");
  const outer = runtime.findEarliestSurfaceBoundaryCrossing(18, -18, 5, 0, sidewalk);
  assert.ok(outer);
  assert.equal(outer.handle.kind, "road");
  assert.equal(outer.handle.side, "junction");
  assert.equal(outer.toProfileId, "implicit-ground");
  assert.ok(outer.bumpStrength > 0);

  const connectorToApproach = sampleBuffer();
  runtime.sampleCitySurface(10, -18, {
    currentY: 0.24,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, connectorToApproach);
  assert.equal(runtime.findEarliestSurfaceBoundaryCrossing(
    10, -18, 0, -5, connectorToApproach,
  ), null, "the sidewalk-to-sidewalk approach seam must stay open");
});

test("compiled T-junction bridge detects the curb on both road halves and its ground edge", async (t) => {
  const chunks = packRoadCollisionChunks(tJunctionSources(), 4);
  const { runtime, compiled } = await runtimeFor(chunks);
  t.after(() => {
    runtime.dispose();
    for (const item of compiled) item.source.fallback?.geometry.dispose();
  });

  for (const x of [-10, 10]) {
    const asphalt = sampleBuffer();
    runtime.sampleCitySurface(x, 5, {
      currentY: 0,
      previousHandle: null,
      maxStepUpMeters: 0.01,
    }, asphalt);
    assert.equal(asphalt.profileId, "implicit-ground");
    const crossing = runtime.findEarliestSurfaceBoundaryCrossing(x, 5, 0, 5, asphalt);
    assert.ok(crossing, `bridge curb must be detected at x=${x}`);
    assert.equal(crossing.handle.kind, "road");
    assert.equal(crossing.handle.side, "junction");
    assert.equal(crossing.toProfileId, "sidewalk");
  }

  const sidewalk = sampleBuffer();
  runtime.sampleCitySurface(10, 10, {
    currentY: 0.24,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, sidewalk);
  const outer = runtime.findEarliestSurfaceBoundaryCrossing(10, 10, 0, 10, sidewalk);
  assert.ok(outer);
  assert.equal(outer.toProfileId, "implicit-ground");
});
