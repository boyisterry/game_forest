import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the forest map studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>林间速递 · 地图工坊<\/title>/);
  assert.match(html, /森林密度<\/b><em>86%<\/em>/);
  assert.match(html, /森林密度 86%[^>]*value="0\.86"|max="2\.3"/);
  assert.match(html, /树木高度/);
  assert.match(html, /簇草/);
  assert.match(html, /块石/);
  assert.match(html, /西侧与南侧以河流封边，北侧与东侧以连续山脉封边/);
  assert.match(html, /DEEP FOREST CANOPY/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("keeps grass and rocks inside every streamed forest chunk", async () => {
  const [forestAssets, manager, settings] = await Promise.all([
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ChunkManager.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(forestAssets, /createGrassGeometry/);
  assert.match(forestAssets, /createBroadleafWeedGeometry/);
  assert.match(forestAssets, /writeGrassLayer\(assets\.grassGeometry/);
  assert.match(forestAssets, /new THREE\.InstancedMesh\(assets\.weedGeometry/);
  assert.match(forestAssets, /const inDeepForest = distance >= roadWidth \* 9/);
  assert.match(forestAssets, /inDeepForest && random\(\) < 0\.34/);
  assert.match(forestAssets, /grassCount: microPlacements\.length \+ tallPlacements\.length \+ weedPlacements\.length/);
  assert.match(forestAssets, /stoneCount: stonePlacements\.length/);
  assert.match(manager, /grassCount: built\.grassCount/);
  assert.match(manager, /stoneCount: built\.stoneCount/);
  assert.match(settings, /forestDensity: 0\.86/);
  assert.match(settings, /treeHeightScale: 1\.55/);
});

test("derives distant geometry from current trees and hides it during refresh", async () => {
  const [farField, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/farField.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);

  assert.match(farField, /treeLayer\.visible = false/);
  assert.match(farField, /describeTree\(random/);
  assert.match(farField, /createLeafGeometry\(\)/);
  assert.match(farField, /mergeGeometries\(leafParts/);
  assert.match(farField, /cluster\.radius \* range\(random, 1\.65, 2\.25\)/);
  assert.match(farField, /dummy\.scale\.set\(spot\.scale, spot\.scale \* spot\.heightScale, spot\.scale\)/);
  assert.match(scene, /chunks\.getStats\(\)\.pending === 0/);
  assert.doesNotMatch(farField, /CanvasTexture|PlaneGeometry\(1, 1\)/);
  assert.doesNotMatch(farField, /spot\.scale \* fade/);
});

test("renders a season-aware procedural sky behind the forest", async () => {
  const [sky, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/sky.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);

  assert.match(sky, /class ProceduralSky/);
  assert.match(sky, /uZenith/);
  assert.match(sky, /sunDisc/);
  assert.match(sky, /cloudNoise/);
  assert.match(sky, /depthWrite: false/);
  assert.match(sky, /setSeason\(season: Season\)/);
  assert.match(scene, /this\.sky\.follow\(this\.camera\)/);
  assert.match(scene, /this\.sky\.setSeason\(settings\.season\)/);
});
