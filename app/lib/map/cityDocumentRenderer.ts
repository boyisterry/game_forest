import * as THREE from "three";
import { getCatalogEntry } from "./cityCatalog.ts";
import type {
  CityMapDocumentSnapshot,
  GridPlacement,
  LegacyMassingPlacement,
  WorldPlacement,
} from "./cityDocument.ts";
import { CityDirtyLayer, type LayerMask } from "./cityEditor.ts";
import {
  buildLegacyMassingBoxParts,
  type LegacyMassingBoxPart,
  type LegacyMassingBoxPartRole,
} from "./cityPlacements.ts";
import { deriveCityEntranceRoadRuntime } from "./cityEntrances.ts";
import {
  deriveTrafficSignalPlacements,
  type DerivedTrafficSignalPlacement,
  type SignalPhase,
} from "./citySignals.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  TILE_SIZE_METERS,
} from "./cityTiles.ts";
import type {
  CityTemplateCache,
  Matrix4Snapshot,
  VisualAttachmentHandle,
} from "./cityTemplateCache.ts";
import { CatalogVisualSourceMissingError } from "./cityTemplateCache.ts";
import type {
  CityVisualLayerManager,
  VisualLayerMountHandle,
  VisualPickResult,
} from "./cityVisualLayerManager.ts";
import type { ResourceLease } from "./resourceLease.ts";

export const LEGACY_VISUAL_ROLES: readonly LegacyMassingBoxPartRole[] = Object.freeze([
  "body",
  "plinth",
  "roof",
  "trim",
  "door",
  "awning",
  "window",
]);

export type CityRendererStats = Readonly<{
  roadBuildGeneration: number;
  placementBuildGeneration: number;
  signalBuildGeneration: number;
  roadMeshCount: number;
  legacyLayerCount: number;
  legacyInstanceCount: number;
  catalogAttachmentCount: number;
  catalogPlacementCount: number;
  signalAttachmentCount: number;
  signalPlacementCount: number;
  catalogMisses: readonly string[];
}>;

export type CityRendererApplyReport = CityRendererStats;

export type CityDocumentRenderer = Readonly<{
  applyCityDocument: (
    document: CityMapDocumentSnapshot,
    dirty?: LayerMask,
  ) => CityRendererApplyReport;
  raycast: (raycaster: THREE.Raycaster) => readonly VisualPickResult[];
  getStats: () => CityRendererStats;
  dispose: () => void;
  readonly disposed: boolean;
}>;

type OwnedLayer = Readonly<{
  lease: ResourceLease<VisualLayerMountHandle>;
  meshCount: number;
  instanceCount: number;
  layerCount: number;
}>;

const ROAD_COLORS = Object.freeze({
  asphalt: 0x3d4347,
  "bike-lane": 0x678b72,
  sidewalk: 0xaaa69d,
  driveway: 0x777b78,
});

const LEGACY_COLORS = Object.freeze({
  body: 0xffffff,
  plinth: 0x737b7c,
  roof: 0x5a646b,
  trim: 0xd6d0c5,
  door: 0x2f444b,
  awning: 0x8f4f42,
  window: 0x99cbd4,
});

function disposeOwnedGroup(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const source = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of source) materials.add(material);
  });
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.clear();
}

function quadAreaXZ(values: readonly number[]) {
  let sum = 0;
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    sum += values[index * 2] * values[next * 2 + 1] - values[next * 2] * values[index * 2 + 1];
  }
  return Math.abs(sum) * 0.5;
}

