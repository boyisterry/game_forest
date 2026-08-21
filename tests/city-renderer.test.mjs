import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { CITY_CATALOG } from "../app/lib/map/cityCatalog.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import {
  cloneCityDocument,
  emptyCityDocument,
  parseCityMapDocument,
} from "../app/lib/map/cityDocument.ts";
import {
  LEGACY_VISUAL_ROLES,
  createCityDocumentRenderer,
} from "../app/lib/map/cityDocumentRenderer.ts";
import { CityDirtyLayer } from "../app/lib/map/cityEditor.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import {
  CITY_VISUAL_INSTANCE_CELL_SIZE_METERS,
  createCityTemplateCache,
} from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";
import { retireResourceCacheGeneration } from "../app/lib/map/cityResourceCache.ts";

function createModelPack() {
  const wood = new THREE.BoxGeometry(0.5, 3, 0.5);
  const showroomWood = new THREE.BoxGeometry(0.42, 3, 0.42);
  const leaves = new THREE.SphereGeometry(1.5, 8, 6);
  return {
    pack: { all: [{ id: "tree_normal_medium_redwood_a", wood, showroomWood, leaves }] },
    dispose() {
      wood.dispose();
      showroomWood.dispose();
      leaves.dispose();
    },
  };
}

function documentSnapshot({ placements = [], withRoad = false } = {}) {
  const document = cloneCityDocument(emptyCityDocument());
  document.placements.push(...placements);
  if (withRoad) {
    document.graph.nodes.push(
      { id: "road-a", x: -30, z: 0 },
      { id: "road-b", x: 30, z: 0 },
    );
    document.graph.edges.push({
      id: "road-main",
      a: "road-a",
      b: "road-b",
      profile: createRoadProfile("two-way-1"),
    });
  }
  return parseCityMapDocument(document).document;
}

function signalDocumentSnapshot() {
  const document = cloneCityDocument(emptyCityDocument());
  document.flags.needTrafficLights = true;
  document.graph.nodes.push(
    { id: "center", x: 0, z: 0 },
    { id: "west", x: -40, z: 0 },
    { id: "east", x: 40, z: 0 },
    { id: "north", x: 0, z: -40 },
    { id: "south", x: 0, z: 40 },
  );
  document.graph.edges.push(
    { id: "west-approach", a: "west", b: "center", profile: createRoadProfile("two-way-1") },
    { id: "east-approach", a: "center", b: "east", profile: createRoadProfile("two-way-1") },
    { id: "north-approach", a: "north", b: "center", profile: createRoadProfile("two-way-1") },
    { id: "south-approach", a: "center", b: "south", profile: createRoadProfile("two-way-1") },
  );
  return parseCityMapDocument(document).document;
}

function identitySnapshot() {
  return Object.freeze(new THREE.Matrix4().toArray());
}

function rayFrom(x, y, z, dx, dy, dz) {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz).normalize());
  return raycaster;
}

function collect(root, predicate) {
  const result = [];
  root.traverse((object) => { if (predicate(object)) result.push(object); });
  return result;
}

