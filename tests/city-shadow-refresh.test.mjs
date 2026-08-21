import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  CITY_DYNAMIC_SHADOW_REFRESH_MS,
  CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS,
  CITY_EDITOR_SHADOW_REFRESH_MS,
  CITY_SHADOW_HALF_EXTENT_METERS,
  CITY_SHADOW_LIGHT_OFFSET,
  shouldRefreshCityShadow,
  updateCityShadowRigSnapshot,
} from "../app/lib/map/cityShadowRefresh.ts";

test("rider pose changes never invalidate the static city shadow", () => {
  assert.equal(shouldRefreshCityShadow({
    driveMode: true,
    riderPoseChanged: true,
    focusDistanceSquared: 0,
    elapsedMs: 10_000,
  }), false);
});

test("riding recenters static shadows only after the multi-metre dead zone", () => {
  const distanceSquared = CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS ** 2;
  assert.equal(shouldRefreshCityShadow({
    driveMode: true,
    riderPoseChanged: false,
    focusDistanceSquared: distanceSquared - 1e-6,
    elapsedMs: CITY_DYNAMIC_SHADOW_REFRESH_MS,
  }), false);
  assert.equal(shouldRefreshCityShadow({
    driveMode: true,
    riderPoseChanged: false,
    focusDistanceSquared: distanceSquared,
    elapsedMs: CITY_DYNAMIC_SHADOW_REFRESH_MS,
  }), true);
  assert.ok(CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS >= 3);
});

test("editor browsing retains the distance and time shadow budget", () => {
  const distanceSquared = CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS ** 2;
  assert.equal(shouldRefreshCityShadow({
    driveMode: false,
    riderPoseChanged: true,
    focusDistanceSquared: distanceSquared,
    elapsedMs: CITY_EDITOR_SHADOW_REFRESH_MS - 1,
  }), false);
  assert.equal(shouldRefreshCityShadow({
    driveMode: false,
    riderPoseChanged: false,
    focusDistanceSquared: distanceSquared,
    elapsedMs: CITY_EDITOR_SHADOW_REFRESH_MS,
  }), true);
});

test("shadow rig refresh atomically freezes the exact directional-light frustum", () => {
  const sun = new THREE.DirectionalLight();
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 160;
  const snapshot = new THREE.Frustum();
  updateCityShadowRigSnapshot(sun, 12, -8, snapshot);

  assert.deepEqual(sun.position.toArray(), [
    12 + CITY_SHADOW_LIGHT_OFFSET.x,
    CITY_SHADOW_LIGHT_OFFSET.y,
    -8 + CITY_SHADOW_LIGHT_OFFSET.z,
  ]);
  assert.deepEqual(sun.target.position.toArray(), [12, 0, -8]);
  assert.equal(sun.shadow.camera.left, -CITY_SHADOW_HALF_EXTENT_METERS);
  assert.equal(sun.shadow.camera.right, CITY_SHADOW_HALF_EXTENT_METERS);
  assert.equal(sun.shadow.camera.top, CITY_SHADOW_HALF_EXTENT_METERS);
  assert.equal(sun.shadow.camera.bottom, -CITY_SHADOW_HALF_EXTENT_METERS);
  assert.equal(snapshot.containsPoint(new THREE.Vector3(12, 0, -8)), true);
  assert.deepEqual(
    snapshot.planes.map((plane) => [...plane.normal.toArray(), plane.constant]),
    sun.shadow.getFrustum().planes.map((plane) => [...plane.normal.toArray(), plane.constant]),
  );

  const frozenPlanes = snapshot.planes.map((plane) => [...plane.normal.toArray(), plane.constant]);
  sun.position.set(500, 500, 500);
  sun.updateMatrixWorld();
  sun.target.position.set(600, 0, 600);
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  assert.deepEqual(
    snapshot.planes.map((plane) => [...plane.normal.toArray(), plane.constant]),
    frozenPlanes,
    "the caller-owned snapshot must not track later partial light mutations",
  );

  updateCityShadowRigSnapshot(sun, 100, 120, snapshot);
  assert.equal(snapshot.containsPoint(new THREE.Vector3(100, 0, 120)), true);
  assert.notDeepEqual(
    snapshot.planes.map((plane) => [...plane.normal.toArray(), plane.constant]),
    frozenPlanes,
  );
});

test("shadow rig snapshot rejects non-finite focus coordinates", () => {
  assert.throws(() => updateCityShadowRigSnapshot(
    new THREE.DirectionalLight(),
    Number.NaN,
    0,
    new THREE.Frustum(),
  ), /finite coordinates/);
});
