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

test("derived sidewalk geometry follows the selected narrow, medium, or wide tier", () => {
  for (const [tier, expectedWidth] of [["narrow", 4], ["medium", 8], ["wide", 12]]) {
    const sources = deriveRoadCollisionSources({
      nodes: [{ id: "a", x: -50, z: 0 }, { id: "b", x: 50, z: 0 }],
      edges: [{ id: `road-${tier}`, a: "a", b: "b", profile: createRoadProfile("two-way-1", tier) }],
      intersectionOverrides: {},
    });
    const sidewalks = sources.surfaces.filter((surface) => surface.surfaceProfileId === "sidewalk");
    assert.equal(sidewalks.length, 2);
    for (const sidewalk of sidewalks) {
      const width = Math.hypot(
        sidewalk.quadXZ[2] - sidewalk.quadXZ[0],
        sidewalk.quadXZ[3] - sidewalk.quadXZ[1],
      );
      assert.equal(width, expectedWidth);
      assert.equal(sidewalk.y, 0.24);
    }
  }
});

test("a four-approach junction derives exactly eight smooth curb ramps", () => {
  const sources = deriveRoadCollisionSources(crossGraph());
  assert.equal(sources.ramps.length, 8);
  assert.ok(sources.ramps.every((ramp) => ramp.transitionProfileId === "smooth"));
});

test("junction approaches stop raised facilities before the road and derive zebra crossings", () => {
  const sources = deriveRoadCollisionSources(crossGraph());
  assert.equal(sources.crosswalks.length, 4);
  assert.ok(sources.crosswalks.every((crosswalk) => crosswalk.depthMeters === 4.2));
  assert.ok(sources.crosswalks.every((crosswalk) => crosswalk.stripeCount === 12));
  assert.ok(sources.crosswalks.every((crosswalk) => crosswalk.widthMeters === 14));

  const raised = sources.surfaces.filter((surface) =>
    surface.side !== "junction"
    && (surface.surfaceProfileId === "sidewalk" || surface.surfaceProfileId === "bike-lane"));
  assert.ok(raised.length > 0);
  for (const surface of raised) {
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const distanceFromJunction = Math.hypot(surface.quadXZ[vertex * 2], surface.quadXZ[vertex * 2 + 1]);
      assert.ok(distanceFromJunction >= 18, `${surface.roadSurfaceId} leaked into the junction`);
    }
  }
  assert.ok(sources.surfaces
    .filter((surface) => surface.surfaceProfileId === "asphalt")
    .some((surface) => surface.quadXZ.some((coordinate) => coordinate === 0)),
  "motor asphalt must continue through the junction beneath the crossing");
  assert.ok(sources.boundaries.every((boundary) =>
    Math.hypot(boundary.segmentXZ[0], boundary.segmentXZ[1]) >= 18
    && Math.hypot(boundary.segmentXZ[2], boundary.segmentXZ[3]) >= 18));
  assert.equal(sources.markings.length, 24);
  assert.equal(sources.markings.filter((marking) => marking.kind === "double-center").length, 8);
  assert.equal(sources.markings.filter((marking) => marking.kind === "bike-lane-boundary").length, 8);
  assert.equal(sources.markings.filter((marking) => marking.kind === "road-edge").length, 8);
  assert.equal(sources.markings.filter((marking) => marking.kind === "motor-lane-divider").length, 0);
  for (const marking of sources.markings) {
    assert.ok(Math.hypot(marking.segmentXZ[0], marking.segmentXZ[1]) >= 18);
    assert.ok(Math.hypot(marking.segmentXZ[2], marking.segmentXZ[3]) >= 18);
  }
  assert.equal(sources.bikeLaneArrows.length, 8);
});

