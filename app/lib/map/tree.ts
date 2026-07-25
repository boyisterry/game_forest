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
  primaryLimbs: 30,
  segmentsPerLimb: 5,
  fillerClusters: 64,
  leavesPerCluster: 16,
  tipLeavesPerCluster: 6,
  rootCount: 7,
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

/**
 * Surface root / buttress rib in local tree space.
 * Rendered as a tapered triangular-section wedge from the bole surface
 * outward along the ground.
 */
export type RootFlare = {
  angle: number;
  /** Horizontal reach beyond the bole surface. */
  length: number;
  /** Thick radius where the root meets the trunk. */
  radius: number;
  /** Lateral squash (smaller = flatter buttress plate). */
  flatten: number;
  /** Attach height on the bole. */
  lift: number;
};

/** One tapered, ground-hugging section of a winding surface root. */
export type RootRunSegment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
};

/** Matches createRippledTrunkGeometry bottom radius — roots must attach outside this. */
export const TRUNK_BASE_RADIUS = 0.56;

/** Local-space tree description (origin at ground, Y up). */
export type TreeDescription = {
  branches: BranchSegment[];
  clusters: LeafCluster[];
  tipClusters: LeafCluster[];
  roots: RootFlare[];
  rootSegments: RootRunSegment[];
  trunkHeight: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** gpt_demo crown envelope — rounded oval canopy with a soft tip taper. */
export function crownRadiusAt(y: number, canopyHeight: number, canopyWidth: number) {
  const baseY = 5.72 * canopyHeight;
  const span = 5.83 * canopyHeight;
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
  const treeTop = 11.72 * canopyHeight;
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
  for (let y = 2.25 * canopyHeight; y < 11.5 * canopyHeight; y += 0.72 * canopyHeight) {
    const step = 0.72 * canopyHeight;
    const sway = new THREE.Vector3(Math.sin(y * 1.12) * 0.035, y, Math.cos(y * 0.91) * 0.03);
    const next = new THREE.Vector3(
      Math.sin((y + step) * 1.12) * 0.035,
      y + step,
      Math.cos((y + step) * 0.91) * 0.03,
    );
    addBranch(sway, next, THREE.MathUtils.lerp(0.19, 0.035, y / treeTop) * canopyWidth);
  }

  // Rising scaffold forks turn the single pole into a mature trunk crown.
  // Extra forks + side splits sell a denser branching silhouette.
  const forkBaseY = 5.86 * canopyHeight;
  for (let fork = 0; fork < 7; fork += 1) {
    const angle = fork * GOLDEN_ANGLE + range(random, -0.28, 0.28);
    let previous = new THREE.Vector3(
      Math.cos(angle) * 0.08 * canopyWidth,
      forkBaseY + fork * 0.28 * canopyHeight,
      Math.sin(angle) * 0.08 * canopyWidth,
    );
    for (let segment = 1; segment <= 6; segment += 1) {
      const f = segment / 6;
      const reach = (0.18 + f * 1.52) * canopyWidth;
      const turn = angle + Math.sin(f * Math.PI) * range(random, -0.16, 0.16);
      const point = new THREE.Vector3(
        Math.cos(turn) * reach,
        forkBaseY + (5.64 + fork * 0.08) * canopyHeight * f,
        Math.sin(turn) * reach,
      );
      addBranch(previous, point, THREE.MathUtils.lerp(0.14, 0.032, f) * canopyWidth);
      if (segment >= 2) {
        addCluster(
          previous.clone().lerp(point, 0.72),
          range(random, 0.32, 0.48) * canopyWidth,
          segment === 6 ? 1.22 : 1.02,
        );
      }
      // Mid-scaffold Y-split so the crown reads as repeatedly forked wood.
      if (segment === 3 || (segment === 5 && random() < 0.7)) {
        const splitAngle = turn + range(random, 0.55, 1.05) * (random() < 0.5 ? 1 : -1);
        const splitLen = reach * range(random, 0.28, 0.48);
        const splitTip = point.clone().add(
          new THREE.Vector3(
            Math.cos(splitAngle) * splitLen,
            range(random, 0.35, 0.95) * canopyHeight,
            Math.sin(splitAngle) * splitLen,
          ),
        );
        addBranch(point, splitTip, THREE.MathUtils.lerp(0.07, 0.024, f) * canopyWidth);
        addCluster(splitTip, range(random, 0.28, 0.42) * canopyWidth, 1.12);
        if (random() < 0.55) {
          const tipAngle = splitAngle + range(random, -0.8, 0.8);
          const tip = splitTip.clone().add(
            new THREE.Vector3(
              Math.cos(tipAngle) * splitLen * range(random, 0.35, 0.6),
              range(random, 0.12, 0.42) * canopyHeight,
              Math.sin(tipAngle) * splitLen * range(random, 0.35, 0.6),
            ),
          );
          addBranch(splitTip, tip, range(random, 0.016, 0.028) * canopyWidth);
          addCluster(tip, range(random, 0.24, 0.38) * canopyWidth, 1.15);
        }
      }
      previous = point;
    }
  }

  // Mature forest silhouette: a clean lower bole, with the first lateral
  // branches beginning just below the halfway point of the full trunk.
  const limbBase = 5.88 * canopyHeight;
  const limbSpan = 5.29 * canopyHeight;

  for (let i = 0; i < primaryLimbs; i += 1) {
    const y = limbBase + (i / Math.max(primaryLimbs - 1, 1)) * limbSpan + range(random, -0.12, 0.12) * canopyHeight;
    const t = clamp01((y - limbBase) / limbSpan);
    const angle = i * GOLDEN_ANGLE + range(random, -0.24, 0.24);
    const length = crownRadiusAt(y, canopyHeight, canopyWidth) * range(random, 1.08, 1.38);
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

    // Secondary / tertiary twigs — repeated forks so limbs read as branching wood.
    for (let s = 1; s <= primaryPoints.length; s += 1) {
      const anchor = primaryPoints[s - 1];
      const sideCount = s === 1 ? 3 : s === primaryPoints.length ? 4 : 4;
      for (let side = 0; side < sideCount; side += 1) {
        const sideSign = side % 2 ? 1 : -1;
        const sideAngle =
          angle + sideSign * range(random, 0.55, 1.15) + range(random, -0.22, 0.22) + Math.floor(side / 2) * 0.35;
        const twigLength = length * range(random, 0.14, 0.3) * (1 - s * 0.05);
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

        // Tertiary forks on most twigs; occasionally a short quaternary tip.
        if (s >= 1 && (side < 3 || random() < 0.55)) {
          const tertiaryAngle = sideAngle + range(random, -0.85, 0.85);
          const tertiaryLength = twigLength * range(random, 0.4, 0.72);
          const tertiaryTip = tip.clone().add(
            new THREE.Vector3(
              Math.cos(tertiaryAngle) * tertiaryLength,
              range(random, 0.1, 0.34) * canopyHeight,
              Math.sin(tertiaryAngle) * tertiaryLength,
            ),
          );
          addBranch(tip, tertiaryTip, range(random, 0.016, 0.028) * canopyWidth);
          addCluster(tertiaryTip, range(random, 0.26, 0.4) * canopyWidth, 1.1);

          if (random() < 0.45) {
            const quatAngle = tertiaryAngle + range(random, -0.9, 0.9);
            const quatTip = tertiaryTip.clone().add(
              new THREE.Vector3(
                Math.cos(quatAngle) * tertiaryLength * range(random, 0.35, 0.62),
                range(random, 0.08, 0.26) * canopyHeight,
                Math.sin(quatAngle) * tertiaryLength * range(random, 0.35, 0.62),
              ),
            );
            addBranch(tertiaryTip, quatTip, range(random, 0.012, 0.022) * canopyWidth);
            addCluster(quatTip, range(random, 0.22, 0.34) * canopyWidth, 1.08);
          }
        }
      }

      // Primary mid-limb bifurcation: split the growing limb into two leads.
      if (s >= 2 && s <= primaryPoints.length - 1 && random() < 0.55) {
        const forkAngle = angle + range(random, 0.7, 1.25) * (random() < 0.5 ? 1 : -1);
        const forkLen = length * range(random, 0.18, 0.32) * (1 - s * 0.04);
        const forkTip = anchor.clone().add(
          new THREE.Vector3(
            Math.cos(forkAngle) * forkLen,
            range(random, 0.2, 0.55) * canopyHeight,
            Math.sin(forkAngle) * forkLen,
          ),
        );
        addBranch(anchor, forkTip, range(random, 0.03, 0.05) * canopyWidth);
        addCluster(forkTip, range(random, 0.28, 0.42) * canopyWidth, 1.14);
        const childAngle = forkAngle + range(random, -0.7, 0.7);
        const childTip = forkTip.clone().add(
          new THREE.Vector3(
            Math.cos(childAngle) * forkLen * range(random, 0.4, 0.7),
            range(random, 0.1, 0.3) * canopyHeight,
            Math.sin(childAngle) * forkLen * range(random, 0.4, 0.7),
          ),
        );
        addBranch(forkTip, childTip, range(random, 0.016, 0.03) * canopyWidth);
        addCluster(childTip, range(random, 0.24, 0.38) * canopyWidth, 1.12);
      }
    }
  }

  // Interior filler with negative space so branches stay readable.
  for (let i = 0; i < fillerClusters; i += 1) {
    const y = range(random, 5.92 * canopyHeight, 11.55 * canopyHeight);
    const r = crownRadiusAt(y, canopyHeight, canopyWidth) * Math.sqrt(random()) * 0.78;
    const a = random() * Math.PI * 2;
    addCluster(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), range(random, 0.24, 0.4) * canopyWidth, 0.92);
  }

  const tipClusters = clusters.filter((cluster) => {
    const radial = Math.hypot(cluster.x, cluster.z);
    const envelope = crownRadiusAt(cluster.y, canopyHeight, canopyWidth);
    return radial > envelope * 0.58 || cluster.y > 10.3 * canopyHeight;
  });

  // Short broad flares fuse the trunk into the ground; separate tapered chains
  // continue selected flares into crooked, branching old-growth runners.
  const roots: RootFlare[] = [];
  const rootSegments: RootRunSegment[] = [];
  for (let i = 0; i < rootCount; i += 1) {
    const dominant = random() < 0.38;
    const angle = (i / rootCount) * Math.PI * 2 + range(random, -0.62, 0.62);
    const flareLength = range(random, 0.48, 0.82) * canopyWidth;
    const flareRadius = range(random, 0.25, 0.42) * canopyWidth;
    roots.push({
      angle,
      length: flareLength,
      radius: flareRadius,
      flatten: range(random, 0.42, 0.92),
      lift: range(random, 0.52, 0.86),
    });

    if (!dominant && random() > 0.42) continue;
    const sectionCount = dominant ? 4 : 2;
    const runnerLength = range(random, dominant ? 1.7 : 0.7, dominant ? 2.8 : 1.35) * canopyWidth;
    let runnerAngle = angle + range(random, -0.16, 0.16);
    let px = Math.cos(angle) * (TRUNK_BASE_RADIUS * 0.58 + flareLength * 0.78);
    let pz = Math.sin(angle) * (TRUNK_BASE_RADIUS * 0.58 + flareLength * 0.78);
    let py = range(random, 0.006, 0.018);
    const runnerPoints: THREE.Vector3[] = [new THREE.Vector3(px, py, pz)];
    for (let section = 0; section < sectionCount; section += 1) {
      runnerAngle += range(random, -0.28, 0.28);
      const step = (runnerLength / sectionCount) * range(random, 0.84, 1.16);
      px += Math.cos(runnerAngle) * step;
      pz += Math.sin(runnerAngle) * step;
      py = Math.max(0.004, py + range(random, -0.008, 0.009));
      const next = new THREE.Vector3(px, py, pz);
      const previous = runnerPoints[runnerPoints.length - 1];
      rootSegments.push({
        ax: previous.x, ay: previous.y, az: previous.z,
        bx: next.x, by: next.y, bz: next.z,
        radius: flareRadius * THREE.MathUtils.lerp(0.48, 0.16, (section + 0.5) / sectionCount),
      });
      runnerPoints.push(next);
    }

    // A short side root on some dominant chains breaks the radial-star read.
    if (dominant && runnerPoints.length > 2 && random() < 0.72) {
      const fork = runnerPoints[1];
      const forkAngle = runnerAngle + (random() < 0.5 ? -1 : 1) * range(random, 0.52, 0.9);
      const forkLength = range(random, 0.55, 1.05) * canopyWidth;
      const forkMid = fork.clone().add(new THREE.Vector3(Math.cos(forkAngle) * forkLength * 0.55, -0.004, Math.sin(forkAngle) * forkLength * 0.55));
      const forkTipAngle = forkAngle + range(random, -0.18, 0.18);
      const forkTip = fork.clone().add(new THREE.Vector3(Math.cos(forkTipAngle) * forkLength, -0.008, Math.sin(forkTipAngle) * forkLength));
      forkMid.y = Math.max(0.004, forkMid.y);
      forkTip.y = Math.max(0.003, forkTip.y);
      rootSegments.push(
        { ax: fork.x, ay: fork.y, az: fork.z, bx: forkMid.x, by: forkMid.y, bz: forkMid.z, radius: flareRadius * 0.24 },
        { ax: forkMid.x, ay: forkMid.y, az: forkMid.z, bx: forkTip.x, by: forkTip.y, bz: forkTip.z, radius: flareRadius * 0.15 },
      );
    }
  }

  return { branches, clusters, tipClusters, roots, rootSegments, trunkHeight };
}

