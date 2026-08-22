import { BufferAttribute, BufferGeometry } from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import {
  COLLISION_COMPILER_VERSION,
  COLLISION_WIRE_VERSION,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
  VERTICAL_PLANE_EPSILON,
  canonicalFloat64Bits,
  canonicalTupleKey,
  citySurfaceChunkKey,
  type SurfaceProfile,
  type SurfaceTransitionProfile,
} from "./cityCollisionTypes.ts";
import {
  CITY_SURFACE_CELLS_PER_AXIS,
  CITY_SURFACE_CHUNK_SIZE_METERS,
  THREE_MESH_BVH_PACKAGE_VERSION,
  THREE_MESH_BVH_WIRE_VERSION,
  type CollisionIndexArray,
  type CollisionTypedArrayKind,
  type CollisionTypedViewManifest,
  type PackedCollisionCompileSource,
  type PackedSurfaceChunk,
  type PackedSurfaceChunkManifest,
  type PackedVerticalWallFeatures,
  type PackedVerticalWallManifest,
  type SerializedCollisionPayload,
  type SerializedFallbackManifest,
} from "./cityCollisionWire.ts";

export type CompiledFallbackMesh = Readonly<{
  geometry: BufferGeometry;
  bvh: MeshBVH;
  /** Indexed by geometry triangle after bvh.resolveTriangleIndex(). */
  resolvedSourceTriangleIds: Uint32Array;
  /** Indexed by geometry triangle after bvh.resolveTriangleIndex(). */
  resolvedComponentIds: Uint32Array;
}>;

export type CompiledCollisionSource = Readonly<{
  sourceId: string;
  generation: number;
  sourceHash: string;
  cacheKey: string;
  walls: PackedVerticalWallFeatures;
  surfaceChunk: PackedSurfaceChunk | null;
  fallback: CompiledFallbackMesh | null;
  surfaceProfiles: readonly SurfaceProfile[];
  surfaceTransitionProfiles: readonly SurfaceTransitionProfile[];
}>;

type SupportedTypedArray =
  | Float32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int32Array;

type TriangleAnalysis = Readonly<{
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  nx: number;
  ny: number;
  nz: number;
  area2: number;
}>;

const utf8Encoder = new TextEncoder();
const GEOMETRY_EPSILON = 1e-12;
const CELL_COUNT = CITY_SURFACE_CELLS_PER_AXIS ** 2;

class UnionFind {
  private readonly parents: Int32Array;

  constructor(size: number) {
    this.parents = new Int32Array(size);
    this.parents.fill(-1);
  }

  find(value: number): number {
    let root = value;
    while (this.parents[root] >= 0) root = this.parents[root];
    while (value !== root) {
      const next = this.parents[value];
      this.parents[value] = root;
      value = next;
    }
    return root;
  }

  union(left: number, right: number) {
    let a = this.find(left);
    let b = this.find(right);
    if (a === b) return;
    if (this.parents[a] > this.parents[b]) [a, b] = [b, a];
    this.parents[a] += this.parents[b];
    this.parents[b] = a;
  }
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function canonicalNumber(value: number): string {
  if (value === Infinity) return "+inf";
  if (value === -Infinity) return "-inf";
  return canonicalFloat64Bits(value);
}

function cloneProfiles(profiles: readonly SurfaceProfile[]): readonly SurfaceProfile[] {
  return profiles.map((profile) => Object.freeze({ ...profile }));
}

function cloneTransitions(
  profiles: readonly SurfaceTransitionProfile[],
): readonly SurfaceTransitionProfile[] {
  return profiles.map((profile) => Object.freeze({ ...profile }));
}

function validateProfiles(profiles: readonly SurfaceProfile[]) {
  const ids = new Set<string>();
  profiles.forEach((profile, index) => {
    if (!profile.id || ids.has(profile.id)) throw new TypeError(`surfaceProfiles[${index}].id must be unique`);
    ids.add(profile.id);
    if (!(profile.speedCap >= 0) || Number.isNaN(profile.speedCap)) {
      throw new RangeError(`surfaceProfiles[${index}].speedCap must be non-negative`);
    }
    assertFinite(profile.maxSlopeDegrees, `surfaceProfiles[${index}].maxSlopeDegrees`);
    if (profile.maxSlopeDegrees < 0 || profile.maxSlopeDegrees > 90) {
      throw new RangeError(`surfaceProfiles[${index}].maxSlopeDegrees must be in [0, 90]`);
    }
    if (!Number.isSafeInteger(profile.selectionPriority)) {
      throw new TypeError(`surfaceProfiles[${index}].selectionPriority must be a safe integer`);
    }
  });
}

function validateTransitions(profiles: readonly SurfaceTransitionProfile[]) {
  const ids = new Set<string>();
  profiles.forEach((profile, index) => {
    if (!profile.id || ids.has(profile.id)) {
      throw new TypeError(`surfaceTransitionProfiles[${index}].id must be unique`);
    }
    ids.add(profile.id);
    if (profile.kind === "road-curb") {
      assertFinite(profile.maxStepUpMeters, `surfaceTransitionProfiles[${index}].maxStepUpMeters`);
      assertFinite(profile.maxStepDownMeters, `surfaceTransitionProfiles[${index}].maxStepDownMeters`);
      if (profile.maxStepUpMeters < 0 || profile.maxStepDownMeters < 0) {
        throw new RangeError("road-curb step limits must be non-negative");
      }
    }
  });
}

function validateSource(source: PackedCollisionCompileSource): number {
  if (source.kind !== "road-chunk" && source.kind !== "template") {
    throw new TypeError("collision source kind is invalid");
  }
  if (!source.sourceId) throw new TypeError("sourceId must not be empty");
  if (!Number.isSafeInteger(source.generation) || source.generation < 0) {
    throw new RangeError("generation must be a non-negative safe integer");
  }
  if (!Array.isArray(source.surfaceProfiles) || !Array.isArray(source.surfaceTransitionProfiles)) {
    throw new TypeError("surface profile tables must be arrays");
  }
  validateProfiles(source.surfaceProfiles);
  validateTransitions(source.surfaceTransitionProfiles);

  const triangles = source.triangles;
  if (!(triangles.positions instanceof Float32Array)
    || !(triangles.indices instanceof Uint16Array || triangles.indices instanceof Uint32Array)
    || !(triangles.triangleRoles instanceof Uint8Array)
    || !(triangles.triangleProfileIndices instanceof Uint16Array)
    || !(triangles.triangleSurfaceKeys instanceof Uint32Array)
    || !(triangles.sourceTriangleIds instanceof Uint32Array)) {
    throw new TypeError("packed triangle input uses an invalid typed-array ABI");
  }
  if (triangles.positions.length % 3 !== 0) throw new RangeError("positions length must be divisible by 3");
  if (triangles.indices.length % 3 !== 0) throw new RangeError("indices length must be divisible by 3");
  const triangleCount = triangles.indices.length / 3;
  for (const [label, length] of [
    ["triangleRoles", triangles.triangleRoles.length],
    ["triangleProfileIndices", triangles.triangleProfileIndices.length],
    ["triangleSurfaceKeys", triangles.triangleSurfaceKeys.length],
    ["sourceTriangleIds", triangles.sourceTriangleIds.length],
  ] as const) {
    if (length !== triangleCount) throw new RangeError(`${label} length must equal triangle count`);
  }

  for (let i = 0; i < triangles.positions.length; i += 1) {
    assertFinite(triangles.positions[i], `positions[${i}]`);
  }
  const vertexCount = triangles.positions.length / 3;
  for (let i = 0; i < triangles.indices.length; i += 1) {
    if (triangles.indices[i] >= vertexCount) throw new RangeError(`indices[${i}] is out of range`);
  }

  const sourceIds = new Set<number>();
  let rideableCount = 0;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const role = triangles.triangleRoles[triangleIndex];
    const profileIndex = triangles.triangleProfileIndices[triangleIndex];
    const surfaceKey = triangles.triangleSurfaceKeys[triangleIndex];
    const sourceTriangleId = triangles.sourceTriangleIds[triangleIndex];
    if (sourceIds.has(sourceTriangleId)) throw new TypeError("sourceTriangleIds must be unique");
    sourceIds.add(sourceTriangleId);

    if (role === PackedCollisionRoleCode.RideableSurface) {
      rideableCount += 1;
      if (profileIndex >= source.surfaceProfiles.length) {
        throw new RangeError(`rideable triangle ${triangleIndex} has an invalid surface profile`);
      }
      if (surfaceKey === NO_SURFACE_KEY) {
        throw new RangeError(`rideable triangle ${triangleIndex} requires a surface key`);
      }
    } else if (role === PackedCollisionRoleCode.Solid || role === PackedCollisionRoleCode.Ignore) {
      if (profileIndex !== SURFACE_PROFILE_INDEX_NONE || surfaceKey !== NO_SURFACE_KEY) {
        throw new RangeError(`non-surface triangle ${triangleIndex} must use the metadata sentinels`);
      }
    } else {
      throw new RangeError(`triangleRoles[${triangleIndex}] is invalid`);
    }
  }