test("cache acquires all 33 catalog sources plus the hidden derived source as opaque handles", async () => {
  const modelPack = createModelPack();
  const sources = createCatalogSourceRegistry({ modelPack: modelPack.pack });
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const metrics = new Map();
  for (const entry of CITY_CATALOG) {
    const acquire = cache.getVisualTemplate({ kind: "catalog", catalogId: entry.id });
    assert.deepEqual(Object.keys(acquire.value).sort(), ["generation", "sourceIdentity", "sourceRegistryGeneration"]);
    assert.equal("group" in acquire.value, false);
    assert.equal("geometry" in acquire.value, false);
    assert.equal("material" in acquire.value, false);
    const baseline = cache.getVisualMetrics(acquire.value);
    assert.equal(baseline.templateId, entry.id);
    assert.ok(baseline.showcaseMeshCount > 0, entry.id);
    assert.ok(baseline.mapVisibleMeshCount > 0, entry.id);
    assert.ok(baseline.mapVisibleMeshCount <= baseline.showcaseMeshCount, entry.id);
    assert.ok(Object.isFrozen(baseline));
    const definition = cache.getBatchTemplateDefinition(acquire.value);
    assert.ok(definition, `${entry.id} must expose a production far-LOD batch definition`);
    assert.equal(definition.slots.filter((slot) => slot.farStrategy === "proxy").length, 1, entry.id);
    assert.ok(definition.slots.every((slot) => slot.farStrategy === "proxy" || slot.farStrategy === "hidden"), entry.id);
    const proxy = definition.slots.find((slot) => slot.farStrategy === "proxy").farGeometry;
    assert.ok(proxy, entry.id);
    assert.equal((proxy.getIndex()?.count ?? proxy.getAttribute("position").count) / 3, 12, entry.id);
    metrics.set(entry.id, baseline);
    acquire.release();
  }
  assert.equal(metrics.size, 33);
  assert.ok(metrics.get("residential-community").showcaseMeshCount >= 5000);
  assert.ok(metrics.get("high-rise-residential").mapVisibleMeshCount >= 300);
  assert.ok(metrics.get("high-rise-residential").mapVisibleMeshCount < 500,
    "map LOD must remove the tower's apartment, elevator, and stair interiors");
  assert.ok(metrics.get("high-rise-residential").mapDrawCalls <= 20,
    "the map template must be materially batched instead of cloning hundreds of meshes");

  const signal = cache.getVisualTemplate({ kind: "derived", templateId: "traffic-light" });
  assert.equal(cache.getVisualMetrics(signal.value).templateId, "traffic-light");
  signal.release();
  await cache.retire();
  await sources.retire();
  modelPack.dispose();
});

test("repeated catalog placements share material batches through InstancedMesh picking", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const acquire = cache.getVisualTemplate({ kind: "catalog", catalogId: "phone-booth" });
  const translated = new THREE.Matrix4().makeTranslation(10, 0, 0).toArray();
  const attachment = cache.attachVisualTemplate(acquire.value, {
    targetLayer: port.value,
    placements: [
      { placementId: "booth-a", worldFromLocal: identitySnapshot() },
      { placementId: "booth-b", worldFromLocal: Object.freeze(translated) },
    ],
  });
  const metrics = cache.getVisualMetrics(acquire.value);
  acquire.release();
  const batches = collect(parent, (object) => object instanceof THREE.InstancedMesh);
  assert.equal(batches.length, metrics.mapDrawCalls);
  assert.ok(batches.every((batch) => batch.count === 2));
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 1.5, 8, 0, 0, -1)).map((hit) => hit.placementId), ["booth-a"]);
  assert.deepEqual(layers.raycast(port.value, rayFrom(10, 1.5, 8, 0, 0, -1)).map((hit) => hit.placementId), ["booth-b"]);
  layers.setPlacementLod(port.value, "booth-a", "far");
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 1.5, 8, 0, 0, -1)), []);
  assert.ok(batches.every((batch) => batch.visible), "a near sibling keeps each special batch mounted");
  layers.setPlacementLod(port.value, "booth-b", "far");
  assert.ok(batches.every((batch) => !batch.visible), "an all-far special batch stops submitting draw calls");
  layers.setPlacementLod(port.value, "booth-a", "near");
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 1.5, 8, 0, 0, -1)).map((hit) => hit.placementId), ["booth-a"]);
  attachment.release();
  port.release();
  await cache.retire();
  await sources.retire();
});

test("layer ports enforce attachment-first release and controlled pick mappings", () => {
  const layers = createCityVisualLayerManager();
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].userData.skipGenericDispose, true);

  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const mount = layers.mount(port.value, {
    objects: [mesh],
    objectPlacements: [{ object: mesh, placementId: "picked-box" }],
  });
  assert.equal(layers.getPortStats(port.value).attachmentCount, 1);
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 5, 0, 0, -1)).map((hit) => hit.placementId), ["picked-box"]);
  assert.throws(() => port.release(), /live attachments/);
  mount.release();
  mount.release();
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 5, 0, 0, -1)), []);
  port.release();
  assert.equal(parent.children.length, 0);
  geometry.dispose();
  material.dispose();
});

