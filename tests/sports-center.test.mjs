import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolySportsCenter } from "../app/lib/map/sportsCenter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("builds a complete six-zone metropolitan sports centre", () => {
  const center = buildLowPolySportsCenter();
  assert.equal(center.name, "city-sports-center-lowpoly");
  assert.equal(center.userData.modelType, "sports-center");
  assert.equal(center.userData.generatedLocally, true);
  assert.deepEqual(center.userData.zones, ["stadium", "arena", "aquatics", "outdoor", "fitness", "service"]);
  assert.equal(center.userData.buildingCount, 5);
  assert.ok(center.getObjectByName("sports-center-main-stadium"));
  assert.ok(center.getObjectByName("sports-center-indoor-arena"));
  assert.ok(center.getObjectByName("sports-center-aquatics-centre"));
  assert.ok(center.getObjectByName("sports-center-public-fitness-centre"));
  assert.ok(center.getObjectByName("sports-center-ticket-service-building"));
});

test("provides an eight-lane football stadium with stands and event lighting", () => {
  const center = buildLowPolySportsCenter();
  const stadium = center.getObjectByName("sports-center-main-stadium");
  const track = center.getObjectByName("sports-center-running-track");
  assert.equal(center.userData.stadiumCapacity, 12000);
  assert.equal(stadium.userData.capacity, 12000);
  assert.equal(center.userData.runningTrackLanes, 8);
  assert.equal(track.userData.laneCount, 8);
  assert.equal(track.userData.competitionStandard, true);
  assert.equal(track.userData.measuredLapMeters, 400);
  assert.equal(stadium.userData.trackLengthMeters, 400);
  assert.equal(namedObjects(center, "sports-center-running-track-lane-line").length, 9);
  assert.equal(center.userData.footballFieldCount, 1);
  const field = center.getObjectByName("sports-center-football-field");
  assert.equal(field.userData.lengthMeters, 105);
  assert.equal(field.userData.widthMeters, 68);
  assert.equal(field.userData.regulationSize, true);
  assert.equal(namedObjects(center, "sports-center-football-goal").length, 2);
  assert.equal(namedObjects(center, "sports-center-stadium-grandstand").length, 2);
  assert.equal(namedObjects(center, "sports-center-stadium-seat-tier").length, 48);
  assert.equal(namedObjects(center, "sports-center-stadium-seat-tier").reduce((sum, tier) => sum + tier.userData.modeledSeats, 0), 12000);
  assert.equal(namedObjects(center, "sports-center-stadium-stand-guardrail").length, 6);
  const canopyColumns = namedObjects(center, "sports-center-stadium-canopy-column");
  assert.equal(canopyColumns.length, 12);
  assert.ok(canopyColumns.every((column) => column.userData.supportsCanopy === true));
  assert.equal(namedObjects(center, "sports-center-stadium-canopy-rear-beam").length, 2);
  assert.equal(center.userData.floodlightTowerCount, 8);
  assert.equal(namedObjects(center, "sports-center-stadium-floodlight-tower").length, 8);
  assert.equal(namedObjects(center, "sports-center-stadium-floodlight-panel").length, 48);
  assert.equal(center.getObjectByName("sports-center-stadium-scoreboard"), undefined);
});

test("includes a 5200-seat indoor multi-use arena", () => {
  const center = buildLowPolySportsCenter();
  const arena = center.getObjectByName("sports-center-indoor-arena");
  assert.equal(center.userData.arenaCapacity, 5200);
  assert.equal(arena.userData.capacity, 5200);
  assert.equal(center.userData.arenaCourtCount, 1);
  assert.ok(center.getObjectByName("sports-center-indoor-arena-court"));
  assert.equal(namedObjects(center, "sports-center-arena-seat-tier").length, 86);
  assert.equal(namedObjects(center, "sports-center-arena-seat-tier").reduce((sum, tier) => sum + tier.userData.modeledSeats, 0), 5200);
  assert.equal(namedObjects(center, "sports-center-arena-basketball-pole").length, 2);
  assert.ok(center.getObjectByName("sports-center-arena-centre-scoreboard"));
  assert.equal(namedObjects(center, "sports-center-arena-facade-window").length, 8);
});

