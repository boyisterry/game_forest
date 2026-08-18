import * as THREE from "three";
import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
} from "./cityCollisionTypes.ts";
import {
  resolveMapCollisionRole,
  type CollisionRoleAudit,
  type TemplateBuildDescriptorSnapshot,
} from "./cityCatalog.ts";
import type { PackedCollisionCompileSource } from "./cityCollisionWire.ts";

export type TemplateCollisionPackOptions = Readonly<{
  sourceId: string;
  generation: number;
  resolvedHeightScale: number;
  signal?: AbortSignal;
  /** Keeps the main thread responsive while a heavy campus is copied. */
  yieldEveryMeshes?: number;
}>;

const DEFAULT_YIELD_EVERY_MESHES = 24;

function isEffectivelyVisible(object: THREE.Object3D, root: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
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
    output.indices.push(
      vertexOffset + (sourceIndex?.getX(offset) ?? offset),
      vertexOffset + (sourceIndex?.getX(offset + 1) ?? offset + 1),
      vertexOffset + (sourceIndex?.getX(offset + 2) ?? offset + 2),
    );
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
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && isEffectivelyVisible(object, root)) meshes.push(object);
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
