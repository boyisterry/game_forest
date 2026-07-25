import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// GLTFExporter uses the browser FileReader contract even when exporting binary
// data under Node. Keep the polyfill local to this reproducible asset script.
globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((value) => {
        this.result = value;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((value) => {
        const base64 = Buffer.from(value).toString("base64");
        this.result = `data:${blob.type};base64,${base64}`;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }
};

const OUTPUT = new URL("../public/models/forest/", import.meta.url);
const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TREES = [
  { id: "tree_normal_large_redwood_a", height: 22, seed: 111, style: "redwood", width: 0.92, lean: 0.05 },
  { id: "tree_normal_large_ancient_a", height: 20, seed: 117, style: "ancient", width: 1.22, lean: 0.08 },
  { id: "tree_normal_large_redwood_b", height: 24, seed: 123, style: "redwood", width: 1.02, lean: 0.13 },
  { id: "tree_normal_medium_redwood_a", height: 13, seed: 131, style: "redwood", width: 0.95, lean: 0.08 },
  { id: "tree_normal_medium_ancient_a", height: 12, seed: 137, style: "ancient", width: 1.2, lean: 0.11 },
  { id: "tree_normal_medium_redwood_b", height: 11.5, seed: 141, style: "redwood", width: 1.05, lean: 0.14 },
  { id: "tree_normal_small_redwood_a", height: 6.5, seed: 153, style: "redwood", width: 1, lean: 0.1 },
  { id: "tree_normal_small_ancient_a", height: 5.8, seed: 159, style: "ancient", width: 1.18, lean: 0.12 },
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function range(random, min, max) {
  return min + (max - min) * random();
}

function addVertexColor(geometry, color) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function cylinderBetween(a, b, radiusA, radiusB, radialSegments, color) {
  const delta = b.clone().sub(a);
  const length = delta.length();
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, length, radialSegments, 1, false);
  const midpoint = a.clone().add(b).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize());
  const matrix = new THREE.Matrix4().compose(midpoint, quaternion, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  return addVertexColor(geometry, color);
}

function leafCluster(center, scale, rotation, color, ancient) {
  const geometry = ancient
    ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0);
  const matrix = new THREE.Matrix4().compose(center, rotation, scale);
  geometry.applyMatrix4(matrix);
  return addVertexColor(geometry, color);
}

function crownRadius(t, style, width, height) {
  if (style === "ancient") {
    const rounded = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.44);
    return height * (0.055 + rounded * 0.245) * width * (1 - t * 0.16);
  }
  const conical = Math.pow(1 - t, 0.62);
  const baseRound = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.22)), 0.55);
  return height * (0.045 + conical * baseRound * 0.2) * width;
}

