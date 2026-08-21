import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { getCatalogEntry } from "../app/lib/map/cityCatalog.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityPlacementPreview } from "../app/lib/map/cityPlacementPreview.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
} from "../app/lib/map/cityTiles.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

test("placement preview renders the real catalog shape with a one-metre occupied-cell grid", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const preview = createCityPlacementPreview(cache);
  const entry = getCatalogEntry("phone-booth");
  assert.ok(entry);
  const footprint = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };

  preview.set({ catalogId: entry.id, i: 17, j: 23, yaw: 0, valid: true });
  assert.equal(preview.root.visible, true);
  assert.deepEqual(preview.getState(), {
    catalogId: entry.id,
    i: 17,
    j: 23,
    yaw: 0,
    valid: true,
    visible: true,
  });
  assert.equal(preview.root.position.x, CITY_TILE_ORIGIN_X + 17 + footprint.w * 0.5);
  assert.equal(preview.root.position.z, CITY_TILE_ORIGIN_Z + 23 + footprint.d * 0.5);

  const model = preview.root.getObjectByName("city-placement-preview-model");
  const fill = preview.root.getObjectByName("city-placement-preview-footprint");
  const grid = preview.root.getObjectByName("city-placement-preview-grid");
  assert.ok(model instanceof THREE.Group);
  assert.ok(fill instanceof THREE.Mesh);
  assert.ok(grid instanceof THREE.LineSegments);
  assert.ok(model.getObjectsByProperty("isMesh", true).length > 0, "the ghost uses catalog geometry, not a placeholder box");
  assert.equal(grid.geometry.getAttribute("position").count, (footprint.w + footprint.d + 2) * 2);
  const modelMaterial = model.getObjectsByProperty("isMesh", true)[0].material;
  assert.ok(modelMaterial instanceof THREE.MeshBasicMaterial);
  assert.equal(modelMaterial.transparent, true);
  assert.equal(modelMaterial.opacity, 0.28);
  assert.equal(modelMaterial.color.getHex(), 0x4fcf78);

  preview.set({ catalogId: entry.id, i: 17, j: 23, yaw: 0, valid: false });
  assert.equal(modelMaterial.color.getHex(), 0xef5b56);
  assert.equal(preview.getState().valid, false);
  preview.set(null);
  assert.deepEqual(preview.getState(), { visible: false });
  assert.equal(preview.root.visible, false);

  preview.dispose();
  await cache.retire();
  await sources.retire();
});

test("placement preview rotates rectangular footprints around their snapped centre and disposes owned overlays", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const preview = createCityPlacementPreview(cache);
  const entry = getCatalogEntry("roadside-planter");
  assert.ok(entry);
  const footprint = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };

  preview.set({ catalogId: entry.id, i: 30, j: 40, yaw: 90, valid: true });
  assert.equal(preview.root.position.x, CITY_TILE_ORIGIN_X + 30 + footprint.d * 0.5);
  assert.equal(preview.root.position.z, CITY_TILE_ORIGIN_Z + 40 + footprint.w * 0.5);
  assert.equal(preview.root.rotation.y, Math.PI * 0.5);

  const fill = preview.root.getObjectByName("city-placement-preview-footprint");
  const grid = preview.root.getObjectByName("city-placement-preview-grid");
  assert.ok(fill instanceof THREE.Mesh);
  assert.ok(grid instanceof THREE.LineSegments);
  let fillGeometryDisposals = 0;
  let gridGeometryDisposals = 0;
  fill.geometry.addEventListener("dispose", () => { fillGeometryDisposals += 1; });
  grid.geometry.addEventListener("dispose", () => { gridGeometryDisposals += 1; });

  preview.dispose();
  preview.dispose();
  assert.equal(preview.root.parent, null);
  assert.equal(fillGeometryDisposals, 1);
  assert.equal(gridGeometryDisposals, 1);
  await cache.retire();
  await sources.retire();
});
