import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  CITY_CATALOG,
  CITY_CATALOG_IDS,
  CITY_DERIVED_TEMPLATE_IDS,
  DERIVED_TEMPLATE_DESCRIPTORS,
  getCatalogEntry,
  getDerivedTemplateDescriptor,
  resolveMapCollisionRole,
  stretchInternalRoadToKerb,
  toTemplateBuildDescriptor,
  validateCityCatalog,
} from "../app/lib/map/cityCatalog.ts";
import {
  DEFAULT_CATALOG_FACTORY_ADAPTERS,
  createCatalogSourceRegistry,
  getDefaultCatalogSource,
} from "../app/lib/map/cityCatalogSources.ts";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHighRiseResidential,
  buildLowPolyHotDogKiosk,
  buildLowPolyNewsstand,
  buildLowPolyOfficeCampus,
  buildLowPolyParkStreetLight,
  buildLowPolyPhoneBooth,
  buildLowPolyResidentialBuilding,
  buildLowPolyRoadsidePlanter,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "../app/lib/map/cityFurniture.ts";
import { buildLowPolyHospitalCampus } from "../app/lib/map/hospitalCampus.ts";
import { buildLowPolyAmusementPark } from "../app/lib/map/amusementPark.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";
import { buildLowPolyShoppingMall } from "../app/lib/map/shoppingMall.ts";
import { buildLowPolyResidentialCommunity } from "../app/lib/map/residentialCommunity.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";
import { buildLowPolyCityPark } from "../app/lib/map/cityPark.ts";
import { buildLowPolySportsCenter } from "../app/lib/map/sportsCenter.ts";
import { buildLowPolyCityCenter } from "../app/lib/map/cityCenter.ts";
import { buildLowPolyTownCenter } from "../app/lib/map/townCenter.ts";

const PALETTE_IDS = [
  "street-light",
  "roadside-planter",
  "food-truck",
  "hot-dog-kiosk",
  "newsstand",
  "phone-booth",
  "street-tree",
  "residential-building",
  "high-rise-residential",
  "small-villa",
  "office-campus",
  "hospital-campus",
  "amusement-park",
  "school-campus",
  "shopping-mall",
  "residential-community",
  "fire-station",
  "city-park",
  "park-street-light",
  "sports-center",
  "city-center",
  "town-center",
];

const DIRECT_FACTORY_EXPORTS = new Map([
  ["street-light", buildLowPolyStreetLight],
  ["park-street-light", buildLowPolyParkStreetLight],
  ["food-truck", buildLowPolyFoodTruck],
  ["hot-dog-kiosk", buildLowPolyHotDogKiosk],
  ["newsstand", buildLowPolyNewsstand],
  ["phone-booth", buildLowPolyPhoneBooth],
  ["roadside-planter", buildLowPolyRoadsidePlanter],
  ["residential-building", buildLowPolyResidentialBuilding],
  ["high-rise-residential", buildLowPolyHighRiseResidential],
  ["small-villa", buildLowPolySmallVilla],
  ["office-campus", buildLowPolyOfficeCampus],
  ["hospital-campus", buildLowPolyHospitalCampus],
  ["amusement-park", buildLowPolyAmusementPark],
  ["school-campus", buildLowPolySchoolCampus],
  ["shopping-mall", buildLowPolyShoppingMall],
  ["residential-community", buildLowPolyResidentialCommunity],
  ["fire-station", buildLowPolyFireStation],
  ["city-park", buildLowPolyCityPark],
  ["sports-center", buildLowPolySportsCenter],
  ["city-center", buildLowPolyCityCenter],
  ["town-center", buildLowPolyTownCenter],
]);

function footprint(entry) {
  return entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
}

function disposeTree(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) material.dispose?.();
  });
}

