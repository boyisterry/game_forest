export type PendingDriveGateInput = Readonly<{
  requested: boolean;
  riderReady: boolean;
  cityCollisionRequired: boolean;
  cityCollisionReady: boolean;
}>;

export type PendingDriveGateState =
  | "idle"
  | "waiting-rider"
  | "waiting-city-collision"
  | "waiting-rider-and-city-collision"
  | "ready";

/**
 * Resolve an outstanding ride request without depending on Three.js or the DOM.
 * A city collision is only a prerequisite for document-backed city maps; forest
 * maps and the legacy city fallback can start as soon as the rider is ready.
 */
export function resolvePendingDriveGate(input: PendingDriveGateInput): PendingDriveGateState {
  if (!input.requested) return "idle";
  const waitingRider = !input.riderReady;
  const waitingCollision = input.cityCollisionRequired && !input.cityCollisionReady;
  if (waitingRider && waitingCollision) return "waiting-rider-and-city-collision";
  if (waitingRider) return "waiting-rider";
  if (waitingCollision) return "waiting-city-collision";
  return "ready";
}

/** Preserve both an already-running ride and an earlier pending request across an internal rebuild. */
export function shouldResumeDriveAfterRebuild(input: Readonly<{
  driveMode: boolean;
  pendingDrive: boolean;
}>): boolean {
  return input.driveMode || input.pendingDrive;
}
