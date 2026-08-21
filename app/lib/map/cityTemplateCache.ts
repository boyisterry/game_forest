import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  toTemplateBuildDescriptor,
  type TemplateBuildDescriptorSnapshot,
} from "./cityCatalog.ts";
import type {
  CatalogSourceRegistry,
  OwnedCatalogSource,
} from "./cityCatalogSources.ts";
import {
  disposeMaterialsAndTextures,
  disposeSceneResources,
  type ResourceCacheLease,
} from "./cityResourceCache.ts";
import type {
  CityVisualLayerManager,
  VisualLayerPort,
} from "./cityVisualLayerManager.ts";
import type { ResourceLease } from "./resourceLease.ts";
import { canonicalTupleKey } from "./cityCollisionTypes.ts";
import {
  cityMaterialBatchKey,
  encodeCityMaterialBatchKey,
} from "./cityMaterialBatchKey.ts";
import type { PackedCollisionCompileSource } from "./cityCollisionWire.ts";
import {
  packTemplateCollisionSource,
  packTemplateSurfaceCollisionSources,
} from "./cityTemplateCollisionSource.ts";
import type { CityBatchTemplateDefinition } from "./cityBatchWorld.ts";

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
  batchSelection?: "all" | "special-only" | "signal-special-only";
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

export type CityTemplateBatchKeyMetrics = Readonly<{
  batchCount: number;
  materialKeys: readonly string[];
  compatibilityKeys: readonly string[];
  tintMaterialFamilyKeys: readonly string[];
  tintCompatibilityKeys: readonly string[];
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
  getVisualBatchKeyMetrics: (handle: VisualTemplateHandle) => CityTemplateBatchKeyMetrics;
  getBatchTemplateDefinition: (handle: VisualTemplateHandle) => CityBatchTemplateDefinition | null;
  getSignalBatchTemplateDefinition: (
    handle: VisualTemplateHandle,
    phase: "red" | "green",
  ) => CityBatchTemplateDefinition | null;
  createCollisionCompileSource: (
    source: VisualTemplateSourceRef,
    signal?: AbortSignal,
  ) => Promise<PackedCollisionCompileSource>;
  createSurfaceCollisionCompileSources: (
    source: VisualTemplateSourceRef,
    signal?: AbortSignal,
  ) => Promise<readonly PackedCollisionCompileSource[]>;
  releaseCanonicalSourceTree: (source: VisualTemplateSourceRef) => boolean;
  getCanonicalSourceLifecycle: (handle: VisualTemplateHandle) => Readonly<{
    sourceTreeReleased: boolean;
    sourceTreeChildCount: number;
    packedCollisionReady: boolean;
    packedSurfaceCollisionReady: boolean;
  }>;
  retire: () => Promise<void>;
  readonly retired: boolean;
}>;

type TemplateRecord = {
  handle: VisualTemplateHandle;
  canonicalSource: THREE.Group;
  canonicalMaterials: readonly THREE.Material[];
  descriptor: TemplateBuildDescriptorSnapshot;
  signalPhaseBindings: ReadonlyMap<string, SignalPhaseBinding>;
  visualBatches: readonly VisualBatch[] | null;
  signalVisualBatches: Readonly<Record<"red" | "green", readonly VisualBatch[]>> | null;
  ownedVisualMaterials: readonly THREE.Material[];
  resourceCacheLease: ResourceCacheLease;
  resourceCacheLeaseReleased: boolean;
  packedCollisionPromise?: Promise<PackedCollisionCompileSource>;
  packedSurfaceCollisionPromise?: Promise<readonly PackedCollisionCompileSource[]>;
  packedCollisionReady: boolean;
  packedSurfaceCollisionReady: boolean;
  canonicalSourceReleased: boolean;
  metrics: CityTemplateVisualMetrics;
  batchKeyMetrics: CityTemplateBatchKeyMetrics;
  batchTemplateDefinition?: CityBatchTemplateDefinition | null;
  ownedFarGeometries: THREE.BufferGeometry[];
  borrowers: number;
  attachmentPins: number;
  collisionPackingPins: number;
  disposed: boolean;
};

type VisualBatch = Readonly<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material | readonly THREE.Material[];
  baseTint?: THREE.Color;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  drawCalls: number;
  signalPhaseRole?: string;
}>;

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
export const CITY_VISUAL_INSTANCE_CELL_SIZE_METERS = 512;

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

