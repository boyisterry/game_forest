import * as THREE from "three";
import {
  toTemplateBuildDescriptor,
  type TemplateBuildDescriptorSnapshot,
} from "./cityCatalog.ts";
import type {
  CatalogSourceRegistry,
  OwnedCatalogSource,
} from "./cityCatalogSources.ts";
import type {
  CityVisualLayerManager,
  VisualLayerPort,
} from "./cityVisualLayerManager.ts";
import type { ResourceLease } from "./resourceLease.ts";
import { canonicalFloat64Bits, canonicalTupleKey } from "./cityCollisionTypes.ts";
import type { PackedCollisionCompileSource } from "./cityCollisionWire.ts";
import { packTemplateCollisionSource } from "./cityTemplateCollisionSource.ts";

export type VisualTemplateSourceRef =
  | Readonly<{ kind: "catalog"; catalogId: string }>
  | Readonly<{ kind: "derived"; templateId: "traffic-light" }>;

export type Matrix4Snapshot = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type VisualAttachRequest = Readonly<{
  targetLayer: VisualLayerPort;
  placements: readonly Readonly<{
    placementId: string;
    worldFromLocal: Matrix4Snapshot;
    signalPhase?: "red" | "green";
  }>[];
}>;

declare const VISUAL_TEMPLATE_HANDLE_BRAND: unique symbol;
export type VisualTemplateHandle = Readonly<{
  generation: number;
  sourceIdentity: string;
  sourceRegistryGeneration: number;
  readonly [VISUAL_TEMPLATE_HANDLE_BRAND]: true;
}>;

declare const VISUAL_ATTACHMENT_HANDLE_BRAND: unique symbol;
export type VisualAttachmentHandle = Readonly<{
  attachmentId: string;
  readonly [VISUAL_ATTACHMENT_HANDLE_BRAND]: true;
}>;

export type CityTemplateVisualMetrics = Readonly<{
  templateId: string;
  showcaseMeshCount: number;
  mapVisibleMeshCount: number;
  mapDrawCalls: number;
}>;

export class CatalogVisualSourceMissingError extends Error {
  readonly code = "CATALOG_VISUAL_SOURCE_MISSING";

  constructor(id: string) {
    super(`catalog visual source is missing: ${id}`);
    this.name = "CatalogVisualSourceMissingError";
  }
}

export type CityTemplateCache = Readonly<{
  getVisualTemplate: (source: VisualTemplateSourceRef) => ResourceLease<VisualTemplateHandle>;
  attachVisualTemplate: (
    handle: VisualTemplateHandle,
    request: VisualAttachRequest,
  ) => ResourceLease<VisualAttachmentHandle>;
  getVisualMetrics: (handle: VisualTemplateHandle) => CityTemplateVisualMetrics;
  createCollisionCompileSource: (
    source: VisualTemplateSourceRef,
    resolvedHeightScale: number,
    signal?: AbortSignal,
  ) => Promise<PackedCollisionCompileSource>;
  retire: () => Promise<void>;
  readonly retired: boolean;
}>;

type TemplateRecord = {
  handle: VisualTemplateHandle;
  canonicalSource: THREE.Group;
  descriptor: TemplateBuildDescriptorSnapshot;
  signalPhaseBindings: ReadonlyMap<string, SignalPhaseBinding>;
  metrics: CityTemplateVisualMetrics;
  borrowers: number;
  attachmentPins: number;
  disposed: boolean;
};

type SignalMaterialState = Readonly<{
  color?: readonly [number, number, number];
  emissive?: readonly [number, number, number];
  emissiveIntensity?: number;
  opacity: number;
  visible: boolean;
}>;

type SignalPhaseBinding = Readonly<{
  red: SignalMaterialState;
  green: SignalMaterialState;
}>;

type VisualMaterial = THREE.Material & Readonly<{
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
}>;

const SIGNAL_PHASE_SLOT_KEYS = "citySignalPhaseSlotKeys";

