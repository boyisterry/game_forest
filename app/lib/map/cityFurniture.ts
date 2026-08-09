import * as THREE from "three";

export type TrafficPhase = "red" | "yellow" | "green";

type StreetLightModel = THREE.Group & {
  userData: {
    modelType: "street-light";
    generatedLocally: true;
    setPowered: (powered: boolean) => void;
  };
};

type TrafficLightModel = THREE.Group & {
  userData: {
    modelType: "traffic-light";
    generatedLocally: true;
    setPhase: (phase: TrafficPhase) => void;
  };
};

type FoodTruckModel = THREE.Group & {
  userData: {
    modelType: "food-truck";
    generatedLocally: true;
    setServingOpen: (open: boolean) => void;
    setLights: (powered: boolean) => void;
  };
};

function mesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function beamBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  material: THREE.Material,
  name: string,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const object = mesh(new THREE.CylinderGeometry(radiusEnd, radiusStart, length, 8), material, name);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

export function buildLowPolyStreetLight(): StreetLightModel {
  const group = new THREE.Group() as StreetLightModel;
  group.name = "city-street-light-lowpoly";
  const metal = new THREE.MeshStandardMaterial({ color: 0x314047, roughness: 0.58, metalness: 0.56 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x202b30, roughness: 0.7, metalness: 0.48 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffdfa0,
    emissive: 0xffb347,
    emissiveIntensity: 0.55,
    roughness: 0.34,
    metalness: 0.02,
  });

  const base = mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.34, 8), darkMetal, "street-light-base");
  base.position.y = 0.17;
  const collar = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.42, 8), metal, "street-light-base-collar");
  collar.position.y = 0.52;
  group.add(base, collar);

  const boltGeometry = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 6);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const bolt = mesh(boltGeometry, darkMetal, `street-light-bolt-${i + 1}`);
    bolt.position.set(Math.cos(angle) * 0.31, 0.4, Math.sin(angle) * 0.31);
    group.add(bolt);
  }

  group.add(
    beamBetween(new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(0, 5.85, 0), 0.17, 0.105, metal, "street-light-pole"),
    beamBetween(new THREE.Vector3(0, 5.82, 0), new THREE.Vector3(0.72, 6.28, 0), 0.105, 0.085, metal, "street-light-arm-rise"),
    beamBetween(new THREE.Vector3(0.68, 6.27, 0), new THREE.Vector3(1.78, 6.27, 0), 0.085, 0.075, metal, "street-light-arm"),
  );

  const housing = mesh(new THREE.BoxGeometry(1.42, 0.3, 0.62), darkMetal, "street-light-lamp-housing");
  housing.position.set(2.02, 6.18, 0);
  housing.rotation.z = -0.045;
  const cap = mesh(new THREE.BoxGeometry(1.1, 0.13, 0.5), metal, "street-light-lamp-cap");
  cap.position.set(2.03, 6.39, 0);
  cap.rotation.z = -0.045;
  const lens = mesh(new THREE.BoxGeometry(1.12, 0.08, 0.43), glass, "street-light-warm-lens");
  lens.position.set(2.03, 5.99, 0);
  lens.rotation.z = -0.045;
  group.add(housing, cap, lens);

  const light = new THREE.PointLight(0xffc56a, 0.75, 13, 1.8);
  light.name = "street-light-point-light";
  light.position.set(2.03, 5.82, 0);
  light.castShadow = false;
  group.add(light);

  group.userData = {
    modelType: "street-light",
    generatedLocally: true,
    setPowered(powered: boolean) {
      glass.emissiveIntensity = powered ? 3.2 : 0.18;
      light.intensity = powered ? 3.1 : 0;
    },
  };
  return group;
}

function buildSignalLens(
  color: number,
  y: number,
  housingMaterial: THREE.Material,
  lensMaterials: THREE.MeshStandardMaterial[],
) {
  const bezel = mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.28, 10), housingMaterial, "traffic-light-lens-bezel");
  bezel.rotation.x = Math.PI * 0.5;
  bezel.position.set(0, y, 0.42);
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.22),
    emissive: color,
    emissiveIntensity: 0.06,
    roughness: 0.28,
  });
  lensMaterials.push(lensMaterial);
  const lens = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.055, 12), lensMaterial, "traffic-light-lens");
  lens.rotation.x = Math.PI * 0.5;
  lens.position.set(0, y, 0.58);
  return [bezel, lens];
}