test("builds a public 50-metre ten-lane competition pool", () => {
  const center = buildLowPolySportsCenter();
  const pool = center.getObjectByName("sports-center-competition-pool");
  assert.equal(pool.userData.lengthMeters, 50);
  assert.equal(pool.userData.widthMeters, 25);
  assert.equal(pool.userData.laneCount, 10);
  assert.equal(center.userData.swimmingLaneCount, 10);
  assert.equal(namedObjects(center, "sports-center-swimming-lane-rope").length, 11);
  assert.equal(namedObjects(center, "sports-center-swimming-starting-block").length, 10);
  assert.equal(namedObjects(center, "sports-center-aquatics-seat-tier").length, 6);
  assert.equal(namedObjects(center, "sports-center-aquatics-facade-window").length, 9);
  assert.equal(namedObjects(center, "sports-center-pool-deck-guardrail").length, 2);
  assert.equal(namedObjects(center, "sports-center-pool-deck-guardrail-post").length, 16);
  const accessibleSpaces = namedObjects(center, "sports-center-accessible-spectator-space");
  assert.equal(accessibleSpaces.length, 20);
  assert.deepEqual(new Set(accessibleSpaces.map((space) => space.userData.venue)), new Set(["stadium", "arena", "aquatics"]));
});

test("provides outdoor courts, skate facilities and public fitness", () => {
  const center = buildLowPolySportsCenter();
  assert.equal(center.userData.basketballCourtCount, 2);
  assert.equal(namedObjects(center, "sports-center-outdoor-basketball-court").length, 2);
  assert.equal(namedObjects(center, "sports-center-outdoor-basketball-rim").length, 4);
  assert.equal(namedObjects(center, "sports-center-outdoor-basketball-net").length, 4);
  assert.equal(namedObjects(center, "sports-center-outdoor-basketball-marking").length, 4);
  assert.equal(center.userData.tennisCourtCount, 2);
  assert.equal(namedObjects(center, "sports-center-outdoor-tennis-court").length, 2);
  assert.equal(namedObjects(center, "sports-center-outdoor-tennis-net-post").length, 4);
  assert.equal(namedObjects(center, "sports-center-outdoor-tennis-net-tape").length, 2);
  const tennisBounds = namedObjects(center, "sports-center-outdoor-tennis-court").map((court) => new THREE.Box3().setFromObject(court));
  assert.ok(tennisBounds.every((bounds) => bounds.max.z < 79.5 && bounds.max.x < 139));
  const fitnessBounds = new THREE.Box3().setFromObject(center.getObjectByName("sports-center-public-fitness-centre"));
  assert.ok(tennisBounds.every((bounds) => !bounds.intersectsBox(fitnessBounds)));
  assert.equal(center.userData.skateParkCount, 1);
  assert.ok(center.getObjectByName("sports-center-skate-park"));
  assert.equal(namedObjects(center, "sports-center-skate-ramp").length, 3);
  assert.equal(center.userData.fitnessStationCount, 18);
  assert.equal(namedObjects(center, "sports-center-fitness-machine").length, 18);
});

