import * as THREE from "three";
import {
  createBarkTextures,
  createGroundTextures,
  createStoneTextures,
  enableGroundAntiTiling,
} from "./textures";
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
import { createRandom, range } from "./random";
import { CHUNK_SIZE, pickTreeScale, type ChunkCoord, chunkOrigin, chunkSeed } from "./world";
import {
  pickTreeTemplate,
  type ForestModelPack,
  type ForestModelTemplate,
} from "./treeModels";
import type { ChunkColliders, StoneCollider, TreeCollider } from "./collision";
import { applyShatterAmount, enableShatterMaterial, type ShatterMorphData } from "./shatterMorph";

export type TreePose = {
  x: number;
  z: number;
  canopyY: number;
  scale: number;
};

function captureInstanceBases(mesh: THREE.InstancedMesh) {
  const bases = new Float32Array(mesh.count * 16);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    matrix.toArray(bases, i * 16);
  }
  return bases;
}

export type SharedForestAssets = {
  trunkGeometry: THREE.CylinderGeometry;
  branchGeometry: THREE.CylinderGeometry;
  leafGeometry: THREE.BufferGeometry;
  tipGeometry: THREE.BufferGeometry;
  rootGeometry: THREE.BufferGeometry;
  rootRunnerGeometry: THREE.BufferGeometry;
  buttressGeometry: THREE.BufferGeometry;
  stoneGeometry: THREE.DodecahedronGeometry;
  /** 92 suspended low-poly pieces, 828 triangles total per shattered stone. */
  stoneShardGeometry: THREE.BufferGeometry;
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
  modelShardWoodMaterial: THREE.MeshStandardMaterial;
  modelShardLeafMaterial: THREE.MeshPhongMaterial;
  stoneMaterial: THREE.MeshStandardMaterial;
  stoneShardMaterial: THREE.MeshStandardMaterial;
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

/** Demo-matched stone burst: 92 low-poly fragments that float around the source boulder. */
function createStoneShardGeometry(seed: number) {
  const random = createRandom(seed ^ 0x57a0e);
  const templates: THREE.BufferGeometry[] = [
    new THREE.TetrahedronGeometry(1, 0),
    new THREE.OctahedronGeometry(1, 0),
    new THREE.TetrahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(1, 0),
  ];
  const clusters = [
    new THREE.Vector3(-1, 0.22, -0.35),
    new THREE.Vector3(-0.72, 0.68, 0.5),
    new THREE.Vector3(-0.3, -0.7, 0.85),
    new THREE.Vector3(0.28, 0.82, -0.72),
    new THREE.Vector3(0.62, -0.55, -0.62),
    new THREE.Vector3(0.82, 0.35, 0.42),
    new THREE.Vector3(0.15, -0.82, 0.28),
    new THREE.Vector3(-0.5, 0.08, -0.86),
  ].map((direction) => direction.normalize());
  const positions: number[] = [];
  const uvs: number[] = [];
  const shardCenter: number[] = [];
  const shardRepair: number[] = [];
  const shardBlast: number[] = [];
  const shardAxisAngle: number[] = [];
  const shardScaleStagger: number[] = [];
  const axis = new THREE.Vector3();

  for (let shard = 0; shard < 92; shard += 1) {
    const template = templates[shard % templates.length];
    const sourcePosition = template.getAttribute("position");
    const sourceUv = template.getAttribute("uv");
    const index = template.getIndex();
    let x = 0;
    let y = 0;
    let z = 0;
    do {
      x = range(random, -0.31, 0.31);
      y = range(random, -0.25, 0.25);
      z = range(random, -0.28, 0.28);
    } while ((x / 0.31) ** 2 + (y / 0.25) ** 2 + (z / 0.28) ** 2 > 1);
    const repair = new THREE.Vector3(x, y, z);
    const cluster = clusters[shard % clusters.length];
    const blast = repair.clone()
      .multiplyScalar(range(random, 1.22, 1.52))
      .addScaledVector(cluster, range(random, 0.14, 0.28))
      .add(new THREE.Vector3(
        range(random, -0.035, 0.035),
        range(random, -0.03, 0.03),
        range(random, -0.035, 0.035),
      ));
    blast.y = Math.max(-0.16, blast.y);
    axis.set(
      range(random, -1, 1),
      range(random, -1, 1),
      range(random, -1, 1),
    ).normalize();
    const angle = range(random, -2.8, 2.8);
    const size = range(random, 0.018, 0.048) * (shard < 14 ? range(random, 1.25, 1.7) : 1);
    const vertexCount = index ? index.count : sourcePosition.count;
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const sourceIndex = index ? index.getX(vertex) : vertex;
      positions.push(
        sourcePosition.getX(sourceIndex) * size + repair.x,
        sourcePosition.getY(sourceIndex) * size + repair.y,
        sourcePosition.getZ(sourceIndex) * size + repair.z,
      );
      uvs.push(
        sourceUv ? sourceUv.getX(sourceIndex) : 0,
        sourceUv ? sourceUv.getY(sourceIndex) : 0,
      );
      shardCenter.push(repair.x, repair.y, repair.z);
      shardRepair.push(repair.x, repair.y, repair.z);
      shardBlast.push(blast.x, blast.y, blast.z);
      shardAxisAngle.push(axis.x, axis.y, axis.z, angle);
      shardScaleStagger.push(1, (shard % 13) * 0.008);
    }
  }

  templates.forEach((geometry) => geometry.dispose());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("shardCenter", new THREE.Float32BufferAttribute(shardCenter, 3));
  geometry.setAttribute("shardRepair", new THREE.Float32BufferAttribute(shardRepair, 3));
  geometry.setAttribute("shardBlast", new THREE.Float32BufferAttribute(shardBlast, 3));
  geometry.setAttribute("shardAxisAngle", new THREE.Float32BufferAttribute(shardAxisAngle, 4));
  geometry.setAttribute("shardScaleStagger", new THREE.Float32BufferAttribute(shardScaleStagger, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
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
  // The bark atlas is intentionally not vertically tile-seamless. Repeating it
  // 4.6 times on one bole created obvious horizontal bands, even though the
  // trunk mesh itself is continuous. Give the main trunk its own single-height
  // copies; branches and surface roots retain the denser repeat for fine detail.
  const trunkBarkMap = bark.map.clone();
  const trunkBarkNormalMap = bark.normalMap.clone();
  const trunkBarkRoughnessMap = bark.roughnessMap.clone();
  for (const texture of [trunkBarkMap, trunkBarkNormalMap, trunkBarkRoughnessMap]) {
    texture.repeat.set(texture.repeat.x, 1);
    texture.needsUpdate = true;
  }
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
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stone.map,
    normalMap: stone.normalMap,
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughnessMap: stone.roughnessMap,
    roughness: 0.93,
    metalness: 0,
    flatShading: true,
  });
  const stoneShardMaterial = enableShatterMaterial(stoneMaterial.clone());
  stoneShardMaterial.side = THREE.DoubleSide;

  return {
    // Eight continuous height rings remove the stacked-section silhouette while
    // staying far below the original 264-triangle trunk. Open branch links avoid
    // dark cap discs where the procedural skeleton joins from segment to segment.
    trunkGeometry: createRippledTrunkGeometry(templates[0].trunkHeight, 7, 8),
    branchGeometry: new THREE.CylinderGeometry(1, 1, 1, 3, 1, true),
    leafGeometry: createLeafGeometry(),
    tipGeometry: createLeafGeometry(),
    rootGeometry: createSurfaceRootGeometry(),
    // Flat-bottomed tapered links overlap into winding, branching root chains.
    rootRunnerGeometry: createRootRunnerGeometry(),
    // Tall flared root neck turns the straight bole into an old-growth root plate.
    buttressGeometry: new THREE.CylinderGeometry(0.55, 0.86, 0.9, 7, 2),
    stoneGeometry: new THREE.DodecahedronGeometry(0.34, 0),
    stoneShardGeometry: createStoneShardGeometry(seed),
    microGrassGeometry: createMicroGrassGeometry(),
    grassGeometry: createGrassGeometry(),
    weedGeometry: createBroadleafWeedGeometry(),
    // Exact chunk size — the old 1.01 overlap z-fought along seams (edge flicker).
    groundGeometry: new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    trunkMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x382416,
      emissiveIntensity: 0.32,
      map: trunkBarkMap,
      normalMap: trunkBarkNormalMap,
      normalScale: new THREE.Vector2(0.82, 0.82),
      roughnessMap: trunkBarkRoughnessMap,
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
    modelShardWoodMaterial: enableShatterMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    })),
    modelShardLeafMaterial: enableShatterMaterial(new THREE.MeshPhongMaterial({
      color: 0xffffff,
      vertexColors: true,
      specular: 0x78955e,
      shininess: 10,
      emissive: 0x102806,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    })),
    stoneMaterial,
    stoneShardMaterial,
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
    groundMaterial: enableGroundAntiTiling(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundMap,
      normalMap: groundNormalMap,
      normalScale: new THREE.Vector2(1.18, 1.18),
      roughnessMap: groundRoughnessMap,
      roughness: 1,
    })),
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
    assets.stoneShardGeometry,
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
    assets.modelShardWoodMaterial,
    assets.modelShardLeafMaterial,
    assets.stoneMaterial,
    assets.stoneShardMaterial,
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
  /** Scatter floating shattered land shards when true. */
  shatterMode: boolean;
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
  const {
    assets,
    worldSeed,
    forestDensity,
    treeHeightScale,
    shatterMode,
    roadWidth,
    roadDistance,
    insideWorld,
  } = context;
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
  let treeMeshes: THREE.InstancedMesh[] = [];
  let treeShardMeshes: THREE.InstancedMesh[] = [];

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
    treeMeshes = trees.meshes;
    treeShardMeshes = trees.shardMeshes;
    treeDrawCalls = treeMeshes.length;
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
    treeMeshes = trees.meshes;
    treeShardMeshes = trees.shardMeshes;
    treeDrawCalls = 7;
  }

  // Ground cover is texture-only — no 3D grass/weed instances.

  // Only landmark-scale rocks remain: a sparse mix of large and giant boulders.
  // The old pebble majority was visually noisy and did not participate clearly
  // in the shared forest shatter state.
  const stoneTarget = Math.round(7 + forestDensity * 6);
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
      y: 0,
      sx: profile.sx,
      sy: profile.sy,
      sz: profile.sz,
    });
  }

  let stoneMesh: THREE.InstancedMesh | null = null;
  let stoneShardMesh: THREE.InstancedMesh | null = null;
  const stoneColliderList: StoneCollider[] = [];
  if (stonePlacements.length) {
    stoneMesh = new THREE.InstancedMesh(assets.stoneGeometry, assets.stoneMaterial, stonePlacements.length);
    stoneShardMesh = new THREE.InstancedMesh(
      assets.stoneShardGeometry,
      assets.stoneShardMaterial,
      stonePlacements.length,
    );
    const stonePositions = assets.stoneGeometry.getAttribute("position");
    const stoneVertex = new THREE.Vector3();
    for (let i = 0; i < stonePlacements.length; i += 1) {
      const stone = stonePlacements[i];
      dummy.rotation.set(range(random, 0, Math.PI), range(random, 0, Math.PI * 2), range(random, 0, Math.PI));
      dummy.scale.set(stone.scale * stone.sx, stone.scale * stone.sy, stone.scale * stone.sz);
      // Place each irregular boulder from its actual rotated lowest vertex.
      // A small deliberate embed avoids coplanar faces fighting with the ground
      // while keeping the visible mass seated naturally in the turf.
      let lowestY = Infinity;
      for (let vertexIndex = 0; vertexIndex < stonePositions.count; vertexIndex += 1) {
        stoneVertex
          .fromBufferAttribute(stonePositions, vertexIndex)
          .multiply(dummy.scale)
          .applyQuaternion(dummy.quaternion);
        lowestY = Math.min(lowestY, stoneVertex.y);
      }
      const groundEmbed = Math.min(0.14, 0.045 + stone.scale * 0.018);
      stone.y = -lowestY - groundEmbed;
      dummy.position.set(stone.x, stone.y, stone.z);
      dummy.updateMatrix();
      stoneMesh.setMatrixAt(i, dummy.matrix);
      stoneShardMesh.setMatrixAt(i, dummy.matrix);
      // Collision radius from the boulder's horizontal footprint; mass scales
      // with volume so giant stones are substantially harder to move.
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
    stoneShardMesh.instanceMatrix.needsUpdate = true;
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    stoneShardMesh.castShadow = true;
    stoneShardMesh.receiveShadow = true;
    stoneShardMesh.frustumCulled = false;
    group.add(stoneMesh, stoneShardMesh);
  }

  const morph: ShatterMorphData = {
    treeMeshes,
    treeBases: treeMeshes.map(captureInstanceBases),
    shardMeshes: treeShardMeshes,
    stoneMeshes: stoneMesh ? [stoneMesh] : [],
    stoneShardMeshes: stoneShardMesh ? [stoneShardMesh] : [],
  };
  group.userData.shatterMorph = morph;
  // Pose to the requested end state immediately (streaming chunks mid-toggle).
  applyShatterAmount(morph, shatterMode ? 1 : 0, Boolean(shatterMode));

  const drawCalls = 1 + treeDrawCalls + (stonePlacements.length ? 2 : 0) + treeShardMeshes.length;
  return {
    group,
    treeCount,
    grassCount: 0,
    stoneCount: stonePlacements.length,
    drawCalls,
    colliders: { trees: treeColliders, stones: stoneColliderList, stoneMesh, stoneShardMesh },
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
};

function addModelTrees(
  group: THREE.Group,
  ctx: ScatterCtx,
): {
  count: number;
  colliders: TreeCollider[];
  poses: TreePose[];
  meshes: THREE.InstancedMesh[];
  shardMeshes: THREE.InstancedMesh[];
} {
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
    const s = (0.42 + spot.scale * 0.38) * spot.heightScale;
    return { x: spot.p.x, z: spot.p.z, r: spot.template.trunkRadius * s };
  });

  const poses: TreePose[] = spots.map((spot) => {
    const worldHeight = spot.template.height * (0.42 + spot.scale * 0.38) * spot.heightScale;
    return {
      x: spot.p.x,
      z: spot.p.z,
      canopyY: worldHeight * 0.55,
      scale: worldHeight / Math.max(spot.template.height, 0.1),
    };
  });

  const buckets = new Map<string, Spot[]>();
  for (const spot of spots) {
    const list = buckets.get(spot.template.id) ?? [];
    list.push(spot);
    buckets.set(spot.template.id, list);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const shardMeshes: THREE.InstancedMesh[] = [];
  // All GLB templates share one continuous-bole draw call per chunk. Keeping
  // this outside the template buckets avoids paying an extra draw call for
  // every large/medium source variant.
  const continuousBoles = new THREE.InstancedMesh(
    assets.trunkGeometry,
    assets.trunkMaterial,
    Math.max(spots.length, 1),
  );
  continuousBoles.count = spots.length;
  continuousBoles.castShadow = true;
  continuousBoles.receiveShadow = true;
  for (let i = 0; i < spots.length; i += 1) {
    const spot = spots[i];
    const worldHeight = spot.template.height * (0.42 + spot.scale * 0.38) * spot.heightScale;
    const boleHeight = worldHeight * 0.8;
    const boleBaseRadius = worldHeight * 0.045;
    const boleRadiusScale = boleBaseRadius / TRUNK_BASE_RADIUS;
    dummy.position.set(spot.p.x, boleHeight * 0.5, spot.p.z);
    dummy.rotation.set(0, spot.twist, 0);
    dummy.scale.set(boleRadiusScale, boleHeight / assets.trunkHeight, boleRadiusScale);
    dummy.updateMatrix();
    continuousBoles.setMatrixAt(i, dummy.matrix);
  }
  continuousBoles.instanceMatrix.needsUpdate = true;
  group.add(continuousBoles);
  meshes.push(continuousBoles);

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
    meshes.push(wood, leaves);
    if (template.shatterWood && template.shatterLeaves) {
      const shardWood = new THREE.InstancedMesh(
        template.shatterWood,
        assets.modelShardWoodMaterial,
        bucket.length,
      );
      const shardLeaves = new THREE.InstancedMesh(
        template.shatterLeaves,
        assets.modelShardLeafMaterial,
        bucket.length,
      );
      shardWood.castShadow = true;
      shardWood.receiveShadow = true;
      shardWood.frustumCulled = false;
      shardLeaves.castShadow = false;
      shardLeaves.receiveShadow = true;
      shardLeaves.frustumCulled = false;
      for (let i = 0; i < bucket.length; i += 1) {
        wood.getMatrixAt(i, dummy.matrix);
        shardWood.setMatrixAt(i, dummy.matrix);
        shardLeaves.setMatrixAt(i, dummy.matrix);
      }
      shardWood.instanceMatrix.needsUpdate = true;
      shardLeaves.instanceMatrix.needsUpdate = true;
      shardWood.visible = false;
      shardLeaves.visible = false;
      group.add(shardWood, shardLeaves);
      shardMeshes.push(shardWood, shardLeaves);
    }
  }
  return { count: spots.length, colliders, poses, meshes, shardMeshes };
}

