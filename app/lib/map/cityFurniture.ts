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
    occupantAnchor: THREE.Vector3;
    occupantSpace: THREE.Vector3;
    setServingOpen: (open: boolean) => void;
    setLights: (powered: boolean) => void;
  };
};

type HotDogKioskModel = THREE.Group & {
  userData: {
    modelType: "hot-dog-kiosk";
    generatedLocally: true;
    occupantAnchor: THREE.Vector3;
    occupantSpace: THREE.Vector3;
    setServingOpen: (open: boolean) => void;
  };
};

type NewsstandModel = THREE.Group & {
  userData: {
    modelType: "newsstand";
    generatedLocally: true;
    setOpen: (open: boolean) => void;
  };
};

type PhoneBoothModel = THREE.Group & {
  userData: {
    modelType: "phone-booth";
    generatedLocally: true;
    setDoorOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

type RoadsidePlanterModel = THREE.Group & {
  userData: {
    modelType: "roadside-planter";
    generatedLocally: true;
    plantingSlots: THREE.Vector3[];
  };
};

type ResidentialBuildingModel = THREE.Group & {
  userData: {
    modelType: "residential-building";
    generatedLocally: true;
    floorCount: number;
    apartmentCount: number;
  };
};

type SmallVillaModel = THREE.Group & {
  userData: {
    modelType: "small-villa";
    generatedLocally: true;
    floorCount: number;
    occupantAnchor: THREE.Vector3;
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
    color: new THREE.Color(color).multiplyScalar(0.04),
    emissive: color,
    emissiveIntensity: 0,
    roughness: 0.12,
    metalness: 0,
  });
  // Signal colors must stay saturated instead of being compressed by ACES.
  lensMaterial.toneMapped = false;
  lensMaterials.push(lensMaterial);
  const lens = mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.065, 16), lensMaterial, "traffic-light-lens");
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
  const red = buildSignalLens(0xff160c, 0.84, housingMaterial, lensMaterials);
  const yellow = buildSignalLens(0xffc21c, 0, housingMaterial, lensMaterials);
  const green = buildSignalLens(0x00f04c, -0.84, housingMaterial, lensMaterials);
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

  const statusLight = new THREE.PointLight(0xff160c, 1.1, 0.7, 2);
  statusLight.name = "traffic-signal-status-light";
  statusLight.position.set(2.08, 5.02, 0.8);
  group.add(statusLight);

  const setPhase = (phase: TrafficPhase) => {
    const activeIndex = phase === "red" ? 0 : phase === "yellow" ? 1 : 2;
    const lensY = [5.02, 4.18, 3.34];
    lensMaterials.forEach((material, index) => {
      material.emissiveIntensity = index === activeIndex ? 3.2 : 0;
      material.color.copy(material.emissive).multiplyScalar(index === activeIndex ? 0.5 : 0.04);
    });
    const active = lensMaterials[activeIndex].emissive;
    statusLight.color.copy(active);
    statusLight.position.y = lensY[activeIndex];
    statusLight.intensity = 1.1;
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
  const serviceFloor = mesh(new THREE.BoxGeometry(4.15, 0.18, 2.12), creamMaterial, "food-truck-interior-floor");
  serviceFloor.position.set(-0.72, 1.04, 0);
  const farWall = mesh(new THREE.BoxGeometry(4.15, 2.34, 0.16), creamMaterial, "food-truck-interior-far-wall");
  farWall.position.set(-0.72, 2.22, -1.02);
  const rearWall = mesh(new THREE.BoxGeometry(0.18, 2.34, 2.12), bodyMaterial, "food-truck-rear-wall");
  rearWall.position.set(-2.71, 2.22, 0);
  const servingRearPillar = mesh(new THREE.BoxGeometry(0.78, 2.34, 0.16), bodyMaterial, "food-truck-serving-side-pillar");
  servingRearPillar.position.set(-2.4, 2.22, 1.02);
  const servingFrontPillar = mesh(new THREE.BoxGeometry(0.82, 2.34, 0.16), bodyMaterial, "food-truck-serving-side-pillar");
  servingFrontPillar.position.set(0.92, 2.22, 1.02);
  const servingLowerWall = mesh(new THREE.BoxGeometry(2.52, 0.42, 0.16), bodyMaterial, "food-truck-serving-lower-wall");
  servingLowerWall.position.set(-0.75, 1.3, 1.02);
  const servingHeader = mesh(new THREE.BoxGeometry(2.52, 0.46, 0.16), bodyMaterial, "food-truck-serving-header");
  servingHeader.position.set(-0.75, 3.16, 1.02);
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
  group.add(
    chassis,
    serviceFloor,
    farWall,
    rearWall,
    servingRearPillar,
    servingFrontPillar,
    servingLowerWall,
    servingHeader,
    cabin,
    hood,
    roof,
    bumperFront,
    bumperRear,
  );

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

  const counter = mesh(new THREE.BoxGeometry(2.75, 0.12, 0.62), creamMaterial, "food-truck-serving-counter");
  counter.position.set(-0.75, 1.54, 1.42);
  const lowerTrim = mesh(new THREE.BoxGeometry(4.02, 0.34, 0.08), creamMaterial, "food-truck-side-trim");
  lowerTrim.position.set(-0.72, 1.08, 1.115);
  group.add(counter, lowerTrim);

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
  cabinLight.position.set(-0.75, 2.72, 0.38);
  group.add(cabinLight);

  group.userData = {
    modelType: "food-truck",
    generatedLocally: true,
    occupantAnchor: new THREE.Vector3(-0.68, 1.17, -0.12),
    occupantSpace: new THREE.Vector3(2.8, 2.08, 1.72),
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

export function buildLowPolyHotDogKiosk(): HotDogKioskModel {
  const group = new THREE.Group() as HotDogKioskModel;
  group.name = "city-hot-dog-kiosk-lowpoly";
  const red = new THREE.MeshStandardMaterial({ color: 0xc84f3f, roughness: 0.78 });
  const mustard = new THREE.MeshStandardMaterial({ color: 0xe5b83e, roughness: 0.82 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf4dfae, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x342f2b, roughness: 0.76, metalness: 0.12 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8f9b9a, roughness: 0.48, metalness: 0.56 });

  const base = mesh(new THREE.BoxGeometry(3.5, 0.28, 2.5), dark, "hot-dog-kiosk-base");
  base.position.y = 0.14;
  const floor = mesh(new THREE.BoxGeometry(3.08, 0.12, 2.08), red, "hot-dog-kiosk-interior-floor");
  floor.position.y = 0.34;
  const rearLowerWall = mesh(new THREE.BoxGeometry(3.08, 1.18, 0.16), red, "hot-dog-kiosk-rear-lower-wall");
  rearLowerWall.position.set(0, 0.93, -1.02);
  const back = mesh(new THREE.BoxGeometry(3.1, 2.05, 0.16), cream, "hot-dog-kiosk-back-wall");
  back.position.set(0, 2.1, -1.02);
  const leftLowerWall = mesh(new THREE.BoxGeometry(0.16, 1.18, 2.04), red, "hot-dog-kiosk-lower-side-wall");
  leftLowerWall.position.set(-1.46, 0.93, 0);
  const rightLowerWall = leftLowerWall.clone();
  rightLowerWall.position.x = 1.46;
  group.add(base, floor, rearLowerWall, back, leftLowerWall, rightLowerWall);

  for (const x of [-1.44, 1.44]) {
    for (const z of [-0.98, 0.98]) {
      const post = mesh(new THREE.BoxGeometry(0.16, 2.88, 0.16), dark, "hot-dog-kiosk-corner-post");
      post.position.set(x, 1.78, z);
      group.add(post);
    }
  }

  const counter = mesh(new THREE.BoxGeometry(3.22, 0.12, 0.58), steel, "hot-dog-kiosk-counter");
  counter.position.set(0, 1.45, 1.28);
  const grill = mesh(new THREE.BoxGeometry(1.35, 0.16, 0.55), steel, "hot-dog-kiosk-grill");
  grill.position.set(-0.48, 1.58, 0.72);
  group.add(counter, grill);
  for (let i = 0; i < 4; i += 1) {
    const sausage = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 8), red, "hot-dog-kiosk-sausage");
    sausage.rotation.z = Math.PI * 0.5;
    sausage.position.set(-0.78 + i * 0.28, 1.72, 0.7);
    group.add(sausage);
  }

  const roof = mesh(new THREE.BoxGeometry(3.85, 0.22, 2.8), mustard, "hot-dog-kiosk-canopy");
  roof.position.y = 3.34;
  group.add(roof);
  for (let i = 0; i < 8; i += 1) {
    const stripe = mesh(new THREE.BoxGeometry(0.44, 0.42, 0.1), i % 2 === 0 ? red : cream, "hot-dog-kiosk-canopy-stripe");
    stripe.position.set(-1.55 + i * 0.44, 3.14, 1.43);
    group.add(stripe);
  }

  const hatchPivot = new THREE.Group();
  hatchPivot.name = "hot-dog-kiosk-hatch-pivot";
  hatchPivot.position.set(0, 2.82, 1.09);
  const hatch = mesh(new THREE.BoxGeometry(2.74, 1.24, 0.1), red, "hot-dog-kiosk-serving-hatch");
  hatch.position.y = -0.62;
  hatchPivot.add(hatch);
  group.add(hatchPivot);

  const signBoard = mesh(new THREE.BoxGeometry(2.35, 0.7, 0.14), cream, "hot-dog-kiosk-sign");
  signBoard.position.set(0, 3.98, 0);
  const bunTop = mesh(new THREE.CylinderGeometry(0.19, 0.19, 1.28, 10), mustard, "hot-dog-kiosk-sign-bun");
  bunTop.rotation.z = Math.PI * 0.5;
  bunTop.position.set(0, 4.04, 0.13);
  const sausageTop = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.14, 8), red, "hot-dog-kiosk-sign-sausage");
  sausageTop.rotation.z = Math.PI * 0.5;
  sausageTop.position.set(0, 4.04, 0.33);
  group.add(signBoard, bunTop, sausageTop);

  group.userData = {
    modelType: "hot-dog-kiosk",
    generatedLocally: true,
    occupantAnchor: new THREE.Vector3(0, 0.42, -0.12),
    occupantSpace: new THREE.Vector3(2.55, 2.72, 1.72),
    setServingOpen(open: boolean) {
      hatchPivot.rotation.x = open ? -1.12 : 0;
    },
  };
  group.userData.setServingOpen(true);
  return group;
}

