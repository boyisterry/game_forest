import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { buildLowPolyStandardResidentialCommunity } from "../app/lib/map/standardResidentialCommunity.ts";

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

test("builds a 1m-grid standard community with three compact rows on both sides", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  assert.equal(community.name, "city-standard-residential-community-lowpoly");
  assert.equal(community.userData.modelType, "standard-residential-community");
  assert.equal(community.userData.moduleGridMeters, 1);
  assert.deepEqual(community.userData.siteSize, new THREE.Vector3(160, 55, 140));
  assert.equal(community.userData.residentialBuildingCount, 12);
  assert.equal(community.userData.residentialBuildingTypeCount, 1);
  assert.equal(community.userData.householdCount, 120);
  assert.equal(community.userData.residentialRowCount, 3);
  assert.equal(community.userData.rowsPerSide, 3);
  assert.equal(community.userData.leftRowCount, 3);
  assert.equal(community.userData.rightRowCount, 3);
  assert.equal(community.userData.communityLayout, "left-right-central-road");
  assert.equal(community.userData.centralDividerRoadWidthMeters, 8);
  const buildings = community.children.filter((object) => object.name.startsWith("standard-community-residential-building-"));
  assert.equal(buildings.length, 12);
  for (const rowIndex of [0, 1, 2]) assert.equal(buildings.filter((building) => building.userData.rowIndex === rowIndex).length, 4);
  for (const side of ["left", "right"]) {
    const sideBuildings = buildings.filter((building) => building.userData.communitySide === side);
    assert.equal(sideBuildings.length, 6);
    assert.deepEqual([...new Set(sideBuildings.map((building) => building.userData.rowIndex))], [0, 1, 2]);
  }
  assert.ok(buildings.every((building) => building.userData.sourceModel === "city-residential-building-lowpoly"));
  assert.ok(buildings.every((building) => building.userData.frontDirection === "+z"));
  for (const rowIndex of [0, 1, 2]) {
    const row = buildings.filter((building) => building.userData.rowIndex === rowIndex).sort((left, right) => left.position.x - right.position.x);
    for (const side of ["left", "right"]) {
      const sideRow = row.filter((building) => building.userData.communitySide === side);
      for (let index = 1; index < sideRow.length; index += 1) {
        const clearance = bounds(sideRow[index]).min.x - bounds(sideRow[index - 1]).max.x;
        assert.ok(clearance >= 3.9 && clearance <= 4.1, `row ${rowIndex} ${side} clearance should be compact`);
      }
    }
    const leftEdge = bounds(row.filter((building) => building.userData.communitySide === "left").at(-1)).max.x;
    const rightEdge = bounds(row.find((building) => building.userData.communitySide === "right")).min.x;
    assert.ok(rightEdge - leftEdge >= 19.9 && rightEdge - leftEdge <= 20.1, "two residential halves need a readable central road corridor");
  }
  const centralRoad = community.getObjectByName("standard-community-main-arrival-road");
  assert.equal(centralRoad.userData.circulationRole, "central-residential-divider");
  assert.equal(centralRoad.userData.separatesLeftAndRightResidentialZones, true);
  assert.ok(buildings.filter((building) => building.userData.communitySide === "left").every((building) => bounds(building).max.x < bounds(centralRoad).min.x));
  assert.ok(buildings.filter((building) => building.userData.communitySide === "right").every((building) => bounds(building).min.x > bounds(centralRoad).max.x));
  const siteBounds = bounds(community);
  assert.ok(siteBounds.min.x >= -80 - 1e-6 && siteBounds.max.x <= 80 + 1e-6);
  assert.ok(siteBounds.min.z >= -70 - 1e-6 && siteBounds.max.z <= 70 + 1e-6);
  dispose(community);
});

