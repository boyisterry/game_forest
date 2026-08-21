import {
  parseCityMapDocument,
  type CityMapDocument,
  type CityMapDocumentSnapshot,
  type Placement,
} from "./cityDocument.ts";
import { rasterPlacementFootprint } from "./cityEditorOccupancy.ts";
import { validateCityRoadGraph, type CityRoadGraph } from "./cityRoadGraph.ts";
import { CITY_TILE_ORIGIN_X, CITY_TILE_ORIGIN_Z, TILE_SIZE_METERS } from "./cityTiles.ts";

export type CityPerformanceStressMultiplier = 1 | 10 | 20;

export const CITY_PERFORMANCE_STRESS_COLUMNS = 5;
export const CITY_PERFORMANCE_STRESS_ROWS = 4;
export const CITY_PERFORMANCE_STRESS_GAP_METERS = 40;

export type CityPerformanceBounds = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}>;

export type CityPerformanceReplica = Readonly<{
  index: number;
  column: number;
  row: number;
  prefix: string;
  offsetX: number;
  offsetZ: number;
}>;

export type CityPerformanceCameraRoute = Readonly<{
  id: "editor-fit" | "replica-0-main-road" | "replica-2-1-mall";
  durationSeconds: 8 | 12 | 10;
  targetX: number;
  targetZ: number;
}>;

export type CityPerformanceStressFixture = Readonly<{
  document: CityMapDocumentSnapshot;
  sourceBounds: CityPerformanceBounds;
  worldBounds: CityPerformanceBounds;
  replicas: readonly CityPerformanceReplica[];
  cameraRoute: readonly CityPerformanceCameraRoute[];
}>;

export type CityPerformanceCameraFit = Readonly<{
  targetX: number;
  targetY: number;
  targetZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  distance: number;
  near: number;
  far: number;
}>;

export function isCityPerformanceStressMultiplier(
  value: number,
): value is CityPerformanceStressMultiplier {
  return value === 1 || value === 10 || value === 20;
}

function freezeBounds(minX: number, minZ: number, maxX: number, maxZ: number) {
  return Object.freeze({
    minX,
    minZ,
    maxX,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  });
}

export function measureCityPerformanceDocumentBounds(
  source: CityMapDocumentSnapshot,
): CityPerformanceBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const include = (x: number, z: number) => {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  };
  for (const node of source.graph.nodes) include(node.x, node.z);
  for (const placement of source.placements) {
    const rect = rasterPlacementFootprint(placement);
    if (!rect) continue;
    include(CITY_TILE_ORIGIN_X + rect.i * TILE_SIZE_METERS, CITY_TILE_ORIGIN_Z + rect.j * TILE_SIZE_METERS);
    include(
      CITY_TILE_ORIGIN_X + (rect.i + rect.w) * TILE_SIZE_METERS,
      CITY_TILE_ORIGIN_Z + (rect.j + rect.d) * TILE_SIZE_METERS,
    );
  }
  if (!Number.isFinite(minX)) include(source.spawn.x, source.spawn.z);
  return freezeBounds(minX, minZ, maxX, maxZ);
}

