import {
  CURB_BUMP_MIN_STEP_METERS,
  CURB_BUMP_REFERENCE_STEP_METERS,
  MAX_CROSSABLE_SURFACE_STEP_METERS,
  SURFACE_BOUNDARY_PROBE_EPS_METERS,
  getBuiltinSurfaceProfile,
} from "./cityCollisionTypes.ts";
import type {
  RuntimeBoundaryHandle,
  RuntimeSurfaceHandle,
  SurfaceSampleOut,
  SurfaceSampleQuery,
} from "./cityCollisionTypes.ts";
import type {
  DerivedRoadBoundary,
  DerivedRoadCollisionSources,
  DerivedRoadSurface,
} from "./cityRoads.ts";

const GEOMETRY_EPSILON = 1e-8;

export type SurfaceBoundaryCrossing = Readonly<{
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

function pointInConvexQuad(surface: Readonly<DerivedRoadSurface>, x: number, z: number) {
  const q = surface.quadXZ;
  const points = [
    [q[0], q[1]],
    [q[2], q[3]],
    [q[4], q[5]],
    [q[6], q[7]],
  ];
  let positive = false;
  let negative = false;
  for (let index = 0; index < 4; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % 4];
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross > GEOMETRY_EPSILON) positive = true;
    if (cross < -GEOMETRY_EPSILON) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

function triangleHeight(
  x: number,
  z: number,
  ax: number,
  az: number,
  ay: number,
  bx: number,
  bz: number,
  by: number,
  cx: number,
  cz: number,
  cy: number,
) {
  const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return null;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
  const w = 1 - u - v;
  if (u < -GEOMETRY_EPSILON || v < -GEOMETRY_EPSILON || w < -GEOMETRY_EPSILON) return null;
  return u * ay + v * by + w * cy;
}

function surfaceHeightAt(surface: Readonly<DerivedRoadSurface>, x: number, z: number) {
  const heights = surface.cornerY;
  if (!heights) return surface.y;
  const q = surface.quadXZ;
  return triangleHeight(x, z, q[0], q[1], heights[0], q[2], q[3], heights[1], q[4], q[5], heights[2])
    ?? triangleHeight(x, z, q[0], q[1], heights[0], q[4], q[5], heights[2], q[6], q[7], heights[3])
    ?? surface.y;
}

function segmentIntersectionFraction(
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
  boundary: Readonly<DerivedRoadBoundary>,
) {
  const [ax, az, bx, bz] = boundary.segmentXZ;
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

function copyHandle(handle: RuntimeSurfaceHandle): RuntimeSurfaceHandle {
  return Object.freeze({ ...handle }) as RuntimeSurfaceHandle;
}

/** Packed-surface semantics over the PR4 high-level source fixtures. */
export class CitySurfaceIndex {
  private readonly surfaces: readonly DerivedRoadSurface[];
  private readonly drivewaySurfaces: readonly DerivedRoadSurface[];
  private readonly boundaries: readonly DerivedRoadBoundary[];
  private readonly surfaceByKey: ReadonlyMap<number, DerivedRoadSurface>;
  readonly worldId: number;
  readonly documentGeneration: number;

  constructor(
    sources: Readonly<DerivedRoadCollisionSources>,
    worldId: number,
    documentGeneration: number,
  ) {
    this.worldId = worldId;
    this.documentGeneration = documentGeneration;
    this.surfaces = sources.surfaces;
    this.drivewaySurfaces = sources.surfaces.filter((surface) => surface.surfaceProfileId === "driveway");
    this.boundaries = sources.boundaries;
    this.surfaceByKey = new Map(sources.surfaces.map((surface) => [surface.localSurfaceKey, surface]));
  }

  implicitGroundHandle(): RuntimeSurfaceHandle {
    return Object.freeze({ kind: "implicit-ground", worldId: this.worldId, documentGeneration: this.documentGeneration });
  }

  private handle(surface: Readonly<DerivedRoadSurface>): RuntimeSurfaceHandle {
    return Object.freeze({
      kind: "road",
      worldId: this.worldId,
      documentGeneration: this.documentGeneration,
      roadSurfaceId: surface.roadSurfaceId,
    });
  }

  private fill(
    out: SurfaceSampleOut,
    surface: Readonly<DerivedRoadSurface> | null,
    x: number,
    z: number,
  ): SurfaceSampleOut {
    if (!surface) {
      out.handle = this.implicitGroundHandle();
      out.profileId = "implicit-ground";
      out.height = 0;
      out.normalX = 0;
      out.normalY = 1;
      out.normalZ = 0;
      out.gx = 0;
      out.gz = 0;
      out.speedCap = Infinity;
      return out;
    }
    const profile = getBuiltinSurfaceProfile(surface.surfaceProfileId);
    if (!profile) throw new Error(`unknown surface profile: ${surface.surfaceProfileId}`);
    out.handle = this.handle(surface);
    out.profileId = surface.surfaceProfileId;
    out.height = surfaceHeightAt(surface, x, z);
    if (surface.cornerY) {
      const q = surface.quadXZ;
      const h = surface.cornerY;
      const ux = q[2] - q[0];
      const uz = q[3] - q[1];
      const uy = h[1] - h[0];
      const vx = q[6] - q[0];
      const vz = q[7] - q[1];
      const vy = h[3] - h[0];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      const up = ny < 0 ? -1 : 1;
      out.normalX = nx / length * up;
      out.normalY = ny / length * up;
      out.normalZ = nz / length * up;
      out.gx = -out.normalX / Math.max(out.normalY, GEOMETRY_EPSILON);
      out.gz = -out.normalZ / Math.max(out.normalY, GEOMETRY_EPSILON);
    } else {
      out.normalX = 0;
      out.normalY = 1;
      out.normalZ = 0;
      out.gx = 0;
      out.gz = 0;
    }
    out.speedCap = profile.speedCap;
    return out;
  }

  sampleCitySurface(
    x: number,
    z: number,
    query: Readonly<SurfaceSampleQuery>,
    out: SurfaceSampleOut,
  ): SurfaceSampleOut {
    const candidates = this.surfaces.filter((surface) => pointInConvexQuad(surface, x, z));
    const previousHandle = query.previousHandle;
    if (previousHandle?.kind === "road") {
      const previous = candidates.find((surface) => surface.roadSurfaceId === previousHandle.roadSurfaceId);
      if (previous) return this.fill(out, previous, x, z);
    }
    const reachable = candidates
      .filter((surface) => surfaceHeightAt(surface, x, z)
        <= query.currentY + query.maxStepUpMeters + GEOMETRY_EPSILON)
      .sort((left, right) => {
        const leftHeight = surfaceHeightAt(left, x, z);
        const rightHeight = surfaceHeightAt(right, x, z);
        if (leftHeight !== rightHeight) return rightHeight - leftHeight;
        const leftPriority = getBuiltinSurfaceProfile(left.surfaceProfileId)?.selectionPriority ?? 0;
        const rightPriority = getBuiltinSurfaceProfile(right.surfaceProfileId)?.selectionPriority ?? 0;
        return rightPriority - leftPriority || left.roadSurfaceId.localeCompare(right.roadSurfaceId);
      });
    return this.fill(out, reachable[0] ?? null, x, z);
  }

  findEarliestBoundaryCrossing(
    startX: number,
    startZ: number,
    deltaX: number,
    deltaZ: number,
    current: Readonly<SurfaceSampleOut>,
  ): SurfaceBoundaryCrossing | null {
    const movementLength = Math.hypot(deltaX, deltaZ);
    if (movementLength <= GEOMETRY_EPSILON) return null;
    const hits: Array<{ boundary: DerivedRoadBoundary; fraction: number }> = [];
    for (const boundary of this.boundaries) {
      const fraction = segmentIntersectionFraction(startX, startZ, deltaX, deltaZ, boundary);
      if (fraction !== null) hits.push({ boundary, fraction });
    }
    hits.sort((left, right) => left.fraction - right.fraction || left.boundary.groupKey - right.boundary.groupKey);
    for (const { boundary, fraction } of hits) {
      const crossingX = startX + deltaX * fraction;
      const crossingZ = startZ + deltaZ * fraction;
      const [ax, az, bx, bz] = boundary.segmentXZ;
      const probeFraction = Math.min(1, fraction + SURFACE_BOUNDARY_PROBE_EPS_METERS / movementLength);
      const probeX = startX + deltaX * probeFraction;
      const probeZ = startZ + deltaZ * probeFraction;
      const currentRoadSurfaceId = current.handle.kind === "road"
        ? current.handle.roadSurfaceId
        : null;
      const drivewayMasksCurb = this.drivewaySurfaces.some((surface) =>
        pointInConvexQuad(surface, crossingX, crossingZ)
        && (surface.roadSurfaceId === currentRoadSurfaceId
          || pointInConvexQuad(surface, probeX, probeZ)));
      if (drivewayMasksCurb) continue;
      const cross = (bx - ax) * (probeZ - az) - (bz - az) * (probeX - ax);
      const targetKey = cross >= 0 ? boundary.leftSurfaceKey : boundary.rightSurfaceKey;
      const target = this.surfaceByKey.get(targetKey) ?? null;
      const toHeight = target ? surfaceHeightAt(target, probeX, probeZ) : 0;
      const stepDelta = toHeight - current.height;
      if (Math.abs(stepDelta) > MAX_CROSSABLE_SURFACE_STEP_METERS + GEOMETRY_EPSILON) continue;
      const toProfile = target ? getBuiltinSurfaceProfile(target.surfaceProfileId) : getBuiltinSurfaceProfile("implicit-ground");
      if (!toProfile) throw new Error("missing built-in surface profile");
      const bumpStrength = Math.abs(stepDelta) < CURB_BUMP_MIN_STEP_METERS
        ? 0
        : Math.min(1, Math.abs(stepDelta) / CURB_BUMP_REFERENCE_STEP_METERS);
      return Object.freeze({
        distance: fraction * movementLength,
        fraction,
        x: crossingX,
        z: crossingZ,
        handle: Object.freeze({
          kind: "road",
          worldId: this.worldId,
          documentGeneration: this.documentGeneration,
          roadEdgeId: boundary.edgeId,
          side: boundary.side,
          curbRun: boundary.curbRun,
        }),
        fromSurface: copyHandle(current.handle),
        toSurface: target ? this.handle(target) : this.implicitGroundHandle(),
        fromHeight: current.height,
        toHeight,
        toProfileId: target?.surfaceProfileId ?? "implicit-ground",
        toSpeedCap: toProfile.speedCap,
        kind: "road-curb",
        bumpStrength,
      });
    }
    return null;
  }
}
