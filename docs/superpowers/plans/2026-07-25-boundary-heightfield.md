# Boundary Heightfield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace flat-ground air walls with Path-A xz slope/river boundary forces, rebuild near-ridge + far-silhouette visuals, raise drift floor to 25 km/h, and keep dual-pass `clampToWorld` only as a mid-slope failsafe.

**Architecture:** New `boundaryTerrain.ts` owns height sampling, unified `boundaryForce`, and mesh builders. `motorcycle.ts` stays on y=0 and applies interior-pointing xz acceleration + scrub; steep bands kill drift. `boundaries.ts` swaps cone walls for heightfield meshes. `world.ts` retargets clamp inset to negative (past the foot line onto mid-slope).

**Tech Stack:** TypeScript, Three.js, Node test runner (`node --experimental-strip-types --test`), existing vinext/Cloudflare app shell.

**Spec:** `docs/superpowers/specs/2026-07-25-boundary-heightfield-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| Create `app/lib/map/boundaryTerrain.ts` | Height/force math (no THREE in pure helpers), mesh builders (THREE ok) |
| Create `tests/boundary-terrain.test.mjs` | Force direction, steep flags, failsafe vs steep band |
| Modify `app/lib/map/world.ts` | Failsafe clamp default inset (~`-100`), document dual-pass |
| Modify `app/lib/map/motorcycle.ts` | `DRIFT_MIN=6.9`, boundary force apply, no-drift-in-steep |
| Modify `tests/motorcycle.test.mjs` | Drift floor + steep-band drift exit |
| Modify `app/lib/map/boundaries.ts` | Wire heightfield near ridge + rivers + silhouette |
| Modify `app/lib/map/ForestScene.ts` | Pass seed-bound force/clamp; failsafe inset |
| Modify `app/lib/map/collision.ts` | Stones get boundary push / stop on steep |
| Modify `app/lib/map/farField.ts` | Slightly pull cards off new near ridge |
| Modify `package.json` | Include `tests/boundary-terrain.test.mjs` in `test` script |

---

### Task 1: Commit revised spec + scaffold `boundaryTerrain` force API (TDD)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-boundary-heightfield-design.md` (user edits, if uncommitted)
- Create: `tests/boundary-terrain.test.mjs`
- Create: `app/lib/map/boundaryTerrain.ts`
- Modify: `package.json` (`test` script)

- [x] **Step 1: Commit the revised spec if dirty**

```bash
git add docs/superpowers/specs/2026-07-25-boundary-heightfield-design.md
git commit -m "$(cat <<'EOF'
Lock boundary heightfield design revision.

Document Path-A xz slope force, unified boundaryForce, 25 km/h drift floor, and mid-slope failsafe clamp.
EOF
)"
```

- [x] **Step 2: Write failing tests for force + steep**

Create `tests/boundary-terrain.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  sampleBoundary,
  FOOTHILL_WIDTH,
  STEEP_WIDTH,
} from "../app/lib/map/boundaryTerrain.ts";
import { eastBoundaryX, westBoundaryX, northBoundaryZ, southBoundaryZ } from "../app/lib/map/world.ts";

const SEED = 42;

test("east of foot line: force points west (interior) and becomes steep", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const steepX = foot + FOOTHILL_WIDTH + STEEP_WIDTH * 0.5;
  const s = sampleBoundary(steepX, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.ax < -1, `expect strong west accel, ax=${s.ax}`);
  assert.ok(Math.abs(s.az) < Math.abs(s.ax), "east band force is mostly ±x");
});

test("inside playable flat: zero force, not steep", () => {
  const s = sampleBoundary(0, 0, SEED);
  assert.equal(s.steep, false);
  assert.ok(Math.hypot(s.ax, s.az) < 0.01);
});

test("west of west foot: force points east (interior) and steep", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const x = foot - FOOTHILL_WIDTH - STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.ax > 1, `expect east accel, ax=${s.ax}`);
});

test("north of north foot: force points south", () => {
  const x = 0;
  const foot = northBoundaryZ(x, SEED);
  const z = foot - FOOTHILL_WIDTH - STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az > 1, `expect south accel, az=${s.az}`);
});

test("south of south foot: force points north", () => {
  const x = 0;
  const foot = southBoundaryZ(x, SEED);
  const z = foot + FOOTHILL_WIDTH + STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az < -1, `expect north accel, az=${s.az}`);
});
```

