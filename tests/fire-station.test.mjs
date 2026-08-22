import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("builds a complete four-zone urban fire station campus", () => {
  const station = buildLowPolyFireStation();
  assert.equal(station.name, "city-fire-station-campus-lowpoly");
  assert.equal(station.userData.modelType, "fire-station-campus");
  assert.equal(station.userData.generatedLocally, true);
  assert.deepEqual(station.userData.zones, ["response", "command", "living", "training"]);
  assert.equal(station.userData.buildingCount, 5);
  assert.ok(station.getObjectByName("fire-station-apparatus-hall"));
  assert.ok(station.getObjectByName("fire-station-command-centre"));
  const livingQuarters = station.getObjectByName("fire-station-living-quarters");
  assert.ok(livingQuarters);
  assert.equal(livingQuarters.userData.floorPitchMeters, 3.45);
  assert.equal(livingQuarters.userData.buildingSizeMeters.x, 48);
  assert.ok(Math.abs(livingQuarters.userData.buildingSizeMeters.y - 10.35) < 1e-9);
  assert.equal(livingQuarters.userData.buildingSizeMeters.z, 20);
  assert.ok(station.getObjectByName("fire-station-equipment-warehouse"));
  assert.ok(station.getObjectByName("fire-station-training-tower"));
});

test("provides six direct response lanes, operable bays and specialised engines", () => {
  const station = buildLowPolyFireStation();
  const lanes = namedObjects(station, "fire-station-response-lane");
  const doors = namedObjects(station, "fire-station-apparatus-door");
  const engines = namedObjects(station, "fire-station-fire-engine");
  assert.equal(station.userData.apparatusBayCount, 6);
  assert.equal(station.userData.fireEngineCount, 6);
  assert.equal(lanes.length, 6);
  assert.ok(lanes.every((lane) => lane.userData.directToPublicRoad));
  assert.ok(lanes.every((lane) => lane.userData.clearWidth >= 12));
  assert.equal(doors.length, 6);
  assert.ok(doors.every((door) => door.userData.operable));
  assert.equal(namedObjects(station.getObjectByName("fire-station-apparatus-hall"), "fire-station-building-solid-shell").length, 0);
  assert.equal(namedObjects(station, "fire-station-apparatus-front-pier").length, 7);
  assert.equal(namedObjects(station, "fire-station-apparatus-bay-jamb").length, 12);
  const responseGates = namedObjects(station, "fire-station-response-gate");
  const responseGatePanels = namedObjects(station, "fire-station-response-gate-panel");
  assert.equal(responseGates.length, 6);
  assert.equal(responseGatePanels.length, 6);
  assert.ok(responseGates.every((gate, index) => gate.userData.clearWidth === lanes[index].userData.clearWidth));
  assert.ok(responseGatePanels.every((panel) => panel.userData.open && panel.position.y - 1.1 >= 4.8));
  assert.equal(engines.length, 6);
  assert.deepEqual(engines.map((engine) => engine.userData.kind), ["pump", "pump", "ladder", "rescue", "hazmat", "water-tanker"]);
  assert.equal(namedObjects(station, "fire-engine-wheel").length, 24);
  assert.equal(namedObjects(station, "fire-engine-aerial-ladder-rung").length, 9);
  assert.equal(namedObjects(station, "fire-engine-water-tank").length, 1);
  assert.ok(station.getObjectByName("fire-station-public-response-road"));
});

test("includes command, crew living and equipment logistics interiors", () => {
  const station = buildLowPolyFireStation();
  assert.equal(station.userData.commandDeskCount, 12);
  assert.equal(namedObjects(station, "fire-station-command-desk").length, 12);
  assert.equal(namedObjects(station, "fire-station-command-screen").length, 12);
  assert.ok(station.getObjectByName("fire-station-dispatch-video-wall"));
  assert.equal(station.userData.dormBedCount, 16);
  assert.equal(namedObjects(station, "fire-station-dorm-bed").length, 16);
  assert.equal(namedObjects(station, "fire-station-turnout-gear-locker").length, 24);
  const readyArea = station.getObjectByName("fire-station-turnout-ready-area");
  assert.equal(readyArea.userData.adjacentToApparatusHall, true);
  assert.ok(namedObjects(readyArea, "fire-station-turnout-gear-locker").every((locker) => locker.position.x >= -69 && locker.position.x <= -7.4 && locker.position.z >= -3.85 && locker.position.z <= -2.6));
  assert.equal(station.userData.equipmentRackCount, 12);
  assert.equal(namedObjects(station, "fire-station-equipment-rack").length, 12);
  assert.equal(namedObjects(station, "fire-station-breathing-cylinder").length, 36);
});

