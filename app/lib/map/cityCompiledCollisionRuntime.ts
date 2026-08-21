import { Box3, Vector3 } from "three";
import {
  copySurfaceSample,
  createImplicitGroundSurfaceSample,
} from "./cityCollision.ts";
import type { CompiledCollisionSource } from "./cityCollisionCompileCore.ts";
import {
  ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR,
  ARCADE_STRONG_IMPACT_SPEED_METERS_PER_SECOND,
  BIKE_COLLISION_HEIGHT_METERS,
  BIKE_COLLISION_RADIUS_METERS,
  CITY_COLLIDE_AND_SLIDE_MAX_HITS,
  CITY_SOLID_HORIZONTAL_RESPONSE_MIN_NORMAL_XZ,
  COLLISION_SKIN_METERS,
  CURB_BUMP_MIN_STEP_METERS,
  CURB_BUMP_REFERENCE_STEP_METERS,
  IMPLICIT_GROUND_SURFACE_KEY,
  NO_SURFACE_KEY,
  SURFACE_BOUNDARY_PROBE_EPS_METERS,
  TOI_DISTANCE_EPS_METERS,
  canonicalTupleKey,
  type CityMoveRequest,
  type CityMoveResult,
  type RuntimeBoundaryHandle,
  type RuntimeContactHandle,
  type RuntimeSurfaceHandle,
  type RoadBoundaryHandleRecord,
  type RoadSurfaceHandleRecord,
  type SurfaceSampleOut,
  type SurfaceSampleQuery,
} from "./cityCollisionTypes.ts";
import {
  CITY_SURFACE_CELLS_PER_AXIS,
  CITY_SURFACE_CHUNK_SIZE_METERS,
  type PackedSurfaceChunk,
} from "./cityCollisionWire.ts";

const GEOMETRY_EPSILON = 1e-9;
const SWEEP_EPSILON = 1e-8;
const SURFACE_EPSILON = 1e-7;
const OWNER_SPATIAL_CELL_SIZE_METERS = 16;
const OWNER_SPATIAL_MAX_CELLS_PER_OWNER = 1024;
const utf8Encoder = new TextEncoder();
let nextCompiledRuntimeWorldId = 1;
const sourceBoundsCache = new WeakMap<CompiledCollisionSource, Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>>();

/**
 * Matches THREE.Matrix4.makeRotationY: local +X turns toward world -Z for a
 * positive yaw. Non-uniform scale is deliberately excluded from this runtime.
 */
export type CompiledCollisionOwnerTransform = Readonly<{
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  uniformScale: number;
  heightScale: number;
}>;

export type CompiledCollisionRuntimeOwner = Readonly<{
  ownerId: string;
  ownerGeneration: number;
  source: CompiledCollisionSource;
  transform?: Partial<CompiledCollisionOwnerTransform>;
  roadSurfaceHandles?: readonly RoadSurfaceHandleRecord[];
  roadBoundaryHandles?: readonly RoadBoundaryHandleRecord[];
  /** Surface-only child owners retain the placement's stable public handle. */
  surfaceHandleOwner?: Readonly<{ ownerId: string; ownerGeneration: number }>;
}>;

export type CompiledCollisionRuntimeBuildStats = Readonly<{
  fullOwnerIndexRebuild: boolean;
  reusedOwnerCount: number;
  addedOwnerCount: number;
  updatedOwnerCount: number;
  removedOwnerCount: number;
  affectedSpatialCellCount: number;
}>;

export type CompiledCollisionOwnerWorldBounds = Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>;

type NormalizedOwner = Readonly<{
  index: number;
  ownerId: string;
  ownerGeneration: number;
  source: CompiledCollisionSource;
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  uniformScale: number;
  heightScale: number;
  cos: number;
  sin: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  roadSurfaceIdByKey: ReadonlyMap<number, string>;
  roadSurfaceKeyById: ReadonlyMap<string, number>;
  roadBoundaryByGroupKey: ReadonlyMap<number, RoadBoundaryHandleRecord>;
  surfaceHandleOwnerId: string;
  surfaceHandleOwnerGeneration: number;
}>;

export type CompiledCircleSweepRequest = Readonly<{
  startX: number;
  startZ: number;
  deltaX: number;
  deltaZ: number;
  minY: number;
  maxY: number;
  radius?: number;
}>;

export type CompiledCircleSweepHit = Readonly<{
  ownerId: string;
  ownerGeneration: number;
  sourceTriangleId: number;
  componentId: number;
  primitiveKind: "wall" | "triangle";
  featureKind: "segment" | "face" | "edge" | "vertex";
  canonicalFeatureId: number;
  toi: number;
  distance: number;
  normalX: number;
  normalZ: number;
}>;

export type CompiledCircleSweepResult = Readonly<{
  hit: CompiledCircleSweepHit | null;
  /** All stable contacts in the shared TOI distance window. */
  ties: readonly CompiledCircleSweepHit[];
  /** Number of fallback triangles admitted by the actual MeshBVH traversal. */
  fallbackTriangleCandidateCount: number;
}>;

export type CompiledCollisionRuntimePerformanceStats = Readonly<{
  ownerCount: number;
  spatialCellSizeMeters: number;
  spatialCellCount: number;
  globalOwnerCount: number;
  lastCandidateOwnerCount: number;
  maxCandidateOwnerCount: number;
  lastBucketEntryVisitCount: number;
  maxBucketEntryVisitCount: number;
}>;

export type CompiledSurfaceBoundaryCrossing = Readonly<{
  distance: number;
  fraction: number;
  x: number;
  z: number;
  normalX: number;
  normalZ: number;
  handle: RuntimeBoundaryHandle;
  fromSurface: RuntimeSurfaceHandle;
  toSurface: RuntimeSurfaceHandle;
  fromHeight: number;
  toHeight: number;
  toProfileId: string;
  toSpeedCap: number;
  kind: "smooth" | "road-curb" | "blocked-step";
  bumpStrength: number;
}>;

type SurfaceBridgeBoundaryCrossing = Readonly<{
  distance: number;
  fraction: number;
  x: number;
  z: number;
  handle: RuntimeBoundaryHandle;
  fromSurface: RuntimeSurfaceHandle;
  toSurface: RuntimeSurfaceHandle;
  fromHeight: number;
  toHeight: number;
  toProfileId: string;
  toSpeedCap: number;
  kind: "road-curb";
  bumpStrength: number;
}>;

/** Structural bridge implemented by CitySurfaceIndex without an adapter. */
export type CompiledSurfaceRuntimeBridge = Readonly<{
  sampleCitySurface(
    x: number,
    z: number,
    query: Readonly<SurfaceSampleQuery>,
    out: SurfaceSampleOut,
  ): SurfaceSampleOut;
  findEarliestBoundaryCrossing?(
    startX: number,
    startZ: number,
    deltaX: number,
    deltaZ: number,
    current: Readonly<SurfaceSampleOut>,
  ): SurfaceBridgeBoundaryCrossing | null;
}>;

type Point2 = { x: number; z: number };
type Point3 = Point2 & { y: number };
type PointTY = { t: number; y: number };

type LocalSweepCandidate = Readonly<{
  owner: NormalizedOwner;
  sourceTriangleId: number;
  componentId: number;
  primitiveKind: "wall" | "triangle";
  featureKind: "segment" | "face" | "edge" | "vertex";
  canonicalFeatureId: number;
  toi: number;
  normalX: number;
  normalZ: number;
}>;

