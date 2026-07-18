Original prompt: 创建一个 Three.js 森林送货游戏网站，先完成可扩展的地图生成器，并参考 gpt_demo 的唯美视觉与 cursor_demo 的工程结构。

## Current iteration

- Add abundant low-poly grass/weeds that visually belong with the existing trees.
- Make stones deterministic and present in every streamed forest chunk, not only near the initial road area.
- Raise the default and available forest density.
- Validate initial and later-loaded chunks through the web-game test loop before publishing.

## Existing state

- Irregular 3200×3200 world.
- Rivers bound west/south; mountains bound north/east.
- Forest chunks stream around the camera/minimap focus.

## Implemented

- Added instanced, three-blade low-poly grass tufts with seasonal color variation.
- Added per-chunk grass and stone counts to streaming diagnostics.
- Changed rock placement so deep-forest chunks receive seeded stones even when no road is nearby.
- Raised the default forest density from 72% to 86%, increased trees per chunk, and extended the tuning range to 115%.
- Added `window.render_game_to_text` and `window.advanceTime` hooks for deterministic browser testing.

## Visual check 1

- Initial 13 chunks: 312 trees, 3393 grass tufts, 468 stones at the new 86% default.
- Grass coverage is correct but the first material read too dark at distance; widened blades and lifted green emissive/color variation.
- Guarded test-hook cleanup so concurrent effect teardown cannot remove a newer scene's hooks.

## Validation

- Production build succeeds in the local runtime mirror.
- Initial neighborhood: 312 trees, 3393 grass tufts, 468 stones across 13 chunks.
- After jumping to a far east neighborhood: 288 trees, 3171 grass tufts, 432 stones across 13 newly streamed chunks.
- Regenerating the seeded forest returns the deterministic initial counts.
- No browser console errors or warnings during initial load, distant streaming, or regeneration.
- The bundled web-game Playwright client could not start because its own `playwright` package is absent; equivalent action/pause/observe checks were completed in the in-app browser.
- Replaced obsolete starter-template tests with product regression tests; full build plus 2/2 tests pass.

## TODO / next ideas

- Future gameplay can animate grass vertex sway in the shared shader once rider movement is introduced.
