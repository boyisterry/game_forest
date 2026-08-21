import * as THREE from "three";

import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityDocumentRenderer } from "../app/lib/map/cityDocumentRenderer.ts";
import {
  effectiveRenderableInstanceCount,
  effectiveRenderRangeCount,
  effectiveTriangleCount,
  measureCitySceneStructure,
} from "../app/lib/map/cityStructureMetrics.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

const document = createCedarCrossingDocument();
const sources = createCatalogSourceRegistry();
const layers = createCityVisualLayerManager();
const cache = createCityTemplateCache({ sources, layers });
const parent = new THREE.Group();
const batchBackend = process.argv.includes("--batched") ? "batched-mesh" : "instanced-mesh";
const renderer = createCityDocumentRenderer({ cache, layers, parentOwnedLayer: parent, batchBackend });
const report = renderer.applyCityDocument(document);
console.log("renderer stats", renderer.getStats());
console.log("apply report", report);

// Per catalog template: how well does instancing actually batch?
const perTemplate = new Map();
const cellsPerTemplate = new Map();

function walk(object, templateKey) {
  const key = /^city-template-batches-/.test(object.name)
    ? object.name.replace(/^city-template-batches-/, "")
    : templateKey;
  if (object.isMesh) {
    const tris = effectiveTriangleCount(object);
    const count = effectiveRenderableInstanceCount(object);
    const ranges = effectiveRenderRangeCount(object, batchBackend === "batched-mesh");
    const bucket = key ?? (object.name.startsWith("city-road") ? "ROADS" : "OTHER");
    const prev = perTemplate.get(bucket)
      ?? { meshObjects: 0, drawCalls: 0, instances: 0, triangles: 0, shadowCalls: 0 };
    prev.meshObjects += 1;
    prev.drawCalls += ranges;
    prev.instances += count;
    prev.triangles += tris;
    if (object.castShadow) prev.shadowCalls += ranges;
    perTemplate.set(bucket, prev);
    // Cell suffix is the trailing "-<cellX>-<cellZ>" on batch names.
    const cell = /-(-?\d+)-(-?\d+)$/.exec(object.name);
    if (cell && bucket !== "ROADS") {
      const set = cellsPerTemplate.get(bucket) ?? new Set();
      set.add(`${cell[1]},${cell[2]}`);
      cellsPerTemplate.set(bucket, set);
    }
  }
  for (const child of object.children) walk(child, key);
}
walk(parent, null);

const placementsByCatalog = new Map();
for (const p of document.placements) {
  placementsByCatalog.set(p.catalogId, (placementsByCatalog.get(p.catalogId) ?? 0) + 1);
}

console.log(`=== Cedar Crossing: draw-call attribution (${document.placements.length} placements, ${batchBackend}) ===\n`);
console.log("template".padEnd(26) + "place  inst  cells  meshObj  drawCalls  shadowCalls   ktris  calls/inst");
const rows = [...perTemplate.entries()].sort((a, b) => b[1].drawCalls - a[1].drawCalls);
for (const [name, v] of rows) {
  const place = placementsByCatalog.get(name) ?? (name === "ROADS" ? "-" : "?");
  const cells = cellsPerTemplate.get(name)?.size ?? "-";
  console.log(
    name.slice(0, 25).padEnd(26)
    + String(place).padStart(5)
    + String(v.instances).padStart(6)
    + String(cells).padStart(7)
    + String(v.meshObjects).padStart(9)
    + String(v.drawCalls).padStart(11)
    + String(v.shadowCalls).padStart(13)
    + String(Math.round(v.triangles / 1000)).padStart(8)
    + (v.drawCalls / Math.max(1, v.instances)).toFixed(1).padStart(12),
  );
}

const sceneMetrics = measureCitySceneStructure(parent, {
  batchedMultiDraw: batchBackend === "batched-mesh",
  shadowMapType: "pcf",
});
const totalInstances = rows.reduce((sum, [, value]) => sum + value.instances, 0);

console.log(`\nTOTAL: ${sceneMetrics.colorRanges} color ranges + ${sceneMetrics.shadowRanges} shadow ranges `
  + `= ${sceneMetrics.colorRanges + sceneMetrics.shadowRanges}, ${(sceneMetrics.triangles / 1e6).toFixed(2)}M color tris, `
  + `${(sceneMetrics.shadowTriangles / 1e6).toFixed(2)}M shadow tris, ${totalInstances} renderable instances`);

renderer.dispose();
await cache.retire();
await sources.retire();
