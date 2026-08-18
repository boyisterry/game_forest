import {
  ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR,
  ARCADE_STRONG_IMPACT_SPEED_METERS_PER_SECOND,
  BIKE_COLLISION_HEIGHT_METERS,
  BIKE_COLLISION_RADIUS_METERS,
  CITY_COLLIDE_AND_SLIDE_MAX_HITS,
  CITY_DEPENETRATION_MAX_ITERS,
  COLLISION_SKIN_METERS,
  CONTACT_NORMAL_MERGE_COS,
  TOI_DISTANCE_EPS_METERS,
  canonicalTupleKey,
  type CityImpactEventOut,
  type CityMoveRequest,
  type CityMoveResult,
  type CitySurfaceTransitionEventOut,
  type RuntimeContactHandle,
  type RuntimeSurfaceHandle,
  type SurfaceSampleOut,
  type SurfaceSampleQuery,
} from "./cityCollisionTypes.ts";

const VECTOR_EPSILON = 1e-10;
const utf8Encoder = new TextEncoder();

export type AnalyticExtrudedWallSegment = Readonly<{
  ownerId: string;
  ownerGeneration: number;
  canonicalSegmentId: number;
  canonicalVertexAId: number;
  canonicalVertexBId: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  minY: number;
  maxY: number;
  /** Stable compiler normal. Sweep remains double-sided; this resolves exact overlap ties. */
  nx: number;
  nz: number;
}>;

type CompiledWall = AnalyticExtrudedWallSegment & Readonly<{
  dx: number;
  dz: number;
  length: number;
  tx: number;
  tz: number;
}>;

type ContactFeature = "segment" | "vertex";

type SweepHit = Readonly<{
  wall: CompiledWall;
  featureKind: ContactFeature;
  canonicalFeatureId: number;
  toi: number;
  distance: number;
  normalX: number;
  normalZ: number;
}>;

type Constraint = { normalX: number; normalZ: number };

type PersistentContact = Readonly<{
  key: string;
  handle: RuntimeContactHandle;
  wall: CompiledWall;
  featureKind: ContactFeature;
  canonicalFeatureId: number;
  normalX: number;
  normalZ: number;
}>;

let nextAnalyticWorldId = 1;