  const needsChunk = source.kind === "road-chunk" || rideableCount > 0 || source.explicitBoundaries !== undefined;
  if (needsChunk) validateChunkDescriptor(source);
  validateExplicitBoundaries(source);
  return triangleCount;
}

function validateChunkDescriptor(source: PackedCollisionCompileSource) {
  const { chunkX, chunkZ } = source;
  if (typeof chunkX !== "number" || !Number.isInteger(chunkX)
    || typeof chunkZ !== "number" || !Number.isInteger(chunkZ)) {
    throw new TypeError("chunkX and chunkZ are required integers for surface compilation");
  }
  const expectedChunkKey = citySurfaceChunkKey(chunkX, chunkZ);
  if (source.chunkKey !== expectedChunkKey) {
    throw new RangeError("chunkKey does not match chunkX/chunkZ");
  }
  const expected = [
    chunkX * CITY_SURFACE_CHUNK_SIZE_METERS,
    chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS,
    (chunkX + 1) * CITY_SURFACE_CHUNK_SIZE_METERS,
    (chunkZ + 1) * CITY_SURFACE_CHUNK_SIZE_METERS,
  ];
  if (!source.coreBoundsXZ || source.coreBoundsXZ.some((value, index) => value !== expected[index])) {
    throw new RangeError("coreBoundsXZ must be exactly the addressed 64 m chunk core");
  }
  const halo = source.topologyHaloMeters ?? 0;
  assertFinite(halo, "topologyHaloMeters");
  if (halo < 0) throw new RangeError("topologyHaloMeters must be non-negative");
  if (source.kind === "road-chunk" && halo !== 1) {
    throw new RangeError("road chunk topologyHaloMeters must be exactly 1");
  }
}

function validateExplicitBoundaries(source: PackedCollisionCompileSource) {
  const boundaries = source.explicitBoundaries;
  if (!boundaries) return;
  if (!(boundaries.boundaryXZ instanceof Float32Array)
    || !(boundaries.boundaryTransitionProfileIndices instanceof Uint16Array)
    || !(boundaries.boundaryGroupKeys instanceof Uint32Array)
    || !(boundaries.boundarySurfaceKeyPairs instanceof Uint32Array)) {
    throw new TypeError("explicit boundary input uses an invalid typed-array ABI");
  }
  if (boundaries.boundaryXZ.length % 4 !== 0) {
    throw new RangeError("boundaryXZ length must be divisible by 4");
  }
  const count = boundaries.boundaryXZ.length / 4;
  if (boundaries.boundaryTransitionProfileIndices.length !== count
    || boundaries.boundaryGroupKeys.length !== count
    || boundaries.boundarySurfaceKeyPairs.length !== count * 2) {
    throw new RangeError("explicit boundary metadata lengths do not match boundary count");
  }
  for (let i = 0; i < boundaries.boundaryXZ.length; i += 1) {
    assertFinite(boundaries.boundaryXZ[i], `boundaryXZ[${i}]`);
  }
  for (let i = 0; i < count; i += 1) {
    if (boundaries.boundaryTransitionProfileIndices[i] >= source.surfaceTransitionProfiles.length) {
      throw new RangeError(`boundary ${i} has an invalid transition profile`);
    }
  }
}