type SurfaceCandidate = Readonly<{
  sample: SurfaceSampleOut;
  priority: number;
  stableKey: string;
  preservesPrevious: boolean;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function compareUtf8(left: string, right: string): number {
  if (left === right) return 0;
  const a = utf8Encoder.encode(left);
  const b = utf8Encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function compareBoundaryHandles(left: RuntimeBoundaryHandle, right: RuntimeBoundaryHandle): number {
  const kind = compareUtf8(left.kind, right.kind);
  if (kind !== 0) return kind;
  if (left.kind === "owner-local" && right.kind === "owner-local") {
    return left.worldId - right.worldId
      || compareUtf8(left.ownerId, right.ownerId)
      || left.ownerGeneration - right.ownerGeneration
      || left.localBoundaryGroupKey - right.localBoundaryGroupKey;
  }
  if (left.kind === "road" && right.kind === "road") {
    return left.worldId - right.worldId
      || left.documentGeneration - right.documentGeneration
      || compareUtf8(left.roadEdgeId, right.roadEdgeId)
      || compareUtf8(left.side, right.side)
      || left.curbRun - right.curbRun;
  }
  if (left.kind === "surface-stitch" && right.kind === "surface-stitch") {
    return left.worldId - right.worldId
      || left.documentGeneration - right.documentGeneration
      || compareUtf8(left.stitchId, right.stitchId)
      || compareUtf8(left.groupId, right.groupId);
  }
  return 0;
}

function compareLocalCandidates(left: LocalSweepCandidate, right: LocalSweepCandidate): number {
  return left.toi - right.toi
    || compareUtf8(left.owner.ownerId, right.owner.ownerId)
    || left.owner.ownerGeneration - right.owner.ownerGeneration
    || left.sourceTriangleId - right.sourceTriangleId
    || compareUtf8(left.primitiveKind, right.primitiveKind)
    || compareUtf8(left.featureKind, right.featureKind)
    || left.canonicalFeatureId - right.canonicalFeatureId;
}

function sourceLocalBounds(source: CompiledCollisionSource) {
  const cached = sourceBoundsCache.get(source);
  if (cached) return cached;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const include = (x: number, y: number, z: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  };
  const walls = source.walls;
  for (let index = 0; index < walls.sourceTriangleIds.length; index += 1) {
    const segmentOffset = index * 4;
    const triangleOffset = index * 6;
    const ax = walls.segmentXZ[segmentOffset];
    const az = walls.segmentXZ[segmentOffset + 1];
    const bx = walls.segmentXZ[segmentOffset + 2];
    const bz = walls.segmentXZ[segmentOffset + 3];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const t = walls.triangleTY[triangleOffset + vertex * 2];
      const y = walls.triangleTY[triangleOffset + vertex * 2 + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const fraction = length <= GEOMETRY_EPSILON ? 0 : t / length;
      include(ax + (bx - ax) * fraction, y, az + (bz - az) * fraction);
    }
  }
  const surface = source.surfaceChunk;
  if (surface) {
    for (let triangle = 0; triangle < surface.triangleSurfaceKeys.length; triangle += 1) {
      const xzOffset = triangle * 6;
      const yOffset = triangle * 2;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        include(
          surface.triangleXZ[xzOffset + vertex * 2],
          vertex === 0 ? surface.triangleYRanges[yOffset] : surface.triangleYRanges[yOffset + 1],
          surface.triangleXZ[xzOffset + vertex * 2 + 1],
        );
      }
    }
    for (let boundary = 0; boundary < surface.boundaryTransitionProfileIndices.length; boundary += 1) {
      const offset = boundary * 4;
      include(surface.boundaryXZ[offset], 0, surface.boundaryXZ[offset + 1]);
      include(surface.boundaryXZ[offset + 2], 0, surface.boundaryXZ[offset + 3]);
    }
  }
  const fallbackBounds = source.fallback?.geometry.boundingBox;
  if (fallbackBounds) {
    include(fallbackBounds.min.x, fallbackBounds.min.y, fallbackBounds.min.z);
    include(fallbackBounds.max.x, fallbackBounds.max.y, fallbackBounds.max.z);
  }
  const bounds = Object.freeze(Number.isFinite(minX)
    ? { minX, minY, minZ, maxX, maxY, maxZ }
    : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
  sourceBoundsCache.set(source, bounds);
  return bounds;
}

function normalizeOwner(owner: CompiledCollisionRuntimeOwner, index = 0): NormalizedOwner {
  if (!owner.ownerId) throw new TypeError("compiled collision ownerId must not be empty");
  assertNonNegativeSafeInteger(owner.ownerGeneration, "compiled collision ownerGeneration");
  const transform: CompiledCollisionOwnerTransform = {
    x: owner.transform?.x ?? 0,
    y: owner.transform?.y ?? 0,
    z: owner.transform?.z ?? 0,
    yawRadians: owner.transform?.yawRadians ?? 0,
    uniformScale: owner.transform?.uniformScale ?? 1,
    heightScale: owner.transform?.heightScale ?? 1,
  };
  for (const [label, value] of Object.entries(transform)) assertFinite(value, `owner transform ${label}`);
  if (transform.uniformScale <= 0) throw new RangeError("owner uniformScale must be positive");
  if (transform.heightScale <= 0) throw new RangeError("owner heightScale must be positive");
  const cos = Math.cos(transform.yawRadians);
  const sin = Math.sin(transform.yawRadians);
  const localBounds = sourceLocalBounds(owner.source);
  const corners = [
    { x: localBounds.minX, z: localBounds.minZ },
    { x: localBounds.minX, z: localBounds.maxZ },
    { x: localBounds.maxX, z: localBounds.minZ },
    { x: localBounds.maxX, z: localBounds.maxZ },
  ].map((corner) => ({
    x: transform.x + transform.uniformScale * (cos * corner.x + sin * corner.z),
    z: transform.z + transform.uniformScale * (-sin * corner.x + cos * corner.z),
  }));
  const roadSurfaceIdByKey = new Map(
    (owner.roadSurfaceHandles ?? []).map((record) => [record.localSurfaceKey, record.roadSurfaceId]),
  );
  return Object.freeze({
    index,
    ownerId: owner.ownerId,
    ownerGeneration: owner.ownerGeneration,
    source: owner.source,
    ...transform,
    cos,
    sin,
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: transform.y + transform.uniformScale * transform.heightScale * localBounds.minY,
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: transform.y + transform.uniformScale * transform.heightScale * localBounds.maxY,
    maxZ: Math.max(...corners.map((corner) => corner.z)),
    roadSurfaceIdByKey,
    roadSurfaceKeyById: new Map([...roadSurfaceIdByKey].map(([key, id]) => [id, key])),
    roadBoundaryByGroupKey: new Map(
      (owner.roadBoundaryHandles ?? []).map((record) => [record.localBoundaryGroupKey, record]),
    ),
    surfaceHandleOwnerId: owner.surfaceHandleOwner?.ownerId ?? owner.ownerId,
    surfaceHandleOwnerGeneration: owner.surfaceHandleOwner?.ownerGeneration ?? owner.ownerGeneration,
  });
}

function ownerMatchesSource(
  normalized: NormalizedOwner,
  owner: CompiledCollisionRuntimeOwner,
): boolean {
  const transform = owner.transform;
  if (normalized.source !== owner.source
    || normalized.x !== (transform?.x ?? 0)
    || normalized.y !== (transform?.y ?? 0)
    || normalized.z !== (transform?.z ?? 0)
    || normalized.yawRadians !== (transform?.yawRadians ?? 0)
    || normalized.uniformScale !== (transform?.uniformScale ?? 1)
    || normalized.heightScale !== (transform?.heightScale ?? 1)
    || normalized.surfaceHandleOwnerId !== (owner.surfaceHandleOwner?.ownerId ?? owner.ownerId)) {
    return false;
  }
  const roadSurfaces = owner.roadSurfaceHandles ?? [];
  if (normalized.roadSurfaceIdByKey.size !== roadSurfaces.length
    || roadSurfaces.some((record) => normalized.roadSurfaceIdByKey.get(record.localSurfaceKey) !== record.roadSurfaceId)) {
    return false;
  }
  const roadBoundaries = owner.roadBoundaryHandles ?? [];
  if (normalized.roadBoundaryByGroupKey.size !== roadBoundaries.length) return false;
  for (const record of roadBoundaries) {
    const existing = normalized.roadBoundaryByGroupKey.get(record.localBoundaryGroupKey);
    if (!existing || existing.kind !== record.kind) return false;
    if (record.kind === "road"
      && (existing.kind !== "road"
        || existing.roadEdgeId !== record.roadEdgeId
        || existing.side !== record.side
        || existing.curbRun !== record.curbRun)) return false;
  }
  return true;
}

function ownerSpatialCellKeys(owner: NormalizedOwner): readonly string[] | null {
  const minCellX = Math.floor(owner.minX / OWNER_SPATIAL_CELL_SIZE_METERS);
  const minCellZ = Math.floor(owner.minZ / OWNER_SPATIAL_CELL_SIZE_METERS);
  const maxCellX = Math.floor(owner.maxX / OWNER_SPATIAL_CELL_SIZE_METERS);
  const maxCellZ = Math.floor(owner.maxZ / OWNER_SPATIAL_CELL_SIZE_METERS);
  const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
  if (cellCount > OWNER_SPATIAL_MAX_CELLS_PER_OWNER) return null;
  const keys: string[] = [];
  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) keys.push(`${cellX},${cellZ}`);
  }
  return keys;
}

function worldPointToLocal(owner: NormalizedOwner, x: number, z: number): Point2 {
  const dx = x - owner.x;
  const dz = z - owner.z;
  return {
    x: (owner.cos * dx - owner.sin * dz) / owner.uniformScale,
    z: (owner.sin * dx + owner.cos * dz) / owner.uniformScale,
  };
}

function worldVectorToLocal(owner: NormalizedOwner, x: number, z: number): Point2 {
  return {
    x: (owner.cos * x - owner.sin * z) / owner.uniformScale,
    z: (owner.sin * x + owner.cos * z) / owner.uniformScale,
  };
}

function localPointToWorld(owner: NormalizedOwner, x: number, z: number): Point2 {
  return {
    x: owner.x + owner.uniformScale * (owner.cos * x + owner.sin * z),
    z: owner.z + owner.uniformScale * (-owner.sin * x + owner.cos * z),
  };
}

function localNormalToWorld(owner: NormalizedOwner, x: number, z: number): Point2 {
  return {
    x: owner.cos * x + owner.sin * z,
    z: -owner.sin * x + owner.cos * z,
  };
}

function clipPolygonByMinimumY<T extends { y: number }>(
  polygon: readonly T[],
  minimumY: number,
  interpolate: (a: T, b: T, fraction: number) => T,
): T[] {
  if (polygon.length === 0) return [];
  const result: T[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const aInside = a.y >= minimumY - GEOMETRY_EPSILON;
    const bInside = b.y >= minimumY - GEOMETRY_EPSILON;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const denominator = b.y - a.y;
      if (Math.abs(denominator) > GEOMETRY_EPSILON) {
        result.push(interpolate(a, b, (minimumY - a.y) / denominator));
      }
    }
  }
  return result;
}

function clipPolygonByMaximumY<T extends { y: number }>(
  polygon: readonly T[],
  maximumY: number,
  interpolate: (a: T, b: T, fraction: number) => T,
): T[] {
  if (polygon.length === 0) return [];
  const result: T[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const aInside = a.y <= maximumY + GEOMETRY_EPSILON;
    const bInside = b.y <= maximumY + GEOMETRY_EPSILON;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const denominator = b.y - a.y;
      if (Math.abs(denominator) > GEOMETRY_EPSILON) {
        result.push(interpolate(a, b, (maximumY - a.y) / denominator));
      }
    }
  }
  return result;
}

function clipTyTriangle(points: readonly PointTY[], minY: number, maxY: number): PointTY[] {
  const interpolate = (a: PointTY, b: PointTY, fraction: number): PointTY => ({
    t: a.t + (b.t - a.t) * fraction,
    y: a.y + (b.y - a.y) * fraction,
  });
  return clipPolygonByMaximumY(
    clipPolygonByMinimumY(points, minY, interpolate),
    maxY,
    interpolate,
  );
}

function clipTriangle3d(points: readonly Point3[], minY: number, maxY: number): Point3[] {
  const interpolate = (a: Point3, b: Point3, fraction: number): Point3 => ({
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  });
  return clipPolygonByMaximumY(
    clipPolygonByMinimumY(points, minY, interpolate),
    maxY,
    interpolate,
  );
}