export function buildLowPolyNewsstand(): NewsstandModel {
  const group = new THREE.Group() as NewsstandModel;
  group.name = "city-newsstand-lowpoly";
  const green = new THREE.MeshStandardMaterial({ color: 0x3f6f61, roughness: 0.82 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xeadfbf, roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263b36, roughness: 0.78 });
  const paperMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xe9d6a8, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0xc75843, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0x517da0, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0xd4aa3f, roughness: 0.9 }),
  ];

  const base = mesh(new THREE.BoxGeometry(3.5, 0.3, 2.5), dark, "newsstand-base");
  base.position.y = 0.15;
  const cabinet = mesh(new THREE.BoxGeometry(3.2, 1.32, 2.18), green, "newsstand-cabinet");
  cabinet.position.y = 0.94;
  const back = mesh(new THREE.BoxGeometry(3.08, 2.15, 0.18), green, "newsstand-back-wall");
  back.position.set(0, 2.2, -1.02);
  const leftWall = mesh(new THREE.BoxGeometry(0.18, 2.15, 2.05), green, "newsstand-side-wall");
  leftWall.position.set(-1.5, 2.2, 0);
  const rightWall = leftWall.clone();
  rightWall.position.x = 1.5;
  const opening = mesh(new THREE.BoxGeometry(2.65, 1.42, 0.08), dark, "newsstand-display-opening");
  opening.position.set(0, 2.22, 1.06);
  const counter = mesh(new THREE.BoxGeometry(3.18, 0.12, 0.54), cream, "newsstand-counter");
  counter.position.set(0, 1.48, 1.26);
  group.add(base, cabinet, back, leftWall, rightWall, opening, counter);

  const shelfGeometry = new THREE.BoxGeometry(2.55, 0.09, 0.34);
  for (let row = 0; row < 3; row += 1) {
    const shelf = mesh(shelfGeometry, dark, "newsstand-display-shelf");
    shelf.position.set(0, 1.72 + row * 0.43, 1.12);
    group.add(shelf);
    for (let column = 0; column < 5; column += 1) {
      const paper = mesh(new THREE.BoxGeometry(0.4, 0.34, 0.035), paperMaterials[(row + column) % paperMaterials.length], "newsstand-newspaper-magazine");
      paper.position.set(-0.96 + column * 0.48, 1.91 + row * 0.43, 1.31);
      paper.rotation.z = ((column % 2) - 0.5) * 0.06;
      group.add(paper);
    }
  }

  const roof = mesh(new THREE.BoxGeometry(3.72, 0.24, 2.75), cream, "newsstand-roof");
  roof.position.y = 3.4;
  const sign = mesh(new THREE.BoxGeometry(2.75, 0.62, 0.16), green, "newsstand-sign");
  sign.position.set(0, 3.83, 0.42);
  group.add(roof, sign);
  for (let i = 0; i < 5; i += 1) {
    const letterBlock = mesh(new THREE.BoxGeometry(0.28, 0.3, 0.04), cream, "newsstand-sign-letter-block");
    letterBlock.position.set(-0.72 + i * 0.36, 3.83, 0.53);
    group.add(letterBlock);
  }

  const shutterPivot = new THREE.Group();
  shutterPivot.name = "newsstand-shutter-pivot";
  shutterPivot.position.set(0, 2.94, 1.1);
  const shutter = mesh(new THREE.BoxGeometry(2.74, 1.4, 0.1), green, "newsstand-shutter");
  shutter.position.y = -0.7;
  shutterPivot.add(shutter);
  for (let i = 0; i < 4; i += 1) {
    const rib = mesh(new THREE.BoxGeometry(2.5, 0.055, 0.025), cream, "newsstand-shutter-rib");
    rib.position.set(0, -0.35 - i * 0.22, 0.065);
    shutterPivot.add(rib);
  }
  group.add(shutterPivot);

  group.userData = {
    modelType: "newsstand",
    generatedLocally: true,
    setOpen(open: boolean) {
      shutterPivot.rotation.x = open ? -1.2 : 0;
    },
  };
  group.userData.setOpen(true);
  return group;
}

