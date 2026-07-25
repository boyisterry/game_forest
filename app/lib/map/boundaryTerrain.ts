import * as THREE from "three";
import {
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  eastBoundaryX,
  westBoundaryX,
  northBoundaryZ,
  southBoundaryZ,
  makeRibbon,
} from "./world.ts";

// --- shared widths: mechanics + visuals aligned ---
export const FOOTHILL_WIDTH = 18;   // E/N gentle approach
export const STEEP_WIDTH = 55;      // E/N blocking band
export const BEACH_WIDTH = 22;      // W/S foot → waterline (rideable, speed-capped)
export const WATER_WIDTH = 60;      // W/S open water (hard wall)

// --- forces / caps ---
export const STEEP_ACCEL = 14;
export const FOOTHILL_ACCEL = 3.5;
export const WATER_ACCEL = 18;
export const BEACH_CAP_NEAR = 1.67; // ~6 km/h at the foot line
export const BEACH_CAP_FAR = 0.28;  // ~1 km/h at the waterline

export type BoundarySample = {
  /** Interior-pointing accel (mountain + open water). 0 on the beach. */
  ax: number;
  az: number;
  /** Hard block (open water / steep mountain). */
  steep: boolean;
  /** Terrain y. Mountain rises with ruggedness; beach/water ≈ 0. */
  height: number;
  /** Height gradient (∂h/∂x, ∂h/∂z) for nose pitch. */
  gx: number;
  gz: number;
  /** Beach crawl ceiling (m/s). Infinity off the beach. */
  speedCap: number;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Low-frequency ruggedness along a ridge coordinate → [0.2, 1.0]. */
function ridgeRuggedness(along: number, seed: number, salt: number): number {
  const mixed = Math.imul((seed ^ salt) >>> 0, 0x2545f491) >>> 0;
  const phase = (mixed / 4294967296) * Math.PI * 2;
  const n = Math.sin(along * 0.0042 + phase) * 0.55 + Math.sin(along * 0.0113 - phase * 1.3) * 0.45;
  return 0.6 + 0.4 * Math.max(-1, Math.min(1, n)); // [0.2, 1.0]
}

/** E/N mountain height profile, scaled by ruggedness (gentle ~10m, steep ~55m). */
function mountainHeight(distPastFoot: number, ruggedness: number): number {
  if (distPastFoot <= 0) return 0;
  const span = FOOTHILL_WIDTH + STEEP_WIDTH;
  const u = Math.min(1, distPastFoot / span);
  const maxH = 10 + ruggedness * 45;
  return maxH * smooth(u);
}

/** Central-difference gradient of mountainHeight w.r.t. distance past the foot line. */
function mountainGradient(distPastFoot: number, ruggedness: number): number {
  const eps = 0.5;
  return (mountainHeight(distPastFoot + eps, ruggedness) - mountainHeight(distPastFoot - eps, ruggedness)) / (2 * eps);
}

/** E/N mountain force intensity + steep flag, scaled by ruggedness. Continuous across FOOTHILL_WIDTH. */
function mountainForce(distPastFoot: number, ruggedness: number): { t: number; steep: boolean } {
  if (distPastFoot <= 0) return { t: 0, steep: false };
  const baseF = FOOTHILL_ACCEL / STEEP_ACCEL; // foothill force ceiling as a fraction of STEEP_ACCEL (~0.25)
  if (distPastFoot < FOOTHILL_WIDTH) {
    const u = distPastFoot / FOOTHILL_WIDTH;
    return { t: u * baseF, steep: false }; // 0 → baseF
  }
  const u = Math.min(1, (distPastFoot - FOOTHILL_WIDTH) / STEEP_WIDTH);
  // Gentle ridges block later; steep ones block early and push harder.
  const steepAt = 0.55 - 0.35 * ruggedness; // [0.2, 0.55]
  return { t: baseF + u * (1 - baseF) * (0.5 + 0.5 * ruggedness), steep: u > steepAt }; // baseF → up to 1
}

/** W/S beach speed cap across the beach zone (foot → waterline). */
function beachSpeedCap(distPastFoot: number): number {
  if (distPastFoot <= 0) return Infinity;
  if (distPastFoot >= BEACH_WIDTH) return BEACH_CAP_FAR;
  const u = distPastFoot / BEACH_WIDTH;
  return BEACH_CAP_NEAR + (BEACH_CAP_FAR - BEACH_CAP_NEAR) * u;
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
  let gx = 0;
  let gz = 0;
  let speedCap = Infinity;

  // East mountain (ruggedness along z).
  if (eastPast > 0) {
    const rugged = ridgeRuggedness(z, seed, 0x9a11);
    const f = mountainForce(eastPast, rugged);
    if (f.t > 0) {
      ax += -STEEP_ACCEL * f.t;
      steep ||= f.steep;
    }
    const h = mountainHeight(eastPast, rugged);
    if (h > height) {
      height = h;
      gx = mountainGradient(eastPast, rugged); // height rises with +x here
    }
  }
  // North mountain (ruggedness along x).
  if (northPast > 0) {
    const rugged = ridgeRuggedness(x, seed, 0x3c77);
    const f = mountainForce(northPast, rugged);
    if (f.t > 0) {
      az += STEEP_ACCEL * f.t;
      steep ||= f.steep;
    }
    const h = mountainHeight(northPast, rugged);
    if (h > height) {
      height = h;
      gz = -mountainGradient(northPast, rugged); // outward here is −z, so ∂h/∂z flips
    }
  }
  // West: beach cap then open-water hard wall. Beach height ≈ 0.
  if (westPast > 0) {
    if (westPast < BEACH_WIDTH) {
      speedCap = Math.min(speedCap, beachSpeedCap(westPast));
    } else {
      const u = Math.min(1, (westPast - BEACH_WIDTH) / WATER_WIDTH);
      ax += STEEP_ACCEL * (0.6 + 0.4 * u) + WATER_ACCEL * u; // shove east (interior)
      steep = true;
    }
  }
  // South: beach cap then open-water hard wall.
  if (southPast > 0) {
    if (southPast < BEACH_WIDTH) {
      speedCap = Math.min(speedCap, beachSpeedCap(southPast));
    } else {
      const u = Math.min(1, (southPast - BEACH_WIDTH) / WATER_WIDTH);
      az += -(STEEP_ACCEL * (0.6 + 0.4 * u) + WATER_ACCEL * u); // shove north (interior)
      steep = true;
    }
  }

  return { ax, az, steep, height, gx, gz, speedCap };
}

export function boundaryHeight(x: number, z: number, seed: number): number {
  return sampleBoundary(x, z, seed).height;
}

// ---------------------------------------------------------------------------
// Mesh builders (THREE-only). The sampler above stays pure so it can be used
// by node --experimental-strip-types unit tests without any renderer.
// ---------------------------------------------------------------------------

const SAND_COLOR = 0x9b9275;

const RIDGE_MARGIN = 80;
/** Inner edge starts slightly before the foot line so the mesh blends into flat ground. */
const RIDGE_INNER_OVERLAP = 8;
/** Outer edge extends past the whole foothill+steep band so height plateaus before the mesh ends. */
const RIDGE_OUTER_PAD = 30;
const RIDGE_DEPTH_SPAN = RIDGE_INNER_OVERLAP + FOOTHILL_WIDTH + STEEP_WIDTH + RIDGE_OUTER_PAD;

/**
 * Builds one continuous heightfield strip that follows the wavy foot line for
 * "east" or "north". Grid axes are (along the edge, across the depth band);
 * the winding below yields upward-facing normals for both orientations.
 */
function buildEdgeRidgeGeometry(
  seed: number,
  side: "east" | "north",
  alongSamples: number,
  acrossSamples: number,
): THREE.BufferGeometry {
  const alongMin = side === "east" ? -WORLD_HALF_DEPTH - RIDGE_MARGIN : -WORLD_HALF_WIDTH - RIDGE_MARGIN;
  const alongMax = side === "east" ? WORLD_HALF_DEPTH + RIDGE_MARGIN : WORLD_HALF_WIDTH + RIDGE_MARGIN;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let a = 0; a < alongSamples; a += 1) {
    const alongT = a / (alongSamples - 1);
    const alongCoord = alongMin + alongT * (alongMax - alongMin);
    for (let d = 0; d < acrossSamples; d += 1) {
      const depthT = d / (acrossSamples - 1);
      let worldX: number;
      let worldZ: number;
      if (side === "east") {
        worldZ = alongCoord;
        worldX = eastBoundaryX(worldZ, seed) - RIDGE_INNER_OVERLAP + depthT * RIDGE_DEPTH_SPAN;
      } else {
        worldX = alongCoord;
        worldZ = northBoundaryZ(worldX, seed) + RIDGE_INNER_OVERLAP - depthT * RIDGE_DEPTH_SPAN;
      }
      const worldY = boundaryHeight(worldX, worldZ, seed);
      positions.push(worldX, worldY, worldZ);
      uvs.push(depthT, alongT * 24);
    }
  }

  for (let a = 0; a < alongSamples - 1; a += 1) {
    for (let d = 0; d < acrossSamples - 1; d += 1) {
      const i0 = a * acrossSamples + d;
      const i1 = i0 + 1;
      const i2 = i0 + acrossSamples;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i2, i3, i1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Continuous near-ridge heightfield replacing the old cone InstancedMesh walls. */
export function buildNearMountainMeshes(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "near-ridge";

  const material = new THREE.MeshStandardMaterial({
    color: 0x7d877b,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const northMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f7c70,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  const east = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "east", 128, 18), material);
  east.castShadow = true;
  east.receiveShadow = true;

  const north = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "north", 128, 18), northMaterial);
  north.castShadow = true;
  north.receiveShadow = true;

  group.add(east, north);
  return group;
}

function silhouetteNoise(value: number, seed: number, salt: number) {
  const mixed = Math.imul((seed ^ salt) >>> 0, 0x2545f491) >>> 0;
  const phase = (mixed / 4294967296) * Math.PI * 2;
  return Math.sin(value * 0.0038 + phase) * 0.6 + Math.sin(value * 0.0091 - phase * 1.4) * 0.4;
}

/**
 * Builds a cheap vertical "fin" ribbon (bottom row at y=0, top row following a
 * jagged height curve) standing along the given points — a lightweight way to
 * read as a distant mountain silhouette without heavy geometry.
 */
function buildSilhouetteFin(points: { x: number; z: number; height: number }[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    positions.push(p.x, -5, p.z);
    positions.push(p.x, p.height, p.z);
    const u = i / Math.max(points.length - 1, 1);
    uvs.push(u, 0, u, 1);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Low, dark, cheap ridge sitting well outside the near ridge — a backdrop skyline only. */
export function buildFarSilhouetteGroup(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "far-silhouette";

  const material = new THREE.MeshBasicMaterial({
    color: 0x394036,
    transparent: true,
    opacity: 0.82,
    fog: true,
  });

  const SAMPLES = 28;
  const eastBand = FOOTHILL_WIDTH + STEEP_WIDTH;

  const eastPoints: { x: number; z: number; height: number }[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / (SAMPLES - 1);
    const z = -WORLD_HALF_DEPTH - RIDGE_MARGIN + t * (WORLD_HALF_DEPTH * 2 + RIDGE_MARGIN * 2);
    const outward = eastBand + 110 + silhouetteNoise(z, seed, 0xf001) * 30;
    const x = eastBoundaryX(z, seed) + outward;
    const height = 75 + silhouetteNoise(z, seed, 0xf002) * 15;
    eastPoints.push({ x, z, height });
  }

  const northPoints: { x: number; z: number; height: number }[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / (SAMPLES - 1);
    const x = -WORLD_HALF_WIDTH - RIDGE_MARGIN + t * (WORLD_HALF_WIDTH * 2 + RIDGE_MARGIN * 2);
    const outward = eastBand + 110 + silhouetteNoise(x, seed, 0xf003) * 30;
    const z = northBoundaryZ(x, seed) - outward;
    const height = 75 + silhouetteNoise(x, seed, 0xf004) * 15;
    northPoints.push({ x, z, height });
  }

  const east = new THREE.Mesh(buildSilhouetteFin(eastPoints), material);
  const north = new THREE.Mesh(buildSilhouetteFin(northPoints), material);
  group.add(east, north);
  return group;
}

function sampleVerticalEdge(seed: number, side: "west" | "east", samples: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < samples; i += 1) {
    const z = -WORLD_HALF_DEPTH - 120 + (i / (samples - 1)) * (WORLD_HALF_DEPTH * 2 + 240);
    const x = side === "west" ? westBoundaryX(z, seed) : eastBoundaryX(z, seed);
    points.push(new THREE.Vector3(x, 0, z));
  }
  return points;
}

function sampleHorizontalEdge(seed: number, side: "north" | "south", samples: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < samples; i += 1) {
    const x = -WORLD_HALF_WIDTH - 120 + (i / (samples - 1)) * (WORLD_HALF_WIDTH * 2 + 240);
    const z = side === "north" ? northBoundaryZ(x, seed) : southBoundaryZ(x, seed);
    points.push(new THREE.Vector3(x, 0, z));
  }
  return points;
}

const EDGE_SAMPLES = 72;

/** Ribbon with per-vertex color: the edge nearer the world center is `inner`, the
 *  farther edge is `outer`. Triangle interpolation yields a smooth gradient. */
function makeGradientRibbon(
  points: THREE.Vector3[],
  width: number,
  y: number,
  innerColor: number,
  outerColor: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const inner = new THREE.Color(innerColor);
  const outer = new THREE.Color(outerColor);
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width * 0.5);
    const a = points[i].clone().add(side);
    const b = points[i].clone().sub(side);
    positions.push(a.x, y, a.z, b.x, y, b.z);
    const v = i / Math.max(points.length - 1, 1);
    uvs.push(0, v * 48, 1, v * 48);
    const aInner = a.length() < b.length();
    const ca = aInner ? inner : outer;
    const cb = aInner ? outer : inner;
    colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    if (i < points.length - 1) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** River banks/water/foam. Bank spans the beach zone with a per-vertex grass→sand
 *  gradient; open water sits just outside the beach. */
export function buildRiverGroup(seed: number, groundColor: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "rivers";

  const west = sampleVerticalEdge(seed, "west", EDGE_SAMPLES);
  const south = sampleHorizontalEdge(seed, "south", EDGE_SAMPLES);
  // Shift so the bank's inner edge sits on the foot line; bank spans the beach zone.
  const shiftedWest = west.map((p) => new THREE.Vector3(p.x - BEACH_WIDTH / 2, p.y, p.z));
  const shiftedSouth = south.map((p) => new THREE.Vector3(p.x, p.y, p.z + BEACH_WIDTH / 2));

  const bankMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6e9da2,
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    clearcoat: 0.22,
  });
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xdce9e2, transparent: true, opacity: 0.22 });

  for (const points of [shiftedWest, shiftedSouth]) {
    const bank = new THREE.Mesh(makeGradientRibbon(points, BEACH_WIDTH, 0.015, groundColor, SAND_COLOR), bankMaterial);
    bank.receiveShadow = true;
    // Water sits just outside the beach zone.
    const waterPts = points.map((p) => new THREE.Vector3(
      p.x + (points === shiftedWest ? -WATER_WIDTH / 2 - BEACH_WIDTH : 0),
      p.y,
      p.z + (points === shiftedSouth ? WATER_WIDTH / 2 + BEACH_WIDTH : 0),
    ));
    const water = new THREE.Mesh(makeRibbon(waterPts, 82, 0.045), waterMaterial);
    const sheen = new THREE.Mesh(makeRibbon(waterPts, 58, 0.058), foamMaterial);
    group.add(bank, water, sheen);
  }

  // Open sea beyond the banks so the edges read as real geographic limits.
  const westSea = new THREE.Mesh(new THREE.PlaneGeometry(920, WORLD_HALF_DEPTH * 2 + 920), waterMaterial);
  westSea.rotation.x = -Math.PI / 2;
  westSea.position.set(-WORLD_HALF_WIDTH - 430 - BEACH_WIDTH / 2, 0.035, 120);
  const southSea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2 + 920, 920), waterMaterial);
  southSea.rotation.x = -Math.PI / 2;
  southSea.position.set(-120, 0.035, WORLD_HALF_DEPTH + 430 + BEACH_WIDTH / 2);
  group.add(westSea, southSea);

  return group;
}
