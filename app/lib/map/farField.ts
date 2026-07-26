import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom, range } from "./random";
import {
  createLeafGeometry,
  crownRadiusAt,
  describeTree,
  type BranchSegment,
  type LeafCluster,
} from "./tree";
import {
  CHUNK_SIZE,
  LOAD_RADIUS_CHUNKS,
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  isInsideWorld,
  pickTreeScale,
} from "./world";

export type FarFieldOptions = {
  groundMap: THREE.Texture;
  normalMap: THREE.Texture | null;
  barkMap?: THREE.Texture | null;
  barkNormalMap?: THREE.Texture | null;
  barkRoughnessMap?: THREE.Texture | null;
  seed: number;
  canopyColors: number[];
  trunkColor?: number;
  canopyWidth: number;
  treeHeightScale: number;
  roadDistance: (point: THREE.Vector3) => number;
  roadWidth: number;
};

type TreeSpot = {
  x: number;
  z: number;
  scale: number;
  heightScale: number;
  twist: number;
  /** Stable per-tree threshold for a density cross-fade. */
  reveal: number;
};

type FarTreeBatch = {
  wood: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  spots: TreeSpot[];
};

type CardSpot = {
  x: number;
  z: number;
  width: number;
  height: number;
  reveal: number;
};

type CardBatch = {
  mesh: THREE.InstancedMesh;
  spots: CardSpot[];
};

/** Distance bands for Plan B mid/far layering (meters from streaming focus). */
function farBands() {
  const streamEdge = CHUNK_SIZE * (LOAD_RADIUS_CHUNKS + 0.75);
  const midSpan = CHUNK_SIZE * 3.2;
  return {
    streamEdge,
    geoInBand: CHUNK_SIZE * 1.15,
    geoOutStart: streamEdge + midSpan,
    geoOutBand: CHUNK_SIZE * 1.35,
    // Cards begin while geometry is still present, then own the horizon.
    cardInStart: streamEdge + midSpan * 0.42,
    cardInBand: CHUNK_SIZE * 1.55,
  };
}

/**
 * Always-resident far field:
 * - grass plate
 * - mid ring: Plan A geometry LOD (filled canopy, short wood skeleton)
 * - far ring: camera-facing painted foliage cards for the horizon belt
 */
