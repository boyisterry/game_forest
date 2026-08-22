import * as THREE from "three";
import { RABBIT_RIDER_COLLISION_RADIUS_METERS } from "./riderDimensions.ts";
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
export const MAX_RIDEABLE_SLOPE_DEG = 30;
export const MAX_RIDEABLE_GRADE = Math.tan(THREE.MathUtils.degToRad(MAX_RIDEABLE_SLOPE_DEG));
/** Bike contact radius used by motorcycle collision. */
export const MOUNTAIN_BIKE_RADIUS = RABBIT_RIDER_COLLISION_RADIUS_METERS;
/**
 * The mountain terrain begins at the innermost visible toe of the faceted
 * peak range. The old sampler began at the abstract map edge, fourteen metres
 * before the mountain players actually saw.
 */
export const MOUNTAIN_SURFACE_TOE_OFFSET = 14;
/** No pre-contact guard: the rendered rock surface itself is authoritative. */
export const MOUNTAIN_COLLISION_INSET = 0;
export const MOUNTAIN_SURFACE_DEPTH = 150;

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
  /** Cross-slope angle in degrees. Mountain slopes above 30° are blocked. */
  slopeDegrees: number;
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

const ACCESS_SPACING = 760;
const ACCESS_CORE_HALF_WIDTH = 32;
const ACCESS_FEATHER = 48;
const ACCESS_APPROACH_END = 12;
const ACCESS_TRANSITION_END = 20;
const ACCESS_GRADE = Math.tan(THREE.MathUtils.degToRad(20));

/**
 * Sparse deterministic passes along each ridge. A fully open core occupies
 * only ~8% of an edge; its feather quickly blends back into the cliff wall.
 */
function mountainAccessBlend(along: number, seed: number, salt: number): number {
  const mixed = Math.imul((seed ^ salt) >>> 0, 0x27d4eb2d) >>> 0;
  const phase = (mixed / 4294967296) * ACCESS_SPACING;
  const wrapped = ((along + phase) % ACCESS_SPACING + ACCESS_SPACING) % ACCESS_SPACING;
  const distance = Math.abs(wrapped - ACCESS_SPACING * 0.5);
  return 1 - smooth(THREE.MathUtils.clamp((distance - ACCESS_CORE_HALF_WIDTH) / ACCESS_FEATHER, 0, 1));
}

/**
 * E/N ridge profile. Most of the foot begins as a 55–65° rock wall. Sparse
 * access cores start at 20° (comfortably below the 30° rideable limit), then
 * turn into mountain beyond the approach.
 */
function mountainHeight(distPastFoot: number, ruggedness: number, access: number): number {
  if (distPastFoot <= 0) return 0;
  // A compact 42–54° rock toe is enough to block the bike; the overlapping
  // peak rows behind it provide the mountain's height instead of a tall wall.
  const cliffGrade = 0.82 + ruggedness * 0.55;
  const approachGrade = THREE.MathUtils.lerp(cliffGrade, ACCESS_GRADE, access * access * access);
  let rawHeight: number;
  if (distPastFoot <= ACCESS_APPROACH_END) {
    rawHeight = approachGrade * distPastFoot;
  } else if (distPastFoot < ACCESS_TRANSITION_END) {
    const transitionWidth = ACCESS_TRANSITION_END - ACCESS_APPROACH_END;
    const u = (distPastFoot - ACCESS_APPROACH_END) / transitionWidth;
    rawHeight = approachGrade * ACCESS_APPROACH_END
      + approachGrade * transitionWidth * u
      + (cliffGrade - approachGrade) * transitionWidth * 0.5 * u * u;
  } else {
    const transitionWidth = ACCESS_TRANSITION_END - ACCESS_APPROACH_END;
    const transitionHeight = approachGrade * ACCESS_APPROACH_END
      + (approachGrade + cliffGrade) * transitionWidth * 0.5;
    rawHeight = transitionHeight + cliffGrade * (distPastFoot - ACCESS_TRANSITION_END);
  }
  // A wider summit range gives the perimeter a broken skyline instead of one
  // uniformly clipped berm. Physics and rendering still share this profile.
  const maxH = 34 + ruggedness * 42;
  return maxH * Math.tanh(rawHeight / maxH);
}