export function buildLowPolyPhoneBooth(): PhoneBoothModel {
  const group = new THREE.Group() as PhoneBoothModel;
  group.name = "city-phone-booth-lowpoly";
  const red = new THREE.MeshStandardMaterial({ color: 0xb83d34, roughness: 0.68, metalness: 0.12 });
  const darkRed = new THREE.MeshStandardMaterial({ color: 0x762d2a, roughness: 0.76 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25292b, roughness: 0.72, metalness: 0.18 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9ecbd0, roughness: 0.12, metalness: 0.08, transparent: true, opacity: 0.48 });
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e5bd, emissive: 0xffc76b, emissiveIntensity: 0.25, roughness: 0.4 });

  const base = mesh(new THREE.BoxGeometry(2.55, 0.28, 2.35), darkRed, "phone-booth-base");
  base.position.y = 0.14;
  const floor = mesh(new THREE.BoxGeometry(2.28, 0.12, 2.08), dark, "phone-booth-floor");
  floor.position.y = 0.34;
  group.add(base, floor);
  for (const x of [-1.04, 1.04]) {
    for (const z of [-0.94, 0.94]) {
      const pillar = mesh(new THREE.BoxGeometry(0.2, 3.25, 0.2), red, "phone-booth-corner-pillar");
      pillar.position.set(x, 1.94, z);
      group.add(pillar);
    }
  }

  const headerFront = mesh(new THREE.BoxGeometry(2.25, 0.58, 0.22), red, "phone-booth-header");
  headerFront.position.set(0, 3.35, 0.94);
  const headerBack = headerFront.clone();
  headerBack.position.z = -0.94;
  const headerLeft = mesh(new THREE.BoxGeometry(0.22, 0.58, 1.68), red, "phone-booth-header-side");
  headerLeft.position.set(-1.04, 3.35, 0);
  const headerRight = headerLeft.clone();
  headerRight.position.x = 1.04;
  group.add(headerFront, headerBack, headerLeft, headerRight);

  const roof = mesh(new THREE.ConeGeometry(1.55, 0.55, 4), red, "phone-booth-roof");
  roof.position.y = 3.92;
  roof.rotation.y = Math.PI * 0.25;
  const roofCap = mesh(new THREE.BoxGeometry(0.34, 0.18, 0.34), darkRed, "phone-booth-roof-cap");
  roofCap.position.y = 4.25;
  group.add(roof, roofCap);

  for (const z of [-0.96, 0.96]) {
    for (const x of [-0.52, 0.52]) {
      if (z > 0) continue;
      const pane = mesh(new THREE.BoxGeometry(0.86, 2.46, 0.04), glass, "phone-booth-glass-pane");
      pane.position.set(x, 1.92, z);
      group.add(pane);
    }
  }
  for (const x of [-1.05, 1.05]) {
    for (const z of [-0.45, 0.45]) {
      const pane = mesh(new THREE.BoxGeometry(0.04, 2.46, 0.72), glass, "phone-booth-side-glass-pane");
      pane.position.set(x, 1.92, z);
      group.add(pane);
    }
  }

  const doorPivot = new THREE.Group();
  doorPivot.name = "phone-booth-door-pivot";
  doorPivot.position.set(-1.02, 0.43, 0.99);
  const doorGlass = mesh(new THREE.BoxGeometry(1.82, 2.55, 0.05), glass, "phone-booth-door-glass");
  doorGlass.position.set(0.91, 1.28, 0);
  doorPivot.add(doorGlass);
  for (const x of [0.04, 0.91, 1.78]) {
    const rail = mesh(new THREE.BoxGeometry(0.1, 2.65, 0.11), red, "phone-booth-door-frame");
    rail.position.set(x, 1.3, 0);
    doorPivot.add(rail);
  }
  for (const y of [0.04, 0.89, 1.75, 2.61]) {
    const rail = mesh(new THREE.BoxGeometry(1.84, 0.1, 0.11), red, "phone-booth-door-frame");
    rail.position.set(0.91, y, 0);
    doorPivot.add(rail);
  }
  const handle = mesh(new THREE.BoxGeometry(0.1, 0.38, 0.16), dark, "phone-booth-door-handle");
  handle.position.set(1.58, 1.25, 0.1);
  doorPivot.add(handle);
  group.add(doorPivot);

  const phoneBody = mesh(new THREE.BoxGeometry(0.84, 1.05, 0.34), dark, "phone-booth-telephone");
  phoneBody.position.set(0, 1.78, -0.78);
  const dial = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 12), lightMaterial, "phone-booth-dial");
  dial.rotation.x = Math.PI * 0.5;
  dial.position.set(0, 1.72, -0.57);
  const handset = mesh(new THREE.BoxGeometry(0.72, 0.15, 0.16), red, "phone-booth-handset");
  handset.position.set(0, 2.2, -0.56);
  group.add(phoneBody, dial, handset);

  const ceilingLamp = mesh(new THREE.BoxGeometry(0.58, 0.12, 0.58), lightMaterial, "phone-booth-ceiling-lamp");
  ceilingLamp.position.y = 3.2;
  const light = new THREE.PointLight(0xffcf79, 0, 7, 2);
  light.name = "phone-booth-interior-light";
  light.position.set(0, 2.95, 0);
  group.add(ceilingLamp, light);

  group.userData = {
    modelType: "phone-booth",
    generatedLocally: true,
    setDoorOpen(open: boolean) {
      doorPivot.rotation.y = open ? -1.08 : 0;
    },
    setPowered(powered: boolean) {
      lightMaterial.emissiveIntensity = powered ? 2.8 : 0.2;
      light.intensity = powered ? 2.2 : 0;
    },
  };
  group.userData.setDoorOpen(true);
  return group;
}

