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
  /** Intact boulders retain their live collision matrices and only toggle visibility. */
  stoneMeshes?: THREE.InstancedMesh[];
  /** Shared 92-piece, 828-triangle floating burst geometry. */
  stoneShardMeshes?: THREE.InstancedMesh[];
};

const _dummy = new THREE.Object3D();
const _base = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

type ShatterMaterial = THREE.Material & {
  userData: {
    shatterAmount?: { value: number };
  };
};

/**
 * Add the demo's fragment transform to a lit Three.js material. The attributes
 * are baked into the shattered GLB geometry, so every map tree can remain an
 * instance and the whole effect stays GPU driven.
 */
export function enableShatterMaterial<T extends THREE.Material>(material: T): T {
  const shatterMaterial = material as ShatterMaterial;
  const amount = { value: 0 };
  shatterMaterial.userData.shatterAmount = amount;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShatterAmount = amount;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 shardCenter;
attribute vec3 shardRepair;
attribute vec3 shardBlast;
attribute vec4 shardAxisAngle;
attribute vec2 shardScaleStagger;
uniform float uShatterAmount;

vec3 rotateShard(vec3 point, vec3 axis, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return point * c + cross(axis, point) * s + axis * dot(axis, point) * (1.0 - c);
}

float forestShardHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}`,
      )
      .replace(
        "#include <begin_vertex>",
        `float shardLocalAmount = clamp(uShatterAmount + shardScaleStagger.y, 0.0, 1.0);
float shardReveal = smoothstep(0.035, 0.275, uShatterAmount);
vec3 shardLocalPosition = position - shardCenter;
vec3 shardAxis = normalize(shardAxisAngle.xyz);
vec3 shardRotated = rotateShard(shardLocalPosition, shardAxis, shardAxisAngle.w * shardLocalAmount);
float shardPieceScale = (0.48 + shardReveal * 0.52) * shardScaleStagger.x;
vec3 shardTreeTarget = shardBlast;
#ifdef USE_INSTANCING
  vec2 shardTreeOrigin = instanceMatrix[3].xz;
  float shardTreeSeed = forestShardHash(shardTreeOrigin * 0.071);
  float shardTreeAngle = shardTreeSeed * 6.28318530718;
  mat2 shardTreeRotation = mat2(
    cos(shardTreeAngle), -sin(shardTreeAngle),
    sin(shardTreeAngle), cos(shardTreeAngle)
  );
  shardTreeTarget.xz = shardTreeRotation * shardTreeTarget.xz;
  float shardBiasAngle = forestShardHash(shardTreeOrigin * 0.113 + 19.7) * 6.28318530718;
  float shardBiasStrength = mix(0.2, 0.72, forestShardHash(shardTreeOrigin * 0.137 + 41.3));
  shardTreeTarget.xz += vec2(cos(shardBiasAngle), sin(shardBiasAngle)) * shardBiasStrength;
  float shardVerticalBias = mix(-0.58, 0.52, forestShardHash(shardTreeOrigin * 0.173 + 73.1));
  shardTreeTarget.y = max(0.12, shardTreeTarget.y + shardVerticalBias);
#endif
vec3 transformed = shardRotated * shardPieceScale + mix(shardRepair, shardTreeTarget, shardLocalAmount);`,
      );
  };
  material.customProgramCacheKey = () => "forest-real-tree-shatter-v2";
  material.needsUpdate = true;
  return material;
}

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

function writeShatterAmount(mesh: THREE.InstancedMesh, amount: number) {
  mesh.visible = amount > 0.001;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    const uniform = (material as ShatterMaterial).userData.shatterAmount;
    if (uniform) uniform.value = amount;
  }
}

/** Pose a chunk's tree/shard layers for the current morph amount. */
export function applyShatterAmount(data: ShatterMorphData, amount: number, blasting: boolean) {
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  const treeScale = treeScaleForAmount(a, blasting);
  for (let m = 0; m < data.treeMeshes.length; m += 1) {
    writeScaledBase(data.treeMeshes[m], data.treeBases[m], treeScale);
  }
  for (const mesh of data.shardMeshes) writeShatterAmount(mesh, a);
  for (const mesh of data.stoneMeshes ?? []) mesh.visible = treeScale > 0.001;
  for (const mesh of data.stoneShardMeshes ?? []) writeShatterAmount(mesh, a);
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
