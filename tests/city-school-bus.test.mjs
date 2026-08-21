import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildDetailedSchoolBus } from "../app/lib/map/citySchoolBus.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

test("builds a locally generated Chinese school bus", () => {
  const bus = buildDetailedSchoolBus();
  assert.equal(bus.name, "transport-school-bus");
  assert.equal(bus.userData.modelType, "school-bus");
  assert.equal(bus.userData.generatedLocally, true);
  assert.deepEqual(bus.userData.dimensions.toArray(), [9.6, 3.2, 2.5]);
  assert.equal(bus.userData.doorCount, 2);
  assert.equal(bus.userData.wheelCount, 6);
  assert.equal(bus.userData.warningLightCount, 8);
  assert.equal(namedObjects(bus, "city-school-bus-wheel").length, 6);
  assert.equal(namedObjects(bus, "city-school-bus-passenger-door-panel").length, 2);
  assert.ok(bus.getObjectByName("city-school-bus-hood"));
  assert.ok(bus.getObjectByName("city-school-bus-grille"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-emergency-door"));
  assert.ok(bus.getObjectByName("city-school-bus-front-destination-display"));
  assert.ok(bus.getObjectByName("city-school-bus-side-lettering"));
  assert.equal(namedObjects(bus, "city-school-bus-rub-rail").length, 6);
});

test("keeps glazing transparent and the conventional hooded front open behind the windshield", () => {
  const bus = buildDetailedSchoolBus();
  const front = bus.getObjectByName("city-school-bus-front-windshield");
  const rear = bus.getObjectByName("city-school-bus-rear-emergency-window");
  assert.ok(front instanceof THREE.Mesh);
  assert.ok(rear instanceof THREE.Mesh);
  for (const window of [front, rear]) {
    assert.equal(window.material.transparent, true);
    assert.ok(window.material.opacity <= 0.25);
    assert.equal(window.material.depthWrite, false);
  }

  assert.equal(bus.getObjectByName("city-school-bus-front-shell"), undefined, "a solid front cap would block the windscreen");
  assert.ok(bus.getObjectByName("city-school-bus-front-lower-shell"));
  assert.ok(bus.getObjectByName("city-school-bus-front-window-header"));
  assert.equal(namedObjects(bus, "city-school-bus-front-window-pillar").length, 2);
});

test("models a child passenger cabin and a separated driver zone", () => {
  const bus = buildDetailedSchoolBus();
  assert.equal(bus.userData.passengerSeatCount, 20);
  assert.equal(namedObjects(bus, "city-school-bus-passenger-seat").length, 20);
  assert.equal(namedObjects(bus, "city-school-bus-seat-belt").length, 20);
  assert.equal(namedObjects(bus, "city-school-bus-grab-handle").length, 6);
  assert.equal(namedObjects(bus, "city-school-bus-emergency-hammer").length, 4);
  assert.equal(namedObjects(bus, "city-school-bus-cctv-camera").length, 4);
  assert.equal(namedObjects(bus, "city-school-bus-ceiling-air-vent").length, 8);
  assert.ok(bus.getObjectByName("city-school-bus-driver-seat"));
  assert.ok(bus.getObjectByName("city-school-bus-driver-partition"));
  assert.ok(bus.getObjectByName("city-school-bus-dashboard"));
  assert.ok(bus.getObjectByName("city-school-bus-driver-instrument-screen"));
  assert.ok(bus.getObjectByName("city-school-bus-steering-wheel"));
  assert.ok(bus.getObjectByName("city-school-bus-driver-accelerator-pedal"));
  assert.ok(bus.getObjectByName("city-school-bus-driver-brake-pedal"));
  assert.ok(bus.getObjectByName("city-school-bus-fire-extinguisher"));
  assert.ok(bus.getObjectByName("city-school-bus-central-aisle"));
});

test("opens the passenger door, rear emergency door and stop arm", () => {
  const bus = buildDetailedSchoolBus();
  const doorPanels = namedObjects(bus, "city-school-bus-passenger-door-panel");
  const rearDoor = bus.getObjectByName("city-school-bus-rear-emergency-door");
  const stopArm = bus.getObjectByName("city-school-bus-stop-arm-pivot");
  assert.equal(doorPanels.length, 2);
  assert.ok(rearDoor);
  assert.ok(stopArm);
  assert.ok(bus.getObjectByName("city-school-bus-stop-arm-paddle"));
  assert.ok(bus.getObjectByName("city-school-bus-crossing-gate"));
  assert.equal(namedObjects(bus, "city-school-bus-roof-warning-light").length, 8);

  const closedPositions = doorPanels.map((panel) => panel.position.x);
  const closedRearRotation = rearDoor.rotation.y;
  bus.userData.setDoorsOpen(true);
  assert.ok(doorPanels.every((panel, index) => panel.position.x !== closedPositions[index]));
  assert.notEqual(rearDoor.rotation.y, closedRearRotation);
  assert.ok(rearDoor.rotation.y > 0, "the rear emergency door must swing outward behind the bus");
  bus.userData.setDoorsOpen(false);
  assert.deepEqual(doorPanels.map((panel) => panel.position.x), closedPositions);
  assert.equal(rearDoor.rotation.y, closedRearRotation);

  assert.equal(stopArm.rotation.y, 0);
  bus.userData.setStopArmExtended(true);
  assert.ok(Math.abs(stopArm.rotation.y) > 1);
  assert.equal(stopArm.userData.extended, true);
  bus.userData.setStopArmExtended(false);
  assert.equal(stopArm.rotation.y, 0);
});

test("builds an integrated and road-ready rear body end", () => {
  const bus = buildDetailedSchoolBus();
  const rearEnd = bus.getObjectByName("city-school-bus-rear-body-end");
  const rearDoor = bus.getObjectByName("city-school-bus-rear-emergency-door");
  const rearDoorPanel = bus.getObjectByName("city-school-bus-rear-emergency-door-panel");
  const rearDoorFrame = bus.getObjectByName("city-school-bus-rear-emergency-door-frame");
  const rearWindow = bus.getObjectByName("city-school-bus-rear-emergency-window");
  assert.ok(rearEnd);
  assert.equal(rearEnd.userData.integratedBodyEnd, true);
  assert.ok(rearDoor);
  assert.equal(rearDoor.userData.opensOutward, true);
  assert.ok(rearDoorPanel instanceof THREE.Group);
  assert.ok(rearDoorFrame instanceof THREE.Group);
  assert.ok(rearWindow instanceof THREE.Mesh);
  assert.equal(namedObjects(bus, "city-school-bus-rear-corner-panel").length, 2);
  assert.equal(namedObjects(bus, "city-school-bus-rear-corner-pillar").length, 2);
  assert.equal(namedObjects(bus, "city-school-bus-rear-emergency-door-hinge").length, 3);
  assert.equal(namedObjects(bus, "city-school-bus-rear-lamp-housing").length, 2);
  assert.equal(namedObjects(bus, "city-school-bus-tail-light").length, 2);
  assert.equal(namedObjects(bus, "city-school-bus-rear-indicator").length, 2);
  assert.equal(namedObjects(bus, "city-school-bus-reverse-light").length, 2);
  assert.ok(bus.getObjectByName("city-school-bus-rear-lower-shell"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-window-header"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-roof-cap"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-door-sill"));
  assert.ok(bus.getObjectByName("city-school-bus-high-mounted-brake-light"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-license-plate"));
  assert.ok(bus.getObjectByName("city-school-bus-rear-camera"));

  bus.updateMatrixWorld(true);
  const doorBounds = new THREE.Box3().setFromObject(rearDoorPanel);
  const frameBounds = new THREE.Box3().setFromObject(rearDoorFrame);
  assert.ok(doorBounds.min.y >= frameBounds.min.y && doorBounds.max.y <= frameBounds.max.y);
  assert.ok(doorBounds.min.z >= frameBounds.min.z && doorBounds.max.z <= frameBounds.max.z);

  const warningLights = namedObjects(bus, "city-school-bus-roof-warning-light");
  assert.equal(warningLights.length, 8);
  assert.equal(warningLights.filter((light) => light.userData.mounting === "rear-upper-face").length, 4);
  assert.equal(warningLights.filter((light) => light.userData.mounting === "front-upper-face").length, 4);
  assert.ok(warningLights.every((light) => Math.abs(light.rotation.z - Math.PI * 0.5) < 1e-6));
  assert.ok(warningLights.every((light) => light.position.y < 3), "warning lights must not float on the roof");
});

test("supports a right-side interior cutaway and powered warning lights", () => {
  const bus = buildDetailedSchoolBus();
  const nearWindow = namedObjects(bus, "city-school-bus-side-window").find((window) => window.position.z > 0);
  const farWindow = namedObjects(bus, "city-school-bus-side-window").find((window) => window.position.z < 0);
  const headlamp = bus.getObjectByName("city-school-bus-headlamp");
  const warning = bus.getObjectByName("city-school-bus-roof-warning-light");
  const pointLights = namedObjects(bus, "city-school-bus-cabin-point-light");
  assert.ok(nearWindow instanceof THREE.Mesh);
  assert.ok(farWindow instanceof THREE.Mesh);
  assert.ok(headlamp instanceof THREE.Mesh);
  assert.ok(warning instanceof THREE.Mesh);
  assert.equal(pointLights.length, 3);
  assert.equal(nearWindow.material.transparent, true);
  assert.ok(nearWindow.material.opacity <= 0.25);
  assert.equal(nearWindow.material.depthWrite, false);

  bus.userData.setInteriorCutaway(true);
  assert.equal(nearWindow.visible, false);
  assert.equal(farWindow.visible, true);
  bus.userData.setInteriorCutaway(false);
  assert.equal(nearWindow.visible, true);

  bus.userData.setPowered(true);
  assert.ok(headlamp.material.emissiveIntensity > 3);
  assert.ok(warning.material.emissiveIntensity > 2);
  assert.ok(nearWindow.material.emissiveIntensity < 0.1);
  assert.ok(pointLights.every((light) => light.intensity > 2));
  bus.userData.setPowered(false);
  assert.ok(headlamp.material.emissiveIntensity < 1);
  assert.ok(pointLights.every((light) => light.intensity === 0));
});

test("reports school bus size and creates a separate shattered version", () => {
  const bus = buildDetailedSchoolBus();
  const metrics = measureModelGeometry(bus);
  assert.ok(metrics.size.x > 9.6 && metrics.size.x < 10.2);
  assert.ok(metrics.size.y > 3.15 && metrics.size.y < 3.55);
  assert.ok(metrics.size.z > 3.1 && metrics.size.z < 3.7, "mirrors and stop arm should extend beyond the 2.5 m body");
  assert.ok(metrics.faceCount > 4_500);

  const pair = createFurnitureShatterPair(bus, { seed: 787, trianglesPerShard: 9, spread: 1.18 });
  assert.equal(pair.normal.userData.modelState, "normal");
  assert.equal(pair.shattered.userData.modelState, "shattered");
  assert.ok(pair.shards.length > 280);
  pair.setAmount(1);
  assert.equal(pair.normal.visible, false);
  assert.equal(pair.shattered.visible, true);
});

test("registers the school bus in the transportation showroom", async () => {
  const [demoSource, archiveSource, pageSource, readmeSource] = await Promise.all([
    readFile(new URL("../app/demos/transportation/TransportationDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/transportation/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(demoSource, /buildDetailedSchoolBus/);
  assert.match(demoSource, /专用校车/);
  assert.match(demoSource, /展开停车警示臂/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /公交 \/ 校车 \/ 出租车 \/ 轿车 \/ SUV/);
  assert.match(pageSource, /校车/);
  assert.match(readmeSource, /校车/);
});
