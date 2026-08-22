import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import { getCatalogEntry, toTemplateBuildDescriptor } from "../app/lib/map/cityCatalog.ts";
import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import { packTemplateCollisionSource } from "../app/lib/map/cityTemplateCollisionSource.ts";

function buildCatalogSource(id) {
  const entry = getCatalogEntry(id);
  assert.ok(entry);
  assert.equal(entry.source.kind, "factory");
  const adapter = DEFAULT_CATALOG_FACTORY_ADAPTERS.find(
    (candidate) => candidate.factoryId === entry.source.factoryId,
  );
  assert.ok(adapter);
  const root = adapter.build();
  root.scale.setScalar(entry.mapScale);
  return { entry, root };
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

test("reviewed map layers keep the heaviest collision sources below checked budgets", async (t) => {
  const budgets = new Map([
    ["high-rise-residential", 5_000],
    ["hospital-campus", 5_000],
    ["school-campus", 22_000],
    ["residential-community", 61_000],
  ]);
  for (const [id, maximumTriangles] of budgets) {
    const { entry, root } = buildCatalogSource(id);
    t.after(() => disposeTree(root));
    const packed = await packTemplateCollisionSource(root, toTemplateBuildDescriptor(entry), {
      sourceId: `performance-${id}`,
      generation: 1,
      resolvedHeightScale: entry.defaultHeightScale,
      yieldEveryMeshes: 100_000,
    });
    assert.ok(packed.triangles.triangleRoles.length <= maximumTriangles,
      `${id} exceeds its reviewed solid-triangle budget`);
  }
});

test("actual high-rise BVH work stays local when the map population grows to 50x", async (t) => {
  const { entry, root } = buildCatalogSource("high-rise-residential");
  const packed = await packTemplateCollisionSource(root, toTemplateBuildDescriptor(entry), {
    sourceId: "performance-high-rise-density",
    generation: 1,
    resolvedHeightScale: entry.defaultHeightScale,
    yieldEveryMeshes: 100_000,
  });
  const compiled = await compileCollisionSource(packed);
  t.after(() => {
    compiled.fallback?.geometry.dispose();
    disposeTree(root);
  });
  assert.equal(
    compiled.walls.sourceTriangleIds.length + (compiled.fallback?.resolvedSourceTriangleIds.length ?? 0),
    packed.triangles.triangleRoles.length,
    "the conservative component proof must neither drop nor duplicate source faces",
  );

  const snapshots = [];
  for (const multiplier of [1, 10, 20, 50]) {
    const owners = Array.from({ length: multiplier * 100 }, (_, index) => ({
      ownerId: `high-rise-${multiplier}-${index}`,
      ownerGeneration: 1,
      source: compiled,
      transform: {
        x: (index % 100) * 24,
        y: 0,
        z: Math.floor(index / 100) * 24,
        yawRadians: 0,
        uniformScale: 1,
      },
    }));
    const runtime = new CompiledCityCollisionRuntime(owners, {
      worldId: 2_000 + multiplier,
      documentGeneration: 1,
    });
    const result = runtime.querySweep({
      startX: -18,
      startZ: 0,
      deltaX: 6,
      deltaZ: 0,
      minY: 0,
      maxY: 2.4,
      radius: 0.55,
    });
    assert.ok(result.hit);
    const stats = runtime.getPerformanceStats();
    snapshots.push({
      candidates: stats.lastCandidateOwnerCount,
      bucketEntries: stats.lastBucketEntryVisitCount,
      fallbackTriangles: result.fallbackTriangleCandidateCount,
      globalOwners: stats.globalOwnerCount,
    });
    runtime.dispose();
  }
  assert.ok(snapshots.every((snapshot) => snapshot.candidates === 1));
  assert.ok(snapshots.every((snapshot) => snapshot.fallbackTriangles === snapshots[0].fallbackTriangles));
  assert.ok(snapshots.every((snapshot) => snapshot.globalOwners === 0));
  assert.ok(snapshots.every((snapshot) => snapshot.bucketEntries <= 6),
    "full-size tower bounds may touch one extra spatial bucket but work must remain O(1)");
  assert.equal(snapshots[0].candidates, 1);
  assert.equal(snapshots[0].globalOwners, 0);
  assert.ok(snapshots[0].fallbackTriangles > 0);
});