export function buildLowPolyRoadsidePlanter(): RoadsidePlanterModel {
  const group = new THREE.Group() as RoadsidePlanterModel;
  group.name = "city-roadside-planter-lowpoly";
  const stone = new THREE.MeshStandardMaterial({ color: 0xb8aa91, roughness: 0.9 });
  const stoneTop = new THREE.MeshStandardMaterial({ color: 0xd2c5a9, roughness: 0.86 });
  const mortar = new THREE.MeshStandardMaterial({ color: 0x786f62, roughness: 0.96 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x4c3527, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x477548, roughness: 0.92 });
  const leafDark = new THREE.MeshStandardMaterial({ color: 0x315c3b, roughness: 0.94 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3e7142, roughness: 0.9 });
  const flowerMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xd95f68, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0xe7b84f, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x8f75c8, roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: 0xf0d9cb, roughness: 0.86 }),
  ];

  const foundation = mesh(new THREE.BoxGeometry(6.35, 0.18, 1.75), mortar, "roadside-planter-foundation");
  foundation.position.y = 0.09;
  const frontWall = mesh(new THREE.BoxGeometry(6.05, 0.62, 0.18), stone, "roadside-planter-long-wall");
  frontWall.position.set(0, 0.45, 0.69);
  const backWall = frontWall.clone();
  backWall.position.z = -0.69;
  const leftWall = mesh(new THREE.BoxGeometry(0.18, 0.62, 1.2), stone, "roadside-planter-end-wall");
  leftWall.position.set(-2.94, 0.45, 0);
  const rightWall = leftWall.clone();
  rightWall.position.x = 2.94;
  const soilBed = mesh(new THREE.BoxGeometry(5.68, 0.12, 1.08), soil, "roadside-planter-soil-bed");
  soilBed.position.y = 0.69;
  group.add(foundation, frontWall, backWall, leftWall, rightWall, soilBed);

  const frontRim = mesh(new THREE.BoxGeometry(6.25, 0.14, 0.3), stoneTop, "roadside-planter-long-rim");
  frontRim.position.set(0, 0.79, 0.72);
  const backRim = frontRim.clone();
  backRim.position.z = -0.72;
  const leftRim = mesh(new THREE.BoxGeometry(0.3, 0.14, 1.18), stoneTop, "roadside-planter-end-rim");
  leftRim.position.set(-2.98, 0.79, 0);
  const rightRim = leftRim.clone();
  rightRim.position.x = 2.98;
  group.add(frontRim, backRim, leftRim, rightRim);

  for (const z of [-0.785, 0.785]) {
    for (let i = 0; i < 7; i += 1) {
      const seam = mesh(new THREE.BoxGeometry(0.035, 0.45, 0.025), mortar, "roadside-planter-masonry-seam");
      seam.position.set(-2.55 + i * 0.85, 0.44, z);
      group.add(seam);
    }
  }

  const plantingSlots: THREE.Vector3[] = [];
  const shrubPositions = [-2.22, -0.76, 0.78, 2.2];
  shrubPositions.forEach((x, index) => {
    const shrub = mesh(
      new THREE.DodecahedronGeometry(index % 2 === 0 ? 0.38 : 0.32, 0),
      index % 2 === 0 ? leafDark : leaf,
      "roadside-planter-shrub",
    );
    shrub.position.set(x, 1.02 + (index % 2) * 0.05, index % 2 === 0 ? -0.12 : 0.12);
    shrub.scale.set(1.15, 0.9, 0.88);
    group.add(shrub);
    plantingSlots.push(shrub.position.clone());
  });

  const flowerPositions = [
    [-2.55, 0.3], [-1.83, -0.3], [-1.33, 0.28], [-0.35, -0.26],
    [0.25, 0.3], [1.22, -0.3], [1.7, 0.28], [2.55, -0.24],
  ] as const;
  flowerPositions.forEach(([x, z], index) => {
    const height = 0.34 + (index % 3) * 0.07;
    const stem = mesh(new THREE.CylinderGeometry(0.025, 0.032, height, 5), stemMaterial, "roadside-planter-flower-stem");
    stem.position.set(x, 0.75 + height * 0.5, z);
    const blossom = mesh(new THREE.OctahedronGeometry(0.13 + (index % 2) * 0.02, 0), flowerMaterials[index % flowerMaterials.length], "roadside-planter-flower-blossom");
    blossom.position.set(x, 0.77 + height, z);
    blossom.rotation.y = index * 0.72;
    group.add(stem, blossom);
    plantingSlots.push(stem.position.clone());
  });

  group.userData = {
    modelType: "roadside-planter",
    generatedLocally: true,
    plantingSlots,
  };
  return group;
}

