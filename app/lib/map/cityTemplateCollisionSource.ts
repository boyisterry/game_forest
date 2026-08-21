import * as THREE from "three";
import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
  canonicalTupleKey,
  citySurfaceChunkKey,
} from "./cityCollisionTypes.ts";
import {
  resolveMapCollisionRole,
  type CollisionRoleAudit,
  type TemplateBuildDescriptorSnapshot,
} from "./cityCatalog.ts";
import {
  CITY_SURFACE_CHUNK_SIZE_METERS,
  type PackedCollisionCompileSource,
} from "./cityCollisionWire.ts";

export type TemplateCollisionPackOptions = Readonly<{
  sourceId: string;
  generation: number;
  resolvedHeightScale: number;
  signal?: AbortSignal;
  /** Keeps the main thread responsive while a heavy campus is copied. */
  yieldEveryMeshes?: number;
}>;

const DEFAULT_YIELD_EVERY_MESHES = 24;
const DEGENERATE_TRIANGLE_AREA_EPSILON = 1e-12;
const SURFACE_CLIP_EPSILON = 1e-7;

type SurfacePoint = Readonly<{ x: number; y: number; z: number }>;
type TemplateRideableTriangle = Readonly<{
  points: readonly [SurfacePoint, SurfacePoint, SurfacePoint];
  profileIndex: number;
  surfaceKey: number;
  sourceTriangleId: number;
}>;

function isEffectivelyVisible(object: THREE.Object3D, root: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}

/**
 * Collision authority follows authored source meshes, not render submission.
 * Render-proxy sources can be hidden by batching, while map-LOD layers and the
 * generated proxies themselves must remain excluded from both collision paths.
 */
export function isCollisionSourceEligible(
  object: THREE.Object3D,
  root: THREE.Object3D,
  hiddenLayers: ReadonlySet<string>,
) {
  if (!(object instanceof THREE.Mesh)) return false;
  let renderProxySource = false;
  let reachedRoot = false;
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData.renderProxy === true) return false;
    const mapLayer = node.userData.mapLayer;
    if (typeof mapLayer === "string" && hiddenLayers.has(mapLayer)) return false;
    if (typeof node.userData.renderProxySource === "string") renderProxySource = true;
    if (node === root) {
      reachedRoot = true;
      break;
    }
  }
  if (!reachedRoot) return false;
  return renderProxySource || isEffectivelyVisible(object, root);
}

function collisionHiddenLayers(descriptor: TemplateBuildDescriptorSnapshot): ReadonlySet<string> {
  return descriptor.mapLod.mode === "tagged-exterior"
    ? new Set(descriptor.mapLod.hideLayers)
    : new Set<string>();
}

function sourceTriangleCount(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute("position");
  if (!positions) return 0;
  return Math.floor((geometry.getIndex()?.count ?? positions.count) / 3);
}

function applyCollisionTransform(
  target: number[],
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  matrix: THREE.Matrix4,
  resolvedHeightScale: number,
) {
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
    point.applyMatrix4(matrix);
    target.push(point.x, point.y * resolvedHeightScale, point.z);
  }
}

function hasUsableTriangleArea(
  positions: readonly number[],
  ia: number,
  ib: number,
  ic: number,
) {
  // The Worker receives Float32Array data. Test the same rounded coordinates
  // here so a tiny source face cannot collapse only after transfer.
  const ax = Math.fround(positions[ia * 3]);
  const ay = Math.fround(positions[ia * 3 + 1]);
  const az = Math.fround(positions[ia * 3 + 2]);
  const bx = Math.fround(positions[ib * 3]);
  const by = Math.fround(positions[ib * 3 + 1]);
  const bz = Math.fround(positions[ib * 3 + 2]);
  const cx = Math.fround(positions[ic * 3]);
  const cy = Math.fround(positions[ic * 3 + 1]);
  const cz = Math.fround(positions[ic * 3 + 2]);
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const crossX = uy * vz - uz * vy;
  const crossY = uz * vx - ux * vz;
  const crossZ = ux * vy - uy * vx;
  return Math.hypot(crossX, crossY, crossZ) > DEGENERATE_TRIANGLE_AREA_EPSILON;
}

