import type { DeepReadonly } from "./cityCollisionTypes.ts";
import type {
  CityRoadGraph,
  RoadCrossSection,
  RoadEdge,
  RoadNode,
  RoadProfile,
  RoadSideProfile,
} from "./cityRoadGraph.ts";
import { validateCityRoadGraph } from "./cityRoadGraph.ts";
import { isYaw90, TILE_SIZE_METERS } from "./cityTiles.ts";
import type { Yaw90 } from "./cityTiles.ts";
import type { MapSettings } from "./types.ts";

export const CITY_DOCUMENT_SCHEMA_VERSION = 1;
export const CITY_CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_LAMP_HEIGHT_SCALE = 1.32;
export const DEFAULT_SIGNAL_HEIGHT_SCALE = 1.25;

export type PlacementBase = {
  id: string;
  catalogId: string;
};

export type GridPlacement = PlacementBase & {
  poseKind: "grid";
  i: number;
  j: number;
  yaw: Yaw90;
};

export type WorldPlacement = PlacementBase & {
  poseKind: "world";
  x: number;
  z: number;
  yawRadians: number;
  scale: number;
  heightScale?: number;
};

export type LegacyMassingPlacement = PlacementBase & {
  poseKind: "legacy-massing";
  x: number;
  z: number;
  yawRadians: 0;
  width: number;
  depth: number;
  height: number;
  roofHeight: number;
  color: number;
  district: string;
};

export type Placement = GridPlacement | WorldPlacement | LegacyMassingPlacement;

export type CityMapDocument = {
  schemaVersion: 1;
  catalogSchemaVersion: 1;
  tileSizeMeters: 1;
  spawn: { x: number; z: number; heading: number };
  graph: CityRoadGraph;
  placements: Placement[];
  flags: {
    needTrafficLights: boolean;
    lampHeightScale: number;
    signalHeightScale: number;
  };
};

export type CityMapDocumentSnapshot = DeepReadonly<CityMapDocument>;

export type MapFileV3 = {
  format: "forest-courier-map";
  version: 3;
  settings: MapSettings;
  cityDocument?: CityMapDocument;
};

export type CityDocumentParseReport = Readonly<{
  document: CityMapDocumentSnapshot;
  catalogMisses: readonly string[];
  placementConflicts: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, label: string, options?: { positive?: boolean; integer?: boolean }) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  if (options?.positive && value <= 0) throw new TypeError(`${label} must be greater than zero`);
  if (options?.integer && !Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
  return value;
}

function halfTileValue(value: unknown, label: string) {
  const parsed = numberValue(value, label);
  if (!Number.isInteger(parsed * 2)) throw new TypeError(`${label} must use half-tile increments`);
  return parsed;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function optionalOnly(record: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allow = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allow.has(key)) throw new TypeError(`${label} contains unknown field ${key}`);
  }
}

function parseRoadSide(value: unknown, label: string): RoadSideProfile {
  const side = recordValue(value, label);
  optionalOnly(side, ["bikeLaneWidth", "bikeBufferWidth", "parkingWidth", "sidewalkWidth", "vergeWidth"], label);
  return {
    bikeLaneWidth: numberValue(side.bikeLaneWidth, `${label}.bikeLaneWidth`),
    bikeBufferWidth: numberValue(side.bikeBufferWidth, `${label}.bikeBufferWidth`),
    parkingWidth: numberValue(side.parkingWidth, `${label}.parkingWidth`),
    sidewalkWidth: numberValue(side.sidewalkWidth, `${label}.sidewalkWidth`),
    vergeWidth: numberValue(side.vergeWidth, `${label}.vergeWidth`),
  };
}

function parseCrossSection(value: unknown, label: string): RoadCrossSection {
  const section = recordValue(value, label);
  optionalOnly(section, ["lanesAToB", "lanesBToA", "laneWidth", "medianWidth", "left", "right"], label);
  return {
    lanesAToB: numberValue(section.lanesAToB, `${label}.lanesAToB`, { integer: true }),
    lanesBToA: numberValue(section.lanesBToA, `${label}.lanesBToA`, { integer: true }),
    laneWidth: numberValue(section.laneWidth, `${label}.laneWidth`, { positive: true }),
    medianWidth: numberValue(section.medianWidth, `${label}.medianWidth`),
    left: parseRoadSide(section.left, `${label}.left`),
    right: parseRoadSide(section.right, `${label}.right`),
  };
}

function parseRoadProfile(value: unknown, label: string): RoadProfile {
  const profile = recordValue(value, label);
  const source = profile.source;
  if (source === "preset") {
    optionalOnly(profile, ["source", "presetId", "crossSection"], label);
    const presetId = profile.presetId;
    if (presetId !== "one-way-1" && presetId !== "two-way-1" && presetId !== "two-way-2" && presetId !== "two-way-3") {
      throw new TypeError(`${label}.presetId is invalid`);
    }
    return { source, presetId, crossSection: parseCrossSection(profile.crossSection, `${label}.crossSection`) };
  }
  if (source === "frozen-import") {
    optionalOnly(profile, ["source", "crossSection"], label);
    return { source, crossSection: parseCrossSection(profile.crossSection, `${label}.crossSection`) };
  }
  throw new TypeError(`${label}.source is invalid`);
}

