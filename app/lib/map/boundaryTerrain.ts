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

export const FOOTHILL_WIDTH = 18;
export const STEEP_WIDTH = 55;
export const STEEP_ACCEL = 14;
export const FOOTHILL_ACCEL = 3.5;

export type BoundarySample = {
  ax: number;
  az: number;
  steep: boolean;
  height: number;
};

function bandFromSigned(distPastFoot: number): { t: number; steep: boolean; height: number } {
  if (distPastFoot <= 0) return { t: 0, steep: false, height: 0 };
  if (distPastFoot < FOOTHILL_WIDTH) {
    const u = distPastFoot / FOOTHILL_WIDTH;
    return { t: u * (FOOTHILL_ACCEL / STEEP_ACCEL), steep: false, height: u * 4 };
  }
  const into = distPastFoot - FOOTHILL_WIDTH;
  const u = Math.min(1, into / STEEP_WIDTH);
  return {
    t: FOOTHILL_ACCEL / STEEP_ACCEL + u * (1 - FOOTHILL_ACCEL / STEEP_ACCEL),
    steep: true,
    height: 4 + u * 46,
  };
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

  const e = bandFromSigned(eastPast);
  if (e.t > 0) {
    ax += -STEEP_ACCEL * e.t;
    steep ||= e.steep;
    height = Math.max(height, e.height);
  }
  const w = bandFromSigned(westPast);
  if (w.t > 0) {
    ax += STEEP_ACCEL * w.t;
    steep ||= w.steep;
    height = Math.max(height, w.height * 0.15);
  }
  const n = bandFromSigned(northPast);
  if (n.t > 0) {
    az += STEEP_ACCEL * n.t;
    steep ||= n.steep;
    height = Math.max(height, n.height);
  }
  const s = bandFromSigned(southPast);
  if (s.t > 0) {
    az += -STEEP_ACCEL * s.t;
    steep ||= s.steep;
  }

  return { ax, az, steep, height };
}

export function boundaryHeight(x: number, z: number, seed: number): number {
  return sampleBoundary(x, z, seed).height;
}

// ---------------------------------------------------------------------------
// Mesh builders (THREE-only). The sampler above stays pure so it can be used
// by node --experimental-strip-types unit tests without any renderer.
// ---------------------------------------------------------------------------

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

  const east = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "east", 96, 12), material);
  east.castShadow = true;
  east.receiveShadow = true;

  const north = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "north", 96, 12), northMaterial);
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
/** Widest (outer) ribbon band; nested water/foam ribbons share the same shift. */
const BANK_WIDTH = 126;

/** River banks/water/foam, shifted outward so the inner bank edge meets the force foot line. */
export function buildRiverGroup(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "rivers";

  const west = sampleVerticalEdge(seed, "west", EDGE_SAMPLES);
  const south = sampleHorizontalEdge(seed, "south", EDGE_SAMPLES);

  // The force foot line is the raw boundary curve itself. Shifting the sample
  // points outward by half the (widest) bank ribbon width means that ribbon's
  // inner edge lands exactly on the foot line instead of bleeding onto safe,
  // playable ground.
  const shiftedWest = west.map((p) => new THREE.Vector3(p.x - BANK_WIDTH / 2, p.y, p.z));
  const shiftedSouth = south.map((p) => new THREE.Vector3(p.x, p.y, p.z + BANK_WIDTH / 2));

  const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9275, roughness: 1 });
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
    const bank = new THREE.Mesh(makeRibbon(points, BANK_WIDTH, 0.015), bankMaterial);
    bank.receiveShadow = true;
    const water = new THREE.Mesh(makeRibbon(points, 82, 0.045), waterMaterial);
    const sheen = new THREE.Mesh(makeRibbon(points, 58, 0.058), foamMaterial);
    group.add(bank, water, sheen);
  }

  // Water continues beyond the playable bank, so the west and south edges read
  // as real geographic limits rather than decorative strips on an endless lawn.
  const westSea = new THREE.Mesh(
    new THREE.PlaneGeometry(920, WORLD_HALF_DEPTH * 2 + 920),
    waterMaterial,
  );
  westSea.rotation.x = -Math.PI / 2;
  westSea.position.set(-WORLD_HALF_WIDTH - 430 - BANK_WIDTH / 2, 0.035, 120);
  const southSea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2 + 920, 920),
    waterMaterial,
  );
  southSea.rotation.x = -Math.PI / 2;
  southSea.position.set(-120, 0.035, WORLD_HALF_DEPTH + 430 + BANK_WIDTH / 2);
  group.add(westSea, southSea);

  return group;
}
