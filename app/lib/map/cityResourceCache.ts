import * as THREE from "three";

export type ResourceCacheLease = Readonly<{
  generation: number;
  release: () => void;
}>;

export type PrimitiveInternReport = Readonly<{
  generation: number;
  meshReferences: number;
  cacheableReferences: number;
  cacheHits: number;
  cacheMisses: number;
  disposedDuplicates: number;
}>;

export type CachedPrimitiveScene<T extends THREE.Object3D = THREE.Object3D> = Readonly<{
  root: T;
  lease: ResourceCacheLease;
  report: PrimitiveInternReport;
}>;

type PrimitiveEntry = {
  geometry: THREE.BufferGeometry;
  checksum: string;
  dispose: () => void;
};

type CacheGeneration = {
  id: number;
  entries: Map<string, PrimitiveEntry>;
  borrowers: number;
  retired: boolean;
  disposed: boolean;
  retirement: Promise<void>;
  resolveRetirement: () => void;
};

type LeaseState = {
  generation: CacheGeneration;
  released: boolean;
};

const EXCLUDED_PARAMETERIZED_TYPES = new Set([
  "ExtrudeGeometry",
  "LatheGeometry",
  "ShapeGeometry",
  "TextGeometry",
  "TubeGeometry",
]);

const DEVELOPMENT_MUTATORS = [
  "applyMatrix4",
  "applyQuaternion",
  "rotateX",
  "rotateY",
  "rotateZ",
  "translate",
  "scale",
  "lookAt",
  "center",
  "setFromPoints",
  "setIndex",
  "setAttribute",
  "deleteAttribute",
  "setDrawRange",
  "addGroup",
  "clearGroups",
  "computeVertexNormals",
  "computeTangents",
  "normalizeNormals",
  "copy",
] as const;

let nextGenerationId = 1;
let cacheOwned = new WeakSet<THREE.BufferGeometry | THREE.Material>();
let geometryOwners = new WeakMap<THREE.BufferGeometry, CacheGeneration>();
let leaseStates = new WeakMap<ResourceCacheLease, LeaseState>();
const generations = new Map<number, CacheGeneration>();

function createGeneration() {
  let resolveRetirement = () => undefined;
  const retirement = new Promise<void>((resolve) => { resolveRetirement = resolve; });
  const generation: CacheGeneration = {
    id: nextGenerationId,
    entries: new Map(),
    borrowers: 0,
    retired: false,
    disposed: false,
    retirement,
    resolveRetirement,
  };
  nextGenerationId += 1;
  generations.set(generation.id, generation);
  return generation;
}

let currentGeneration = createGeneration();

function normalizePlainValue(value: unknown): unknown | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
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
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const nested = normalizePlainValue((value as Record<string, unknown>)[key]);
    if (nested === undefined) return undefined;
    normalized[key] = nested;
  }
  return normalized;
}

function mixText(state: { first: number; second: number }, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    state.first = Math.imul(state.first ^ code, 0x01000193) >>> 0;
    state.second = Math.imul(state.second ^ code, 0x5bd1e995) >>> 0;
  }
}

function mixArray(
  state: { first: number; second: number },
  array: ArrayBufferView & { byteOffset: number; byteLength: number },
) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (const value of bytes) {
    state.first = Math.imul(state.first ^ value, 0x01000193) >>> 0;
    state.second = Math.imul(state.second ^ value, 0x5bd1e995) >>> 0;
  }
}

function mixAttribute(
  state: { first: number; second: number },
  name: string,
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
) {
  if (attribute instanceof THREE.InterleavedBufferAttribute) {
    mixText(state, [
      name,
      "interleaved",
      attribute.data.array.constructor.name,
      attribute.itemSize,
      Number(attribute.normalized),
      attribute.offset,
      attribute.data.stride,
      attribute.data.usage,
    ].join("|") + "|");
    mixArray(state, attribute.data.array);
    return;
  }
  mixText(state, [
    name,
    "buffer",
    attribute.array.constructor.name,
    attribute.itemSize,
    Number(attribute.normalized),
    attribute.usage,
    attribute.gpuType,
  ].join("|") + "|");
  mixArray(state, attribute.array);
}

