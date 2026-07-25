# Boundary Heightfield Design

Date: 2026-07-25  
Status: Approved for planning

## Goal

Rebuild distant / edge mountains and remove the flat-ground “air wall” feel. West/south rivers and east/north mountains must form the real perimeter: the player is stopped by climbable-then-unclimbable slopes (and river banks), not by an invisible clamp on open grass. An air-wall clamp remains only as a failsafe higher on the slope if physics is somehow bypassed.

## Decisions

| Topic | Choice |
|-------|--------|
| Perimeter shape | Continuous near ridge wall + far silhouette (hybrid) |
| Blocker placement | Height begins rising (mountains) / dropping (rivers) at the **former air-wall line**; scenery sits on the playable side of that line |
| Primary stop | Slope physics: steep enough that the bike cannot climb and slides down |
| Hit feel accent | Speed scrub similar to tree impact while sliding / slamming the steep band |
| Failsafe | `clampToWorld` moved onto mid–upper slope; normal play must not hit it |
| Implementation approach | Heightfield terrain for boundary bands (not dense circle colliders, not full-world heightmap riding) |

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
5. `clampToWorld` inset targets mid–upper slope only (failsafe). Default flat-ground air wall is removed from the normal path.

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
- `app/lib/map/motorcycle.ts`, `app/lib/map/ForestScene.ts` — apply slope forces; call failsafe clamp only past steep band.
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
