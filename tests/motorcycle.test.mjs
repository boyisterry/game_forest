import assert from "node:assert/strict";
import test from "node:test";
import { Object3D } from "three";
import { MotorcycleController } from "../app/lib/map/motorcycle.ts";
import { CollisionWorld } from "../app/lib/map/collision.ts";

// Logic tests for the self-built ride dynamics + collision. These import the TS
// modules directly (node --experimental-strip-types) so behavior is verified,
// not just source shape.

const noCollision = {
  resolveBike: (bike, forward, speed, heading) => ({ x: bike.x, z: bike.z, speed, heading }),
};
const noClamp = (x, z) => ({ x, z });

const input = (over = {}) => ({
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  hardBrake: false,
  hardBrakeEdge: false,
  ...over,
});

const DT = 1 / 120;

function run(moto, driveInput, seconds, collision = noCollision, clamp = noClamp) {
  for (let t = 0; t < seconds; t += DT) moto.update(DT, driveInput, collision, clamp);
}

function stoppingDistance(decelInput) {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 15);
  const sx = moto.x;
  const sz = moto.z;
  for (let t = 0; t < 90; t += DT) {
    moto.update(DT, decelInput, noCollision, noClamp);
    if (moto.speed <= 0.01) break;
  }
  return Math.hypot(moto.x - sx, moto.z - sz);
}

test("throttle converges to cruise top speed", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 25);
  assert.ok(moto.speed > 26, `cruise speed ~28, got ${moto.speed}`);
  run(moto, input({ throttle: 1 }), 20);
  assert.ok(moto.speed <= 28.01, `capped at vMax, got ${moto.speed}`);
});

test("boost reaches a clearly higher top speed", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1, boost: true }), 35);
  assert.ok(moto.speed > 34, `boost speed ~38, got ${moto.speed}`);
});

test("releasing the throttle coasts the bike down", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 15);
  const before = moto.speed;
  run(moto, input(), 30);
  assert.ok(moto.speed < before * 0.1, `coasts down from ${before}, got ${moto.speed}`);
});

test("hard brake stops shorter than brake, brake shorter than coasting", () => {
  const coast = stoppingDistance(input());
  const brake = stoppingDistance(input({ brake: 1 }));
  const hard = stoppingDistance(input({ hardBrake: true }));
  assert.ok(brake < coast * 0.5, `brake ${brake.toFixed(1)}m well under coast ${coast.toFixed(1)}m`);
  assert.ok(hard < brake * 0.8, `hard ${hard.toFixed(1)}m under brake ${brake.toFixed(1)}m`);
});

test("S brakes to a stop, then after release S creeps in reverse", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 12);
  assert.ok(moto.speed > 8, `precondition forward speed, got ${moto.speed}`);
  // Hold S through a full stop — must NOT reverse while still held.
  for (let t = 0; t < 20; t += DT) {
    moto.update(DT, input({ brake: 1 }), noCollision, noClamp);
  }
  assert.ok(Math.abs(moto.speed) < 0.05, `stopped under brake, got ${moto.speed}`);
  assert.equal(moto.reverseArmed, false, "still holding brake keeps reverse disarmed");
  // Release, then press S again → slow reverse.
  run(moto, input(), 0.2);
  assert.equal(moto.reverseArmed, true, "release arms reverse");
  const zBefore = moto.z;
  run(moto, input({ brake: 1 }), 2);
  assert.ok(moto.speed < -0.8, `creeping reverse, got ${moto.speed}`);
  assert.ok(moto.speed >= -3.25, `reverse capped ~3.2, got ${moto.speed}`);
  assert.ok(moto.z < zBefore, `moved backward along -heading, z ${moto.z} < ${zBefore}`);
});