function parseGraph(value: unknown): CityRoadGraph {
  const graph = recordValue(value, "cityDocument.graph");
  optionalOnly(graph, ["nodes", "edges", "intersectionOverrides"], "cityDocument.graph");
  const nodes: RoadNode[] = arrayValue(graph.nodes, "cityDocument.graph.nodes").map((raw, index) => {
    const node = recordValue(raw, `cityDocument.graph.nodes[${index}]`);
    optionalOnly(node, ["id", "x", "z"], `cityDocument.graph.nodes[${index}]`);
    return {
      id: stringValue(node.id, `cityDocument.graph.nodes[${index}].id`),
      x: numberValue(node.x, `cityDocument.graph.nodes[${index}].x`),
      z: numberValue(node.z, `cityDocument.graph.nodes[${index}].z`),
    };
  });
  const edges: RoadEdge[] = arrayValue(graph.edges, "cityDocument.graph.edges").map((raw, index) => {
    const edge = recordValue(raw, `cityDocument.graph.edges[${index}]`);
    optionalOnly(edge, ["id", "a", "b", "profile"], `cityDocument.graph.edges[${index}]`);
    return {
      id: stringValue(edge.id, `cityDocument.graph.edges[${index}].id`),
      a: stringValue(edge.a, `cityDocument.graph.edges[${index}].a`),
      b: stringValue(edge.b, `cityDocument.graph.edges[${index}].b`),
      profile: parseRoadProfile(edge.profile, `cityDocument.graph.edges[${index}].profile`),
    };
  });
  const overrideInput = recordValue(graph.intersectionOverrides, "cityDocument.graph.intersectionOverrides");
  const intersectionOverrides: CityRoadGraph["intersectionOverrides"] = {};
  for (const [nodeId, raw] of Object.entries(overrideInput)) {
    const override = recordValue(raw, `intersectionOverrides.${nodeId}`);
    optionalOnly(override, ["needTrafficLights"], `intersectionOverrides.${nodeId}`);
    intersectionOverrides[nodeId] = override.needTrafficLights === undefined
      ? {}
      : { needTrafficLights: booleanValue(override.needTrafficLights, `intersectionOverrides.${nodeId}.needTrafficLights`) };
  }
  const result = { nodes, edges, intersectionOverrides };
  validateCityRoadGraph(result);
  return result;
}

function parsePlacement(value: unknown, index: number): Placement {
  const label = `cityDocument.placements[${index}]`;
  const placement = recordValue(value, label);
  const base = {
    id: stringValue(placement.id, `${label}.id`),
    catalogId: stringValue(placement.catalogId, `${label}.catalogId`),
  };
  if (placement.poseKind === "grid") {
    optionalOnly(placement, ["id", "catalogId", "poseKind", "i", "j", "yaw"], label);
    const yaw = numberValue(placement.yaw, `${label}.yaw`, { integer: true });
    if (!isYaw90(yaw)) throw new TypeError(`${label}.yaw must be 0, 90, 180, or 270`);
    return {
      ...base,
      poseKind: "grid",
      i: halfTileValue(placement.i, `${label}.i`),
      j: halfTileValue(placement.j, `${label}.j`),
      yaw,
    };
  }
  if (placement.poseKind === "world") {
    optionalOnly(placement, ["id", "catalogId", "poseKind", "x", "z", "yawRadians", "scale", "heightScale"], label);
    return {
      ...base,
      poseKind: "world",
      x: numberValue(placement.x, `${label}.x`),
      z: numberValue(placement.z, `${label}.z`),
      yawRadians: numberValue(placement.yawRadians, `${label}.yawRadians`),
      scale: numberValue(placement.scale, `${label}.scale`, { positive: true }),
      ...(placement.heightScale === undefined
        ? {}
        : { heightScale: numberValue(placement.heightScale, `${label}.heightScale`, { positive: true }) }),
    };
  }
  if (placement.poseKind === "legacy-massing") {
    optionalOnly(placement, ["id", "catalogId", "poseKind", "x", "z", "yawRadians", "width", "depth", "height", "roofHeight", "color", "district"], label);
    const yawRadians = numberValue(placement.yawRadians, `${label}.yawRadians`);
    if (!Object.is(yawRadians, 0) && yawRadians !== 0) throw new TypeError(`${label}.yawRadians must be zero`);
    const color = numberValue(placement.color, `${label}.color`, { integer: true });
    if (color < 0 || color > 0xffffff) throw new TypeError(`${label}.color is outside RGB range`);
    return {
      ...base,
      poseKind: "legacy-massing",
      x: numberValue(placement.x, `${label}.x`),
      z: numberValue(placement.z, `${label}.z`),
      yawRadians: 0,
      width: numberValue(placement.width, `${label}.width`, { positive: true }),
      depth: numberValue(placement.depth, `${label}.depth`, { positive: true }),
      height: numberValue(placement.height, `${label}.height`, { positive: true }),
      roofHeight: numberValue(placement.roofHeight, `${label}.roofHeight`, { positive: true }),
      color,
      district: stringValue(placement.district, `${label}.district`),
    };
  }
  throw new TypeError(`${label}.poseKind is invalid`);
}

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value) as DeepReadonly<T>;
}

