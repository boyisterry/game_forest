import * as THREE from "three";

export type CityBatchLodTier = "near" | "far";
export type CityBatchFarStrategy = "proxy" | "hidden" | "keep-near";

export type CityBatchLodPolicy = Readonly<{
  /**
   * Hard detail radius used by the riding camera. Large campus bounds can
   * otherwise remain in the near tier from hundreds of metres away even when
   * their projected footprint is mostly hidden by fog. Editor overview leaves
   * this unset so authored detail remains available across the whole canvas.
   */
  maximumNearDistanceMeters?: number;
}>;

export type CityBatchTemplateSlot = Readonly<{
  slotId: string;
  poolKey: string;
  material: THREE.Material;
  nearGeometry: THREE.BufferGeometry;
  farGeometry?: THREE.BufferGeometry;
  farStrategy?: CityBatchFarStrategy;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder?: number;
  baseTint?: THREE.Color;
}>;

export type CityBatchTemplateDefinition = Readonly<{
  templateId: string;
  slots: readonly CityBatchTemplateSlot[];
}>;

export type CityBatchWorldStats = Readonly<{
  backend: "batched-mesh";
  pools: number;
  templates: number;
  placements: number;
  instances: number;
  visiblePlacements: number;
  visibleInstances: number;
  farPlacements: number;
  instanceCapacity: number;
  geometries: number;
  vertexCapacity: number;
  indexCapacity: number;
  estimatedBufferBytes: number;
}>;

export type CityBatchWorld = Readonly<{
  root: THREE.Group;
  backend: "batched-mesh";
  registerTemplate: (definition: CityBatchTemplateDefinition) => void;
  addPlacement: (placementId: string, templateId: string, worldFromLocal: THREE.Matrix4) => void;
  movePlacement: (placementId: string, worldFromLocal: THREE.Matrix4) => void;
  removePlacement: (placementId: string) => void;
  setPlacementVisible: (placementId: string, visible: boolean) => void;
  setPlacementLod: (placementId: string, tier: CityBatchLodTier) => void;
  updateLod: (camera: THREE.Camera, policy?: CityBatchLodPolicy) => Readonly<{
    nearPlacements: number;
    farPlacements: number;
    changes: readonly Readonly<{ placementId: string; tier: CityBatchLodTier }>[];
  }>;
  setPlacementTint: (placementId: string, tint: THREE.Color | null) => void;
  updateVisibility: (
    colorFrustum: THREE.Frustum,
    shadowFrustum?: THREE.Frustum,
  ) => Readonly<{
    placements: number;
    instances: number;
  }>;
  resolvePick: (object: THREE.Object3D, batchId: number | undefined) => string | null;
  getPickObjects: () => readonly THREE.BatchedMesh[];
  raycast: (raycaster: THREE.Raycaster) => readonly Readonly<{ placementId: string; distance: number }>[];
  getRaycastStats: () => Readonly<{ testedPlacements: number; candidatePlacements: number; testedSlots: number }>;
  stats: () => CityBatchWorldStats;
  dispose: () => void;
}>;

type RegisteredSlot = Readonly<{
  slotId: string;
  pool: BatchPool;
  nearGeometryId: number;
  farGeometryId: number;
  nearGeometry: THREE.BufferGeometry;
  material: THREE.Material;
  baseTint: THREE.Color;
  farStrategy: CityBatchFarStrategy;
}>;

type RegisteredTemplate = Readonly<{
  templateId: string;
  slots: readonly RegisteredSlot[];
  localBounds: THREE.Box3;
}>;

type PlacementInstance = Readonly<{
  slot: RegisteredSlot;
  instanceId: number;
}>;

type PlacementRecord = {
  placementId: string;
  templateId: string;
  instances: readonly PlacementInstance[];
  transform: THREE.Matrix4;
  worldBounds: THREE.Box3;
  worldSphere: THREE.Sphere;
  visible: boolean;
  renderVisible: boolean;
  lod: CityBatchLodTier;
};

type BatchPool = {
  key: string;
  mesh: THREE.BatchedMesh;
  geometryIds: WeakMap<THREE.BufferGeometry, number>;
  maxVertices: number;
  maxIndices: number;
  usedVertices: number;
  usedIndices: number;
  maxInstances: number;
  activeInstances: number;
  geometryCount: number;
  vertexStrideBytes: number;
  placementByInstanceId: Map<number, string>;
};

const INITIAL_INSTANCE_CAPACITY = 16;

