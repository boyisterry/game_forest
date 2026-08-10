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
    setPowered: (powered: boolean) => void;
  };
};

type NewsstandModel = THREE.Group & {
  userData: {
    modelType: "newsstand";
    generatedLocally: true;
    setOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
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
    floorLevels: number[];
    climbPath: THREE.Vector3[];
    setDoorOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

type HighRiseResidentialModel = THREE.Group & {
  userData: {
    modelType: "high-rise-residential";
    generatedLocally: true;
    floorCount: number;
    apartmentCount: number;
    elevatorCount: number;
    emergencyStairCount: number;
    floorLevels: number[];
    elevatorFloors: number[];
    setElevatorFloors: (floors: [number, number]) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

type SmallVillaModel = THREE.Group & {
  userData: {
    modelType: "small-villa";
    generatedLocally: true;
    floorCount: number;
    occupantAnchor: THREE.Vector3;
    floorLevels: number[];
    roomAnchors: Record<"entrance" | "livingRoom" | "diningKitchen" | "stairs" | "bedroom" | "bathroom", THREE.Vector3>;
    setDoorOpen: (open: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
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
  const warmLight = new THREE.MeshStandardMaterial({
    color: 0xffe1a3,
    emissive: 0xffa53a,
    emissiveIntensity: 0.18,
    roughness: 0.32,
  });

  const base = mesh(new THREE.BoxGeometry(3.5, 0.28, 2.5), dark, "hot-dog-kiosk-base");
  base.position.y = 0.14;
  const floor = mesh(new THREE.BoxGeometry(3.08, 0.12, 2.08), red, "hot-dog-kiosk-interior-floor");
  floor.position.y = 0.34;
  const rearLowerWall = mesh(new THREE.BoxGeometry(3.08, 1.18, 0.16), red, "hot-dog-kiosk-rear-lower-wall");
  rearLowerWall.position.set(0, 0.93, -1.02);
  // Begin exactly at the lower wall's top edge. The old 0.445 m coplanar
  // overlap made the cream and red surfaces fight in the depth buffer.
  const back = mesh(new THREE.BoxGeometry(3.1, 1.6, 0.16), cream, "hot-dog-kiosk-back-wall");
  back.position.set(0, 2.32, -1.02);
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
  const ceilingLamp = mesh(new THREE.BoxGeometry(1.85, 0.1, 0.42), warmLight, "hot-dog-kiosk-ceiling-lamp");
  ceilingLamp.position.set(0, 3.16, 0.18);
  const interiorLight = new THREE.PointLight(0xffbd67, 0, 7.5, 1.8);
  interiorLight.name = "hot-dog-kiosk-interior-light";
  interiorLight.position.set(0, 2.82, 0.28);
  group.add(ceilingLamp, interiorLight);
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
    setPowered(powered: boolean) {
      warmLight.emissiveIntensity = powered ? 3.4 : 0.18;
      interiorLight.intensity = powered ? 3.2 : 0;
    },
  };
  group.userData.setServingOpen(true);
  group.userData.setPowered(false);
  return group;
}

export function buildLowPolyNewsstand(): NewsstandModel {
  const group = new THREE.Group() as NewsstandModel;
  group.name = "city-newsstand-lowpoly";
  const green = new THREE.MeshStandardMaterial({ color: 0x3f6f61, roughness: 0.82 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xeadfbf, roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263b36, roughness: 0.78 });
  const warmLight = new THREE.MeshStandardMaterial({
    color: 0xffe7b0,
    emissive: 0xffad47,
    emissiveIntensity: 0.16,
    roughness: 0.34,
  });
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
  const displayLamp = mesh(new THREE.BoxGeometry(2.35, 0.1, 0.32), warmLight, "newsstand-display-lamp");
  displayLamp.position.set(0, 3.18, 1.2);
  const displayLight = new THREE.PointLight(0xffc66f, 0, 8.5, 1.75);
  displayLight.name = "newsstand-interior-light";
  displayLight.position.set(0, 2.56, 1.48);
  group.add(displayLamp, displayLight);
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
    setPowered(powered: boolean) {
      warmLight.emissiveIntensity = powered ? 3.2 : 0.16;
      displayLight.intensity = powered ? 4.1 : 0;
    },
  };
  group.userData.setOpen(true);
  group.userData.setPowered(false);
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
  const glass = new THREE.MeshStandardMaterial({
    color: 0x78a9b7,
    emissive: 0x193845,
    emissiveIntensity: 0.08,
    roughness: 0.28,
    metalness: 0.08,
  });
  const entranceLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe3aa,
    emissive: 0xffa83f,
    emissiveIntensity: 0.14,
    roughness: 0.34,
  });
  const balcony = new THREE.MeshStandardMaterial({ color: 0xc5bba8, roughness: 0.88 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5a5b58, roughness: 0.82 });
  const acMaterial = new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.76, metalness: 0.12 });
  const stairMaterial = new THREE.MeshStandardMaterial({ color: 0xb9afa0, roughness: 0.92 });
  const stairwellMaterial = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.94, side: THREE.DoubleSide });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x334a51, roughness: 0.58, metalness: 0.22 });
  const stairwellGlass = new THREE.MeshStandardMaterial({
    color: 0x83aeb7,
    emissive: 0x18343c,
    emissiveIntensity: 0.06,
    roughness: 0.32,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });

  const foundation = mesh(new THREE.BoxGeometry(7.4, 0.3, 5.25), dark, "residential-building-foundation");
  foundation.position.y = 0.15;
  const leftWing = mesh(new THREE.BoxGeometry(2.42, 8.8, 4.65), concrete, "residential-building-left-wing");
  leftWing.position.set(-2.24, 4.7, 0);
  const rightWing = mesh(new THREE.BoxGeometry(2.42, 8.8, 4.65), concrete, "residential-building-right-wing");
  rightWing.position.set(2.24, 4.7, 0);
  const stairwellBack = mesh(new THREE.BoxGeometry(2.06, 8.88, 0.18), stairwellMaterial, "residential-building-stair-core-back-wall");
  stairwellBack.position.set(0, 4.72, -2.28);
  const stairwellLeftJamb = mesh(new THREE.BoxGeometry(0.22, 8.88, 0.32), brick, "residential-building-stairwell-jamb");
  stairwellLeftJamb.position.set(-0.92, 4.72, 2.22);
  const stairwellRightJamb = stairwellLeftJamb.clone();
  stairwellRightJamb.position.x = 0.92;
  const roofSlab = mesh(new THREE.BoxGeometry(7.15, 0.28, 4.9), roof, "residential-building-flat-roof");
  roofSlab.position.y = 9.22;
  group.add(foundation, leftWing, rightWing, stairwellBack, stairwellLeftJamb, stairwellRightJamb, roofSlab);

  const doorPivot = new THREE.Group();
  doorPivot.name = "residential-building-door-pivot";
  doorPivot.position.set(-0.59, 0.52, 2.4);
  const entrance = mesh(new THREE.BoxGeometry(1.18, 1.78, 0.1), doorMaterial, "residential-building-entrance");
  entrance.position.set(0.59, 0.89, 0);
  const doorGlass = mesh(new THREE.BoxGeometry(0.62, 0.68, 0.035), glass, "residential-building-entrance-door-glass");
  doorGlass.position.set(0.59, 1.08, 0.066);
  const doorHandle = mesh(new THREE.BoxGeometry(0.06, 0.36, 0.08), trim, "residential-building-entrance-door-handle");
  doorHandle.position.set(0.99, 0.86, 0.1);
  doorPivot.add(entrance, doorGlass, doorHandle);
  for (const x of [-0.71, 0.71]) {
    const sidelight = mesh(new THREE.BoxGeometry(0.2, 1.78, 0.06), stairwellGlass, "residential-building-entrance-sidelight");
    sidelight.position.set(x, 1.41, 2.39);
    group.add(sidelight);
  }
  const entranceFrame = mesh(new THREE.BoxGeometry(1.65, 0.16, 0.28), trim, "residential-building-entrance-frame");
  entranceFrame.position.set(0, 2.45, 2.42);
  const canopy = mesh(new THREE.BoxGeometry(2.25, 0.18, 1.12), roof, "residential-building-entrance-canopy");
  canopy.position.set(0, 2.72, 2.77);
  const entranceLamp = mesh(new THREE.BoxGeometry(0.78, 0.1, 0.32), entranceLightMaterial, "residential-building-entrance-lamp");
  entranceLamp.position.set(0, 2.56, 2.91);
  const entranceLight = new THREE.PointLight(0xffbd6d, 0, 8.5, 1.9);
  entranceLight.name = "residential-building-night-light";
  entranceLight.position.set(0, 2.42, 3.16);
  const step = mesh(new THREE.BoxGeometry(2.4, 0.22, 0.85), balcony, "residential-building-entry-step");
  step.position.set(0, 0.39, 2.66);
  group.add(doorPivot, entranceFrame, canopy, entranceLamp, entranceLight, step);

  const stairwellGlazing = mesh(new THREE.BoxGeometry(1.54, 6.34, 0.06), stairwellGlass, "residential-building-stairwell-glazing");
  stairwellGlazing.position.set(0, 5.75, 2.34);
  group.add(stairwellGlazing);
  for (const y of [2.58, 3.76, 5.38, 7, 8.9]) {
    const mullion = mesh(new THREE.BoxGeometry(1.68, 0.1, 0.1), dark, "residential-building-stairwell-mullion");
    mullion.position.set(0, y, 2.39);
    group.add(mullion);
  }

  const floorLevels = Array.from({ length: 5 }, (_, floor) => 0.52 + floor * 1.62);
  const climbPath: THREE.Vector3[] = [new THREE.Vector3(-0.46, floorLevels[0], 1.78)];
  const addLanding = (y: number, z: number, name = "residential-building-stair-landing") => {
    const landing = mesh(new THREE.BoxGeometry(1.82, 0.14, 0.68), stairMaterial, name);
    landing.position.set(0, y - 0.07, z);
    group.add(landing);
  };
  floorLevels.forEach((level) => addLanding(level, 1.78, "residential-building-floor-platform"));

  for (const level of floorLevels) {
    for (const side of [-1, 1]) {
      const apartmentDoor = mesh(new THREE.BoxGeometry(0.72, 1.24, 0.06), doorMaterial, "residential-building-floor-door");
      apartmentDoor.rotation.y = Math.PI * 0.5;
      apartmentDoor.position.set(side, level + 0.62, 1.63);
      const apartmentHandle = mesh(new THREE.BoxGeometry(0.07, 0.08, 0.08), trim, "residential-building-floor-door-handle");
      apartmentHandle.position.set(side * 0.96, level + 0.64, 1.87);
      group.add(apartmentDoor, apartmentHandle);
    }
  }

  const stepsPerFlight = 8;
  const flightRun = 2.78;
  const frontZ = 1.72;
  const rearZ = frontZ - flightRun;
  for (let storey = 0; storey < floorLevels.length - 1; storey += 1) {
    const baseY = floorLevels[storey];
    const nextY = floorLevels[storey + 1];
    const halfRise = (nextY - baseY) * 0.5;
    const firstX = storey % 2 === 0 ? -0.46 : 0.46;
    const secondX = -firstX;
    const firstFlightPath: THREE.Vector3[] = [];
    const secondFlightPath: THREE.Vector3[] = [];
    for (let index = 0; index < stepsPerFlight; index += 1) {
      const progress = (index + 1) / stepsPerFlight;
      const firstTop = baseY + halfRise * progress;
      const firstStep = mesh(
        new THREE.BoxGeometry(0.78, halfRise / stepsPerFlight, flightRun / stepsPerFlight + 0.03),
        stairMaterial,
        "residential-building-stair-step",
      );
      firstStep.position.set(firstX, firstTop - halfRise / stepsPerFlight * 0.5, frontZ - flightRun * (index + 0.5) / stepsPerFlight);
      const secondTop = baseY + halfRise + halfRise * progress;
      const secondStep = mesh(
        new THREE.BoxGeometry(0.78, halfRise / stepsPerFlight, flightRun / stepsPerFlight + 0.03),
        stairMaterial,
        "residential-building-stair-step",
      );
      secondStep.position.set(secondX, secondTop - halfRise / stepsPerFlight * 0.5, rearZ + flightRun * (index + 0.5) / stepsPerFlight);
      group.add(firstStep, secondStep);
      firstFlightPath.push(firstStep.position.clone().setY(firstTop));
      secondFlightPath.push(secondStep.position.clone().setY(secondTop));
    }
    addLanding(baseY + halfRise, rearZ, "residential-building-stair-landing");
    climbPath.push(
      ...firstFlightPath,
      new THREE.Vector3(firstX, baseY + halfRise, rearZ),
      ...secondFlightPath,
      new THREE.Vector3(secondX, nextY, frontZ),
    );

    const railY = baseY + 0.72;
    const outerX = firstX + Math.sign(firstX) * 0.42;
    const returnOuterX = secondX + Math.sign(secondX) * 0.42;
    group.add(
      beamBetween(new THREE.Vector3(outerX, railY, frontZ), new THREE.Vector3(outerX, railY + halfRise, rearZ), 0.035, 0.035, dark, "residential-building-stair-handrail"),
      beamBetween(new THREE.Vector3(returnOuterX, railY + halfRise, rearZ), new THREE.Vector3(returnOuterX, railY + halfRise * 2, frontZ), 0.035, 0.035, dark, "residential-building-stair-handrail"),
    );
  }

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
        const balconyRail = mesh(new THREE.BoxGeometry(2.05, 0.58, 0.1), dark, "residential-building-balcony-rail");
        balconyRail.position.set(x, y - 0.32, 3.08);
        group.add(balconyFloor, balconyRail);
        for (const side of [-1, 1]) {
          const sideRail = mesh(new THREE.BoxGeometry(0.1, 0.58, 0.72), dark, "residential-building-balcony-side-rail");
          sideRail.position.set(x + side * 0.975, y - 0.32, 2.72);
          group.add(sideRail);
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
    floorLevels,
    climbPath,
    setDoorOpen(open: boolean) {
      doorPivot.rotation.y = open ? -1.12 : 0;
    },
    setPowered(powered: boolean) {
      glass.color.setHex(powered ? 0xffcf82 : 0x78a9b7);
      glass.emissive.setHex(powered ? 0xffa63d : 0x193845);
      glass.emissiveIntensity = powered ? 2.65 : 0.08;
      stairwellGlass.emissive.setHex(powered ? 0xffa63d : 0x18343c);
      stairwellGlass.emissiveIntensity = powered ? 1.3 : 0.06;
      entranceLightMaterial.emissiveIntensity = powered ? 3.6 : 0.14;
      entranceLight.intensity = powered ? 4.2 : 0;
    },
  };
  group.userData.setDoorOpen(false);
  group.userData.setPowered(false);
  return group;
}

