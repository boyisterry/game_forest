import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  buildCityWorld,
  clampToCity,
  getCityRoadProfiles,
  getCityRoadWidthRange,
  getCitySignalCornerOrientation,
  sampleCitySurface,
  CITY_COAST_RAIL_Z,
  CITY_EAST_FENCE_X,
  CITY_MAX_Z,
  CITY_NORTH_FENCE_Z,
  CITY_WATER_Y,
  CITY_WEST_FENCE_X,
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
  assert.ok(city.trafficLights >= 40, `expected signals at active intersections, got ${city.trafficLights}`);
  assert.ok(city.roadPoints.length >= 200, "delivery route should be smoothly sampled");
  assert.equal(city.stops.length, 8);
  assert.ok(city.group.children.length >= 10, "city should contain roads, buildings, furniture and coast");
  const lamps = city.group.getObjectByName("city-showroom-street-lights");
  const trees = city.group.getObjectByName("city-showroom-street-trees");
  const redSignals = city.group.getObjectByName("city-showroom-traffic-lights-red");
  const greenSignals = city.group.getObjectByName("city-showroom-traffic-lights-green");
  assert.equal(lamps?.userData.sourceModel, "city-street-light-lowpoly");
  assert.equal(lamps?.userData.instanceCount, city.streetLights);
  assert.equal(lamps?.userData.heightScale, 1.32);
  assert.equal(trees?.userData.sourceModel, "tree_normal_medium_redwood_a.glb");
  assert.equal(trees?.userData.instanceCount, city.streetTrees);
  assert.equal((redSignals?.userData.instanceCount ?? 0) + (greenSignals?.userData.instanceCount ?? 0), city.trafficLights);
  assert.equal(redSignals?.userData.heightScale, 1.25);
  assert.equal(greenSignals?.userData.heightScale, 1.25);
  assert.ok(redSignals?.getObjectByName("city-showroom-traffic-lights-red-leftArm-traffic-light-lens"));
  assert.ok(greenSignals?.getObjectByName("city-showroom-traffic-lights-green-rightArm-traffic-light-lens"));
});

test("only the two highlighted diagonal traffic lights rotate toward the arrows", () => {
  assert.deepEqual(getCitySignalCornerOrientation(-1, -1), { rotationY: Math.PI * 0.5, armSide: -1 });
  assert.deepEqual(getCitySignalCornerOrientation(1, -1), { rotationY: 0, armSide: -1 });
  assert.deepEqual(getCitySignalCornerOrientation(-1, 1), { rotationY: Math.PI, armSide: -1 });
  assert.deepEqual(getCitySignalCornerOrientation(1, 1), { rotationY: -Math.PI * 0.5, armSide: -1 });
});

test("delivery beacons stay on sidewalks and clear of roads and intersections", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const city = buildCityWorld(
    { ...DEFAULT_SETTINGS, mapType: "city", roadWidth: 8, deliveryStops: 12 },
    new CollisionWorld(),
  );
  const markers = city.group.getObjectByName("city-delivery-stop-markers");
  assert.equal(city.stops.length, 12);
  assert.ok(markers?.userData.safeCandidateCount > city.stops.length);
  for (const stop of city.stops) {
    const insideAnyRoad = profiles.x.some((road) => stop.z >= road.start && stop.z <= road.end
      && Math.abs(stop.x - road.position) <= road.streetOuter)
      || profiles.z.some((road) => stop.x >= road.start && stop.x <= road.end
        && Math.abs(stop.z - road.position) <= road.streetOuter);
    assert.equal(insideAnyRoad, false, `delivery beacon at ${stop.x},${stop.z} must not occupy a road`);

    const onSidewalk = profiles.x.some((road) => stop.z >= road.start && stop.z <= road.end
      && Math.abs(stop.x - road.position) > road.streetOuter
      && Math.abs(stop.x - road.position) < road.streetOuter + road.sidewalkWidth)
      || profiles.z.some((road) => stop.x >= road.start && stop.x <= road.end
        && Math.abs(stop.z - road.position) > road.streetOuter
        && Math.abs(stop.z - road.position) < road.streetOuter + road.sidewalkWidth);
    assert.equal(onSidewalk, true, `delivery beacon at ${stop.x},${stop.z} should sit on a sidewalk`);
  }
});

test("city clamp keeps riding on land and inside the coastal edge", () => {
  assert.deepEqual(clampToCity(-9999, 9999, 10), { x: CITY_WEST_FENCE_X + 10, z: CITY_COAST_RAIL_Z - 10 });
});

