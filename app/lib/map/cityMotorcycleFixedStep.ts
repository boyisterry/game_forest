import type { CollisionWorld } from "./collision.ts";
import {
  CityFixedStepRunner,
  type CityFixedStepAdvance,
} from "./cityFixedStep.ts";
import type {
  CityMotorcycleAdapter,
  CityPresentationBump,
} from "./cityMotorcycleAdapter.ts";
import type {
  BoundarySampler,
  ClampFn,
  MotoInput,
  MotoPose,
} from "./motorcycle.ts";

/** Structural seam kept small so the fixed-step bridge stays unit-testable. */
export type CityMotorcycleControllerPort = Readonly<{
  getPose(): MotoPose;
  update(
    dtSeconds: number,
    input: MotoInput,
    collision: CollisionWorld,
    clampToWorld: ClampFn,
    sampleBoundary: BoundarySampler,
  ): MotoPose;
}>;

export type CityMotorcycleFixedStepFrame = Readonly<{
  /** Authoritative physics pose; use this for gameplay, skids, audio, and telemetry. */
  pose: MotoPose;
  /** One shared presentation pose for both the rider render and chase camera. */
  presentationPose: MotoPose;
  presentationBump: CityPresentationBump;
  fixedSteps: number;
  collisionMicrosteps: number;
  droppedSeconds: number;
  accumulatorSeconds: number;
  simulationTimeSeconds: number;
}>;

function withPresentationBump(
  pose: MotoPose,
  bump: CityPresentationBump,
): MotoPose {
  if (!bump.active || (bump.y === 0 && bump.pitch === 0)) return pose;
  return {
    ...pose,
    y: pose.y + bump.y,
    pitch: pose.pitch + bump.pitch,
  };
}

/**
 * Opt-in live bridge for the city-document path. Motorcycle dynamics run once
 * per fixed tick, while CityMotorcycleAdapter exclusively owns <=0.25m
 * collision microsteps. Forest and legacy-city callers do not construct this.
 */
export class CityMotorcycleFixedStepBridge {
  readonly adapter: CityMotorcycleAdapter;
  private readonly runner: CityFixedStepRunner;
  private pendingHardBrakeEdge = false;

  constructor(adapter: CityMotorcycleAdapter) {
    this.adapter = adapter;
    this.runner = new CityFixedStepRunner();
  }

  get accumulatorSeconds(): number {
    return this.runner.accumulatorSeconds;
  }

  get simulationTimeSeconds(): number {
    return this.runner.simulationTimeSeconds;
  }

  reset(simulationTimeSeconds = 0): void {
    this.runner.reset(simulationTimeSeconds);
    this.pendingHardBrakeEdge = false;
    this.adapter.reset();
  }

  advance(
    renderDeltaSeconds: number,
    input: Readonly<MotoInput>,
    motorcycle: CityMotorcycleControllerPort,
    clampToWorld: ClampFn,
  ): CityMotorcycleFixedStepFrame {
    // Input is sampled per render frame. Preserve a one-shot edge until a
    // fixed tick actually consumes it, including frames that produce no tick.
    if (input.hardBrakeEdge) this.pendingHardBrakeEdge = true;

    // Age an existing presentation impulse before new fixed-tick contacts are
    // produced. A curb crossed this frame therefore renders from age zero.
    this.adapter.advancePresentationBump(renderDeltaSeconds);

    let collisionMicrosteps = 0;
    const timing: CityFixedStepAdvance = this.runner.advanceFixedTicks(
      renderDeltaSeconds,
      (fixedDtSeconds) => {
        const start = motorcycle.getPose();
        this.adapter.beginFixedStep(
          start.x,
          start.z,
          fixedDtSeconds,
          { heading: start.heading, drifting: start.drifting },
        );

        const consumesHardBrakeEdge = this.pendingHardBrakeEdge;
        const fixedInput: MotoInput = {
          throttle: input.throttle,
          boost: input.boost,
          brake: input.brake,
          steer: input.steer,
          hardBrake: input.hardBrake,
          hardBrakeEdge: consumesHardBrakeEdge,
        };
        motorcycle.update(
          fixedDtSeconds,
          fixedInput,
          this.adapter as unknown as CollisionWorld,
          clampToWorld,
          this.adapter.sampleBoundary,
        );
        if (consumesHardBrakeEdge) this.pendingHardBrakeEdge = false;
        collisionMicrosteps += this.adapter.lastMicrostepCount;
      },
    );

    const pose = motorcycle.getPose();
    const presentationBump = this.adapter.consumePresentationBump();
    const presentationPose = withPresentationBump(pose, presentationBump);
    return {
      pose,
      presentationPose,
      presentationBump,
      fixedSteps: timing.fixedSteps,
      collisionMicrosteps,
      droppedSeconds: timing.droppedSeconds,
      accumulatorSeconds: timing.accumulatorSeconds,
      simulationTimeSeconds: timing.simulationTimeSeconds,
    };
  }
}
