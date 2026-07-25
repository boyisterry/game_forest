import * as THREE from "three";

/** Blast open — approved demo curve. */
export function easeOutExpo(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

/** Gather close. */
export function easeInCubic(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * t;
}

/**
 * Tree instance scale for morph amount in [0,1] (0=normal, 1=shatter).
 * Blast: brief outward pop then gone. Gather: fade back in near the end.
 */
export function treeScaleForAmount(amount: number, blasting: boolean) {
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  if (a <= 0) return 1;
  if (a >= 1) return 0;
  if (blasting) {
    const flash = Math.min(1, a / 0.08);
    return flash < 1 ? 1 + flash * 0.35 : 0;
  }
  return THREE.MathUtils.clamp((0.55 - a) / 0.55, 0, 1);
}

export const BLAST_DURATION = 0.85;
export const GATHER_DURATION = 1.15;

export type ShatterMorphData = {
  treeMeshes: THREE.InstancedMesh[];
  /** Row-major 16 floats per instance, parallel to each tree mesh. */
  treeBases: Float32Array[];
  shardMeshes: THREE.InstancedMesh[];
  shardHomes: Float32Array[];
  shardShatters: Float32Array[];
};

const _dummy = new THREE.Object3D();
const _base = new THREE.Matrix4();
const _home = new THREE.Matrix4();
const _shatter = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _scaleB = new THREE.Vector3();

function writeScaledBase(mesh: THREE.InstancedMesh, bases: Float32Array, scaleMul: number) {
  const count = mesh.count;
  for (let i = 0; i < count; i += 1) {
    _base.fromArray(bases, i * 16);
    _base.decompose(_pos, _quat, _scale);
    if (scaleMul <= 0.001) {
      _scale.set(0, 0, 0);
    } else {
      _scale.multiplyScalar(scaleMul);
    }
    _dummy.position.copy(_pos);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.copy(_scale);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = scaleMul > 0.001;
}

function writeLerpedShards(
  mesh: THREE.InstancedMesh,
  homes: Float32Array,
  shatters: Float32Array,
  amount: number,
) {
  const count = mesh.count;
  const visible = amount > 0.001;
  mesh.visible = visible;
  if (!visible) {
    mesh.instanceMatrix.needsUpdate = true;
    return;
  }
  for (let i = 0; i < count; i += 1) {
    const stagger = (i % 7) * 0.012;
    const local = THREE.MathUtils.clamp(amount + stagger, 0, 1);
    _home.fromArray(homes, i * 16);
    _shatter.fromArray(shatters, i * 16);
    _home.decompose(_pos, _quat, _scale);
    _shatter.decompose(_posB, _quatB, _scaleB);
    _pos.lerp(_posB, local);
    _quat.slerp(_quatB, local);
    _scale.lerp(_scaleB, local);
    // Full-size shards from the first blast frames (no grow-from-dot).
    const sizeBoost = 0.85 + local * 0.15;
    _scale.multiplyScalar(sizeBoost);
    _dummy.position.copy(_pos);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.copy(_scale);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Pose a chunk's tree/shard layers for the current morph amount. */
export function applyShatterAmount(data: ShatterMorphData, amount: number, blasting: boolean) {
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  const treeScale = treeScaleForAmount(a, blasting);
  for (let m = 0; m < data.treeMeshes.length; m += 1) {
    writeScaledBase(data.treeMeshes[m], data.treeBases[m], treeScale);
  }
  for (let m = 0; m < data.shardMeshes.length; m += 1) {
    writeLerpedShards(data.shardMeshes[m], data.shardHomes[m], data.shardShatters[m], a);
  }
}

/**
 * Drives shatter amount over time. Call `update(dt)` each frame.
 * `amount` is 0=normal forest, 1=shattered.
 */
export class ShatterMorphController {
  amount = 0;
  private target = 0;
  private from = 0;
  private elapsed = 0;
  private duration = BLAST_DURATION;
  private busy = false;

  constructor(initial = 0) {
    this.amount = initial;
    this.target = initial;
    this.from = initial;
  }

  isBusy() {
    return this.busy;
  }

  getAmount() {
    return this.amount;
  }

  /** Instant snap (chunk rebuild / first load). */
  snap(to: number) {
    const value = to ? 1 : 0;
    this.amount = value;
    this.target = value;
    this.from = value;
    this.busy = false;
    this.elapsed = 0;
  }

  /** Animate toward shattered (true) or normal (false). */
  animateTo(shattered: boolean) {
    const next = shattered ? 1 : 0;
    if (!this.busy && Math.abs(this.amount - next) < 1e-4) {
      this.amount = next;
      this.target = next;
      return;
    }
    this.from = this.amount;
    this.target = next;
    this.elapsed = 0;
    this.duration = next > this.from ? BLAST_DURATION : GATHER_DURATION;
    this.busy = true;
  }

  /** @returns true while animating */
  update(dt: number) {
    if (!this.busy) return false;
    this.elapsed += dt;
    const u = Math.min(1, this.elapsed / this.duration);
    const blasting = this.target > this.from;
    const eased = blasting ? easeOutExpo(u) : easeInCubic(u);
    this.amount = this.from + (this.target - this.from) * eased;
    if (u >= 1) {
      this.amount = this.target;
      this.busy = false;
    }
    return true;
  }

  isBlasting() {
    return this.target >= this.from;
  }
}
