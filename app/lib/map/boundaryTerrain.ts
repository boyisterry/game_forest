import {
  eastBoundaryX,
  westBoundaryX,
  northBoundaryZ,
  southBoundaryZ,
} from "./world.ts";

export const FOOTHILL_WIDTH = 18;
export const STEEP_WIDTH = 55;
export const STEEP_ACCEL = 14;
export const FOOTHILL_ACCEL = 3.5;

export type BoundarySample = {
  ax: number;
  az: number;
  steep: boolean;
  height: number;
};

function bandFromSigned(distPastFoot: number): { t: number; steep: boolean; height: number } {
  if (distPastFoot <= 0) return { t: 0, steep: false, height: 0 };
  if (distPastFoot < FOOTHILL_WIDTH) {
    const u = distPastFoot / FOOTHILL_WIDTH;
    return { t: u * (FOOTHILL_ACCEL / STEEP_ACCEL), steep: false, height: u * 4 };
  }
  const into = distPastFoot - FOOTHILL_WIDTH;
  const u = Math.min(1, into / STEEP_WIDTH);
  return {
    t: FOOTHILL_ACCEL / STEEP_ACCEL + u * (1 - FOOTHILL_ACCEL / STEEP_ACCEL),
    steep: true,
    height: 4 + u * 46,
  };
}

export function sampleBoundary(x: number, z: number, seed: number): BoundarySample {
  const eastPast = x - eastBoundaryX(z, seed);
  const westPast = westBoundaryX(z, seed) - x;
  const northPast = northBoundaryZ(x, seed) - z;
  const southPast = z - southBoundaryZ(x, seed);

  let ax = 0;
  let az = 0;
  let steep = false;
  let height = 0;

  const e = bandFromSigned(eastPast);
  if (e.t > 0) {
    ax += -STEEP_ACCEL * e.t;
    steep ||= e.steep;
    height = Math.max(height, e.height);
  }
  const w = bandFromSigned(westPast);
  if (w.t > 0) {
    ax += STEEP_ACCEL * w.t;
    steep ||= w.steep;
    height = Math.max(height, w.height * 0.15);
  }
  const n = bandFromSigned(northPast);
  if (n.t > 0) {
    az += STEEP_ACCEL * n.t;
    steep ||= n.steep;
    height = Math.max(height, n.height);
  }
  const s = bandFromSigned(southPast);
  if (s.t > 0) {
    az += -STEEP_ACCEL * s.t;
    steep ||= s.steep;
  }

  return { ax, az, steep, height };
}

export function boundaryHeight(x: number, z: number, seed: number): number {
  return sampleBoundary(x, z, seed).height;
}
