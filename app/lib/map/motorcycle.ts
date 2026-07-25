import type { CollisionWorld } from "./collision";

/**
 * Self-built arcade motorcycle dynamics. Single-track vehicle model on the flat
 * world xz plane: longitudinal force balance, bicycle-model yaw, and a lean
 * angle that targets the physically-correct steady bank atan(a_lat / g). No
 * rigid-body engine -- lean/stability is scripted, which is how arcade bikes
 * are tuned anyway.
 *
 * Speed is signed: +forward / -reverse. S brakes while moving forward; after a
 * full stop, release S then press again to creep in reverse.
 *
 * Space at speed with steer engages an inertial handbrake drift: travel direction
 * (velHeading) lags the bike nose (heading) so the bike slides while yawing.
 *
 * Pure math (no THREE import) so it is directly unit-testable under
 * --experimental-strip-types.
 */

// --- longitudinal ---
const A_NORMAL = 4.2; // m/s^2 throttle
const A_BOOST = 7.5; // shift + throttle
const A_REVERSE = 2.2; // m/s^2 reverse creep
const B_NORMAL = 6.5; // m/s^2 brake
const B_HARD = 11; // m/s^2 hard brake (space, straight)
const B_DRIFT = 4.6; // m/s^2 handbrake while drifting (keeps inertia)
const C_ROLL = 0.35; // m/s^2 rolling resistance
const C_AIR = 0.0049; // m/s^2 per (m/s)^2 -> terminal ~ cruise / boost caps
const V_MAX = 28; // m/s (~100 km/h) cruise
const V_MAX_BOOST = 38; // m/s (~137 km/h) with shift
const V_REVERSE_MAX = 3.2; // m/s slow reverse
const STOP_EPS = 0.12; // treated as fully stopped
/** Peak displayed horsepower at full boost throttle. */
export const PEAK_HORSEPOWER = 58;
const POWER_SMOOTH = 7; // 1/s toward throttle target

// --- steering ---
const WHEELBASE = 1.3;
const STEER_MAX = 0.55; // rad virtual steer angle
const V_REF = 9; // steer authority softens above this speed
const STEER_RATE = 6; // steer smoothing (1/s)

// --- handbrake drift ---
const DRIFT_MIN = 4.2; // m/s needed to start a slide
const DRIFT_YAW_MUL = 2.35; // bicycle yaw boost while drifting
const DRIFT_SPIN = 2.1; // extra yaw from stick (rad/s at full steer)
const DRIFT_ALIGN = 1.35; // velocity→heading catch-up while sliding (low = more slip)
const GRIP_ALIGN = 16; // velocity snaps to heading when gripping
const DRIFT_EXIT = 2.4; // below this speed the slide ends

// --- lean / pitch ---
const A_LAT_MAX = 7; // m/s^2 tire lateral grip (~0.7 g) caps high-speed yaw
const LEAN_MAX = 0.62; // rad ~ 35 deg (a bit more room for drift lean)
const G = 9.81;
const LEAN_STIFF = 90; // spring k
const LEAN_DAMP = 16; // damping c (near critical 2*sqrt(k) ~ 19)
const HARD_LEAN_KILL = 0.6; // straight hard-brake flattens lean
const PITCH_MAX = 0.06; // rad nose dive
const NOD_TIME = 0.3; // s hard-brake nod pulse
const RECENTRE_SPEED = 0.3; // below this m/s, lean snaps back faster

const BIKE_R = 0.55; // collision radius of rider + scooter

export type MotoInput = {
  throttle: number;
  boost: boolean;
  brake: number;
  steer: number;
  hardBrake: boolean;
  hardBrakeEdge: boolean;
};

export type MotoPose = {
  x: number;
  z: number;
  heading: number;
  /** Direction of travel (lags heading while drifting). */
  velHeading: number;
  lean: number;
  pitch: number;
  /** Signed: +forward, -reverse. */
  speed: number;
  /** Normalized engine output 0–1 (feeds HP gauge). */
  power: number;
  /** Signed nose-vs-travel angle (rad). ~0 gripping, grows while drifting — the skid signal. */
  slip: number;
  drifting: boolean;
};

export type ClampFn = (x: number, z: number) => { x: number; z: number };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Shortest signed angle delta into (-π, π]. */
function wrapAngle(a: number) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 - Math.PI : t - Math.PI;
}