test("catalog exposes exactly the 22 palette entries with stable known ids", () => {
  assert.equal(CITY_CATALOG.length, 22);
  assert.deepEqual(CITY_CATALOG_IDS, PALETTE_IDS);
  assert.equal(new Set(CITY_CATALOG_IDS).size, CITY_CATALOG_IDS.length);
  assert.ok(Object.isFrozen(CITY_CATALOG));
  assert.ok(Object.isFrozen(CITY_CATALOG[0]));
  assert.ok(Object.isFrozen(CITY_CATALOG[0].siteSizeMeters));
  assert.equal(getCatalogEntry("street-light")?.id, "street-light");
  assert.equal(getCatalogEntry("traffic-light"), undefined);
  assert.equal(getCatalogEntry("missing"), undefined);
  assert.deepEqual([...new Set(CITY_CATALOG.map((entry) => entry.collection))], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(getCatalogEntry("park-street-light").collection, 9);
});

test("catalog dimensions preserve game-scale footprints and corrected site envelopes", () => {
  const expected = new Map([
    ["street-light", [1, 1]],
    ["roadside-planter", [4, 1]],
    ["food-truck", [6, 3]],
    ["hot-dog-kiosk", [4, 3]],
    ["newsstand", [4, 3]],
    ["phone-booth", [2, 2]],
    ["street-tree", [1, 1]],
    ["residential-building", [8, 6]],
    ["high-rise-residential", [13, 9]],
    ["small-villa", [9, 7]],
    ["office-campus", [30, 17]],
    ["hospital-campus", [80, 62]],
    ["amusement-park", [180, 130]],
    ["school-campus", [170, 130]],
    ["shopping-mall", [184, 138]],
    ["residential-community", [190, 145]],
    ["fire-station", [159, 110]],
    ["city-park", [185, 140]],
    ["park-street-light", [1, 1]],
    ["sports-center", [280, 190]],
    ["city-center", [210, 165]],
    ["town-center", [175, 135]],
  ]);
  for (const entry of CITY_CATALOG) assert.deepEqual(Object.values(footprint(entry)), expected.get(entry.id), entry.id);

  assert.deepEqual(getCatalogEntry("shopping-mall").siteSizeMeters, { x: 184, z: 138 });
  assert.deepEqual(getCatalogEntry("shopping-mall").entrances[0], {
    id: "south", localX: 0, localZ: 69, widthMeters: 62.1, outward: "+z", connectsInternalRoad: "south-perimeter",
  });
  assert.deepEqual(getCatalogEntry("fire-station").siteSizeMeters, { x: 159, z: 110 });
  assert.equal(getCatalogEntry("street-light").defaultHeightScale, 1.32);
  assert.ok(CITY_CATALOG.filter((entry) => entry.id !== "street-light").every((entry) => entry.defaultHeightScale === 1));

  const planter = buildLowPolyRoadsidePlanter();
  const planterBounds = new THREE.Box3().setFromObject(planter);
  assert.ok(planterBounds.getSize(new THREE.Vector3()).x * getCatalogEntry("roadside-planter").mapScale <= 4 + 1e-6);
  assert.ok(planterBounds.getSize(new THREE.Vector3()).z * getCatalogEntry("roadside-planter").mapScale <= 1 + 1e-6);
  disposeTree(planter);

  const booth = buildLowPolyPhoneBooth();
  booth.userData.setDoorOpen(false);
  booth.updateMatrixWorld(true);
  const boothSize = new THREE.Box3().setFromObject(booth).getSize(new THREE.Vector3());
  assert.ok(boothSize.x * getCatalogEntry("phone-booth").mapScale <= 2);
  assert.ok(boothSize.z * getCatalogEntry("phone-booth").mapScale <= 2);
  disposeTree(booth);
});

test("derived traffic-light descriptor stays hidden and the adapter always uses armSide=-1", () => {
  assert.deepEqual(CITY_DERIVED_TEMPLATE_IDS, ["traffic-light"]);
  assert.equal(DERIVED_TEMPLATE_DESCRIPTORS.length, 1);
  const descriptor = getDerivedTemplateDescriptor("traffic-light");
  assert.equal(descriptor.paletteVisible, false);
  assert.deepEqual(descriptor.source, { kind: "factory", factoryId: "traffic-light" });
  assert.equal(descriptor.defaultHeightScale, 1.25);
  assert.equal(getDerivedTemplateDescriptor("missing"), undefined);

  const adapter = getDefaultCatalogSource(descriptor.source);
  const signal = adapter.build();
  assert.equal(signal.userData.armSide, -1);
  assert.equal(signal.userData.mapLayer, "exterior");
  disposeTree(signal);
});

test("factory adapters are the showcase exports and closed-required names hit real nodes", () => {
  assert.equal(DEFAULT_CATALOG_FACTORY_ADAPTERS.length, 22);
  assert.equal(new Set(DEFAULT_CATALOG_FACTORY_ADAPTERS.map((adapter) => adapter.factoryId)).size, 22);
  for (const [factoryId, build] of DIRECT_FACTORY_EXPORTS) {
    assert.equal(getDefaultCatalogSource({ kind: "factory", factoryId }).build, build, factoryId);
  }

  for (const entry of CITY_CATALOG) {
    if (entry.source.kind !== "factory") continue;
    const source = getDefaultCatalogSource(entry.source).build();
    assert.equal(source.userData.mapLayer, "exterior", entry.id);
    for (const exactName of entry.containmentRequiredNames ?? []) {
      assert.ok(source.name === exactName || source.getObjectByName(exactName), `${entry.id}: ${exactName}`);
    }
    disposeTree(source);
  }
});

test("street-tree resolves to the existing medium-redwood model-pack source", async () => {
  const entry = getCatalogEntry("street-tree");
  assert.deepEqual(entry.source, { kind: "model-pack", modelId: "tree_normal_medium_redwood_a" });
  assert.deepEqual(entry.collisionMeshes, {
    source: "catalog-mesh-names",
    solidNames: ["street-tree-wood"],
    ignoreNames: ["street-tree-leaves"],
  });

  const wood = new THREE.BoxGeometry(1, 3, 1);
  const showroomWood = new THREE.BoxGeometry(0.8, 3, 0.8);
  const leaves = new THREE.SphereGeometry(2);
  const registry = createCatalogSourceRegistry({
    modelPack: { all: [{ id: "tree_normal_medium_redwood_a", wood, showroomWood, leaves }] },
  });
  const lease = registry.captureSnapshot();
  const owned = lease.value.createOwnedSource(entry.source);
  assert.equal(owned.sourceIdentity, "model-pack:tree_normal_medium_redwood_a@1");
  const treeWood = owned.group.getObjectByName("street-tree-wood");
  const treeLeaves = owned.group.getObjectByName("street-tree-leaves");
  assert.notEqual(treeWood.geometry, showroomWood);
  assert.notEqual(treeLeaves.geometry, leaves);
  assert.equal(treeWood.userData.mapCollisionRole, "solid");
  assert.equal(treeLeaves.userData.mapCollisionRole, "ignore");
  assert.equal(treeLeaves.userData.mapLayer, "micro-detail");
  disposeTree(owned.group);
  lease.release();
  await registry.retire();
  wood.dispose();
  showroomWood.dispose();
  leaves.dispose();
});

test("catalog validation rejects duplicate ids and invalid containment contracts", () => {
  validateCityCatalog();
  const duplicate = CITY_CATALOG.map((entry) => ({ ...entry }));
  duplicate[1].id = duplicate[0].id;
  assert.throws(() => validateCityCatalog(duplicate), /duplicate or empty catalog id/);

  const invalidContainment = CITY_CATALOG.map((entry) => ({ ...entry }));
  invalidContainment[0].containmentRequiredNames = ["fake-shell"];
  assert.throws(() => validateCityCatalog(invalidContainment), /open-allowed/);
});

test("role resolution follows override, metadata, layer, narrow names, then safe solid fallback", () => {
  const selection = { source: "mesh-userData" };
  const profiles = { defaultRideableProfileId: "site-surface" };
  const audit = { autoSolid: [] };

  const walkway = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial());
  walkway.name = "hospital-campus-pedestrian-walkway";
  assert.deepEqual(resolveMapCollisionRole(walkway, selection, profiles, audit), {
    role: "rideable-surface", surfaceProfileId: "site-surface", source: "name-rule", autoResolved: false,
  });

  const pane = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  pane.name = "atrium-window-pane";
  assert.equal(resolveMapCollisionRole(pane, selection, profiles, audit).role, "ignore");

  const glassCurtain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  glassCurtain.name = "shopping-mall-glass-curtain-panel";
  assert.equal(resolveMapCollisionRole(glassCurtain, selection, profiles, audit).role, "solid");

  const catalogSelected = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  catalogSelected.name = "declared-plaza";
  catalogSelected.userData.mapCollisionRole = "solid";
  const selected = resolveMapCollisionRole(
    catalogSelected,
    { source: "catalog-mesh-names", solidNames: [], rideableSurfaceNames: ["declared-plaza"] },
    { byName: { "declared-plaza": "sidewalk" }, defaultRideableProfileId: "site-surface" },
    audit,
  );
  assert.equal(selected.role, "rideable-surface");
  assert.equal(selected.surfaceProfileId, "sidewalk");
  assert.equal(selected.source, "catalog-override");
  assert.ok(audit.autoSolid.some((item) => item.ancestorPath.endsWith("shopping-mall-glass-curtain-panel")));

  disposeTree(walkway);
  disposeTree(pane);
  disposeTree(glassCurtain);
  disposeTree(catalogSelected);
});

