import * as THREE from "three";

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