function squaredDistance(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function normalizeProjectedPolygon(points: readonly Point3[]): Point2[] {
  const result: Point2[] = [];
  for (const point of points) {
    const projected = { x: point.x, z: point.z };
    if (result.length === 0 || squaredDistance(result[result.length - 1], projected) > GEOMETRY_EPSILON ** 2) {
      result.push(projected);
    }
  }
  if (result.length > 1 && squaredDistance(result[0], result[result.length - 1]) <= GEOMETRY_EPSILON ** 2) {
    result.pop();
  }
  return result;
}

function closestPointOnSegment(point: Point2, a: Point2, b: Point2): Readonly<Point2 & { fraction: number }> {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const fraction = lengthSquared <= GEOMETRY_EPSILON
    ? 0
    : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return { x: a.x + dx * fraction, z: a.z + dz * fraction, fraction };
}

function signedPolygonArea(polygon: readonly Point2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return twiceArea * 0.5;
}

function pointInsideConvexPolygon(point: Point2, polygon: readonly Point2[]): boolean {
  if (polygon.length < 3 || Math.abs(signedPolygonArea(polygon)) <= GEOMETRY_EPSILON) return false;
  let positive = false;
  let negative = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    positive ||= cross > GEOMETRY_EPSILON;
    negative ||= cross < -GEOMETRY_EPSILON;
    if (positive && negative) return false;
  }
  return true;
}

function nearestPolygonBoundary(
  point: Point2,
  polygon: readonly Point2[],
): Readonly<{ distance: number; closestX: number; closestZ: number; edge: number }> {
  let bestDistanceSquared = Infinity;
  let closestX = polygon[0]?.x ?? point.x;
  let closestZ = polygon[0]?.z ?? point.z;
  let edge = 0;
  const edgeCount = polygon.length === 2 ? 1 : polygon.length;
  for (let index = 0; index < edgeCount; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const closest = closestPointOnSegment(point, a, b);
    const distanceSquared = (point.x - closest.x) ** 2 + (point.z - closest.z) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      closestX = closest.x;
      closestZ = closest.z;
      edge = index;
    }
  }
  return { distance: Math.sqrt(bestDistanceSquared), closestX, closestZ, edge };
}

function distanceToProjectedPolygon(point: Point2, polygon: readonly Point2[]): number {
  if (polygon.length === 0) return Infinity;
  if (polygon.length === 1) return Math.sqrt(squaredDistance(point, polygon[0]));
  if (pointInsideConvexPolygon(point, polygon)) return 0;
  return nearestPolygonBoundary(point, polygon).distance;
}

type RawSweepCandidate = Readonly<{
  toi: number;
  normalX: number;
  normalZ: number;
  featureKind: "segment" | "face" | "edge" | "vertex";
  featureSlot: number;
}>;

function addSegmentSweepCandidates(
  target: RawSweepCandidate[],
  start: Point2,
  delta: Point2,
  radius: number,
  a: Point2,
  b: Point2,
  sideFeatureKind: "segment" | "face" | "edge",
  featureSlotBase: number,
): void {
  const edgeX = b.x - a.x;
  const edgeZ = b.z - a.z;
  const length = Math.hypot(edgeX, edgeZ);
  if (length <= GEOMETRY_EPSILON) {
    addPointSweepCandidate(target, start, delta, radius, a, featureSlotBase);
    return;
  }
  const tangentX = edgeX / length;
  const tangentZ = edgeZ / length;
  const baseNormalX = -tangentZ;
  const baseNormalZ = tangentX;
  for (const sign of [-1, 1] as const) {
    const normalX = baseNormalX * sign;
    const normalZ = baseNormalZ * sign;
    const denominator = delta.x * normalX + delta.z * normalZ;
    if (denominator >= -SWEEP_EPSILON) continue;
    const startDistance = (start.x - a.x) * normalX + (start.z - a.z) * normalZ;
    const toi = (radius - startDistance) / denominator;
    if (toi < -SWEEP_EPSILON || toi > 1 + SWEEP_EPSILON) continue;
    const clampedToi = Math.max(0, Math.min(1, toi));
    const contactX = start.x + delta.x * clampedToi;
    const contactZ = start.z + delta.z * clampedToi;
    const along = (contactX - a.x) * tangentX + (contactZ - a.z) * tangentZ;
    if (along <= GEOMETRY_EPSILON || along >= length - GEOMETRY_EPSILON) continue;
    target.push({
      toi: clampedToi,
      normalX,
      normalZ,
      featureKind: sideFeatureKind,
      featureSlot: featureSlotBase,
    });
  }
  addPointSweepCandidate(target, start, delta, radius, a, featureSlotBase + 1);
  addPointSweepCandidate(target, start, delta, radius, b, featureSlotBase + 2);
}

function addPointSweepCandidate(
  target: RawSweepCandidate[],
  start: Point2,
  delta: Point2,
  radius: number,
  point: Point2,
  featureSlot: number,
): void {
  const mx = start.x - point.x;
  const mz = start.z - point.z;
  const a = delta.x * delta.x + delta.z * delta.z;
  if (a <= GEOMETRY_EPSILON) return;
  const b = 2 * (mx * delta.x + mz * delta.z);
  const c = mx * mx + mz * mz - radius * radius;
  if (c < -SWEEP_EPSILON) return;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < -SWEEP_EPSILON) return;
  discriminant = Math.max(0, discriminant);
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
  for (const root of roots) {
    if (root < -SWEEP_EPSILON || root > 1 + SWEEP_EPSILON) continue;
    const toi = Math.max(0, Math.min(1, root));
    const x = start.x + delta.x * toi;
    const z = start.z + delta.z * toi;
    const distance = Math.hypot(x - point.x, z - point.z);
    if (distance <= GEOMETRY_EPSILON) continue;
    const normalX = (x - point.x) / distance;
    const normalZ = (z - point.z) / distance;
    if (delta.x * normalX + delta.z * normalZ >= -SWEEP_EPSILON) continue;
    target.push({ toi, normalX, normalZ, featureKind: "vertex", featureSlot });
    return;
  }
}