test("internal-road plans extend only toward the requested kerb", () => {
  const plan = stretchInternalRoadToKerb({
    name: "school-main",
    sourceSurface: { kind: "mesh-group", exactName: "school-campus-service-road" },
    sourceRect: { localX: 0, localZ: 61.8, width: 158, depth: 4 },
  }, { x: 170, z: 130 }, "+z");
  assert.equal(plan.name, "school-main");
  assert.deepEqual(plan.sourceSurface, { kind: "mesh-group", exactName: "school-campus-service-road" });
  assert.deepEqual(plan.sourceRect, { localX: 0, localZ: 61.8, width: 158, depth: 4 });
  assert.equal(plan.outward, "+z");
  assert.equal(plan.localX, 0);
  assert.ok(Math.abs(plan.localZ - 62.4) < 1e-9);
  assert.equal(plan.width, 158);
  assert.ok(Math.abs(plan.depth - 5.2) < 1e-9);
});

test("template descriptors resolve occupancy without retaining factory closures", () => {
  for (const entry of CITY_CATALOG) {
    const descriptor = toTemplateBuildDescriptor(entry);
    assert.equal(descriptor.templateId, entry.id);
    assert.deepEqual(descriptor.source, entry.source);
    assert.equal("build" in descriptor.source, false);
    assert.ok(Object.isFrozen(descriptor));
  }
});

