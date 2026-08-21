import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCityBatchedMeshWorld } from "../app/lib/map/cityBatchWorld.ts";

function boxFrustum(minX, maxX, minY, maxY, minZ, maxZ) {
  return new THREE.Frustum(
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -minX),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxX),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -minZ),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), maxZ),
  );
}

test("CityBatchWorld batches placement slots and supports incremental editor operations", () => {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(0.6, 8, 6);
  const world = createCityBatchedMeshWorld();
  let materialDisposals = 0;
  material.addEventListener("dispose", () => { materialDisposals += 1; });
  try {
    world.registerTemplate({
      templateId: "test-building",
      slots: [{
        slotId: "shell",
        poolKey: "opaque-standard-layout",
        material,
        nearGeometry: sphere,
        farGeometry: box,
        baseTint: new THREE.Color(0x336699),
        castShadow: true,
        receiveShadow: true,
      }],
    });
    const firstMatrix = new THREE.Matrix4().makeTranslation(2, 0, 3);
    world.addPlacement("building-a", "test-building", firstMatrix);
    world.addPlacement("building-b", "test-building", new THREE.Matrix4().makeTranslation(5, 0, 3));
    assert.deepEqual(world.stats(), {
      backend: "batched-mesh",
      pools: 1,
      templates: 1,
      placements: 2,
      instances: 2,
      visiblePlacements: 2,
      visibleInstances: 2,
      farPlacements: 0,
      instanceCapacity: 16,
      geometries: 2,
      vertexCapacity: 128,
      indexCapacity: 512,
      estimatedBufferBytes: 7424,
    });
    const mesh = world.root.children[0];
    assert.ok(mesh instanceof THREE.BatchedMesh);
    assert.equal(mesh.frustumCulled, false);
    assert.equal(mesh.perObjectFrustumCulled, false);
    assert.equal(mesh.sortObjects, false);
    assert.equal(world.resolvePick(mesh, 0), "building-a");
    assert.deepEqual(world.updateVisibility(new THREE.Frustum(
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 20),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), -20),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 20),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 20),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 20),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 20),
    )), { placements: 0, instances: 0 });
    assert.equal(mesh.getVisibleAt(0), false);
    assert.equal(mesh.getVisibleAt(1), false);
    world.setPlacementVisible("building-a", true);
    world.movePlacement("building-a", new THREE.Matrix4().makeTranslation(8, 0, 9));
    assert.equal(mesh.getMatrixAt(0, new THREE.Matrix4()).elements[12], 8);
    world.setPlacementLod("building-a", "far");
    assert.notEqual(mesh.getGeometryIdAt(0), mesh.getGeometryIdAt(1));
    world.setPlacementTint("building-a", new THREE.Color(0xff0000));
    assert.equal(mesh.getColorAt(0, new THREE.Color()).getHex(), 0xff0000);
    world.setPlacementTint("building-a", null);
    assert.equal(mesh.getColorAt(0, new THREE.Color()).getHex(), 0x336699);
    world.setPlacementVisible("building-a", false);
    assert.equal(mesh.getVisibleAt(0), false);
    world.removePlacement("building-a");
    world.addPlacement("building-c", "test-building", new THREE.Matrix4());
    assert.equal(world.resolvePick(mesh, 0), "building-c", "deleted ids must be safely rebound on reuse");
    for (let index = 0; index < 24; index += 1) {
      world.addPlacement(`extra-${index}`, "test-building", new THREE.Matrix4());
    }
    assert.equal(mesh.maxInstanceCount, 32);
    assert.equal(world.stats().placements, 26);
  } finally {
    world.dispose();
    assert.equal(materialDisposals, 0, "the world borrows source materials");
    box.dispose();
    sphere.dispose();
    material.dispose();
  }
  assert.equal(materialDisposals, 1);
});

test("CityBatchWorld raycast uses placement AABBs and canonical near geometry without visibility mutation", () => {
  const material = new THREE.MeshBasicMaterial();
  const near = new THREE.BoxGeometry(1, 1, 1);
  const far = new THREE.BoxGeometry(1, 1, 1).translate(0, 20, 0);
  const world = createCityBatchedMeshWorld();
  try {
    world.registerTemplate({
      templateId: "pick-box",
      slots: [{
        slotId: "shell",
        poolKey: "pick-box-pool",
        material,
        nearGeometry: near,
        farGeometry: far,
        castShadow: false,
        receiveShadow: false,
      }],
    });
    for (let index = 0; index < 2_500; index += 1) {
      world.addPlacement(`box-${index}`, "pick-box", new THREE.Matrix4().makeTranslation(index * 4, 0, 0));
    }
    world.setPlacementLod("box-1000", "far");
    const pool = world.root.children[0];
    const visibleBefore = pool.getVisibleAt(1000);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(4_000, 0, 5),
      new THREE.Vector3(0, 0, -1),
    );
    assert.deepEqual(world.raycast(raycaster), [{ placementId: "box-1000", distance: 4.5 }]);
    assert.deepEqual(world.getRaycastStats(), {
      testedPlacements: 2_500,
      candidatePlacements: 1,
      testedSlots: 1,
    });
    assert.equal(pool.getVisibleAt(1000), visibleBefore, "picking must not dirty batch visibility");
    world.setPlacementVisible("box-1000", false);
    assert.deepEqual(world.raycast(raycaster), []);
  } finally {
    world.dispose();
    near.dispose();
    far.dispose();
    material.dispose();
  }
});

