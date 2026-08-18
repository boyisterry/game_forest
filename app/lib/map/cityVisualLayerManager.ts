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
  getPortStats: (port: VisualLayerPort) => VisualLayerPortStats;
}>;

type PortRecord = {
  active: boolean;
  layer: THREE.Group;
  attachmentCount: number;
  objectPlacement: WeakMap<THREE.Object3D, string>;
  instancePlacement: WeakMap<THREE.InstancedMesh, readonly string[]>;
};

let nextLayerId = 1;
let nextMountId = 1;

export function createCityVisualLayerManager(): CityVisualLayerManager {
  const ports = new WeakMap<VisualLayerPort, PortRecord>();

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
    for (const mapping of objectPlacements) {
      if (!mapping.placementId) throw new TypeError("visual object mapping has an empty placement id");
    }
    for (const mapping of instancePlacements) {
      if (mapping.placementIds.length !== mapping.object.count) {
        throw new TypeError("visual instance mapping length does not match InstancedMesh.count");
      }
    }

    for (const object of objects) record.layer.add(object);
    for (const mapping of objectPlacements) record.objectPlacement.set(mapping.object, mapping.placementId);
    for (const mapping of instancePlacements) record.instancePlacement.set(mapping.object, Object.freeze([...mapping.placementIds]));
    record.attachmentCount += 1;
    record.layer.updateMatrixWorld(true);

    const mountId = `city-visual-mount-${nextMountId}`;
    nextMountId += 1;
    const handle = Object.freeze({ mountId }) as VisualLayerMountHandle;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const mapping of objectPlacements) record.objectPlacement.delete(mapping.object);
      for (const mapping of instancePlacements) record.instancePlacement.delete(mapping.object);
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
    for (const hit of raycaster.intersectObjects(record.layer.children, true)) {
      let placementId: string | undefined;
      if (hit.instanceId !== undefined && hit.object instanceof THREE.InstancedMesh) {
        placementId = record.instancePlacement.get(hit.object)?.[hit.instanceId];
      }
      if (!placementId) {
        for (let node: THREE.Object3D | null = hit.object; node && node !== record.layer; node = node.parent) {
          placementId = record.objectPlacement.get(node);
          if (placementId) break;
        }
      }
      if (!placementId) continue;
      const previous = closest.get(placementId);
      if (previous === undefined || hit.distance < previous) closest.set(placementId, hit.distance);
    }
    return Object.freeze([...closest]
      .map(([placementId, distance]) => Object.freeze({ placementId, distance }))
      .sort((left, right) => left.distance - right.distance || left.placementId.localeCompare(right.placementId)));
  };

  const getPortStats = (port: VisualLayerPort): VisualLayerPortStats => {
    const record = requirePort(port);
    return Object.freeze({ attachmentCount: record.attachmentCount, objectCount: record.layer.children.length });
  };

  return Object.freeze({ createPort, mount, raycast, getPortStats });
}
