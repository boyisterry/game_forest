import * as THREE from "three";
import { range } from "./random";

/**
 * Tunable tree shape — cursor_demo factory surface, gpt_demo specimen algorithm.
 * Structural counts stay forest-scaled; leafDensity / canopy* are the live knobs.
 */
export type TreeParams = {
  primaryLimbs: number;
  segmentsPerLimb: number;
  fillerClusters: number;
  leavesPerCluster: number;
  tipLeavesPerCluster: number;
  rootCount: number;
  canopyWidth: number;
  canopyHeight: number;
  leafDensity: number;
};

/** Forest-scaled defaults: gpt_demo silhouette with denser canopy for map-scale readability. */
export const DEFAULT_TREE_PARAMS: TreeParams = {
  primaryLimbs: 15,
  segmentsPerLimb: 3,
  fillerClusters: 34,
  leavesPerCluster: 12,
  tipLeavesPerCluster: 4,
  rootCount: 6,
  canopyWidth: 1.12,
  canopyHeight: 0.92,
  leafDensity: 1,
};

export type BranchSegment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
};

export type LeafCluster = {
  x: number;
  y: number;
  z: number;
  radius: number;
  bias: number;
};

export type RootFlare = {
  angle: number;
  length: number;
  radius: number;
  scaleZ: number;
};

/** Local-space tree description (origin at ground, Y up). */
export type TreeDescription = {
  branches: BranchSegment[];
  clusters: LeafCluster[];
  tipClusters: LeafCluster[];
  roots: RootFlare[];
  trunkHeight: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** gpt_demo crown envelope — rounded oval canopy with a soft tip taper. */
export function crownRadiusAt(y: number, canopyHeight: number, canopyWidth: number) {
  const baseY = 2.2 * canopyHeight;
  const span = 8.25 * canopyHeight;
  const t = clamp01((y - baseY) / span);
  const rounded = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.92)), 0.54);
  return (0.36 + 3.02 * rounded) * (1 - 0.17 * t) * canopyWidth;
}

function resolveParams(params: Partial<TreeParams> = {}): TreeParams {
  const merged = { ...DEFAULT_TREE_PARAMS, ...params };
  const density = Math.max(0.35, merged.leafDensity);
  return {
    ...merged,
    leafDensity: density,
    fillerClusters: Math.max(6, Math.round(merged.fillerClusters * density)),
    leavesPerCluster: Math.max(5, Math.round(merged.leavesPerCluster * (0.65 + density * 0.35))),
    tipLeavesPerCluster: Math.max(2, Math.round(merged.tipLeavesPerCluster * density)),
  };
}

/**
 * Pure factory: seedable RNG in → local tree description out.
 * Mirrors gpt_demo's leader + golden-angle limbs + twigs + cluster leaves + tip growth.
 */