test("builds a realistic eight-storey live-fire training district", () => {
  const station = buildLowPolyFireStation();
  const tower = station.getObjectByName("fire-station-training-tower");
  assert.equal(station.userData.trainingTowerFloors, 8);
  assert.equal(tower.userData.floorCount, 8);
  assert.equal(tower.userData.liveFireRated, true);
  assert.equal(namedObjects(station, "fire-station-training-window").length, 8);
  assert.equal(namedObjects(station, "fire-station-training-balcony").length, 8);
  assert.equal(namedObjects(station, "fire-station-training-balcony-side-rail").length, 16);
  assert.equal(namedObjects(station, "fire-station-training-obstacle").length, 5);
  assert.ok(station.getObjectByName("fire-station-rappel-rope"));
  assert.ok(station.getObjectByName("fire-station-smoke-maze"));
  const smokeMaze = station.getObjectByName("fire-station-smoke-maze");
  const mazeEntrance = station.getObjectByName("fire-station-smoke-maze-entrance");
  assert.equal(smokeMaze.userData.continuousRoute, true);
  assert.equal(mazeEntrance.userData.clearWidth, smokeMaze.userData.entranceClearWidth);
  assert.equal(namedObjects(smokeMaze, "fire-station-smoke-maze-partition").length, 3);
  assert.deepEqual(namedObjects(smokeMaze, "fire-station-smoke-maze-partition").map((wall) => wall.userData.alternatingSideGap), ["+x", "-x", "+x"]);
  const sideWall = namedObjects(smokeMaze, "fire-station-smoke-maze-side-wall")[1];
  const firstPartition = namedObjects(smokeMaze, "fire-station-smoke-maze-partition")[0];
  const sideWallInnerX = sideWall.position.x - sideWall.geometry.parameters.width * 0.5;
  const partitionEndX = firstPartition.position.x + firstPartition.geometry.parameters.width * 0.5;
  assert.equal(sideWallInnerX - partitionEndX, smokeMaze.userData.corridorClearWidth);
  assert.ok(station.getObjectByName("fire-station-training-water-pool"));
  assert.equal(station.userData.hydrantCount, 8);
  assert.equal(namedObjects(station, "fire-station-hydrant").length, 8);
});

test("secures the campus while keeping response, visitor and service paths separate", () => {
  const station = buildLowPolyFireStation();
  assert.equal(station.userData.fenceSegmentCount, 7);
  assert.equal(namedObjects(station, "fire-station-security-fence").length, 7);
  assert.ok(namedObjects(station, "fire-station-fence-post").length > 180);
  assert.ok(station.getObjectByName("fire-station-visitor-access-road"));
  assert.ok(station.getObjectByName("fire-station-service-road"));
  const serviceGate = station.getObjectByName("fire-station-service-gate");
  assert.equal(serviceGate.userData.controlledAccess, true);
  assert.equal(serviceGate.userData.clearWidth, 8);
  const visitorGate = station.getObjectByName("fire-station-visitor-gate");
  assert.equal(visitorGate.userData.clearWidth, 18);
  const visitorPosts = namedObjects(visitorGate, "fire-station-visitor-gate-post");
  assert.equal(visitorPosts[1].position.x - visitorPosts[0].position.x - 0.5, visitorGate.userData.clearWidth);
  const servicePosts = namedObjects(serviceGate, "fire-station-service-gate-post");
  assert.equal(servicePosts[1].position.z - servicePosts[0].position.z - 0.5, serviceGate.userData.clearWidth);
  const visitorPanels = namedObjects(visitorGate, "fire-station-visitor-gate-panel");
  const servicePanel = station.getObjectByName("fire-station-service-gate-panel");
  assert.ok(visitorPanels.every((panel) => !panel.userData.open));
  assert.equal(servicePanel.userData.open, false);
  station.userData.setVisitorGateOpen(true);
  station.userData.setServiceGateOpen(true);
  assert.ok(visitorPanels.every((panel) => panel.userData.open));
  assert.equal(servicePanel.userData.open, true);
});

