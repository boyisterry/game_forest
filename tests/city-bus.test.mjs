import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildDetailedElectricCityBus } from "../app/lib/map/cityBus.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

test("builds a locally generated 12-metre electric city bus", () => {
  const bus = buildDetailedElectricCityBus();
  assert.equal(bus.name, "transport-electric-city-bus");
  assert.equal(bus.userData.modelType, "electric-city-bus");
  assert.equal(bus.userData.generatedLocally, true);
  assert.deepEqual(bus.userData.dimensions.toArray(), [11.8, 3.65, 2.55]);
  assert.equal(bus.userData.doorCount, 2);
  assert.equal(bus.userData.wheelCount, 4);
  assert.equal(namedObjects(bus, "city-bus-wheel").length, 4);
  assert.equal(namedObjects(bus, "city-bus-front-door-panel").length, 2);
  assert.equal(namedObjects(bus, "city-bus-middle-door-panel").length, 2);
  assert.equal(namedObjects(bus, "city-bus-roof-battery-pack").length, 3);
  assert.ok(bus.getObjectByName("city-bus-roof-hvac"));
  assert.ok(bus.getObjectByName("city-bus-front-destination-display"));
  assert.ok(bus.getObjectByName("city-bus-side-destination-display"));
});

test("keeps the front and rear windscreens transparent without solid end walls behind them", () => {
  const bus = buildDetailedElectricCityBus();
  const front = bus.getObjectByName("city-bus-front-windshield");
  const rear = bus.getObjectByName("city-bus-rear-window");
  assert.ok(front instanceof THREE.Mesh);
  assert.ok(rear instanceof THREE.Mesh);
  for (const window of [front, rear]) {
    assert.equal(window.material.transparent, true);
    assert.ok(window.material.opacity <= 0.25);
    assert.equal(window.material.depthWrite, false);
  }

  assert.equal(bus.getObjectByName("city-bus-front-shell"), undefined, "a solid front cap would block the windscreen");
  assert.equal(bus.getObjectByName("city-bus-rear-shell"), undefined, "a solid rear cap would block the rear window");
  assert.ok(bus.getObjectByName("city-bus-front-lower-shell"));
  assert.ok(bus.getObjectByName("city-bus-front-window-header"));
  assert.ok(bus.getObjectByName("city-bus-rear-lower-shell"));
  assert.ok(bus.getObjectByName("city-bus-rear-window-header"));
  assert.equal(namedObjects(bus, "city-bus-front-window-pillar").length, 2);
  assert.equal(namedObjects(bus, "city-bus-rear-window-pillar").length, 2);
});

test("models a detailed driver zone and passenger cabin", () => {
  const bus = buildDetailedElectricCityBus();
  assert.equal(bus.userData.passengerSeatCount, 24);
  assert.equal(bus.userData.prioritySeatCount, 4);
  assert.equal(namedObjects(bus, "city-bus-passenger-seat").length, 20);
  assert.equal(namedObjects(bus, "city-bus-priority-seat").length, 4);
  assert.equal(namedObjects(bus, "city-bus-grab-handle").length, 12);
  assert.equal(namedObjects(bus, "city-bus-seat-back-grab-rail").length, 24);
  assert.equal(namedObjects(bus, "city-bus-stop-button").length, 8);
  assert.equal(namedObjects(bus, "city-bus-cctv-camera").length, 4);
  assert.equal(namedObjects(bus, "city-bus-ceiling-air-vent").length, 8);
  assert.equal(namedObjects(bus, "city-bus-emergency-hammer").length, 4);
  assert.ok(bus.getObjectByName("city-bus-driver-seat"));
  assert.ok(bus.getObjectByName("city-bus-driver-partition"));
  assert.ok(bus.getObjectByName("city-bus-dashboard"));
  assert.ok(bus.getObjectByName("city-bus-driver-instrument-screen"));
  assert.ok(bus.getObjectByName("city-bus-steering-wheel"));
  assert.ok(bus.getObjectByName("city-bus-fare-console"));
  assert.ok(bus.getObjectByName("city-bus-card-validator"));
  assert.ok(bus.getObjectByName("city-bus-driver-accelerator-pedal"));
  assert.ok(bus.getObjectByName("city-bus-driver-brake-pedal"));
  assert.ok(bus.getObjectByName("city-bus-fire-extinguisher"));
  assert.ok(bus.getObjectByName("city-bus-next-stop-display"));
  assert.ok(bus.getObjectByName("city-bus-route-map-display"));
});