export function createRippledTrunkGeometry(height: number, radial = 7, heightSegments = 6) {
  const geometry = new THREE.CylinderGeometry(0.32, 0.56, height, radial, heightSegments, false);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    // Lower-frequency lobes survive the seven-sided silhouette without aliasing
    // into a single skewed facet, retaining the mature irregular bole shape.
    const ripple = 1 + Math.sin(angle * 3 + y * 1.7) * 0.035 + Math.sin(angle * 2 - y * 2.8) * 0.018;
    position.setX(i, position.getX(i) * ripple);
    position.setZ(i, position.getZ(i) * ripple);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createLeafGeometry() {
  // One ten-triangle instance draws a five-leaf spray. The previous 7×4
  // sphere cost 42 triangles for a single leaf; this creates a much denser
  // canopy silhouette while using under one quarter of the geometry.
  const positions: number[] = [];
  const indices: number[] = [];
  const directions = [
    new THREE.Vector3(0, 0.14, 1),
    new THREE.Vector3(-0.72, 0.08, 0.7),
    new THREE.Vector3(0.72, -0.04, 0.7),
    new THREE.Vector3(-0.58, 0.2, -0.7),
    new THREE.Vector3(0.58, 0.12, -0.7),
  ];
  const up = new THREE.Vector3(0, 1, 0);

  for (let leaf = 0; leaf < directions.length; leaf += 1) {
    const direction = directions[leaf].normalize();
    const side = new THREE.Vector3().crossVectors(direction, up).normalize();
    const center = direction.clone().multiplyScalar(leaf === 0 ? 0.06 : -0.02);
    const base = center.clone().addScaledVector(direction, -0.34);
    const tip = center.clone().addScaledVector(direction, 0.72);
    const left = center.clone().addScaledVector(side, 0.27).addScaledVector(up, 0.035);
    const right = center.clone().addScaledVector(side, -0.27).addScaledVector(up, -0.025);
    const offset = positions.length / 3;
    for (const point of [base, left, tip, right]) positions.push(point.x, point.y, point.z);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
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
