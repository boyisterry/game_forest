import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCityWorld,
  clampToCity,
  getCityRoadDimensions,
  sampleCitySurface,
  CITY_MAX_Z,
  CITY_MIN_X,
} from "../app/lib/map/city.ts";
import { CollisionWorld } from "../app/lib/map/collision.ts";
import { DEFAULT_SETTINGS } from "../app/lib/map/types.ts";

test("builds a playable five-district city with a delivery loop", () => {
  const collision = new CollisionWorld();
  const city = buildCityWorld(
    { ...DEFAULT_SETTINGS, mapType: "city", cityDensity: 1, roadWidth: 8, deliveryStops: 8 },
    collision,
  );

  assert.equal(city.group.name, "rain-harbor-city");
  assert.ok(city.buildings >= 70, `expected a substantial skyline, got ${city.buildings}`);
  assert.ok(city.streetLights >= 100, `expected lit streets, got ${city.streetLights}`);
  assert.ok(city.roadPoints.length >= 200, "delivery route should be smoothly sampled");
  assert.equal(city.stops.length, 8);
  assert.ok(city.group.children.length >= 10, "city should contain roads, buildings, furniture and coast");
});

test("city clamp keeps riding on land and inside the coastal edge", () => {
  assert.deepEqual(clampToCity(-9999, 9999, 10), { x: CITY_MIN_X + 10, z: CITY_MAX_Z - 10 });
});

test("city streets use narrow motor lanes with raised sidewalks and corner ramps", () => {
  const road = getCityRoadDimensions(8);
  assert.ok(road.motorWidth <= 22, `motor roadway should stay compact, got ${road.motorWidth}`);
  assert.equal(road.bikeLaneWidth, 3.2);
  assert.equal(road.sidewalkWidth, 5.2);

  const sidewalk = sampleCitySurface(-820 + road.streetOuter + 2, -900, 8);
  const cornerRamp = sampleCitySurface(-820 + road.streetOuter + 2, -640 + road.streetOuter + 1, 8);
  assert.ok(sidewalk.height > 0.2, "sidewalk should be one curb step above the road");
  assert.ok(cornerRamp.height > 0 && cornerRamp.height < sidewalk.height, "intersection corner should slope between road and sidewalk");
});

test("crosswalks and bike-lane boundaries are flat white road markings", () => {
  const city = buildCityWorld(
    { ...DEFAULT_SETTINGS, mapType: "city", roadWidth: 8 },
    new CollisionWorld(),
  );
  const crosswalk = city.group.getObjectByName("city-crosswalk-markings");
  const bikeLaneDashes = city.group.children.filter((child) => child.name === "city-bike-lane-dashes");

  assert.ok(crosswalk?.isInstancedMesh);
  assert.equal(crosswalk.geometry.type, "PlaneGeometry", "crosswalk paint should have no raised box geometry");
  assert.equal(crosswalk.userData.surfaceMarking, true);
  assert.equal(bikeLaneDashes.length, 18, "each road should have two dashed bike-lane boundaries");
  assert.ok(bikeLaneDashes.every((line) => line.geometry.type === "PlaneGeometry"));
  assert.ok(bikeLaneDashes.every((line) => line.userData.surfaceMarking === true));
});
