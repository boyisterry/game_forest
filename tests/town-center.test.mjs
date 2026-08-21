import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyTownCenter } from "../app/lib/map/townCenter.ts";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

function renderedOrMerged(object) {
  return object.visible || typeof object.userData.renderProxySource === "string";
}

test("builds a complete seven-zone walkable town center", () => {
  const center = buildLowPolyTownCenter();
  assert.equal(center.userData.modelType, "town-center");
  assert.equal(center.userData.generatedLocally, true);
  assert.deepEqual(center.userData.zones, ["civic", "culture", "market", "commerce", "service", "transport", "square"]);
  assert.equal(center.userData.buildingCount, 13);
  assert.ok(center.getObjectByName("town-center-civic-square"));
  assert.ok(center.getObjectByName("town-center-pedestrian-main-axis"));
  assert.ok(center.getObjectByName("town-center-pedestrian-cross-axis"));
  assert.equal(namedObjects(center, "town-center-perimeter-street").length, 4);
  assert.equal(namedObjects(center, "town-center-pedestrian-road-connection").length, 4);
  assert.ok(namedObjects(center, "town-center-pedestrian-road-connection").every((connection) => connection.userData.raisedCrossing));
});

test("creates a civic town hall and clock tower facing the square", () => {
  const center = buildLowPolyTownCenter();
  const townHall = center.getObjectByName("town-center-town-hall");
  const clockTower = center.getObjectByName("town-center-clock-tower");
  assert.equal(center.userData.townHallFloorCount, 3);
  assert.equal(townHall.userData.publicEntranceFacing, "+z");
  assert.equal(townHall.userData.frontDirection, "toward-square");
  assert.equal(center.userData.clockTowerHeightMeters, 38);
  assert.equal(clockTower.userData.heightMeters, 38);
  assert.equal(namedObjects(center, "town-center-town-hall-column").length, 4);
  assert.equal(namedObjects(center, "town-center-town-hall-window").length, 20);
  assert.equal(namedObjects(center, "town-center-clock-face").length, 2);
  assert.equal(namedObjects(center, "town-center-clock-minute-marker").length, 24);
  assert.equal(namedObjects(center, "town-center-clock-minute-hand").length, 2);
  assert.equal(namedObjects(center, "town-center-clock-hour-hand").length, 2);
  assert.deepEqual(townHall.userData.interiorSpaces, ["public-lobby", "service-hall", "council-chamber", "administration-offices", "records-room"]);
  assert.equal(townHall.userData.accessibleElevator, true);
  assert.equal(namedObjects(center, "town-center-town-hall-floor-slab").length, 3);
  assert.equal(namedObjects(center, "town-center-town-hall-service-counter").length, 5);
  assert.equal(namedObjects(center, "town-center-town-hall-waiting-chair").length, 12);
  assert.equal(namedObjects(center, "town-center-town-hall-council-seat").length, 14);
  assert.equal(namedObjects(center, "town-center-town-hall-office-desk").length, 8);
  assert.equal(namedObjects(center, "town-center-town-hall-stair-core").length, 2);
  const elevator = center.getObjectByName("town-center-town-hall-elevator");
  assert.equal(elevator.userData.barrierFree, true);
  assert.deepEqual(elevator.userData.servesFloors, [1, 2, 3]);
  assert.equal(namedObjects(center, "town-center-town-hall-elevator-door").length, 3);
  assert.deepEqual(clockTower.userData.interiorLevels, ["town-hall-access", "maintenance", "clockwork", "belfry"]);
  assert.equal(namedObjects(center, "town-center-clock-tower-access-step").length, 6);
  assert.ok(namedObjects(center, "town-center-clock-tower-access-step").every((step) => step.userData.connectsTownHallThirdFloor));
  assert.equal(namedObjects(center, "town-center-clock-tower-spiral-step").length, 44);
  assert.equal(namedObjects(center, "town-center-clock-tower-maintenance-platform").length, 3);
  assert.equal(namedObjects(center, "town-center-clock-tower-clockwork-gear").length, 3);
  assert.ok(center.getObjectByName("town-center-clock-tower-bell"));
  const townHallRoof = townHall.getObjectByName("town-center-gabled-roof");
  assert.equal(townHallRoof.userData.geometry, "two-plane-pitched-roof");
  assert.equal(namedObjects(townHallRoof, "town-center-gabled-roof-plane").length, 4);
  assert.ok(namedObjects(townHallRoof, "town-center-gabled-roof-plane").every((plane) => Math.abs(plane.position.x) > 6));
});

