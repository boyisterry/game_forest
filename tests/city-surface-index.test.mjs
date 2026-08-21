import assert from "node:assert/strict";
import test from "node:test";

import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";
import { CitySurfaceIndex } from "../app/lib/map/citySurfaceIndex.ts";
import { createImplicitGroundSurfaceSample } from "../app/lib/map/cityCollision.ts";

function fixture() {
  const graph = {
    nodes: [{ id: "a", x: -20, z: 0 }, { id: "b", x: 20, z: 0 }],
    edges: [{ id: "eastbound", a: "a", b: "b", profile: createRoadProfile("two-way-1") }],
    intersectionOverrides: {},
  };
  const sources = deriveRoadCollisionSources(graph);
  return new CitySurfaceIndex(sources, 7, 9);
}

function junctionFixture() {
  const profile = createRoadProfile("two-way-1");
  const sources = deriveRoadCollisionSources({
    nodes: [
      { id: "center", x: 0, z: 0 },
      { id: "west", x: -80, z: 0 },
      { id: "east", x: 80, z: 0 },
      { id: "north", x: 0, z: -80 },
      { id: "south", x: 0, z: 80 },
    ],
    edges: [
      { id: "west-arm", a: "west", b: "center", profile },
      { id: "east-arm", a: "center", b: "east", profile },
      { id: "north-arm", a: "north", b: "center", profile },
      { id: "south-arm", a: "center", b: "south", profile },
    ],
    intersectionOverrides: {},
  });
  return new CitySurfaceIndex(sources, 7, 9);
}

function sample(index, x, z, currentY = 0, previousHandle = null) {
  return index.sampleCitySurface(x, z, { currentY, previousHandle, maxStepUpMeters: 0.3 }, createImplicitGroundSurfaceSample());
}

test("surface sampling returns asphalt, sidewalk cap, and implicit ground", () => {
  const index = fixture();
  const asphalt = sample(index, 0, 0);
  assert.equal(asphalt.profileId, "asphalt");
  assert.equal(asphalt.height, 0);
  const sidewalk = sample(index, 0, -10, 0);
  assert.equal(sidewalk.profileId, "sidewalk");
  assert.equal(sidewalk.height, 0.24);
  assert.equal(sidewalk.speedCap, 12);
  const ground = sample(index, 0, -18);
  assert.equal(ground.profileId, "implicit-ground");
});

test("junction corner platforms are the same rideable sidewalk surface as their approaches", () => {
  const index = junctionFixture();
  const corner = sample(index, 10, -10, 0);
  assert.equal(corner.profileId, "sidewalk");
  assert.equal(corner.height, 0.24);
  assert.equal(corner.speedCap, 12);
  assert.equal(corner.handle.kind, "road");
});

test("ordinary curb crossing is allowed in both directions and emits full strong bump", () => {
  const index = fixture();
  const road = sample(index, 0, -6);
  const up = index.findEarliestBoundaryCrossing(0, -6, 0, -3, road);
  assert.ok(up);
  assert.equal(up.kind, "road-curb");
  assert.equal(up.toProfileId, "sidewalk");
  assert.equal(up.toHeight, 0.24);
  assert.equal(up.bumpStrength, 1);

  const sidewalk = sample(index, 0, -8, 0.24, up.toSurface);
  const down = index.findEarliestBoundaryCrossing(0, -8, 0, 3, sidewalk);
  assert.ok(down);
  assert.equal(down.toHeight, 0);
  assert.equal(down.bumpStrength, 1);
});

test("boundary pair orientation remains stable when travelling across the visual left curb", () => {
  const index = fixture();
  const road = sample(index, 0, -6);
  const crossing = index.findEarliestBoundaryCrossing(0, -6, 0, -3, road);
  assert.equal(crossing?.handle.kind, "road");
  assert.equal(crossing?.handle.side, "left");
  assert.equal(crossing?.toProfileId, "sidewalk");
});