function triangleAnalysis(source: PackedCollisionCompileSource, triangleIndex: number): TriangleAnalysis {
  const { positions, indices } = source.triangles;
  const ia = indices[triangleIndex * 3] * 3;
  const ib = indices[triangleIndex * 3 + 1] * 3;
  const ic = indices[triangleIndex * 3 + 2] * 3;
  const ax = positions[ia];
  const ay = positions[ia + 1];
  const az = positions[ia + 2];
  const bx = positions[ib];
  const by = positions[ib + 1];
  const bz = positions[ib + 2];
  const cx = positions[ic];
  const cy = positions[ic + 1];
  const cz = positions[ic + 2];
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const crossX = uy * vz - uz * vy;
  const crossY = uz * vx - ux * vz;
  const crossZ = ux * vy - uy * vx;
  const area2 = Math.hypot(crossX, crossY, crossZ);
  if (area2 <= GEOMETRY_EPSILON) {
    throw new RangeError(`non-ignored source triangle ${triangleIndex} is degenerate`);
  }
  return {
    ax, ay, az, bx, by, bz, cx, cy, cz,
    nx: crossX / area2,
    ny: crossY / area2,
    nz: crossZ / area2,
    area2,
  };
}

function isStrictlyVertical(triangle: TriangleAnalysis): boolean {
  return Math.abs(triangle.ny) <= VERTICAL_PLANE_EPSILON;
}

function vertexWeldKey(positions: Float32Array, vertexIndex: number): string {
  const offset = vertexIndex * 3;
  const x = Object.is(positions[offset], -0) ? 0 : positions[offset];
  const y = Object.is(positions[offset + 1], -0) ? 0 : positions[offset + 1];
  const z = Object.is(positions[offset + 2], -0) ? 0 : positions[offset + 2];
  return `${x},${y},${z}`;
}

function solidComponents(source: PackedCollisionCompileSource): readonly Readonly<{
  id: number;
  triangles: readonly number[];
}>[] {
  const { indices, positions, triangleRoles, sourceTriangleIds } = source.triangles;
  const solidTriangles: number[] = [];
  for (let triangleIndex = 0; triangleIndex < triangleRoles.length; triangleIndex += 1) {
    if (triangleRoles[triangleIndex] === PackedCollisionRoleCode.Solid) solidTriangles.push(triangleIndex);
  }
  const unions = new UnionFind(solidTriangles.length);
  const firstTriangleByVertex = new Map<string, number>();
  solidTriangles.forEach((sourceTriangleIndex, localTriangleIndex) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = vertexWeldKey(positions, indices[sourceTriangleIndex * 3 + corner]);
      const first = firstTriangleByVertex.get(key);
      if (first === undefined) firstTriangleByVertex.set(key, localTriangleIndex);
      else unions.union(first, localTriangleIndex);
    }
  });
  const groups = new Map<number, number[]>();
  solidTriangles.forEach((sourceTriangleIndex, localTriangleIndex) => {
    const root = unions.find(localTriangleIndex);
    const group = groups.get(root);
    if (group) group.push(sourceTriangleIndex);
    else groups.set(root, [sourceTriangleIndex]);
  });
  const ordered = [...groups.values()].map((triangles) => triangles.sort((a, b) => a - b));
  ordered.sort((left, right) => {
    const leftId = Math.min(...left.map((index) => sourceTriangleIds[index]));
    const rightId = Math.min(...right.map((index) => sourceTriangleIds[index]));
    return leftId - rightId;
  });
  return ordered.map((triangles, id) => ({ id, triangles }));
}

function compileWallsAndFallback(source: PackedCollisionCompileSource): Readonly<{
  walls: PackedVerticalWallFeatures;
  fallback: CompiledFallbackMesh | null;
}> {
  const analyses = new Map<number, TriangleAnalysis>();
  const wallRows: Array<Readonly<{ triangle: number; component: number; analysis: TriangleAnalysis }>> = [];
  const fallbackRows: Array<Readonly<{ triangle: number; component: number }>> = [];
  for (const component of solidComponents(source)) {
    const componentAnalyses = component.triangles.map((triangle) => {
      const analysis = triangleAnalysis(source, triangle);
      analyses.set(triangle, analysis);
      return analysis;
    });
    if (componentAnalyses.every(isStrictlyVertical)) {
      component.triangles.forEach((triangle, index) => {
        wallRows.push({ triangle, component: component.id, analysis: componentAnalyses[index] });
      });
    } else {
      component.triangles.forEach((triangle) => fallbackRows.push({ triangle, component: component.id }));
    }
  }
  wallRows.sort((left, right) => left.triangle - right.triangle);
  fallbackRows.sort((left, right) => left.triangle - right.triangle);
  return {
    walls: packWallRows(source, wallRows),
    fallback: compileFallback(source, fallbackRows, analyses),
  };
}

function packWallRows(
  source: PackedCollisionCompileSource,
  rows: readonly Readonly<{ triangle: number; component: number; analysis: TriangleAnalysis }>[],
): PackedVerticalWallFeatures {
  const segmentXZ = new Float32Array(rows.length * 4);
  const normalsXZ = new Float32Array(rows.length * 2);
  const triangleTY = new Float32Array(rows.length * 6);
  const sourceTriangleIds = new Uint32Array(rows.length);
  const componentIds = new Uint32Array(rows.length);
  rows.forEach((row, rowIndex) => {
    const triangle = row.analysis;
    const points = [
      { x: triangle.ax, y: triangle.ay, z: triangle.az },
      { x: triangle.bx, y: triangle.by, z: triangle.bz },
      { x: triangle.cx, y: triangle.cy, z: triangle.cz },
    ];
    let pairA = 0;
    let pairB = 1;
    let maxDistanceSquared = -1;
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
      const dx = points[b].x - points[a].x;
      const dz = points[b].z - points[a].z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > maxDistanceSquared) {
        maxDistanceSquared = distanceSquared;
        pairA = a;
        pairB = b;
      }
    }
    if (maxDistanceSquared <= GEOMETRY_EPSILON) {
      throw new RangeError(`vertical source triangle ${row.triangle} has no horizontal extent`);
    }
    let a = points[pairA];
    let b = points[pairB];
    if (a.x > b.x || (a.x === b.x && a.z > b.z)) [a, b] = [b, a];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const tangentX = (b.x - a.x) / length;
    const tangentZ = (b.z - a.z) / length;
    segmentXZ.set([a.x, a.z, b.x, b.z], rowIndex * 4);
    const horizontalNormalLength = Math.hypot(triangle.nx, triangle.nz);
    normalsXZ.set([
      triangle.nx / horizontalNormalLength,
      triangle.nz / horizontalNormalLength,
    ], rowIndex * 2);
    points.forEach((point, corner) => {
      triangleTY[rowIndex * 6 + corner * 2] = (point.x - a.x) * tangentX + (point.z - a.z) * tangentZ;
      triangleTY[rowIndex * 6 + corner * 2 + 1] = point.y;
    });
    sourceTriangleIds[rowIndex] = source.triangles.sourceTriangleIds[row.triangle];
    componentIds[rowIndex] = row.component;
  });
  return { segmentXZ, normalsXZ, triangleTY, sourceTriangleIds, componentIds };
}

