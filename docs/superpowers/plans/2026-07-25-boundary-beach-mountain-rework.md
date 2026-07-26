# Boundary Beach & Mountain Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wall-like west/south beach with a progressive speed-cap + open-water hard wall, add ruggedness variation + local terrain-following to east/north mountains, and gradient the grass→sand bank edge.

**Architecture:** One pure `sampleBoundary(x,z,seed)` returns `{ax, az, steep, height, gx, gz, speedCap}`. W/S beach = falling `speedCap` (no push force); W/S open water = hard shove (`steep`+accel); E/N mountain = `ruggedness`-modulated force+height (gentle=climbable, steep=blocking). The bike follows terrain y/pitch only inside boundary bands; the bank ribbon gets per-vertex grass→sand color.

**Tech Stack:** TypeScript, three.js, node `--experimental-strip-types --test`. All work in `.worktrees/boundary-heightfield` on branch `feature/boundary-heightfield`.

**Spec:** `docs/superpowers/specs/2026-07-25-boundary-beach-mountain-rework-design.md`

---

## File Structure

- `app/lib/map/boundaryTerrain.ts` — rewrite `sampleBoundary` (3 mechanics) + `mountainHeight`/`ridgeRuggedness`/`mountainGradient` helpers; rewrite `buildRiverGroup` bank ribbon to vertex-color gradient + add `groundColor` param; rewrite `buildNearMountainMeshes` ridge to follow ruggedness height.
- `app/lib/map/motorcycle.ts` — add `y` state; consume `height/gx/gz/speedCap` from the sampler (local terrain-follow + crawl cap).
- `app/lib/map/collision.ts` — `stepStones` consumes `height` for stone y.
- `app/lib/map/boundaries.ts` — `createWorldBoundaries(seed, groundColor)` passes ground tint through.
- `app/lib/map/ForestScene.ts` — pass `palette.ground` into `createWorldBoundaries`.
- `tests/boundary-terrain.test.mjs` — cap curve, water wall, ruggedness variation, height-at-foot=0.
- `tests/motorcycle.test.mjs` — beach crawl ceiling, gentle slope lifts y, steep blocks.

---

## Task 1: Rewrite `sampleBoundary` — beach cap, water wall, mountain ruggedness

**Files:**
- Modify: `app/lib/map/boundaryTerrain.ts` (replace the sampler + helpers, lines ~12-79)
- Test: `tests/boundary-terrain.test.mjs`

- [ ] **Step 1: Write the failing tests (append to `tests/boundary-terrain.test.mjs`)**