test("reserves exactly thirty percent of the site as explicit non-overlapping greenery", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  const zones = named(community, "standard-community-landscape-zone");
  assert.equal(zones.length, 6);
  assert.equal(community.userData.greenAreaSquareMeters, 6_720);
  assert.equal(community.userData.greenCoverageRatio, 0.3);
  assert.equal(zones.reduce((sum, zone) => sum + zone.userData.areaSquareMeters, 0), 6_720);
  assert.ok(zones.every((zone) => zone.userData.countsTowardGreenCoverage));
  for (let left = 0; left < zones.length; left += 1) {
    for (let right = left + 1; right < zones.length; right += 1) {
      assert.equal(bounds(zones[left]).intersectsBox(bounds(zones[right])), false, `${zones[left].userData.landscapeZone} overlaps ${zones[right].userData.landscapeZone}`);
    }
  }
  assert.equal(community.userData.treeAnchorCount, 44);
  const trees = named(community, "standard-community-reused-tree-anchor");
  assert.equal(trees.length, 44);
  assert.equal(trees.filter((tree) => tree.userData.roadsideTree).length, 12);
  assert.ok(trees.filter((tree) => tree.userData.placementZone === "central-green").length >= 8);
  assert.ok(community.userData.decorationSources.includes("/models/forest/tree_normal_medium_redwood_a.glb"));
  dispose(community);
});

test("scales the left and right residential plans from three to six rows on the 1m grid", () => {
  for (const rowsPerSide of [3, 4, 5, 6]) {
    const community = buildLowPolyStandardResidentialCommunity({ rowsPerSide });
    const expectedDepth = 140 + (rowsPerSide - 3) * 36;
    const buildings = community.children.filter((object) => object.name.startsWith("standard-community-residential-building-"));
    assert.deepEqual(community.userData.siteSize, new THREE.Vector3(160, 55, expectedDepth));
    assert.equal(community.userData.rowsPerSide, rowsPerSide);
    assert.equal(community.userData.residentialBuildingCount, rowsPerSide * 4);
    assert.equal(community.userData.householdCount, rowsPerSide * 40);
    assert.equal(community.userData.parkingRowCount, rowsPerSide);
    assert.equal(community.userData.greenAreaSquareMeters, 160 * expectedDepth * 0.3);
    assert.equal(community.userData.greenCoverageRatio, 0.3);
    for (const side of ["left", "right"]) {
      const sideBuildings = buildings.filter((building) => building.userData.communitySide === side);
      assert.equal(sideBuildings.length, rowsPerSide * 2);
      assert.equal(new Set(sideBuildings.map((building) => building.userData.rowIndex)).size, rowsPerSide);
    }
    const siteBounds = bounds(community.getObjectByName("standard-community-site-base"));
    assert.equal(siteBounds.getSize(new THREE.Vector3()).z, expectedDepth);
    let visibleMeshes = 0;
    let shadowCasters = 0;
    community.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      visibleMeshes += 1;
      if (object.castShadow) shadowCasters += 1;
    });
    assert.ok(visibleMeshes <= 280, `${rowsPerSide}-row layout exceeded its scalable mesh budget`);
    assert.ok(shadowCasters <= 100, `${rowsPerSide}-row layout exceeded its shadow budget`);
    assert.equal(community.userData.renderBatchCount, 68);
    dispose(community);
  }
  assert.throws(() => buildLowPolyStandardResidentialCommunity({ rowsPerSide: 2 }), /3-6/);
  assert.throws(() => buildLowPolyStandardResidentialCommunity({ rowsPerSide: 7 }), /3-6/);
});

test("gives every residential row its own roadside ground-parking layby", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  const laybys = named(community, "standard-community-ground-parking-layby");
  const spaces = named(community, "standard-community-ground-parking-space");
  const vehicles = named(community, "standard-community-parked-private-vehicle");
  assert.equal(community.userData.parkingRowCount, 3);
  assert.equal(community.userData.parkingLaybyCount, 6);
  assert.equal(laybys.length, 6);
  assert.equal(spaces.length, community.userData.parkingSpaceCount);
  assert.equal(spaces.length, 60);
  for (const rowIndex of [0, 1, 2]) {
    const rowLaybys = laybys.filter((layby) => layby.userData.rowIndex === rowIndex);
    assert.equal(rowLaybys.length, 2);
    assert.deepEqual(rowLaybys.map((layby) => layby.userData.communitySide).sort(), ["left", "right"]);
    assert.ok(spaces.filter((space) => space.userData.rowIndex === rowIndex).length >= 16);
    assert.ok(vehicles.filter((vehicle) => vehicle.userData.parkingRowIndex === rowIndex).length >= 2);
  }
  assert.equal(vehicles.length, community.userData.parkedVehicleCount);
  assert.ok(spaces.every((space) => space.userData.parkingType === "ground"));
  const centralRoad = community.getObjectByName("standard-community-main-arrival-road");
  assert.ok(laybys.every((layby) => !bounds(layby).intersectsBox(bounds(centralRoad))));
  dispose(community);
});

