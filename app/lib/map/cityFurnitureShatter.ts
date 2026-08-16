import * as THREE from "three";
import { enableShatterMaterial } from "./shatterMorph.ts";

export type FurnitureShard = {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  blast: THREE.Vector3;
  blastRotation: THREE.Euler;
  baseScale: number;
};

export type FurnitureShatterPair = {
  root: THREE.Group;
  normal: THREE.Object3D;
  shattered: THREE.Group;
  shards: FurnitureShard[];
  setAmount: (amount: number) => void;
};

export type ModelGeometryMetrics = {
  size: THREE.Vector3;
  faceCount: number;
};

export type SceneShatterOptions = {
  seed?: number;
  spread?: number;
  grid?: readonly [number, number, number];
};

export type SceneShatterPair = {
  root: THREE.Group;
  normal: THREE.Object3D;
  shattered: THREE.Group;
  fragmentCount: number;
  materialBatchCount: number;
  setAmount: (amount: number) => void;
};

type ShatterOptions = {
  seed?: number;
  shardSource?: THREE.Object3D;
  trianglesPerShard?: number;
  spread?: number;
};

function hash(value: number) {
  const x = Math.sin(value * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function smoothstep(value: number) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Measure rendered bounds and triangle count after all local transforms. */
export function measureModelGeometry(object: THREE.Object3D): ModelGeometryMetrics {
  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  let faceCount = 0;
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    const positions = part.geometry.getAttribute("position");
    if (!positions) return;
    const triangleCount = Math.floor((part.geometry.getIndex()?.count ?? positions.count) / 3);
    const instances = part instanceof THREE.InstancedMesh ? part.count : 1;
    faceCount += triangleCount * instances;
  });
  return { size, faceCount };
}

function cloneBrokenMaterial(material: THREE.Material) {
  const broken = material.clone();
  const tinted = broken as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
  };
  tinted.color?.multiplyScalar(0.72);
  tinted.emissive?.multiplyScalar(0.35);
  if (typeof tinted.emissiveIntensity === "number") tinted.emissiveIntensity *= 0.22;
  if (typeof tinted.roughness === "number") tinted.roughness = Math.min(1, tinted.roughness + 0.14);
  if (typeof tinted.metalness === "number") tinted.metalness *= 0.72;
  return broken;
}

function transformedTrianglePositions(object: THREE.Mesh, rootInverse: THREE.Matrix4) {
  const geometry = object.geometry;
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? positions.count) / 3);
  const matrix = rootInverse.clone().multiply(object.matrixWorld);
  const point = new THREE.Vector3();
  const triangles: number[][] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const values: number[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = triangle * 3 + corner;
      const vertex = index ? index.getX(offset) : offset;
      point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
      values.push(point.x, point.y, point.z);
    }
    triangles.push(values);
  }
  return triangles;
}

/**
 * Build a discrete shattered model from the source's real low-poly triangles.
 * The intact model remains separate, matching the forest normal/shattered
 * pairing: 0 is the normal version and 1 is the fully scattered version.
 */