export function computeCityPerformanceCameraFit(
  bounds: CityPerformanceBounds,
  verticalFovDegrees: number,
  aspect: number,
): CityPerformanceCameraFit {
  if (!Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 179) {
    throw new RangeError("verticalFovDegrees must be in (0, 179)");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("aspect must be greater than zero");
  const verticalHalfFov = verticalFovDegrees * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const radius = Math.max(1, Math.hypot(bounds.width, bounds.depth) * 0.5);
  const distance = radius / Math.sin(limitingHalfFov) * 1.08;
  const inverseDirectionLength = 1 / Math.hypot(0.82, 0.72, 1);
  const directionX = 0.82 * inverseDirectionLength;
  const directionY = 0.72 * inverseDirectionLength;
  const directionZ = 1 * inverseDirectionLength;
  return Object.freeze({
    targetX: bounds.centerX,
    targetY: 0,
    targetZ: bounds.centerZ,
    cameraX: bounds.centerX + directionX * distance,
    cameraY: directionY * distance,
    cameraZ: bounds.centerZ + directionZ * distance,
    distance,
    near: Math.max(0.5, distance - radius * 1.25),
    far: distance + radius * 1.5,
  });
}

function translatePlacement(
  placement: Readonly<Placement>,
  id: string,
  offsetX: number,
  offsetZ: number,
): Placement {
  if (placement.poseKind === "grid") {
    return { ...placement, id, i: placement.i + offsetX, j: placement.j + offsetZ };
  }
  return { ...placement, id, x: placement.x + offsetX, z: placement.z + offsetZ };
}

function createReplicas(
  multiplier: CityPerformanceStressMultiplier,
  sourceBounds: CityPerformanceBounds,
): readonly CityPerformanceReplica[] {
  const strideX = sourceBounds.width + CITY_PERFORMANCE_STRESS_GAP_METERS;
  const strideZ = sourceBounds.depth + CITY_PERFORMANCE_STRESS_GAP_METERS;
  return Object.freeze(Array.from({ length: multiplier }, (_, index) => {
    const column = index % CITY_PERFORMANCE_STRESS_COLUMNS;
    const row = Math.floor(index / CITY_PERFORMANCE_STRESS_COLUMNS);
    return Object.freeze({
      index,
      column,
      row,
      prefix: `stress-${multiplier}-${column}-${row}:`,
      offsetX: column * strideX,
      offsetZ: row * strideZ,
    });
  }));
}

function replicateGraph(
  source: CityMapDocumentSnapshot,
  replicas: readonly CityPerformanceReplica[],
): CityRoadGraph {
  const nodes: CityRoadGraph["nodes"] = [];
  const edges: CityRoadGraph["edges"] = [];
  const intersectionOverrides: CityRoadGraph["intersectionOverrides"] = {};
  for (const replica of replicas) {
    for (const node of source.graph.nodes) {
      nodes.push({
        ...node,
        id: `${replica.prefix}${node.id}`,
        x: node.x + replica.offsetX,
        z: node.z + replica.offsetZ,
      });
    }
    for (const edge of source.graph.edges) {
      edges.push({
        ...structuredClone(edge),
        id: `${replica.prefix}${edge.id}`,
        a: `${replica.prefix}${edge.a}`,
        b: `${replica.prefix}${edge.b}`,
      });
    }
    for (const [nodeId, override] of Object.entries(source.graph.intersectionOverrides)) {
      intersectionOverrides[`${replica.prefix}${nodeId}`] = { ...override };
    }
  }
  const graph = { nodes, edges, intersectionOverrides };
  validateCityRoadGraph(graph);
  return graph;
}

function worldBoundsForReplicas(
  source: CityPerformanceBounds,
  replicas: readonly CityPerformanceReplica[],
) {
  const last = replicas[replicas.length - 1];
  return freezeBounds(
    source.minX,
    source.minZ,
    source.maxX + last.column * (source.width + CITY_PERFORMANCE_STRESS_GAP_METERS),
    source.maxZ + last.row * (source.depth + CITY_PERFORMANCE_STRESS_GAP_METERS),
  );
}

export function createCityPerformanceStressFixture(
  source: CityMapDocumentSnapshot,
  multiplier: CityPerformanceStressMultiplier,
): CityPerformanceStressFixture {
  const sourceBounds = measureCityPerformanceDocumentBounds(source);
  const replicas = createReplicas(multiplier, sourceBounds);
  const graph = replicateGraph(source, replicas);
  const placements = replicas.flatMap((replica) => source.placements.map((placement) => translatePlacement(
    placement,
    `${replica.prefix}${placement.id}`,
    replica.offsetX,
    replica.offsetZ,
  )));
  const draft: CityMapDocument = {
    ...structuredClone(source),
    graph,
    placements,
    spawn: { ...source.spawn },
  };
  const document = parseCityMapDocument(draft).document;
  const worldBounds = worldBoundsForReplicas(sourceBounds, replicas);
  const replica21 = replicas.find((replica) => replica.column === 2 && replica.row === 1)
    ?? replicas[replicas.length - 1];
  const cameraRoute: readonly CityPerformanceCameraRoute[] = Object.freeze([
    Object.freeze({ id: "editor-fit", durationSeconds: 8, targetX: worldBounds.centerX, targetZ: worldBounds.centerZ }),
    Object.freeze({ id: "replica-0-main-road", durationSeconds: 12, targetX: source.spawn.x, targetZ: source.spawn.z }),
    Object.freeze({
      id: "replica-2-1-mall",
      durationSeconds: 10,
      targetX: replica21.offsetX + 630,
      targetZ: replica21.offsetZ - 399,
    }),
  ]);
  return Object.freeze({ document, sourceBounds, worldBounds, replicas, cameraRoute });
}

export function createCityPerformanceStressDocument(
  source: CityMapDocumentSnapshot,
  multiplier: CityPerformanceStressMultiplier,
): CityMapDocumentSnapshot {
  return createCityPerformanceStressFixture(source, multiplier).document;
}
