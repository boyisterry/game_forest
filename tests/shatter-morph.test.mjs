import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  BLAST_DURATION,
  GATHER_DURATION,
  ShatterMorphController,
  easeInCubic,
  easeOutExpo,
  treeScaleForAmount,
} from "../app/lib/map/shatterMorph.ts";

describe("shatter morph easing", () => {
  it("easeOutExpo starts fast (direct blast, not wind-up)", () => {
    assert.equal(easeOutExpo(0), 0);
    assert.equal(easeOutExpo(1), 1);
    // Early frames already cover a large fraction of travel.
    assert.ok(easeOutExpo(0.15) > 0.55);
    assert.ok(easeOutExpo(0.15) > easeInCubic(0.15));
  });

  it("tree pops then vanishes while blasting", () => {
    assert.equal(treeScaleForAmount(0, true), 1);
    assert.ok(treeScaleForAmount(0.04, true) > 1);
    assert.equal(treeScaleForAmount(0.2, true), 0);
    assert.equal(treeScaleForAmount(1, true), 0);
  });

  it("tree reappears while gathering", () => {
    assert.equal(treeScaleForAmount(1, false), 0);
    assert.ok(treeScaleForAmount(0.2, false) > 0.5);
    assert.equal(treeScaleForAmount(0, false), 1);
  });
});

describe("ShatterMorphController", () => {
  it("blasts open with easeOutExpo timing", () => {
    const morph = new ShatterMorphController(0);
    morph.animateTo(true);
    assert.equal(morph.isBusy(), true);
    morph.update(BLAST_DURATION * 0.15);
    assert.ok(morph.getAmount() > 0.55);
    morph.update(BLAST_DURATION);
    assert.equal(morph.isBusy(), false);
    assert.equal(morph.getAmount(), 1);
  });

  it("gathers closed slower than the blast punch", () => {
    const morph = new ShatterMorphController(1);
    morph.animateTo(false);
    morph.update(GATHER_DURATION * 0.15);
    // easeInCubic stays small early — opposite of blast.
    assert.ok(morph.getAmount() > 0.85);
    morph.update(GATHER_DURATION);
    assert.equal(morph.getAmount(), 0);
  });

  it("snap jumps without staying busy", () => {
    const morph = new ShatterMorphController(0);
    morph.snap(1);
    assert.equal(morph.getAmount(), 1);
    assert.equal(morph.isBusy(), false);
  });
});

