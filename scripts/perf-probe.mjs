import * as THREE from "three";

import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityDocumentRenderer } from "../app/lib/map/cityDocumentRenderer.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { deriveRoadCollisionSources } from "../app/lib/map/cityRoads.ts";
import { measureCitySceneStructure } from "../app/lib/map/cityStructureMetrics.ts";
import { CitySurfaceIndex } from "../app/lib/map/citySurfaceIndex.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

const out = {
  height: 0, normalX: 0, normalY: 1, normalZ: 0, gx: 0, gz: 0,
  speedCap: 0, handle: { kind: "implicit-ground" },
};
const query = { currentY: 0, maxStepUpMeters: 0.25, previousHandle: null };

function benchIndex(label, sources, probeX, probeZ) {
  const index = new CitySurfaceIndex(sources, "probe", 1);
  const N = 20000;
  // warm up
  for (let i = 0; i < 2000; i += 1) index.sampleCitySurface(probeX, probeZ, query, out);
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) index.sampleCitySurface(probeX + (i % 11), probeZ, query, out);
  let t1 = process.hrtime.bigint();
  const sampleUs = Number(t1 - t0) / N / 1000;

  const current = index.sampleCitySurface(probeX, probeZ, query, out);
  const snapshot = { ...current, handle: { ...current.handle } };
  t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) index.findEarliestBoundaryCrossing(probeX, probeZ, 0.25, 0.05, snapshot);
  t1 = process.hrtime.bigint();
  const crossUs = Number(t1 - t0) / N / 1000;

  console.log(
    `${label.padEnd(22)} surfaces=${String(sources.surfaces.length).padStart(5)} `
    + `boundaries=${String(sources.boundaries.length).padStart(5)} `
    + `| sampleCitySurface ${sampleUs.toFixed(2)} us `
    + `| findEarliestBoundaryCrossing ${crossUs.toFixed(2)} us`,
  );
  return { sampleUs, crossUs };
}

async function probeSceneStructure(document, batchBackend) {
  const registry = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources: registry, layers });
  const parent = new THREE.Group();
  const renderer = createCityDocumentRenderer({
    cache,
    layers,
    parentOwnedLayer: parent,
    batchBackend,
  });
  try {
    renderer.applyCityDocument(document);
    return measureCitySceneStructure(parent, {
      batchedMultiDraw: batchBackend === "batched-mesh",
      shadowMapType: "pcf",
    });
  } finally {
    renderer.dispose();
    await cache.retire();
    await registry.retire();
  }
}

// Baseline: the shipped Cedar Crossing road graph.
const doc = createCedarCrossingDocument();
console.log(`Cedar Crossing: ${doc.placements.length} placements, ${new Set(doc.placements.map((p) => p.catalogId)).size} catalog ids, `
  + `${doc.graph.nodes.length} nodes / ${doc.graph.edges.length} edges`);
for (const batchBackend of ["instanced-mesh", "batched-mesh"]) {
  console.log(`${batchBackend} structure`, await probeSceneStructure(doc, batchBackend));
}
const base = deriveRoadCollisionSources(doc.graph);
benchIndex("cedar-crossing (1x)", base, doc.graph.nodes[0].x, doc.graph.nodes[0].z);

// Synthetic grids to show how the linear scan grows with road-network size.
function gridGraph(cells, spacing = 60) {
  const nodes = [];
  const edges = [];
  const profile = createRoadProfile("two-way-1");
  for (let j = 0; j <= cells; j += 1) {
    for (let i = 0; i <= cells; i += 1) {
      nodes.push({ id: `n-${i}-${j}`, x: i * spacing - (cells * spacing) / 2, z: j * spacing - (cells * spacing) / 2 });
    }
  }
  for (let j = 0; j <= cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      edges.push({ id: `h-${i}-${j}`, a: `n-${i}-${j}`, b: `n-${i + 1}-${j}`, profile });
      edges.push({ id: `v-${j}-${i}`, a: `n-${j}-${i}`, b: `n-${j}-${i + 1}`, profile });
    }
  }
  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    intersectionOverrides: Object.freeze({}),
  });
}

for (const cells of [4, 8, 12, 16]) {
  const graph = gridGraph(cells);
  const sources = deriveRoadCollisionSources(graph);
  benchIndex(`grid ${cells}x${cells}`, sources, 0, 0);
}