export function geometryContentChecksum(geometry: THREE.BufferGeometry) {
  const state = { first: 0x811c9dc5, second: 0x9747b28c };
  const index = geometry.getIndex();
  if (index) mixAttribute(state, "index", index);
  for (const name of Object.keys(geometry.attributes).sort()) {
    mixAttribute(state, `attribute:${name}`, geometry.getAttribute(name));
  }
  for (const name of Object.keys(geometry.morphAttributes).sort()) {
    geometry.morphAttributes[name].forEach((attribute, indexValue) => {
      mixAttribute(state, `morph:${name}:${indexValue}`, attribute);
    });
  }
  mixText(state, JSON.stringify({
    morphTargetsRelative: geometry.morphTargetsRelative,
    groups: geometry.groups,
    drawRange: geometry.drawRange,
  }));
  return `${state.first.toString(16).padStart(8, "0")}${state.second.toString(16).padStart(8, "0")}`;
}

export function primitiveGeometryCacheKey(geometry: THREE.BufferGeometry) {
  if (EXCLUDED_PARAMETERIZED_TYPES.has(geometry.type)) return null;
  const parameters = (geometry as THREE.BufferGeometry & { parameters?: unknown }).parameters;
  if (!parameters || typeof parameters !== "object") return null;
  const normalized = normalizePlainValue(parameters);
  if (normalized === undefined) return null;
  const semanticUserData = normalizePlainValue(geometry.userData);
  if (semanticUserData === undefined) return null;
  return JSON.stringify([
    geometry.type,
    normalized,
    geometry.name,
    semanticUserData,
    geometryContentChecksum(geometry),
  ]);
}

function installDevelopmentMutationGuards(geometry: THREE.BufferGeometry) {
  if (process.env.NODE_ENV === "production") return;
  for (const method of DEVELOPMENT_MUTATORS) {
    if (typeof (geometry as unknown as Record<string, unknown>)[method] !== "function") continue;
    Object.defineProperty(geometry, method, {
      configurable: true,
      value: () => {
        throw new TypeError(`cannot mutate cache-owned city geometry via ${method}()`);
      },
    });
  }
}

function disposeGeneration(generation: CacheGeneration) {
  if (generation.disposed) return;
  if (generation.borrowers !== 0) throw new Error("cannot dispose a borrowed resource cache generation");
  generation.disposed = true;
  for (const entry of generation.entries.values()) entry.dispose();
  generation.entries.clear();
  generations.delete(generation.id);
  generation.resolveRetirement();
}

function maybeDisposeGeneration(generation: CacheGeneration) {
  if (generation.retired && generation.borrowers === 0) disposeGeneration(generation);
}

export function acquireResourceCacheLease(): ResourceCacheLease {
  const generation = currentGeneration;
  if (generation.retired || generation.disposed) throw new Error("current resource cache generation is unavailable");
  generation.borrowers += 1;
  const state: LeaseState = { generation, released: false };
  const lease: ResourceCacheLease = Object.freeze({
    generation: generation.id,
    release: () => {
      if (state.released) return;
      state.released = true;
      state.generation.borrowers -= 1;
      if (state.generation.borrowers < 0) throw new Error("resource cache borrower count underflow");
      maybeDisposeGeneration(state.generation);
    },
  });
  leaseStates.set(lease, state);
  return lease;
}

function requireLease(lease: ResourceCacheLease) {
  const state = leaseStates.get(lease);
  if (!state || state.released) throw new Error("resource cache lease is released or foreign");
  if (state.generation.retired || state.generation.disposed) {
    throw new Error("resource cache lease generation no longer accepts new resources");
  }
  return state.generation;
}

