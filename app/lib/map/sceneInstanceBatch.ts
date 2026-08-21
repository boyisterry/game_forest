import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cityMaterialBatchKey } from "./cityMaterialBatchKey.ts";

export type SceneInstanceBatchOptions = {
  name: string;
  parent: THREE.Object3D;
  prototype: THREE.Object3D;
  placements: THREE.Object3D[];
  hidePlacementMeshes?: boolean;
  /** Test/profiling escape hatch that leaves authoritative sources untouched. */
  enabled?: boolean;
  mapLayer?: "exterior" | "interior" | "micro-detail" | "animated-detail";
};

export type SceneMergeBatchOptions = {
  name: string;
  parent: THREE.Object3D;
  sources: THREE.Object3D[];
  hideSourceMeshes?: boolean;
  /** Test/profiling escape hatch that leaves authoritative sources untouched. */
  enabled?: boolean;
  mapLayer?: "exterior" | "interior" | "micro-detail" | "animated-detail";
};

export type SceneStaticOptimizationOptions = {
  name: string;
  parent: THREE.Group;
  /** Roots whose descendants move or toggle independently at runtime. */
  excludedRoots?: readonly THREE.Object3D[];
  /** Materials whose identity is meaningful because runtime hooks mutate them. */
  mutableMaterials?: readonly THREE.Material[];
  /** Spatial cells retain useful close-up frustum culling after static merging. */
  cellSizeMeters?: number;
  /** Test/profiling escape hatch that leaves authoritative sources untouched. */
  enabled?: boolean;
  mapLayer?: "exterior" | "interior" | "micro-detail" | "animated-detail";
};

export type SceneShadowPolicyOptions = Readonly<{
  /** Additional names that should keep casting beyond the structural defaults. */
  keepPattern?: RegExp;
  /** Dynamic roots are excluded from static merging; their micro parts still do not cast. */
  dynamicRoots?: readonly THREE.Object3D[];
}>;

export type ScenePointLightPoolOptions = Readonly<{
  name: string;
  root: THREE.Group;
  excludedLights?: readonly THREE.PointLight[];
  cellSizeMeters?: number;
  intensityPerZone?: number;
  maximumDistance?: number;
}>;

type PendingBatch = {
  geometries: THREE.BufferGeometry[];
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
};

