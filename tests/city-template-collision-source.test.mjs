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
import { packTemplateCollisionSource } from "../app/lib/map/cityTemplateCollisionSource.ts";

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

  const horizontalRoof = runtime.querySweep({
    startX: 1,
    startZ: -4,
    deltaX: 8,
    deltaZ: 0,
    minY: 5.7,
    maxY: 5.9,
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

test("disposing a pipeline during template packing cannot revive a Worker", async () => {
  let resolvePacked;
  let cacheCallCount = 0;
  const cache = {
    createCollisionCompileSource() {
      cacheCallCount += 1;
      return new Promise((resolve) => { resolvePacked = resolve; });
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
  assert.equal(cacheCallCount, 1);
  pipeline.dispose();
  resolvePacked({});
  await assert.rejects(build, /pipeline is disposed/);
});
