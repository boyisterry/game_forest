import * as THREE from "three";
import { buildFarSilhouetteGroup, buildNearMountainMeshes, buildRiverGroup } from "./boundaryTerrain";

export function createWorldBoundaries(seed: number, groundColor: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "irregular-world-boundaries";
  group.add(buildRiverGroup(seed, groundColor));
  group.add(buildNearMountainMeshes(seed));
  group.add(buildFarSilhouetteGroup(seed));
  return group;
}