- [x] **Step 3: Run tests — expect FAIL (module missing)**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`  
Expected: FAIL resolving `boundaryTerrain.ts`

- [x] **Step 4: Implement pure force sampler (no THREE)**

Create `app/lib/map/boundaryTerrain.ts` with at least:

```ts
import {
  eastBoundaryX,
  westBoundaryX,
  northBoundaryZ,
  southBoundaryZ,
} from "./world";

/** Soft approach from foot toward exterior before full slide. */
export const FOOTHILL_WIDTH = 18;
/** Unclimbable band where force peaks. */
export const STEEP_WIDTH = 55;
/** Peak interior accel on steep band (m/s^2), ~ g·sinθ for steep grade. */
export const STEEP_ACCEL = 14;
/** Mild accel in foothills. */
export const FOOTHILL_ACCEL = 3.5;

export type BoundarySample = {
  ax: number;
  az: number;
  steep: boolean;
  /** Visual / stone height; 0 on flat playable. */
  height: number;
};

function bandFromSigned(distPastFoot: number): { t: number; steep: boolean; height: number } {
  // distPastFoot > 0 means outside / into the hazard (mountain up or river out).
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

/** Unified force for all four edges. Positive force components push toward interior. */
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
    ax += -STEEP_ACCEL * e.t; // push west
    steep ||= e.steep;
    height = Math.max(height, e.height);
  }
  const w = bandFromSigned(westPast);
  if (w.t > 0) {
    ax += STEEP_ACCEL * w.t; // push east
    steep ||= w.steep;
    height = Math.max(height, w.height * 0.15); // river: keep low visual "depth cue" via separate mesh
  }
  const n = bandFromSigned(northPast);
  if (n.t > 0) {
    az += STEEP_ACCEL * n.t; // push south
    steep ||= n.steep;
    height = Math.max(height, n.height);
  }
  const s = bandFromSigned(southPast);
  if (s.t > 0) {
    az += -STEEP_ACCEL * s.t; // push north
    steep ||= s.steep;
  }

  return { ax, az, steep, height };
}

export function boundaryHeight(x: number, z: number, seed: number): number {
  return sampleBoundary(x, z, seed).height;
}
```

- [x] **Step 5: Wire test script + run tests — expect PASS**

In `package.json` `test` script, append `tests/boundary-terrain.test.mjs` to the node test list.

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`  
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add app/lib/map/boundaryTerrain.ts tests/boundary-terrain.test.mjs package.json
git commit -m "$(cat <<'EOF'
Add boundaryTerrain sampler with unified edge forces.

Steep bands push toward the map interior so slopes/rivers can replace flat air walls.
EOF
)"
```

---

### Task 2: Failsafe `clampToWorld` on mid-slope

**Files:**
- Modify: `app/lib/map/world.ts`
- Modify: `tests/boundary-terrain.test.mjs`

- [x] **Step 1: Add failsafe constant + test**

Append to `tests/boundary-terrain.test.mjs`:

```js
import { clampToWorld, FAILSAFE_INSET } from "../app/lib/map/world.ts";

test("failsafe clamp allows foothill/steep entry but stops mid-upper slope", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const deep = foot + FOOTHILL_WIDTH + STEEP_WIDTH + 40; // past steep band
  const c = clampToWorld(deep, z, SEED, FAILSAFE_INSET);
  assert.ok(c.x < deep, "clamps back from beyond steep");
  assert.ok(c.x > foot + FOOTHILL_WIDTH, "still past foot — not a flat-grass wall");
});
```

- [x] **Step 2: Run — expect FAIL (`FAILSAFE_INSET` missing)**

Run: `node --experimental-strip-types --test tests/boundary-terrain.test.mjs`

- [x] **Step 3: Update `world.ts`**

```ts
/**
 * Failsafe only: negative inset means the clamp line sits OUTSIDE the foot
 * curves (into mountain/river hazard), ~ mid–upper steep band.
 * Normal play must be stopped by boundaryForce before this triggers.
 */
export const FAILSAFE_INSET = -(FOOTHILL_HINT + 70);
// Prefer defining FAILSAFE_INSET numerically in world.ts to avoid a cycle:
export const FAILSAFE_INSET = -100;

