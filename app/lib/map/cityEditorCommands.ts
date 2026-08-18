import { getCatalogEntry } from "./cityCatalog.ts";
import type { CityMapDocumentSnapshot, GridPlacement, Placement } from "./cityDocument.ts";
import { cloneCityDocument } from "./cityDocument.ts";
import { CityDirtyLayer } from "./cityEditor.ts";
import type { DocumentDelta } from "./cityEditor.ts";
import { canonicalTupleKey } from "./cityCollisionTypes.ts";
import { createRoadProfile } from "./cityRoadGraph.ts";
import type { RoadPresetId } from "./cityRoadGraph.ts";
import { splitRoadGraphAtIntersections } from "./cityRoads.ts";
import {
  assertGridPlacementsAllowed,
  assertRoadEdgeAllowed,
} from "./cityEditorOccupancy.ts";
import {
  normalizeYaw90,
  rotateTileRect90,
  worldToNearestTileCenter,
} from "./cityTiles.ts";

let localCommandId = 1;

function nextId(kind: string) {
  const id = canonicalTupleKey([kind, Date.now(), localCommandId]);
  localCommandId += 1;
  return id;
}

function replacePlacement(document: CityMapDocumentSnapshot, placement: Placement) {
  const next = cloneCityDocument(document);
  const index = next.placements.findIndex((candidate) => candidate.id === placement.id);
  if (index < 0) throw new Error(`placement not found: ${placement.id}`);
  next.placements[index] = structuredClone(placement);
  return next;
}

function gridFootprint(placement: Readonly<GridPlacement>) {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) throw new Error(`unknown catalog entry: ${placement.catalogId}`);
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return placement.yaw === 90 || placement.yaw === 270
    ? { w: base.d, d: base.w }
    : { w: base.w, d: base.d };
}

export function createAddGridPlacementDelta(
  catalogId: string,
  i: number,
  j: number,
  yaw: GridPlacement["yaw"] = 0,
  id = nextId("placement"),
): DocumentDelta {
  const entry = getCatalogEntry(catalogId);
  if (!entry) throw new Error(`unknown catalog entry: ${catalogId}`);
  const placement: GridPlacement = { id, catalogId, poseKind: "grid", i, j, yaw };
  return Object.freeze({
    name: "add-placement",
    dirty: CityDirtyLayer.Placements,
    apply(document) {
      if (document.placements.some((candidate) => candidate.id === id)) throw new Error(`duplicate placement id: ${id}`);
      assertGridPlacementsAllowed(document, [placement]);
      const next = cloneCityDocument(document);
      next.placements.push(structuredClone(placement));
      return next;
    },
    revert(document) {
      const next = cloneCityDocument(document);
      next.placements = next.placements.filter((candidate) => candidate.id !== id);
      return next;
    },
  });
}

export function createDeletePlacementsDelta(
  document: CityMapDocumentSnapshot,
  placementIds: readonly string[],
): DocumentDelta {
  const ids = new Set(placementIds);
  const removed = document.placements.filter((placement) => ids.has(placement.id)).map((placement) => structuredClone(placement));
  return Object.freeze({
    name: "delete-placements",
    dirty: CityDirtyLayer.Placements,
    apply(current) {
      const next = cloneCityDocument(current);
      next.placements = next.placements.filter((placement) => !ids.has(placement.id));
      return next;
    },
    revert(current) {
      const next = cloneCityDocument(current);
      next.placements.push(...structuredClone(removed));
      return next;
    },
  });
}

export function createRotateGridPlacementDelta(
  document: CityMapDocumentSnapshot,
  placementId: string,
): DocumentDelta {
  const before = document.placements.find((placement): placement is Readonly<GridPlacement> =>
    placement.id === placementId && placement.poseKind === "grid");
  if (!before) throw new Error(`grid placement not found: ${placementId}`);
  const size = gridFootprint(before);
  const rotated = rotateTileRect90({ i: before.i, j: before.j, ...size });
  const after: GridPlacement = {
    ...before,
    i: rotated.i,
    j: rotated.j,
    yaw: normalizeYaw90(before.yaw + 90),
  };
  return Object.freeze({
    name: "rotate-placement",
    dirty: CityDirtyLayer.Placements,
    apply(current) {
      assertGridPlacementsAllowed(current, [after], new Set([placementId]));
      return replacePlacement(current, after);
    },
    revert: (current) => replacePlacement(current, before as GridPlacement),
  });
}

