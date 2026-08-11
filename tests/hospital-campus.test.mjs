import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyHospitalCampus } from "../app/lib/map/hospitalCampus.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

test("generates a complete three-zone hospital campus with independent entrances", () => {
  const hospital = buildLowPolyHospitalCampus();
  assert.equal(hospital.name, "city-hospital-campus-lowpoly");
  assert.equal(hospital.userData.generatedLocally, true);
  assert.deepEqual(hospital.userData.zones, ["outpatient", "emergency", "inpatient"]);
  assert.equal(hospital.userData.buildingCount, 3);
  assert.deepEqual(hospital.userData.floorCounts, { outpatient: 3, emergency: 2, inpatient: 6 });
  assert.equal(namedObjects(hospital, "hospital-zone-floor-slab").length, 11);
  assert.equal(namedObjects(hospital, "hospital-campus-internal-road").length, 4);
  assert.equal(namedObjects(hospital, "hospital-campus-pedestrian-walkway").length, 5);
  assert.equal(namedObjects(hospital, "hospital-campus-covered-walkway").length, 3);
  assert.ok(hospital.getObjectByName("hospital-main-entrance-canopy"));
  assert.ok(hospital.getObjectByName("hospital-emergency-entrance-canopy"));
  assert.ok(hospital.getObjectByName("hospital-inpatient-entrance-canopy"));
  assert.ok(hospital.getObjectByName("hospital-emergency-cross-sign"));

  const buildings = [
    hospital.getObjectByName("hospital-outpatient-building"),
    hospital.getObjectByName("hospital-emergency-building"),
    hospital.getObjectByName("hospital-inpatient-building"),
  ];
  assert.ok(buildings.every(Boolean));
  const bounds = buildings.map((building) => new THREE.Box3().setFromObject(building));
  assert.equal(bounds[0].intersectsBox(bounds[1]), false);
  assert.equal(bounds[0].intersectsBox(bounds[2]), false);
  assert.equal(bounds[1].intersectsBox(bounds[2]), false);

  const roadBounds = namedObjects(hospital, "hospital-campus-internal-road").map((road) => new THREE.Box3().setFromObject(road));
  const foundationBounds = namedObjects(hospital, "hospital-zone-foundation").map((foundation) => new THREE.Box3().setFromObject(foundation));
  roadBounds.forEach((road) => foundationBounds.forEach((foundation) => assert.equal(road.intersectsBox(foundation), false)));
});

test("closes every facade around solid glazed windows", () => {
  const hospital = buildLowPolyHospitalCampus();
  const windows = namedObjects(hospital, "hospital-zone-window");
  const frames = namedObjects(hospital, "hospital-zone-window-frame");
  const sills = namedObjects(hospital, "hospital-zone-front-sill");
  const heads = namedObjects(hospital, "hospital-zone-front-head");
  assert.ok(windows.length > 40);
  assert.ok(frames.length > windows.length);
  assert.equal(sills.length, 11);
  assert.equal(heads.length, 11);
  windows.forEach((window) => {
    assert.equal(window.material.transparent, false);
    assert.ok(window.geometry.parameters.width > 0);
    assert.ok(window.geometry.parameters.height > 0);
  });
});

test("builds detailed outpatient, emergency and inpatient interiors", () => {
  const hospital = buildLowPolyHospitalCampus();
  assert.equal(hospital.userData.consultRoomCount, 6);
  assert.equal(hospital.userData.emergencyBayCount, 4);
  assert.equal(hospital.userData.inpatientRoomCount, 12);
  assert.equal(hospital.userData.inpatientBedCount, 12);
  assert.equal(hospital.userData.elevatorCount, 2);

  assert.equal(namedObjects(hospital, "hospital-outpatient-waiting-chair").length, 12);
  assert.equal(namedObjects(hospital, "hospital-outpatient-consult-room").length, 6);
  assert.equal(namedObjects(hospital, "hospital-outpatient-exam-couch").length, 6);
  assert.ok(hospital.getObjectByName("hospital-outpatient-registration-desk"));
  assert.ok(hospital.getObjectByName("hospital-outpatient-pharmacy-counter"));

  assert.equal(namedObjects(hospital, "hospital-emergency-treatment-bed").length, 3);
  assert.ok(hospital.getObjectByName("hospital-emergency-triage-desk"));
  assert.ok(hospital.getObjectByName("hospital-emergency-resus-bed"));
  assert.ok(hospital.getObjectByName("hospital-emergency-imaging-scanner"));
  const ambulance = hospital.getObjectByName("hospital-emergency-ambulance");
  const emergencyBuilding = hospital.getObjectByName("hospital-emergency-building");
  assert.ok(ambulance);
  assert.ok(emergencyBuilding);
  assert.ok(hospital.getObjectByName("hospital-emergency-ambulance-bay"));
  assert.equal(namedObjects(hospital, "hospital-ambulance-wheel").length, 4);
  assert.equal(namedObjects(hospital, "hospital-ambulance-bay-line").length, 4);
  assert.equal(namedObjects(hospital, "hospital-ambulance-bay-cross").length, 2);
  assert.ok(ambulance.position.x > emergencyBuilding.position.x);
  assert.equal(ambulance.rotation.y, -Math.PI * 0.5);
  assert.equal(
    new THREE.Box3().setFromObject(ambulance).intersectsBox(new THREE.Box3().setFromObject(emergencyBuilding)),
    false,
  );

  assert.equal(namedObjects(hospital, "hospital-inpatient-nurse-station").length, 6);
  assert.equal(namedObjects(hospital, "hospital-inpatient-bed").length, 12);
  assert.equal(namedObjects(hospital, "hospital-inpatient-elevator-door").length, 12);
  assert.equal(namedObjects(hospital, "hospital-inpatient-stair-step").length, 35);
  assert.ok(hospital.getObjectByName("hospital-roof-helipad"));
  assert.ok(hospital.getObjectByName("hospital-healing-garden"));
  assert.equal(namedObjects(hospital, "hospital-service-oxygen-tank").length, 2);
});