test("layer ports exclude broad-phase roots from recursive Three.js raycasting", () => {
  const layers = createCityVisualLayerManager();
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.raycast = () => { throw new Error("recursive raycast should be bypassed"); };
  root.add(mesh);
  const mount = layers.mount(port.value, {
    objects: [root],
    broadPhaseRaycast: () => [{ placementId: "broad-box", distance: 4.5 }],
  });
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 5, 0, 0, -1)), [
    { placementId: "broad-box", distance: 4.5 },
  ]);
  mount.release();
  port.release();
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("mapped fallback objects use frozen placement AABBs before exact raycasting", () => {
  const layers = createCityVisualLayerManager();
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const near = new THREE.Mesh(geometry, material);
  const far = new THREE.Mesh(geometry, material);
  far.position.x = 20;
  far.raycast = () => { throw new Error("far exact raycast should be rejected by its AABB"); };
  const mount = layers.mount(port.value, {
    objects: [near, far],
    objectPlacements: [
      { object: near, placementId: "near" },
      { object: far, placementId: "far" },
    ],
  });
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 5, 0, 0, -1)), [
    { placementId: "near", distance: 4 },
  ]);
  layers.setPlacementLod(port.value, "near", "far");
  assert.equal(near.visible, false);
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 5, 0, 0, -1)), []);
  layers.setPlacementLod(port.value, "near", "near");
  assert.equal(near.visible, true);
  mount.release();
  port.release();
  geometry.dispose();
  material.dispose();
});

test("an attachment pins its template while shared geometry follows cache generation retirement", async () => {
  let geometryDisposals = 0;
  let materialDisposals = 0;
  const sources = createCatalogSourceRegistry();
  sources.replaceFactory("phone-booth", () => {
    const group = new THREE.Group();
    group.name = "test-phone-booth";
    group.userData.mapLayer = "exterior";
    const geometry = new THREE.BoxGeometry(2, 3, 2);
    geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
    const material = new THREE.MeshBasicMaterial();
    material.addEventListener("dispose", () => { materialDisposals += 1; });
    group.add(new THREE.Mesh(geometry, material));
    return group;
  });
  const layers = createCityVisualLayerManager();
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const cache = createCityTemplateCache({ sources, layers });
  const acquire = cache.getVisualTemplate({ kind: "catalog", catalogId: "phone-booth" });
  const attachment = cache.attachVisualTemplate(acquire.value, {
    targetLayer: port.value,
    placements: [{ placementId: "phone", worldFromLocal: identitySnapshot() }],
  });
  acquire.release();
  assert.deepEqual(layers.raycast(port.value, rayFrom(0, 0, 6, 0, 0, -1)).map((hit) => hit.placementId), ["phone"]);

  const retirement = cache.retire();
  let settled = false;
  void retirement.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(geometryDisposals, 0);
  attachment.release();
  attachment.release();
  await retirement;
  assert.equal(geometryDisposals, 0, "template teardown must not dispose cache-owned geometry");
  assert.equal(materialDisposals, 1);
  port.release();
  await sources.retire();
  await retireResourceCacheGeneration();
  assert.equal(geometryDisposals, 1);
});

test("two renderers isolate ports and deleting one leaves the other pickable", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parentA = new THREE.Group();
  const parentB = new THREE.Group();
  const rendererA = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parentA });
  const rendererB = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parentB });
  const document = documentSnapshot({
    placements: [{
      id: "booth",
      catalogId: "phone-booth",
      poseKind: "world",
      x: 0,
      z: 0,
      yawRadians: 0,
      scale: 1,
    }],
  });
  rendererA.applyCityDocument(document);
  rendererB.applyCityDocument(document);
  const raycaster = rayFrom(0, 1.5, 8, 0, 0, -1);
  assert.deepEqual(rendererA.raycast(raycaster).map((hit) => hit.placementId), ["booth"]);
  assert.deepEqual(rendererB.raycast(raycaster).map((hit) => hit.placementId), ["booth"]);
  assert.equal(parentA.children.length, 1);
  assert.equal(parentB.children.length, 1);

  rendererA.dispose();
  assert.equal(parentA.children.length, 0);
  assert.deepEqual(rendererB.raycast(raycaster).map((hit) => hit.placementId), ["booth"]);
  rendererB.dispose();
  assert.equal(parentB.children.length, 0);
  await cache.retire();
  await sources.retire();
});

