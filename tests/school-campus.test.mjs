import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

function renderedOrMerged(object) {
  return object.visible || typeof object.userData.renderProxySource === "string";
}

test("builds a complete independent school campus with realistic functional zones", () => {
  const campus = buildLowPolySchoolCampus();
  assert.equal(campus.name, "city-school-campus-lowpoly");
  assert.equal(campus.userData.modelType, "school-campus");
  assert.equal(campus.userData.generatedLocally, true);
  assert.deepEqual(campus.userData.zones, ["teaching", "laboratory", "administration", "dormitory", "sports", "natatorium"]);
  assert.equal(campus.userData.buildingCount, 7);
  assert.equal(campus.userData.teachingBuildingCount, 2);
  assert.equal(campus.userData.dormitoryCount, 2);
  assert.ok(campus.getObjectByName("school-campus-main-gate"));
  assert.ok(campus.getObjectByName("school-administration-building"));
  assert.ok(campus.getObjectByName("school-laboratory-building"));
  assert.ok(campus.getObjectByName("school-indoor-natatorium"));
  assert.ok(campus.getObjectByName("school-campus-protection-fence"));
});

test("aligns every main building facade to one campus direction", () => {
  const campus = buildLowPolySchoolCampus();
  const mainBuildings = [
    "school-teaching-building-a",
    "school-teaching-building-b",
    "school-laboratory-building",
    "school-administration-building",
    "school-student-dormitory-a",
    "school-student-dormitory-b",
    "school-indoor-natatorium",
  ];
  assert.ok(mainBuildings.every((name) => campus.getObjectByName(name)?.userData.frontDirection === "+z"));
  for (const name of ["school-student-dormitory-a", "school-student-dormitory-b"]) {
    const dormitory = campus.getObjectByName(name);
    assert.equal(dormitory.userData.floorPitchMeters, 3.35);
    assert.ok(dormitory.userData.buildingSizeMeters.x >= 28);
  }
  const dormDoor = campus.getObjectByName("school-dormitory-a-entrance-door");
  assert.ok(dormDoor.position.z > 0, "dormitory entrance should face the same +z direction");
  assert.ok(campus.getObjectByName("school-teaching-b-entrance-door"));
  assert.ok(campus.getObjectByName("school-dormitory-b-entrance-door"));
  assert.equal(namedObjects(campus, "school-campus-entrance-link").length, 4);
});

test("protects the school with a continuous perimeter and controlled main-gate gap", () => {
  const campus = buildLowPolySchoolCampus();
  assert.equal(campus.userData.fenceSegmentCount, 5);
  assert.equal(namedObjects(campus, "school-campus-protection-fence-segment").length, 5);
  assert.ok(namedObjects(campus, "school-campus-fence-post").length > 190);
  assert.equal(namedObjects(campus, "school-campus-fence-horizontal-rail").length, 10);
  const gate = campus.getObjectByName("school-campus-main-gate");
  assert.ok(gate && gate.position.z > 60);
  const panels = namedObjects(campus, "school-campus-main-gate-panel");
  assert.equal(panels.length, 2);
  assert.ok(panels.every((panel) => panel.userData.open && Math.abs(panel.position.x) > 9));
  campus.userData.setMainGateOpen(false);
  assert.ok(panels.every((panel) => !panel.userData.open && Math.abs(panel.position.x) < 4));
  campus.userData.setMainGateOpen(true);
});

test("includes inspectable learning, laboratory, office and dormitory interiors", () => {
  const campus = buildLowPolySchoolCampus();
  assert.equal(namedObjects(campus, "school-classroom").length, 24);
  assert.equal(namedObjects(campus, "school-laboratory-room").length, 12);
  assert.equal(namedObjects(campus, "school-dorm-room").length, 48);
  assert.equal(campus.userData.classroomCount, 24);
  assert.equal(campus.userData.laboratoryCount, 12);
  assert.equal(campus.userData.dormRoomCount, 48);
  assert.ok(namedObjects(campus, "school-classroom-student-desk").length >= 144);
  assert.ok(namedObjects(campus, "school-laboratory-bench").length >= 24);
  assert.equal(namedObjects(campus, "school-dorm-bed").length, 96);

  const window = namedObjects(campus, "school-building-window")[0];
  const observationWall = namedObjects(campus, "school-building-side-wall").find((wall) => wall.userData.cutawayRole === "observation-side");
  const roof = namedObjects(campus, "school-building-flat-roof")[0];
  const entranceDoor = campus.getObjectByName("school-teaching-a-entrance-door");
  assert.equal(window.visible, true);
  campus.userData.setInteriorCutaway(true);
  assert.equal(window.visible, false);
  assert.equal(observationWall.visible, false);
  assert.equal(roof.visible, false);
  assert.equal(renderedOrMerged(entranceDoor), true, "cutaway must preserve the building entrance");
  campus.userData.setInteriorCutaway(false);
  assert.equal(window.visible, true);
  assert.equal(observationWall.visible, true);
});