test("supports an interior cutaway and powered night state", () => {
  const hospital = buildLowPolyHospitalCampus();
  const window = hospital.getObjectByName("hospital-zone-window");
  const entrance = hospital.getObjectByName("hospital-main-entrance-door");
  const nightLights = namedObjects(hospital, "hospital-campus-night-light");
  assert.ok(window instanceof THREE.Mesh);
  assert.ok(entrance instanceof THREE.Mesh);
  assert.equal(nightLights.length, 3);

  hospital.userData.setInteriorCutaway(true);
  assert.equal(window.visible, false);
  assert.equal(entrance.visible, false);
  hospital.userData.setInteriorCutaway(false);
  assert.equal(window.visible, true);
  assert.equal(entrance.visible, true);

  hospital.userData.setPowered(true);
  assert.ok(window.material.emissiveIntensity > 2);
  assert.ok(nightLights.every((light) => light.intensity > 5));
  hospital.userData.setPowered(false);
  assert.ok(window.material.emissiveIntensity < 1);
  assert.ok(nightLights.every((light) => light.intensity === 0));
});

test("reports hospital geometry and creates a separate shattered model", () => {
  const hospital = buildLowPolyHospitalCampus();
  const metrics = measureModelGeometry(hospital);
  assert.ok(metrics.size.x >= 54);
  assert.ok(metrics.size.y > 13);
  assert.ok(metrics.size.z >= 38);
  assert.ok(metrics.faceCount > 5_000);
  assert.equal(hospital.userData.siteSize.x, 54);
  assert.equal(hospital.userData.siteSize.z, 38);

  const pair = createFurnitureShatterPair(hospital, { seed: 503, trianglesPerShard: 10, spread: 1.5 });
  assert.equal(pair.normal.userData.modelState, "normal");
  assert.equal(pair.shattered.userData.modelState, "shattered");
  assert.ok(pair.shards.length > 300);
  pair.setAmount(1);
  assert.equal(pair.normal.visible, false);
  assert.equal(pair.shattered.visible, true);
});

test("exposes the hospital showroom and three-category model archive", async () => {
  const [demoSource, archiveSource, studioSource, cityDemoSource] = await Promise.all([
    readFile(new URL("../app/demos/hospital-campus/HospitalCampusDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(demoSource, /buildLowPolyHospitalCampus/);
  assert.match(demoSource, /createFurnitureShatterPair/);
  assert.match(demoSource, /查看医院内饰/);
  assert.match(demoSource, /门诊区域/);
  assert.match(demoSource, /急诊区域/);
  assert.match(demoSource, /住院病房区域/);
  assert.match(demoSource, /三栋互不相连的独立建筑/);
  assert.match(demoSource, /MODEL SIZE/);
  assert.match(demoSource, /返回模型分类/);

  assert.match(archiveSource, /街道装饰/);
  assert.match(archiveSource, /居民建筑/);
  assert.match(archiveSource, /医院/);
  assert.match(archiveSource, /\/demos\/city-street-furniture#street/);
  assert.match(archiveSource, /\/demos\/city-street-furniture#residential/);
  assert.match(archiveSource, /\/demos\/hospital-campus/);
  assert.match(studioSource, /模型展示区/);
  assert.match(studioSource, /街道装饰 · 居民建筑 · 医院/);
  assert.match(cityDemoSource, /window\.location\.hash === "#residential"/);
  assert.match(cityDemoSource, /返回模型分类/);
});
