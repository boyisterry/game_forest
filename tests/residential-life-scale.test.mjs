import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { getCatalogEntry } from "../app/lib/map/cityCatalog.ts";
import {
  buildLowPolyHighRiseResidential,
  buildLowPolyResidentialBuilding,
  buildLowPolySmallVilla,
} from "../app/lib/map/cityFurniture.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";
import { buildLowPolyLuxuryVillaCommunity } from "../app/lib/map/luxuryVillaCommunity.ts";
import { buildLowPolyResidentialCommunity } from "../app/lib/map/residentialCommunity.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";
import { buildLowPolyStandardResidentialCommunity } from "../app/lib/map/standardResidentialCommunity.ts";

function boundsSize(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => material.dispose?.());
  });
}

test("keeps every standalone home on one real-world rider scale", () => {
  const apartment = buildLowPolyResidentialBuilding();
  const tower = buildLowPolyHighRiseResidential();
  const villa = buildLowPolySmallVilla();

  const apartmentSize = boundsSize(apartment);
  assert.ok(apartmentSize.x >= 30, "two-home frontage must remain at least 30 m");
  assert.equal(apartment.userData.floorPitchMeters, 4);
  assert.equal(apartment.userData.apartmentCount, apartment.userData.floorCount * 2);
  assert.equal(apartment.getObjectByName("residential-building-entrance").geometry.parameters.height, 2.18);

  const towerSize = boundsSize(tower);
  assert.ok(towerSize.x >= 30 && towerSize.z >= 20);
  assert.equal(tower.userData.floorPitchMeters, 4);
  assert.equal(tower.userData.apartmentCount, tower.userData.floorCount * 4);

  const villaEntry = getCatalogEntry("small-villa");
  villa.scale.setScalar(villaEntry.mapScale);
  const mappedVillaSize = boundsSize(villa);
  assert.ok(mappedVillaSize.x >= 9.9 && mappedVillaSize.z >= 10.4);
  assert.ok(villa.userData.floorPitchMeters * villaEntry.mapScale >= 3.3);
  const mappedDoorHeight = villa.getObjectByName("small-villa-front-door").geometry.parameters.height * villaEntry.mapScale;
  assert.ok(mappedDoorHeight >= 2.4 && mappedDoorHeight <= 2.5);

  dispose(apartment);
  dispose(tower);
  dispose(villa);
});

test("keeps every residential zone free of miniature instance scaling", () => {
  for (const rowsPerSide of [3, 4, 5, 6]) {
    const standard = buildLowPolyStandardResidentialCommunity({ rowsPerSide });
    const homes = standard.children.filter((child) => child.name.startsWith("standard-community-residential-building-"));
    assert.ok(homes.every((home) => home.scale.equals(new THREE.Vector3(1, 1, 1))));
    assert.ok(homes.every((home) => home.userData.floorPitchMeters === 4));
    assert.ok(homes.every((home) => boundsSize(home).x >= 30));
    assert.equal(standard.userData.householdCount, homes.length * 10);
    dispose(standard);
  }

  const complete = buildLowPolyResidentialCommunity();
  const completeHomes = complete.children.filter((child) => /^residential-community-(?:high-rise|mid-rise)-\d+$/.test(child.name));
  assert.equal(completeHomes.length, 8);
  assert.ok(completeHomes.every((home) => home.scale.equals(new THREE.Vector3(1, 1, 1))));
  assert.ok(completeHomes.every((home) => home.userData.floorPitchMeters === 4));
  assert.equal(complete.userData.householdCount, 4 * 72 + 4 * 10);
  dispose(complete);

  const luxury = buildLowPolyLuxuryVillaCommunity();
  const villas = luxury.children.filter((child) => /^luxury-villa-community-villa-[a-e][1-3]$/.test(child.name));
  assert.equal(villas.length, 15);
  assert.ok(villas.every((villa) => villa.scale.equals(new THREE.Vector3(1.35, 1.35, 1.35))));
  assert.ok(villas.every((villa) => villa.userData.floorPitchMeters * villa.scale.y >= 3.7));
  assert.ok(villas.every((villa) => boundsSize(villa).x >= 11 || boundsSize(villa).z >= 11));
  dispose(luxury);
});

test("keeps institutional sleeping buildings at full human scale", () => {
  const school = buildLowPolySchoolCampus();
  for (const name of ["school-student-dormitory-a", "school-student-dormitory-b"]) {
    const dormitory = school.getObjectByName(name);
    assert.equal(dormitory.userData.floorPitchMeters, 3.35);
    assert.ok(dormitory.userData.buildingSizeMeters.x >= 28);
    assert.equal(dormitory.userData.buildingSizeMeters.z, 13);
  }
  dispose(school);

  const fireStation = buildLowPolyFireStation();
  const living = fireStation.getObjectByName("fire-station-living-quarters");
  assert.equal(living.userData.floorPitchMeters, 3.45);
  assert.equal(living.userData.buildingSizeMeters.x, 48);
  assert.ok(Math.abs(living.userData.buildingSizeMeters.y - 10.35) < 1e-9);
  assert.equal(living.userData.buildingSizeMeters.z, 20);
  dispose(fireStation);
});