function addProceduralTrees(
  group: THREE.Group,
  ctx: ScatterCtx,
): {
  count: number;
  colliders: TreeCollider[];
  poses: TreePose[];
  meshes: THREE.InstancedMesh[];
  shardMeshes: THREE.InstancedMesh[];
} {
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
  // The root neck is visually part of the bole; sharing the bark material
  // prevents a horizontal color/roughness band at the overlap.
  const buttresses = new THREE.InstancedMesh(assets.buttressGeometry, assets.trunkMaterial, Math.max(placed.length, 1));
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
      // Slight overlap hides precision cracks between differently oriented
      // links. With open-ended triangles there is no dark cap at the joint.
      dummy.scale.set(segment.radius * scale, length * 1.045, segment.radius * scale);
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
  const poses: TreePose[] = placed.map((tree) => ({
    x: tree.p.x,
    z: tree.p.z,
    canopyY: assets.trunkHeight * tree.scale * tree.heightScale * 0.85,
    scale: tree.scale,
  }));
  const meshes = [trunks, buttresses, branches, roots, rootRunners, leaves, tipLeaves];
  return { count: placed.length, colliders, poses, meshes, shardMeshes: [] };
}

/** Large boulders with a smaller population of landmark-scale giant rocks. */
function pickStoneProfile(random: () => number) {
  const roll = random();
  if (roll < 0.78) {
    const scale = range(random, 1.7, 2.7);
    const sx = range(random, 0.8, 1.25);
    const sy = range(random, 0.55, 0.95);
    const sz = range(random, 0.8, 1.2);
    return {
      tier: "large" as const,
      scale,
      sx,
      sy,
      sz,
    };
  }
  const scale = range(random, 3.5, 5.2);
  const sx = range(random, 0.85, 1.35);
  const sy = range(random, 0.6, 1.05);
  const sz = range(random, 0.9, 1.4);
  return {
    tier: "giant" as const,
    scale,
    sx,
    sy,
    sz,
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
