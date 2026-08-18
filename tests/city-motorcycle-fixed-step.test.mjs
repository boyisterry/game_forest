import assert from "node:assert/strict";
import test from "node:test";

import { DocumentCityCollisionWorld } from "../app/lib/map/cityDocumentCollision.ts";
import { CityFixedStepRunner } from "../app/lib/map/cityFixedStep.ts";
import { CityMotorcycleAdapter } from "../app/lib/map/cityMotorcycleAdapter.ts";
import { CityMotorcycleFixedStepBridge } from "../app/lib/map/cityMotorcycleFixedStep.ts";
import { MotorcycleController } from "../app/lib/map/motorcycle.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";

const IDENTITY_CLAMP = (x, z) => ({ x, z });
const IDLE_INPUT = Object.freeze({
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  hardBrake: false,
  hardBrakeEdge: false,
});

function emptySources() {
  return deriveRoadCollisionSources({ nodes: [], edges: [], intersectionOverrides: {} });
}

function fakeAdapter(bump = { y: 0, pitch: 0, active: false, sequence: 0 }) {
  const starts = [];
  let began = false;
  let resetCount = 0;
  return {
    starts,
    advanced: [],
    get resetCount() {
      return resetCount;
    },
    get lastMicrostepCount() {
      return 2;
    },
    beginFixedStep(x, z, dt, state) {
      starts.push({ x, z, dt, ...state });
      began = true;
    },
    resolveBike(bike, _forward, speed, heading) {
      assert.equal(began, true, "beginFixedStep must snapshot before controller movement");
      began = false;
      return { x: bike.x, z: bike.z, speed, heading };
    },
    sampleBoundary: () => ({
      ax: 0,
      az: 0,
      steep: false,
      height: 0,
      gx: 0,
      gz: 0,
      speedCap: Infinity,
    }),
    advancePresentationBump(dt) {
      this.advanced.push(dt);
    },
    consumePresentationBump() {
      return bump;
    },
    reset() {
      resetCount += 1;
      began = false;
    },
  };
}

function fakeMotorcycle(adapter) {
  const inputEdges = [];
  const pose = {
    x: 0,
    z: 0,
    y: 0,
    heading: Math.PI / 2,
    velHeading: Math.PI / 2,
    lean: 0,
    pitch: 0,
    speed: 8,
    power: 0,
    slip: 0,
    drifting: false,
  };
  return {
    inputEdges,
    getPose() {
      return { ...pose };
    },
    update(dt, input, collision, clamp, sampleBoundary) {
      inputEdges.push(input.hardBrakeEdge);
      assert.equal(sampleBoundary, adapter.sampleBoundary);
      const target = clamp(pose.x + 1, pose.z);
      const resolved = collision.resolveBike(
        { x: target.x, z: target.z, r: 0.55 },
        { x: 1, z: 0 },
        pose.speed,
        pose.heading,
      );
      pose.x = resolved.x;
      pose.z = resolved.z;
      pose.speed = resolved.speed;
      pose.heading = resolved.heading;
      return { ...pose, dt };
    },
  };
}

test("clock-only fixed ticks retain the catch-up cap without running a move resolver", () => {
  const runner = new CityFixedStepRunner();
  const times = [];
  const frame = runner.advanceFixedTicks(0.1, (dt, time) => times.push({ dt, time }));

  assert.equal(frame.fixedSteps, 6);
  assert.equal(frame.microsteps, 0);
  assert.equal(frame.droppedSeconds, 0.05);
  assert.ok(Math.abs(frame.accumulatorSeconds) < 1e-12);
  assert.equal(times.length, 6);
  assert.equal(times[0].dt, 1 / 120);
  assert.equal(times[0].time, 0);
  assert.equal(times[5].time, 5 / 120);
});

test("bridge snapshots every fixed tick, consumes an input edge once, and shares one bump pose", () => {
  const adapter = fakeAdapter({ y: 0.12, pitch: -0.10, active: true, sequence: 4 });
  const motorcycle = fakeMotorcycle(adapter);
  const bridge = new CityMotorcycleFixedStepBridge(adapter);
  const frame = bridge.advance(1 / 60, {
    ...IDLE_INPUT,
    hardBrake: true,
    hardBrakeEdge: true,
  }, motorcycle, IDENTITY_CLAMP);

  assert.equal(frame.fixedSteps, 2);
  assert.equal(frame.collisionMicrosteps, 4);
  assert.deepEqual(motorcycle.inputEdges, [true, false]);
  assert.deepEqual(adapter.starts.map(({ x, z }) => ({ x, z })), [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
  ]);
  assert.ok(adapter.starts.every(({ dt }) => dt === 1 / 120));
  assert.deepEqual(adapter.advanced, [1 / 60]);
  assert.equal(frame.pose.y, 0);
  assert.equal(frame.pose.pitch, 0);
  assert.equal(frame.presentationPose.y, 0.12);
  assert.equal(frame.presentationPose.pitch, -0.10);
  assert.equal(frame.presentationBump.sequence, 4);
});

test("hard-brake edge survives a render frame that produces no fixed tick", () => {
  const adapter = fakeAdapter();
  const motorcycle = fakeMotorcycle(adapter);
  const bridge = new CityMotorcycleFixedStepBridge(adapter);

  const emptyFrame = bridge.advance(1 / 240, {
    ...IDLE_INPUT,
    hardBrake: true,
    hardBrakeEdge: true,
  }, motorcycle, IDENTITY_CLAMP);
  assert.equal(emptyFrame.fixedSteps, 0);
  assert.deepEqual(motorcycle.inputEdges, []);

  const tickFrame = bridge.advance(1 / 240, {
    ...IDLE_INPUT,
    hardBrake: true,
  }, motorcycle, IDENTITY_CLAMP);
  assert.equal(tickFrame.fixedSteps, 1);
  assert.deepEqual(motorcycle.inputEdges, [true]);

  bridge.reset();
  assert.equal(adapter.resetCount, 1);
  bridge.advance(1 / 120, IDLE_INPUT, motorcycle, IDENTITY_CLAMP);
  assert.deepEqual(motorcycle.inputEdges, [true, false]);
});

test("live motorcycle replay is identical at 30, 60, 120, and 144Hz", () => {
  const simulate = (renderHz) => {
    const world = new DocumentCityCollisionWorld([], emptySources());
    const adapter = new CityMotorcycleAdapter(world);
    const bridge = new CityMotorcycleFixedStepBridge(adapter);
    const motorcycle = new MotorcycleController();
    motorcycle.reset(0, 0, 0);
    motorcycle.speed = 38;
    let fixedSteps = 0;
    let collisionMicrosteps = 0;
    for (let frameIndex = 0; frameIndex < renderHz; frameIndex += 1) {
      const frame = bridge.advance(1 / renderHz, {
        ...IDLE_INPUT,
        throttle: 1,
        boost: true,
      }, motorcycle, IDENTITY_CLAMP);
      fixedSteps += frame.fixedSteps;
      collisionMicrosteps += frame.collisionMicrosteps;
    }
    return { pose: motorcycle.getPose(), fixedSteps, collisionMicrosteps };
  };

  const runs = [30, 60, 120, 144].map(simulate);
  const reference = runs[0];
  for (const run of runs) {
    assert.equal(run.fixedSteps, 120);
    assert.equal(run.collisionMicrosteps, 240);
    assert.deepEqual(run.pose, reference.pose);
  }
});