test("north, west and east edges are occupied by fenced restricted compounds", () => {
  const collision = new CollisionWorld();
  const city = buildCityWorld({ ...DEFAULT_SETTINGS, mapType: "city" }, collision);
  const compounds = city.group.getObjectByName("city-restricted-boundary-compounds");
  const posts = compounds?.getObjectByName("city-boundary-fence-posts");
  const bars = compounds?.getObjectByName("city-boundary-fence-bars");
  const buildings = compounds?.getObjectByName("city-boundary-compound-buildings");
  const grounds = compounds?.children.filter((child) => child.name === "city-restricted-compound-ground");

  assert.deepEqual(compounds?.userData.ridingBoundary, {
    westX: CITY_WEST_FENCE_X,
    eastX: CITY_EAST_FENCE_X,
    northZ: CITY_NORTH_FENCE_Z,
  });
  assert.equal(grounds?.length, 3, "all three non-coastal map edges should have compound paving");
  assert.ok(posts?.count > 700, "closely spaced posts should form continuous boundary fencing");
  assert.equal(bars?.count, (posts.count - 3) * 2, "every fence span should have two horizontal rails");
  assert.ok(buildings?.count >= 30, "restricted grounds should visibly contain buildings");
  assert.deepEqual(clampToCity(-9999, -9999, 3), {
    x: CITY_WEST_FENCE_X + 3,
    z: CITY_NORTH_FENCE_Z + 3,
  });
  assert.deepEqual(clampToCity(9999, 0, 3), { x: CITY_EAST_FENCE_X - 3, z: 0 });
  assert.ok(collision.statics.filter((item) =>
    item.x === CITY_WEST_FENCE_X || item.x === CITY_EAST_FENCE_X || item.z === CITY_NORTH_FENCE_Z).length >= posts.count,
  "visible perimeter posts should have matching collision");
});

test("coast has a lowered water plane, raised seawall and continuous railing collision", () => {
  const collision = new CollisionWorld();
  const city = buildCityWorld({ ...DEFAULT_SETTINGS, mapType: "city" }, collision);
  const sea = city.group.getObjectByName("city-sea");
  const seawall = city.group.getObjectByName("city-coast-seawall");
  const railing = city.group.getObjectByName("city-coast-railing");
  const posts = railing?.getObjectByName("city-coast-railing-posts");
  const bars = railing?.getObjectByName("city-coast-railing-bars");

  assert.equal(sea?.position.y, CITY_WATER_Y);
  assert.ok(sea.position.y < -1, "water should sit visibly below the land surface");
  assert.ok(seawall?.geometry.parameters.height > 1, "seawall should cover the vertical drop to the water");
  assert.equal(railing?.userData.collisionZ, CITY_COAST_RAIL_Z);
  assert.ok(posts?.count > 200, "railing should use closely spaced shore posts");
  assert.equal(bars?.count, (posts.count - 1) * 2, "two horizontal bars should continuously join every post");
  assert.equal(clampToCity(0, 9999, 3).z, CITY_COAST_RAIL_Z - 3, "rider clamp must resolve at the railing line");
  assert.ok(collision.statics.filter((item) => item.z === CITY_COAST_RAIL_Z).length >= posts.count,
    "each visible railing post should have matching collision");
});

test("city streets use broad continuous sidewalks and corner ramps", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const road = profiles.x.find((profile) => profile.position === -820);
  assert.ok(road.sidewalkWidth >= 6.5, `sidewalk should stay generous, got ${road.sidewalkWidth}`);

  const horizontalRoad = profiles.z.find((profile) => profile.position === -640);
  const sidewalk = sampleCitySurface(-820 + road.streetOuter + 2, -900, 8, DEFAULT_SETTINGS.seed);
  const cornerRamp = sampleCitySurface(
    -820 + road.streetOuter + 2.1,
    -640 + horizontalRoad.streetOuter + horizontalRoad.sidewalkWidth * 0.5,
    8,
    DEFAULT_SETTINGS.seed,
  );
  const cornerPlatform = sampleCitySurface(
    -820 + road.streetOuter + road.sidewalkWidth - 0.5,
    -640 + horizontalRoad.streetOuter + horizontalRoad.sidewalkWidth - 0.5,
    8,
    DEFAULT_SETTINGS.seed,
  );
  assert.ok(sidewalk.height > 0.2, "sidewalk should be one curb step above the road");
  assert.ok(cornerRamp.height > 0 && cornerRamp.height < sidewalk.height, "intersection corner should slope between road and sidewalk");
  assert.equal(cornerPlatform.height, sidewalk.height, "the sidewalk corner platform should remain continuous at the junction");

  const city = buildCityWorld({ ...DEFAULT_SETTINGS, mapType: "city", roadWidth: 8 }, new CollisionWorld());
  const activeIntersections = profiles.x.reduce((count, vertical) => count + profiles.z.filter((horizontal) =>
    vertical.position >= horizontal.start && vertical.position <= horizontal.end
    && horizontal.position >= vertical.start && horizontal.position <= vertical.end).length, 0);
  assert.equal(city.group.getObjectByName("city-sidewalk-corner-pads")?.count, activeIntersections * 4);
});