export function buildLowPolyTrafficLight(): TrafficLightModel {
  const group = new THREE.Group() as TrafficLightModel;
  group.name = "city-traffic-light-lowpoly";
  const metal = new THREE.MeshStandardMaterial({ color: 0x34464e, roughness: 0.57, metalness: 0.55 });
  const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x172126, roughness: 0.74, metalness: 0.28 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b84d, roughness: 0.68, metalness: 0.18 });

  const base = mesh(new THREE.CylinderGeometry(0.48, 0.6, 0.38, 8), metal, "traffic-light-base");
  base.position.y = 0.19;
  const pole = beamBetween(new THREE.Vector3(0, 0.38, 0), new THREE.Vector3(0, 5.35, 0), 0.18, 0.13, metal, "traffic-light-pole");
  const arm = beamBetween(new THREE.Vector3(0, 5.18, 0), new THREE.Vector3(1.72, 5.18, 0), 0.12, 0.1, metal, "traffic-light-mast-arm");
  group.add(base, pole, arm);

  const head = new THREE.Group();
  head.name = "traffic-light-vehicle-head";
  head.position.set(2.08, 4.18, 0);
  const backplate = mesh(new THREE.BoxGeometry(1.32, 3.02, 0.2), housingMaterial, "traffic-light-backplate");
  backplate.position.z = -0.02;
  const casing = mesh(new THREE.BoxGeometry(1.04, 2.76, 0.62), housingMaterial, "traffic-light-casing");
  casing.position.z = 0.18;
  head.add(backplate, casing);
  const lensMaterials: THREE.MeshStandardMaterial[] = [];
  const red = buildSignalLens(0xff3b30, 0.84, housingMaterial, lensMaterials);
  const yellow = buildSignalLens(0xffc928, 0, housingMaterial, lensMaterials);
  const green = buildSignalLens(0x38d46a, -0.84, housingMaterial, lensMaterials);
  head.add(...red, ...yellow, ...green);
  group.add(head);

  const pedestrianHousing = mesh(new THREE.BoxGeometry(0.92, 1.08, 0.44), housingMaterial, "pedestrian-signal-housing");
  pedestrianHousing.position.set(0.42, 3.1, 0);
  const pedestrianLens = new THREE.MeshStandardMaterial({
    color: 0x5ca77b,
    emissive: 0x52e38d,
    emissiveIntensity: 0.45,
    roughness: 0.34,
  });
  const pedestrianFace = mesh(new THREE.BoxGeometry(0.62, 0.76, 0.08), pedestrianLens, "pedestrian-signal-face");
  pedestrianFace.position.set(0.42, 3.1, 0.26);
  const pushButton = mesh(new THREE.BoxGeometry(0.34, 0.48, 0.2), trimMaterial, "pedestrian-crossing-button");
  pushButton.position.set(0.2, 1.65, 0.2);
  group.add(pedestrianHousing, pedestrianFace, pushButton);

  const statusLight = new THREE.PointLight(0xff3b30, 0.8, 7, 2);
  statusLight.name = "traffic-signal-status-light";
  statusLight.position.set(2.08, 5.02, 0.8);
  group.add(statusLight);

  const setPhase = (phase: TrafficPhase) => {
    const activeIndex = phase === "red" ? 0 : phase === "yellow" ? 1 : 2;
    lensMaterials.forEach((material, index) => {
      material.emissiveIntensity = index === activeIndex ? 3.8 : 0.06;
      material.color.copy(material.emissive).multiplyScalar(index === activeIndex ? 0.82 : 0.22);
    });
    const active = lensMaterials[activeIndex].emissive;
    statusLight.color.copy(active);
    statusLight.intensity = 1.15;
    pedestrianLens.emissiveIntensity = phase === "red" ? 0.08 : 2.2;
  };
  group.userData = {
    modelType: "traffic-light",
    generatedLocally: true,
    setPhase,
  };
  setPhase("red");
  return group;
}

