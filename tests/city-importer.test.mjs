import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  buildCityWorld,
  getCityRoadProfiles,
  roadsIntersect,
} from "../app/lib/map/city.ts";
import { CITY_CATALOG_IDS } from "../app/lib/map/cityCatalog.ts";
import {
  RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS,
  collectRainHarborRoadGraph,
  frozenCrossSectionFromCityRoadProfile,
  importRainHarborDocument,
} from "../app/lib/map/cityImporter.ts";
import { parseCityMapDocument } from "../app/lib/map/cityDocument.ts";
import {
  LEGACY_MASSING_CATALOG_ID,
  buildLegacyMassingBoxParts,
  collectDeliveryStops,
  collectRainHarborRoute,
} from "../app/lib/map/cityPlacements.ts";
import { CollisionWorld } from "../app/lib/map/collision.ts";
import { buildLowPolyStreetLight } from "../app/lib/map/cityFurniture.ts";
import { DEFAULT_SETTINGS } from "../app/lib/map/types.ts";

const SETTINGS = Object.freeze({ ...DEFAULT_SETTINGS, mapType: "city" });

function nodeMap(graph) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function compareMatrix(actual, expected, label, epsilon = 2e-4) {
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(actual.elements[index] - expected.elements[index]) <= epsilon,
      `${label} matrix[${index}] expected ${expected.elements[index]}, got ${actual.elements[index]}`,
    );
  }
}

function matrixForPart(part) {
  const object = new THREE.Object3D();
  object.position.set(part.x, part.y, part.z);
  object.rotation.set(0, part.yawRadians, 0);
  object.scale.set(part.scaleX, part.scaleY, part.scaleZ);
  object.updateMatrix();
  return object.matrix.clone();
}

function matrixForWorldPlacement(placement, y = 0.24) {
  const object = new THREE.Object3D();
  object.position.set(placement.x, y, placement.z);
  object.rotation.set(0, placement.yawRadians, 0);
  object.scale.setScalar(placement.scale);
  object.updateMatrix();
  return object.matrix.clone();
}

test("Rain Harbor import is deterministic and changes when its seed changes", () => {
  const first = importRainHarborDocument(SETTINGS);
  const second = importRainHarborDocument({ ...SETTINGS });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, importRainHarborDocument({ ...SETTINGS, seed: SETTINGS.seed + 1 }));
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.graph.edges[0].profile.crossSection.left));
});

test("every active legacy crossing is a shared graph node with all four split approaches", () => {
  const profiles = getCityRoadProfiles(SETTINGS.roadWidth, SETTINGS.seed);
  const graph = collectRainHarborRoadGraph(profiles);
  const nodes = nodeMap(graph);
  const active = [];
  for (const vertical of profiles.x) {
    for (const horizontal of profiles.z) {
      if (roadsIntersect(vertical, horizontal)) active.push({ x: vertical.position, z: horizontal.position });
    }
  }

  assert.equal(graph.nodes.length, profiles.x.length * 2 + profiles.z.length * 2 + active.length);
  assert.equal(graph.edges.length, profiles.x.length + profiles.z.length + active.length * 2);
  for (const crossing of active) {
    const node = graph.nodes.find((candidate) => candidate.x === crossing.x && candidate.z === crossing.z);
    assert.ok(node, `missing graph node at ${crossing.x},${crossing.z}`);
    const approaches = graph.edges.filter((edge) => edge.a === node.id || edge.b === node.id);
    assert.equal(approaches.length, 4, `crossing ${node.id} must be split into four approaches`);
    const directions = new Set(approaches.map((edge) => {
      const other = nodes.get(edge.a === node.id ? edge.b : edge.a);
      return other.x === node.x ? (other.z < node.z ? "north" : "south") : (other.x < node.x ? "west" : "east");
    }));
    assert.deepEqual(directions, new Set(["north", "south", "west", "east"]));
  }
});

test("every imported road segment freezes the complete meter-valued source cross-section", () => {
  const profiles = getCityRoadProfiles(SETTINGS.roadWidth, SETTINGS.seed);
  const graph = collectRainHarborRoadGraph(profiles);
  const nodes = nodeMap(graph);
  for (const edge of graph.edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    const vertical = a.x === b.x;
    const source = vertical
      ? profiles.x.find((profile) => profile.position === a.x)
      : profiles.z.find((profile) => profile.position === a.z);
    assert.ok(source, `missing source profile for ${edge.id}`);
    assert.equal(edge.profile.source, "frozen-import");
    assert.deepEqual(edge.profile.crossSection, frozenCrossSectionFromCityRoadProfile(source));
    assert.equal(edge.profile.crossSection.lanesAToB, source.lanesPerDirection);
    assert.equal(edge.profile.crossSection.lanesBToA, source.lanesPerDirection);
    assert.equal(edge.profile.crossSection.left.bikeLaneWidth, source.bikeLaneWidth);
    assert.equal(edge.profile.crossSection.right.bikeBufferWidth, source.bufferWidth);
    assert.equal(edge.profile.crossSection.left.sidewalkWidth, source.sidewalkWidth);
  }
});