export function clampToWorld(x: number, z: number, seed: number, inset = FAILSAFE_INSET) {
  let nextX = THREE.MathUtils.clamp(x, westBoundaryX(z, seed) + inset, eastBoundaryX(z, seed) - inset);
  let nextZ = THREE.MathUtils.clamp(z, northBoundaryZ(nextX, seed) + inset, southBoundaryZ(nextX, seed) - inset);
  nextX = THREE.MathUtils.clamp(nextX, westBoundaryX(nextZ, seed) + inset, eastBoundaryX(nextZ, seed) - inset);
  return { x: nextX, z: nextZ };
}
```

Keep the dual-pass structure exactly; only change the default `inset` to `FAILSAFE_INSET` (`-100`).

Note: call sites that used inset `5`, `4`, `28`, `150`, `90` must be updated in Task 4 — for now leave explicit positive insets at those call sites so behavior does not silently widen.

- [x] **Step 4: Run tests — expect PASS**

- [x] **Step 5: Commit**

```bash
git add app/lib/map/world.ts tests/boundary-terrain.test.mjs
git commit -m "$(cat <<'EOF'
Move world clamp failsafe onto mid-slope.

Keep dual-pass corner coupling; default inset is now outside the foot line.
EOF
)"
```

---

### Task 3: Motorcycle Path-A force + drift floor + no drift on steep

**Files:**
- Modify: `app/lib/map/motorcycle.ts`
- Modify: `tests/motorcycle.test.mjs`

- [x] **Step 1: Update / add motorcycle tests**

In `tests/motorcycle.test.mjs`:

1. Change the existing drift test so pace is clearly above 25 km/h (already ~cruise) — keep assertion.
2. Add:

```js
test("below 25 km/h Space+steer hard-brakes without drifting", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 5.5; // < 6.9 m/s
  moto.heading = 0;
  moto.velHeading = 0;
  for (let t = 0; t < 0.4; t += DT) {
    moto.update(DT, input({ hardBrake: true, steer: 1 }), noCollision, noClamp);
  }
  assert.equal(moto.drifting, false);
});

test("steep boundary sample kills drift and pushes interior", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 20;
  moto.heading = 0;
  moto.velHeading = 0;
  moto.drifting = true;
  const steepSampler = () => ({ ax: -12, az: 0, steep: true, height: 20 });
  const x0 = moto.x;
  for (let t = 0; t < 0.5; t += DT) {
    moto.update(DT, input({ hardBrake: true, steer: 1 }), noCollision, noClamp, steepSampler);
  }
  assert.equal(moto.drifting, false, "steep band exits drift");
  assert.ok(moto.x < x0, "interior push moves west when ax negative while heading +z — set heading to +x instead");
});
```

Fix the push assertion properly in the real test: set `heading = Math.PI/2` (travel +x), place at origin, `ax: -12`, expect `moto.x` to decrease after updates **or** apply force after integration and assert `speed` drops when driving into the force. Preferred concrete test:

```js
test("boundary force scrubs speed when driving against it", () => {
  const moto = new MotorcycleController();
  moto.reset(0, 0, 0);
  moto.speed = 15;
  moto.heading = Math.PI / 2; // +x
  moto.velHeading = Math.PI / 2;
  const wall = () => ({ ax: -14, az: 0, steep: true, height: 10 });
  const before = moto.speed;
  for (let t = 0; t < 0.6; t += DT) {
    moto.update(DT, input({ throttle: 1 }), noCollision, noClamp, wall);
  }
  assert.equal(moto.drifting, false);
  assert.ok(moto.speed < before * 0.85, `scrubs against wall, ${before} -> ${moto.speed}`);
});
```

- [x] **Step 2: Run motorcycle tests — expect FAIL on new API / DRIFT_MIN**

Run: `node --experimental-strip-types --test tests/motorcycle.test.mjs`

- [x] **Step 3: Implement motorcycle changes**

```ts
// DRIFT_MIN = 6.9; // 25 km/h

export type BoundarySampler = (x: number, z: number) => {
  ax: number;
  az: number;
  steep: boolean;
  height: number;
};

