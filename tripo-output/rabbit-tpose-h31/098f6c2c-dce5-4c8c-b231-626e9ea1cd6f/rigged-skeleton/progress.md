Original prompt: 现在虽然有动画了但是没有和对应的操作匹配，你来修正一下

## Root causes

1. Clips were selected from **damped speed**, so keys lagged behind the visible anim.
2. Three.js `fadeIn` multiplies interpolant by `action.weight`. Walk/run stayed at weight `0` from setup → effective weight always 0 → T-pose while HUD said WALK/RUN.
3. Fade restarted every frame while weight &lt; 0.85, so blends never finished.
4. Jump clip (~2.25s) kept playing after physics land (~0.7s).

## Fix

- Intent-driven clips: move → walk, Shift+move → run, release → idle, Space → jump.
- `setEffectiveWeight(1)` before `fadeIn`; only start a blend when `baseClip` changes.
- Land immediately crossfades back to the key-intent clip.
- No Tripo / paid API calls.

## Validation

- Playwright: idle/walk/run/jump weights match keys; walk/run poses (not T-pose); land → idle.

## Final deterministic regression

- Verified the GLB contains the expected clips in order: idle, walk, run, jump.
- Used held-key input plus `window.advanceTime` to remove headless-frame timing ambiguity.
- Idle: idle weight 1, walk/run/jump weight 0.
- W: walk weight 1 with forward displacement.
- Shift + W: run weight 1 with faster forward displacement.
- Key release: returns to idle even while damped movement speed is still settling.
- Space: jump becomes active and raises the player; landing returns immediately to idle.
- Visually inspected idle, walk, run, jump, and landed screenshots; HUD, pose, and movement agree.
- Bumped the module cache key to `demo.js?v=14` so browsers do not keep the pre-fix controller.
- Made pointer-lock requests fail quietly when an embedded/headless browser does not support them, and added an inline empty favicon.
- Re-ran the complete deterministic regression on the final files; all state/weight checks passed with no console errors.

## Facing alignment fix

- Removed Hip-bone forward inference, which introduced a `-0.577` radian (about 33°) diagonal model offset.
- Visual QA showed the exported mesh faces local `+X`; `+π/2` faced the camera/backward, so the correct explicit model yaw is `-π/2`, mapping it to controller forward (+Z).
- Bumped the module cache key to `demo.js?v=17`.
- Final deterministic state reports `modelYaw=-1.571` while controller facing is `0` / `faceZ=1`.
- Walk and run screenshots show the centered back of the rabbit moving straight away from the follow camera; no diagonal or backward orientation remains.
- Idle, walk, run, jump, and landing states still pass, with no console errors.