function compileFallback(
  source: PackedCollisionCompileSource,
  rows: readonly Readonly<{ triangle: number; component: number }>[],
  analyses: ReadonlyMap<number, TriangleAnalysis>,
): CompiledFallbackMesh | null {
  if (rows.length === 0) return null;
  const positions = new Float32Array(rows.length * 9);
  const vertexCount = rows.length * 3;
  const indices: CollisionIndexArray = vertexCount <= 0xffff
    ? new Uint16Array(vertexCount)
    : new Uint32Array(vertexCount);
  const resolvedSourceTriangleIds = new Uint32Array(rows.length);
  const resolvedComponentIds = new Uint32Array(rows.length);
  rows.forEach((row, rowIndex) => {
    const triangle = analyses.get(row.triangle) ?? triangleAnalysis(source, row.triangle);
    positions.set([
      triangle.ax, triangle.ay, triangle.az,
      triangle.bx, triangle.by, triangle.bz,
      triangle.cx, triangle.cy, triangle.cz,
    ], rowIndex * 9);
    indices.set([rowIndex * 3, rowIndex * 3 + 1, rowIndex * 3 + 2], rowIndex * 3);
    resolvedSourceTriangleIds[rowIndex] = source.triangles.sourceTriangleIds[row.triangle];
    resolvedComponentIds[rowIndex] = row.component;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const bvh = new MeshBVH(geometry, { indirect: true });
  if (!bvh.indirect) throw new Error("fallback MeshBVH must be indirect");
  return { geometry, bvh, resolvedSourceTriangleIds, resolvedComponentIds };
}

function buildCellCsr(
  aabbs: readonly (readonly [minX: number, minZ: number, maxX: number, maxZ: number])[],
  originX: number,
  originZ: number,
): Readonly<{ starts: Uint32Array; refs: Uint32Array }> {
  const cells: number[][] = Array.from({ length: CELL_COUNT }, () => []);
  aabbs.forEach((aabb, itemIndex) => {
    if (aabb[2] < originX || aabb[0] >= originX + CITY_SURFACE_CHUNK_SIZE_METERS
      || aabb[3] < originZ || aabb[1] >= originZ + CITY_SURFACE_CHUNK_SIZE_METERS) return;
    const minCellX = Math.max(0, Math.min(63, Math.floor(aabb[0] - originX)));
    const maxCellX = Math.max(0, Math.min(63, aabb[2] > aabb[0]
      ? Math.ceil(aabb[2] - originX) - 1
      : Math.floor(aabb[2] - originX)));
    const minCellZ = Math.max(0, Math.min(63, Math.floor(aabb[1] - originZ)));
    const maxCellZ = Math.max(0, Math.min(63, aabb[3] > aabb[1]
      ? Math.ceil(aabb[3] - originZ) - 1
      : Math.floor(aabb[3] - originZ)));
    for (let z = minCellZ; z <= maxCellZ; z += 1) {
      for (let x = minCellX; x <= maxCellX; x += 1) cells[z * 64 + x].push(itemIndex);
    }
  });
  const starts = new Uint32Array(CELL_COUNT + 1);
  let refCount = 0;
  cells.forEach((cell, index) => {
    starts[index] = refCount;
    refCount += cell.length;
  });
  starts[CELL_COUNT] = refCount;
  const refs = new Uint32Array(refCount);
  let cursor = 0;
  cells.forEach((cell) => {
    refs.set(cell, cursor);
    cursor += cell.length;
  });
  return { starts, refs };
}

function compileSurfaceChunk(source: PackedCollisionCompileSource): PackedSurfaceChunk | null {
  const surfaceTriangles: Array<Readonly<{ sourceIndex: number; analysis: TriangleAnalysis }>> = [];
  for (let triangleIndex = 0; triangleIndex < source.triangles.triangleRoles.length; triangleIndex += 1) {
    if (source.triangles.triangleRoles[triangleIndex] !== PackedCollisionRoleCode.RideableSurface) continue;
    const analysis = triangleAnalysis(source, triangleIndex);
    const upwardNy = Math.abs(analysis.ny);
    const profile = source.surfaceProfiles[source.triangles.triangleProfileIndices[triangleIndex]];
    const minimumNy = Math.cos(profile.maxSlopeDegrees * Math.PI / 180);
    if (upwardNy + 1e-12 < minimumNy) continue;
    surfaceTriangles.push({ sourceIndex: triangleIndex, analysis });
  }
  const boundaries = source.explicitBoundaries;
  if (surfaceTriangles.length === 0 && !boundaries) return null;
  if (source.chunkX === undefined || source.chunkZ === undefined) {
    throw new TypeError("surface compilation requires chunk coordinates");
  }
  const originX = source.chunkX * CITY_SURFACE_CHUNK_SIZE_METERS;
  const originZ = source.chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS;
  const triangleXZ = new Float32Array(surfaceTriangles.length * 6);
  const trianglePlanes = new Float32Array(surfaceTriangles.length * 4);
  const triangleYRanges = new Float32Array(surfaceTriangles.length * 2);
  const triangleProfileIndices = new Uint16Array(surfaceTriangles.length);
  const triangleSurfaceKeys = new Uint32Array(surfaceTriangles.length);
  const triangleSourceIds = new Uint32Array(surfaceTriangles.length);
  const triangleSpeedCaps = new Float32Array(surfaceTriangles.length);
  const triangleAabbs: Array<readonly [number, number, number, number]> = [];
  surfaceTriangles.forEach(({ sourceIndex, analysis }, index) => {
    const direction = analysis.ny < 0 ? -1 : 1;
    const nx = analysis.nx * direction;
    const ny = analysis.ny * direction;
    const nz = analysis.nz * direction;
    triangleXZ.set([
      analysis.ax, analysis.az,
      analysis.bx, analysis.bz,
      analysis.cx, analysis.cz,
    ], index * 6);
    trianglePlanes.set([
      nx, ny, nz,
      -(nx * analysis.ax + ny * analysis.ay + nz * analysis.az),
    ], index * 4);
    triangleYRanges.set([
      Math.min(analysis.ay, analysis.by, analysis.cy),
      Math.max(analysis.ay, analysis.by, analysis.cy),
    ], index * 2);
    const profileIndex = source.triangles.triangleProfileIndices[sourceIndex];
    triangleProfileIndices[index] = profileIndex;
    triangleSurfaceKeys[index] = source.triangles.triangleSurfaceKeys[sourceIndex];
    triangleSourceIds[index] = source.triangles.sourceTriangleIds[sourceIndex];
    triangleSpeedCaps[index] = source.surfaceProfiles[profileIndex].speedCap;
    triangleAabbs.push([
      Math.min(analysis.ax, analysis.bx, analysis.cx),
      Math.min(analysis.az, analysis.bz, analysis.cz),
      Math.max(analysis.ax, analysis.bx, analysis.cx),
      Math.max(analysis.az, analysis.bz, analysis.cz),
    ]);
  });
  const surfaceCsr = buildCellCsr(triangleAabbs, originX, originZ);

  const boundaryXZ = boundaries ? new Float32Array(boundaries.boundaryXZ) : new Float32Array();
  const boundaryTransitionProfileIndices = boundaries
    ? new Uint16Array(boundaries.boundaryTransitionProfileIndices)
    : new Uint16Array();
  const boundaryGroupKeys = boundaries ? new Uint32Array(boundaries.boundaryGroupKeys) : new Uint32Array();
  const boundarySurfaceKeyPairs = boundaries
    ? new Uint32Array(boundaries.boundarySurfaceKeyPairs)
    : new Uint32Array();
  const boundaryAabbs: Array<readonly [number, number, number, number]> = [];
  for (let offset = 0; offset < boundaryXZ.length; offset += 4) {
    boundaryAabbs.push([
      Math.min(boundaryXZ[offset], boundaryXZ[offset + 2]),
      Math.min(boundaryXZ[offset + 1], boundaryXZ[offset + 3]),
      Math.max(boundaryXZ[offset], boundaryXZ[offset + 2]),
      Math.max(boundaryXZ[offset + 1], boundaryXZ[offset + 3]),
    ]);
  }
  const boundaryCsr = buildCellCsr(boundaryAabbs, originX, originZ);
  return {
    chunkKey: citySurfaceChunkKey(source.chunkX, source.chunkZ),
    chunkX: source.chunkX,
    chunkZ: source.chunkZ,
    cellStart: surfaceCsr.starts,
    cellTriangleRefs: surfaceCsr.refs,
    cellBoundaryStart: boundaryCsr.starts,
    cellBoundaryRefs: boundaryCsr.refs,
    triangleXZ,
    trianglePlanes,
    triangleYRanges,
    triangleProfileIndices,
    triangleSurfaceKeys,
    triangleSourceIds,
    triangleSpeedCaps,
    boundaryXZ,
    boundaryTransitionProfileIndices,
    boundaryGroupKeys,
    boundarySurfaceKeyPairs,
  };
}

function appendHashBytes(chunks: Uint8Array[], label: string, bytes: Uint8Array) {
  const labelBytes = utf8Encoder.encode(label);
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, labelBytes.length, false);
  view.setUint32(4, bytes.byteLength, false);
  chunks.push(header, labelBytes, bytes);
}

function typedBytes(array: ArrayBufferView): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

export async function hashCollisionCompileSource(source: PackedCollisionCompileSource): Promise<string> {
  validateSource(source);
  const metadata = canonicalTupleKey([
    source.kind,
    source.sourceId,
    source.chunkX ?? -1,
    source.chunkZ ?? -1,
    source.chunkKey ?? -1,
    ...(source.coreBoundsXZ?.map(canonicalNumber) ?? []),
    canonicalNumber(source.topologyHaloMeters ?? 0),
    ...source.surfaceProfiles.flatMap((profile) => [
      profile.id,
      profile.family,
      canonicalNumber(profile.speedCap),
      canonicalNumber(profile.maxSlopeDegrees),
      profile.selectionPriority,
    ]),
    ...source.surfaceTransitionProfiles.flatMap((profile) => profile.kind === "road-curb"
      ? [profile.id, profile.kind, canonicalNumber(profile.maxStepUpMeters),
          canonicalNumber(profile.maxStepDownMeters), profile.bumpProfile]
      : [profile.id, profile.kind]),
  ]);
  const chunks: Uint8Array[] = [];
  appendHashBytes(chunks, "metadata", utf8Encoder.encode(metadata));
  const arrays: readonly [string, ArrayBufferView][] = [
    ["positions:f32", source.triangles.positions],
    [`indices:${source.triangles.indices instanceof Uint16Array ? "u16" : "u32"}`, source.triangles.indices],
    ["roles:u8", source.triangles.triangleRoles],
    ["profiles:u16", source.triangles.triangleProfileIndices],
    ["surfaceKeys:u32", source.triangles.triangleSurfaceKeys],
    ["sourceIds:u32", source.triangles.sourceTriangleIds],
  ];
  arrays.forEach(([label, array]) => appendHashBytes(chunks, label, typedBytes(array)));
  if (source.explicitBoundaries) {
    appendHashBytes(chunks, "boundaryXZ:f32", typedBytes(source.explicitBoundaries.boundaryXZ));
    appendHashBytes(chunks, "boundaryProfiles:u16", typedBytes(source.explicitBoundaries.boundaryTransitionProfileIndices));
    appendHashBytes(chunks, "boundaryGroups:u32", typedBytes(source.explicitBoundaries.boundaryGroupKeys));
    appendHashBytes(chunks, "boundaryPairs:u32", typedBytes(source.explicitBoundaries.boundarySurfaceKeyPairs));
  }
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  });
  const digest = await crypto.subtle.digest("SHA-256", joined.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function collisionCacheKey(sourceHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(sourceHash)) throw new TypeError("sourceHash must be lowercase SHA-256 hex");
  return canonicalTupleKey([
    "city-collision",
    COLLISION_WIRE_VERSION,
    COLLISION_COMPILER_VERSION,
    THREE_MESH_BVH_PACKAGE_VERSION,
    sourceHash,
  ]);
}

