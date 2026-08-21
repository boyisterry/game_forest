import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneCityDocument,
  emptyCityDocument,
  parseCityMapDocument,
} from "../app/lib/map/cityDocument.ts";
import { CityDirtyLayer, CityEditorSession } from "../app/lib/map/cityEditor.ts";
import {
  ROAD_PRESET_CROSS_SECTIONS,
  SIDEWALK_WIDTH_METERS,
  corridorMeters,
  createRoadProfile,
  reverseRoadEdgeRepresentation,
  reverseRoadTraffic,
  validateCityRoadGraph,
} from "../app/lib/map/cityRoadGraph.ts";

test("road presets have the documented widths", () => {
  const expected = { "one-way-1": 15, "two-way-1": 30, "two-way-2": 36, "two-way-3": 42 };
  for (const [id, width] of Object.entries(expected)) {
    assert.equal(corridorMeters({ profile: createRoadProfile(id) }), width);
    assert.ok(Object.isFrozen(ROAD_PRESET_CROSS_SECTIONS[id]));
  }
});

test("road profiles support narrow, medium, and wide sidewalk tiers", () => {
  assert.deepEqual(SIDEWALK_WIDTH_METERS, { narrow: 4, medium: 8, wide: 12 });
  const expected = {
    narrow: { "one-way-1": 11, "two-way-1": 22, "two-way-2": 28, "two-way-3": 34 },
    medium: { "one-way-1": 15, "two-way-1": 30, "two-way-2": 36, "two-way-3": 42 },
    wide: { "one-way-1": 19, "two-way-1": 38, "two-way-2": 44, "two-way-3": 50 },
  };
  for (const [tier, widths] of Object.entries(expected)) {
    for (const [presetId, width] of Object.entries(widths)) {
      const profile = createRoadProfile(presetId, tier);
      assert.equal(corridorMeters({ profile }), width);
      assert.equal(profile.crossSection.right.sidewalkWidth, SIDEWALK_WIDTH_METERS[tier]);
      assert.equal(profile.crossSection.left.sidewalkWidth, presetId === "one-way-1" ? 0 : SIDEWALK_WIDTH_METERS[tier]);
    }
  }
});

test("internal edge reversal preserves world traffic and facility semantics", () => {
  const edge = {
    id: "edge",
    a: "a",
    b: "b",
    profile: createRoadProfile("one-way-1"),
  };
  const reversed = reverseRoadEdgeRepresentation(edge);
  assert.equal(reversed.a, "b");
  assert.equal(reversed.profile.crossSection.lanesAToB, 0);
  assert.equal(reversed.profile.crossSection.lanesBToA, 1);
  assert.equal(reversed.profile.crossSection.left.sidewalkWidth, 8);
  const trafficOnly = reverseRoadTraffic(edge);
  assert.equal(trafficOnly.a, "a");
  assert.equal(trafficOnly.profile.crossSection.left.sidewalkWidth, 0);
});

test("road validation rejects diagonal and dangling edges", () => {
  const profile = createRoadProfile("two-way-1");
  assert.throws(() => validateCityRoadGraph({
    nodes: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 2, z: 3 }],
    edges: [{ id: "e", a: "a", b: "b", profile }],
    intersectionOverrides: {},
  }), /axis aligned/);
  assert.throws(() => validateCityRoadGraph({
    nodes: [{ id: "a", x: 0, z: 0 }],
    edges: [{ id: "e", a: "a", b: "missing", profile }],
    intersectionOverrides: {},
  }), /missing node/);
});

test("empty city document is a deeply frozen blank frame", () => {
  const document = emptyCityDocument();
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.tileSizeMeters, 1);
  assert.equal(document.flags.needTrafficLights, true);
  assert.deepEqual(document.graph.nodes, []);
  assert.ok(Object.isFrozen(document.graph.nodes));
  assert.throws(() => document.graph.nodes.push({ id: "x", x: 0, z: 0 }), TypeError);
});