update(
  dt: number,
  input: MotoInput,
  collision: CollisionWorld,
  clampToWorld: ClampFn,
  sampleBoundary: BoundarySampler = () => ({ ax: 0, az: 0, steep: false, height: 0 }),
): MotoPose {
  // After computing wantDrift candidates, before/while drift block:
  const band = sampleBoundary(this.x, this.z);
  if (band.steep) {
    this.drifting = false;
  }
  const wantDrift =
    !band.steep &&
    hardBraking &&
    speed > DRIFT_MIN &&
    (Math.abs(input.steer) > 0.12 || Math.abs(this.steer) > 0.06 || this.drifting);

  // ... existing long/yaw/move/collision ...

  // After collision resolve, before clamp:
  const sample = sampleBoundary(x, z);
  if (sample.steep) this.drifting = false;
  // Project velocity, apply accel, scrub component opposing interior force
  let vx = Math.sin(travelHeading) * speed;
  let vz = Math.cos(travelHeading) * speed;
  vx += sample.ax * dt;
  vz += sample.az * dt;
  // Scrub when velocity dots against the interior force (driving uphill / into water)
  const fLen = Math.hypot(sample.ax, sample.az);
  if (fLen > 0.01) {
    const fx = sample.ax / fLen;
    const fz = sample.az / fLen;
    const intoHazard = -(vx * fx + vz * fz); // positive if moving against interior push
    if (intoHazard > 0) {
      const loss = Math.min(intoHazard, 0.75 * intoHazard); // tree-like fraction on opposing component
      vx += fx * loss; // cancel opposing component toward interior
      vz += fz * loss;
    }
  }
  speed = Math.hypot(vx, vz) * Math.sign(speed || 1);
  // Prefer: re-derive signed speed along travel; if reverse keep sign carefully.
  // Practical arcade: set speed = hypot(vx,vz) with sign of previous longitudinal if gripping.
  if (Math.abs(speed) > STOP_EPS) {
    this.velHeading = Math.atan2(vx, vz);
    if (!this.drifting) this.heading = this.velHeading; // optional — better keep heading, only update velHeading + signed speed
  }
  // Safer Path A: keep heading; set speed from projection onto travel axis; add residual as velHeading lag only if drifting.
  const tx = Math.sin(this.velHeading);
  const tz = Math.cos(this.velHeading);
  let signed = vx * tx + vz * tz;
  // Also integrate free lateral from force into position directly:
  x += (vx - tx * signed) * dt + sample.ax * dt * dt; // keep simple — see note below
```

**Use this simpler, testable Path-A block (authoritative for this plan):**

```ts
    // 4b. Boundary slope/river force (Path A: xz only, bike y stays 0).
    const sample = sampleBoundary(x, z);
    if (sample.steep) this.drifting = false;
    const travel = speed >= 0 || this.drifting ? this.velHeading : this.heading;
    let vx = Math.sin(travel) * speed;
    let vz = Math.cos(travel) * speed;
    vx += sample.ax * dt;
    vz += sample.az * dt;
    const fMag = Math.hypot(sample.ax, sample.az);
    if (fMag > 1e-6) {
      const fx = sample.ax / fMag;
      const fz = sample.az / fMag;
      const oppose = -(vx * fx + vz * fz);
      if (oppose > 0) {
        const scrub = oppose * 0.75;
        vx += fx * scrub;
        vz += fz * scrub;
      }
    }
    const newSpeed = Math.hypot(vx, vz);
    if (newSpeed > 1e-6) {
      this.velHeading = Math.atan2(vx, vz);
      if (!this.drifting) {
        // Keep nose with travel when gripping so force doesn't invent slip.
        this.heading = this.velHeading;
      }
      speed = speed < 0 && !this.drifting ? -newSpeed : newSpeed;
      if (speed < 0 && sample.steep) speed = Math.min(0, speed); // no reverse climb out of river
    } else {
      speed = 0;
    }
    this.speed = speed;
    x += Math.sin(this.velHeading) * speed * 0; // position already advanced earlier — RE-APPLY carefully
```

**Integration order (required):** move → collide → **recompute velocity from boundary force without double-integrating position** → write `x,z` once:

After step 4 collision, replace the “move already applied” velocity as:

```ts
    // Boundary adjusts the post-collision velocity, then we do NOT move again;
    // instead nudge position by the force-induced delta this frame:
    const sample = sampleBoundary(x, z);
    if (sample.steep) this.drifting = false;
    let vx = Math.sin(this.velHeading) * this.speed; // use post-collision speed/heading
    // ... apply ax/az and scrub to vx,vz ...
    // Convert back to speed + velHeading; set this.speed
    // Nudge: x += 0.5 * sample.ax * dt * dt is optional; primary is velocity rewrite then:
    x += (vx - Math.sin(prevTravel) * prevSpeed) * dt; // delta-v * dt
    z += (vz - Math.cos(prevTravel) * prevSpeed) * dt;
```

Implementers: prefer **applying boundary force before the position integrate** (after longitudinal + yaw, before `x += fx*speed*dt`) so there is a single integrate. That means:

1. Longitudinal + drift flags (with steep kill using `sampleBoundary(this.x,this.z)`)
2. Yaw
3. Build `vx,vz` from speed/velHeading; add `ax*dt, az*dt` + scrub; write speed/velHeading
4. Integrate position
5. Collision resolve
6. Sample again; if steep kill drift; optional small post-collision force
7. Failsafe clamp

- [x] **Step 4: Run motorcycle + boundary tests — expect PASS**

Run:

```bash
node --experimental-strip-types --test tests/motorcycle.test.mjs tests/boundary-terrain.test.mjs
```

- [x] **Step 5: Commit**

```bash
git add app/lib/map/motorcycle.ts tests/motorcycle.test.mjs
git commit -m "$(cat <<'EOF'
Apply Path-A boundary forces and raise drift floor to 25 km/h.

Steep bands scrub climb attempts and cancel handbrake slides.
EOF
)"
```

---

### Task 4: Wire ForestScene clamp + sampler

**Files:**
- Modify: `app/lib/map/ForestScene.ts`

- [x] **Step 1: Import + helpers**

```ts
import { FAILSAFE_INSET, clampToWorld } from "./world";
import { sampleBoundary } from "./boundaryTerrain";
```

Replace ride-mode updates (both places ~516 and ~558):

```ts
const seed = this.settings.seed;
const clampFn = (x: number, z: number) => clampToWorld(x, z, seed, FAILSAFE_INSET);
const boundaryFn = (x: number, z: number) => sampleBoundary(x, z, seed);
this.moto.update(dt, input, this.collision, clampFn, boundaryFn);
this.collision.stepStones(dt, clampFn, boundaryFn);
```

Keep minimap jump / editor camera insets intentional and **positive** (stay in playable), e.g. jump `150`, editor `28` — do not use `FAILSAFE_INSET` there.

- [x] **Step 2: Manual smoke (dev server)** — drive east/west/north/south; confirm slide-back, no grass wall; confirm low-speed Space+steer does not drift.

- [x] **Step 3: Commit**

```bash
git add app/lib/map/ForestScene.ts
git commit -m "$(cat <<'EOF'
Wire boundary sampler and mid-slope failsafe into ride mode.
EOF
)"
```

---

### Task 5: Visual rebuild — near ridge, rivers, far silhouette

**Files:**
- Modify: `app/lib/map/boundaryTerrain.ts` (add mesh builders)
- Modify: `app/lib/map/boundaries.ts`

- [x] **Step 1: Add mesh builders in `boundaryTerrain.ts`**

Use THREE here only for builders:

```ts
import * as THREE from "three";
import { WORLD_HALF_DEPTH, WORLD_HALF_WIDTH, makeRibbon, eastBoundaryX, /* ... */ } from "./world";