export function buildLowPolyResidentialBuilding(): ResidentialBuildingModel {
  const group = new THREE.Group() as ResidentialBuildingModel;
  group.name = "city-residential-building-lowpoly";
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.9 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9f6550, roughness: 0.94 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf0e7d5, roughness: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c4548, roughness: 0.72, metalness: 0.18 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x78a9b7, roughness: 0.28, metalness: 0.08 });
  const balcony = new THREE.MeshStandardMaterial({ color: 0xc5bba8, roughness: 0.88 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5a5b58, roughness: 0.82 });
  const acMaterial = new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.76, metalness: 0.12 });

  const foundation = mesh(new THREE.BoxGeometry(7.4, 0.3, 5.25), dark, "residential-building-foundation");
  foundation.position.y = 0.15;
  const body = mesh(new THREE.BoxGeometry(6.9, 8.8, 4.65), concrete, "residential-building-main-body");
  body.position.y = 4.7;
  const brickCore = mesh(new THREE.BoxGeometry(2.05, 8.88, 4.75), brick, "residential-building-stair-core");
  brickCore.position.set(0, 4.72, 0);
  const roofSlab = mesh(new THREE.BoxGeometry(7.15, 0.28, 4.9), roof, "residential-building-flat-roof");
  roofSlab.position.y = 9.22;
  group.add(foundation, body, brickCore, roofSlab);

  const entrance = mesh(new THREE.BoxGeometry(1.3, 2.1, 0.12), glass, "residential-building-entrance");
  entrance.position.set(0, 1.35, 2.39);
  const entranceFrame = mesh(new THREE.BoxGeometry(1.65, 0.16, 0.28), trim, "residential-building-entrance-frame");
  entranceFrame.position.set(0, 2.45, 2.42);
  const canopy = mesh(new THREE.BoxGeometry(2.25, 0.18, 1.12), roof, "residential-building-entrance-canopy");
  canopy.position.set(0, 2.72, 2.77);
  const step = mesh(new THREE.BoxGeometry(2.4, 0.22, 0.85), balcony, "residential-building-entry-step");
  step.position.set(0, 0.39, 2.66);
  group.add(entrance, entranceFrame, canopy, step);

  const windowGeometry = new THREE.BoxGeometry(0.82, 1.08, 0.1);
  const sillGeometry = new THREE.BoxGeometry(1.02, 0.1, 0.18);
  for (let floor = 0; floor < 5; floor += 1) {
    const y = 1.55 + floor * 1.62;
    for (const x of [-2.55, -1.45, 1.45, 2.55]) {
      if (floor === 0 && Math.abs(x) < 1.6) continue;
      const frontWindow = mesh(windowGeometry, glass, "residential-building-window");
      frontWindow.position.set(x, y, 2.38);
      const frontSill = mesh(sillGeometry, trim, "residential-building-window-sill");
      frontSill.position.set(x, y - 0.59, 2.43);
      const rearWindow = frontWindow.clone();
      rearWindow.position.z = -2.38;
      const rearSill = frontSill.clone();
      rearSill.position.z = -2.43;
      group.add(frontWindow, frontSill, rearWindow, rearSill);
    }

    if (floor > 0) {
      for (const x of [-2.18, 2.18]) {
        const balconyFloor = mesh(new THREE.BoxGeometry(2.05, 0.16, 0.82), balcony, "residential-building-balcony-floor");
        balconyFloor.position.set(x, y - 0.7, 2.72);
        const balconyRail = mesh(new THREE.BoxGeometry(2.05, 0.62, 0.1), dark, "residential-building-balcony-rail");
        balconyRail.position.set(x, y - 0.36, 3.08);
        group.add(balconyFloor, balconyRail);
        for (const postX of [-0.86, -0.43, 0, 0.43, 0.86]) {
          const post = mesh(new THREE.BoxGeometry(0.06, 0.6, 0.08), dark, "residential-building-balcony-post");
          post.position.set(x + postX, y - 0.36, 3.03);
          group.add(post);
        }
      }
    }
  }

  for (const side of [-1, 1]) {
    for (let floor = 0; floor < 5; floor += 1) {
      const sideWindow = mesh(windowGeometry, glass, "residential-building-side-window");
      sideWindow.rotation.y = Math.PI * 0.5;
      sideWindow.position.set(side * 3.5, 1.55 + floor * 1.62, 0.52);
      group.add(sideWindow);
    }
  }

  for (const x of [-2.55, 2.55]) {
    const ac = mesh(new THREE.BoxGeometry(0.72, 0.42, 0.28), acMaterial, "residential-building-air-conditioner");
    ac.position.set(x, 6.65, -2.48);
    const fan = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 8), dark, "residential-building-ac-fan");
    fan.rotation.x = Math.PI * 0.5;
    fan.position.set(x, 6.65, -2.64);
    group.add(ac, fan);
  }
  const roofRoom = mesh(new THREE.BoxGeometry(2.15, 0.86, 1.75), brick, "residential-building-roof-room");
  roofRoom.position.set(0.8, 9.79, -0.45);
  const waterTank = mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.9, 8), dark, "residential-building-water-tank");
  waterTank.position.set(-1.65, 9.78, 0);
  group.add(roofRoom, waterTank);

  group.userData = {
    modelType: "residential-building",
    generatedLocally: true,
    floorCount: 5,
    apartmentCount: 20,
  };
  return group;
}

