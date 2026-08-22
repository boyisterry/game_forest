import assert from "node:assert/strict";
import test from "node:test";
import {
  collisionPayloadTransferList,
  compileCollisionSource,
  deserializeCompiledCollision,
  hashCollisionCompileSource,
  resolveFallbackSourceTriangleId,
  serializeCompiledCollision,
} from "../app/lib/map/cityCollisionCompileCore.ts";
import { CityCollisionPayloadStore } from "../app/lib/map/cityCollisionStorage.ts";
import { CityCollisionWorkerClient, collisionSourceTransferList } from "../app/lib/map/cityCollisionWorkerClient.ts";
import { CityCollisionCompilerProtocol } from "../app/lib/map/cityCollisionWorkerProtocol.ts";
import {
  COLLISION_COMPILER_VERSION,
  COLLISION_WIRE_VERSION,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
} from "../app/lib/map/cityCollisionTypes.ts";
import {
  THREE_MESH_BVH_PACKAGE_VERSION,
  THREE_MESH_BVH_WIRE_VERSION,
} from "../app/lib/map/cityCollisionWire.ts";

const sidewalkProfile = Object.freeze({
  id: "sidewalk",
  family: "sidewalk",
  speedCap: 12,
  maxSlopeDegrees: 30,
  selectionPriority: 50,
});
const curbTransition = Object.freeze({
  id: "road-curb",
  kind: "road-curb",
  maxStepUpMeters: 0.3,
  maxStepDownMeters: 0.3,
  bumpProfile: "curb-strong",
});

function thinWallSource(overrides = {}) {
  return {
    kind: "template",
    sourceId: "thin-wall",
    generation: 1,
    triangles: {
      positions: new Float32Array([
        0, 0, 0,
        0, 2, 0,
        4, 0, 0,
      ]),
      indices: new Uint16Array([0, 1, 2]),
      triangleRoles: new Uint8Array([PackedCollisionRoleCode.Solid]),
      triangleProfileIndices: new Uint16Array([SURFACE_PROFILE_INDEX_NONE]),
      triangleSurfaceKeys: new Uint32Array([NO_SURFACE_KEY]),
      sourceTriangleIds: new Uint32Array([17]),
    },
    surfaceProfiles: [],
    surfaceTransitionProfiles: [],
    ...overrides,
  };
}

function mixedSolidSource(overrides = {}) {
  return {
    kind: "template",
    sourceId: "mixed-solid",
    generation: 3,
    triangles: {
      positions: new Float32Array([
        0, 0, 0,
        0, 2, 0,
        4, 0, 0,
        4, 1, 2,
      ]),
      indices: new Uint16Array([
        0, 1, 2,
        0, 2, 3,
      ]),
      triangleRoles: new Uint8Array([
        PackedCollisionRoleCode.Solid,
        PackedCollisionRoleCode.Solid,
      ]),
      triangleProfileIndices: new Uint16Array([
        SURFACE_PROFILE_INDEX_NONE,
        SURFACE_PROFILE_INDEX_NONE,
      ]),
      triangleSurfaceKeys: new Uint32Array([NO_SURFACE_KEY, NO_SURFACE_KEY]),
      sourceTriangleIds: new Uint32Array([101, 102]),
    },
    surfaceProfiles: [],
    surfaceTransitionProfiles: [],
    ...overrides,
  };
}

function roadSurfaceSource(overrides = {}) {
  return {
    kind: "road-chunk",
    sourceId: "road/0/0",
    generation: 8,
    chunkX: 0,
    chunkZ: 0,
    chunkKey: 2147516416,
    coreBoundsXZ: [0, 0, 64, 64],
    topologyHaloMeters: 1,
    triangles: {
      positions: new Float32Array([
        // Solid vertical triangle.
        8, 0, 5,
        8, 2, 5,
        12, 0, 5,
        // Rideable sidewalk triangle.
        1, 0.24, 1,
        3, 0.24, 1,
        1, 0.24, 3,
        // Visible but ignored triangle.
        10, 6, 10,
        11, 6, 10,
        10, 6, 11,
      ]),
      indices: new Uint16Array([
        0, 1, 2,
        3, 4, 5,
        6, 7, 8,
      ]),
      triangleRoles: new Uint8Array([
        PackedCollisionRoleCode.Solid,
        PackedCollisionRoleCode.RideableSurface,
        PackedCollisionRoleCode.Ignore,
      ]),
      triangleProfileIndices: new Uint16Array([
        SURFACE_PROFILE_INDEX_NONE,
        0,
        SURFACE_PROFILE_INDEX_NONE,
      ]),
      triangleSurfaceKeys: new Uint32Array([NO_SURFACE_KEY, 7001, NO_SURFACE_KEY]),
      sourceTriangleIds: new Uint32Array([201, 202, 203]),
    },
    surfaceProfiles: [sidewalkProfile],
    surfaceTransitionProfiles: [curbTransition],
    explicitBoundaries: {
      boundaryXZ: new Float32Array([0, 0, 4, 0]),
      boundaryTransitionProfileIndices: new Uint16Array([0]),
      boundaryGroupKeys: new Uint32Array([91]),
      boundarySurfaceKeyPairs: new Uint32Array([7001, 7002]),
    },
    ...overrides,
  };
}

