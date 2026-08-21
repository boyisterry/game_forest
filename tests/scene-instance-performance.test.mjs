import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import {
  applySceneShadowPolicy,
  createInstancedPrototypeBatch,
  createMergedStaticBatch,
  createOptimizedStaticSceneBatch,
  createScenePointLightPool,
} from "../app/lib/map/sceneInstanceBatch.ts";

function mesh(name, material) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

test("static scene optimizer merges equivalent materials but excludes dynamic roots", () => {
  const root = new THREE.Group();
  const left = mesh("static-wall", new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 }));
  const right = mesh("static-wall", new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 }));
  right.position.x = 3;
  const dynamic = new THREE.Group();
  dynamic.name = "moving-ride";
  const movingPart = mesh("moving-seat", new THREE.MeshStandardMaterial({ color: 0xaa5533 }));
  dynamic.add(movingPart);
  root.add(left, right, dynamic);

  const batch = createOptimizedStaticSceneBatch({
    name: "test-static-batch",
    parent: root,
    excludedRoots: [dynamic],
  });

  assert.equal(batch.userData.batchCount, 1);
  assert.equal(batch.userData.mergedSourceMeshCount, 2);
  assert.equal(left.visible, false);
  assert.equal(right.visible, false);
  assert.equal(left.userData.renderProxySource, "test-static-batch");
  assert.equal(right.userData.renderProxySource, "test-static-batch");
  assert.equal(movingPart.visible, true);
  assert.equal(batch.children.length, 1);
});

test("static batching keeps source material identity while only proxies use value canonicalization", () => {
  const root = new THREE.Group();
  const staticLeftMaterial = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 });
  const staticRightMaterial = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 });
  const markedMutableMaterial = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 });
  markedMutableMaterial.userData.cityMutableMaterial = true;
  const listedMutableMaterial = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.8 });
  const staticLeft = mesh("static-left", staticLeftMaterial);
  const staticRight = mesh("static-right", staticRightMaterial);
  const markedMutable = mesh("marked-mutable", markedMutableMaterial);
  const listedMutable = mesh("listed-mutable", listedMutableMaterial);
  staticRight.position.x = 2;
  markedMutable.position.x = 4;
  listedMutable.position.x = 6;
  root.add(staticLeft, staticRight, markedMutable, listedMutable);

  const batch = createOptimizedStaticSceneBatch({
    name: "material-ownership-batch",
    parent: root,
    mutableMaterials: [listedMutableMaterial],
  });

  assert.equal(batch.userData.batchCount, 1, "equal static materials still form one proxy batch");
  assert.equal(batch.userData.mergedSourceMeshCount, 2);
  assert.equal(staticLeft.material, staticLeftMaterial);
  assert.equal(staticRight.material, staticRightMaterial);
  assert.notEqual(staticLeft.material, staticRight.material, "source objects must not be value-aliased");
  assert.equal(markedMutable.material, markedMutableMaterial);
  assert.equal(listedMutable.material, listedMutableMaterial);
  assert.equal(listedMutableMaterial.userData.cityMutableMaterial, true);
  assert.equal(markedMutable.visible, true);
  assert.equal(listedMutable.visible, true);
  assert.equal(batch.children[0].material, staticLeftMaterial, "only the proxy uses the canonical value representative");

  markedMutableMaterial.emissiveIntensity = 4;
  assert.notEqual(staticLeftMaterial.emissiveIntensity, markedMutableMaterial.emissiveIntensity);
  listedMutableMaterial.opacity = 0.25;
  assert.notEqual(staticRightMaterial.opacity, listedMutableMaterial.opacity);
});

test("prototype and merged batches mark every hidden source root as collision authority", () => {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const prototype = new THREE.Group();
  prototype.add(mesh("prototype-part", material));
  const placements = [new THREE.Group(), new THREE.Group()];
  placements.forEach((placement, index) => {
    placement.name = `placement-${index}`;
    placement.add(mesh(`placement-part-${index}`, material));
    parent.add(placement);
  });

  const instances = createInstancedPrototypeBatch({
    name: "test-prototype-batch",
    parent,
    prototype,
    placements,
  });
  assert.equal(instances.userData.renderProxy, true);
  for (const placement of placements) {
    assert.equal(placement.visible, false);
    assert.equal(placement.userData.renderProxySource, "test-prototype-batch");
  }

  const mergedSources = [new THREE.Group(), new THREE.Group()];
  mergedSources.forEach((source, index) => {
    source.name = `merged-source-${index}`;
    source.add(mesh(`merged-part-${index}`, material));
    parent.add(source);
  });
  const merged = createMergedStaticBatch({
    name: "test-merged-batch",
    parent,
    sources: mergedSources,
  });
  assert.equal(merged.userData.renderProxy, true);
  for (const source of mergedSources) {
    assert.equal(source.visible, false);
    assert.equal(source.userData.renderProxySource, "test-merged-batch");
  }
});

test("shadow policy keeps structural silhouettes while trimming static and dynamic micro detail", () => {
  const root = new THREE.Group();
  const shell = mesh("venue-building-shell", new THREE.MeshStandardMaterial());
  const rail = mesh("venue-seat-railing", new THREE.MeshStandardMaterial());
  const dynamic = new THREE.Group();
  const movingRail = mesh("ride-seat-railing", new THREE.MeshStandardMaterial());
  dynamic.add(movingRail);
  root.add(shell, rail, dynamic);

  const result = applySceneShadowPolicy(root, { dynamicRoots: [dynamic] });

  assert.equal(shell.castShadow, true);
  assert.equal(rail.castShadow, false);
  assert.equal(movingRail.castShadow, false);
  assert.equal(result.shadowCastersRemoved, 2);
});

test("point light pool bounds fixture lights and fully hides sources while off", () => {
  const root = new THREE.Group();
  for (let index = 0; index < 8; index += 1) {
    const light = new THREE.PointLight(0xffcc88, 3, 12, 2);
    light.position.set(index * 4, 5, 0);
    root.add(light);
  }
  const pool = createScenePointLightPool({ name: "test-light-pool", root, cellSizeMeters: 20 });

  assert.equal(pool.sourceLightCount, 8);
  assert.ok(pool.pooledLightCount < pool.sourceLightCount);
  root.traverse((object) => {
    if (object instanceof THREE.PointLight && object.userData.performancePooled) {
      assert.equal(object.visible, false);
      assert.equal(object.intensity, 0);
    }
  });
  pool.setPowered(true);
  assert.ok(pool.group.children.every((object) => object.visible && object.intensity > 0));
  pool.setPowered(false);
  assert.ok(pool.group.children.every((object) => !object.visible && object.intensity === 0));
});