function initialOverlapCandidate(
  start: Point2,
  delta: Point2,
  radius: number,
  polygon: readonly Point2[],
): RawSweepCandidate | null {
  if (polygon.length === 0) return null;
  const inside = pointInsideConvexPolygon(start, polygon);
  const nearest = nearestPolygonBoundary(start, polygon);
  if (!inside && nearest.distance >= radius - SWEEP_EPSILON) return null;
  let normalX = start.x - nearest.closestX;
  let normalZ = start.z - nearest.closestZ;
  let length = Math.hypot(normalX, normalZ);
  if (inside || length <= GEOMETRY_EPSILON) {
    const a = polygon[nearest.edge];
    const b = polygon[(nearest.edge + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeZ = b.z - a.z;
    length = Math.hypot(edgeX, edgeZ);
    const orientation = signedPolygonArea(polygon) >= 0 ? 1 : -1;
    normalX = orientation * edgeZ / Math.max(length, GEOMETRY_EPSILON);
    normalZ = -orientation * edgeX / Math.max(length, GEOMETRY_EPSILON);
  } else {
    normalX /= length;
    normalZ /= length;
  }
  if (delta.x * normalX + delta.z * normalZ >= -SWEEP_EPSILON) return null;
  return { toi: 0, normalX, normalZ, featureKind: "face", featureSlot: 0 };
}

function sweepProjectedPolygon(
  start: Point2,
  delta: Point2,
  radius: number,
  polygon: readonly Point2[],
): RawSweepCandidate[] {
  if (polygon.length === 0) return [];
  const initial = initialOverlapCandidate(start, delta, radius, polygon);
  if (initial) return [initial];
  const raw: RawSweepCandidate[] = [];
  if (polygon.length === 1) {
    addPointSweepCandidate(raw, start, delta, radius, polygon[0], 1);
  } else {
    const area = Math.abs(signedPolygonArea(polygon));
    const edgeCount = polygon.length === 2 || area <= GEOMETRY_EPSILON ? polygon.length - 1 : polygon.length;
    for (let edge = 0; edge < edgeCount; edge += 1) {
      addSegmentSweepCandidates(
        raw,
        start,
        delta,
        radius,
        polygon[edge],
        polygon[(edge + 1) % polygon.length],
        area > GEOMETRY_EPSILON ? "face" : "segment",
        edge * 3,
      );
    }
  }
  return raw.filter((candidate) => {
    const point = {
      x: start.x + delta.x * candidate.toi,
      z: start.z + delta.z * candidate.toi,
    };
    if (distanceToProjectedPolygon(point, polygon) > radius + 1e-6) return false;
    const beforeToi = Math.max(0, candidate.toi - 1e-6);
    if (beforeToi === candidate.toi) return true;
    const before = {
      x: start.x + delta.x * beforeToi,
      z: start.z + delta.z * beforeToi,
    };
    return distanceToProjectedPolygon(before, polygon) >= radius - 1e-6;
  });
}

function wallCandidates(
  owner: NormalizedOwner,
  request: CompiledCircleSweepRequest,
): LocalSweepCandidate[] {
  const start = worldPointToLocal(owner, request.startX, request.startZ);
  const delta = worldVectorToLocal(owner, request.deltaX, request.deltaZ);
  const radius = (request.radius ?? BIKE_COLLISION_RADIUS_METERS) / owner.uniformScale;
  const verticalScale = owner.uniformScale * owner.heightScale;
  const minY = (request.minY - owner.y) / verticalScale;
  const maxY = (request.maxY - owner.y) / verticalScale;
  const walls = owner.source.walls;
  const count = walls.sourceTriangleIds.length;
  const candidates: LocalSweepCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    const segmentOffset = index * 4;
    const tyOffset = index * 6;
    const ax = walls.segmentXZ[segmentOffset];
    const az = walls.segmentXZ[segmentOffset + 1];
    const bx = walls.segmentXZ[segmentOffset + 2];
    const bz = walls.segmentXZ[segmentOffset + 3];
    const length = Math.hypot(bx - ax, bz - az);
    if (length <= GEOMETRY_EPSILON) continue;
    const clipped = clipTyTriangle([
      { t: walls.triangleTY[tyOffset], y: walls.triangleTY[tyOffset + 1] },
      { t: walls.triangleTY[tyOffset + 2], y: walls.triangleTY[tyOffset + 3] },
      { t: walls.triangleTY[tyOffset + 4], y: walls.triangleTY[tyOffset + 5] },
    ], minY, maxY);
    if (clipped.length === 0) continue;
    const minimumT = Math.max(0, Math.min(length, Math.min(...clipped.map((point) => point.t))));
    const maximumT = Math.max(0, Math.min(length, Math.max(...clipped.map((point) => point.t))));
    const tangentX = (bx - ax) / length;
    const tangentZ = (bz - az) / length;
    const a = { x: ax + tangentX * minimumT, z: az + tangentZ * minimumT };
    const b = { x: ax + tangentX * maximumT, z: az + tangentZ * maximumT };
    const raw: RawSweepCandidate[] = [];
    addSegmentSweepCandidates(raw, start, delta, radius, a, b, "segment", 0);
    const sourceTriangleId = walls.sourceTriangleIds[index];
    for (const hit of raw) {
      candidates.push({
        owner,
        sourceTriangleId,
        componentId: walls.componentIds[index],
        primitiveKind: "wall",
        featureKind: hit.featureKind,
        canonicalFeatureId: sourceTriangleId * 8 + hit.featureSlot,
        toi: hit.toi,
        normalX: hit.normalX,
        normalZ: hit.normalZ,
      });
    }
  }
  return candidates;
}

function fallbackCandidates(
  owner: NormalizedOwner,
  request: CompiledCircleSweepRequest,
): Readonly<{ candidates: LocalSweepCandidate[]; candidateCount: number }> {
  const fallback = owner.source.fallback;
  if (!fallback) return { candidates: [], candidateCount: 0 };
  const start = worldPointToLocal(owner, request.startX, request.startZ);
  const delta = worldVectorToLocal(owner, request.deltaX, request.deltaZ);
  const radius = (request.radius ?? BIKE_COLLISION_RADIUS_METERS) / owner.uniformScale;
  const verticalScale = owner.uniformScale * owner.heightScale;
  const minY = (request.minY - owner.y) / verticalScale;
  const maxY = (request.maxY - owner.y) / verticalScale;
  const queryBox = new Box3(
    new Vector3(
      Math.min(start.x, start.x + delta.x) - radius,
      minY,
      Math.min(start.z, start.z + delta.z) - radius,
    ),
    new Vector3(
      Math.max(start.x, start.x + delta.x) + radius,
      maxY,
      Math.max(start.z, start.z + delta.z) + radius,
    ),
  );
  const candidates: LocalSweepCandidate[] = [];
  let candidateCount = 0;
  fallback.bvh.shapecast({
    intersectsBounds: (bounds) => bounds.intersectsBox(queryBox),
    intersectsTriangle: (_triangle, triangleIndex) => {
      candidateCount += 1;
      const geometryIndex = fallback.geometry.index;
      const positions = fallback.geometry.getAttribute("position");
      if (!geometryIndex) throw new Error("fallback collision geometry must be indexed");
      const vertexA = geometryIndex.getX(triangleIndex * 3);
      const vertexB = geometryIndex.getX(triangleIndex * 3 + 1);
      const vertexC = geometryIndex.getX(triangleIndex * 3 + 2);
      const ax = positions.getX(vertexA);
      const ay = positions.getY(vertexA);
      const az = positions.getZ(vertexA);
      const bx = positions.getX(vertexB);
      const by = positions.getY(vertexB);
      const bz = positions.getZ(vertexB);
      const cx = positions.getX(vertexC);
      const cy = positions.getY(vertexC);
      const cz = positions.getZ(vertexC);
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      const normalX = uy * vz - uz * vy;
      const normalY = uz * vx - ux * vz;
      const normalZ = ux * vy - uy * vx;
      const transformedNormalY = normalY / owner.heightScale;
      const normalLength = Math.hypot(normalX, transformedNormalY, normalZ);
      if (normalLength <= GEOMETRY_EPSILON
        || Math.hypot(normalX, normalZ) / normalLength
          < CITY_SOLID_HORIZONTAL_RESPONSE_MIN_NORMAL_XZ) {
        return false;
      }
      const clipped = clipTriangle3d([
        { x: ax, y: ay, z: az },
        { x: bx, y: by, z: bz },
        { x: cx, y: cy, z: cz },
      ], minY, maxY);
      const polygon = normalizeProjectedPolygon(clipped);
      if (polygon.length === 0) return false;
      const raw = sweepProjectedPolygon(start, delta, radius, polygon);
      if (triangleIndex < 0 || triangleIndex >= fallback.resolvedSourceTriangleIds.length) {
        throw new RangeError("MeshBVH returned an out-of-range fallback triangle index");
      }
      const sourceTriangleId = fallback.resolvedSourceTriangleIds[triangleIndex];
      for (const hit of raw) {
        candidates.push({
          owner,
          sourceTriangleId,
          componentId: fallback.resolvedComponentIds[triangleIndex],
          primitiveKind: "triangle",
          featureKind: hit.featureKind,
          canonicalFeatureId: sourceTriangleId * 32 + hit.featureSlot,
          toi: hit.toi,
          normalX: hit.normalX,
          normalZ: hit.normalZ,
        });
      }
      return false;
    },
  });
  return { candidates, candidateCount };
}

function toWorldHit(candidate: LocalSweepCandidate, moveLength: number): CompiledCircleSweepHit {
  const normal = localNormalToWorld(candidate.owner, candidate.normalX, candidate.normalZ);
  return Object.freeze({
    ownerId: candidate.owner.ownerId,
    ownerGeneration: candidate.owner.ownerGeneration,
    sourceTriangleId: candidate.sourceTriangleId,
    componentId: candidate.componentId,
    primitiveKind: candidate.primitiveKind,
    featureKind: candidate.featureKind,
    canonicalFeatureId: candidate.canonicalFeatureId,
    toi: candidate.toi,
    distance: candidate.toi * moveLength,
    normalX: normal.x,
    normalZ: normal.z,
  });
}

export function queryCompiledCollisionSweep(
  owners: readonly CompiledCollisionRuntimeOwner[],
  request: Readonly<CompiledCircleSweepRequest>,
): CompiledCircleSweepResult {
  const normalized = owners.map(normalizeOwner);
  return queryNormalizedCollisionSweep(normalized, request);
}

function queryNormalizedCollisionSweep(
  owners: readonly NormalizedOwner[],
  request: Readonly<CompiledCircleSweepRequest>,
): CompiledCircleSweepResult {
  for (const [label, value] of Object.entries(request)) {
    if (value !== undefined) assertFinite(value, `compiled sweep ${label}`);
  }
  const radius = request.radius ?? BIKE_COLLISION_RADIUS_METERS;
  if (radius <= 0) throw new RangeError("compiled sweep radius must be positive");
  if (request.maxY < request.minY) throw new RangeError("compiled sweep maxY must be >= minY");
  const moveLength = Math.hypot(request.deltaX, request.deltaZ);
  if (moveLength <= GEOMETRY_EPSILON) {
    return Object.freeze({ hit: null, ties: Object.freeze([]), fallbackTriangleCandidateCount: 0 });
  }
  const candidates: LocalSweepCandidate[] = [];
  let fallbackTriangleCandidateCount = 0;
  for (const owner of owners) {
    candidates.push(...wallCandidates(owner, request));
    const fallback = fallbackCandidates(owner, request);
    candidates.push(...fallback.candidates);
    fallbackTriangleCandidateCount += fallback.candidateCount;
  }
  candidates.sort(compareLocalCandidates);
  if (candidates.length === 0) {
    return Object.freeze({ hit: null, ties: Object.freeze([]), fallbackTriangleCandidateCount });
  }
  const earliestDistance = candidates[0].toi * moveLength;
  const ties = candidates
    .filter((candidate) => candidate.toi * moveLength <= earliestDistance + TOI_DISTANCE_EPS_METERS)
    .map((candidate) => toWorldHit(candidate, moveLength));
  return Object.freeze({
    hit: ties[0] ?? null,
    ties: Object.freeze(ties),
    fallbackTriangleCandidateCount,
  });
}

function pointInTriangleXZ(chunk: PackedSurfaceChunk, triangleIndex: number, x: number, z: number): boolean {
  const offset = triangleIndex * 6;
  const ax = chunk.triangleXZ[offset];
  const az = chunk.triangleXZ[offset + 1];
  const bx = chunk.triangleXZ[offset + 2];
  const bz = chunk.triangleXZ[offset + 3];
  const cx = chunk.triangleXZ[offset + 4];
  const cz = chunk.triangleXZ[offset + 5];
  const ab = (bx - ax) * (z - az) - (bz - az) * (x - ax);
  const bc = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
  const ca = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
  const positive = ab > SURFACE_EPSILON || bc > SURFACE_EPSILON || ca > SURFACE_EPSILON;
  const negative = ab < -SURFACE_EPSILON || bc < -SURFACE_EPSILON || ca < -SURFACE_EPSILON;
  return !(positive && negative);
}

function ownerSurfaceHandle(
  worldId: number,
  owner: NormalizedOwner,
  localSurfaceKey: number,
): RuntimeSurfaceHandle {
  const roadSurfaceId = owner.roadSurfaceIdByKey.get(localSurfaceKey);
  if (roadSurfaceId) {
    return Object.freeze({
      kind: "road",
      worldId,
      documentGeneration: owner.ownerGeneration,
      roadSurfaceId,
    });
  }
  return Object.freeze({
    kind: "owner-local",
    worldId,
    ownerId: owner.surfaceHandleOwnerId,
    ownerGeneration: owner.surfaceHandleOwnerGeneration,
    localSurfaceKey,
  });
}

function sameSurfaceHandle(left: RuntimeSurfaceHandle | null, right: RuntimeSurfaceHandle): boolean {
  if (!left || left.kind !== right.kind || left.worldId !== right.worldId) return false;
  if (left.kind === "implicit-ground" && right.kind === "implicit-ground") {
    return left.documentGeneration === right.documentGeneration;
  }
  if (left.kind === "road" && right.kind === "road") {
    return left.documentGeneration === right.documentGeneration && left.roadSurfaceId === right.roadSurfaceId;
  }
  return left.kind === "owner-local" && right.kind === "owner-local"
    && left.ownerId === right.ownerId
    && left.ownerGeneration === right.ownerGeneration
    && left.localSurfaceKey === right.localSurfaceKey;
}

function sampleOwnerSurfaceCandidates(
  owner: NormalizedOwner,
  worldId: number,
  x: number,
  z: number,
  query: Readonly<SurfaceSampleQuery>,
  requiredSurfaceKey?: number,
): SurfaceCandidate[] {
  const chunk = owner.source.surfaceChunk;
  if (!chunk) return [];
  const local = worldPointToLocal(owner, x, z);
  const originX = chunk.chunkX * CITY_SURFACE_CHUNK_SIZE_METERS;
  const originZ = chunk.chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS;
  const cellX = Math.floor(local.x - originX);
  const cellZ = Math.floor(local.z - originZ);
  if (cellX < 0 || cellX >= CITY_SURFACE_CELLS_PER_AXIS
    || cellZ < 0 || cellZ >= CITY_SURFACE_CELLS_PER_AXIS) return [];
  const cell = cellZ * CITY_SURFACE_CELLS_PER_AXIS + cellX;
  const result: SurfaceCandidate[] = [];
  for (let ref = chunk.cellStart[cell]; ref < chunk.cellStart[cell + 1]; ref += 1) {
    const triangleIndex = chunk.cellTriangleRefs[ref];
    if (!pointInTriangleXZ(chunk, triangleIndex, local.x, local.z)) continue;
    const surfaceKey = chunk.triangleSurfaceKeys[triangleIndex];
    if (requiredSurfaceKey !== undefined && surfaceKey !== requiredSurfaceKey) continue;
    const planeOffset = triangleIndex * 4;
    const nx = chunk.trianglePlanes[planeOffset];
    const ny = chunk.trianglePlanes[planeOffset + 1];
    const nz = chunk.trianglePlanes[planeOffset + 2];
    const d = chunk.trianglePlanes[planeOffset + 3];
    if (ny <= GEOMETRY_EPSILON) continue;
    const localHeight = -(nx * local.x + nz * local.z + d) / ny;
    const height = owner.y + localHeight * owner.uniformScale * owner.heightScale;
    const handle = ownerSurfaceHandle(worldId, owner, surfaceKey);
    const preservesPrevious = sameSurfaceHandle(query.previousHandle, handle);
    if (!preservesPrevious && height > query.currentY + query.maxStepUpMeters + SURFACE_EPSILON) continue;
    const profileIndex = chunk.triangleProfileIndices[triangleIndex];
    const profile = owner.source.surfaceProfiles[profileIndex];
    if (!profile) continue;
    const transformedNormalY = ny / owner.heightScale;
    const normalLength = Math.hypot(nx, transformedNormalY, nz);
    if (normalLength <= GEOMETRY_EPSILON) continue;
    const worldNormalXZ = localNormalToWorld(owner, nx / normalLength, nz / normalLength);
    const worldNormalY = transformedNormalY / normalLength;
    const sample: SurfaceSampleOut = {
      handle,
      profileId: profile.id,
      height,
      normalX: worldNormalXZ.x,
      normalY: worldNormalY,
      normalZ: worldNormalXZ.z,
      gx: -worldNormalXZ.x / worldNormalY,
      gz: -worldNormalXZ.z / worldNormalY,
      speedCap: chunk.triangleSpeedCaps[triangleIndex],
    };
    result.push({
      sample,
      priority: profile.selectionPriority,
      stableKey: canonicalTupleKey([owner.ownerId, owner.ownerGeneration, surfaceKey, chunk.triangleSourceIds[triangleIndex]]),
      preservesPrevious,
    });
  }
  return result;
}

function cloneSurfaceHandle(handle: RuntimeSurfaceHandle): RuntimeSurfaceHandle {
  return Object.freeze({ ...handle }) as RuntimeSurfaceHandle;
}

function cloneSurfaceSample(source: Readonly<SurfaceSampleOut>): SurfaceSampleOut {
  return {
    ...source,
    handle: cloneSurfaceHandle(source.handle),
  };
}

function segmentIntersectionFraction(
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number | null {
  const edgeX = bx - ax;
  const edgeZ = bz - az;
  const denominator = deltaX * edgeZ - deltaZ * edgeX;
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return null;
  const offsetX = ax - startX;
  const offsetZ = az - startZ;
  const t = (offsetX * edgeZ - offsetZ * edgeX) / denominator;
  const u = (offsetX * deltaZ - offsetZ * deltaX) / denominator;
  if (t <= GEOMETRY_EPSILON || t > 1 + GEOMETRY_EPSILON
    || u < -GEOMETRY_EPSILON || u > 1 + GEOMETRY_EPSILON) return null;
  return Math.min(1, t);
}

function currentLocalSurfaceKey(current: RuntimeSurfaceHandle, owner: NormalizedOwner): number | null {
  if (current.kind === "implicit-ground") return IMPLICIT_GROUND_SURFACE_KEY;
  if (current.kind === "road") return owner.roadSurfaceKeyById.get(current.roadSurfaceId) ?? null;
  if (current.kind === "owner-local"
    && current.ownerId === owner.surfaceHandleOwnerId
    && current.ownerGeneration === owner.surfaceHandleOwnerGeneration) return current.localSurfaceKey;
  return null;
}

function boundaryRefsForLocalSweep(
  chunk: PackedSurfaceChunk,
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
): readonly number[] {
  const originX = chunk.chunkX * CITY_SURFACE_CHUNK_SIZE_METERS;
  const originZ = chunk.chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS;
  const minCellX = Math.max(0, Math.floor(Math.min(startX, startX + deltaX)
    - SURFACE_BOUNDARY_PROBE_EPS_METERS - originX));
  const minCellZ = Math.max(0, Math.floor(Math.min(startZ, startZ + deltaZ)
    - SURFACE_BOUNDARY_PROBE_EPS_METERS - originZ));
  const maxCellX = Math.min(CITY_SURFACE_CELLS_PER_AXIS - 1, Math.floor(Math.max(startX, startX + deltaX)
    + SURFACE_BOUNDARY_PROBE_EPS_METERS - originX));
  const maxCellZ = Math.min(CITY_SURFACE_CELLS_PER_AXIS - 1, Math.floor(Math.max(startZ, startZ + deltaZ)
    + SURFACE_BOUNDARY_PROBE_EPS_METERS - originZ));
  if (minCellX > maxCellX || minCellZ > maxCellZ) return Object.freeze([]);
  const seen = new Set<number>();
  const refs: number[] = [];
  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const cell = cellZ * CITY_SURFACE_CELLS_PER_AXIS + cellX;
      for (let offset = chunk.cellBoundaryStart[cell]; offset < chunk.cellBoundaryStart[cell + 1]; offset += 1) {
        const boundary = chunk.cellBoundaryRefs[offset];
        if (seen.has(boundary)) continue;
        seen.add(boundary);
        refs.push(boundary);
      }
    }
  }
  refs.sort((left, right) => left - right);
  return refs;
}