function geometryLayoutKey(geometry: THREE.BufferGeometry) {
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}:${Number(attribute.normalized)}`)
    .sort()
    .join(",");
  return `${geometry.index ? "indexed" : "plain"}|${attributes}`;
}

function materialKey(material: THREE.Material | THREE.Material[]) {
  return (Array.isArray(material) ? material : [material]).map((entry) => entry.uuid).join(",");
}

function materialValueKey(material: THREE.Material) {
  return cityMaterialBatchKey(material);
}

/**
 * Marks materials whose object identity is part of a runtime hook contract.
 * Returning the input keeps factory call sites concise while making the
 * ownership declaration visible where the materials are created/collected.
 */
export function markCityMutableMaterials<T extends readonly THREE.Material[]>(materials: T): T {
  for (const material of materials) material.userData.cityMutableMaterial = true;
  return materials;
}

function hasBlockedAncestor(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  blocked: ReadonlySet<THREE.Object3D>,
) {
  for (let node: THREE.Object3D | null = object; node && node !== parent; node = node.parent) {
    if (blocked.has(node)) return true;
  }
  return false;
}

function isEffectivelyVisible(object: THREE.Object3D, parent: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === parent) return true;
  }
  return false;
}

function localCellKey(
  object: THREE.Object3D,
  parentInverse: THREE.Matrix4,
  cellSizeMeters: number,
  point: THREE.Vector3,
) {
  point.setFromMatrixPosition(object.matrixWorld).applyMatrix4(parentInverse);
  return `${Math.floor(point.x / cellSizeMeters)},${Math.floor(point.z / cellSizeMeters)}`;
}

function effectiveMapLayer(object: THREE.Object3D, parent: THREE.Object3D, fallback: string) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (typeof node.userData.mapLayer === "string") return node.userData.mapLayer as string;
    if (node === parent) break;
  }
  return fallback;
}

/**
 * Applies the reviewed showcase shadow policy used by large standalone scenes.
 * Large structural silhouettes keep casting; repeated trim and ground detail
 * remain receivers only. Dynamic equipment stays independent, but only its
 * large silhouette parts continue casting.
 */
export function applySceneShadowPolicy(
  root: THREE.Object3D,
  options: SceneShadowPolicyOptions = {},
) {
  const keepPattern = options.keepPattern
    ?? /(?:building|shell|tower|hall|roof|canopy|bridge|arch|pavilion|greenhouse|stadium|grandstand|ride-support|coaster-track|ship-hull|ferris-wheel|drop-tower)/i;
  const receiverOnlyPattern = /(?:window|pane|glass|mullion|frame|trim|line|marking|rail|railing|fence|seat|chair|bench|table|bollard|lamp|bulb|lens|sign|marker|flower|shrub|tread|step|curb|kerb|road|path|paving|floor|slab|apron|water|rug|parking|planter)/i;
  let shadowCastersRemoved = 0;
  const scale = new THREE.Vector3();
  const size = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const isMicroDetail = object.userData.mapLayer === "micro-detail"
      || object.userData.mapLayer === "interior";
    const transparent = materials.some((material) => material.transparent || material.opacity < 1);
    const receiverOnly = receiverOnlyPattern.test(object.name);
    object.geometry.computeBoundingBox();
    object.geometry.boundingBox?.getSize(size);
    object.getWorldScale(scale);
    const dimensions = [size.x * Math.abs(scale.x), size.y * Math.abs(scale.y), size.z * Math.abs(scale.z)]
      .sort((left, right) => left - right);
    const largeOutline = dimensions[2] >= 4 && dimensions[1] >= 1;
    const authoredOutline = keepPattern.test(object.name);
    if (transparent || isMicroDetail || receiverOnly || (!largeOutline && !authoredOutline)) {
      object.castShadow = false;
      shadowCastersRemoved += 1;
    }
  });
  return Object.freeze({ shadowCastersRemoved });
}

/**
 * Merges effectively-visible static meshes by canonical material value and
 * spatial cell. Independently moving/cutaway roots are excluded. Original
 * meshes remain hidden in place as collision and semantic authorities.
 */
export function createOptimizedStaticSceneBatch(options: SceneStaticOptimizationOptions) {
  const {
    name,
    parent,
    excludedRoots = [],
    mutableMaterials = [],
    cellSizeMeters = 80,
    enabled = true,
    mapLayer = "exterior",
  } = options;
  if (!enabled) {
    const layer = new THREE.Group();
    layer.name = name;
    layer.userData = {
      renderProxy: true,
      mapCollisionRole: "ignore",
      mapLayer,
      sourceMeshCount: 0,
      batchCount: 0,
      mergedSourceMeshCount: 0,
      materialCount: 0,
      optimizationEnabled: false,
    };
    parent.add(layer);
    return layer;
  }
  const blocked = new Set(excludedRoots);
  const identityMaterials = new Set(markCityMutableMaterials(mutableMaterials));
  const canonicalMaterials = new Map<string, THREE.Material>();
  const candidates: Array<THREE.Mesh<THREE.BufferGeometry, THREE.Material>> = [];
  const candidateMaterialKeys = new WeakMap<THREE.Mesh, string>();
  parent.updateWorldMatrix(true, true);
  parent.traverse((object) => {
    if (!(object instanceof THREE.Mesh)
      || object instanceof THREE.SkinnedMesh
      || object instanceof THREE.InstancedMesh
      || object.userData.renderProxy
      || !isEffectivelyVisible(object, parent)
      || hasBlockedAncestor(object, parent, blocked)
      || Array.isArray(object.material)) return;
    const key = identityMaterials.has(object.material)
      || object.material.userData.cityMutableMaterial === true
      ? `identity:${object.material.uuid}`
      : materialValueKey(object.material);
    if (!canonicalMaterials.has(key)) canonicalMaterials.set(key, object.material);
    candidateMaterialKeys.set(object, key);
    candidates.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
  });

  const layer = new THREE.Group();
  layer.name = name;
  layer.userData = {
    renderProxy: true,
    mapCollisionRole: "ignore",
    mapLayer,
    sourceMeshCount: candidates.length,
    optimizationEnabled: true,
  };
  const parentInverse = parent.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  const pending = new Map<string, {
    material: THREE.Material;
    mapLayer: string;
    meshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.Material>>;
  }>();
  for (const mesh of candidates) {
    const sourceMapLayer = effectiveMapLayer(mesh, parent, mapLayer);
    const valueKey = candidateMaterialKeys.get(mesh)!;
    const key = [
      valueKey,
      geometryLayoutKey(mesh.geometry),
      Number(mesh.castShadow),
      Number(mesh.receiveShadow),
      mesh.renderOrder,
      sourceMapLayer,
      localCellKey(mesh, parentInverse, cellSizeMeters, point),
    ].join("|");
    const batch = pending.get(key) ?? {
      material: canonicalMaterials.get(valueKey)!,
      mapLayer: sourceMapLayer,
      meshes: [],
    };
    batch.meshes.push(mesh);
    pending.set(key, batch);
  }

  let batchCount = 0;
  let mergedSourceMeshCount = 0;
  for (const batch of pending.values()) {
    if (batch.meshes.length < 2) continue;
    const geometries = batch.meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(parentInverse.clone().multiply(mesh.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      geometries.forEach((geometry) => geometry.dispose());
      continue;
    }
    geometries.forEach((geometry) => geometry.dispose());
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const proxy = new THREE.Mesh(merged, batch.material);
    proxy.name = `${name}-batch-${batchCount}`;
    proxy.castShadow = batch.meshes[0].castShadow;
    proxy.receiveShadow = batch.meshes[0].receiveShadow;
    proxy.renderOrder = batch.meshes[0].renderOrder;
    proxy.userData = { renderProxy: true, mapCollisionRole: "ignore", mapLayer: batch.mapLayer };
    layer.add(proxy);
    batch.meshes.forEach((mesh) => {
      mesh.visible = false;
      Object.defineProperty(mesh.userData, "renderProxySource", {
        configurable: true,
        value: name,
      });
    });
    mergedSourceMeshCount += batch.meshes.length;
    batchCount += 1;
  }
  layer.userData.batchCount = batchCount;
  layer.userData.mergedSourceMeshCount = mergedSourceMeshCount;
  layer.userData.materialCount = canonicalMaterials.size;
  parent.add(layer);
  return layer;
}

/**
 * Replaces many fixture-local PointLights with a small spatial light pool.
 * Fixture emissive materials remain controlled by their existing hooks, while
 * the expensive fragment-light list is bounded by the number of occupied cells.
 */
export function createScenePointLightPool(options: ScenePointLightPoolOptions) {
  const {
    name,
    root,
    excludedLights = [],
    cellSizeMeters = 70,
    intensityPerZone = 3.6,
    maximumDistance = 48,
  } = options;
  const excluded = new Set(excludedLights);
  const sources: THREE.PointLight[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (object instanceof THREE.PointLight && !excluded.has(object) && !object.userData.performanceLightPool) {
      sources.push(object);
    }
  });
  const rootInverse = root.matrixWorld.clone().invert();
  const position = new THREE.Vector3();
  const cells = new Map<string, { positions: THREE.Vector3[]; colors: THREE.Color[]; distances: number[] }>();
  for (const source of sources) {
    position.setFromMatrixPosition(source.matrixWorld).applyMatrix4(rootInverse);
    const key = `${Math.floor(position.x / cellSizeMeters)},${Math.floor(position.z / cellSizeMeters)}`;
    const cell = cells.get(key) ?? { positions: [], colors: [], distances: [] };
    cell.positions.push(position.clone());
    cell.colors.push(source.color.clone());
    cell.distances.push(source.distance || 16);
    cells.set(key, cell);
    source.visible = false;
    source.intensity = 0;
    source.castShadow = false;
    source.userData.performancePooled = true;
  }

  const pool = new THREE.Group();
  pool.name = name;
  pool.userData = { performanceLightPool: true, sourceLightCount: sources.length };
  const lights: THREE.PointLight[] = [];
  let index = 0;
  for (const cell of cells.values()) {
    const centre = cell.positions.reduce((sum, value) => sum.add(value), new THREE.Vector3())
      .multiplyScalar(1 / cell.positions.length);
    const color = cell.colors.reduce((sum, value) => sum.add(value), new THREE.Color(0, 0, 0))
      .multiplyScalar(1 / cell.colors.length);
    const spread = cell.positions.reduce((largest, value) => Math.max(largest, value.distanceTo(centre)), 0);
    const distance = Math.min(maximumDistance, Math.max(...cell.distances) + spread);
    const light = new THREE.PointLight(color, 0, distance, 1.85);
    light.name = `${name}-zone-${index}`;
    light.position.copy(centre);
    light.visible = false;
    light.castShadow = false;
    light.userData = { performanceLightPool: true, sourceCount: cell.positions.length };
    pool.add(light);
    lights.push(light);
    index += 1;
  }
  root.add(pool);

  const setPowered = (powered: boolean) => {
    for (const source of sources) {
      source.visible = false;
      source.intensity = 0;
      source.castShadow = false;
    }
    for (const light of lights) {
      light.visible = powered;
      light.intensity = powered
        ? intensityPerZone * Math.min(2.2, 0.75 + light.userData.sourceCount * 0.2)
        : 0;
    }
  };
  setPowered(false);
  return Object.freeze({
    group: pool,
    sourceLightCount: sources.length,
    pooledLightCount: lights.length,
    setPowered,
  });
}

function markRenderProxySource(root: THREE.Object3D, sourceName: string) {
  Object.defineProperty(root.userData, "renderProxySource", {
    configurable: true,
    value: sourceName,
  });
}

function hideRenderProxySource(root: THREE.Object3D, sourceName: string) {
  markRenderProxySource(root, sourceName);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.visible = false;
  });
  root.visible = false;
}

/**
 * Converts repeated static Object3D hierarchies into a small set of
 * InstancedMesh draw calls. Source hierarchies stay in place (and may be
 * hidden) so collision, naming and editor metadata remain authoritative.
 */
export function createInstancedPrototypeBatch(options: SceneInstanceBatchOptions) {
  const {
    name,
    parent,
    prototype,
    placements,
    hidePlacementMeshes = true,
    enabled = true,
    mapLayer = "exterior",
  } = options;
  const layer = new THREE.Group();
  layer.name = name;
  layer.userData = {
    renderProxy: true,
    sourcePrototype: prototype.name,
    instanceCount: placements.length,
    mapCollisionRole: "ignore",
    mapLayer,
    optimizationEnabled: enabled,
  };
  if (!enabled) {
    let sourceMeshCount = 0;
    prototype.traverse((object) => {
      if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && object.visible) {
        sourceMeshCount += 1;
      }
    });
    layer.userData.sourceMeshCount = sourceMeshCount;
    layer.userData.batchCount = 0;
    parent.add(layer);
    return layer;
  }
  if (placements.length === 0) {
    parent.add(layer);
    return layer;
  }

  parent.updateWorldMatrix(true, true);
  prototype.updateWorldMatrix(true, true);
  placements.forEach((placement) => placement.updateWorldMatrix(true, true));
  const prototypeInverse = prototype.matrixWorld.clone().invert();
  const parentInverse = parent.matrixWorld.clone().invert();
  const pending = new Map<string, PendingBatch>();

  prototype.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || !object.visible) return;
    const relative = prototypeInverse.clone().multiply(object.matrixWorld);
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(relative);
    const multiMaterial = Array.isArray(object.material);
    const key = [
      materialKey(object.material),
      geometryLayoutKey(geometry),
      Number(object.castShadow),
      Number(object.receiveShadow),
      object.renderOrder,
      multiMaterial ? object.uuid : "mergeable",
    ].join("|");
    const batch: PendingBatch = pending.get(key) ?? {
      geometries: [],
      material: object.material,
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
      renderOrder: object.renderOrder,
    };
    batch.geometries.push(geometry);
    pending.set(key, batch);
  });

  let sourceMeshCount = 0;
  let batchIndex = 0;
  const placementMatrix = new THREE.Matrix4();
  for (const batch of pending.values()) {
    sourceMeshCount += batch.geometries.length;
    const merged = batch.geometries.length === 1
      ? batch.geometries[0]
      : mergeGeometries(batch.geometries, false);
    const geometries = merged ? [merged] : batch.geometries;
    if (merged && batch.geometries.length > 1) batch.geometries.forEach((geometry) => geometry.dispose());
    for (const geometry of geometries) {
      const instances = new THREE.InstancedMesh(geometry, batch.material, placements.length);
      instances.name = `${name}-batch-${batchIndex}`;
      instances.castShadow = batch.castShadow;
      instances.receiveShadow = batch.receiveShadow;
      instances.renderOrder = batch.renderOrder;
      instances.userData = {
        renderProxy: true,
        sourcePrototype: prototype.name,
        mapCollisionRole: "ignore",
        mapLayer,
      };
      placements.forEach((placement, index) => {
        placementMatrix.multiplyMatrices(parentInverse, placement.matrixWorld);
        instances.setMatrixAt(index, placementMatrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox();
      instances.computeBoundingSphere();
      layer.add(instances);
      batchIndex += 1;
    }
  }

  if (hidePlacementMeshes) {
    placements.forEach((placement) => hideRenderProxySource(placement, name));
  }
  layer.userData.sourceMeshCount = sourceMeshCount;
  layer.userData.batchCount = batchIndex;
  parent.add(layer);
  return layer;
}

/** Merge arbitrary static hierarchies by material while preserving their source nodes. */
export function createMergedStaticBatch(options: SceneMergeBatchOptions) {
  const {
    name,
    parent,
    sources,
    hideSourceMeshes = true,
    enabled = true,
    mapLayer = "exterior",
  } = options;
  const layer = new THREE.Group();
  layer.name = name;
  layer.userData = {
    renderProxy: true,
    mapCollisionRole: "ignore",
    mapLayer,
    optimizationEnabled: enabled,
  };
  if (!enabled) {
    let sourceMeshCount = 0;
    for (const source of sources) {
      source.traverse((object) => {
        if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && object.visible) {
          sourceMeshCount += 1;
        }
      });
    }
    layer.userData.sourceMeshCount = sourceMeshCount;
    layer.userData.batchCount = 0;
    parent.add(layer);
    return layer;
  }
  parent.updateWorldMatrix(true, true);
  sources.forEach((source) => source.updateWorldMatrix(true, true));
  const parentInverse = parent.matrixWorld.clone().invert();
  const pending = new Map<string, PendingBatch>();
  let sourceMeshCount = 0;

  for (const source of sources) {
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || !object.visible) return;
      sourceMeshCount += 1;
      const relative = parentInverse.clone().multiply(object.matrixWorld);
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(relative);
      const multiMaterial = Array.isArray(object.material);
      const key = [
        materialKey(object.material),
        geometryLayoutKey(geometry),
        Number(object.castShadow),
        Number(object.receiveShadow),
        object.renderOrder,
        multiMaterial ? object.uuid : "mergeable",
      ].join("|");
      const batch: PendingBatch = pending.get(key) ?? {
        geometries: [],
        material: object.material,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        renderOrder: object.renderOrder,
      };
      batch.geometries.push(geometry);
      pending.set(key, batch);
    });
  }

  let batchIndex = 0;
  for (const batch of pending.values()) {
    const merged = batch.geometries.length === 1
      ? batch.geometries[0]
      : mergeGeometries(batch.geometries, false);
    const geometries = merged ? [merged] : batch.geometries;
    if (merged && batch.geometries.length > 1) batch.geometries.forEach((geometry) => geometry.dispose());
    for (const geometry of geometries) {
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.name = `${name}-batch-${batchIndex}`;
      mesh.castShadow = batch.castShadow;
      mesh.receiveShadow = batch.receiveShadow;
      mesh.renderOrder = batch.renderOrder;
      mesh.userData = { renderProxy: true, mapCollisionRole: "ignore", mapLayer };
      layer.add(mesh);
      batchIndex += 1;
    }
  }
  if (hideSourceMeshes) {
    sources.forEach((source) => hideRenderProxySource(source, name));
  }
  layer.userData.sourceMeshCount = sourceMeshCount;
  layer.userData.batchCount = batchIndex;
  parent.add(layer);
  return layer;
}
