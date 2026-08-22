import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const probePath = new URL("../scripts/perf-probe-collision-authority.mjs", import.meta.url);

test("all catalog render-proxy factories preserve exact pre/post collision packs", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    probePath.pathname,
  ], { maxBuffer: 4 * 1024 * 1024 });
  const report = JSON.parse(stdout);

  assert.equal(report.factoryCount, 17);
  assert.ok(report.totals.restoredSolidTriangles > 800_000);
  assert.ok(report.totals.restoredRideableTriangles > 10_000);
  assert.equal(report.totals.proxyCollisionMeshes, 0);
  assert.equal(report.rows.length, report.factoryCount);
  for (const row of report.rows) {
    assert.equal(row.solidPrePostExact, true, `${row.catalogId} solid collision differs`);
    assert.equal(row.surfacePrePostExact, true, `${row.catalogId} surface collision differs`);
    assert.equal(row.representativeSweepExact, true, `${row.catalogId} sweep collision differs`);
    assert.ok(row.restoredMeshes > 0, `${row.catalogId} did not exercise hidden source authority`);
  }
});