function appendMeshInstance(
  object: THREE.Mesh,
  matrix: THREE.Matrix4,
  resolvedHeightScale: number,
  output: {
    positions: number[];
    indices: number[];
    roles: number[];
    profileIndices: number[];
    surfaceKeys: number[];
    sourceTriangleIds: number[];
  },
) {
  const geometry = object.geometry;
  const sourcePositions = geometry.getAttribute("position");
  if (!sourcePositions) return;
  const sourceIndex = geometry.getIndex();
  const triangleCount = sourceTriangleCount(geometry);
  if (triangleCount === 0) return;
  const vertexOffset = output.positions.length / 3;
  applyCollisionTransform(output.positions, sourcePositions, matrix, resolvedHeightScale);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const ia = vertexOffset + (sourceIndex?.getX(offset) ?? offset);
    const ib = vertexOffset + (sourceIndex?.getX(offset + 1) ?? offset + 1);
    const ic = vertexOffset + (sourceIndex?.getX(offset + 2) ?? offset + 2);
    // Authored/decimated GLBs can contain zero-area faces. They contribute no
    // collision surface and must be removed before the strict Worker ABI.
    if (!hasUsableTriangleArea(output.positions, ia, ib, ic)) continue;
    output.indices.push(ia, ib, ic);
    output.roles.push(PackedCollisionRoleCode.Solid);
    output.profileIndices.push(SURFACE_PROFILE_INDEX_NONE);
    output.surfaceKeys.push(NO_SURFACE_KEY);
    output.sourceTriangleIds.push(output.sourceTriangleIds.length);
  }
}

function nextMacrotask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function throwIfPackingAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("collision template packing aborted", "AbortError");
}

function clipSurfacePolygonAxis(
  polygon: readonly SurfacePoint[],
  axis: "x" | "z",
  threshold: number,
  keepGreater: boolean,
) {
  if (polygon.length === 0) return [];
  const output: SurfacePoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const aInside = (a[axis] - threshold) * (keepGreater ? 1 : -1) >= -SURFACE_CLIP_EPSILON;
    const bInside = (b[axis] - threshold) * (keepGreater ? 1 : -1) >= -SURFACE_CLIP_EPSILON;
    if (aInside) output.push(a);
    if (aInside === bInside) continue;
    const denominator = b[axis] - a[axis];
    if (Math.abs(denominator) <= SURFACE_CLIP_EPSILON) continue;
    const fraction = (threshold - a[axis]) / denominator;
    output.push(Object.freeze({
      x: a.x + (b.x - a.x) * fraction,
      y: a.y + (b.y - a.y) * fraction,
      z: a.z + (b.z - a.z) * fraction,
    }));
  }
  return output;
}

