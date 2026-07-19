import * as THREE from "three";
import { createBarkTexture, createGroundTextures } from "./textures";
import {
  colorLeaf,
  createLeafGeometry,
  createRippledTrunkGeometry,
  describeTree,
  resolvedTreeParams,
  type TreeDescription,
  type TreeParams,
} from "./tree";
import { createRandom, range } from "./random";
import { CHUNK_SIZE, pickTreeScale, type ChunkCoord, chunkOrigin, chunkSeed } from "./world";

export type SharedForestAssets = {
  trunkGeometry: THREE.CylinderGeometry;
  branchGeometry: THREE.CylinderGeometry;
  leafGeometry: THREE.BufferGeometry;
  tipGeometry: THREE.BufferGeometry;
  rootGeometry: THREE.ConeGeometry;
  stoneGeometry: THREE.DodecahedronGeometry;
  microGrassGeometry: THREE.BufferGeometry;
  grassGeometry: THREE.BufferGeometry;
  weedGeometry: THREE.BufferGeometry;
  groundGeometry: THREE.PlaneGeometry;
  trunkMaterial: THREE.MeshStandardMaterial;
  branchMaterial: THREE.MeshStandardMaterial;
  leafMaterial: THREE.MeshPhongMaterial;
  tipMaterial: THREE.MeshPhongMaterial;
  rootMaterial: THREE.MeshStandardMaterial;
  stoneMaterial: THREE.MeshStandardMaterial;
  grassMaterial: THREE.MeshBasicMaterial;
  weedMaterial: THREE.MeshPhongMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
  templates: TreeDescription[];
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

/** Short carpet layer — cheap enough to grid-fill a whole chunk. */
function createMicroGrassGeometry() {
  return createGrassFan(5, 0.72, 0.85);
}

/** Taller clumps that break the micro carpet into undergrowth. */
function createGrassGeometry() {
  return createGrassFan(9, 1.15, 1.05);
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
  // Two narrow crossed stem ribbons keep the plant readable from every angle.
  for (const angle of [0, Math.PI / 2]) {
    pushBlade(positions, indices, angle, 0, 0.028, 1.45, 0.025);
  }
  for (let level = 0; level < 5; level += 1) {
    const y = 0.28 + level * 0.23;
    const size = 0.34 - level * 0.032;
    const angle = level * 2.34;
    pushLeaf(positions, indices, 0, y, 0, angle, size);
    pushLeaf(positions, indices, 0, y + 0.035, 0, angle + Math.PI, size * 0.9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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
): SharedForestAssets {
  const resolved = resolvedTreeParams(treeParams);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const barkMap = createBarkTexture(anisotropy);
  const { map: groundMap, normalMap: groundNormalMap } = createGroundTextures(
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
    trunkGeometry: createRippledTrunkGeometry(templates[0].trunkHeight, 12, 10),
    branchGeometry: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
    leafGeometry: createLeafGeometry(),
    tipGeometry: createLeafGeometry(),
    rootGeometry: new THREE.ConeGeometry(1, 1, 6),
    stoneGeometry: new THREE.DodecahedronGeometry(0.34, 0),
    microGrassGeometry: createMicroGrassGeometry(),
    grassGeometry: createGrassGeometry(),
    weedGeometry: createBroadleafWeedGeometry(),
    groundGeometry: new THREE.PlaneGeometry(CHUNK_SIZE * 1.01, CHUNK_SIZE * 1.01),
    trunkMaterial: new THREE.MeshStandardMaterial({
      color: 0x81725b,
      map: barkMap,
      roughness: 0.96,
      metalness: 0,
    }),
    branchMaterial: new THREE.MeshStandardMaterial({ color: 0x62523d, roughness: 1 }),
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
    rootMaterial: new THREE.MeshStandardMaterial({ color: 0x6f5f4a, roughness: 0.98 }),
    stoneMaterial: new THREE.MeshStandardMaterial({ color: 0x879083, roughness: 1 }),
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
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 1,
    }),
    templates,
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
    assets.stoneGeometry,
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
    assets.stoneMaterial,
    assets.grassMaterial,
    assets.weedMaterial,
    assets.groundMaterial,
  ];
  materials.forEach((material) => {
    const withMap = material as THREE.Material & {
      map?: THREE.Texture;
      normalMap?: THREE.Texture;
    };
    withMap.map?.dispose();
    withMap.normalMap?.dispose();
    material.dispose();
  });
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
  type Placement = {
    p: THREE.Vector3;
    scale: number;
    heightScale: number;
    color: number;
    twist: number;
    description: TreeDescription;
  };
  const placed: Placement[] = [];
  const point = new THREE.Vector3();
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
  for (const tree of placed) {
    branchTotal += tree.description.branches.length;
    leafTotal += tree.description.clusters.length * assets.leavesPerCluster;
    tipTotal += tree.description.tipClusters.length * assets.tipLeavesPerCluster;
    rootTotal += tree.description.roots.length;
  }

  const trunks = new THREE.InstancedMesh(assets.trunkGeometry, assets.trunkMaterial, placed.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  const branches = new THREE.InstancedMesh(assets.branchGeometry, assets.branchMaterial, Math.max(branchTotal, 1));
  branches.castShadow = true;
  const leaves = new THREE.InstancedMesh(assets.leafGeometry, assets.leafMaterial, Math.max(leafTotal, 1));
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  const tipLeaves = new THREE.InstancedMesh(assets.tipGeometry, assets.tipMaterial, Math.max(tipTotal, 1));
  tipLeaves.castShadow = false;
  const roots = new THREE.InstancedMesh(assets.rootGeometry, assets.rootMaterial, Math.max(rootTotal, 1));
  roots.castShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let branchIndex = 0;
  let leafIndex = 0;
  let tipIndex = 0;
  let rootIndex = 0;

  for (let treeIndex = 0; treeIndex < placed.length; treeIndex += 1) {
    const tree = placed[treeIndex];
    const { p, scale, heightScale, twist, description } = tree;
    const verticalScale = scale * heightScale;

    dummy.position.set(p.x, assets.trunkHeight * 0.5 * verticalScale, p.z);
    dummy.rotation.set(0, twist, 0);
    dummy.scale.set(scale, verticalScale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(treeIndex, dummy.matrix);

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

    for (const root of description.roots) {
      const angle = root.angle + twist;
      dummy.position.set(p.x + Math.cos(angle) * 0.27 * scale, 0.18 * scale, p.z + Math.sin(angle) * 0.27 * scale);
      dummy.rotation.set(0, -angle, Math.PI / 2.35);
      dummy.scale.set(root.radius * scale, root.length * scale, root.radius * root.scaleZ * scale);
      dummy.updateMatrix();
      roots.setMatrixAt(rootIndex++, dummy.matrix);
    }
  }

  branches.count = branchIndex;
  leaves.count = leafIndex;
  tipLeaves.count = tipIndex;
  roots.count = rootIndex;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  tipLeaves.instanceMatrix.needsUpdate = true;
  roots.instanceMatrix.needsUpdate = true;
  group.add(trunks, roots, branches, leaves, tipLeaves);

  // Forest undergrowth: grid-fill a short carpet, then sprinkle taller clumps + weeds.
  // Random scatter left gaps (~1.5m); a ~1m lattice reads as continuous brush.
  type GrassSpot = { x: number; z: number; scale: number; color: number; twist: number };
  const microPlacements: GrassSpot[] = [];
  const tallPlacements: GrassSpot[] = [];
  const colorScratch = new THREE.Color();
  const densityBoost = 0.85 + Math.min(forestDensity, 2.3) * 0.12;
  const microSpacing = 1.02 / densityBoost;
  const tallSpacing = 1.85 / densityBoost;
  const roadKeepOut = roadWidth * 1.05;

  const probe = new THREE.Vector3();
  const collectGrid = (spacing: number, into: GrassSpot[], scaleMin: number, scaleMax: number, skipChance = 0) => {
    const cells = Math.ceil(CHUNK_SIZE / spacing);
    for (let iz = 0; iz < cells; iz += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        if (skipChance > 0 && random() < skipChance) continue;
        const x = origin.x + (ix + 0.5) * spacing + range(random, -spacing * 0.38, spacing * 0.38);
        const z = origin.z + (iz + 0.5) * spacing + range(random, -spacing * 0.38, spacing * 0.38);
        if (x < origin.x + 0.2 || z < origin.z + 0.2 || x > origin.x + CHUNK_SIZE - 0.2 || z > origin.z + CHUNK_SIZE - 0.2) continue;
        if (!insideWorld(x, z, 14)) continue;
        probe.set(x, 0, z);
        if (roadDistance(probe) < roadKeepOut + range(random, 0.05, 0.55)) continue;
        into.push({
          x,
          z,
          scale: range(random, scaleMin, scaleMax),
          color: assets.leafPalette[Math.floor(random() * assets.leafPalette.length)],
          twist: random() * Math.PI * 2,
        });
      }
    }
  };

  collectGrid(microSpacing, microPlacements, 0.95, 1.55, 0.04);
  collectGrid(tallSpacing, tallPlacements, 1.05, 1.85, 0.12);

  const writeGrassLayer = (geometry: THREE.BufferGeometry, spots: GrassSpot[], y: number, widen: number, heighten: number) => {
    if (!spots.length) return;
    const mesh = new THREE.InstancedMesh(geometry, assets.grassMaterial, spots.length);
    for (let i = 0; i < spots.length; i += 1) {
      const tuft = spots[i];
      dummy.position.set(tuft.x, y, tuft.z);
      dummy.rotation.set(0, tuft.twist, range(random, -0.1, 0.1));
      dummy.scale.set(
        tuft.scale * range(random, widen, widen + 0.45),
        tuft.scale * range(random, heighten, heighten + 0.35),
        tuft.scale * range(random, widen, widen + 0.45),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colorScratch.set(tuft.color);
      colorScratch.offsetHSL(range(random, -0.025, 0.025), range(random, -0.05, 0.1), range(random, -0.06, 0.08));
      mesh.setColorAt(i, colorScratch);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  writeGrassLayer(assets.microGrassGeometry, microPlacements, 0.008, 1.25, 0.85);
  writeGrassLayer(assets.grassGeometry, tallPlacements, 0.014, 1.35, 1.05);

  // Broadleaf weeds — denser clusters in the same undergrowth language.
  const weedTarget = Math.round(420 + Math.min(forestDensity, 2.3) * 160);
  const weedPlacements: GrassSpot[] = [];
  const weedSpacing = 2.6 / densityBoost;
  const weedCells = Math.ceil(CHUNK_SIZE / weedSpacing);
  for (let iz = 0; iz < weedCells && weedPlacements.length < weedTarget; iz += 1) {
    for (let ix = 0; ix < weedCells && weedPlacements.length < weedTarget; ix += 1) {
      if (random() < 0.35) continue;
      const x = origin.x + (ix + 0.5) * weedSpacing + range(random, -weedSpacing * 0.4, weedSpacing * 0.4);
      const z = origin.z + (iz + 0.5) * weedSpacing + range(random, -weedSpacing * 0.4, weedSpacing * 0.4);
      if (!insideWorld(x, z, 16)) continue;
      probe.set(x, 0, z);
      if (roadDistance(probe) < roadWidth * 1.25 + range(random, 0.2, 1.1)) continue;
      weedPlacements.push({
        x,
        z,
        scale: range(random, 0.42, 1.05) * (random() < 0.22 ? range(random, 1.35, 1.95) : 1),
        color: assets.leafPalette[Math.floor(random() * assets.leafPalette.length)],
        twist: random() * Math.PI * 2,
      });
    }
  }

  if (weedPlacements.length) {
    const weeds = new THREE.InstancedMesh(assets.weedGeometry, assets.weedMaterial, weedPlacements.length);
    for (let i = 0; i < weedPlacements.length; i += 1) {
      const weed = weedPlacements[i];
      dummy.position.set(weed.x, 0.016, weed.z);
      dummy.rotation.set(0, weed.twist, range(random, -0.06, 0.06));
      dummy.scale.set(weed.scale * range(random, 0.9, 1.2), weed.scale, weed.scale * range(random, 0.9, 1.2));
      dummy.updateMatrix();
      weeds.setMatrixAt(i, dummy.matrix);
    }
    weeds.instanceMatrix.needsUpdate = true;
    group.add(weeds);
  }

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

  if (stonePlacements.length) {
    const stones = new THREE.InstancedMesh(assets.stoneGeometry, assets.stoneMaterial, stonePlacements.length);
    for (let i = 0; i < stonePlacements.length; i += 1) {
      const stone = stonePlacements[i];
      dummy.position.set(stone.x, stone.y, stone.z);
      dummy.rotation.set(range(random, 0, Math.PI), range(random, 0, Math.PI * 2), range(random, 0, Math.PI));
      dummy.scale.set(stone.scale * stone.sx, stone.scale * stone.sy, stone.scale * stone.sz);
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    stones.castShadow = true;
    stones.receiveShadow = true;
    group.add(stones);
  }

  const grassDrawCalls = (microPlacements.length ? 1 : 0) + (tallPlacements.length ? 1 : 0) + (weedPlacements.length ? 1 : 0);
  const drawCalls = 6 + grassDrawCalls + (stonePlacements.length ? 1 : 0);
  return {
    group,
    treeCount: placed.length,
    grassCount: microPlacements.length + tallPlacements.length + weedPlacements.length,
    stoneCount: stonePlacements.length,
    drawCalls,
  };
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