const STATIC_FALSE_HOOKS = Object.freeze([
  "setPowered",
  "setLights",
  "setWaterMotionEnabled",
  "setAlertActive",
  "setServingOpen",
  "setOpen",
  "setDoorOpen",
  "setApparatusDoorsOpen",
  "setResponseGatesOpen",
  "setVisitorGateOpen",
  "setServiceGateOpen",
]);

let nextAttachmentId = 1;

function countMeshes(root: THREE.Object3D, visibleOnly: boolean) {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (visibleOnly) {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) return;
      }
    }
    count += 1;
  });
  return count;
}

function callStaticHooks(root: THREE.Group) {
  root.traverse((object) => {
    for (const name of STATIC_FALSE_HOOKS) {
      const hook = object.userData[name];
      if (typeof hook === "function") hook(false);
    }
    const setPhase = object.userData.setPhase;
    if (typeof setPhase === "function") setPhase("red");
  });
}

function stripFunctionUserData(root: THREE.Group) {
  root.traverse((object) => {
    for (const [key, value] of Object.entries(object.userData)) {
      if (typeof value === "function") delete object.userData[key];
    }
  });
}

function materialState(material: THREE.Material, object: THREE.Object3D): SignalMaterialState {
  const visual = material as VisualMaterial;
  const color = visual.color
    ? Object.freeze(visual.color.toArray() as [number, number, number])
    : undefined;
  const emissive = visual.emissive
    ? Object.freeze(visual.emissive.toArray() as [number, number, number])
    : undefined;
  return Object.freeze({
    ...(color ? { color } : {}),
    ...(emissive ? { emissive } : {}),
    ...(typeof visual.emissiveIntensity === "number"
      ? { emissiveIntensity: visual.emissiveIntensity }
      : {}),
    opacity: material.opacity,
    visible: object.visible,
  });
}

function sameMaterialState(left: SignalMaterialState, right: SignalMaterialState) {
  const sameColor = (a?: readonly number[], b?: readonly number[]) =>
    a === undefined ? b === undefined : b !== undefined && a.every((value, index) => value === b[index]);
  return sameColor(left.color, right.color)
    && sameColor(left.emissive, right.emissive)
    && left.emissiveIntensity === right.emissiveIntensity
    && left.opacity === right.opacity
    && left.visible === right.visible;
}

function captureSignalPhaseBindings(root: THREE.Group): ReadonlyMap<string, SignalPhaseBinding> {
  const phaseHooks: Array<(phase: "red" | "green") => void> = [];
  root.traverse((object) => {
    const candidate = object.userData.setPhase;
    if (typeof candidate !== "function") return;
    phaseHooks.push(candidate as (phase: "red" | "green") => void);
  });
  if (phaseHooks.length === 0) throw new TypeError("traffic-light template is missing its canonical setPhase hook");
  if (phaseHooks.length > 1) throw new TypeError("traffic-light template contains multiple setPhase hooks");
  const setPhase = phaseHooks[0];

  const slots: Array<Readonly<{
    mesh: THREE.Mesh;
    slot: number;
    key: string;
  }>> = [];
  let meshOrdinal = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (let slot = 0; slot < materials.length; slot += 1) {
      slots.push(Object.freeze({
        mesh: object,
        slot,
        key: `signal-material-${meshOrdinal}-${slot}`,
      }));
    }
    meshOrdinal += 1;
  });

  setPhase("red");
  const red = slots.map(({ mesh, slot }) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materialState(materials[slot], mesh);
  });
  setPhase("green");
  const green = slots.map(({ mesh, slot }) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materialState(materials[slot], mesh);
  });
  setPhase("red");

  const bindings = new Map<string, SignalPhaseBinding>();
  slots.forEach(({ mesh, slot, key }, index) => {
    if (sameMaterialState(red[index], green[index])) return;
    const materialCount = Array.isArray(mesh.material) ? mesh.material.length : 1;
    const keys = Array.isArray(mesh.userData[SIGNAL_PHASE_SLOT_KEYS])
      ? [...mesh.userData[SIGNAL_PHASE_SLOT_KEYS]]
      : Array<string | null>(materialCount).fill(null);
    keys[slot] = key;
    mesh.userData[SIGNAL_PHASE_SLOT_KEYS] = keys;
    bindings.set(key, Object.freeze({ red: red[index], green: green[index] }));
  });
  if (bindings.size === 0) {
    throw new TypeError("traffic-light template has no red/green material state differences");
  }
  return bindings;
}

