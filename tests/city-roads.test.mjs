import assert from "node:assert/strict";
import test from "node:test";

import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import {
  deriveRoadCollisionSources,
  rasterRoadCorridor,
  splitRoadGraphAtIntersections,
} from "../app/lib/map/cityRoads.ts";

function crossGraph() {
  return {
    nodes: [
      { id: "west", x: -20, z: 0 },
      { id: "east", x: 20, z: 0 },
      { id: "north", x: 0, z: -20 },
      { id: "south", x: 0, z: 20 },
    ],
    edges: [
      { id: "horizontal", a: "west", b: "east", profile: createRoadProfile("two-way-1") },
      { id: "vertical", a: "north", b: "south", profile: createRoadProfile("two-way-1") },
    ],
    intersectionOverrides: {},
  };
}

test("perpendicular geometric crossings split into a real graph node deterministically", () => {
  const first = splitRoadGraphAtIntersections(crossGraph());
  const second = splitRoadGraphAtIntersections(crossGraph());
  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 5);
  assert.equal(first.edges.length, 4);
  const middle = first.nodes.find((node) => node.x === 0 && node.z === 0);
  assert.ok(middle);
  assert.equal(first.edges.filter((edge) => edge.a === middle.id || edge.b === middle.id).length, 4);
});

test("corridor occupancy uses world AABB rasterization", () => {
  const graph = crossGraph();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const rect = rasterRoadCorridor(graph.edges[0], nodes);
  assert.equal(rect.w, 40);
  assert.equal(rect.d, 30);
});

test("ordinary sidewalks compile to rideable road-curb boundaries, never solid walls", () => {
  const sources = deriveRoadCollisionSources(crossGraph());
  assert.ok(sources.boundaries.length > 0);
  assert.ok(sources.boundaries.every((boundary) => boundary.transitionProfileId === "road-curb"));
  assert.ok(sources.surfaces.some((surface) => surface.surfaceProfileId === "sidewalk" && surface.y === 0.24));
  assert.ok(sources.surfaces.some((surface) => surface.surfaceProfileId === "asphalt" && surface.y === 0));
  assert.equal(sources.packedBoundaries.boundaryXZ.length, sources.boundaries.length * 4);
  assert.equal(sources.packedBoundaries.boundarySurfaceKeyPairs.length, sources.boundaries.length * 2);
});

test("a four-approach junction derives exactly eight smooth curb ramps", () => {
  const sources = deriveRoadCollisionSources(crossGraph());
  assert.equal(sources.ramps.length, 8);
  assert.ok(sources.ramps.every((ramp) => ramp.transitionProfileId === "smooth"));
});

test("surface and boundary identities do not depend on input edge ordering", () => {
  const graph = crossGraph();
  const forward = deriveRoadCollisionSources(graph);
  const reverse = deriveRoadCollisionSources({ ...graph, edges: [...graph.edges].reverse() });
  const summarize = (value) => value.surfaces
    .map((surface) => [surface.roadSurfaceId, surface.localSurfaceKey])
    .sort((left, right) => left[0].localeCompare(right[0]));
  assert.deepEqual(summarize(forward), summarize(reverse));
});
