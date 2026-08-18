import {
  AnalyticCityCollisionWorld,
  copySurfaceSample,
  createCityMoveResultBuffer,
} from "./cityCollision.ts";
import type { AnalyticExtrudedWallSegment } from "./cityCollision.ts";
import { CitySurfaceIndex } from "./citySurfaceIndex.ts";
import type {
  CityImpactEventOut,
  CityMoveRequest,
  CityMoveResult,
  CitySurfaceTransitionEventOut,
  SurfaceSampleOut,
  SurfaceSampleQuery,
} from "./cityCollisionTypes.ts";
import { CITY_SURFACE_TRANSITIONS_MAX_PER_MICROSTEP } from "./cityCollisionTypes.ts";
import type { DerivedRoadCollisionSources } from "./cityRoads.ts";
import { deriveRoadCollisionSources } from "./cityRoads.ts";
import type { CityMapDocumentSnapshot, LegacyMassingPlacement } from "./cityDocument.ts";
import type { CityRoadGraph } from "./cityRoadGraph.ts";
import { buildLegacyMassingBoxParts, legacyMassingPartWorldSize } from "./cityPlacements.ts";

const REACHED_BOUNDARY_EPSILON_METERS = 0.004;

/** Exact four-side wall loops for the same box parts used by legacy rendering. */
export function buildLegacyMassingWalls(
  placements: readonly Readonly<LegacyMassingPlacement>[],
  ownerGeneration = 1,
): readonly AnalyticExtrudedWallSegment[] {
  const walls: AnalyticExtrudedWallSegment[] = [];
  for (const placement of placements) {
    buildLegacyMassingBoxParts(placement).forEach((part, partIndex) => {
      if (part.collisionRole !== "solid") return;
      const size = legacyMassingPartWorldSize(part);
      const halfX = size.width * 0.5;
      const halfZ = size.depth * 0.5;
      const cosine = Math.cos(part.yawRadians);
      const sine = Math.sin(part.yawRadians);
      const local = [
        [-halfX, -halfZ],
        [halfX, -halfZ],
        [halfX, halfZ],
        [-halfX, halfZ],
      ] as const;
      const points = local.map(([x, z]) => ({
        x: part.x + x * cosine + z * sine,
        z: part.z - x * sine + z * cosine,
      }));
      const minY = part.y - size.height * 0.5;
      const maxY = part.y + size.height * 0.5;
      points.forEach((a, side) => {
        const b = points[(side + 1) % points.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        walls.push(Object.freeze({
          ownerId: placement.id,
          ownerGeneration,
          canonicalSegmentId: partIndex * 4 + side,
          canonicalVertexAId: partIndex * 4 + side,
          canonicalVertexBId: partIndex * 4 + ((side + 1) % 4),
          ax: a.x,
          az: a.z,
          bx: b.x,
          bz: b.z,
          minY,
          maxY,
          nx: dz / length,
          nz: -dx / length,
        }));
      });
    });
  }
  return Object.freeze(walls);
}

export function createDocumentCityCollisionWorld(
  document: CityMapDocumentSnapshot,
  documentGeneration = 1,
) {
  const legacy = document.placements.filter(
    (placement): placement is Readonly<LegacyMassingPlacement> => placement.poseKind === "legacy-massing",
  );
  return new DocumentCityCollisionWorld(
    buildLegacyMassingWalls(legacy, documentGeneration),
    deriveRoadCollisionSources(structuredClone(document.graph) as CityRoadGraph),
    { documentGeneration },
  );
}

function copyImpact(target: CityImpactEventOut, source: Readonly<CityImpactEventOut>) {
  target.kind = source.kind;
  target.contact = source.contact ? Object.freeze({ ...source.contact }) : null;
  target.normalX = source.normalX;
  target.normalZ = source.normalZ;
  target.normalImpactSpeed = source.normalImpactSpeed;
}

function clearImpact(target: CityImpactEventOut) {
  target.kind = "none";
  target.contact = null;
  target.normalX = 0;
  target.normalZ = 0;
  target.normalImpactSpeed = 0;
}

function clearTransition(target: CitySurfaceTransitionEventOut) {
  target.kind = "none";
  target.boundaryHandle = null;
  target.stepDeltaY = 0;
  target.bumpStrength = 0;
}

/**
 * PR6b-1 wall solver combined with PR4 road surfaces/boundaries. Ordinary
 * curbs are transitions, never solid contacts; their event only drives the
 * bounded rider/camera bump and does not modify velocity or heading.
 */
export class DocumentCityCollisionWorld {
  readonly wallWorld: AnalyticCityCollisionWorld;
  readonly surfaceIndex: CitySurfaceIndex;
  private readonly segmentResult = createCityMoveResultBuffer();

  constructor(
    walls: readonly AnalyticExtrudedWallSegment[],
    roadSources: Readonly<DerivedRoadCollisionSources>,
    options: Readonly<{ worldId?: number; documentGeneration?: number }> = {},
  ) {
    this.wallWorld = new AnalyticCityCollisionWorld(walls, options);
    this.surfaceIndex = new CitySurfaceIndex(
      roadSources,
      this.wallWorld.worldId,
      this.wallWorld.documentGeneration,
    );
  }

  get worldId() {
    return this.wallWorld.worldId;
  }

  get documentGeneration() {
    return this.wallWorld.documentGeneration;
  }

  sampleCitySurface(x: number, z: number, query: Readonly<SurfaceSampleQuery>, out: SurfaceSampleOut) {
    return this.surfaceIndex.sampleCitySurface(x, z, query, out);
  }

  resolveCityMove(request: Readonly<CityMoveRequest>, out: CityMoveResult): CityMoveResult {
    if (out.surface === request.startSurface) throw new Error("CityMoveResult.surface must not alias request.startSurface");
    for (const event of out.impactEvents) clearImpact(event);
    for (const event of out.transitionEvents) clearTransition(event);
    out.impactCount = 0;
    out.transitionCount = 0;
    out.hitLimitReached = false;

    let x = request.startX;
    let z = request.startZ;
    let velocityX = request.velocityX;
    let velocityZ = request.velocityZ;
    let motionSign = request.motionSign;
    let bodyHeading = request.bodyHeading;
    let drifting = request.drifting;
    let remainingTime = request.microDtSeconds;
    copySurfaceSample(out.surface, request.startSurface);

    while (remainingTime > 1e-12) {
      const deltaX = velocityX * remainingTime;
      const deltaZ = velocityZ * remainingTime;
      const crossing = out.transitionCount < CITY_SURFACE_TRANSITIONS_MAX_PER_MICROSTEP
        ? this.surfaceIndex.findEarliestBoundaryCrossing(x, z, deltaX, deltaZ, out.surface)
        : null;
      const segmentFraction = crossing?.fraction ?? 1;
      const segmentTime = remainingTime * segmentFraction;
      const startX = x;
      const startZ = z;
      const segment = this.wallWorld.resolveCityMove({
        startX,
        startZ,
        microDtSeconds: segmentTime,
        velocityX,
        velocityZ,
        motionSign,
        bodyHeading,
        drifting,
        startSurface: out.surface,
      }, this.segmentResult);

      x = segment.x;
      z = segment.z;
      velocityX = segment.velocityX;
      velocityZ = segment.velocityZ;
      motionSign = segment.motionSign;
      bodyHeading = segment.bodyHeading;
      drifting = segment.drifting;
      out.hitLimitReached ||= segment.hitLimitReached;
      for (let index = 0; index < segment.impactCount && out.impactCount < out.impactEvents.length; index += 1) {
        copyImpact(out.impactEvents[out.impactCount], segment.impactEvents[index]);
        out.impactCount += 1;
      }

      if (!crossing) {
        copySurfaceSample(out.surface, segment.surface);
        remainingTime = 0;
        break;
      }

      const reachedBoundary = Math.hypot(x - crossing.x, z - crossing.z)
        <= REACHED_BOUNDARY_EPSILON_METERS;
      if (!reachedBoundary || out.hitLimitReached) {
        copySurfaceSample(out.surface, segment.surface);
        remainingTime = 0;
        break;
      }

      const event = out.transitionEvents[out.transitionCount];
      event.kind = "road-curb";
      event.boundaryHandle = crossing.handle;
      event.fromSurface = crossing.fromSurface;
      event.toSurface = crossing.toSurface;
      event.stepDeltaY = crossing.toHeight - crossing.fromHeight;
      event.bumpStrength = crossing.bumpStrength;
      out.transitionCount += 1;

      const probeLength = Math.hypot(deltaX, deltaZ);
      const probeScale = probeLength > 1e-12 ? Math.min(1, 0.002 / probeLength) : 0;
      this.surfaceIndex.sampleCitySurface(
        x + deltaX * probeScale,
        z + deltaZ * probeScale,
        {
          currentY: crossing.toHeight,
          previousHandle: crossing.toSurface,
          maxStepUpMeters: 0.30,
        },
        out.surface,
      );
      remainingTime -= segmentTime;
      if (remainingTime <= 1e-12 || Math.hypot(velocityX, velocityZ) <= 1e-12) break;
    }

    // Keep the same surface handle on continuous coverage; otherwise select the
    // highest reachable surface at the final XZ.
    this.surfaceIndex.sampleCitySurface(x, z, {
      currentY: out.surface.height,
      previousHandle: out.surface.handle,
      maxStepUpMeters: 0.30,
    }, out.surface);
    out.x = x;
    out.z = z;
    out.velocityX = velocityX;
    out.velocityZ = velocityZ;
    out.motionSign = motionSign;
    out.bodyHeading = bodyHeading;
    out.drifting = drifting;
    return out;
  }

  resetRiderContacts() {
    this.wallWorld.resetRiderContacts();
  }
}