function ownerBoundaryHandle(
  worldId: number,
  documentGeneration: number,
  owner: NormalizedOwner,
  localBoundaryGroupKey: number,
): RuntimeBoundaryHandle {
  const road = owner.roadBoundaryByGroupKey.get(localBoundaryGroupKey);
  if (road?.kind === "road") {
    return Object.freeze({
      kind: "road",
      worldId,
      documentGeneration,
      roadEdgeId: road.roadEdgeId,
      side: road.side,
      curbRun: road.curbRun,
    });
  }
  return Object.freeze({
    kind: "owner-local",
    worldId,
    ownerId: owner.ownerId,
    ownerGeneration: owner.ownerGeneration,
    localBoundaryGroupKey,
  });
}

function copyBoundaryCrossing(crossing: SurfaceBridgeBoundaryCrossing): CompiledSurfaceBoundaryCrossing {
  return Object.freeze({
    ...crossing,
    normalX: 0,
    normalZ: 0,
    kind: "road-curb" as const,
  });
}

function impactContactHandle(worldId: number, hit: CompiledCircleSweepHit): RuntimeContactHandle {
  return Object.freeze({
    worldId,
    ownerId: hit.ownerId,
    ownerGeneration: hit.ownerGeneration,
    primitiveKind: hit.primitiveKind,
    featureKind: hit.featureKind,
    canonicalFeatureId: hit.canonicalFeatureId,
  });
}

function contactKey(worldId: number, hit: CompiledCircleSweepHit): string {
  return canonicalTupleKey([
    worldId,
    hit.ownerId,
    hit.ownerGeneration,
    hit.primitiveKind,
    hit.featureKind,
    hit.canonicalFeatureId,
  ]);
}

function addConstraint(
  constraints: Array<{ normalX: number; normalZ: number }>,
  normalX: number,
  normalZ: number,
): void {
  if (constraints.some((constraint) => constraint.normalX * normalX + constraint.normalZ * normalZ > 0.99999)) {
    return;
  }
  constraints.push({ normalX, normalZ });
}

