import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type ForestModelKind = "tree" | "branch" | "stump" | "shrub";

export type ForestModelTemplate = {
  id: string;
  kind: ForestModelKind;
  height: number;
  /** Approximate trunk radius in local units, for ride-mode collision. */
  trunkRadius: number;
  wood: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  /** Real fragments rebuilt from the matching legacy shattered-tree GLB. */
  shatterWood?: THREE.BufferGeometry;
  shatterLeaves?: THREE.BufferGeometry;
};

export type ForestModelPack = {
  large: ForestModelTemplate[];
  medium: ForestModelTemplate[];
  small: ForestModelTemplate[];
  branch: ForestModelTemplate[];
  stump: ForestModelTemplate[];
  shrub: ForestModelTemplate[];
  all: ForestModelTemplate[];
};

type Manifest = {
  assets: Array<{
    id: string;
    file: string;
    kind: string;
    height?: number;
    length?: number;
  }>;
  groups: Record<string, string[]>;
};

const BASE = "/models/forest";
const SHATTER_GRID = { nx: 5, ny: 12, nz: 5 };
const WOOD_KEEP_RATIO = 0.7;
const WOOD_FRAGMENT_SCALE = 1.2;
const LEAF_KEEP_RATIO = 0.58;
const LEAF_FRAGMENT_SCALE = 0.82;
const SHATTER_SPREAD = 1.5;

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function collectMeshGeometries(root: THREE.Object3D) {
  const woodParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const name = (object.name || object.parent?.name || "").toLowerCase();
    if (name.includes("leaf")) leafParts.push(geometry);
    else woodParts.push(geometry);
  });
  return { woodParts, leafParts };
}

function mergeOrEmpty(parts: THREE.BufferGeometry[]) {
  if (!parts.length) {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    empty.setIndex([0, 1, 2]);
    return empty;
  }
  if (parts.length === 1) return parts[0];
  // Manual merge without BufferGeometryUtils dependency surprises
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const part of parts) {
    const pos = part.getAttribute("position");
    const col = part.getAttribute("color");
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (col) colors.push(col.getX(i), col.getY(i), col.getZ(i));
      else colors.push(0.45, 0.36, 0.24);
    }
    const index = part.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + base);
    } else {
      for (let i = 0; i < pos.count; i += 1) indices.push(base + i);
    }
    base += pos.count;
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

type ShatterBucket = {
  triangles: number[];
  center: THREE.Vector3;
  count: number;
};

/**
 * Turn a legacy broken-tree mesh into one GPU-friendly geometry. Every vertex
 * carries its fragment's home/blast pose so the actual map can animate all
 * tree instances in one draw call instead of creating hundreds of Meshes.
 */