export class MotorcycleController {
  x = 0;
  z = 0;
  heading = 0;
  /** Direction of travel (may lag heading while drifting). */
  velHeading = 0;
  /** Signed longitudinal speed (m/s). */
  speed = 0;
  steer = 0;
  lean = 0;
  leanVel = 0;
  /** Signed nose-vs-travel angle; feeds the tire-screech audio. */
  slip = 0;
  pitch = 0;
  nodTimer = 0;
  /** After a full stop, S must be released once before reverse engages. */
  reverseArmed = true;
  drifting = false;
  /** Smoothed 0–1 throttle output for the HUD. */
  power = 0;

  reset(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.velHeading = heading;
    this.speed = 0;
    this.steer = 0;
    this.lean = 0;
    this.leanVel = 0;
    this.slip = 0;
    this.pitch = 0;
    this.nodTimer = 0;
    this.reverseArmed = true;
    this.drifting = false;
    this.power = 0;
  }

  getPose(): MotoPose {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      velHeading: this.velHeading,
      lean: this.lean,
      pitch: this.pitch,
      speed: this.speed,
      power: this.power,
      slip: this.slip,
      drifting: this.drifting,
    };
  }

  update(dt: number, input: MotoInput, collision: CollisionWorld, clampToWorld: ClampFn): MotoPose {
    // Hard brake: edge starts a nod pulse; held applies handbrake / hard stop.
    if (input.hardBrakeEdge) this.nodTimer = NOD_TIME;
    if (this.nodTimer > 0) this.nodTimer = Math.max(0, this.nodTimer - dt);
    const hardBraking = input.hardBrake;
    const brakeHeld = input.brake > 0;
    const throttling = input.throttle > 0;

    let speed = this.speed;
    const absSpeed = Math.abs(speed);
    const dragMag = C_ROLL + C_AIR * absSpeed * absSpeed;

    // Steer early so drift entry can see stick / smoothed wheel.
    const steerFactor = 1 / (1 + Math.max(absSpeed, 0.01) / V_REF);
    const steerTarget = input.steer * STEER_MAX * steerFactor;
    this.steer += (steerTarget - this.steer) * Math.min(1, STEER_RATE * dt);
    const wantDrift =
      hardBraking &&
      speed > DRIFT_MIN &&
      (Math.abs(input.steer) > 0.12 || Math.abs(this.steer) > 0.06 || this.drifting);

    // 1. Longitudinal force balance (signed speed).
    if (throttling) {
      this.reverseArmed = false;
      if (speed < 0) {
        // W cancels reverse before going forward.
        speed += A_NORMAL * 1.6 * dt;
        if (speed > 0) speed = 0;
      }
      if (speed >= 0) {
        const accel = input.throttle * (input.boost ? A_BOOST : A_NORMAL);
        // Light throttle during a slide keeps inertia without killing the drift.
        const driftCoast = this.drifting && hardBraking ? 0.35 : 1;
        speed += (accel * driftCoast - dragMag) * dt;
        const vmax = input.boost ? V_MAX_BOOST : V_MAX;
        speed = clamp(speed, 0, vmax);
      }
      if (!(hardBraking && speed > DRIFT_EXIT)) this.drifting = false;
    } else if (hardBraking) {
      if (wantDrift) {
        this.drifting = true;
        // Softer long brake — inertia carries the slide.
        speed = Math.max(0, speed - B_DRIFT * dt);
        if (speed <= DRIFT_EXIT) {
          speed = Math.max(0, speed - (B_HARD - B_DRIFT) * dt);
          if (speed <= STOP_EPS) {
            speed = 0;
            this.drifting = false;
            this.reverseArmed = false;
          }
        }
      } else {
        this.drifting = false;
        if (speed > 0) speed = Math.max(0, speed - B_HARD * dt);
        else if (speed < 0) speed = Math.min(0, speed + B_HARD * dt);
        if (Math.abs(speed) <= STOP_EPS) {
          speed = 0;
          this.reverseArmed = false;
        }
      }
    } else if (brakeHeld) {
      this.drifting = false;
      if (speed > STOP_EPS) {
        // Forward motion: S is a brake.
        speed = Math.max(0, speed - B_NORMAL * dt);
        if (speed <= STOP_EPS) {
          speed = 0;
          // Must release S before reverse — do not roll straight into reverse.
          this.reverseArmed = false;
        }
      } else if (this.reverseArmed || speed < -STOP_EPS) {
        // Stopped (armed) or already reversing: S creeps backward.
        speed -= A_REVERSE * dt;
        speed = Math.max(speed, -V_REVERSE_MAX);
        this.reverseArmed = true;
      } else {
        // Fully stopped while still holding the brake that stopped us.
        speed = 0;
      }
    } else {
      this.drifting = false;
      // Coast toward zero.
      if (speed > 0) speed = Math.max(0, speed - dragMag * dt);
      else if (speed < 0) speed = Math.min(0, speed + dragMag * dt);
      if (Math.abs(speed) <= STOP_EPS) {
        speed = 0;
        this.reverseArmed = true;
      }
    }

    this.speed = speed;

    // 2–3. Yaw + travel direction. Drifting: nose yaws hard while velocity lags.
    let yawRate = (-speed * Math.tan(this.steer)) / WHEELBASE;
    if (this.drifting) {
      yawRate *= DRIFT_YAW_MUL;
      yawRate += -input.steer * DRIFT_SPIN;
      const yawMax = 3.4;
      yawRate = clamp(yawRate, -yawMax, yawMax);
    } else if (Math.abs(speed) > 0.5) {
      const yawMax = A_LAT_MAX / Math.abs(speed);
      yawRate = clamp(yawRate, -yawMax, yawMax);
    }
    this.heading += yawRate * dt;

    const alignRate = this.drifting ? DRIFT_ALIGN : GRIP_ALIGN;
    let slip = wrapAngle(this.heading - this.velHeading);
    this.velHeading += slip * Math.min(1, alignRate * dt);
    if (!this.drifting && Math.abs(wrapAngle(this.heading - this.velHeading)) < 0.03) {
      this.velHeading = this.heading;
    }
    slip = wrapAngle(this.heading - this.velHeading);
    this.slip = slip;

    // Move along velocity (slide path), not necessarily the nose.
    const travelHeading = speed >= 0 || this.drifting ? this.velHeading : this.heading;
    const fx = Math.sin(travelHeading);
    const fz = Math.cos(travelHeading);
    let x = this.x + fx * speed * dt;
    let z = this.z + fz * speed * dt;

    // 4. Collisions correct position/speed/heading and kick stones.
    const resolved = collision.resolveBike(
      { x, z, r: BIKE_R },
      // Travel direction drives impact response while the nose may be sideways.
      { x: fx, z: fz },
      speed,
      this.heading,
    );
    x = resolved.x;
    z = resolved.z;
    this.speed = resolved.speed;
    speed = resolved.speed;
    if (resolved.heading !== this.heading) {
      this.heading = resolved.heading;
      // Only glue travel to the nose after a facing change from impact.
      if (!this.drifting) this.velHeading = this.heading;
    } else if (!this.drifting) {
      this.velHeading = this.heading;
    }

    // 5. World bounds (small inset so the rider can hug the visible edge).
    const clamped = clampToWorld(x, z);
    this.x = clamped.x;
    this.z = clamped.z;

    // 6. Lean: bank from yaw, plus extra slip lean while drifting.
    const aLat = yawRate * speed;
    let leanTarget = Math.atan(aLat / G) + slip * (this.drifting ? 0.9 : 0.25);
    if (hardBraking && !this.drifting) leanTarget *= 1 - HARD_LEAN_KILL;
    else if (brakeHeld && speed > STOP_EPS && !this.drifting) leanTarget *= 1 - HARD_LEAN_KILL;
    leanTarget = clamp(leanTarget, -LEAN_MAX, LEAN_MAX);
    const leanA = LEAN_STIFF * (leanTarget - this.lean) - LEAN_DAMP * this.leanVel;
    this.leanVel += leanA * dt;
    this.lean += this.leanVel * dt;
    if (Math.abs(speed) < RECENTRE_SPEED) {
      // Parked / slow -> recentre quickly so the bike doesn't sit leaning.
      this.lean += (0 - this.lean) * Math.min(1, 8 * dt);
      this.leanVel *= 1 - Math.min(1, 8 * dt);
    }
    this.lean = clamp(this.lean, -LEAN_MAX, LEAN_MAX);

    // 7. Pitch: nod pulse on hard-brake onset, slight sustained dive while held.
    const pitchTarget = (this.nodTimer > 0 ? PITCH_MAX : 0) + (hardBraking ? PITCH_MAX * 0.35 : 0);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, 10 * dt);

    // 8. Engine power for the speedometer / HP dial.
    let powerTarget = 0.05;
    if (throttling) powerTarget = input.boost ? 1 : 0.72;
    else if (hardBraking) powerTarget = 0.02;
    else if (brakeHeld && speed > STOP_EPS) powerTarget = 0.04;
    else if (brakeHeld && (this.reverseArmed || speed < -STOP_EPS)) powerTarget = 0.38;
    else if (Math.abs(speed) > 1) powerTarget = 0.1;
    this.power += (powerTarget - this.power) * Math.min(1, POWER_SMOOTH * dt);
    this.power = clamp(this.power, 0, 1);

    return this.getPose();
  }
}