test("registry snapshots are generation-stable and retirement waits for borrowers", async () => {
  const registry = createCatalogSourceRegistry();
  const oldLease = registry.captureSnapshot();
  const oldBuild = oldLease.value.getFactoryAdapter("street-light").build;
  const replacement = () => {
    const group = new THREE.Group();
    group.name = "replacement-street-light";
    return group;
  };
  registry.replaceFactory("street-light", replacement);
  const newLease = registry.captureSnapshot();
  assert.equal(oldLease.value.generation, 1);
  assert.equal(newLease.value.generation, 2);
  assert.equal(oldLease.value.getFactoryAdapter("street-light").build, oldBuild);
  assert.equal(newLease.value.getFactoryAdapter("street-light").build, replacement);
  assert.equal(oldLease.value.getCatalogEntry("missing"), undefined);
  assert.equal(newLease.value.getDerivedTemplateDescriptor("traffic-light")?.paletteVisible, false);
  assert.ok(Object.isFrozen(newLease.value));
  assert.ok(Object.isFrozen(newLease.value.catalogEntries[0]));

  const retirement = registry.retire();
  let retired = false;
  void retirement.then(() => { retired = true; });
  await Promise.resolve();
  assert.equal(retired, false);
  assert.throws(() => registry.captureSnapshot(), /retired/);
  oldLease.release();
  oldLease.release();
  await Promise.resolve();
  assert.equal(retired, false);
  newLease.release();
  await retirement;
  assert.equal(retired, true);
});

test("registry HMR replacement preserves the traffic-light left-arm adapter", async () => {
  const registry = createCatalogSourceRegistry();
  registry.replaceFactory("traffic-light", buildLowPolyTrafficLight);
  const lease = registry.captureSnapshot();
  const signal = lease.value.getFactoryAdapter("traffic-light").build();
  assert.equal(signal.userData.armSide, -1);
  disposeTree(signal);
  lease.release();
  await registry.retire();
});
