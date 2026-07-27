import * as THREE from "three";

export type BrowseMove = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

export const NO_BROWSE_MOVE: BrowseMove = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

// Arrow-key browse panning speed. Scales with how far the camera sits from its
// focus so zoomed-out sweeps cover ground quickly while close-ups stay precise.
const MIN_PAN_DISTANCE = 40;
const MAX_PAN_DISTANCE = 360;
const PAN_SPEED_FACTOR = 1.6;

/**
 * Ground-plane pan delta for arrow-key map browsing in workshop mode.
 *
 * Movement is relative to the camera's horizontal facing, so ArrowUp always
 * pushes "into" the current view and ArrowRight strafes screen-right regardless
 * of the orbit angle. Returns a zero-length vector when no direction is held or
 * the camera looks straight down (no usable horizontal facing).
 */
export function computeBrowsePanDelta(
  cameraPosition: THREE.Vector3,
  target: THREE.Vector3,
  move: BrowseMove,
  dt: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  out.set(0, 0, 0);
  if (dt <= 0) return out;
  if (!move.forward && !move.back && !move.left && !move.right) return out;

  const forward = new THREE.Vector3().subVectors(target, cameraPosition);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) return out;
  forward.normalize();

  // forward × worldUp gives the horizontal screen-right vector.
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));

  const dir = new THREE.Vector3();
  if (move.forward) dir.add(forward);
  if (move.back) dir.addScaledVector(forward, -1);
  if (move.right) dir.add(right);
  if (move.left) dir.addScaledVector(right, -1);
  if (dir.lengthSq() < 1e-6) return out;
  dir.normalize();

  const distance = cameraPosition.distanceTo(target);
  const speed = THREE.MathUtils.clamp(distance, MIN_PAN_DISTANCE, MAX_PAN_DISTANCE) * PAN_SPEED_FACTOR;
  return out.copy(dir).multiplyScalar(speed * dt);
}
