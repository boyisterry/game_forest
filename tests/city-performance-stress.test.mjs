import assert from "node:assert/strict";
import test from "node:test";

import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import {
  CITY_PERFORMANCE_STRESS_COLUMNS,
  CITY_PERFORMANCE_STRESS_GAP_METERS,
  computeCityPerformanceCameraFit,
  createCityPerformanceStressFixture,
  createCityPerformanceStressDocument,
  isCityPerformanceStressMultiplier,
} from "../app/lib/map/cityPerformanceStress.ts";
import { parseCityMapDocument } from "../app/lib/map/cityDocument.ts";
import { validateCityRoadGraph } from "../app/lib/map/cityRoadGraph.ts";

test("city performance stress documents spatially replicate the complete Cedar city", () => {
  const cedar = createCedarCrossingDocument();
  for (const multiplier of [1, 10, 20]) {
    const fixture = createCityPerformanceStressFixture(cedar, multiplier);
    const stress = fixture.document;
    assert.equal(stress.placements.length, cedar.placements.length * multiplier);
    assert.equal(stress.graph.nodes.length, cedar.graph.nodes.length * multiplier);
    assert.equal(stress.graph.edges.length, cedar.graph.edges.length * multiplier);
    assert.equal(
      Object.keys(stress.graph.intersectionOverrides).length,
      Object.keys(cedar.graph.intersectionOverrides).length * multiplier,
    );
    assert.deepEqual(stress.spawn, cedar.spawn);
    assert.equal(new Set(stress.placements.map((placement) => placement.id)).size, stress.placements.length);
    assert.equal(new Set(stress.graph.nodes.map((node) => node.id)).size, stress.graph.nodes.length);
    assert.equal(new Set(stress.graph.edges.map((edge) => edge.id)).size, stress.graph.edges.length);
    validateCityRoadGraph(structuredClone(stress.graph));
    assert.deepEqual(parseCityMapDocument(structuredClone(stress)).document, stress);
    assert.equal(fixture.replicas.length, multiplier);
    assert.deepEqual(fixture.cameraRoute.map((route) => route.durationSeconds), [8, 12, 10]);
    assert.ok(Object.isFrozen(stress));
    assert.ok(Object.isFrozen(stress.placements));
  }
  assert.deepEqual(createCityPerformanceStressDocument(cedar, 20), createCityPerformanceStressFixture(cedar, 20).document);
  assert.equal(isCityPerformanceStressMultiplier(1), true);
  assert.equal(isCityPerformanceStressMultiplier(10), true);
  assert.equal(isCityPerformanceStressMultiplier(20), true);
  assert.equal(isCityPerformanceStressMultiplier(2), false);
});

test("20x fixture uses a deterministic 5x4 grid with a 40m clear gap", () => {
  const cedar = createCedarCrossingDocument();
  const fixture = createCityPerformanceStressFixture(cedar, 20);
  const strideX = fixture.sourceBounds.width + CITY_PERFORMANCE_STRESS_GAP_METERS;
  const strideZ = fixture.sourceBounds.depth + CITY_PERFORMANCE_STRESS_GAP_METERS;
  for (const replica of fixture.replicas) {
    assert.equal(replica.column, replica.index % CITY_PERFORMANCE_STRESS_COLUMNS);
    assert.equal(replica.row, Math.floor(replica.index / CITY_PERFORMANCE_STRESS_COLUMNS));
    assert.equal(replica.offsetX, replica.column * strideX);
    assert.equal(replica.offsetZ, replica.row * strideZ);
  }
  assert.deepEqual(
    fixture.replicas.map((replica) => [replica.column, replica.row]),
    Array.from({ length: 20 }, (_, index) => [index % 5, Math.floor(index / 5)]),
  );

  const second = fixture.replicas[1];
  const sourcePlacement = cedar.placements[0];
  const translatedPlacement = fixture.document.placements[cedar.placements.length];
  assert.equal(translatedPlacement.id, `${second.prefix}${sourcePlacement.id}`);
  if (sourcePlacement.poseKind === "grid" && translatedPlacement.poseKind === "grid") {
    assert.equal(translatedPlacement.i, sourcePlacement.i + strideX);
    assert.equal(translatedPlacement.j, sourcePlacement.j);
  } else {
    assert.fail("the first Cedar placement should use the grid pose contract");
  }

  const sourceNode = cedar.graph.nodes[0];
  const translatedNode = fixture.document.graph.nodes[cedar.graph.nodes.length];
  assert.deepEqual(translatedNode, {
    ...sourceNode,
    id: `${second.prefix}${sourceNode.id}`,
    x: sourceNode.x + strideX,
    z: sourceNode.z,
  });
  const sourceEdge = cedar.graph.edges[0];
  const translatedEdge = fixture.document.graph.edges[cedar.graph.edges.length];
  assert.equal(translatedEdge.id, `${second.prefix}${sourceEdge.id}`);
  assert.equal(translatedEdge.a, `${second.prefix}${sourceEdge.a}`);
  assert.equal(translatedEdge.b, `${second.prefix}${sourceEdge.b}`);
  assert.deepEqual(
    fixture.worldBounds,
    {
      minX: fixture.sourceBounds.minX,
      minZ: fixture.sourceBounds.minZ,
      maxX: fixture.sourceBounds.maxX + 4 * strideX,
      maxZ: fixture.sourceBounds.maxZ + 3 * strideZ,
      width: fixture.sourceBounds.width + 4 * strideX,
      depth: fixture.sourceBounds.depth + 3 * strideZ,
      centerX: (fixture.sourceBounds.minX + fixture.sourceBounds.maxX + 4 * strideX) / 2,
      centerZ: (fixture.sourceBounds.minZ + fixture.sourceBounds.maxZ + 3 * strideZ) / 2,
    },
  );

  const fit = computeCityPerformanceCameraFit(fixture.worldBounds, 42, 16 / 9);
  assert.equal(fit.targetX, fixture.worldBounds.centerX);
  assert.equal(fit.targetZ, fixture.worldBounds.centerZ);
  assert.ok(fit.cameraY > 180, "fit height must derive from bounds rather than the old fixed 180m");
  assert.ok(fit.near >= 0.5);
  assert.ok(fit.far > fit.distance);
  assert.throws(() => computeCityPerformanceCameraFit(fixture.worldBounds, 0, 1), /verticalFovDegrees/);
  assert.throws(() => computeCityPerformanceCameraFit(fixture.worldBounds, 42, 0), /aspect/);
});