export function applyCityTemplateMapLod(root: THREE.Group, descriptor: TemplateBuildDescriptorSnapshot) {
  const nonCollidingOverhangNames = new Set(descriptor.nonCollidingOverhangNames ?? []);
  const hiddenLayers = descriptor.mapLod.mode === "tagged-exterior"
    ? new Set(descriptor.mapLod.hideLayers)
    : new Set<string>();
  const remove: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.PointLight) {
      remove.push(object);
      return;
    }
    if (nonCollidingOverhangNames.has(object.name)) {
      object.userData.mapCollisionRole = "ignore";
    }
    const mapLayer = object.userData.mapLayer as string | undefined;
    if (mapLayer && hiddenLayers.has(mapLayer)) object.visible = false;
  });
  for (const object of remove) object.removeFromParent();
}

function isEffectivelyVisible(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

function geometryLayoutKey(geometry: THREE.BufferGeometry) {
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => {
      const array = attribute.array as ArrayLike<number> & { constructor: { name: string } };
      return `${name}:${attribute.itemSize}:${Number(attribute.normalized)}:${array.constructor.name}`;
    })
    .sort()
    .join(",");
  return `${geometry.index ? "indexed" : "plain"}|${attributes}`;
}

function materialBatchKey(material: THREE.Material, includeDiffuseColor = true) {
  return cityMaterialBatchKey(material, { includeDiffuseColor });
}

export function createCityMapRuntimeMaterialDerivative(
  material: THREE.Material,
): THREE.Material | null {
  if (!(material instanceof THREE.MeshPhysicalMaterial) || material.transmission <= 0) {
    return null;
  }
  const runtime = material.clone();
  const originalTransmission = runtime.transmission;
  runtime.name = material.name
    ? `${material.name}-city-map-alpha`
    : "city-map-alpha-material";
  runtime.transmission = 0;
  runtime.userData = {
    ...runtime.userData,
    cityMapTransmissionDowngrade: true,
    cityMapOriginalTransmission: originalTransmission,
  };
  runtime.needsUpdate = true;
  return runtime;
}

function createCityMapRuntimeVisualBatches(
  batches: readonly VisualBatch[],
  derivatives: Map<THREE.Material, THREE.Material>,
  ownedMaterials: Set<THREE.Material>,
): readonly VisualBatch[] {
  const resolveMaterial = (material: THREE.Material) => {
    const existing = derivatives.get(material);
    if (existing) return existing;
    const derivative = createCityMapRuntimeMaterialDerivative(material);
    if (!derivative) return material;
    derivatives.set(material, derivative);
    ownedMaterials.add(derivative);
    return derivative;
  };
  return Object.freeze(batches.map((batch) => Object.freeze({
    ...batch,
    material: batch.material instanceof THREE.Material
      ? resolveMaterial(batch.material)
      : Object.freeze(batch.material.map(resolveMaterial)),
  })));
}

function visualBatchCompatibilityKey(batch: VisualBatch) {
  const materials = batch.material instanceof THREE.Material ? [batch.material] : batch.material;
  return [
    materials.map((material) => materialBatchKey(material)).join("||material-slot||"),
    geometryLayoutKey(batch.geometry),
    Number(batch.castShadow),
    Number(batch.receiveShadow),
    batch.renderOrder,
    batch.signalPhaseRole ?? "",
  ].join("||batch-field||");
}

function isCityBatchEligible(batch: VisualBatch, allowSignalPhaseRole = false) {
  if (!(batch.material instanceof THREE.Material)) return false;
  return !batch.material.transparent
    && batch.material.opacity >= 1
    && (allowSignalPhaseRole || batch.signalPhaseRole === undefined);
}

