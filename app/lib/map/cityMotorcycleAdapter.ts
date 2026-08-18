import {
  copySurfaceSample,
  createCityMoveResultBuffer,
  createImplicitGroundSurfaceSample,
} from "./cityCollision.ts";
import {
  CITY_COLLISION_MAX_TRANSLATION_PER_MICROSTEP_METERS,
  CURB_BUMP_DURATION_SECONDS,
  CURB_BUMP_MIN_STEP_METERS,
  CURB_BUMP_PRESENTATION_PITCH_RADIANS,
  CURB_BUMP_PRESENTATION_Y_METERS,
  CURB_BUMP_REFERENCE_STEP_METERS,
  CURB_BUMP_REARM_DISTANCE_METERS,
  canonicalTupleKey,
  type CityImpactEventOut,
  type CityMoveRequest,
  type CityMoveResult,
  type RuntimeBoundaryHandle,
  type RuntimeContactHandle,
  type SurfaceSampleOut,
  type SurfaceSampleQuery,
} from "./cityCollisionTypes.ts";

const MOTION_EPSILON = 1e-10;
const MICROSTEP_COUNT_EPSILON = 1e-12;

export type CityMotorcycleCollisionSource = Readonly<{
  worldId: number;
  documentGeneration: number;
  sampleCitySurface(
    x: number,
    z: number,
    query: Readonly<SurfaceSampleQuery>,
    out: SurfaceSampleOut,
  ): SurfaceSampleOut;
  resolveCityMove(request: Readonly<CityMoveRequest>, out: CityMoveResult): CityMoveResult;
  resetRiderContacts?(): void;
}>;

export type CityMotorcycleImpact = Readonly<{
  contact: RuntimeContactHandle | null;
  normalX: number;
  normalZ: number;
  normalImpactSpeed: number;
}>;

export type CityMotorcycleBoundarySample = Readonly<{
  ax: number;
  az: number;
  steep: boolean;
  height: number;
  gx: number;
  gz: number;
  speedCap: number;
}>;

/** One shared sample must be applied to both rider and camera, never summed twice. */
export type CityPresentationBump = Readonly<{
  y: number;
  pitch: number;
  active: boolean;
  sequence: number;
}>;

export type CityMotorcycleAdapterOptions = Readonly<{
  onImpact?: (impact: CityMotorcycleImpact) => void;
}>;

type FixedStepSnapshot = Readonly<{
  startX: number;
  startZ: number;
  dtSeconds: number;
  heading: number;
  drifting: boolean;
}>;

type BoundaryGate = {
  x: number;
  z: number;
};

const ZERO_PRESENTATION_BUMP: CityPresentationBump = Object.freeze({
  y: 0,
  pitch: 0,
  active: false,
  sequence: 0,
});

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function motionSign(speed: number): -1 | 0 | 1 {
  if (speed > MOTION_EPSILON) return 1;
  if (speed < -MOTION_EPSILON) return -1;
  return 0;
}

function cloneContact(contact: RuntimeContactHandle | null): RuntimeContactHandle | null {
  return contact ? Object.freeze({ ...contact }) : null;
}

function copyImpactForCallback(event: Readonly<CityImpactEventOut>): CityMotorcycleImpact {
  return Object.freeze({
    contact: cloneContact(event.contact),
    normalX: event.normalX,
    normalZ: event.normalZ,
    normalImpactSpeed: event.normalImpactSpeed,
  });
}

function boundaryKey(handle: RuntimeBoundaryHandle): string {
  switch (handle.kind) {
    case "owner-local":
      return canonicalTupleKey([
        "owner-local",
        handle.worldId,
        handle.ownerId,
        handle.ownerGeneration,
        handle.localBoundaryGroupKey,
      ]);
    case "road":
      return canonicalTupleKey([
        "road",
        handle.worldId,
        handle.documentGeneration,
        handle.roadEdgeId,
        handle.side,
        handle.curbRun,
      ]);
    case "surface-stitch":
      return canonicalTupleKey([
        "surface-stitch",
        handle.worldId,
        handle.documentGeneration,
        handle.stitchId,
        handle.groupId,
      ]);
  }
}