function buildShatterGeometry(
  source: THREE.BufferGeometry,
  bounds: THREE.Box3,
  kind: "wood" | "leaves",
  seedBase: number,
) {
  const position = source.getAttribute("position");
  const color = source.getAttribute("color");
  const index = source.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const size = bounds.getSize(new THREE.Vector3());
  const min = bounds.min;
  const buckets = new Map<number, ShatterBucket>();
  const ids = [0, 0, 0];

  const vertexId = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
  const cellOf = (x: number, y: number, z: number) => {
    const cx = Math.min(SHATTER_GRID.nx - 1, Math.max(0, Math.floor(((x - min.x) / Math.max(size.x, 1e-4)) * SHATTER_GRID.nx)));
    const cy = Math.min(SHATTER_GRID.ny - 1, Math.max(0, Math.floor(((y - min.y) / Math.max(size.y, 1e-4)) * SHATTER_GRID.ny)));
    const cz = Math.min(SHATTER_GRID.nz - 1, Math.max(0, Math.floor(((z - min.z) / Math.max(size.z, 1e-4)) * SHATTER_GRID.nz)));
    return cx + cy * SHATTER_GRID.nx + cz * SHATTER_GRID.nx * SHATTER_GRID.ny;
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    ids[0] = vertexId(triangle, 0);
    ids[1] = vertexId(triangle, 1);
    ids[2] = vertexId(triangle, 2);
    const centroid = new THREE.Vector3(
      (position.getX(ids[0]) + position.getX(ids[1]) + position.getX(ids[2])) / 3,
      (position.getY(ids[0]) + position.getY(ids[1]) + position.getY(ids[2])) / 3,
      (position.getZ(ids[0]) + position.getZ(ids[1]) + position.getZ(ids[2])) / 3,
    );
    const key = cellOf(centroid.x, centroid.y, centroid.z);
    const bucket = buckets.get(key) ?? { triangles: [], center: new THREE.Vector3(), count: 0 };
    bucket.triangles.push(triangle);
    bucket.center.add(centroid);
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const entries = [...buckets.entries()];
  const keepRatio = kind === "wood" ? WOOD_KEEP_RATIO : LEAF_KEEP_RATIO;
  const selected = entries
    .sort(([keyA], [keyB]) => hash(keyA + seedBase) - hash(keyB + seedBase))
    .slice(0, Math.round(entries.length * keepRatio));
  const positions: number[] = [];
  const colors: number[] = [];
  const centers: number[] = [];
  const repairs: number[] = [];
  const blasts: number[] = [];
  const axesAndAngles: number[] = [];
  const scalesAndStaggers: number[] = [];
  let seed = seedBase;

  for (const [, bucket] of selected) {
    const home = bucket.center.multiplyScalar(1 / bucket.count);
    const yF = THREE.MathUtils.clamp((home.y - min.y) / Math.max(size.y, 1e-4), 0, 1);
    const angle = Math.atan2(home.z, home.x);
    const crown = Math.sqrt(Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp((yF - 0.25) / 0.75, 0, 1))));
    const repairRadius = kind === "wood" && yF < 0.62
      ? Math.min(size.x * 0.018, 0.32)
      : Math.min(size.x * (0.05 + crown * 0.2), 2.2);
    const repair = new THREE.Vector3(
      Math.cos(angle) * repairRadius,
      home.y,
      Math.sin(angle) * repairRadius,
    );
    const direction = new THREE.Vector3(home.x, 0, home.z);
    if (direction.lengthSq() < 1e-4) {
      const fallbackAngle = hash(seed) * Math.PI * 2;
      direction.set(Math.cos(fallbackAngle), 0, Math.sin(fallbackAngle));
    } else {
      direction.normalize();
    }
    // The source GLB is already widely scattered. Re-center its bucket origins
    // into a compact tree-shaped volume before applying the new motion; without
    // this step, neighbouring trees merge into one continuous debris field.
    const sourceRadius = Math.hypot(home.x, home.z);
    const clusteredRadius = kind === "wood" && yF < 0.62
      ? Math.min(0.5, 0.12 + sourceRadius * 0.1)
      : Math.min(2.15, 0.35 + sourceRadius * 0.3);
    const clusteredHome = new THREE.Vector3(
      direction.x * clusteredRadius,
      home.y,
      direction.z * clusteredRadius,
    );
    // Keep each tree readable as its own fragment cloud. Individual pieces use
    // mixed directions: some gather toward the bole, some fall, some travel
    // sideways, and the rest rise. Per-tree rotation/bias is added in the GPU
    // shader so neighbouring trees do not share the same blast direction.
    const directionMode = hash(seed + 8);
    const gathers = directionMode < 0.24;
    const falls = directionMode >= 0.24 && directionMode < 0.48;
    const travelsSideways = directionMode >= 0.48 && directionMode < 0.76;
    const horizontalDistance = gathers
      ? 0.2 + hash(seed + 2) * 0.55
      : 0.6 + hash(seed + 2) * 1.35 + yF * 0.28;
    const horizontalSign = gathers ? -1 : 1;
    const verticalTravel = falls
      ? -(0.35 + hash(seed + 3) * 1.45)
      : travelsSideways
        ? (hash(seed + 3) - 0.5) * 0.9
        : gathers
          ? (hash(seed + 3) - 0.5) * 0.48
          : 0.35 + hash(seed + 3) * 1.35;
    const blast = new THREE.Vector3(
      clusteredHome.x + direction.x * horizontalDistance * horizontalSign * SHATTER_SPREAD,
      Math.max(0.12, clusteredHome.y + verticalTravel * SHATTER_SPREAD),
      clusteredHome.z + direction.z * horizontalDistance * horizontalSign * SHATTER_SPREAD,
    );
    const axis = new THREE.Vector3(
      hash(seed + 4) - 0.5,
      hash(seed + 5) - 0.5,
      hash(seed + 6) - 0.5,
    ).normalize();
    const rotationAngle = (hash(seed + 7) - 0.5) * Math.PI * 3.2;
    const fragmentScale = kind === "wood" ? WOOD_FRAGMENT_SCALE : LEAF_FRAGMENT_SCALE;
    const stagger = (seed % 11) * 0.006;

    for (const triangle of bucket.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const id = vertexId(triangle, corner);
        positions.push(position.getX(id), position.getY(id), position.getZ(id));
        if (color) colors.push(color.getX(id), color.getY(id), color.getZ(id));
        else colors.push(kind === "leaves" ? 0.3 : 0.38, kind === "leaves" ? 0.5 : 0.25, 0.18);
        centers.push(home.x, home.y, home.z);
        repairs.push(repair.x, repair.y, repair.z);
        blasts.push(blast.x, blast.y, blast.z);
        axesAndAngles.push(axis.x, axis.y, axis.z, rotationAngle);
        scalesAndStaggers.push(fragmentScale, stagger);
      }
    }
    seed += 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("shardCenter", new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute("shardRepair", new THREE.Float32BufferAttribute(repairs, 3));
  geometry.setAttribute("shardBlast", new THREE.Float32BufferAttribute(blasts, 3));
  geometry.setAttribute("shardAxisAngle", new THREE.Float32BufferAttribute(axesAndAngles, 4));
  geometry.setAttribute("shardScaleStagger", new THREE.Float32BufferAttribute(scalesAndStaggers, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) {
    // Fragment blast positions exceed the source tree bounds.
    geometry.boundingSphere.radius += Math.max(size.x, size.z) + 16;
  }
  return geometry;
}

async function loadOne(
  loader: GLTFLoader,
  entry: Manifest["assets"][number],
): Promise<ForestModelTemplate> {
  const gltf = await loader.loadAsync(`${BASE}/${entry.file}`);
  const { woodParts, leafParts } = collectMeshGeometries(gltf.scene);
  const wood = mergeOrEmpty(woodParts);
  const leaves = mergeOrEmpty(leafParts);
  // Ensure color attrs exist for materials that expect them
  if (!wood.getAttribute("color")) {
    const n = wood.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      colors[i * 3] = 0.42;
      colors[i * 3 + 1] = 0.33;
      colors[i * 3 + 2] = 0.22;
    }
    wood.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  if (!leaves.getAttribute("color")) {
    const n = leaves.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      colors[i * 3] = 0.28;
      colors[i * 3 + 1] = 0.48;
      colors[i * 3 + 2] = 0.2;
    }
    leaves.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  wood.computeBoundingBox();
  const height =
    entry.height ??
    entry.length ??
    Math.max(0.1, (wood.boundingBox?.max.y ?? 1) - (wood.boundingBox?.min.y ?? 0));
  return {
    id: entry.id,
    kind: (entry.kind as ForestModelKind) || "tree",
    height,
    trunkRadius: computeTrunkRadius(wood, height),
    wood,
    leaves,
  };
}

/**
 * Estimate the trunk's horizontal radius from the wood geometry's bottom band.
 * Branches live higher up, so the bottom 18% of height is mostly bole; the max
 * horizontal vertex distance there is a fair collision radius for a scaled tree.
 */
function computeTrunkRadius(wood: THREE.BufferGeometry, height: number): number {
  const pos = wood.getAttribute("position");
  const bb = wood.boundingBox;
  if (!pos || !bb) return 0.6;
  const baseTop = bb.min.y + 0.18 * height;
  let maxR = 0.2;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > baseTop) continue;
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > maxR) maxR = r;
  }
  return THREE.MathUtils.clamp(maxR, 0.2, 2.5);
}

