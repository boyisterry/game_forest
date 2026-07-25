# Shatter Morph Design (Plan B)

Date: 2026-07-25  
Status: Approved — implement Plan B  
Demo reference: `/public/demos/shatter-morph.html`

## Goal

Toggle **破碎模式** between a normal grounded forest and the floating shattered look, with the approved blast / gather animation (direct explode outward — no wind-up shrink).

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Dual-pose matrix lerp (Plan B) — no full chunk rebuild on toggle |
| Open motion | Direct blast: `easeOutExpo`, tree pops then vanishes, shards fly from tree volume |
| Close motion | Gather: `easeInCubic`, shards return, trees fade in |
| End states | `amount=0` trees only; `amount=1` shards only |
| Shard binding | Shards generated per tree (not independent sparse platforms) |
| Streaming | New chunks built with both layers; posed immediately to current `amount` |
| Collision | Tree colliders stay at ground (ride unchanged); shards visual-only |

## Architecture

```
setShatterMode(on)
    → ShatterMorphController.animateTo(0|1)
    → each frame: chunks.applyShatterAmount(amount)
         → per loaded chunk: lerp tree/shard instance matrices
```

### Modules

- `shatterMorph.ts` — easing, controller (`amount`, `animateTo`, `update(dt)`), `applyAmountToChunk`
- `forestAssets.ts` — always emit trees + per-tree shards + morph metadata on chunk group
- `ChunkManager.ts` — `applyShatterAmount(amount)`; stop using configure/clear for toggles
- `ForestScene.ts` — drive controller in animate loop; `setShatterMode` only starts morph

## Non-goals

- True mesh fracture / morph targets
- Dual full-scene particle FX layer (Plan C)
- Changing boundary / bike physics