function createCityMapTintVisualBatches(
  batches: readonly VisualBatch[],
  familyMaterials: Map<string, THREE.Material>,
  ownedMaterials: Set<THREE.Material>,
): readonly VisualBatch[] {
  const nearestTier = (value: number, tiers: readonly number[]) => tiers.reduce(
    (nearest, tier) => Math.abs(tier - value) < Math.abs(nearest - value) ? tier : nearest,
  );
  const roughnessTiers = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] as const;
  const metalnessTiers = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
  return Object.freeze(batches.map((batch) => {
    if (!isCityBatchEligible(batch, true) || !(batch.material instanceof THREE.Material)) {
      return batch;
    }
    const visual = batch.material as THREE.Material & {
      color?: THREE.Color;
      roughness?: number;
      metalness?: number;
    };
    if (!(visual.color instanceof THREE.Color)) return batch;
    const candidate = batch.material.clone() as THREE.Material & {
      color: THREE.Color;
      roughness?: number;
      metalness?: number;
    };
    candidate.color.set(0xffffff);
    if (typeof candidate.roughness === "number") {
      candidate.roughness = nearestTier(candidate.roughness, roughnessTiers);
    }
    if (typeof candidate.metalness === "number") {
      candidate.metalness = nearestTier(candidate.metalness, metalnessTiers);
    }
    const familyKey = encodeCityMaterialBatchKey(candidate, { includeDiffuseColor: false });
    const requiresDerivative = visual.color.getHex() !== 0xffffff
      || ("roughness" in visual && visual.roughness !== candidate.roughness)
      || ("metalness" in visual && visual.metalness !== candidate.metalness);
    if (!familyKey) {
      candidate.dispose();
      return batch;
    }
    let familyMaterial = familyMaterials.get(familyKey);
    if (!familyMaterial) {
      if (!requiresDerivative) {
        familyMaterial = batch.material;
        candidate.dispose();
      } else {
        candidate.name = batch.material.name
          ? `${batch.material.name}-city-map-tint-base`
          : "city-map-tint-base-material";
        candidate.userData = {
          ...candidate.userData,
          cityMapInstanceTintBase: true,
        };
        candidate.needsUpdate = true;
        familyMaterial = candidate;
        ownedMaterials.add(candidate);
      }
      familyMaterials.set(familyKey, familyMaterial);
    } else {
      candidate.dispose();
    }
    return Object.freeze({
      ...batch,
      material: familyMaterial,
      baseTint: visual.color.clone(),
    });
  }));
}