export function buildNearMountainMesh(seed: number): THREE.Mesh {
  // PlaneGeometry strip along east + north, displace Y by boundaryHeight samples.
  // Segment ~12–16 m. Material: MeshStandardMaterial flatShading, earth tones.
}

export function buildFarSilhouetteGroup(seed: number): THREE.Group {
  // Low dark ridge ~80–140 m outside foot, height 60–90, no collision.
}

export function buildRiverGroup(seed: number): THREE.Group {
  // Keep ribbon approach from boundaries.ts but center bank so inner bank ≈ foot line
  // (playable side). Outer sea planes retained.
}
```

Concrete near-mesh approach:

```ts
function buildEdgeHeightMesh(
  seed: number,
  side: "east" | "north",
  material: THREE.Material,
): THREE.Mesh {
  const along = 96; // samples
  const across = 12;
  const depth = FOOTHILL_WIDTH + STEEP_WIDTH + 30;
  // For east: x from foot-8 to foot+depth, z from -WORLD_HALF_DEPTH-80 to +...
  const geo = new THREE.PlaneGeometry(depth, WORLD_HALF_DEPTH * 2 + 160, across, along);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    // map local → world depending on side; set Y from boundaryHeight
    const h = boundaryHeight(worldX, worldZ, seed);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
```

- [x] **Step 2: Replace `boundaries.ts` mountains**

```ts
export function createWorldBoundaries(seed: number) {
  const group = new THREE.Group();
  group.name = "irregular-world-boundaries";
  group.add(buildRiverGroup(seed));
  group.add(buildNearMountainMesh(seed)); // or group of east+north
  group.add(buildFarSilhouetteGroup(seed));
  return group;
}
```

Remove `addMountains` cone `InstancedMesh` path (or leave unused private helpers deleted).

- [x] **Step 3: Visual check in play mode** — continuous near wall at former clamp line; far silhouette behind; rivers align with west/south push bands.

- [x] **Step 4: Commit**

```bash
git add app/lib/map/boundaryTerrain.ts app/lib/map/boundaries.ts
git commit -m "$(cat <<'EOF'
Rebuild edge mountains as heightfield ridges with far silhouettes.

Align river banks with the shared boundary force foot lines.
EOF
)"
```

---

### Task 6: Stones + far-field tune

**Files:**
- Modify: `app/lib/map/collision.ts`
- Modify: `app/lib/map/farField.ts`

- [x] **Step 1: Extend `stepStones`**

```ts
stepStones(
  dt: number,
  clampToWorld: (x: number, z: number) => { x: number; z: number },
  sampleBoundary: (x: number, z: number) => { ax: number; az: number; steep: boolean; height: number } = () => ({
    ax: 0, az: 0, steep: false, height: 0,
  }),
) {
  // after integrating x,z:
  const b = sampleBoundary(body.x, body.z);
  body.vx += b.ax * dt;
  body.vz += b.az * dt;
  if (b.steep) {
    // strong damp when climbing hazard
    body.vx *= 0.85;
    body.vz *= 0.85;
  }
  const clamped = clampToWorld(body.x, body.z);
  // ... existing stop-on-clamp ...
}
```

- [x] **Step 2: Far-field** — in `farField.ts`, increase card/tree `isInsideWorld` insets slightly (e.g. cards `36 → 52`, trees `48 → 64`) so horizon cards sit behind the new near ridge rather than floating on the foothills.

- [x] **Step 3: Run unit tests**

```bash
node --experimental-strip-types --test tests/boundary-terrain.test.mjs tests/motorcycle.test.mjs tests/audio.test.mjs
```

Expected: PASS

- [x] **Step 4: Commit**

```bash
git add app/lib/map/collision.ts app/lib/map/farField.ts
git commit -m "$(cat <<'EOF'
Keep stones inside boundary bands and ease far-field off the near ridge.
EOF
)"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [x] **Step 1: Run full `npm test`** (includes build + rendered-html)

