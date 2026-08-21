import { CITY_CATALOG } from "../app/lib/map/cityCatalog.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

const sources = createCatalogSourceRegistry();
const layers = createCityVisualLayerManager();
const cache = createCityTemplateCache({ sources, layers });
const materialKeys = new Set();
const compatibilityKeys = new Set();
const tintMaterialFamilyKeys = new Set();
const tintCompatibilityKeys = new Set();
let batches = 0;
let measuredTemplates = 0;

try {
  for (const entry of CITY_CATALOG) {
    let lease;
    try {
      lease = cache.getVisualTemplate({ kind: "catalog", catalogId: entry.id });
    } catch (error) {
      if (error?.code === "CATALOG_VISUAL_SOURCE_MISSING") continue;
      throw error;
    }
    const metrics = cache.getVisualBatchKeyMetrics(lease.value);
    lease.release();
    measuredTemplates += 1;
    batches += metrics.batchCount;
    for (const key of metrics.materialKeys) materialKeys.add(key);
    for (const key of metrics.compatibilityKeys) compatibilityKeys.add(key);
    for (const key of metrics.tintMaterialFamilyKeys) tintMaterialFamilyKeys.add(key);
    for (const key of metrics.tintCompatibilityKeys) tintCompatibilityKeys.add(key);
  }
  console.log(JSON.stringify({
    measuredTemplates,
    batches,
    uniqueMaterialValueKeys: materialKeys.size,
    uniqueBatchCompatibilityKeys: compatibilityKeys.size,
    uniqueTintMaterialFamilyKeys: tintMaterialFamilyKeys.size,
    uniqueTintCompatibilityKeys: tintCompatibilityKeys.size,
  }, null, 2));
} finally {
  await cache.retire();
  await sources.retire();
}
