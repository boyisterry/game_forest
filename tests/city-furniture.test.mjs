import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHotDogKiosk,
  buildLowPolyNewsstand,
  buildLowPolyPhoneBooth,
  buildLowPolyRoadsidePlanter,
  buildLowPolyResidentialBuilding,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "../app/lib/map/cityFurniture.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

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
  assert.equal(lenses[0].material.toneMapped, false);
  assert.equal(lenses[1].material.toneMapped, false);
  assert.equal(lenses[2].material.toneMapped, false);
  assert.equal(lenses[2].material.emissive.getHex(), 0x00f04c);
  signal.userData.setPhase("yellow");
  assert.equal(lenses[0].material.emissiveIntensity, 0);
  assert.ok(lenses[1].material.emissiveIntensity > 3);
  assert.equal(lenses[2].material.emissiveIntensity, 0);
  const spillLight = signal.getObjectByName("traffic-signal-status-light");
  assert.equal(spillLight.position.y, 4.18);
  assert.ok(spillLight.distance < 0.84);
});

test("generates a roadside food truck with wheels, service hatch and lighting controls", () => {
  const truck = buildLowPolyFoodTruck();
  assert.equal(truck.name, "city-food-truck-lowpoly");
  assert.equal(truck.userData.generatedLocally, true);
  assert.equal(truck.getObjectByName("food-truck-service-body"), undefined);
  assert.equal(truck.getObjectByName("food-truck-serving-opening"), undefined);
  assert.ok(truck.getObjectByName("food-truck-interior-floor"));
  assert.ok(truck.getObjectByName("food-truck-interior-far-wall"));
  assert.equal(truck.children.filter((child) => child.name === "food-truck-serving-side-pillar").length, 2);
  assert.ok(truck.userData.occupantSpace.x >= 2.8);
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

test("generates an opening hot-dog kiosk with a grill, canopy and rooftop sign", () => {
  const kiosk = buildLowPolyHotDogKiosk();
  assert.equal(kiosk.name, "city-hot-dog-kiosk-lowpoly");
  assert.equal(kiosk.userData.generatedLocally, true);
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-grill"));
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-canopy"));
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-sign-sausage"));
  assert.equal(kiosk.getObjectByName("hot-dog-kiosk-cabinet"), undefined);
  assert.equal(kiosk.getObjectByName("hot-dog-kiosk-serving-opening"), undefined);
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-interior-floor"));
  assert.equal(kiosk.children.filter((child) => child.name === "hot-dog-kiosk-corner-post" && child.position.z > 0).length, 2);
  assert.ok(kiosk.userData.occupantSpace.x > 2.5);
  assert.ok(kiosk.userData.occupantSpace.y > 2.7);
  const hatch = kiosk.getObjectByName("hot-dog-kiosk-hatch-pivot");
  kiosk.userData.setServingOpen(false);
  assert.equal(hatch.rotation.x, 0);
  kiosk.userData.setServingOpen(true);
  assert.ok(hatch.rotation.x < -1);
});

test("generates a newsstand with layered publications and an opening shutter", () => {
  const stand = buildLowPolyNewsstand();
  assert.equal(stand.name, "city-newsstand-lowpoly");
  assert.equal(stand.userData.generatedLocally, true);
  assert.ok(stand.getObjectByName("newsstand-display-opening"));
  const publications = [];
  stand.traverse((object) => {
    if (object.name === "newsstand-newspaper-magazine") publications.push(object);
  });
  assert.equal(publications.length, 15);
  const shutter = stand.getObjectByName("newsstand-shutter-pivot");
  stand.userData.setOpen(false);
  assert.equal(shutter.rotation.x, 0);
  stand.userData.setOpen(true);
  assert.ok(shutter.rotation.x < -1);
});

test("generates a lit phone booth with a telephone and opening framed door", () => {
  const booth = buildLowPolyPhoneBooth();
  assert.equal(booth.name, "city-phone-booth-lowpoly");
  assert.equal(booth.userData.generatedLocally, true);
  assert.ok(booth.getObjectByName("phone-booth-telephone"));
  assert.ok(booth.getObjectByName("phone-booth-handset"));
  const door = booth.getObjectByName("phone-booth-door-pivot");
  booth.userData.setDoorOpen(false);
  assert.equal(door.rotation.y, 0);
  booth.userData.setDoorOpen(true);
  assert.ok(door.rotation.y < -1);
  booth.userData.setPowered(true);
  assert.ok(booth.getObjectByName("phone-booth-interior-light").intensity > 2);
});

test("generates a long roadside planter with masonry, soil, shrubs and flowers", () => {
  const planter = buildLowPolyRoadsidePlanter();
  assert.equal(planter.name, "city-roadside-planter-lowpoly");
  assert.equal(planter.userData.generatedLocally, true);
  assert.ok(planter.getObjectByName("roadside-planter-soil-bed"));
  assert.equal(planter.children.filter((child) => child.name === "roadside-planter-shrub").length, 4);
  assert.equal(planter.children.filter((child) => child.name === "roadside-planter-flower-blossom").length, 8);
  assert.equal(planter.userData.plantingSlots.length, 12);
  const metrics = measureModelGeometry(planter);
  assert.ok(metrics.size.x > 6);
  assert.ok(metrics.size.x > metrics.size.z * 3);
  assert.ok(metrics.faceCount > 400);
});

test("generates a five-storey residential building with balconies and rooftop details", () => {
  const building = buildLowPolyResidentialBuilding();
  assert.equal(building.name, "city-residential-building-lowpoly");
  assert.equal(building.userData.generatedLocally, true);
  assert.equal(building.userData.floorCount, 5);
  assert.equal(building.userData.apartmentCount, 20);
  assert.ok(building.getObjectByName("residential-building-entrance"));
  assert.ok(building.getObjectByName("residential-building-water-tank"));
  assert.equal(building.children.filter((child) => child.name === "residential-building-balcony-floor").length, 8);
  assert.equal(building.children.filter((child) => child.name === "residential-building-air-conditioner").length, 2);
  const metrics = measureModelGeometry(building);
  assert.ok(metrics.size.y > 10);
  assert.ok(metrics.size.x > 7);
  assert.ok(metrics.faceCount > 1_000);
});

test("generates a two-storey small villa with a gable roof, porch and terrace", () => {
  const villa = buildLowPolySmallVilla();
  assert.equal(villa.name, "city-small-villa-lowpoly");
  assert.equal(villa.userData.generatedLocally, true);
  assert.equal(villa.userData.floorCount, 2);
  assert.ok(villa.getObjectByName("small-villa-gable-roof"));
  assert.ok(villa.getObjectByName("small-villa-front-door"));
  assert.ok(villa.getObjectByName("small-villa-porch-roof"));
  assert.ok(villa.getObjectByName("small-villa-terrace"));
  assert.ok(villa.getObjectByName("small-villa-chimney"));
  assert.equal(villa.children.filter((child) => child.name === "small-villa-shrub").length, 2);
  const metrics = measureModelGeometry(villa);
  assert.ok(metrics.size.y > 6);
  assert.ok(metrics.size.x > 7);
  assert.ok(metrics.faceCount > 400);
});

test("creates separate normal and shattered versions from real low-poly triangles", () => {
  const lamp = buildLowPolyStreetLight();
  const pair = createFurnitureShatterPair(lamp, { seed: 31, trianglesPerShard: 4 });
  assert.equal(pair.normal, lamp);
  assert.equal(pair.normal.userData.modelState, "normal");
  assert.equal(pair.shattered.userData.modelState, "shattered");
  assert.ok(pair.shards.length > 12);
  assert.equal(pair.normal.visible, true);
  assert.equal(pair.shattered.visible, false);
  const initial = pair.shards[0].home.clone();
  pair.setAmount(1);
  assert.equal(pair.normal.visible, false);
  assert.equal(pair.shattered.visible, true);
  assert.ok(pair.shards[0].mesh.position.distanceTo(initial) > 0.25);
  pair.setAmount(0);
  assert.equal(pair.normal.visible, true);
  assert.equal(pair.shattered.visible, false);
});

test("measures exact model bounds and rendered triangle counts", () => {
  const signal = buildLowPolyTrafficLight();
  const metrics = measureModelGeometry(signal);
  assert.ok(metrics.size.x > 2.5);
  assert.ok(metrics.size.y > 5);
  assert.ok(metrics.size.z > 1);
  assert.ok(Number.isInteger(metrics.faceCount));
  assert.ok(metrics.faceCount > 300);
});

test("demo uses the forest normal tree and contains no third-party model or API URL", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.match(source, /tree_normal_medium_redwood_a\.glb/);
  assert.match(source, /tree_medium_redwood_a\.glb/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /buildLowPolyStreetLight/);
  assert.match(source, /buildLowPolyTrafficLight/);
  assert.match(source, /buildLowPolyFoodTruck/);
  assert.match(source, /buildLowPolyHotDogKiosk/);
  assert.match(source, /buildLowPolyNewsstand/);
  assert.match(source, /buildLowPolyPhoneBooth/);
  assert.match(source, /buildLowPolyRoadsidePlanter/);
  assert.match(source, /buildLowPolyResidentialBuilding/);
  assert.match(source, /buildLowPolySmallVilla/);
  assert.match(source, /createFurnitureShatterPair/);
  assert.match(source, /ShatterMorphController/);
  assert.match(source, /破碎所有装饰/);
});

test("every showcase card exposes expandable model data", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/number: "MODEL \d{2}"/g)?.length, 10);
  assert.equal(source.match(/stats: \[/g)?.length, 10);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{`model-data-\$\{model\.id\}`\}/);
  assert.match(source, /查看参数 \+/);
  assert.match(source, /收起参数 −/);
  assert.match(source, /模型大小（宽 × 高 × 深）/);
  assert.match(source, /模型面数/);
  assert.match(source, /measureModelGeometry/);
});
