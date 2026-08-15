import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyCityCenter } from "../app/lib/map/cityCenter.ts";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("builds a complete metropolitan city center with four independent facilities", () => {
  const center = buildLowPolyCityCenter();
  assert.equal(center.userData.modelType, "city-center");
  assert.equal(center.userData.generatedLocally, true);
  assert.deepEqual(center.userData.zones, ["landmark", "transit", "bus", "taxi", "map", "plaza"]);
  assert.equal(center.userData.independentFacilityCount, 4);
  const facilities = [
    center.getObjectByName("city-center-independent-transport-hub"),
    center.getObjectByName("city-center-independent-bus-station"),
    center.getObjectByName("city-center-independent-taxi-rank"),
    center.getObjectByName("city-center-independent-map-entrance"),
  ];
  assert.ok(facilities.every((facility) => facility?.userData.independentFacility));
  assert.equal(new Set(facilities.map((facility) => facility.userData.facilityType)).size, 4);
});

test("provides an independent rail and metro transport hub", () => {
  const center = buildLowPolyCityCenter();
  const hub = center.getObjectByName("city-center-independent-transport-hub");
  assert.equal(hub.userData.facilityType, "transport-hub");
  assert.deepEqual(hub.userData.interchangeModes, ["rail", "metro", "walking"]);
  assert.equal(center.userData.transitPlatformCount, 4);
  assert.equal(center.userData.railTrackCount, 4);
  assert.equal(namedObjects(center, "city-center-hub-platform").length, 4);
  assert.equal(namedObjects(center, "city-center-hub-rail").length, 8);
  assert.equal(namedObjects(center, "city-center-transport-hub-entrance").length, 2);
  assert.equal(namedObjects(center, "city-center-transport-hub-entrance-pier").length, 4);
  assert.equal(namedObjects(center, "city-center-transport-hub-entrance-canopy").length, 2);
  assert.ok(namedObjects(center, "city-center-transport-hub-entrance").every((entrance) => entrance.userData.physicalPortal));
  assert.ok(center.getObjectByName("city-center-hub-departure-board"));
  assert.equal(namedObjects(center, "city-center-hub-platform-stair").length, 2);
  assert.equal(namedObjects(center, "city-center-hub-platform-escalator").length, 2);
  assert.equal(namedObjects(center, "city-center-hub-platform-elevator").length, 1);
  assert.equal(center.getObjectByName("city-center-hub-platform-elevator").userData.stepFree, true);
});

test("provides a standalone public bus terminal", () => {
  const center = buildLowPolyCityCenter();
  const station = center.getObjectByName("city-center-independent-bus-station");
  assert.equal(station.userData.facilityType, "public-bus-station");
  assert.equal(station.userData.bayCount, 8);
  assert.equal(center.userData.busBayCount, 8);
  assert.equal(center.userData.busCount, 6);
  assert.equal(namedObjects(center, "city-center-bus-bay-line").length, 8);
  assert.equal(namedObjects(center, "city-center-public-bus").length, 6);
  assert.equal(namedObjects(center, "city-center-bus-station-gate").length, 2);
  assert.ok(namedObjects(center, "city-center-bus-station-gate").every((gate) => gate.userData.separateFromTaxi));
  assert.equal(namedObjects(center, "city-center-bus-station-gate-post").length, 4);
  assert.ok(namedObjects(center, "city-center-bus-station-gate").every((gate) => gate.userData.physicalPortal && gate.userData.clearWidth >= 6));
  const safeWalkway = center.getObjectByName("city-center-bus-passenger-safe-walkway");
  assert.equal(safeWalkway.userData.protectedFromBusTraffic, true);
  assert.equal(safeWalkway.userData.connectsBothGatesToConcourse, true);
  assert.ok(center.getObjectByName("city-center-bus-passenger-safety-rail"));
});

test("provides a separate sheltered taxi rank", () => {
  const center = buildLowPolyCityCenter();
  const rank = center.getObjectByName("city-center-independent-taxi-rank");
  assert.equal(rank.userData.facilityType, "taxi-rank");
  assert.equal(rank.userData.queueSeparatedFromBus, true);
  assert.equal(center.userData.taxiStandCount, 12);
  assert.equal(center.userData.taxiCount, 8);
  assert.equal(namedObjects(center, "city-center-taxi-stand").length, 12);
  assert.equal(namedObjects(center, "city-center-taxi").length, 8);
  assert.ok(center.getObjectByName("city-center-taxi-passenger-island"));
  assert.ok(center.getObjectByName("city-center-taxi-rank-canopy"));
});

