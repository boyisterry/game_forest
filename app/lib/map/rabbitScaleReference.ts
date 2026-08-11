import * as THREE from "three";

export type RabbitScaleReference = THREE.Group & {
  userData: {
    modelType: "rabbit-scale-reference";
    generatedLocally: true;
    referenceHeightMeters: 1.7;
  };
};

function rabbitMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A locally generated 1.70 m standing courier rabbit used only as a scale reference. */
export function buildLowPolyRabbitScaleReference(): RabbitScaleReference {
  const rabbit = new THREE.Group() as RabbitScaleReference;
  rabbit.name = "low-poly-rabbit-scale-reference";

  const fur = new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.94, flatShading: true });
  const paleFur = new THREE.MeshStandardMaterial({ color: 0xf4eee2, roughness: 0.95, flatShading: true });
  const pink = new THREE.MeshStandardMaterial({ color: 0xc9827d, roughness: 0.88, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263237, roughness: 0.72, flatShading: true });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x3c7772, roughness: 0.9, flatShading: true });
  const satchel = new THREE.MeshStandardMaterial({ color: 0x9b633f, roughness: 0.9, flatShading: true });

  const body = rabbitMesh(new THREE.SphereGeometry(0.34, 8, 6), jacket, "rabbit-reference-body");
  body.scale.set(0.92, 1.22, 0.78);
  body.position.y = 0.72;
  const chest = rabbitMesh(new THREE.SphereGeometry(0.25, 8, 6), paleFur, "rabbit-reference-chest");
  chest.scale.set(0.82, 1.1, 0.38);
  chest.position.set(0, 0.76, 0.25);
  const head = rabbitMesh(new THREE.SphereGeometry(0.31, 8, 6), fur, "rabbit-reference-head");
  head.scale.set(0.94, 0.9, 0.9);
  head.position.set(0, 1.23, 0.02);
  rabbit.add(body, chest, head);

  for (const side of [-1, 1]) {
    const ear = rabbitMesh(new THREE.SphereGeometry(0.13, 7, 5), fur, "rabbit-reference-ear");
    ear.scale.set(0.72, 2.05, 0.62);
    ear.rotation.z = side * -0.08;
    ear.position.set(side * 0.15, 1.67, 0);
    const innerEar = rabbitMesh(new THREE.SphereGeometry(0.085, 7, 5), pink, "rabbit-reference-inner-ear");
    innerEar.scale.set(0.65, 2.05, 0.35);
    innerEar.rotation.z = ear.rotation.z;
    innerEar.position.set(side * 0.15, 1.67, 0.085);
    const eye = rabbitMesh(new THREE.SphereGeometry(0.035, 6, 4), dark, "rabbit-reference-eye");
    eye.position.set(side * 0.13, 1.28, 0.27);
    const arm = rabbitMesh(new THREE.CapsuleGeometry(0.085, 0.32, 3, 6), fur, "rabbit-reference-arm");
    arm.rotation.z = side * -0.22;
    arm.position.set(side * 0.35, 0.77, 0.02);
    const foot = rabbitMesh(new THREE.SphereGeometry(0.14, 7, 5), paleFur, "rabbit-reference-foot");
    foot.scale.set(0.92, 0.55, 1.35);
    foot.position.set(side * 0.19, 0.13, 0.09);
    rabbit.add(ear, innerEar, eye, arm, foot);
  }

  const muzzle = rabbitMesh(new THREE.SphereGeometry(0.18, 7, 5), paleFur, "rabbit-reference-muzzle");
  muzzle.scale.set(1, 0.62, 0.65);
  muzzle.position.set(0, 1.14, 0.27);
  const nose = rabbitMesh(new THREE.ConeGeometry(0.055, 0.075, 5), pink, "rabbit-reference-nose");
  nose.rotation.x = Math.PI * 0.5;
  nose.position.set(0, 1.18, 0.4);
  const bag = rabbitMesh(new THREE.BoxGeometry(0.34, 0.38, 0.16), satchel, "rabbit-reference-satchel");
  bag.position.set(0.34, 0.64, -0.06);
  bag.rotation.z = -0.1;
  const tail = rabbitMesh(new THREE.DodecahedronGeometry(0.16, 0), paleFur, "rabbit-reference-tail");
  tail.position.set(0, 0.63, -0.3);
  rabbit.add(muzzle, nose, bag, tail);

  const rawBounds = new THREE.Box3().setFromObject(rabbit);
  const rawHeight = rawBounds.getSize(new THREE.Vector3()).y;
  rabbit.scale.setScalar(1.7 / Math.max(rawHeight, 0.001));
  rabbit.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(rabbit);
  rabbit.position.y -= scaledBounds.min.y;
  rabbit.userData = {
    modelType: "rabbit-scale-reference",
    generatedLocally: true,
    referenceHeightMeters: 1.7,
  };
  return rabbit;
}