test("provides a fitted public library and cultural hall", () => {
  const center = buildLowPolyTownCenter();
  const library = center.getObjectByName("town-center-public-library");
  const hall = center.getObjectByName("town-center-cultural-hall");
  assert.equal(center.userData.libraryReadingSeatCount, 48);
  assert.equal(library.userData.readingSeatCount, 48);
  assert.equal(namedObjects(center, "town-center-library-bookcase").length, 12);
  assert.equal(namedObjects(center, "town-center-library-reading-table").length, 6);
  assert.equal(namedObjects(center, "town-center-library-reading-chair").length, 48);
  assert.equal(center.userData.cultureHallSeatCount, 180);
  assert.equal(hall.userData.auditoriumCapacity, 180);
  assert.ok(center.getObjectByName("town-center-cultural-hall-stage"));
  assert.equal(namedObjects(center, "town-center-cultural-hall-seat-block").length, 36);
});

test("combines a covered market with a switchable outdoor market", () => {
  const center = buildLowPolyTownCenter();
  const market = center.getObjectByName("town-center-market-hall");
  const canopies = namedObjects(center, "town-center-outdoor-market-canopy");
  assert.equal(center.userData.indoorMarketStallCount, 16);
  assert.equal(center.userData.outdoorMarketStallCount, 12);
  assert.equal(market.userData.indoorStallCount, 16);
  assert.equal(namedObjects(center, "town-center-indoor-market-stall").length, 16);
  assert.equal(namedObjects(center, "town-center-outdoor-market-stall").length, 12);
  assert.ok(canopies.every((canopy) => canopy.visible === false));
  center.userData.setMarketDay(true);
  assert.ok(canopies.every((canopy) => canopy.visible === true));
  center.userData.update(0.7);
  assert.ok(canopies.some((canopy) => Math.abs(canopy.position.y - canopy.userData.homeY) > 0.01));
  center.userData.setMarketDay(false);
  assert.ok(canopies.every((canopy) => canopy.visible === false));
});

test("creates an active six-shop main street", () => {
  const center = buildLowPolyTownCenter();
  const shops = namedObjects(center, "town-center-main-street-shop");
  assert.equal(center.userData.mainStreetShopCount, 6);
  assert.equal(shops.length, 6);
  assert.deepEqual(new Set(shops.map((shop) => shop.userData.use)), new Set(["bakery", "cafe", "grocer", "pharmacy", "craft", "restaurant"]));
  assert.ok(shops.every((shop) => shop.userData.frontageFacing === "-z"));
  assert.equal(namedObjects(center, "town-center-shop-storefront").length, 6);
  assert.equal(namedObjects(center, "town-center-shop-awning").length, 6);
  const shopBounds = new THREE.Box3();
  shops.forEach((shop) => shopBounds.expandByObject(shop));
  assert.ok(shopBounds.max.x < 76, "shop roofs must stop before the east perimeter road begins");
});

test("grounds the civic-square seating around an artistic working fountain", () => {
  const center = buildLowPolyTownCenter();
  const fountain = center.getObjectByName("town-center-square-art-fountain");
  assert.equal(fountain.userData.artisticForm, "three-interlocking-ribbons");
  assert.equal(fountain.userData.waterJetCount, 6);
  assert.equal(namedObjects(center, "town-center-square-fountain-art-ribbon").length, 3);
  assert.equal(namedObjects(center, "town-center-square-fountain-water-jet").length, 6);
  assert.ok(center.getObjectByName("town-center-square-fountain-crystal"));
  assert.ok(center.getObjectByName("town-center-square-fountain-crown-jet"));

  const benches = namedObjects(center, "town-center-square-bench");
  const legs = namedObjects(center, "town-center-square-bench-leg");
  assert.equal(benches.length, 8);
  assert.equal(namedObjects(center, "town-center-square-bench-seat").length, 8);
  assert.equal(namedObjects(center, "town-center-square-bench-backrest").length, 8);
  assert.equal(legs.length, 16);
  assert.ok(benches.every((bench) => bench.userData.supportedByLegs && bench.userData.facesFountain));
  assert.ok(legs.every((leg) => {
    const legBottom = leg.position.y - leg.geometry.parameters.height * 0.5;
    return Math.abs(legBottom - leg.userData.groundContactY) < 0.001;
  }));
});

test("includes public services, postal counters and parcel lockers", () => {
  const center = buildLowPolyTownCenter();
  const service = center.getObjectByName("town-center-public-service-centre");
  const post = center.getObjectByName("town-center-post-office");
  assert.equal(center.userData.publicServiceCounterCount, 6);
  assert.equal(service.userData.accessible, true);
  assert.equal(namedObjects(center, "town-center-public-service-counter").length, 6);
  assert.equal(center.userData.postOfficeCounterCount, 4);
  assert.equal(post.userData.parcelLockers, 12);
  assert.equal(namedObjects(center, "town-center-post-office-counter").length, 4);
  assert.equal(namedObjects(center, "town-center-post-office-parcel-locker").length, 12);
  const entrances = namedObjects(center, "town-center-public-building-entrance");
  assert.equal(entrances.length, 6);
  assert.ok(entrances.every((entrance) => entrance.userData.barrierFree && entrance.userData.clearWidthMeters >= 2.8));
  assert.equal(center.getObjectByName("town-center-market-hall").userData.publicEntranceFacing, "-z");
});

