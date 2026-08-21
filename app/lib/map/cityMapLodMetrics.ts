import * as THREE from "three";
import { toTemplateBuildDescriptor, type CatalogEntrySnapshot } from "./cityCatalog.ts";
import type { CatalogFactoryAdapter } from "./cityCatalogSources.ts";
import { cityMaterialBatchKey } from "./cityMaterialBatchKey.ts";
import { applyReviewedCityMapLodTags } from "./cityMapLodTags.ts";
import { effectiveTriangleCount, isEffectivelyVisible } from "./cityStructureMetrics.ts";
import { applyCityTemplateMapLod } from "./cityTemplateCache.ts";
import {
  packTemplateCollisionSource,
  packTemplateSurfaceCollisionSources,
} from "./cityTemplateCollisionSource.ts";
import { disposeSceneResources } from "./cityResourceCache.ts";

export type CityMapLodStageMetrics = Readonly<{
  meshCount: number;
  triangles: number;
  materialKeyCount: number;
  materialKeys: readonly string[];
  solidCollisionTriangles: number;
  surfaceCollisionTriangles: number;
}>;

export type CityMapLodThreeStageMetrics = Readonly<{
  catalogId: string;
  factoryId: string;
  preOptimization: CityMapLodStageMetrics;
  postOptimization: CityMapLodStageMetrics;
  postMapLod: CityMapLodStageMetrics;
}>;

function visibleMaterials(mesh: THREE.Mesh) {
  if (!Array.isArray(mesh.material)) return mesh.material.visible ? [mesh.material] : [];
  if (mesh.geometry.groups.length === 0) return [];
  const materials = new Set<THREE.Material>();
  for (const group of mesh.geometry.groups) {
    const material = mesh.material[group.materialIndex];
    if (material?.visible) materials.add(material);
  }
  return [...materials];
}

async function measureStage(
  root: THREE.Group,
  entry: CatalogEntrySnapshot,
  stage: string,
): Promise<CityMapLodStageMetrics> {
  let meshCount = 0;
  let triangles = 0;
  const materialKeys = new Set<string>();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
    meshCount += 1;
    triangles += effectiveTriangleCount(object);
    for (const material of visibleMaterials(object)) materialKeys.add(cityMaterialBatchKey(material));
  });
  const descriptor = toTemplateBuildDescriptor(entry);
  const solid = await packTemplateCollisionSource(root, descriptor, {
    sourceId: `${entry.id}:${stage}:solid`,
    generation: 1,
    resolvedHeightScale: 1,
    yieldEveryMeshes: Number.MAX_SAFE_INTEGER,
  });
  const surfaces = await packTemplateSurfaceCollisionSources(root, descriptor, {
    sourceId: `${entry.id}:${stage}:surface`,
    generation: 1,
    resolvedHeightScale: 1,
    yieldEveryMeshes: Number.MAX_SAFE_INTEGER,
  });
  const sortedKeys = Object.freeze([...materialKeys].sort());
  return Object.freeze({
    meshCount,
    triangles,
    materialKeyCount: sortedKeys.length,
    materialKeys: sortedKeys,
    solidCollisionTriangles: solid.triangles.triangleRoles.length,
    surfaceCollisionTriangles: surfaces.reduce(
      (sum, source) => sum + source.triangles.triangleRoles.length,
      0,
    ),
  });
}

export async function measureCatalogMapLodStages(
  entry: CatalogEntrySnapshot,
  adapter: CatalogFactoryAdapter,
): Promise<CityMapLodThreeStageMetrics> {
  if (entry.source.kind !== "factory" || entry.source.factoryId !== adapter.factoryId) {
    throw new TypeError(`catalog/factory mismatch for mapLod metrics: ${entry.id}`);
  }
  const preOptimization = adapter.build({ optimizeStatic: false });
  const postOptimization = adapter.build({ optimizeStatic: true });
  const postMapLod = adapter.build({ optimizeStatic: true });
  try {
    applyReviewedCityMapLodTags(postMapLod, adapter.factoryId);
    applyCityTemplateMapLod(postMapLod, toTemplateBuildDescriptor(entry));
    const [preMetrics, optimizedMetrics, mapMetrics] = await Promise.all([
      measureStage(preOptimization, entry, "pre-optimization"),
      measureStage(postOptimization, entry, "post-optimization"),
      measureStage(postMapLod, entry, "post-map-lod"),
    ]);
    return Object.freeze({
      catalogId: entry.id,
      factoryId: adapter.factoryId,
      preOptimization: preMetrics,
      postOptimization: optimizedMetrics,
      postMapLod: mapMetrics,
    });
  } finally {
    disposeSceneResources(preOptimization);
    disposeSceneResources(postOptimization);
    disposeSceneResources(postMapLod);
  }
}
