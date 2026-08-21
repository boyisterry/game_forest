import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import { CityDocumentCollisionPipeline } from "../app/lib/map/cityDocumentCollisionPipeline.ts";
import {
  PackedCollisionRoleCode,
} from "../app/lib/map/cityCollisionTypes.ts";
import {
  getCatalogEntry,
  toTemplateBuildDescriptor,
} from "../app/lib/map/cityCatalog.ts";
import {
  cloneCityDocument,
  deepFreeze,
  emptyCityDocument,
} from "../app/lib/map/cityDocument.ts";
import {
  isCollisionSourceEligible,
  packTemplateCollisionSource,
  packTemplateSurfaceCollisionSources,
} from "../app/lib/map/cityTemplateCollisionSource.ts";

test("collision source eligibility restores hidden batch sources but rejects proxies and hidden LOD ancestors", () => {
  const root = new THREE.Group();
  const source = new THREE.Group();
  source.visible = false;
  source.userData.renderProxySource = "fixture-batch";
  const exterior = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  source.add(exterior);
  root.add(source);

  const hiddenLayers = new Set(["interior", "micro-detail"]);
  assert.equal(isCollisionSourceEligible(exterior, root, hiddenLayers), true);

  const interior = new THREE.Group();
  interior.userData.mapLayer = "interior";
  const interiorMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  interiorMesh.userData.mapLayer = "exterior";
  interior.add(interiorMesh);
  source.add(interior);
  assert.equal(isCollisionSourceEligible(interiorMesh, root, hiddenLayers), false);

  const proxy = new THREE.Group();
  proxy.userData.renderProxy = true;
  const proxyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  proxy.add(proxyMesh);
  root.add(proxy);
  assert.equal(isCollisionSourceEligible(proxyMesh, root, hiddenLayers), false);

  const detached = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  detached.userData.renderProxySource = "detached-batch";
  assert.equal(isCollisionSourceEligible(detached, root, hiddenLayers), false);
});

