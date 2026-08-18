import type {
  PackedExplicitBoundarySource,
  SurfaceProfile,
  SurfaceTransitionProfile,
} from "./cityCollisionTypes.ts";

export const CITY_SURFACE_CHUNK_SIZE_METERS = 64;
export const CITY_SURFACE_CELL_SIZE_METERS = 1;
export const CITY_SURFACE_CELLS_PER_AXIS = 64;
export const THREE_MESH_BVH_WIRE_VERSION = 1;
export const THREE_MESH_BVH_PACKAGE_VERSION = "0.9.14";

export type CollisionIndexArray = Uint16Array | Uint32Array;

/**
 * Worker-safe geometry input. Every metadata array is indexed by source
 * triangle, before collision-role filtering.
 */
export type PackedTriangleCollisionSource = Readonly<{
  positions: Float32Array;
  indices: CollisionIndexArray;
  triangleRoles: Uint8Array;
  triangleProfileIndices: Uint16Array;
  triangleSurfaceKeys: Uint32Array;
  sourceTriangleIds: Uint32Array;
}>;

export type PackedCollisionCompileSource = Readonly<{
  kind: "road-chunk" | "template";
  sourceId: string;
  generation: number;
  triangles: PackedTriangleCollisionSource;
  surfaceProfiles: readonly SurfaceProfile[];
  surfaceTransitionProfiles: readonly SurfaceTransitionProfile[];
  /** Required for road chunks and for any source containing rideable triangles. */
  chunkX?: number;
  chunkZ?: number;
  chunkKey?: number;
  /** Must be exactly the 64 m chunk core. Geometry may include a topology halo. */
  coreBoundsXZ?: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  topologyHaloMeters?: number;
  explicitBoundaries?: PackedExplicitBoundarySource;
}>;

/** A vertical triangle represented without turning its triangular t/y section into a box. */
export type PackedVerticalWallFeatures = Readonly<{
  /** ax, az, bx, bz per feature. */
  segmentXZ: Float32Array;
  /** nx, nz per feature, preserving the source winding. */
  normalsXZ: Float32Array;
  /** t0, y0, t1, y1, t2, y2 per feature; t is metres from segment A. */
  triangleTY: Float32Array;
  sourceTriangleIds: Uint32Array;
  componentIds: Uint32Array;
}>;

/** 64 x 64 one-metre cells with CSR references into surface and boundary tables. */
export type PackedSurfaceChunk = Readonly<{
  chunkKey: number;
  chunkX: number;
  chunkZ: number;
  cellStart: Uint32Array;
  cellTriangleRefs: Uint32Array;
  cellBoundaryStart: Uint32Array;
  cellBoundaryRefs: Uint32Array;
  /** ax, az, bx, bz, cx, cz per surface triangle. */
  triangleXZ: Float32Array;
  /** nx, ny, nz, d per upward-oriented source plane. */
  trianglePlanes: Float32Array;
  /** minY, maxY per surface triangle. */
  triangleYRanges: Float32Array;
  triangleProfileIndices: Uint16Array;
  triangleSurfaceKeys: Uint32Array;
  triangleSourceIds: Uint32Array;
  /** Direct hot-path copy of the selected profile speed cap. */
  triangleSpeedCaps: Float32Array;
  boundaryXZ: Float32Array;
  boundaryTransitionProfileIndices: Uint16Array;
  boundaryGroupKeys: Uint32Array;
  boundarySurfaceKeyPairs: Uint32Array;
}>;

export type CollisionTypedArrayKind =
  | "f32"
  | "u8"
  | "u16"
  | "u32"
  | "i32";

export type CollisionTypedViewManifest = Readonly<{
  kind: CollisionTypedArrayKind;
  bufferIndex: number;
  byteOffset: number;
  length: number;
}>;

export type PackedVerticalWallManifest = Readonly<{
  segmentXZ: CollisionTypedViewManifest;
  normalsXZ: CollisionTypedViewManifest;
  triangleTY: CollisionTypedViewManifest;
  sourceTriangleIds: CollisionTypedViewManifest;
  componentIds: CollisionTypedViewManifest;
}>;

export type PackedSurfaceChunkManifest = Readonly<{
  chunkKey: number;
  chunkX: number;
  chunkZ: number;
  cellStart: CollisionTypedViewManifest;
  cellTriangleRefs: CollisionTypedViewManifest;
  cellBoundaryStart: CollisionTypedViewManifest;
  cellBoundaryRefs: CollisionTypedViewManifest;
  triangleXZ: CollisionTypedViewManifest;
  trianglePlanes: CollisionTypedViewManifest;
  triangleYRanges: CollisionTypedViewManifest;
  triangleProfileIndices: CollisionTypedViewManifest;
  triangleSurfaceKeys: CollisionTypedViewManifest;
  triangleSourceIds: CollisionTypedViewManifest;
  triangleSpeedCaps: CollisionTypedViewManifest;
  boundaryXZ: CollisionTypedViewManifest;
  boundaryTransitionProfileIndices: CollisionTypedViewManifest;
  boundaryGroupKeys: CollisionTypedViewManifest;
  boundarySurfaceKeyPairs: CollisionTypedViewManifest;
}>;

export type SerializedFallbackManifest = Readonly<{
  positions: CollisionTypedViewManifest;
  sourceTriangleIds: CollisionTypedViewManifest;
  componentIds: CollisionTypedViewManifest;
  bvh: Readonly<{
    version: number;
    rootBufferIndices: readonly number[];
    index: CollisionTypedViewManifest;
    /** Required: fallback BVHs are always built with indirect: true. */
    indirectBuffer: CollisionTypedViewManifest;
  }>;
}>;

/** IndexedDB- and postMessage-safe representation; buffers are compiler-owned. */
export type SerializedCollisionPayload = Readonly<{
  header: Readonly<{
    wireVersion: number;
    compilerVersion: number;
    meshBvhWireVersion: number;
    meshBvhPackageVersion: string;
    sourceId: string;
    generation: number;
    sourceHash: string;
    cacheKey: string;
  }>;
  buffers: ArrayBuffer[];
  manifest: Readonly<{
    walls: PackedVerticalWallManifest;
    surfaceChunk: PackedSurfaceChunkManifest | null;
    fallback: SerializedFallbackManifest | null;
  }>;
  surfaceProfiles: readonly SurfaceProfile[];
  surfaceTransitionProfiles: readonly SurfaceTransitionProfile[];
}>;

export type CollisionWorkerCommand =
  | Readonly<{
      type: "register";
      requestId: number;
      sourceId: string;
      generation: number;
      source: PackedCollisionCompileSource;
    }>
  | Readonly<{
      type: "compile";
      requestId: number;
      sourceId: string;
      generation: number;
      registrationToken: number;
    }>
  | Readonly<{
      type: "release";
      requestId: number;
      sourceId: string;
      generation: number;
      registrationToken: number;
    }>;

export type CollisionWorkerResult =
  | Readonly<{
      type: "registered";
      requestId: number;
      sourceId: string;
      generation: number;
      registrationToken: number;
      sourceHash: string;
      cacheKey: string;
    }>
  | Readonly<{
      type: "compiled";
      requestId: number;
      sourceId: string;
      generation: number;
      registrationToken: number;
      payload: SerializedCollisionPayload;
    }>
  | Readonly<{
      type: "released";
      requestId: number;
      sourceId: string;
      registrationToken: number;
    }>
  | Readonly<{
      type: "stale";
      requestId: number;
      sourceId: string;
      requestedGeneration: number;
      currentGeneration: number | null;
    }>
  | Readonly<{
      type: "error";
      requestId: number;
      message: string;
    }>;
