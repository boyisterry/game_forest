import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  PackedCollisionRoleCode,
  canonicalTupleKey,
  citySurfaceChunkKey,
  type RoadBoundaryHandleRecord,
  type RoadSurfaceHandleRecord,
} from "./cityCollisionTypes.ts";
import {
  CITY_SURFACE_CHUNK_SIZE_METERS,
  type PackedCollisionCompileSource,
} from "./cityCollisionWire.ts";
import type {
  DerivedRoadBoundary,
  DerivedRoadCollisionSources,
  DerivedRoadSurface,
} from "./cityRoads.ts";

const TOPOLOGY_HALO_METERS = 1;
const GEOMETRY_EPSILON = 1e-7;

type Point3 = Readonly<{ x: number; y: number; z: number }>;
type SegmentPiece = Readonly<{
  boundary: DerivedRoadBoundary;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}>;

export type PackedRoadCollisionChunk = Readonly<{
  source: PackedCollisionCompileSource;
  surfaceHandles: readonly RoadSurfaceHandleRecord[];
  boundaryHandles: readonly RoadBoundaryHandleRecord[];
}>;

function surfacePoints(surface: Readonly<DerivedRoadSurface>): Point3[] {
  const heights = surface.cornerY ?? [surface.y, surface.y, surface.y, surface.y];
  return [0, 1, 2, 3].map((index) => Object.freeze({
    x: surface.quadXZ[index * 2],
    y: heights[index],
    z: surface.quadXZ[index * 2 + 1],
  }));
}

function clipPolygonAxis(
  polygon: readonly Point3[],
  axis: "x" | "z",
  threshold: number,
  keepGreater: boolean,
): Point3[] {
  if (polygon.length === 0) return [];
  const output: Point3[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const aDistance = (a[axis] - threshold) * (keepGreater ? 1 : -1);
    const bDistance = (b[axis] - threshold) * (keepGreater ? 1 : -1);
    const aInside = aDistance >= -GEOMETRY_EPSILON;
    const bInside = bDistance >= -GEOMETRY_EPSILON;
    if (aInside) output.push(a);
    if (aInside === bInside) continue;
    const denominator = b[axis] - a[axis];
    if (Math.abs(denominator) <= GEOMETRY_EPSILON) continue;
    const fraction = (threshold - a[axis]) / denominator;
    output.push(Object.freeze({
      x: a.x + (b.x - a.x) * fraction,
      y: a.y + (b.y - a.y) * fraction,
      z: a.z + (b.z - a.z) * fraction,
    }));
  }
  return output;
}

function clipPolygonToRect(
  polygon: readonly Point3[],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
) {
  return clipPolygonAxis(
    clipPolygonAxis(
      clipPolygonAxis(
        clipPolygonAxis(polygon, "x", minX, true),
        "x",
        maxX,
        false,
      ),
      "z",
      minZ,
      true,
    ),
    "z",
    maxZ,
    false,
  );
}

function polygonAreaXZ(points: readonly Point3[]) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return twiceArea * 0.5;
}

function segmentIntervalInsideSurface(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  surface: Readonly<DerivedRoadSurface>,
): readonly [number, number] | null {
  const polygon = surfacePoints(surface);
  const orientation = polygonAreaXZ(polygon) >= 0 ? 1 : -1;
  let minimum = 0;
  let maximum = 1;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeZ = b.z - a.z;
    const start = orientation * (edgeX * (az - a.z) - edgeZ * (ax - a.x));
    const delta = orientation * (edgeX * (bz - az) - edgeZ * (bx - ax));
    if (Math.abs(delta) <= GEOMETRY_EPSILON) {
      if (start < -GEOMETRY_EPSILON) return null;
      continue;
    }
    const crossing = -start / delta;
    if (delta > 0) minimum = Math.max(minimum, crossing);
    else maximum = Math.min(maximum, crossing);
    if (minimum >= maximum - GEOMETRY_EPSILON) return null;
  }
  return Object.freeze([
    Math.max(0, minimum),
    Math.min(1, maximum),
  ] as const);
}

function subtractDriveways(
  boundary: Readonly<DerivedRoadBoundary>,
  driveways: readonly Readonly<DerivedRoadSurface>[],
): readonly SegmentPiece[] {
  const [ax, az, bx, bz] = boundary.segmentXZ;
  const intervals = driveways
    .map((surface) => segmentIntervalInsideSurface(ax, az, bx, bz, surface))
    .filter((interval): interval is readonly [number, number] => interval !== null)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + GEOMETRY_EPSILON) last[1] = Math.max(last[1], interval[1]);
    else merged.push([interval[0], interval[1]]);
  }
  const pieces: SegmentPiece[] = [];
  let cursor = 0;
  const append = (from: number, to: number) => {
    if (to - from <= GEOMETRY_EPSILON) return;
    pieces.push(Object.freeze({
      boundary,
      ax: ax + (bx - ax) * from,
      az: az + (bz - az) * from,
      bx: ax + (bx - ax) * to,
      bz: az + (bz - az) * to,
    }));
  };
  for (const [from, to] of merged) {
    append(cursor, from);
    cursor = Math.max(cursor, to);
  }
  append(cursor, 1);
  return Object.freeze(pieces);
}