test("renderer builds road tops, seven legacy instance layers, and honors dirty rebuild boundaries", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parent });
  const placements = [
    {
      id: "booth",
      catalogId: "phone-booth",
      poseKind: "world",
      x: 0,
      z: 20,
      yawRadians: 0,
      scale: 1,
    },
    {
      id: "legacy",
      catalogId: "legacy-massing-block",
      poseKind: "legacy-massing",
      x: 60,
      z: 30,
      yawRadians: 0,
      width: 20,
      depth: 16,
      height: 30,
      roofHeight: 4,
      color: 0xaabbcc,
      district: "central",
    },
  ];
  const first = documentSnapshot({ placements, withRoad: true });
  const initial = renderer.applyCityDocument(first);
  assert.equal(initial.roadBuildGeneration, 1);
  assert.equal(initial.placementBuildGeneration, 1);
  assert.equal(initial.roadMeshCount, 6);
  assert.equal(initial.legacyLayerCount, 7);
  assert.ok(initial.legacyInstanceCount > 7);
  assert.equal(initial.catalogPlacementCount, 1);
  assert.equal(initial.catalogAttachmentCount, 1);
  assert.equal(initial.catalogBatchBackend, "instanced-mesh");
  assert.equal(initial.catalogBatchPoolCount, 0);
  assert.equal(collect(parent, (object) => object instanceof THREE.BatchedMesh).length, 0);

  const roadMeshes = collect(parent, (object) => object.name.startsWith("city-road-top-"));
  const legacyMeshes = collect(parent, (object) => object instanceof THREE.InstancedMesh
    && object.name.startsWith("city-legacy-"));
  assert.equal(roadMeshes.length, 3);
  assert.deepEqual(legacyMeshes.map((mesh) => mesh.userData.visualRole), LEGACY_VISUAL_ROLES);
  assert.ok(roadMeshes.every((mesh) => mesh.userData.mapCollisionRole === "rideable-surface"));
  const bikeLanes = roadMeshes.filter((mesh) => mesh.userData.mapSurfaceProfile === "bike-lane");
  assert.equal(bikeLanes.length, 1);
  assert.equal(bikeLanes[0].material.color.getHex(), 0x4b5054);
  assert.equal(bikeLanes[0].userData.roadSourceSurfaceCount, 2);
  const sidewalks = roadMeshes.filter((mesh) => mesh.userData.mapSurfaceProfile === "sidewalk");
  assert.equal(sidewalks.length, 1);
  for (const sidewalk of sidewalks) {
    assert.equal(sidewalk.userData.roadVisualRole, "raised-sidewalk");
    assert.ok(Array.isArray(sidewalk.material));
    assert.equal(sidewalk.material.length, 2, "sidewalk top and curb use distinct materials");
    assert.notEqual(sidewalk.material[0].color.getHex(), sidewalk.material[1].color.getHex());
    assert.equal(sidewalk.userData.roadSourceSurfaceCount, 2);
    assert.equal(sidewalk.geometry.getAttribute("position").count, 16);
    assert.equal(sidewalk.geometry.getIndex().count, 36, "merged tops plus both long curb faces");
    assert.deepEqual(sidewalk.geometry.groups.map((group) => group.materialIndex), [0, 1]);
    const y = [...sidewalk.geometry.getAttribute("position").array].filter((_, index) => index % 3 === 1);
    assert.ok(Math.abs(Math.min(...y) - 0.005) < 1e-6);
    assert.ok(Math.abs(Math.max(...y) - 0.245) < 1e-6);
  }
  const laneMarkings = collect(parent, (object) => object.userData.roadVisualRole === "lane-marking");
  assert.equal(laneMarkings.length, 2);
  assert.deepEqual(
    new Set(laneMarkings.map((mesh) => mesh.name)),
    new Set(["city-road-white-lane-markings", "city-road-yellow-lane-markings"]),
  );
  assert.ok(laneMarkings.every((mesh) => mesh.userData.mapCollisionRole === "ignore"));
  assert.equal(laneMarkings.find((mesh) => mesh.name.includes("white")).userData.markingCount, 4);
  assert.equal(laneMarkings.find((mesh) => mesh.name.includes("yellow")).userData.markingCount, 2);
  const bikeArrows = collect(parent, (object) => object.userData.roadVisualRole === "bike-lane-direction");
  assert.equal(bikeArrows.length, 1);
  assert.equal(bikeArrows[0].userData.arrowCount, 2);
  assert.equal(bikeArrows[0].userData.mapCollisionRole, "ignore");

  let roadGeometryDisposals = 0;
  for (const mesh of roadMeshes) mesh.geometry.addEventListener("dispose", () => { roadGeometryDisposals += 1; });
  let legacyGeometryDisposals = 0;
  for (const mesh of legacyMeshes) mesh.geometry.addEventListener("dispose", () => { legacyGeometryDisposals += 1; });

  const moved = documentSnapshot({
    placements: [{ ...placements[0], x: 4 }, placements[1]],
    withRoad: true,
  });
  const placementOnly = renderer.applyCityDocument(moved, CityDirtyLayer.Placements);
  assert.equal(placementOnly.roadBuildGeneration, 1);
  assert.equal(placementOnly.placementBuildGeneration, 2);
  assert.equal(roadGeometryDisposals, 0);
  assert.equal(legacyGeometryDisposals, 0, "unchanged legacy layers survive catalog-only placement edits");

  const roadOnly = renderer.applyCityDocument(moved, CityDirtyLayer.Roads);
  assert.equal(roadOnly.roadBuildGeneration, 2);
  assert.equal(roadOnly.placementBuildGeneration, 2);
  assert.equal(roadGeometryDisposals, 3);
  assert.deepEqual(renderer.raycast(rayFrom(4, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth"]);

  renderer.dispose();
  renderer.dispose();
  assert.equal(parent.children.length, 0);
  await cache.retire();
  await sources.retire();
});

test("instanced fallback rebuilds only the spatial catalog cell touched by a placement edit", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parent });
  const booth = {
    id: "booth",
    catalogId: "phone-booth",
    poseKind: "world",
    x: 0,
    z: 20,
    yawRadians: 0,
    scale: 1,
  };
  const farX = CITY_VISUAL_INSTANCE_CELL_SIZE_METERS + 44;
  const farBooth = {
    id: "far-booth",
    catalogId: "phone-booth",
    poseKind: "world",
    x: farX,
    z: 20,
    yawRadians: 0,
    scale: 1,
  };
  renderer.applyCityDocument(documentSnapshot({ placements: [booth, farBooth] }));
  const groups = () => collect(parent, (object) => object.name === "city-template-batches-phone-booth");
  const groupAtX = (x) => groups().find((candidate) => {
    const instance = candidate.children.find((object) => object instanceof THREE.InstancedMesh);
    if (!instance) return false;
    const matrix = new THREE.Matrix4();
    instance.getMatrixAt(0, matrix);
    return Math.abs(matrix.elements[12] - x) < 1e-6;
  });
  const oldBoothGroup = groupAtX(0);
  const oldFarGroup = groupAtX(farX);
  assert.ok(oldBoothGroup);
  assert.ok(oldFarGroup);
  let boothDisposals = 0;
  oldBoothGroup.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.addEventListener("dispose", () => { boothDisposals += 1; });
  });

  const report = renderer.applyCityDocument(documentSnapshot({
    placements: [{ ...booth, x: 4 }, farBooth],
  }), CityDirtyLayer.Placements);

  assert.equal(report.catalogAttachmentCount, 2);
  assert.equal(report.placementFullRebuildCount, 1);
  assert.equal(report.placementIncrementalCommitCount, 1);
  assert.equal(report.placementLastAddedCount, 0);
  assert.equal(report.placementLastUpdatedCount, 1);
  assert.equal(report.placementLastRemovedCount, 0);
  assert.equal(report.placementLastAffectedCatalogCount, 1);
  assert.equal(report.placementLastAffectedCellCount, 1);
  assert.notEqual(groupAtX(4), oldBoothGroup);
  assert.equal(groupAtX(farX), oldFarGroup);
  assert.ok(boothDisposals > 0, "the replaced catalog group releases its owned instances");
  assert.deepEqual(renderer.raycast(rayFrom(4, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth"]);
  renderer.dispose();
  await cache.retire();
  await sources.retire();
});

test("renderer routes opaque static slots through CityBatchWorld while preserving special slots and picking", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({
    cache,
    layers,
    parentOwnedLayer: parent,
    batchBackend: "batched-mesh",
  });
  const document = documentSnapshot({
    placements: [{
      id: "booth",
      catalogId: "phone-booth",
      poseKind: "world",
      x: 0,
      z: 20,
      yawRadians: 0,
      scale: 1,
    }],
  });
  const initial = renderer.applyCityDocument(document);
  assert.equal(initial.catalogBatchBackend, "batched-mesh");
  assert.ok(initial.catalogBatchPoolCount > 0);
  assert.ok(initial.catalogBatchInstanceCount > 0);
  const batched = collect(parent, (object) => object instanceof THREE.BatchedMesh);
  const fallback = collect(parent, (object) => object instanceof THREE.InstancedMesh
    && object.userData.templateId === "phone-booth");
  assert.equal(batched.length, initial.catalogBatchPoolCount);
  assert.ok(fallback.length > 0, "transparent booth glass remains on the special path");
  assert.ok(fallback.every((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some((material) => material.transparent || material.opacity < 1);
  }));
  const visibilityCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  visibilityCamera.position.set(0, 8, 28);
  visibilityCamera.lookAt(0, 1, 20);
  assert.deepEqual(renderer.updateBatchVisibility(visibilityCamera), {
    placements: 1,
    instances: initial.catalogBatchInstanceCount,
    nearPlacements: 1,
    farPlacements: 0,
  });
  visibilityCamera.position.set(0, 8, 500);
  visibilityCamera.lookAt(0, 1, 20);
  assert.deepEqual(renderer.updateBatchVisibility(visibilityCamera), {
    placements: 1,
    instances: 1,
    nearPlacements: 0,
    farPlacements: 1,
  });
  assert.ok(fallback.every((mesh) => !mesh.visible));
  visibilityCamera.position.set(1000, 8, 20);
  visibilityCamera.lookAt(1100, 8, 20);
  assert.deepEqual(renderer.updateBatchVisibility(visibilityCamera), {
    placements: 0,
    instances: 0,
    nearPlacements: 0,
    farPlacements: 1,
  });
  visibilityCamera.position.set(0, 8, 28);
  visibilityCamera.lookAt(0, 1, 20);
  renderer.updateBatchVisibility(visibilityCamera);
  assert.deepEqual(renderer.raycast(rayFrom(0, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth"]);
  assert.deepEqual(renderer.getRaycastStats(), {
    durationMs: renderer.getRaycastStats().durationMs,
    testedPlacements: 1,
    candidatePlacements: 1,
    testedSlots: initial.catalogBatchInstanceCount,
  });
  assert.ok(renderer.getRaycastStats().durationMs >= 0);

  const moved = documentSnapshot({
    placements: [{
      ...document.placements[0],
      x: 4,
    }],
  });
  const rebuilt = renderer.applyCityDocument(moved, CityDirtyLayer.Placements);
  assert.equal(rebuilt.placementBuildGeneration, 2);
  assert.equal(rebuilt.placementFullRebuildCount, 1);
  assert.equal(rebuilt.placementIncrementalCommitCount, 1);
  assert.equal(rebuilt.placementLastUpdatedCount, 1);
  assert.equal(rebuilt.placementLastAffectedCatalogCount, 1);
  assert.deepEqual(collect(parent, (object) => object instanceof THREE.BatchedMesh), batched,
    "moving a placement must preserve the live BatchedMesh pools");
  assert.deepEqual(renderer.raycast(rayFrom(4, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth"]);

  const added = documentSnapshot({
    placements: [moved.placements[0], { ...moved.placements[0], id: "booth-2", x: 16 }],
  });
  const afterAdd = renderer.applyCityDocument(added, CityDirtyLayer.Placements);
  assert.equal(afterAdd.catalogPlacementCount, 2);
  assert.equal(afterAdd.placementLastAddedCount, 1);
  assert.equal(afterAdd.placementLastUpdatedCount, 0);
  assert.deepEqual(collect(parent, (object) => object instanceof THREE.BatchedMesh), batched);
  assert.deepEqual(renderer.raycast(rayFrom(16, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth-2"]);

  const removed = documentSnapshot({ placements: [added.placements[1]] });
  const afterRemove = renderer.applyCityDocument(removed, CityDirtyLayer.Placements);
  assert.equal(afterRemove.catalogPlacementCount, 1);
  assert.equal(afterRemove.placementLastRemovedCount, 1);
  assert.deepEqual(collect(parent, (object) => object instanceof THREE.BatchedMesh), batched);
  assert.deepEqual(renderer.raycast(rayFrom(4, 1.5, 28, 0, 0, -1)), []);
  renderer.dispose();
  assert.equal(parent.children.length, 0);
  await cache.retire();
  await sources.retire();
});

test("a single edit in a 2500-placement document touches one visual cell and preserves batch pools", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({
    cache,
    layers,
    parentOwnedLayer: parent,
    batchBackend: "batched-mesh",
  });
  const placements = Array.from({ length: 2_500 }, (_, index) => ({
    id: `light-${index}`,
    catalogId: "street-light",
    poseKind: "world",
    x: -900 + (index % 50) * 36,
    z: -900 + Math.floor(index / 50) * 36,
    yawRadians: 0,
    scale: 1,
  }));
  const initial = renderer.applyCityDocument(documentSnapshot({ placements }));
  const pools = collect(parent, (object) => object instanceof THREE.BatchedMesh);
  const movedPlacements = [...placements];
  movedPlacements[0] = { ...movedPlacements[0], x: movedPlacements[0].x + 4 };

  const updated = renderer.applyCityDocument(
    documentSnapshot({ placements: movedPlacements }),
    CityDirtyLayer.Placements,
  );

  assert.equal(updated.catalogPlacementCount, 2_500);
  assert.equal(updated.placementLastUpdatedCount, 1);
  assert.equal(updated.placementLastAffectedCatalogCount, 1);
  assert.equal(updated.placementLastAffectedCellCount, 1);
  assert.equal(updated.catalogBatchInstanceCount, initial.catalogBatchInstanceCount);
  assert.deepEqual(collect(parent, (object) => object instanceof THREE.BatchedMesh), pools);
  renderer.dispose();
  await cache.retire();
  await sources.retire();
});

test("renderer attaches simultaneous red and green signals from the hidden derived template", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parent });
  const document = signalDocumentSnapshot();
  const collisionBefore = await cache.createCollisionCompileSource(
    { kind: "derived", templateId: "traffic-light" },
  );
  const initial = renderer.applyCityDocument(document);
  assert.equal(initial.signalBuildGeneration, 1);
  assert.equal(initial.signalPlacementCount, 4);
  assert.equal(initial.signalAttachmentCount, 2);
  const crosswalks = collect(parent, (object) => object.userData.roadVisualRole === "crosswalk-marking");
  assert.equal(crosswalks.length, 1);
  assert.equal(crosswalks[0].userData.crosswalkCount, 4);
  assert.equal(crosswalks[0].userData.mapCollisionRole, "ignore");
  assert.equal(crosswalks[0].geometry.getIndex().count, 4 * 12 * 6);
  const crosswalkPositions = crosswalks[0].geometry.getAttribute("position");
  const firstStripeX = [];
  const firstStripeZ = [];
  for (let vertex = 0; vertex < 4; vertex += 1) {
    firstStripeX.push(crosswalkPositions.getX(vertex));
    firstStripeZ.push(crosswalkPositions.getZ(vertex));
  }
  const stripeXSpan = Math.max(...firstStripeX) - Math.min(...firstStripeX);
  const stripeZSpan = Math.max(...firstStripeZ) - Math.min(...firstStripeZ);
  assert.ok(Math.abs(stripeXSpan - 4.2) < 1e-5, "stripe long edge follows the road approach");
  assert.ok(stripeZSpan < 1, "zebra stripes repeat across the road instead of along it");

  const signalBatches = collect(parent, (object) => object instanceof THREE.InstancedMesh
    && object.userData.templateId === "traffic-light");
  assert.ok(signalBatches.length <= 56, "signals are phase-batched instead of cloned per placement");
  assert.ok(signalBatches.every((batch) => batch.count >= 1 && batch.count <= 2));
  const signalBounds = new THREE.Box3();
  for (const batch of signalBatches) signalBounds.expandByObject(batch);
  assert.ok(Math.abs(signalBounds.min.y - 0.24) < 1e-6);
  for (const phase of ["red", "green"]) {
    const phaseBatches = signalBatches.filter((batch) => batch.userData.signalPhase === phase);
    const red = phaseBatches.find((batch) => batch.userData.signalPhaseRole === "red");
    const green = phaseBatches.find((batch) => batch.userData.signalPhaseRole === "green");
    const pedestrian = phaseBatches.find((batch) => batch.userData.signalPhaseRole === "pedestrian");
    assert.ok(red && green && pedestrian);
    assert.equal(phaseBatches.filter((batch) => batch.userData.signalPhaseRole === "red")
      .reduce((sum, batch) => sum + batch.count, 0), 2);
    assert.equal(red.material.emissiveIntensity, phase === "red" ? 3.2 : 0);
    assert.equal(green.material.emissiveIntensity, phase === "green" ? 3.2 : 0);
    assert.equal(pedestrian.material.emissiveIntensity, phase === "red" ? 0.08 : 2.2);
  }
  assert.equal(collect(parent, (object) => object instanceof THREE.PointLight).length, 0);
  assert.equal(new Set(signalBatches.filter((batch) => batch.userData.signalPhaseRole === "red")
    .map((batch) => batch.material)).size, 2, "one immutable lens material is shared within each phase");
  const collisionAfter = await cache.createCollisionCompileSource(
    { kind: "derived", templateId: "traffic-light" },
  );
  assert.equal(collisionAfter.sourceId, collisionBefore.sourceId);
  assert.equal(collisionAfter.generation, collisionBefore.generation);

  const signalsOnly = renderer.applyCityDocument(document, CityDirtyLayer.Signals);
  assert.equal(signalsOnly.roadBuildGeneration, 1);
  assert.equal(signalsOnly.signalBuildGeneration, 2);
  const roadDirty = renderer.applyCityDocument(document, CityDirtyLayer.Roads);
  assert.equal(roadDirty.roadBuildGeneration, 2);
  assert.equal(roadDirty.signalBuildGeneration, 3, "road topology changes must rebuild derived signals");

  renderer.dispose();
  await cache.retire();
  await sources.retire();
});

test("renderer routes both traffic-light phases through CityBatchWorld", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({
    cache,
    layers,
    parentOwnedLayer: parent,
    batchBackend: "batched-mesh",
  });
  const initial = renderer.applyCityDocument(signalDocumentSnapshot());
  assert.equal(initial.signalPlacementCount, 4);
  assert.equal(initial.signalAttachmentCount, 2);
  assert.ok(initial.signalBatchPoolCount > 0);
  assert.ok(initial.signalBatchInstanceCount >= initial.signalPlacementCount);
  assert.ok(initial.signalBatchGeometryCount > 0);
  const signalPools = collect(parent, (object) => object instanceof THREE.BatchedMesh)
    .filter((object) => object.parent?.name === "city-batch-world");
  assert.equal(signalPools.length, initial.signalBatchPoolCount);
  const fallback = collect(parent, (object) => object instanceof THREE.InstancedMesh
    && object.userData.templateId === "traffic-light");
  assert.ok(fallback.every((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.length !== 1 || materials[0].transparent || materials[0].opacity < 1;
  }));

  const rebuilt = renderer.applyCityDocument(signalDocumentSnapshot(), CityDirtyLayer.Signals);
  assert.equal(rebuilt.signalBuildGeneration, 2);
  assert.equal(rebuilt.signalBatchInstanceCount, initial.signalBatchInstanceCount);
  renderer.dispose();
  assert.equal(parent.children.length, 0);
  await cache.retire();
  await sources.retire();
});

test("signal phase batch materials are immutable across renderers and disposed with the cache", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parentA = new THREE.Group();
  const parentB = new THREE.Group();
  const rendererA = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parentA });
  const rendererB = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parentB });
  const document = signalDocumentSnapshot();
  rendererA.applyCityDocument(document);
  rendererB.applyCityDocument(document);

  const activeRedLens = (parent) => {
    return collect(parent, (object) => object instanceof THREE.InstancedMesh
      && object.userData.signalPhase === "red"
      && object.userData.signalPhaseRole === "red")[0];
  };
  const lensA = activeRedLens(parentA);
  const lensB = activeRedLens(parentB);
  assert.ok(lensA instanceof THREE.Mesh && lensB instanceof THREE.Mesh);
  assert.equal(lensA.material, lensB.material);
  assert.equal(lensA.material.emissiveIntensity, 3.2);
  assert.equal(lensB.material.emissiveIntensity, 3.2);
  let disposals = 0;
  lensA.material.addEventListener("dispose", () => { disposals += 1; });
  rendererA.dispose();
  assert.equal(disposals, 0);
  assert.equal(lensB.material.emissiveIntensity, 3.2);
  rendererB.dispose();
  await cache.retire();
  assert.equal(disposals, 1);
  await sources.retire();
});