export async function compileCollisionSource(
  source: PackedCollisionCompileSource,
): Promise<CompiledCollisionSource> {
  validateSource(source);
  const sourceHash = await hashCollisionCompileSource(source);
  const { walls, fallback } = compileWallsAndFallback(source);
  return {
    sourceId: source.sourceId,
    generation: source.generation,
    sourceHash,
    cacheKey: collisionCacheKey(sourceHash),
    walls,
    surfaceChunk: compileSurfaceChunk(source),
    fallback,
    surfaceProfiles: cloneProfiles(source.surfaceProfiles),
    surfaceTransitionProfiles: cloneTransitions(source.surfaceTransitionProfiles),
  };
}

/**
 * `triangleIndex` comes from a BVH traversal callback and is not a geometry
 * triangle ordinal in indirect mode. Always resolve it before metadata lookup.
 */
export function resolveFallbackSourceTriangleId(
  fallback: CompiledFallbackMesh,
  triangleIndex: number,
): number {
  if (!Number.isInteger(triangleIndex) || triangleIndex < 0) throw new RangeError("invalid BVH triangle index");
  const resolved = fallback.bvh.resolveTriangleIndex(triangleIndex);
  if (!Number.isInteger(resolved) || resolved < 0 || resolved >= fallback.resolvedSourceTriangleIds.length) {
    throw new RangeError("resolved BVH triangle index is out of range");
  }
  return fallback.resolvedSourceTriangleIds[resolved];
}