export async function loadForestModelPack(): Promise<ForestModelPack> {
  const loader = new GLTFLoader();
  const manifest = (await fetch(`${BASE}/manifest.json`).then((r) => r.json())) as Manifest;
  const activeGroupNames = ["tree_large", "tree_medium", "tree_small"];
  const shatterGroupNames = ["tree_shattered_large", "tree_shattered_medium", "tree_shattered_small"];
  const activeIds = new Set(
    [...activeGroupNames, ...shatterGroupNames].flatMap((name) => manifest.groups[name] ?? []),
  );
  const templates = await Promise.all(
    manifest.assets.filter((entry) => activeIds.has(entry.id)).map((entry) => loadOne(loader, entry)),
  );
  const byId = new Map(templates.map((t) => [t.id, t]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as ForestModelTemplate[];
  const normalTrees = [
    ...(manifest.groups.tree_large ?? []),
    ...(manifest.groups.tree_medium ?? []),
    ...(manifest.groups.tree_small ?? []),
  ];
  const shatteredTrees = [
    ...(manifest.groups.tree_shattered_large ?? []),
    ...(manifest.groups.tree_shattered_medium ?? []),
    ...(manifest.groups.tree_shattered_small ?? []),
  ];
  for (let i = 0; i < normalTrees.length; i += 1) {
    const normal = byId.get(normalTrees[i]);
    const shattered = byId.get(shatteredTrees[i]);
    if (!normal || !shattered) continue;
    shattered.wood.computeBoundingBox();
    shattered.leaves.computeBoundingBox();
    const bounds = new THREE.Box3();
    if (shattered.wood.boundingBox) bounds.union(shattered.wood.boundingBox);
    if (shattered.leaves.boundingBox) bounds.union(shattered.leaves.boundingBox);
    normal.shatterWood = buildShatterGeometry(shattered.wood, bounds, "wood", 11 + i * 37);
    normal.shatterLeaves = buildShatterGeometry(shattered.leaves, bounds, "leaves", 900 + i * 37);
    shattered.wood.dispose();
    shattered.leaves.dispose();
  }
  const activeTemplates = activeGroupNames.flatMap((name) => pick(manifest.groups[name] ?? []));
  return {
    large: pick(manifest.groups.tree_large ?? []),
    medium: pick(manifest.groups.tree_medium ?? []),
    small: pick(manifest.groups.tree_small ?? []),
    branch: pick(manifest.groups.branch ?? []),
    stump: pick(manifest.groups.stump ?? []),
    shrub: pick(manifest.groups.shrub ?? []),
    all: activeTemplates,
  };
}

export function disposeForestModelPack(pack: ForestModelPack | null) {
  if (!pack) return;
  for (const template of pack.all) {
    template.wood.dispose();
    template.leaves.dispose();
    template.shatterWood?.dispose();
    template.shatterLeaves?.dispose();
  }
}

export function pickTreeTemplate(pack: ForestModelPack, scale: number, random: () => number) {
  // Small templates are valid source assets but are not placed in the playable
  // map: at world scale they read as miniature trees beside the mature canopy.
  const pool = scale >= 1.8 ? pack.large : pack.medium;
  if (!pool.length) return pack.all[0];
  return pool[Math.floor(random() * pool.length)];
}
