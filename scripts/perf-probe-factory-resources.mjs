import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import {
  acquireResourceCacheLease,
  assertResourceCacheIntegrity,
  disposeSceneResources,
  internScenePrimitiveGeometries,
  primitiveGeometryCacheKey,
  resourceCacheStats,
  retireResourceCacheGeneration,
} from "../app/lib/map/cityResourceCache.ts";

const EXCLUDED_PARAMETERIZED_TYPES = new Set([
  "ExtrudeGeometry",
  "LatheGeometry",
  "ShapeGeometry",
  "TextGeometry",
  "TubeGeometry",
]);

function normalizePlainValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const normalized = [];
    for (const nested of value) {
      const result = normalizePlainValue(nested);
      if (result === undefined) return undefined;
      normalized.push(result);
    }
    return normalized;
  }
  if (!value || typeof value !== "object") return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const nested = normalizePlainValue(value[key]);
    if (nested === undefined) return undefined;
    normalized[key] = nested;
  }
  return normalized;
}

function primitiveValueKey(geometry) {
  if (EXCLUDED_PARAMETERIZED_TYPES.has(geometry.type)) return null;
  if (!geometry.parameters || typeof geometry.parameters !== "object") return null;
  const parameters = normalizePlainValue(geometry.parameters);
  if (parameters === undefined) return null;
  return JSON.stringify([geometry.type, parameters]);
}

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

const allGeometries = new Set();
const allSafeGeometries = new Set();
const allMaterials = new Set();
const cacheableByKey = new Map();
const rows = [];
const roots = [];
const cacheLease = acquireResourceCacheLease();

for (const adapter of DEFAULT_CATALOG_FACTORY_ADAPTERS) {
  const root = adapter.build();
  const geometries = new Set();
  const materials = new Set();
  let meshReferences = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshReferences += 1;
    geometries.add(object.geometry);
    allGeometries.add(object.geometry);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of values) {
      materials.add(material);
      allMaterials.add(material);
    }
  });

  let cacheableGeometryObjects = 0;
  let cacheableAttributeBytes = 0;
  const factoryCacheableByKey = new Map();
  for (const geometry of geometries) {
    const key = primitiveValueKey(geometry);
    if (key === null) continue;
    const bytes = geometryAttributeBytes(geometry);
    cacheableGeometryObjects += 1;
    cacheableAttributeBytes += bytes;
    const bucket = cacheableByKey.get(key) ?? [];
    bucket.push({ geometry, bytes, factoryId: adapter.factoryId });
    cacheableByKey.set(key, bucket);
    const factoryBucket = factoryCacheableByKey.get(key) ?? [];
    factoryBucket.push(bytes);
    factoryCacheableByKey.set(key, factoryBucket);
  }

  const reclaimableFactoryAttributeBytes = [...factoryCacheableByKey.values()].reduce(
    (total, bucket) => total + bucket.slice(1).reduce((bytes, value) => bytes + value, 0),
    0,
  );
  const attributeBytes = [...geometries].reduce(
    (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
    0,
  );

  const safeIntern = internScenePrimitiveGeometries(root, cacheLease);
  const safeGeometries = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    safeGeometries.add(object.geometry);
    allSafeGeometries.add(object.geometry);
  });
  const safeAttributeBytes = [...safeGeometries].reduce(
    (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
    0,
  );

  rows.push(Object.freeze({
    factoryId: adapter.factoryId,
    meshReferences,
    geometryObjects: geometries.size,
    materialObjects: materials.size,
    attributeBytes,
    cacheableGeometryObjects,
    cacheableValueKeys: factoryCacheableByKey.size,
    cacheableAttributeBytes,
    reclaimableGeometryObjects: cacheableGeometryObjects - factoryCacheableByKey.size,
    reclaimableAttributeBytes: reclaimableFactoryAttributeBytes,
    deduplicatedAttributeBytes: attributeBytes - reclaimableFactoryAttributeBytes,
    safeCache: Object.freeze({
      ...safeIntern,
      geometryObjects: safeGeometries.size,
      attributeBytes: safeAttributeBytes,
      eligibleValueKeys: new Set([...geometries].map(primitiveGeometryCacheKey).filter(Boolean)).size,
      reclaimedGeometryObjects: geometries.size - safeGeometries.size,
      reclaimedAttributeBytes: attributeBytes - safeAttributeBytes,
    }),
  }));

  // Keep objects alive until aggregate identity/value-key accounting is done.
  roots.push(root);
}

let reclaimableGeometryObjects = 0;
let reclaimableAttributeBytes = 0;
for (const bucket of cacheableByKey.values()) {
  reclaimableGeometryObjects += Math.max(0, bucket.length - 1);
  reclaimableAttributeBytes += bucket.slice(1).reduce((bytes, entry) => bytes + entry.bytes, 0);
}

const report = {
  factoryCount: DEFAULT_CATALOG_FACTORY_ADAPTERS.length,
  meshReferences: rows.reduce((sum, row) => sum + row.meshReferences, 0),
  geometryObjects: allGeometries.size,
  materialObjects: allMaterials.size,
  attributeBytes: [...allGeometries].reduce(
    (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
    0,
  ),
  cacheableGeometryObjects: [...cacheableByKey.values()].reduce(
    (sum, bucket) => sum + bucket.length,
    0,
  ),
  cacheableValueKeys: cacheableByKey.size,
  cacheableAttributeBytes: [...cacheableByKey.values()].reduce(
    (total, bucket) => total + bucket.reduce((bytes, entry) => bytes + entry.bytes, 0),
    0,
  ),
  reclaimableGeometryObjects,
  reclaimableAttributeBytes,
  deduplicatedAttributeBytes: [...allGeometries].reduce(
    (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
    0,
  ) - reclaimableAttributeBytes,
  safeCache: {
    geometryObjects: allSafeGeometries.size,
    attributeBytes: [...allSafeGeometries].reduce(
      (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
      0,
    ),
    reclaimedGeometryObjects: allGeometries.size - allSafeGeometries.size,
    reclaimedAttributeBytes: [...allGeometries].reduce(
      (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
      0,
    ) - [...allSafeGeometries].reduce(
      (bytes, geometry) => bytes + geometryAttributeBytes(geometry),
      0,
    ),
    ...resourceCacheStats(),
  },
  rows,
};

assertResourceCacheIntegrity(cacheLease);
console.log(JSON.stringify(report, null, 2));

for (const root of roots) {
  disposeSceneResources(root);
  root.clear();
}
cacheLease.release();
await retireResourceCacheGeneration();
