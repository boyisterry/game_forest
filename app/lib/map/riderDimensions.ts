/**
 * World-space envelope measured after ForestScene normalizes and rotates the
 * shipped rabbit-rider.glb. Keep these values beside the collision radius so a
 * future rider asset swap cannot silently shrink the physical footprint again.
 */
export const RABBIT_RIDER_LENGTH_METERS = 2.0086;
export const RABBIT_RIDER_WIDTH_METERS = 1.0191;
/** Circular broad-phase envelope covering the full scooter at every heading. */
export const RABBIT_RIDER_COLLISION_RADIUS_METERS = 1.05;
