import * as THREE from "three";
import { createBarkTextures, createGroundTextures, createStoneTextures } from "./textures";
import {
  colorLeaf,
  createLeafGeometry,
  createRippledTrunkGeometry,
  describeTree,
  resolvedTreeParams,
  TRUNK_BASE_RADIUS,
  type TreeDescription,
  type TreeParams,
} from "./tree";
import { createRandom, range, gaussian } from "./random";
import { CHUNK_SIZE, pickTreeScale, type ChunkCoord, chunkOrigin, chunkSeed } from "./world";
import {
  pickTreeTemplate,
  type ForestModelPack,
  type ForestModelTemplate,
} from "./treeModels";
import type { ChunkColliders, StoneCollider, TreeCollider } from "./collision";

export type SharedForestAssets = {
  trunkGeometry: THREE.CylinderGeometry;
  branchGeometry: THREE.CylinderGeometry;
  leafGeometry: THREE.BufferGeometry;
  tipGeometry: THREE.BufferGeometry;
  rootGeometry: THREE.BufferGeometry;
  rootRunnerGeometry: THREE.BufferGeometry;
  buttressGeometry: THREE.BufferGeometry;
  stoneGeometry: THREE.DodecahedronGeometry;
  platformGeometries: THREE.BufferGeometry[];
  microGrassGeometry: THREE.BufferGeometry;
  grassGeometry: THREE.BufferGeometry;
  weedGeometry: THREE.BufferGeometry;
  groundGeometry: THREE.PlaneGeometry;
  trunkMaterial: THREE.MeshStandardMaterial;
  branchMaterial: THREE.MeshStandardMaterial;
  leafMaterial: THREE.MeshPhongMaterial;
  tipMaterial: THREE.MeshPhongMaterial;
  rootMaterial: THREE.MeshStandardMaterial;
  modelWoodMaterial: THREE.MeshStandardMaterial;
  modelLeafMaterial: THREE.MeshPhongMaterial;
  stoneMaterial: THREE.MeshStandardMaterial;
  platformMaterial: THREE.MeshStandardMaterial;
  grassMaterial: THREE.MeshBasicMaterial;
  weedMaterial: THREE.MeshPhongMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
  templates: TreeDescription[];
  models: ForestModelPack | null;
  leavesPerCluster: number;
  tipLeavesPerCluster: number;
  canopyHeight: number;
  leafPalette: number[];
  trunkHeight: number;
};

function pushBlade(
  positions: number[],
  indices: number[],
  angle: number,
  radius: number,
  width: number,
  height: number,
  lean: number,
  detail = true,
) {
  const sideX = Math.cos(angle) * width;
  const sideZ = Math.sin(angle) * width;
  const leanX = -Math.sin(angle) * lean;
  const leanZ = Math.cos(angle) * lean;
  const centerX = Math.cos(angle) * radius;
  const centerZ = Math.sin(angle) * radius;
  const offset = positions.length / 3;
  if (detail) {
    positions.push(
      centerX - sideX, 0, centerZ - sideZ,
      centerX + sideX, 0, centerZ + sideZ,
      centerX + sideX * 0.62 + leanX * 0.42, height * 0.48, centerZ + sideZ * 0.62 + leanZ * 0.42,
      centerX + leanX, height, centerZ + leanZ,
      centerX - sideX * 0.62 + leanX * 0.42, height * 0.48, centerZ - sideZ * 0.62 + leanZ * 0.42,
    );
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 4, offset + 4, offset + 2, offset + 3);
    return;
  }
  // Leaner 2-tri blade for dense grass instancing (keeps the fan silhouette).
  positions.push(
    centerX - sideX, 0, centerZ - sideZ,
    centerX + sideX, 0, centerZ + sideZ,
    centerX + leanX * 0.35, height * 0.55, centerZ + leanZ * 0.35,
    centerX + leanX, height, centerZ + leanZ,
  );
  indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
}

