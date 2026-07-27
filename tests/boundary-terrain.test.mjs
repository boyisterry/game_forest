import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  sampleBoundary,
  buildRiverGroup,
  buildNearMountainMeshes,
  BEACH_WIDTH,
  BEACH_CAP_NEAR,
  BEACH_CAP_FAR,
  FOOTHILL_WIDTH,
  STEEP_WIDTH,
  MAX_RIDEABLE_SLOPE_DEG,
  MOUNTAIN_COLLISION_INSET,
} from "../app/lib/map/boundaryTerrain.ts";
import {
  clampToWorld,
  eastBoundaryX,
  westBoundaryX,
  northBoundaryZ,
  southBoundaryZ,
  FAILSAFE_INSET,
  chunksInRadius,
  chunksInDirectionalRadius,
} from "../app/lib/map/world.ts";

const SEED = 42;

test("east cliff face: force points west (interior) and blocks above 25 degrees", () => {
  const z = Array.from({ length: 301 }, (_, i) => -1500 + i * 10).find((candidate) => {
    const foot = eastBoundaryX(candidate, SEED);
    return sampleBoundary(foot + 6, candidate, SEED).steep;
  });
  assert.notEqual(z, undefined, "east ridge contains a steep cliff face");
  const foot = eastBoundaryX(z, SEED);
  const steepX = foot + 6;
  const s = sampleBoundary(steepX, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.slopeDegrees > MAX_RIDEABLE_SLOPE_DEG);
  assert.ok(s.ax < -1, `expect strong west accel, ax=${s.ax}`);
  assert.ok(Math.abs(s.az) < Math.abs(s.ax), "east band force is mostly ±x");
});

test("mountain collision begins before the visible toe without raising playable ground", () => {
  const z = Array.from({ length: 301 }, (_, i) => -1500 + i * 10).find((candidate) => {
    const foot = eastBoundaryX(candidate, SEED);
    return sampleBoundary(foot + 6, candidate, SEED).steep;
  });
  assert.notEqual(z, undefined, "east ridge contains a steep face");
  const foot = eastBoundaryX(z, SEED);
  const guarded = sampleBoundary(foot - MOUNTAIN_COLLISION_INSET * 0.5, z, SEED);
  const interior = sampleBoundary(foot - MOUNTAIN_COLLISION_INSET - 0.25, z, SEED);
  assert.equal(guarded.steep, true, "bike body is stopped before touching the visible rock");
  assert.equal(guarded.height, 0, "collision inset does not create a raised invisible shelf");
  assert.equal(interior.steep, false, "normal playable ground remains clear inside the guard");
});

test("inside playable flat: zero force, not steep", () => {
  const s = sampleBoundary(0, 0, SEED);
  assert.equal(s.steep, false);
  assert.ok(Math.hypot(s.ax, s.az) < 0.01);
});

test("west of west foot: force points east (interior) and steep", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const x = foot - FOOTHILL_WIDTH - STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.ax > 1, `expect east accel, ax=${s.ax}`);
});

test("north of north foot: force points south", () => {
  const x = Array.from({ length: 301 }, (_, i) => -1500 + i * 10).find((candidate) => {
    const foot = northBoundaryZ(candidate, SEED);
    return sampleBoundary(candidate, foot - 6, SEED).steep;
  });
  assert.notEqual(x, undefined, "north ridge contains a steep cliff face");
  const foot = northBoundaryZ(x, SEED);
  const z = foot - 6;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az > 1, `expect south accel, az=${s.az}`);
});

test("only sparse mountain-foot approaches are at or below the 25-degree rideable limit", () => {
  let eastRideable = 0;
  let northRideable = 0;
  let samples = 0;
  for (let along = -1500; along <= 1500; along += 10) {
    const east = sampleBoundary(eastBoundaryX(along, SEED) + 6, along, SEED);
    const north = sampleBoundary(along, northBoundaryZ(along, SEED) - 6, SEED);
    assert.equal(east.steep, east.slopeDegrees > MAX_RIDEABLE_SLOPE_DEG);
    assert.equal(north.steep, north.slopeDegrees > MAX_RIDEABLE_SLOPE_DEG);
    eastRideable += Number(!east.steep);
    northRideable += Number(!north.steep);
    samples += 1;
  }
  const eastFraction = eastRideable / samples;
  const northFraction = northRideable / samples;
  assert.ok(eastFraction >= 0.05 && eastFraction <= 0.18, `east access remains sparse: ${eastFraction}`);
  assert.ok(northFraction >= 0.05 && northFraction <= 0.18, `north access remains sparse: ${northFraction}`);
});

test("south of south foot: force points north", () => {
  const x = 0;
  const foot = southBoundaryZ(x, SEED);
  const z = foot + FOOTHILL_WIDTH + STEEP_WIDTH * 0.5;
  const s = sampleBoundary(x, z, SEED);
  assert.equal(s.steep, true);
  assert.ok(s.az < -1, `expect north accel, az=${s.az}`);
});