export function createFurnitureShatterPair(
  normal: THREE.Object3D,
  options: ShatterOptions = {},
): FurnitureShatterPair {
  const shardSource = options.shardSource ?? normal;
  const seedBase = options.seed ?? 17;
  const trianglesPerShard = Math.max(1, Math.floor(options.trianglesPerShard ?? 4));
  const spread = options.spread ?? 1;
  const root = new THREE.Group();
  root.name = `${normal.name || "city-decoration"}-normal-shattered-pair`;
  const shattered = new THREE.Group();
  shattered.name = `${normal.name || "city-decoration"}-shattered`;
  shattered.userData = { modelState: "shattered", generatedLocally: true };
  normal.userData.modelState = "normal";
  root.userData = { modelState: "paired", generatedLocally: true };
  root.add(normal, shattered);

  shardSource.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(shardSource.matrixWorld).invert();
  const bounds = new THREE.Box3().setFromObject(shardSource);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const materials = new Map<string, THREE.Material>();
  const shards: FurnitureShard[] = [];
  let meshIndex = 0;

  shardSource.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
    let material = materials.get(sourceMaterial.uuid);
    if (!material) {
      material = cloneBrokenMaterial(sourceMaterial);
      materials.set(sourceMaterial.uuid, material);
    }
    const triangles = transformedTrianglePositions(object, rootInverse);
    for (let start = 0; start < triangles.length; start += trianglesPerShard) {
      const chunk = triangles.slice(start, start + trianglesPerShard);
      if (!chunk.length) continue;
      const positions = chunk.flat();
      const home = new THREE.Vector3();
      for (let i = 0; i < positions.length; i += 3) {
        home.x += positions[i];
        home.y += positions[i + 1];
        home.z += positions[i + 2];
      }
      home.multiplyScalar(1 / Math.max(positions.length / 3, 1));
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= home.x;
        positions[i + 1] -= home.y;
        positions[i + 2] -= home.z;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const shardIndex = shards.length;
      const shard = new THREE.Mesh(geometry, material);
      shard.name = `${object.name || `part-${meshIndex}`}-shattered-shard-${shardIndex + 1}`;
      shard.castShadow = true;
      shard.receiveShadow = true;
      shard.frustumCulled = false;
      shard.userData = { sourcePart: object.name, shardIndex, modelState: "shattered" };

      const radial = home.clone().sub(center);
      radial.y *= 0.35;
      if (radial.lengthSq() < 0.015) {
        const angle = hash(seedBase + shardIndex * 7) * Math.PI * 2;
        radial.set(Math.cos(angle), 0.15, Math.sin(angle));
      }
      radial.normalize();
      const heightT = THREE.MathUtils.clamp((home.y - bounds.min.y) / Math.max(size.y, 0.1), 0, 1);
      const distance = spread * (0.42 + hash(seedBase + shardIndex * 11 + 2) * 1.35 + heightT * 0.48);
      const blast = home.clone().addScaledVector(radial, distance);
      blast.y += spread * (0.28 + hash(seedBase + shardIndex * 13 + 3) * 1.12 + heightT * 0.46);
      const blastRotation = new THREE.Euler(
        (hash(seedBase + shardIndex * 17 + 4) - 0.5) * 2.8,
        hash(seedBase + shardIndex * 19 + 5) * Math.PI * 2,
        (hash(seedBase + shardIndex * 23 + 6) - 0.5) * 2.8,
      );
      const baseScale = 0.78 + hash(seedBase + shardIndex * 29 + 7) * 0.24;
      shard.position.copy(home);
      shattered.add(shard);
      shards.push({ mesh: shard, home, blast, blastRotation, baseScale });
    }
    meshIndex += 1;
  });

  const setAmount = (value: number) => {
    const amount = THREE.MathUtils.clamp(value, 0, 1);
    const reveal = smoothstep((amount - 0.025) / 0.24);
    normal.visible = amount < 0.18;
    normal.scale.setScalar(1 + amount * 0.035);
    shattered.visible = reveal > 0.002;
    for (let i = 0; i < shards.length; i += 1) {
      const fragment = shards[i];
      const localAmount = THREE.MathUtils.clamp(amount + (i % 11) * 0.006, 0, 1);
      fragment.mesh.position.lerpVectors(fragment.home, fragment.blast, localAmount);
      fragment.mesh.rotation.set(
        fragment.blastRotation.x * localAmount,
        fragment.blastRotation.y * localAmount,
        fragment.blastRotation.z * localAmount,
      );
      fragment.mesh.scale.setScalar((0.48 + reveal * 0.52) * fragment.baseScale);
    }
  };

  setAmount(0);
  return { root, normal, shattered, shards, setAmount };
}

type SceneFragmentPose = {
  center: THREE.Vector3;
  blast: THREE.Vector3;
  axisAngle: THREE.Vector4;
  scale: number;
};

type SceneMaterialBatch = {
  sourceMaterial: THREE.Material;
  positions: number[];
  centers: number[];
  blasts: number[];
  axesAndAngles: number[];
  scalesAndStaggers: number[];
  uvs: number[];
  colors: number[];
};

/**
 * Build a GPU-batched shattered version for a complete architectural scene.
 * Unlike the furniture helper, this keeps one draw call per source material
 * instead of creating one Mesh per fragment, so large campuses and districts
 * can expose a real broken model without multiplying their draw calls by the
 * number of shards.
 */