test("provides an accessible wheelchair bay, moving doors and a deployable ramp", () => {
  const bus = buildDetailedElectricCityBus();
  const frontPanels = namedObjects(bus, "city-bus-front-door-panel");
  const rampPivot = bus.getObjectByName("city-bus-wheelchair-ramp-pivot");
  assert.equal(bus.userData.wheelchairSpaceCount, 1);
  assert.ok(bus.getObjectByName("city-bus-wheelchair-space"));
  assert.ok(bus.getObjectByName("city-bus-wheelchair-backrest"));
  assert.ok(bus.getObjectByName("city-bus-wheelchair-handrail"));
  assert.ok(bus.getObjectByName("city-bus-wheelchair-stop-button"));
  assert.ok(bus.getObjectByName("city-bus-wheelchair-ramp"));
  assert.equal(namedObjects(bus, "city-bus-door-safety-threshold").length, 2);
  assert.ok(rampPivot);

  const closedPositions = frontPanels.map((panel) => panel.position.x);
  bus.userData.setDoorsOpen(true);
  assert.ok(frontPanels.every((panel, index) => panel.position.x !== closedPositions[index]));
  bus.userData.setDoorsOpen(false);
  assert.deepEqual(frontPanels.map((panel) => panel.position.x), closedPositions);

  assert.equal(rampPivot.rotation.x, -Math.PI * 0.5);
  bus.userData.setRampDeployed(true);
  assert.equal(rampPivot.rotation.x, 0);
  assert.equal(rampPivot.userData.deployed, true);
  bus.userData.setRampDeployed(false);
  assert.equal(rampPivot.rotation.x, -Math.PI * 0.5);
});

test("supports a right-side interior cutaway and powered lighting", () => {
  const bus = buildDetailedElectricCityBus();
  const nearWindow = namedObjects(bus, "city-bus-side-window").find((window) => window.position.z > 0);
  const farWindow = namedObjects(bus, "city-bus-side-window").find((window) => window.position.z < 0);
  const headlamp = bus.getObjectByName("city-bus-headlamp");
  const pointLights = namedObjects(bus, "city-bus-cabin-point-light");
  assert.ok(nearWindow instanceof THREE.Mesh);
  assert.ok(farWindow instanceof THREE.Mesh);
  assert.ok(headlamp instanceof THREE.Mesh);
  assert.equal(pointLights.length, 3);
  assert.equal(nearWindow.material.transparent, true);
  assert.ok(nearWindow.material.opacity <= 0.25, "bus glazing should remain visibly transparent");
  assert.equal(nearWindow.material.depthWrite, false);
  assert.equal(nearWindow.material.metalness, 0);

  bus.userData.setInteriorCutaway(true);
  assert.equal(nearWindow.visible, false);
  assert.equal(farWindow.visible, true);
  bus.userData.setInteriorCutaway(false);
  assert.equal(nearWindow.visible, true);

  bus.userData.setPowered(true);
  assert.ok(headlamp.material.emissiveIntensity > 3);
  assert.ok(nearWindow.material.emissiveIntensity < 0.1, "night mode should light the cabin rather than the glass");
  assert.ok(pointLights.every((light) => light.intensity > 2));
  bus.userData.setPowered(false);
  assert.ok(headlamp.material.emissiveIntensity < 1);
  assert.ok(pointLights.every((light) => light.intensity === 0));
});

test("reports bus size and creates a separate shattered version", () => {
  const bus = buildDetailedElectricCityBus();
  const metrics = measureModelGeometry(bus);
  assert.ok(metrics.size.x > 11.8 && metrics.size.x < 12.1);
  assert.ok(metrics.size.y > 3.5 && metrics.size.y < 3.8);
  assert.ok(metrics.size.z > 3.2 && metrics.size.z < 3.5, "side mirrors should extend beyond the 2.55 m body");
  assert.ok(metrics.faceCount > 5_000);

  const pair = createFurnitureShatterPair(bus, { seed: 719, trianglesPerShard: 9, spread: 1.28 });
  assert.equal(pair.normal.userData.modelState, "normal");
  assert.equal(pair.shattered.userData.modelState, "shattered");
  assert.ok(pair.shards.length > 300);
  pair.setAmount(1);
  assert.equal(pair.normal.visible, false);
  assert.equal(pair.shattered.visible, true);
});

test("exposes transportation from the archive and includes the existing rider reference", async () => {
  const [demoSource, archiveSource, studioSource, readmeSource] = await Promise.all([
    readFile(new URL("../app/demos/transportation/TransportationDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(demoSource, /buildDetailedElectricCityBus/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(demoSource, /RIDER_FOREGROUND/);
  assert.match(demoSource, /查看精细内饰/);
  assert.match(demoSource, /打开全部车门/);
  assert.match(demoSource, /展开无障碍坡板/);
  assert.match(demoSource, /MODEL SIZE/);
  assert.match(archiveSource, /交通工具/);
  assert.match(archiveSource, /\/demos\/transportation/);
  assert.match(studioSource, /交通工具/);
  assert.match(readmeSource, /纯电公交/);
});