function applyMapLod(root: THREE.Group, descriptor: TemplateBuildDescriptorSnapshot) {
  const hiddenLayers = descriptor.mapLod.mode === "tagged-exterior"
    ? new Set(descriptor.mapLod.hideLayers)
    : new Set<string>();
  const remove: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.PointLight) {
      remove.push(object);
      return;
    }
    const mapLayer = object.userData.mapLayer as string | undefined;
    if (mapLayer && hiddenLayers.has(mapLayer)) object.visible = false;
  });
  for (const object of remove) object.removeFromParent();
}

function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.geometry) geometries.add(object.geometry);
    const source = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of source) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.clear();
}

function prepareCanonicalSource(
  owned: OwnedCatalogSource,
  descriptor: TemplateBuildDescriptorSnapshot,
): Readonly<{
  group: THREE.Group;
  signalPhaseBindings: ReadonlyMap<string, SignalPhaseBinding>;
  metrics: CityTemplateVisualMetrics;
}> {
  const group = owned.group;
  const showcaseMeshCount = countMeshes(group, false);
  callStaticHooks(group);
  const signalPhaseBindings = descriptor.templateId === "traffic-light"
    ? captureSignalPhaseBindings(group)
    : new Map<string, SignalPhaseBinding>();
  group.scale.multiplyScalar(descriptor.mapScale);
  applyMapLod(group, descriptor);
  stripFunctionUserData(group);
  group.userData.cityCanonicalTemplate = true;
  group.updateMatrixWorld(true);
  const mapVisibleMeshCount = countMeshes(group, true);
  const metrics = Object.freeze({
    templateId: descriptor.templateId,
    showcaseMeshCount,
    mapVisibleMeshCount,
    // PR6a records the unmerged baseline. A later measured merge may lower it.
    mapDrawCalls: mapVisibleMeshCount,
  });
  return Object.freeze({ group, signalPhaseBindings, metrics });
}

function assertMatrixSnapshot(matrix: readonly number[]): asserts matrix is Matrix4Snapshot {
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    throw new TypeError("visual placement matrix must contain 16 finite values");
  }
}

function applyMaterialState(material: THREE.Material, object: THREE.Object3D, state: SignalMaterialState) {
  const visual = material as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
  };
  if (state.color && visual.color) visual.color.fromArray(state.color);
  if (state.emissive && visual.emissive) visual.emissive.fromArray(state.emissive);
  if (state.emissiveIntensity !== undefined && visual.emissiveIntensity !== undefined) {
    visual.emissiveIntensity = state.emissiveIntensity;
  }
  material.opacity = state.opacity;
  object.visible = state.visible;
}

