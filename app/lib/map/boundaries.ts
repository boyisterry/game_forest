import * as THREE from "three";
import { createRandom, range } from "./random";
import {
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  eastBoundaryX,
  makeRibbon,
  northBoundaryZ,
  southBoundaryZ,
  westBoundaryX,
} from "./world";

const EDGE_SAMPLES = 72;

function sampleVertical(seed: number, side: "west" | "east") {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i += 1) {
    const z = -WORLD_HALF_DEPTH - 120 + (i / (EDGE_SAMPLES - 1)) * (WORLD_HALF_DEPTH * 2 + 240);
    const x = side === "west" ? westBoundaryX(z, seed) : eastBoundaryX(z, seed);
    points.push(new THREE.Vector3(x, 0, z));
  }
  return points;
}

function sampleHorizontal(seed: number, side: "north" | "south") {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i += 1) {
    const x = -WORLD_HALF_WIDTH - 120 + (i / (EDGE_SAMPLES - 1)) * (WORLD_HALF_WIDTH * 2 + 240);
    const z = side === "north" ? northBoundaryZ(x, seed) : southBoundaryZ(x, seed);
    points.push(new THREE.Vector3(x, 0, z));
  }
  return points;
}

function createMountainGeometry() {
  const geometry = new THREE.ConeGeometry(1, 1, 7, 4);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const rugged = 1 + Math.sin(angle * 4.3 + y * 7.1) * 0.1 + Math.sin(angle * 2.1 - y * 9.2) * 0.06;
    position.setX(i, x * rugged);
    position.setZ(i, z * rugged);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addMountains(group: THREE.Group, seed: number) {
  const random = createRandom(seed ^ 0x4d4f554e);
  const east = sampleVertical(seed, "east");
  const north = sampleHorizontal(seed, "north");
  const layers = 2;
  const total = (east.length + north.length) * layers;
  const mountains = new THREE.InstancedMesh(
    createMountainGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      emissive: 0x30372f,
      emissiveIntensity: 0.72,
    }),
    total,
  );
  mountains.castShadow = true;
  mountains.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = [0x7d877b, 0x90988d, 0x6f7c70, 0x9ba095];
  let index = 0;

  const placeRidge = (points: THREE.Vector3[], orientation: "east" | "north") => {
    const ridgePoints = points.filter((_, pointIndex) => pointIndex % 2 === 0 || pointIndex === points.length - 1);
    for (let layer = 0; layer < layers; layer += 1) {
      for (let i = 0; i < ridgePoints.length; i += 1) {
        const point = ridgePoints[i];
        // Keep the ridge readable from inside the world without letting a
        // nearby cone turn into a full-screen polygon. The second row sits
        // farther outside and slightly taller, creating a layered skyline.
        const height = range(random, 48, 78) * (1 + layer * 0.18);
        const radius = range(random, 22, 34) * (1 + layer * 0.1);
        const outward = 48 + layer * 58 + range(random, -10, 10);
        dummy.position.set(
          point.x + (orientation === "east" ? outward : range(random, -18, 18)),
          height * 0.5 - 2,
          point.z + (orientation === "north" ? -outward : range(random, -18, 18)),
        );
        dummy.rotation.set(0, random() * Math.PI * 2, range(random, -0.035, 0.035));
        dummy.scale.set(radius * range(random, 0.85, 1.2), height, radius * range(random, 0.8, 1.18));
        dummy.updateMatrix();
        mountains.setMatrixAt(index, dummy.matrix);
        color.set(colors[Math.floor(random() * colors.length)]);
        color.offsetHSL(range(random, -0.015, 0.015), range(random, -0.025, 0.025), range(random, -0.045, 0.04));
        mountains.setColorAt(index, color);
        index += 1;
      }
    }
  };

  placeRidge(east, "east");
  placeRidge(north, "north");
  mountains.count = index;
  mountains.instanceMatrix.needsUpdate = true;
  if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true;
  group.add(mountains);
}

function addRivers(group: THREE.Group, seed: number) {
  const west = sampleVertical(seed, "west");
  const south = sampleHorizontal(seed, "south");
  const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9275, roughness: 1 });
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6e9da2,
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    clearcoat: 0.22,
  });
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xdce9e2, transparent: true, opacity: 0.22 });

  for (const points of [west, south]) {
    const bank = new THREE.Mesh(makeRibbon(points, 126, 0.015), bankMaterial);
    bank.receiveShadow = true;
    const water = new THREE.Mesh(makeRibbon(points, 82, 0.045), waterMaterial);
    const sheen = new THREE.Mesh(makeRibbon(points, 58, 0.058), foamMaterial);
    group.add(bank, water, sheen);
  }

  // Water continues beyond the playable bank, so the west and south edges read
  // as real geographic limits rather than decorative strips on an endless lawn.
  const westSea = new THREE.Mesh(
    new THREE.PlaneGeometry(920, WORLD_HALF_DEPTH * 2 + 920),
    waterMaterial,
  );
  westSea.rotation.x = -Math.PI / 2;
  westSea.position.set(-WORLD_HALF_WIDTH - 430, 0.035, 120);
  const southSea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2 + 920, 920),
    waterMaterial,
  );
  southSea.rotation.x = -Math.PI / 2;
  southSea.position.set(-120, 0.035, WORLD_HALF_DEPTH + 430);
  group.add(westSea, southSea);
}

export function createWorldBoundaries(seed: number) {
  const group = new THREE.Group();
  group.name = "irregular-world-boundaries";
  addRivers(group, seed);
  addMountains(group, seed);
  return group;
}
