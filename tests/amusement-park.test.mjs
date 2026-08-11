import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyAmusementPark } from "../app/lib/map/amusementPark.ts";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

test("builds a complete amusement district with ten navigable facility zones", () => {
  const park = buildLowPolyAmusementPark();
  assert.equal(park.name, "city-amusement-park-lowpoly");
  assert.equal(park.userData.generatedLocally, true);
  assert.equal(park.userData.modelType, "amusement-park");
  assert.equal(park.userData.facilityCount, 10);
  assert.equal(park.userData.attractionCount, 12);
  assert.equal(park.userData.cityBuildingCount, 8);
  assert.deepEqual(park.userData.facilities, [
    "overview", "coaster", "carousel", "pirate", "playground", "circus", "shooting", "karting", "ferris", "drop-tower",
  ]);

  assert.ok(park.getObjectByName("amusement-park-grand-entrance"));
  assert.ok(park.getObjectByName("amusement-park-central-fountain"));
  assert.ok(park.getObjectByName("amusement-park-city-skyline"));
  assert.equal(namedObjects(park, "amusement-park-city-building").length, 8);
  assert.equal(namedObjects(park, "amusement-park-perimeter-road").length, 4);
  assert.ok(namedObjects(park, "amusement-park-reused-tree-anchor").length >= 20);
  assert.equal(park.userData.treeAnchorCount, namedObjects(park, "amusement-park-reused-tree-anchor").length);
});

test("reuses existing city decorations instead of rebuilding substitutes", () => {
  const park = buildLowPolyAmusementPark();
  assert.deepEqual(park.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
    "city-food-truck-lowpoly",
  ]);
  assert.equal(namedObjects(park, "city-street-light-lowpoly").length, 20);
  assert.equal(namedObjects(park, "city-roadside-planter-lowpoly").length, 8);
  assert.equal(namedObjects(park, "city-food-truck-lowpoly").length, 2);
  assert.equal(park.userData.streetLightCount, 20);
  assert.equal(park.userData.planterCount, 8);
  assert.equal(park.userData.foodTruckCount, 2);
  assert.equal(namedObjects(park, "amusement-park-tree-trunk").length, 0);
  assert.equal(namedObjects(park, "amusement-park-lamp-post").length, 0);
});

test("includes the flagship animated rides and game venues", () => {
  const park = buildLowPolyAmusementPark();
  assert.equal(namedObjects(park, "amusement-park-coaster-rail").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-car").length, 4);
  assert.ok(namedObjects(park, "amusement-park-coaster-support").length >= 30);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin").length, 14);
  assert.equal(namedObjects(park, "amusement-park-shooting-target").length, 7);
  assert.equal(namedObjects(park, "amusement-park-go-kart").length, 6);
  assert.ok(park.getObjectByName("amusement-park-pirate-pivot"));
  assert.ok(park.getObjectByName("amusement-park-indoor-playground"));
  assert.ok(park.getObjectByName("amusement-park-circus"));
  assert.ok(park.getObjectByName("amusement-park-drop-tower-carriage"));
  assert.ok(park.getObjectByName("amusement-park-bumper-cars"));
  assert.ok(park.getObjectByName("amusement-park-spinning-cups"));
});

test("animates rides, supports pausing, and powers night lighting", () => {
  const park = buildLowPolyAmusementPark();
  const carousel = park.getObjectByName("amusement-park-carousel-turntable");
  const pirate = park.getObjectByName("amusement-park-pirate-pivot");
  const ferris = park.getObjectByName("amusement-park-ferris-wheel-rotor");
  const train = park.getObjectByName("amusement-park-coaster-train");
  assert.ok(carousel && pirate && ferris && train);

  park.userData.update(1, 1);
  assert.notEqual(carousel.rotation.y, 0);
  assert.notEqual(pirate.rotation.z, 0);
  assert.notEqual(ferris.rotation.z, 0);
  const firstCar = namedObjects(park, "amusement-park-coaster-car")[0];
  assert.ok(firstCar.position.length() > 10);

  park.userData.setMotionEnabled(false);
  const previousRotation = carousel.rotation.y;
  park.userData.update(1, 2);
  assert.equal(carousel.rotation.y, previousRotation);

  const bulb = namedObjects(park, "amusement-park-light-bulb")[0];
  const nightLights = namedObjects(park, "street-light-point-light");
  assert.ok(bulb instanceof THREE.Mesh);
  assert.ok(nightLights.length > 10);
  park.userData.setPowered(true);
  assert.ok(bulb.material.emissiveIntensity > 1);
  assert.ok(nightLights.every((light) => light.intensity > 0));
  park.userData.setPowered(false);
  assert.ok(nightLights.every((light) => light.intensity === 0));
});

test("meets the intended independent city-showcase scale", () => {
  const park = buildLowPolyAmusementPark();
  const metrics = measureModelGeometry(park);
  assert.ok(metrics.size.x >= 110);
  assert.ok(metrics.size.y >= 22);
  assert.ok(metrics.size.z >= 80);
  assert.ok(metrics.faceCount > 10_000);
  assert.equal(park.userData.siteSize.x, 112);
  assert.equal(park.userData.siteSize.z, 82);
});

test("exposes the amusement park showroom from the model archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/amusement-park/AmusementParkDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(demoSource, /buildLowPolyAmusementPark/);
  assert.match(demoSource, /奇境都会游乐园/);
  assert.match(demoSource, /云际过山车/);
  assert.match(demoSource, /彩虹翻斗乐/);
  assert.match(demoSource, /极速卡丁车场/);
  assert.match(demoSource, /点亮夜景/);
  assert.match(demoSource, /暂停所有设施/);
  assert.match(demoSource, /返回模型分类/);
  assert.match(demoSource, /\/models\/forest\/tree_normal_medium_redwood_a\.glb/);
  assert.match(demoSource, /\/models\/rabbit-rider\.glb/);
  assert.match(demoSource, /兔子骑车主角约 2\.40 m 参考/);
  assert.doesNotMatch(demoSource, /buildLowPolyRabbitScaleReference/);
  assert.match(archiveSource, /大型游乐园/);
  assert.match(archiveSource, /\/demos\/amusement-park/);
  assert.match(studioSource, /医院 · 游乐园/);
});