function farMassingGeometry(
  bounds: THREE.Box3,
  prototype: THREE.BufferGeometry,
): THREE.BufferGeometry | null {
  const supported = new Set(["position", "normal", "uv", "uv1", "uv2", "color", "tangent"]);
  const names = Object.keys(prototype.attributes);
  if (!names.includes("position") || names.some((name) => !supported.has(name))) return null;
  if (Object.values(prototype.attributes).some((attribute) => (
    attribute instanceof THREE.InterleavedBufferAttribute
    || !(attribute.array instanceof Float32Array)
  ))) return null;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  let geometry: THREE.BufferGeometry = new THREE.BoxGeometry(
    Math.max(size.x, 0.05),
    Math.max(size.y, 0.05),
    Math.max(size.z, 0.05),
  ).translate(center.x, center.y, center.z);
  if (!prototype.getIndex()) {
    const nonIndexed = geometry.toNonIndexed();
    geometry.dispose();
    geometry = nonIndexed;
  }
  for (const existing of Object.keys(geometry.attributes)) {
    if (!names.includes(existing)) geometry.deleteAttribute(existing);
  }
  const vertexCount = geometry.getAttribute("position").count;
  for (const name of names) {
    if (geometry.getAttribute(name)) continue;
    const source = prototype.getAttribute(name);
    const values = new Float32Array(vertexCount * source.itemSize);
    if (name === "color") values.fill(1);
    if (name === "tangent") {
      for (let offset = 0; offset < values.length; offset += source.itemSize) {
        values[offset] = 1;
        if (source.itemSize > 3) values[offset + 3] = 1;
      }
    }
    const attribute = new THREE.BufferAttribute(values, source.itemSize, source.normalized);
    attribute.gpuType = source.gpuType;
    geometry.setAttribute(name, attribute);
  }
  if (geometryLayoutKey(geometry) !== geometryLayoutKey(prototype)) {
    geometry.dispose();
    return null;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildCatalogBatchTemplateDefinition(record: TemplateRecord): CityBatchTemplateDefinition | null {
  const batches = record.visualBatches;
  if (!batches) return null;
  const eligible = batches
    .map((batch, index) => ({ batch, index }))
    .filter(({ batch }) => isCityBatchEligible(batch) && batch.material instanceof THREE.Material);
  if (eligible.length === 0) return null;
  const bounds = new THREE.Box3().makeEmpty();
  for (const { batch } of eligible) {
    if (!batch.geometry.boundingBox) batch.geometry.computeBoundingBox();
    if (batch.geometry.boundingBox) bounds.union(batch.geometry.boundingBox);
  }
  const hosts = eligible
    .map((entry) => {
      const box = entry.batch.geometry.boundingBox!;
      const size = box.getSize(new THREE.Vector3());
      return { ...entry, volume: size.x * size.y * size.z };
    })
    .sort((left, right) => Number(right.batch.castShadow) - Number(left.batch.castShadow)
      || right.volume - left.volume
      || left.index - right.index);
  let hostIndex = -1;
  let proxy: THREE.BufferGeometry | null = null;
  for (const host of hosts) {
    proxy = farMassingGeometry(bounds, host.batch.geometry);
    if (proxy) {
      hostIndex = host.index;
      break;
    }
  }
  if (hostIndex < 0 || !proxy) return null;
  record.ownedFarGeometries.push(proxy);
  const slots = eligible.map(({ batch, index }) => Object.freeze({
    slotId: `visual-batch-${index}`,
    poolKey: visualBatchCompatibilityKey(batch),
    material: batch.material as THREE.Material,
    nearGeometry: batch.geometry,
    ...(index === hostIndex ? { farGeometry: proxy!, farStrategy: "proxy" as const } : { farStrategy: "hidden" as const }),
    castShadow: batch.castShadow,
    receiveShadow: batch.receiveShadow,
    renderOrder: batch.renderOrder,
    ...(batch.baseTint ? { baseTint: batch.baseTint } : {}),
  }));
  return Object.freeze({ templateId: record.metrics.templateId, slots: Object.freeze(slots) });
}

function visualBatchKeyMetrics(batches: readonly VisualBatch[]): CityTemplateBatchKeyMetrics {
  const materialKeys = new Set<string>();
  const compatibilityKeys = new Set<string>();
  const tintMaterialFamilyKeys = new Set<string>();
  const tintCompatibilityKeys = new Set<string>();
  for (const batch of batches) {
    const materials = batch.material instanceof THREE.Material ? [batch.material] : batch.material;
    const materialKey = materials.map((material) => materialBatchKey(material)).join("||material-slot||");
    const tintMaterialFamilyKey = materials
      .map((material) => materialBatchKey(material, false))
      .join("||material-slot||");
    materialKeys.add(materialKey);
    tintMaterialFamilyKeys.add(tintMaterialFamilyKey);
    compatibilityKeys.add(visualBatchCompatibilityKey(batch));
    tintCompatibilityKeys.add([
      tintMaterialFamilyKey,
      geometryLayoutKey(batch.geometry),
      Number(batch.castShadow),
      Number(batch.receiveShadow),
      batch.renderOrder,
      batch.signalPhaseRole ?? "",
    ].join("||batch-field||"));
  }
  return Object.freeze({
    batchCount: batches.length,
    materialKeys: Object.freeze([...materialKeys].sort()),
    compatibilityKeys: Object.freeze([...compatibilityKeys].sort()),
    tintMaterialFamilyKeys: Object.freeze([...tintMaterialFamilyKeys].sort()),
    tintCompatibilityKeys: Object.freeze([...tintCompatibilityKeys].sort()),
  });
}

function createVisualBatches(root: THREE.Group): readonly VisualBatch[] {
  root.updateMatrixWorld(true);
  type PendingBatch = {
    material: THREE.Material;
    geometries: THREE.BufferGeometry[];
    castShadow: boolean;
    receiveShadow: boolean;
    renderOrder: number;
    signalPhaseRole?: string;
  };
  const pending = new Map<string, PendingBatch>();
  const completed: VisualBatch[] = [];
  const addGeometry = (
    source: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    material: THREE.Material,
    mesh: THREE.Mesh,
  ) => {
    const geometry = source.clone();
    geometry.applyMatrix4(matrix);
    const key = [
      materialBatchKey(material),
      geometryLayoutKey(geometry),
      Number(mesh.castShadow),
      Number(mesh.receiveShadow),
      mesh.renderOrder,
      mesh.userData.signalPhaseRole ?? "",
    ].join("|");
    const batch = pending.get(key) ?? {
      material,
      geometries: [],
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      renderOrder: mesh.renderOrder,
      ...(typeof mesh.userData.signalPhaseRole === "string"
        ? { signalPhaseRole: mesh.userData.signalPhaseRole }
        : {}),
    };
    batch.geometries.push(geometry);
    pending.set(key, batch);
  };

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (Array.isArray(object.material)) {
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      completed.push(Object.freeze({
        geometry,
        material: Object.freeze([...materials]),
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        renderOrder: object.renderOrder,
        drawCalls: Math.max(1, object.geometry.groups.length),
        ...(typeof object.userData.signalPhaseRole === "string"
          ? { signalPhaseRole: object.userData.signalPhaseRole }
          : {}),
      }));
      return;
    }
    if (object instanceof THREE.InstancedMesh) {
      const instanceMatrix = new THREE.Matrix4();
      const combined = new THREE.Matrix4();
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        combined.multiplyMatrices(object.matrixWorld, instanceMatrix);
        addGeometry(object.geometry, combined, materials[0], object);
      }
      return;
    }
    addGeometry(object.geometry, object.matrixWorld, materials[0], object);
  });

  for (const batch of pending.values()) {
    const merged = batch.geometries.length === 1
      ? batch.geometries[0]
      : mergeGeometries(batch.geometries, false);
    if (!merged) {
      for (const geometry of batch.geometries) {
        completed.push(Object.freeze({
          geometry,
          material: batch.material,
          castShadow: batch.castShadow,
          receiveShadow: batch.receiveShadow,
          renderOrder: batch.renderOrder,
          drawCalls: 1,
          ...(batch.signalPhaseRole ? { signalPhaseRole: batch.signalPhaseRole } : {}),
        }));
      }
      continue;
    }
    if (merged !== batch.geometries[0] || batch.geometries.length > 1) {
      for (const geometry of batch.geometries) geometry.dispose();
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    completed.push(Object.freeze({
      geometry: merged,
      material: batch.material,
      castShadow: batch.castShadow,
      receiveShadow: batch.receiveShadow,
      renderOrder: batch.renderOrder,
      drawCalls: 1,
      ...(batch.signalPhaseRole ? { signalPhaseRole: batch.signalPhaseRole } : {}),
    }));
  }
  return Object.freeze(completed);
}

