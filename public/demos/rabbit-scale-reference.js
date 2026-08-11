import * as THREE from "three";

function part(geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Locally generated standing courier rabbit, normalized to exactly 1.70 m high. */
export function buildRabbitScaleReference() {
  const rabbit = new THREE.Group();
  rabbit.name = "low-poly-rabbit-scale-reference";
  rabbit.userData = { modelType: "rabbit-scale-reference", generatedLocally: true, referenceHeightMeters: 1.7 };
  const fur = new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.94, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({ color: 0xf4eee2, roughness: 0.95, flatShading: true });
  const pink = new THREE.MeshStandardMaterial({ color: 0xc9827d, roughness: 0.88, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263237, roughness: 0.72, flatShading: true });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x3c7772, roughness: 0.9, flatShading: true });
  const body = part(new THREE.SphereGeometry(0.34, 8, 6), jacket, "rabbit-reference-body");
  body.scale.set(0.92, 1.22, 0.78);
  body.position.y = 0.72;
  const head = part(new THREE.SphereGeometry(0.31, 8, 6), fur, "rabbit-reference-head");
  head.scale.set(0.94, 0.9, 0.9);
  head.position.set(0, 1.23, 0.02);
  rabbit.add(body, head);
  for (const side of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.13, 7, 5), fur, "rabbit-reference-ear");
    ear.scale.set(0.72, 2.05, 0.62);
    ear.rotation.z = side * -0.08;
    ear.position.set(side * 0.15, 1.67, 0);
    const innerEar = part(new THREE.SphereGeometry(0.085, 7, 5), pink, "rabbit-reference-inner-ear");
    innerEar.scale.set(0.65, 2.05, 0.35);
    innerEar.rotation.z = ear.rotation.z;
    innerEar.position.set(side * 0.15, 1.67, 0.085);
    const eye = part(new THREE.SphereGeometry(0.035, 6, 4), dark, "rabbit-reference-eye");
    eye.position.set(side * 0.13, 1.28, 0.27);
    const foot = part(new THREE.SphereGeometry(0.14, 7, 5), pale, "rabbit-reference-foot");
    foot.scale.set(0.92, 0.55, 1.35);
    foot.position.set(side * 0.19, 0.13, 0.09);
    rabbit.add(ear, innerEar, eye, foot);
  }
  const muzzle = part(new THREE.SphereGeometry(0.18, 7, 5), pale, "rabbit-reference-muzzle");
  muzzle.scale.set(1, 0.62, 0.65);
  muzzle.position.set(0, 1.14, 0.27);
  rabbit.add(muzzle);
  const bounds = new THREE.Box3().setFromObject(rabbit);
  rabbit.scale.setScalar(1.7 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
  rabbit.updateMatrixWorld(true);
  rabbit.position.y -= new THREE.Box3().setFromObject(rabbit).min.y;
  return rabbit;
}