export function buildLowPolyFoodTruck(): FoodTruckModel {
  const group = new THREE.Group() as FoodTruckModel;
  group.name = "city-food-truck-lowpoly";
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3f8c88, roughness: 0.72, metalness: 0.08 });
  const creamMaterial = new THREE.MeshStandardMaterial({ color: 0xf1dfb8, roughness: 0.84 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xc95f3d, roughness: 0.76 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.74, metalness: 0.24 });
  const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.98 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x79aebd, roughness: 0.18, metalness: 0.22 });
  const warmLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdf91,
    emissive: 0xffa83d,
    emissiveIntensity: 0.45,
    roughness: 0.34,
  });
  const redLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xd94c3f,
    emissive: 0xb82118,
    emissiveIntensity: 0.35,
    roughness: 0.38,
  });

  const chassis = mesh(new THREE.BoxGeometry(5.85, 0.34, 2.28), darkMaterial, "food-truck-chassis");
  chassis.position.y = 0.78;
  const serviceBody = mesh(new THREE.BoxGeometry(4.15, 2.7, 2.2), bodyMaterial, "food-truck-service-body");
  serviceBody.position.set(-0.72, 2.05, 0);
  const cabin = mesh(new THREE.BoxGeometry(1.65, 2.05, 2.12), creamMaterial, "food-truck-cabin");
  cabin.position.set(2.15, 1.76, 0);
  const hood = mesh(new THREE.BoxGeometry(0.72, 1.02, 2.04), bodyMaterial, "food-truck-hood");
  hood.position.set(3.02, 1.27, 0);
  const roof = mesh(new THREE.BoxGeometry(4.35, 0.22, 2.32), creamMaterial, "food-truck-roof-cap");
  roof.position.set(-0.67, 3.5, 0);
  const bumperFront = mesh(new THREE.BoxGeometry(0.3, 0.28, 2.2), darkMaterial, "food-truck-front-bumper");
  bumperFront.position.set(3.43, 0.76, 0);
  const bumperRear = mesh(new THREE.BoxGeometry(0.25, 0.25, 2.18), darkMaterial, "food-truck-rear-bumper");
  bumperRear.position.set(-2.92, 0.75, 0);
  group.add(chassis, serviceBody, cabin, hood, roof, bumperFront, bumperRear);

  const windshield = mesh(new THREE.BoxGeometry(0.08, 0.88, 1.62), glassMaterial, "food-truck-windshield");
  windshield.position.set(3.01, 2.05, 0);
  windshield.rotation.z = -0.08;
  const sideWindowNear = mesh(new THREE.BoxGeometry(0.92, 0.78, 0.06), glassMaterial, "food-truck-cabin-side-window");
  sideWindowNear.position.set(2.18, 2.13, 1.09);
  const sideWindowFar = sideWindowNear.clone();
  sideWindowFar.position.z = -1.09;
  const cabDoorNear = mesh(new THREE.BoxGeometry(1.18, 1.8, 0.04), bodyMaterial, "food-truck-cab-door");
  cabDoorNear.position.set(2.08, 1.48, 1.075);
  const cabDoorFar = cabDoorNear.clone();
  cabDoorFar.position.z = -1.075;
  group.add(cabDoorNear, cabDoorFar, windshield, sideWindowNear, sideWindowFar);

  const servingOpening = mesh(new THREE.BoxGeometry(2.48, 1.34, 0.07), darkMaterial, "food-truck-serving-opening");
  servingOpening.position.set(-0.75, 2.23, 1.13);
  const counter = mesh(new THREE.BoxGeometry(2.75, 0.12, 0.62), creamMaterial, "food-truck-serving-counter");
  counter.position.set(-0.75, 1.54, 1.42);
  const lowerTrim = mesh(new THREE.BoxGeometry(4.02, 0.34, 0.08), creamMaterial, "food-truck-side-trim");
  lowerTrim.position.set(-0.72, 1.08, 1.115);
  group.add(servingOpening, counter, lowerTrim);

  const hatchPivot = new THREE.Group();
  hatchPivot.name = "food-truck-serving-hatch-pivot";
  hatchPivot.position.set(-0.75, 2.9, 1.18);
  const hatch = mesh(new THREE.BoxGeometry(2.62, 1.34, 0.12), creamMaterial, "food-truck-serving-hatch");
  hatch.position.y = -0.67;
  hatchPivot.add(hatch);
  for (let i = 0; i < 5; i += 1) {
    const stripe = mesh(new THREE.BoxGeometry(0.3, 1.16, 0.025), i % 2 === 0 ? accentMaterial : bodyMaterial, `food-truck-awning-stripe-${i + 1}`);
    stripe.position.set((i - 2) * 0.47, -0.67, 0.073);
    hatchPivot.add(stripe);
  }
  group.add(hatchPivot);

  const menuBoard = mesh(new THREE.BoxGeometry(0.82, 1.18, 0.08), darkMaterial, "food-truck-menu-board");
  menuBoard.position.set(-2.34, 2.2, 1.17);
  group.add(menuBoard);
  const menuColors = [creamMaterial, accentMaterial, creamMaterial];
  for (let i = 0; i < 3; i += 1) {
    const line = mesh(new THREE.BoxGeometry(0.55 - i * 0.07, 0.08, 0.025), menuColors[i], `food-truck-menu-line-${i + 1}`);
    line.position.set(-2.34, 2.48 - i * 0.26, 1.225);
    group.add(line);
  }

  const vent = mesh(new THREE.BoxGeometry(0.78, 0.34, 0.62), darkMaterial, "food-truck-roof-vent");
  vent.position.set(-1.25, 3.78, -0.25);
  const roofSign = mesh(new THREE.BoxGeometry(1.85, 0.68, 0.16), accentMaterial, "food-truck-roof-sign");
  roofSign.position.set(0.18, 3.92, 0);
  for (let i = 0; i < 3; i += 1) {
    const badge = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), warmLightMaterial, `food-truck-roof-sign-badge-${i + 1}`);
    badge.rotation.x = Math.PI * 0.5;
    badge.position.set(-0.35 + i * 0.35, 3.92, 0.105);
    group.add(badge);
  }
  group.add(vent, roofSign);

  const wheelGeometry = new THREE.CylinderGeometry(0.54, 0.54, 0.34, 12);
  const hubGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.37, 8);
  for (const x of [-1.92, 2.05]) {
    for (const z of [-1.18, 1.18]) {
      const wheel = mesh(wheelGeometry, rubberMaterial, "food-truck-wheel");
      wheel.position.set(x, 0.67, z);
      wheel.rotation.x = Math.PI * 0.5;
      const hub = mesh(hubGeometry, creamMaterial, "food-truck-wheel-hub");
      hub.position.copy(wheel.position);
      hub.rotation.x = Math.PI * 0.5;
      group.add(wheel, hub);
    }
  }

  for (const z of [-0.7, 0.7]) {
    const headlight = mesh(new THREE.BoxGeometry(0.08, 0.32, 0.38), warmLightMaterial, "food-truck-headlight");
    headlight.position.set(3.4, 1.35, z);
    const tail = mesh(new THREE.BoxGeometry(0.07, 0.36, 0.28), redLightMaterial, "food-truck-tail-light");
    tail.position.set(-2.84, 1.15, z);
    group.add(headlight, tail);
  }
  const mirrorNear = mesh(new THREE.BoxGeometry(0.18, 0.4, 0.38), darkMaterial, "food-truck-side-mirror");
  mirrorNear.position.set(2.74, 2.32, 1.32);
  const mirrorFar = mirrorNear.clone();
  mirrorFar.position.z = -1.32;
  group.add(mirrorNear, mirrorFar);

  const cabinLight = new THREE.PointLight(0xffbd63, 0, 8, 2);
  cabinLight.name = "food-truck-serving-light";
  cabinLight.position.set(-0.75, 2.6, 1.65);
  group.add(cabinLight);

  group.userData = {
    modelType: "food-truck",
    generatedLocally: true,
    setServingOpen(open: boolean) {
      hatchPivot.rotation.x = open ? -1.13 : 0;
    },
    setLights(powered: boolean) {
      warmLightMaterial.emissiveIntensity = powered ? 3 : 0.3;
      redLightMaterial.emissiveIntensity = powered ? 1.7 : 0.2;
      cabinLight.intensity = powered ? 2.5 : 0;
    },
  };
  group.userData.setServingOpen(true);
  return group;
}