function disposeObjectResources(root: THREE.Object3D) {
  disposeSceneResources(root);
  root.clear();
}

function collectSceneMaterials(root: THREE.Object3D): readonly THREE.Material[] {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material);
    }
  });
  return Object.freeze([...materials]);
}

function prepareCanonicalSource(
  owned: OwnedCatalogSource,
  descriptor: TemplateBuildDescriptorSnapshot,
): Readonly<{
  group: THREE.Group;
  signalPhaseBindings: ReadonlyMap<string, SignalPhaseBinding>;
  visualBatches: readonly VisualBatch[] | null;
  signalVisualBatches: Readonly<Record<"red" | "green", readonly VisualBatch[]>> | null;
  ownedVisualMaterials: readonly THREE.Material[];
  metrics: CityTemplateVisualMetrics;
  batchKeyMetrics: CityTemplateBatchKeyMetrics;
}> {
  const group = owned.group;
  const showcaseMeshCount = countMeshes(group, false);
  callStaticHooks(group);
  const signalPhaseBindings = descriptor.templateId === "traffic-light"
    ? captureSignalPhaseBindings(group)
    : new Map<string, SignalPhaseBinding>();
  group.scale.multiplyScalar(descriptor.mapScale);
  applyCityTemplateMapLod(group, descriptor);
  stripFunctionUserData(group);
  group.userData.cityCanonicalTemplate = true;
  group.updateMatrixWorld(true);
  const mapVisibleMeshCount = countMeshes(group, true);
  const ownedVisualMaterials = new Set<THREE.Material>();
  const mapRuntimeMaterialDerivatives = new Map<THREE.Material, THREE.Material>();
  const mapTintFamilyMaterials = new Map<string, THREE.Material>();
  let signalVisualBatches: Readonly<Record<"red" | "green", readonly VisualBatch[]>> | null = null;
  const visualBatches = descriptor.templateId === "traffic-light"
    ? null
    : createCityMapTintVisualBatches(
        createCityMapRuntimeVisualBatches(
          createVisualBatches(group),
          mapRuntimeMaterialDerivatives,
          ownedVisualMaterials,
        ),
        mapTintFamilyMaterials,
        ownedVisualMaterials,
      );
  if (descriptor.templateId === "traffic-light") {
    const buildPhase = (phase: "red" | "green") => {
      const phaseRoot = group.clone(true);
      for (const material of applySignalPhase(phaseRoot, phase, signalPhaseBindings)) {
        ownedVisualMaterials.add(material);
      }
      return createCityMapTintVisualBatches(
        createCityMapRuntimeVisualBatches(
          createVisualBatches(phaseRoot),
          mapRuntimeMaterialDerivatives,
          ownedVisualMaterials,
        ),
        mapTintFamilyMaterials,
        ownedVisualMaterials,
      );
    };
    signalVisualBatches = Object.freeze({ red: buildPhase("red"), green: buildPhase("green") });
  }
  const metrics = Object.freeze({
    templateId: descriptor.templateId,
    showcaseMeshCount,
    mapVisibleMeshCount,
    mapDrawCalls: (visualBatches ?? signalVisualBatches?.red)
      ?.reduce((sum, batch) => sum + batch.drawCalls, 0) ?? mapVisibleMeshCount,
  });
  const allBatches = visualBatches
    ?? [...(signalVisualBatches?.red ?? []), ...(signalVisualBatches?.green ?? [])];
  const batchKeyMetrics = visualBatchKeyMetrics(allBatches);
  return Object.freeze({
    group,
    signalPhaseBindings,
    visualBatches,
    signalVisualBatches,
    ownedVisualMaterials: Object.freeze([...ownedVisualMaterials]),
    metrics,
    batchKeyMetrics,
  });
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

  const abortReason = (signal: AbortSignal) => signal.reason instanceof Error
    ? signal.reason
    : new DOMException("collision template request aborted", "AbortError");

  const awaitWithAbort = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortReason(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  };

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
    for (const batch of record.visualBatches ?? []) batch.geometry.dispose();
    for (const batches of Object.values(record.signalVisualBatches ?? {})) {
      for (const batch of batches) batch.geometry.dispose();
    }
    for (const material of record.ownedVisualMaterials) material.dispose();
    for (const geometry of record.ownedFarGeometries) geometry.dispose();
    if (record.canonicalSourceReleased) {
      disposeMaterialsAndTextures(record.canonicalMaterials);
    } else {
      disposeObjectResources(record.canonicalSource);
    }
    if (!record.resourceCacheLeaseReleased) record.resourceCacheLease.release();
  };

  const maybeFinishRetirement = () => {
    if (!retired || retirementResolved) return;
    for (const record of records.values()) {
      if (record.borrowers !== 0 || record.attachmentPins !== 0 || record.collisionPackingPins !== 0) return;
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
        canonicalMaterials: collectSceneMaterials(canonical.group),
        descriptor,
        signalPhaseBindings: canonical.signalPhaseBindings,
        visualBatches: canonical.visualBatches,
        signalVisualBatches: canonical.signalVisualBatches,
        ownedVisualMaterials: canonical.ownedVisualMaterials,
        resourceCacheLease: owned.resourceCacheLease,
        resourceCacheLeaseReleased: false,
        packedCollisionReady: false,
        packedSurfaceCollisionReady: false,
        canonicalSourceReleased: false,
        metrics: canonical.metrics,
        batchKeyMetrics: canonical.batchKeyMetrics,
        ownedFarGeometries: [],
        borrowers: 0,
        attachmentPins: 0,
        collisionPackingPins: 0,
        disposed: false,
      };
      records.set(key, record);
      handleRecords.set(handle, record);
      owned = undefined;
      return borrowRecord(record);
    } catch (error) {
      if (owned) {
        disposeObjectResources(owned.group);
        owned.resourceCacheLease.release();
      }
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
    const instanceMappings: Array<{
      object: THREE.InstancedMesh;
      placementIds: readonly string[];
    }> = [];
    const ownedPhaseMaterials = new Set<THREE.Material>();
    let mounted: ResourceLease<unknown> | null = null;
    try {
      const requestedSignalPhase = request.placements[0]?.signalPhase;
      if (request.placements.some((placement) => placement.signalPhase !== requestedSignalPhase)) {
        throw new TypeError("one visual attachment cannot mix traffic-light phases");
      }
      const activeBatches = record.visualBatches
        ?? record.signalVisualBatches?.[requestedSignalPhase ?? "red"]
        ?? null;
      const selectedBatches = request.batchSelection === "special-only"
        ? activeBatches?.filter((batch) => !isCityBatchEligible(batch)) ?? null
        : request.batchSelection === "signal-special-only"
          ? activeBatches?.filter((batch) => !isCityBatchEligible(batch, true)) ?? null
          : activeBatches;
      if (selectedBatches) {
        const matrix = new THREE.Matrix4();
        const group = new THREE.Group();
        const ownedInstances: THREE.InstancedMesh[] = [];
        group.name = `city-template-batches-${record.metrics.templateId}`;
        for (const placement of request.placements) {
          if (!placement.placementId) throw new TypeError("visual placement id must be non-empty");
          if (placement.signalPhase !== undefined && record.metrics.templateId !== "traffic-light") {
            throw new TypeError("signalPhase is only valid for the traffic-light derived template");
          }
          assertMatrixSnapshot(placement.worldFromLocal);
        }
        const buckets = new Map<string, typeof request.placements extends readonly (infer T)[] ? T[] : never>();
        for (const placement of request.placements) {
          const cellX = Math.floor(placement.worldFromLocal[12] / CITY_VISUAL_INSTANCE_CELL_SIZE_METERS);
          const cellZ = Math.floor(placement.worldFromLocal[14] / CITY_VISUAL_INSTANCE_CELL_SIZE_METERS);
          const key = `${cellX},${cellZ}`;
          const bucket = buckets.get(key) ?? [];
          bucket.push(placement);
          buckets.set(key, bucket);
        }
        for (let batchIndex = 0; batchIndex < selectedBatches.length; batchIndex += 1) {
          const batch = selectedBatches[batchIndex];
          const material: THREE.Material | THREE.Material[] = batch.material instanceof THREE.Material
            ? batch.material
            : [...batch.material];
          for (const [cellKey, placements] of buckets) {
            const instances = new THREE.InstancedMesh(batch.geometry, material, placements.length);
            instances.name = `city-template-${record.metrics.templateId}-batch-${batchIndex}-${cellKey}`;
            instances.userData.templateId = record.metrics.templateId;
            if (requestedSignalPhase) instances.userData.signalPhase = requestedSignalPhase;
            if (batch.signalPhaseRole) instances.userData.signalPhaseRole = batch.signalPhaseRole;
            const batchMaterials = Array.isArray(material) ? material : [material];
            instances.castShadow = batch.castShadow
              && batchMaterials.every((candidate) => !candidate.transparent && candidate.opacity >= 1);
            instances.receiveShadow = batch.receiveShadow;
            instances.renderOrder = batch.renderOrder;
            instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            placements.forEach((placement, placementIndex) => {
              matrix.fromArray(placement.worldFromLocal);
              instances.setMatrixAt(placementIndex, matrix);
            });
            instances.instanceMatrix.needsUpdate = true;
            instances.computeBoundingBox();
            instances.computeBoundingSphere();
            group.add(instances);
            ownedInstances.push(instances);
            instanceMappings.push({
              object: instances,
              placementIds: Object.freeze(placements.map((placement) => placement.placementId)),
            });
          }
        }
        roots.push(group);
        mounted = layers.mount(request.targetLayer, {
          objects: roots,
          instancePlacements: instanceMappings,
          disposeOwnedResources() {
            for (const instances of ownedInstances) instances.dispose();
            ownedInstances.length = 0;
          },
        });
      } else {
      if (record.canonicalSourceReleased) {
        throw new Error("canonical source tree was released without a baked visual representation");
      }
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
      }
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
  const getVisualBatchKeyMetrics = (handle: VisualTemplateHandle) => requireLiveRecord(handle).batchKeyMetrics;
  const getBatchTemplateDefinition = (handle: VisualTemplateHandle): CityBatchTemplateDefinition | null => {
    const record = requireLiveRecord(handle);
    if (record.batchTemplateDefinition === undefined) {
      record.batchTemplateDefinition = buildCatalogBatchTemplateDefinition(record);
    }
    return record.batchTemplateDefinition;
  };

  const getSignalBatchTemplateDefinition = (
    handle: VisualTemplateHandle,
    phase: "red" | "green",
  ): CityBatchTemplateDefinition | null => {
    const record = requireLiveRecord(handle);
    const batches = record.signalVisualBatches?.[phase];
    if (!batches) return null;
    const slots = batches.flatMap((batch, index) => {
      if (!isCityBatchEligible(batch, true) || !(batch.material instanceof THREE.Material)) return [];
      return [Object.freeze({
        slotId: `visual-batch-${index}`,
        poolKey: visualBatchCompatibilityKey(batch),
        material: batch.material,
        nearGeometry: batch.geometry,
        castShadow: batch.castShadow,
        receiveShadow: batch.receiveShadow,
        renderOrder: batch.renderOrder,
        ...(batch.baseTint ? { baseTint: batch.baseTint } : {}),
      })];
    });
    if (slots.length === 0) return null;
    return Object.freeze({
      templateId: `${record.metrics.templateId}:${phase}`,
      slots: Object.freeze(slots),
    });
  };

  const createCollisionCompileSource = async (
    source: VisualTemplateSourceRef,
    signal?: AbortSignal,
  ): Promise<PackedCollisionCompileSource> => {
    const lease = getVisualTemplate(source);
    try {
      const record = requireLiveRecord(lease.value);
      if (record.packedCollisionPromise) return await awaitWithAbort(record.packedCollisionPromise, signal);
      if (signal?.aborted) throw abortReason(signal);
      if (record.canonicalSourceReleased) {
        throw new Error("canonical collision source was not retained before source-tree release");
      }
      const sourceId = canonicalTupleKey([
        "city-template-collision",
        source.kind,
        source.kind === "catalog" ? source.catalogId : source.templateId,
        record.handle.sourceIdentity,
      ]);
      record.collisionPackingPins += 1;
      const promise = packTemplateCollisionSource(record.canonicalSource, record.descriptor, {
        sourceId,
        generation: record.handle.sourceRegistryGeneration,
        resolvedHeightScale: 1,
      }).then((packed) => {
        record.packedCollisionReady = true;
        return packed;
      }).catch((error) => {
        if (record.packedCollisionPromise === promise) record.packedCollisionPromise = undefined;
        throw error;
      }).finally(() => {
        record.collisionPackingPins -= 1;
        if (record.collisionPackingPins < 0) throw new Error("collision packing pin underflow");
        maybeFinishRetirement();
      });
      record.packedCollisionPromise = promise;
      return await awaitWithAbort(promise, signal);
    } finally {
      lease.release();
    }
  };

  const createSurfaceCollisionCompileSources = async (
    source: VisualTemplateSourceRef,
    signal?: AbortSignal,
  ): Promise<readonly PackedCollisionCompileSource[]> => {
    const lease = getVisualTemplate(source);
    try {
      const record = requireLiveRecord(lease.value);
      if (record.packedSurfaceCollisionPromise) {
        return await awaitWithAbort(record.packedSurfaceCollisionPromise, signal);
      }
      if (signal?.aborted) throw abortReason(signal);
      if (record.canonicalSourceReleased) {
        throw new Error("canonical surface source was not retained before source-tree release");
      }
      const sourceId = canonicalTupleKey([
        "city-template-collision",
        source.kind,
        source.kind === "catalog" ? source.catalogId : source.templateId,
        record.handle.sourceIdentity,
      ]);
      record.collisionPackingPins += 1;
      const promise = packTemplateSurfaceCollisionSources(record.canonicalSource, record.descriptor, {
        sourceId,
        generation: record.handle.sourceRegistryGeneration,
        resolvedHeightScale: 1,
      }).then((packed) => {
        record.packedSurfaceCollisionReady = true;
        return packed;
      }).catch((error) => {
        if (record.packedSurfaceCollisionPromise === promise) {
          record.packedSurfaceCollisionPromise = undefined;
        }
        throw error;
      }).finally(() => {
        record.collisionPackingPins -= 1;
        if (record.collisionPackingPins < 0) throw new Error("surface collision packing pin underflow");
        maybeFinishRetirement();
      });
      record.packedSurfaceCollisionPromise = promise;
      return await awaitWithAbort(promise, signal);
    } finally {
      lease.release();
    }
  };

  const releaseCanonicalSourceTree = (source: VisualTemplateSourceRef): boolean => {
    const lease = getVisualTemplate(source);
    try {
      const record = requireLiveRecord(lease.value);
      if (record.canonicalSourceReleased) return false;
      if (!record.packedCollisionReady || !record.packedSurfaceCollisionReady) return false;
      if (record.visualBatches === null && record.signalVisualBatches === null) return false;
      disposeSceneResources(record.canonicalSource, { disposeMaterials: false });
      record.canonicalSource.clear();
      record.canonicalSourceReleased = true;
      if (!record.resourceCacheLeaseReleased) {
        record.resourceCacheLeaseReleased = true;
        record.resourceCacheLease.release();
      }
      return true;
    } finally {
      lease.release();
    }
  };

  const getCanonicalSourceLifecycle = (handle: VisualTemplateHandle) => {
    const record = requireLiveRecord(handle);
    return Object.freeze({
      sourceTreeReleased: record.canonicalSourceReleased,
      sourceTreeChildCount: record.canonicalSource.children.length,
      packedCollisionReady: record.packedCollisionReady,
      packedSurfaceCollisionReady: record.packedSurfaceCollisionReady,
    });
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
    getVisualBatchKeyMetrics,
    getBatchTemplateDefinition,
    getSignalBatchTemplateDefinition,
    createCollisionCompileSource,
    createSurfaceCollisionCompileSources,
    releaseCanonicalSourceTree,
    getCanonicalSourceLifecycle,
    retire,
    get retired() { return retired; },
  });
}