function createGableRoofGeometry(width: number, depth: number, eaveY: number, ridgeY: number) {
  const x = width * 0.5;
  const z = depth * 0.5;
  const positions = new Float32Array([
    -x, eaveY, -z, x, eaveY, -z, 0, ridgeY, -z,
    -x, eaveY, z, x, eaveY, z, 0, ridgeY, z,
  ]);
  const indices = [
    0, 1, 2, 5, 4, 3,
    0, 2, 5, 0, 5, 3,
    2, 1, 4, 2, 4, 5,
    0, 3, 4, 0, 4, 1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildLowPolySmallVilla(): SmallVillaModel {
  const group = new THREE.Group() as SmallVillaModel;
  group.name = "city-small-villa-lowpoly";
  const plaster = new THREE.MeshStandardMaterial({ color: 0xeadfc5, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a8c78, roughness: 0.96 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x684534, roughness: 0.88 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8f4437, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x75a7b5, roughness: 0.3, metalness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x354043, roughness: 0.75, metalness: 0.18 });
  const green = new THREE.MeshStandardMaterial({ color: 0x416c44, roughness: 0.94 });

  const foundation = mesh(new THREE.BoxGeometry(7.25, 0.3, 5.65), stone, "small-villa-foundation");
  foundation.position.y = 0.15;
  const firstFloor = mesh(new THREE.BoxGeometry(6.7, 2.6, 5.1), plaster, "small-villa-first-floor");
  firstFloor.position.y = 1.65;
  const secondFloor = mesh(new THREE.BoxGeometry(5.65, 2.15, 4.55), plaster, "small-villa-second-floor");
  secondFloor.position.set(0.32, 4.02, -0.12);
  const stoneAccent = mesh(new THREE.BoxGeometry(1.62, 2.62, 5.18), stone, "small-villa-stone-accent");
  stoneAccent.position.set(-2.45, 1.66, 0);
  const roof = mesh(createGableRoofGeometry(6.7, 5.35, 5.1, 6.5), roofMaterial, "small-villa-gable-roof");
  group.add(foundation, firstFloor, secondFloor, stoneAccent, roof);

  const door = mesh(new THREE.BoxGeometry(1.08, 2.05, 0.12), timber, "small-villa-front-door");
  door.position.set(-1.05, 1.38, 2.62);
  const doorGlass = mesh(new THREE.BoxGeometry(0.42, 0.7, 0.04), glass, "small-villa-door-glass");
  doorGlass.position.set(-1.05, 1.65, 2.7);
  const porchRoof = mesh(new THREE.BoxGeometry(2.7, 0.18, 1.45), roofMaterial, "small-villa-porch-roof");
  porchRoof.position.set(-0.95, 2.85, 3.05);
  const porchStep = mesh(new THREE.BoxGeometry(2.9, 0.24, 1.2), stone, "small-villa-porch-step");
  porchStep.position.set(-0.95, 0.4, 3.05);
  group.add(door, doorGlass, porchRoof, porchStep);
  for (const x of [-2.08, 0.18]) {
    const post = mesh(new THREE.BoxGeometry(0.16, 2.42, 0.16), timber, "small-villa-porch-post");
    post.position.set(x, 1.65, 3.48);
    group.add(post);
  }

  const windowGeometry = new THREE.BoxGeometry(1.18, 1.05, 0.1);
  const frontWindows = [
    [1.55, 1.62], [2.65, 1.62], [-1.35, 4.12], [1.05, 4.12], [2.25, 4.12],
  ] as const;
  frontWindows.forEach(([x, y]) => {
    const window = mesh(windowGeometry, glass, "small-villa-window");
    window.position.set(x, y, y > 3 ? 2.2 : 2.62);
    const sill = mesh(new THREE.BoxGeometry(1.38, 0.1, 0.18), stone, "small-villa-window-sill");
    sill.position.set(x, y - 0.58, window.position.z + 0.06);
    group.add(window, sill);
  });
  for (const side of [-1, 1]) {
    const sideWindow = mesh(windowGeometry, glass, "small-villa-side-window");
    sideWindow.rotation.y = Math.PI * 0.5;
    sideWindow.position.set(side * 3.4, 1.7, -0.4);
    group.add(sideWindow);
  }

  const terrace = mesh(new THREE.BoxGeometry(3.25, 0.18, 1.02), stone, "small-villa-terrace");
  terrace.position.set(1.55, 3.02, -2.52);
  const terraceRail = mesh(new THREE.BoxGeometry(3.25, 0.62, 0.1), dark, "small-villa-terrace-rail");
  terraceRail.position.set(1.55, 3.38, -2.98);
  group.add(terrace, terraceRail);
  for (const x of [0.05, 0.8, 1.55, 2.3, 3.05]) {
    const railPost = mesh(new THREE.BoxGeometry(0.06, 0.6, 0.08), dark, "small-villa-terrace-post");
    railPost.position.set(x, 3.38, -2.93);
    group.add(railPost);
  }

  const chimney = mesh(new THREE.BoxGeometry(0.62, 1.65, 0.72), stone, "small-villa-chimney");
  chimney.position.set(2.05, 5.65, -0.85);
  const chimneyCap = mesh(new THREE.BoxGeometry(0.82, 0.14, 0.92), dark, "small-villa-chimney-cap");
  chimneyCap.position.set(2.05, 6.5, -0.85);
  group.add(chimney, chimneyCap);

  for (const x of [-2.75, 2.75]) {
    const planter = mesh(new THREE.BoxGeometry(1.0, 0.46, 0.58), stone, "small-villa-flower-box");
    planter.position.set(x, 0.62, 2.85);
    const shrub = mesh(new THREE.DodecahedronGeometry(0.38, 0), green, "small-villa-shrub");
    shrub.position.set(x, 1.03, 2.85);
    shrub.scale.set(1.1, 0.8, 0.72);
    group.add(planter, shrub);
  }

  group.userData = {
    modelType: "small-villa",
    generatedLocally: true,
    floorCount: 2,
    occupantAnchor: new THREE.Vector3(-1.05, 0.52, 3.15),
  };
  return group;
}
