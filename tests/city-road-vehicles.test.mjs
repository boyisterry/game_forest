import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  buildDetailedElectricTaxi,
  buildDetailedPrivateSedan,
  buildDetailedPrivateSuv,
} from "../app/lib/map/cityRoadVehicles.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

const VEHICLES = [
  { kind: "taxi", build: buildDetailedElectricTaxi, dimensions: [4.76, 1.58, 1.84] },
  { kind: "sedan", build: buildDetailedPrivateSedan, dimensions: [4.68, 1.47, 1.86] },
  { kind: "suv", build: buildDetailedPrivateSuv, dimensions: [4.86, 1.8, 1.98] },
];

test("builds three distinct locally generated five-seat road vehicles", () => {
  for (const scenario of VEHICLES) {
    const vehicle = scenario.build();
    assert.equal(vehicle.name, `transport-detailed-${scenario.kind}`);
    assert.equal(vehicle.userData.modelType, "detailed-road-vehicle");
    assert.equal(vehicle.userData.vehicleKind, scenario.kind);
    assert.equal(vehicle.userData.generatedLocally, true);
    assert.deepEqual(vehicle.userData.dimensions.toArray(), scenario.dimensions);
    assert.equal(vehicle.userData.seatCount, 5);
    assert.equal(vehicle.userData.doorCount, 4);
    assert.equal(vehicle.userData.wheelCount, 4);
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-wheel`).length, 4);
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-door-panel`).length, 4);
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-wheel-spoke`).length, 20);
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-rear-passenger-seat`).length, 3);
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-driver-seat`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-front-passenger-seat`));
  }
});

test("gives every vehicle a detailed transparent cabin and driver controls", () => {
  for (const scenario of VEHICLES) {
    const vehicle = scenario.build();
    const windshield = vehicle.getObjectByName(`city-${scenario.kind}-front-windshield`);
    assert.ok(windshield instanceof THREE.Mesh);
    assert.equal(windshield.material.transparent, true);
    assert.ok(windshield.material.opacity <= 0.2);
    assert.equal(windshield.material.depthWrite, false);
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-dashboard`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-digital-instrument`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-infotainment-screen`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-steering-wheel`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-center-console`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-drive-selector`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-cargo-floor`));
    assert.ok(vehicle.getObjectByName(`city-${scenario.kind}-cargo-shelf`));
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-brake-disc`).length, 4);
    assert.equal(namedObjects(vehicle, `city-${scenario.kind}-brake-caliper`).length, 4);
  }
});

test("adds taxi service equipment without copying it to private cars", () => {
  const taxi = buildDetailedElectricTaxi();
  assert.ok(taxi.getObjectByName("city-taxi-roof-sign"));
  assert.ok(taxi.getObjectByName("city-taxi-fare-meter"));
  assert.ok(taxi.getObjectByName("city-taxi-rear-service-screen"));
  assert.ok(taxi.getObjectByName("city-taxi-driver-licence-display"));

  for (const privateCar of [buildDetailedPrivateSedan(), buildDetailedPrivateSuv()]) {
    assert.equal(privateCar.getObjectByName(`city-${privateCar.userData.vehicleKind}-fare-meter`), undefined);
    assert.equal(privateCar.getObjectByName(`city-${privateCar.userData.vehicleKind}-roof-sign`), undefined);
  }
});

test("distinguishes the low sedan from the higher utility SUV", () => {
  const sedan = buildDetailedPrivateSedan();
  const suv = buildDetailedPrivateSuv();
  assert.ok(sedan.getObjectByName("city-sedan-panoramic-roof"));
  assert.equal(namedObjects(sedan, "city-sedan-roof-rail").length, 0);
  assert.equal(namedObjects(suv, "city-suv-roof-rail").length, 2);
  assert.ok(suv.getObjectByName("city-suv-panoramic-roof"));
  assert.ok(suv.getObjectByName("city-suv-front-skid-plate"));
  assert.ok(suv.getObjectByName("city-suv-rear-skid-plate"));
  assert.ok(suv.getObjectByName("city-suv-trunk-window"));
  assert.equal(suv.getObjectByName("city-suv-trunk-hatch"), undefined, "the SUV tailgate must not hide a solid wall behind its glass");
  assert.ok(suv.userData.dimensions.y > sedan.userData.dimensions.y);
  assert.ok(suv.userData.dimensions.z > sedan.userData.dimensions.z);
});