test("failsafe clamp allows foothill/steep entry but stops mid-upper slope", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const deep = foot + FOOTHILL_WIDTH + STEEP_WIDTH + 40; // past steep band
  const c = clampToWorld(deep, z, SEED, FAILSAFE_INSET);
  assert.ok(c.x < deep, "clamps back from beyond steep");
  assert.ok(c.x > foot + FOOTHILL_WIDTH, "still past foot — not a flat-grass wall");
});

test("beach speed cap falls from ~6 km/h at foot to ~1 km/h at waterline (west)", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const atFoot = sampleBoundary(foot - 0.5, z, SEED);
  const atMid = sampleBoundary(foot - BEACH_WIDTH * 0.5, z, SEED);
  const atWater = sampleBoundary(foot - BEACH_WIDTH + 0.01, z, SEED);
  assert.ok(atFoot.speedCap <= BEACH_CAP_NEAR + 0.01, `foot cap ~near, got ${atFoot.speedCap}`);
  assert.ok(atMid.speedCap < atFoot.speedCap, `cap drops toward water: ${atMid.speedCap} < ${atFoot.speedCap}`);
  assert.ok(atWater.speedCap <= BEACH_CAP_FAR + 0.05, `waterline cap ~far, got ${atWater.speedCap}`);
  assert.ok(Math.hypot(atFoot.ax, atFoot.az) < 0.01, "beach exerts no push force");
  assert.equal(atFoot.steep, false, "beach is not a hard block");
});

test("open water (west, past beach) is a steep hard wall shoving east", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  const inWater = sampleBoundary(foot - BEACH_WIDTH - 10, z, SEED);
  assert.equal(inWater.steep, true, "open water is steep");
  assert.ok(inWater.ax > 10, `water shoves east (interior), ax=${inWater.ax}`);
});

test("mountain ruggedness produces varied heights along the east ridge", () => {
  const z1 = 200;
  const z2 = 900;
  const foot1 = eastBoundaryX(z1, SEED);
  const foot2 = eastBoundaryX(z2, SEED);
  const deep = FOOTHILL_WIDTH + STEEP_WIDTH * 0.8;
  const h1 = sampleBoundary(foot1 + deep, z1, SEED).height;
  const h2 = sampleBoundary(foot2 + deep, z2, SEED).height;
  assert.ok(h1 > 8 && h1 < 75, `height in range, got ${h1}`);
  assert.ok(h2 > 8 && h2 < 75, `height in range, got ${h2}`);
  assert.ok(Math.abs(h1 - h2) > 3, `ruggedness varies along the ridge: ${h1} vs ${h2}`);
});

test("terrain height is 0 at the foot line (smooth playable transition)", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const atFoot = sampleBoundary(foot + 0.01, z, SEED);
  assert.ok(atFoot.height < 0.5, `height ~0 at foot, got ${atFoot.height}`);
});

test("north ridge gradient sign: height rises outward (−z), so gz is negative", () => {
  const x = 0;
  const foot = northBoundaryZ(x, SEED);
  const justInside = sampleBoundary(x, foot + 0.01, SEED);   // foot+eps in z = just inside (playable)
  const aBitOut = sampleBoundary(x, foot - 8, SEED);          // foot-8 in z = into the north band
  // Going outward (z decreasing), height should increase → ∂h/∂z < 0 → gz negative.
  assert.ok(aBitOut.height > justInside.height, `height rises outward: ${aBitOut.height} > ${justInside.height}`);
  assert.ok(aBitOut.gz < 0, `gz negative outward (−z), got ${aBitOut.gz}`);
});

test("east ridge gradient sign: height rises outward (+x), so gx is positive", () => {
  const z = 0;
  const foot = eastBoundaryX(z, SEED);
  const aBitOut = sampleBoundary(foot + 8, z, SEED);
  assert.ok(aBitOut.gx > 0, `gx positive outward (+x), got ${aBitOut.gx}`);
});

test("south beach cap mirrors west (symmetry)", () => {
  const x = 0;
  const foot = southBoundaryZ(x, SEED);
  const atFoot = sampleBoundary(x, foot + 0.5, SEED);
  const atWater = sampleBoundary(x, foot + BEACH_WIDTH - 0.01, SEED);
  assert.ok(atFoot.speedCap <= BEACH_CAP_NEAR + 0.01, `south foot cap ~near, got ${atFoot.speedCap}`);
  assert.ok(atWater.speedCap <= BEACH_CAP_FAR + 0.05, `south waterline cap ~far, got ${atWater.speedCap}`);
  assert.ok(Math.hypot(atFoot.ax, atFoot.az) < 0.01, "south beach exerts no push force");
});

test("beach cap is monotonically decreasing toward water (west)", () => {
  const z = 0;
  const foot = westBoundaryX(z, SEED);
  let prev = Infinity;
  for (let i = 0; i < 6; i += 1) {
    const d = (i / 5) * (BEACH_WIDTH - 0.5);
    const cap = sampleBoundary(foot - d - 0.01, z, SEED).speedCap;
    assert.ok(cap <= prev + 1e-6, `cap decreasing: ${cap} <= ${prev}`);
    prev = cap;
  }
});

