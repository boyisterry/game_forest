import assert from "node:assert/strict";
import test from "node:test";

import { emptyCityDocument } from "../app/lib/map/cityDocument.ts";
import { CURB_HEIGHT_METERS } from "../app/lib/map/cityCollisionTypes.ts";
import {
  createRoadProfile,
  reverseRoadEdgeRepresentation,
} from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";
import {
  deriveTrafficSignalPlacements,
} from "../app/lib/map/citySignals.ts";

function documentWithGraph(graph, flags = {}) {
  return {
    ...structuredClone(emptyCityDocument()),
    graph,
    flags: {
      needTrafficLights: true,
      lampHeightScale: 1.32,
      signalHeightScale: 1.25,
      ...flags,
    },
  };
}

function fourWayGraph(profileFactory = () => createRoadProfile("two-way-1")) {
  return {
    nodes: [
      { id: "center", x: 0, z: 0 },
      { id: "west", x: -40, z: 0 },
      { id: "east", x: 40, z: 0 },
      { id: "north", x: 0, z: -40 },
      { id: "south", x: 0, z: 40 },
    ],
    edges: [
      { id: "west-approach", a: "west", b: "center", profile: profileFactory() },
      { id: "east-approach", a: "center", b: "east", profile: profileFactory() },
      { id: "north-approach", a: "north", b: "center", profile: profileFactory() },
      { id: "south-approach", a: "center", b: "south", profile: profileFactory() },
    ],
    intersectionOverrides: {},
  };
}

test("every real junction automatically receives signals despite legacy flags", () => {
  const graph = fourWayGraph();
  assert.equal(deriveTrafficSignalPlacements(documentWithGraph(graph, { needTrafficLights: false })).placements.length, 4);
  graph.intersectionOverrides.center = { needTrafficLights: true };
  assert.equal(deriveTrafficSignalPlacements(documentWithGraph(graph, { needTrafficLights: false })).placements.length, 4);
  graph.intersectionOverrides.center = { needTrafficLights: false };
  assert.equal(deriveTrafficSignalPlacements(documentWithGraph(graph)).placements.length, 4);
});

test("four-way signals are generated from inbound approach vectors", () => {
  const result = deriveTrafficSignalPlacements(documentWithGraph(fourWayGraph()));
  assert.equal(result.placements.length, 4);
  assert.deepEqual(
    Object.fromEntries(result.placements.map((signal) => [signal.approachCardinal, signal.yawRadians])),
    {
      "+x": Math.PI,
      "-x": 0,
      "+z": Math.PI * 0.5,
      "-z": -Math.PI * 0.5,
    },
  );
  assert.ok(result.placements.every((signal) => signal.templateId === "traffic-light"));
  assert.ok(result.placements.every((signal) => signal.resolvedHeightScale === 1.25));
  assert.ok(result.placements.every((signal) => signal.ownerId === signal.placementId));
  assert.equal(new Set(result.placements.map((signal) => signal.ownerId)).size, 4);
  assert.deepEqual(
    new Set(result.placements.filter((signal) => signal.signalPhase === "green").map((signal) => signal.approachCardinal)),
    new Set(["+z", "-z"]),
  );
});

test("signal bases sit on the real sidewalk beyond the zebra crossing", () => {
  const document = documentWithGraph(fourWayGraph());
  const signals = deriveTrafficSignalPlacements(document).placements;
  const roads = deriveRoadCollisionSources(document.graph);
  const center = document.graph.nodes.find((node) => node.id === "center");
  assert.ok(center);
  for (const signal of signals) {
    assert.equal(signal.y, CURB_HEIGHT_METERS);
    const sidewalk = roads.surfaces.find((surface) =>
      surface.edgeId === signal.approachEdgeId
      && surface.side === signal.sourceRoadSide
      && surface.surfaceProfileId === "sidewalk");
    assert.ok(sidewalk, `missing sidewalk for ${signal.approachEdgeId}`);
    const xs = [sidewalk.quadXZ[0], sidewalk.quadXZ[2], sidewalk.quadXZ[4], sidewalk.quadXZ[6]];
    const zs = [sidewalk.quadXZ[1], sidewalk.quadXZ[3], sidewalk.quadXZ[5], sidewalk.quadXZ[7]];
    assert.ok(signal.x >= Math.min(...xs) && signal.x <= Math.max(...xs));
    assert.ok(signal.z >= Math.min(...zs) && signal.z <= Math.max(...zs));
    const setback = -(signal.x - center.x) * signal.approachDirectionXZ[0]
      - (signal.z - center.z) * signal.approachDirectionXZ[1];
    assert.equal(setback, 20.75, "two-way-1 signal must clear the full junction and crossing");
  }
});