function applySignalPhase(
  root: THREE.Group,
  phase: "red" | "green",
  bindings: ReadonlyMap<string, SignalPhaseBinding>,
) {
  const ownedMaterials = new Set<THREE.Material>();
  try {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const keys = object.userData[SIGNAL_PHASE_SLOT_KEYS];
      if (!Array.isArray(keys)) return;
      const materials = Array.isArray(object.material) ? [...object.material] : [object.material];
      keys.forEach((key: unknown, slot: number) => {
        if (typeof key !== "string") return;
        const binding = bindings.get(key);
        if (!binding || !materials[slot]) throw new Error(`signal phase binding is missing: ${key}`);
        const material = materials[slot].clone();
        applyMaterialState(material, object, binding[phase]);
        materials[slot] = material;
        ownedMaterials.add(material);
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    if (ownedMaterials.size !== bindings.size) {
      throw new Error("signal phase binding did not resolve exactly once in the cloned template");
    }
    return ownedMaterials;
  } catch (error) {
    for (const material of ownedMaterials) material.dispose();
    throw error;
  }
}

export function createCityTemplateCache(options: Readonly<{
  sources: CatalogSourceRegistry;
  layers: CityVisualLayerManager;
}>): CityTemplateCache {
  const { sources, layers } = options;
  const records = new Map<string, TemplateRecord>();
  const handleRecords = new WeakMap<VisualTemplateHandle, TemplateRecord>();
  let cacheGeneration = 1;
  let retired = false;
  let retirementResolved = false;
  let resolveRetirement: (() => void) | null = null;
  const retirement = new Promise<void>((resolve) => { resolveRetirement = resolve; });

  const requireLiveRecord = (handle: VisualTemplateHandle) => {
    const record = handleRecords.get(handle);
    if (!record || record.disposed || handle.generation !== cacheGeneration) {
      throw new Error("visual template handle is stale or foreign");
    }
    return record;
  };

  const disposeRecord = (record: TemplateRecord) => {
    if (record.disposed) return;
    record.disposed = true;
    disposeObjectResources(record.canonicalSource);
  };

  const maybeFinishRetirement = () => {
    if (!retired || retirementResolved) return;
    for (const record of records.values()) {
      if (record.borrowers !== 0 || record.attachmentPins !== 0) return;
    }
    for (const record of records.values()) disposeRecord(record);
    records.clear();
    retirementResolved = true;
    resolveRetirement?.();
    resolveRetirement = null;
  };

  const borrowRecord = (record: TemplateRecord): ResourceLease<VisualTemplateHandle> => {
    record.borrowers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      record.borrowers -= 1;
      if (record.borrowers < 0) throw new Error("visual template borrower count underflow");
      maybeFinishRetirement();
    };
    return Object.freeze({ value: record.handle, release });
  };

  const getVisualTemplate = (source: VisualTemplateSourceRef): ResourceLease<VisualTemplateHandle> => {
    if (retired) throw new Error("city template cache is retired");
    const snapshotLease = sources.captureSnapshot();
    let owned: OwnedCatalogSource | undefined;
    try {
      const descriptor = source.kind === "catalog"
        ? (() => {
            const entry = snapshotLease.value.getCatalogEntry(source.catalogId);
            return entry ? toTemplateBuildDescriptor(entry) : undefined;
          })()
        : snapshotLease.value.getDerivedTemplateDescriptor(source.templateId);
      const id = source.kind === "catalog" ? source.catalogId : source.templateId;
      if (!descriptor) throw new CatalogVisualSourceMissingError(id);
      const key = `${source.kind}:${id}@${snapshotLease.value.generation}`;
      const existing = records.get(key);
      if (existing) return borrowRecord(existing);
      owned = snapshotLease.value.createOwnedSource(descriptor.source);
      if (!owned) throw new CatalogVisualSourceMissingError(id);
      const canonical = prepareCanonicalSource(owned, descriptor);
      const handle = Object.freeze({
        generation: cacheGeneration,
        sourceIdentity: owned.sourceIdentity,
        sourceRegistryGeneration: snapshotLease.value.generation,
      }) as VisualTemplateHandle;
      const record: TemplateRecord = {
        handle,
        canonicalSource: canonical.group,
        descriptor,
        signalPhaseBindings: canonical.signalPhaseBindings,
        metrics: canonical.metrics,
        borrowers: 0,
        attachmentPins: 0,
        disposed: false,
      };
      records.set(key, record);
      handleRecords.set(handle, record);
      owned = undefined;
      return borrowRecord(record);
    } catch (error) {
      if (owned) disposeObjectResources(owned.group);
      throw error;
    } finally {
      snapshotLease.release();
    }
  };

  const attachVisualTemplate = (
    handle: VisualTemplateHandle,
    request: VisualAttachRequest,
  ): ResourceLease<VisualAttachmentHandle> => {
    if (retired) throw new Error("city template cache is retired");
    const record = requireLiveRecord(handle);
    const roots: THREE.Group[] = [];
    const mappings: Array<{ object: THREE.Object3D; placementId: string }> = [];
    const ownedPhaseMaterials = new Set<THREE.Material>();
    let mounted: ResourceLease<unknown> | null = null;
    try {
      for (const placement of request.placements) {
        if (!placement.placementId) throw new TypeError("visual placement id must be non-empty");
        assertMatrixSnapshot(placement.worldFromLocal);
        if (placement.signalPhase !== undefined
          && placement.signalPhase !== "red" && placement.signalPhase !== "green") {
          throw new TypeError("signalPhase must be red or green");
        }
        if (placement.signalPhase !== undefined && record.metrics.templateId !== "traffic-light") {
          throw new TypeError("signalPhase is only valid for the traffic-light derived template");
        }
        const wrapper = new THREE.Group();
        wrapper.name = `city-template-placement-${placement.placementId}`;
        wrapper.userData.templateId = record.metrics.templateId;
        wrapper.matrix.fromArray(placement.worldFromLocal);
        wrapper.matrixAutoUpdate = false;
        const visual = record.canonicalSource.clone(true);
        visual.name = `${record.canonicalSource.name}-visual`;
        if (record.metrics.templateId === "traffic-light") {
          const phase = placement.signalPhase ?? "red";
          wrapper.userData.signalPhase = phase;
          for (const material of applySignalPhase(visual, phase, record.signalPhaseBindings)) {
            ownedPhaseMaterials.add(material);
          }
        }
        wrapper.add(visual);
        roots.push(wrapper);
        mappings.push({ object: wrapper, placementId: placement.placementId });
      }
      mounted = layers.mount(request.targetLayer, {
        objects: roots,
        objectPlacements: mappings,
        ...(ownedPhaseMaterials.size > 0 ? {
          disposeOwnedResources() {
            for (const material of ownedPhaseMaterials) material.dispose();
            ownedPhaseMaterials.clear();
          },
        } : {}),
      });
    } catch (error) {
      for (const material of ownedPhaseMaterials) material.dispose();
      ownedPhaseMaterials.clear();
      throw error;
    }
    record.attachmentPins += 1;
    const attachmentId = `city-template-attachment-${nextAttachmentId}`;
    nextAttachmentId += 1;
    const attachment = Object.freeze({ attachmentId }) as VisualAttachmentHandle;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      mounted!.release();
      record.attachmentPins -= 1;
      if (record.attachmentPins < 0) throw new Error("visual template attachment count underflow");
      maybeFinishRetirement();
    };
    return Object.freeze({ value: attachment, release });
  };

  const getVisualMetrics = (handle: VisualTemplateHandle) => requireLiveRecord(handle).metrics;

  const createCollisionCompileSource = async (
    source: VisualTemplateSourceRef,
    resolvedHeightScale: number,
    signal?: AbortSignal,
  ): Promise<PackedCollisionCompileSource> => {
    const lease = getVisualTemplate(source);
    try {
      const record = requireLiveRecord(lease.value);
      const sourceId = canonicalTupleKey([
        "city-template-collision",
        source.kind,
        source.kind === "catalog" ? source.catalogId : source.templateId,
        record.handle.sourceIdentity,
        canonicalFloat64Bits(resolvedHeightScale),
      ]);
      return await packTemplateCollisionSource(record.canonicalSource, record.descriptor, {
        sourceId,
        generation: record.handle.sourceRegistryGeneration,
        resolvedHeightScale,
        signal,
      });
    } finally {
      lease.release();
    }
  };

  const retire = () => {
    if (!retired) {
      retired = true;
      cacheGeneration += 1;
      maybeFinishRetirement();
    }
    return retirement;
  };

  return Object.freeze({
    getVisualTemplate,
    attachVisualTemplate,
    getVisualMetrics,
    createCollisionCompileSource,
    retire,
    get retired() { return retired; },
  });
}