function typedArrayKind(array: SupportedTypedArray): CollisionTypedArrayKind {
  if (array instanceof Float32Array) return "f32";
  if (array instanceof Uint8Array) return "u8";
  if (array instanceof Uint16Array) return "u16";
  if (array instanceof Uint32Array) return "u32";
  return "i32";
}

function addTypedView(
  buffers: ArrayBuffer[],
  array: SupportedTypedArray,
): CollisionTypedViewManifest {
  const copy = new Uint8Array(array.byteLength);
  copy.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  const bufferIndex = buffers.push(copy.buffer) - 1;
  return { kind: typedArrayKind(array), bufferIndex, byteOffset: 0, length: array.length };
}

function addBuffer(buffers: ArrayBuffer[], source: ArrayBuffer): number {
  return buffers.push(source.slice(0)) - 1;
}

function wallManifest(buffers: ArrayBuffer[], walls: PackedVerticalWallFeatures): PackedVerticalWallManifest {
  return {
    segmentXZ: addTypedView(buffers, walls.segmentXZ),
    normalsXZ: addTypedView(buffers, walls.normalsXZ),
    triangleTY: addTypedView(buffers, walls.triangleTY),
    sourceTriangleIds: addTypedView(buffers, walls.sourceTriangleIds),
    componentIds: addTypedView(buffers, walls.componentIds),
  };
}

function surfaceManifest(buffers: ArrayBuffer[], chunk: PackedSurfaceChunk): PackedSurfaceChunkManifest {
  return {
    chunkKey: chunk.chunkKey,
    chunkX: chunk.chunkX,
    chunkZ: chunk.chunkZ,
    cellStart: addTypedView(buffers, chunk.cellStart),
    cellTriangleRefs: addTypedView(buffers, chunk.cellTriangleRefs),
    cellBoundaryStart: addTypedView(buffers, chunk.cellBoundaryStart),
    cellBoundaryRefs: addTypedView(buffers, chunk.cellBoundaryRefs),
    triangleXZ: addTypedView(buffers, chunk.triangleXZ),
    trianglePlanes: addTypedView(buffers, chunk.trianglePlanes),
    triangleYRanges: addTypedView(buffers, chunk.triangleYRanges),
    triangleProfileIndices: addTypedView(buffers, chunk.triangleProfileIndices),
    triangleSurfaceKeys: addTypedView(buffers, chunk.triangleSurfaceKeys),
    triangleSourceIds: addTypedView(buffers, chunk.triangleSourceIds),
    triangleSpeedCaps: addTypedView(buffers, chunk.triangleSpeedCaps),
    boundaryXZ: addTypedView(buffers, chunk.boundaryXZ),
    boundaryTransitionProfileIndices: addTypedView(buffers, chunk.boundaryTransitionProfileIndices),
    boundaryGroupKeys: addTypedView(buffers, chunk.boundaryGroupKeys),
    boundarySurfaceKeyPairs: addTypedView(buffers, chunk.boundarySurfaceKeyPairs),
  };
}

function fallbackManifest(
  buffers: ArrayBuffer[],
  fallback: CompiledFallbackMesh,
): SerializedFallbackManifest {
  if (!fallback.bvh.indirect) throw new Error("refusing to serialize a direct fallback BVH");
  const position = fallback.geometry.getAttribute("position");
  if (!(position.array instanceof Float32Array)) throw new TypeError("fallback positions must be Float32Array");
  const serialized = MeshBVH.serialize(fallback.bvh, { cloneBuffers: true }) as SerializedBVH & { version?: number };
  if (!serialized.index || !serialized.indirectBuffer) {
    throw new Error("indirect fallback serialization requires index and indirectBuffer");
  }
  return {
    positions: addTypedView(buffers, position.array),
    sourceTriangleIds: addTypedView(buffers, fallback.resolvedSourceTriangleIds),
    componentIds: addTypedView(buffers, fallback.resolvedComponentIds),
    bvh: {
      version: serialized.version ?? THREE_MESH_BVH_WIRE_VERSION,
      rootBufferIndices: serialized.roots.map((root) => addBuffer(buffers, root)),
      index: addTypedView(buffers, serialized.index),
      indirectBuffer: addTypedView(buffers, serialized.indirectBuffer),
    },
  };
}

export function serializeCompiledCollision(compiled: CompiledCollisionSource): SerializedCollisionPayload {
  const buffers: ArrayBuffer[] = [];
  return {
    header: {
      wireVersion: COLLISION_WIRE_VERSION,
      compilerVersion: COLLISION_COMPILER_VERSION,
      meshBvhWireVersion: THREE_MESH_BVH_WIRE_VERSION,
      meshBvhPackageVersion: THREE_MESH_BVH_PACKAGE_VERSION,
      sourceId: compiled.sourceId,
      generation: compiled.generation,
      sourceHash: compiled.sourceHash,
      cacheKey: compiled.cacheKey,
    },
    buffers,
    manifest: {
      walls: wallManifest(buffers, compiled.walls),
      surfaceChunk: compiled.surfaceChunk ? surfaceManifest(buffers, compiled.surfaceChunk) : null,
      fallback: compiled.fallback ? fallbackManifest(buffers, compiled.fallback) : null,
    },
    surfaceProfiles: cloneProfiles(compiled.surfaceProfiles),
    surfaceTransitionProfiles: cloneTransitions(compiled.surfaceTransitionProfiles),
  };
}

