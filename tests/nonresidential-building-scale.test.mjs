import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CITY_CATALOG, getCatalogEntry } from "../app/lib/map/cityCatalog.ts";
import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import { buildLowPolyOfficeCampus } from "../app/lib/map/cityFurniture.ts";
import { buildLowPolyHospitalCampus } from "../app/lib/map/hospitalCampus.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";
import { buildLowPolyShoppingMall, SHOPPING_MALL_SCALE } from "../app/lib/map/shoppingMall.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";
import { buildLowPolyCityCenter } from "../app/lib/map/cityCenter.ts";
import { buildLowPolyTownCenter } from "../app/lib/map/townCenter.ts";
import {
  buildLowPolyFoodProcessingPlant,
  buildLowPolyMechanizedFactory,
  buildLowPolyTechnologyPark,
} from "../app/lib/map/modernIndustrialDistricts.ts";

const NON_RESIDENTIAL_IDS = [
  "office-campus",
  "hospital-campus",
  "amusement-park",
  "school-campus",
  "shopping-mall",
  "technology-park",
  "food-processing-plant",
  "mechanized-factory",
  "fire-station",
  "city-park",
  "sports-center",
  "city-center",
  "town-center",
];

function worldSize(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

test("every non-residential building district uses its declared metre-scale site envelope", () => {
  const adapters = new Map(DEFAULT_CATALOG_FACTORY_ADAPTERS.map((adapter) => [adapter.factoryId, adapter]));
  assert.deepEqual(
    CITY_CATALOG.filter((entry) => NON_RESIDENTIAL_IDS.includes(entry.id)).map((entry) => entry.id),
    NON_RESIDENTIAL_IDS,
  );

  for (const id of NON_RESIDENTIAL_IDS) {
    const entry = getCatalogEntry(id);
    assert.equal(entry.source.kind, "factory");
    const source = adapters.get(entry.source.factoryId).build({ optimizeStatic: false });
    source.scale.multiplyScalar(entry.mapScale);
    const size = worldSize(source);
    const reserved = entry.footprintOverride ?? {
      w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
      d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
    };

    assert.ok(size.x <= reserved.w + 0.01, `${id} width ${size.x} exceeds ${reserved.w} m reservation`);
    assert.ok(size.z <= reserved.d + 0.01, `${id} depth ${size.z} exceeds ${reserved.d} m reservation`);
    assert.ok(size.y >= 8, `${id} is implausibly short beside a 1.7-1.8 m rider`);
    assert.ok(Math.abs(source.userData.siteSize.x - entry.siteSizeMeters.x * entry.mapScale) < 1e-6, `${id} site width metadata drifted`);
    assert.ok(Math.abs(source.userData.siteSize.z - entry.siteSizeMeters.z * entry.mapScale) < 1e-6, `${id} site depth metadata drifted`);
    disposeTree(source);
  }
});

test("public and service buildings keep human doors independent from floor and campus scale", () => {
  const office = buildLowPolyOfficeCampus();
  assert.equal(getCatalogEntry("office-campus").mapScale, 1);
  assert.equal(office.userData.floorPitchMeters, 3.6);
  assert.equal(office.getObjectByName("office-campus-entrance-door").geometry.parameters.height, 2.15);
  assert.equal(office.getObjectByName("office-campus-elevator-door").geometry.parameters.height, 2.2);
  assert.ok(worldSize(office).y > 23);

  const hospital = buildLowPolyHospitalCampus();
  assert.equal(hospital.userData.floorPitchMeters, 4.2);
  for (const name of ["hospital-outpatient-building", "hospital-emergency-building", "hospital-inpatient-building"]) {
    const building = hospital.getObjectByName(name);
    assert.equal(building.scale.x, 1, `${name} must not resize its doors and furniture`);
    assert.equal(building.userData.floorPitchMeters, 4.2);
  }
  for (const [name, height] of [
    ["hospital-main-entrance-door", 2.15],
    ["hospital-emergency-entrance-door", 2.22],
    ["hospital-inpatient-entrance-door", 2.1],
  ]) assert.equal(hospital.getObjectByName(name).geometry.parameters.height, height);

  const school = buildLowPolySchoolCampus({ optimizeStatic: false });
  for (const name of [
    "school-teaching-building-a",
    "school-teaching-building-b",
    "school-laboratory-building",
    "school-administration-building",
    "school-student-dormitory-a",
    "school-student-dormitory-b",
  ]) assert.equal(school.getObjectByName(name).userData.floorPitchMeters, 3.35, name);

  const mall = buildLowPolyShoppingMall({ optimizeStatic: false });
  assert.ok(4.25 * SHOPPING_MALL_SCALE >= 4.5 && 4.25 * SHOPPING_MALL_SCALE <= 5.1);
  assert.equal(worldSize(mall).x, 184);

  const fireStation = buildLowPolyFireStation({ optimizeStatic: false });
  assert.equal(fireStation.getObjectByName("fire-station-living-quarters").userData.floorPitchMeters, 3.45);

  [office, hospital, school, mall, fireStation].forEach(disposeTree);
});

test("civic towers, town buildings and industrial halls remain full-size facilities", () => {
  const center = buildLowPolyCityCenter({ optimizeStatic: false });
  const landmark = center.getObjectByName("city-center-landmark-tower");
  assert.equal(landmark.userData.floorCount, 16);
  assert.equal(landmark.userData.heightMeters / landmark.userData.floorCount, 4);

  const town = buildLowPolyTownCenter({ optimizeStatic: false });
  const townHall = town.getObjectByName("town-center-town-hall");
  assert.equal(townHall.userData.floorCount, 3);
  assert.ok(worldSize(townHall).y >= 12);

  for (const build of [buildLowPolyTechnologyPark, buildLowPolyFoodProcessingPlant, buildLowPolyMechanizedFactory]) {
    const district = build({ optimizeStatic: false });
    const buildings = [];
    district.traverse((object) => {
      if (object.userData.modernIndustrialBuilding) buildings.push(object);
    });
    assert.ok(buildings.length >= 2);
    assert.ok(buildings.every((building) => building.userData.clearInteriorHeightMeters >= 8));
    assert.ok(buildings.every((building) => building.userData.heightMeters >= 10));
    assert.ok(buildings.every((building) => building.userData.buildingSizeMeters.x >= 42));
    assert.ok(buildings.every((building) => building.userData.buildingSizeMeters.z >= 32));
    disposeTree(district);
  }

  disposeTree(center);
  disposeTree(town);
});