test("keeps local transport proportional to town scale", () => {
  const center = buildLowPolyTownCenter();
  const stops = namedObjects(center, "town-center-local-bus-stop");
  assert.equal(center.userData.busStopCount, 2);
  assert.equal(stops.length, 2);
  assert.ok(stops.every((stop) => stop.userData.sheltered && stop.userData.accessible));
  assert.equal(center.userData.parkingSpaceCount, 32);
  const parkingSpaces = namedObjects(center, "town-center-parking-space");
  assert.equal(parkingSpaces.length, 32);
  const parkingLights = namedObjects(center, "city-street-light-lowpoly").filter((light) => light.userData.parkingPerimeter);
  assert.equal(parkingLights.length, 8);
  assert.ok(parkingLights.every((light) => light.userData.clearOfParkingSpaces));
  assert.ok(parkingLights.every((light) => parkingSpaces.every((space) => {
    const bounds = new THREE.Box3().setFromObject(space).expandByScalar(0.6);
    return !bounds.containsPoint(light.position);
  })), "parking light poles must remain outside every parking bay");
  assert.ok(parkingLights.every((light) => Math.abs(light.position.y - light.userData.groundContactY) < 0.001));
  assert.equal(center.userData.bicycleStandCount, 10);
  assert.equal(namedObjects(center, "town-center-bicycle-stand").length, 10);
});

test("reuses city decorations and preserves the rabbit rider scale", () => {
  const center = buildLowPolyTownCenter();
  assert.equal(center.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(center.userData.scaleStandard, "rabbit-rider");
  assert.equal(namedObjects(center, "town-center-reused-tree-anchor").length, 28);
  assert.equal(namedObjects(center, "city-street-light-lowpoly").length, 22);
  assert.equal(namedObjects(center, "city-roadside-planter-lowpoly").length, 12);
  assert.equal(namedObjects(center, "city-food-truck-lowpoly").length, 2);
  assert.equal(namedObjects(center, "city-hot-dog-kiosk-lowpoly").length, 1);
  assert.equal(namedObjects(center, "city-newsstand-lowpoly").length, 1);
  assert.equal(namedObjects(center, "city-phone-booth-lowpoly").length, 2);
  const metrics = measureModelGeometry(center);
  assert.ok(metrics.size.x >= 174);
  assert.ok(metrics.size.z >= 134);
  assert.ok(metrics.size.y >= 37);
  assert.deepEqual(center.userData.siteSize.toArray(), [175, 41, 135]);
});

test("supports night lighting and cutaway inspection", () => {
  const center = buildLowPolyTownCenter();
  const window = center.getObjectByName("town-center-library-window");
  const shell = center.getObjectByName("town-center-building-shell");
  const streetLights = namedObjects(center, "street-light-point-light");
  assert.ok(window instanceof THREE.Mesh);
  center.userData.setPowered(true);
  assert.ok(window.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  const pooledLights = namedObjects(center, "town-center-night-light-pool")
    .flatMap((pool) => pool.children.filter((light) => light instanceof THREE.PointLight));
  assert.ok(pooledLights.length > 0 && pooledLights.every((light) => light.visible && light.intensity > 0));
  center.userData.setMarketDay(true);
  center.userData.update(0.7);
  assert.ok(center.getObjectByName("town-center-clock-face").material.emissiveIntensity > 2.5);
  center.userData.setMarketDay(false);
  center.userData.setPowered(false);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => !light.visible && light.intensity === 0));
  const handSet = center.getObjectByName("town-center-clock-hand-set");
  const handRotation = handSet.rotation.z;
  center.userData.update(2.2);
  assert.notEqual(handSet.rotation.z, handRotation);
  assert.equal(shell.visible, true);
  center.userData.setInteriorCutaway(true);
  assert.equal(shell.visible, false);
  assert.equal(center.getObjectByName("town-center-clock-tower-shaft").visible, false);
  assert.equal(center.getObjectByName("town-center-clock-face").visible, false);
  assert.equal(center.getObjectByName("town-center-town-hall-interior").visible, true);
  assert.equal(renderedOrMerged(center.getObjectByName("town-center-clock-tower-clockwork-gear")), true);
  center.userData.setInteriorCutaway(false);
  assert.equal(shell.visible, true);
  assert.equal(center.getObjectByName("town-center-clock-tower-shaft").visible, true);
});

test("exposes the town center from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/town-center/TownCenterDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyTownCenter/);
  assert.match(demoSource, /市政厅与钟楼/);
  assert.match(demoSource, /图书馆与文化礼堂/);
  assert.match(demoSource, /传统集市/);
  assert.match(demoSource, /便民服务与邮政/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /市镇中心/);
  assert.match(archiveSource, /\/demos\/town-center/);
  assert.match(studioSource, /城市中心 · 市镇中心/);
});
