import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLowPolyFoodTruck,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "../app/lib/map/cityFurniture.ts";

test("generates a self-contained low-poly street light with switchable illumination", () => {
  const lamp = buildLowPolyStreetLight();
  assert.equal(lamp.name, "city-street-light-lowpoly");
  assert.equal(lamp.userData.generatedLocally, true);
  const lens = lamp.getObjectByName("street-light-warm-lens");
  assert.ok(lens?.isMesh);
  lamp.userData.setPowered(true);
  assert.ok(lens.material.emissiveIntensity >= 3);
  lamp.userData.setPowered(false);
  assert.ok(lens.material.emissiveIntensity < 1);
});

test("generates a traffic light with vehicle, pedestrian and phase controls", () => {
  const signal = buildLowPolyTrafficLight();
  assert.equal(signal.name, "city-traffic-light-lowpoly");
  assert.equal(signal.userData.generatedLocally, true);
  assert.ok(signal.getObjectByName("traffic-light-vehicle-head"));
  assert.ok(signal.getObjectByName("pedestrian-signal-face"));
  assert.ok(signal.getObjectByName("pedestrian-crossing-button"));
  signal.userData.setPhase("green");
  const lenses = [];
  signal.traverse((object) => {
    if (object.name === "traffic-light-lens") lenses.push(object);
  });
  assert.equal(lenses.length, 3);
  assert.equal(lenses.filter((lens) => lens.material.emissiveIntensity > 3).length, 1);
});

test("generates a roadside food truck with wheels, service hatch and lighting controls", () => {
  const truck = buildLowPolyFoodTruck();
  assert.equal(truck.name, "city-food-truck-lowpoly");
  assert.equal(truck.userData.generatedLocally, true);
  assert.ok(truck.getObjectByName("food-truck-service-body"));
  assert.ok(truck.getObjectByName("food-truck-serving-opening"));
  assert.ok(truck.getObjectByName("food-truck-menu-board"));
  assert.equal(truck.children.filter((child) => child.name === "food-truck-wheel").length, 4);
  const hatch = truck.getObjectByName("food-truck-serving-hatch-pivot");
  truck.userData.setServingOpen(false);
  assert.equal(hatch.rotation.x, 0);
  truck.userData.setServingOpen(true);
  assert.ok(hatch.rotation.x < -1);
  truck.userData.setLights(true);
  assert.ok(truck.getObjectByName("food-truck-serving-light").intensity > 2);
});

test("demo uses the forest normal tree and contains no third-party model or API URL", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.match(source, /tree_normal_medium_redwood_a\.glb/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /buildLowPolyStreetLight/);
  assert.match(source, /buildLowPolyTrafficLight/);
  assert.match(source, /buildLowPolyFoodTruck/);
});