export function describeTree(random: () => number, params: Partial<TreeParams> = {}): TreeDescription {
  const config = resolveParams(params);
  const { canopyWidth, canopyHeight, primaryLimbs, segmentsPerLimb, fillerClusters, rootCount } = config;
  const treeTop = 10.45 * canopyHeight;
  const trunkHeight = treeTop;
  const branches: BranchSegment[] = [];
  const clusters: LeafCluster[] = [];

  const addBranch = (a: THREE.Vector3, b: THREE.Vector3, radiusA: number) => {
    branches.push({
      ax: a.x,
      ay: a.y,
      az: a.z,
      bx: b.x,
      by: b.y,
      bz: b.z,
      radius: radiusA,
    });
  };

  const addCluster = (center: THREE.Vector3, radius: number, bias = 1) => {
    clusters.push({ x: center.x, y: center.y, z: center.z, radius, bias });
  };

  // Tapered leader stays readable inside the crown.
  for (let y = 2.25 * canopyHeight; y < 10.2 * canopyHeight; y += 0.72 * canopyHeight) {
    const step = 0.72 * canopyHeight;
    const sway = new THREE.Vector3(Math.sin(y * 1.12) * 0.035, y, Math.cos(y * 0.91) * 0.03);
    const next = new THREE.Vector3(
      Math.sin((y + step) * 1.12) * 0.035,
      y + step,
      Math.cos((y + step) * 0.91) * 0.03,
    );
    addBranch(sway, next, THREE.MathUtils.lerp(0.19, 0.035, y / treeTop) * canopyWidth);
  }

  const limbBase = 2.35 * canopyHeight;
  const limbSpan = 7.63 * canopyHeight;

  for (let i = 0; i < primaryLimbs; i += 1) {
    const y = limbBase + (i / Math.max(primaryLimbs - 1, 1)) * limbSpan + range(random, -0.12, 0.12) * canopyHeight;
    const t = clamp01((y - limbBase) / limbSpan);
    const angle = i * GOLDEN_ANGLE + range(random, -0.24, 0.24);
    const length = crownRadiusAt(y, canopyHeight, canopyWidth) * range(random, 0.78, 1.06);
    const start = new THREE.Vector3(Math.cos(angle) * 0.1, y, Math.sin(angle) * 0.1);
    let previous = start;
    const primaryPoints: THREE.Vector3[] = [];

    for (let segment = 1; segment <= segmentsPerLimb; segment += 1) {
      const f = segment / segmentsPerLimb;
      const lift = length * (0.13 + 0.23 * t) * f + Math.sin(f * Math.PI) * 0.12 * canopyHeight;
      const curve = Math.sin(f * Math.PI) * range(random, -0.16, 0.16);
      const point = new THREE.Vector3(
        Math.cos(angle + curve) * length * f,
        y + lift,
        Math.sin(angle + curve) * length * f,
      );
      const radius = (0.092 - segment * 0.016) * (1 - t * 0.35) * canopyWidth;
      addBranch(previous, point, Math.max(0.018, radius));
      previous = point;
      primaryPoints.push(point);
      if (segment >= 2) {
        addCluster(point, range(random, 0.28, 0.42) * canopyWidth, 1.1);
      }
    }

    // Secondary twigs — the depth that sells a real canopy instead of a green blob.
    for (let s = 1; s <= Math.min(3, primaryPoints.length); s += 1) {
      const anchor = primaryPoints[s - 1];
      const sideCount = s === 2 ? 3 : 2;
      for (let side = 0; side < sideCount; side += 1) {
        const sideAngle = angle + (side % 2 ? 1 : -1) * range(random, 0.62, 1.05) + range(random, -0.18, 0.18);
        const twigLength = length * range(random, 0.14, 0.28) * (1 - s * 0.06);
        const tip = anchor.clone().add(
          new THREE.Vector3(
            Math.cos(sideAngle) * twigLength,
            range(random, 0.1, 0.38) * canopyHeight + t * 0.12,
            Math.sin(sideAngle) * twigLength,
          ),
        );
        addBranch(anchor, tip, range(random, 0.025, 0.044) * canopyWidth);
        addCluster(anchor.clone().lerp(tip, 0.5), range(random, 0.24, 0.36) * canopyWidth, 0.9);
        addCluster(tip, range(random, 0.28, 0.45) * canopyWidth, 1.18);
      }
    }
  }

  // Interior filler with negative space so branches stay readable.
  for (let i = 0; i < fillerClusters; i += 1) {
    const y = range(random, 2.65 * canopyHeight, 10.38 * canopyHeight);
    const r = crownRadiusAt(y, canopyHeight, canopyWidth) * Math.sqrt(random()) * 0.78;
    const a = random() * Math.PI * 2;
    addCluster(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), range(random, 0.24, 0.4) * canopyWidth, 0.92);
  }

  const tipClusters = clusters.filter((cluster) => {
    const radial = Math.hypot(cluster.x, cluster.z);
    const envelope = crownRadiusAt(cluster.y, canopyHeight, canopyWidth);
    return radial > envelope * 0.58 || cluster.y > 9.25 * canopyHeight;
  });

  const roots: RootFlare[] = [];
  for (let i = 0; i < rootCount; i += 1) {
    roots.push({
      angle: (i / rootCount) * Math.PI * 2 + range(random, -0.15, 0.15),
      length: range(random, 0.65, 1.05) * canopyHeight,
      radius: range(random, 0.07, 0.12) * canopyWidth,
      scaleZ: range(random, 0.7, 1.4),
    });
  }

  return { branches, clusters, tipClusters, roots, trunkHeight };
}

export function createRippledTrunkGeometry(height: number, radial = 14, heightSegments = 12) {
  const geometry = new THREE.CylinderGeometry(0.25, 0.44, height, radial, heightSegments, false);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const ripple = 1 + Math.sin(angle * 7 + y * 1.7) * 0.035 + Math.sin(angle * 3 - y * 2.8) * 0.018;
    position.setX(i, position.getX(i) * ripple);
    position.setZ(i, position.getZ(i) * ripple);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createLeafGeometry() {
  const geometry = new THREE.SphereGeometry(1, 7, 4);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Season base color + gpt_demo height-aware HSL variegation. */
export function colorLeaf(
  target: THREE.Color,
  baseColor: number,
  localY: number,
  canopyHeight: number,
  random: () => number,
) {
  target.set(baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl);
  const sunLift = Math.max(0, localY - 8 * canopyHeight) * 0.008;
  target.setHSL(
    hsl.h + range(random, -0.02, 0.02),
    THREE.MathUtils.clamp(hsl.s + range(random, -0.06, 0.08), 0.35, 0.92),
    THREE.MathUtils.clamp(hsl.l + range(random, -0.06, 0.08) + sunLift, 0.28, 0.62),
  );
  return target;
}

export function resolvedTreeParams(params: Partial<TreeParams> = {}) {
  return resolveParams(params);
}
