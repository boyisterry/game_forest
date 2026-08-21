import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  CITY_RIDER_SHADOW_DIRECTION,
  RIDER_CONTACT_SHADOW_FADE_END_METERS,
  RIDER_CONTACT_SHADOW_FADE_START_METERS,
  computeRiderContactShadowPose,
  createRiderContactShadow,
} from "../app/lib/map/riderContactShadow.ts";

const grounded = {
  enabled: true,
  riderVisible: true,
  riderX: 12,
  riderY: 3,
  riderZ: -8,
  surfaceHeight: 3,
  surfaceNormalX: 0,
  surfaceNormalY: 1,
  surfaceNormalZ: 0,
};

test("contact shadow aligns to a slope and projects along the fixed city sun", () => {
  const normal = new THREE.Vector3(-0.2, 1, 0.3).normalize();
  const pose = computeRiderContactShadowPose({
    ...grounded,
    surfaceNormalX: normal.x,
    surfaceNormalY: normal.y,
    surfaceNormalZ: normal.z,
  });
  assert.equal(pose.visible, true);

  const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
  assert.ok(planeNormal.distanceTo(normal) < 1e-10);

  const expectedLongAxis = new THREE.Vector3(
    CITY_RIDER_SHADOW_DIRECTION.x,
    0,
    CITY_RIDER_SHADOW_DIRECTION.z,
  ).projectOnPlane(normal).normalize();
  const actualLongAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
  assert.ok(actualLongAxis.dot(expectedLongAxis) > 0.999999999);
  assert.ok(pose.position.clone().sub(new THREE.Vector3(12, 3, -8)).dot(normal) > 0);
});

test("contact shadow fades out with presentation height and hides without a surface contract", () => {
  const near = computeRiderContactShadowPose({
    ...grounded,
    riderY: grounded.surfaceHeight + RIDER_CONTACT_SHADOW_FADE_START_METERS,
  });
  const middle = computeRiderContactShadowPose({
    ...grounded,
    riderY: grounded.surfaceHeight
      + (RIDER_CONTACT_SHADOW_FADE_START_METERS + RIDER_CONTACT_SHADOW_FADE_END_METERS) / 2,
  });
  const airborne = computeRiderContactShadowPose({
    ...grounded,
    riderY: grounded.surfaceHeight + RIDER_CONTACT_SHADOW_FADE_END_METERS,
  });
  assert.ok(near.opacity > middle.opacity);
  assert.equal(airborne.visible, false);
  assert.equal(airborne.opacity, 0);
  assert.equal(computeRiderContactShadowPose({ ...grounded, enabled: false }).visible, false);
  assert.equal(computeRiderContactShadowPose({ ...grounded, surfaceHeight: Number.NaN }).visible, false);
});

test("contact shadow is a non-shadow-casting transparent falloff plane", () => {
  const shadow = createRiderContactShadow();
  assert.equal(shadow.mesh.castShadow, false);
  assert.equal(shadow.mesh.receiveShadow, false);
  assert.equal(shadow.mesh.material.transparent, true);
  assert.equal(shadow.mesh.material.depthWrite, false);
  assert.equal(shadow.mesh.material.polygonOffset, true);
  shadow.update(grounded);
  assert.equal(shadow.mesh.visible, true);
  assert.match(shadow.mesh.material.fragmentShader, /smoothstep/);
  shadow.dispose();
});
