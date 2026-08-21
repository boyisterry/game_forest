import assert from "node:assert/strict";
import test from "node:test";

import { cloneCityDocument, emptyCityDocument } from "../app/lib/map/cityDocument.ts";
import { CityDirtyLayer, CityEditorSession } from "../app/lib/map/cityEditor.ts";
import {
  createAddGridPlacementDelta,
  createAddRoadDelta,
  createMoveGridPlacementDelta,
  createReplaceGridPlacementCatalogDelta,
  createRotateGridPlacementDelta,
  duplicateGridPlacements,
} from "../app/lib/map/cityEditorCommands.ts";
import { findNearestUnoccupiedCityPoint } from "../app/lib/map/cityEditorOccupancy.ts";
import { CityEditorConflictError } from "../app/lib/map/cityEditorOccupancy.ts";

function conflict(code) {
  return (error) => error instanceof CityEditorConflictError && error.code === code;
}

test("add, rotate, duplicate, undo and redo use immutable document revisions", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddGridPlacementDelta("roadside-planter", 10, 20, 0, "planter"));
  const beforeRotation = session.document;
  session.apply(createRotateGridPlacementDelta(session.document, "planter"));
  const rotated = session.document.placements[0];
  assert.equal(rotated.poseKind, "grid");
  assert.deepEqual({ i: rotated.i, j: rotated.j, yaw: rotated.yaw }, { i: 11.5, j: 18.5, yaw: 90 });
  assert.deepEqual({ i: beforeRotation.placements[0].i, j: beforeRotation.placements[0].j }, { i: 10, j: 20 });
  session.apply(duplicateGridPlacements(session.document, ["planter"]));
  assert.equal(session.document.placements.length, 2);
  session.undo();
  assert.equal(session.document.placements.length, 1);
  session.undo();
  assert.equal(session.document.placements[0].yaw, 0);
  session.redo();
  assert.equal(session.document.placements[0].yaw, 90);
});

test("placement dirty closure includes roads only for catalog entries with derived entrances", () => {
  const decoration = new CityEditorSession(emptyCityDocument());
  decoration.apply(createAddGridPlacementDelta("street-light", 100, 100, 0, "light"));
  const decorationDirty = decoration.getSnapshot().lastDirty;
  assert.ok((decorationDirty & CityDirtyLayer.Placements) !== 0);
  assert.ok((decorationDirty & CityDirtyLayer.Collision) !== 0);
  assert.equal(decorationDirty & CityDirtyLayer.Roads, 0);
  assert.equal(decorationDirty & CityDirtyLayer.Signals, 0);
  assert.equal(decorationDirty & CityDirtyLayer.Minimap, 0);

  const facility = new CityEditorSession(emptyCityDocument());
  facility.apply(createAddGridPlacementDelta("hospital-campus", 500, 500, 0, "hospital"));
  const facilityDirty = facility.getSnapshot().lastDirty;
  assert.ok((facilityDirty & CityDirtyLayer.Roads) !== 0);
  assert.ok((facilityDirty & CityDirtyLayer.Signals) !== 0);
  assert.ok((facilityDirty & CityDirtyLayer.Minimap) !== 0);
});

test("resizes a standard community from three to six rows without moving its grid centre", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddGridPlacementDelta("standard-residential-community", 400, 400, 0, "community"));
  session.apply(createReplaceGridPlacementCatalogDelta(
    session.document,
    "community",
    "standard-residential-community-6-rows",
  ));
  const expanded = session.document.placements[0];
  assert.deepEqual(
    { catalogId: expanded.catalogId, i: expanded.i, j: expanded.j },
    { catalogId: "standard-residential-community-6-rows", i: 400, j: 346 },
  );
  assert.equal(expanded.i + 160 * 0.5, 480);
  assert.equal(expanded.j + 248 * 0.5, 470);
  session.undo();
  assert.deepEqual(
    { catalogId: session.document.placements[0].catalogId, i: session.document.placements[0].i, j: session.document.placements[0].j },
    { catalogId: "standard-residential-community", i: 400, j: 400 },
  );

  session.apply(createAddGridPlacementDelta("phone-booth", 440, 370, 0, "north-blocker"));
  assert.throws(
    () => session.apply(createReplaceGridPlacementCatalogDelta(
      session.document,
      "community",
      "standard-residential-community-6-rows",
    )),
    conflict("placement-overlap"),
  );
});

test("road brush locks the dominant axis, snaps centres, and splits crossings", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddRoadDelta(session.document, -10.2, 0.1, 10.1, 0.4, "two-way-1", "horizontal"));
  session.apply(createAddRoadDelta(session.document, 0.2, -10.4, 0.4, 10.2, "one-way-1", "vertical"));
  assert.equal(session.document.graph.edges.length, 4);
  const intersection = session.document.graph.nodes.find((node) =>
    session.document.graph.edges.filter((edge) => edge.a === node.id || edge.b === node.id).length === 4);
  assert.ok(intersection);
  assert.ok(Number.isFinite(intersection.x));
  assert.ok(Number.isFinite(intersection.z));
});

test("road brush stores the selected sidewalk width tier in the road profile", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddRoadDelta(
    session.document,
    -20,
    0,
    20,
    0,
    "two-way-1",
    { id: "wide-road", sidewalkWidthTier: "wide" },
  ));
  assert.ok(session.document.graph.edges.length > 0);
  for (const edge of session.document.graph.edges) {
    assert.equal(edge.profile.crossSection.left.sidewalkWidth, 12);
    assert.equal(edge.profile.crossSection.right.sidewalkWidth, 12);
  }
  session.undo();
  assert.equal(session.document.graph.edges.length, 0);
});