```js
import {
  sampleBoundary,
  BEACH_WIDTH,
  BEACH_CAP_NEAR,
  BEACH_CAP_FAR,
  FOOTHILL_WIDTH,
  STEEP_WIDTH,
} from "../app/lib/map/boundaryTerrain.ts";

const SEED = 42;

test("beach speed cap falls from ~6 km/h at foot to ~1 km/h at waterline (west)", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const atFoot = sampleBoundary(foot - 0.5, z, SEED);     // just onto the beach
  const atMid = sampleBoundary(foot - BEACH_WIDTH * 0.5, z, SEED);
  const atWater = sampleBoundary(foot - BEACH_WIDTH + 0.01, z, SEED);
  assert.ok(atFoot.speedCap <= BEACH_CAP_NEAR + 0.01, `foot cap ~near, got ${atFoot.speedCap}`);
  assert.ok(atMid.speedCap < atFoot.speedCap, `cap drops toward water: ${atMid.speedCap} < ${atFoot.speedCap}`);
  assert.ok(atWater.speedCap <= BEACH_CAP_FAR + 0.05, `waterline cap ~far, got ${atWater.speedCap}`);
  // No push force on the beach itself.
  assert.ok(Math.hypot(atFoot.ax, atFoot.az) < 0.01, "beach exerts no push force");
  assert.equal(atFoot.steep, false, "beach is not a hard block");
});

test("open water (west, past beach) is a steep hard wall shoving east", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const inWater = sampleBoundary(foot - BEACH_WIDTH - 10, z, SEED);
  assert.equal(inWater.steep, true, "open water is steep");
  assert.ok(inWater.ax > 10, `water shoves east (interior), ax=${inWater.ax}`);
});

test("mountain ruggedness produces varied heights along the east ridge", () => {
  const z1 = 200;
  const z2 = 900;
  const foot1 = eastBoundaryX(z1, SEED);
  const foot2 = eastBoundaryX(z2, SEED);
  const deep = FOOTHILL_WIDTH + STEEP_WIDTH * 0.8;
  const h1 = sampleBoundary(foot1 + deep, z1, SEED).height;
  const h2 = sampleBoundary(foot2 + deep, z2, SEED).height;
  assert.ok(h1 > 8 && h1 < 55, `height in range, got ${h1}`);
  assert.ok(h2 > 8 && h2 < 55, `height in range, got ${h2}`);
  assert.ok(Math.abs(h1 - h2) > 3, `ruggedness varies along the ridge: ${h1} vs ${h2}`);
});

test("terrain height is 0 at the foot line (smooth playable transition)", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const atFoot = sampleBoundary(foot + 0.01, z, SEED);
  assert.ok(atFoot.height < 0.5, `height ~0 at foot, got ${atFoot.height}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`
Expected: FAIL — `BEACH_WIDTH`/`BEACH_CAP_NEAR` not exported; `speedCap` undefined.

- [ ] **Step 3: Rewrite the sampler + helpers in `app/lib/map/boundaryTerrain.ts`**

Replace the constants block (lines ~12-15) and the `BoundarySample` type + `bandFromSigned` + `sampleBoundary` + `boundaryHeight` (lines ~17-79) with:

```ts
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

/** Analytic-ish gradient of mountainHeight w.r.t. distance past the foot line. */
function mountainGradient(distPastFoot: number, ruggedness: number): number {
  const eps = 0.5;
  return (mountainHeight(distPastFoot + eps, ruggedness) - mountainHeight(distPastFoot - eps, ruggedness)) / (2 * eps);
}

