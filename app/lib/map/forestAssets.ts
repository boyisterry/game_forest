import * as THREE from "three";
import { createBarkTexture, createGroundTexture } from "./textures";
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
  grassGeometry: THREE.BufferGeometry;
  groundGeometry: THREE.PlaneGeometry;
  trunkMaterial: THREE.MeshStandardMaterial;
  branchMaterial: THREE.MeshStandardMaterial;
  leafMaterial: THREE.MeshPhongMaterial;
  tipMaterial: THREE.MeshPhongMaterial;
  rootMaterial: THREE.MeshStandardMaterial;
  stoneMaterial: THREE.MeshStandardMaterial;
  grassMaterial: THREE.MeshPhongMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
  templates: TreeDescription[];
  leavesPerCluster: number;
  tipLeavesPerCluster: number;
  canopyHeight: number;
  leafPalette: number[];
  trunkHeight: number;
};

function createGrassGeometry() {
  const positions: number[] = [];
  const indices: number[] = [];
  const blades = [0, Math.PI / 3, (Math.PI * 2) / 3];
  for (let blade = 0; blade < blades.length; blade += 1) {
    const angle = blades[blade];
    const sideX = Math.cos(angle) * 0.16;
    const sideZ = Math.sin(angle) * 0.16;
    const leanX = -Math.sin(angle) * 0.1;
    const leanZ = Math.cos(angle) * 0.1;
    const offset = positions.length / 3;
    positions.push(
      -sideX, 0, -sideZ,
      sideX, 0, sideZ,
      sideX * 0.48 + leanX * 0.35, 0.42, sideZ * 0.48 + leanZ * 0.35,
      leanX, 0.86, leanZ,
      -sideX * 0.48 + leanX * 0.35, 0.42, -sideZ * 0.48 + leanZ * 0.35,
    );
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 4, offset + 4, offset + 2, offset + 3);
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
  const groundMap = createGroundTexture();
  const templates: TreeDescription[] = [];
  const templateRandom = createRandom(seed ^ 0x7ee1);
  for (let i = 0; i < 8; i += 1) {
    templates.push(describeTree(templateRandom, resolved));
  }

  return {
    trunkGeometry: createRippledTrunkGeometry(templates[0].trunkHeight, 12, 10),
    branchGeometry: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
    leafGeometry: createLeafGeometry(),
    tipGeometry: createLeafGeometry(),
    rootGeometry: new THREE.ConeGeometry(1, 1, 6),
    stoneGeometry: new THREE.DodecahedronGeometry(0.34, 0),
    grassGeometry: createGrassGeometry(),
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
    }),
    rootMaterial: new THREE.MeshStandardMaterial({ color: 0x6f5f4a, roughness: 0.98 }),
    stoneMaterial: new THREE.MeshStandardMaterial({ color: 0x879083, roughness: 1 }),
    grassMaterial: new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x3c5b24,
      emissiveIntensity: 0.58,
      shininess: 6,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
    groundMaterial: new THREE.MeshStandardMaterial({
      color: groundColor,
      map: groundMap,
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
    assets.grassGeometry,
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
    assets.groundMaterial,
  ];
  materials.forEach((material) => {
    const withMap = material as THREE.Material & { map?: THREE.Texture };
    withMap.map?.dispose();
    material.dispose();
  });
}

