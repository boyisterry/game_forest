import { getCatalogEntry } from "./cityCatalog.ts";
import type {
  CityMapDocumentSnapshot,
  GridPlacement,
  LegacyMassingPlacement,
  Placement,
  WorldPlacement,
} from "./cityDocument.ts";
import { buildLegacyMassingBoxParts, legacyMassingPartWorldSize } from "./cityPlacements.ts";
import type { RoadEdge, RoadNode } from "./cityRoadGraph.ts";
import { rasterRoadCorridor } from "./cityRoads.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  CityTileLayer,
  CityTileOccupancy,
  isTileRectInsideMap,
  OCCUPANCY_TILES_X,
  OCCUPANCY_TILES_Z,
  rasterizeWorldAabb2d,
  TILE_SIZE_METERS,
  tileToWorldCenter,
  worldToNearestTileCenter,
  type TileRect,
} from "./cityTiles.ts";

export type CityEditorConflictCode =
  | "placement-out-of-bounds"
  | "placement-overlap"
  | "placement-road-overlap"
  | "road-out-of-bounds"
  | "road-placement-overlap";

/** A stable error contract shared by keyboard, inspector and pointer tools. */
export class CityEditorConflictError extends Error {
  readonly code: CityEditorConflictCode;
  readonly ownerId: string | null;

  constructor(code: CityEditorConflictCode, ownerId: string | null = null) {
    const messages: Record<CityEditorConflictCode, string> = {
      "placement-out-of-bounds": "Placement is outside the editable city bounds.",
      "placement-overlap": ownerId
        ? `Placement overlaps existing object ${ownerId}.`
        : "Placement overlaps an existing object.",
      "placement-road-overlap": "Placement overlaps an existing road corridor.",
      "road-out-of-bounds": "Road corridor is outside the editable city bounds.",
      "road-placement-overlap": ownerId
        ? `Road corridor overlaps existing object ${ownerId}.`
        : "Road corridor overlaps an existing object.",
    };
    super(messages[code]);
    this.name = "CityEditorConflictError";
    this.code = code;
    this.ownerId = ownerId;
  }
}

function catalogFootprint(catalogId: string, yaw: GridPlacement["yaw"]) {
  const entry = getCatalogEntry(catalogId);
  if (!entry) throw new Error(`unknown catalog entry: ${catalogId}`);
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return yaw === 90 || yaw === 270
    ? { w: base.d, d: base.w }
    : { w: base.w, d: base.d };
}

/** Grid corners may use half tiles, so they must pass through the world-AABB rasterizer. */
export function rasterGridPlacementFootprint(placement: Readonly<GridPlacement>): TileRect {
  const footprint = catalogFootprint(placement.catalogId, placement.yaw);
  const minX = CITY_TILE_ORIGIN_X + placement.i * TILE_SIZE_METERS;
  const minZ = CITY_TILE_ORIGIN_Z + placement.j * TILE_SIZE_METERS;
  return rasterizeWorldAabb2d(
    minX,
    minZ,
    minX + footprint.w * TILE_SIZE_METERS,
    minZ + footprint.d * TILE_SIZE_METERS,
  );
}

function orientedWorldRect(placement: Readonly<WorldPlacement>): TileRect | null {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) return null;
  // Audited game-scale overrides (notably the 1x1 tree trunk and lamps) remain
  // fixed editor reservations when an imported visual uses a non-unit scale.
  const width = entry.footprintOverride
    ? entry.footprintOverride.w * TILE_SIZE_METERS
    : entry.siteSizeMeters.x * entry.mapScale * placement.scale;
  const depth = entry.footprintOverride
    ? entry.footprintOverride.d * TILE_SIZE_METERS
    : entry.siteSizeMeters.z * entry.mapScale * placement.scale;
  const cos = Math.abs(Math.cos(placement.yawRadians));
  const sin = Math.abs(Math.sin(placement.yawRadians));
  const aabbWidth = cos * width + sin * depth;
  const aabbDepth = sin * width + cos * depth;
  return rasterizeWorldAabb2d(
    placement.x - aabbWidth * 0.5,
    placement.z - aabbDepth * 0.5,
    placement.x + aabbWidth * 0.5,
    placement.z + aabbDepth * 0.5,
  );
}