test("CityBatchWorld composes near/far, authored visibility, and render-set visibility", () => {
  const material = new THREE.MeshBasicMaterial();
  const near = new THREE.BoxGeometry(4, 4, 4);
  const proxy = new THREE.BoxGeometry(3, 3, 3);
  const detail = new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 3, 0);
  const world = createCityBatchedMeshWorld();
  try {
    world.registerTemplate({
      templateId: "lod-building",
      slots: [
        {
          slotId: "massing",
          poolKey: "lod-massing",
          material,
          nearGeometry: near,
          farGeometry: proxy,
          farStrategy: "proxy",
          castShadow: true,
          receiveShadow: true,
        },
        {
          slotId: "detail",
          poolKey: "lod-detail",
          material,
          nearGeometry: detail,
          farStrategy: "hidden",
          castShadow: false,
          receiveShadow: true,
        },
      ],
    });
    world.addPlacement("building", "lod-building", new THREE.Matrix4());
    const [massing, details] = world.root.children;
    const nearGeometryId = massing.getGeometryIdAt(0);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10_000);
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    assert.deepEqual(world.updateLod(camera), {
      nearPlacements: 0,
      farPlacements: 1,
      changes: [{ placementId: "building", tier: "far" }],
    });
    assert.equal(details.getVisibleAt(0), false);
    assert.notEqual(massing.getGeometryIdAt(0), nearGeometryId);
    assert.equal(world.stats().farPlacements, 1);
    assert.equal(world.stats().visibleInstances, 1);

    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    assert.deepEqual(world.updateLod(camera, { maximumNearDistanceMeters: 5 }), {
      nearPlacements: 0,
      farPlacements: 1,
      changes: [],
    }, "ride detail radius must keep an oversized projected template on its far proxy");

    world.updateVisibility(boxFrustum(100, 110, 100, 110, 100, 110));
    assert.deepEqual(world.updateLod(camera), {
      nearPlacements: 1,
      farPlacements: 0,
      changes: [{ placementId: "building", tier: "near" }],
    });
    assert.equal(massing.getVisibleAt(0), false, "LOD changes must not revive a culled placement");
    assert.equal(details.getVisibleAt(0), false);

    world.updateVisibility(boxFrustum(-10, 10, -10, 10, -10, 10));
    assert.equal(massing.getVisibleAt(0), true);
    assert.equal(details.getVisibleAt(0), true);
    world.setPlacementVisible("building", false);
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    world.updateLod(camera);
    world.updateVisibility(boxFrustum(-10, 10, -10, 10, -10, 10));
    assert.equal(massing.getVisibleAt(0), false, "authored hide must dominate far proxy visibility");
    assert.equal(details.getVisibleAt(0), false);
  } finally {
    world.dispose();
    near.dispose();
    proxy.dispose();
    detail.dispose();
    material.dispose();
  }
});

test("CityBatchWorld canonicalizes value-compatible materials through an authoritative pool key", () => {
  const firstMaterial = new THREE.MeshStandardMaterial();
  const secondMaterial = firstMaterial.clone();
  const geometry = new THREE.BoxGeometry();
  const world = createCityBatchedMeshWorld();
  try {
    world.registerTemplate({
      templateId: "first",
      slots: [{
        slotId: "shell",
        poolKey: "same-key",
        material: firstMaterial,
        nearGeometry: geometry,
        castShadow: true,
        receiveShadow: true,
      }],
    });
    world.registerTemplate({
      templateId: "second",
      slots: [{
        slotId: "shell",
        poolKey: "same-key",
        material: secondMaterial,
        nearGeometry: geometry,
        castShadow: true,
        receiveShadow: true,
      }],
    });
    assert.equal(world.stats().pools, 1);
    assert.equal(world.stats().templates, 2);
  } finally {
    world.dispose();
    geometry.dispose();
    firstMaterial.dispose();
    secondMaterial.dispose();
  }
});

test("CityBatchWorld unions exact color and frozen-shadow bounds without template inflation", () => {
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const world = createCityBatchedMeshWorld();
  try {
    world.registerTemplate({
      templateId: "shadow-caster",
      slots: [{
        slotId: "shell",
        poolKey: "shadow-caster-pool",
        material,
        nearGeometry: geometry,
        castShadow: true,
        receiveShadow: true,
      }],
    });
    world.addPlacement(
      "offscreen-caster",
      "shadow-caster",
      new THREE.Matrix4().makeTranslation(3, 0, 0),
    );
    const colorFrustum = boxFrustum(-1, 1, -2, 2, -2, 2);
    const shadowFrustum = boxFrustum(2, 4, -2, 2, -2, 2);

    assert.deepEqual(world.updateVisibility(colorFrustum), { placements: 0, instances: 0 },
      "the old fixed shadow inflation must not leak into color-only visibility");
    assert.deepEqual(world.updateVisibility(colorFrustum, shadowFrustum), { placements: 1, instances: 1 });
    world.setPlacementVisible("offscreen-caster", false);
    assert.deepEqual(world.updateVisibility(colorFrustum, shadowFrustum), { placements: 0, instances: 0 },
      "authored visibility remains authoritative over both frustums");
  } finally {
    world.dispose();
    geometry.dispose();
    material.dispose();
  }
});