function clipSurfaceTriangle(
  triangle: TemplateRideableTriangle,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
) {
  return clipSurfacePolygonAxis(
    clipSurfacePolygonAxis(
      clipSurfacePolygonAxis(
        clipSurfacePolygonAxis(triangle.points, "x", minX, true),
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

function surfacePolygonArea(points: readonly SurfacePoint[]) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return twiceArea * 0.5;
}

function hasUsableSurfaceTriangle(a: SurfacePoint, b: SurfacePoint, c: SurfacePoint) {
  const ax = Math.fround(a.x);
  const ay = Math.fround(a.y);
  const az = Math.fround(a.z);
  const bx = Math.fround(b.x);
  const by = Math.fround(b.y);
  const bz = Math.fround(b.z);
  const cx = Math.fround(c.x);
  const cy = Math.fround(c.y);
  const cz = Math.fround(c.z);
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  return Math.hypot(
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  ) > DEGENERATE_TRIANGLE_AREA_EPSILON;
}

/**
 * Packs the rideable half of a template into sparse local 64 m chunks. Solid
 * geometry remains in the shared template source above, so surface chunks do
 * not duplicate a campus BVH for every cell they cross.
 */
export async function packTemplateSurfaceCollisionSources(
  root: THREE.Group,
  descriptor: TemplateBuildDescriptorSnapshot,
  options: TemplateCollisionPackOptions,
): Promise<readonly PackedCollisionCompileSource[]> {
  throwIfPackingAborted(options.signal);
  root.updateMatrixWorld(true);
  const hiddenLayers = collisionHiddenLayers(descriptor);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (isCollisionSourceEligible(object, root, hiddenLayers)) meshes.push(object);
  });
  const audit: CollisionRoleAudit = { autoSolid: [] };
  const triangles: TemplateRideableTriangle[] = [];
  const point = new THREE.Vector3();
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  let nextSurfaceKey = 1;
  let nextSourceTriangleId = 0;
  let processed = 0;
  for (const mesh of meshes) {
    throwIfPackingAborted(options.signal);
    const resolution = resolveMapCollisionRole(
      mesh,
      descriptor.collisionMeshes,
      descriptor.surfaceProfiles,
      audit,
    );
    if (resolution.role === "rideable-surface") {
      const profileIndex = BUILTIN_SURFACE_PROFILES.findIndex((profile) => profile.id === resolution.surfaceProfileId);
      if (profileIndex < 0) throw new TypeError(`unknown template surface profile: ${resolution.surfaceProfileId}`);
      const geometry = mesh.geometry;
      const positions = geometry.getAttribute("position");
      const sourceIndex = geometry.getIndex();
      const triangleCount = sourceTriangleCount(geometry);
      const appendInstance = (matrix: THREE.Matrix4) => {
        const surfaceKey = nextSurfaceKey;
        nextSurfaceKey += 1;
        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
          const points = [0, 1, 2].map((corner) => {
            const offset = triangleIndex * 3 + corner;
            const vertex = sourceIndex?.getX(offset) ?? offset;
            point.set(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
            point.applyMatrix4(matrix);
            return Object.freeze({ x: point.x, y: point.y * options.resolvedHeightScale, z: point.z });
          }) as [SurfacePoint, SurfacePoint, SurfacePoint];
          if (Math.abs(surfacePolygonArea(points)) <= DEGENERATE_TRIANGLE_AREA_EPSILON) continue;
          triangles.push(Object.freeze({
            points: Object.freeze(points),
            profileIndex,
            surfaceKey,
            sourceTriangleId: nextSourceTriangleId,
          }));
          nextSourceTriangleId += 1;
        }
      };
      if (mesh instanceof THREE.InstancedMesh) {
        for (let instance = 0; instance < mesh.count; instance += 1) {
          mesh.getMatrixAt(instance, instanceMatrix);
          worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
          appendInstance(worldMatrix);
        }
      } else {
        appendInstance(mesh.matrixWorld);
      }
    }
    processed += 1;
    if (processed % (options.yieldEveryMeshes ?? DEFAULT_YIELD_EVERY_MESHES) === 0) await nextMacrotask();
  }
  if (triangles.length === 0) return Object.freeze([]);

  const coordinates = new Set<string>();
  for (const triangle of triangles) {
    const minX = Math.min(...triangle.points.map((candidate) => candidate.x));
    const minZ = Math.min(...triangle.points.map((candidate) => candidate.z));
    const maxX = Math.max(...triangle.points.map((candidate) => candidate.x));
    const maxZ = Math.max(...triangle.points.map((candidate) => candidate.z));
    for (let chunkZ = Math.floor(minZ / CITY_SURFACE_CHUNK_SIZE_METERS);
      chunkZ <= Math.floor(maxZ / CITY_SURFACE_CHUNK_SIZE_METERS); chunkZ += 1) {
      for (let chunkX = Math.floor(minX / CITY_SURFACE_CHUNK_SIZE_METERS);
        chunkX <= Math.floor(maxX / CITY_SURFACE_CHUNK_SIZE_METERS); chunkX += 1) {
        coordinates.add(`${chunkX},${chunkZ}`);
      }
    }
  }
  const outputs: PackedCollisionCompileSource[] = [];
  for (const [chunkX, chunkZ] of [...coordinates]
    .map((key) => key.split(",").map(Number) as [number, number])
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])) {
    const minX = chunkX * CITY_SURFACE_CHUNK_SIZE_METERS;
    const minZ = chunkZ * CITY_SURFACE_CHUNK_SIZE_METERS;
    const maxX = minX + CITY_SURFACE_CHUNK_SIZE_METERS;
    const maxZ = minZ + CITY_SURFACE_CHUNK_SIZE_METERS;
    const positions: number[] = [];
    const indices: number[] = [];
    const roles: number[] = [];
    const profileIndices: number[] = [];
    const surfaceKeys: number[] = [];
    const sourceTriangleIds: number[] = [];
    for (const triangle of triangles) {
      const clipped = clipSurfaceTriangle(triangle, minX, minZ, maxX, maxZ);
      if (clipped.length < 3 || Math.abs(surfacePolygonArea(clipped)) <= DEGENERATE_TRIANGLE_AREA_EPSILON) continue;
      const vertexOffset = positions.length / 3;
      for (const candidate of clipped) positions.push(candidate.x, candidate.y, candidate.z);
      for (let index = 1; index < clipped.length - 1; index += 1) {
        if (!hasUsableSurfaceTriangle(clipped[0], clipped[index], clipped[index + 1])) continue;
        indices.push(vertexOffset, vertexOffset + index, vertexOffset + index + 1);
        roles.push(PackedCollisionRoleCode.RideableSurface);
        profileIndices.push(triangle.profileIndex);
        surfaceKeys.push(triangle.surfaceKey);
        // Clipping can split one source face into multiple pieces; give each
        // packed triangle a deterministic chunk-local id.
        sourceTriangleIds.push(sourceTriangleIds.length);
      }
    }
    if (roles.length === 0) continue;
    outputs.push(Object.freeze({
      kind: "template",
      sourceId: canonicalTupleKey([options.sourceId, "surface-chunk", chunkX, chunkZ]),
      generation: options.generation,
      chunkX,
      chunkZ,
      chunkKey: citySurfaceChunkKey(chunkX, chunkZ),
      coreBoundsXZ: Object.freeze([minX, minZ, maxX, maxZ] as const),
      topologyHaloMeters: 0,
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
    }));
  }
  return Object.freeze(outputs);
}

