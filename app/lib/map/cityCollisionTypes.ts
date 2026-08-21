export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
      : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type MapCollisionRole = "solid" | "rideable-surface" | "ignore";
export type CollisionContainmentPolicy = "closed-required" | "open-allowed";
export type CanonicalKeyPart = string | number;

const encoder = new TextEncoder();
const floatBuffer = new ArrayBuffer(8);
const floatView = new DataView(floatBuffer);

export function canonicalFloat64Bits(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("canonical float must be finite");
  floatView.setFloat64(0, value, false);
  return floatView.getBigUint64(0, false).toString(16).padStart(16, "0");
}

/** Length-prefixed UTF-8 tuple encoding; never parse delimiter-joined user ids. */
export function canonicalTupleKey(parts: readonly CanonicalKeyPart[]): string {
  return parts.map((part) => {
    if (typeof part === "number") {
      if (!Number.isSafeInteger(part)) throw new TypeError("canonical numeric tuple parts must be safe integers");
      const text = String(part);
      return `i${text.length}:${text}`;
    }
    const bytes = encoder.encode(part);
    return `s${bytes.byteLength}:${part}`;
  }).join("");
}

export const CITY_SURFACE_CHUNK_COORD_MIN = -32768;
export const CITY_SURFACE_CHUNK_COORD_MAX = 32767;
const CITY_SURFACE_CHUNK_AXIS = 65536;

function assertChunkCoordinate(value: number, label: string) {
  if (!Number.isInteger(value)
    || value < CITY_SURFACE_CHUNK_COORD_MIN
    || value > CITY_SURFACE_CHUNK_COORD_MAX) {
    throw new RangeError(`${label} must be an integer in [-32768, 32767]`);
  }
}

export function citySurfaceChunkKey(chunkX: number, chunkZ: number): number {
  assertChunkCoordinate(chunkX, "chunkX");
  assertChunkCoordinate(chunkZ, "chunkZ");
  return (chunkX - CITY_SURFACE_CHUNK_COORD_MIN) * CITY_SURFACE_CHUNK_AXIS
    + (chunkZ - CITY_SURFACE_CHUNK_COORD_MIN);
}

export function decodeCitySurfaceChunkKey(key: number): readonly [number, number] {
  if (!Number.isSafeInteger(key) || key < 0 || key >= CITY_SURFACE_CHUNK_AXIS ** 2) {
    throw new RangeError("invalid city surface chunk key");
  }
  const x = Math.floor(key / CITY_SURFACE_CHUNK_AXIS) + CITY_SURFACE_CHUNK_COORD_MIN;
  const z = key % CITY_SURFACE_CHUNK_AXIS + CITY_SURFACE_CHUNK_COORD_MIN;
  return Object.freeze([x, z] as const);
}

export type SurfaceProfileFamily =
  | "ground"
  | "asphalt"
  | "bike-lane"
  | "driveway"
  | "ramp"
  | "sidewalk"
  | "site-surface";

export type SurfaceProfile = Readonly<{
  id: string;
  family: SurfaceProfileFamily;
  speedCap: number;
  maxSlopeDegrees: number;
  selectionPriority: number;
}>;

export const BUILTIN_SURFACE_PROFILES: readonly SurfaceProfile[] = Object.freeze([
  Object.freeze({ id: "implicit-ground", family: "ground", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 0 }),
  Object.freeze({ id: "ground", family: "ground", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 10 }),
  Object.freeze({ id: "asphalt", family: "asphalt", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 40 }),
  Object.freeze({ id: "bike-lane", family: "bike-lane", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 50 }),
  Object.freeze({ id: "driveway", family: "driveway", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 60 }),
  Object.freeze({ id: "ramp", family: "ramp", speedCap: 12, maxSlopeDegrees: 30, selectionPriority: 60 }),
  Object.freeze({ id: "sidewalk", family: "sidewalk", speedCap: 12, maxSlopeDegrees: 30, selectionPriority: 50 }),
  Object.freeze({ id: "site-surface", family: "site-surface", speedCap: Infinity, maxSlopeDegrees: 30, selectionPriority: 30 }),
]);

const profileById = new Map(BUILTIN_SURFACE_PROFILES.map((profile) => [profile.id, profile]));

export function getBuiltinSurfaceProfile(id: string): SurfaceProfile | undefined {
  return profileById.get(id);
}

