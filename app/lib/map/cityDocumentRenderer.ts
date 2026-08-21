import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeSceneResources } from "./cityResourceCache.ts";
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
  VisualTemplateHandle,
} from "./cityTemplateCache.ts";
import {
  CatalogVisualSourceMissingError,
  CITY_VISUAL_INSTANCE_CELL_SIZE_METERS,
} from "./cityTemplateCache.ts";
import type {
  CityVisualLayerManager,
  VisualLayerMountHandle,
  VisualPickResult,
} from "./cityVisualLayerManager.ts";
import type { ResourceLease } from "./resourceLease.ts";
import {
  createCityBatchedMeshWorld,
  type CityBatchLodPolicy,
  type CityBatchWorld,
  type CityBatchWorldStats,
} from "./cityBatchWorld.ts";
import type { CityBatchBackend } from "./cityPerformanceProbe.ts";

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
  placementFullRebuildCount: number;
  placementIncrementalCommitCount: number;
  placementLastAddedCount: number;
  placementLastUpdatedCount: number;
  placementLastRemovedCount: number;
  placementLastAffectedCatalogCount: number;
  placementLastAffectedCellCount: number;
  signalBuildGeneration: number;
  roadMeshCount: number;
  legacyLayerCount: number;
  legacyInstanceCount: number;
  catalogAttachmentCount: number;
  catalogPlacementCount: number;
  signalAttachmentCount: number;
  signalPlacementCount: number;
  catalogMisses: readonly string[];
  catalogBatchBackend: CityBatchBackend;
  catalogBatchPoolCount: number;
  catalogBatchInstanceCount: number;
  catalogBatchInstanceCapacity: number;
  catalogBatchGeometryCount: number;
  catalogBatchVertexCapacity: number;
  catalogBatchIndexCapacity: number;
  catalogBatchEstimatedBufferBytes: number;
  signalBatchPoolCount: number;
  signalBatchInstanceCount: number;
  signalBatchInstanceCapacity: number;
  signalBatchGeometryCount: number;
  signalBatchVertexCapacity: number;
  signalBatchIndexCapacity: number;
  signalBatchEstimatedBufferBytes: number;
}>;

export type CityRendererApplyReport = CityRendererStats;

export type CityBatchVisibilityReport = Readonly<{
  placements: number;
  instances: number;
  nearPlacements: number;
  farPlacements: number;
}>;

export type CityBatchRaycastReport = Readonly<{
  durationMs: number;
  testedPlacements: number;
  candidatePlacements: number;
  testedSlots: number;
}>;