function clipSegmentToRect(
  piece: SegmentPiece,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): SegmentPiece | null {
  const dx = piece.bx - piece.ax;
  const dz = piece.bz - piece.az;
  let minimum = 0;
  let maximum = 1;
  for (const [p, q] of [
    [-dx, piece.ax - minX],
    [dx, maxX - piece.ax],
    [-dz, piece.az - minZ],
    [dz, maxZ - piece.az],
  ] as const) {
    if (Math.abs(p) <= GEOMETRY_EPSILON) {
      if (q < -GEOMETRY_EPSILON) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum >= maximum - GEOMETRY_EPSILON) return null;
  }
  return Object.freeze({
    boundary: piece.boundary,
    ax: piece.ax + dx * minimum,
    az: piece.az + dz * minimum,
    bx: piece.ax + dx * maximum,
    bz: piece.az + dz * maximum,
  });
}

function collectChunkCoordinates(sources: Readonly<DerivedRoadCollisionSources>) {
  const keys = new Set<string>();
  const includeAabb = (minX: number, minZ: number, maxX: number, maxZ: number) => {
    const firstX = Math.floor(minX / CITY_SURFACE_CHUNK_SIZE_METERS);
    const firstZ = Math.floor(minZ / CITY_SURFACE_CHUNK_SIZE_METERS);
    const lastX = Math.floor(maxX / CITY_SURFACE_CHUNK_SIZE_METERS);
    const lastZ = Math.floor(maxZ / CITY_SURFACE_CHUNK_SIZE_METERS);
    for (let chunkZ = firstZ; chunkZ <= lastZ; chunkZ += 1) {
      for (let chunkX = firstX; chunkX <= lastX; chunkX += 1) keys.add(`${chunkX},${chunkZ}`);
    }
  };
  for (const surface of sources.surfaces) {
    const points = surfacePoints(surface);
    includeAabb(
      Math.min(...points.map((point) => point.x)),
      Math.min(...points.map((point) => point.z)),
      Math.max(...points.map((point) => point.x)),
      Math.max(...points.map((point) => point.z)),
    );
  }
  for (const boundary of sources.boundaries) {
    includeAabb(
      Math.min(boundary.segmentXZ[0], boundary.segmentXZ[2]),
      Math.min(boundary.segmentXZ[1], boundary.segmentXZ[3]),
      Math.max(boundary.segmentXZ[0], boundary.segmentXZ[2]),
      Math.max(boundary.segmentXZ[1], boundary.segmentXZ[3]),
    );
  }
  return [...keys].map((key) => key.split(",").map(Number) as [number, number])
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
}