export type SurfaceTransitionProfile =
  | Readonly<{ id: string; kind: "smooth" }>
  | Readonly<{ id: string; kind: "blocked-step" }>
  | Readonly<{
      id: string;
      kind: "road-curb";
      maxStepUpMeters: number;
      maxStepDownMeters: number;
      bumpProfile: "curb-strong";
    }>;

export const BUILTIN_SURFACE_TRANSITIONS: readonly SurfaceTransitionProfile[] = Object.freeze([
  Object.freeze({ id: "smooth", kind: "smooth" }),
  Object.freeze({ id: "blocked-step", kind: "blocked-step" }),
  Object.freeze({
    id: "road-curb",
    kind: "road-curb",
    maxStepUpMeters: 0.30,
    maxStepDownMeters: 0.30,
    bumpProfile: "curb-strong",
  }),
]);

export type TemplateEntrancePortSource = Readonly<{
  entranceId: string;
  localSurfaceKey: number;
  localSegmentXZ: readonly [ax: number, az: number, bx: number, bz: number];
  localOutwardXZ: readonly [x: number, z: number];
}>;

export type TemplateEntrancePortRecord = TemplateEntrancePortSource & Readonly<{
  localBoundaryGroupKey: number;
  localPlane: readonly [nx: number, ny: number, nz: number, d: number];
  surfaceProfileId: string;
}>;

export type RoadSurfaceHandleRecord = Readonly<{
  localSurfaceKey: number;
  roadSurfaceId: string;
}>;

export type RoadBoundaryHandleRecord =
  | Readonly<{
      kind: "road";
      localBoundaryGroupKey: number;
      roadEdgeId: string;
      side: "left" | "right";
      curbRun: number;
    }>
  | Readonly<{
      kind: "owner-local";
      localBoundaryGroupKey: number;
    }>;

export type RoadEntrancePortSource = Readonly<{
  placementId: string;
  entranceId: string;
  localSurfaceKey: number;
  worldSegmentXZ: readonly [ax: number, az: number, bx: number, bz: number];
  worldOutwardXZ: readonly [x: number, z: number];
}>;

export type RoadEntrancePortHandleRecord = RoadEntrancePortSource & Readonly<{
  localBoundaryGroupKey: number;
  worldPlane: readonly [nx: number, ny: number, nz: number, d: number];
  surfaceProfileId: string;
  roadSurfaceId: string;
  chunkX: number;
  chunkZ: number;
}>;

export type PackedExplicitBoundarySource = Readonly<{
  boundaryXZ: Float32Array;
  boundaryTransitionProfileIndices: Uint16Array;
  boundaryGroupKeys: Uint32Array;
  boundarySurfaceKeyPairs: Uint32Array;
}>;

export type RuntimeSurfaceHandle =
  | Readonly<{ kind: "implicit-ground"; worldId: number; documentGeneration: number }>
  | Readonly<{
      kind: "owner-local";
      worldId: number;
      ownerId: string;
      ownerGeneration: number;
      localSurfaceKey: number;
    }>
  | Readonly<{
      kind: "road";
      worldId: number;
      documentGeneration: number;
      roadSurfaceId: string;
    }>;

export type RuntimeBoundaryHandle =
  | Readonly<{
      kind: "owner-local";
      worldId: number;
      ownerId: string;
      ownerGeneration: number;
      localBoundaryGroupKey: number;
    }>
  | Readonly<{
      kind: "road";
      worldId: number;
      documentGeneration: number;
      roadEdgeId: string;
      side: "left" | "right";
      curbRun: number;
    }>
  | Readonly<{
      kind: "surface-stitch";
      worldId: number;
      documentGeneration: number;
      stitchId: string;
      groupId: string;
    }>;

export type SurfaceSampleQuery = Readonly<{
  currentY: number;
  previousHandle: RuntimeSurfaceHandle | null;
  maxStepUpMeters: number;
}>;

/** Mutable hot-path output. Callers keep two buffers and alternate them. */
export type SurfaceSampleOut = {
  handle: RuntimeSurfaceHandle;
  profileId: string;
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  gx: number;
  gz: number;
  speedCap: number;
};

export type RuntimeContactHandle = Readonly<{
  worldId: number;
  ownerId: string;
  ownerGeneration: number;
  primitiveKind: "wall" | "triangle";
  featureKind: "segment" | "face" | "edge" | "vertex";
  canonicalFeatureId: number;
}>;

export type CityMoveRequest = Readonly<{
  startX: number;
  startZ: number;
  microDtSeconds: number;
  /** The only authoritative translation state for this microstep. */
  velocityX: number;
  velocityZ: number;
  motionSign: -1 | 0 | 1;
  bodyHeading: number;
  drifting: boolean;
  startSurface: Readonly<SurfaceSampleOut>;
}>;

