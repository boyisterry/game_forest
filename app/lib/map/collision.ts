import { Quaternion, Vector3 } from "three";
import type { InstancedMesh, Object3D } from "three";

/**
 * Self-contained arcade collision for the ride mode. No rigid-body engine: trees
 * are static circles that push the bike out and scrub speed; stones are dynamic
 * bodies that get kicked, roll, and write their new pose back into the chunk's
 * InstancedMesh. Core math is plain numbers so it can be unit-tested headless.
 */

export type TreeCollider = { x: number; z: number; r: number };

export type StoneCollider = {
  x: number;
  z: number;
  y: number;
  r: number;
  mass: number;
  index: number;
  /** Initial orientation (baked random spin) so rolling composes on top of it. */
  q: { x: number; y: number; z: number; w: number };
  /** Initial per-axis scale (stone profile is non-uniform). */
  s: { x: number; y: number; z: number };
};

export type ChunkColliders = {
  trees: TreeCollider[];
  stones: StoneCollider[];
  stoneMesh: InstancedMesh | null;
  /** Visual counterpart that follows the same live rolling transform. */
  stoneShardMesh?: InstancedMesh | null;
};

const BIKE_MASS = 140;
/** Fraction of impact speed lost when ramming a tree head-on (grazing loses less). */
const TREE_SPEED_LOSS = 0.75;
/** Grass rolling resistance (m/s^2). From 12 m/s a stone travels ~10 m and rolls ~5 turns. */
const STONE_DECEL = 7;
const STONE_STOP = 0.18;
/** Kick direction blends bike-forward with the contact normal (stone scatters slightly). */
const KICK_NORMAL_BLEND = 0.3;

type StoneBody = {
  chunkKey: string;
  collider: StoneCollider;
  x: number;
  z: number;
  vx: number;
  vz: number;
  roll: number;
  dirX: number;
  dirZ: number;
  active: boolean;
  dirty: boolean;
};

type ChunkEntry = {
  trees: TreeCollider[];
  stones: StoneCollider[];
  mesh: InstancedMesh | null;
  shardMesh: InstancedMesh | null;
};

const bodyKey = (chunkKey: string, index: number) => `${chunkKey}#${index}`;

export class CollisionWorld {
  private chunks = new Map<string, ChunkEntry>();
  private bodies = new Map<string, StoneBody>();
  private registered = new Set<string>();
  private statics: TreeCollider[] = [];
  private readonly qRoll = new Quaternion();
  private readonly qInitial = new Quaternion();
  private readonly qTotal = new Quaternion();
  private readonly axis = new Vector3();
  private lastSampler: ((x: number, z: number) => { height: number }) | null = null;

  /** Fired with a 0..1 intensity when a stone is kicked (drives the impact SFX). */
  onKick?: (intensity: number) => void;
  /** Fired with a 0..1 intensity when the bike rams a tree/post hard enough. */
  onTreeHit?: (intensity: number) => void;

  /** Delivery posts and other always-present static obstacles. */
  registerStatic(c: TreeCollider) {
    this.statics.push(c);
  }

  clearStatic() {
    this.statics.length = 0;
  }

  /** Diff loaded chunks against the registry; register new, drop gone. */
  syncChunks(entries: Iterable<{ key: string; colliders: ChunkColliders }>) {
    const seen = new Set<string>();
    for (const entry of entries) {
      seen.add(entry.key);
      if (!this.registered.has(entry.key)) this.registerChunk(entry.key, entry.colliders);
    }
    for (const key of [...this.registered]) {
      if (!seen.has(key)) this.unregisterChunk(key);
    }
  }

  private registerChunk(key: string, c: ChunkColliders) {
    this.registered.add(key);
    this.chunks.set(key, {
      trees: c.trees,
      stones: c.stones,
      mesh: c.stoneMesh,
      shardMesh: c.stoneShardMesh ?? null,
    });
    for (const s of c.stones) {
      const bk = bodyKey(key, s.index);
      let body = this.bodies.get(bk);
      if (!body) {
        body = {
          chunkKey: key,
          collider: s,
          x: s.x,
          z: s.z,
          vx: 0,
          vz: 0,
          roll: 0,
          dirX: 0,
          dirZ: 0,
          active: false,
          dirty: false,
        };
        this.bodies.set(bk, body);
      } else {
        // Chunk reloaded after unload: reset to seed unless still rolling (rare; it
        // would only persist if the rider never left, in which case the chunk never
        // unloaded). Fresh load -> snap back to the deterministic placement.
        body.collider = s;
        if (!body.active) {
          body.x = s.x;
          body.z = s.z;
          body.vx = 0;
          body.vz = 0;
          body.roll = 0;
          body.dirty = false;
        }
      }
    }
  }

  private unregisterChunk(key: string) {
    this.registered.delete(key);
    this.chunks.delete(key);
    for (const [bk, body] of this.bodies) {
      if (body.chunkKey === key) this.bodies.delete(bk);
    }
  }

