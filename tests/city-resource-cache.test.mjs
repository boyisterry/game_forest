import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  acquireResourceCacheLease,
  assertResourceCacheIntegrity,
  disposeSceneResources,
  internScenePrimitiveGeometries,
  isCacheOwned,
  primitiveGeometryCacheKey,
  resetResourceCacheForTests,
  resourceCacheStats,
  retireResourceCacheGeneration,
} from "../app/lib/map/cityResourceCache.ts";

function rootWith(geometry) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  return root;
}

test("primitive cache shares final geometry content and retires only after every scene releases", async () => {
  resetResourceCacheForTests();
  const firstLease = acquireResourceCacheLease();
  const secondLease = acquireResourceCacheLease();
  const firstRoot = rootWith(new THREE.BoxGeometry(2, 3, 4));
  const secondRoot = rootWith(new THREE.BoxGeometry(2, 3, 4));
  const firstReport = internScenePrimitiveGeometries(firstRoot, firstLease);
  const secondReport = internScenePrimitiveGeometries(secondRoot, secondLease);
  const shared = firstRoot.children[0].geometry;
  assert.equal(secondRoot.children[0].geometry, shared);
  assert.equal(firstReport.cacheMisses, 1);
  assert.equal(secondReport.cacheHits, 1);
  assert.equal(isCacheOwned(shared), true);

  let oldDisposals = 0;
  shared.addEventListener("dispose", () => { oldDisposals += 1; });
  disposeSceneResources(firstRoot);
  firstLease.release();
  assert.equal(oldDisposals, 0, "unloading one scene cannot dispose a shared primitive");

  const retirement = retireResourceCacheGeneration();
  assert.equal(oldDisposals, 0, "a live old-generation scene keeps its GPU geometry valid");
  const nextLease = acquireResourceCacheLease();
  const nextRoot = rootWith(new THREE.BoxGeometry(2, 3, 4));
  internScenePrimitiveGeometries(nextRoot, nextLease);
  const nextGeometry = nextRoot.children[0].geometry;
  assert.notEqual(nextGeometry, shared);
  let nextDisposals = 0;
  nextGeometry.addEventListener("dispose", () => { nextDisposals += 1; });

  disposeSceneResources(secondRoot);
  secondLease.release();
  await retirement;
  assert.equal(oldDisposals, 1);
  assert.equal(nextDisposals, 0);
  assertResourceCacheIntegrity(nextLease);

  disposeSceneResources(nextRoot);
  nextLease.release();
  resetResourceCacheForTests();
  assert.equal(nextDisposals, 1);
  assert.equal(resourceCacheStats().borrowers, 0);
});

test("cache key distinguishes pre-intern transforms and development guards catch later mutation", () => {
  resetResourceCacheForTests();
  const lease = acquireResourceCacheLease();
  const plain = new THREE.PlaneGeometry(2, 2);
  const rotated = new THREE.PlaneGeometry(2, 2);
  rotated.rotateX(-Math.PI / 2);
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(plain, new THREE.MeshBasicMaterial()),
    new THREE.Mesh(rotated, new THREE.MeshBasicMaterial()),
  );
  const report = internScenePrimitiveGeometries(root, lease);
  assert.equal(report.cacheMisses, 2);
  assert.notEqual(root.children[0].geometry, root.children[1].geometry);
  assert.throws(() => root.children[0].geometry.translate(1, 0, 0), /cache-owned/);
  const clone = root.children[0].geometry.clone();
  assert.doesNotThrow(() => clone.translate(1, 0, 0));
  clone.dispose();

  const positions = root.children[0].geometry.getAttribute("position");
  positions.array[0] += 0.25;
  assert.throws(() => assertResourceCacheIntegrity(lease), /mutated/);

  disposeSceneResources(root);
  lease.release();
  resetResourceCacheForTests();
});

test("cache key preserves attribute GPU interpretation and collision-relevant geometry names", () => {
  const floatGeometry = new THREE.BufferGeometry();
  floatGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  floatGeometry.type = "BoxGeometry";
  floatGeometry.parameters = { width: 1, height: 1, depth: 1 };
  floatGeometry.name = "road-surface";
  const integerGeometry = new THREE.BufferGeometry();
  integerGeometry.setAttribute("position", new THREE.BufferAttribute(new Uint32Array([0, 0, 0]), 3));
  integerGeometry.type = "BoxGeometry";
  integerGeometry.parameters = { width: 1, height: 1, depth: 1 };
  integerGeometry.name = "road-surface";
  const renamedGeometry = floatGeometry.clone();
  renamedGeometry.type = floatGeometry.type;
  renamedGeometry.parameters = { ...floatGeometry.parameters };
  renamedGeometry.name = "wall-shell";

  assert.notEqual(primitiveGeometryCacheKey(floatGeometry), primitiveGeometryCacheKey(integerGeometry));
  assert.notEqual(primitiveGeometryCacheKey(floatGeometry), primitiveGeometryCacheKey(renamedGeometry));
  floatGeometry.dispose();
  integerGeometry.dispose();
  renamedGeometry.dispose();
});