test("both template packers use hidden source authority exactly once", async (t) => {
  const entry = getCatalogEntry("phone-booth");
  assert.ok(entry);
  const root = new THREE.Group();
  const source = new THREE.Group();
  source.visible = false;
  source.userData.renderProxySource = "fixture-batch";

  const solidGeometry = new THREE.BoxGeometry(2, 2, 2);
  const solidMaterial = new THREE.MeshBasicMaterial();
  const solid = new THREE.Mesh(solidGeometry, solidMaterial);
  solid.visible = false;
  solid.position.set(10, 1, 10);
  solid.userData.mapCollisionRole = "solid";
  source.add(solid);

  const surfaceGeometry = new THREE.PlaneGeometry(2, 2);
  surfaceGeometry.rotateX(-Math.PI / 2);
  const surfaceMaterial = new THREE.MeshBasicMaterial();
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.visible = false;
  surface.position.set(14, 0, 14);
  surface.userData.mapCollisionRole = "rideable-surface";
  source.add(surface);
  root.add(source);

  const proxy = new THREE.Group();
  proxy.userData.renderProxy = true;
  proxy.userData.mapCollisionRole = "ignore";
  const duplicate = new THREE.Mesh(solidGeometry, solidMaterial);
  duplicate.position.copy(solid.position);
  duplicate.userData.mapCollisionRole = "solid";
  proxy.add(duplicate);
  root.add(proxy);

  t.after(() => {
    solidGeometry.dispose();
    surfaceGeometry.dispose();
    solidMaterial.dispose();
    surfaceMaterial.dispose();
  });
  const descriptor = toTemplateBuildDescriptor(entry);
  const packedSolid = await packTemplateCollisionSource(root, descriptor, {
    sourceId: "hidden-source-authority-fixture",
    generation: 1,
    resolvedHeightScale: 1,
  });
  const packedSurfaces = await packTemplateSurfaceCollisionSources(root, descriptor, {
    sourceId: "hidden-source-authority-fixture",
    generation: 1,
    resolvedHeightScale: 1,
  });

  assert.equal(packedSolid.triangles.triangleRoles.length, 12);
  assert.equal(
    packedSurfaces.reduce((sum, packed) => sum + packed.triangles.triangleRoles.length, 0),
    2,
  );
});

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} ± ${epsilon}`);
}

function catalogCollisionFixture() {
  const entry = getCatalogEntry("phone-booth");
  assert.ok(entry);
  const descriptor = toTemplateBuildDescriptor(entry);
  const root = new THREE.Group();
  root.name = "catalog-collision-fixture";
  // CityTemplateCache applies catalog mapScale to the canonical source before
  // packing. Reproduce that production boundary in this focused packer test.
  root.scale.setScalar(descriptor.mapScale);

  const shellGeometry = new THREE.BoxGeometry(2, 3, 2);
  const shell = new THREE.Mesh(shellGeometry, new THREE.MeshBasicMaterial());
  shell.name = "fixture-shell";
  shell.position.y = 1.5;
  shell.userData.mapCollisionRole = "solid";

  const rideableGeometry = new THREE.PlaneGeometry(10, 10);
  rideableGeometry.rotateX(-Math.PI / 2);
  const rideable = new THREE.Mesh(rideableGeometry, new THREE.MeshBasicMaterial());
  rideable.name = "fixture-sidewalk";
  rideable.userData.mapCollisionRole = "rideable-surface";

  const roofGeometry = new THREE.PlaneGeometry(2, 2);
  roofGeometry.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofGeometry, new THREE.MeshBasicMaterial());
  roof.name = "fixture-horizontal-solid-roof";
  roof.position.y = 4;
  roof.userData.mapCollisionRole = "solid";

  root.add(shell, rideable, roof);
  return { root, descriptor, geometries: [shellGeometry, rideableGeometry, roofGeometry] };
}

test("catalog Three template packs to compiled collision and blocks a moving circle without floor/roof ghost walls", async (t) => {
  const fixture = catalogCollisionFixture();
  const packed = await packTemplateCollisionSource(fixture.root, fixture.descriptor, {
    sourceId: "catalog-phone-booth-fixture",
    generation: 7,
    resolvedHeightScale: 1.25,
    yieldEveryMeshes: 1,
  });

  // Box (12 triangles) + explicit solid roof (2). The rideable sidewalk is
  // deliberately owned by the surface path and therefore absent here.
  assert.equal(packed.triangles.sourceTriangleIds.length, 14);
  assert.ok([...packed.triangles.triangleRoles]
    .every((role) => role === PackedCollisionRoleCode.Solid));

  const compiled = await compileCollisionSource(packed);
  assert.ok(compiled.fallback, "a closed box stays a complete fallback component");
  const runtime = new CompiledCityCollisionRuntime([{
    ownerId: "placed-phone-booth",
    ownerGeneration: 3,
    source: compiled,
    transform: { x: 5, y: 0, z: -4, yawRadians: 0, uniformScale: 2 },
  }]);
  t.after(() => {
    runtime.dispose();
    compiled.fallback?.geometry.dispose();
    fixture.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    for (const geometry of fixture.geometries) geometry.dispose();
  });

  const shellHit = runtime.querySweep({
    startX: 1,
    startZ: -4,
    deltaX: 8,
    deltaZ: 0,
    minY: 0,
    maxY: 2.4,
    radius: 0.25,
  });
  assert.ok(shellHit.hit);
  assert.equal(shellHit.hit.ownerId, "placed-phone-booth");
  close(shellHit.hit.toi, (5 - fixture.descriptor.mapScale * 2 - 0.25 - 1) / 8);

  const rideableOnly = runtime.querySweep({
    startX: 1,
    startZ: 0,
    deltaX: 8,
    deltaZ: 0,
    minY: 0,
    maxY: 2.4,
    radius: 0.25,
  });
  assert.equal(rideableOnly.hit, null, "rideable plane must not become a horizontal solid");

  const roofWorldY = 4 * fixture.descriptor.mapScale * 1.25 * 2;
  const horizontalRoof = runtime.querySweep({
    startX: 1,
    startZ: -4,
    deltaX: 8,
    deltaZ: 0,
    minY: roofWorldY - 0.1,
    maxY: roofWorldY + 0.1,
    radius: 0.25,
  });
  assert.equal(horizontalRoof.hit, null, "horizontal containment faces must not block XZ motion");
});

test("pre-aborted template packing never publishes typed arrays", async () => {
  const fixture = catalogCollisionFixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => packTemplateCollisionSource(fixture.root, fixture.descriptor, {
    sourceId: "aborted-template",
    generation: 1,
    resolvedHeightScale: 1,
    signal: controller.signal,
  }), { name: "AbortError" });
});

test("template packing drops zero-area source faces before the strict Worker ABI", async (t) => {
  const entry = getCatalogEntry("phone-booth");
  assert.ok(entry);
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    2, 0, 0, 2, 0, 0, 2, 0, 0,
  ], 3));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "fixture-shell";
  mesh.userData.mapCollisionRole = "solid";
  root.add(mesh);
  t.after(() => {
    geometry.dispose();
    material.dispose();
  });

  const packed = await packTemplateCollisionSource(root, toTemplateBuildDescriptor(entry), {
    sourceId: "degenerate-filter-fixture",
    generation: 1,
    resolvedHeightScale: 1,
  });
  assert.equal(packed.triangles.triangleRoles.length, 1);
  assert.deepEqual([...packed.triangles.indices], [0, 1, 2]);
  await compileCollisionSource(packed);
});

test("template rideable surfaces compile into local 64 m chunks with a stable placement handle", async (t) => {
  const entry = getCatalogEntry("phone-booth");
  assert.ok(entry);
  const root = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(140, 20);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial();
  const surface = new THREE.Mesh(geometry, material);
  surface.name = "fixture-campus-surface";
  surface.userData.mapCollisionRole = "rideable-surface";
  root.add(surface);
  const packed = await packTemplateSurfaceCollisionSources(root, toTemplateBuildDescriptor(entry), {
    sourceId: "template-surface-chunk-fixture",
    generation: 5,
    resolvedHeightScale: 1,
  });
  assert.ok(packed.length >= 3);
  assert.ok(packed.every((source) => source.surfaceChunk === undefined));
  const compiled = await Promise.all(packed.map(compileCollisionSource));
  const runtime = new CompiledCityCollisionRuntime(compiled.map((source) => ({
    ownerId: `surface-child-${source.surfaceChunk.chunkX}-${source.surfaceChunk.chunkZ}`,
    ownerGeneration: 8,
    source,
    surfaceHandleOwner: { ownerId: "campus-placement", ownerGeneration: 8 },
  })), { worldId: 77, documentGeneration: 8 });
  t.after(() => {
    runtime.dispose();
    geometry.dispose();
    material.dispose();
  });

  const left = {
    handle: { kind: "implicit-ground", worldId: 77, documentGeneration: 8 },
    profileId: "implicit-ground",
    height: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    gx: 0,
    gz: 0,
    speedCap: Infinity,
  };
  runtime.sampleCitySurface(63.9, 0, {
    currentY: 0,
    previousHandle: null,
    maxStepUpMeters: 0.01,
  }, left);
  assert.equal(left.profileId, "site-surface");
  assert.equal(left.handle.kind, "owner-local");
  assert.equal(left.handle.ownerId, "campus-placement");

  const right = structuredClone(left);
  runtime.sampleCitySurface(64.1, 0, {
    currentY: left.height,
    previousHandle: left.handle,
    maxStepUpMeters: 0.01,
  }, right);
  assert.deepEqual(right.handle, left.handle);
});

test("disposing a pipeline during template packing cannot revive a Worker", async () => {
  let resolvePacked;
  let resolveSurfaceChunks;
  let cacheCallCount = 0;
  const cache = {
    createCollisionCompileSource() {
      cacheCallCount += 1;
      return new Promise((resolve) => { resolvePacked = resolve; });
    },
    createSurfaceCollisionCompileSources() {
      cacheCallCount += 1;
      return new Promise((resolve) => { resolveSurfaceChunks = resolve; });
    },
  };
  const document = cloneCityDocument(emptyCityDocument());
  document.placements.push({
    id: "deferred-phone-booth",
    catalogId: "phone-booth",
    poseKind: "grid",
    i: 0,
    j: 0,
    yaw: 0,
  });
  const pipeline = new CityDocumentCollisionPipeline(cache, "pipeline-dispose-test");
  const build = pipeline.build(deepFreeze(document), 1);
  assert.equal(cacheCallCount, 2);
  pipeline.dispose();
  resolvePacked({});
  resolveSurfaceChunks([]);
  await assert.rejects(build, /pipeline is disposed/);
});
