import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, SphereGeometry } from "three";

import { CITY_CATALOG } from "../app/lib/map/cityCatalog.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import {
  compileCollisionSource,
  deserializeCompiledCollision,
  serializeCompiledCollision,
} from "../app/lib/map/cityCollisionCompileCore.ts";
import { BIKE_COLLISION_HEIGHT_METERS, BIKE_COLLISION_RADIUS_METERS } from "../app/lib/map/cityCollisionTypes.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import { createCityTemplateCache } from "../app/lib/map/cityTemplateCache.ts";
import { createCityVisualLayerManager } from "../app/lib/map/cityVisualLayerManager.ts";

const BUILDING_ASSETS = CITY_CATALOG.filter((entry) => entry.category !== "decoration");
const DECORATION_ASSETS = CITY_CATALOG.filter((entry) => entry.category === "decoration");
const CROSS_SECTION_SAMPLES = 33;

function sweepDirection(runtime, bounds, direction) {
  const margin = BIKE_COLLISION_RADIUS_METERS + 2;
  const hits = [];
  for (let index = 0; index < CROSS_SECTION_SAMPLES; index += 1) {
    const fraction = index / (CROSS_SECTION_SAMPLES - 1);
    const alongX = bounds.minX + (bounds.maxX - bounds.minX) * fraction;
    const alongZ = bounds.minZ + (bounds.maxZ - bounds.minZ) * fraction;
    let startX;
    let startZ;
    let deltaX;
    let deltaZ;
    switch (direction) {
      case "west":
        startX = bounds.minX - margin;
        startZ = alongZ;
        deltaX = bounds.maxX - bounds.minX + margin * 2;
        deltaZ = 0;
        break;
      case "east":
        startX = bounds.maxX + margin;
        startZ = alongZ;
        deltaX = -(bounds.maxX - bounds.minX + margin * 2);
        deltaZ = 0;
        break;
      case "north":
        startX = alongX;
        startZ = bounds.minZ - margin;
        deltaX = 0;
        deltaZ = bounds.maxZ - bounds.minZ + margin * 2;
        break;
      case "south":
        startX = alongX;
        startZ = bounds.maxZ + margin;
        deltaX = 0;
        deltaZ = -(bounds.maxZ - bounds.minZ + margin * 2);
        break;
      default:
        throw new Error(`unknown sweep direction: ${direction}`);
    }
    const result = runtime.querySweep({
      startX,
      startZ,
      deltaX,
      deltaZ,
      minY: 0,
      maxY: BIKE_COLLISION_HEIGHT_METERS,
      radius: BIKE_COLLISION_RADIUS_METERS,
    });
    if (result.hit) hits.push(result.hit);
  }
  return hits;
}

test("every building and campus catalog asset blocks the full rider envelope from four directions", async (t) => {
  const sources = createCatalogSourceRegistry();
  const cache = createCityTemplateCache({
    sources,
    layers: createCityVisualLayerManager(),
  });
  try {
    for (const entry of BUILDING_ASSETS) {
      await t.test(entry.id, async () => {
        const packed = await cache.createCollisionCompileSource({ kind: "catalog", catalogId: entry.id });
        const compiled = deserializeCompiledCollision(serializeCompiledCollision(
          await compileCollisionSource(packed),
        ));
        const runtime = new CompiledCityCollisionRuntime([{
          ownerId: entry.id,
          ownerGeneration: 1,
          source: compiled,
        }]);
        const bounds = runtime.getOwnerWorldBounds(entry.id);
        assert.ok(bounds, `${entry.id} must expose compiled solid bounds`);
        assert.ok(bounds.maxY > 0, `${entry.id} collision must rise above terrain`);
        for (const direction of ["west", "east", "north", "south"]) {
          const hits = sweepDirection(runtime, bounds, direction);
          assert.ok(
            hits.length > 0,
            `${entry.id} must block at least one rider-height cross-section from ${direction}`,
          );
          assert.ok(
            hits.every((hit) => hit.ownerId === entry.id),
            `${entry.id} sweep must retain stable owner identity`,
          );
        }
      });
    }
  } finally {
    await cache.retire();
    await sources.retire();
  }
});

test("every city decoration and derived traffic light exposes rider-height collision", async (t) => {
  const wood = new BoxGeometry(0.8, 4, 0.8);
  const leaves = new SphereGeometry(2);
  const sources = createCatalogSourceRegistry({
    modelPack: {
      all: [{
        id: "tree_normal_medium_redwood_a",
        wood,
        showroomWood: wood,
        leaves,
      }],
    },
  });
  const cache = createCityTemplateCache({
    sources,
    layers: createCityVisualLayerManager(),
  });
  const assets = [
    ...DECORATION_ASSETS.map((entry) => ({ id: entry.id, source: { kind: "catalog", catalogId: entry.id } })),
    { id: "traffic-light", source: { kind: "derived", templateId: "traffic-light" } },
  ];
  try {
    for (const asset of assets) {
      await t.test(asset.id, async () => {
        const packed = await cache.createCollisionCompileSource(asset.source);
        const compiled = deserializeCompiledCollision(serializeCompiledCollision(
          await compileCollisionSource(packed),
        ));
        const runtime = new CompiledCityCollisionRuntime([{
          ownerId: asset.id,
          ownerGeneration: 1,
          source: compiled,
        }]);
        const bounds = runtime.getOwnerWorldBounds(asset.id);
        assert.ok(bounds, `${asset.id} must expose compiled solid bounds`);
        const directionHitCounts = ["west", "east", "north", "south"]
          .map((direction) => sweepDirection(runtime, bounds, direction).length);
        assert.ok(
          directionHitCounts.every((count) => count > 0),
          `${asset.id} must collide from all four directions; hits=${directionHitCounts.join(",")}`,
        );
      });
    }
  } finally {
    await cache.retire();
    await sources.retire();
    wood.dispose();
    leaves.dispose();
  }
});