test("east/north past foot: speedCap is Infinity (beach cap never fires on mountains)", () => {
  const z = 0;
  const eFoot = eastBoundaryX(z, SEED);
  const eSample = sampleBoundary(eFoot + 10, z, SEED);
  assert.equal(eSample.speedCap, Infinity, "east mountain has no beach cap");
  const x = 0;
  const nFoot = northBoundaryZ(x, SEED);
  const nSample = sampleBoundary(x, nFoot - 10, SEED);
  assert.equal(nSample.speedCap, Infinity, "north mountain has no beach cap");
});

test("bank ribbon carries per-vertex grass→sand color", () => {
  const group = buildRiverGroup(SEED, 0x789663);
  const banks = group.children.filter((m) => m.geometry.getAttribute("color"));
  assert.ok(banks.length >= 2, `west+south bank meshes, got ${banks.length}`);
  for (const bank of banks) {
    const pos = bank.geometry.getAttribute("position");
    const col = bank.geometry.getAttribute("color");
    let grass = 0;
    let sand = 0;
    // Vertices come in pairs (a = +side, b = −side) per ribbon point.
    for (let i = 0; i < pos.count; i += 2) {
      const ra = Math.hypot(pos.getX(i), pos.getZ(i));
      const rb = Math.hypot(pos.getX(i + 1), pos.getZ(i + 1));
      const aGrass = col.getX(i) < col.getY(i);
      const bGrass = col.getX(i + 1) < col.getY(i + 1);
      if (aGrass) grass += 1; else sand += 1;
      if (bGrass) grass += 1; else sand += 1;
      if (ra < rb) assert.ok(aGrass, `nearer vert is grass (pair ${i})`);
      else assert.ok(bGrass, `nearer vert is grass (pair ${i})`);
    }
    assert.ok(grass > 0 && sand > 0, `both colors present: grass=${grass} sand=${sand}`);
  }
});

test("mountain boundary is a layered low-poly peak range instead of a heightfield wall", () => {
  const group = buildNearMountainMeshes(SEED);
  const aprons = group.children.filter((child) => child.isMesh && child.name.endsWith("mountain-apron"));
  assert.equal(aprons.length, 2, "east and north have compact physics-aligned rock toes");
  for (const apron of aprons) {
    const pos = apron.geometry.getAttribute("position");
    assert.equal(pos.count, 320 * 7, "toe is narrow and cannot become a camera-sized wall");
    assert.ok(apron.geometry.getAttribute("color"), "toe carries layered rock vertex colors");
    assert.ok(apron.material.map, "toe uses a procedural rock color map");
    assert.ok(apron.material.normalMap, "toe uses rock surface normals");
    assert.equal(apron.material.normalMap.image.width, 256, "mountain normal map is redrawn at 256px");
    assert.ok(apron.material.roughnessMap, "toe uses a rock roughness map");
    const minimumY = Math.min(...Array.from({ length: pos.count }, (_, i) => pos.getY(i)));
    assert.ok(minimumY < -0.1, `toe overlap is buried below ground: ${minimumY}`);
    assert.equal(apron.material.flatShading, true, "toe matches the tree-style faceted shading");
  }

  for (const side of ["east", "north"]) {
    assert.ok(group.getObjectByName(`${side}-front-mountain-range`), `${side} front peak row exists`);
    assert.ok(group.getObjectByName(`${side}-back-mountain-range`), `${side} back peak row exists`);
  }

  const peakMeshes = [];
  group.traverse((child) => {
    if (child.isInstancedMesh && child.name.includes("mountain-peaks")) peakMeshes.push(child);
  });
  assert.equal(peakMeshes.length, 12, "two sides × two layers × three peak variants");
  assert.ok(peakMeshes.every((mesh) => mesh.count > 0), "every stagger bucket contains peaks");
  assert.ok(
    peakMeshes.every((mesh) => mesh.geometry.getAttribute("position").count === 47),
    "each peak uses a compact closed 47-vertex polyhedron",
  );
  assert.ok(
    peakMeshes.every((mesh) => mesh.geometry.index.count === 270),
    "each closed peak stays at 90 triangles",
  );

  const matrix = new Matrix4();
  const scale = new Vector3();
  const position = new Vector3();
  const rotation = new Quaternion();
  const peakHeights = [];
  for (const mesh of peakMeshes) {
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      peakHeights.push(scale.y);
    }
  }
  const minHeight = Math.min(...peakHeights);
  const maxHeight = Math.max(...peakHeights);
  assert.ok(maxHeight - minHeight > 25, `peak skyline has substantial high/low relief: ${minHeight}..${maxHeight}`);
});

test("camera-facing streaming adds only a one-chunk forward cap", () => {
  const focus = { cx: 0, cz: 0 };
  const base = chunksInRadius(focus, 2);
  const eastFacing = chunksInDirectionalRadius(focus, 2, 1, 0);
  assert.ok(eastFacing.length > base.length, "camera direction adds forward chunks");
  assert.ok(eastFacing.some((coord) => coord.cx === 3 && coord.cz === 0), "one extra east region is queued");
  assert.ok(!eastFacing.some((coord) => coord.cx === -3 && coord.cz === 0), "back edge is not expanded");
});