export class FarFieldLayer {
  readonly group = new THREE.Group();
  private readonly treeLayer = new THREE.Group();
  private readonly cardLayer = new THREE.Group();
  private readonly batches: FarTreeBatch[] = [];
  private readonly cardBatches: CardBatch[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly white = new THREE.Color(0xffffff);
  private lastFocusX = Number.POSITIVE_INFINITY;
  private lastFocusZ = Number.POSITIVE_INFINITY;

  constructor(options: FarFieldOptions) {
    this.group.name = "far-field";
    this.treeLayer.name = "far-field-geometry-trees";
    this.cardLayer.name = "far-field-horizon-cards";
    // Never flash LOD / cards while the refreshed near-field queue is filling.
    this.treeLayer.visible = false;
    this.cardLayer.visible = false;
    this.group.add(
      createFarFieldBase(options.groundMap, options.normalMap),
      this.treeLayer,
      this.cardLayer,
    );
    this.buildTrees(options);
    this.buildHorizonCards(options);
  }

  update(focusX: number, focusZ: number, camera: THREE.Camera, nearFieldReady: boolean) {
    if (!nearFieldReady) {
      this.treeLayer.visible = false;
      this.cardLayer.visible = false;
      return;
    }
    if (!this.treeLayer.visible) {
      this.treeLayer.visible = true;
      this.cardLayer.visible = true;
      this.lastFocusX = Number.POSITIVE_INFINITY;
      this.lastFocusZ = Number.POSITIVE_INFINITY;
    }

    const focusMoved = Math.hypot(focusX - this.lastFocusX, focusZ - this.lastFocusZ) >= 8;
    if (focusMoved) {
      this.lastFocusX = focusX;
      this.lastFocusZ = focusZ;
      this.updateGeometryLod(focusX, focusZ);
    }
    // Cards always re-yaw toward the camera so orbiting stays correct.
    this.updateHorizonCards(focusX, focusZ, camera);
  }

  dispose() {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.InstancedMesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        const mapped = material as THREE.Material & {
          map?: THREE.Texture;
          normalMap?: THREE.Texture;
          roughnessMap?: THREE.Texture;
        };
        if (!material.userData.sharedTextures) {
          mapped.map?.dispose();
          mapped.normalMap?.dispose();
          mapped.roughnessMap?.dispose();
        }
        material.dispose();
      });
    });
    this.batches.length = 0;
    this.cardBatches.length = 0;
    this.group.clear();
  }

  private updateGeometryLod(focusX: number, focusZ: number) {
    const { streamEdge, geoInBand, geoOutStart, geoOutBand } = farBands();
    for (const batch of this.batches) {
      for (let i = 0; i < batch.spots.length; i += 1) {
        const spot = batch.spots[i];
        const dist = Math.hypot(focusX - spot.x, focusZ - spot.z);
        let fade = THREE.MathUtils.smoothstep(dist, streamEdge, streamEdge + geoInBand);
        fade *= 1 - THREE.MathUtils.smoothstep(dist, geoOutStart, geoOutStart + geoOutBand);
        this.dummy.position.set(spot.x, 0, spot.z);
        this.dummy.rotation.set(0, spot.twist, 0);
        if (fade < spot.reveal * 0.85) this.dummy.scale.setScalar(0);
        else {
          const s = THREE.MathUtils.clamp(fade, 0, 1);
          this.dummy.scale.set(spot.scale * s, spot.scale * spot.heightScale * s, spot.scale * s);
        }
        this.dummy.updateMatrix();
        batch.wood.setMatrixAt(i, this.dummy.matrix);
        batch.leaves.setMatrixAt(i, this.dummy.matrix);
      }
      batch.wood.instanceMatrix.needsUpdate = true;
      batch.leaves.instanceMatrix.needsUpdate = true;
    }
  }

  private updateHorizonCards(focusX: number, focusZ: number, camera: THREE.Camera) {
    const { cardInStart, cardInBand } = farBands();
    const camX = camera.position.x;
    const camZ = camera.position.z;
    for (const batch of this.cardBatches) {
      for (let i = 0; i < batch.spots.length; i += 1) {
        const spot = batch.spots[i];
        const dist = Math.hypot(focusX - spot.x, focusZ - spot.z);
        let fade = THREE.MathUtils.smoothstep(dist, cardInStart, cardInStart + cardInBand);
        if (fade < spot.reveal * 0.55) {
          this.dummy.position.set(spot.x, 0, spot.z);
          this.dummy.scale.setScalar(0);
          this.dummy.rotation.set(0, 0, 0);
        } else {
          const height = spot.height * fade;
          const width = spot.width * fade;
          this.dummy.position.set(spot.x, height * 0.5, spot.z);
          this.dummy.scale.set(width, height, 1);
          this.dummy.rotation.set(0, Math.atan2(camX - spot.x, camZ - spot.z), 0);
        }
        this.dummy.updateMatrix();
        batch.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private buildTrees(options: FarFieldOptions) {
    const random = createRandom(options.seed ^ 0x51a2);
    // Tighter than before so the far canopy reads as a forest belt, not dots.
    const spacing = 30;
    const halfW = WORLD_HALF_WIDTH * 0.96;
    const halfD = WORLD_HALF_DEPTH * 0.96;
    const probe = new THREE.Vector3();
    const buckets: TreeSpot[][] = [[], [], []];
    const tint = new THREE.Color();

    for (let z = -halfD; z <= halfD; z += spacing) {
      for (let x = -halfW; x <= halfW; x += spacing) {
        const px = x + range(random, -spacing * 0.38, spacing * 0.38);
        const pz = z + range(random, -spacing * 0.38, spacing * 0.38);
        if (!isInsideWorld(px, pz, options.seed, 64)) continue;
        probe.set(px, 0, pz);
        if (options.roadDistance(probe) < options.roadWidth * 2.6 + range(random, 0.8, 5)) continue;
        if (random() < 0.06) continue;
        buckets[Math.floor(random() * buckets.length)].push({
          x: px,
          z: pz,
          scale: pickTreeScale(random),
          heightScale: options.treeHeightScale * range(random, 0.9, 1.12),
          twist: random() * Math.PI * 2,
          reveal: random(),
        });
      }
    }

    for (let variant = 0; variant < buckets.length; variant += 1) {
      const spots = buckets[variant];
      if (!spots.length) continue;
      const leafColor = options.canopyColors[variant % Math.max(options.canopyColors.length, 1)] ?? 0x4f7a32;
      const template = createFarTreeGeometry(
        (options.seed ^ 0x6d21) + variant * 7919,
        options.canopyWidth * 1.22,
        leafColor,
      );
      const woodMaterial = new THREE.MeshStandardMaterial({
        color: options.barkMap ? 0xb6a991 : options.trunkColor ?? 0x5c4935,
        map: options.barkMap ?? undefined,
        normalMap: options.barkNormalMap ?? undefined,
        normalScale: options.barkNormalMap ? new THREE.Vector2(0.68, 0.68) : undefined,
        roughnessMap: options.barkRoughnessMap ?? undefined,
        roughness: 0.97,
        metalness: 0,
        fog: true,
      });
      // These maps belong to SharedForestAssets and are disposed there once.
      woodMaterial.userData.sharedTextures = true;
      const leafMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        vertexColors: true,
        emissive: new THREE.Color(leafColor).multiplyScalar(0.14),
        emissiveIntensity: 0.42,
        shininess: 6,
        side: THREE.DoubleSide,
        fog: true,
      });
      const wood = new THREE.InstancedMesh(template.wood, woodMaterial, spots.length);
      const leaves = new THREE.InstancedMesh(template.leaves, leafMaterial, spots.length);
      wood.name = `far-field-wood-${variant}`;
      leaves.name = `far-field-leaves-${variant}`;
      wood.castShadow = leaves.castShadow = false;
      wood.receiveShadow = leaves.receiveShadow = false;
      for (let i = 0; i < spots.length; i += 1) {
        this.dummy.position.set(spots[i].x, 0, spots[i].z);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        wood.setMatrixAt(i, this.dummy.matrix);
        leaves.setMatrixAt(i, this.dummy.matrix);
        // Near-white multipliers — season color already lives in vertexColors.
        tint.setRGB(1, 1, 1);
        tint.offsetHSL(range(random, -0.02, 0.02), range(random, -0.04, 0.05), range(random, -0.06, 0.05));
        leaves.setColorAt(i, tint);
      }
      wood.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      this.batches.push({ wood, leaves, spots });
      this.treeLayer.add(wood, leaves);
    }
  }

  private buildHorizonCards(options: FarFieldOptions) {
    const random = createRandom(options.seed ^ 0xc4d1);
    const spacing = 56;
    const halfW = WORLD_HALF_WIDTH * 0.97;
    const halfD = WORLD_HALF_DEPTH * 0.97;
    const probe = new THREE.Vector3();
    const buckets: CardSpot[][] = [[], [], []];

    for (let z = -halfD; z <= halfD; z += spacing) {
      for (let x = -halfW; x <= halfW; x += spacing) {
        const px = x + range(random, -spacing * 0.4, spacing * 0.4);
        const pz = z + range(random, -spacing * 0.4, spacing * 0.4);
        if (!isInsideWorld(px, pz, options.seed, 52)) continue;
        probe.set(px, 0, pz);
        if (options.roadDistance(probe) < options.roadWidth * 2.2 + range(random, 0.5, 4)) continue;
        if (random() < 0.1) continue;
        const height = range(random, 9, 16) * (random() < 0.12 ? range(random, 1.2, 1.55) : 1);
        buckets[Math.floor(random() * buckets.length)].push({
          x: px,
          z: pz,
          width: height * range(random, 0.55, 0.78),
          height,
          reveal: random(),
        });
      }
    }

    for (let variant = 0; variant < buckets.length; variant += 1) {
      const spots = buckets[variant];
      if (!spots.length) continue;
      const leafColor = options.canopyColors[variant % Math.max(options.canopyColors.length, 1)] ?? 0x4f7a32;
      const atlas = createTreeCardAtlas(
        options.canopyColors,
        options.trunkColor ?? 0x5c4935,
        createRandom((options.seed ^ 0xb17e) + variant * 9173),
      );
      const material = new THREE.MeshBasicMaterial({
        map: atlas,
        color: 0xffffff,
        transparent: true,
        alphaTest: 0.22,
        depthWrite: true,
        fog: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, spots.length);
      mesh.name = `far-field-horizon-card-${variant}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.count = spots.length;
      for (let i = 0; i < spots.length; i += 1) {
        this.dummy.scale.setScalar(0);
        this.dummy.position.set(spots[i].x, 0, spots[i].z);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        this.tint.set(leafColor);
        this.tint.offsetHSL(range(random, -0.03, 0.03), range(random, -0.06, 0.08), range(random, -0.05, 0.08));
        // Soft multiply so atlas greens stay leafy, never crushed black.
        this.tint.lerp(this.white, 0.35);
        mesh.setColorAt(i, this.tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.cardBatches.push({ mesh, spots });
      this.cardLayer.add(mesh);
    }
  }
}

function sampleEven<T>(items: T[], count: number, offset = 0) {
  if (items.length <= count) return [...items];
  const sampled: T[] = [];
  for (let i = 0; i < count; i += 1) {
    sampled.push(items[(Math.floor((i / count) * items.length) + offset) % items.length]);
  }
  return sampled;
}

/** Prefer outer / tip clusters so the silhouette stays filled when budgets are tight. */
function pickCanopyClusters(clusters: LeafCluster[], tipClusters: LeafCluster[], count: number, canopyWidth: number) {
  const canopyHeight = 0.92;
  const tipSet = new Set(tipClusters);
  const ranked = [...clusters].sort((a, b) => {
    const score = (c: LeafCluster) => {
      const envelope = Math.max(0.2, crownRadiusAt(c.y, canopyHeight, canopyWidth));
      const radial = Math.hypot(c.x, c.z) / envelope;
      const tipBonus = tipSet.has(c) || c.bias > 1.05 ? 0.55 : 0;
      return radial * 1.35 + (c.y / (11.5 * canopyHeight)) * 0.65 + tipBonus;
    };
    return score(b) - score(a);
  });
  return ranked.slice(0, Math.min(count, ranked.length));
}

function branchGeometry(segment: BranchSegment) {
  const a = new THREE.Vector3(segment.ax, segment.ay, segment.az);
  const b = new THREE.Vector3(segment.bx, segment.by, segment.bz);
  const delta = b.clone().sub(a);
  const length = delta.length();
  if (length < 1e-4) return null;
  const radius = Math.max(0.04, segment.radius * 0.95);
  const geometry = new THREE.CylinderGeometry(radius * 0.72, radius, length, 3, 1, false);
  const matrix = new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function paintLeafColors(geometry: THREE.BufferGeometry, base: THREE.Color, random: () => number) {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const scratch = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    scratch.copy(base);
    scratch.offsetHSL(range(random, -0.03, 0.03), range(random, -0.08, 0.1), range(random, -0.08, 0.1));
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function leafSprayAt(
  cluster: LeafCluster,
  spray: THREE.BufferGeometry,
  random: () => number,
  radiusScale: number,
) {
  const geometry = spray.clone();
  const radius = cluster.radius * radiusScale * range(random, 1.15, 1.55);
  const position = new THREE.Vector3(
    cluster.x + range(random, -0.55, 0.55) * cluster.radius,
    cluster.y + range(random, -0.4, 0.45) * cluster.radius,
    cluster.z + range(random, -0.55, 0.55) * cluster.radius,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(range(random, -0.9, 0.9), range(random, 0, Math.PI * 2), range(random, -0.6, 0.6)),
  );
  // Slightly flattened so sprays read as leaf pads rather than spheres.
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      position,
      quaternion,
      new THREE.Vector3(radius * range(random, 0.9, 1.15), radius * range(random, 0.55, 0.8), radius * range(random, 0.95, 1.2)),
    ),
  );
  return geometry;
}

function leafClusterGeometries(cluster: LeafCluster, spray: THREE.BufferGeometry, random: () => number) {
  const sprays = random() < 0.4 ? 3 : 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < sprays; i += 1) {
    // Outer passes a bit larger to close crown gaps at distance.
    parts.push(leafSprayAt(cluster, spray, random, i === 0 ? 1.35 : 1.1));
  }
  return parts;
}

function createFarTreeGeometry(seed: number, canopyWidth: number, leafColor: number) {
  const random = createRandom(seed);
  // Extra filler clusters give pickCanopyClusters denser outer candidates.
  const description = describeTree(random, { canopyWidth, leafDensity: 1.2 });
  const trunk = new THREE.CylinderGeometry(0.34, 0.58, description.trunkHeight, 4, 1, false);
  trunk.translate(0, description.trunkHeight * 0.5, 0);

  // Skeleton only — thick primary limbs. Fine twigs stay hidden under foliage.
  const primary = [...description.branches]
    .filter((branch) => branch.radius >= 0.045)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 14);
  const sampledBranches = sampleEven(primary, Math.min(10, primary.length), seed % 11);
  const woodParts: THREE.BufferGeometry[] = [trunk];
  for (const segment of sampledBranches) {
    const part = branchGeometry(segment);
    if (part) woodParts.push(part);
  }
  const wood = mergeGeometries(woodParts, false);
  if (!wood) throw new Error("Unable to merge far-field wood geometry");
  woodParts.forEach((part) => part.dispose());

  // ~110 silhouette-biased clusters × 2–3 sprays → solid distant canopy mass.
  const clusters = pickCanopyClusters(description.clusters, description.tipClusters, 118, canopyWidth);
  const spray = createLeafGeometry();
  const leafParts = clusters.flatMap((cluster) => leafClusterGeometries(cluster, spray, random));
  const leaves = mergeGeometries(leafParts, false);
  spray.dispose();
  if (!leaves) throw new Error("Unable to merge far-field leaf geometry");
  leafParts.forEach((part) => part.dispose());

  paintLeafColors(leaves, new THREE.Color(leafColor), random);
  return { wood, leaves };
}

function createFarFieldBase(
  groundMap: THREE.Texture,
  normalMap: THREE.Texture | null,
  groundTint = 0xffffff,
): THREE.Mesh {
  const map = groundMap.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(96, 96);
  map.needsUpdate = true;

  let farNormal: THREE.Texture | null = null;
  if (normalMap) {
    farNormal = normalMap.clone();
    farNormal.wrapS = farNormal.wrapT = THREE.RepeatWrapping;
    farNormal.repeat.set(96, 96);
    farNormal.needsUpdate = true;
  }

  const material = new THREE.MeshStandardMaterial({
    color: groundTint,
    map,
    normalMap: farNormal ?? undefined,
    normalScale: farNormal ? new THREE.Vector2(0.55, 0.55) : undefined,
    roughness: 1,
    // Keep far plate behind streamed chunk ground in the depth buffer.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2.15, WORLD_HALF_DEPTH * 2.15, 1, 1),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.35;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = "far-field-base";
  return mesh;
}

function toRgb(c: number) {
  return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
}

function css(c: number, a = 1, shade = 1) {
  const { r, g, b } = toRgb(c);
  const rr = Math.min(255, Math.round(r * shade));
  const gg = Math.min(255, Math.round(g * shade));
  const bb = Math.min(255, Math.round(b * shade));
  return a >= 1 ? `rgb(${rr},${gg},${bb})` : `rgba(${rr},${gg},${bb},${a})`;
}

/** Soft painted tree card: short trunk + leafy canopy mass with alpha edges. */
function createTreeCardAtlas(canopyColors: number[], trunkColor: number, random: () => number) {
  const width = 128;
  const height = 176;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Far-field tree canvas unavailable");
  ctx.clearRect(0, 0, width, height);

  const trunkGrad = ctx.createLinearGradient(width * 0.5, height * 0.42, width * 0.5, height);
  trunkGrad.addColorStop(0, css(trunkColor, 1, 1.05));
  trunkGrad.addColorStop(1, css(trunkColor, 1, 0.72));
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(width * 0.46, height * 0.48);
  ctx.lineTo(width * 0.54, height * 0.48);
  ctx.lineTo(width * 0.58, height * 0.98);
  ctx.lineTo(width * 0.42, height * 0.98);
  ctx.closePath();
  ctx.fill();

  const lobes = [
    { x: 0.5, y: 0.28, rx: 0.36, ry: 0.32, shade: 0.78 },
    { x: 0.34, y: 0.34, rx: 0.26, ry: 0.24, shade: 0.94 },
    { x: 0.66, y: 0.33, rx: 0.27, ry: 0.25, shade: 0.9 },
    { x: 0.5, y: 0.16, rx: 0.24, ry: 0.22, shade: 1.1 },
    { x: 0.4, y: 0.24, rx: 0.2, ry: 0.18, shade: 1.02 },
    { x: 0.6, y: 0.23, rx: 0.19, ry: 0.17, shade: 1.06 },
    { x: 0.5, y: 0.4, rx: 0.3, ry: 0.2, shade: 0.72 },
    { x: 0.28, y: 0.28, rx: 0.16, ry: 0.14, shade: 0.88 },
    { x: 0.72, y: 0.27, rx: 0.16, ry: 0.15, shade: 0.86 },
  ];

  for (const lobe of lobes) {
    const tone = canopyColors[Math.floor(random() * Math.max(canopyColors.length, 1))] ?? 0x5a8a35;
    const gx = width * (lobe.x + range(random, -0.03, 0.03));
    const gy = height * (lobe.y + range(random, -0.02, 0.02));
    const rx = width * lobe.rx * range(random, 0.9, 1.12);
    const ry = height * lobe.ry * range(random, 0.9, 1.12);
    const grad = ctx.createRadialGradient(gx - rx * 0.15, gy - ry * 0.2, rx * 0.08, gx, gy, Math.max(rx, ry));
    grad.addColorStop(0, css(tone, 0.96, lobe.shade * 1.14));
    grad.addColorStop(0.55, css(tone, 0.92, lobe.shade));
    grad.addColorStop(1, css(tone, 0, lobe.shade * 0.78));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 36; i += 1) {
    const tone = canopyColors[Math.floor(random() * Math.max(canopyColors.length, 1))] ?? 0x7aa84a;
    ctx.fillStyle = css(tone, 0.35 + random() * 0.4, 1.12 + random() * 0.22);
    ctx.beginPath();
    ctx.ellipse(
      width * (0.26 + random() * 0.48),
      height * (0.1 + random() * 0.34),
      1.1 + random() * 2.6,
      0.7 + random() * 1.9,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
