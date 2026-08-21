import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

test("canonical source tree releases only after both immutable collision payload families are baked", async () => {
  const source = Object.freeze({ kind: "catalog", catalogId: "phone-booth" });
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const acquire = cache.getVisualTemplate(source);
  const initial = cache.getCanonicalSourceLifecycle(acquire.value);
  assert.equal(initial.sourceTreeReleased, false);
  assert.ok(initial.sourceTreeChildCount > 0);
  assert.equal(cache.releaseCanonicalSourceTree(source), false);

  const solid = await cache.createCollisionCompileSource(source);
  assert.equal(cache.getCanonicalSourceLifecycle(acquire.value).packedCollisionReady, true);
  assert.equal(cache.releaseCanonicalSourceTree(source), false, "surface payload must be retained first");
  const surfaces = await cache.createSurfaceCollisionCompileSources(source);
  const compiled = await Promise.all([solid, ...surfaces].map(compileCollisionSource));

  assert.equal(cache.releaseCanonicalSourceTree(source), true);
  assert.deepEqual(cache.getCanonicalSourceLifecycle(acquire.value), {
    sourceTreeReleased: true,
    sourceTreeChildCount: 0,
    packedCollisionReady: true,
    packedSurfaceCollisionReady: true,
  });
  assert.equal(cache.releaseCanonicalSourceTree(source), false, "release is idempotent");
  assert.equal(await cache.createCollisionCompileSource(source), solid,
    "a post-release cache hit must not reconstruct the factory tree");
  assert.equal(await cache.createSurfaceCollisionCompileSources(source), surfaces);

  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const attachment = cache.attachVisualTemplate(acquire.value, {
    targetLayer: port.value,
    placements: [{
      placementId: "released-source-visual",
      worldFromLocal: Object.freeze(new THREE.Matrix4().toArray()),
    }],
  });
  assert.ok(parent.getObjectsByProperty("isInstancedMesh", true).length > 0,
    "baked visual batches remain attachable after the hidden source tree is gone");

  attachment.release();
  port.release();
  acquire.release();
  for (const result of compiled) result.fallback?.geometry.dispose();
  await cache.retire();
  await sources.retire();
});

test("aborting one generation cancels only its wait, not the shared canonical bake", async () => {
  const source = Object.freeze({ kind: "catalog", catalogId: "phone-booth" });
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const abort = new AbortController();
  const stale = cache.createCollisionCompileSource(source, abort.signal);
  const current = cache.createCollisionCompileSource(source);
  abort.abort(new DOMException("stale generation", "AbortError"));

  await assert.rejects(stale, /stale generation/);
  const packed = await current;
  assert.equal(await cache.createCollisionCompileSource(source), packed);
  const acquire = cache.getVisualTemplate(source);
  assert.equal(cache.getCanonicalSourceLifecycle(acquire.value).packedCollisionReady, true);
  acquire.release();

  await cache.createSurfaceCollisionCompileSources(source);
  assert.equal(cache.releaseCanonicalSourceTree(source), true);
  await cache.retire();
  await sources.retire();
});