test("separates spectators, athletes and service vehicles", () => {
  const center = buildLowPolySportsCenter();
  const entrances = namedObjects(center, "sports-center-controlled-entrance");
  assert.equal(center.userData.entranceCount, 3);
  assert.equal(entrances.length, 3);
  assert.deepEqual(new Set(entrances.map((entrance) => entrance.userData.entranceType)), new Set(["spectator", "athlete", "service"]));
  assert.ok(entrances.every((entrance) => entrance.userData.controlledAccess));
  assert.ok(entrances.every((entrance) => entrance.userData.physicalPortal));
  assert.equal(namedObjects(center, "sports-center-entrance-gate-post").length, 6);
  assert.deepEqual(
    new Set(entrances.map((entrance) => `${entrance.userData.entranceType}:${entrance.position.x}:${entrance.position.z}`)),
    new Set(["spectator:-30:79.5", "athlete:-139:20", "service:139:-35"]),
  );
  assert.equal(center.userData.parkingSpaceCount, 40);
  assert.equal(namedObjects(center, "sports-center-parking-space").length, 40);
  assert.equal(namedObjects(center, "sports-center-ticket-window").length, 6);
  assert.equal(center.userData.fenceSegmentCount, 7);
  assert.equal(namedObjects(center, "sports-center-security-fence").length, 7);
});

test("reuses city decorations and keeps the rabbit rider scale", () => {
  const center = buildLowPolySportsCenter();
  assert.equal(center.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(center.userData.scaleStandard, "rabbit-rider");
  assert.deepEqual(center.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
    "city-food-truck-lowpoly",
  ]);
  assert.equal(namedObjects(center, "sports-center-reused-tree-anchor").length, 23);
  assert.equal(namedObjects(center, "city-street-light-lowpoly").length, 26);
  assert.equal(namedObjects(center, "city-roadside-planter-lowpoly").length, 10);
  assert.equal(namedObjects(center, "city-food-truck-lowpoly").length, 3);
  const metrics = measureModelGeometry(center);
  assert.ok(metrics.size.x >= 279);
  assert.ok(metrics.size.z >= 189);
  assert.ok(metrics.size.y >= 25);
  assert.equal(center.userData.siteSize.x, 280);
  assert.equal(center.userData.siteSize.y, 26);
  assert.equal(center.userData.siteSize.z, 190);
});

test("supports night lighting, event mode and building cutaway", () => {
  const center = buildLowPolySportsCenter();
  const window = namedObjects(center, "sports-center-aquatics-facade-window")[0];
  const streetLights = namedObjects(center, "street-light-point-light");
  const eventLights = namedObjects(center, "sports-center-stadium-event-light");
  const scoreboards = [center.getObjectByName("sports-center-arena-centre-scoreboard")];
  const accentBand = center.getObjectByName("sports-center-hall-accent-band");
  assert.ok(window instanceof THREE.Mesh);
  center.userData.setPowered(true);
  assert.ok(window.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  const pooledLights = namedObjects(center, "sports-center-night-light-pool")
    .flatMap((pool) => pool.children.filter((light) => light instanceof THREE.PointLight));
  assert.ok(pooledLights.length > 0 && pooledLights.every((light) => light.visible && light.intensity > 0));
  center.userData.setPowered(false);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => !light.visible && light.intensity === 0));

  center.userData.setEventMode(true);
  assert.ok(eventLights.every((light) => light.intensity >= 7.5));
  assert.ok(scoreboards.every((screen) => screen.material.emissiveIntensity > 2));
  center.userData.update(0.6);
  assert.ok(scoreboards.every((screen) => screen.material.emissiveIntensity > 2));
  center.userData.setEventMode(false);
  assert.ok(eventLights.every((light) => light.intensity === 0));

  assert.equal(window.visible, true);
  center.userData.setInteriorCutaway(true);
  assert.equal(window.visible, false);
  assert.equal(accentBand.visible, false);
  center.userData.setInteriorCutaway(false);
  assert.equal(window.visible, true);
  assert.equal(accentBand.visible, true);
});

test("exposes the sports centre from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/sports-center/SportsCenterDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolySportsCenter/);
  assert.match(demoSource, /田径足球主体育场/);
  assert.match(demoSource, /综合体育馆/);
  assert.match(demoSource, /公共游泳馆/);
  assert.match(demoSource, /室外全民运动区/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /城市体育中心/);
  assert.match(archiveSource, /\/demos\/sports-center/);
  assert.match(studioSource, /城市公园 · 体育中心/);
});