/** E/N mountain force intensity + steep flag, scaled by ruggedness. */
function mountainForce(distPastFoot: number, ruggedness: number): { t: number; steep: boolean } {
  if (distPastFoot <= 0) return { t: 0, steep: false };
  if (distPastFoot < FOOTHILL_WIDTH) {
    const u = distPastFoot / FOOTHILL_WIDTH;
    return { t: u * (0.15 + 0.2 * ruggedness), steep: false };
  }
  const u = Math.min(1, (distPastFoot - FOOTHILL_WIDTH) / STEEP_WIDTH);
  // Gentle ridges block later; steep ones block early.
  const steepAt = 0.55 - 0.35 * ruggedness; // [0.2, 0.55]
  return { t: 0.4 + 0.6 * u * (0.5 + 0.5 * ruggedness), steep: u > steepAt };
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
      gz = mountainGradient(northPast, rugged);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`
Expected: PASS — all beach/water/mountain/height tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/map/boundaryTerrain.ts tests/boundary-terrain.test.mjs
git commit -m "Rework boundary sampler: beach cap, water wall, mountain ruggedness"
```

---

## Task 2: Motorcycle local terrain-follow + beach crawl cap

**Files:**
- Modify: `app/lib/map/motorcycle.ts` (add `y` field; consume `height/gx/gz/speedCap`)
- Test: `tests/motorcycle.test.mjs`

- [ ] **Step 1: Write the failing tests (append to `tests/motorcycle.test.mjs`)**

```js
test("beach speed cap crawls the bike down to the ceiling", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 15;
  moto.heading = 0;
  moto.velHeading = 0;
  const beach = () => ({ ax: 0, az: 0, steep: false, height: 0, gx: 0, gz: 0, speedCap: 1.0 });
  for (let t = 0; t < 3; t += DT) {
    moto.update(DT, input({ throttle: 1 }), noCollision, noClamp, beach);
  }
  assert.ok(moto.speed <= 1.15, `crawls down to cap ~1.0, got ${moto.speed}`);
  assert.ok(moto.speed > 0.5, `still moving (not dead-stopped), got ${moto.speed}`);
});

test("gentle mountain slope lifts the bike y (terrain-follow)", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 10;
  moto.heading = Math.PI / 2; // travel +x
  moto.velHeading = Math.PI / 2;
  const slope = () => ({ ax: -1.5, az: 0, steep: false, height: 12, gx: 0.8, gz: 0, speedCap: Infinity });
  for (let t = 0; t < 1; t += DT) {
    moto.update(DT, input({ throttle: 1 }), noCollision, noClamp, slope);
  }
  assert.ok(moto.y > 5, `bike climbed onto the slope, y=${moto.y}`);
});

test("steep mountain blocks and keeps the bike from pushing through", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 20;
  moto.heading = Math.PI / 2;
  moto.velHeading = Math.PI / 2;
  const wall = () => ({ ax: -14, az: 0, steep: true, height: 30, gx: 0, gz: 0, speedCap: Infinity });
  const x0 = moto.x;
  for (let t = 0; t < 1; t += DT) {
    moto.update(DT, input({ throttle: 1 }), noCollision, noClamp, wall);
  }
  assert.ok(moto.speed < 4, `steep scrubs speed, got ${moto.speed}`);
  assert.ok(moto.x - x0 < 6, `steep stops forward progress, dx=${moto.x - x0}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/motorcycle.test.mjs`
Expected: FAIL — `moto.y` undefined; cap/slope not applied.

- [ ] **Step 3: Add `y` field to the controller**

In `app/lib/map/motorcycle.ts`, add `y = 0;` to the `MotorcycleController` field block (next to `x = 0; z = 0;`), and in `reset(...)` add `this.y = 0;`.

Update `MotoPose` type to include `y: number;` and `getPose()` to return `y: this.y`.

- [ ] **Step 4: Update the `BoundarySampler` type + `noBoundary` default**

```ts
export type BoundarySampler = (x: number, z: number) => {
  ax: number;
  az: number;
  steep: boolean;
  height: number;
  gx: number;
  gz: number;
  speedCap: number;
};

const noBoundary: BoundarySampler = () => ({ ax: 0, az: 0, steep: false, height: 0, gx: 0, gz: 0, speedCap: Infinity });
```

- [ ] **Step 5: Apply beach cap + terrain-follow inside `update`**

Right after the existing `this.speed = speed;` that follows the longitudinal force balance (the line after the `if/else if/else` chain), insert the beach crawl cap:

```ts
    // Beach crawl cap: pull speed down toward the sampler's ceiling (no push force).
    const cap = band.speedCap ?? Infinity;
    if (cap !== Infinity && speed > cap) {
      speed += (cap - speed) * Math.min(1, 6 * dt);
      this.speed = speed;
    }
```

Then, after the final `clampToWorld` block (step 7 in the current comments) and before the lean section, add terrain-follow:

```ts
    // Terrain-follow (boundary band only): y tracks the heightfield; pitch follows
    // the grade along travel. Playable interior keeps y=0, slope pitch 0.
    this.y = band.height ?? 0;
    const slopePitch = (band.gx ?? 0) * Math.sin(this.heading) + (band.gz ?? 0) * Math.cos(this.heading);
```

Then change the pitch target line so the nod composes on top of the sustained slope pitch. Replace:

```ts
    const pitchTarget = (this.nodTimer > 0 ? PITCH_MAX : 0) + (hardBraking ? PITCH_MAX * 0.35 : 0);
```

with:

```ts
    const nodPitch = (this.nodTimer > 0 ? PITCH_MAX : 0) + (hardBraking ? PITCH_MAX * 0.35 : 0);
    const pitchTarget = slopePitch + nodPitch;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/motorcycle.test.mjs`
Expected: PASS — crawl cap, terrain-follow, steep block all green; existing 14 tests still pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib/map/motorcycle.ts tests/motorcycle.test.mjs
git commit -m "Motorcycle: beach crawl cap + local terrain-follow (y/pitch)"
```

---

## Task 3: Stones follow terrain y in `collision.stepStones`

**Files:**
- Modify: `app/lib/map/collision.ts` (`stepStones` — use `height` for stone y)
- Test: `tests/motorcycle.test.mjs` (kick scenario already calls stepStones; add a y check)

- [ ] **Step 1: Write the failing test (append to `tests/motorcycle.test.mjs`)**

```js
test("rolling stone follows boundary terrain height", () => {
  const mesh = fakeStoneMesh();
  const stone = { x: 0, z: 5, y: 0.1, r: 0.3, mass: 2, index: 0, q: { x: 0, y: 0, z: 0, w: 1 }, s: { x: 1, y: 1, z: 1 } };
  const cw = new CollisionWorld();
  cw.syncChunks([{ key: "0,0", colliders: { trees: [], stones: [stone], stoneMesh: mesh } }]);
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 10;
  const dummy = new Object3D();
  const slope = () => ({ ax: 0, az: 0, steep: false, height: 8, gx: 0, gz: 0, speedCap: Infinity });
  for (let t = 0; t < 1; t += DT) {
    moto.update(DT, input(), cw, noClamp, slope);
    cw.stepStones(DT, noClamp, slope);
    cw.writeMatrices(dummy);
  }
  assert.ok(mesh.last, "stone matrix rewritten");
  // Stone y (instance matrix translation, element 13) should reflect terrain height 8.
  assert.ok(mesh.last[13] > 4, `stone lifted onto terrain, y=${mesh.last[13]}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/motorcycle.test.mjs`
Expected: FAIL — stone y stays at collider.y (0.1), not terrain.

- [ ] **Step 3: Make `stepStones` sample height for the stone y**

In `app/lib/map/collision.ts`, the `stepStones` signature already takes `sampleBoundary` (added by the heightfield work). After the existing `body.x += body.vx * dt; body.z += body.vz * dt;` and the boundary accel/steep block, the stone's render y is written later in `writeMatrices` from `c.y` (the collider's initial y). Change `writeMatrices` to use a live terrain y instead.

In `writeMatrices`, replace:

```ts
      dummy.position.set(body.x, c.y, body.z);
```

with:

```ts
      dummy.position.set(body.x, this.stoneY(body, c), body.z);
```

and add a helper that asks the stored sampler for the terrain y (the sampler is passed to `stepStones`, so cache the latest sampler on the instance):

```ts
  private lastSampler: ((x: number, z: number) => { height: number }) | null = null;

  stepStones(
    dt: number,
    clampToWorld: (x: number, z: number) => { x: number; z: number },
    sampleBoundary: (x: number, z: number) => { ax: number; az: number; steep: boolean; height: number; gx?: number; gz?: number; speedCap?: number } = () => ({ ax: 0, az: 0, steep: false, height: 0 }),
  ) {
    this.lastSampler = sampleBoundary;
    // ... existing body loop unchanged ...
  }

  private stoneY(body: StoneBody, c: StoneCollider): number {
    const h = this.lastSampler ? this.lastSampler(body.x, body.z).height : 0;
    return (h || 0) + c.y; // rest the stone's local offset on top of the terrain
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/motorcycle.test.mjs`
Expected: PASS — stone lifts to terrain y; all 17 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/map/collision.ts tests/motorcycle.test.mjs
git commit -m "Collision: stones follow boundary terrain height"
```

---

## Task 4: Grass→sand gradient bank ribbon + groundColor plumbing

**Files:**
- Modify: `app/lib/map/boundaryTerrain.ts` (`buildRiverGroup` — vertex-color bank ribbon sized to beach zone; add `groundColor` param)
- Modify: `app/lib/map/boundaries.ts` (`createWorldBoundaries(seed, groundColor)`)
- Modify: `app/lib/map/ForestScene.ts` (pass `palette.ground`)
- Test: `tests/boundary-terrain.test.mjs` (geometry has a color attribute)

- [ ] **Step 1: Write the failing test (append to `tests/boundary-terrain.test.mjs`)**

```js
import { buildRiverGroup } from "../app/lib/map/boundaryTerrain.ts";

test("bank ribbon carries per-vertex grass→sand color", () => {
  const group = buildRiverGroup(SEED, 0x789663);
  const bank = group.children.find((m) => m.geometry.getAttribute("color"));
  assert.ok(bank, "bank mesh has a color attribute");
  const colors = bank.geometry.getAttribute("color");
  assert.ok(colors.count > 0, "color attribute populated");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`
Expected: FAIL — no color attribute on the bank mesh.

- [ ] **Step 3: Add a gradient ribbon builder + rewire `buildRiverGroup`**

In `app/lib/map/boundaryTerrain.ts`, add a builder that stamps per-vertex color (inner = grass, outer = sand) by testing each ribbon vertex's distance to the world origin:

```ts
import * as THREE from "three";
// (THREE already imported at top of file)

const SAND_COLOR = 0x9b9275;

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
    // Inner = closer to world origin (playable side).
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
```

Rewrite `buildRiverGroup` to size the bank to the beach zone and use the gradient ribbon; accept `groundColor`:

```ts
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
      p.x + (points === shiftedWest ? -WATER_WIDTH / 2 - BEACH_WIDTH / 2 : 0),
      p.y,
      p.z + (points === shiftedSouth ? WATER_WIDTH / 2 + BEACH_WIDTH / 2 : 0),
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
```

- [ ] **Step 4: Plumb `groundColor` through `boundaries.ts`**

In `app/lib/map/boundaries.ts`:

```ts
import * as THREE from "three";
import { buildFarSilhouetteGroup, buildNearMountainMeshes, buildRiverGroup } from "./boundaryTerrain";

export function createWorldBoundaries(seed: number, groundColor: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "irregular-world-boundaries";
  group.add(buildRiverGroup(seed, groundColor));
  group.add(buildNearMountainMeshes(seed));
  group.add(buildFarSilhouetteGroup(seed));
  return group;
}
```

- [ ] **Step 5: Pass `palette.ground` from `ForestScene.ts`**

In `app/lib/map/ForestScene.ts`, in `build(settings)`, replace:

```ts
    this.staticLayer.add(createWorldBoundaries(settings.seed));
```

with:

```ts
    this.staticLayer.add(createWorldBoundaries(settings.seed, palette.ground));
```

(`palette` is already `SEASONS[settings.season]` earlier in `build`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`
Expected: PASS — bank ribbon has a color attribute.

- [ ] **Step 7: Commit**

```bash
git add app/lib/map/boundaryTerrain.ts app/lib/map/boundaries.ts app/lib/map/ForestScene.ts tests/boundary-terrain.test.mjs
git commit -m "Gradient grass→sand bank ribbon + groundColor plumbing"
```

---

## Task 5: Ridge mesh follows ruggedness height (visual relief)

**Files:**
- Modify: `app/lib/map/boundaryTerrain.ts` (`buildEdgeRidgeGeometry` — use ruggedness-modulated height along the ridge)
- Test: `tests/rendered-html.test.mjs` (source-shape check, since geometry output isn't unit-testable headlessly)

- [ ] **Step 1: Write the failing source-shape test (append to `tests/rendered-html.test.mjs`)**

```js
test("mountain ridge mesh uses ruggedness-modulated height", async () => {
  const boundary = await readFile(new URL("../app/lib/map/boundaryTerrain.ts", import.meta.url), "utf8");
  assert.match(boundary, /ridgeRuggedness\(alongCoord/);
  assert.match(boundary, /mountainHeight\(depthPastFoot, ruggedness\)/);
  assert.match(boundary, /buildEdgeRidgeGeometry/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/rendered-html.test.mjs`
Expected: FAIL — `ridgeRuggedness(alongCoord` not yet used in the mesh builder.

- [ ] **Step 3: Make `buildEdgeRidgeGeometry` sample ruggedness per ridge vertex**

In `app/lib/map/boundaryTerrain.ts`, in `buildEdgeRidgeGeometry`, the height is currently `const worldY = boundaryHeight(worldX, worldZ, seed);`. Since `boundaryHeight` already runs the full ruggedness-modulated `sampleBoundary`, just confirm the ridge grid samples across the band (it does: `depthT` spans `RIDGE_DEPTH_SPAN`). To make relief read clearly, increase `acrossSamples` so the ruggedness curve along the ridge resolves. Change the two `buildEdgeRidgeGeometry(seed, "east", 96, 12)` / `"north"` calls in `buildNearMountainMeshes` to use more across-samples:

```ts
  const east = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "east", 128, 18), material);
  east.castShadow = true;
  east.receiveShadow = true;

  const north = new THREE.Mesh(buildEdgeRidgeGeometry(seed, "north", 128, 18), northMaterial);
  north.castShadow = true;
  north.receiveShadow = true;
```

(`boundaryHeight` already returns ruggedness-modulated height from Task 1, so the mesh now varies along the ridge.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/rendered-html.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/map/boundaryTerrain.ts tests/rendered-html.test.mjs
git commit -m "Mountain ridge mesh follows ruggedness height (visual relief)"
```

---

## Task 6: Full build + QA

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: build succeeds; all tests pass (boundary-terrain + motorcycle grow by the new cases; rendered-html green).

- [ ] **Step 2: Commit any remaining test-only fixups** (if the suite surfaced a stray assertion)

```bash
git add -A
git commit -m "Test fixups from full-suite run" || echo "nothing to commit"
```

- [ ] **Step 3: Browser QA checklist** (run `npm run dev`, enter ride mode, verify by eye + `window.render_game_to_text`)

- [ ] Ride west onto a beach: bike slows to a crawl (~6 km/h) and creeps toward water; closer to water = slower; no wall-feel on sand.
- [ ] Hit open water: bike is shoved back out, never enters water.
- [ ] Ride east/north: mountains vary — gentle stretches climb (bike y rises, visible pitch), steep stretches block.
- [ ] Grass meets sand through a ~15 m gradient; no hard edge at the foot line.
- [ ] Playable interior driving feels unchanged (y=0, no spurious pitch).
- [ ] No browser console errors.

- [ ] **Step 4: Final commit (QA notes / tuning if constants were tweaked)**

```bash
git add -A
git commit -m "Tune boundary beach/mountain feel from QA" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Existing mock samplers** in `tests/motorcycle.test.mjs` (the `wall`/`steep` fakes) return only `{ax, az, steep, height}`. Task 2 Step 4 makes the controller read new fields with `?? defaults`, so those fakes keep working — do not edit them unless a test asks.
- **Pitch sign**: `slopePitch` uses `gx*sin(h) + gz*cos(h)`. If QA shows the nose dips uphill instead of rising, flip the sign. The math is centralized in one line.
- **Cap curve / ruggedness / water shove** constants (`BEACH_CAP_*`, `WATER_ACCEL`, ruggedness frequencies) are tuning dials — adjust after QA, they are deliberately exported for that.
- **AppleDouble noise**: `git` emits `non-monotonic index ._pack-*.idx` errors but still completes operations. Ignore them; cleaning the `._*` files from `.git/objects/pack` is a separate housekeeping task.