function cloneSource(source, overrides = {}) {
  return {
    ...source,
    triangles: {
      positions: new Float32Array(source.triangles.positions),
      indices: new source.triangles.indices.constructor(source.triangles.indices),
      triangleRoles: new Uint8Array(source.triangles.triangleRoles),
      triangleProfileIndices: new Uint16Array(source.triangles.triangleProfileIndices),
      triangleSurfaceKeys: new Uint32Array(source.triangles.triangleSurfaceKeys),
      sourceTriangleIds: new Uint32Array(source.triangles.sourceTriangleIds),
    },
    surfaceProfiles: source.surfaceProfiles.map((profile) => ({ ...profile })),
    surfaceTransitionProfiles: source.surfaceTransitionProfiles.map((profile) => ({ ...profile })),
    explicitBoundaries: source.explicitBoundaries ? {
      boundaryXZ: new Float32Array(source.explicitBoundaries.boundaryXZ),
      boundaryTransitionProfileIndices: new Uint16Array(source.explicitBoundaries.boundaryTransitionProfileIndices),
      boundaryGroupKeys: new Uint32Array(source.explicitBoundaries.boundaryGroupKeys),
      boundarySurfaceKeyPairs: new Uint32Array(source.explicitBoundaries.boundarySurfaceKeyPairs),
    } : undefined,
    ...overrides,
  };
}

test("a strict vertical thin triangle becomes one exact t/y wall feature", async () => {
  const source = thinWallSource();
  const compiled = await compileCollisionSource(source);
  assert.equal(compiled.fallback, null);
  assert.equal(compiled.walls.sourceTriangleIds.length, 1);
  assert.deepEqual([...compiled.walls.segmentXZ], [0, 0, 4, 0]);
  assert.deepEqual([...compiled.walls.triangleTY], [0, 0, 0, 2, 4, 0],
    "the triangular height section is retained instead of extruded to a rectangle");
  assert.equal(compiled.walls.sourceTriangleIds[0], 17);
  assert.notEqual(compiled.walls.segmentXZ.buffer, source.triangles.positions.buffer);
});

test("one slanted member sends the complete connected solid component to an indirect BVH", async () => {
  const source = mixedSolidSource();
  const compiled = await compileCollisionSource(source);
  assert.equal(compiled.walls.sourceTriangleIds.length, 0);
  assert.ok(compiled.fallback);
  assert.equal(compiled.fallback.bvh.indirect, true);
  assert.deepEqual([...compiled.fallback.resolvedSourceTriangleIds], [101, 102]);
  assert.notEqual(compiled.fallback.geometry.getAttribute("position").array.buffer,
    source.triangles.positions.buffer);
  const resolved = [0, 1].map((index) => resolveFallbackSourceTriangleId(compiled.fallback, index)).sort();
  assert.deepEqual(resolved, [101, 102],
    "metadata lookup follows bvh.resolveTriangleIndex rather than treating traversal indices as direct");
});

test("role filtering builds 64 m surface and boundary CSR tables with speedCap", async () => {
  const source = roadSurfaceSource();
  const compiled = await compileCollisionSource(source);
  assert.equal(compiled.walls.sourceTriangleIds.length, 1);
  assert.equal(compiled.fallback, null);
  assert.ok(compiled.surfaceChunk);
  const chunk = compiled.surfaceChunk;
  assert.equal(chunk.chunkX, 0);
  assert.equal(chunk.chunkZ, 0);
  assert.equal(chunk.chunkKey, 2147516416);
  assert.equal(chunk.cellStart.length, 4097);
  assert.equal(chunk.cellBoundaryStart.length, 4097);
  assert.deepEqual([...chunk.triangleSourceIds], [202], "ignore geometry is absent from collision output");
  assert.deepEqual([...chunk.triangleSurfaceKeys], [7001]);
  assert.deepEqual([...chunk.triangleSpeedCaps], [12]);
  assert.equal(chunk.trianglePlanes[1], 1, "surface plane normal is oriented upward");
  assert.ok(chunk.cellTriangleRefs.length > 0);
  assert.deepEqual([...chunk.boundaryGroupKeys], [91]);
  assert.deepEqual([...chunk.boundarySurfaceKeyPairs], [7001, 7002]);
  assert.ok(chunk.cellBoundaryRefs.length > 0);
  assert.notEqual(chunk.boundaryXZ.buffer, source.explicitBoundaries.boundaryXZ.buffer);
  const roundTripChunk = deserializeCompiledCollision(serializeCompiledCollision(compiled)).surfaceChunk;
  assert.ok(roundTripChunk);
  assert.deepEqual([...roundTripChunk.triangleSpeedCaps], [12]);
  assert.deepEqual([...roundTripChunk.boundaryGroupKeys], [91]);
});