test("document parser rejects mixed pose fields and invalid scales", () => {
  const input = cloneCityDocument(emptyCityDocument());
  input.placements.push({
    id: "one",
    catalogId: "hospital-campus",
    poseKind: "grid",
    i: 1,
    j: 2,
    yaw: 0,
    x: 3,
  });
  assert.throws(() => parseCityMapDocument(input), /unknown field x/);

  const world = cloneCityDocument(emptyCityDocument());
  world.placements.push({
    id: "two",
    catalogId: "street-light",
    poseKind: "world",
    x: 0,
    z: 0,
    yawRadians: 0,
    scale: 0,
  });
  assert.throws(() => parseCityMapDocument(world), /greater than zero/);
});

test("grid documents retain half-tile corners required by mixed-parity rotation", () => {
  const input = cloneCityDocument(emptyCityDocument());
  input.placements.push({ id: "planter", catalogId: "roadside-planter", poseKind: "grid", i: 11.5, j: 18.5, yaw: 90 });
  const parsed = parseCityMapDocument(input).document;
  assert.equal(parsed.placements[0].poseKind, "grid");
  assert.equal(parsed.placements[0].i, 11.5);
});

test("parser skips unknown catalog ids and reports them", () => {
  const input = cloneCityDocument(emptyCityDocument());
  input.placements.push({ id: "p", catalogId: "gone", poseKind: "grid", i: 0, j: 0, yaw: 0 });
  const report = parseCityMapDocument(input, { knownCatalogIds: new Set(["hospital-campus"]) });
  assert.deepEqual(report.document.placements, []);
  assert.deepEqual(report.catalogMisses, ["gone"]);
});

test("editor session preserves old snapshots and closes dirty dependencies", () => {
  const session = new CityEditorSession(emptyCityDocument());
  const oldSnapshot = session.getSnapshot();
  let notifications = 0;
  const unsubscribe = session.subscribe(() => { notifications += 1; });
  session.apply({
    name: "add road",
    dirty: CityDirtyLayer.Roads,
    apply(document) {
      const next = cloneCityDocument(document);
      next.graph.nodes.push({ id: "a", x: 0, z: 0 }, { id: "b", x: 10, z: 0 });
      next.graph.edges.push({ id: "e", a: "a", b: "b", profile: createRoadProfile("two-way-1") });
      return next;
    },
    revert(document) {
      const next = cloneCityDocument(document);
      next.graph.nodes = [];
      next.graph.edges = [];
      return next;
    },
  });
  assert.equal(oldSnapshot.document.graph.nodes.length, 0);
  assert.equal(session.document.graph.nodes.length, 2);
  assert.equal(notifications, 1);
  const update = session.getRenderUpdate(0);
  assert.ok((update.dirty & CityDirtyLayer.Collision) !== 0);
  assert.ok((update.dirty & CityDirtyLayer.Surface) !== 0);
  session.undo();
  assert.equal(session.document.graph.nodes.length, 0);
  session.redo();
  assert.equal(session.document.graph.nodes.length, 2);
  unsubscribe();
});

test("placement dirty closure rebuilds collision but leaves graph-only minimap data intact", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply({
    name: "placement-only",
    dirty: CityDirtyLayer.Placements,
    apply: (document) => cloneCityDocument(document),
    revert: (document) => cloneCityDocument(document),
  });
  const dirty = session.getSnapshot().lastDirty;
  assert.ok((dirty & CityDirtyLayer.Collision) !== 0);
  assert.ok((dirty & CityDirtyLayer.Surface) !== 0);
  assert.equal(dirty & CityDirtyLayer.Minimap, 0);
  assert.equal(dirty & CityDirtyLayer.Signals, 0);
  assert.equal(dirty & CityDirtyLayer.Roads, 0);
});

test("editor replace is one undoable all-dirty revision", () => {
  const session = new CityEditorSession(emptyCityDocument());
  const replacement = cloneCityDocument(emptyCityDocument());
  replacement.spawn.x = 42;
  session.replace(replacement, "import");
  assert.equal(session.document.spawn.x, 42);
  assert.equal(session.getSnapshot().lastDirty, CityDirtyLayer.All);
  session.undo();
  assert.equal(session.document.spawn.x, 0);
});