function legacyMassingRect(placement: Readonly<LegacyMassingPlacement>): TileRect {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const part of buildLegacyMassingBoxParts(placement)) {
    if (part.collisionRole !== "solid") continue;
    const size = legacyMassingPartWorldSize(part);
    const cos = Math.abs(Math.cos(part.yawRadians));
    const sin = Math.abs(Math.sin(part.yawRadians));
    const halfX = (cos * size.width + sin * size.depth) * 0.5;
    const halfZ = (sin * size.width + cos * size.depth) * 0.5;
    minX = Math.min(minX, part.x - halfX);
    minZ = Math.min(minZ, part.z - halfZ);
    maxX = Math.max(maxX, part.x + halfX);
    maxZ = Math.max(maxZ, part.z + halfZ);
  }
  return rasterizeWorldAabb2d(minX, minZ, maxX, maxZ);
}

export function rasterPlacementFootprint(placement: Readonly<Placement>): TileRect | null {
  if (placement.poseKind === "grid") return rasterGridPlacementFootprint(placement);
  if (placement.poseKind === "world") return orientedWorldRect(placement);
  return legacyMassingRect(placement);
}

function clipToMap(rect: TileRect): TileRect | null {
  const firstI = Math.max(0, rect.i);
  const firstJ = Math.max(0, rect.j);
  const lastI = Math.min(OCCUPANCY_TILES_X, rect.i + rect.w);
  const lastJ = Math.min(OCCUPANCY_TILES_Z, rect.j + rect.d);
  if (lastI <= firstI || lastJ <= firstJ) return null;
  return { i: firstI, j: firstJ, w: lastI - firstI, d: lastJ - firstJ };
}

function paintPlacement(
  occupancy: CityTileOccupancy,
  placement: Readonly<Placement>,
  requireInside: boolean,
) {
  const rawRect = rasterPlacementFootprint(placement);
  if (!rawRect) return;
  if (requireInside && !isTileRectInsideMap(rawRect)) {
    throw new CityEditorConflictError("placement-out-of-bounds");
  }
  const rect = requireInside ? rawRect : clipToMap(rawRect);
  if (!rect) return;
  const entry = getCatalogEntry(placement.catalogId);
  let mask = entry?.reservation === "none" ? CityTileLayer.Solid : CityTileLayer.Reservation;
  if (entry?.category === "decoration") mask |= CityTileLayer.Decoration;
  if (placement.poseKind === "legacy-massing") {
    mask |= CityTileLayer.Solid;
  }
  occupancy.paint(
    rect,
    mask,
    (mask & CityTileLayer.Reservation) !== 0 ? placement.id : undefined,
  );
}

function buildOccupancy(
  document: CityMapDocumentSnapshot,
  excludePlacementIds: ReadonlySet<string>,
) {
  const occupancy = new CityTileOccupancy();
  const nodes = new Map<string, Readonly<RoadNode>>(
    document.graph.nodes.map((node) => [node.id, node]),
  );
  for (const edge of document.graph.edges) {
    const rect = clipToMap(rasterRoadCorridor(edge, nodes));
    if (rect) occupancy.paint(rect, CityTileLayer.Road);
  }
  for (const placement of document.placements) {
    if (!excludePlacementIds.has(placement.id)) paintPlacement(occupancy, placement, false);
  }
  return occupancy;
}

function firstReservationOwner(occupancy: CityTileOccupancy, rect: TileRect) {
  for (let j = rect.j; j < rect.j + rect.d; j += 1) {
    for (let i = rect.i; i < rect.i + rect.w; i += 1) {
      const owner = occupancy.getReservationOwner(i, j);
      if (owner) return owner;
    }
  }
  return null;
}