function buildRoadTopLayer(
  document: CityMapDocumentSnapshot,
  layers: CityVisualLayerManager,
  targetLayer: Parameters<CityVisualLayerManager["mount"]>[0],
): OwnedLayer | null {
  const derived = deriveCityEntranceRoadRuntime(document).collisionSources;
  const group = new THREE.Group();
  group.name = "city-document-road-tops";
  group.userData.cityVisualOwned = true;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const surface of derived.surfaces) {
    if (quadAreaXZ(surface.quadXZ) <= 1e-7) continue;
    let material = materials.get(surface.surfaceProfileId);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: ROAD_COLORS[surface.surfaceProfileId],
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      material.name = `city-road-${surface.surfaceProfileId}-material`;
      materials.set(surface.surfaceProfileId, material);
    }
    const positions = new Float32Array(12);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      positions[vertex * 3] = surface.quadXZ[vertex * 2];
      positions[vertex * 3 + 1] = (surface.cornerY?.[vertex] ?? surface.y) + 0.005;
      positions[vertex * 3 + 2] = surface.quadXZ[vertex * 2 + 1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `city-road-top-${surface.edgeId}-${surface.side}-${surface.surfaceProfileId}`;
    mesh.receiveShadow = true;
    mesh.userData.mapCollisionRole = "rideable-surface";
    mesh.userData.mapSurfaceProfile = surface.surfaceProfileId;
    mesh.userData.roadEdgeId = surface.edgeId;
    group.add(mesh);
  }
  if (group.children.length === 0) {
    disposeOwnedGroup(group);
    return null;
  }
  let disposed = false;
  const lease = layers.mount(targetLayer, {
    objects: [group],
    disposeOwnedResources() {
      if (disposed) throw new Error("road visual resources disposed more than once");
      disposed = true;
      disposeOwnedGroup(group);
    },
  });
  return Object.freeze({ lease, meshCount: group.children.length, instanceCount: 0, layerCount: 1 });
}

function colorForLegacyPart(role: LegacyMassingBoxPartRole, placement: Readonly<LegacyMassingPlacement>) {
  const color = new THREE.Color(role === "body" ? placement.color : LEGACY_COLORS[role]);
  if (role === "roof") color.lerp(new THREE.Color(placement.color), 0.18);
  return color;
}

function buildLegacyLayer(
  placements: readonly Readonly<LegacyMassingPlacement>[],
  layers: CityVisualLayerManager,
  targetLayer: Parameters<CityVisualLayerManager["mount"]>[0],
): OwnedLayer | null {
  if (placements.length === 0) return null;
  const byRole = new Map<LegacyMassingBoxPartRole, Array<{
    part: LegacyMassingBoxPart;
    placement: Readonly<LegacyMassingPlacement>;
  }>>(LEGACY_VISUAL_ROLES.map((role) => [role, []]));
  for (const placement of placements) {
    for (const part of buildLegacyMassingBoxParts(placement)) byRole.get(part.role)!.push({ part, placement });
  }

  const group = new THREE.Group();
  group.name = "city-document-legacy-massing";
  group.userData.cityVisualOwned = true;
  const instancePlacements: Array<{ object: THREE.InstancedMesh; placementIds: string[] }> = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let totalInstances = 0;
  for (const role of LEGACY_VISUAL_ROLES) {
    const items = byRole.get(role)!;
    const first = items[0].part;
    const geometry = new THREE.BoxGeometry(first.baseWidth, first.baseHeight, first.baseDepth);
    const material = new THREE.MeshStandardMaterial({
      color: LEGACY_COLORS[role],
      roughness: role === "window" ? 0.2 : 0.84,
      metalness: role === "window" ? 0.05 : 0,
      transparent: role === "window",
      opacity: role === "window" ? 0.72 : 1,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = `city-legacy-${role}-instances`;
    mesh.userData.visualRole = role;
    mesh.userData.mapCollisionRole = role === "window" ? "ignore" : "solid";
    mesh.frustumCulled = false;
    const placementIds: string[] = [];
    items.forEach(({ part, placement }, index) => {
      position.set(part.x, part.y, part.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), part.yawRadians);
      scale.set(part.scaleX, part.scaleY, part.scaleZ);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colorForLegacyPart(role, placement));
      placementIds.push(placement.id);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    instancePlacements.push({ object: mesh, placementIds });
    totalInstances += items.length;
  }
  let disposed = false;
  const lease = layers.mount(targetLayer, {
    objects: [group],
    instancePlacements,
    disposeOwnedResources() {
      if (disposed) throw new Error("legacy visual resources disposed more than once");
      disposed = true;
      disposeOwnedGroup(group);
    },
  });
  return Object.freeze({
    lease,
    meshCount: LEGACY_VISUAL_ROLES.length,
    instanceCount: totalInstances,
    layerCount: LEGACY_VISUAL_ROLES.length,
  });
}

function entryFootprint(id: string, yaw: GridPlacement["yaw"]) {
  const entry = getCatalogEntry(id);
  if (!entry) return null;
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return yaw === 90 || yaw === 270 ? { w: base.d, d: base.w } : base;
}

function placementMatrix(
  placement: Readonly<GridPlacement | WorldPlacement>,
): Matrix4Snapshot | null {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) return null;
  let x: number;
  let z: number;
  let yawRadians: number;
  let uniformScale: number;
  if (placement.poseKind === "grid") {
    const footprint = entryFootprint(placement.catalogId, placement.yaw)!;
    x = CITY_TILE_ORIGIN_X + (placement.i + footprint.w * 0.5) * TILE_SIZE_METERS;
    z = CITY_TILE_ORIGIN_Z + (placement.j + footprint.d * 0.5) * TILE_SIZE_METERS;
    yawRadians = THREE.MathUtils.degToRad(placement.yaw);
    uniformScale = 1;
  } else {
    x = placement.x;
    z = placement.z;
    yawRadians = placement.yawRadians;
    uniformScale = placement.scale;
  }
  const heightScale = placement.poseKind === "world"
    ? (placement.heightScale ?? entry.defaultHeightScale)
    : entry.defaultHeightScale;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRadians),
    new THREE.Vector3(uniformScale, uniformScale * heightScale, uniformScale),
  );
  return Object.freeze(matrix.toArray()) as Matrix4Snapshot;
}