function projectAgainstConstraints(
  x: number,
  z: number,
  constraints: readonly Readonly<{ normalX: number; normalZ: number }>[],
): Point2 {
  let resultX = x;
  let resultZ = z;
  for (let pass = 0; pass <= constraints.length; pass += 1) {
    let changed = false;
    for (const constraint of constraints) {
      const inward = resultX * constraint.normalX + resultZ * constraint.normalZ;
      if (inward < -SWEEP_EPSILON) {
        resultX -= constraint.normalX * inward;
        resultZ -= constraint.normalZ * inward;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { x: resultX, z: resultZ };
}

/**
 * Runtime over immutable compiler outputs. It borrows (does not dispose) the
 * compiled geometry/BVH buffers. Owner replacement is explicit and atomic at
 * this object's boundary; cache/lease ownership remains the caller's job.
 * The owner list is the broad-phase input (this minimal layer scans it), and
 * closed-component containment / deep pose recovery remains a world-assembler
 * responsibility. Fallback contacts are resolved from real source triangles,
 * not from BVH node boxes.
 */
export class CompiledCityCollisionRuntime {
  readonly worldId: number;
  readonly documentGeneration: number;
  private owners: readonly NormalizedOwner[];
  private ownerCells = new Map<string, readonly NormalizedOwner[]>();
  private globalOwners: readonly NormalizedOwner[] = Object.freeze([]);
  private lastCandidateOwnerCount = 0;
  private maxCandidateOwnerCount = 0;
  private lastBucketEntryVisitCount = 0;
  private maxBucketEntryVisitCount = 0;
  private ownerVisitMarks = new Uint32Array(0);
  private ownerVisitEpoch = 0;
  private readonly surfaceBridge: CompiledSurfaceRuntimeBridge | null;
  private activeContacts = new Set<string>();
  private readonly bridgeSample: SurfaceSampleOut;
  private buildStats: CompiledCollisionRuntimeBuildStats;

  constructor(
    owners: readonly CompiledCollisionRuntimeOwner[],
    options: Readonly<{
      worldId?: number;
      documentGeneration?: number;
      surfaceBridge?: CompiledSurfaceRuntimeBridge | null;
      reuseOwnerIndexFrom?: CompiledCityCollisionRuntime | null;
    }> = {},
  ) {
    this.worldId = options.worldId ?? nextCompiledRuntimeWorldId++;
    this.documentGeneration = options.documentGeneration ?? 1;
    assertNonNegativeSafeInteger(this.worldId, "compiled collision worldId");
    assertNonNegativeSafeInteger(this.documentGeneration, "compiled collision documentGeneration");
    this.surfaceBridge = options.surfaceBridge ?? null;
    this.owners = Object.freeze([]);
    this.buildStats = Object.freeze({
      fullOwnerIndexRebuild: true,
      reusedOwnerCount: 0,
      addedOwnerCount: owners.length,
      updatedOwnerCount: 0,
      removedOwnerCount: 0,
      affectedSpatialCellCount: 0,
    });
    if (options.reuseOwnerIndexFrom) {
      this.reuseOwnerSpatialIndex(owners, options.reuseOwnerIndexFrom);
    } else {
      this.owners = Object.freeze(owners.map((owner, index) => normalizeOwner(owner, index)));
      this.rebuildOwnerSpatialIndex();
      this.buildStats = Object.freeze({
        ...this.buildStats,
        affectedSpatialCellCount: this.ownerCells.size,
      });
    }
    this.bridgeSample = createImplicitGroundSurfaceSample(this.worldId, this.documentGeneration);
    this.assertUniqueOwners();
  }

  replaceOwners(owners: readonly CompiledCollisionRuntimeOwner[]): void {
    this.owners = Object.freeze(owners.map((owner, index) => normalizeOwner(owner, index)));
    this.rebuildOwnerSpatialIndex();
    this.buildStats = Object.freeze({
      fullOwnerIndexRebuild: true,
      reusedOwnerCount: 0,
      addedOwnerCount: owners.length,
      updatedOwnerCount: 0,
      removedOwnerCount: 0,
      affectedSpatialCellCount: this.ownerCells.size,
    });
    this.assertUniqueOwners();
    this.resetRiderContacts();
  }

  getBuildStats(): CompiledCollisionRuntimeBuildStats {
    return this.buildStats;
  }

  getOwnerWorldBounds(ownerId: string): CompiledCollisionOwnerWorldBounds | null {
    const owner = this.owners.find((candidate) => candidate.ownerId === ownerId);
    if (!owner) return null;
    return Object.freeze({
      minX: owner.minX,
      minY: owner.minY,
      minZ: owner.minZ,
      maxX: owner.maxX,
      maxY: owner.maxY,
      maxZ: owner.maxZ,
    });
  }

  querySweep(request: Readonly<CompiledCircleSweepRequest>): CompiledCircleSweepResult {
    const radius = request.radius ?? BIKE_COLLISION_RADIUS_METERS;
    const endX = request.startX + request.deltaX;
    const endZ = request.startZ + request.deltaZ;
    return queryNormalizedCollisionSweep(this.queryOwners(
      Math.min(request.startX, endX) - radius,
      Math.min(request.startZ, endZ) - radius,
      Math.max(request.startX, endX) + radius,
      Math.max(request.startZ, endZ) + radius,
      request.minY,
      request.maxY,
    ), request);
  }

  getPerformanceStats(): CompiledCollisionRuntimePerformanceStats {
    return Object.freeze({
      ownerCount: this.owners.length,
      spatialCellSizeMeters: OWNER_SPATIAL_CELL_SIZE_METERS,
      spatialCellCount: this.ownerCells.size,
      globalOwnerCount: this.globalOwners.length,
      lastCandidateOwnerCount: this.lastCandidateOwnerCount,
      maxCandidateOwnerCount: this.maxCandidateOwnerCount,
      lastBucketEntryVisitCount: this.lastBucketEntryVisitCount,
      maxBucketEntryVisitCount: this.maxBucketEntryVisitCount,
    });
  }

  sampleCitySurface(
    x: number,
    z: number,
    query: Readonly<SurfaceSampleQuery>,
    out: SurfaceSampleOut,
  ): SurfaceSampleOut {
    const candidates: SurfaceCandidate[] = [];
    for (const owner of this.queryOwners(
      x,
      z,
      x,
      z,
      Number.NEGATIVE_INFINITY,
      query.currentY + query.maxStepUpMeters + 0.01,
    )) {
      candidates.push(...sampleOwnerSurfaceCandidates(owner, this.worldId, x, z, query));
    }
    if (this.surfaceBridge) {
      this.surfaceBridge.sampleCitySurface(x, z, query, this.bridgeSample);
      if (this.bridgeSample.handle.worldId !== this.worldId) {
        throw new Error("surface bridge belongs to a different compiled collision world");
      }
      candidates.push({
        sample: cloneSurfaceSample(this.bridgeSample),
        priority: this.bridgeSample.profileId === "implicit-ground" ? 0 : 1,
        stableKey: canonicalTupleKey(["bridge", this.bridgeSample.profileId]),
        preservesPrevious: sameSurfaceHandle(query.previousHandle, this.bridgeSample.handle),
      });
    }
    candidates.push({
      sample: createImplicitGroundSurfaceSample(this.worldId, this.documentGeneration),
      priority: 0,
      stableKey: "implicit-ground",
      preservesPrevious: query.previousHandle?.kind === "implicit-ground"
        && query.previousHandle.worldId === this.worldId,
    });
    candidates.sort((left, right) => Number(right.preservesPrevious) - Number(left.preservesPrevious)
      || right.sample.height - left.sample.height
      || right.priority - left.priority
      || compareUtf8(left.stableKey, right.stableKey));
    return copySurfaceSample(out, candidates[0].sample);
  }

  findEarliestSurfaceBoundaryCrossing(
    startX: number,
    startZ: number,
    deltaX: number,
    deltaZ: number,
    current: Readonly<SurfaceSampleOut>,
  ): CompiledSurfaceBoundaryCrossing | null {
    const movementLength = Math.hypot(deltaX, deltaZ);
    if (movementLength <= GEOMETRY_EPSILON) return null;
    const crossings: CompiledSurfaceBoundaryCrossing[] = [];
    const bridgeCrossing = this.surfaceBridge?.findEarliestBoundaryCrossing?.(
      startX,
      startZ,
      deltaX,
      deltaZ,
      current,
    );
    if (bridgeCrossing) crossings.push(copyBoundaryCrossing(bridgeCrossing));

    for (const owner of this.queryOwners(
      Math.min(startX, startX + deltaX) - SURFACE_BOUNDARY_PROBE_EPS_METERS,
      Math.min(startZ, startZ + deltaZ) - SURFACE_BOUNDARY_PROBE_EPS_METERS,
      Math.max(startX, startX + deltaX) + SURFACE_BOUNDARY_PROBE_EPS_METERS,
      Math.max(startZ, startZ + deltaZ) + SURFACE_BOUNDARY_PROBE_EPS_METERS,
      current.height - 0.31,
      current.height + 0.31,
    )) {
      const chunk = owner.source.surfaceChunk;
      if (!chunk) continue;
      const start = worldPointToLocal(owner, startX, startZ);
      const delta = worldVectorToLocal(owner, deltaX, deltaZ);
      const currentKey = currentLocalSurfaceKey(current.handle, owner);
      if (currentKey === null) continue;
      for (const boundary of boundaryRefsForLocalSweep(
        chunk,
        start.x,
        start.z,
        delta.x,
        delta.z,
      )) {
        const offset = boundary * 4;
        const ax = chunk.boundaryXZ[offset];
        const az = chunk.boundaryXZ[offset + 1];
        const bx = chunk.boundaryXZ[offset + 2];
        const bz = chunk.boundaryXZ[offset + 3];
        const fraction = segmentIntersectionFraction(start.x, start.z, delta.x, delta.z, ax, az, bx, bz);
        if (fraction === null) continue;
        const probeFraction = Math.min(1, fraction + SURFACE_BOUNDARY_PROBE_EPS_METERS
          / owner.uniformScale / Math.max(Math.hypot(delta.x, delta.z), GEOMETRY_EPSILON));
        const probeX = start.x + delta.x * probeFraction;
        const probeZ = start.z + delta.z * probeFraction;
        const cross = (bx - ax) * (probeZ - az) - (bz - az) * (probeX - ax);
        const leftKey = chunk.boundarySurfaceKeyPairs[boundary * 2];
        const rightKey = chunk.boundarySurfaceKeyPairs[boundary * 2 + 1];
        const targetKey = cross >= 0 ? leftKey : rightKey;
        const fromKey = cross >= 0 ? rightKey : leftKey;
        const transition = owner.source.surfaceTransitionProfiles[
          chunk.boundaryTransitionProfileIndices[boundary]
        ];
        if (!transition) continue;
        if (targetKey === currentKey) continue;
        if (fromKey !== currentKey) {
          // Road bands at the same height (for example asphalt -> bike lane)
          // intentionally have no transition record. Confirm the actual band
          // immediately before this curb instead of requiring the frozen
          // microstep handle to have observed every unmarked band.
          if (transition.kind !== "road-curb") continue;
          const beforeFraction = Math.max(0, fraction - SURFACE_BOUNDARY_PROBE_EPS_METERS
            / owner.uniformScale / Math.max(Math.hypot(delta.x, delta.z), GEOMETRY_EPSILON));
          const beforeWorld = localPointToWorld(
            owner,
            start.x + delta.x * beforeFraction,
            start.z + delta.z * beforeFraction,
          );
          const beforeCandidates = sampleOwnerSurfaceCandidates(
            owner,
            this.worldId,
            beforeWorld.x,
            beforeWorld.z,
            { currentY: current.height + 1000, previousHandle: null, maxStepUpMeters: 1000 },
            fromKey,
          );
          if (beforeCandidates.length === 0) continue;
        }
        let targetSample: SurfaceSampleOut | null = null;
        if (targetKey === IMPLICIT_GROUND_SURFACE_KEY) {
          targetSample = createImplicitGroundSurfaceSample(this.worldId, this.documentGeneration);
        } else if (targetKey !== NO_SURFACE_KEY) {
          const probeWorld = localPointToWorld(owner, probeX, probeZ);
          const candidates = sampleOwnerSurfaceCandidates(
            owner,
            this.worldId,
            probeWorld.x,
            probeWorld.z,
            { currentY: current.height + 1000, previousHandle: null, maxStepUpMeters: 1000 },
            targetKey,
          ).sort((left, right) => right.sample.height - left.sample.height || compareUtf8(left.stableKey, right.stableKey));
          targetSample = candidates[0]?.sample ?? null;
        }
        const blocked = transition.kind === "blocked-step" || !targetSample;
        const localCrossing = { x: start.x + delta.x * fraction, z: start.z + delta.z * fraction };
        const worldCrossing = localPointToWorld(owner, localCrossing.x, localCrossing.z);
        const localEdgeX = bx - ax;
        const localEdgeZ = bz - az;
        const localNormalLength = Math.hypot(localEdgeX, localEdgeZ);
        let normal = localNormalToWorld(owner, -localEdgeZ / localNormalLength, localEdgeX / localNormalLength);
        if (normal.x * deltaX + normal.z * deltaZ > 0) normal = { x: -normal.x, z: -normal.z };
        const toHeight = targetSample?.height ?? current.height;
        const stepDelta = toHeight - current.height;
        const allowed = transition.kind === "road-curb"
          ? (stepDelta >= 0
            ? stepDelta <= transition.maxStepUpMeters + SURFACE_EPSILON
            : -stepDelta <= transition.maxStepDownMeters + SURFACE_EPSILON)
          : transition.kind === "smooth";
        const kind = blocked || !allowed ? "blocked-step" : transition.kind;
        const bumpStrength = kind === "road-curb" && Math.abs(stepDelta) >= CURB_BUMP_MIN_STEP_METERS
          ? Math.min(1, Math.abs(stepDelta) / CURB_BUMP_REFERENCE_STEP_METERS)
          : 0;
        crossings.push(Object.freeze({
          distance: fraction * movementLength,
          fraction,
          x: worldCrossing.x,
          z: worldCrossing.z,
          normalX: normal.x,
          normalZ: normal.z,
          handle: ownerBoundaryHandle(
            this.worldId,
            this.documentGeneration,
            owner,
            chunk.boundaryGroupKeys[boundary],
          ),
          fromSurface: cloneSurfaceHandle(current.handle),
          toSurface: targetSample ? cloneSurfaceHandle(targetSample.handle) : cloneSurfaceHandle(current.handle),
          fromHeight: current.height,
          toHeight,
          toProfileId: targetSample?.profileId ?? current.profileId,
          toSpeedCap: targetSample?.speedCap ?? current.speedCap,
          kind,
          bumpStrength,
        }));
      }
    }
    crossings.sort((left, right) => left.distance - right.distance
      || compareBoundaryHandles(left.handle, right.handle));
    return crossings[0] ?? null;
  }

  resolveCityMove(request: Readonly<CityMoveRequest>, out: CityMoveResult): CityMoveResult {
    if (out.surface === request.startSurface) {
      throw new Error("CityMoveResult.surface must not alias request.startSurface");
    }
    if (request.startSurface.handle.worldId !== this.worldId) {
      throw new Error("startSurface belongs to a different compiled collision world");
    }
    for (const event of out.impactEvents) {
      event.kind = "none";
      event.contact = null;
      event.normalX = 0;
      event.normalZ = 0;
      event.normalImpactSpeed = 0;
    }
    for (const event of out.transitionEvents) {
      event.kind = "none";
      event.boundaryHandle = null;
      event.fromSurface = cloneSurfaceHandle(request.startSurface.handle);
      event.toSurface = cloneSurfaceHandle(request.startSurface.handle);
      event.stepDeltaY = 0;
      event.bumpStrength = 0;
    }
    out.impactCount = 0;
    out.transitionCount = 0;
    out.hitLimitReached = false;
    copySurfaceSample(out.surface, request.startSurface);

    let x = request.startX;
    let z = request.startZ;
    let velocityX = request.velocityX;
    let velocityZ = request.velocityZ;
    let remainingX = velocityX * request.microDtSeconds;
    let remainingZ = velocityZ * request.microDtSeconds;
    const constraints: Array<{ normalX: number; normalZ: number }> = [];
    const touchedContacts = new Set<string>();
    let hitCount = 0;

    while (Math.hypot(remainingX, remainingZ) > GEOMETRY_EPSILON) {
      const moveLength = Math.hypot(remainingX, remainingZ);
      const sweep = this.querySweep({
        startX: x,
        startZ: z,
        deltaX: remainingX,
        deltaZ: remainingZ,
        minY: out.surface.height,
        maxY: out.surface.height + BIKE_COLLISION_HEIGHT_METERS,
        radius: BIKE_COLLISION_RADIUS_METERS,
      });
      const boundary = this.findEarliestSurfaceBoundaryCrossing(x, z, remainingX, remainingZ, out.surface);
      const solidDistance = sweep.hit?.distance ?? Infinity;
      if (boundary && boundary.distance + TOI_DISTANCE_EPS_METERS < solidDistance) {
        x = boundary.x;
        z = boundary.z;
        const remainingScale = Math.max(0, 1 - boundary.fraction);
        remainingX *= remainingScale;
        remainingZ *= remainingScale;
        if (boundary.kind === "blocked-step") {
          addConstraint(constraints, boundary.normalX, boundary.normalZ);
          const projectedVelocity = projectAgainstConstraints(velocityX, velocityZ, constraints);
          const projectedRemaining = projectAgainstConstraints(remainingX, remainingZ, constraints);
          velocityX = projectedVelocity.x;
          velocityZ = projectedVelocity.z;
          remainingX = projectedRemaining.x;
          remainingZ = projectedRemaining.z;
          hitCount += 1;
        } else if (out.transitionCount < out.transitionEvents.length) {
          const event = out.transitionEvents[out.transitionCount];
          event.kind = boundary.kind;
          event.boundaryHandle = boundary.handle;
          event.fromSurface = cloneSurfaceHandle(boundary.fromSurface);
          event.toSurface = cloneSurfaceHandle(boundary.toSurface);
          event.stepDeltaY = boundary.toHeight - boundary.fromHeight;
          event.bumpStrength = boundary.bumpStrength;
          out.transitionCount += 1;
          this.sampleCitySurface(x + remainingX / Math.max(moveLength, GEOMETRY_EPSILON) * SURFACE_BOUNDARY_PROBE_EPS_METERS,
            z + remainingZ / Math.max(moveLength, GEOMETRY_EPSILON) * SURFACE_BOUNDARY_PROBE_EPS_METERS,
            { currentY: boundary.toHeight, previousHandle: boundary.toSurface, maxStepUpMeters: 0.30 },
            out.surface);
        }
        if (hitCount >= CITY_COLLIDE_AND_SLIDE_MAX_HITS) {
          out.hitLimitReached = true;
          break;
        }
        continue;
      }
      if (!sweep.hit) {
        x += remainingX;
        z += remainingZ;
        remainingX = 0;
        remainingZ = 0;
        break;
      }
      const safeDistance = Math.max(0, sweep.hit.distance - COLLISION_SKIN_METERS);
      const safeFraction = safeDistance / moveLength;
      x += remainingX * safeFraction;
      z += remainingZ * safeFraction;
      const residualScale = Math.max(0, 1 - sweep.hit.toi);
      remainingX *= residualScale;
      remainingZ *= residualScale;

      for (const hit of sweep.ties) {
        addConstraint(constraints, hit.normalX, hit.normalZ);
        touchedContacts.add(contactKey(this.worldId, hit));
      }
      const dominant = [...sweep.ties].sort((left, right) => {
        const leftImpact = -(velocityX * left.normalX + velocityZ * left.normalZ);
        const rightImpact = -(velocityX * right.normalX + velocityZ * right.normalZ);
        return rightImpact - leftImpact || left.sourceTriangleId - right.sourceTriangleId;
      })[0];
      const impactSpeed = Math.max(0, -(velocityX * dominant.normalX + velocityZ * dominant.normalZ));
      const projectedVelocity = projectAgainstConstraints(velocityX, velocityZ, constraints);
      const oldSpeed = Math.hypot(velocityX, velocityZ);
      const targetSpeed = Math.max(0, oldSpeed - ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR * impactSpeed);
      const projectedSpeed = Math.hypot(projectedVelocity.x, projectedVelocity.z);
      if (projectedSpeed > GEOMETRY_EPSILON && targetSpeed > GEOMETRY_EPSILON) {
        velocityX = projectedVelocity.x * targetSpeed / projectedSpeed;
        velocityZ = projectedVelocity.z * targetSpeed / projectedSpeed;
      } else {
        velocityX = 0;
        velocityZ = 0;
      }
      const key = contactKey(this.worldId, dominant);
      if (!this.activeContacts.has(key) && out.impactCount < out.impactEvents.length) {
        const event = out.impactEvents[out.impactCount];
        event.kind = "contact-begin";
        event.contact = impactContactHandle(this.worldId, dominant);
        event.normalX = dominant.normalX;
        event.normalZ = dominant.normalZ;
        event.normalImpactSpeed = impactSpeed;
        out.impactCount += 1;
      }
      const projectedRemaining = projectAgainstConstraints(remainingX, remainingZ, constraints);
      remainingX = projectedRemaining.x;
      remainingZ = projectedRemaining.z;
      hitCount += 1;
      if (hitCount >= CITY_COLLIDE_AND_SLIDE_MAX_HITS) {
        out.hitLimitReached = true;
        break;
      }
    }

    this.sampleCitySurface(x, z, {
      currentY: out.surface.height,
      previousHandle: out.surface.handle,
      maxStepUpMeters: 0.01,
    }, out.surface);
    this.activeContacts = touchedContacts;
    const speed = Math.hypot(velocityX, velocityZ);
    let motionSign = request.motionSign;
    let bodyHeading = request.bodyHeading;
    let drifting = request.drifting;
    if (speed <= GEOMETRY_EPSILON) {
      velocityX = 0;
      velocityZ = 0;
      motionSign = 0;
      drifting = false;
    } else if (out.impactCount > 0
      && out.impactEvents[0].normalImpactSpeed >= ARCADE_STRONG_IMPACT_SPEED_METERS_PER_SECOND) {
      const travelHeading = Math.atan2(velocityX, velocityZ);
      bodyHeading = motionSign < 0 ? travelHeading + Math.PI : travelHeading;
    }
    out.x = x;
    out.z = z;
    out.velocityX = velocityX;
    out.velocityZ = velocityZ;
    out.motionSign = motionSign;
    out.bodyHeading = bodyHeading;
    out.drifting = drifting;
    return out;
  }

  private reuseOwnerSpatialIndex(
    owners: readonly CompiledCollisionRuntimeOwner[],
    previous: CompiledCityCollisionRuntime,
  ) {
    const previousById = new Map(previous.owners.map((owner) => [owner.ownerId, owner]));
    const desiredIds = new Set(owners.map((owner) => owner.ownerId));
    const retainedIds = new Set<string>();
    const usedIndices = new Set(previous.owners
      .filter((owner) => desiredIds.has(owner.ownerId))
      .map((owner) => owner.index));
    const normalizedOwners: NormalizedOwner[] = [];
    const removedOwners: NormalizedOwner[] = [];
    const addedOwners: NormalizedOwner[] = [];
    let reusedOwnerCount = 0;
    let addedOwnerCount = 0;
    let updatedOwnerCount = 0;
    let nextIndex = 0;
    const allocateIndex = () => {
      while (usedIndices.has(nextIndex)) nextIndex += 1;
      const index = nextIndex;
      usedIndices.add(index);
      nextIndex += 1;
      return index;
    };

    for (const owner of owners) {
      const prior = previousById.get(owner.ownerId);
      retainedIds.add(owner.ownerId);
      if (prior && ownerMatchesSource(prior, owner)) {
        normalizedOwners.push(prior);
        reusedOwnerCount += 1;
        continue;
      }
      const index = prior?.index ?? allocateIndex();
      const normalized = normalizeOwner(owner, index);
      normalizedOwners.push(normalized);
      addedOwners.push(normalized);
      if (prior) {
        removedOwners.push(prior);
        updatedOwnerCount += 1;
      } else {
        addedOwnerCount += 1;
      }
    }
    for (const prior of previous.owners) {
      if (!retainedIds.has(prior.ownerId)) removedOwners.push(prior);
    }
    this.owners = Object.freeze(normalizedOwners);

    const cells = new Map(previous.ownerCells);
    let globalOwners = [...previous.globalOwners];
    const affectedCells = new Set<string>();
    for (const owner of removedOwners) {
      const keys = ownerSpatialCellKeys(owner);
      if (keys === null) {
        globalOwners = globalOwners.filter((candidate) => candidate !== owner);
        continue;
      }
      for (const key of keys) {
        affectedCells.add(key);
        const bucket = (cells.get(key) ?? []).filter((candidate) => candidate !== owner);
        if (bucket.length > 0) cells.set(key, Object.freeze(bucket));
        else cells.delete(key);
      }
    }
    for (const owner of addedOwners) {
      const keys = ownerSpatialCellKeys(owner);
      if (keys === null) {
        globalOwners.push(owner);
        continue;
      }
      for (const key of keys) {
        affectedCells.add(key);
        cells.set(key, Object.freeze([...(cells.get(key) ?? []), owner]));
      }
    }
    this.ownerCells = cells;
    this.globalOwners = Object.freeze(globalOwners);
    const maxOwnerIndex = normalizedOwners.reduce((max, owner) => Math.max(max, owner.index), -1);
    this.ownerVisitMarks = new Uint32Array(maxOwnerIndex + 1);
    this.ownerVisitEpoch = 0;
    this.lastCandidateOwnerCount = 0;
    this.maxCandidateOwnerCount = 0;
    this.lastBucketEntryVisitCount = 0;
    this.maxBucketEntryVisitCount = 0;
    this.buildStats = Object.freeze({
      fullOwnerIndexRebuild: false,
      reusedOwnerCount,
      addedOwnerCount,
      updatedOwnerCount,
      removedOwnerCount: removedOwners.length - updatedOwnerCount,
      affectedSpatialCellCount: affectedCells.size,
    });
  }

  private rebuildOwnerSpatialIndex() {
    this.lastCandidateOwnerCount = 0;
    this.maxCandidateOwnerCount = 0;
    this.lastBucketEntryVisitCount = 0;
    this.maxBucketEntryVisitCount = 0;
    const mutable = new Map<string, NormalizedOwner[]>();
    const global: NormalizedOwner[] = [];
    for (const owner of this.owners) {
      const keys = ownerSpatialCellKeys(owner);
      if (keys === null) {
        global.push(owner);
        continue;
      }
      for (const key of keys) {
        const bucket = mutable.get(key) ?? [];
        bucket.push(owner);
        mutable.set(key, bucket);
      }
    }
    this.ownerCells = new Map([...mutable].map(([key, bucket]) => [key, Object.freeze(bucket)]));
    this.globalOwners = Object.freeze(global);
    this.ownerVisitMarks = new Uint32Array(this.owners.length);
    this.ownerVisitEpoch = 0;
  }

  private queryOwners(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    minY: number,
    maxY: number,
  ): readonly NormalizedOwner[] {
    const minCellX = Math.floor(minX / OWNER_SPATIAL_CELL_SIZE_METERS);
    const minCellZ = Math.floor(minZ / OWNER_SPATIAL_CELL_SIZE_METERS);
    const maxCellX = Math.floor(maxX / OWNER_SPATIAL_CELL_SIZE_METERS);
    const maxCellZ = Math.floor(maxZ / OWNER_SPATIAL_CELL_SIZE_METERS);
    this.ownerVisitEpoch += 1;
    if (this.ownerVisitEpoch >= 0xffff_ffff) {
      this.ownerVisitMarks.fill(0);
      this.ownerVisitEpoch = 1;
    }
    const visitEpoch = this.ownerVisitEpoch;
    const result: NormalizedOwner[] = [];
    let bucketEntryVisitCount = 0;
    const include = (owner: NormalizedOwner) => {
      if (this.ownerVisitMarks[owner.index] === visitEpoch) return;
      this.ownerVisitMarks[owner.index] = visitEpoch;
      if (owner.maxX < minX || owner.minX > maxX
        || owner.maxZ < minZ || owner.minZ > maxZ
        || owner.maxY < minY || owner.minY > maxY) return;
      result.push(owner);
    };
    for (const owner of this.globalOwners) include(owner);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (const owner of this.ownerCells.get(`${cellX},${cellZ}`) ?? []) {
          bucketEntryVisitCount += 1;
          include(owner);
        }
      }
    }
    this.lastCandidateOwnerCount = result.length;
    this.maxCandidateOwnerCount = Math.max(this.maxCandidateOwnerCount, result.length);
    this.lastBucketEntryVisitCount = bucketEntryVisitCount;
    this.maxBucketEntryVisitCount = Math.max(this.maxBucketEntryVisitCount, bucketEntryVisitCount);
    return result;
  }

  resetRiderContacts(): void {
    this.activeContacts.clear();
  }

  dispose(): void {
    // Compiled buffers are borrowed. Cache/lease owners dispose them.
    this.resetRiderContacts();
    this.owners = Object.freeze([]);
    this.ownerCells.clear();
    this.globalOwners = Object.freeze([]);
    this.lastCandidateOwnerCount = 0;
    this.maxCandidateOwnerCount = 0;
    this.lastBucketEntryVisitCount = 0;
    this.maxBucketEntryVisitCount = 0;
    this.ownerVisitMarks = new Uint32Array(0);
    this.ownerVisitEpoch = 0;
  }

  private assertUniqueOwners(): void {
    const keys = new Set<string>();
    for (const owner of this.owners) {
      const key = canonicalTupleKey([owner.ownerId, owner.ownerGeneration]);
      if (keys.has(key)) throw new Error(`duplicate compiled collision owner: ${owner.ownerId}`);
      keys.add(key);
    }
  }
}
