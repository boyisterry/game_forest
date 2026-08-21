export const MIN_DYNAMIC_PIXEL_RATIO = 0.7;
export const CITY_RENDER_IDLE_DELAY_MS = 320;
export const CITY_RIDE_CAMERA_FAR_METERS = 3_200;
/** Full template detail stays local while distant blocks use massing proxies. */
export const CITY_RIDE_DETAILED_PLACEMENT_RADIUS_METERS = 320;

export type CameraDepthBudgetInput = Readonly<{
  city: boolean;
  driveMode: boolean;
  currentNear: number;
  currentFar: number;
}>;

/**
 * Driving may tighten the near plane for cockpit-scale precision, but must not
 * use a few-block far plane. Distant city continuity is carried by fog + far
 * LOD, with the projection edge placed beyond the fog-visible range.
 */
export function chooseCameraDepthBudget(input: CameraDepthBudgetInput) {
  if (!input.city || !input.driveMode) {
    return Object.freeze({ near: input.currentNear, far: input.currentFar });
  }
  return Object.freeze({
    near: 0.5,
    // At the city's 0.00055 exponential fog density, geometry is already
    // blended to roughly 4.5% by this distance, so the projection edge is
    // hidden without submitting an unbounded stress-fixture world.
    far: CITY_RIDE_CAMERA_FAR_METERS,
  });
}

export type DynamicPixelRatioInput = Readonly<{
  current: number;
  maximum: number;
  samples: number;
  frameTimeP95Ms: number;
  framesOver25MsRatio: number;
}>;

/** Hysteresis keeps DPR changes gradual and avoids oscillating around 60 fps. */
export function chooseDynamicPixelRatio(input: DynamicPixelRatioInput) {
  const ceiling = Math.max(MIN_DYNAMIC_PIXEL_RATIO, input.maximum);
  const current = Math.min(ceiling, Math.max(MIN_DYNAMIC_PIXEL_RATIO, input.current));
  if (input.samples < 45) return current;
  if (input.frameTimeP95Ms > 25 || input.framesOver25MsRatio > 0.18) {
    return Math.max(MIN_DYNAMIC_PIXEL_RATIO, Math.round((current - 0.15) * 20) / 20);
  }
  if (input.frameTimeP95Ms < 17.5 && input.framesOver25MsRatio < 0.02) {
    return Math.min(ceiling, Math.round((current + 0.1) * 20) / 20);
  }
  return current;
}

export type IdleCityRenderInput = Readonly<{
  city: boolean;
  driveMode: boolean;
  pendingDrive: boolean;
  browseMoving: boolean;
  forceRenderFrames: number;
  elapsedSinceInteractionMs: number;
}>;

export function shouldSkipIdleCityRender(input: IdleCityRenderInput) {
  return input.city
    && !input.driveMode
    && !input.pendingDrive
    && !input.browseMoving
    && input.forceRenderFrames <= 0
    && input.elapsedSinceInteractionMs >= CITY_RENDER_IDLE_DELAY_MS;
}