/**
 * Live bridge from MotorcycleController's endpoint-style resolveBike call to
 * DocumentCityCollisionWorld's fixed-tick velocity solver. Forest collision is
 * intentionally untouched; the city scene chooses this adapter explicitly.
 */
export class CityMotorcycleAdapter {
  readonly collision: CityMotorcycleCollisionSource;
  private readonly moveResult: CityMoveResult;
  private readonly surface: SurfaceSampleOut;
  private readonly sampleScratch: SurfaceSampleOut;
  private fixedStep: FixedStepSnapshot | null = null;
  private fixedStepBoundaryKeys = new Set<string>();
  private boundaryGates = new Map<string, BoundaryGate>();
  private microstepsLastResolve = 0;

  private bumpAgeSeconds = CURB_BUMP_DURATION_SECONDS;
  private bumpStrength = 0;
  private bumpDirection: -1 | 1 = 1;
  private bumpSequence = 0;
  private bumpAvailable = false;

  onImpact?: (impact: CityMotorcycleImpact) => void;

  constructor(
    collision: CityMotorcycleCollisionSource,
    options: CityMotorcycleAdapterOptions = {},
  ) {
    this.collision = collision;
    this.moveResult = createCityMoveResultBuffer(
      collision.worldId,
      collision.documentGeneration,
    );
    this.surface = createImplicitGroundSurfaceSample(
      collision.worldId,
      collision.documentGeneration,
    );
    this.sampleScratch = createImplicitGroundSurfaceSample(
      collision.worldId,
      collision.documentGeneration,
    );
    this.onImpact = options.onImpact;
  }

  get lastMicrostepCount(): number {
    return this.microstepsLastResolve;
  }

  /** A read-only diagnostic copy; hot-path movement retains its own mutable buffer. */
  getSurfaceSample(): Readonly<SurfaceSampleOut> {
    const copy = createImplicitGroundSurfaceSample();
    copySurfaceSample(copy, this.surface);
    return Object.freeze(copy);
  }

  beginFixedStep(
    startX: number,
    startZ: number,
    dtSeconds: number,
    headingOrState: number | Readonly<{ heading: number; drifting: boolean }>,
    drifting = false,
  ): void {
    finite(startX, "fixed-step startX");
    finite(startZ, "fixed-step startZ");
    finite(dtSeconds, "fixed-step dtSeconds");
    if (dtSeconds <= 0) throw new RangeError("fixed-step dtSeconds must be greater than zero");
    const heading = typeof headingOrState === "number" ? headingOrState : headingOrState.heading;
    const driftState = typeof headingOrState === "number" ? drifting : headingOrState.drifting;
    finite(heading, "fixed-step heading");
    this.rearmBoundaryGates(startX, startZ);
    this.fixedStepBoundaryKeys.clear();
    this.fixedStep = Object.freeze({
      startX,
      startZ,
      dtSeconds,
      heading,
      drifting: Boolean(driftState),
    });

    this.collision.sampleCitySurface(startX, startZ, {
      currentY: this.surface.height,
      previousHandle: this.surface.handle,
      maxStepUpMeters: 0.30,
    }, this.sampleScratch);
    copySurfaceSample(this.surface, this.sampleScratch);
  }

