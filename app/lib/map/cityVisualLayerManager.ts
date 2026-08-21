import * as THREE from "three";
import type { ResourceLease } from "./resourceLease.ts";

declare const VISUAL_LAYER_PORT_BRAND: unique symbol;
export type VisualLayerPort = Readonly<{
  layerId: string;
  readonly [VISUAL_LAYER_PORT_BRAND]: true;
}>;

declare const VISUAL_LAYER_MOUNT_BRAND: unique symbol;
export type VisualLayerMountHandle = Readonly<{
  mountId: string;
  readonly [VISUAL_LAYER_MOUNT_BRAND]: true;
}>;

export type VisualPickResult = Readonly<{
  placementId: string;
  distance: number;
}>;

export type VisualLayerMountRequest = Readonly<{
  objects: readonly THREE.Object3D[];
  /** Object hits walk toward the layer root until one of these anchors matches. */
  objectPlacements?: readonly Readonly<{ object: THREE.Object3D; placementId: string }>[];
  /** InstancedMesh hits resolve their instanceId through this dense table. */
  instancePlacements?: readonly Readonly<{
    object: THREE.InstancedMesh;
    placementIds: readonly string[];
  }>[];
  /** BatchedMesh hits resolve their sparse batchId through this callback. */
  batchPlacements?: readonly Readonly<{
    object: THREE.BatchedMesh;
    resolvePlacementId: (batchId: number) => string | null;
  }>[];
  /** Replaces recursive raycasting for all mounted roots with a bounded picker. */
  broadPhaseRaycast?: (raycaster: THREE.Raycaster) => readonly VisualPickResult[];
  /** Called once after detach. Borrowed template mounts omit it. */
  disposeOwnedResources?: () => void;
}>;

export type VisualLayerPortStats = Readonly<{
  attachmentCount: number;
  objectCount: number;
}>;

export type CityVisualLayerManager = Readonly<{
  createPort: (parentOwnedLayer: THREE.Group) => ResourceLease<VisualLayerPort>;
  mount: (port: VisualLayerPort, request: VisualLayerMountRequest) => ResourceLease<VisualLayerMountHandle>;
  raycast: (port: VisualLayerPort, raycaster: THREE.Raycaster) => readonly VisualPickResult[];
  setPlacementLod: (port: VisualLayerPort, placementId: string, tier: "near" | "far") => void;
  getPortStats: (port: VisualLayerPort) => VisualLayerPortStats;
}>;

type PortRecord = {
  active: boolean;
  layer: THREE.Group;
  attachmentCount: number;
  objectPlacement: WeakMap<THREE.Object3D, string>;
  instancePlacement: WeakMap<THREE.InstancedMesh, readonly string[]>;
  batchPlacement: WeakMap<THREE.BatchedMesh, (batchId: number) => string | null>;
  broadPhaseRootRefs: Map<THREE.Object3D, number>;
  broadPhaseRaycasts: Map<string, (raycaster: THREE.Raycaster) => readonly VisualPickResult[]>;
  genericPickRootRefs: Map<THREE.Object3D, number>;
  objectPickEntries: Map<string, ReadonlyArray<Readonly<{
    object: THREE.Object3D;
    placementId: string;
    worldBounds: THREE.Box3;
  }>>>;
  placementObjects: Map<string, Map<THREE.Object3D, boolean>>;
  placementInstances: Map<string, Array<Readonly<{
    object: THREE.InstancedMesh;
    instanceId: number;
    baseMatrix: THREE.Matrix4;
  }>>>;
  instanceFarIds: WeakMap<THREE.InstancedMesh, Set<number>>;
  instanceAuthoredVisibility: WeakMap<THREE.InstancedMesh, boolean>;
  instancePickEntries: Map<string, ReadonlyArray<Readonly<{
    object: THREE.InstancedMesh;
    placementId: string;
    instanceId: number;
    worldMatrix: THREE.Matrix4;
    worldBounds: THREE.Box3;
  }>>>;
};

