import * as THREE from "three";
import {
  buildFarSilhouetteGroup,
  buildNearMountainMeshes,
  buildRiverGroup,
} from "./boundaryTerrain";

export function createWorldBoundaries(seed: number) {
  const group = new THREE.Group();
  group.name = "irregular-world-boundaries";
  group.add(buildRiverGroup(seed));
  group.add(buildNearMountainMeshes(seed));
  group.add(buildFarSilhouetteGroup(seed));
  return group;
}
