import { CITY_CATALOG } from "../app/lib/map/cityCatalog.ts";
import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import { measureCatalogMapLodStages } from "../app/lib/map/cityMapLodMetrics.ts";

const adapters = new Map(DEFAULT_CATALOG_FACTORY_ADAPTERS.map((adapter) => [adapter.factoryId, adapter]));
const rows = [];
const skipped = [];
for (const entry of CITY_CATALOG) {
  if (entry.source.kind !== "factory") {
    skipped.push(Object.freeze({ catalogId: entry.id, reason: `external-model:${entry.source.modelId}` }));
    continue;
  }
  const adapter = adapters.get(entry.source.factoryId);
  if (!adapter) throw new Error(`missing factory adapter for ${entry.id}: ${entry.source.factoryId}`);
  rows.push(await measureCatalogMapLodStages(entry, adapter));
}

const totals = (stage) => Object.freeze({
  meshCount: rows.reduce((sum, row) => sum + row[stage].meshCount, 0),
  triangles: rows.reduce((sum, row) => sum + row[stage].triangles, 0),
  materialKeyCount: rows.reduce((sum, row) => sum + row[stage].materialKeyCount, 0),
  solidCollisionTriangles: rows.reduce((sum, row) => sum + row[stage].solidCollisionTriangles, 0),
  surfaceCollisionTriangles: rows.reduce((sum, row) => sum + row[stage].surfaceCollisionTriangles, 0),
});

console.log(JSON.stringify({
  factoryTemplateCount: rows.length,
  skipped,
  totals: {
    preOptimization: totals("preOptimization"),
    postOptimization: totals("postOptimization"),
    postMapLod: totals("postMapLod"),
  },
  rows,
}, null, 2));