  /**
   * Compatible with CollisionWorld.resolveBike. The target endpoint is only a
   * prediction; each microstep recomputes translation from the velocity returned
   * by the previous collision result.
   */
  resolveBike(
    bike: Readonly<{ x: number; z: number; r: number }>,
    _forward: Readonly<{ x: number; z: number }>,
    speed: number,
    heading: number,
  ): {
    x: number;
    z: number;
    speed: number;
    heading: number;
    velHeading: number;
    drifting: boolean;
  } {
    const fixedStep = this.fixedStep;
    if (!fixedStep) throw new Error("beginFixedStep must be called before resolveBike");
    this.fixedStep = null;
    finite(bike.x, "bike.x");
    finite(bike.z, "bike.z");
    finite(bike.r, "bike.r");
    finite(speed, "bike speed");
    finite(heading, "bike heading");

    const intendedX = bike.x - fixedStep.startX;
    const intendedZ = bike.z - fixedStep.startZ;
    const intendedDistance = Math.hypot(intendedX, intendedZ);
    const microCount = Math.max(1, Math.ceil(
      intendedDistance / CITY_COLLISION_MAX_TRANSLATION_PER_MICROSTEP_METERS
        - MICROSTEP_COUNT_EPSILON,
    ));
    const microDtSeconds = fixedStep.dtSeconds / microCount;
    let x = fixedStep.startX;
    let z = fixedStep.startZ;
    let velocityX = intendedX / fixedStep.dtSeconds;
    let velocityZ = intendedZ / fixedStep.dtSeconds;
    let sign = motionSign(speed);
    let bodyHeading = heading;
    let isDrifting = sign < 0 ? false : fixedStep.drifting;

    for (let index = 0; index < microCount; index += 1) {
      const startSurfaceHeight = this.surface.height;
      const result = this.collision.resolveCityMove({
        startX: x,
        startZ: z,
        microDtSeconds,
        velocityX,
        velocityZ,
        motionSign: sign,
        bodyHeading,
        drifting: isDrifting,
        startSurface: this.surface,
      }, this.moveResult);
      x = result.x;
      z = result.z;
      velocityX = result.velocityX;
      velocityZ = result.velocityZ;
      sign = result.motionSign;
      bodyHeading = result.bodyHeading;
      isDrifting = result.drifting;
      copySurfaceSample(this.surface, result.surface);
      this.consumeMoveEvents(result, x, z, startSurfaceHeight);
    }
    this.microstepsLastResolve = microCount;

    const magnitude = Math.hypot(velocityX, velocityZ);
    const signedSpeed = sign === 0 || magnitude <= MOTION_EPSILON ? 0 : sign * magnitude;
    const velocityHeading = magnitude <= MOTION_EPSILON
      ? bodyHeading
      : Math.atan2(
          sign < 0 ? -velocityX : velocityX,
          sign < 0 ? -velocityZ : velocityZ,
        );
    return {
      x,
      z,
      speed: signedSpeed,
      heading: bodyHeading,
      velHeading: velocityHeading,
      drifting: isDrifting,
    };
  }

  sampleBoundary = (x: number, z: number): CityMotorcycleBoundarySample => {
    finite(x, "surface sample x");
    finite(z, "surface sample z");
    this.collision.sampleCitySurface(x, z, {
      currentY: this.surface.height,
      previousHandle: this.surface.handle,
      maxStepUpMeters: 0.30,
    }, this.sampleScratch);
    return {
      ax: 0,
      az: 0,
      steep: false,
      height: this.sampleScratch.height,
      gx: this.sampleScratch.gx,
      gz: this.sampleScratch.gz,
      speedCap: this.sampleScratch.speedCap,
    };
  };

  /** Advance once per render frame; the next consume returns exactly one shared sample. */
  advancePresentationBump(dtSeconds: number): void {
    finite(dtSeconds, "presentation dtSeconds");
    if (dtSeconds < 0) throw new RangeError("presentation dtSeconds must be non-negative");
    if (this.bumpAgeSeconds >= CURB_BUMP_DURATION_SECONDS || this.bumpStrength <= 0) return;
    if (dtSeconds > 0) {
      this.bumpAgeSeconds = Math.min(
        CURB_BUMP_DURATION_SECONDS,
        this.bumpAgeSeconds + dtSeconds,
      );
      this.bumpAvailable = true;
    }
  }

