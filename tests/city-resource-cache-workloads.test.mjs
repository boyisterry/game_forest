import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const probePath = new URL("../scripts/perf-probe-resource-cache-workloads.mjs", import.meta.url);

test("primitive cache stays effective for Cedar, spatial 20x, and the heaviest demo", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    probePath.pathname,
  ], { maxBuffer: 4 * 1024 * 1024 });
  const report = JSON.parse(stdout);

  assert.equal(report.cedar.placementCount, 126);
  assert.equal(report.distributed20x.placementCount, 2_520);
  assert.equal(report.cedar.catalogTemplateCount, 26);
  assert.equal(report.cedar.geometryObjectsBefore, 38_251);
  assert.equal(report.cedar.geometryObjectsAfter, 3_593);
  assert.equal(report.distributed20x.geometryObjectsAfter, report.cedar.geometryObjectsAfter,
    "spatial replication must not mint another canonical source working set");
  assert.equal(report.heavyDemo.geometryObjectsBefore, 10_337);
  assert.equal(report.heavyDemo.geometryObjectsAfter, 256);
  for (const workload of Object.values(report)) {
    assert.ok(workload.geometryObjectsAfter < workload.geometryObjectsBefore * 0.15);
    assert.ok(workload.attributeBytesAfter < workload.attributeBytesBefore * 0.55);
    assert.equal(workload.cacheStats.borrowers, 1);
  }
});