test("command application never mutates the source document", () => {
  const source = cloneCityDocument(emptyCityDocument());
  const frozenLength = source.placements.length;
  const delta = createAddGridPlacementDelta("phone-booth", 2, 3, 0, "booth");
  const next = delta.apply(source);
  assert.equal(source.placements.length, frozenLength);
  assert.equal(next.placements.length, 1);
});

test("add rejects occupied and out-of-bounds footprints through one conflict contract", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddGridPlacementDelta("phone-booth", 100, 100, 0, "first"));
  assert.throws(
    () => session.apply(createAddGridPlacementDelta("phone-booth", 100, 100, 0, "overlap")),
    conflict("placement-overlap"),
  );
  assert.throws(
    () => session.apply(createAddGridPlacementDelta("phone-booth", -1, 100, 0, "outside")),
    conflict("placement-out-of-bounds"),
  );
  assert.equal(session.document.placements.length, 1);
});

test("move keeps one placement identity, validates the destination, and undoes cleanly", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddGridPlacementDelta("phone-booth", 100, 100, 0, "moving-booth"));
  session.apply(createAddGridPlacementDelta("street-light", 130, 130, 0, "blocker"));
  const count = session.document.placements.length;

  session.apply(createMoveGridPlacementDelta(session.document, "moving-booth", 110, 115));
  const moved = session.document.placements.find((placement) => placement.id === "moving-booth");
  assert.deepEqual(
    moved?.poseKind === "grid" ? { i: moved.i, j: moved.j, yaw: moved.yaw } : null,
    { i: 110, j: 115, yaw: 0 },
  );
  assert.equal(session.document.placements.length, count);
  assert.throws(
    () => session.apply(createMoveGridPlacementDelta(session.document, "moving-booth", 130, 130)),
    conflict("placement-overlap"),
  );
  session.undo();
  const restored = session.document.placements.find((placement) => placement.id === "moving-booth");
  assert.deepEqual(
    restored?.poseKind === "grid" ? { i: restored.i, j: restored.j } : null,
    { i: 100, j: 100 },
  );
});

test("rotate and duplicate validate the proposed footprints while excluding only the rotated owner", () => {
  const session = new CityEditorSession(emptyCityDocument());
  session.apply(createAddGridPlacementDelta("roadside-planter", 10, 20, 0, "planter"));
  session.apply(createAddGridPlacementDelta("street-light", 12, 18, 0, "blocker"));
  assert.throws(
    () => session.apply(createRotateGridPlacementDelta(session.document, "planter")),
    conflict("placement-overlap"),
  );
  assert.throws(
    () => session.apply(duplicateGridPlacements(session.document, ["blocker"], 0)),
    conflict("placement-overlap"),
  );
  assert.deepEqual(
    session.document.placements.map((placement) => [placement.id, placement.poseKind === "grid" ? placement.yaw : null]),
    [["planter", 0], ["blocker", 0]],
  );
});

test("road commits reject site overlap and map overflow but still allow road crossings", () => {
  const occupied = new CityEditorSession(emptyCityDocument());
  occupied.apply(createAddGridPlacementDelta("phone-booth", 1099, 1079, 0, "booth"));
  assert.throws(
    () => occupied.apply(createAddRoadDelta(occupied.document, -20, 0, 20, 0, "two-way-1", "blocked-road")),
    conflict("road-placement-overlap"),
  );
  assert.throws(
    () => occupied.apply(createAddRoadDelta(occupied.document, 1099, -20, 1099, 20, "one-way-1", "outside-road")),
    conflict("road-out-of-bounds"),
  );
  assert.equal(occupied.document.graph.edges.length, 0);
});

test("legacy documents with existing conflicts remain editable away from those conflicts", () => {
  const imported = cloneCityDocument(emptyCityDocument());
  imported.placements.push(
    { id: "legacy-a", catalogId: "street-light", poseKind: "grid", i: 20, j: 20, yaw: 0 },
    { id: "legacy-b", catalogId: "street-light", poseKind: "grid", i: 20, j: 20, yaw: 0 },
  );
  const session = new CityEditorSession(imported);
  session.apply(createAddGridPlacementDelta("phone-booth", 200, 200, 0, "new-safe-object"));
  assert.equal(session.document.placements.length, 3);
});

test("imported world placements participate in the same half-open occupancy raster", () => {
  const imported = cloneCityDocument(emptyCityDocument());
  imported.placements.push({
    id: "imported-lamp",
    catalogId: "street-light",
    poseKind: "world",
    x: -0.5,
    z: -0.5,
    yawRadians: Math.PI * 0.37,
    scale: 1,
    heightScale: 1.32,
  });
  const session = new CityEditorSession(imported);
  assert.throws(
    () => session.apply(createAddGridPlacementDelta("street-light", 1099, 1079, 0, "stacked-lamp")),
    conflict("placement-overlap"),
  );
});

test("pose recovery keeps a clear rider in place and relocates one enclosed by an edit", () => {
  const document = cloneCityDocument(emptyCityDocument());
  const clear = findNearestUnoccupiedCityPoint(document, 0.5, 0.5);
  assert.deepEqual(clear, { x: 0.5, z: 0.5, relocated: false });

  document.placements.push({
    id: "recovery-block",
    catalogId: "phone-booth",
    poseKind: "grid",
    i: 1100,
    j: 1080,
    yaw: 0,
  });
  const recovered = findNearestUnoccupiedCityPoint(document, 0.5, 0.5);
  assert.equal(recovered.relocated, true);
  assert.ok(Math.hypot(recovered.x - 0.5, recovered.z - 0.5) <= 5);
});