  clear() {
    this.chunks.clear();
    this.bodies.clear();
    this.registered.clear();
    this.statics.length = 0;
  }

  /**
   * Resolve the bike against trees, static posts, and stones. Mutates kicked
   * stones and returns the corrected bike pose. Two iterations stabilize
   * multi-obstacle contacts.
   */
  resolveBike(
    bike: { x: number; z: number; r: number },
    forward: { x: number; z: number },
    speed: number,
    heading: number,
  ): {
    x: number;
    z: number;
    speed: number;
    heading: number;
    /** Optional authoritative travel direction used by the city sweep adapter. */
    velHeading?: number;
    /** Optional authoritative drift state used by the city sweep adapter. */
    drifting?: boolean;
  } {
    let x = bike.x;
    let z = bike.z;
    let spd = speed;
    let hd = heading;
    const fx = forward.x;
    const fz = forward.z;

    for (let iter = 0; iter < 2; iter += 1) {
      for (const chunk of this.chunks.values()) {
        for (const tree of chunk.trees) this.collideStatic(tree, x, z, bike.r, fx, fz, spd, hd, (r) => {
          x = r.x; z = r.z; spd = r.speed; hd = r.heading;
        });
      }
      for (const post of this.statics) this.collideStatic(post, x, z, bike.r, fx, fz, spd, hd, (r) => {
        x = r.x; z = r.z; spd = r.speed; hd = r.heading;
      });
      for (const body of this.bodies.values()) this.collideStone(body, x, z, bike.r, fx, fz, spd, (r) => {
        x = r.x; z = r.z; spd = r.speed;
      });
    }

    return { x, z, speed: spd, heading: hd };
  }