test("builds a dedicated accessible map entrance and visitor pavilion", () => {
  const center = buildLowPolyCityCenter();
  const entrance = center.getObjectByName("city-center-independent-map-entrance");
  assert.equal(entrance.userData.facilityType, "city-map-entrance");
  assert.equal(entrance.userData.clearWidth, 16);
  assert.equal(entrance.userData.accessible, true);
  assert.equal(center.userData.mapEntranceCount, 1);
  assert.equal(center.userData.mapBoardCount, 2);
  assert.equal(namedObjects(center, "city-center-map-information-board").length, 2);
  assert.deepEqual(new Set(namedObjects(center, "city-center-map-information-board").map((board) => board.userData.mapType)), new Set(["district-overview", "transport-network"]));
  assert.equal(namedObjects(center, "city-center-map-route-line").length, 8);
  assert.equal(namedObjects(center, "city-center-map-you-are-here").length, 2);
  assert.ok(namedObjects(center, "city-center-map-information-board").every((board) => board.userData.content.length >= 3));
  assert.ok(center.getObjectByName("city-center-map-information-pavilion"));
  assert.ok(center.getObjectByName("city-center-map-entrance-title-screen"));
});

test("creates the civic landmark core and public plaza", () => {
  const center = buildLowPolyCityCenter();
  const landmark = center.getObjectByName("city-center-landmark-tower");
  assert.equal(center.userData.landmarkTowerCount, 3);
  assert.equal(landmark.userData.floorCount, 16);
  assert.equal(landmark.userData.heightMeters, 64);
  assert.equal(namedObjects(center, "city-center-tower-glass-shell").length, 3);
  assert.equal(center.getObjectByName("city-center-landmark-tower").userData.frontDirection, "+z");
  assert.equal(center.getObjectByName("city-center-mixed-use-east-tower").userData.frontDirection, "-x");
  assert.equal(center.getObjectByName("city-center-mixed-use-west-tower").userData.frontDirection, "+x");
  assert.equal(center.userData.fountainCount, 1);
  assert.equal(namedObjects(center, "city-center-fountain-water-jet").length, 8);
  const sunkenCourt = center.getObjectByName("city-center-sunken-retail-court");
  assert.equal(sunkenCourt.userData.sunken, true);
  assert.ok(sunkenCourt.userData.depthMeters > 0);
  assert.equal(namedObjects(center, "city-center-sunken-retail-retaining-wall").length, 4);
  assert.equal(namedObjects(center, "city-center-sunken-retail-access-stair").length, 5);
  assert.equal(center.getObjectByName("city-center-sunken-retail-access-ramp").userData.maximumGradient, "1:12");
  assert.equal(namedObjects(center, "city-center-plaza-shopfront").length, 5);
});

test("reuses city decorations and preserves the rabbit rider scale", () => {
  const center = buildLowPolyCityCenter();
  assert.equal(center.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(center.userData.scaleStandard, "rabbit-rider");
  assert.equal(namedObjects(center, "city-center-reused-tree-anchor").length, 32);
  assert.equal(namedObjects(center, "city-street-light-lowpoly").length, 26);
  assert.equal(namedObjects(center, "city-roadside-planter-lowpoly").length, 10);
  assert.equal(namedObjects(center, "city-food-truck-lowpoly").length, 2);
  assert.equal(namedObjects(center, "city-traffic-light-lowpoly").length, 6);
  const metrics = measureModelGeometry(center);
  assert.ok(metrics.size.x >= 209);
  assert.ok(metrics.size.z >= 164);
  assert.ok(metrics.size.y >= 64);
  assert.deepEqual(center.userData.siteSize.toArray(), [210, 66, 165]);
});

test("supports night lights, rush-hour mode and cutaway inspection", () => {
  const center = buildLowPolyCityCenter();
  const facade = center.getObjectByName("city-center-transport-hub-glass-facade");
  const board = center.getObjectByName("city-center-hub-departure-board");
  const streetLights = namedObjects(center, "street-light-point-light");
  assert.ok(facade instanceof THREE.Mesh);
  center.userData.setPowered(true);
  assert.ok(facade.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => light.intensity > 0));
  center.userData.setPowered(false);
  assert.ok(streetLights.every((light) => light.intensity === 0));
  center.userData.setRushHour(true);
  assert.ok(board.material.emissiveIntensity > 3);
  const bus = center.getObjectByName("city-center-public-bus");
  const taxi = center.getObjectByName("city-center-taxi");
  const busHome = bus.position.clone();
  const taxiHome = taxi.position.clone();
  center.userData.update(0.8);
  assert.ok(board.material.emissiveIntensity > 2.5);
  assert.notEqual(bus.position.z, busHome.z);
  assert.notEqual(taxi.position.x, taxiHome.x);
  center.userData.setRushHour(false);
  assert.ok(bus.position.equals(busHome));
  assert.ok(taxi.position.equals(taxiHome));
  assert.equal(facade.visible, true);
  center.userData.setInteriorCutaway(true);
  assert.equal(facade.visible, false);
  center.userData.setInteriorCutaway(false);
  assert.equal(facade.visible, true);
});

test("exposes the city center from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/city-center/CityCenterDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyCityCenter/);
  assert.match(demoSource, /综合交通枢纽/);
  assert.match(demoSource, /公共汽车总站/);
  assert.match(demoSource, /出租车停车点/);
  assert.match(demoSource, /城市地图入口/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /城市中心/);
  assert.match(archiveSource, /\/demos\/city-center/);
  assert.match(studioSource, /体育中心 · 城市中心/);
});