test("W cancels reverse before accelerating forward", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.reverseArmed = true;
  run(moto, input({ brake: 1 }), 2);
  assert.ok(moto.speed < -1, `in reverse, got ${moto.speed}`);
  run(moto, input({ throttle: 1 }), 3);
  assert.ok(moto.speed > 2, `W recovers into forward, got ${moto.speed}`);
});

test("Space + steer at speed handbrake-drifts with slip and lateral slide", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 12);
  assert.ok(moto.speed > 10, `need pace for drift, got ${moto.speed}`);
  const x0 = moto.x;
  const z0 = moto.z;
  const heading0 = moto.heading;
  // Straight-line reference: Space alone should hard-stop without a long slide.
  const straight = new MotorcycleController();
  straight.reset(0, 0, 0);
  run(straight, input({ throttle: 1 }), 12);
  run(straight, input({ hardBrake: true }), 0.55);
  assert.equal(straight.drifting, false, "straight Space is a hard stop, not a drift");

  // Space + steer: enter drift, nose yaws off the travel path.
  run(moto, input({ hardBrake: true, steer: 1 }), 0.55);
  assert.ok(moto.drifting, "Space+steer should enter drift");
  const slip = Math.abs(((moto.heading - moto.velHeading + Math.PI) % (Math.PI * 2)) - Math.PI);
  assert.ok(slip > 0.12, `travel lags nose (slip), got ${slip}`);
  assert.ok(Math.abs(moto.heading - heading0) > 0.35, `nose yaws hard in drift, Δ=${moto.heading - heading0}`);
  // Path should leave the original heading line (lateral displacement).
  const forward = Math.cos(heading0) * (moto.z - z0) + Math.sin(heading0) * (moto.x - x0);
  const lateral = Math.cos(heading0) * (moto.x - x0) - Math.sin(heading0) * (moto.z - z0);
  assert.ok(Math.abs(lateral) > 0.35, `slides sideways, lateral=${lateral}`);
  assert.ok(forward > 0.5, `still carries forward inertia, forward=${forward}`);
  assert.ok(moto.speed > 2, `inertia keeps speed during the slide, got ${moto.speed}`);
});

test("leans into the turn direction and only while moving", () => {
  const leanFor = (steer) => {
    const moto = new MotorcycleController();
    moto.reset(0, 0, 0);
    run(moto, input({ throttle: 1 }), 10);
    run(moto, input({ throttle: 1, steer }), 2);
    return moto;
  };
  const right = leanFor(1); // D
  const left = leanFor(-1); // A
  assert.ok(right.lean < -0.05, `right turn leans right (negative), got ${right.lean}`);
  assert.ok(left.lean > 0.05, `left turn leans left (positive), got ${left.lean}`);
  assert.ok(right.heading < 0, `right turn decreases heading, got ${right.heading}`);
  assert.ok(left.heading > 0, `left turn increases heading, got ${left.heading}`);

  const parked = new MotorcycleController();
  parked.reset(0, 0, 0);
  run(parked, input({ steer: 1 }), 2);
  assert.equal(parked.heading, 0);
  assert.equal(parked.x, 0);
  assert.equal(parked.z, 0);
});

test("tree blocks the bike, scrubs speed, never penetrates", () => {
  const cw = new CollisionWorld();
  cw.syncChunks([
    { key: "0,0", colliders: { trees: [{ x: 0, z: 20, r: 1.0 }], stones: [], stoneMesh: null } },
  ]);
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  run(moto, input({ throttle: 1 }), 8, cw);
  const dist = Math.hypot(moto.x - 0, moto.z - 20);
  assert.ok(dist >= 1.55 - 1e-3, `bike stays outside trunk, dist ${dist}`);
  assert.ok(moto.z < 20, `bike never passes through the tree, z=${moto.z}`);
  assert.ok(moto.speed < 1, `speed scrubbed by the impact, got ${moto.speed}`);
});

function fakeStoneMesh() {
  return {
    count: 1,
    instanceMatrix: { needsUpdate: false },
    last: null,
    setMatrixAt(i, m) {
      this.last = [...m.elements];
    },
  };
}