test("provides a complete track, ball-court district and eight-lane indoor pool", () => {
  const campus = buildLowPolySchoolCampus();
  assert.ok(campus.getObjectByName("school-running-track"));
  assert.ok(campus.getObjectByName("school-football-field"));
  assert.equal(campus.userData.runningTrackLanes, 6);
  assert.equal(namedObjects(campus, "school-running-track-lane-line").length, 7);
  assert.equal(namedObjects(campus, "school-basketball-court").length, 2);
  assert.equal(namedObjects(campus, "school-tennis-court").length, 2);
  assert.equal(campus.userData.basketballCourtCount, 2);
  assert.equal(campus.userData.tennisCourtCount, 2);
  assert.equal(campus.userData.swimmingLaneCount, 8);
  assert.equal(namedObjects(campus, "school-swimming-lane-rope").length, 9);
  assert.equal(namedObjects(campus, "school-swimming-starting-block").length, 8);
  assert.ok(campus.getObjectByName("school-natatorium-glass-facade"));
  assert.ok(campus.getObjectByName("school-natatorium-roof"));
  assert.equal(campus.userData.runningTrackLengthMeters, 238);
  assert.equal(namedObjects(campus, "school-natatorium-entrance-door").length, 2);
  assert.ok(campus.getObjectByName("school-natatorium-entrance-link"));
  const trackBox = new THREE.Box3().setFromObject(campus.getObjectByName("school-running-track"));
  const standBox = new THREE.Box3().setFromObject(campus.getObjectByName("school-spectator-stand"));
  assert.ok(standBox.max.z < trackBox.min.z);
  const serviceRoadBox = new THREE.Box3().setFromObject(campus.getObjectByName("school-campus-service-road"));
  const poolBox = new THREE.Box3().setFromObject(campus.getObjectByName("school-natatorium-foundation"));
  assert.ok(serviceRoadBox.min.z > poolBox.max.z);
  const poolObservationWall = namedObjects(campus, "school-natatorium-side-wall").find((wall) => wall.userData.cutawayRole === "observation-side");
  campus.userData.setInteriorCutaway(true);
  assert.equal(poolObservationWall.visible, false);
  assert.equal(campus.getObjectByName("school-natatorium-roof").visible, false);
  assert.ok(namedObjects(campus, "school-natatorium-entrance-door").every(renderedOrMerged));
});

test("reuses city decorations and is calibrated to the rabbit rider", () => {
  const campus = buildLowPolySchoolCampus();
  assert.equal(campus.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(campus.userData.scaleStandard, "rabbit-rider");
  assert.deepEqual(campus.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
  ]);
  assert.equal(namedObjects(campus, "school-campus-reused-tree-anchor").length, 24);
  assert.equal(namedObjects(campus, "city-street-light-lowpoly").length, 16);
  assert.equal(namedObjects(campus, "city-roadside-planter-lowpoly").length, 8);
  const metrics = measureModelGeometry(campus);
  assert.ok(metrics.size.x >= 169);
  assert.ok(metrics.size.z >= 129);
  assert.ok(metrics.size.y >= 20);
  assert.equal(campus.userData.siteSize.x, 170);
  assert.equal(campus.userData.siteSize.z, 130);
});

test("powers school windows, pool lighting and existing campus lights", () => {
  const campus = buildLowPolySchoolCampus();
  const window = namedObjects(campus, "school-building-window")[0];
  const pool = campus.getObjectByName("school-natatorium-pool-water");
  const lights = namedObjects(campus, "street-light-point-light");
  assert.ok(window instanceof THREE.Mesh && pool instanceof THREE.Mesh);
  assert.ok(lights.length > 10);
  campus.userData.setPowered(true);
  assert.ok(window.material.emissiveIntensity > 1);
  assert.ok(pool.material.emissiveIntensity > 0.5);
  assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
  const pooledLights = namedObjects(campus, "school-campus-night-light-pool")
    .flatMap((poolGroup) => poolGroup.children.filter((light) => light instanceof THREE.PointLight));
  assert.ok(pooledLights.length > 0 && pooledLights.every((light) => light.visible && light.intensity > 0));
  campus.userData.setPowered(false);
  assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => !light.visible && light.intensity === 0));
});

test("exposes the school campus from the model archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/school-campus/SchoolCampusDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolySchoolCampus/);
  assert.match(demoSource, /红砖学府/);
  assert.match(demoSource, /教学楼组团/);
  assert.match(demoSource, /综合实验楼/);
  assert.match(demoSource, /室内游泳馆/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /现代学校/);
  assert.match(archiveSource, /\/demos\/school-campus/);
  assert.match(studioSource, /游乐园 · 学校/);
});