Expected: PASS

- [x] **Step 2: Play-mode checklist**

1. East/north: reach visible foothills → slide back; no empty grass wall.  
2. West/south: river bank stops with slide-back.  
3. Failsafe never felt in normal runs.  
4. Skyline = near ridge + far silhouette.  
5. Trees/stones/posts unchanged inland.  
6. Below 25 km/h: Space+steer = straight hard brake.  
7. Drift into steep band ends immediately.

- [x] **Step 3: Commit any leftover fixups** (only if needed)

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Near ridge + far silhouette visuals | Task 5 |
| Height/force starts at former air-wall / foot line | Task 1 (`distPastFoot`) + Task 5 |
| Path-A xz force, no bike y | Task 3 |
| Unified `boundaryForce` / `sampleBoundary` four edges | Task 1 |
| Tree-like scrub on oppose | Task 3 |
| Failsafe dual-pass clamp mid-slope (~−100 inset) | Task 2 + 4 |
| Drift floor 25 km/h (`DRIFT_MIN` 6.9) | Task 3 |
| No drift in steep band | Task 3 |
| Stones respect heightfield | Task 6 |
| farField light tune | Task 6 |
| Out of scope: full 3D pitch / swimming | Honored (no tasks) |

## Type consistency

- `BoundarySample` / sampler return: `{ ax, az, steep, height }` everywhere.
- `FAILSAFE_INSET = -100` in `world.ts`; ForestScene ride/stones use it; editor/minimap keep positive insets.
- `MotorcycleController.update(..., sampleBoundary?)` optional 5th arg defaults to zero force for old tests.
