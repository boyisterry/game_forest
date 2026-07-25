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
  const templates = await Promise.all(manifest.assets.map((entry) => loadOne(loader, entry)));
  const byId = new Map(templates.map((t) => [t.id, t]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as ForestModelTemplate[];
  return {
    large: pick(manifest.groups.tree_large ?? []),
    medium: pick(manifest.groups.tree_medium ?? []),
    small: pick(manifest.groups.tree_small ?? []),
    branch: pick(manifest.groups.branch ?? []),
    stump: pick(manifest.groups.stump ?? []),
    shrub: pick(manifest.groups.shrub ?? []),
    all: templates,
  };
}

export function disposeForestModelPack(pack: ForestModelPack | null) {
  if (!pack) return;
  for (const template of pack.all) {
    template.wood.dispose();
    template.leaves.dispose();
  }
}

export function pickTreeTemplate(pack: ForestModelPack, scale: number, random: () => number) {
  const pool = scale >= 2.0 ? pack.large : scale >= 1.35 ? pack.medium : pack.small;
  if (!pool.length) return pack.all[0];
  return pool[Math.floor(random() * pool.length)];
}