export function createMoveGridPlacementDelta(
  document: CityMapDocumentSnapshot,
  placementId: string,
  i: number,
  j: number,
): DocumentDelta {
  const before = document.placements.find((placement): placement is Readonly<GridPlacement> =>
    placement.id === placementId && placement.poseKind === "grid");
  if (!before) throw new Error(`grid placement not found: ${placementId}`);
  const after: GridPlacement = { ...before, i, j };
  return Object.freeze({
    name: "move-placement",
    dirty: CityDirtyLayer.Placements,
    apply(current) {
      assertGridPlacementsAllowed(current, [after], new Set([placementId]));
      return replacePlacement(current, after);
    },
    revert: (current) => replacePlacement(current, before as GridPlacement),
  });
}

export function createAddRoadDelta(
  document: CityMapDocumentSnapshot,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  presetId: RoadPresetId,
  id = nextId("road"),
): DocumentDelta {
  const start = worldToNearestTileCenter(startX, startZ);
  const rawEnd = worldToNearestTileCenter(endX, endZ);
  const horizontal = Math.abs(rawEnd.x - start.x) >= Math.abs(rawEnd.z - start.z);
  const end = horizontal
    ? { x: rawEnd.x, z: start.z }
    : { x: start.x, z: rawEnd.z };
  if (Math.hypot(end.x - start.x, end.z - start.z) < 1) throw new Error("road stroke is too short");
  const beforeGraph = cloneCityDocument(document).graph;
  const a = canonicalTupleKey(["road-node", id, "a"]);
  const b = canonicalTupleKey(["road-node", id, "b"]);
  const proposedEdge = { id, a, b, profile: createRoadProfile(presetId) };
  const withRoad = cloneCityDocument(document).graph;
  withRoad.nodes.push({ id: a, x: start.x, z: start.z }, { id: b, x: end.x, z: end.z });
  withRoad.edges.push(proposedEdge);
  const afterGraph = splitRoadGraphAtIntersections(withRoad);
  return Object.freeze({
    name: "add-road",
    dirty: CityDirtyLayer.Roads,
    apply(current) {
      const nodes = new Map(current.graph.nodes.map((node) => [node.id, node]));
      nodes.set(a, { id: a, x: start.x, z: start.z });
      nodes.set(b, { id: b, x: end.x, z: end.z });
      assertRoadEdgeAllowed(current, proposedEdge, nodes);
      const next = cloneCityDocument(current);
      next.graph = structuredClone(afterGraph);
      return next;
    },
    revert(current) {
      const next = cloneCityDocument(current);
      next.graph = structuredClone(beforeGraph);
      return next;
    },
  });
}

export function duplicateGridPlacements(
  document: CityMapDocumentSnapshot,
  placementIds: readonly string[],
  offsetTiles = 2,
): DocumentDelta {
  const ids = new Set(placementIds);
  const copies = document.placements
    .filter((placement): placement is Readonly<GridPlacement> => ids.has(placement.id) && placement.poseKind === "grid")
    .map((placement, index): GridPlacement => ({
      ...placement,
      id: nextId(`placement-copy-${index}`),
      i: placement.i + offsetTiles,
      j: placement.j + offsetTiles,
    }));
  return Object.freeze({
    name: "duplicate-placements",
    dirty: CityDirtyLayer.Placements,
    apply(current) {
      assertGridPlacementsAllowed(current, copies);
      const next = cloneCityDocument(current);
      next.placements.push(...structuredClone(copies));
      return next;
    },
    revert(current) {
      const copyIds = new Set(copies.map((placement) => placement.id));
      const next = cloneCityDocument(current);
      next.placements = next.placements.filter((placement) => !copyIds.has(placement.id));
      return next;
    },
  });
}
