# Boundary Beach & Mountain Rework Design

Date: 2026-07-25
Status: Approved (brainstormed)
Builds on: `2026-07-25-boundary-heightfield-design.md` — the heightfield boundary work shipped on `feature/boundary-heightfield`.

## Goal

Fix three problems with the shipped boundary heightfield:

1. **Beach feels like a wall.** West/south banks currently push the bike back with an interior-pointing force, so entering the sand reads as hitting an invisible wall. The bank should be climbable but progressively slowing; only open water should be a hard stop.
2. **Uniform mountains.** East/north ridges are a deterministic linear slope. Need random variation: some stretches gentle (rideable), some steep (blocking), with real tilted ground and matching collision.
3. **No grass→beach transition.** The lawn ground mesh meets the pure-sand bank ribbon in a hard edge.

## Decisions

| Topic | Choice |
|-------|--------|
| Beach (W/S) mechanics | Progressive **speed cap**, not a push-back force. `speedCap` falls from ~1.67 m/s (6 km/h) at the foot line to ~0.28 m/s (1 km/h) at the waterline. Bike is pulled toward the cap each tick — no interior accel, no scrub. |
| Open water (W/S) | Hard wall: `steep=true` + strong interior accel + scrub, shoving the bike back out of the water. Water ribbon visuals unchanged. |
| Mountain (E/N) variation | Low-frequency `ruggedness ∈ [0.2, 1.0]` noise along the ridge modulates both force and height: low = gentle/short/rideable, high = steep/tall/blocking. |
| Mountain rideability | **Local terrain-following**: inside any boundary band the bike's `y = height(x,z)` and `pitch` follows the grade. Gentle stretches can be climbed (y rises, weak force); steep stretches block. Playable interior stays y=0, pitch=0. |
| Drift on slope | Unchanged from prior spec: a steep band forbids/kills drift. The beach cap zone is not "steep" (drift allowed but speed-capped). |
| Gradient | Bank ribbon uses **vertex colors**: inner (playable side) grass color → outer (water side) dry sand, across ~15 m. Grass tint from the season palette; sand 0x9b9275. |
| Band alignment | Mechanics and visuals share one set of width constants so the beach zone = foot→waterline and the water wall = beyond the waterline (fixes the current foot+18 mechanics vs foot+22 visual mismatch). |
| Failsafe clamp | Unchanged: `clampToWorld` dual-pass at `FAILSAFE_INSET=-100` (mid-slope / beyond waterline) stays a last resort. It is NOT the water wall. |

## Baseline (current state on `feature/boundary-heightfield`)

- `sampleBoundary` (`boundaryTerrain.ts`) treats W/S exactly like E/N: `bandFromSigned` → interior accel (foothill 0→3.5, steep 3.5→14 m/s²) + motorcycle `scrub 0.75` = push-back = "wall".
- E/N height/force is a deterministic linear function of distance past the foot line — no along-ridge variation.
- Bike is pure Path A: y=0 everywhere; slope is only an xz force.
- Bank is a 126 m pure-color (`0x9b9275`) ribbon; the ground mesh is one grass-colored plane — hard edge at the foot line.
- The mechanics beach/steep split (foot+18) does not match the visual waterline (foot+22).

## Architecture

```
sampleBoundary(x, z, seed) → { ax, az, steep, height, pitch, speedCap }
   │
   ├─► motorcycle.update
   │      · steep    → forbid/kill drift
   │      · ax/az    → E/N mountain + open-water push force
   │      · height   → local y terrain-following (boundary band only)
   │      · pitch    → nose follows the grade
   │      · speedCap → beach crawl ceiling (W/S beach zone)
   │
   ├─► collision.stepStones
   │      · ax/az/steep → stones don't enter water/mountain
   │      · height      → stone y terrain-following
   │
   ├─► buildRiverGroup         → vertex-colored bank ribbon (grass→sand gradient)
   └─► buildNearMountainMeshes → ruggedness-modulated ridge height (random relief)
```

### Beach zone (W/S)
- Shared width constants with visuals: `BEACH_WIDTH` (foot → waterline, rideable, speed-capped), then open water beyond.
- `speedCap` decreases across the beach; at the waterline the open-water force takes over.
- No interior accel in the beach zone — the cap alone slows the bike.
- Beach `height ≈ 0` (flat sand); terrain-following therefore mainly lifts the bike on the mountain bands, not on the beach.

### Open water (W/S)
- Beyond the waterline: `steep=true`, strong interior accel (≈ `STEEP_ACCEL`) + scrub — a hard shove back out.

### Mountain (E/N)
- `ruggedness` from low-frequency noise along the ridge coordinate.
- Low ruggedness → low height, weak force (climbable for a stretch before the grade steepens enough to block); high → tall, strong force (blocks almost immediately).
- The ridge mesh follows the same height function so visuals and force agree.

### Terrain-following (local, boundary band only)
- Inside boundary bands: `y = height(x,z)`, `pitch` = grade along travel direction.
- Height is 0 at the foot line and rises into the band, so the playable↔band transition is smooth (no step).
- The existing `pitch` (hard-brake nod) composes with the slope pitch (slope is the sustained term, nod the transient).

### Gradient
- Bank ribbon built with per-vertex colors: inner edge grass (season ground tint), outer edge sand (`0x9b9275`), blended over ~15 m.

## File plan

### Change
- `app/lib/map/boundaryTerrain.ts` — rewrite `sampleBoundary` (beach cap / water wall / mountain ruggedness); return `height, pitch, speedCap`; add along-ridge ruggedness noise; ridge mesh height follows ruggedness; bank ribbon gains vertex colors.
- `app/lib/map/motorcycle.ts` — local y/pitch terrain-following in boundary bands + `speedCap` crawl (largest change).
- `app/lib/map/collision.ts` — stone y terrain-following + respect water/mountain force.
- `app/lib/map/world.ts` — shared beach/waterline width constants if needed.

### Extend
- `tests/boundary-terrain.test.mjs` — beach cap decreases toward water; open water is a hard wall; mountain ruggedness produces varied heights; terrain-follow height is 0 at the foot line.
- `tests/motorcycle.test.mjs` — beach crawl speed ceiling; gentle slope lifts y (climbable); steep slope blocks.

## Out of scope

- Full-map rideable heightfield / true 3D pitch everywhere outside boundary bands. Terrain-following is **local to boundary bands only**.
- Swimming, drowning, or "summit the mountain" win states.
- Replacing tree/stone circle collision with a general physics engine.

## Success criteria

1. Riding onto a west/south beach: the bike slows to a crawl (~6 km/h) and keeps creeping toward the water; the closer to water, the slower — no wall-feel on the sand.
2. Hitting open water: the bike is shoved back out and never enters the water.
3. East/north mountains show visible variation — gentle stretches can be climbed (bike y rises, visible climb pitch), steep stretches block — not a uniform slope.
4. Grass meets sand through a ~15 m color gradient; no hard edge at the foot line.
5. Existing tree/stone collision, delivery posts, and playable-interior driving (y=0, no pitch) are unchanged.
6. Production build + full test suite pass.