function signalPlacementMatrix(signal: DerivedTrafficSignalPlacement): Matrix4Snapshot {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(signal.x, signal.y, signal.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), signal.yawRadians),
    new THREE.Vector3(
      signal.uniformScale,
      signal.uniformScale * signal.resolvedHeightScale,
      signal.uniformScale,
    ),
  );
  return Object.freeze(matrix.toArray()) as Matrix4Snapshot;
}

function releaseAll(leases: readonly { release: () => void }[]) {
  for (let index = leases.length - 1; index >= 0; index -= 1) leases[index].release();
}

export function createCityDocumentRenderer(options: Readonly<{
  cache: CityTemplateCache;
  layers: CityVisualLayerManager;
  parentOwnedLayer: THREE.Group;
}>): CityDocumentRenderer {
  const { cache, layers } = options;
  const portLease = layers.createPort(options.parentOwnedLayer);
  let roadLayer: OwnedLayer | null = null;
  let legacyLayer: OwnedLayer | null = null;
  let catalogAttachments: ResourceLease<VisualAttachmentHandle>[] = [];
  let signalAttachments: ResourceLease<VisualAttachmentHandle>[] = [];
  let applied = false;
  let disposed = false;
  let stats: CityRendererStats = Object.freeze({
    roadBuildGeneration: 0,
    placementBuildGeneration: 0,
    signalBuildGeneration: 0,
    roadMeshCount: 0,
    legacyLayerCount: 0,
    legacyInstanceCount: 0,
    catalogAttachmentCount: 0,
    catalogPlacementCount: 0,
    signalAttachmentCount: 0,
    signalPlacementCount: 0,
    catalogMisses: Object.freeze([]),
  });

  const applyCityDocument = (
    document: CityMapDocumentSnapshot,
    dirty: LayerMask = CityDirtyLayer.All,
  ): CityRendererApplyReport => {
    if (disposed) throw new Error("city document renderer is disposed");
    const effectiveDirty = applied ? dirty : CityDirtyLayer.All;
    let nextRoad = roadLayer;
    let nextLegacy = legacyLayer;
    let nextCatalog = catalogAttachments;
    let nextSignals = signalAttachments;
    let nextRoadGeneration = stats.roadBuildGeneration;
    let nextPlacementGeneration = stats.placementBuildGeneration;
    let nextSignalGeneration = stats.signalBuildGeneration;
    let nextSignalPlacementCount = stats.signalPlacementCount;
    let nextMisses = stats.catalogMisses;
    const staged: Array<{ release: () => void }> = [];
    try {
      if ((effectiveDirty & CityDirtyLayer.Roads) !== 0) {
        nextRoad = buildRoadTopLayer(document, layers, portLease.value);
        if (nextRoad) staged.push(nextRoad.lease);
        nextRoadGeneration += 1;
      }
      if ((effectiveDirty & CityDirtyLayer.Placements) !== 0) {
        const legacy = document.placements.filter(
          (placement): placement is Readonly<LegacyMassingPlacement> => placement.poseKind === "legacy-massing",
        );
        nextLegacy = buildLegacyLayer(legacy, layers, portLease.value);
        if (nextLegacy) staged.push(nextLegacy.lease);

        const grouped = new Map<string, Array<{ placementId: string; worldFromLocal: Matrix4Snapshot }>>();
        const misses = new Set<string>();
        for (const placement of document.placements) {
          if (placement.poseKind === "legacy-massing") continue;
          const matrix = placementMatrix(placement);
          if (!matrix) {
            misses.add(placement.catalogId);
            continue;
          }
          const list = grouped.get(placement.catalogId) ?? [];
          list.push({ placementId: placement.id, worldFromLocal: matrix });
          grouped.set(placement.catalogId, list);
        }
        const attachments: ResourceLease<VisualAttachmentHandle>[] = [];
        for (const [catalogId, placements] of grouped) {
          try {
            const acquire = cache.getVisualTemplate({ kind: "catalog", catalogId });
            try {
              const attachment = cache.attachVisualTemplate(acquire.value, {
                targetLayer: portLease.value,
                placements,
              });
              attachments.push(attachment);
              staged.push(attachment);
            } finally {
              acquire.release();
            }
          } catch (error) {
            if (error instanceof CatalogVisualSourceMissingError) {
              misses.add(catalogId);
              continue;
            }
            throw error;
          }
        }
        nextCatalog = attachments;
        nextMisses = Object.freeze([...misses].sort());
        nextPlacementGeneration += 1;
      }

      const signalsDirty = (effectiveDirty & (CityDirtyLayer.Roads | CityDirtyLayer.Signals)) !== 0;
      if (signalsDirty) {
        const derivedSignals = deriveTrafficSignalPlacements(document).placements;
        const byPhase = new Map<SignalPhase, DerivedTrafficSignalPlacement[]>([
          ["red", []],
          ["green", []],
        ]);
        for (const signal of derivedSignals) byPhase.get(signal.signalPhase)!.push(signal);
        const attachments: ResourceLease<VisualAttachmentHandle>[] = [];
        if (derivedSignals.length > 0) {
          const acquire = cache.getVisualTemplate({ kind: "derived", templateId: "traffic-light" });
          try {
            for (const phase of ["red", "green"] as const) {
              const signals = byPhase.get(phase)!;
              if (signals.length === 0) continue;
              const attachment = cache.attachVisualTemplate(acquire.value, {
                targetLayer: portLease.value,
                placements: signals.map((signal) => Object.freeze({
                  placementId: signal.placementId,
                  worldFromLocal: signalPlacementMatrix(signal),
                  signalPhase: phase,
                })),
              });
              attachments.push(attachment);
              staged.push(attachment);
            }
          } finally {
            acquire.release();
          }
        }
        nextSignals = attachments;
        nextSignalPlacementCount = derivedSignals.length;
        nextSignalGeneration += 1;
      }

      if ((effectiveDirty & CityDirtyLayer.Roads) !== 0) roadLayer?.lease.release();
      if ((effectiveDirty & CityDirtyLayer.Placements) !== 0) {
        releaseAll(catalogAttachments);
        legacyLayer?.lease.release();
      }
      if ((effectiveDirty & (CityDirtyLayer.Roads | CityDirtyLayer.Signals)) !== 0) {
        releaseAll(signalAttachments);
      }
      roadLayer = nextRoad;
      legacyLayer = nextLegacy;
      catalogAttachments = nextCatalog;
      signalAttachments = nextSignals;
      applied = true;
      stats = Object.freeze({
        roadBuildGeneration: nextRoadGeneration,
        placementBuildGeneration: nextPlacementGeneration,
        signalBuildGeneration: nextSignalGeneration,
        roadMeshCount: roadLayer?.meshCount ?? 0,
        legacyLayerCount: legacyLayer?.layerCount ?? 0,
        legacyInstanceCount: legacyLayer?.instanceCount ?? 0,
        catalogAttachmentCount: catalogAttachments.length,
        catalogPlacementCount: document.placements.filter((placement) => placement.poseKind !== "legacy-massing"
          && !nextMisses.includes(placement.catalogId)).length,
        signalAttachmentCount: signalAttachments.length,
        signalPlacementCount: nextSignalPlacementCount,
        catalogMisses: nextMisses,
      });
      return stats;
    } catch (error) {
      releaseAll(staged);
      throw error;
    }
  };

  const raycast = (raycaster: THREE.Raycaster) => layers.raycast(portLease.value, raycaster);
  const getStats = () => stats;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseAll(catalogAttachments);
    catalogAttachments = [];
    releaseAll(signalAttachments);
    signalAttachments = [];
    legacyLayer?.lease.release();
    legacyLayer = null;
    roadLayer?.lease.release();
    roadLayer = null;
    portLease.release();
  };

  return Object.freeze({
    applyCityDocument,
    raycast,
    getStats,
    dispose,
    get disposed() { return disposed; },
  });
}