export type ChunkBuildContext = {
  assets: SharedForestAssets;
  worldSeed: number;
  forestDensity: number;
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
  const { assets, worldSeed, forestDensity, roadWidth, roadDistance, insideWorld } = context;
  const group = new THREE.Group();
  group.name = `chunk:${coord.cx},${coord.cz}`;
  const origin = chunkOrigin(coord.cx, coord.cz);
  const random = createRandom(chunkSeed(worldSeed, coord.cx, coord.cz));

  const ground = new THREE.Mesh(assets.groundGeometry, assets.groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(origin.x + CHUNK_SIZE * 0.5, -0.04, origin.z + CHUNK_SIZE * 0.5);
  ground.receiveShadow = true;
  group.add(ground);

  const targetTrees = Math.max(1, Math.round(TREES_PER_CHUNK_SAFE(forestDensity)));
  type Placement = {
    p: THREE.Vector3;
    scale: number;
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
    const { p, scale, twist, description } = tree;

    dummy.position.set(p.x, assets.trunkHeight * 0.5 * scale, p.z);
    dummy.rotation.set(0, twist, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(treeIndex, dummy.matrix);

    for (const segment of description.branches) {
      const from = rotateY(segment.ax, segment.az, twist);
      const to = rotateY(segment.bx, segment.bz, twist);
      a.set(p.x + from.x * scale, segment.ay * scale, p.z + from.z * scale);
      b.set(p.x + to.x * scale, segment.by * scale, p.z + to.z * scale);
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
      const cy = cluster.y * scale;
      const cz = p.z + rotated.z * scale;
      const clusterRadius = cluster.radius * scale;
      for (let i = 0; i < assets.leavesPerCluster; i += 1) {
        const theta = random() * Math.PI * 2;
        const spread = Math.pow(random(), 0.62) * clusterRadius;
        const vertical = range(random, -clusterRadius * 0.55, clusterRadius * 0.55);
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
      const cy = cluster.y * scale;
      const cz = p.z + rotated.z * scale;
      for (let i = 0; i < assets.tipLeavesPerCluster; i += 1) {
        dummy.position.set(
          cx + range(random, -0.21, 0.21) * scale,
          cy + range(random, -0.16, 0.22) * scale,
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

  // Dense understory: three crossed, tapered blades per tuft. Like the trees,
  // every tuft is seeded, instanced, and color-varied rather than billboarded.
  const grassTarget = Math.round(145 + forestDensity * 135);
  const grassPlacements: Array<{ x: number; z: number; scale: number; color: number; twist: number }> = [];
  const grassPoint = new THREE.Vector3();
  for (let attempt = 0; attempt < grassTarget * 5 && grassPlacements.length < grassTarget; attempt += 1) {
    grassPoint.set(origin.x + random() * CHUNK_SIZE, 0, origin.z + random() * CHUNK_SIZE);
    if (!insideWorld(grassPoint.x, grassPoint.z, 16)) continue;
    const distance = roadDistance(grassPoint);
    if (distance < roadWidth * 1.2 + range(random, 0.25, 1.4)) continue;
    const base = assets.leafPalette[Math.floor(random() * assets.leafPalette.length)];
    grassPlacements.push({
      x: grassPoint.x,
      z: grassPoint.z,
      scale: range(random, 0.5, 1.35) * (random() < 0.1 ? range(random, 1.25, 1.65) : 1),
      color: base,
      twist: random() * Math.PI * 2,
    });
  }

  if (grassPlacements.length) {
    const grass = new THREE.InstancedMesh(assets.grassGeometry, assets.grassMaterial, grassPlacements.length);
    for (let i = 0; i < grassPlacements.length; i += 1) {
      const tuft = grassPlacements[i];
      dummy.position.set(tuft.x, 0.015, tuft.z);
      dummy.rotation.set(0, tuft.twist, range(random, -0.08, 0.08));
      dummy.scale.set(tuft.scale * range(random, 0.75, 1.08), tuft.scale, tuft.scale * range(random, 0.75, 1.08));
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      color.set(tuft.color).offsetHSL(range(random, -0.018, 0.018), range(random, -0.05, 0.05), range(random, -0.035, 0.11));
      grass.setColorAt(i, color);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.receiveShadow = true;
    group.add(grass);
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

  const drawCalls = 6 + (grassPlacements.length ? 1 : 0) + (stonePlacements.length ? 1 : 0);
  return {
    group,
    treeCount: placed.length,
    grassCount: grassPlacements.length,
    stoneCount: stonePlacements.length,
    drawCalls,
  };
}

/** Mostly pebbles, some large rocks, rare boulders. */
function pickStoneProfile(random: () => number) {
  const roll = random();
  if (roll < 0.74) {
    const scale = range(random, 0.18, 0.42);
    return {
      tier: "small" as const,
      scale,
      y: scale * 0.28,
      sx: range(random, 0.85, 1.2),
      sy: range(random, 0.45, 0.75),
      sz: range(random, 0.85, 1.25),
    };
  }
  if (roll < 0.94) {
    const scale = range(random, 0.65, 1.2);
    return {
      tier: "large" as const,
      scale,
      y: scale * 0.32,
      sx: range(random, 0.8, 1.25),
      sy: range(random, 0.55, 0.95),
      sz: range(random, 0.8, 1.2),
    };
  }
  const scale = range(random, 1.7, 2.9);
  return {
    tier: "giant" as const,
    scale,
    y: scale * 0.34,
    sx: range(random, 0.85, 1.35),
    sy: range(random, 0.6, 1.05),
    sz: range(random, 0.9, 1.4),
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