function compareUtf8(left: string, right: string): number {
  if (left === right) return 0;
  const a = utf8Encoder.encode(left);
  const b = utf8Encoder.encode(right);
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function compareWalls(left: CompiledWall, right: CompiledWall): number {
  return compareUtf8(left.ownerId, right.ownerId)
    || left.ownerGeneration - right.ownerGeneration
    || left.canonicalSegmentId - right.canonicalSegmentId;
}

function compareHits(left: SweepHit, right: SweepHit): number {
  return compareUtf8(left.wall.ownerId, right.wall.ownerId)
    || left.wall.ownerGeneration - right.wall.ownerGeneration
    || compareUtf8(left.featureKind, right.featureKind)
    || left.canonicalFeatureId - right.canonicalFeatureId
    || left.wall.canonicalSegmentId - right.wall.canonicalSegmentId;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function assertSafeId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function compileWall(source: AnalyticExtrudedWallSegment): CompiledWall {
  if (!source.ownerId) throw new TypeError("wall ownerId must not be empty");
  assertSafeId(source.ownerGeneration, "wall ownerGeneration");
  assertSafeId(source.canonicalSegmentId, "wall canonicalSegmentId");
  assertSafeId(source.canonicalVertexAId, "wall canonicalVertexAId");
  assertSafeId(source.canonicalVertexBId, "wall canonicalVertexBId");
  for (const [label, value] of Object.entries({
    ax: source.ax,
    az: source.az,
    bx: source.bx,
    bz: source.bz,
    minY: source.minY,
    maxY: source.maxY,
    nx: source.nx,
    nz: source.nz,
  })) {
    assertFinite(value, `wall ${label}`);
  }
  if (source.maxY < source.minY) throw new RangeError("wall maxY must be >= minY");
  const dx = source.bx - source.ax;
  const dz = source.bz - source.az;
  const length = Math.hypot(dx, dz);
  if (length <= VECTOR_EPSILON) throw new RangeError("wall segment must have non-zero XZ length");
  const normalLength = Math.hypot(source.nx, source.nz);
  if (normalLength <= VECTOR_EPSILON) throw new RangeError("wall normal must have non-zero XZ length");
  const tx = dx / length;
  const tz = dz / length;
  const nx = source.nx / normalLength;
  const nz = source.nz / normalLength;
  if (Math.abs(tx * nx + tz * nz) > 1e-5) {
    throw new RangeError("wall normal must be perpendicular to the segment");
  }
  return Object.freeze({ ...source, nx, nz, dx, dz, length, tx, tz });
}

function cloneSurfaceHandle(handle: RuntimeSurfaceHandle): RuntimeSurfaceHandle {
  switch (handle.kind) {
    case "implicit-ground":
      return { kind: handle.kind, worldId: handle.worldId, documentGeneration: handle.documentGeneration };
    case "owner-local":
      return {
        kind: handle.kind,
        worldId: handle.worldId,
        ownerId: handle.ownerId,
        ownerGeneration: handle.ownerGeneration,
        localSurfaceKey: handle.localSurfaceKey,
      };
    case "road":
      return {
        kind: handle.kind,
        worldId: handle.worldId,
        documentGeneration: handle.documentGeneration,
        roadSurfaceId: handle.roadSurfaceId,
      };
  }
}

export function copySurfaceSample(target: SurfaceSampleOut, source: Readonly<SurfaceSampleOut>): SurfaceSampleOut {
  target.handle = cloneSurfaceHandle(source.handle);
  target.profileId = source.profileId;
  target.height = source.height;
  target.normalX = source.normalX;
  target.normalY = source.normalY;
  target.normalZ = source.normalZ;
  target.gx = source.gx;
  target.gz = source.gz;
  target.speedCap = source.speedCap;
  return target;
}

export function createImplicitGroundSurfaceSample(
  worldId = 0,
  documentGeneration = 0,
): SurfaceSampleOut {
  return {
    handle: { kind: "implicit-ground", worldId, documentGeneration },
    profileId: "implicit-ground",
    height: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    gx: 0,
    gz: 0,
    speedCap: Infinity,
  };
}

function createTransitionEvent(worldId: number, documentGeneration: number): CitySurfaceTransitionEventOut {
  return {
    kind: "none",
    boundaryHandle: null,
    fromSurface: { kind: "implicit-ground", worldId, documentGeneration },
    toSurface: { kind: "implicit-ground", worldId, documentGeneration },
    stepDeltaY: 0,
    bumpStrength: 0,
  };
}

function createImpactEvent(): CityImpactEventOut {
  return {
    kind: "none",
    contact: null,
    normalX: 0,
    normalZ: 0,
    normalImpactSpeed: 0,
  };
}

export function createCityMoveResultBuffer(
  worldId = 0,
  documentGeneration = 0,
): CityMoveResult {
  return {
    x: 0,
    z: 0,
    velocityX: 0,
    velocityZ: 0,
    motionSign: 0,
    bodyHeading: 0,
    drifting: false,
    surface: createImplicitGroundSurfaceSample(worldId, documentGeneration),
    transitionCount: 0,
    transitionEvents: [
      createTransitionEvent(worldId, documentGeneration),
      createTransitionEvent(worldId, documentGeneration),
    ],
    impactCount: 0,
    impactEvents: [createImpactEvent(), createImpactEvent(), createImpactEvent(), createImpactEvent()],
    hitLimitReached: false,
  };
}

function resetImpactEvent(event: CityImpactEventOut): void {
  event.kind = "none";
  event.contact = null;
  event.normalX = 0;
  event.normalZ = 0;
  event.normalImpactSpeed = 0;
}

function resetTransitionEvent(event: CitySurfaceTransitionEventOut): void {
  event.kind = "none";
  event.boundaryHandle = null;
  event.stepDeltaY = 0;
  event.bumpStrength = 0;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function closestPointOnWall(wall: CompiledWall, x: number, z: number): {
  x: number;
  z: number;
  along: number;
} {
  const along = Math.max(0, Math.min(wall.length, (x - wall.ax) * wall.tx + (z - wall.az) * wall.tz));
  return { x: wall.ax + wall.tx * along, z: wall.az + wall.tz * along, along };
}

function wallOverlapsBand(wall: CompiledWall, minY: number, maxY: number): boolean {
  return wall.maxY > minY + VECTOR_EPSILON && wall.minY < maxY - VECTOR_EPSILON;
}

function addSideHits(
  hits: SweepHit[],
  wall: CompiledWall,
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
  radius: number,
  moveLength: number,
): void {
  for (const sign of [-1, 1] as const) {
    const normalX = wall.nx * sign;
    const normalZ = wall.nz * sign;
    const inwardDelta = deltaX * normalX + deltaZ * normalZ;
    if (inwardDelta >= -VECTOR_EPSILON) continue;
    const startDistance = (startX - wall.ax) * normalX + (startZ - wall.az) * normalZ;
    const rawToi = (radius - startDistance) / inwardDelta;
    const timeEpsilon = TOI_DISTANCE_EPS_METERS / moveLength;
    if (rawToi < -timeEpsilon || rawToi > 1 + timeEpsilon) continue;
    const toi = clamp01(rawToi);
    const contactX = startX + deltaX * toi;
    const contactZ = startZ + deltaZ * toi;
    const along = (contactX - wall.ax) * wall.tx + (contactZ - wall.az) * wall.tz;
    // Endpoint ownership is explicit, avoiding a side/vertex feature flip at exact endpoints.
    if (along <= VECTOR_EPSILON || along >= wall.length - VECTOR_EPSILON) continue;
    hits.push({
      wall,
      featureKind: "segment",
      canonicalFeatureId: wall.canonicalSegmentId,
      toi,
      distance: toi * moveLength,
      normalX,
      normalZ,
    });
  }
}

function addVertexHit(
  hits: SweepHit[],
  wall: CompiledWall,
  vertexX: number,
  vertexZ: number,
  canonicalFeatureId: number,
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
  radius: number,
  moveLength: number,
): void {
  const mx = startX - vertexX;
  const mz = startZ - vertexZ;
  const quadraticA = deltaX * deltaX + deltaZ * deltaZ;
  const quadraticB = 2 * (mx * deltaX + mz * deltaZ);
  const quadraticC = mx * mx + mz * mz - radius * radius;
  if (quadraticC < -TOI_DISTANCE_EPS_METERS * radius) return;
  let discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
  const discriminantEpsilon = 1e-12 * Math.max(1, quadraticB * quadraticB, 4 * quadraticA * Math.abs(quadraticC));
  if (discriminant < -discriminantEpsilon) return;
  discriminant = Math.max(0, discriminant);
  const squareRoot = Math.sqrt(discriminant);
  const roots = [
    (-quadraticB - squareRoot) / (2 * quadraticA),
    (-quadraticB + squareRoot) / (2 * quadraticA),
  ];
  const timeEpsilon = TOI_DISTANCE_EPS_METERS / moveLength;
  for (const rawToi of roots) {
    if (rawToi < -timeEpsilon || rawToi > 1 + timeEpsilon) continue;
    const toi = clamp01(rawToi);
    const contactX = startX + deltaX * toi;
    const contactZ = startZ + deltaZ * toi;
    const normalLength = Math.hypot(contactX - vertexX, contactZ - vertexZ);
    if (normalLength <= VECTOR_EPSILON) continue;
    const normalX = (contactX - vertexX) / normalLength;
    const normalZ = (contactZ - vertexZ) / normalLength;
    if (deltaX * normalX + deltaZ * normalZ >= -VECTOR_EPSILON) continue;
    hits.push({
      wall,
      featureKind: "vertex",
      canonicalFeatureId,
      toi,
      distance: toi * moveLength,
      normalX,
      normalZ,
    });
    return;
  }
}

function addConstraint(constraints: Constraint[], normalX: number, normalZ: number): void {
  for (const constraint of constraints) {
    if (constraint.normalX * normalX + constraint.normalZ * normalZ >= CONTACT_NORMAL_MERGE_COS) return;
  }
  constraints.push({ normalX, normalZ });
}

function projectVector(
  x: number,
  z: number,
  constraints: readonly Constraint[],
): { x: number; z: number } {
  let projectedX = x;
  let projectedZ = z;
  // Revisit earlier planes because projecting against a later plane can violate one.
  for (let iteration = 0; iteration <= constraints.length; iteration += 1) {
    let changed = false;
    for (const constraint of constraints) {
      const inward = projectedX * constraint.normalX + projectedZ * constraint.normalZ;
      if (inward < -VECTOR_EPSILON) {
        projectedX -= constraint.normalX * inward;
        projectedZ -= constraint.normalZ * inward;
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (Math.hypot(projectedX, projectedZ) <= VECTOR_EPSILON) return { x: 0, z: 0 };
  return { x: projectedX, z: projectedZ };
}

function contactKey(worldId: number, hit: SweepHit): string {
  return canonicalTupleKey([
    worldId,
    "wall",
    hit.wall.ownerId,
    hit.wall.ownerGeneration,
    hit.featureKind,
    hit.canonicalFeatureId,
  ]);
}

function persistentContact(worldId: number, hit: SweepHit): PersistentContact {
  const handle: RuntimeContactHandle = {
    worldId,
    ownerId: hit.wall.ownerId,
    ownerGeneration: hit.wall.ownerGeneration,
    primitiveKind: "wall",
    featureKind: hit.featureKind,
    canonicalFeatureId: hit.canonicalFeatureId,
  };
  return {
    key: contactKey(worldId, hit),
    handle,
    wall: hit.wall,
    featureKind: hit.featureKind,
    canonicalFeatureId: hit.canonicalFeatureId,
    normalX: hit.normalX,
    normalZ: hit.normalZ,
  };
}

function contactDistance(contact: PersistentContact, x: number, z: number): number {
  if (contact.featureKind === "vertex") {
    const isA = contact.canonicalFeatureId === contact.wall.canonicalVertexAId;
    const vertexX = isA ? contact.wall.ax : contact.wall.bx;
    const vertexZ = isA ? contact.wall.az : contact.wall.bz;
    return Math.hypot(x - vertexX, z - vertexZ);
  }
  const closest = closestPointOnWall(contact.wall, x, z);
  return Math.hypot(x - closest.x, z - closest.z);
}

/**
 * PR6b-1 analytic world: exact extruded wall segments only. The Y band is frozen
 * to request.startSurface for the complete microstep; every transition slot stays
 * `none` until PR6b-2 adds packed boundaries and re-sampling. It intentionally has
 * no THREE, BVH, road-boundary, cache, or live legacy-scene dependency.
 */
export class AnalyticCityCollisionWorld {
  readonly worldId: number;
  readonly documentGeneration: number;
  private walls: readonly CompiledWall[] = [];
  private contacts = new Map<string, PersistentContact>();

  constructor(
    walls: readonly AnalyticExtrudedWallSegment[] = [],
    options: Readonly<{ worldId?: number; documentGeneration?: number }> = {},
  ) {
    const worldId = options.worldId ?? nextAnalyticWorldId++;
    const documentGeneration = options.documentGeneration ?? 1;
    assertSafeId(worldId, "worldId");
    assertSafeId(documentGeneration, "documentGeneration");
    this.worldId = worldId;
    this.documentGeneration = documentGeneration;
    this.replaceWalls(walls);
  }

  replaceWalls(walls: readonly AnalyticExtrudedWallSegment[]): void {
    const compiled = walls.map(compileWall).sort(compareWalls);
    const segmentIdentities = new Set<string>();
    for (const wall of compiled) {
      const segmentIdentity = canonicalTupleKey([
        wall.ownerId,
        wall.ownerGeneration,
        wall.canonicalSegmentId,
      ]);
      if (segmentIdentities.has(segmentIdentity)) {
        throw new Error(`duplicate analytic wall identity: ${segmentIdentity}`);
      }
      segmentIdentities.add(segmentIdentity);
    }
    this.walls = Object.freeze(compiled);
    this.resetRiderContacts();
  }

  sampleCitySurface(
    _x: number,
    _z: number,
    _query: Readonly<SurfaceSampleQuery>,
    out: SurfaceSampleOut,
  ): SurfaceSampleOut {
    return copySurfaceSample(
      out,
      createImplicitGroundSurfaceSample(this.worldId, this.documentGeneration),
    );
  }

  resolveCityMove(request: Readonly<CityMoveRequest>, out: CityMoveResult): CityMoveResult {
    if (out.surface === request.startSurface) {
      throw new Error("CityMoveResult.surface must not alias request.startSurface");
    }
    if (request.startSurface.handle.worldId !== this.worldId) {
      throw new Error("startSurface belongs to a different collision world");
    }
    for (const [label, value] of Object.entries({
      startX: request.startX,
      startZ: request.startZ,
      microDtSeconds: request.microDtSeconds,
      velocityX: request.velocityX,
      velocityZ: request.velocityZ,
      bodyHeading: request.bodyHeading,
      surfaceHeight: request.startSurface.height,
    })) {
      assertFinite(value, `move ${label}`);
    }
    if (request.microDtSeconds < 0) throw new RangeError("microDtSeconds must be non-negative");

    out.transitionCount = 0;
    out.impactCount = 0;
    out.hitLimitReached = false;
    for (const event of out.transitionEvents) {
      resetTransitionEvent(event);
      event.fromSurface = cloneSurfaceHandle(request.startSurface.handle);
      event.toSurface = cloneSurfaceHandle(request.startSurface.handle);
    }
    for (const event of out.impactEvents) resetImpactEvent(event);
    copySurfaceSample(out.surface, request.startSurface);

    const bandMinY = request.startSurface.height;
    const bandMaxY = bandMinY + BIKE_COLLISION_HEIGHT_METERS;
    const depenetrated = this.depenetrate(request.startX, request.startZ, bandMinY, bandMaxY);
    let x = depenetrated.x;
    let z = depenetrated.z;
    let velocityX = request.velocityX;
    let velocityZ = request.velocityZ;
    let remainingX = velocityX * request.microDtSeconds;
    let remainingZ = velocityZ * request.microDtSeconds;
    let blockingHits = 0;
    const constraints: Constraint[] = [];
    const touchedContacts = new Map<string, PersistentContact>();
    const knownContactKeys = new Set(this.contacts.keys());

    while (Math.hypot(remainingX, remainingZ) > VECTOR_EPSILON) {
      const tieHits = this.findEarliestHits(
        x,
        z,
        remainingX,
        remainingZ,
        bandMinY,
        bandMaxY,
      );
      if (tieHits.length === 0) {
        x += remainingX;
        z += remainingZ;
        remainingX = 0;
        remainingZ = 0;
        break;
      }

      const remainingLength = Math.hypot(remainingX, remainingZ);
      const hitDistance = tieHits[0].distance;
      const toi = clamp01(hitDistance / remainingLength);
      const safeDistance = Math.max(0, hitDistance - COLLISION_SKIN_METERS);
      const safeFraction = safeDistance / remainingLength;
      x += remainingX * safeFraction;
      z += remainingZ * safeFraction;
      const residualScale = 1 - toi;
      remainingX *= residualScale;
      remainingZ *= residualScale;

      for (const hit of tieHits) {
        addConstraint(constraints, hit.normalX, hit.normalZ);
        const contact = persistentContact(this.worldId, hit);
        touchedContacts.set(contact.key, contact);
      }

      const newHits = tieHits
        .filter((hit) => !knownContactKeys.has(contactKey(this.worldId, hit)))
        .map((hit) => ({
          hit,
          normalImpactSpeed: Math.max(0, -(velocityX * hit.normalX + velocityZ * hit.normalZ)),
        }))
        .sort((left, right) => right.normalImpactSpeed - left.normalImpactSpeed || compareHits(left.hit, right.hit));
      for (const hit of tieHits) knownContactKeys.add(contactKey(this.worldId, hit));

      const dominant = newHits[0];
      const velocityMagnitude = Math.hypot(velocityX, velocityZ);
      const projectedVelocity = projectVector(velocityX, velocityZ, constraints);
      if (dominant) {
        const targetMagnitude = Math.max(
          0,
          velocityMagnitude
            - ARCADE_STATIC_IMPACT_SPEED_LOSS_FACTOR * dominant.normalImpactSpeed,
        );
        const projectedMagnitude = Math.hypot(projectedVelocity.x, projectedVelocity.z);
        if (projectedMagnitude > VECTOR_EPSILON && targetMagnitude > VECTOR_EPSILON) {
          velocityX = projectedVelocity.x * targetMagnitude / projectedMagnitude;
          velocityZ = projectedVelocity.z * targetMagnitude / projectedMagnitude;
        } else {
          velocityX = 0;
          velocityZ = 0;
        }
        if (out.impactCount < out.impactEvents.length) {
          const event = out.impactEvents[out.impactCount];
          const contact = touchedContacts.get(contactKey(this.worldId, dominant.hit));
          event.kind = "contact-begin";
          event.contact = contact?.handle ?? null;
          event.normalX = dominant.hit.normalX;
          event.normalZ = dominant.hit.normalZ;
          event.normalImpactSpeed = dominant.normalImpactSpeed;
          out.impactCount += 1;
        }
      } else {
        velocityX = projectedVelocity.x;
        velocityZ = projectedVelocity.z;
      }

      const projectedResidual = projectVector(remainingX, remainingZ, constraints);
      remainingX = projectedResidual.x;
      remainingZ = projectedResidual.z;
      blockingHits += 1;
      if (blockingHits >= CITY_COLLIDE_AND_SLIDE_MAX_HITS) {
        out.hitLimitReached = true;
        remainingX = 0;
        remainingZ = 0;
        break;
      }
    }

    const velocityMagnitude = Math.hypot(velocityX, velocityZ);
    let motionSign = request.motionSign;
    let bodyHeading = request.bodyHeading;
    let drifting = request.drifting;
    if (velocityMagnitude <= VECTOR_EPSILON) {
      velocityX = 0;
      velocityZ = 0;
      motionSign = 0;
      drifting = false;
    } else if (out.impactCount > 0
      && out.impactEvents[0].normalImpactSpeed
        >= ARCADE_STRONG_IMPACT_SPEED_METERS_PER_SECOND) {
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
    out.hitLimitReached ||= depenetrated.incomplete;
    this.updatePersistentContacts(x, z, velocityX, velocityZ, touchedContacts);
    return out;
  }

  resetRiderContacts(): void {
    this.contacts.clear();
  }

  activeContactCount(): number {
    return this.contacts.size;
  }

  private depenetrate(
    startX: number,
    startZ: number,
    bandMinY: number,
    bandMaxY: number,
  ): { x: number; z: number; incomplete: boolean } {
    let x = startX;
    let z = startZ;
    for (let iteration = 0; iteration < CITY_DEPENETRATION_MAX_ITERS; iteration += 1) {
      let best: { wall: CompiledWall; depth: number; normalX: number; normalZ: number } | null = null;
      for (const wall of this.walls) {
        if (!wallOverlapsBand(wall, bandMinY, bandMaxY)) continue;
        const closest = closestPointOnWall(wall, x, z);
        const offsetX = x - closest.x;
        const offsetZ = z - closest.z;
        const distance = Math.hypot(offsetX, offsetZ);
        const depth = BIKE_COLLISION_RADIUS_METERS - distance;
        if (depth <= VECTOR_EPSILON) continue;
        const normalX = distance > VECTOR_EPSILON ? offsetX / distance : wall.nx;
        const normalZ = distance > VECTOR_EPSILON ? offsetZ / distance : wall.nz;
        if (!best || depth > best.depth + VECTOR_EPSILON) {
          best = { wall, depth, normalX, normalZ };
        } else if (Math.abs(depth - best.depth) <= VECTOR_EPSILON && compareWalls(wall, best.wall) < 0) {
          best = { wall, depth, normalX, normalZ };
        }
      }
      if (!best) return { x, z, incomplete: false };
      const push = best.depth + COLLISION_SKIN_METERS;
      x += best.normalX * push;
      z += best.normalZ * push;
    }
    return { x, z, incomplete: this.hasOverlap(x, z, bandMinY, bandMaxY) };
  }

  private hasOverlap(x: number, z: number, bandMinY: number, bandMaxY: number): boolean {
    for (const wall of this.walls) {
      if (!wallOverlapsBand(wall, bandMinY, bandMaxY)) continue;
      const closest = closestPointOnWall(wall, x, z);
      if (Math.hypot(x - closest.x, z - closest.z) < BIKE_COLLISION_RADIUS_METERS - VECTOR_EPSILON) {
        return true;
      }
    }
    return false;
  }

  private findEarliestHits(
    startX: number,
    startZ: number,
    deltaX: number,
    deltaZ: number,
    bandMinY: number,
    bandMaxY: number,
  ): SweepHit[] {
    const moveLength = Math.hypot(deltaX, deltaZ);
    if (moveLength <= VECTOR_EPSILON) return [];
    const candidates: SweepHit[] = [];
    for (const wall of this.walls) {
      if (!wallOverlapsBand(wall, bandMinY, bandMaxY)) continue;
      addSideHits(
        candidates,
        wall,
        startX,
        startZ,
        deltaX,
        deltaZ,
        BIKE_COLLISION_RADIUS_METERS,
        moveLength,
      );
      addVertexHit(
        candidates,
        wall,
        wall.ax,
        wall.az,
        wall.canonicalVertexAId,
        startX,
        startZ,
        deltaX,
        deltaZ,
        BIKE_COLLISION_RADIUS_METERS,
        moveLength,
      );
      addVertexHit(
        candidates,
        wall,
        wall.bx,
        wall.bz,
        wall.canonicalVertexBId,
        startX,
        startZ,
        deltaX,
        deltaZ,
        BIKE_COLLISION_RADIUS_METERS,
        moveLength,
      );
    }
    if (candidates.length === 0) return [];
    let earliestDistance = Infinity;
    for (const candidate of candidates) earliestDistance = Math.min(earliestDistance, candidate.distance);
    return candidates
      .filter((candidate) => candidate.distance <= earliestDistance + TOI_DISTANCE_EPS_METERS)
      .sort(compareHits);
  }

  private updatePersistentContacts(
    x: number,
    z: number,
    velocityX: number,
    velocityZ: number,
    touched: ReadonlyMap<string, PersistentContact>,
  ): void {
    const candidates = new Map(this.contacts);
    for (const [key, contact] of touched) candidates.set(key, contact);
    const next = new Map<string, PersistentContact>();
    for (const [key, contact] of candidates) {
      const separatingSpeed = velocityX * contact.normalX + velocityZ * contact.normalZ;
      const closeEnough = contactDistance(contact, x, z)
        <= BIKE_COLLISION_RADIUS_METERS + 2 * COLLISION_SKIN_METERS + VECTOR_EPSILON;
      if (closeEnough && separatingSpeed <= VECTOR_EPSILON) next.set(key, contact);
    }
    this.contacts = next;
  }
}
