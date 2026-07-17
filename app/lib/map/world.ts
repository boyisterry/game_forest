import * as THREE from "three";
import { createRandom, range } from "./random";

/** Irregular square world: broad enough for a long courier route, never a disc. */
export const WORLD_HALF_WIDTH = 1600;
export const WORLD_HALF_DEPTH = 1600;
export const CHUNK_SIZE = 96;
/** Keep roughly a “one old map” neighborhood resident in GPU memory. */
export const LOAD_RADIUS_CHUNKS = 2;
export const UNLOAD_RADIUS_CHUNKS = 3;
export const TREES_PER_CHUNK = 22;

export type ChunkCoord = { cx: number; cz: number };

function edgePhase(seed: number, salt: number) {
  const mixed = Math.imul((seed ^ salt) >>> 0, 0x45d9f3b) >>> 0;
  return (mixed / 4294967296) * Math.PI * 2;
}

function edgeNoise(value: number, seed: number, salt: number) {
  const phase = edgePhase(seed, salt);
  return (
    Math.sin(value * 0.0061 + phase) * 34 +
    Math.sin(value * 0.0137 - phase * 0.7) * 17 +
    Math.sin(value * 0.0023 + phase * 1.6) * 28
  );
}

/** River centerline on the west edge. */
export function westBoundaryX(z: number, seed: number) {
  return -WORLD_HALF_WIDTH + 62 + edgeNoise(z, seed, 0x71a3);
}

/** River centerline on the south edge. */
export function southBoundaryZ(x: number, seed: number) {
  return WORLD_HALF_DEPTH - 62 + edgeNoise(x, seed, 0x93d1);
}

/** Mountain foot on the east edge. */
export function eastBoundaryX(z: number, seed: number) {
  return WORLD_HALF_WIDTH - 48 + edgeNoise(z, seed, 0xc351);
}

/** Mountain foot on the north edge. */
export function northBoundaryZ(x: number, seed: number) {
  return -WORLD_HALF_DEPTH + 48 + edgeNoise(x, seed, 0xe287);
}

export function isInsideWorld(x: number, z: number, seed: number, inset = 0) {
  return (
    x >= westBoundaryX(z, seed) + inset &&
    x <= eastBoundaryX(z, seed) - inset &&
    z >= northBoundaryZ(x, seed) + inset &&
    z <= southBoundaryZ(x, seed) - inset
  );
}

export function clampToWorld(x: number, z: number, seed: number, inset = 90) {
  let nextX = THREE.MathUtils.clamp(x, westBoundaryX(z, seed) + inset, eastBoundaryX(z, seed) - inset);
  let nextZ = THREE.MathUtils.clamp(z, northBoundaryZ(nextX, seed) + inset, southBoundaryZ(nextX, seed) - inset);
  // A second pass resolves the small dependency between the wavy horizontal and vertical edges.
  nextX = THREE.MathUtils.clamp(nextX, westBoundaryX(nextZ, seed) + inset, eastBoundaryX(nextZ, seed) - inset);
  return { x: nextX, z: nextZ };
}

export function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number): ChunkCoord {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE),
  };
}

export function chunkOrigin(cx: number, cz: number) {
  return { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE };
}

export function chunkSeed(worldSeed: number, cx: number, cz: number) {
  let h = worldSeed >>> 0;
  h = Math.imul(h ^ Math.imul(cx + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35);
  h = Math.imul(h ^ Math.imul(cz + 0x7f4a7c15, 0x27d4eb2d), 0x165667b1);
  return h >>> 0;
}

export function chunksInRadius(focus: ChunkCoord, radius: number): ChunkCoord[] {
  const list: ChunkCoord[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dz * dz > radius * radius + 0.25) continue;
      list.push({ cx: focus.cx + dx, cz: focus.cz + dz });
    }
  }
  return list;
}

/** Long winding delivery route spanning most of the world. */
export function createWorldRoad(seed: number, curves: number) {
  const random = createRandom(seed ^ 0x51f15e);
  const controlPoints: THREE.Vector3[] = [];
  const steps = 96;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const z = -WORLD_HALF_DEPTH + 150 + t * (WORLD_HALF_DEPTH * 2 - 300);
    const lane = Math.sin(t * Math.PI * 3.2 + 0.4) * (55 + 90 * curves);
    const drift = Math.sin(t * Math.PI * 1.15) * 120 * curves;
    const jitter = range(random, -18, 18) * curves;
    const x = lane + drift + jitter;
    const clampedX = THREE.MathUtils.clamp(x, -WORLD_HALF_WIDTH + 220, WORLD_HALF_WIDTH - 220);
    controlPoints.push(new THREE.Vector3(clampedX, 0, z));
  }
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.4);
  return curve.getPoints(1400);
}

export function makeRibbon(points: THREE.Vector3[], width: number, y: number) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width * 0.5);
    vertices.push(points[i].x + side.x, y, points[i].z + side.z);
    vertices.push(points[i].x - side.x, y, points[i].z - side.z);
    const v = i / Math.max(points.length - 1, 1);
    uvs.push(0, v * 48, 1, v * 48);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Grid index so chunk tree placement only tests nearby road samples. */
export function buildRoadIndex(points: THREE.Vector3[], cellSize = CHUNK_SIZE) {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < points.length; i += 1) {
    const cx = Math.floor(points[i].x / cellSize);
    const cz = Math.floor(points[i].z / cellSize);
    const key = chunkKey(cx, cz);
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  return {
    minDistance(point: THREE.Vector3, roadWidth: number) {
      const cx = Math.floor(point.x / cellSize);
      const cz = Math.floor(point.z / cellSize);
      let minimum = Infinity;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = cells.get(chunkKey(cx + dx, cz + dz));
          if (!bucket) continue;
          for (const index of bucket) {
            minimum = Math.min(minimum, point.distanceTo(points[index]));
            if (minimum < roadWidth) return minimum;
          }
        }
      }
      return minimum;
    },
  };
}

export function pickTreeScale(random: () => number) {
  const roll = random();
  // Landmark elders, mid canopy, and understory — overall larger than the old 0.38–0.68 band.
  if (roll < 0.07) return range(random, 1.55, 2.25);
  if (roll < 0.28) return range(random, 1.05, 1.45);
  if (roll < 0.65) return range(random, 0.78, 1.05);
  return range(random, 0.55, 0.78);
}