function readTypedView(
  payload: SerializedCollisionPayload,
  view: CollisionTypedViewManifest,
): SupportedTypedArray {
  if (!Number.isSafeInteger(view.bufferIndex) || view.bufferIndex < 0) {
    throw new RangeError("typed view buffer index is invalid");
  }
  const buffer = payload.buffers[view.bufferIndex];
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError("typed view buffer index is invalid");
  if (!Number.isSafeInteger(view.byteOffset) || view.byteOffset < 0
    || !Number.isSafeInteger(view.length) || view.length < 0) {
    throw new RangeError("typed view range is invalid");
  }
  const constructors = {
    f32: Float32Array,
    u8: Uint8Array,
    u16: Uint16Array,
    u32: Uint32Array,
    i32: Int32Array,
  } as const;
  const Constructor = constructors[view.kind];
  if (!Constructor) throw new TypeError("typed view kind is invalid");
  try {
    return new Constructor(buffer, view.byteOffset, view.length);
  } catch {
    throw new RangeError("typed view exceeds its buffer");
  }
}

function expectView<T extends SupportedTypedArray>(
  payload: SerializedCollisionPayload,
  view: CollisionTypedViewManifest,
  Constructor: abstract new (...args: never[]) => T,
): T {
  const result = readTypedView(payload, view);
  if (!(result instanceof Constructor)) throw new TypeError(`typed view kind ${view.kind} is unexpected`);
  return result as T;
}

function deserializeWalls(
  payload: SerializedCollisionPayload,
  manifest: PackedVerticalWallManifest,
): PackedVerticalWallFeatures {
  const walls = {
    segmentXZ: expectView(payload, manifest.segmentXZ, Float32Array),
    normalsXZ: expectView(payload, manifest.normalsXZ, Float32Array),
    triangleTY: expectView(payload, manifest.triangleTY, Float32Array),
    sourceTriangleIds: expectView(payload, manifest.sourceTriangleIds, Uint32Array),
    componentIds: expectView(payload, manifest.componentIds, Uint32Array),
  };
  const count = walls.sourceTriangleIds.length;
  if (walls.segmentXZ.length !== count * 4
    || walls.normalsXZ.length !== count * 2
    || walls.triangleTY.length !== count * 6
    || walls.componentIds.length !== count) {
    throw new RangeError("serialized wall view lengths are inconsistent");
  }
  for (const [label, values] of [
    ["wall segment", walls.segmentXZ],
    ["wall normal", walls.normalsXZ],
    ["wall t/y", walls.triangleTY],
  ] as const) {
    for (let index = 0; index < values.length; index += 1) assertFinite(values[index], `${label}[${index}]`);
  }
  return walls;
}

function validateCsr(
  starts: Uint32Array,
  refs: Uint32Array,
  itemCount: number,
  label: string,
) {
  if (starts.length !== CELL_COUNT + 1 || starts[0] !== 0 || starts[CELL_COUNT] !== refs.length) {
    throw new RangeError(`${label} CSR header is invalid`);
  }
  for (let index = 1; index < starts.length; index += 1) {
    if (starts[index] < starts[index - 1]) throw new RangeError(`${label} CSR starts are not monotonic`);
  }
  for (let index = 0; index < refs.length; index += 1) {
    if (refs[index] >= itemCount) throw new RangeError(`${label} CSR ref is out of range`);
  }
}

function deserializeSurface(
  payload: SerializedCollisionPayload,
  manifest: PackedSurfaceChunkManifest,
): PackedSurfaceChunk {
  if (citySurfaceChunkKey(manifest.chunkX, manifest.chunkZ) !== manifest.chunkKey) {
    throw new RangeError("serialized surface chunk key is invalid");
  }
  const chunk = {
    chunkKey: manifest.chunkKey,
    chunkX: manifest.chunkX,
    chunkZ: manifest.chunkZ,
    cellStart: expectView(payload, manifest.cellStart, Uint32Array),
    cellTriangleRefs: expectView(payload, manifest.cellTriangleRefs, Uint32Array),
    cellBoundaryStart: expectView(payload, manifest.cellBoundaryStart, Uint32Array),
    cellBoundaryRefs: expectView(payload, manifest.cellBoundaryRefs, Uint32Array),
    triangleXZ: expectView(payload, manifest.triangleXZ, Float32Array),
    trianglePlanes: expectView(payload, manifest.trianglePlanes, Float32Array),
    triangleYRanges: expectView(payload, manifest.triangleYRanges, Float32Array),
    triangleProfileIndices: expectView(payload, manifest.triangleProfileIndices, Uint16Array),
    triangleSurfaceKeys: expectView(payload, manifest.triangleSurfaceKeys, Uint32Array),
    triangleSourceIds: expectView(payload, manifest.triangleSourceIds, Uint32Array),
    triangleSpeedCaps: expectView(payload, manifest.triangleSpeedCaps, Float32Array),
    boundaryXZ: expectView(payload, manifest.boundaryXZ, Float32Array),
    boundaryTransitionProfileIndices: expectView(payload, manifest.boundaryTransitionProfileIndices, Uint16Array),
    boundaryGroupKeys: expectView(payload, manifest.boundaryGroupKeys, Uint32Array),
    boundarySurfaceKeyPairs: expectView(payload, manifest.boundarySurfaceKeyPairs, Uint32Array),
  };
  const triangleCount = chunk.triangleSourceIds.length;
  if (chunk.triangleXZ.length !== triangleCount * 6
    || chunk.trianglePlanes.length !== triangleCount * 4
    || chunk.triangleYRanges.length !== triangleCount * 2
    || chunk.triangleProfileIndices.length !== triangleCount
    || chunk.triangleSurfaceKeys.length !== triangleCount
    || chunk.triangleSpeedCaps.length !== triangleCount) {
    throw new RangeError("serialized surface triangle view lengths are inconsistent");
  }
  const boundaryCount = chunk.boundaryXZ.length / 4;
  if (!Number.isInteger(boundaryCount)
    || chunk.boundaryTransitionProfileIndices.length !== boundaryCount
    || chunk.boundaryGroupKeys.length !== boundaryCount
    || chunk.boundarySurfaceKeyPairs.length !== boundaryCount * 2) {
    throw new RangeError("serialized boundary view lengths are inconsistent");
  }
  validateCsr(chunk.cellStart, chunk.cellTriangleRefs, triangleCount, "surface");
  validateCsr(chunk.cellBoundaryStart, chunk.cellBoundaryRefs, boundaryCount, "boundary");
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const profileIndex = chunk.triangleProfileIndices[triangleIndex];
    if (profileIndex >= payload.surfaceProfiles.length || chunk.triangleSurfaceKeys[triangleIndex] === NO_SURFACE_KEY) {
      throw new RangeError("serialized surface triangle metadata is invalid");
    }
    const expectedSpeedCap = Math.fround(payload.surfaceProfiles[profileIndex].speedCap);
    if (!Object.is(chunk.triangleSpeedCaps[triangleIndex], expectedSpeedCap)) {
      throw new RangeError("serialized surface speedCap disagrees with its profile");
    }
  }
  for (let boundaryIndex = 0; boundaryIndex < boundaryCount; boundaryIndex += 1) {
    if (chunk.boundaryTransitionProfileIndices[boundaryIndex] >= payload.surfaceTransitionProfiles.length) {
      throw new RangeError("serialized boundary transition profile is invalid");
    }
  }
  for (const [label, values] of [
    ["surface xz", chunk.triangleXZ],
    ["surface plane", chunk.trianglePlanes],
    ["surface y range", chunk.triangleYRanges],
    ["boundary xz", chunk.boundaryXZ],
  ] as const) {
    for (let index = 0; index < values.length; index += 1) assertFinite(values[index], `${label}[${index}]`);
  }
  return chunk;
}