function eastMountainSurfaceHeight(x: number, z: number, seed: number): number {
  const distance = x - eastBoundaryX(z, seed) - MOUNTAIN_SURFACE_TOE_OFFSET;
  if (distance <= 0) return 0;
  return mountainHeight(
    distance,
    ridgeRuggedness(z, seed, 0x9a11),
    mountainAccessBlend(z, seed, 0xe451),
  );
}

function northMountainSurfaceHeight(x: number, z: number, seed: number): number {
  const distance = northBoundaryZ(x, seed) - z - MOUNTAIN_SURFACE_TOE_OFFSET;
  if (distance <= 0) return 0;
  return mountainHeight(
    distance,
    ridgeRuggedness(x, seed, 0x3c77),
    mountainAccessBlend(x, seed, 0x74a3),
  );
}

/** Exact height used by both the visible mountain terrain and motorcycle. */
export function mountainSurfaceHeight(
  side: "east" | "north",
  x: number,
  z: number,
  seed: number,
): number {
  return side === "east"
    ? eastMountainSurfaceHeight(x, z, seed)
    : northMountainSurfaceHeight(x, z, seed);
}

function mountainSurfaceGradient(
  side: "east" | "north",
  x: number,
  z: number,
  seed: number,
): { gx: number; gz: number; grade: number } {
  const eps = 0.3;
  const sample = side === "east" ? eastMountainSurfaceHeight : northMountainSurfaceHeight;
  const gx = (sample(x + eps, z, seed) - sample(x - eps, z, seed)) / (2 * eps);
  const gz = (sample(x, z + eps, seed) - sample(x, z - eps, seed)) / (2 * eps);
  return { gx, gz, grade: Math.hypot(gx, gz) };
}