export function internScenePrimitiveGeometries(
  root: THREE.Object3D,
  lease: ResourceCacheLease,
): PrimitiveInternReport {
  const generation = requireLease(lease);
  const duplicates = new Set<THREE.BufferGeometry>();
  let meshReferences = 0;
  let cacheableReferences = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshReferences += 1;
    const geometry = object.geometry;
    const owner = geometryOwners.get(geometry);
    if (owner) {
      if (owner !== generation) throw new Error("city geometry crossed resource cache generations");
      cacheableReferences += 1;
      cacheHits += 1;
      return;
    }
    const key = primitiveGeometryCacheKey(geometry);
    if (key === null) return;
    cacheableReferences += 1;
    const existing = generation.entries.get(key);
    if (existing) {
      object.geometry = existing.geometry;
      duplicates.add(geometry);
      cacheHits += 1;
      return;
    }
    const checksum = geometryContentChecksum(geometry);
    const dispose = geometry.dispose.bind(geometry);
    generation.entries.set(key, { geometry, checksum, dispose });
    cacheOwned.add(geometry);
    geometryOwners.set(geometry, generation);
    installDevelopmentMutationGuards(geometry);
    cacheMisses += 1;
  });
  for (const geometry of duplicates) geometry.dispose();
  return Object.freeze({
    generation: generation.id,
    meshReferences,
    cacheableReferences,
    cacheHits,
    cacheMisses,
    disposedDuplicates: duplicates.size,
  });
}

/** Acquires before factory execution and leaves teardown/release explicit on the scene owner. */
export function createCachedPrimitiveScene<T extends THREE.Object3D>(build: () => T): CachedPrimitiveScene<T> {
  const lease = acquireResourceCacheLease();
  let root: T | undefined;
  try {
    root = build();
    const report = internScenePrimitiveGeometries(root, lease);
    return Object.freeze({ root, lease, report });
  } catch (error) {
    if (root) disposeSceneResources(root);
    lease.release();
    throw error;
  }
}

export function assertResourceCacheIntegrity(lease?: ResourceCacheLease) {
  const selected = lease ? [requireLease(lease)] : [...generations.values()];
  for (const generation of selected) {
    for (const entry of generation.entries.values()) {
      const actual = geometryContentChecksum(entry.geometry);
      if (actual !== entry.checksum) {
        throw new Error(`cache-owned city geometry mutated in generation ${generation.id}`);
      }
    }
  }
}

export function isCacheOwned(resource: THREE.BufferGeometry | THREE.Material) {
  return cacheOwned.has(resource);
}

export function disposeMaterialsAndTextures(materials: Iterable<THREE.Material>) {
  const uniqueMaterials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    if (!material || isCacheOwned(material)) continue;
    uniqueMaterials.add(material);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
  }
  for (const texture of textures) texture.dispose();
  for (const material of uniqueMaterials) material.dispose();
}

export function disposeSceneResources(
  root: THREE.Object3D,
  options: Readonly<{ disposeMaterials?: boolean }> = {},
) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!isCacheOwned(object.geometry)) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || isCacheOwned(material)) continue;
      materials.add(material);
    }
  });
  if (options.disposeMaterials !== false) disposeMaterialsAndTextures(materials);
  for (const geometry of geometries) geometry.dispose();
}

export function retireResourceCacheGeneration() {
  const retiring = currentGeneration;
  if (!retiring.retired) retiring.retired = true;
  currentGeneration = createGeneration();
  maybeDisposeGeneration(retiring);
  return retiring.retirement;
}

export function resetResourceCacheForTests() {
  for (const generation of generations.values()) {
    if (generation.borrowers !== 0) {
      throw new Error("cannot reset resource cache while scenes are borrowed");
    }
  }
  for (const generation of [...generations.values()]) disposeGeneration(generation);
  cacheOwned = new WeakSet();
  geometryOwners = new WeakMap();
  leaseStates = new WeakMap();
  currentGeneration = createGeneration();
}

export function resourceCacheStats() {
  return Object.freeze({
    currentGeneration: currentGeneration.id,
    generations: generations.size,
    cachedGeometries: [...generations.values()].reduce(
      (sum, generation) => sum + generation.entries.size,
      0,
    ),
    borrowers: [...generations.values()].reduce(
      (sum, generation) => sum + generation.borrowers,
      0,
    ),
  });
}