function geometrySize(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute("position");
  if (!positions) throw new TypeError("city batch geometry must have a position attribute");
  return { vertices: positions.count, indices: geometry.getIndex()?.count ?? 0 };
}

function geometryVertexStrideBytes(geometry: THREE.BufferGeometry) {
  return Object.values(geometry.attributes).reduce((bytes, attribute) => {
    const array = attribute instanceof THREE.InterleavedBufferAttribute
      ? attribute.data.array
      : attribute.array;
    return bytes + attribute.itemSize * array.BYTES_PER_ELEMENT;
  }, 0);
}

function nextCapacity(current: number, required: number) {
  let capacity = Math.max(1, current);
  while (capacity < required) capacity *= 2;
  return capacity;
}

function templateLocalBounds(definition: CityBatchTemplateDefinition) {
  const bounds = new THREE.Box3().makeEmpty();
  for (const slot of definition.slots) {
    for (const geometry of [slot.nearGeometry, slot.farGeometry ?? slot.nearGeometry]) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) bounds.union(geometry.boundingBox);
    }
  }
  if (bounds.isEmpty()) throw new TypeError(`city batch template has empty bounds: ${definition.templateId}`);
  return bounds;
}

export function createCityBatchedMeshWorld(): CityBatchWorld {
  const root = new THREE.Group();
  root.name = "city-batch-world";
  const pools = new Map<string, BatchPool>();
  const poolByObject = new WeakMap<THREE.Object3D, BatchPool>();
  const templates = new Map<string, RegisteredTemplate>();
  const placements = new Map<string, PlacementRecord>();
  const visibilityStats = { placements: 0, instances: 0 };
  const lodChanges: Array<Readonly<{ placementId: string; tier: CityBatchLodTier }>> = [];
  const lodStats = { nearPlacements: 0, farPlacements: 0, changes: lodChanges as readonly Readonly<{
    placementId: string;
    tier: CityBatchLodTier;
  }>[] };
  const lodCameraPosition = new THREE.Vector3();
  const raycastStats = { testedPlacements: 0, candidatePlacements: 0, testedSlots: 0 };
  const raycastMesh = new THREE.Mesh();
  raycastMesh.matrixAutoUpdate = false;
  const raycastHits: THREE.Intersection[] = [];
  let disposed = false;

  const assertLive = () => {
    if (disposed) throw new Error("city batch world is disposed");
  };

  const getOrCreatePool = (slot: CityBatchTemplateSlot) => {
    const existing = pools.get(slot.poolKey);
    if (existing) {
      if (existing.mesh.castShadow !== slot.castShadow
        || existing.mesh.receiveShadow !== slot.receiveShadow
        || existing.mesh.renderOrder !== (slot.renderOrder ?? 0)) {
        throw new TypeError(`city batch pool render policy mismatch: ${slot.poolKey}`);
      }
      return existing;
    }
    const size = geometrySize(slot.nearGeometry);
    const mesh = new THREE.BatchedMesh(
      INITIAL_INSTANCE_CAPACITY,
      nextCapacity(1, size.vertices),
      size.indices === 0 ? 0 : nextCapacity(1, size.indices),
      slot.material,
    );
    mesh.name = `city-batch-pool-${slot.poolKey}`;
    mesh.castShadow = slot.castShadow;
    mesh.receiveShadow = slot.receiveShadow;
    mesh.renderOrder = slot.renderOrder ?? 0;
    // Placement visibility is managed by the external AABB visibility set.
    // Keeping object-level culling enabled would cache one pool bounding sphere
    // that becomes stale after incremental add/move/remove operations.
    mesh.frustumCulled = false;
    mesh.perObjectFrustumCulled = false;
    mesh.sortObjects = false;
    const pool: BatchPool = {
      key: slot.poolKey,
      mesh,
      geometryIds: new WeakMap(),
      maxVertices: nextCapacity(1, size.vertices),
      maxIndices: size.indices === 0 ? 0 : nextCapacity(1, size.indices),
      usedVertices: 0,
      usedIndices: 0,
      maxInstances: INITIAL_INSTANCE_CAPACITY,
      activeInstances: 0,
      geometryCount: 0,
      vertexStrideBytes: geometryVertexStrideBytes(slot.nearGeometry),
      placementByInstanceId: new Map(),
    };
    pools.set(slot.poolKey, pool);
    poolByObject.set(mesh, pool);
    root.add(mesh);
    return pool;
  };

  const registerGeometry = (pool: BatchPool, geometry: THREE.BufferGeometry) => {
    const existing = pool.geometryIds.get(geometry);
    if (existing !== undefined) return existing;
    const size = geometrySize(geometry);
    const requiredVertices = pool.usedVertices + size.vertices;
    const requiredIndices = pool.usedIndices + size.indices;
    if (requiredVertices > pool.maxVertices || requiredIndices > pool.maxIndices) {
      pool.maxVertices = nextCapacity(pool.maxVertices, requiredVertices);
      pool.maxIndices = size.indices === 0 ? 0 : nextCapacity(pool.maxIndices, requiredIndices);
      pool.mesh.setGeometrySize(pool.maxVertices, pool.maxIndices);
    }
    const geometryId = pool.mesh.addGeometry(geometry);
    pool.geometryIds.set(geometry, geometryId);
    pool.usedVertices = requiredVertices;
    pool.usedIndices = requiredIndices;
    pool.geometryCount += 1;
    return geometryId;
  };

  const registerTemplate = (definition: CityBatchTemplateDefinition) => {
    assertLive();
    if (!definition.templateId || templates.has(definition.templateId)) {
      throw new TypeError(`city batch template id is empty or duplicated: ${definition.templateId}`);
    }
    if (definition.slots.length === 0) throw new TypeError("city batch template must contain slots");
    const slotIds = new Set<string>();
    const slots = definition.slots.map((slot) => {
      if (!slot.slotId || slotIds.has(slot.slotId)) {
        throw new TypeError(`city batch slot id is empty or duplicated: ${slot.slotId}`);
      }
      slotIds.add(slot.slotId);
      const pool = getOrCreatePool(slot);
      const nearGeometryId = registerGeometry(pool, slot.nearGeometry);
      const farGeometryId = registerGeometry(pool, slot.farGeometry ?? slot.nearGeometry);
      return Object.freeze({
        slotId: slot.slotId,
        pool,
        nearGeometryId,
        farGeometryId,
        nearGeometry: slot.nearGeometry,
        material: slot.material,
        baseTint: slot.baseTint?.clone() ?? new THREE.Color(0xffffff),
        farStrategy: slot.farStrategy ?? (slot.farGeometry ? "proxy" : "keep-near"),
      });
    });
    templates.set(definition.templateId, Object.freeze({
      templateId: definition.templateId,
      slots: Object.freeze(slots),
      localBounds: templateLocalBounds(definition),
    }));
  };

  const ensureInstanceCapacity = (pool: BatchPool) => {
    if (pool.activeInstances < pool.maxInstances) return;
    pool.maxInstances *= 2;
    pool.mesh.setInstanceCount(pool.maxInstances);
  };

  const addPlacement = (placementId: string, templateId: string, worldFromLocal: THREE.Matrix4) => {
    assertLive();
    if (!placementId || placements.has(placementId)) {
      throw new TypeError(`city batch placement id is empty or duplicated: ${placementId}`);
    }
    const template = templates.get(templateId);
    if (!template) throw new Error(`city batch template is not registered: ${templateId}`);
    const instances = template.slots.map((slot) => {
      ensureInstanceCapacity(slot.pool);
      const instanceId = slot.pool.mesh.addInstance(slot.nearGeometryId);
      slot.pool.mesh.setMatrixAt(instanceId, worldFromLocal);
      if (slot.baseTint.getHex() !== 0xffffff) slot.pool.mesh.setColorAt(instanceId, slot.baseTint);
      slot.pool.activeInstances += 1;
      slot.pool.placementByInstanceId.set(instanceId, placementId);
      return Object.freeze({ slot, instanceId });
    });
    const worldBounds = template.localBounds.clone().applyMatrix4(worldFromLocal);
    placements.set(placementId, {
      placementId,
      templateId,
      instances: Object.freeze(instances),
      transform: worldFromLocal.clone(),
      worldBounds,
      worldSphere: worldBounds.getBoundingSphere(new THREE.Sphere()),
      visible: true,
      renderVisible: true,
      lod: "near",
    });
  };

  const requirePlacement = (placementId: string) => {
    const placement = placements.get(placementId);
    if (!placement) throw new Error(`city batch placement is missing: ${placementId}`);
    return placement;
  };

  const movePlacement = (placementId: string, worldFromLocal: THREE.Matrix4) => {
    assertLive();
    const placement = requirePlacement(placementId);
    placement.transform.copy(worldFromLocal);
    const template = templates.get(placement.templateId)!;
    placement.worldBounds.copy(template.localBounds).applyMatrix4(worldFromLocal);
    placement.worldBounds.getBoundingSphere(placement.worldSphere);
    for (const instance of placement.instances) {
      instance.slot.pool.mesh.setMatrixAt(instance.instanceId, placement.transform);
    }
  };

  const removePlacement = (placementId: string) => {
    assertLive();
    const placement = requirePlacement(placementId);
    for (const instance of placement.instances) {
      const pool = instance.slot.pool;
      pool.mesh.deleteInstance(instance.instanceId);
      pool.placementByInstanceId.delete(instance.instanceId);
      pool.activeInstances -= 1;
    }
    placements.delete(placementId);
  };

  const setPlacementVisible = (placementId: string, visible: boolean) => {
    assertLive();
    const placement = requirePlacement(placementId);
    placement.visible = visible;
    placement.renderVisible = visible;
    for (const instance of placement.instances) {
      instance.slot.pool.mesh.setVisibleAt(
        instance.instanceId,
        visible && !(placement.lod === "far" && instance.slot.farStrategy === "hidden"),
      );
    }
  };

  const setPlacementLod = (placementId: string, tier: CityBatchLodTier) => {
    assertLive();
    const placement = requirePlacement(placementId);
    placement.lod = tier;
    for (const instance of placement.instances) {
      instance.slot.pool.mesh.setGeometryIdAt(
        instance.instanceId,
        tier === "far" && instance.slot.farStrategy === "proxy"
          ? instance.slot.farGeometryId
          : instance.slot.nearGeometryId,
      );
      instance.slot.pool.mesh.setVisibleAt(
        instance.instanceId,
        placement.renderVisible && !(tier === "far" && instance.slot.farStrategy === "hidden"),
      );
    }
  };

  const updateLod = (camera: THREE.Camera, policy?: CityBatchLodPolicy) => {
    assertLive();
    camera.updateMatrixWorld();
    lodCameraPosition.setFromMatrixPosition(camera.matrixWorld);
    let nearPlacements = 0;
    let farPlacements = 0;
    lodChanges.length = 0;
    for (const placement of placements.values()) {
      const distance = Math.max(1e-6, lodCameraPosition.distanceTo(placement.worldSphere.center));
      let projectedRadius: number;
      if (camera instanceof THREE.PerspectiveCamera) {
        projectedRadius = placement.worldSphere.radius
          / (distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
      } else if (camera instanceof THREE.OrthographicCamera) {
        projectedRadius = placement.worldSphere.radius
          / Math.max(1e-6, (camera.top - camera.bottom) * 0.5 / camera.zoom);
      } else {
        projectedRadius = 1;
      }
      const maximumNearDistance = policy?.maximumNearDistanceMeters;
      const withinDetailRadius = maximumNearDistance === undefined
        || distance <= (placement.lod === "near"
          ? maximumNearDistance
          : Math.max(0, maximumNearDistance - 24));
      const next = !withinDetailRadius
        ? "far"
        : placement.lod === "near"
          ? (projectedRadius < 0.045 ? "far" : "near")
          : (projectedRadius > 0.06 ? "near" : "far");
      if (next !== placement.lod) {
        setPlacementLod(placement.placementId, next);
        lodChanges.push(Object.freeze({ placementId: placement.placementId, tier: next }));
      }
      if (next === "far") farPlacements += 1;
      else nearPlacements += 1;
    }
    lodStats.nearPlacements = nearPlacements;
    lodStats.farPlacements = farPlacements;
    return lodStats;
  };

  const setPlacementTint = (placementId: string, tint: THREE.Color | null) => {
    assertLive();
    const placement = requirePlacement(placementId);
    for (const instance of placement.instances) {
      instance.slot.pool.mesh.setColorAt(instance.instanceId, tint ?? instance.slot.baseTint);
    }
  };

  const updateVisibility = (colorFrustum: THREE.Frustum, shadowFrustum?: THREE.Frustum) => {
    assertLive();
    let visiblePlacements = 0;
    let visibleInstances = 0;
    for (const placement of placements.values()) {
      const visible = placement.visible && (
        colorFrustum.intersectsBox(placement.worldBounds)
        || shadowFrustum?.intersectsBox(placement.worldBounds) === true
      );
      if (visible !== placement.renderVisible) {
        placement.renderVisible = visible;
        for (const instance of placement.instances) {
          instance.slot.pool.mesh.setVisibleAt(
            instance.instanceId,
            visible && !(placement.lod === "far" && instance.slot.farStrategy === "hidden"),
          );
        }
      }
      if (visible) {
        visiblePlacements += 1;
        visibleInstances += placement.instances.reduce(
          (sum, instance) => sum + Number(!(placement.lod === "far" && instance.slot.farStrategy === "hidden")),
          0,
        );
      }
    }
    visibilityStats.placements = visiblePlacements;
    visibilityStats.instances = visibleInstances;
    return visibilityStats;
  };

  const resolvePick = (object: THREE.Object3D, batchId: number | undefined) => {
    assertLive();
    if (batchId === undefined) return null;
    return poolByObject.get(object)?.placementByInstanceId.get(batchId) ?? null;
  };

  const getPickObjects = () => Object.freeze([...pools.values()].map((pool) => pool.mesh));

  const raycast = (raycaster: THREE.Raycaster) => {
    assertLive();
    raycastStats.testedPlacements = 0;
    raycastStats.candidatePlacements = 0;
    raycastStats.testedSlots = 0;
    const closest = new Map<string, number>();
    for (const placement of placements.values()) {
      raycastStats.testedPlacements += 1;
      if (!placement.visible || !raycaster.ray.intersectsBox(placement.worldBounds)) continue;
      raycastStats.candidatePlacements += 1;
      for (const instance of placement.instances) {
        raycastStats.testedSlots += 1;
        raycastMesh.geometry = instance.slot.nearGeometry;
        raycastMesh.material = instance.slot.material;
        raycastMesh.matrixWorld.copy(placement.transform);
        raycastHits.length = 0;
        raycastMesh.raycast(raycaster, raycastHits);
        for (const hit of raycastHits) {
          const previous = closest.get(placement.placementId);
          if (previous === undefined || hit.distance < previous) {
            closest.set(placement.placementId, hit.distance);
          }
        }
      }
    }
    return Object.freeze([...closest]
      .map(([placementId, distance]) => Object.freeze({ placementId, distance }))
      .sort((left, right) => left.distance - right.distance || left.placementId.localeCompare(right.placementId)));
  };

  const getRaycastStats = () => Object.freeze({ ...raycastStats });

  const stats = (): CityBatchWorldStats => {
    const values = [...pools.values()];
    return Object.freeze({
      backend: "batched-mesh",
      pools: pools.size,
      templates: templates.size,
      placements: placements.size,
      instances: values.reduce((sum, pool) => sum + pool.activeInstances, 0),
      visiblePlacements: [...placements.values()].reduce(
        (sum, placement) => sum + Number(placement.renderVisible), 0,
      ),
      visibleInstances: [...placements.values()].reduce(
        (sum, placement) => sum + (placement.renderVisible ? placement.instances.reduce(
          (instanceSum, instance) => instanceSum
            + Number(!(placement.lod === "far" && instance.slot.farStrategy === "hidden")),
          0,
        ) : 0), 0,
      ),
      farPlacements: [...placements.values()].reduce(
        (sum, placement) => sum + Number(placement.lod === "far"), 0,
      ),
      instanceCapacity: values.reduce((sum, pool) => sum + pool.maxInstances, 0),
      geometries: values.reduce((sum, pool) => sum + pool.geometryCount, 0),
      vertexCapacity: values.reduce((sum, pool) => sum + pool.maxVertices, 0),
      indexCapacity: values.reduce((sum, pool) => sum + pool.maxIndices, 0),
      // Approximation of BatchedMesh-owned geometry plus per-instance matrix,
      // visibility/id and optional color storage. It intentionally excludes
      // source templates, materials, textures, shadow maps and driver overhead.
      estimatedBufferBytes: values.reduce((sum, pool) => sum
        + pool.maxVertices * pool.vertexStrideBytes
        + pool.maxIndices * Uint32Array.BYTES_PER_ELEMENT
        + pool.maxInstances * (16 * Float32Array.BYTES_PER_ELEMENT + 16), 0),
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const pool of pools.values()) {
      pool.mesh.removeFromParent();
      pool.mesh.dispose();
      pool.placementByInstanceId.clear();
    }
    pools.clear();
    templates.clear();
    placements.clear();
    root.clear();
  };

  return Object.freeze({
    root,
    backend: "batched-mesh" as const,
    registerTemplate,
    addPlacement,
    movePlacement,
    removePlacement,
    setPlacementVisible,
    setPlacementLod,
    updateLod,
    setPlacementTint,
    updateVisibility,
    resolvePick,
    getPickObjects,
    raycast,
    getRaycastStats,
    stats,
    dispose,
  });
}