test("serialized fallback round-trips all versions and the mandatory indirectBuffer", async () => {
  const compiled = await compileCollisionSource(mixedSolidSource());
  const payload = serializeCompiledCollision(compiled);
  assert.equal(payload.header.wireVersion, COLLISION_WIRE_VERSION);
  assert.equal(payload.header.compilerVersion, COLLISION_COMPILER_VERSION);
  assert.equal(payload.header.meshBvhWireVersion, THREE_MESH_BVH_WIRE_VERSION);
  assert.equal(payload.header.meshBvhPackageVersion, THREE_MESH_BVH_PACKAGE_VERSION);
  assert.ok(payload.manifest.fallback?.bvh.indirectBuffer);
  assert.ok(payload.manifest.fallback.bvh.rootBufferIndices.length > 0);

  const roundTrip = deserializeCompiledCollision(payload);
  assert.ok(roundTrip.fallback);
  assert.equal(roundTrip.fallback.bvh.indirect, true);
  assert.ok(roundTrip.fallback.geometry.boundingBox, "round-trip fallback must retain spatial bounds");
  assert.deepEqual(
    roundTrip.fallback.geometry.boundingBox.min.toArray(),
    compiled.fallback.geometry.boundingBox.min.toArray(),
  );
  assert.deepEqual(
    roundTrip.fallback.geometry.boundingBox.max.toArray(),
    compiled.fallback.geometry.boundingBox.max.toArray(),
  );
  const ids = [0, 1].map((index) => resolveFallbackSourceTriangleId(roundTrip.fallback, index)).sort();
  assert.deepEqual(ids, [101, 102]);
  assert.equal(roundTrip.sourceHash, compiled.sourceHash);
  assert.equal(roundTrip.cacheKey, compiled.cacheKey);
});

test("deserialization rejects malformed typed-view and CSR manifests before publication", async () => {
  const payload = serializeCompiledCollision(await compileCollisionSource(roadSurfaceSource()));
  const malformed = {
    ...payload,
    manifest: {
      ...payload.manifest,
      surfaceChunk: {
        ...payload.manifest.surfaceChunk,
        cellStart: { ...payload.manifest.surfaceChunk.cellStart, length: 3 },
      },
    },
  };
  assert.throws(() => deserializeCompiledCollision(malformed), /CSR header is invalid/);
});

test("source hashes and cache identities are stable for copies and sensitive to physics data", async () => {
  const source = roadSurfaceSource();
  const identical = cloneSource(source);
  assert.equal(await hashCollisionCompileSource(source), await hashCollisionCompileSource(identical));
  const compiled = await compileCollisionSource(source);
  const identicalCompiled = await compileCollisionSource(identical);
  assert.equal(compiled.cacheKey, identicalCompiled.cacheKey);
  assert.equal(await hashCollisionCompileSource(source),
    await hashCollisionCompileSource(cloneSource(source, { generation: source.generation + 1 })),
    "generation is an envelope stale guard, not compiled-content cache identity");

  const changedProfile = cloneSource(source, {
    surfaceProfiles: [{ ...sidewalkProfile, speedCap: 9 }],
  });
  const changedGeometry = cloneSource(source);
  changedGeometry.triangles.positions[0] += 0.125;
  assert.notEqual(await hashCollisionCompileSource(source), await hashCollisionCompileSource(changedProfile));
  assert.notEqual(await hashCollisionCompileSource(source), await hashCollisionCompileSource(changedGeometry));
});

