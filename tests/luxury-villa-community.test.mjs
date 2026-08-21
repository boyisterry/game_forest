import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";

import { buildLowPolyLuxuryVillaCommunity } from "../app/lib/map/luxuryVillaCommunity.ts";
import { getCatalogEntry } from "../app/lib/map/cityCatalog.ts";
import { getDefaultCatalogSource } from "../app/lib/map/cityCatalogSources.ts";

function named(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

function bounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => material.dispose?.());
  });
}

function villas(root) {
  return root.children.filter((object) => /^luxury-villa-community-villa-[a-e][1-3]$/.test(object.name));
}

function roadEdgeClearance(object, road) {
  const point = object.getWorldPosition(new THREE.Vector3());
  const objectBounds = bounds(object);
  const radius = Math.max(...[
    [objectBounds.min.x, objectBounds.min.z],
    [objectBounds.min.x, objectBounds.max.z],
    [objectBounds.max.x, objectBounds.min.z],
    [objectBounds.max.x, objectBounds.max.z],
  ].map(([x, z]) => Math.hypot(x - point.x, z - point.z)));
  const centreDistance = Math.min(...road.userData.centrelinePoints.map(({ x, z }) => Math.hypot(point.x - x, point.z - z)));
  return centreDistance - road.userData.widthMeters * 0.5 - radius;
}

test("builds fifteen courtyard villas in five organic clusters on the 1m map grid", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  assert.equal(community.name, "city-luxury-villa-community-lowpoly");
  assert.equal(community.userData.moduleGridMeters, 1);
  assert.deepEqual(community.userData.siteSize, new THREE.Vector3(260, 32, 200));
  assert.equal(community.userData.villaCount, 15);
  assert.equal(community.userData.householdCount, 15);
  assert.equal(community.userData.villaClusterCount, 5);
  assert.equal(community.userData.roadNetworkType, "continuous-organic-scenic-loop");
  const villaObjects = villas(community);
  assert.equal(villaObjects.length, 15);
  assert.equal(new Set(villaObjects.map((villa) => villa.userData.communityCluster)).size, 5);
  assert.ok(villaObjects.every((villa) => villa.userData.detachedVilla && villa.userData.frontCourtyard));
  assert.ok(villaObjects.every((villa) => villa.userData.sourceModel === "city-small-villa-lowpoly"));
  assert.equal(named(community, "small-villa-foundation").length, 15);
  assert.equal(named(community, "luxury-villa-community-private-garden").length, 15);
  assert.equal(named(community, "luxury-villa-community-private-driveway").length, 15);
  const courtyards = named(community, "luxury-villa-community-front-courtyard");
  assert.equal(courtyards.length, 15);
  assert.equal(community.userData.privateFrontCourtyardCount, 15);
  assert.ok(courtyards.every((courtyard) => courtyard.userData.widthMeters === 10 && courtyard.userData.depthMeters === 6));
  assert.equal(named(community, "luxury-villa-community-front-courtyard-gate-post").length, 30);
  assert.equal(named(community, "luxury-villa-community-front-courtyard-planter").length, 30);
  dispose(community);
});

test("reserves exactly eighty percent for continuous planted and water scenery", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  assert.equal(community.userData.greenAndSceneryCoverageRatio, 0.8);
  assert.equal(community.userData.plantedGreenCoverageRatio, 0.68);
  assert.equal(community.userData.waterLandscapeCoverageRatio, 0.12);
  assert.equal(community.userData.environmentalLandscapeAreaSquareMeters, 41_600);
  const zones = named(community, "luxury-villa-community-environment-zone");
  assert.equal(zones.length, 4);
  assert.equal(zones.reduce((sum, zone) => sum + zone.userData.areaSquareMeters, 0), 41_600);
  assert.ok(zones.every((zone) => zone.userData.countsTowardLandscapeCoverage));
  assert.ok(community.getObjectByName("luxury-villa-community-perimeter-woodland-belt"));
  assert.ok(community.getObjectByName("luxury-villa-community-ecological-park-meadow"));
  assert.equal(community.userData.treeAnchorCount, 96);
  assert.equal(named(community, "luxury-villa-community-reused-tree-anchor").length, 96);
  assert.equal(named(community, "luxury-villa-community-layered-shrub").length, 42);
  assert.equal(named(community, "luxury-villa-community-flower-cluster").length, 18);
  assert.ok(community.userData.decorationSources.includes("/models/forest/tree_normal_medium_redwood_a.glb"));
  dispose(community);
});

test("builds a continuous curved scenic loop instead of a rectilinear street grid", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  const loop = community.getObjectByName("luxury-villa-community-scenic-loop-road");
  const road = community.getObjectByName("luxury-villa-community-residential-lane");
  assert.ok(loop && road);
  assert.equal(loop.userData.continuousLoop, true);
  assert.equal(loop.userData.organicCurve, true);
  assert.equal(loop.userData.rightAngleJunctionCount, 0);
  assert.equal(road.userData.continuousLoop, true);
  assert.equal(road.userData.lowSpeedKilometresPerHour, 15);
  assert.ok(road.userData.centrelinePoints.length >= 100);
  assert.equal(named(community, "luxury-villa-community-villa-access-spur").length, 0);
  dispose(community);
});

