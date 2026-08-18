import {
  CITY_COLLISION_MAX_TRANSLATION_PER_MICROSTEP_METERS,
  CITY_PHYSICS_FIXED_DT_SECONDS,
  CITY_PHYSICS_MAX_CATCH_UP_STEPS,
  type CityMoveRequest,
  type CityMoveResult,
  type SurfaceSampleOut,
} from "./cityCollisionTypes.ts";
import { copySurfaceSample, createCityMoveResultBuffer } from "./cityCollision.ts";

const CLOCK_EPSILON_SECONDS = 1e-12;

export type CityFixedStepState = {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  motionSign: -1 | 0 | 1;
  bodyHeading: number;
  drifting: boolean;
  surface: SurfaceSampleOut;
};

export type CityMoveResolver = Readonly<{
  resolveCityMove(request: Readonly<CityMoveRequest>, out: CityMoveResult): CityMoveResult;
}>;

/** Called exactly once per fixed tick, before collision microsteps are chosen. */
export type CityFixedTickIntegrator = (
  state: CityFixedStepState,
  fixedDtSeconds: number,
  simulationTimeSeconds: number,
) => void;

/**
 * Clock-only fixed-tick callback. This is used by live controllers that own
 * their collision slicing (for example CityMotorcycleAdapter), so the runner
 * must not perform a second motion solve around them.
 */
export type CityFixedTickCallback = (
  fixedDtSeconds: number,
  simulationTimeSeconds: number,
) => void;

export type CityFixedStepAdvance = Readonly<{
  fixedSteps: number;
  microsteps: number;
  droppedSeconds: number;
  accumulatorSeconds: number;
  simulationTimeSeconds: number;
}>;

/**
 * Deterministic city clock and motion slicer. Dynamics integrate once per 1/120s
 * tick; collision can then update velocity between <=0.25m microsteps.
 */
export class CityFixedStepRunner {
  private accumulator = 0;
  private simulationTime = 0;
  private readonly moveResult = createCityMoveResultBuffer();

  get accumulatorSeconds(): number {
    return this.accumulator;
  }

  get simulationTimeSeconds(): number {
    return this.simulationTime;
  }

  reset(simulationTimeSeconds = 0): void {
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < 0) {
      throw new RangeError("simulationTimeSeconds must be finite and non-negative");
    }
    this.accumulator = 0;
    this.simulationTime = simulationTimeSeconds;
  }

  /**
   * Advance only the deterministic 1/120s clock. The callback owns all work in
   * each tick; in particular, no CityMoveResolver call is made by this method.
   */
  advanceFixedTicks(
    renderDeltaSeconds: number,
    runFixedTick: CityFixedTickCallback,
  ): CityFixedStepAdvance {
    if (!Number.isFinite(renderDeltaSeconds) || renderDeltaSeconds < 0) {
      throw new RangeError("renderDeltaSeconds must be finite and non-negative");
    }
    this.accumulator += renderDeltaSeconds;

    const availableSteps = Math.floor(
      (this.accumulator + CLOCK_EPSILON_SECONDS) / CITY_PHYSICS_FIXED_DT_SECONDS,
    );
    const fixedSteps = Math.min(availableSteps, CITY_PHYSICS_MAX_CATCH_UP_STEPS);
    const droppedSteps = Math.max(0, availableSteps - fixedSteps);
    const droppedSeconds = droppedSteps * CITY_PHYSICS_FIXED_DT_SECONDS;
    if (droppedSteps > 0) this.accumulator -= droppedSeconds;

    for (let fixedIndex = 0; fixedIndex < fixedSteps; fixedIndex += 1) {
      runFixedTick(CITY_PHYSICS_FIXED_DT_SECONDS, this.simulationTime);
      this.accumulator -= CITY_PHYSICS_FIXED_DT_SECONDS;
      if (this.accumulator < 0 && this.accumulator > -CLOCK_EPSILON_SECONDS) this.accumulator = 0;
      this.simulationTime += CITY_PHYSICS_FIXED_DT_SECONDS;
    }

    return {
      fixedSteps,
      microsteps: 0,
      droppedSeconds,
      accumulatorSeconds: this.accumulator,
      simulationTimeSeconds: this.simulationTime,
    };
  }

  advance(
    renderDeltaSeconds: number,
    state: CityFixedStepState,
    resolver: CityMoveResolver,
    integrateFixedTick?: CityFixedTickIntegrator,
  ): CityFixedStepAdvance {
    if (!Number.isFinite(renderDeltaSeconds) || renderDeltaSeconds < 0) {
      throw new RangeError("renderDeltaSeconds must be finite and non-negative");
    }
    this.accumulator += renderDeltaSeconds;

    const availableSteps = Math.floor(
      (this.accumulator + CLOCK_EPSILON_SECONDS) / CITY_PHYSICS_FIXED_DT_SECONDS,
    );
    const fixedSteps = Math.min(availableSteps, CITY_PHYSICS_MAX_CATCH_UP_STEPS);
    const droppedSteps = Math.max(0, availableSteps - fixedSteps);
    const droppedSeconds = droppedSteps * CITY_PHYSICS_FIXED_DT_SECONDS;
    if (droppedSteps > 0) this.accumulator -= droppedSeconds;

    let microsteps = 0;
    for (let fixedIndex = 0; fixedIndex < fixedSteps; fixedIndex += 1) {
      integrateFixedTick?.(
        state,
        CITY_PHYSICS_FIXED_DT_SECONDS,
        this.simulationTime,
      );
      const predictedTranslation = Math.hypot(state.velocityX, state.velocityZ)
        * CITY_PHYSICS_FIXED_DT_SECONDS;
      const microCount = Math.max(
        1,
        Math.ceil(
          predictedTranslation / CITY_COLLISION_MAX_TRANSLATION_PER_MICROSTEP_METERS
          - CLOCK_EPSILON_SECONDS,
        ),
      );
      const microDtSeconds = CITY_PHYSICS_FIXED_DT_SECONDS / microCount;

      for (let microIndex = 0; microIndex < microCount; microIndex += 1) {
        const request: CityMoveRequest = {
          startX: state.x,
          startZ: state.z,
          microDtSeconds,
          velocityX: state.velocityX,
          velocityZ: state.velocityZ,
          motionSign: state.motionSign,
          bodyHeading: state.bodyHeading,
          drifting: state.drifting,
          startSurface: state.surface,
        };
        const result = resolver.resolveCityMove(request, this.moveResult);
        state.x = result.x;
        state.z = result.z;
        state.velocityX = result.velocityX;
        state.velocityZ = result.velocityZ;
        state.motionSign = result.motionSign;
        state.bodyHeading = result.bodyHeading;
        state.drifting = result.drifting;
        copySurfaceSample(state.surface, result.surface);
        microsteps += 1;
      }

      this.accumulator -= CITY_PHYSICS_FIXED_DT_SECONDS;
      if (this.accumulator < 0 && this.accumulator > -CLOCK_EPSILON_SECONDS) this.accumulator = 0;
      this.simulationTime += CITY_PHYSICS_FIXED_DT_SECONDS;
    }

    return {
      fixedSteps,
      microsteps,
      droppedSeconds,
      accumulatorSeconds: this.accumulator,
      simulationTimeSeconds: this.simulationTime,
    };
  }
}