/**
 * Copies the immutable, pre-merge map template into Worker-owned triangle
 * arrays. Rideable faces are deliberately omitted here: they are queried from
 * packed surface owners, while this template source contains only horizontal
 * blocking response geometry. Floors and roofs remain in complete solid
 * components for BVH/containment, and the runtime filters near-horizontal
 * faces from horizontal response.
 */
export async function packTemplateCollisionSource(
  root: THREE.Group,
  descriptor: TemplateBuildDescriptorSnapshot,
  options: TemplateCollisionPackOptions,
): Promise<PackedCollisionCompileSource> {
  throwIfPackingAborted(options.signal);
  if (!options.sourceId) throw new TypeError("collision template sourceId must not be empty");
  if (!Number.isSafeInteger(options.generation) || options.generation < 0) {
    throw new TypeError("collision template generation must be a non-negative safe integer");
  }
  if (!Number.isFinite(options.resolvedHeightScale) || options.resolvedHeightScale <= 0) {
    throw new TypeError("resolvedHeightScale must be a finite positive number");
  }
  const yieldEveryMeshes = options.yieldEveryMeshes ?? DEFAULT_YIELD_EVERY_MESHES;
  if (!Number.isSafeInteger(yieldEveryMeshes) || yieldEveryMeshes <= 0) {
    throw new TypeError("yieldEveryMeshes must be a positive safe integer");
  }

  root.updateMatrixWorld(true);
  const hiddenLayers = collisionHiddenLayers(descriptor);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (isCollisionSourceEligible(object, root, hiddenLayers)) meshes.push(object);
  });
  const audit: CollisionRoleAudit = { autoSolid: [] };
  const output = {
    positions: [] as number[],
    indices: [] as number[],
    roles: [] as number[],
    profileIndices: [] as number[],
    surfaceKeys: [] as number[],
    sourceTriangleIds: [] as number[],
  };
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  let processed = 0;
  for (const mesh of meshes) {
    throwIfPackingAborted(options.signal);
    const resolution = resolveMapCollisionRole(
      mesh,
      descriptor.collisionMeshes,
      descriptor.surfaceProfiles,
      audit,
    );
    if (resolution.role === "solid") {
      if (mesh instanceof THREE.InstancedMesh) {
        for (let instance = 0; instance < mesh.count; instance += 1) {
          mesh.getMatrixAt(instance, instanceMatrix);
          worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
          appendMeshInstance(mesh, worldMatrix, options.resolvedHeightScale, output);
        }
      } else {
        appendMeshInstance(mesh, mesh.matrixWorld, options.resolvedHeightScale, output);
      }
    }
    processed += 1;
    if (processed % yieldEveryMeshes === 0) {
      await nextMacrotask();
      throwIfPackingAborted(options.signal);
    }
  }
  throwIfPackingAborted(options.signal);

  return Object.freeze({
    kind: "template",
    sourceId: options.sourceId,
    generation: options.generation,
    triangles: Object.freeze({
      positions: new Float32Array(output.positions),
      indices: new Uint32Array(output.indices),
      triangleRoles: new Uint8Array(output.roles),
      triangleProfileIndices: new Uint16Array(output.profileIndices),
      triangleSurfaceKeys: new Uint32Array(output.surfaceKeys),
      sourceTriangleIds: new Uint32Array(output.sourceTriangleIds),
    }),
    surfaceProfiles: BUILTIN_SURFACE_PROFILES,
    surfaceTransitionProfiles: BUILTIN_SURFACE_TRANSITIONS,
  });
}
