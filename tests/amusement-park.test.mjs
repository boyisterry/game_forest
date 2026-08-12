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
  assert.ok(park.getObjectByName("amusement-park-protection-fence"));
  assert.equal(park.userData.fenceSegmentCount, 5);
  assert.equal(namedObjects(park, "amusement-park-protection-fence-segment").length, 5);
  assert.ok(namedObjects(park, "amusement-park-fence-post").length > 200);
  assert.equal(namedObjects(park, "amusement-park-fence-horizontal-rail").length, 10);
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
  assert.equal(namedObjects(park, "city-street-light-lowpoly").length, 22);
  assert.equal(namedObjects(park, "city-roadside-planter-lowpoly").length, 8);
  assert.equal(namedObjects(park, "city-food-truck-lowpoly").length, 2);
  assert.equal(park.userData.streetLightCount, 22);
  assert.equal(park.userData.planterCount, 8);
  assert.equal(park.userData.foodTruckCount, 2);
  assert.equal(namedObjects(park, "amusement-park-tree-trunk").length, 0);
  assert.equal(namedObjects(park, "amusement-park-lamp-post").length, 0);
});

test("includes the flagship animated rides and game venues", () => {
  const park = buildLowPolyAmusementPark();
  assert.equal(namedObjects(park, "amusement-park-coaster-rail").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-car").length, 4);
  assert.ok(namedObjects(park, "amusement-park-coaster-support").length >= 45);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-seat").length, 72);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-safety-panel").length, 48);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-glass-wall").length, 48);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-glass-roof").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-handrail").length, 24);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-door-frame").length, 12);
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
  assert.ok(metrics.size.x >= 178);
  assert.ok(metrics.size.y >= 39);
  assert.ok(metrics.size.z >= 128);
  assert.ok(metrics.faceCount > 10_000);
  assert.equal(park.userData.siteSize.x, 180);
  assert.equal(park.userData.siteSize.z, 130);
  assert.equal(park.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(park.userData.rideScaleStandard, "rabbit-rider");
  assert.equal(park.userData.ferrisCabinCapacity, 6);
});

test("sizes every major ride against the 2.4 metre rabbit-rider reference", () => {
  const park = buildLowPolyAmusementPark();
  park.updateMatrixWorld(true);
  const sizeOf = (name) => new THREE.Box3().setFromObject(park.getObjectByName(name)).getSize(new THREE.Vector3());
  const carousel = sizeOf("amusement-park-carousel");
  const horse = sizeOf("amusement-park-carousel-horse");
  const ferris = sizeOf("amusement-park-ferris-wheel");
  const cabin = sizeOf("amusement-park-ferris-cabin");
  const pirate = sizeOf("amusement-park-pirate-ship");
  const coaster = sizeOf("amusement-park-roller-coaster");
  const dropTower = sizeOf("amusement-park-drop-tower");

  assert.ok(carousel.x >= 18, "carousel should read as a full-size pavilion");
  assert.ok(Math.max(horse.x, horse.z) >= 3.2, "carousel horse should exceed the 2.4 m rider reference");
  assert.ok(ferris.y >= 36, "Ferris wheel should be a skyline-scale attraction");
  assert.ok(cabin.x >= 4.8 && cabin.z >= 2.7, "Ferris cabin should fit two rows of passengers");
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin").every((item) => item.userData.capacity === 6));
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin").every((item) => item.userData.enclosure === "sealed-glass"));
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin-glass-wall").every((item) => item.material.transparent));
  assert.ok(pirate.x >= 17, "pirate ship should carry a full passenger deck");
  assert.ok(coaster.y >= 32, "roller coaster should rise above nearby buildings");
  assert.ok(dropTower.y >= 38, "drop tower should remain the tallest vertical ride");
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
