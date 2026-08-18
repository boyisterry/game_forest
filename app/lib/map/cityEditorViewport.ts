import * as THREE from "three";
import { worldToNearestTileCenter } from "./cityTiles.ts";

export type CityViewportPoint = Readonly<{
  x: number;
  z: number;
  i: number;
  j: number;
}>;

export type CityViewportRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/**
 * Project a client-space pointer to the city editing plane and snap it to the
 * nearest one-metre cell centre. This function deliberately ignores render
 * geometry: placement and road tools have one stable ground contract.
 */
export function projectCityPointerToGround(
  camera: THREE.Camera,
  rect: CityViewportRect,
  clientX: number,
  clientY: number,
  outRaycaster = new THREE.Raycaster(),
): CityViewportPoint | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return null;
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  outRaycaster.setFromCamera(pointer, camera);
  const directionY = outRaycaster.ray.direction.y;
  if (Math.abs(directionY) < 1e-8) return null;
  const distance = -outRaycaster.ray.origin.y / directionY;
  if (!Number.isFinite(distance) || distance < 0) return null;
  const hit = outRaycaster.ray.at(distance, new THREE.Vector3());
  const snapped = worldToNearestTileCenter(hit.x, hit.z);
  return Object.freeze({ x: snapped.x, z: snapped.z, i: snapped.i, j: snapped.j });
}

export function axisLockCityRoadStroke(
  start: Readonly<{ x: number; z: number }>,
  end: Readonly<{ x: number; z: number }>,
): Readonly<{ x: number; z: number }> {
  const dx = Math.abs(end.x - start.x);
  const dz = Math.abs(end.z - start.z);
  return Object.freeze(dx >= dz
    ? { x: end.x, z: start.z }
    : { x: start.x, z: end.z });
}

/** Centre an integer-sized footprint on the pointed cell centre. */
export function cityFootprintCornerAtCell(
  cellI: number,
  cellJ: number,
  widthTiles: number,
  depthTiles: number,
): Readonly<{ i: number; j: number }> {
  if (!Number.isInteger(cellI) || !Number.isInteger(cellJ)
    || !Number.isInteger(widthTiles) || !Number.isInteger(depthTiles)
    || widthTiles <= 0 || depthTiles <= 0) {
    throw new TypeError("city footprint placement requires positive integer dimensions and an integer cell");
  }
  return Object.freeze({
    i: cellI + 0.5 - widthTiles * 0.5,
    j: cellJ + 0.5 - depthTiles * 0.5,
  });
}

export function setCityCameraTopDown(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  topDown: boolean,
) {
  if (topDown) {
    camera.position.set(target.x, Math.max(camera.position.distanceTo(target), 110), target.z + 0.01);
    camera.up.set(0, 0, -1);
  } else {
    const distance = Math.max(32, camera.position.distanceTo(target));
    camera.position.set(target.x + distance * 0.58, target.y + distance * 0.42, target.z + distance * 0.7);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}