test("a T junction emits three signals and gives the through road one phase", () => {
  const graph = fourWayGraph();
  graph.nodes = graph.nodes.filter((node) => node.id !== "south");
  graph.edges = graph.edges.filter((edge) => edge.id !== "south-approach");
  const result = deriveTrafficSignalPlacements(documentWithGraph(graph));
  assert.equal(result.placements.length, 3);
  const phases = Object.fromEntries(result.placements.map((signal) => [signal.approachCardinal, signal.signalPhase]));
  assert.equal(phases["+x"], "green");
  assert.equal(phases["-x"], "green");
  assert.equal(phases["+z"], "red");
});

test("one-way topology emits signals only for actual inbound lanes", () => {
  const result = deriveTrafficSignalPlacements(documentWithGraph(
    fourWayGraph(() => createRoadProfile("one-way-1")),
  ));
  assert.deepEqual(
    new Set(result.placements.map((signal) => signal.approachCardinal)),
    new Set(["+x", "+z"]),
  );
  assert.ok(result.placements.every((signal) => signal.inboundLaneCount === 1));
  assert.ok(result.placements.every((signal) => signal.sourceRoadSide === "right"));
});

test("geometric crossings become real signal nodes before approach derivation", () => {
  const graph = {
    nodes: [
      { id: "west", x: -30, z: 0 },
      { id: "east", x: 30, z: 0 },
      { id: "north", x: 0, z: -30 },
      { id: "south", x: 0, z: 30 },
    ],
    edges: [
      { id: "horizontal", a: "west", b: "east", profile: createRoadProfile("two-way-1") },
      { id: "vertical", a: "north", b: "south", profile: createRoadProfile("two-way-1") },
    ],
    intersectionOverrides: {},
  };
  const result = deriveTrafficSignalPlacements(documentWithGraph(graph));
  assert.equal(result.enabledNodeIds.length, 1);
  assert.equal(result.placements.length, 4);
  assert.ok(result.graph.nodes.some((node) => node.x === 0 && node.z === 0));
});

test("representation reversal and edge ordering preserve signal world poses and identities", () => {
  const graph = fourWayGraph();
  const first = deriveTrafficSignalPlacements(documentWithGraph(graph));
  const reversed = {
    ...graph,
    edges: [...graph.edges].reverse().map(reverseRoadEdgeRepresentation),
  };
  const second = deriveTrafficSignalPlacements(documentWithGraph(reversed));
  const summarize = (result) => result.placements.map((signal) => ({
    id: signal.placementId,
    cardinal: signal.approachCardinal,
    x: signal.x,
    z: signal.z,
    yaw: signal.yawRadians,
    phase: signal.signalPhase,
  }));
  assert.deepEqual(summarize(second), summarize(first));
});

test("height scale selects an exact shared collision variant without changing owner identity", () => {
  const graph = fourWayGraph();
  const defaults = deriveTrafficSignalPlacements(documentWithGraph(graph));
  const tall = deriveTrafficSignalPlacements(documentWithGraph(graph, { signalHeightScale: 1.6 }));
  assert.deepEqual(tall.placements.map((signal) => signal.placementId), defaults.placements.map((signal) => signal.placementId));
  assert.equal(new Set(defaults.placements.map((signal) => signal.collisionVariantId)).size, 1);
  assert.equal(new Set(tall.placements.map((signal) => signal.collisionVariantId)).size, 1);
  assert.notEqual(tall.placements[0].collisionVariantId, defaults.placements[0].collisionVariantId);
  assert.throws(
    () => deriveTrafficSignalPlacements(documentWithGraph(graph, { signalHeightScale: 0 })),
    /finite positive/,
  );
});

test("a visual phase change does not alter signal owner or collision-template identity", () => {
  const graph = fourWayGraph();
  const verticalGreen = deriveTrafficSignalPlacements(documentWithGraph(graph));
  const horizontalDominant = structuredClone(graph);
  for (const edge of horizontalDominant.edges) {
    if (edge.id === "west-approach" || edge.id === "east-approach") {
      edge.profile = createRoadProfile("two-way-3");
    }
  }
  const horizontalGreen = deriveTrafficSignalPlacements(documentWithGraph(horizontalDominant));
  const firstById = new Map(verticalGreen.placements.map((signal) => [signal.placementId, signal]));
  assert.ok(horizontalGreen.placements.some((signal) => signal.signalPhase !== firstById.get(signal.placementId).signalPhase));
  for (const signal of horizontalGreen.placements) {
    const before = firstById.get(signal.placementId);
    assert.ok(before);
    assert.equal(signal.ownerId, before.ownerId);
    assert.equal(signal.collisionVariantId, before.collisionVariantId);
  }
});
