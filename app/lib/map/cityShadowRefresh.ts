import * as THREE from "three";

export const CITY_EDITOR_SHADOW_REFRESH_MS = 100;
export const CITY_DYNAMIC_SHADOW_REFRESH_MS = CITY_EDITOR_SHADOW_REFRESH_MS;
export const CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS = 4;
export const CITY_SHADOW_HALF_EXTENT_METERS = 70;
export const CITY_SHADOW_LIGHT_OFFSET = Object.freeze({ x: -28, y: 48, z: 22 });

export type CityShadowRefreshInput = Readonly<{
  driveMode: boolean;
  riderPoseChanged: boolean;
  focusDistanceSquared: number;
  elapsedMs: number;
}>;

/**
 * Static city shadows are cached. The rider uses a separate contact shadow, so
 * pose changes never invalidate the city shadow map. Both editor and drive
 * mode only recenter after the focus crosses the multi-metre dead zone.
 */
export function shouldRefreshCityShadow(input: CityShadowRefreshInput) {
  const focusMoved = input.focusDistanceSquared
    >= CITY_EDITOR_SHADOW_FOCUS_DISTANCE_METERS ** 2;
  return focusMoved && input.elapsedMs >= (
    input.driveMode ? CITY_DYNAMIC_SHADOW_REFRESH_MS : CITY_EDITOR_SHADOW_REFRESH_MS
  );
}

/**
 * Atomically commits the directional-light rig used by the next city shadow
 * render and copies its culling frustum into caller-owned frozen-frame state.
 * Ordinary cached-shadow frames must reuse that copy without partially moving
 * the light or target.
 */
export function updateCityShadowRigSnapshot(
  sun: THREE.DirectionalLight,
  focusX: number,
  focusZ: number,
  targetFrustum: THREE.Frustum,
) {
  if (!Number.isFinite(focusX) || !Number.isFinite(focusZ)) {
    throw new TypeError("city shadow focus must contain finite coordinates");
  }
  sun.position.set(
    focusX + CITY_SHADOW_LIGHT_OFFSET.x,
    CITY_SHADOW_LIGHT_OFFSET.y,
    focusZ + CITY_SHADOW_LIGHT_OFFSET.z,
  );
  sun.updateMatrixWorld();
  sun.target.position.set(focusX, 0, focusZ);
  sun.target.updateMatrixWorld();
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -CITY_SHADOW_HALF_EXTENT_METERS;
  shadowCamera.right = CITY_SHADOW_HALF_EXTENT_METERS;
  shadowCamera.top = CITY_SHADOW_HALF_EXTENT_METERS;
  shadowCamera.bottom = -CITY_SHADOW_HALF_EXTENT_METERS;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.updateMatrices(sun);
  targetFrustum.copy(sun.shadow.getFrustum());
  return targetFrustum;
}
