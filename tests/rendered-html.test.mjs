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
  assert.match(html, /<title>Forest Courier · Map Workshop<\/title>/);
  assert.match(html, /Forest density<\/b><em>86%<\/em>/);
  assert.match(html, /Forest density 86%[^>]*value="0\.86"|max="2\.3"/);
  assert.match(html, /Tree height/);
  assert.match(html, /tufts/);
  assert.match(html, /stones/);
  assert.match(html, /Tune the forest, then hit Play/);
  assert.match(html, /DEEP FOREST CANOPY/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("keeps rocks inside every streamed forest chunk", async () => {
  const [forestAssets, manager, settings] = await Promise.all([
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ChunkManager.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/types.ts", import.meta.url), "utf8"),
  ]);

  // Ground cover is texture-only now; seeded stones still spawn in deep forest.
  assert.match(forestAssets, /const inDeepForest = distance >= roadWidth \* 9/);
  assert.match(forestAssets, /inDeepForest && random\(\) < 0\.34/);
  assert.match(forestAssets, /grassCount: 0/);
  assert.match(forestAssets, /stoneCount: stonePlacements\.length/);
  assert.match(manager, /grassCount: built\.grassCount/);
  assert.match(manager, /stoneCount: built\.stoneCount/);
  assert.match(settings, /forestDensity: 0\.86/);
  assert.match(settings, /treeHeightScale: 1\.55/);
});

test("layers distant geometry and horizon cards while hiding both during refresh", async () => {
  const [farField, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/farField.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);

  assert.match(farField, /treeLayer\.visible = false/);
  assert.match(farField, /cardLayer\.visible = false/);
  assert.match(farField, /describeTree\(random/);
  assert.match(farField, /createLeafGeometry\(\)/);
  assert.match(farField, /mergeGeometries\(leafParts/);
  assert.match(farField, /cluster\.radius \* radiusScale \* range\(random, 1\.15, 1\.55\)/);
  assert.match(farField, /createTreeCardAtlas/);
  assert.match(farField, /updateHorizonCards\(focusX, focusZ, camera\)/);
  // Ride mode uses a pending threshold so the far layer doesn't flicker at speed.
  assert.match(scene, /const farReady = this\.driveMode \? pending < 6 : pending === 0/);
  assert.match(scene, /this\.farField\?\.update\(focusX, focusZ, this\.camera, farReady\)/);
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

test("uses relief and roughness maps for grass and dirt road surfaces", async () => {
  const [textures, assets, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/textures.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);

  assert.match(textures, /createRoadTextures/);
  assert.match(textures, /Long irregular wheel channels/);
  assert.match(textures, /buildNormalCanvas\(heightCanvas, size, 1\.7\)/);
  assert.match(textures, /buildRoughnessCanvas/);
  assert.match(assets, /roughnessMap: groundRoughnessMap/);
  assert.match(scene, /normalMap: roadTextures\.normalMap/);
  assert.match(scene, /roughnessMap: roadTextures\.roughnessMap/);
  assert.match(textures, /makeSurfaceTexture\(colorCanvas, 1, 16/);
});

test("keeps tree structure while reducing trunk and branch triangle budgets", async () => {
  const [tree, assets, farField] = await Promise.all([
    readFile(new URL("../app/lib/map/tree.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/farField.ts", import.meta.url), "utf8"),
  ]);

  assert.match(tree, /createRippledTrunkGeometry\(height: number, radial = 7, heightSegments = 6\)/);
  assert.match(assets, /createRippledTrunkGeometry\(templates\[0\]\.trunkHeight, 7, 6\)/);
  assert.match(assets, /new THREE\.CylinderGeometry\(1, 1, 1, 3, 1\)/);
  assert.match(farField, /CylinderGeometry\(radius \* 0\.72, radius, length, 3, 1, false\)/);
  assert.match(farField, /CylinderGeometry\(0\.34, 0\.58, description\.trunkHeight, 4, 1, false\)/);
  assert.match(tree, /primaryLimbs: 30/);
  assert.match(tree, /segmentsPerLimb: 5/);
});

test("uses detailed shared PBR bark on trunks, branches, roots, and far wood", async () => {
  const [textures, assets, farField, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/textures.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/farField.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);

  assert.match(textures, /createBarkTextures\(anisotropy = 4, seed = 1\)/);
  assert.match(textures, /Long split channels/);
  assert.match(textures, /buildNormalCanvas\(heightCanvas, size, 0\.014\)/);
  assert.match(assets, /branchMaterial: new THREE\.MeshStandardMaterial\(\{[\s\S]*normalMap: bark\.normalMap/);
  assert.match(assets, /rootMaterial: new THREE\.MeshStandardMaterial\(\{[\s\S]*roughnessMap: bark\.roughnessMap/);
  assert.match(farField, /woodMaterial\.userData\.sharedTextures = true/);
  assert.match(scene, /barkRoughnessMap: this\.shared\.trunkMaterial\.roughnessMap/);
});

test("builds separate flares and branching old-growth root chains", async () => {
  const [tree, assets] = await Promise.all([
    readFile(new URL("../app/lib/map/tree.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
  ]);

  assert.match(assets, /function createSurfaceRootGeometry\(\)/);
  assert.match(assets, /rootGeometry: createSurfaceRootGeometry\(\)/);
  assert.match(assets, /dummy\.rotation\.set\(0, -angle, 0\)/);
  assert.match(assets, /root\.lift \* scale/);
  assert.match(assets, /roots\.receiveShadow = true/);
  assert.match(assets, /function createRootRunnerGeometry\(\)/);
  assert.match(assets, /rootRunnerGeometry: createRootRunnerGeometry\(\)/);
  assert.match(assets, /dummy\.quaternion\.setFromUnitVectors\(rootAxis, delta\.normalize\(\)\)/);
  assert.match(assets, /tree\.description\.rootSegments\.length/);
  assert.match(assets, /for \(const segment of description\.rootSegments\)/);
  assert.match(assets, /group\.add\(trunks, buttresses, roots, rootRunners, branches, leaves, tipLeaves\)/);
  assert.doesNotMatch(assets, /rootGeometry: new THREE\.ConeGeometry/);
  assert.match(assets, /new THREE\.CylinderGeometry\(0\.55, 0\.86, 0\.9, 7, 2\)/);
  assert.match(assets, /ring\.ground \+ ring\.height \* 0\.58/);
  assert.match(tree, /rootCount: 7/);
  assert.match(tree, /rootSegments: RootRunSegment\[\]/);
  assert.match(tree, /const sectionCount = dominant \? 4 : 2/);
  assert.match(tree, /A short side root on some dominant chains/);
});