  private collideStatic(
    obs: TreeCollider,
    x: number,
    z: number,
    bikeR: number,
    fx: number,
    fz: number,
    spd: number,
    hd: number,
    apply: (r: { x: number; z: number; speed: number; heading: number }) => void,
  ) {
    const dx = x - obs.x;
    const dz = z - obs.z;
    const minD = bikeR + obs.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) return;
    const d = Math.sqrt(d2) || 1e-4;
    const nx = dx / d;
    const nz = dz / d;
    const push = minD - d;
    x += nx * push;
    z += nz * push;
    const approach = -(fx * nx + fz * nz) * Math.sign(spd || 1);
    let newSpeed = spd;
    let newHeading = hd;
    if (approach > 0 && Math.abs(spd) > 0.01) {
      const impact = approach * Math.abs(spd);
      const loss = impact * TREE_SPEED_LOSS;
      if (spd > 0) newSpeed = Math.max(0, spd - loss);
      else newSpeed = Math.min(0, spd + loss);
      // Strong hits slide the bike along the trunk tangent instead of sticking.
      if (impact > 0.6) {
        const tx = fx - nx * (fx * nx + fz * nz);
        const tz = fz - nz * (fx * nx + fz * nz);
        const tl = Math.hypot(tx, tz);
        if (tl > 0.01) newHeading = Math.atan2(tx, tz);
        this.onTreeHit?.(Math.min(1, impact / 4));
      }
    }
    apply({ x, z, speed: newSpeed, heading: newHeading });
  }

  private collideStone(
    body: StoneBody,
    x: number,
    z: number,
    bikeR: number,
    fx: number,
    fz: number,
    spd: number,
    apply: (r: { x: number; z: number; speed: number }) => void,
  ) {
    const dx = x - body.x;
    const dz = z - body.z;
    const minD = bikeR + body.collider.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) return;
    const d = Math.sqrt(d2) || 1e-4;
    const nx = dx / d;
    const nz = dz / d;
    const push = minD - d;
    x += nx * push;
    z += nz * push;
    // Impact must use the RELATIVE closing speed: a stone already rolling away
    // at the bike's speed is not a new collision. Using absolute speed here
    // would re-kick (and clamp) the stone every frame they touch.
    const relVx = fx * spd - body.vx;
    const relVz = fz * spd - body.vz;
    const approach = -(relVx * nx + relVz * nz);
    let newSpeed = spd;
    if (approach > 0 && Math.abs(spd) > 0.01) {
      const t = BIKE_MASS / (BIKE_MASS + body.collider.mass);
      // Kick along the relative motion, nudged by the contact normal so
      // pebbles scatter; ADD to the stone so a rolling stone can be re-struck.
      const relSpeed = Math.hypot(relVx, relVz) || 1;
      let kx = (relVx / relSpeed) * (1 - KICK_NORMAL_BLEND) + nx * KICK_NORMAL_BLEND;
      let kz = (relVz / relSpeed) * (1 - KICK_NORMAL_BLEND) + nz * KICK_NORMAL_BLEND;
      const kl = Math.hypot(kx, kz) || 1;
      kx /= kl;
      kz /= kl;
      const kick = approach * t;
      body.vx += kx * kick;
      body.vz += kz * kick;
      body.dirX = kx;
      body.dirZ = kz;
      body.active = true;
      body.dirty = true;
      // Light taps nudge, fast strikes launch — map closing speed to SFX intensity.
      this.onKick?.(approach < 1.5 ? 0.18 : Math.min(1, approach / 9));
      // Momentum-consistent bike loss (pebbles ~0, giants ~full share).
      const loss = approach * t * (body.collider.mass / BIKE_MASS);
      if (spd > 0) newSpeed = Math.max(0, spd - loss);
      else newSpeed = Math.min(0, spd + loss);
    }
    apply({ x, z, speed: newSpeed });
  }

  /** Advance rolling stones and stop them on trees or world bounds. */
  stepStones(
    dt: number,
    clampToWorld: (x: number, z: number) => { x: number; z: number },
    sampleBoundary: (x: number, z: number) => { ax: number; az: number; steep: boolean; height: number } = () => ({
      ax: 0,
      az: 0,
      steep: false,
      height: 0,
    }),
  ) {
    this.lastSampler = sampleBoundary;
    for (const body of this.bodies.values()) {
      if (!body.active) continue;
      const v = Math.hypot(body.vx, body.vz);
      if (v < STONE_STOP) {
        body.vx = 0;
        body.vz = 0;
        body.active = false;
        body.dirty = true;
        continue;
      }
      const decel = STONE_DECEL * dt;
      const nv = Math.max(0, v - decel);
      const scale = nv / v;
      body.vx *= scale;
      body.vz *= scale;
      body.x += body.vx * dt;
      body.z += body.vz * dt;
      const b = sampleBoundary(body.x, body.z);
      body.vx += b.ax * dt;
      body.vz += b.az * dt;
      if (b.steep) {
        body.vx *= 0.85;
        body.vz *= 0.85;
      }
      body.roll += (v * dt) / body.collider.r;
      // World edge -> stop in place.
      const clamped = clampToWorld(body.x, body.z);
      if (clamped.x !== body.x || clamped.z !== body.z) {
        body.x = clamped.x;
        body.z = clamped.z;
        body.vx = 0;
        body.vz = 0;
        body.active = false;
      } else if (this.stoneHitsTree(body)) {
        body.vx = 0;
        body.vz = 0;
        body.active = false;
      }
      body.dirty = true;
    }
  }

  private stoneHitsTree(body: StoneBody) {
    const r = body.collider.r;
    for (const chunk of this.chunks.values()) {
      for (const tree of chunk.trees) {
        const dx = body.x - tree.x;
        const dz = body.z - tree.z;
        const minD = r + tree.r;
        if (dx * dx + dz * dz < minD * minD) return true;
      }
    }
    return false;
  }

  /** Compose rolling matrices back into each stone's InstancedMesh instance. */
  writeMatrices(dummy: Object3D) {
    if (!this.hasDirty()) return;
    for (const body of this.bodies.values()) {
      if (!body.dirty) continue;
      const mesh = this.chunks.get(body.chunkKey)?.mesh;
      if (!mesh) {
        body.dirty = false;
        continue;
      }
      const c = body.collider;
      dummy.position.set(body.x, this.stoneY(body, c), body.z);
      // Roll about the horizontal axis perpendicular to travel (pure rolling, no slip).
      const axisX = body.dirZ;
      const axisZ = -body.dirX;
      const axisLen = Math.hypot(axisX, axisZ);
      if (axisLen > 1e-4 && Math.abs(body.roll) > 1e-4) {
        this.axis.set(axisX / axisLen, 0, axisZ / axisLen);
        this.qRoll.setFromAxisAngle(this.axis, body.roll);
      } else {
        this.qRoll.identity();
      }
      this.qInitial.set(c.q.x, c.q.y, c.q.z, c.q.w);
      this.qTotal.copy(this.qRoll).multiply(this.qInitial);
      dummy.quaternion.copy(this.qTotal);
      dummy.scale.set(c.s.x, c.s.y, c.s.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(c.index, dummy.matrix);
      const shardMesh = this.chunks.get(body.chunkKey)?.shardMesh;
      shardMesh?.setMatrixAt(c.index, dummy.matrix);
      body.dirty = false;
    }
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) chunk.mesh.instanceMatrix.needsUpdate = true;
      if (chunk.shardMesh) chunk.shardMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private hasDirty() {
    for (const body of this.bodies.values()) if (body.dirty) return true;
    return false;
  }

  private stoneY(body: StoneBody, c: StoneCollider): number {
    const h = this.lastSampler ? this.lastSampler(body.x, body.z).height : 0;
    return (h || 0) + c.y; // rest the stone's local offset on top of the terrain
  }

  /** Count currently rolling stones (for diagnostics / tests). */
  activeStoneCount() {
    let n = 0;
    for (const body of this.bodies.values()) if (body.active) n += 1;
    return n;
  }
}