test("import height scales have exact defaults, accept overrides, and reject invalid values", () => {
  const defaults = importRainHarborDocument(SETTINGS);
  assert.deepEqual(defaults.flags, {
    needTrafficLights: true,
    lampHeightScale: 1.32,
    signalHeightScale: 1.25,
  });
  assert.ok(defaults.placements
    .filter((placement) => placement.catalogId === "street-light")
    .every((placement) => placement.heightScale === 1.32));

  const custom = importRainHarborDocument(SETTINGS, { lampHeightScale: 1.61, signalHeightScale: 1.44 });
  assert.equal(custom.flags.lampHeightScale, 1.61);
  assert.equal(custom.flags.signalHeightScale, 1.44);
  assert.ok(custom.placements
    .filter((placement) => placement.catalogId === "street-light")
    .every((placement) => placement.heightScale === 1.61));
  assert.ok(custom.placements
    .filter((placement) => placement.catalogId === "street-tree")
    .every((placement) => placement.heightScale === undefined));
  assert.throws(() => importRainHarborDocument(SETTINGS, { lampHeightScale: 0 }), /positive/);
  assert.throws(() => importRainHarborDocument(SETTINGS, { signalHeightScale: Number.NaN }), /positive/);
});

test("imported placements use only catalog or declared parametric IDs", () => {
  assert.ok(!CITY_CATALOG_IDS.includes(LEGACY_MASSING_CATALOG_ID), "massing stays outside template catalog");
  const knownIds = new Set(RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS);
  const document = importRainHarborDocument(SETTINGS);
  for (const placement of document.placements) {
    assert.ok(knownIds.has(placement.catalogId), `unknown import catalogId ${placement.catalogId}`);
  }
  const report = parseCityMapDocument(JSON.parse(JSON.stringify(document)), { knownCatalogIds: knownIds });
  assert.deepEqual(report.catalogMisses, []);
});

test("imported document survives JSON codec parsing without changing graph or placements", () => {
  const document = importRainHarborDocument(SETTINGS);
  const encoded = JSON.stringify(document);
  const report = parseCityMapDocument(JSON.parse(encoded), {
    knownCatalogIds: new Set(RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS),
  });
  assert.deepEqual(report.document, document);
  assert.equal(report.placementConflicts.length, 0);
});

test("pure collectors preserve legacy public counts, spawn, stops, and every massing matrix", () => {
  const collision = new CollisionWorld();
  const legacy = buildCityWorld(SETTINGS, collision);
  const document = importRainHarborDocument(SETTINGS);
  const massing = document.placements.filter((placement) => placement.poseKind === "legacy-massing");
  const lights = document.placements.filter((placement) => placement.catalogId === "street-light");
  const trees = document.placements.filter((placement) => placement.catalogId === "street-tree");
  assert.equal(massing.length, legacy.buildings);
  assert.equal(lights.length, legacy.streetLights);
  assert.equal(trees.length, legacy.streetTrees);

  const spawnIndex = Math.floor(legacy.roadPoints.length * 0.08);
  const spawnPoint = legacy.roadPoints[spawnIndex];
  const spawnNext = legacy.roadPoints[spawnIndex + 1] ?? spawnPoint;
  assert.deepEqual(document.spawn, {
    x: spawnPoint.x,
    z: spawnPoint.z,
    heading: Math.atan2(spawnNext.x - spawnPoint.x, spawnNext.z - spawnPoint.z),
  });
  assert.deepEqual(
    collectDeliveryStops(collectRainHarborRoute(), SETTINGS.deliveryStops, getCityRoadProfiles(SETTINGS.roadWidth, SETTINGS.seed)),
    legacy.stops,
  );

  const body = legacy.group.getObjectByName("city-building-bodies");
  const bodyIndex = legacy.group.children.indexOf(body);
  assert.ok(bodyIndex >= 0);
  const meshes = {
    body,
    plinth: legacy.group.children[bodyIndex + 1],
    roof: legacy.group.children[bodyIndex + 2],
    trim: legacy.group.children[bodyIndex + 3],
    door: legacy.group.children[bodyIndex + 4],
    awning: legacy.group.children[bodyIndex + 5],
    window: legacy.group.children[bodyIndex + 6],
  };
  const allParts = massing.flatMap((placement) => buildLegacyMassingBoxParts(placement));
  const actual = new THREE.Matrix4();
  for (const role of Object.keys(meshes)) {
    const expectedParts = allParts.filter((part) => part.role === role);
    const mesh = meshes[role];
    assert.equal(mesh.count, expectedParts.length, `${role} instance count`);
    expectedParts.forEach((part, index) => {
      mesh.getMatrixAt(index, actual);
      compareMatrix(actual, matrixForPart(part), `${role}[${index}]`);
    });
  }
  const actualColor = new THREE.Color();
  massing.forEach((placement, index) => {
    body.getColorAt(index, actualColor);
    assert.equal(actualColor.getHex(), placement.color, `body[${index}] color`);
  });

  const treeWood = legacy.group.getObjectByName("city-showroom-tree-wood");
  assert.equal(treeWood.count, trees.length);
  trees.forEach((placement, index) => {
    treeWood.getMatrixAt(index, actual);
    compareMatrix(actual, matrixForWorldPlacement(placement), `tree[${index}]`);
  });

  const lightPrototype = buildLowPolyStreetLight();
  lightPrototype.updateMatrixWorld(true);
  const sourceBase = lightPrototype.getObjectByName("street-light-base");
  const lightBase = legacy.group.getObjectByName("city-showroom-street-lights-street-light-base");
  const sourceInverse = sourceBase.matrixWorld.clone().invert();
  const expectedLight = new THREE.Matrix4();
  lights.forEach((placement, index) => {
    lightBase.getMatrixAt(index, actual);
    const object = new THREE.Object3D();
    object.position.set(placement.x, 0.24, placement.z);
    object.rotation.set(0, placement.yawRadians, 0);
    object.scale.set(placement.scale, placement.scale * placement.heightScale, placement.scale);
    object.updateMatrix();
    expectedLight.copy(actual).multiply(sourceInverse);
    compareMatrix(expectedLight, object.matrix, `light[${index}]`);
  });
});