export function createSceneShatterPair(
  normal: THREE.Object3D,
  options: SceneShatterOptions = {},
): SceneShatterPair {
  const seedBase = options.seed ?? 101;
  const spread = options.spread ?? 4.5;
  const [gridX, gridY, gridZ] = options.grid ?? [18, 8, 14];
  const root = new THREE.Group();
  const normalInitiallyVisible = normal.visible;
  root.name = `${normal.name || "city-scene"}-normal-shattered-pair`;
  const shattered = new THREE.Group();
  shattered.name = `${normal.name || "city-scene"}-shattered`;
  root.userData = {
    modelState: "paired",
    generatedLocally: true,
    shatterSystem: "gpu-material-batches",
    snapshotAtBuild: true,
  };
  normal.userData.modelState = "normal";
  shattered.userData = {
    modelState: "shattered",
    generatedLocally: true,
    shatterSystem: "gpu-material-batches",
    snapshotAtBuild: true,
  };
  root.add(normal, shattered);

  normal.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(normal);
  const size = bounds.getSize(new THREE.Vector3());
  const sceneCenter = bounds.getCenter(new THREE.Vector3());
  const batches = new Map<string, SceneMaterialBatch>();
  const poses = new Map<number, SceneFragmentPose>();
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  const resolveMaterial = (mesh: THREE.Mesh, triangleOffset: number) => {
    if (!Array.isArray(mesh.material)) return mesh.material;
    const group = mesh.geometry.groups.find(
      (candidate) => triangleOffset >= candidate.start && triangleOffset < candidate.start + candidate.count,
    );
    return mesh.material[group?.materialIndex ?? 0] ?? mesh.material[0];
  };

  const fragmentFor = (point: THREE.Vector3) => {
    const cx = Math.min(gridX - 1, Math.max(0, Math.floor(((point.x - bounds.min.x) / Math.max(size.x, 1e-5)) * gridX)));
    const cy = Math.min(gridY - 1, Math.max(0, Math.floor(((point.y - bounds.min.y) / Math.max(size.y, 1e-5)) * gridY)));
    const cz = Math.min(gridZ - 1, Math.max(0, Math.floor(((point.z - bounds.min.z) / Math.max(size.z, 1e-5)) * gridZ)));
    const key = cx + cy * gridX + cz * gridX * gridY;
    const existing = poses.get(key);
    if (existing) return existing;
    const center = new THREE.Vector3(
      bounds.min.x + ((cx + 0.5) / gridX) * size.x,
      bounds.min.y + ((cy + 0.5) / gridY) * size.y,
      bounds.min.z + ((cz + 0.5) / gridZ) * size.z,
    );
    const direction = center.clone().sub(sceneCenter);
    direction.y *= 0.28;
    if (direction.lengthSq() < 0.01) {
      const fallback = hash(seedBase + key * 5) * Math.PI * 2;
      direction.set(Math.cos(fallback), 0.18, Math.sin(fallback));
    }
    direction.normalize();
    const heightT = THREE.MathUtils.clamp((center.y - bounds.min.y) / Math.max(size.y, 0.1), 0, 1);
    const blastDistance = spread * (0.55 + hash(seedBase + key * 11 + 2) * 1.4 + heightT * 0.42);
    const blast = center.clone().addScaledVector(direction, blastDistance);
    blast.y += spread * (0.25 + hash(seedBase + key * 13 + 3) * 0.95 + heightT * 0.35);
    const axis = new THREE.Vector3(
      hash(seedBase + key * 17 + 4) - 0.5,
      hash(seedBase + key * 19 + 5) - 0.5,
      hash(seedBase + key * 23 + 6) - 0.5,
    ).normalize();
    const pose: SceneFragmentPose = {
      center,
      blast,
      axisAngle: new THREE.Vector4(axis.x, axis.y, axis.z, (hash(seedBase + key * 29 + 7) - 0.5) * 4.2),
      scale: 0.82 + hash(seedBase + key * 31 + 8) * 0.2,
    };
    poses.set(key, pose);
    return pose;
  };

  const appendMesh = (mesh: THREE.Mesh, transform: THREE.Matrix4) => {
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    const uv = mesh.geometry.getAttribute("uv");
    const color = mesh.geometry.getAttribute("color");
    const index = mesh.geometry.getIndex();
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const triangleOffset = triangle * 3;
      const material = resolveMaterial(mesh, triangleOffset);
      if (!material || !material.visible) continue;
      const readVertex = (corner: number, target: THREE.Vector3) => {
        const offset = triangleOffset + corner;
        const vertex = index ? index.getX(offset) : offset;
        return target.fromBufferAttribute(position, vertex).applyMatrix4(transform);
      };
      readVertex(0, a);
      readVertex(1, b);
      readVertex(2, c);
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const pose = fragmentFor(centroid);
      let batch = batches.get(material.uuid);
      if (!batch) {
        batch = {
          sourceMaterial: material,
          positions: [],
          centers: [],
          blasts: [],
          axesAndAngles: [],
          scalesAndStaggers: [],
          uvs: [],
          colors: [],
        };
        batches.set(material.uuid, batch);
      }
      for (const [corner, vertex] of [a, b, c].entries()) {
        const offset = triangleOffset + corner;
        const sourceVertex = index ? index.getX(offset) : offset;
        batch.positions.push(vertex.x, vertex.y, vertex.z);
        batch.centers.push(pose.center.x, pose.center.y, pose.center.z);
        batch.blasts.push(pose.blast.x, pose.blast.y, pose.blast.z);
        batch.axesAndAngles.push(pose.axisAngle.x, pose.axisAngle.y, pose.axisAngle.z, pose.axisAngle.w);
        batch.scalesAndStaggers.push(pose.scale, 0);
        batch.uvs.push(uv?.getX(sourceVertex) ?? 0, uv?.getY(sourceVertex) ?? 0);
        batch.colors.push(color?.getX(sourceVertex) ?? 1, color?.getY(sourceVertex) ?? 1, color?.getZ(sourceVertex) ?? 1);
      }
    }
  };

  normal.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (object instanceof THREE.InstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
        appendMesh(object, worldMatrix);
      }
      return;
    }
    appendMesh(object, object.matrixWorld);
  });

  const shatterMaterials: Array<THREE.Material & { userData: { shatterAmount?: { value: number } } }> = [];
  for (const [materialId, batch] of batches) {
    if (batch.positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    const centers = new Float32Array(batch.centers);
    geometry.setAttribute("shardCenter", new THREE.BufferAttribute(centers, 3));
    geometry.setAttribute("shardRepair", new THREE.BufferAttribute(centers, 3));
    geometry.setAttribute("shardBlast", new THREE.Float32BufferAttribute(batch.blasts, 3));
    geometry.setAttribute("shardAxisAngle", new THREE.Float32BufferAttribute(batch.axesAndAngles, 4));
    geometry.setAttribute("shardScaleStagger", new THREE.Float32BufferAttribute(batch.scalesAndStaggers, 2));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(batch.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = enableShatterMaterial(cloneBrokenMaterial(batch.sourceMaterial)) as THREE.Material & {
      userData: { shatterAmount?: { value: number } };
    };
    shatterMaterials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `scene-shattered-material-batch-${materialId}`;
    const transparent = material.transparent || material.opacity < 1;
    mesh.castShadow = !transparent;
    mesh.receiveShadow = !transparent;
    if (geometry.boundingSphere) geometry.boundingSphere.radius += spread * 3.2;
    mesh.userData = { sourceMaterial: materialId, modelState: "shattered" };
    shattered.add(mesh);
  }

  const setAmount = (value: number) => {
    const amount = THREE.MathUtils.clamp(value, 0, 1);
    const reveal = smoothstep((amount - 0.025) / 0.24);
    normal.visible = amount < 0.18 ? normalInitiallyVisible : false;
    shattered.visible = reveal > 0.002;
    shatterMaterials.forEach((material) => {
      const uniform = material.userData.shatterAmount;
      if (uniform) uniform.value = amount;
    });
    root.userData.shatterAmount = amount;
  };

  shattered.userData.fragmentCount = poses.size;
  shattered.userData.materialBatchCount = shatterMaterials.length;
  root.userData.fragmentCount = poses.size;
  root.userData.materialBatchCount = shatterMaterials.length;
  setAmount(0);
  return {
    root,
    normal,
    shattered,
    fragmentCount: poses.size,
    materialBatchCount: shatterMaterials.length,
    setAmount,
  };
}