test("opens four doors and the cargo hatch, exposes the cabin, and powers lights", () => {
  for (const scenario of VEHICLES) {
    const vehicle = scenario.build();
    const frontDoor = vehicle.getObjectByName(`city-${scenario.kind}-front-door-pivot`);
    const trunk = vehicle.getObjectByName(`city-${scenario.kind}-trunk-pivot`);
    const roof = vehicle.getObjectByName(`city-${scenario.kind}-roof`);
    const headlamp = vehicle.getObjectByName(`city-${scenario.kind}-headlamp`);
    const cabinLights = namedObjects(vehicle, `city-${scenario.kind}-cabin-light`);
    assert.ok(frontDoor && trunk && roof);
    assert.ok(headlamp instanceof THREE.Mesh);

    vehicle.userData.setDoorsOpen(true);
    assert.notEqual(frontDoor.rotation.y, 0);
    vehicle.userData.setDoorsOpen(false);
    assert.equal(frontDoor.rotation.y, 0);
    vehicle.userData.setTrunkOpen(true);
    assert.notEqual(trunk.rotation.z, 0);
    assert.equal(trunk.userData.open, true);
    vehicle.userData.setTrunkOpen(false);
    assert.equal(trunk.rotation.z, 0);
    vehicle.userData.setInteriorCutaway(true);
    assert.equal(roof.visible, false);
    vehicle.userData.setInteriorCutaway(false);
    assert.equal(roof.visible, true);
    vehicle.userData.setPowered(true);
    assert.ok(headlamp.material.emissiveIntensity > 4);
    assert.ok(cabinLights.every((light) => light.intensity > 1));
    vehicle.userData.setPowered(false);
    assert.ok(cabinLights.every((light) => light.intensity === 0));
  }
});

test("reports model parameters and creates independent shattered derivatives", () => {
  for (const [index, scenario] of VEHICLES.entries()) {
    const vehicle = scenario.build();
    const metrics = measureModelGeometry(vehicle);
    assert.ok(metrics.size.x > scenario.dimensions[0]);
    assert.ok(metrics.size.y >= scenario.dimensions[1]);
    assert.ok(metrics.size.z > scenario.dimensions[2], "mirrors should extend beyond the body width");
    assert.ok(metrics.faceCount > 2_300);
    const pair = createFurnitureShatterPair(vehicle, { seed: 733 + index * 18, trianglesPerShard: 7, spread: 0.72 });
    assert.equal(pair.normal.userData.modelState, "normal");
    assert.equal(pair.shattered.userData.modelState, "shattered");
    assert.ok(pair.shards.length > 300);
  }
});

test("registers taxi, sedan and SUV in the transportation showroom", async () => {
  const [demoSource, archiveSource, pageSource] = await Promise.all([
    readFile(new URL("../app/demos/transportation/TransportationDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/transportation/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildDetailedElectricTaxi/);
  assert.match(demoSource, /buildDetailedPrivateSedan/);
  assert.match(demoSource, /buildDetailedPrivateSuv/);
  assert.match(demoSource, /精细电动出租车/);
  assert.match(demoSource, /私家小轿车/);
  assert.match(demoSource, /私家 SUV/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(demoSource, /破碎全部载具/);
  assert.match(archiveSource, /公交 \/ 校车 \/ 出租车 \/ 轿车 \/ SUV/);
  assert.match(pageSource, /校车、出租车、私家小轿车和SUV/);
});
