import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import { CITY_CATALOG } from "../app/lib/map/cityCatalog.ts";
import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import {
  acquireResourceCacheLease,
  assertResourceCacheIntegrity,
  disposeSceneResources,
  internScenePrimitiveGeometries,
  resourceCacheStats,
  retireResourceCacheGeneration,
} from "../app/lib/map/cityResourceCache.ts";

function geometryAttributeBytes(geometry) {
  const arrays = new Set();
  const include = (attribute) => {
    if (!attribute) return;
    arrays.add(attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array);
  };
  include(geometry.getIndex());
  for (const attribute of Object.values(geometry.attributes)) include(attribute);
  for (const attributes of Object.values(geometry.morphAttributes)) {
    for (const attribute of attributes) include(attribute);
  }
  return [...arrays].reduce((bytes, array) => bytes + array.byteLength, 0);
}

function collectGeometry(root, target) {
  root.traverse((object) => {
    if (object.isMesh) target.add(object.geometry);
  });
}

async function measureWorkload(name, adapters, placementCount, extra = {}) {
  const lease = acquireResourceCacheLease();
  const roots = [];
  const before = new Set();
  const after = new Set();
  const internReports = [];
  try {
    for (const adapter of adapters) {
      const root = adapter.build();
      roots.push(root);
      collectGeometry(root, before);
      internReports.push(internScenePrimitiveGeometries(root, lease));
      collectGeometry(root, after);
    }
    assertResourceCacheIntegrity(lease);
    const beforeBytes = [...before].reduce((sum, geometry) => sum + geometryAttributeBytes(geometry), 0);
    const afterBytes = [...after].reduce((sum, geometry) => sum + geometryAttributeBytes(geometry), 0);
    return Object.freeze({
      name,
      placementCount,
      factoryTemplateCount: adapters.length,
      geometryObjectsBefore: before.size,
      geometryObjectsAfter: after.size,
      reclaimedGeometryObjects: before.size - after.size,
      attributeBytesBefore: beforeBytes,
      attributeBytesAfter: afterBytes,
      reclaimedAttributeBytes: beforeBytes - afterBytes,
      cacheableMeshReferences: internReports.reduce((sum, report) => sum + report.cacheableReferences, 0),
      cacheHits: internReports.reduce((sum, report) => sum + report.cacheHits, 0),
      cacheMisses: internReports.reduce((sum, report) => sum + report.cacheMisses, 0),
      disposedDuplicates: internReports.reduce((sum, report) => sum + report.disposedDuplicates, 0),
      cacheStats: resourceCacheStats(),
      ...extra,
    });
  } finally {
    for (const root of roots) disposeSceneResources(root);
    lease.release();
    await retireResourceCacheGeneration();
  }
}

const document = createCedarCrossingDocument();
const catalogById = new Map(CITY_CATALOG.map((entry) => [entry.id, entry]));
const cedarCatalogIds = [...new Set(document.placements.map((placement) => placement.catalogId))];
const cedarFactoryIds = new Set();
const externalModelIds = new Set();
for (const catalogId of cedarCatalogIds) {
  const entry = catalogById.get(catalogId);
  if (!entry) throw new Error(`Cedar placement references missing catalog entry: ${catalogId}`);
  if (entry.source.kind === "factory") cedarFactoryIds.add(entry.source.factoryId);
  else externalModelIds.add(entry.source.modelId);
}
const cedarAdapters = DEFAULT_CATALOG_FACTORY_ADAPTERS.filter((adapter) => cedarFactoryIds.has(adapter.factoryId));
if (cedarAdapters.length !== cedarFactoryIds.size) throw new Error("Cedar factory adapter coverage is incomplete");
const heavyAdapter = DEFAULT_CATALOG_FACTORY_ADAPTERS.find(
  (adapter) => adapter.factoryId === "standard-residential-community-6-rows",
);
if (!heavyAdapter) throw new Error("6-row standard residential adapter is missing");

const cedar = await measureWorkload("cedar-crossing", cedarAdapters, document.placements.length, {
  catalogTemplateCount: cedarCatalogIds.length,
  externalModelIds: [...externalModelIds],
  note: "External GLB model-pack geometry has no primitive parameters and is intentionally outside this cache.",
});
const distributed20x = await measureWorkload("cedar-crossing-spatial-20x", cedarAdapters, document.placements.length * 20, {
  replicaCount: 20,
  catalogTemplateCount: cedarCatalogIds.length,
  externalModelIds: [...externalModelIds],
  note: "Spatial replicas reuse the same canonical template generation; placement count does not mint source geometry.",
});
const heavyDemo = await measureWorkload("standard-residential-community-6-rows-demo", [heavyAdapter], 1);

console.log(JSON.stringify({ cedar, distributed20x, heavyDemo }, null, 2));