test("four-way junction sidewalks connect every adjacent approach around the zebra crossings", () => {
  const sources = deriveRoadCollisionSources(crossGraph());
  const connectors = sources.surfaces.filter((surface) => surface.side === "junction");
  const approachSidewalks = sources.surfaces.filter((surface) =>
    surface.side !== "junction" && surface.surfaceProfileId === "sidewalk");
  assert.equal(connectors.length, 4);
  assert.ok(connectors.every((surface) => surface.surfaceProfileId === "sidewalk" && surface.y === 0.24));

  const points = (surface) => Array.from({ length: 4 }, (_, index) => ({
    x: surface.quadXZ[index * 2],
    z: surface.quadXZ[index * 2 + 1],
  }));
  for (const connector of connectors) {
    const connectorPoints = points(connector);
    const minX = Math.min(...connectorPoints.map((point) => point.x));
    const maxX = Math.max(...connectorPoints.map((point) => point.x));
    const minZ = Math.min(...connectorPoints.map((point) => point.z));
    const maxZ = Math.max(...connectorPoints.map((point) => point.z));
    const joinedApproaches = approachSidewalks.filter((sidewalk) =>
      points(sidewalk).filter((point) =>
        point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ).length === 2);
    assert.equal(joinedApproaches.length, 2, `${connector.roadSurfaceId} must join two approach sidewalks`);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const x = connector.quadXZ[vertex * 2];
      const z = connector.quadXZ[vertex * 2 + 1];
      assert.ok(Math.abs(x) >= 7 && Math.abs(z) >= 7,
        `${connector.roadSurfaceId} must stay outside the motor intersection`);
    }
  }
});

test("T junction sidewalks add two corners and preserve the continuous far-side pavement", () => {
  const profile = createRoadProfile("two-way-1");
  const sources = deriveRoadCollisionSources({
    nodes: [
      { id: "center", x: 0, z: 0 },
      { id: "west", x: -80, z: 0 },
      { id: "east", x: 80, z: 0 },
      { id: "north", x: 0, z: -80 },
    ],
    edges: [
      { id: "west-arm", a: "west", b: "center", profile },
      { id: "east-arm", a: "center", b: "east", profile },
      { id: "north-arm", a: "north", b: "center", profile },
    ],
    intersectionOverrides: {},
  });
  const connectors = sources.surfaces.filter((surface) => surface.side === "junction");
  assert.equal(connectors.length, 3);
  const farSide = connectors.find((surface) =>
    surface.quadXZ[0] < 0 && surface.quadXZ[4] > 0 && surface.quadXZ[1] > 0);
  assert.ok(farSide, "the sidewalk opposite the missing south arm must bridge west to east");
  assert.equal(farSide.quadXZ[0], -20);
  assert.equal(farSide.quadXZ[4], 20);
  assert.equal(farSide.quadXZ[1], 7);
  assert.equal(farSide.quadXZ[5], 15);
});

test("ordinary two-way road nodes do not synthesize junction sidewalk platforms", () => {
  const profile = createRoadProfile("two-way-1");
  const sources = deriveRoadCollisionSources({
    nodes: [
      { id: "west", x: -40, z: 0 },
      { id: "center", x: 0, z: 0 },
      { id: "east", x: 40, z: 0 },
    ],
    edges: [
      { id: "west-half", a: "west", b: "center", profile },
      { id: "east-half", a: "center", b: "east", profile },
    ],
    intersectionOverrides: {},
  });
  assert.equal(sources.surfaces.filter((surface) => surface.side === "junction").length, 0);
});

test("multi-lane roads derive dashed motor dividers and distinct bicycle lane markings", () => {
  const sources = deriveRoadCollisionSources({
    nodes: [
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 100, z: 0 },
    ],
    edges: [
      { id: "arterial", a: "a", b: "b", profile: createRoadProfile("two-way-3") },
    ],
    intersectionOverrides: {},
  });
  const motorDividers = sources.markings.filter((marking) => marking.kind === "motor-lane-divider");
  assert.equal(motorDividers.length, 4);
  assert.ok(motorDividers.every((marking) => marking.color === "white"));
  assert.ok(motorDividers.every((marking) => marking.dashLengthMeters === 3.2));
  assert.ok(motorDividers.every((marking) => marking.dashGapMeters === 5.8));
  assert.equal(sources.markings.filter((marking) => marking.kind === "double-center").length, 2);
  assert.equal(sources.markings.filter((marking) => marking.kind === "bike-lane-boundary").length, 2);
  assert.equal(sources.markings.filter((marking) => marking.kind === "road-edge").length, 2);
  assert.equal(sources.bikeLaneArrows.length, 2);
  const [leftArrow, rightArrow] = [...sources.bikeLaneArrows]
    .sort((left, right) => left.side.localeCompare(right.side));
  assert.equal(leftArrow.directionX, -1);
  assert.equal(rightArrow.directionX, 1);
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