test("serialized transfer buffers are independent of source buffers", async () => {
  const source = roadSurfaceSource();
  const sourceBuffers = new Set(collisionSourceTransferList(source));
  const payload = serializeCompiledCollision(await compileCollisionSource(source));
  const transfer = collisionPayloadTransferList(payload);
  assert.equal(transfer.length, payload.buffers.length);
  transfer.forEach((buffer) => assert.equal(sourceBuffers.has(buffer), false));
  const sourceByteLength = source.triangles.positions.byteLength;
  const clone = structuredClone(payload, { transfer });
  assert.ok(payload.buffers.every((buffer) => buffer.byteLength === 0));
  assert.equal(clone.buffers.length, transfer.length);
  assert.ok(clone.buffers.some((buffer) => buffer.byteLength > 0));
  assert.equal(source.triangles.positions.byteLength, sourceByteLength,
    "transferring compiled output never detaches the registered source input");
});

test("worker protocol rejects stale generations and releases exact registrations", async () => {
  const protocol = new CityCollisionCompilerProtocol();
  const sourceV1 = thinWallSource({ generation: 1 });
  const registeredV1 = await protocol.handle({
    type: "register",
    requestId: 1,
    sourceId: sourceV1.sourceId,
    generation: 1,
    source: sourceV1,
  });
  assert.equal(registeredV1.type, "registered");
  const compiledV1 = await protocol.handle({
    type: "compile",
    requestId: 2,
    sourceId: sourceV1.sourceId,
    generation: 1,
    registrationToken: registeredV1.registrationToken,
  });
  assert.equal(compiledV1.type, "compiled");

  const sourceV2 = cloneSource(sourceV1, { generation: 2 });
  const registeredV2 = await protocol.handle({
    type: "register",
    requestId: 3,
    sourceId: sourceV2.sourceId,
    generation: 2,
    source: sourceV2,
  });
  assert.equal(registeredV2.type, "registered");
  const stale = await protocol.handle({
    type: "compile",
    requestId: 4,
    sourceId: sourceV1.sourceId,
    generation: 1,
    registrationToken: registeredV1.registrationToken,
  });
  assert.deepEqual(stale, {
    type: "stale",
    requestId: 4,
    sourceId: sourceV1.sourceId,
    requestedGeneration: 1,
    currentGeneration: 2,
  });
  const released = await protocol.handle({
    type: "release",
    requestId: 5,
    sourceId: sourceV2.sourceId,
    generation: 2,
    registrationToken: registeredV2.registrationToken,
  });
  assert.equal(released.type, "released");
});

test("a later async register invalidates an earlier in-flight generation", async () => {
  const protocol = new CityCollisionCompilerProtocol();
  const sourceV1 = thinWallSource({ generation: 10 });
  const sourceV2 = cloneSource(sourceV1, { generation: 11 });
  const [first, second] = await Promise.all([
    protocol.handle({
      type: "register",
      requestId: 10,
      sourceId: sourceV1.sourceId,
      generation: sourceV1.generation,
      source: sourceV1,
    }),
    protocol.handle({
      type: "register",
      requestId: 11,
      sourceId: sourceV2.sourceId,
      generation: sourceV2.generation,
      source: sourceV2,
    }),
  ]);
  assert.equal(first.type, "stale");
  assert.equal(first.currentGeneration, 11);
  assert.equal(second.type, "registered");
});

test("worker client envelope drives register, compile, and release without eager Worker construction", async () => {
  const protocol = new CityCollisionCompilerProtocol();
  const listeners = { message: new Set(), error: new Set() };
  const fakeWorker = {
    addEventListener(type, listener) { listeners[type].add(listener); },
    removeEventListener(type, listener) { listeners[type].delete(listener); },
    postMessage(command) {
      void protocol.handle(command).then((data) => {
        listeners.message.forEach((listener) => listener({ data }));
      });
    },
    terminate() {},
  };
  const client = new CityCollisionWorkerClient(fakeWorker);
  const source = thinWallSource({ generation: 21 });
  const registered = await client.register(source);
  const compiled = await client.compile(source.sourceId, source.generation, registered.registrationToken);
  assert.equal(compiled.type, "compiled");
  const released = await client.release(source.sourceId, source.generation, registered.registrationToken);
  assert.equal(released.type, "released");
  client.terminate();
  await assert.rejects(
    client.compile(source.sourceId, source.generation, registered.registrationToken),
    /worker is terminated/,
  );
});

test("the browser-only cache fails explicitly in Node; real IndexedDB remains browser integration QA", async () => {
  assert.equal(typeof indexedDB, "undefined");
  const store = new CityCollisionPayloadStore("city-collision-node-fixture");
  await assert.rejects(store.get("missing"), /IndexedDB is unavailable/);
  store.close();
  assert.equal(typeof CityCollisionWorkerClient, "function",
    "importing the lazy client does not construct a Worker in Node");
});