function createGrassFan(bladeCount: number, heightScale: number, radiusScale: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + (blade % 2) * 0.11;
    pushBlade(
      positions,
      indices,
      angle,
      (0.02 + (blade % 3) * 0.02) * radiusScale,
      0.022 + (blade % 3) * 0.007,
      (0.28 + (blade % 5) * 0.08) * heightScale,
      (0.08 + (blade % 3) * 0.035) * heightScale,
      false,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Short carpet layer — few blades, dense instancing. */
function createMicroGrassGeometry() {
  return createGrassFan(3, 0.58, 0.8);
}

/** Slightly taller variation clumps for a lush uneven carpet. */
function createGrassGeometry() {
  return createGrassFan(4, 0.78, 0.95);
}

function pushLeaf(
  positions: number[],
  indices: number[],
  x: number,
  y: number,
  z: number,
  angle: number,
  size: number,
) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sx = -dz * size * 0.48;
  const sz = dx * size * 0.48;
  const offset = positions.length / 3;
  positions.push(
    x, y, z,
    x + dx * size * 0.48 + sx, y + size * 0.08, z + dz * size * 0.48 + sz,
    x + dx * size, y + size * 0.16, z + dz * size,
    x + dx * size * 0.48 - sx, y + size * 0.08, z + dz * size * 0.48 - sz,
  );
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

function createBroadleafWeedGeometry() {
  const positions: number[] = [];
  const indices: number[] = [];
  // Shorter weed accents — support the dense low grass carpet without towering over it.
  for (const angle of [0, Math.PI / 2]) {
    pushBlade(positions, indices, angle, 0, 0.024, 0.72, 0.02);
  }
  for (let level = 0; level < 3; level += 1) {
    const y = 0.14 + level * 0.14;
    const size = 0.26 - level * 0.035;
    const angle = level * 2.34;
    pushLeaf(positions, indices, 0, y, 0, angle, size);
    pushLeaf(positions, indices, 0, y + 0.02, 0, angle + Math.PI, size * 0.9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Shattered void fragment. `style`:
 * - "land"  — thin cracked land body with torn shore
 * - "sheet" — zero-thickness flat shard (double-sided)
 * Vertex colors: turf-ish top, darker cliff / underside.
 */
function createIrregularPlatformGeometry(seed: number, style: "land" | "sheet") {
  const random = createRandom(seed >>> 0);
  // Uneven shard outline — deep bites, not a soft island blob.
  const sides = 11 + Math.floor(random() * 9);
  const shape = new THREE.Shape();
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const torn = random() < 0.38;
    const notch = torn ? range(random, 0.12, 0.42) : range(random, 0.55, 1.18);
    const wobble = range(random, -0.18, 0.18);
    points.push({
      x: Math.cos(angle + wobble) * notch,
      y: Math.sin(angle + wobble) * notch,
    });
  }
  // Multiple fracture notches so the silhouette reads as broken space.
  const cuts = 2 + Math.floor(random() * 3);
  for (let c = 0; c < cuts; c += 1) {
    const cut = 1 + Math.floor(random() * (points.length - 2));
    points[cut].x *= range(random, 0.08, 0.32);
    points[cut].y *= range(random, 0.08, 0.32);
  }
  points.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  let geometry: THREE.BufferGeometry;
  if (style === "sheet") {
    // Zero-thickness land sheet — ShapeGeometry is a flat polygon in XY.
    geometry = new THREE.ShapeGeometry(shape, 1);
    geometry.rotateX(-Math.PI / 2);
  } else {
    // Slim floating land body (not a thick slab).
    const thickness = range(random, 0.06, 0.16);
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.28,
      bevelSize: 0.03,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(0, -box.max.y, 0);
  geometry.computeVertexNormals();

  const pos = geometry.getAttribute("position");
  const nrm = geometry.getAttribute("normal");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const ny = Math.abs(nrm.getY(i));
    if (style === "sheet" || ny > 0.55) {
      colors[i * 3] = 0.42 + random() * 0.08;
      colors[i * 3 + 1] = 0.5 + random() * 0.1;
      colors[i * 3 + 2] = 0.3 + random() * 0.06;
    } else if (nrm.getY(i) < -0.35) {
      colors[i * 3] = 0.22 + random() * 0.05;
      colors[i * 3 + 1] = 0.18 + random() * 0.04;
      colors[i * 3 + 2] = 0.14 + random() * 0.03;
    } else {
      colors[i * 3] = 0.38 + random() * 0.1;
      colors[i * 3 + 1] = 0.3 + random() * 0.08;
      colors[i * 3 + 2] = 0.22 + random() * 0.06;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Ancient surface root aligned along local +X. Six open-bottom arch sections
 * make a high buttress shoulder flow into a long, crooked ground runner. The
 * underside stays open below the turf, keeping the reference-like silhouette
 * to 43 triangles while preserving a rounded five-point upper cross-section.
 */
function createSurfaceRootGeometry() {
  const rings = [
    { x: 0, center: 0, ground: 0, width: 1, height: 1 },
    { x: 0.18, center: 0.08, ground: 0.018, width: 0.9, height: 0.86 },
    { x: 0.42, center: -0.18, ground: 0.006, width: 0.68, height: 0.62 },
    { x: 0.67, center: 0.34, ground: 0.025, width: 0.44, height: 0.38 },
    { x: 0.86, center: 0.12, ground: 0.012, width: 0.24, height: 0.2 },
    { x: 1, center: 0.48, ground: 0, width: 0.11, height: 0.075 },
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const ring of rings) {
    positions.push(
      ring.x, ring.ground, ring.center - ring.width,
      ring.x, ring.ground + ring.height * 0.58, ring.center - ring.width * 0.62,
      ring.x, ring.ground + ring.height, ring.center,
      ring.x, ring.ground + ring.height * 0.58, ring.center + ring.width * 0.62,
      ring.x, ring.ground, ring.center + ring.width,
    );
    uvs.push(0, ring.x, 0.25, ring.x, 0.5, ring.x, 0.75, ring.x, 1, ring.x);
  }
  const indices: number[] = [];
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < 4; side += 1) {
      const a = ring * 5 + side;
      const b = (ring + 1) * 5 + side;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, c, b, a, d, c);
    }
  }
  // Close the exposed runner end so long dominant roots never reveal a dark hole.
  const tip = (rings.length - 1) * 5;
  indices.push(tip, tip + 1, tip + 2, tip, tip + 2, tip + 4, tip + 2, tip + 3, tip + 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat-bottomed, domed root link aligned on local X; 14 triangles with caps. */
function createRootRunnerGeometry() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const sections = [
    { x: -0.5, width: 1, height: 1, v: 0 },
    { x: 0.5, width: 0.62, height: 0.62, v: 1 },
  ];
  for (const section of sections) {
    positions.push(
      section.x, 0, -section.width,
      section.x, section.height * 0.58, -section.width * 0.62,
      section.x, section.height, 0,
      section.x, section.height * 0.58, section.width * 0.62,
      section.x, 0, section.width,
    );
    uvs.push(0, section.v, 0.25, section.v, 0.5, section.v, 0.75, section.v, 1, section.v);
  }
  const indices = [
    0, 6, 5, 0, 1, 6,
    1, 7, 6, 1, 2, 7,
    2, 8, 7, 2, 3, 8,
    3, 9, 8, 3, 4, 9,
    0, 4, 2, 0, 2, 1, 2, 4, 3,
    5, 6, 7, 5, 7, 9, 7, 8, 9,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function rotateY(x: number, z: number, twist: number) {
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

export function createSharedForestAssets(
  renderer: THREE.WebGLRenderer,
  tipColor: number,
  groundColor: number,
  leafPalette: number[],
  treeParams: Partial<TreeParams>,
  seed: number,
  models: ForestModelPack | null = null,
): SharedForestAssets {
  const resolved = resolvedTreeParams(treeParams);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const bark = createBarkTextures(anisotropy, seed);
  const stone = createStoneTextures(anisotropy, seed);
  const { map: groundMap, normalMap: groundNormalMap, roughnessMap: groundRoughnessMap } = createGroundTextures(
    groundColor,
    leafPalette,
    anisotropy,
    seed,
  );
  const templates: TreeDescription[] = [];
  const templateRandom = createRandom(seed ^ 0x7ee1);
  for (let i = 0; i < 8; i += 1) {
    templates.push(describeTree(templateRandom, resolved));
  }
  const weedColor = new THREE.Color(leafPalette[Math.min(3, leafPalette.length - 1)]);
  const groundHsl = { h: 0, s: 0, l: 0 };
  weedColor.getHSL(groundHsl);
  weedColor.setHSL(groundHsl.h, THREE.MathUtils.clamp(groundHsl.s + 0.18, 0.64, 0.9), 0.38);

  return {
    // 98 trunk triangles (was 264) and 12 per branch segment (was 24).
    // PBR normals keep the faceted geometry visually rounded while saving ~50%
    // of the wood triangles on a mature, heavily forked tree.
    trunkGeometry: createRippledTrunkGeometry(templates[0].trunkHeight, 7, 6),
    branchGeometry: new THREE.CylinderGeometry(1, 1, 1, 3, 1),
    leafGeometry: createLeafGeometry(),
    tipGeometry: createLeafGeometry(),
    rootGeometry: createSurfaceRootGeometry(),
    // Flat-bottomed tapered links overlap into winding, branching root chains.
    rootRunnerGeometry: createRootRunnerGeometry(),
    // Tall flared root neck turns the straight bole into an old-growth root plate.
    buttressGeometry: new THREE.CylinderGeometry(0.55, 0.86, 0.9, 7, 2),
    stoneGeometry: new THREE.DodecahedronGeometry(0.34, 0),
    platformGeometries: [
      createIrregularPlatformGeometry(seed ^ 0xa11, "land"),
      createIrregularPlatformGeometry(seed ^ 0xb22, "land"),
      createIrregularPlatformGeometry(seed ^ 0xc33, "land"),
      createIrregularPlatformGeometry(seed ^ 0xd44, "sheet"),
      createIrregularPlatformGeometry(seed ^ 0xe55, "sheet"),
      createIrregularPlatformGeometry(seed ^ 0xf66, "sheet"),
    ],
    microGrassGeometry: createMicroGrassGeometry(),
    grassGeometry: createGrassGeometry(),
    weedGeometry: createBroadleafWeedGeometry(),
    // Exact chunk size — the old 1.01 overlap z-fought along seams (edge flicker).
    groundGeometry: new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    trunkMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bark.map,
      normalMap: bark.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: bark.roughnessMap,
      roughness: 0.94,
      metalness: 0,
    }),
    branchMaterial: new THREE.MeshStandardMaterial({
      color: 0xb8aa95,
      map: bark.map,
      normalMap: bark.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: bark.roughnessMap,
      roughness: 0.96,
      metalness: 0,
    }),
    leafMaterial: new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x78955e,
      shininess: 18,
      emissive: 0x173408,
      emissiveIntensity: 0.72,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
    tipMaterial: new THREE.MeshPhongMaterial({
      color: tipColor,
      specular: 0xadc878,
      shininess: 16,
      side: THREE.DoubleSide,
    }),
    rootMaterial: new THREE.MeshStandardMaterial({
      color: 0xa99b84,
      emissive: 0x21170f,
      emissiveIntensity: 0.08,
      map: bark.map,
      normalMap: bark.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: bark.roughnessMap,
      roughness: 0.98,
      metalness: 0,
    }),
    modelWoodMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    }),
    modelLeafMaterial: new THREE.MeshPhongMaterial({
      color: 0xffffff,
      vertexColors: true,
      specular: 0x78955e,
      shininess: 12,
      emissive: 0x142806,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    }),
    stoneMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stone.map,
      normalMap: stone.normalMap,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughnessMap: stone.roughnessMap,
      roughness: 0.93,
      metalness: 0,
      flatShading: true,
    }),
    platformMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    grassMaterial: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    }),
    weedMaterial: new THREE.MeshPhongMaterial({
      color: weedColor,
      emissive: weedColor,
      emissiveIntensity: 0.32,
      specular: 0x8fb85a,
      shininess: 18,
      side: THREE.DoubleSide,
    }),
    groundMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundMap,
      normalMap: groundNormalMap,
      normalScale: new THREE.Vector2(1.65, 1.65),
      roughnessMap: groundRoughnessMap,
      roughness: 1,
    }),
    templates,
    models,
    leavesPerCluster: resolved.leavesPerCluster,
    tipLeavesPerCluster: resolved.tipLeavesPerCluster,
    canopyHeight: resolved.canopyHeight,
    leafPalette,
    trunkHeight: templates[0].trunkHeight,
  };
}