export type CitySurfaceTransitionEventOut = {
  kind: "none" | "smooth" | "road-curb";
  boundaryHandle: RuntimeBoundaryHandle | null;
  fromSurface: RuntimeSurfaceHandle;
  toSurface: RuntimeSurfaceHandle;
  stepDeltaY: number;
  bumpStrength: number;
};

export type CityImpactEventOut = {
  kind: "none" | "contact-begin";
  contact: RuntimeContactHandle | null;
  normalX: number;
  normalZ: number;
  normalImpactSpeed: number;
};

/** Mutable hot-path output. It must not alias request.startSurface. */
export type CityMoveResult = {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  motionSign: -1 | 0 | 1;
  bodyHeading: number;
  drifting: boolean;
  surface: SurfaceSampleOut;
  transitionCount: number;
  transitionEvents: [CitySurfaceTransitionEventOut, CitySurfaceTransitionEventOut];
  impactCount: number;
  impactEvents: [CityImpactEventOut, CityImpactEventOut, CityImpactEventOut, CityImpactEventOut];
  hitLimitReached: boolean;
};

export type CityPoseRecoveryRequest = Readonly<{
  x: number;
  z: number;
  currentY: number;
  reason: "play-enter" | "teleport" | "owner-generation-commit" | "undo-redo";
  safeFrameX: number;
  safeFrameZ: number;
}>;

export type CityPoseRecoveryResult = {
  x: number;
  z: number;
  surface: SurfaceSampleOut;
  status: "unchanged" | "depenetrated" | "nearest-rideable" | "safe-frame";
  resetMotion: boolean;
};

export const BIKE_COLLISION_RADIUS_METERS = 0.55;
export const BIKE_COLLISION_HEIGHT_METERS = 2.40;
export const CITY_PHYSICS_FIXED_DT_SECONDS = 1 / 120;
export const CITY_PHYSICS_MAX_CATCH_UP_STEPS = 6;
export const CITY_COLLISION_MAX_TRANSLATION_PER_MICROSTEP_METERS = 0.25;
export const CITY_COLLIDE_AND_SLIDE_MAX_HITS = 4;
export const CITY_DEPENETRATION_MAX_ITERS = 4;
export const CITY_SURFACE_TRANSITIONS_MAX_PER_MICROSTEP = 2;
/** Shared arcade response values; the legacy forest solver migrates to these when live wiring lands. */
export const ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR = 0.75;
export const ARCADE_STRONG_IMPACT_SPEED_METERS_PER_SECOND = 0.6;
export const COLLISION_WIRE_VERSION = 1;
export const COLLISION_COMPILER_VERSION = 1;
export const VERTICAL_PLANE_EPSILON = 1e-5;
/** Near-horizontal solid faces stay available to containment but do not push XZ. */
export const CITY_SOLID_HORIZONTAL_RESPONSE_MIN_NORMAL_XZ = 0.8;
export const COLLISION_SKIN_METERS = 0.002;
export const TOI_DISTANCE_EPS_METERS = 0.001;
export const CONTACT_NORMAL_MERGE_COS = 0.99862953475;
export const CURB_HEIGHT_METERS = 0.24;
export const MAX_CROSSABLE_SURFACE_STEP_METERS = 0.30;
export const SURFACE_CONTINUITY_EPS_METERS = 0.01;
export const SURFACE_BOUNDARY_PROBE_EPS_METERS = 0.002;
export const IMPLICIT_GROUND_SURFACE_KEY = 0xfffffffe;
export const NO_SURFACE_KEY = 0xffffffff;
export const SURFACE_PROFILE_INDEX_NONE = 0xffff;
export const CURB_BUMP_MIN_STEP_METERS = 0.08;
export const CURB_BUMP_REFERENCE_STEP_METERS = 0.24;
export const CURB_BUMP_REARM_DISTANCE_METERS = 0.10;
export const CURB_BUMP_PRESENTATION_Y_METERS = 0.12;
export const CURB_BUMP_PRESENTATION_PITCH_RADIANS = 0.10;
export const CURB_BUMP_DURATION_SECONDS = 0.22;
export const COLLISION_FRAME_P95_BUDGET_MS = 2;

export const PackedCollisionRoleCode = Object.freeze({
  Ignore: 0,
  Solid: 1,
  RideableSurface: 2,
} as const);
