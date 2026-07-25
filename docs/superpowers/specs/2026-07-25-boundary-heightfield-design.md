# Boundary Heightfield Design

Date: 2026-07-25  
Status: Approved for planning  
Revision 2026-07-25: locked drift floor (25 km/h), path-A slope force (bike stays flat, force projected to xz), unified `boundaryForce` across all four edges, failsafe clamp keeps dual-pass and moves onto the mid-slope.

## Goal

Rebuild distant / edge mountains and remove the flat-ground “air wall” feel. West/south rivers and east/north mountains must form the real perimeter: the player is stopped by climbable-then-unclimbable slopes (and river banks), not by an invisible clamp on open grass. An air-wall clamp remains only as a failsafe higher on the slope if physics is somehow bypassed.

## Decisions

| Topic | Choice |
|-------|--------|
| Perimeter shape | Continuous near ridge wall + far silhouette (hybrid) |
| Blocker placement | Height begins rising (mountains) / dropping (rivers) at the **former air-wall line**; scenery sits on the playable side of that line |
| Primary stop | Slope physics: steep enough that the bike cannot climb and slides down |
| Hit feel accent | Speed scrub similar to tree impact while sliding / slamming the steep band |
| Failsafe clamp | `clampToWorld` keeps its **dual-pass** clamp (corner coupling between the wavy horizontal/vertical edges) but its inset moves onto the mid–upper slope (~90–120 m); normal play never reaches it |
| Implementation approach | Heightfield terrain for boundary bands (not dense circle colliders, not full-world heightmap riding) |
| Slope → physics mapping | Bike stays on the flat y=0 plane; slope is applied as an **xz-plane force** pointing toward the world interior (≈ g·sinθ projected) plus up-slope speed scrub. No real 3D pitch / ground-follow. (Path A — do not add a vertical dimension to `motorcycle.ts`.) |
| Boundary force | All four edges share one `boundaryForce(x, z)`: inside a band → interior-pointing acceleration + reverse-direction speed loss. East/north = uphill wall, west/south = water drop — same math, band located by the four foot lines. |
| Drift floor | Drift entry threshold raised: **speed must exceed 25 km/h (≈ 6.9 m/s)** to start a handbrake slide; below that, Space + steer only brakes straight. (`DRIFT_MIN` 4.2 → 6.9 m/s.) |
| Drift on slope | No drift inside a steep boundary band — entry is blocked and an active slide is forced to exit immediately. |

## Current problem (baseline)

- Edge curves live in `world.ts` (`west/east/north/southBoundary*`).
- Ride mode clamps with `clampToWorld(..., inset ≈ 5)` after obstacle resolve — soft stop on grass.
- Visual mountains in `boundaries.ts` are cone instances placed **outward** (~48–116 m outside the foot line).
- Rivers are ribbons centered on west/south curves; closer to the clamp than mountains, but still not slope-physics blockers.
- `CollisionWorld` has trees/posts/stones only — no world-edge colliders.
- `farField.ts` is grass + LOD trees/cards inside the world, not mountain geometry.

## Architecture

```
edge curves (world.ts) ── anchor lines for heightfield bands
        │
        ▼
boundaryTerrain.ts
  · height(x,z), gradient, waterDepth
  · slope slide force for bike / stones
  · near mountain + river bank meshes
  · far silhouette ridge (visual only)
        │
        ├─► boundaries.ts (scene wiring / materials)
        ├─► motorcycle.ts + ForestScene.ts (apply slide; failsafe clamp)
        └─► collision.ts (stones respect heightfield)
```

### Heightfield bands

- **East / north:** foothill rise starts near the current ride clamp line; slope steepens outward so climb authority fails and a downslope acceleration returns the bike to flat playable ground.
- **West / south:** bank then water depression; entering the water band applies a strong return / slide equivalent to “cannot go down there,” not swimming.
- **Far silhouette:** separate low-cost ridge beyond the near wall; no collision.
- Sampling stays local to boundary strips (not a full 3200² heightmap for gameplay).

### Collision / motion rules

1. Each ride tick: sample height + gradient under the bike (and optionally a short look-ahead).
2. On steep band: apply along-slope acceleration downward (toward playable interior); scrub speed when opposing the grade (tree-like loss curve is fine).
3. Foothills remain lightly touchable so the edge feels like terrain, not a hard plane on flat grass.
4. Stones use the same sampler so they do not roll into water or through mountains.
5. `clampToWorld` inset targets mid–upper slope only (failsafe), keeping the dual-pass clamp for corners. Default flat-ground air wall is removed from the normal path.
6. The bike never gains a vertical (y) dimension — the slope force is projected onto the xz plane (Path A). Rider y stays at road/ground level; only the boundary *meshes* show elevation.
7. Drift is gated by speed (≥ 25 km/h) and disabled inside any steep band: each in-band `update` force-exits `this.drifting`, and `wantDrift` cannot become true while in-band.

### Visual rebuild

- Replace outward cone ridges as the primary east/north wall with continuous near-ridge meshes derived from the heightfield.
- Keep a second, farther silhouette layer for skyline depth.
- Align river ribbons / banks with the heightfield water/bank profiles.

## File plan

### Add

- `app/lib/map/boundaryTerrain.ts` — height/gradient/waterDepth, slide force helpers, mesh builders, silhouette data.
- `tests/boundary-terrain.test.mjs` — foothill rideable, steep slide-down, failsafe clamp beyond steep band.

### Change

- `app/lib/map/boundaries.ts` — wire heightfield meshes + silhouette; drop wall-outside cones as main look.
- `app/lib/map/world.ts` — keep wavy anchors; retarget `clampToWorld` default / helpers for slope failsafe.
- `app/lib/map/motorcycle.ts`, `app/lib/map/ForestScene.ts` — apply slope forces (interior-pointing accel + scrub) each tick; call failsafe clamp only past the steep band. In `motorcycle.ts`: raise `DRIFT_MIN` from 4.2 to **6.9 m/s (25 km/h)**, and add a "no drift in steep band" guard (`this.drifting = false` when the sampler reports a steep band; `wantDrift` stays false there).
- `app/lib/map/collision.ts` — stone step respects heightfield.
- `app/lib/map/farField.ts` — light tune so far cards do not fight the new near ridge.

## Out of scope

- Full-map rideable heightfield / true 3D bike pitch-to-ground everywhere.
- Swimming, drowning, or “summit the mountain” win states.
- Replacing tree/stone circle collision with a general physics engine.

## Success criteria

1. Riding toward east/north: bike reaches visible foothills, cannot crest the steep band, slides back; no empty grass stop before scenery.
2. Riding toward west/south: bank/water stops progress with the same “can’t go there / slides back” feel; no flat invisible wall before the river.
3. Normal play never triggers the failsafe clamp; only extreme/bug cases do.
4. Skyline shows near continuous ridge plus a farther silhouette.
5. Existing tree/stone collision and delivery posts still behave as today inside the playable interior.
6. Below 25 km/h, holding Space + steer cannot initiate a drift — the bike just hard-brakes straight.
7. A slide that carries into a steep boundary band ends the drift on entry; no drift can be sustained on the slopes.
