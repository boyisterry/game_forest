import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  axisLockCityRoadStroke,
  cityFootprintCornerAtCell,
  projectCityPointerToGround,
  setCityCameraTopDown,
} from "../app/lib/map/cityEditorViewport.ts";

test("pointer projection snaps the centre ray to a one-metre city cell", () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const hit = projectCityPointerToGround(camera, { left: 0, top: 0, width: 100, height: 100 }, 50, 50);
  assert.deepEqual(hit, { x: 0.5, z: -0.5, i: 1100, j: 1079 });
});

test("parallel and behind-camera rays do not invent ground hits", () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 10, -10);
  camera.updateMatrixWorld(true);
  assert.equal(projectCityPointerToGround(camera, { left: 0, top: 0, width: 100, height: 100 }, 50, 50), null);
});

test("road strokes lock to their dominant world axis", () => {
  assert.deepEqual(axisLockCityRoadStroke({ x: 0.5, z: 0.5 }, { x: 12.5, z: 4.5 }), { x: 12.5, z: 0.5 });
  assert.deepEqual(axisLockCityRoadStroke({ x: 0.5, z: 0.5 }, { x: 3.5, z: 14.5 }), { x: 0.5, z: 14.5 });
});

test("large and mixed-parity footprints are centred on the pointed cell", () => {
  assert.deepEqual(cityFootprintCornerAtCell(10, 20, 1, 1), { i: 10, j: 20 });
  assert.deepEqual(cityFootprintCornerAtCell(10, 20, 4, 1), { i: 8.5, j: 20 });
  assert.deepEqual(cityFootprintCornerAtCell(10, 20, 80, 62), { i: -29.5, j: -10.5 });
});

test("top and perspective camera toggles retain the editing target", () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(20, 30, 40);
  const target = new THREE.Vector3(4, 0, -7);
  setCityCameraTopDown(camera, target, true);
  assert.equal(camera.position.x, target.x);
  assert.ok(camera.position.y >= 110);
  setCityCameraTopDown(camera, target, false);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const targetDirection = target.clone().sub(camera.position).normalize();
  assert.ok(direction.distanceTo(targetDirection) < 1e-9);
});