  /**
   * Single-consumer by design: consume once, then pass this same object to the
   * rider and camera. A second consume before advance/new impact is zero.
   */
  consumePresentationBump(): CityPresentationBump {
    if (!this.bumpAvailable) {
      return this.bumpSequence === 0
        ? ZERO_PRESENTATION_BUMP
        : Object.freeze({ ...ZERO_PRESENTATION_BUMP, sequence: this.bumpSequence });
    }
    this.bumpAvailable = false;
    if (this.bumpAgeSeconds >= CURB_BUMP_DURATION_SECONDS || this.bumpStrength <= 0) {
      return Object.freeze({ ...ZERO_PRESENTATION_BUMP, sequence: this.bumpSequence });
    }
    const progress = this.bumpAgeSeconds / CURB_BUMP_DURATION_SECONDS;
    const decay = 1 - progress;
    const oscillation = Math.cos(progress * Math.PI * 2);
    const y = CURB_BUMP_PRESENTATION_Y_METERS
      * this.bumpStrength
      * decay * decay
      * Math.abs(oscillation);
    const pitch = CURB_BUMP_PRESENTATION_PITCH_RADIANS
      * this.bumpStrength
      * this.bumpDirection
      * decay * decay
      * oscillation;
    return Object.freeze({
      y: Math.min(CURB_BUMP_PRESENTATION_Y_METERS, Math.max(0, y)),
      pitch: Math.max(
        -CURB_BUMP_PRESENTATION_PITCH_RADIANS,
        Math.min(CURB_BUMP_PRESENTATION_PITCH_RADIANS, pitch),
      ),
      active: true,
      sequence: this.bumpSequence,
    });
  }

  reset(): void {
    this.fixedStep = null;
    this.fixedStepBoundaryKeys.clear();
    this.boundaryGates.clear();
    this.microstepsLastResolve = 0;
    this.bumpAgeSeconds = CURB_BUMP_DURATION_SECONDS;
    this.bumpStrength = 0;
    this.bumpDirection = 1;
    this.bumpSequence = 0;
    this.bumpAvailable = false;
    copySurfaceSample(
      this.surface,
      createImplicitGroundSurfaceSample(
        this.collision.worldId,
        this.collision.documentGeneration,
      ),
    );
    this.collision.resetRiderContacts?.();
  }

  private consumeMoveEvents(
    result: Readonly<CityMoveResult>,
    x: number,
    z: number,
    startSurfaceHeight: number,
  ): void {
    for (let index = 0; index < result.impactCount; index += 1) {
      const event = result.impactEvents[index];
      if (event.kind === "contact-begin") this.onImpact?.(copyImpactForCallback(event));
    }
    for (let index = 0; index < result.transitionCount; index += 1) {
      const event = result.transitionEvents[index];
      if (event.kind !== "road-curb" || !event.boundaryHandle) continue;
      // A crossing that lands exactly on a microstep endpoint can report the
      // authoritative handle while its forward probe is clamped to t=1. In
      // that case use the accepted result surface delta; never infer a curb
      // without an actual road-curb event.
      const acceptedStepDelta = Math.abs(event.stepDeltaY) >= CURB_BUMP_MIN_STEP_METERS
        ? event.stepDeltaY
        : result.surface.height - startSurfaceHeight;
      if (Math.abs(acceptedStepDelta) < CURB_BUMP_MIN_STEP_METERS) continue;
      const acceptedStrength = event.bumpStrength > 0
        ? event.bumpStrength
        : Math.min(1, Math.abs(acceptedStepDelta) / CURB_BUMP_REFERENCE_STEP_METERS);
      const key = boundaryKey(event.boundaryHandle);
      if (this.fixedStepBoundaryKeys.has(key) || this.boundaryGates.has(key)) continue;
      this.fixedStepBoundaryKeys.add(key);
      this.boundaryGates.set(key, { x, z });
      this.triggerPresentationBump(acceptedStrength, acceptedStepDelta);
    }
  }

  private triggerPresentationBump(strength: number, stepDeltaY: number): void {
    const residual = this.bumpAgeSeconds >= CURB_BUMP_DURATION_SECONDS
      ? 0
      : this.bumpStrength * (1 - this.bumpAgeSeconds / CURB_BUMP_DURATION_SECONDS);
    this.bumpStrength = Math.min(1, Math.max(residual, strength));
    this.bumpDirection = stepDeltaY < 0 ? -1 : 1;
    this.bumpAgeSeconds = 0;
    this.bumpSequence += 1;
    this.bumpAvailable = true;
  }

  private rearmBoundaryGates(x: number, z: number): void {
    for (const [key, gate] of this.boundaryGates) {
      if (Math.hypot(x - gate.x, z - gate.z) > CURB_BUMP_REARM_DISTANCE_METERS) {
        this.boundaryGates.delete(key);
      }
    }
  }
}
