import * as THREE from "three";

export const RABBIT_RIDER_URL = "/models/rabbit-rider.glb";
export const RABBIT_RIDER_REFERENCE_SIZE = 2.4;

/** Normalize the game's existing rabbit-rider GLB for use as a scene scale reference. */
export function prepareRabbitRiderReference(model: THREE.Group) {
  const reference = new THREE.Group();
  reference.name = "game-rabbit-rider-scale-reference";
  reference.userData = {
    modelType: "game-rabbit-rider-scale-reference",
    sourceModel: RABBIT_RIDER_URL,
    referenceSizeMeters: RABBIT_RIDER_REFERENCE_SIZE,
  };

  model.name = "game-rabbit-rider-model";
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  let bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(RABBIT_RIDER_REFERENCE_SIZE / Math.max(size.x, size.y, size.z, 0.001));
  // The source model travels along +X; showcase forward is +Z.
  model.rotation.y = -Math.PI * 0.5;
  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += bounds.getSize(new THREE.Vector3()).y * 0.5;
  reference.add(model);
  return reference;
}