function kickScenario(speed, stoneZ) {
  const mesh = fakeStoneMesh();
  const stone = {
    x: 0,
    z: stoneZ,
    y: 0.1,
    r: 0.3,
    mass: 180 * 0.3 ** 3,
    index: 0,
    q: { x: 0, y: 0, z: 0, w: 1 },
    s: { x: 1, y: 1, z: 1 },
  };
  const cw = new CollisionWorld();
  cw.syncChunks([{ key: "0,0", colliders: { trees: [], stones: [stone], stoneMesh: mesh } }]);
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = speed;
  const dummy = new Object3D();
  // Coast into the stone (kick happens), then let the stone roll out and stop.
  for (let t = 0; t < 5; t += DT) {
    moto.update(DT, input(), cw, noClamp);
    cw.stepStones(DT, noClamp);
    cw.writeMatrices(dummy);
  }
  for (let t = 0; t < 10; t += DT) {
    cw.stepStones(DT, noClamp);
    cw.writeMatrices(dummy);
  }
  assert.ok(mesh.last, "rolling stone rewrote its instance matrix");
  return {
    dist: Math.hypot(mesh.last[12] - 0, mesh.last[14] - stoneZ),
    active: cw.activeStoneCount(),
  };
}

test("stones nudge at low speed and roll far at high speed, then stop", () => {
  const slow = kickScenario(4, 5);
  const fast = kickScenario(13, 8);
  assert.ok(slow.dist > 0.3, `gentle bump moves the stone a bit, got ${slow.dist.toFixed(2)}m`);
  assert.ok(fast.dist > 5, `fast impact launches the stone, got ${fast.dist.toFixed(2)}m`);
  assert.ok(fast.dist > slow.dist * 3, `fast (${fast.dist.toFixed(2)}m) >> slow (${slow.dist.toFixed(2)}m)`);
  assert.equal(slow.active, 0, "slow stone came to rest");
  assert.equal(fast.active, 0, "fast stone came to rest");
});

test("world clamp keeps the rider inside bounds", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 14;
  const clamp = (x, z) => ({ x: Math.max(-10, Math.min(10, x)), z: Math.max(-10, Math.min(10, z)) });
  run(moto, input({ throttle: 1 }), 5, noCollision, clamp);
  assert.ok(Math.abs(moto.x) <= 10 && Math.abs(moto.z) <= 10, `inside bounds at ${moto.x},${moto.z}`);
});

test("below 25 km/h Space+steer hard-brakes without drifting", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 5.5;
  moto.heading = 0;
  moto.velHeading = 0;
  for (let t = 0; t < 0.4; t += DT) {
    moto.update(DT, input({ hardBrake: true, steer: 1 }), noCollision, noClamp);
  }
  assert.equal(moto.drifting, false);
});

test("boundary force scrubs speed when driving against it", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 15;
  moto.heading = Math.PI / 2;
  moto.velHeading = Math.PI / 2;
  const wall = () => ({ ax: -14, az: 0, steep: true, height: 10 });
  const before = moto.speed;
  for (let t = 0; t < 0.6; t += DT) {
    moto.update(DT, input({ throttle: 1 }), noCollision, noClamp, wall);
  }
  assert.equal(moto.drifting, false);
  assert.ok(moto.speed < before * 0.85, `scrubs against wall, ${before} -> ${moto.speed}`);
});

test("steep boundary kills active drift", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 20;
  moto.heading = Math.PI / 2;
  moto.velHeading = Math.PI / 2;
  moto.drifting = true;
  const steep = () => ({ ax: -12, az: 0, steep: true, height: 20 });
  for (let t = 0; t < 0.2; t += DT) {
    moto.update(DT, input({ hardBrake: true, steer: 1 }), noCollision, noClamp, steep);
  }
  assert.equal(moto.drifting, false);
});