function assertPlacementAgainstOccupancy(
  occupancy: CityTileOccupancy,
  placement: Readonly<GridPlacement>,
) {
  const rect = rasterGridPlacementFootprint(placement);
  if (!isTileRectInsideMap(rect)) throw new CityEditorConflictError("placement-out-of-bounds");
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) throw new Error(`unknown catalog entry: ${placement.catalogId}`);
  if (entry.snap === "cell" && occupancy.hasAny(rect, CityTileLayer.Road)) {
    throw new CityEditorConflictError("placement-road-overlap");
  }
  if (occupancy.hasAny(rect, CityTileLayer.Reservation | CityTileLayer.Solid)) {
    throw new CityEditorConflictError("placement-overlap", firstReservationOwner(occupancy, rect));
  }
  paintPlacement(occupancy, placement, true);
}

/**
 * Validate only the proposed mutation. Existing imported conflicts are painted
 * as obstacles but are never rejected merely because the document contains them.
 */
export function assertGridPlacementsAllowed(
  document: CityMapDocumentSnapshot,
  placements: readonly Readonly<GridPlacement>[],
  excludePlacementIds: ReadonlySet<string> = new Set(),
) {
  const occupancy = buildOccupancy(document, excludePlacementIds);
  for (const placement of placements) assertPlacementAgainstOccupancy(occupancy, placement);
}

export function assertRoadEdgeAllowed(
  document: CityMapDocumentSnapshot,
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
) {
  const rect = rasterRoadCorridor(edge, nodes);
  if (!isTileRectInsideMap(rect)) throw new CityEditorConflictError("road-out-of-bounds");
  const occupancy = buildOccupancy(document, new Set());
  if (occupancy.hasAny(rect, CityTileLayer.Reservation | CityTileLayer.Solid)) {
    throw new CityEditorConflictError("road-placement-overlap", firstReservationOwner(occupancy, rect));
  }
}

export type CityPoseOccupancyRecovery = Readonly<{
  x: number;
  z: number;
  relocated: boolean;
}>;

/**
 * Conservative edit/import recovery over the authoritative occupancy grid.
 * A 3x3 free tile window keeps the 0.55m rider circle clear of reservation and
 * solid cells. Roads and sidewalks remain valid destinations.
 */
export function findNearestUnoccupiedCityPoint(
  document: CityMapDocumentSnapshot,
  x: number,
  z: number,
): CityPoseOccupancyRecovery {
  const occupancy = buildOccupancy(document, new Set());
  const start = worldToNearestTileCenter(x, z);
  const isFree = (i: number, j: number) => {
    if (i < 1 || j < 1 || i >= OCCUPANCY_TILES_X - 1 || j >= OCCUPANCY_TILES_Z - 1) return false;
    return !occupancy.hasAny(
      { i: i - 1, j: j - 1, w: 3, d: 3 },
      CityTileLayer.Reservation | CityTileLayer.Solid | CityTileLayer.Restricted,
    );
  };
  const inspect = (i: number, j: number) => {
    if (!isFree(i, j)) return null;
    const point = tileToWorldCenter(i, j);
    return Object.freeze({
      x: point.x,
      z: point.z,
      relocated: i !== start.i || j !== start.j,
    });
  };
  const unchanged = inspect(start.i, start.j);
  if (unchanged) return unchanged;
  const maxRadius = Math.max(OCCUPANCY_TILES_X, OCCUPANCY_TILES_Z);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const minI = start.i - radius;
    const maxI = start.i + radius;
    const minJ = start.j - radius;
    const maxJ = start.j + radius;
    // Deterministic clockwise perimeter: north, east, south, west.
    for (let i = minI; i <= maxI; i += 1) {
      const result = inspect(i, minJ);
      if (result) return result;
    }
    for (let j = minJ + 1; j <= maxJ; j += 1) {
      const result = inspect(maxI, j);
      if (result) return result;
    }
    for (let i = maxI - 1; i >= minI; i -= 1) {
      const result = inspect(i, maxJ);
      if (result) return result;
    }
    for (let j = maxJ - 1; j > minJ; j -= 1) {
      const result = inspect(minI, j);
      if (result) return result;
    }
  }
  const spawn = worldToNearestTileCenter(document.spawn.x, document.spawn.z);
  return Object.freeze({ x: spawn.x, z: spawn.z, relocated: true });
}