/** Force and blocking derive from the same physical grade used by the mesh. */
function mountainForce(grade: number): { accel: number; steep: boolean; slopeDegrees: number } {
  const slopeDegrees = THREE.MathUtils.radToDeg(Math.atan(Math.abs(grade)));
  const steep = slopeDegrees > MAX_RIDEABLE_SLOPE_DEG + 1e-6;
  if (steep) {
    const excess = THREE.MathUtils.clamp((Math.abs(grade) - MAX_RIDEABLE_GRADE) / 1.5, 0, 1);
    return { accel: THREE.MathUtils.lerp(STEEP_ACCEL * 0.72, STEEP_ACCEL, excess), steep, slopeDegrees };
  }
  return {
    accel: FOOTHILL_ACCEL * THREE.MathUtils.clamp(Math.abs(grade) / MAX_RIDEABLE_GRADE, 0, 1),
    steep,
    slopeDegrees,
  };
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
  let slopeDegrees = 0;
  let speedCap = Infinity;

  // East mountain. Do not probe ahead of the visible toe: both collision and
  // terrain-follow begin only on the rendered rock surface.
  if (eastPast > MOUNTAIN_SURFACE_TOE_OFFSET - MOUNTAIN_COLLISION_INSET) {
    const surfaceGradient = mountainSurfaceGradient("east", x, z, seed);
    const f = mountainForce(surfaceGradient.grade);
    const h = eastMountainSurfaceHeight(x, z, seed);
    if (f.accel > 0 && h > 0) {
      const invGrade = surfaceGradient.grade > 1e-6 ? 1 / surfaceGradient.grade : 0;
      ax += -surfaceGradient.gx * invGrade * f.accel;
      az += -surfaceGradient.gz * invGrade * f.accel;
      steep ||= f.steep;
      slopeDegrees = Math.max(slopeDegrees, f.slopeDegrees);
    }
    if (h > height) {
      height = h;
      gx = surfaceGradient.gx;
      gz = surfaceGradient.gz;
      slopeDegrees = Math.max(
        slopeDegrees,
        THREE.MathUtils.radToDeg(Math.atan(surfaceGradient.grade)),
      );
    }
  }
  // North mountain, mirrored through the same visible-surface contract.
  if (northPast > MOUNTAIN_SURFACE_TOE_OFFSET - MOUNTAIN_COLLISION_INSET) {
    const surfaceGradient = mountainSurfaceGradient("north", x, z, seed);
    const f = mountainForce(surfaceGradient.grade);
    const h = northMountainSurfaceHeight(x, z, seed);
    if (f.accel > 0 && h > 0) {
      const invGrade = surfaceGradient.grade > 1e-6 ? 1 / surfaceGradient.grade : 0;
      ax += -surfaceGradient.gx * invGrade * f.accel;
      az += -surfaceGradient.gz * invGrade * f.accel;
      steep ||= f.steep;
      slopeDegrees = Math.max(slopeDegrees, f.slopeDegrees);
    }
    if (h > height) {
      height = h;
      gx = surfaceGradient.gx;
      gz = surfaceGradient.gz;
      slopeDegrees = Math.max(
        slopeDegrees,
        THREE.MathUtils.radToDeg(Math.atan(surfaceGradient.grade)),
      );
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

  return { ax, az, steep, height, gx, gz, slopeDegrees, speedCap };
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

/** Periodic, plate-like relief used by all three mountain PBR channels. */
function angularRockHeight(u: number, v: number, seed: number) {
  const phase = ((Math.imul(seed >>> 0, 0x45d9f3b) >>> 0) / 4294967296) * Math.PI * 2;
  const tau = Math.PI * 2;
  const broad = Math.sin(tau * (u * 3 + v * 2) + phase)
    + Math.sin(tau * (u * 2 - v * 5) - phase * 0.7) * 0.72;
  const plates = Math.round(broad * 2.4) / 2.4;
  const strata = Math.sin(tau * (u * 2 + v * 13) + phase * 0.35);
  const crag = Math.sin(tau * (u * 7 - v * 4) - phase * 1.2)
    * Math.sin(tau * (u * 5 + v * 6) + phase * 0.45);
  const crackWave = Math.abs(Math.sin(tau * (u * 4 + v * 7) + phase + crag * 0.7));
  const crack = crackWave > 0.985 ? -0.34 : 0;
  return plates * 0.38 + strata * 0.18 + crag * 0.16 + crack;
}

/**
 * Seeded low-poly rock atlas. Quantized plates create angular light breaks,
 * while integer-frequency functions make color, normal, and roughness exactly
 * tileable without the old blurred normal-map seam.
 */
function createMountainRockTextures(seed: number) {
  const size = 256;
  const height = new Float32Array(size * size);
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      const value = angularRockHeight(nx, ny, seed);
      height[y * size + x] = value;
      const ledge = Math.round(value * 3) / 3;
      const shade = THREE.MathUtils.clamp(0.74 + ledge * 0.12, 0.42, 0.94);
      const offset = (y * size + x) * 4;
      // Desaturated mossy slate shares the tree/stone low-poly palette.
      colorData[offset] = Math.round(154 * shade);
      colorData[offset + 1] = Math.round(158 * shade);
      colorData[offset + 2] = Math.round(140 * shade);
      colorData[offset + 3] = 255;
      const rough = Math.round(THREE.MathUtils.clamp(238 - Math.abs(value) * 14, 207, 250));
      roughnessData[offset] = roughnessData[offset + 1] = roughnessData[offset + 2] = rough;
      roughnessData[offset + 3] = 255;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = height[y * size + ((x - 1 + size) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const up = height[((y - 1 + size) % size) * size + x];
      const down = height[((y + 1) % size) * size + x];
      const normal = new THREE.Vector3((left - right) * 1.35, (up - down) * 1.35, 1).normalize();
      const offset = (y * size + x) * 4;
      normalData[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
    }
  }
  const makeTexture = (data: Uint8Array) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const map = makeTexture(colorData);
  map.colorSpace = THREE.SRGBColorSpace;
  return {
    map,
    normalMap: makeTexture(normalData),
    roughnessMap: makeTexture(roughnessData),
  };
}

/**
 * Broad low-poly rock terrain generated from the same height function sampled
 * by motorcycle physics. This is the actual mountain body/contact surface;
 * the peak rows behind it only enrich the skyline.
 */
function buildMountainSurfaceGeometry(
  seed: number,
  side: "east" | "north",
  alongSamples = 401,
  acrossSamples = 61,
): THREE.BufferGeometry {
  const alongMin = side === "east"
    ? -WORLD_HALF_DEPTH - RIDGE_MARGIN
    : -WORLD_HALF_WIDTH - RIDGE_MARGIN;
  const alongMax = side === "east"
    ? WORLD_HALF_DEPTH + RIDGE_MARGIN
    : WORLD_HALF_WIDTH + RIDGE_MARGIN;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const low = new THREE.Color(0x575d54);
  const high = new THREE.Color(0xb7b19a);
  const shade = new THREE.Color();

  for (let a = 0; a < alongSamples; a += 1) {
    const alongT = a / (alongSamples - 1);
    const along = THREE.MathUtils.lerp(alongMin, alongMax, alongT);
    for (let d = 0; d < acrossSamples; d += 1) {
      const depthT = d / (acrossSamples - 1);
      const outward = THREE.MathUtils.lerp(
        MOUNTAIN_SURFACE_TOE_OFFSET,
        MOUNTAIN_SURFACE_DEPTH,
        depthT,
      );
      let x: number;
      let z: number;
      if (side === "east") {
        z = along;
        x = eastBoundaryX(z, seed) + outward;
      } else {
        x = along;
        z = northBoundaryZ(x, seed) - outward;
      }
      const y = mountainSurfaceHeight(side, x, z, seed);
      positions.push(x, y + (d === 0 ? 0.012 : 0), z);
      uvs.push(depthT * 5, alongT * 32);
      const terrace = Math.round(
        THREE.MathUtils.clamp(0.2 + y / 105 + Math.sin(along * 0.023 + depthT * 8) * 0.08, 0, 1) * 5,
      ) / 5;
      shade.copy(low).lerp(high, terrace);
      colors.push(shade.r, shade.g, shade.b);
    }
  }

  for (let a = 0; a < alongSamples - 1; a += 1) {
    for (let d = 0; d < acrossSamples - 1; d += 1) {
      const i0 = a * acrossSamples + d;
      const i1 = i0 + 1;
      const i2 = i0 + acrossSamples;
      const i3 = i2 + 1;
      if ((a + d) % 2 === 0) indices.push(i0, i2, i1, i2, i3, i1);
      else indices.push(i0, i3, i1, i0, i2, i3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMountainRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Closed five-ring polyhedral mountain. Ninety small flat triangles make the
 * same deliberate faceted language as the tree crowns without a stretched
 * heightfield face ever becoming camera-sized.
 */
function createMountainPeakGeometry(seed: number, radial = 12) {
  const random = createMountainRandom(seed);
  const ringHeights = [0, 0.13, 0.37, 0.68, 0.88];
  const ringRadii = [1, 0.91, 0.67, 0.39, 0.17];
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const angularScale = Array.from({ length: radial }, () => 0.84 + random() * 0.26);
  const angles = Array.from(
    { length: radial },
    (_, i) => (i / radial) * Math.PI * 2 + (random() - 0.5) * 0.13,
  );
  const low = new THREE.Color(0x555b52);
  const high = new THREE.Color(0xb9b39c);
  const shade = new THREE.Color();

  for (let ring = 0; ring < ringHeights.length; ring += 1) {
    const t = ring / (ringHeights.length - 1);
    const shiftX = Math.sin(seed * 0.013 + ring * 1.7) * t * 0.08;
    const shiftZ = Math.cos(seed * 0.017 - ring * 1.3) * t * 0.08;
    for (let i = 0; i < radial; i += 1) {
      // A regular cardinal base gives the front range a measurable physical
      // toe. Higher rings keep their seeded distortion and faceted silhouette.
      const radius = ring === 0
        ? ringRadii[ring]
        : ringRadii[ring] * angularScale[i] * (0.94 + random() * 0.12);
      const angle = angles[i];
      const y = ringHeights[ring] + (ring > 0 ? (random() - 0.5) * 0.035 : 0);
      positions.push(
        Math.cos(angle) * radius + shiftX,
        y,
        Math.sin(angle) * radius + shiftZ,
      );
      uvs.push(i / radial, t);
      const band = Math.round((0.2 + t * 0.55 + random() * 0.22) * 4) / 4;
      shade.copy(low).lerp(high, THREE.MathUtils.clamp(band, 0, 1));
      colors.push(shade.r, shade.g, shade.b);
    }
  }

  for (let ring = 0; ring < ringHeights.length - 1; ring += 1) {
    for (let i = 0; i < radial; i += 1) {
      const next = (i + 1) % radial;
      const a = ring * radial + i;
      const b = ring * radial + next;
      const c = (ring + 1) * radial + i;
      const d = (ring + 1) * radial + next;
      const flip = (ring + i + seed) % 2 === 0;
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }

  const top = positions.length / 3;
  const topX = Math.sin(seed * 0.019) * 0.09;
  const topZ = Math.cos(seed * 0.023) * 0.09;
  positions.push(topX, 1, topZ);
  uvs.push(0.5, 1);
  colors.push(high.r, high.g, high.b);
  const lastRing = (ringHeights.length - 1) * radial;
  for (let i = 0; i < radial; i += 1) {
    indices.push(lastRing + i, top, lastRing + ((i + 1) % radial));
  }

  const bottom = positions.length / 3;
  positions.push(0, -0.035, 0);
  uvs.push(0.5, 0.5);
  colors.push(low.r, low.g, low.b);
  for (let i = 0; i < radial; i += 1) {
    indices.push(bottom, i, (i + 1) % radial);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

type MountainLayer = "front" | "back" | "horizon";

function buildMountainPeakRange(
  seed: number,
  side: "east" | "north",
  material: THREE.MeshStandardMaterial,
  layer: MountainLayer,
) {
  const salt = side === "east" ? 0x5a17 : 0x8c31;
  const layerSalt = layer === "front" ? 0x1171 : layer === "back" ? 0x4b23 : 0x7d91;
  const random = createMountainRandom(seed ^ salt ^ layerSalt);
  const alongMin = side === "east"
    ? -WORLD_HALF_DEPTH - RIDGE_MARGIN
    : -WORLD_HALF_WIDTH - RIDGE_MARGIN;
  const alongMax = side === "east"
    ? WORLD_HALF_DEPTH + RIDGE_MARGIN
    : WORLD_HALF_WIDTH + RIDGE_MARGIN;
  const spacing = layer === "front" ? 58 : layer === "back" ? 108 : 168;
  const count = Math.ceil((alongMax - alongMin) / spacing) + 2;
  const buckets: Array<Array<{
    along: number;
    outward: number;
    alongRadius: number;
    depthRadius: number;
    height: number;
    yaw: number;
  }>> = [[], [], []];

  for (let i = 0; i < count; i += 1) {
    const jitter = layer === "front" ? 0.24 : 0.42;
    const along = alongMin + (i - 0.5) * spacing + (random() - 0.5) * spacing * jitter;
    const rugged = ridgeRuggedness(
      along,
      seed,
      side === "east" ? 0x9a11 + layerSalt : 0x3c77 + layerSalt,
    );
    const alongRadius = layer === "front"
      ? 58 + random() * 18
      : layer === "back"
        ? 74 + random() * 34
        : 110 + random() * 48;
    const depthRadius = layer === "front"
      ? 54 + random() * 24
      : layer === "back"
        ? 82 + random() * 38
        : 125 + random() * 52;
    const yaw = layer === "front"
      // A half-turn keeps the elliptical footprint aligned to the boundary
      // while still flipping the asymmetric upper rings for visual variety.
      ? (random() < 0.5 ? 0 : Math.PI)
      : (random() - 0.5) * 0.2;
    const outward = layer === "front"
      // Keep skyline shells behind the shared physical terrain. They no longer
      // protrude into playable grass or participate in first contact.
      ? depthRadius + 14 + random() * 5
      : layer === "back"
        ? 112 + random() * 34
        : 208 + random() * 58;
    const height = layer === "front"
      ? 36 + rugged * 43 + random() * 10
      : layer === "back"
        ? 58 + rugged * 51 + random() * 14
        : 78 + rugged * 58 + random() * 18;
    buckets[i % buckets.length].push({
      along,
      outward,
      alongRadius,
      depthRadius,
      height,
      yaw,
    });
  }

  const group = new THREE.Group();
  group.name = `${side}-${layer}-mountain-range`;
  const dummy = new THREE.Object3D();
  for (let variant = 0; variant < buckets.length; variant += 1) {
    const peaks = buckets[variant];
    const geometry = createMountainPeakGeometry(seed ^ salt ^ layerSalt ^ (variant * 7919));
    const mesh = new THREE.InstancedMesh(geometry, material, peaks.length);
    mesh.name = `${side}-${layer}-mountain-peaks-${variant}`;
    for (let i = 0; i < peaks.length; i += 1) {
      const peak = peaks[i];
      if (side === "east") {
        const foot = eastBoundaryX(peak.along, seed);
        const centerX = foot + peak.outward;
        const baseY = eastMountainSurfaceHeight(centerX, peak.along, seed) - 2.5;
        dummy.position.set(centerX, baseY, peak.along);
        dummy.scale.set(peak.depthRadius, peak.height, peak.alongRadius);
      } else {
        const foot = northBoundaryZ(peak.along, seed);
        const centerZ = foot - peak.outward;
        const baseY = northMountainSurfaceHeight(peak.along, centerZ, seed) - 2.5;
        dummy.position.set(peak.along, baseY, centerZ);
        dummy.scale.set(peak.alongRadius, peak.height, peak.depthRadius);
      }
      dummy.rotation.set(0, peak.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = layer === "front";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Shared physical rock terrain plus two rows of closed faceted skyline peaks. */
export function buildNearMountainMeshes(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "near-ridge";

  const textures = createMountainRockTextures(seed);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.48, 0.48),
    roughnessMap: textures.roughnessMap,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const northMaterial = material.clone();
  northMaterial.color.set(0xe4e2d8);
  const eastSurface = new THREE.Mesh(buildMountainSurfaceGeometry(seed, "east"), material);
  eastSurface.name = "east-mountain-surface";
  eastSurface.receiveShadow = true;
  const northSurface = new THREE.Mesh(buildMountainSurfaceGeometry(seed, "north"), northMaterial);
  northSurface.name = "north-mountain-surface";
  northSurface.receiveShadow = true;

  group.add(
    eastSurface,
    northSurface,
    buildMountainPeakRange(seed, "east", material, "front"),
    buildMountainPeakRange(seed, "east", material, "back"),
    buildMountainPeakRange(seed, "north", northMaterial, "front"),
    buildMountainPeakRange(seed, "north", northMaterial, "back"),
  );
  return group;
}

/** A third staggered row of real polyhedral peaks, not a vertical skyline fin. */
export function buildFarSilhouetteGroup(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "far-silhouette";

  const material = new THREE.MeshStandardMaterial({
    color: 0x667065,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    fog: true,
  });
  const northMaterial = material.clone();
  northMaterial.color.set(0x70766c);
  group.add(
    buildMountainPeakRange(seed, "east", material, "horizon"),
    buildMountainPeakRange(seed, "north", northMaterial, "horizon"),
  );
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