describe("tree restoration demo", () => {
  it("registers normal GLBs separately from the shattered source pack", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../public/models/forest/manifest.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(manifest.groups.tree_large, [
      "tree_normal_large_redwood_a",
      "tree_normal_large_ancient_a",
      "tree_normal_large_redwood_b",
    ]);
    assert.deepEqual(manifest.groups.tree_medium, [
      "tree_normal_medium_redwood_a",
      "tree_normal_medium_ancient_a",
      "tree_normal_medium_redwood_b",
    ]);
    assert.deepEqual(manifest.groups.tree_small, [
      "tree_normal_small_redwood_a",
      "tree_normal_small_ancient_a",
    ]);
    assert.equal(manifest.groups.tree_shattered_large[0], "tree_large_redwood_a");

    const normalEntries = manifest.assets.filter((asset) => asset.state === "normal");
    assert.equal(normalEntries.length, 8);
    for (const entry of normalEntries) {
      const glb = await readFile(new URL(`../public/models/forest/${entry.file}`, import.meta.url));
      assert.ok(glb.byteLength > 100_000, `${entry.file} should contain exported geometry`);
      assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
    }
  });

  it("pairs normal map trees with the matching real shattered GLBs", async () => {
    const [loader, assets, morph, world] = await Promise.all([
      readFile(new URL("../app/lib/map/treeModels.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/map/forestAssets.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/map/shatterMorph.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/map/world.ts", import.meta.url), "utf8"),
    ]);
    assert.match(loader, /const activeGroupNames = \["tree_large", "tree_medium", "tree_small"\]/);
    assert.match(loader, /const shatterGroupNames = \["tree_shattered_large", "tree_shattered_medium", "tree_shattered_small"\]/);
    assert.match(loader, /manifest\.assets\.filter\(\(entry\) => activeIds\.has\(entry\.id\)\)/);
    assert.match(loader, /normal\.shatterWood = buildShatterGeometry\(shattered\.wood/);
    assert.match(loader, /normal\.shatterLeaves = buildShatterGeometry\(shattered\.leaves/);
    assert.match(loader, /const WOOD_KEEP_RATIO = 0\.7/);
    assert.match(loader, /const WOOD_FRAGMENT_SCALE = 1\.2/);
    assert.match(loader, /const LEAF_KEEP_RATIO = 0\.58/);
    assert.match(loader, /const LEAF_FRAGMENT_SCALE = 0\.82/);
    assert.match(loader, /const SHATTER_SPREAD = 1\.5/);
    assert.match(loader, /geometry\.setAttribute\("shardBlast"/);
    assert.match(loader, /const directionMode = hash\(seed \+ 8\)/);
    assert.match(loader, /const falls = directionMode >= 0\.24 && directionMode < 0\.48/);
    assert.match(loader, /Math\.max\(0\.12, clusteredHome\.y \+ verticalTravel \* SHATTER_SPREAD\)/);
    assert.match(loader, /const clusteredHome = new THREE\.Vector3/);
    assert.match(assets, /new THREE\.InstancedMesh\(\s*template\.shatterWood/);
    assert.match(assets, /modelShardWoodMaterial: enableShatterMaterial/);
    assert.doesNotMatch(assets, /placePool\(pack\.small/);
    assert.doesNotMatch(assets, /placePool\(pack\.shrub/);
    assert.doesNotMatch(assets, /placePool\(pack\.stump/);
    assert.doesNotMatch(assets, /placePool\(pack\.branch/);
    assert.doesNotMatch(assets, /function addForestProps/);
    assert.match(loader, /const pool = scale >= 1\.8 \? pack\.large : pack\.medium/);
    assert.doesNotMatch(loader, /pack\.medium : pack\.small/);
    assert.match(world, /return range\(random, 0\.98, 1\.3\)/);
    assert.doesNotMatch(world, /range\(random, 0\.68, 0\.96\)/);
    assert.doesNotMatch(assets, /SHARDS_PER_TREE/);
    assert.match(morph, /attribute vec3 shardCenter/);
    assert.match(morph, /rotateShard\(shardLocalPosition/);
    assert.match(morph, /forestShardHash\(shardTreeOrigin/);
    assert.match(morph, /instanceMatrix\[3\]\.xz/);
    assert.match(morph, /shardVerticalBias = mix\(-0\.58, 0\.52/);
    assert.match(morph, /uniform\.value = amount/);
  });

  it("keeps repaired tree and real GLB shards as separate end states", async () => {
    const demo = await readFile(
      new URL("../public/demos/shatter-morph-tree.html", import.meta.url),
      "utf8",
    );
    assert.match(demo, /NORMAL_TREE_URL = "\/models\/forest\/tree_normal_large_redwood_a\.glb"/);
    assert.match(demo, /SHATTER_TREE_URL = "\/models\/forest\/tree_large_redwood_a\.glb"/);
    assert.match(demo, /const WOOD_KEEP_RATIO = 0\.7/);
    assert.match(demo, /const WOOD_FRAGMENT_SCALE = 1\.2/);
    assert.match(demo, /const repairedRoot = new THREE\.Group\(\)/);
    assert.match(demo, /const shardRoot = new THREE\.Group\(\)/);
    assert.match(demo, /function installNormalTree\(root\)/);
    assert.match(demo, /function buildChunks\(stream, material, bounds, kind, seedBase\)/);
    assert.match(demo, /slice\(0, Math\.round\(bucketEntries\.length \* WOOD_KEEP_RATIO\)\)/);
    assert.match(demo, /repairedRoot\.visible = treeFade > 0\.002/);
    assert.match(demo, /chunk\.mesh\.position\.lerpVectors\(chunk\.repairPos, chunk\.blastPos, local\)/);
    assert.match(demo, /\(0\.48 \+ shardReveal \* 0\.52\) \* chunk\.fragmentScale/);
    assert.match(demo, /两个端态拥有独立、语义正确的模型/);
  });

  it("provides a reversible normal-mapped stone grinding demo", async () => {
    const demo = await readFile(
      new URL("../public/demos/stone-grind.html", import.meta.url),
      "utf8",
    );
    assert.match(demo, /<title>石头磨碎与重组 Demo<\/title>/);
    assert.match(demo, /const FRAGMENT_COUNT = 92/);
    assert.match(demo, /const DUST_COUNT = 360/);
    assert.match(demo, /function makeStoneTextures\(size = 256\)/);
    assert.match(demo, /normalMap: textures\.normalMap/);
    assert.match(demo, /roughnessMap: textures\.roughnessMap/);
    assert.match(demo, /distortGeometry\(new THREE\.TetrahedronGeometry\(1, 0\), 0\.18, 9\.3\)/);
    assert.doesNotMatch(demo, /DodecahedronGeometry\(1, 0\)/);
    assert.doesNotMatch(demo, /TetrahedronGeometry\(1, 1\)/);
    assert.doesNotMatch(demo, /OctahedronGeometry\(1, 1\)/);
    assert.match(demo, /const easeOutCubic = \(value\) => 1 - Math\.pow\(1 - clamp01\(value\), 3\)/);
    assert.match(demo, /const floatClusters = \[/);
    assert.match(demo, /fragment\.mesh\.position\.lerpVectors\(fragment\.start, fragment\.end, local\)/);
    assert.doesNotMatch(demo, /Math\.max\(0\.12, size/);
    assert.match(demo, /end\.y = Math\.max\(1\.05 \+ size, end\.y\)/);
    assert.match(demo, /amount > 0\.999 \? "悬浮碎石" : "完整岩石"/);
    assert.match(demo, /状态：<strong>\$\{label\}<\/strong>/);
    assert.match(demo, /磨碎石头/);
    assert.match(demo, /重组石头/);
  });
});