test("keeps row roads, parking and the outdoor fitness garden clear of apartment buildings", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  const buildings = community.children.filter((object) => object.name.startsWith("standard-community-residential-building-"));
  const circulation = [
    ...named(community, "standard-community-residential-row-road"),
    ...named(community, "standard-community-ground-parking-layby"),
    community.getObjectByName("standard-community-outdoor-fitness-zone"),
  ];
  for (const building of buildings) {
    for (const object of circulation) assert.equal(bounds(building).intersectsBox(bounds(object)), false, `${building.name} overlaps ${object.name}`);
  }
  const fitness = community.getObjectByName("standard-community-outdoor-fitness-zone");
  const equipment = named(fitness, "standard-community-fitness-equipment");
  assert.equal(equipment.length, 7);
  assert.equal(community.userData.fitnessEquipmentCount, 7);
  assert.equal(community.userData.fitnessZoneSide, "left");
  assert.ok(equipment.every((item) => item.userData.groundSupported));
  assert.equal(fitness.userData.placementZone, "dedicated-west-fitness-garden");
  assert.equal(fitness.userData.dedicatedPocket, true);
  assert.equal(fitness.userData.separatedFromCentralRoad, true);
  assert.equal(fitness.userData.insideResidentialBoundary, true);
  assert.ok(fitness.position.x < -20 && Math.abs(fitness.position.z) < 40);
  assert.equal(named(fitness, "standard-community-fitness-pocket-boundary").length, 5);
  assert.ok(fitness.getObjectByName("standard-community-fitness-pocket-sign"));
  const centralRoad = community.getObjectByName("standard-community-main-arrival-road");
  assert.equal(bounds(fitness).intersectsBox(bounds(centralRoad)), false);
  dispose(community);
});

test("reuses the standard gate, street lights and switchable residential night lighting", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  const gate = community.getObjectByName("standard-community-main-gate");
  const lights = named(community, "city-street-light-lowpoly");
  assert.ok(gate);
  assert.equal(gate.userData.gateVariant, "standard");
  assert.equal(lights.length, 28);
  assert.equal(community.userData.streetLightCount, 28);
  assert.equal(gate.userData.gateOpen, false);
  community.userData.setAccessGateOpen(true);
  assert.equal(gate.userData.gateOpen, true);
  community.userData.setAccessGateOpen(false);
  assert.equal(gate.userData.gateOpen, false);
  community.userData.setPowered(true);
  assert.ok(lights.every((light) => light.userData.powered));
  assert.equal(gate.userData.powered, true);
  community.userData.setPowered(false);
  assert.ok(lights.every((light) => !light.userData.powered));
  assert.equal(gate.userData.powered, false);
  dispose(community);
});

test("batches repeated buildings, vehicles and static details for future community families", () => {
  const community = buildLowPolyStandardResidentialCommunity();
  let visibleMeshes = 0;
  let shadowCasters = 0;
  let instancedMeshes = 0;
  let visibleLights = 0;
  community.traverse((object) => {
    if (object instanceof THREE.Light && object.visible) visibleLights += 1;
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    visibleMeshes += 1;
    if (object.castShadow) shadowCasters += 1;
    if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
  });
  assert.ok(community.userData.unbatchedSourceMeshCount >= 1_500);
  assert.ok(community.userData.renderBatchCount <= 70);
  assert.ok(instancedMeshes >= 40);
  assert.ok(visibleMeshes <= 250, `visible mesh budget regressed to ${visibleMeshes}`);
  assert.ok(shadowCasters <= 100, `shadow caster budget regressed to ${shadowCasters}`);
  assert.equal(visibleLights, 0, "day mode must not submit zero-intensity point lights");
  community.userData.setPowered(true);
  visibleLights = 0;
  community.traverse((object) => {
    if (object instanceof THREE.Light && object.visible) visibleLights += 1;
  });
  assert.ok(visibleLights > 0 && visibleLights <= 16, `night light pool regressed to ${visibleLights}`);
  dispose(community);
});
