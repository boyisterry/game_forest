import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const probePath = new URL("../scripts/perf-probe-map-lod-stages.mjs", import.meta.url);
const baselinePath = new URL("./fixtures/city-map-lod-stages-baseline.json", import.meta.url);

const REVIEWED_HEAVY_TEMPLATES = new Set([
  "shopping-mall",
  "amusement-park",
  "city-center",
  "city-park",
  "sports-center",
  "fire-station",
  "office-campus",
  "residential-building",
]);

function compactStage(stage) {
  return [
    stage.meshCount,
    stage.triangles,
    stage.materialKeyCount,
    stage.solidCollisionTriangles,
    stage.surfaceCollisionTriangles,
  ];
}

test("all factory templates preserve the reviewed three-stage mapLod baseline", async () => {
  const [{ stdout }, baselineText] = await Promise.all([
    execFileAsync(process.execPath, ["--experimental-strip-types", probePath.pathname], {
      maxBuffer: 8 * 1024 * 1024,
    }),
    readFile(baselinePath, "utf8"),
  ]);
  const report = JSON.parse(stdout);
  const baseline = JSON.parse(baselineText);
  assert.equal(report.factoryTemplateCount, 32);
  assert.deepEqual(report.skipped, [{
    catalogId: "street-tree",
    reason: "external-model:tree_normal_medium_redwood_a",
  }]);
  const compact = report.rows.map((row) => ({
    id: row.catalogId,
    pre: compactStage(row.preOptimization),
    optimized: compactStage(row.postOptimization),
    map: compactStage(row.postMapLod),
  }));
  assert.deepEqual(compact, baseline,
    "mesh/triangle/material/collision changes require an explicit per-template baseline review");

  for (const row of report.rows) {
    assert.equal(row.postOptimization.solidCollisionTriangles, row.preOptimization.solidCollisionTriangles,
      `${row.catalogId} static optimization changed solid collision authority`);
    assert.equal(row.postOptimization.surfaceCollisionTriangles, row.preOptimization.surfaceCollisionTriangles,
      `${row.catalogId} static optimization changed surface collision authority`);
    assert.ok(row.postMapLod.meshCount <= row.postOptimization.meshCount,
      `${row.catalogId} mapLod increased visible mesh count`);
    assert.ok(row.postMapLod.triangles <= row.postOptimization.triangles,
      `${row.catalogId} mapLod increased visible triangles`);
    assert.ok(row.postMapLod.materialKeyCount <= row.postOptimization.materialKeyCount,
      `${row.catalogId} mapLod increased visible material keys`);
    if (REVIEWED_HEAVY_TEMPLATES.has(row.catalogId)) {
      assert.ok(
        row.postMapLod.meshCount < row.postOptimization.meshCount
          || row.postMapLod.triangles < row.postOptimization.triangles,
        `${row.catalogId} reviewed mapLod no longer strips any visible work`,
      );
    }
  }
});