export function buildLowPolyHighRiseResidential(): HighRiseResidentialModel {
  const group = new THREE.Group() as HighRiseResidentialModel;
  group.name = "city-high-rise-residential-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd8cbb5, roughness: 0.9 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9d6250, roughness: 0.94 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x394448, roughness: 0.7, metalness: 0.2 });
  const stairMaterial = new THREE.MeshStandardMaterial({ color: 0xb9afa0, roughness: 0.92 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x3e5256, roughness: 0.62, metalness: 0.16 });
  const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0x909b9d, roughness: 0.42, metalness: 0.52 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0xc9b897, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x78a9b7,
    emissive: 0x193845,
    emissiveIntensity: 0.08,
    roughness: 0.28,
    metalness: 0.08,
  });
  const coreGlass = new THREE.MeshStandardMaterial({
    color: 0x6f9ba7,
    emissive: 0x18343c,
    emissiveIntensity: 0.06,
    roughness: 0.24,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const warmLight = new THREE.MeshStandardMaterial({
    color: 0xffe4ad,
    emissive: 0xffa43b,
    emissiveIntensity: 0.14,
    roughness: 0.34,
  });

  const floorCount = 18;
  const floorPitch = 1.78;
  const floorLevels = Array.from({ length: floorCount }, (_, floor) => 0.5 + floor * floorPitch);
  const bodyBottom = 0.4;
  const bodyTop = floorLevels.at(-1)! + 1.56;
  const bodyHeight = bodyTop - bodyBottom;
  const bodyCenterY = bodyBottom + bodyHeight * 0.5;
  const buildingWidth = 12.2;
  const buildingDepth = 8.2;

  const foundation = mesh(new THREE.BoxGeometry(13, 0.4, 9), dark, "high-rise-foundation");
  foundation.position.y = 0.2;
  const rearWall = mesh(new THREE.BoxGeometry(buildingWidth, bodyHeight, 0.2), concrete, "high-rise-rear-wall");
  rearWall.position.set(0, bodyCenterY, -buildingDepth * 0.5);
  const leftWall = mesh(new THREE.BoxGeometry(0.2, bodyHeight, buildingDepth), concrete, "high-rise-side-wall");
  leftWall.position.set(-buildingWidth * 0.5, bodyCenterY, 0);
  const rightWall = leftWall.clone();
  rightWall.position.x = buildingWidth * 0.5;
  group.add(foundation, rearWall, leftWall, rightWall);
  cutawayShell.push(rightWall);

  for (const level of floorLevels) {
    const slab = mesh(new THREE.BoxGeometry(11.8, 0.14, 7.8), stairMaterial, "high-rise-floor-slab");
    slab.position.set(0, level - 0.07, 0);
    group.add(slab);

    const spandrel = mesh(new THREE.BoxGeometry(buildingWidth, 0.3, 0.2), concrete, "high-rise-front-spandrel");
    spandrel.position.set(0, level + 0.15, buildingDepth * 0.5);
    group.add(spandrel);
    cutawayShell.push(spandrel);
  }

  for (const x of [-5.94, -1.52, 1.52, 5.94]) {
    const pier = mesh(new THREE.BoxGeometry(0.32, bodyHeight, 0.24), x === -1.52 || x === 1.52 ? brick : concrete, "high-rise-front-pier");
    pier.position.set(x, bodyCenterY, buildingDepth * 0.5 + 0.01);
    group.add(pier);
    cutawayShell.push(pier);
  }

  const windowGeometry = new THREE.BoxGeometry(0.92, 1.02, 0.08);
  const sillGeometry = new THREE.BoxGeometry(1.08, 0.09, 0.17);
  for (let floor = 0; floor < floorCount; floor += 1) {
    const level = floorLevels[floor];
    const windowY = level + 0.9;
    for (const x of [-5.25, -4.15, -2.75, 2.75, 4.15, 5.25]) {
      const window = mesh(windowGeometry, glass, "high-rise-window");
      window.position.set(x, windowY, buildingDepth * 0.5 + 0.12);
      const sill = mesh(sillGeometry, trim, "high-rise-window-sill");
      sill.position.set(x, windowY - 0.565, buildingDepth * 0.5 + 0.17);
      group.add(window, sill);
      cutawayShell.push(window, sill);
    }

    if (floor > 0) {
      for (const x of [-3.95, 3.95]) {
        const balconyFloor = mesh(new THREE.BoxGeometry(3.0, 0.16, 0.9), trim, "high-rise-balcony-floor");
        balconyFloor.position.set(x, level + 0.08, 4.47);
        const balconyRail = mesh(new THREE.BoxGeometry(3.0, 0.64, 0.1), dark, "high-rise-balcony-rail");
        balconyRail.position.set(x, level + 0.48, 4.87);
        group.add(balconyFloor, balconyRail);
        cutawayShell.push(balconyFloor, balconyRail);
        for (const side of [-1, 1]) {
          const sideRail = mesh(new THREE.BoxGeometry(0.1, 0.64, 0.8), dark, "high-rise-balcony-side-rail");
          sideRail.position.set(x + side * 1.45, level + 0.48, 4.47);
          group.add(sideRail);
          cutawayShell.push(sideRail);
        }
      }
    }

    for (const x of [-3.0, -2.05, 2.05, 3.0]) {
      const apartmentDoor = mesh(new THREE.BoxGeometry(0.72, 1.32, 0.06), doorMaterial, "high-rise-apartment-door");
      apartmentDoor.position.set(x, level + 0.66, 1.58);
      const handle = mesh(new THREE.BoxGeometry(0.055, 0.12, 0.08), trim, "high-rise-apartment-door-handle");
      handle.position.set(x + 0.24, level + 0.66, 1.64);
      group.add(apartmentDoor, handle);
    }
  }

  const elevatorCoreHeight = bodyHeight - 0.25;
  const elevatorCoreBack = mesh(new THREE.BoxGeometry(3.0, elevatorCoreHeight, 0.16), dark, "high-rise-elevator-core-back");
  elevatorCoreBack.position.set(0, bodyCenterY, -0.25);
  const elevatorCoreGlazing = mesh(new THREE.BoxGeometry(2.84, elevatorCoreHeight, 0.08), coreGlass, "high-rise-elevator-core-glazing");
  elevatorCoreGlazing.position.set(0, bodyCenterY, 2.22);
  group.add(elevatorCoreBack, elevatorCoreGlazing);
  cutawayShell.push(elevatorCoreGlazing);
  for (const x of [-1.48, 0, 1.48]) {
    const frame = mesh(new THREE.BoxGeometry(0.12, elevatorCoreHeight, 0.16), dark, "high-rise-elevator-core-frame");
    frame.position.set(x, bodyCenterY, 2.25);
    group.add(frame);
    cutawayShell.push(frame);
  }

  for (let floor = 0; floor < floorCount; floor += 1) {
    const level = floorLevels[floor];
    for (const x of [-0.72, 0.72]) {
      const elevatorDoor = mesh(new THREE.BoxGeometry(1.05, 1.34, 0.06), elevatorMaterial, "high-rise-elevator-door");
      elevatorDoor.position.set(x, level + 0.67, 2.17);
      const seam = mesh(new THREE.BoxGeometry(0.025, 1.28, 0.025), dark, "high-rise-elevator-door-seam");
      seam.position.set(x, level + 0.67, 2.215);
      const floorIndicator = mesh(new THREE.BoxGeometry(0.22, 0.18, 0.035), warmLight, "high-rise-elevator-floor-indicator");
      floorIndicator.position.set(x, level + 1.48, 2.22);
      group.add(elevatorDoor, seam, floorIndicator);
      cutawayShell.push(elevatorDoor, seam);
    }
  }

  const elevatorCabins: THREE.Group[] = [];
  for (const [index, x] of [-0.72, 0.72].entries()) {
    const cabin = new THREE.Group();
    cabin.name = "high-rise-elevator-cabin";
    cabin.userData.elevatorIndex = index;
    const cabinBack = mesh(new THREE.BoxGeometry(1.02, 1.42, 0.08), cabinMaterial, "high-rise-elevator-cabin-back");
    cabinBack.position.set(0, 0.72, -0.78);
    const cabinFloor = mesh(new THREE.BoxGeometry(1.02, 0.1, 1.45), elevatorMaterial, "high-rise-elevator-cabin-floor");
    cabinFloor.position.set(0, 0.05, -0.08);
    const cabinRoof = mesh(new THREE.BoxGeometry(1.02, 0.1, 1.45), elevatorMaterial, "high-rise-elevator-cabin-roof");
    cabinRoof.position.set(0, 1.45, -0.08);
    for (const side of [-1, 1]) {
      const cabinSide = mesh(new THREE.BoxGeometry(0.06, 1.4, 1.45), cabinMaterial, "high-rise-elevator-cabin-side");
      cabinSide.position.set(side * 0.49, 0.72, -0.08);
      cabin.add(cabinSide);
    }
    const cabinLamp = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.42), warmLight, "high-rise-elevator-cabin-lamp");
    cabinLamp.position.set(0, 1.38, -0.05);
    cabin.add(cabinBack, cabinFloor, cabinRoof, cabinLamp);
    cabin.position.set(x, floorLevels[index === 0 ? 3 : 12], 1.25);
    group.add(cabin);
    elevatorCabins.push(cabin);
  }

  const stairDivider = mesh(new THREE.BoxGeometry(0.14, elevatorCoreHeight, 4.45), brick, "high-rise-emergency-stair-divider");
  stairDivider.position.set(3.72, bodyCenterY, -0.2);
  group.add(stairDivider);
  const emergencyStair = new THREE.Group();
  emergencyStair.name = "high-rise-emergency-stair";
  const stepsPerFlight = 6;
  const flightRun = 2.7;
  const frontZ = 1.42;
  const rearZ = frontZ - flightRun;
  for (let storey = 0; storey < floorCount - 1; storey += 1) {
    const baseY = floorLevels[storey];
    const nextY = floorLevels[storey + 1];
    const halfRise = (nextY - baseY) * 0.5;
    for (let index = 0; index < stepsPerFlight; index += 1) {
      const progress = (index + 1) / stepsPerFlight;
      const firstTop = baseY + halfRise * progress;
      const firstStep = mesh(new THREE.BoxGeometry(0.78, halfRise / stepsPerFlight, flightRun / stepsPerFlight + 0.03), stairMaterial, "high-rise-emergency-stair-step");
      firstStep.position.set(4.35, firstTop - halfRise / stepsPerFlight * 0.5, frontZ - flightRun * (index + 0.5) / stepsPerFlight);
      const secondTop = baseY + halfRise + halfRise * progress;
      const secondStep = mesh(new THREE.BoxGeometry(0.78, halfRise / stepsPerFlight, flightRun / stepsPerFlight + 0.03), stairMaterial, "high-rise-emergency-stair-step");
      secondStep.position.set(5.18, secondTop - halfRise / stepsPerFlight * 0.5, rearZ + flightRun * (index + 0.5) / stepsPerFlight);
      emergencyStair.add(firstStep, secondStep);
    }
    const landing = mesh(new THREE.BoxGeometry(1.72, 0.14, 0.62), stairMaterial, "high-rise-emergency-stair-landing");
    landing.position.set(4.765, baseY + halfRise - 0.07, rearZ);
    emergencyStair.add(landing);
    emergencyStair.add(
      beamBetween(new THREE.Vector3(3.9, baseY + 0.68, frontZ), new THREE.Vector3(3.9, baseY + halfRise + 0.68, rearZ), 0.03, 0.03, dark, "high-rise-emergency-stair-handrail"),
      beamBetween(new THREE.Vector3(5.62, baseY + halfRise + 0.68, rearZ), new THREE.Vector3(5.62, nextY + 0.68, frontZ), 0.03, 0.03, dark, "high-rise-emergency-stair-handrail"),
    );
  }
  group.add(emergencyStair);

  for (let floor = 0; floor < floorCount; floor += 1) {
    const level = floorLevels[floor];
    const fireDoor = mesh(new THREE.BoxGeometry(0.06, 1.32, 0.74), doorMaterial, "high-rise-emergency-fire-door");
    fireDoor.position.set(3.64, level + 0.66, 1.24);
    const exitSign = mesh(new THREE.BoxGeometry(0.04, 0.22, 0.42), warmLight, "high-rise-emergency-exit-sign");
    exitSign.position.set(3.59, level + 1.48, 1.24);
    group.add(fireDoor, exitSign);
  }

  const entranceCanopy = mesh(new THREE.BoxGeometry(3.7, 0.2, 1.45), dark, "high-rise-entrance-canopy");
  entranceCanopy.position.set(0, 2.82, 4.68);
  const entranceHeader = mesh(new THREE.BoxGeometry(3.4, 0.55, 0.22), brick, "high-rise-entrance-header");
  entranceHeader.position.set(0, 2.38, 4.13);
  group.add(entranceCanopy, entranceHeader);
  cutawayShell.push(entranceCanopy, entranceHeader);
  for (const x of [-0.78, 0.78]) {
    const entranceDoor = mesh(new THREE.BoxGeometry(1.42, 1.9, 0.08), coreGlass, "high-rise-entrance-door");
    entranceDoor.position.set(x, 1.35, 4.24);
    const handle = mesh(new THREE.BoxGeometry(0.055, 0.42, 0.08), trim, "high-rise-entrance-door-handle");
    handle.position.set(x + Math.sign(x) * 0.46, 1.3, 4.31);
    group.add(entranceDoor, handle);
    cutawayShell.push(entranceDoor, handle);
  }
  const entranceLamp = new THREE.PointLight(0xffbd6d, 0, 10, 1.9);
  entranceLamp.name = "high-rise-night-light";
  entranceLamp.position.set(0, 2.62, 4.92);
  group.add(entranceLamp);

  const roofSlab = mesh(new THREE.BoxGeometry(12.45, 0.24, 8.45), dark, "high-rise-flat-roof");
  roofSlab.position.set(0, bodyTop + 0.12, 0);
  const machineRoom = mesh(new THREE.BoxGeometry(3.5, 1.3, 3.0), brick, "high-rise-elevator-machine-room");
  machineRoom.position.set(0, bodyTop + 0.89, -0.1);
  const waterTank = mesh(new THREE.CylinderGeometry(0.68, 0.74, 1.2, 8), dark, "high-rise-roof-water-tank");
  waterTank.position.set(-3.8, bodyTop + 0.74, -1.2);
  const antenna = mesh(new THREE.CylinderGeometry(0.045, 0.07, 2.2, 8), elevatorMaterial, "high-rise-roof-antenna");
  antenna.position.set(2.3, bodyTop + 1.3, -0.6);
  group.add(roofSlab, machineRoom, waterTank, antenna);
  cutawayShell.push(roofSlab, machineRoom, waterTank, antenna);

  group.userData = {
    modelType: "high-rise-residential",
    generatedLocally: true,
    floorCount,
    apartmentCount: floorCount * 4,
    elevatorCount: 2,
    emergencyStairCount: 1,
    floorLevels,
    elevatorFloors: [4, 13],
    setElevatorFloors(floors: [number, number]) {
      const normalized = floors.map((floor) => THREE.MathUtils.clamp(Math.round(floor), 1, floorCount));
      elevatorCabins.forEach((cabin, index) => {
        cabin.position.y = floorLevels[normalized[index] - 1];
      });
      group.userData.elevatorFloors = normalized;
    },
    setInteriorCutaway(cutaway: boolean) {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered(powered: boolean) {
      glass.color.setHex(powered ? 0xffcf82 : 0x78a9b7);
      glass.emissive.setHex(powered ? 0xffa63d : 0x193845);
      glass.emissiveIntensity = powered ? 2.5 : 0.08;
      coreGlass.emissive.setHex(powered ? 0xffa63d : 0x18343c);
      coreGlass.emissiveIntensity = powered ? 1.45 : 0.06;
      warmLight.emissiveIntensity = powered ? 3.5 : 0.14;
      entranceLamp.intensity = powered ? 4.6 : 0;
    },
  };
  group.userData.setElevatorFloors([4, 13]);
  group.userData.setInteriorCutaway(false);
  group.userData.setPowered(false);
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
  const cutawayShell: THREE.Object3D[] = [];
  const plaster = new THREE.MeshStandardMaterial({ color: 0xeadfc5, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a8c78, roughness: 0.96 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x684534, roughness: 0.88 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8f4437, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x75a7b5,
    emissive: 0x193744,
    emissiveIntensity: 0.08,
    roughness: 0.3,
    metalness: 0.06,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const porchLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe4ad,
    emissive: 0xffa43b,
    emissiveIntensity: 0.14,
    roughness: 0.34,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x354043, roughness: 0.75, metalness: 0.18 });
  const green = new THREE.MeshStandardMaterial({ color: 0x416c44, roughness: 0.94 });
  const interiorWall = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.9, side: THREE.DoubleSide });
  const woodFloor = new THREE.MeshStandardMaterial({ color: 0x9b704b, roughness: 0.84 });
  const sofaFabric = new THREE.MeshStandardMaterial({ color: 0x476d70, roughness: 0.92 });
  const cushionMaterial = new THREE.MeshStandardMaterial({ color: 0xd9b86c, roughness: 0.9 });
  const kitchenMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d5c9, roughness: 0.72 });
  const counterMaterial = new THREE.MeshStandardMaterial({ color: 0x5c625f, roughness: 0.62, metalness: 0.12 });
  const applianceMaterial = new THREE.MeshStandardMaterial({ color: 0xb9c0bd, roughness: 0.5, metalness: 0.35 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xf1f2ed, roughness: 0.45 });
  const bedding = new THREE.MeshStandardMaterial({ color: 0xb87569, roughness: 0.94 });
  const showerGlass = new THREE.MeshStandardMaterial({
    color: 0x9fc5cb,
    roughness: 0.18,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const foundation = mesh(new THREE.BoxGeometry(8.3, 0.3, 6.65), stone, "small-villa-foundation");
  foundation.position.y = 0.15;
  const groundFloor = mesh(new THREE.BoxGeometry(7.62, 0.18, 6.02), woodFloor, "small-villa-ground-floor");
  groundFloor.position.y = 0.39;
  const firstRearWall = mesh(new THREE.BoxGeometry(7.8, 2.64, 0.18), plaster, "small-villa-first-floor-rear-wall");
  firstRearWall.position.set(0, 1.8, -3.01);
  group.add(foundation, groundFloor, firstRearWall);
  for (const side of [-1, 1]) {
    const sideWall = mesh(new THREE.BoxGeometry(0.18, 2.64, 6.02), plaster, "small-villa-first-floor-side-wall");
    sideWall.position.set(side * 3.81, 1.8, 0);
    group.add(sideWall);
    if (side === 1) cutawayShell.push(sideWall);
  }

  const frontWallSegments = [
    [-3.1, 1.4], [-0.325, 1.75], [3.375, 0.85],
  ] as const;
  frontWallSegments.forEach(([x, width]) => {
    const segment = mesh(new THREE.BoxGeometry(width, 2.64, 0.18), plaster, "small-villa-first-floor-front-wall");
    segment.position.set(x, 1.8, 3.01);
    group.add(segment);
    cutawayShell.push(segment);
  });
  const windowBreast = mesh(new THREE.BoxGeometry(2.4, 0.58, 0.18), plaster, "small-villa-front-window-breast");
  windowBreast.position.set(1.75, 0.77, 3.01);
  const windowHeader = mesh(new THREE.BoxGeometry(2.4, 0.84, 0.18), plaster, "small-villa-front-window-header");
  windowHeader.position.set(1.75, 2.68, 3.01);
  const doorHeader = mesh(new THREE.BoxGeometry(1.2, 0.56, 0.18), plaster, "small-villa-front-door-header");
  doorHeader.position.set(-1.8, 2.82, 3.01);
  group.add(windowBreast, windowHeader, doorHeader);
  cutawayShell.push(windowBreast, windowHeader, doorHeader);

  const secondFloorPieces = [
    [0.725, 6.05, 0, 6.02],
    [-3.025, 1.45, 2.62, 0.78],
    [-3.025, 1.45, -2.57, 0.88],
  ] as const;
  secondFloorPieces.forEach(([x, width, z, depth]) => {
    const floorPiece = mesh(new THREE.BoxGeometry(width, 0.18, depth), woodFloor, "small-villa-second-floor-slab");
    floorPiece.position.set(x, 3.16, z);
    group.add(floorPiece);
  });
  const upstairsLanding = mesh(new THREE.BoxGeometry(1.45, 0.18, 0.52), woodFloor, "small-villa-upstairs-landing");
  upstairsLanding.position.set(-3.025, 3.16, 1.97);
  const upstairsHallway = mesh(new THREE.BoxGeometry(2.4, 0.035, 0.72), sofaFabric, "small-villa-upstairs-hallway");
  upstairsHallway.position.set(-1.72, 3.2675, 1.72);
  group.add(upstairsLanding, upstairsHallway);
  const secondRearWall = mesh(new THREE.BoxGeometry(7.8, 2.2, 0.18), plaster, "small-villa-second-floor-rear-wall");
  secondRearWall.position.set(0, 4.35, -3.01);
  group.add(secondRearWall);
  for (const [x, width] of [[-3.37, 1.06], [-0.9, 1.52], [1.35, 0.62], [3.37, 1.06]] as const) {
    const frontPier = mesh(new THREE.BoxGeometry(width, 2.2, 0.18), plaster, "small-villa-second-floor-front-wall");
    frontPier.position.set(x, 4.35, 3.01);
    group.add(frontPier);
    cutawayShell.push(frontPier);
  }
  for (const x of [-2.25, 0.45, 2.25]) {
    const breast = mesh(new THREE.BoxGeometry(1.18, 0.575, 0.18), plaster, "small-villa-second-window-breast");
    breast.position.set(x, 3.5375, 3.01);
    const header = mesh(new THREE.BoxGeometry(1.18, 0.575, 0.18), plaster, "small-villa-second-window-header");
    header.position.set(x, 5.1625, 3.01);
    group.add(breast, header);
    cutawayShell.push(breast, header);
  }
  for (const side of [-1, 1]) {
    const sideWall = mesh(new THREE.BoxGeometry(0.18, 2.2, 6.02), plaster, "small-villa-second-floor-side-wall");
    sideWall.position.set(side * 3.81, 4.35, 0);
    group.add(sideWall);
    if (side === 1) cutawayShell.push(sideWall);
  }

  const roofWidth = 8.25;
  const roofDepth = 6.75;
  const roofEaveY = 5.5;
  const roofRidgeY = 6.95;
  const roof = mesh(createGableRoofGeometry(roofWidth, roofDepth, roofEaveY, roofRidgeY), roofMaterial, "small-villa-gable-roof");
  group.add(roof);
  cutawayShell.push(roof);

  const doorPivot = new THREE.Group();
  doorPivot.name = "small-villa-front-door-pivot";
  doorPivot.position.set(-2.4, 0.48, 3.11);
  const door = mesh(new THREE.BoxGeometry(1.18, 2.04, 0.1), timber, "small-villa-front-door");
  door.position.set(0.59, 1.02, 0);
  const doorGlass = mesh(new THREE.BoxGeometry(0.46, 0.72, 0.035), glass, "small-villa-door-glass");
  doorGlass.position.set(0.59, 1.28, 0.066);
  const doorHandle = mesh(new THREE.BoxGeometry(0.07, 0.34, 0.08), stone, "small-villa-door-handle");
  doorHandle.position.set(1.0, 0.96, 0.1);
  doorPivot.add(door, doorGlass, doorHandle);
  const porchRoof = mesh(new THREE.BoxGeometry(2.7, 0.18, 1.45), roofMaterial, "small-villa-porch-roof");
  porchRoof.position.set(-1.8, 2.9, 3.46);
  const porchStep = mesh(new THREE.BoxGeometry(2.9, 0.24, 1.2), stone, "small-villa-porch-step");
  porchStep.position.set(-1.8, 0.4, 3.45);
  const approachStepMiddle = mesh(new THREE.BoxGeometry(2.42, 0.2, 0.56), stone, "small-villa-approach-step");
  approachStepMiddle.position.set(-1.8, 0.2, 4.15);
  const approachStepGround = mesh(new THREE.BoxGeometry(1.98, 0.12, 0.56), stone, "small-villa-approach-step");
  approachStepGround.position.set(-1.8, 0.06, 4.48);
  const porchLamp = mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), porchLightMaterial, "small-villa-porch-lamp");
  porchLamp.position.set(-1.8, 2.63, 3.82);
  const porchLight = new THREE.PointLight(0xffbd68, 0, 8.5, 1.85);
  porchLight.name = "small-villa-night-light";
  porchLight.position.set(-1.8, 2.42, 3.94);
  group.add(doorPivot, porchRoof, porchLamp, porchLight, porchStep, approachStepMiddle, approachStepGround);
  cutawayShell.push(doorPivot, porchRoof, porchLamp, porchLight);
  for (const x of [-2.75, -0.85]) {
    const post = mesh(new THREE.BoxGeometry(0.16, 2.42, 0.16), timber, "small-villa-porch-post");
    post.position.set(x, 1.66, 3.87);
    group.add(post);
    cutawayShell.push(post);
  }

  const windowGeometry = new THREE.BoxGeometry(1.18, 1.05, 0.06);
  const frontWindows = [
    [1.15, 1.65], [2.35, 1.65], [-2.25, 4.35], [0.45, 4.35], [2.25, 4.35],
  ] as const;
  frontWindows.forEach(([x, y]) => {
    const window = mesh(windowGeometry, glass, "small-villa-window");
    window.position.set(x, y, 3.12);
    const sill = mesh(new THREE.BoxGeometry(1.38, 0.1, 0.18), stone, "small-villa-window-sill");
    sill.position.set(x, y - 0.58, window.position.z + 0.06);
    group.add(window, sill);
    cutawayShell.push(window, sill);
  });
  for (const side of [-1, 1]) {
    const sideWindow = mesh(windowGeometry, glass, "small-villa-side-window");
    sideWindow.rotation.y = Math.PI * 0.5;
    sideWindow.position.set(side * 3.92, 1.7, -0.45);
    group.add(sideWindow);
    if (side === 1) cutawayShell.push(sideWindow);
  }

  const livingRoom = new THREE.Group();
  livingRoom.name = "small-villa-living-room";
  const sofaBase = mesh(new THREE.BoxGeometry(2.1, 0.34, 0.82), sofaFabric, "small-villa-sofa");
  sofaBase.position.set(1.65, 0.66, 1.7);
  const sofaBack = mesh(new THREE.BoxGeometry(2.1, 0.72, 0.18), sofaFabric, "small-villa-sofa-back");
  sofaBack.position.set(1.65, 1.0, 2.02);
  livingRoom.add(sofaBase, sofaBack);
  for (const x of [0.98, 1.65, 2.32]) {
    const cushion = mesh(new THREE.BoxGeometry(0.58, 0.16, 0.52), cushionMaterial, "small-villa-sofa-cushion");
    cushion.position.set(x, 0.91, 1.64);
    livingRoom.add(cushion);
  }
  const coffeeTable = mesh(new THREE.BoxGeometry(1.4, 0.12, 0.68), timber, "small-villa-coffee-table");
  coffeeTable.position.set(1.65, 0.76, 0.62);
  livingRoom.add(coffeeTable);
  for (const x of [1.05, 2.25]) {
    for (const z of [0.38, 0.86]) {
      const leg = mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), dark, "small-villa-coffee-table-leg");
      leg.position.set(x, 0.54, z);
      livingRoom.add(leg);
    }
  }
  const tvStand = mesh(new THREE.BoxGeometry(2.0, 0.42, 0.45), timber, "small-villa-tv-stand");
  tvStand.position.set(1.65, 0.69, -0.15);
  const tv = mesh(new THREE.BoxGeometry(1.65, 0.94, 0.09), dark, "small-villa-television");
  tv.position.set(1.65, 1.38, -0.34);
  const tvScreen = mesh(new THREE.BoxGeometry(1.48, 0.78, 0.025), glass, "small-villa-television-screen");
  tvScreen.position.set(1.65, 1.38, -0.397);
  livingRoom.add(tvStand, tv, tvScreen);
  group.add(livingRoom);

  const diningKitchen = new THREE.Group();
  diningKitchen.name = "small-villa-dining-kitchen";
  const counter = mesh(new THREE.BoxGeometry(2.65, 0.86, 0.62), kitchenMaterial, "small-villa-kitchen-counter");
  counter.position.set(1.08, 0.91, -2.58);
  const counterTop = mesh(new THREE.BoxGeometry(2.75, 0.1, 0.7), counterMaterial, "small-villa-kitchen-countertop");
  counterTop.position.set(1.08, 1.39, -2.58);
  const stove = mesh(new THREE.BoxGeometry(0.72, 0.08, 0.56), dark, "small-villa-stove");
  stove.position.set(1.78, 1.47, -2.56);
  diningKitchen.add(counter, counterTop, stove);
  for (const x of [1.54, 1.78, 2.02, 2.26]) {
    const burner = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 8), applianceMaterial, "small-villa-stove-burner");
    burner.position.set(x, 1.525, -2.56 + (Math.round(x * 10) % 2) * 0.24 - 0.12);
    diningKitchen.add(burner);
  }
  const fridge = mesh(new THREE.BoxGeometry(0.78, 1.95, 0.72), applianceMaterial, "small-villa-refrigerator");
  fridge.position.set(3.1, 1.46, -2.53);
  const fridgeHandle = mesh(new THREE.BoxGeometry(0.05, 0.58, 0.08), dark, "small-villa-refrigerator-handle");
  fridgeHandle.position.set(2.83, 1.55, -2.13);
  diningKitchen.add(fridge, fridgeHandle);
  const diningTable = mesh(new THREE.BoxGeometry(1.55, 0.14, 1.05), timber, "small-villa-dining-table");
  diningTable.position.set(-0.45, 1.02, -1.45);
  diningKitchen.add(diningTable);
  for (const [x, z, rotation] of [[-1.42, -1.45, 0], [0.52, -1.45, 0], [-0.45, -2.2, Math.PI * 0.5], [-0.45, -0.7, Math.PI * 0.5]] as const) {
    const chair = mesh(new THREE.BoxGeometry(0.48, 0.62, 0.48), sofaFabric, "small-villa-dining-chair");
    chair.position.set(x, 0.76, z);
    chair.rotation.y = rotation;
    diningKitchen.add(chair);
  }
  group.add(diningKitchen);

  const staircase = new THREE.Group();
  staircase.name = "small-villa-staircase";
  const stairStartY = 0.48;
  const stairTopY = 3.25;
  const stairCount = 12;
  const stairRun = 3.65;
  for (let index = 0; index < stairCount; index += 1) {
    const topY = stairStartY + (stairTopY - stairStartY) * (index + 1) / stairCount;
    const stair = mesh(new THREE.BoxGeometry(0.92, 0.16, stairRun / stairCount + 0.025), stone, "small-villa-stair-step");
    stair.position.set(-3.0, topY - 0.08, -1.78 + stairRun * (index + 0.5) / stairCount);
    staircase.add(stair);
  }
  staircase.add(beamBetween(
    new THREE.Vector3(-2.5, 1.2, -1.75),
    new THREE.Vector3(-2.5, 3.85, 1.75),
    0.035,
    0.035,
    dark,
    "small-villa-stair-handrail",
  ));
  group.add(staircase);

  const secondFloorInterior = new THREE.Group();
  secondFloorInterior.name = "small-villa-second-floor-interior";
  const bathroomSideWall = mesh(new THREE.BoxGeometry(0.12, 2.05, 2.25), interiorWall, "small-villa-bathroom-side-wall");
  bathroomSideWall.position.set(-1.2, 4.28, -1.775);
  const bathroomFrontLeft = mesh(new THREE.BoxGeometry(1.06, 2.05, 0.12), interiorWall, "small-villa-bathroom-front-wall");
  bathroomFrontLeft.position.set(-3.28, 4.28, -0.65);
  const bathroomFrontRight = mesh(new THREE.BoxGeometry(0.55, 2.05, 0.12), interiorWall, "small-villa-bathroom-front-wall");
  bathroomFrontRight.position.set(-1.475, 4.28, -0.65);
  const bathroomDoorHeader = mesh(new THREE.BoxGeometry(1.0, 0.28, 0.12), interiorWall, "small-villa-bathroom-door-header");
  bathroomDoorHeader.position.set(-2.25, 5.165, -0.65);
  secondFloorInterior.add(bathroomSideWall, bathroomFrontLeft, bathroomFrontRight, bathroomDoorHeader);
  cutawayShell.push(bathroomSideWall, bathroomFrontLeft, bathroomFrontRight, bathroomDoorHeader);
  const bedFrame = mesh(new THREE.BoxGeometry(2.15, 0.28, 1.62), timber, "small-villa-bed-frame");
  bedFrame.position.set(1.75, 3.48, -1.0);
  const mattress = mesh(new THREE.BoxGeometry(2.02, 0.25, 1.5), bedding, "small-villa-bed");
  mattress.position.set(1.75, 3.73, -0.94);
  const headboard = mesh(new THREE.BoxGeometry(2.15, 0.92, 0.14), timber, "small-villa-bed-headboard");
  headboard.position.set(1.75, 3.95, -1.75);
  secondFloorInterior.add(bedFrame, mattress, headboard);
  for (const x of [0.4, 3.1]) {
    const nightstand = mesh(new THREE.BoxGeometry(0.52, 0.56, 0.48), timber, "small-villa-nightstand");
    nightstand.position.set(x, 3.52, -1.45);
    secondFloorInterior.add(nightstand);
  }
  const wardrobe = mesh(new THREE.BoxGeometry(0.58, 1.88, 1.45), timber, "small-villa-wardrobe");
  wardrobe.position.set(3.38, 4.2, 1.55);
  secondFloorInterior.add(wardrobe);
  const toiletBase = mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.42, 8), porcelain, "small-villa-toilet");
  toiletBase.position.set(-3.05, 3.48, -2.18);
  const toiletTank = mesh(new THREE.BoxGeometry(0.62, 0.68, 0.28), porcelain, "small-villa-toilet-tank");
  toiletTank.position.set(-3.05, 3.78, -2.52);
  const sink = mesh(new THREE.BoxGeometry(0.72, 0.22, 0.52), porcelain, "small-villa-bathroom-sink");
  sink.position.set(-1.62, 4.05, -2.42);
  const showerTray = mesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), porcelain, "small-villa-shower-tray");
  showerTray.position.set(-2.82, 3.32, -1.17);
  const showerPanel = mesh(new THREE.BoxGeometry(0.06, 1.72, 0.95), showerGlass, "small-villa-shower-screen");
  showerPanel.position.set(-2.29, 4.15, -1.17);
  secondFloorInterior.add(toiletBase, toiletTank, sink, showerTray, showerPanel);
  group.add(secondFloorInterior);

  const terrace = mesh(new THREE.BoxGeometry(3.25, 0.18, 1.02), stone, "small-villa-terrace");
  terrace.position.set(1.55, 3.18, -3.42);
  const terraceRail = mesh(new THREE.BoxGeometry(3.25, 0.62, 0.1), dark, "small-villa-terrace-rail");
  terraceRail.position.set(1.55, 3.54, -3.88);
  group.add(terrace, terraceRail);
  for (const x of [0.05, 0.8, 1.55, 2.3, 3.05]) {
    const railPost = mesh(new THREE.BoxGeometry(0.06, 0.6, 0.08), dark, "small-villa-terrace-post");
    railPost.position.set(x, 3.54, -3.83);
    group.add(railPost);
  }

  const chimneyX = 2.35;
  const chimneyZ = -0.9;
  const chimneyRoofY = roofRidgeY - (roofRidgeY - roofEaveY) * Math.abs(chimneyX) / (roofWidth * 0.5);
  const chimney = mesh(new THREE.BoxGeometry(0.68, 1.42, 0.78), stone, "small-villa-chimney");
  chimney.position.set(chimneyX, chimneyRoofY + 0.65, chimneyZ);
  const chimneyFlashing = mesh(new THREE.BoxGeometry(1.02, 0.14, 1.12), dark, "small-villa-chimney-flashing");
  chimneyFlashing.position.set(chimneyX, chimneyRoofY + 0.04, chimneyZ);
  const chimneyCap = mesh(new THREE.BoxGeometry(0.82, 0.14, 0.92), dark, "small-villa-chimney-cap");
  chimneyCap.position.set(chimneyX, chimneyRoofY + 1.39, chimneyZ);
  group.add(chimney, chimneyFlashing, chimneyCap);
  cutawayShell.push(chimney, chimneyFlashing, chimneyCap);

  for (const x of [-3.25, 3.25]) {
    const planter = mesh(new THREE.BoxGeometry(1.0, 0.46, 0.58), stone, "small-villa-flower-box");
    planter.position.set(x, 0.62, 3.35);
    const shrub = mesh(new THREE.DodecahedronGeometry(0.38, 0), green, "small-villa-shrub");
    shrub.position.set(x, 1.03, 3.35);
    shrub.scale.set(1.1, 0.8, 0.72);
    group.add(planter, shrub);
  }

  group.userData = {
    modelType: "small-villa",
    generatedLocally: true,
    floorCount: 2,
    occupantAnchor: new THREE.Vector3(-1.8, 0.5, 3.52),
    floorLevels: [0.48, 3.25],
    roomAnchors: {
      entrance: new THREE.Vector3(-1.8, 0.5, 2.75),
      livingRoom: new THREE.Vector3(1.65, 0.5, 1.0),
      diningKitchen: new THREE.Vector3(0.35, 0.5, -1.75),
      stairs: new THREE.Vector3(-3.0, 0.5, -1.75),
      bedroom: new THREE.Vector3(1.75, 3.3, -0.8),
      bathroom: new THREE.Vector3(-2.55, 3.3, -1.8),
    },
    setDoorOpen(open: boolean) {
      doorPivot.rotation.y = open ? -1.12 : 0;
    },
    setInteriorCutaway(cutaway: boolean) {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered(powered: boolean) {
      glass.color.setHex(powered ? 0xffd38c : 0x75a7b5);
      glass.emissive.setHex(powered ? 0xffa746 : 0x193744);
      glass.emissiveIntensity = powered ? 2.75 : 0.08;
      porchLightMaterial.emissiveIntensity = powered ? 3.8 : 0.14;
      porchLight.intensity = powered ? 4.4 : 0;
    },
  };
  group.userData.setDoorOpen(false);
  group.userData.setInteriorCutaway(false);
  group.userData.setPowered(false);
  return group;
}