function deserializeFallback(
  payload: SerializedCollisionPayload,
  manifest: SerializedFallbackManifest,
): CompiledFallbackMesh {
  if (manifest.bvh.version !== THREE_MESH_BVH_WIRE_VERSION) {
    throw new Error("unsupported three-mesh-bvh wire version");
  }
  const positions = expectView(payload, manifest.positions, Float32Array);
  const index = readTypedView(payload, manifest.bvh.index);
  if (!(index instanceof Uint16Array || index instanceof Uint32Array || index instanceof Int32Array)) {
    throw new TypeError("BVH index view must be an integer array");
  }
  const indirectBuffer = readTypedView(payload, manifest.bvh.indirectBuffer);
  if (!(indirectBuffer instanceof Uint16Array || indirectBuffer instanceof Uint32Array)) {
    throw new TypeError("BVH indirectBuffer must be unsigned");
  }
  if (positions.length % 9 !== 0) throw new RangeError("fallback positions length is invalid");
  const triangleCount = positions.length / 9;
  if (index.length !== triangleCount * 3 || indirectBuffer.length !== triangleCount) {
    throw new RangeError("fallback BVH index lengths are inconsistent");
  }
  for (let indexOffset = 0; indexOffset < index.length; indexOffset += 1) {
    if (index[indexOffset] < 0 || index[indexOffset] >= triangleCount * 3) {
      throw new RangeError("fallback geometry index is out of range");
    }
  }
  const roots = manifest.bvh.rootBufferIndices.map((bufferIndex) => {
    const root = payload.buffers[bufferIndex];
    if (!(root instanceof ArrayBuffer)) throw new TypeError("BVH root buffer index is invalid");
    return root;
  });
  if (roots.length === 0) throw new RangeError("fallback BVH has no roots");
  const sourceTriangleIds = expectView(payload, manifest.sourceTriangleIds, Uint32Array);
  const componentIds = expectView(payload, manifest.componentIds, Uint32Array);
  if (sourceTriangleIds.length !== triangleCount || componentIds.length !== triangleCount) {
    throw new RangeError("fallback metadata lengths are inconsistent");
  }
  for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
    assertFinite(positions[positionIndex], `fallback position[${positionIndex}]`);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  // MeshBVH.deserialize restores the tree and index but does not recreate the
  // BufferGeometry bounding box. The runtime owner spatial index is built from
  // this bound; leaving it null collapses every fallback-only building owner to
  // its placement origin and removes the building from nearby sweep queries.
  geometry.computeBoundingBox();
  const bvh = MeshBVH.deserialize({
    version: manifest.bvh.version,
    roots,
    index,
    indirectBuffer,
  } as SerializedBVH, geometry);
  if (!bvh.indirect) throw new Error("deserialized fallback BVH is not indirect");
  return {
    geometry,
    bvh,
    resolvedSourceTriangleIds: sourceTriangleIds,
    resolvedComponentIds: componentIds,
  };
}

export function deserializeCompiledCollision(payload: SerializedCollisionPayload): CompiledCollisionSource {
  if (!payload || !Array.isArray(payload.buffers)
    || !Array.isArray(payload.surfaceProfiles)
    || !Array.isArray(payload.surfaceTransitionProfiles)) {
    throw new TypeError("collision payload shape is invalid");
  }
  if (payload.header.wireVersion !== COLLISION_WIRE_VERSION
    || payload.header.compilerVersion !== COLLISION_COMPILER_VERSION
    || payload.header.meshBvhWireVersion !== THREE_MESH_BVH_WIRE_VERSION
    || payload.header.meshBvhPackageVersion !== THREE_MESH_BVH_PACKAGE_VERSION) {
    throw new Error("collision payload version mismatch");
  }
  if (payload.header.cacheKey !== collisionCacheKey(payload.header.sourceHash)) {
    throw new Error("collision payload cache identity mismatch");
  }
  if (!payload.header.sourceId || !Number.isSafeInteger(payload.header.generation)
    || payload.header.generation < 0) {
    throw new Error("collision payload source identity is invalid");
  }
  validateProfiles(payload.surfaceProfiles);
  validateTransitions(payload.surfaceTransitionProfiles);
  return {
    sourceId: payload.header.sourceId,
    generation: payload.header.generation,
    sourceHash: payload.header.sourceHash,
    cacheKey: payload.header.cacheKey,
    walls: deserializeWalls(payload, payload.manifest.walls),
    surfaceChunk: payload.manifest.surfaceChunk
      ? deserializeSurface(payload, payload.manifest.surfaceChunk)
      : null,
    fallback: payload.manifest.fallback
      ? deserializeFallback(payload, payload.manifest.fallback)
      : null,
    surfaceProfiles: cloneProfiles(payload.surfaceProfiles),
    surfaceTransitionProfiles: cloneTransitions(payload.surfaceTransitionProfiles),
  };
}

export function collisionPayloadTransferList(payload: SerializedCollisionPayload): ArrayBuffer[] {
  return [...new Set(payload.buffers)];
}