test("reuses city decorations and is calibrated to the rabbit rider", () => {
  const station = buildLowPolyFireStation();
  assert.equal(station.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(station.userData.scaleStandard, "rabbit-rider");
  assert.deepEqual(station.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
  ]);
  assert.equal(namedObjects(station, "fire-station-reused-tree-anchor").length, 16);
  assert.equal(namedObjects(station, "city-street-light-lowpoly").length, 14);
  assert.equal(namedObjects(station, "city-roadside-planter-lowpoly").length, 8);
  const metrics = measureModelGeometry(station);
  assert.ok(metrics.size.x >= 154);
  assert.ok(metrics.size.z >= 109);
  assert.ok(metrics.size.y >= 29);
  assert.equal(station.userData.siteSize.x, 159);
  assert.equal(station.userData.siteSize.z, 110);
});

test("operates bay doors, night lighting, emergency alert and cutaway", () => {
  const station = buildLowPolyFireStation();
  const doors = namedObjects(station, "fire-station-apparatus-door");
  const closedY = doors.map((door) => door.position.y);
  station.userData.setApparatusDoorsOpen(true);
  assert.ok(doors.every((door, index) => door.position.y > closedY[index] && door.userData.open));
  assert.ok(doors.every((door) => door.position.y - 2.6 >= 6));
  station.userData.setApparatusDoorsOpen(false);
  assert.deepEqual(doors.map((door) => door.position.y), closedY);

  const buildingWindow = namedObjects(station, "fire-station-building-window")[0];
  const streetLights = namedObjects(station, "street-light-point-light");
  assert.ok(buildingWindow instanceof THREE.Mesh);
  station.userData.setPowered(true);
  assert.ok(buildingWindow.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  const pooledLights = namedObjects(station, "fire-station-night-light-pool")
    .flatMap((pool) => pool.children.filter((light) => light instanceof THREE.PointLight));
  assert.ok(pooledLights.length > 0 && pooledLights.every((light) => light.visible && light.intensity > 0));
  station.userData.setPowered(false);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => !light.visible && light.intensity === 0));

  const emergencyLights = namedObjects(station, "fire-engine-emergency-point-light");
  const lightbars = namedObjects(station, "fire-engine-emergency-lightbar");
  const engines = namedObjects(station, "fire-station-fire-engine");
  assert.ok(engines.every((engine) => engine.position.z === engine.userData.readyPositionZ));
  station.userData.setAlertActive(true);
  assert.ok(doors.every((door) => door.userData.open));
  assert.ok(engines.every((engine) => engine.userData.responding && engine.position.z === engine.userData.responsePositionZ));
  station.userData.update(0.25);
  assert.ok(emergencyLights.some((light) => light.intensity >= 6));
  assert.ok(lightbars.some((lightbar) => lightbar.material.emissiveIntensity >= 3.5));
  station.userData.setAlertActive(false);
  assert.ok(emergencyLights.every((light) => light.intensity === 0));
  assert.ok(doors.every((door) => !door.userData.open));
  assert.ok(engines.every((engine) => !engine.userData.responding && engine.position.z === engine.userData.readyPositionZ));

  assert.equal(buildingWindow.visible, true);
  station.userData.setInteriorCutaway(true);
  assert.equal(buildingWindow.visible, false);
  station.userData.setInteriorCutaway(false);
  assert.equal(buildingWindow.visible, true);
});

test("exposes the fire station from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/fire-station/FireStationDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyFireStation/);
  assert.match(demoSource, /消防车库与出警区/);
  assert.match(demoSource, /应急指挥中心/);
  assert.match(demoSource, /执勤生活与器材区/);
  assert.match(demoSource, /消防训练区/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /打开访客与后勤门禁/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /城市消防局/);
  assert.match(archiveSource, /\/demos\/fire-station/);
  assert.match(studioSource, /完整社区 · 消防局/);
});