export function packRoadCollisionChunks(
  sources: Readonly<DerivedRoadCollisionSources>,
  generation: number,
): readonly PackedRoadCollisionChunk[] {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError("road collision generation must be a non-negative safe integer");
  }
  const driveways = sources.surfaces.filter((surface) => surface.surfaceProfileId === "driveway");
  const unmaskedBoundaries = sources.boundaries.flatMap((boundary) => subtractDriveways(boundary, driveways));
  const transitionById = new Map(BUILTIN_SURFACE_TRANSITIONS.map((profile, index) => [profile.id, index]));
  const profileById = new Map(BUILTIN_SURFACE_PROFILES.map((profile, index) => [profile.id, index]));
  const chunks: PackedRoadCollisionChunk[] = [];

  for (const [chunkX, chunkZ] of collectChunkCoordinates(sources)) {
    const coreMinX = chunkX * CITY_SURFACE_CHUNK_SIZE_METERS;
    const coreMinZ = chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS;
    const coreMaxX = coreMinX + CITY_SURFACE_CHUNK_SIZE_METERS;
    const coreMaxZ = coreMinZ + CITY_SURFACE_CHUNK_SIZE_METERS;
    const minX = coreMinX - TOPOLOGY_HALO_METERS;
    const minZ = coreMinZ - TOPOLOGY_HALO_METERS;
    const maxX = coreMaxX + TOPOLOGY_HALO_METERS;
    const maxZ = coreMaxZ + TOPOLOGY_HALO_METERS;
    const positions: number[] = [];
    const indices: number[] = [];
    const roles: number[] = [];
    const profileIndices: number[] = [];
    const surfaceKeys: number[] = [];
    const sourceTriangleIds: number[] = [];
    const usedSurfaceKeys = new Set<number>();
    let sourceTriangleId = 0;

    for (const surface of sources.surfaces) {
      const clipped = clipPolygonToRect(surfacePoints(surface), minX, minZ, maxX, maxZ);
      if (clipped.length < 3 || Math.abs(polygonAreaXZ(clipped)) <= GEOMETRY_EPSILON) continue;
      const profileIndex = profileById.get(surface.surfaceProfileId);
      if (profileIndex === undefined) throw new TypeError(`unknown road surface profile: ${surface.surfaceProfileId}`);
      const vertexOffset = positions.length / 3;
      for (const point of clipped) positions.push(point.x, point.y, point.z);
      for (let triangle = 1; triangle < clipped.length - 1; triangle += 1) {
        indices.push(vertexOffset, vertexOffset + triangle, vertexOffset + triangle + 1);
        roles.push(PackedCollisionRoleCode.RideableSurface);
        profileIndices.push(profileIndex);
        surfaceKeys.push(surface.localSurfaceKey);
        sourceTriangleIds.push(sourceTriangleId);
        sourceTriangleId += 1;
      }
      usedSurfaceKeys.add(surface.localSurfaceKey);
    }

    const boundaryPieces = unmaskedBoundaries
      .map((piece) => clipSegmentToRect(piece, minX, minZ, maxX, maxZ))
      .filter((piece): piece is SegmentPiece => piece !== null);
    if (roles.length === 0 && boundaryPieces.length === 0) continue;
    const boundaryXZ = new Float32Array(boundaryPieces.length * 4);
    const boundaryTransitionProfileIndices = new Uint16Array(boundaryPieces.length);
    const boundaryGroupKeys = new Uint32Array(boundaryPieces.length);
    const boundarySurfaceKeyPairs = new Uint32Array(boundaryPieces.length * 2);
    const boundaryHandles = new Map<number, RoadBoundaryHandleRecord>();
    boundaryPieces.forEach((piece, index) => {
      boundaryXZ.set([piece.ax, piece.az, piece.bx, piece.bz], index * 4);
      const transition = transitionById.get(piece.boundary.transitionProfileId);
      if (transition === undefined) throw new TypeError(`unknown road boundary transition: ${piece.boundary.transitionProfileId}`);
      boundaryTransitionProfileIndices[index] = transition;
      boundaryGroupKeys[index] = piece.boundary.groupKey;
      boundarySurfaceKeyPairs[index * 2] = piece.boundary.leftSurfaceKey;
      boundarySurfaceKeyPairs[index * 2 + 1] = piece.boundary.rightSurfaceKey;
      boundaryHandles.set(piece.boundary.groupKey, Object.freeze({
        kind: "road",
        localBoundaryGroupKey: piece.boundary.groupKey,
        roadEdgeId: piece.boundary.edgeId,
        side: piece.boundary.side,
        curbRun: piece.boundary.curbRun,
      }));
    });
    const surfaceHandles = sources.surfaceHandles.filter((record) => usedSurfaceKeys.has(record.localSurfaceKey));
    chunks.push(Object.freeze({
      source: Object.freeze({
        kind: "road-chunk",
        sourceId: canonicalTupleKey(["road-chunk", chunkX, chunkZ]),
        generation,
        chunkX,
        chunkZ,
        chunkKey: citySurfaceChunkKey(chunkX, chunkZ),
        coreBoundsXZ: Object.freeze([coreMinX, coreMinZ, coreMaxX, coreMaxZ] as const),
        topologyHaloMeters: TOPOLOGY_HALO_METERS,
        triangles: Object.freeze({
          positions: new Float32Array(positions),
          indices: new Uint32Array(indices),
          triangleRoles: new Uint8Array(roles),
          triangleProfileIndices: new Uint16Array(profileIndices),
          triangleSurfaceKeys: new Uint32Array(surfaceKeys),
          sourceTriangleIds: new Uint32Array(sourceTriangleIds),
        }),
        surfaceProfiles: BUILTIN_SURFACE_PROFILES,
        surfaceTransitionProfiles: BUILTIN_SURFACE_TRANSITIONS,
        explicitBoundaries: Object.freeze({
          boundaryXZ,
          boundaryTransitionProfileIndices,
          boundaryGroupKeys,
          boundarySurfaceKeyPairs,
        }),
      }),
      surfaceHandles: Object.freeze(surfaceHandles),
      boundaryHandles: Object.freeze([...boundaryHandles.values()]),
    }));
  }
  return Object.freeze(chunks);
}