test("builds a meandering water valley with three protected bridges and an entry rockery", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  const stream = community.getObjectByName("luxury-villa-community-meandering-stream");
  const lake = community.getObjectByName("luxury-villa-community-central-lake");
  const bridges = named(community, "luxury-villa-community-landscape-bridge");
  const rockery = community.getObjectByName("luxury-villa-community-artistic-rockery");
  assert.ok(stream && lake && rockery);
  assert.equal(community.userData.waterFeatureCount, 2);
  assert.equal(bridges.length, 3);
  assert.equal(community.userData.bridgeCount, 3);
  assert.ok(bridges.every((bridge) => bridge.userData.crossesWater && bridge.userData.barrierFree));
  assert.ok(bridges.every((bridge) => named(bridge, "luxury-villa-community-bridge-rail-post").length >= 18));
  assert.equal(rockery.userData.entryLandscape, true);
  assert.ok(named(rockery, "luxury-villa-community-rockery-stone").length >= 8);
  const falls = named(rockery, "luxury-villa-community-rockery-waterfall");
  assert.equal(falls.length, 3);
  const before = falls.map((fall) => fall.scale.y);
  community.userData.update(0.25);
  assert.notDeepEqual(falls.map((fall) => fall.scale.y), before);
  dispose(community);
});

test("places tennis and outdoor recreation together inside the central ecological park", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  const park = community.getObjectByName("luxury-villa-community-central-ecological-park");
  const tennis = community.getObjectByName("luxury-villa-community-tennis-zone");
  const recreation = community.getObjectByName("luxury-villa-community-outdoor-recreation-zone");
  assert.ok(park && tennis && recreation);
  assert.equal(community.userData.centralEcologicalPark, true);
  assert.equal(tennis.parent, park);
  assert.equal(recreation.parent, park);
  assert.equal(tennis.userData.insideCentralEcologicalPark, true);
  assert.equal(recreation.userData.insideCentralEcologicalPark, true);
  assert.ok(park.getObjectByName("luxury-villa-community-eco-trail"));
  assert.equal(named(tennis, "luxury-villa-community-tennis-net-post").length, 2);
  assert.ok(named(tennis, "luxury-villa-community-tennis-fence-post").length >= 40);
  assert.equal(named(tennis, "luxury-villa-community-tennis-fence-rail").length, 12);
  assert.equal(named(recreation, "luxury-villa-community-entertainment-canopy-post").length, 4);
  assert.equal(named(recreation, "luxury-villa-community-recreation-bench-leg").length, 6);
  dispose(community);
});

test("keeps every villa, front courtyard and central amenity clear of the curved road", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  const road = community.getObjectByName("luxury-villa-community-residential-lane");
  assert.ok(road);
  assert.ok(villas(community).every((villa) => roadEdgeClearance(villa, road) >= 4));
  assert.ok(named(community, "luxury-villa-community-front-courtyard").every((courtyard) => roadEdgeClearance(courtyard, road) >= 3));
  for (const amenityName of [
    "luxury-villa-community-tennis-zone",
    "luxury-villa-community-outdoor-recreation-zone",
    "luxury-villa-community-artistic-rockery",
  ]) {
    assert.ok(roadEdgeClearance(community.getObjectByName(amenityName), road) >= 2);
  }
  const trees = named(community, "luxury-villa-community-reused-tree-anchor");
  for (const tree of trees) {
    const point = tree.getWorldPosition(new THREE.Vector3());
    const centreDistance = Math.min(...road.userData.centrelinePoints.map(({ x, z }) => Math.hypot(point.x - x, point.z - z)));
    assert.ok(centreDistance >= 6.7);
  }
  dispose(community);
});

test("reuses detailed city furniture while staying inside a bounded render budget", () => {
  const community = buildLowPolyLuxuryVillaCommunity();
  const gate = community.getObjectByName("luxury-villa-community-main-gate");
  assert.ok(gate);
  assert.equal(gate.userData.gateVariant, "villa");
  assert.equal(community.userData.streetLightCount, 18);
  assert.equal(named(community, "city-street-light-lowpoly").length, 18);
  assert.equal(gate.userData.gateOpen, false);
  community.userData.setAccessGateOpen(true);
  assert.equal(gate.userData.gateOpen, true);
  community.userData.setPowered(true);
  assert.ok(named(community, "luxury-villa-community-pooled-night-light").every((light) => light.visible && light.intensity > 0));
  community.userData.setPowered(false);
  assert.ok(named(community, "luxury-villa-community-pooled-night-light").every((light) => !light.visible && light.intensity === 0));
  let visibleMeshes = 0;
  let shadowCasters = 0;
  community.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    visibleMeshes += 1;
    if (object.castShadow) shadowCasters += 1;
  });
  assert.ok(community.userData.renderBatchCount <= 60);
  assert.ok(visibleMeshes <= 250, `visible mesh budget regressed to ${visibleMeshes}`);
  assert.ok(shadowCasters <= 100, `shadow budget regressed to ${shadowCasters}`);
  dispose(community);
});

test("exposes the expanded luxury villa scene from the catalog and dedicated demo", async () => {
  const entry = getCatalogEntry("luxury-villa-community");
  assert.ok(entry);
  assert.deepEqual(entry.siteSizeMeters, { x: 260, z: 200 });
  const adapter = getDefaultCatalogSource(entry.source);
  const owned = adapter?.build();
  assert.equal(owned?.userData.modelType, "luxury-villa-community");
  dispose(owned);
  const demoSource = await readFile(new URL("../app/demos/luxury-villa-community/LuxuryVillaCommunityDemo.tsx", import.meta.url), "utf8");
  assert.match(demoSource, /buildLowPolyLuxuryVillaCommunity/);
  assert.match(demoSource, /createSceneShatterPair/);
  assert.match(demoSource, /createInstancedPrototypeBatch/);
  assert.match(demoSource, /15栋/);
  assert.match(demoSource, /连续曲线景观环路/);
  assert.match(demoSource, /80%/);
  assert.match(demoSource, /中央生态园/);
  assert.match(demoSource, /小兔子骑车/);
});