export function disposeSharedForestAssets(assets: SharedForestAssets) {
  const geos = [
    assets.trunkGeometry,
    assets.branchGeometry,
    assets.leafGeometry,
    assets.tipGeometry,
    assets.rootGeometry,
    assets.rootRunnerGeometry,
    assets.buttressGeometry,
    assets.stoneGeometry,
    ...assets.platformGeometries,
    assets.microGrassGeometry,
    assets.grassGeometry,
    assets.weedGeometry,
    assets.groundGeometry,
  ];
  geos.forEach((geometry) => geometry.dispose());
  const materials = [
    assets.trunkMaterial,
    assets.branchMaterial,
    assets.leafMaterial,
    assets.tipMaterial,
    assets.rootMaterial,
    assets.modelWoodMaterial,
    assets.modelLeafMaterial,
    assets.stoneMaterial,
    assets.platformMaterial,
    assets.grassMaterial,
    assets.weedMaterial,
    assets.groundMaterial,
  ];
  const textures = new Set<THREE.Texture>();
  materials.forEach((material) => {
    const withMap = material as THREE.Material & {
      map?: THREE.Texture;
      normalMap?: THREE.Texture;
      roughnessMap?: THREE.Texture;
    };
    if (withMap.map) textures.add(withMap.map);
    if (withMap.normalMap) textures.add(withMap.normalMap);
    if (withMap.roughnessMap) textures.add(withMap.roughnessMap);
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}

export type ChunkBuildContext = {
  assets: SharedForestAssets;
  worldSeed: number;
  forestDensity: number;
  treeHeightScale: number;
  roadWidth: number;
  roadDistance: (point: THREE.Vector3) => number;
  insideWorld: (x: number, z: number, inset?: number) => boolean;
};

export type BuiltChunk = {
  group: THREE.Group;
  treeCount: number;
  grassCount: number;
  stoneCount: number;
  drawCalls: number;
  colliders: ChunkColliders;
};

export function buildChunk(coord: ChunkCoord, context: ChunkBuildContext): BuiltChunk {
  const { assets, worldSeed, forestDensity, treeHeightScale, roadWidth, roadDistance, insideWorld } = context;
  const group = new THREE.Group();
  group.name = `chunk:${coord.cx},${coord.cz}`;
  const origin = chunkOrigin(coord.cx, coord.cz);
  const random = createRandom(chunkSeed(worldSeed, coord.cx, coord.cz));

  const ground = new THREE.Mesh(assets.groundGeometry, assets.groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(origin.x + CHUNK_SIZE * 0.5, 0, origin.z + CHUNK_SIZE * 0.5);
  ground.receiveShadow = true;
  group.add(ground);

  const targetTrees = Math.max(1, Math.round(TREES_PER_CHUNK_SAFE(forestDensity)));
  const point = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let treeDrawCalls = 0;
  let treeCount = 0;
  let treeColliders: TreeCollider[] = [];

  if (assets.models) {
    const trees = addModelTrees(group, {
      assets,
      origin,
      random,
      targetTrees,
      treeHeightScale,
      roadWidth,
      roadDistance,
      insideWorld,
      point,
      dummy,
    });
    treeCount = trees.count;
    treeColliders = trees.colliders;
    treeDrawCalls = addForestProps(group, {
      assets,
      origin,
      random,
      roadWidth,
      roadDistance,
      insideWorld,
      point,
      dummy,
      forestDensity,
    });
  } else {
    const trees = addProceduralTrees(group, {
      assets,
      origin,
      random,
      targetTrees,
      treeHeightScale,
      roadWidth,
      roadDistance,
      insideWorld,
      point,
      dummy,
      color,
    });
    treeCount = trees.count;
    treeColliders = trees.colliders;
    treeDrawCalls = 7;
  }

  // Ground cover is texture-only — no 3D grass/weed instances.

  // Rocks exist in every streamed chunk. Roadside chunks are denser along the
  // verge, while deep-forest chunks still receive a seeded scatter.
  const stoneTarget = Math.round(22 + forestDensity * 16);
  const stonePlacements: Array<{ x: number; z: number; scale: number; y: number; sx: number; sy: number; sz: number }> = [];
  const stonePoint = new THREE.Vector3();
  for (let attempt = 0; attempt < stoneTarget * 10 && stonePlacements.length < stoneTarget; attempt += 1) {
    stonePoint.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
    if (!insideWorld(stonePoint.x, stonePoint.z, 34)) continue;
    const distance = roadDistance(stonePoint);
    const onShoulder = distance >= roadWidth * 0.85 && distance < roadWidth * 4.8;
    const inClearing = distance >= roadWidth * 4.8 && distance < roadWidth * 9;
    const inDeepForest = distance >= roadWidth * 9;
    if (!onShoulder && !(inClearing && random() < 0.42) && !(inDeepForest && random() < 0.34)) continue;
    if (distance < roadWidth * 0.85) continue;

    const profile = pickStoneProfile(random);
    // Keep giants off the roadbed; let them sit a little farther into the verge.
    if (profile.tier === "giant" && distance < roadWidth * 2.2) continue;
    stonePlacements.push({
      x: stonePoint.x,
      z: stonePoint.z,
      scale: profile.scale,
      y: profile.y,
      sx: profile.sx,
      sy: profile.sy,
      sz: profile.sz,
    });
  }

  let stoneMesh: THREE.InstancedMesh | null = null;
  const stoneColliderList: StoneCollider[] = [];
  if (stonePlacements.length) {
    stoneMesh = new THREE.InstancedMesh(assets.stoneGeometry, assets.stoneMaterial, stonePlacements.length);
    for (let i = 0; i < stonePlacements.length; i += 1) {
      const stone = stonePlacements[i];
      dummy.position.set(stone.x, stone.y, stone.z);
      dummy.rotation.set(range(random, 0, Math.PI), range(random, 0, Math.PI * 2), range(random, 0, Math.PI));
      dummy.scale.set(stone.scale * stone.sx, stone.scale * stone.sy, stone.scale * stone.sz);
      dummy.updateMatrix();
      stoneMesh.setMatrixAt(i, dummy.matrix);
      // Collision radius from the stone's horizontal footprint; mass scales with
      // volume so pebbles scatter and boulders barely budge.
      const r = 0.34 * stone.scale * ((stone.sx + stone.sz) * 0.5);
      stoneColliderList.push({
        x: stone.x,
        z: stone.z,
        y: stone.y,
        r,
        mass: 180 * r * r * r,
        index: i,
        q: { x: dummy.quaternion.x, y: dummy.quaternion.y, z: dummy.quaternion.z, w: dummy.quaternion.w },
        s: { x: dummy.scale.x, y: dummy.scale.y, z: dummy.scale.z },
      });
    }
    stoneMesh.instanceMatrix.needsUpdate = true;
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    group.add(stoneMesh);
  }

  // Sparse shattered void fragments — mostly debris, wide air gaps, tall volume.
  const platformTarget = Math.max(1, Math.round(0.7 + forestDensity * 0.45));
  type PlatformSpot = {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    sx: number;
    sy: number;
    sz: number;
    radius: number;
    variant: number;
  };
  const accepted: PlatformSpot[] = [];
  const platformPoint = new THREE.Vector3();
  const landCount = Math.floor(assets.platformGeometries.length / 2);
  // Geometry unit radius ~1.18; keep collision at least that large + fixed void gap.
  const VOID_GAP = 48;

  const overlaps = (spot: PlatformSpot) => {
    for (const other of accepted) {
      const dx = spot.x - other.x;
      const dy = spot.y - other.y;
      const dz = spot.z - other.z;
      const horiz = Math.hypot(dx, dz);
      // Always keep a clear horizontal void between shards — never graze.
      const minHoriz = spot.radius + other.radius + VOID_GAP;
      if (horiz < minHoriz) return true;
      // Even when offset in plan, refuse near-vertical nesting.
      const min3 = spot.radius + other.radius + VOID_GAP * 0.55;
      if (Math.hypot(dx, dy, dz) < min3) return true;
    }
    return false;
  };

  for (let attempt = 0; attempt < platformTarget * 70 && accepted.length < platformTarget; attempt += 1) {
    platformPoint.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
    if (!insideWorld(platformPoint.x, platformPoint.z, 42)) continue;
    if (roadDistance(platformPoint) < roadWidth * 3.2) continue;

    // 碎小 50% / 小 30% / 中等 18% / 大岛 2%
    const sizeRoll = random();
    const span =
      sizeRoll < 0.5
        ? range(random, 2.5, 8)
        : sizeRoll < 0.8
          ? range(random, 9, 18)
          : sizeRoll < 0.98
            ? range(random, 22, 38)
            : range(random, 48, 72);
    // Shards often elongate into torn strips.
    const stretch = range(random, 0.45, 1.65);
    const sx = span;
    const sz = span * stretch;
    // 按最终体量判定：中等/大岛（或拉长后等同体量）倾角严格 ≤10°。
    const isLargeDeck = sizeRoll >= 0.8 || Math.max(sx, sz) >= 22;

    // Tall void column — low drift to high broken sky.
    const heightRoll = random();
    const y =
      heightRoll < 0.22
        ? range(random, 16, 38)
        : heightRoll < 0.55
          ? range(random, 42, 78)
          : heightRoll < 0.82
            ? range(random, 86, 130)
            : range(random, 138, 190);

    // 中等/大岛：合成倾角 ≤10°（避免 pitch+roll 叠成近竖）。碎小/小可大幅倾斜。
    let pitch = 0;
    let roll = 0;
    if (isLargeDeck) {
      const maxTilt = (10 * Math.PI) / 180;
      const mag = THREE.MathUtils.clamp(Math.abs(gaussian(random, 0, (3.5 * Math.PI) / 180)), 0, maxTilt);
      const axis = random() * Math.PI * 2;
      pitch = Math.cos(axis) * mag;
      roll = Math.sin(axis) * mag;
    } else if (random() < 0.42) {
      const walkStd = (12 * Math.PI) / 180;
      pitch = THREE.MathUtils.clamp(gaussian(random, 0, walkStd), (-28 * Math.PI) / 180, (28 * Math.PI) / 180);
      roll = THREE.MathUtils.clamp(gaussian(random, 0, walkStd), (-28 * Math.PI) / 180, (28 * Math.PI) / 180);
    } else {
      const steep = range(random, (45 * Math.PI) / 180, (88 * Math.PI) / 180);
      const sign = random() < 0.5 ? 1 : -1;
      if (random() < 0.5) {
        pitch = steep * sign;
        roll = gaussian(random, 0, (10 * Math.PI) / 180);
      } else {
        roll = steep * sign;
        pitch = gaussian(random, 0, (10 * Math.PI) / 180);
      }
    }

    // Prefer thin sheet shards for "broken space" read.
    const useSheet = random() < 0.62;
    const variant = useSheet
      ? landCount + Math.floor(random() * Math.max(1, assets.platformGeometries.length - landCount))
      : Math.floor(random() * Math.max(1, landCount));

    // Match real outline extent (~1.18) so scaled shards cannot visually kiss.
    const radius = Math.max(sx, sz) * 1.2;
    // Soft edge inset — large shards stay near chunk center; avoid hard-rejecting them.
    const edgePad = Math.min(12 + radius * 0.28, CHUNK_SIZE * 0.34);
    const x = THREE.MathUtils.clamp(
      platformPoint.x + range(random, -6, 6),
      origin.x + edgePad,
      origin.x + CHUNK_SIZE - edgePad,
    );
    const z = THREE.MathUtils.clamp(
      platformPoint.z + range(random, -6, 6),
      origin.z + edgePad,
      origin.z + CHUNK_SIZE - edgePad,
    );

    const spot: PlatformSpot = {
      x,
      y,
      z,
      yaw: random() * Math.PI * 2,
      pitch,
      roll,
      sx,
      sy: useSheet ? 1 : range(random, 0.65, 1.05),
      sz,
      radius,
      variant: Math.min(variant, assets.platformGeometries.length - 1),
    };
    if (overlaps(spot)) continue;
    accepted.push(spot);
  }

  const platformBuckets: PlatformSpot[][] = assets.platformGeometries.map(() => []);
  for (const spot of accepted) platformBuckets[spot.variant].push(spot);

  let platformDrawCalls = 0;
  for (let v = 0; v < platformBuckets.length; v += 1) {
    const spots = platformBuckets[v];
    if (!spots.length) continue;
    const platforms = new THREE.InstancedMesh(assets.platformGeometries[v], assets.platformMaterial, spots.length);
    platforms.castShadow = true;
    platforms.receiveShadow = true;
    platforms.frustumCulled = true;
    for (let i = 0; i < spots.length; i += 1) {
      const spot = spots[i];
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.rotation.set(spot.pitch, spot.yaw, spot.roll);
      dummy.scale.set(spot.sx, spot.sy, spot.sz);
      dummy.updateMatrix();
      platforms.setMatrixAt(i, dummy.matrix);
    }
    platforms.instanceMatrix.needsUpdate = true;
    group.add(platforms);
    platformDrawCalls += 1;
  }

  const drawCalls = 1 + treeDrawCalls + (stonePlacements.length ? 1 : 0) + platformDrawCalls;
  return {
    group,
    treeCount,
    grassCount: 0,
    stoneCount: stonePlacements.length,
    drawCalls,
    colliders: { trees: treeColliders, stones: stoneColliderList, stoneMesh },
  };
}

type ScatterCtx = {
  assets: SharedForestAssets;
  origin: { x: number; z: number };
  random: () => number;
  targetTrees?: number;
  treeHeightScale?: number;
  roadWidth: number;
  roadDistance: (point: THREE.Vector3) => number;
  insideWorld: (x: number, z: number, inset?: number) => boolean;
  point: THREE.Vector3;
  dummy: THREE.Object3D;
  color?: THREE.Color;
  forestDensity?: number;
};

function addModelTrees(group: THREE.Group, ctx: ScatterCtx): { count: number; colliders: TreeCollider[] } {
  const {
    assets,
    origin,
    random,
    targetTrees = 1,
    treeHeightScale = 1,
    roadWidth,
    roadDistance,
    insideWorld,
    point,
    dummy,
  } = ctx;
  const pack = assets.models!;
  type Spot = { p: THREE.Vector3; scale: number; heightScale: number; twist: number; template: ForestModelTemplate };
  const spots: Spot[] = [];
  for (let attempt = 0; attempt < targetTrees * 5 && spots.length < targetTrees; attempt += 1) {
    point.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
    if (!insideWorld(point.x, point.z, 58)) continue;
    if (roadDistance(point) < roadWidth * 1.55 + range(random, 0.8, 3.2)) continue;
    const scale = pickTreeScale(random);
    spots.push({
      p: point.clone(),
      scale,
      heightScale: treeHeightScale * range(random, 0.88, 1.14),
      twist: random() * Math.PI * 2,
      template: pickTreeTemplate(pack, scale, random),
    });
  }

  const colliders: TreeCollider[] = spots.map((spot) => {
    // Instance horizontal scale equals worldHeight / template.height.
    const s = (0.42 + spot.scale * 0.38) * spot.heightScale;
    return { x: spot.p.x, z: spot.p.z, r: spot.template.trunkRadius * s };
  });

  const buckets = new Map<string, Spot[]>();
  for (const spot of spots) {
    const list = buckets.get(spot.template.id) ?? [];
    list.push(spot);
    buckets.set(spot.template.id, list);
  }

  for (const [, bucket] of buckets) {
    const template = bucket[0].template;
    const wood = new THREE.InstancedMesh(template.wood, assets.modelWoodMaterial, bucket.length);
    const leaves = new THREE.InstancedMesh(template.leaves, assets.modelLeafMaterial, bucket.length);
    wood.castShadow = true;
    wood.receiveShadow = true;
    leaves.castShadow = false;
    leaves.receiveShadow = true;
    for (let i = 0; i < bucket.length; i += 1) {
      const spot = bucket[i];
      // Map procedural scale bands onto the authored template height.
      const worldHeight = template.height * (0.42 + spot.scale * 0.38) * spot.heightScale;
      const s = worldHeight / Math.max(template.height, 0.1);
      dummy.position.set(spot.p.x, 0, spot.p.z);
      dummy.rotation.set(0, spot.twist, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      wood.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    }
    wood.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    group.add(wood, leaves);
  }
  return { count: spots.length, colliders };
}

function addForestProps(group: THREE.Group, ctx: ScatterCtx) {
  const {
    assets,
    origin,
    random,
    roadWidth,
    roadDistance,
    insideWorld,
    point,
    dummy,
    forestDensity = 1,
  } = ctx;
  const pack = assets.models!;
  let drawCalls = 0;

  const placePool = (
    pool: ForestModelTemplate[],
    count: number,
    minRoad: number,
    maxRoad: number,
    scaleRange: [number, number],
  ) => {
    if (!pool.length || count <= 0) return 0;
    const buckets = new Map<string, Array<{ p: THREE.Vector3; twist: number; s: number; template: ForestModelTemplate }>>();
    let placed = 0;
    for (let attempt = 0; attempt < count * 8 && placed < count; attempt += 1) {
      point.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
      if (!insideWorld(point.x, point.z, 40)) continue;
      const dist = roadDistance(point);
      if (dist < minRoad || dist > maxRoad) continue;
      const template = pool[Math.floor(random() * pool.length)];
      const s = range(random, scaleRange[0], scaleRange[1]);
      const list = buckets.get(template.id) ?? [];
      list.push({ p: point.clone(), twist: random() * Math.PI * 2, s, template });
      buckets.set(template.id, list);
      placed += 1;
    }
    for (const [, bucket] of buckets) {
      const template = bucket[0].template;
      const wood = new THREE.InstancedMesh(template.wood, assets.modelWoodMaterial, bucket.length);
      const leaves = new THREE.InstancedMesh(template.leaves, assets.modelLeafMaterial, bucket.length);
      wood.castShadow = true;
      leaves.castShadow = false;
      for (let i = 0; i < bucket.length; i += 1) {
        const spot = bucket[i];
        dummy.position.set(spot.p.x, 0, spot.p.z);
        dummy.rotation.set(0, spot.twist, 0);
        dummy.scale.setScalar(spot.s);
        dummy.updateMatrix();
        wood.setMatrixAt(i, dummy.matrix);
        leaves.setMatrixAt(i, dummy.matrix);
      }
      wood.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      group.add(wood, leaves);
      drawCalls += 2;
    }
    return placed;
  };

  // Trees already counted separately; props add foliage variety.
  placePool(pack.shrub, Math.round(4 + forestDensity * 3), roadWidth * 1.8, roadWidth * 18, [0.85, 1.35]);
  placePool(pack.stump, Math.round(1 + forestDensity), roadWidth * 2.2, roadWidth * 14, [0.9, 1.4]);
  placePool(pack.branch, Math.round(1 + forestDensity * 0.8), roadWidth * 2.5, roadWidth * 16, [0.7, 1.2]);
  // Each tree template used also costs 2 draw calls — approximate from group children later.
  // Return prop draw calls only; caller adds tree mesh pairs.
  return drawCalls + Math.max(1, pack.large.length + pack.medium.length + pack.small.length) * 2;
}

function addProceduralTrees(group: THREE.Group, ctx: ScatterCtx): { count: number; colliders: TreeCollider[] } {
  const {
    assets,
    origin,
    random,
    targetTrees = 1,
    treeHeightScale = 1,
    roadWidth,
    roadDistance,
    insideWorld,
    point,
    dummy,
    color = new THREE.Color(),
  } = ctx;

  type Placement = {
    p: THREE.Vector3;
    scale: number;
    heightScale: number;
    color: number;
    twist: number;
    description: TreeDescription;
  };
  const placed: Placement[] = [];
  for (let attempt = 0; attempt < targetTrees * 5 && placed.length < targetTrees; attempt += 1) {
    point.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
    if (!insideWorld(point.x, point.z, 58)) continue;
    if (roadDistance(point) < roadWidth * 1.55 + range(random, 0.8, 3.2)) continue;
    placed.push({
      p: point.clone(),
      scale: pickTreeScale(random),
      heightScale: treeHeightScale * range(random, 0.88, 1.14),
      color: assets.leafPalette[Math.floor(random() * assets.leafPalette.length)],
      twist: random() * Math.PI * 2,
      description: assets.templates[Math.floor(random() * assets.templates.length)],
    });
  }

  let branchTotal = 0;
  let leafTotal = 0;
  let tipTotal = 0;
  let rootTotal = 0;
  let rootRunnerTotal = 0;
  for (const tree of placed) {
    branchTotal += tree.description.branches.length;
    leafTotal += tree.description.clusters.length * assets.leavesPerCluster;
    tipTotal += tree.description.tipClusters.length * assets.tipLeavesPerCluster;
    rootTotal += tree.description.roots.length;
    rootRunnerTotal += tree.description.rootSegments.length;
  }

  const trunks = new THREE.InstancedMesh(assets.trunkGeometry, assets.trunkMaterial, Math.max(placed.length, 1));
  const buttresses = new THREE.InstancedMesh(assets.buttressGeometry, assets.rootMaterial, Math.max(placed.length, 1));
  const branches = new THREE.InstancedMesh(assets.branchGeometry, assets.branchMaterial, Math.max(branchTotal, 1));
  const roots = new THREE.InstancedMesh(assets.rootGeometry, assets.rootMaterial, Math.max(rootTotal, 1));
  const rootRunners = new THREE.InstancedMesh(assets.rootRunnerGeometry, assets.rootMaterial, Math.max(rootRunnerTotal, 1));
  const leaves = new THREE.InstancedMesh(assets.leafGeometry, assets.leafMaterial, Math.max(leafTotal, 1));
  const tipLeaves = new THREE.InstancedMesh(assets.tipGeometry, assets.tipMaterial, Math.max(tipTotal, 1));
  trunks.castShadow = buttresses.castShadow = branches.castShadow = roots.castShadow = rootRunners.castShadow = true;
  roots.receiveShadow = true;

  const up = new THREE.Vector3(0, 1, 0);
  const rootAxis = new THREE.Vector3(1, 0, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let branchIndex = 0;
  let leafIndex = 0;
  let tipIndex = 0;
  let rootIndex = 0;
  let rootRunnerIndex = 0;

  for (let treeIndex = 0; treeIndex < placed.length; treeIndex += 1) {
    const tree = placed[treeIndex];
    const { p, scale, heightScale, twist, description } = tree;
    const verticalScale = scale * heightScale;

    dummy.position.set(p.x, assets.trunkHeight * 0.5 * verticalScale, p.z);
    dummy.rotation.set(0, twist, 0);
    dummy.scale.set(scale, verticalScale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(treeIndex, dummy.matrix);

    dummy.position.set(p.x, 0.43 * scale, p.z);
    dummy.rotation.set(0, twist, 0);
    dummy.scale.set(scale * 1.02, scale, scale * 1.02);
    dummy.updateMatrix();
    buttresses.setMatrixAt(treeIndex, dummy.matrix);

    for (const segment of description.branches) {
      const from = rotateY(segment.ax, segment.az, twist);
      const to = rotateY(segment.bx, segment.bz, twist);
      a.set(p.x + from.x * scale, segment.ay * verticalScale, p.z + from.z * scale);
      b.set(p.x + to.x * scale, segment.by * verticalScale, p.z + to.z * scale);
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length < 1e-4) continue;
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, delta.normalize());
      dummy.scale.set(segment.radius * scale, length, segment.radius * scale);
      dummy.updateMatrix();
      branches.setMatrixAt(branchIndex++, dummy.matrix);
    }

    for (const cluster of description.clusters) {
      const rotated = rotateY(cluster.x, cluster.z, twist);
      const cx = p.x + rotated.x * scale;
      const cy = cluster.y * verticalScale;
      const cz = p.z + rotated.z * scale;
      const clusterRadius = cluster.radius * scale;
      for (let i = 0; i < assets.leavesPerCluster; i += 1) {
        const theta = random() * Math.PI * 2;
        const spread = Math.pow(random(), 0.62) * clusterRadius;
        const vertical = range(random, -clusterRadius * 0.55, clusterRadius * 0.55) * Math.sqrt(heightScale);
        dummy.position.set(cx + Math.cos(theta) * spread, cy + vertical, cz + Math.sin(theta) * spread);
        dummy.rotation.set(range(random, -1, 1), theta + range(random, -0.7, 0.7), range(random, -0.6, 0.6));
        const size = range(random, 0.11, 0.175) * cluster.bias * scale;
        dummy.scale.set(size * range(random, 0.76, 1.03), size * range(random, 0.2, 0.28), size * range(random, 1.55, 1.95));
        dummy.updateMatrix();
        leaves.setMatrixAt(leafIndex, dummy.matrix);
        colorLeaf(color, tree.color, cluster.y, assets.canopyHeight, random);
        leaves.setColorAt(leafIndex, color);
        leafIndex += 1;
      }
    }

    for (const cluster of description.tipClusters) {
      const rotated = rotateY(cluster.x, cluster.z, twist);
      const cx = p.x + rotated.x * scale;
      const cy = cluster.y * verticalScale;
      const cz = p.z + rotated.z * scale;
      for (let i = 0; i < assets.tipLeavesPerCluster; i += 1) {
        dummy.position.set(
          cx + range(random, -0.21, 0.21) * scale,
          cy + range(random, -0.16, 0.22) * verticalScale,
          cz + range(random, -0.21, 0.21) * scale,
        );
        dummy.rotation.set(range(random, -1, 1), range(random, 0, Math.PI * 2), range(random, -1, 1));
        const s = range(random, 0.1, 0.16) * scale;
        dummy.scale.set(s, s * 0.22, s * 1.8);
        dummy.updateMatrix();
        tipLeaves.setMatrixAt(tipIndex++, dummy.matrix);
      }
    }

    const boleR = TRUNK_BASE_RADIUS * 0.72 * scale;
    for (const root of description.roots) {
      const angle = root.angle + twist;
      dummy.position.set(p.x + Math.cos(angle) * boleR, 0.012 * scale, p.z + Math.sin(angle) * boleR);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(root.length * scale, root.lift * scale, root.radius * (1.35 + root.flatten * 0.55) * scale);
      dummy.updateMatrix();
      roots.setMatrixAt(rootIndex++, dummy.matrix);
    }

    for (const segment of description.rootSegments) {
      const from = rotateY(segment.ax, segment.az, twist);
      const to = rotateY(segment.bx, segment.bz, twist);
      a.set(p.x + from.x * scale, segment.ay * scale, p.z + from.z * scale);
      b.set(p.x + to.x * scale, segment.by * scale, p.z + to.z * scale);
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length < 1e-4) continue;
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(rootAxis, delta.normalize());
      dummy.scale.set(length * 1.08, segment.radius * scale, segment.radius * scale);
      dummy.updateMatrix();
      rootRunners.setMatrixAt(rootRunnerIndex++, dummy.matrix);
    }
  }

  branches.count = branchIndex;
  leaves.count = leafIndex;
  tipLeaves.count = tipIndex;
  roots.count = rootIndex;
  rootRunners.count = rootRunnerIndex;
  for (const mesh of [trunks, buttresses, branches, roots, rootRunners, leaves, tipLeaves]) {
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(trunks, buttresses, roots, rootRunners, branches, leaves, tipLeaves);
  // Trunk collision radius from the horizontal trunk scale (plus root flare allowance).
  const colliders: TreeCollider[] = placed.map((tree) => ({
    x: tree.p.x,
    z: tree.p.z,
    r: TRUNK_BASE_RADIUS * tree.scale * 1.15,
  }));
  return { count: placed.length, colliders };
}

/** Mostly pebbles, some large rocks, rare boulders. */
function pickStoneProfile(random: () => number) {
  const roll = random();
  if (roll < 0.74) {
    const scale = range(random, 0.18, 0.42);
    const sx = range(random, 0.85, 1.2);
    const sy = range(random, 0.45, 0.75);
    const sz = range(random, 0.85, 1.25);
    return {
      tier: "small" as const,
      scale,
      sx,
      sy,
      sz,
      // Anchor the stone to the visible ground (grass carpet at y=0): seat the
      // bottom at/under the surface. Center at 0.8·h puts every stone's bottom
      // below the carpet (pebbles rest on it, boulders sink in) so nothing
      // floats above it.
      y: 0.34 * scale * sy * 0.8,
    };
  }
  if (roll < 0.94) {
    const scale = range(random, 0.65, 1.2);
    const sx = range(random, 0.8, 1.25);
    const sy = range(random, 0.55, 0.95);
    const sz = range(random, 0.8, 1.2);
    return {
      tier: "large" as const,
      scale,
      sx,
      sy,
      sz,
      y: 0.34 * scale * sy * 0.8,
    };
  }
  const scale = range(random, 1.7, 2.9);
  const sx = range(random, 0.85, 1.35);
  const sy = range(random, 0.6, 1.05);
  const sz = range(random, 0.9, 1.4);
  return {
    tier: "giant" as const,
    scale,
    sx,
    sy,
    sz,
    y: 0.34 * scale * sy * 0.5,
  };
}

function TREES_PER_CHUNK_SAFE(forestDensity: number) {
  return Math.round(28 * forestDensity);
}

/** Dispose chunk-owned meshes without touching shared geometries/materials. */
export function disposeChunkGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh) && !(object instanceof THREE.Mesh)) return;
    // Ground uses shared plane geometry — only dispose instance-specific buffers on InstancedMesh colors if any.
    if (object instanceof THREE.InstancedMesh) {
      object.dispose();
    }
  });
  group.clear();
}