test("seeded city streets mix one-, two-, and three-lane road classes", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const all = [...profiles.x, ...profiles.z];
  assert.deepEqual(new Set(all.map((road) => road.lanesPerDirection)), new Set([1, 2, 3]));
  assert.ok(getCityRoadWidthRange(8, DEFAULT_SETTINGS.seed).max > getCityRoadWidthRange(8, DEFAULT_SETTINGS.seed).min * 2.5);
  const lengths = all.map((road) => road.end - road.start);
  assert.ok(Math.max(...lengths) > Math.min(...lengths) * 2.5, "street lengths should include long spines and short local segments");
  assert.ok(lengths.some((length) => length < 700), "the seeded network should contain a short local street");

  const city = buildCityWorld({ ...DEFAULT_SETTINGS, mapType: "city", roadWidth: 8 }, new CollisionWorld());
  const asphaltRoads = city.group.children.filter((child) => child.name === "city-road-asphalt");
  assert.equal(asphaltRoads.length, 9);
  assert.deepEqual(new Set(asphaltRoads.map((road) => road.userData.roadProfile.lanesPerDirection)), new Set([1, 2, 3]));
  assert.ok(new Set(asphaltRoads.map((road) => Math.round(road.userData.roadProfile.length))).size >= 3);
});

test("short streets also truncate their raised sidewalk riding surface", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const road = profiles.x.find((profile) => profile.end - profile.start < 700);
  assert.ok(road);
  const sidewalkX = road.position + road.streetOuter + 2;
  const middle = sampleCitySurface(sidewalkX, (road.start + road.end) * 0.5, 8, DEFAULT_SETTINGS.seed);
  const beyondEnd = sampleCitySurface(sidewalkX, Math.min(CITY_MAX_Z - 4, road.end + 42), 8, DEFAULT_SETTINGS.seed);
  assert.ok(middle.height > 0.2, "short street should retain its sidewalk along the segment");
  assert.equal(beyondEnd.height, 0, "no invisible raised sidewalk should continue beyond the street end");
});

test("perimeter buildings form a close street wall beside the sidewalk", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const city = buildCityWorld(
    { ...DEFAULT_SETTINGS, mapType: "city", cityDensity: 1, roadWidth: 8 },
    new CollisionWorld(),
  );
  const bodies = city.group.getObjectByName("city-building-bodies");
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let closestFacadeGap = Infinity;

  for (let i = 0; i < bodies.count; i += 1) {
    bodies.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    const nearestRoadX = profiles.x
      .map((road) => Math.abs(position.x - road.position) - scale.x * 0.5 - road.streetOuter - road.sidewalkWidth)
      .reduce((min, gap) => Math.min(min, gap), Infinity);
    const nearestRoadZ = profiles.z
      .map((road) => Math.abs(position.z - road.position) - scale.z * 0.5 - road.streetOuter - road.sidewalkWidth)
      .reduce((min, gap) => Math.min(min, gap), Infinity);
    closestFacadeGap = Math.min(closestFacadeGap, nearestRoadX, nearestRoadZ);
  }

  assert.ok(closestFacadeGap >= 0, "buildings must not overlap the sidewalk");
  assert.ok(closestFacadeGap <= 6, `street-facing buildings should sit near the sidewalk, got ${closestFacadeGap}`);
});