function buildTree(config) {
  const random = mulberry32(config.seed);
  const height = config.height;
  const ancient = config.style === "ancient";
  const woodParts = [];
  const leafParts = [];
  const branchTips = [];
  const woodBase = new THREE.Color(ancient ? 0x6b5540 : 0x75523a);
  const leafPalette = ancient
    ? [0x3f682f, 0x527a36, 0x668b40, 0x789a4a]
    : [0x315d2e, 0x427036, 0x55823d, 0x6d9447];

  // A continuous, slightly wandering tapered bole.
  const trunkSegments = ancient ? 7 : 8;
  const trunkTop = height * (ancient ? 0.9 : 0.95);
  const baseRadius = height * (ancient ? 0.052 : 0.038);
  let previous = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < trunkSegments; i += 1) {
    const t0 = i / trunkSegments;
    const t1 = (i + 1) / trunkSegments;
    const sway = height * config.lean;
    const next = new THREE.Vector3(
      Math.sin(t1 * 4.3 + config.seed) * sway * t1 * 0.34,
      trunkTop * t1,
      Math.cos(t1 * 3.7 + config.seed * 0.7) * sway * t1 * 0.28,
    );
    const radiusA = THREE.MathUtils.lerp(baseRadius, height * 0.009, Math.pow(t0, 0.76));
    const radiusB = THREE.MathUtils.lerp(baseRadius, height * 0.009, Math.pow(t1, 0.76));
    const tone = woodBase.clone().offsetHSL(range(random, -0.015, 0.015), 0, range(random, -0.045, 0.045));
    woodParts.push(cylinderBetween(previous, next, radiusA, radiusB, ancient ? 9 : 8, tone));
    previous = next;
  }

  // Grounded buttress roots visibly connect the tree to the terrain.
  const rootCount = ancient ? 9 : 7;
  for (let i = 0; i < rootCount; i += 1) {
    const angle = i * GOLDEN_ANGLE + range(random, -0.18, 0.18);
    const start = new THREE.Vector3(Math.cos(angle) * baseRadius * 0.45, baseRadius * 0.28, Math.sin(angle) * baseRadius * 0.45);
    const reach = baseRadius * range(random, ancient ? 3 : 2.2, ancient ? 5 : 3.8);
    const end = new THREE.Vector3(Math.cos(angle) * reach, baseRadius * 0.08, Math.sin(angle) * reach);
    woodParts.push(cylinderBetween(start, end, baseRadius * 0.5, baseRadius * 0.08, 6, woodBase));
  }

  const crownBase = height * (ancient ? 0.28 : 0.24);
  const crownTop = height * 0.94;
  const branchCount = ancient ? 38 : 32;
  for (let i = 0; i < branchCount; i += 1) {
    const t = (i + 0.7) / branchCount;
    const y = THREE.MathUtils.lerp(crownBase, crownTop, t);
    const angle = i * GOLDEN_ANGLE + range(random, -0.28, 0.28);
    const radius = crownRadius(t, config.style, config.width, height);
    const length = radius * range(random, 0.82, 1.12);
    const trunkX = Math.sin((y / trunkTop) * 4.3 + config.seed) * height * config.lean * (y / trunkTop) * 0.34;
    const trunkZ = Math.cos((y / trunkTop) * 3.7 + config.seed * 0.7) * height * config.lean * (y / trunkTop) * 0.28;
    const start = new THREE.Vector3(trunkX, y, trunkZ);
    const elbow = new THREE.Vector3(
      trunkX + Math.cos(angle) * length * range(random, 0.42, 0.58),
      y + height * range(random, 0.018, ancient ? 0.055 : 0.075),
      trunkZ + Math.sin(angle) * length * range(random, 0.42, 0.58),
    );
    const tip = new THREE.Vector3(
      trunkX + Math.cos(angle + range(random, -0.18, 0.18)) * length,
      elbow.y + height * range(random, 0.012, 0.052),
      trunkZ + Math.sin(angle + range(random, -0.18, 0.18)) * length,
    );
    const branchRadius = height * THREE.MathUtils.lerp(ancient ? 0.015 : 0.012, 0.004, t);
    woodParts.push(cylinderBetween(start, elbow, branchRadius, branchRadius * 0.62, 6, woodBase));
    woodParts.push(cylinderBetween(elbow, tip, branchRadius * 0.62, branchRadius * 0.2, 5, woodBase));
    branchTips.push({ tip, t, radius });

    // Some mature limbs fork once, creating a real branching silhouette.
    if ((ancient && i % 2 === 0) || (!ancient && i % 4 === 0)) {
      const forkAngle = angle + (random() < 0.5 ? -1 : 1) * range(random, 0.42, 0.82);
      const forkTip = elbow.clone().add(new THREE.Vector3(
        Math.cos(forkAngle) * length * range(random, 0.35, 0.58),
        height * range(random, 0.025, 0.07),
        Math.sin(forkAngle) * length * range(random, 0.35, 0.58),
      ));
      woodParts.push(cylinderBetween(elbow, forkTip, branchRadius * 0.48, branchRadius * 0.12, 5, woodBase));
      branchTips.push({ tip: forkTip, t, radius: radius * 0.7 });
    }
  }

  // Cohesive foliage clusters follow branch endpoints and fill the crown
  // envelope. They overlap intentionally, avoiding the floating-card look.
  const clusterCount = ancient ? 105 : 88;
  for (let i = 0; i < clusterCount; i += 1) {
    const branch = branchTips[i % branchTips.length];
    const jitterAngle = i * GOLDEN_ANGLE + range(random, -0.4, 0.4);
    const clusterRadius = height * range(random, ancient ? 0.045 : 0.038, ancient ? 0.078 : 0.066);
    const center = branch.tip.clone().add(new THREE.Vector3(
      Math.cos(jitterAngle) * branch.radius * range(random, 0.02, 0.24),
      height * range(random, -0.025, 0.035),
      Math.sin(jitterAngle) * branch.radius * range(random, 0.02, 0.24),
    ));
    center.y = THREE.MathUtils.clamp(center.y, crownBase, height - clusterRadius * 0.78);
    const scale = new THREE.Vector3(
      clusterRadius * range(random, 0.9, 1.3),
      clusterRadius * range(random, 0.78, 1.12),
      clusterRadius * range(random, 0.86, 1.28),
    );
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI * 2, random() * Math.PI));
    const leafColor = new THREE.Color(leafPalette[Math.floor(random() * leafPalette.length)])
      .offsetHSL(range(random, -0.018, 0.018), range(random, -0.025, 0.025), range(random, -0.04, 0.04));
    leafParts.push(leafCluster(center, scale, rotation, leafColor, ancient));
  }

  // Crown tip closes the silhouette around the leader.
  for (let i = 0; i < 9; i += 1) {
    const angle = i * GOLDEN_ANGLE;
    const radius = height * 0.055;
    const center = new THREE.Vector3(
      Math.cos(angle) * radius * 0.7,
      height * range(random, 0.88, 0.955),
      Math.sin(angle) * radius * 0.7,
    );
    const scale = new THREE.Vector3(radius, radius * 1.08, radius);
    const leafColor = new THREE.Color(leafPalette[(i + 2) % leafPalette.length]);
    leafParts.push(leafCluster(center, scale, new THREE.Quaternion(), leafColor, ancient));
  }

  const wood = mergeGeometries(woodParts, false);
  const leaves = mergeGeometries(leafParts, false);
  wood.computeVertexNormals();
  leaves.computeVertexNormals();
  wood.name = `${config.id}_wood_geometry`;
  leaves.name = `${config.id}_leaves_geometry`;

  const woodMaterial = new THREE.MeshStandardMaterial({
    name: "normal_tree_wood",
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    name: "normal_tree_leaves",
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const root = new THREE.Group();
  root.name = config.id;
  const woodMesh = new THREE.Mesh(wood, woodMaterial);
  woodMesh.name = "wood";
  const leafMesh = new THREE.Mesh(leaves, leafMaterial);
  leafMesh.name = "leaves";
  root.add(woodMesh, leafMesh);
  return root;
}

async function exportTree(config) {
  const root = buildTree(config);
  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(root, {
    binary: true,
    onlyVisible: true,
    truncateDrawRange: true,
    maxTextureSize: 1024,
  });
  const path = new URL(`${config.id}.glb`, OUTPUT);
  await writeFile(path, Buffer.from(arrayBuffer));
  root.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  return { id: config.id, file: `${config.id}.glb`, height: config.height, bytes: arrayBuffer.byteLength };
}

await mkdir(OUTPUT, { recursive: true });
for (const tree of TREES) {
  const result = await exportTree(tree);
  console.log(`${result.file}: ${(result.bytes / 1024).toFixed(1)} KiB, ${result.height}m`);
}
