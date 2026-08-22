import assert from "node:assert/strict";
import test from "node:test";

import { PerspectiveCamera } from "three";
import { ChaseCamera } from "../app/lib/map/chaseCamera.ts";

const BASE_POSE = Object.freeze({
  x: 4,
  z: -3,
  y: 0,
  heading: 0,
  velHeading: 0,
  lean: 0,
  pitch: 0,
  speed: 8,
  power: 0,
  slip: 0,
  drifting: false,
});

test("chase camera consumes the shared curb height and pitch exactly once", () => {
  const baseCamera = new PerspectiveCamera();
  const bumpedCamera = new PerspectiveCamera();
  new ChaseCamera().update(1 / 60, baseCamera, BASE_POSE, false);
  new ChaseCamera().update(1 / 60, bumpedCamera, {
    ...BASE_POSE,
    y: 0.12,
    pitch: 0.10,
  }, false);

  const boomLength = 7.5 + Math.abs(BASE_POSE.speed) * 0.12;
  const expectedVerticalDelta = 0.12 + Math.sin(0.10) * boomLength * 0.85;
  assert.ok(Math.abs(
    bumpedCamera.position.y - baseCamera.position.y - expectedVerticalDelta
  ) < 1e-12);
  assert.equal(bumpedCamera.position.x, baseCamera.position.x);
  assert.ok(bumpedCamera.position.z > baseCamera.position.z);
});

test("chase camera clamps its boom before a city obstruction", () => {
  const camera = new PerspectiveCamera();
  const chase = new ChaseCamera();
  let received = null;
  chase.update(1 / 60, camera, BASE_POSE, false, (query) => {
    received = query;
    return 0.4;
  });

  assert.ok(received);
  assert.equal(received.startX, BASE_POSE.x);
  assert.equal(received.startY, 1.4);
  assert.equal(received.startZ, BASE_POSE.z);
  assert.equal(received.radius, 0.28);
  assert.equal(camera.position.x, BASE_POSE.x);
  assert.ok(Math.abs(camera.position.y - (1.4 + (4.4 - 1.4) * 0.4)) < 1e-12);
  const idealZ = BASE_POSE.z - (7.5 + BASE_POSE.speed * 0.12);
  assert.ok(Math.abs(camera.position.z - (BASE_POSE.z + (idealZ - BASE_POSE.z) * 0.4)) < 1e-12);
  assert.equal(chase.getCollisionFraction(), 0.4);
});
