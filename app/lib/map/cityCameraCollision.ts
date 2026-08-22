import type { CompiledCityCollisionRuntime } from "./cityCompiledCollisionRuntime.ts";

export type CityCameraCollisionQuery = Readonly<{
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  radius: number;
}>;

const CAMERA_COLLISION_SKIN_METERS = 0.08;
const MIN_HORIZONTAL_SWEEP_METERS = 1e-6;

/**
 * Returns the unobstructed fraction of the chase-camera boom. The same compiled
 * city solids used by the rider are swept with a small camera radius so walls,
 * glazing, columns and facade decorations cannot sit between the rider and the
 * camera.
 */
export function resolveCityCameraCollisionFraction(
  runtime: CompiledCityCollisionRuntime | null,
  query: CityCameraCollisionQuery,
): number {
  if (!runtime) return 1;
  const deltaX = query.endX - query.startX;
  const deltaZ = query.endZ - query.startZ;
  const horizontalDistance = Math.hypot(deltaX, deltaZ);
  if (horizontalDistance <= MIN_HORIZONTAL_SWEEP_METERS) return 1;

  const result = runtime.querySweep({
    startX: query.startX,
    startZ: query.startZ,
    deltaX,
    deltaZ,
    minY: Math.min(query.startY, query.endY) - query.radius,
    maxY: Math.max(query.startY, query.endY) + query.radius,
    radius: query.radius,
  });
  if (!result.hit) return 1;
  return Math.max(0, Math.min(
    1,
    (result.hit.distance - CAMERA_COLLISION_SKIN_METERS) / horizontalDistance,
  ));
}
