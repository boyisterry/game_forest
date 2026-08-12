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

test("server-renders the forest and city map workshop", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Forest Courier · World Workshop<\/title>/);
  assert.match(html, /Deep Forest/);
  assert.match(html, /Rain Harbor/);
  assert.match(html, /Forest density<\/b><em>86%<\/em>/);
  assert.match(html, /Forest density 86%[^>]*value="0\.86"|max="2\.3"/);
  assert.match(html, /Tree height/);
  assert.match(html, /Shatter on|Shatter off/);
  assert.match(html, /tufts/);
  assert.match(html, /stones/);
  assert.match(html, /Tune the forest, then hit Play/);
  assert.match(html, /href="\/demos"[^>]*>.*City model showcase/s);
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
  assert.match(settings, /shatterMode: false/);
});

test("draws the rider travel direction on the minimap", async () => {
  const [minimap, scene] = await Promise.all([
    readFile(new URL("../app/lib/map/Minimap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);
  assert.match(minimap, /travelHeading: number \| null/);
  assert.match(minimap, /const dx = Math\.sin\(frame\.travelHeading\)/);
  assert.match(minimap, /const dy = Math\.cos\(frame\.travelHeading\)/);
  assert.match(minimap, /ctx\.fillStyle = "#e58c2f"/);
  assert.match(scene, /pose\.speed < -0\.05 \? pose\.heading \+ Math\.PI : pose\.velHeading/);
  assert.match(scene, /travelHeading,/);
});

test("keeps the far field stable after first load and uses fixed crossed cards", async () => {
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
  assert.match(farField, /hasPresentedNearField/);
  assert.match(farField, /createCrossCardGeometry/);
  assert.match(farField, /groundMap\.repeat\.x \* \(plateWidth \/ CHUNK_SIZE\)/);
  assert.doesNotMatch(farField, /Math\.atan2\(camX - spot\.x/);
  assert.match(farField, /updateHorizonCards\(focusX, focusZ\)/);
  assert.match(scene, /const farReady = pending === 0/);
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
  assert.match(textures, /makeCanvasVerticallyTileable\(colorCanvas, 30\)/);
  assert.match(textures, /makeCanvasVerticallyTileable\(heightCanvas, 30\)/);
  assert.match(textures, /enableRoadAntiTiling/);
  assert.match(textures, /#include <uv_pars_fragment>/);
  assert.match(textures, /sampleRoadStochastic/);
  assert.match(textures, /vec2\( vMapUv\.x, localV \+ offsetA \)/);
  assert.match(textures, /enableGroundAntiTiling/);
  assert.match(textures, /sampleGroundStochastic/);
  assert.match(textures, /vGroundWorldPosition\.xz/);
  assert.match(textures, /sampleGroundStochastic\( normalMap \)/);
  assert.match(textures, /sampleGroundStochastic\( roughnessMap \)/);
  assert.match(assets, /roughnessMap: groundRoughnessMap/);
  assert.match(assets, /enableGroundAntiTiling\(new THREE\.MeshStandardMaterial/);
  assert.match(scene, /normalMap: roadTextures\.normalMap/);
  assert.match(scene, /roughnessMap: roadTextures\.roughnessMap/);
  assert.match(scene, /enableRoadAntiTiling\(new THREE\.MeshStandardMaterial/);
  assert.match(textures, /makeSurfaceTexture\(colorCanvas, 1, 16/);
});

test("widens road tuning and streams a camera-facing forward cap", async () => {
  const [studio, settings, manager, world, scene] = await Promise.all([
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ChunkManager.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/world.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /roadWidth: 6\.4/);
  assert.match(studio, /value=\{draft\.roadWidth\} min=\{3\} max=\{14\} step=\{0\.2\}/);
  assert.match(world, /function chunksInDirectionalRadius/);
  assert.match(manager, /chunksInDirectionalRadius\(/);
  assert.match(scene, /queueCameraFacingChunks/);
  assert.match(scene, /getWorldDirection\(this\.streamForward\)/);
});

test("uses seeded normal and roughness detail on instanced stones", async () => {
  const [textures, assets] = await Promise.all([
    readFile(new URL("../app/lib/map/textures.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
  ]);

  assert.match(textures, /createStoneTextures\(anisotropy = 4, seed = 1\)/);
  assert.match(textures, /Shallow pits catch grazing light/);
  assert.match(textures, /Mineral grains provide the high-frequency relief/);
  assert.match(textures, /buildNormalCanvas\(heightCanvas, size, 1\.45\)/);
  assert.match(assets, /const stone = createStoneTextures\(anisotropy, seed\)/);
  assert.match(assets, /const stoneMaterial = new THREE\.MeshStandardMaterial\(\{[\s\S]*normalMap: stone\.normalMap/);
  assert.match(assets, /normalScale: new THREE\.Vector2\(0\.72, 0\.72\)/);
  assert.match(assets, /roughnessMap: stone\.roughnessMap/);
});

test("keeps only large and giant stones and gives them a low-poly floating shatter state", async () => {
  const [assets, morph, collision] = await Promise.all([
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/shatterMorph.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/collision.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(assets, /tier: "small"/);
  assert.doesNotMatch(assets, /range\(random, 0\.18, 0\.42\)/);
  assert.match(assets, /range\(random, 1\.7, 2\.7\)/);
  assert.match(assets, /range\(random, 3\.5, 5\.2\)/);
  assert.match(assets, /for \(let shard = 0; shard < 92; shard \+= 1\)/);
  assert.match(assets, /stoneShardGeometry: createStoneShardGeometry\(seed\)/);
  assert.match(assets, /stoneShardMesh = new THREE\.InstancedMesh/);
  assert.match(assets, /lowestY = Math\.min\(lowestY, stoneVertex\.y\)/);
  assert.match(assets, /stone\.y = -lowestY - groundEmbed/);
  assert.match(assets, /group\.add\(stoneMesh, stoneShardMesh\)/);
  assert.match(morph, /stoneShardMeshes\?: THREE\.InstancedMesh\[\]/);
  assert.match(morph, /for \(const mesh of data\.stoneShardMeshes \?\? \[\]\) writeShatterAmount\(mesh, a\)/);
  assert.match(collision, /shardMesh\?\.setMatrixAt\(c\.index, dummy\.matrix\)/);
});

test("keeps tree structure while reducing trunk and branch triangle budgets", async () => {
  const [tree, assets, farField, treeModels] = await Promise.all([
    readFile(new URL("../app/lib/map/tree.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/farField.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/treeModels.ts", import.meta.url), "utf8"),
  ]);

  assert.match(tree, /createRippledTrunkGeometry\(height: number, radial = 7, heightSegments = 8\)/);
  assert.match(assets, /createRippledTrunkGeometry\(templates\[0\]\.trunkHeight, 7, 8\)/);
  assert.match(assets, /new THREE\.CylinderGeometry\(1, 1, 1, 3, 1, true\)/);
  assert.match(assets, /const continuousBoles = new THREE\.InstancedMesh/);
  assert.match(assets, /group\.add\(continuousBoles\)/);
  assert.match(assets, /meshes\.push\(continuousBoles\)/);
  assert.match(assets, /const boleHeight = worldHeight \* 0\.8/);
  assert.match(assets, /const boleBaseRadius = worldHeight \* 0\.045/);
  assert.match(treeModels, /function stripCentralBole/);
  assert.match(treeModels, /stripCentralBole\(normal\.wood, normal\.height\)/);
  assert.match(farField, /CylinderGeometry\(radius \* 0\.72, radius, length \* 1\.04, 3, 1, true\)/);
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
  assert.match(assets, /const trunkBarkMap = bark\.map\.clone\(\)/);
  assert.match(assets, /texture\.repeat\.set\(texture\.repeat\.x, 1\)/);
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