test("city road markings follow a realistic intersection hierarchy", () => {
  const profiles = getCityRoadProfiles(8, DEFAULT_SETTINGS.seed);
  const city = buildCityWorld(
    { ...DEFAULT_SETTINGS, mapType: "city", roadWidth: 8 },
    new CollisionWorld(),
  );
  const crosswalk = city.group.getObjectByName("city-crosswalk-markings");
  const bikeLaneBoundaries = city.group.children.filter((child) => child.name === "city-bike-lane-boundary");
  const yellowCenters = city.group.children.filter((child) => child.name === "city-road-double-yellow-center");
  const motorLaneDashes = city.group.children.filter((child) => child.name === "city-motor-lane-dashes");
  const stopLines = city.group.getObjectByName("city-intersection-stop-lines");

  assert.ok(crosswalk?.isInstancedMesh);
  const activeIntersectionCount = profiles.x.reduce((count, vertical) => count + profiles.z.filter((horizontal) =>
    vertical.position >= horizontal.start && vertical.position <= horizontal.end
    && horizontal.position >= vertical.start && horizontal.position <= vertical.end).length, 0);
  assert.ok(crosswalk.count > activeIntersectionCount * 24, "stripe count should expand with each crossed road width");
  assert.equal(crosswalk.geometry.type, "PlaneGeometry", "crosswalk paint should have no raised box geometry");
  assert.equal(crosswalk.userData.surfaceMarking, true);
  assert.equal(bikeLaneBoundaries.length, 9, "each street should have paired solid bike-lane boundaries");
  assert.equal(yellowCenters.length, 9, "each street should use a double yellow centre marking");
  assert.equal(motorLaneDashes.length, 9, "white dashes should divide same-direction motor lanes");
  assert.equal(stopLines?.count, activeIntersectionCount * 4, "each active intersection should have four approach stop lines");
  assert.equal(stopLines.userData.trafficSide, "right");
  assert.ok([...bikeLaneBoundaries, ...yellowCenters, ...motorLaneDashes, stopLines]
    .every((line) => line?.geometry.type === "PlaneGeometry" && line.userData.surfaceMarking === true));

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const firstVertical = profiles.x.find((vertical) => profiles.z.some((horizontal) =>
    vertical.position >= horizontal.start && vertical.position <= horizontal.end
    && horizontal.position >= vertical.start && horizontal.position <= vertical.end));
  const firstHorizontal = profiles.z.find((horizontal) =>
    firstVertical.position >= horizontal.start && firstVertical.position <= horizontal.end
    && horizontal.position >= firstVertical.start && horizontal.position <= firstVertical.end);
  const stopPositions = [];
  for (let i = 0; i < 4; i += 1) {
    stopLines.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    stopPositions.push(position.clone());
  }
  assert.ok(stopPositions[0].z > firstHorizontal.position && stopPositions[0].x > firstVertical.position, "+Z approach must stop on its incoming right-hand half");
  assert.ok(stopPositions[1].z < firstHorizontal.position && stopPositions[1].x < firstVertical.position, "-Z approach must stop on its incoming right-hand half");
  assert.ok(stopPositions[2].x > firstVertical.position && stopPositions[2].z < firstHorizontal.position, "+X approach must stop on its incoming right-hand half");
  assert.ok(stopPositions[3].x < firstVertical.position && stopPositions[3].z > firstHorizontal.position, "-X approach must stop on its incoming right-hand half");

  for (let i = 0; i < crosswalk.count; i += 1) {
    crosswalk.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    if (scale.z > scale.x) {
      const crossedRoad = profiles.x.reduce((nearest, candidate) =>
        Math.abs(position.x - candidate.position) < Math.abs(position.x - nearest.position) ? candidate : nearest);
      const junctionRoad = profiles.z.reduce((nearest, candidate) =>
        Math.abs(position.z - candidate.position) < Math.abs(position.z - nearest.position) ? candidate : nearest);
      assert.ok(Math.abs(position.x - crossedRoad.position) <= crossedRoad.streetOuter, "vertical stripe must be arranged across the vertical road");
      const innerEdge = Math.abs(position.z - junctionRoad.position) - scale.z * 0.5;
      assert.ok(innerEdge >= junctionRoad.streetOuter + crosswalk.userData.innerGap - 0.001, "crosswalk must stay outside the intersection box");
    } else {
      const crossedRoad = profiles.z.reduce((nearest, candidate) =>
        Math.abs(position.z - candidate.position) < Math.abs(position.z - nearest.position) ? candidate : nearest);
      const junctionRoad = profiles.x.reduce((nearest, candidate) =>
        Math.abs(position.x - candidate.position) < Math.abs(position.x - nearest.position) ? candidate : nearest);
      assert.ok(Math.abs(position.z - crossedRoad.position) <= crossedRoad.streetOuter, "horizontal stripe must be arranged across the horizontal road");
      const innerEdge = Math.abs(position.x - junctionRoad.position) - scale.x * 0.5;
      assert.ok(innerEdge >= junctionRoad.streetOuter + crosswalk.userData.innerGap - 0.001, "crosswalk must stay outside the intersection box");
    }
  }
});
