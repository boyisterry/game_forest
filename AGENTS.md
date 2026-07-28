# AGENTS.md

## Cursor Cloud specific instructions

Single product: **Forest Courier · Map Workshop** (`forest-courier-map-studio`) — a Three.js 3D forest map editor and rabbit-scooter riding game. It is one Next.js (App Router) app served as a Cloudflare Worker via `vinext` + `@cloudflare/vite-plugin` (Miniflare locally). There is no separate backend/API server; gameplay runs client-side. Standard commands live in `package.json` and `README.md` — use those.

### Required hosting stub files (non-obvious, critical)
`vite.config.ts` imports `./.openai/hosting.json` and `./build/sites-vite-plugin`. Both are git-ignored and are normally injected by the OpenAI hosting control plane, so they do **not** exist in a fresh checkout. Without them, `npm run dev`, `npm run build`, and `npm test` all fail with `Could not resolve` errors before anything starts.

The startup update script recreates these as local stubs if missing (`.openai/hosting.json` → `{ "d1": "DB", "r2": null }`; `build/sites-vite-plugin.ts` → a no-op Vite plugin exporting `sites()`). If you ever wipe them, re-create them (or re-run the update script) before starting the app. Do not commit them — they are intentionally git-ignored.

### Running / testing
- Dev server: `npm run dev` → serves at `http://localhost:3000/` (also `/demos/shatter-morph-tree.html`, `/demos/stone-grind.html`). This is the whole runtime (frontend + worker).
- Tests: `npm test` runs `npm run build` first, then the Node built-in test runner over `tests/*.mjs`.
- Lint: `npm run lint`. Note the current codebase has pre-existing lint errors unrelated to environment setup; a clean lint run is not expected.
- Node `>=22.13.0` is required.

### Cloudflare bindings
D1 (`DB`), R2, and Images bindings are scaffolding only and Miniflare-emulated locally; the map/game does not require them. `db/schema.ts` is intentionally empty and `getDb()` throws unless a `DB` binding is present, but no gameplay code calls it.
