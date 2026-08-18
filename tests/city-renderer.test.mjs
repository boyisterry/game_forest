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
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

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

test("cache acquires all 22 catalog sources plus the hidden derived source as opaque handles", async () => {
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
    metrics.set(entry.id, baseline);
    acquire.release();
  }
  assert.equal(metrics.size, 22);
  assert.ok(metrics.get("residential-community").showcaseMeshCount >= 5000);

  const signal = cache.getVisualTemplate({ kind: "derived", templateId: "traffic-light" });
  assert.equal(cache.getVisualMetrics(signal.value).templateId, "traffic-light");
  signal.release();
  await cache.retire();
  await sources.retire();
  modelPack.dispose();
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

test("an attachment has its own template pin and cache disposal happens exactly once", async () => {
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
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  port.release();
  await sources.retire();
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
  assert.equal(initial.roadMeshCount, 5);
  assert.equal(initial.legacyLayerCount, 7);
  assert.ok(initial.legacyInstanceCount > 7);
  assert.equal(initial.catalogPlacementCount, 1);
  assert.equal(initial.catalogAttachmentCount, 1);

  const roadMeshes = collect(parent, (object) => object.name.startsWith("city-road-top-"));
  const legacyMeshes = collect(parent, (object) => object instanceof THREE.InstancedMesh
    && object.name.startsWith("city-legacy-"));
  assert.equal(roadMeshes.length, 5);
  assert.deepEqual(legacyMeshes.map((mesh) => mesh.userData.visualRole), LEGACY_VISUAL_ROLES);
  assert.ok(roadMeshes.every((mesh) => mesh.userData.mapCollisionRole === "rideable-surface"));

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
  assert.equal(legacyGeometryDisposals, 7);

  const roadOnly = renderer.applyCityDocument(moved, CityDirtyLayer.Roads);
  assert.equal(roadOnly.roadBuildGeneration, 2);
  assert.equal(roadOnly.placementBuildGeneration, 2);
  assert.equal(roadGeometryDisposals, 5);
  assert.deepEqual(renderer.raycast(rayFrom(4, 1.5, 28, 0, 0, -1)).map((hit) => hit.placementId), ["booth"]);

  renderer.dispose();
  renderer.dispose();
  assert.equal(parent.children.length, 0);
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
    document.flags.signalHeightScale,
  );
  const initial = renderer.applyCityDocument(document);
  assert.equal(initial.signalBuildGeneration, 1);
  assert.equal(initial.signalPlacementCount, 4);
  assert.equal(initial.signalAttachmentCount, 2);

  const wrappers = collect(parent, (object) => object.userData.templateId === "traffic-light");
  assert.equal(wrappers.length, 4);
  assert.equal(wrappers.filter((wrapper) => wrapper.userData.signalPhase === "red").length, 2);
  assert.equal(wrappers.filter((wrapper) => wrapper.userData.signalPhase === "green").length, 2);
  for (const wrapper of wrappers) {
    const red = collect(wrapper, (object) => object.userData.signalPhaseRole === "red")[0];
    const green = collect(wrapper, (object) => object.userData.signalPhaseRole === "green")[0];
    const pedestrian = collect(wrapper, (object) => object.userData.signalPhaseRole === "pedestrian")[0];
    assert.ok(red instanceof THREE.Mesh && green instanceof THREE.Mesh && pedestrian instanceof THREE.Mesh);
    assert.equal(red.material.emissiveIntensity, wrapper.userData.signalPhase === "red" ? 3.2 : 0);
    assert.equal(green.material.emissiveIntensity, wrapper.userData.signalPhase === "green" ? 3.2 : 0);
    assert.equal(pedestrian.material.emissiveIntensity, wrapper.userData.signalPhase === "red" ? 0.08 : 2.2);
    assert.equal(typeof wrapper.children[0].userData.setPhase, "undefined");
  }
  assert.equal(collect(parent, (object) => object instanceof THREE.PointLight).length, 0);
  assert.equal(new Set(wrappers.map((wrapper) =>
    collect(wrapper, (object) => object.userData.signalPhaseRole === "red")[0].material)).size, 4);
  const collisionAfter = await cache.createCollisionCompileSource(
    { kind: "derived", templateId: "traffic-light" },
    document.flags.signalHeightScale,
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

test("signal phase materials are isolated between renderers and disposed with their attachment", async () => {
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
    const wrapper = collect(parent, (object) => object.userData.signalPhase === "red")[0];
    return collect(wrapper, (object) => object.userData.signalPhaseRole === "red")[0];
  };
  const lensA = activeRedLens(parentA);
  const lensB = activeRedLens(parentB);
  assert.ok(lensA instanceof THREE.Mesh && lensB instanceof THREE.Mesh);
  assert.notEqual(lensA.material, lensB.material);
  assert.equal(lensA.material.emissiveIntensity, 3.2);
  assert.equal(lensB.material.emissiveIntensity, 3.2);
  lensA.material.emissiveIntensity = 99;
  assert.equal(lensB.material.emissiveIntensity, 3.2, "renderer B must not share renderer A's phase material");

  let disposedA = 0;
  let disposedB = 0;
  lensA.material.addEventListener("dispose", () => { disposedA += 1; });
  lensB.material.addEventListener("dispose", () => { disposedB += 1; });
  rendererA.dispose();
  assert.equal(disposedA, 1);
  assert.equal(disposedB, 0);
  assert.equal(lensB.material.emissiveIntensity, 3.2);
  rendererB.dispose();
  assert.equal(disposedB, 1);

  await cache.retire();
  await sources.retire();
});