let nextLayerId = 1;
let nextMountId = 1;
const HIDDEN_INSTANCE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export function createCityVisualLayerManager(): CityVisualLayerManager {
  const ports = new WeakMap<VisualLayerPort, PortRecord>();
  const instanceRaycastMesh = new THREE.Mesh();
  instanceRaycastMesh.matrixAutoUpdate = false;
  const instanceRaycastHits: THREE.Intersection[] = [];

  const requirePort = (port: VisualLayerPort) => {
    const record = ports.get(port);
    if (!record || !record.active) throw new Error("visual layer port is retired or foreign");
    return record;
  };

  const createPort = (parentOwnedLayer: THREE.Group): ResourceLease<VisualLayerPort> => {
    if (!(parentOwnedLayer instanceof THREE.Group)) throw new TypeError("visual layer parent must be a THREE.Group");
    const layerId = `city-visual-layer-${nextLayerId}`;
    nextLayerId += 1;
    const layer = new THREE.Group();
    layer.name = layerId;
    layer.userData.skipGenericDispose = true;
    layer.userData.cityVisualLayerPrivate = true;
    parentOwnedLayer.add(layer);
    const port = Object.freeze({ layerId }) as VisualLayerPort;
    const record: PortRecord = {
      active: true,
      layer,
      attachmentCount: 0,
      objectPlacement: new WeakMap(),
      instancePlacement: new WeakMap(),
      batchPlacement: new WeakMap(),
      broadPhaseRootRefs: new Map(),
      broadPhaseRaycasts: new Map(),
      genericPickRootRefs: new Map(),
      objectPickEntries: new Map(),
      placementObjects: new Map(),
      placementInstances: new Map(),
      instanceFarIds: new WeakMap(),
      instanceAuthoredVisibility: new WeakMap(),
      instancePickEntries: new Map(),
    };
    ports.set(port, record);
    let released = false;
    const release = () => {
      if (released) return;
      if (record.attachmentCount !== 0) {
        throw new Error("visual layer port still has live attachments");
      }
      released = true;
      record.active = false;
      layer.removeFromParent();
      layer.clear();
    };
    return Object.freeze({ value: port, release });
  };

  const mount = (
    port: VisualLayerPort,
    request: VisualLayerMountRequest,
  ): ResourceLease<VisualLayerMountHandle> => {
    const record = requirePort(port);
    const objects = [...request.objects];
    if (new Set(objects).size !== objects.length) throw new TypeError("visual mount contains duplicate roots");
    const objectPlacements = [...(request.objectPlacements ?? [])];
    const instancePlacements = [...(request.instancePlacements ?? [])];
    const batchPlacements = [...(request.batchPlacements ?? [])];
    const mountId = `city-visual-mount-${nextMountId}`;
    nextMountId += 1;
    for (const mapping of objectPlacements) {
      if (!mapping.placementId) throw new TypeError("visual object mapping has an empty placement id");
    }
    for (const mapping of instancePlacements) {
      if (mapping.placementIds.length !== mapping.object.count) {
        throw new TypeError("visual instance mapping length does not match InstancedMesh.count");
      }
    }
    for (const mapping of batchPlacements) {
      if (!(mapping.object instanceof THREE.BatchedMesh)) {
        throw new TypeError("visual batch mapping object must be a BatchedMesh");
      }
    }

    for (const object of objects) record.layer.add(object);
    record.layer.updateMatrixWorld(true);
    for (const mapping of objectPlacements) record.objectPlacement.set(mapping.object, mapping.placementId);
    for (const mapping of objectPlacements) {
      const objectsForPlacement = record.placementObjects.get(mapping.placementId) ?? new Map();
      objectsForPlacement.set(mapping.object, mapping.object.visible);
      record.placementObjects.set(mapping.placementId, objectsForPlacement);
    }
    for (const mapping of instancePlacements) record.instancePlacement.set(mapping.object, Object.freeze([...mapping.placementIds]));
    for (const mapping of instancePlacements) {
      if (!mapping.object.geometry.boundingBox) mapping.object.geometry.computeBoundingBox();
      const pickEntries: Array<Readonly<{
        object: THREE.InstancedMesh;
        placementId: string;
        instanceId: number;
        worldMatrix: THREE.Matrix4;
        worldBounds: THREE.Box3;
      }>> = [];
      record.instanceFarIds.set(mapping.object, new Set());
      record.instanceAuthoredVisibility.set(mapping.object, mapping.object.visible);
      for (let instanceId = 0; instanceId < mapping.placementIds.length; instanceId += 1) {
        const placementId = mapping.placementIds[instanceId];
        const instances = record.placementInstances.get(placementId) ?? [];
        const baseMatrix = new THREE.Matrix4();
        mapping.object.getMatrixAt(instanceId, baseMatrix);
        const worldMatrix = new THREE.Matrix4().multiplyMatrices(mapping.object.matrixWorld, baseMatrix);
        instances.push(Object.freeze({
          object: mapping.object,
          instanceId,
          baseMatrix,
        }));
        record.placementInstances.set(placementId, instances);
        pickEntries.push(Object.freeze({
          object: mapping.object,
          placementId,
          instanceId,
          worldMatrix,
          worldBounds: mapping.object.geometry.boundingBox!.clone().applyMatrix4(worldMatrix),
        }));
      }
      record.instancePickEntries.set(`${mountId}:${mapping.object.uuid}`, Object.freeze(pickEntries));
    }
    for (const mapping of batchPlacements) record.batchPlacement.set(mapping.object, mapping.resolvePlacementId);
    if (request.broadPhaseRaycast) {
      record.broadPhaseRaycasts.set(mountId, request.broadPhaseRaycast);
      for (const object of objects) {
        record.broadPhaseRootRefs.set(object, (record.broadPhaseRootRefs.get(object) ?? 0) + 1);
      }
    } else if (batchPlacements.length > 0) {
      for (const object of objects) {
        record.genericPickRootRefs.set(object, (record.genericPickRootRefs.get(object) ?? 0) + 1);
      }
    }
    if (objectPlacements.length > 0) {
      record.objectPickEntries.set(mountId, Object.freeze(objectPlacements.map((mapping) => Object.freeze({
        object: mapping.object,
        placementId: mapping.placementId,
        worldBounds: new THREE.Box3().setFromObject(mapping.object),
      }))));
    }
    record.attachmentCount += 1;

    const handle = Object.freeze({ mountId }) as VisualLayerMountHandle;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const mapping of objectPlacements) record.objectPlacement.delete(mapping.object);
      for (const mapping of objectPlacements) {
        const objectsForPlacement = record.placementObjects.get(mapping.placementId);
        objectsForPlacement?.delete(mapping.object);
        if (objectsForPlacement?.size === 0) record.placementObjects.delete(mapping.placementId);
      }
      for (const mapping of instancePlacements) record.instancePlacement.delete(mapping.object);
      for (const mapping of instancePlacements) {
        record.instancePickEntries.delete(`${mountId}:${mapping.object.uuid}`);
        mapping.placementIds.forEach((placementId, instanceId) => {
          const instances = record.placementInstances.get(placementId);
          if (!instances) return;
          const retained = instances.filter((entry) => entry.object !== mapping.object || entry.instanceId !== instanceId);
          if (retained.length === 0) record.placementInstances.delete(placementId);
          else record.placementInstances.set(placementId, retained);
        });
      }
      for (const mapping of batchPlacements) record.batchPlacement.delete(mapping.object);
      record.objectPickEntries.delete(mountId);
      if (request.broadPhaseRaycast) {
        record.broadPhaseRaycasts.delete(mountId);
        for (const object of objects) {
          const remaining = (record.broadPhaseRootRefs.get(object) ?? 1) - 1;
          if (remaining <= 0) record.broadPhaseRootRefs.delete(object);
          else record.broadPhaseRootRefs.set(object, remaining);
        }
      } else if (batchPlacements.length > 0) {
        for (const object of objects) {
          const remaining = (record.genericPickRootRefs.get(object) ?? 1) - 1;
          if (remaining <= 0) record.genericPickRootRefs.delete(object);
          else record.genericPickRootRefs.set(object, remaining);
        }
      }
      for (const object of objects) object.removeFromParent();
      record.attachmentCount -= 1;
      try {
        request.disposeOwnedResources?.();
      } finally {
        if (record.attachmentCount < 0) throw new Error("visual attachment count underflow");
      }
    };
    return Object.freeze({ value: handle, release });
  };

  const raycast = (port: VisualLayerPort, raycaster: THREE.Raycaster): readonly VisualPickResult[] => {
    const record = requirePort(port);
    record.layer.updateMatrixWorld(true);
    const closest = new Map<string, number>();
    const recordHit = (placementId: string, distance: number) => {
      const previous = closest.get(placementId);
      if (previous === undefined || distance < previous) closest.set(placementId, distance);
    };
    for (const pick of record.broadPhaseRaycasts.values()) {
      for (const hit of pick(raycaster)) recordHit(hit.placementId, hit.distance);
    }
    for (const entries of record.objectPickEntries.values()) {
      for (const entry of entries) {
        if (!entry.object.visible || !raycaster.ray.intersectsBox(entry.worldBounds)) continue;
        for (const hit of raycaster.intersectObject(entry.object, true)) {
          recordHit(entry.placementId, hit.distance);
        }
      }
    }
    for (const entries of record.instancePickEntries.values()) {
      if (entries.length === 0 || !entries[0].object.visible) continue;
      for (const entry of entries) {
        if (record.instanceFarIds.get(entry.object)?.has(entry.instanceId)
          || !raycaster.ray.intersectsBox(entry.worldBounds)) continue;
        instanceRaycastMesh.geometry = entry.object.geometry;
        instanceRaycastMesh.material = entry.object.material;
        instanceRaycastMesh.matrixWorld.copy(entry.worldMatrix);
        instanceRaycastHits.length = 0;
        instanceRaycastMesh.raycast(raycaster, instanceRaycastHits);
        for (const hit of instanceRaycastHits) recordHit(entry.placementId, hit.distance);
      }
    }
    const genericRoots = record.layer.children.filter((object) => record.genericPickRootRefs.has(object));
    for (const hit of raycaster.intersectObjects(genericRoots, true)) {
      let placementId: string | undefined;
      if (hit.instanceId !== undefined && hit.object instanceof THREE.InstancedMesh) {
        placementId = record.instancePlacement.get(hit.object)?.[hit.instanceId];
      }
      if (!placementId && hit.batchId !== undefined && hit.object instanceof THREE.BatchedMesh) {
        placementId = record.batchPlacement.get(hit.object)?.(hit.batchId) ?? undefined;
      }
      if (!placementId) {
        for (let node: THREE.Object3D | null = hit.object; node && node !== record.layer; node = node.parent) {
          placementId = record.objectPlacement.get(node);
          if (placementId) break;
        }
      }
      if (!placementId) continue;
      recordHit(placementId, hit.distance);
    }
    return Object.freeze([...closest]
      .map(([placementId, distance]) => Object.freeze({ placementId, distance }))
      .sort((left, right) => left.distance - right.distance || left.placementId.localeCompare(right.placementId)));
  };

  const getPortStats = (port: VisualLayerPort): VisualLayerPortStats => {
    const record = requirePort(port);
    return Object.freeze({ attachmentCount: record.attachmentCount, objectCount: record.layer.children.length });
  };

  const setPlacementLod = (port: VisualLayerPort, placementId: string, tier: "near" | "far") => {
    const record = requirePort(port);
    for (const [object, authoredVisible] of record.placementObjects.get(placementId) ?? []) {
      object.visible = tier === "near" && authoredVisible;
    }
    for (const instance of record.placementInstances.get(placementId) ?? []) {
      const farIds = record.instanceFarIds.get(instance.object)!;
      if (tier === "far") farIds.add(instance.instanceId);
      else farIds.delete(instance.instanceId);
      instance.object.visible = (record.instanceAuthoredVisibility.get(instance.object) ?? true)
        && farIds.size < instance.object.count;
      instance.object.setMatrixAt(
        instance.instanceId,
        tier === "far" ? HIDDEN_INSTANCE_MATRIX : instance.baseMatrix,
      );
      instance.object.instanceMatrix.needsUpdate = true;
    }
  };

  return Object.freeze({ createPort, mount, raycast, setPlacementLod, getPortStats });
}