export type CityDocumentRenderer = Readonly<{
  applyCityDocument: (
    document: CityMapDocumentSnapshot,
    dirty?: LayerMask,
  ) => CityRendererApplyReport;
  raycast: (raycaster: THREE.Raycaster) => readonly VisualPickResult[];
  getRaycastStats: () => CityBatchRaycastReport;
  updateBatchVisibility: (
    camera: THREE.Camera,
    shadowFrustum?: THREE.Frustum,
    lodPolicy?: CityBatchLodPolicy,
  ) => CityBatchVisibilityReport;
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

type CatalogAttachmentMap = Map<string, ResourceLease<VisualAttachmentHandle>>;

type AppliedPlacementState = Readonly<{
  catalogId: string;
  poseKind: GridPlacement["poseKind"] | WorldPlacement["poseKind"] | LegacyMassingPlacement["poseKind"];
  fingerprint: string;
  worldFromLocal: Matrix4Snapshot | null;
}>;

const ROAD_COLORS = Object.freeze({
  asphalt: 0x3d4347,
  // Bicycle lanes use a neutral asphalt value. Their identity comes from the
  // cross-section and lane markings, not a saturated green surface.
  "bike-lane": 0x4b5054,
  sidewalk: 0xc9c4b8,
  driveway: 0x777b78,
});

const SIDEWALK_CURB_COLOR = 0x858078;
const ROAD_SURFACE_Y_OFFSET_METERS = 0.005;
const CROSSWALK_Y_METERS = 0.014;
const ROAD_MARKING_Y_METERS = 0.016;

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
  disposeSceneResources(root);
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

function buildRoadSurfaceGeometry(surface: Readonly<ReturnType<typeof deriveCityEntranceRoadRuntime>["collisionSources"]["surfaces"][number]>) {
  const topY = (vertex: number) => (surface.cornerY?.[vertex] ?? surface.y) + ROAD_SURFACE_Y_OFFSET_METERS;
  const geometry = new THREE.BufferGeometry();
  if (surface.surfaceProfileId !== "sidewalk") {
    const positions = new Float32Array(12);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      positions[vertex * 3] = surface.quadXZ[vertex * 2];
      positions[vertex * 3 + 1] = topY(vertex);
      positions[vertex * 3 + 2] = surface.quadXZ[vertex * 2 + 1];
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return geometry;
  }

  // A top-only plane at 24 cm was almost indistinguishable from the city
  // ground. Keep the collision surface unchanged, but render both long curb
  // faces so the sidewalk reads as a raised ribbon from oblique and top views.
  // End caps are intentionally omitted: adjacent road pieces meet at graph
  // nodes and must not create a visible wall across an intersection.
  const positions = new Float32Array(24);
  for (let vertex = 0; vertex < 4; vertex += 1) {
    const x = surface.quadXZ[vertex * 2];
    const z = surface.quadXZ[vertex * 2 + 1];
    positions[vertex * 3] = x;
    positions[vertex * 3 + 1] = topY(vertex);
    positions[vertex * 3 + 2] = z;
    positions[(vertex + 4) * 3] = x;
    positions[(vertex + 4) * 3 + 1] = ROAD_SURFACE_Y_OFFSET_METERS;
    positions[(vertex + 4) * 3 + 2] = z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ]);
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 12, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeRoadSurfaceGeometries(
  geometries: readonly THREE.BufferGeometry[],
  preserveSidewalkMaterialGroups: boolean,
) {
  if (geometries.length === 0) throw new TypeError("road surface merge requires geometry");
  const materialIndices: [number[], number[]] = [[], []];
  let vertexOffset = 0;
  if (preserveSidewalkMaterialGroups) {
    for (const geometry of geometries) {
      const index = geometry.getIndex();
      if (!index) throw new TypeError("sidewalk geometry must be indexed");
      for (const group of geometry.groups) {
        const destination = materialIndices[group.materialIndex ?? 0];
        if (!destination) throw new TypeError("unexpected sidewalk material group");
        for (let cursor = group.start; cursor < group.start + group.count; cursor += 1) {
          destination.push(index.getX(cursor) + vertexOffset);
        }
      }
      vertexOffset += geometry.getAttribute("position").count;
    }
  }
  try {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error("road surface geometries are incompatible");
    if (preserveSidewalkMaterialGroups) {
      merged.setIndex([...materialIndices[0], ...materialIndices[1]]);
      merged.clearGroups();
      merged.addGroup(0, materialIndices[0].length, 0);
      merged.addGroup(materialIndices[0].length, materialIndices[1].length, 1);
    }
    return merged;
  } finally {
    for (const geometry of geometries) geometry.dispose();
  }
}

function buildCrosswalkGeometry(
  crosswalks: Readonly<ReturnType<typeof deriveCityEntranceRoadRuntime>["collisionSources"]["crosswalks"]>,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const crosswalk of crosswalks) {
    const lateralX = crosswalk.directionZ;
    const lateralZ = -crosswalk.directionX;
    const pitch = crosswalk.widthMeters / (crosswalk.stripeCount * 2 - 1);
    for (let stripe = 0; stripe < crosswalk.stripeCount; stripe += 1) {
      const stripeAcross = -crosswalk.widthMeters * 0.5 + pitch * 0.5 + stripe * pitch * 2;
      const halfAlong = crosswalk.depthMeters * 0.5;
      const halfAcross = pitch * 0.5;
      const base = positions.length / 3;
      for (const [forward, lateral] of [
        [-halfAlong, stripeAcross + halfAcross],
        [-halfAlong, stripeAcross - halfAcross],
        [halfAlong, stripeAcross - halfAcross],
        [halfAlong, stripeAcross + halfAcross],
      ] as const) {
        positions.push(
          crosswalk.centerX + crosswalk.directionX * forward + lateralX * lateral,
          CROSSWALK_Y_METERS,
          crosswalk.centerZ + crosswalk.directionZ * forward + lateralZ * lateral,
        );
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function appendRoadPaintQuad(
  positions: number[],
  indices: number[],
  corners: readonly [number, number, number, number, number, number, number, number],
) {
  const base = positions.length / 3;
  for (let vertex = 0; vertex < 4; vertex += 1) {
    positions.push(corners[vertex * 2], ROAD_MARKING_Y_METERS, corners[vertex * 2 + 1]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function appendRoadPaintStrip(
  positions: number[],
  indices: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  widthMeters: number,
) {
  const length = Math.hypot(bx - ax, bz - az);
  if (length <= 1e-7) return;
  const dx = (bx - ax) / length;
  const dz = (bz - az) / length;
  const nx = dz * widthMeters * 0.5;
  const nz = -dx * widthMeters * 0.5;
  appendRoadPaintQuad(positions, indices, [
    ax + nx, az + nz,
    ax - nx, az - nz,
    bx - nx, bz - nz,
    bx + nx, bz + nz,
  ]);
}

function buildRoadMarkingGeometry(
  markings: Readonly<ReturnType<typeof deriveCityEntranceRoadRuntime>["collisionSources"]["markings"]>,
  color: "white" | "yellow",
) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const marking of markings) {
    if (marking.color !== color) continue;
    const [ax, az, bx, bz] = marking.segmentXZ;
    const length = Math.hypot(bx - ax, bz - az);
    if (length <= 1e-7) continue;
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    if (marking.dashLengthMeters === undefined || marking.dashGapMeters === undefined) {
      appendRoadPaintStrip(positions, indices, ax, az, bx, bz, marking.widthMeters);
      continue;
    }
    const period = marking.dashLengthMeters + marking.dashGapMeters;
    const count = Math.max(1, Math.floor((length + marking.dashGapMeters) / period));
    const paintedLength = count * marking.dashLengthMeters + (count - 1) * marking.dashGapMeters;
    let cursor = Math.max(0, (length - paintedLength) * 0.5);
    for (let dash = 0; dash < count; dash += 1) {
      const end = Math.min(length, cursor + marking.dashLengthMeters);
      appendRoadPaintStrip(
        positions,
        indices,
        ax + dx * cursor,
        az + dz * cursor,
        ax + dx * end,
        az + dz * end,
        marking.widthMeters,
      );
      cursor += period;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildBikeLaneArrowGeometry(
  arrows: Readonly<ReturnType<typeof deriveCityEntranceRoadRuntime>["collisionSources"]["bikeLaneArrows"]>,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const arrow of arrows) {
    const lateralX = arrow.directionZ;
    const lateralZ = -arrow.directionX;
    const shaftStart = -1.45;
    const shaftEnd = 0.25;
    const shaftHalfWidth = 0.12;
    appendRoadPaintQuad(positions, indices, [
      arrow.x + arrow.directionX * shaftStart + lateralX * shaftHalfWidth,
      arrow.z + arrow.directionZ * shaftStart + lateralZ * shaftHalfWidth,
      arrow.x + arrow.directionX * shaftStart - lateralX * shaftHalfWidth,
      arrow.z + arrow.directionZ * shaftStart - lateralZ * shaftHalfWidth,
      arrow.x + arrow.directionX * shaftEnd - lateralX * shaftHalfWidth,
      arrow.z + arrow.directionZ * shaftEnd - lateralZ * shaftHalfWidth,
      arrow.x + arrow.directionX * shaftEnd + lateralX * shaftHalfWidth,
      arrow.z + arrow.directionZ * shaftEnd + lateralZ * shaftHalfWidth,
    ]);
    const base = positions.length / 3;
    positions.push(
      arrow.x + arrow.directionX * 1.45,
      ROAD_MARKING_Y_METERS,
      arrow.z + arrow.directionZ * 1.45,
      arrow.x + arrow.directionX * 0.15 + lateralX * 0.58,
      ROAD_MARKING_Y_METERS,
      arrow.z + arrow.directionZ * 0.15 + lateralZ * 0.58,
      arrow.x + arrow.directionX * 0.15 - lateralX * 0.58,
      ROAD_MARKING_Y_METERS,
      arrow.z + arrow.directionZ * 0.15 - lateralZ * 0.58,
    );
    indices.push(base, base + 1, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoadPaintMaterial(color: number, name: string) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = name;
  return material;
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
  let curbMaterial: THREE.MeshStandardMaterial | null = null;
  const getCurbMaterial = () => {
    if (curbMaterial) return curbMaterial;
    curbMaterial = new THREE.MeshStandardMaterial({
      color: SIDEWALK_CURB_COLOR,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    curbMaterial.name = "city-road-sidewalk-curb-material";
    return curbMaterial;
  };
  const surfacesByProfile = new Map<string, typeof derived.surfaces[number][]>();
  for (const surface of derived.surfaces) {
    if (quadAreaXZ(surface.quadXZ) <= 1e-7) continue;
    const bucket = surfacesByProfile.get(surface.surfaceProfileId) ?? [];
    bucket.push(surface);
    surfacesByProfile.set(surface.surfaceProfileId, bucket);
  }
  for (const [surfaceProfileId, surfaces] of surfacesByProfile) {
    let material = materials.get(surfaceProfileId);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: ROAD_COLORS[surfaceProfileId as keyof typeof ROAD_COLORS],
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      material.name = `city-road-${surfaceProfileId}-material`;
      materials.set(surfaceProfileId, material);
    }
    const geometry = mergeRoadSurfaceGeometries(
      surfaces.map(buildRoadSurfaceGeometry),
      surfaceProfileId === "sidewalk",
    );
    const mesh = new THREE.Mesh(
      geometry,
      surfaceProfileId === "sidewalk" ? [material, getCurbMaterial()] : material,
    );
    mesh.name = `city-road-top-${surfaceProfileId}`;
    mesh.receiveShadow = true;
    mesh.userData.mapCollisionRole = "rideable-surface";
    mesh.userData.mapSurfaceProfile = surfaceProfileId;
    mesh.userData.roadEdgeIds = Object.freeze([...new Set(surfaces.map((surface) => surface.edgeId))]);
    mesh.userData.roadSourceSurfaceCount = surfaces.length;
    mesh.userData.roadVisualRole = surfaceProfileId === "sidewalk"
      ? "raised-sidewalk"
      : "surface-top";
    group.add(mesh);
  }
  const whitePaint = derived.markings.some((marking) => marking.color === "white")
    || derived.crosswalks.length > 0
    || derived.bikeLaneArrows.length > 0
    ? createRoadPaintMaterial(0xeeeade, "city-road-white-marking-material")
    : null;
  const yellowPaint = derived.markings.some((marking) => marking.color === "yellow")
    ? createRoadPaintMaterial(0xe6bd43, "city-road-yellow-marking-material")
    : null;
  for (const [color, material] of [["white", whitePaint], ["yellow", yellowPaint]] as const) {
    if (!material) continue;
    const matching = derived.markings.filter((marking) => marking.color === color);
    if (matching.length === 0) continue;
    const mesh = new THREE.Mesh(buildRoadMarkingGeometry(derived.markings, color), material);
    mesh.name = `city-road-${color}-lane-markings`;
    mesh.renderOrder = 3;
    mesh.userData.mapCollisionRole = "ignore";
    mesh.userData.roadVisualRole = "lane-marking";
    mesh.userData.markingCount = matching.length;
    group.add(mesh);
  }
  if (whitePaint && derived.bikeLaneArrows.length > 0) {
    const mesh = new THREE.Mesh(buildBikeLaneArrowGeometry(derived.bikeLaneArrows), whitePaint);
    mesh.name = "city-road-bike-lane-arrows";
    mesh.renderOrder = 3;
    mesh.userData.mapCollisionRole = "ignore";
    mesh.userData.roadVisualRole = "bike-lane-direction";
    mesh.userData.arrowCount = derived.bikeLaneArrows.length;
    group.add(mesh);
  }
  if (derived.crosswalks.length > 0) {
    const geometry = buildCrosswalkGeometry(derived.crosswalks);
    const mesh = new THREE.Mesh(geometry, whitePaint!);
    mesh.name = "city-road-crosswalks";
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    mesh.userData.mapCollisionRole = "ignore";
    mesh.userData.roadVisualRole = "crosswalk-marking";
    mesh.userData.crosswalkCount = derived.crosswalks.length;
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

function placementState(placement: CityMapDocumentSnapshot["placements"][number]): AppliedPlacementState {
  return Object.freeze({
    catalogId: placement.catalogId,
    poseKind: placement.poseKind,
    fingerprint: JSON.stringify(placement),
    worldFromLocal: placement.poseKind === "legacy-massing" ? null : placementMatrix(placement),
  });
}

function placementStateMap(document: CityMapDocumentSnapshot) {
  return new Map(document.placements.map((placement) => [placement.id, placementState(placement)]));
}

function catalogVisualCellKey(catalogId: string, worldFromLocal: Matrix4Snapshot) {
  const cellX = Math.floor(worldFromLocal[12] / CITY_VISUAL_INSTANCE_CELL_SIZE_METERS);
  const cellZ = Math.floor(worldFromLocal[14] / CITY_VISUAL_INSTANCE_CELL_SIZE_METERS);
  return `${catalogId}|${cellX},${cellZ}`;
}

export function createCityDocumentRenderer(options: Readonly<{
  cache: CityTemplateCache;
  layers: CityVisualLayerManager;
  parentOwnedLayer: THREE.Group;
  batchBackend?: CityBatchBackend;
}>): CityDocumentRenderer {
  const { cache, layers } = options;
  const batchBackend = options.batchBackend ?? "instanced-mesh";
  const portLease = layers.createPort(options.parentOwnedLayer);
  let roadLayer: OwnedLayer | null = null;
  let legacyLayer: OwnedLayer | null = null;
  let catalogAttachments: CatalogAttachmentMap = new Map();
  let catalogBatchMount: ResourceLease<VisualLayerMountHandle> | null = null;
  let catalogBatchWorld: CityBatchWorld | null = null;
  let catalogBatchTemplateLeases = new Map<string, ResourceLease<VisualTemplateHandle>>();
  let catalogBatchStats: CityBatchWorldStats | null = null;
  let signalAttachments: ResourceLease<VisualAttachmentHandle>[] = [];
  let signalBatchMount: ResourceLease<VisualLayerMountHandle> | null = null;
  let signalBatchWorld: CityBatchWorld | null = null;
  let signalBatchTemplateLeases: ResourceLease<VisualTemplateHandle>[] = [];
  let signalBatchStats: CityBatchWorldStats | null = null;
  let appliedPlacements = new Map<string, AppliedPlacementState>();
  let applied = false;
  let disposed = false;
  let stats: CityRendererStats = Object.freeze({
    roadBuildGeneration: 0,
    placementBuildGeneration: 0,
    placementFullRebuildCount: 0,
    placementIncrementalCommitCount: 0,
    placementLastAddedCount: 0,
    placementLastUpdatedCount: 0,
    placementLastRemovedCount: 0,
    placementLastAffectedCatalogCount: 0,
    placementLastAffectedCellCount: 0,
    signalBuildGeneration: 0,
    roadMeshCount: 0,
    legacyLayerCount: 0,
    legacyInstanceCount: 0,
    catalogAttachmentCount: 0,
    catalogPlacementCount: 0,
    signalAttachmentCount: 0,
    signalPlacementCount: 0,
    catalogMisses: Object.freeze([]),
    catalogBatchBackend: batchBackend,
    catalogBatchPoolCount: 0,
    catalogBatchInstanceCount: 0,
    catalogBatchInstanceCapacity: 0,
    catalogBatchGeometryCount: 0,
    catalogBatchVertexCapacity: 0,
    catalogBatchIndexCapacity: 0,
    catalogBatchEstimatedBufferBytes: 0,
    signalBatchPoolCount: 0,
    signalBatchInstanceCount: 0,
    signalBatchInstanceCapacity: 0,
    signalBatchGeometryCount: 0,
    signalBatchVertexCapacity: 0,
    signalBatchIndexCapacity: 0,
    signalBatchEstimatedBufferBytes: 0,
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
    let nextCatalogBatchMount = catalogBatchMount;
    let nextCatalogBatchWorld = catalogBatchWorld;
    let nextCatalogBatchTemplateLeases = catalogBatchTemplateLeases;
    let nextCatalogBatchStats = catalogBatchStats;
    let nextSignals = signalAttachments;
    let nextSignalBatchMount = signalBatchMount;
    let nextSignalBatchWorld = signalBatchWorld;
    let nextSignalBatchTemplateLeases = signalBatchTemplateLeases;
    let nextSignalBatchStats = signalBatchStats;
    let nextRoadGeneration = stats.roadBuildGeneration;
    let nextPlacementGeneration = stats.placementBuildGeneration;
    let nextPlacementFullRebuildCount = stats.placementFullRebuildCount;
    let nextPlacementIncrementalCommitCount = stats.placementIncrementalCommitCount;
    let nextPlacementLastAddedCount = stats.placementLastAddedCount;
    let nextPlacementLastUpdatedCount = stats.placementLastUpdatedCount;
    let nextPlacementLastRemovedCount = stats.placementLastRemovedCount;
    let nextPlacementLastAffectedCatalogCount = stats.placementLastAffectedCatalogCount;
    let nextPlacementLastAffectedCellCount = stats.placementLastAffectedCellCount;
    let nextSignalGeneration = stats.signalBuildGeneration;
    let nextSignalPlacementCount = stats.signalPlacementCount;
    let nextMisses = stats.catalogMisses;
    let nextAppliedPlacements = appliedPlacements;
    const staged: Array<{ release: () => void }> = [];
    const catalogAttachmentsToRelease: Array<{ release: () => void }> = [];
    const placementRollbacks: Array<() => void> = [];
    let incrementalPlacementCommit = false;
    let releaseLegacyAfterCommit = false;
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
        const grouped = new Map<string, Array<{ placementId: string; worldFromLocal: Matrix4Snapshot }>>();
        const groupedCells = new Map<string, Readonly<{
          catalogId: string;
          placements: Array<{ placementId: string; worldFromLocal: Matrix4Snapshot }>;
        }>>();
        for (const placement of document.placements) {
          if (placement.poseKind === "legacy-massing") continue;
          const matrix = placementMatrix(placement);
          if (!matrix) continue;
          const list = grouped.get(placement.catalogId) ?? [];
          const visualPlacement = { placementId: placement.id, worldFromLocal: matrix };
          list.push(visualPlacement);
          grouped.set(placement.catalogId, list);
          const attachmentKey = catalogVisualCellKey(placement.catalogId, matrix);
          const cell = groupedCells.get(attachmentKey) ?? { catalogId: placement.catalogId, placements: [] };
          cell.placements.push(visualPlacement);
          groupedCells.set(attachmentKey, cell);
        }
        const currentPlacementState = placementStateMap(document);
        const canIncrement = applied
          && dirty !== CityDirtyLayer.All
          && (batchBackend !== "batched-mesh" || catalogBatchWorld !== null);

        if (!canIncrement) {
          nextPlacementFullRebuildCount += 1;
          nextPlacementLastAddedCount = document.placements.length;
          nextPlacementLastUpdatedCount = 0;
          nextPlacementLastRemovedCount = appliedPlacements.size;
          nextPlacementLastAffectedCatalogCount = grouped.size;
          nextPlacementLastAffectedCellCount = groupedCells.size;
          nextLegacy = buildLegacyLayer(legacy, layers, portLease.value);
          if (nextLegacy) staged.push(nextLegacy.lease);
          const attachments: CatalogAttachmentMap = new Map();
          const batchWorld = batchBackend === "batched-mesh" ? createCityBatchedMeshWorld() : null;
          if (batchWorld) staged.push({ release: batchWorld.dispose });
          const batchTemplateLeases = new Map<string, ResourceLease<VisualTemplateHandle>>();
          const misses = new Set<string>();
          const matrix = new THREE.Matrix4();
          for (const [catalogId, placements] of grouped) {
            try {
              const acquire = cache.getVisualTemplate({ kind: "catalog", catalogId });
              let retainAcquire = false;
              try {
                if (batchWorld) {
                  const definition = cache.getBatchTemplateDefinition(acquire.value);
                  if (definition) {
                    batchWorld.registerTemplate(definition);
                    for (const placement of placements) {
                      batchWorld.addPlacement(
                        placement.placementId,
                        definition.templateId,
                        matrix.fromArray(placement.worldFromLocal),
                      );
                    }
                    batchTemplateLeases.set(catalogId, acquire);
                    staged.push(acquire);
                    retainAcquire = true;
                  }
                }
                for (const [attachmentKey, cell] of groupedCells) {
                  if (cell.catalogId !== catalogId) continue;
                  const attachment = cache.attachVisualTemplate(acquire.value, {
                    targetLayer: portLease.value,
                    placements: cell.placements,
                    ...(batchWorld ? { batchSelection: "special-only" as const } : {}),
                  });
                  attachments.set(attachmentKey, attachment);
                  staged.push(attachment);
                }
              } finally {
                if (!retainAcquire) acquire.release();
              }
            } catch (error) {
              if (error instanceof CatalogVisualSourceMissingError) {
                misses.add(catalogId);
                continue;
              }
              throw error;
            }
          }
          let batchMount: ResourceLease<VisualLayerMountHandle> | null = null;
          const batchStats = batchWorld?.stats() ?? null;
          if (batchWorld && batchStats) {
            batchMount = layers.mount(portLease.value, {
              objects: [batchWorld.root],
              broadPhaseRaycast: batchWorld.raycast,
              disposeOwnedResources: batchWorld.dispose,
            });
            staged.push(batchMount);
          }
          nextCatalog = attachments;
          nextCatalogBatchMount = batchMount;
          nextCatalogBatchWorld = batchWorld;
          nextCatalogBatchTemplateLeases = batchTemplateLeases;
          nextCatalogBatchStats = batchStats;
          nextMisses = Object.freeze([...misses].sort());
        } else {
          incrementalPlacementCommit = true;
          nextPlacementIncrementalCommitCount += 1;
          nextPlacementLastAddedCount = 0;
          nextPlacementLastUpdatedCount = 0;
          nextPlacementLastRemovedCount = 0;
          const affectedCatalogs = new Set<string>();
          const affectedAttachmentKeys = new Set<string>();
          let legacyChanged = false;
          for (const placementId of new Set([...appliedPlacements.keys(), ...currentPlacementState.keys()])) {
            const before = appliedPlacements.get(placementId);
            const after = currentPlacementState.get(placementId);
            if (before?.fingerprint === after?.fingerprint) continue;
            if (!before) nextPlacementLastAddedCount += 1;
            else if (!after) nextPlacementLastRemovedCount += 1;
            else nextPlacementLastUpdatedCount += 1;
            if (before?.poseKind === "legacy-massing" || after?.poseKind === "legacy-massing") legacyChanged = true;
            if (before && before.poseKind !== "legacy-massing") {
              affectedCatalogs.add(before.catalogId);
              if (before.worldFromLocal) {
                affectedAttachmentKeys.add(catalogVisualCellKey(before.catalogId, before.worldFromLocal));
              }
            }
            if (after && after.poseKind !== "legacy-massing") {
              affectedCatalogs.add(after.catalogId);
              if (after.worldFromLocal) {
                affectedAttachmentKeys.add(catalogVisualCellKey(after.catalogId, after.worldFromLocal));
              }
            }
          }
          nextPlacementLastAffectedCatalogCount = affectedCatalogs.size;
          nextPlacementLastAffectedCellCount = affectedAttachmentKeys.size;
          if (legacyChanged) {
            nextLegacy = buildLegacyLayer(legacy, layers, portLease.value);
            if (nextLegacy) staged.push(nextLegacy.lease);
            releaseLegacyAfterCommit = true;
          }

          const replacementAttachments = new Map<string, ResourceLease<VisualAttachmentHandle> | null>();
          const misses = new Set(stats.catalogMisses.filter((catalogId) => grouped.has(catalogId)));
          const newTemplateLeases = new Map<string, ResourceLease<VisualTemplateHandle>>();
          const availableHandles = new Map<string, VisualTemplateHandle>();
          const temporaryAcquires: ResourceLease<VisualTemplateHandle>[] = [];
          try {
            for (const catalogId of affectedCatalogs) {
              if (!grouped.has(catalogId)) {
                misses.delete(catalogId);
                continue;
              }
              try {
                const retained = catalogBatchTemplateLeases.get(catalogId);
                const acquire = retained ?? cache.getVisualTemplate({ kind: "catalog", catalogId });
                let retainAcquire = retained !== undefined;
                if (catalogBatchWorld && !retained) {
                  const definition = cache.getBatchTemplateDefinition(acquire.value);
                  if (definition) {
                    catalogBatchWorld.registerTemplate(definition);
                    newTemplateLeases.set(catalogId, acquire);
                    staged.push(acquire);
                    retainAcquire = true;
                  }
                }
                availableHandles.set(catalogId, acquire.value);
                if (!retainAcquire) temporaryAcquires.push(acquire);
                misses.delete(catalogId);
              } catch (error) {
                if (error instanceof CatalogVisualSourceMissingError) {
                  misses.add(catalogId);
                  continue;
                }
                throw error;
              }
            }
            for (const attachmentKey of affectedAttachmentKeys) {
              const cell = groupedCells.get(attachmentKey);
              if (!cell || misses.has(cell.catalogId)) {
                replacementAttachments.set(attachmentKey, null);
                continue;
              }
              const handle = availableHandles.get(cell.catalogId);
              if (!handle) throw new Error(`city visual template handle disappeared: ${cell.catalogId}`);
              const attachment = cache.attachVisualTemplate(handle, {
                targetLayer: portLease.value,
                placements: cell.placements,
                ...(catalogBatchWorld ? { batchSelection: "special-only" as const } : {}),
              });
              replacementAttachments.set(attachmentKey, attachment);
              staged.push(attachment);
            }
          } finally {
            releaseAll(temporaryAcquires);
          }

          if (catalogBatchWorld) {
            const matrix = new THREE.Matrix4();
            for (const [placementId, before] of appliedPlacements) {
              const after = currentPlacementState.get(placementId);
              if (before.poseKind !== "legacy-massing"
                && (!after || after.poseKind === "legacy-massing" || after.catalogId !== before.catalogId)) {
                if (!stats.catalogMisses.includes(before.catalogId)) {
                  catalogBatchWorld.removePlacement(placementId);
                  placementRollbacks.push(() => catalogBatchWorld.addPlacement(
                    placementId,
                    before.catalogId,
                    new THREE.Matrix4().fromArray(before.worldFromLocal!),
                  ));
                }
              }
            }
            for (const [placementId, after] of currentPlacementState) {
              if (after.poseKind === "legacy-massing" || !after.worldFromLocal || misses.has(after.catalogId)) continue;
              const before = appliedPlacements.get(placementId);
              if (!before || before.poseKind === "legacy-massing" || before.catalogId !== after.catalogId) {
                catalogBatchWorld.addPlacement(placementId, after.catalogId, matrix.fromArray(after.worldFromLocal));
                placementRollbacks.push(() => catalogBatchWorld.removePlacement(placementId));
              } else if (before.fingerprint !== after.fingerprint) {
                catalogBatchWorld.movePlacement(placementId, matrix.fromArray(after.worldFromLocal));
                placementRollbacks.push(() => catalogBatchWorld.movePlacement(
                  placementId,
                  new THREE.Matrix4().fromArray(before.worldFromLocal!),
                ));
              }
            }
          }

          nextCatalog = new Map(catalogAttachments);
          for (const [catalogId, replacement] of replacementAttachments) {
            const previous = nextCatalog.get(catalogId);
            if (previous) catalogAttachmentsToRelease.push(previous);
            if (replacement) nextCatalog.set(catalogId, replacement);
            else nextCatalog.delete(catalogId);
          }
          nextCatalogBatchTemplateLeases = new Map(catalogBatchTemplateLeases);
          for (const [catalogId, lease] of newTemplateLeases) nextCatalogBatchTemplateLeases.set(catalogId, lease);
          nextCatalogBatchStats = catalogBatchWorld?.stats() ?? null;
          nextMisses = Object.freeze([...misses].sort());
        }
        nextAppliedPlacements = currentPlacementState;
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
        const batchWorld = batchBackend === "batched-mesh" ? createCityBatchedMeshWorld() : null;
        if (batchWorld) staged.push({ release: batchWorld.dispose });
        const batchTemplateLeases: ResourceLease<VisualTemplateHandle>[] = [];
        if (derivedSignals.length > 0) {
          const acquire = cache.getVisualTemplate({ kind: "derived", templateId: "traffic-light" });
          let retainAcquire = false;
          try {
            for (const phase of ["red", "green"] as const) {
              const signals = byPhase.get(phase)!;
              if (signals.length === 0) continue;
              const placements = signals.map((signal) => Object.freeze({
                placementId: signal.placementId,
                worldFromLocal: signalPlacementMatrix(signal),
                signalPhase: phase,
              }));
              if (batchWorld) {
                const definition = cache.getSignalBatchTemplateDefinition(acquire.value, phase);
                if (definition) {
                  batchWorld.registerTemplate(definition);
                  const matrix = new THREE.Matrix4();
                  for (const placement of placements) {
                    batchWorld.addPlacement(
                      placement.placementId,
                      definition.templateId,
                      matrix.fromArray(placement.worldFromLocal),
                    );
                  }
                  retainAcquire = true;
                }
              }
              const attachment = cache.attachVisualTemplate(acquire.value, {
                targetLayer: portLease.value,
                placements,
                ...(batchWorld ? { batchSelection: "signal-special-only" as const } : {}),
              });
              attachments.push(attachment);
              staged.push(attachment);
            }
          } finally {
            if (retainAcquire) {
              batchTemplateLeases.push(acquire);
              staged.push(acquire);
            } else {
              acquire.release();
            }
          }
        }
        let batchMount: ResourceLease<VisualLayerMountHandle> | null = null;
        const batchStats = batchWorld?.stats() ?? null;
        if (batchWorld && batchStats && batchStats.instances > 0) {
          batchMount = layers.mount(portLease.value, {
            objects: [batchWorld.root],
            disposeOwnedResources: batchWorld.dispose,
          });
          staged.push(batchMount);
        } else {
          batchWorld?.dispose();
        }
        nextSignals = attachments;
        nextSignalBatchMount = batchMount;
        nextSignalBatchWorld = batchMount ? batchWorld : null;
        nextSignalBatchTemplateLeases = batchTemplateLeases;
        nextSignalBatchStats = batchStats;
        nextSignalPlacementCount = derivedSignals.length;
        nextSignalGeneration += 1;
      }

      if ((effectiveDirty & CityDirtyLayer.Roads) !== 0) roadLayer?.lease.release();
      if ((effectiveDirty & CityDirtyLayer.Placements) !== 0) {
        if (incrementalPlacementCommit) {
          releaseAll(catalogAttachmentsToRelease);
          if (releaseLegacyAfterCommit) legacyLayer?.lease.release();
        } else {
          releaseAll([...catalogAttachments.values()]);
          catalogBatchMount?.release();
          releaseAll([...catalogBatchTemplateLeases.values()]);
          legacyLayer?.lease.release();
        }
      }
      if ((effectiveDirty & (CityDirtyLayer.Roads | CityDirtyLayer.Signals)) !== 0) {
        releaseAll(signalAttachments);
        signalBatchMount?.release();
        releaseAll(signalBatchTemplateLeases);
      }
      roadLayer = nextRoad;
      legacyLayer = nextLegacy;
      catalogAttachments = nextCatalog;
      catalogBatchMount = nextCatalogBatchMount;
      catalogBatchWorld = nextCatalogBatchWorld;
      catalogBatchTemplateLeases = nextCatalogBatchTemplateLeases;
      catalogBatchStats = nextCatalogBatchStats;
      appliedPlacements = nextAppliedPlacements;
      signalAttachments = nextSignals;
      signalBatchMount = nextSignalBatchMount;
      signalBatchWorld = nextSignalBatchWorld;
      signalBatchTemplateLeases = nextSignalBatchTemplateLeases;
      signalBatchStats = nextSignalBatchStats;
      applied = true;
      stats = Object.freeze({
        roadBuildGeneration: nextRoadGeneration,
        placementBuildGeneration: nextPlacementGeneration,
        placementFullRebuildCount: nextPlacementFullRebuildCount,
        placementIncrementalCommitCount: nextPlacementIncrementalCommitCount,
        placementLastAddedCount: nextPlacementLastAddedCount,
        placementLastUpdatedCount: nextPlacementLastUpdatedCount,
        placementLastRemovedCount: nextPlacementLastRemovedCount,
        placementLastAffectedCatalogCount: nextPlacementLastAffectedCatalogCount,
        placementLastAffectedCellCount: nextPlacementLastAffectedCellCount,
        signalBuildGeneration: nextSignalGeneration,
        roadMeshCount: roadLayer?.meshCount ?? 0,
        legacyLayerCount: legacyLayer?.layerCount ?? 0,
        legacyInstanceCount: legacyLayer?.instanceCount ?? 0,
        catalogAttachmentCount: catalogAttachments.size,
        catalogPlacementCount: document.placements.filter((placement) => placement.poseKind !== "legacy-massing"
          && !nextMisses.includes(placement.catalogId)).length,
        signalAttachmentCount: signalAttachments.length,
        signalPlacementCount: nextSignalPlacementCount,
        catalogMisses: nextMisses,
        catalogBatchBackend: batchBackend,
        catalogBatchPoolCount: catalogBatchStats?.pools ?? 0,
        catalogBatchInstanceCount: catalogBatchStats?.instances ?? 0,
        catalogBatchInstanceCapacity: catalogBatchStats?.instanceCapacity ?? 0,
        catalogBatchGeometryCount: catalogBatchStats?.geometries ?? 0,
        catalogBatchVertexCapacity: catalogBatchStats?.vertexCapacity ?? 0,
        catalogBatchIndexCapacity: catalogBatchStats?.indexCapacity ?? 0,
        catalogBatchEstimatedBufferBytes: catalogBatchStats?.estimatedBufferBytes ?? 0,
        signalBatchPoolCount: signalBatchStats?.pools ?? 0,
        signalBatchInstanceCount: signalBatchStats?.instances ?? 0,
        signalBatchInstanceCapacity: signalBatchStats?.instanceCapacity ?? 0,
        signalBatchGeometryCount: signalBatchStats?.geometries ?? 0,
        signalBatchVertexCapacity: signalBatchStats?.vertexCapacity ?? 0,
        signalBatchIndexCapacity: signalBatchStats?.indexCapacity ?? 0,
        signalBatchEstimatedBufferBytes: signalBatchStats?.estimatedBufferBytes ?? 0,
      });
      placementRollbacks.length = 0;
      return stats;
    } catch (error) {
      for (let index = placementRollbacks.length - 1; index >= 0; index -= 1) placementRollbacks[index]();
      releaseAll(staged);
      throw error;
    }
  };

  const raycastReport = {
    durationMs: 0,
    testedPlacements: 0,
    candidatePlacements: 0,
    testedSlots: 0,
  };
  const raycast = (raycaster: THREE.Raycaster) => {
    const startedAt = performance.now();
    const hits = layers.raycast(portLease.value, raycaster);
    const catalog = catalogBatchWorld?.getRaycastStats();
    const signals = signalBatchWorld?.getRaycastStats();
    raycastReport.durationMs = performance.now() - startedAt;
    raycastReport.testedPlacements = (catalog?.testedPlacements ?? 0) + (signals?.testedPlacements ?? 0);
    raycastReport.candidatePlacements = (catalog?.candidatePlacements ?? 0) + (signals?.candidatePlacements ?? 0);
    raycastReport.testedSlots = (catalog?.testedSlots ?? 0) + (signals?.testedSlots ?? 0);
    return hits;
  };
  const getRaycastStats = () => Object.freeze({ ...raycastReport });
  const visibilityProjection = new THREE.Matrix4();
  const visibilityFrustum = new THREE.Frustum();
  const visibilityReport = { placements: 0, instances: 0, nearPlacements: 0, farPlacements: 0 };
  const updateBatchVisibility = (
    camera: THREE.Camera,
    shadowFrustum?: THREE.Frustum,
    lodPolicy?: CityBatchLodPolicy,
  ): CityBatchVisibilityReport => {
    if (disposed) throw new Error("city document renderer is disposed");
    camera.updateMatrixWorld();
    const catalogLod = catalogBatchWorld?.updateLod(camera, lodPolicy);
    for (const change of catalogLod?.changes ?? []) {
      layers.setPlacementLod(portLease.value, change.placementId, change.tier);
    }
    visibilityProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    visibilityFrustum.setFromProjectionMatrix(visibilityProjection);
    const catalog = catalogBatchWorld?.updateVisibility(visibilityFrustum, shadowFrustum);
    const signals = signalBatchWorld?.updateVisibility(visibilityFrustum, shadowFrustum);
    visibilityReport.placements = (catalog?.placements ?? 0) + (signals?.placements ?? 0);
    visibilityReport.instances = (catalog?.instances ?? 0) + (signals?.instances ?? 0);
    visibilityReport.nearPlacements = (catalogLod?.nearPlacements ?? 0) + (signals?.placements ?? 0);
    visibilityReport.farPlacements = catalogLod?.farPlacements ?? 0;
    return visibilityReport;
  };
  const getStats = () => stats;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseAll([...catalogAttachments.values()]);
    catalogAttachments = new Map();
    catalogBatchMount?.release();
    catalogBatchMount = null;
    catalogBatchWorld = null;
    releaseAll([...catalogBatchTemplateLeases.values()]);
    catalogBatchTemplateLeases = new Map();
    catalogBatchStats = null;
    appliedPlacements.clear();
    releaseAll(signalAttachments);
    signalAttachments = [];
    signalBatchMount?.release();
    signalBatchMount = null;
    signalBatchWorld = null;
    releaseAll(signalBatchTemplateLeases);
    signalBatchTemplateLeases = [];
    signalBatchStats = null;
    legacyLayer?.lease.release();
    legacyLayer = null;
    roadLayer?.lease.release();
    roadLayer = null;
    portLease.release();
  };

  return Object.freeze({
    applyCityDocument,
    raycast,
    getRaycastStats,
    updateBatchVisibility,
    getStats,
    dispose,
    get disposed() { return disposed; },
  });
}
