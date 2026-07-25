# Shatter Morph Implementation Plan

> **For agentic workers:** Execute task-by-task. Demo motion is the source of truth.

**Goal:** Plan B dual-pose shatter toggle with blast/gather animation in the live forest scene.

**Files:**
- Add `app/lib/map/shatterMorph.ts`
- Change `app/lib/map/forestAssets.ts`, `ChunkManager.ts`, `ForestScene.ts`
- Add `tests/shatter-morph.test.mjs`
- Keep UI wiring already in MapStudio / i18n

### Task 1: Morph math module + tests
- Easing: `easeOutExpo`, `easeInCubic`
- `treeScaleForAmount(amount, direction)` / `shardLerp(amount)` matching demo
- `ShatterMorphController` with `animateTo`, `update`, `isBusy`

### Task 2: Always build tree↔shard morph data in chunks
- Refactor tree placement to expose world poses
- Spawn ~5 shards per tree with home in canopy and shatter outward
- Attach `userData.shatterMorph` metadata; apply initial amount from context
- Remove “platforms only when shatterMode” gate

### Task 3: ChunkManager.applyShatterAmount
- Walk loaded chunks and write instance matrices
- `configure` still clears on full rebuild (seed/generate), not on toggle

### Task 4: ForestScene.setShatterMode animates
- Replace clear/restream toggle with morph controller
- Tick morph in `animate` / `advanceForTest`

### Task 5: Verify
- `npm test`
- Manual: toggle in workshop + play at localhost:3000