export function cloneCityDocument(document: CityMapDocumentSnapshot): CityMapDocument {
  return structuredClone(document) as CityMapDocument;
}

export function emptyCityDocument(): CityMapDocumentSnapshot {
  return deepFreeze({
    schemaVersion: CITY_DOCUMENT_SCHEMA_VERSION,
    catalogSchemaVersion: CITY_CATALOG_SCHEMA_VERSION,
    tileSizeMeters: TILE_SIZE_METERS,
    spawn: { x: 0, z: 0, heading: 0 },
    graph: { nodes: [], edges: [], intersectionOverrides: {} },
    placements: [],
    flags: {
      needTrafficLights: true,
      lampHeightScale: DEFAULT_LAMP_HEIGHT_SCALE,
      signalHeightScale: DEFAULT_SIGNAL_HEIGHT_SCALE,
    },
  });
}

export function parseCityMapDocument(
  value: unknown,
  options?: { knownCatalogIds?: ReadonlySet<string> },
): CityDocumentParseReport {
  const document = recordValue(value, "cityDocument");
  optionalOnly(document, ["schemaVersion", "catalogSchemaVersion", "tileSizeMeters", "spawn", "graph", "placements", "flags"], "cityDocument");
  if (document.schemaVersion !== CITY_DOCUMENT_SCHEMA_VERSION) throw new TypeError("unsupported city document schemaVersion");
  if (document.catalogSchemaVersion !== CITY_CATALOG_SCHEMA_VERSION) throw new TypeError("unsupported catalogSchemaVersion");
  if (document.tileSizeMeters !== TILE_SIZE_METERS) throw new TypeError("cityDocument.tileSizeMeters must be 1");

  const spawn = recordValue(document.spawn, "cityDocument.spawn");
  optionalOnly(spawn, ["x", "z", "heading"], "cityDocument.spawn");
  const flags = recordValue(document.flags, "cityDocument.flags");
  optionalOnly(flags, ["needTrafficLights", "lampHeightScale", "signalHeightScale"], "cityDocument.flags");
  const seenPlacements = new Set<string>();
  const catalogMisses: string[] = [];
  const placements: Placement[] = [];
  for (const [index, raw] of arrayValue(document.placements, "cityDocument.placements").entries()) {
    const placement = parsePlacement(raw, index);
    if (seenPlacements.has(placement.id)) throw new TypeError(`duplicate placement id: ${placement.id}`);
    seenPlacements.add(placement.id);
    if (options?.knownCatalogIds && !options.knownCatalogIds.has(placement.catalogId)) {
      catalogMisses.push(placement.catalogId);
      continue;
    }
    placements.push(placement);
  }

  const parsed: CityMapDocument = {
    schemaVersion: 1,
    catalogSchemaVersion: 1,
    tileSizeMeters: 1,
    spawn: {
      x: numberValue(spawn.x, "cityDocument.spawn.x"),
      z: numberValue(spawn.z, "cityDocument.spawn.z"),
      heading: numberValue(spawn.heading, "cityDocument.spawn.heading"),
    },
    graph: parseGraph(document.graph),
    placements,
    flags: {
      needTrafficLights: booleanValue(flags.needTrafficLights, "cityDocument.flags.needTrafficLights"),
      lampHeightScale: numberValue(flags.lampHeightScale ?? DEFAULT_LAMP_HEIGHT_SCALE, "cityDocument.flags.lampHeightScale", { positive: true }),
      signalHeightScale: numberValue(flags.signalHeightScale ?? DEFAULT_SIGNAL_HEIGHT_SCALE, "cityDocument.flags.signalHeightScale", { positive: true }),
    },
  };
  return Object.freeze({
    document: deepFreeze(parsed),
    catalogMisses: Object.freeze([...new Set(catalogMisses)]),
    placementConflicts: Object.freeze([]),
  });
}

export function serializeMapFileV3(settings: MapSettings, cityDocument?: CityMapDocumentSnapshot): MapFileV3 {
  return {
    format: "forest-courier-map",
    version: 3,
    settings: structuredClone(settings),
    ...(cityDocument === undefined ? {} : { cityDocument: cloneCityDocument(cityDocument) }),
  };
}
