import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { createCityDocumentRenderer } from "../app/lib/map/cityDocumentRenderer.ts";
import {
  chooseCityBatchBackend,
  summarizeCityFrameTimes,
} from "../app/lib/map/cityPerformanceProbe.ts";
import { measureCitySceneStructure } from "../app/lib/map/cityStructureMetrics.ts";
import {
  createCityMapRuntimeMaterialDerivative,
  createCityTemplateCache,
} from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

test("city batching selects BatchedMesh only when multi-draw is available", () => {
  assert.equal(chooseCityBatchBackend(true), "batched-mesh");
  assert.equal(chooseCityBatchBackend(false), "instanced-mesh");
});

test("city frame summaries expose stable nearest-rank percentiles and long-frame ratio", () => {
  const summary = summarizeCityFrameTimes([50, 10, 20, 30, Number.NaN, -1]);
  assert.deepEqual(summary, {
    samples: 4,
    p50Ms: 20,
    p95Ms: 50,
    over25MsRatio: 0.5,
  });
  assert.deepEqual(summarizeCityFrameTimes([]), {
    samples: 0,
    p50Ms: 0,
    p95Ms: 0,
    over25MsRatio: 0,
  });
});

test("template cache exposes immutable batch compatibility diagnostics", async () => {
  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  try {
    const lease = cache.getVisualTemplate({ kind: "catalog", catalogId: "shopping-mall" });
    const metrics = cache.getVisualBatchKeyMetrics(lease.value);
    const definition = cache.getBatchTemplateDefinition(lease.value);
    lease.release();
    assert.ok(metrics.batchCount > 0);
    assert.ok(metrics.compatibilityKeys.length > 0);
    assert.ok(metrics.tintCompatibilityKeys.length <= metrics.compatibilityKeys.length);
    assert.ok(Object.isFrozen(metrics.compatibilityKeys));
    assert.ok(Object.isFrozen(metrics));
    assert.ok(definition);
    const tintedSlots = definition.slots.filter((slot) => slot.baseTint?.getHex() !== 0xffffff);
    assert.ok(tintedSlots.length > 0);
    assert.ok(tintedSlots.every((slot) => slot.material.color?.getHex() === 0xffffff),
      "diffuse color must move to per-instance tint on a white map-only pool material");
    assert.ok(definition.slots.every((slot) => (
      !("roughness" in slot.material)
      || [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].includes(slot.material.roughness)
    )), "opaque city-map roughness must use a reviewed runtime tier");
    assert.ok(definition.slots.every((slot) => (
      !("metalness" in slot.material)
      || [0, 0.2, 0.4, 0.6, 0.8, 1].includes(slot.material.metalness)
    )), "opaque city-map metalness must use a reviewed runtime tier");
  } finally {
    await cache.retire();
    await sources.retire();
  }
});

test("city map replaces physical transmission with an owned alpha-glass derivative", async () => {
  const source = new THREE.MeshPhysicalMaterial({
    color: 0x6da9b7,
    emissive: 0x244d59,
    emissiveIntensity: 0.035,
    roughness: 0.12,
    metalness: 0.05,
    transmission: 0.32,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  source.name = "showcase-glass";
  const runtime = createCityMapRuntimeMaterialDerivative(source);
  assert.ok(runtime instanceof THREE.MeshPhysicalMaterial);
  assert.notEqual(runtime, source);
  assert.equal(source.transmission, 0.32, "the canonical/showcase material must remain untouched");
  assert.equal(runtime.transmission, 0);
  for (const property of [
    "transparent",
    "opacity",
    "roughness",
    "metalness",
    "emissiveIntensity",
    "depthWrite",
    "side",
  ]) {
    assert.equal(runtime[property], source[property], property);
  }
  assert.equal(runtime.color.getHex(), source.color.getHex());
  assert.equal(runtime.emissive.getHex(), source.emissive.getHex());
  assert.equal(runtime.userData.cityMapTransmissionDowngrade, true);
  assert.equal(runtime.userData.cityMapOriginalTransmission, 0.32);
  assert.equal(source.userData.cityMapTransmissionDowngrade, undefined);
  assert.equal(createCityMapRuntimeMaterialDerivative(new THREE.MeshStandardMaterial()), null);

  runtime.dispose();
  source.dispose();

  const sources = createCatalogSourceRegistry();
  const layers = createCityVisualLayerManager();
  const cache = createCityTemplateCache({ sources, layers });
  const parent = new THREE.Group();
  const port = layers.createPort(parent);
  const lease = cache.getVisualTemplate({ kind: "catalog", catalogId: "shopping-mall" });
  const attachment = cache.attachVisualTemplate(lease.value, {
    targetLayer: port.value,
    placements: [{
      placementId: "mall",
      worldFromLocal: Object.freeze(new THREE.Matrix4().toArray()),
    }],
  });
  const mountedMaterials = new Set();
  parent.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      mountedMaterials.add(material);
    }
  });
  const downgraded = [...mountedMaterials]
    .filter((material) => material.userData.cityMapTransmissionDowngrade === true);
  assert.ok(downgraded.length > 0, "the mall's transmissive glass must use a map-only derivative");
  assert.ok(downgraded.every((material) => material.transmission === 0));
  assert.ok([...mountedMaterials].every((material) => (
    !(material instanceof THREE.MeshPhysicalMaterial) || material.transmission === 0
  )), "no mounted city-map material may activate the renderer transmission prepass");

  attachment.release();
  lease.release();
  port.release();
  await cache.retire();
  await sources.retire();
});

test("Cedar Crossing scene structure stays inside reviewed budgets for both backends", async (t) => {
  const budgets = {
    "instanced-mesh": {
      colorRanges: [1_285, 1_298],
      shadowRanges: [905, 916],
    },
    "batched-mesh": {
      colorRanges: [190, 200],
      shadowRanges: [54, 60],
    },
  };
  for (const batchBackend of ["instanced-mesh", "batched-mesh"]) {
    await t.test(batchBackend, async () => {
      const sources = createCatalogSourceRegistry();
      const layers = createCityVisualLayerManager();
      const cache = createCityTemplateCache({ sources, layers });
      const parent = new THREE.Group();
      const renderer = createCityDocumentRenderer({
        cache,
        layers,
        parentOwnedLayer: parent,
        batchBackend,
      });
      try {
        const document = createCedarCrossingDocument();
        assert.equal(document.placements.length, 126);
        renderer.applyCityDocument(document);
        const metrics = measureCitySceneStructure(parent, {
          batchedMultiDraw: batchBackend === "batched-mesh",
          shadowMapType: "pcf",
        });
        const budget = budgets[batchBackend];
        assert.ok(
          metrics.colorRanges >= budget.colorRanges[0]
            && metrics.colorRanges <= budget.colorRanges[1],
          `${batchBackend} color ranges left reviewed band: ${metrics.colorRanges}`,
        );
        assert.ok(
          metrics.shadowRanges >= budget.shadowRanges[0]
            && metrics.shadowRanges <= budget.shadowRanges[1],
          `${batchBackend} shadow ranges left reviewed band: ${metrics.shadowRanges}`,
        );
        assert.ok(
          metrics.triangles >= 750_000 && metrics.triangles <= 760_000,
          `${batchBackend} color triangles left reviewed band: ${metrics.triangles}`,
        );
        assert.ok(
          metrics.shadowTriangles >= 505_000 && metrics.shadowTriangles <= 515_000,
          `${batchBackend} shadow triangles left reviewed band: ${metrics.shadowTriangles}`,
        );
      } finally {
        renderer.dispose();
        await cache.retire();
        await sources.retire();
      }
    });
  }
});
