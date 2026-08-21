import * as THREE from "three";

export type RoadVehicleKind = "taxi" | "sedan" | "suv";

export type DetailedRoadVehicle = THREE.Group & {
  userData: {
    modelType: "detailed-road-vehicle";
    vehicleKind: RoadVehicleKind;
    generatedLocally: true;
    dimensions: THREE.Vector3;
    seatCount: number;
    doorCount: number;
    wheelCount: number;
    setDoorsOpen: (open: boolean) => void;
    setTrunkOpen: (open: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

type VehicleConfig = {
  kind: RoadVehicleKind;
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  wheelBase: number;
  bodyColor: number;
  accentColor: number;
  interiorColor: number;
  roofRail: boolean;
  panoramicRoof: boolean;
};

function vehicleMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildDetailedRoadVehicle(config: VehicleConfig): DetailedRoadVehicle {
  const vehicle = new THREE.Group() as DetailedRoadVehicle;
  vehicle.name = `transport-detailed-${config.kind}`;
  const prefix = `city-${config.kind}`;
  const cutawayShell: THREE.Object3D[] = [];
  const doorPivots: Array<{ pivot: THREE.Group; side: number }> = [];

  const body = new THREE.MeshStandardMaterial({ color: config.bodyColor, roughness: 0.38, metalness: 0.48 });
  const accent = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.42, metalness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20292d, roughness: 0.5, metalness: 0.48 });
  const interior = new THREE.MeshStandardMaterial({ color: config.interiorColor, roughness: 0.86 });
  const interiorDark = new THREE.MeshStandardMaterial({ color: 0x2d3437, roughness: 0.82 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x242b2d, roughness: 0.98 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb9dce1,
    roughness: 0.07,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111617, roughness: 0.95 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4a5, roughness: 0.25, metalness: 0.82 });
  const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x626a6b, roughness: 0.45, metalness: 0.76 });
  const caliperMaterial = new THREE.MeshStandardMaterial({ color: config.kind === "suv" ? 0xd89f39 : 0xb64638, roughness: 0.5 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xeef7eb, emissive: 0xe6f4da, emissiveIntensity: 0.16, roughness: 0.2 });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xa52c29, emissive: 0xff3028, emissiveIntensity: 0.12, roughness: 0.25 });
  const amberMaterial = new THREE.MeshStandardMaterial({ color: 0xc98519, emissive: 0xffa516, emissiveIntensity: 0.1, roughness: 0.3 });
  const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x193b44, emissive: 0x42c4df, emissiveIntensity: 0.28, roughness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb7c0c1, roughness: 0.2, metalness: 0.88 });

  const wheelY = config.wheelRadius + 0.05;
  const floorY = wheelY + 0.18;
  const bodyHeight = config.kind === "suv" ? 0.66 : 0.54;
  const bodyCenterY = floorY + bodyHeight * 0.42;
  const bodyCore = vehicleMesh(
    new THREE.BoxGeometry(config.length - 0.16, bodyHeight, config.width - 0.2),
    body,
    `${prefix}-body-core`,
  );
  bodyCore.position.y = bodyCenterY;
  const floor = vehicleMesh(new THREE.BoxGeometry(config.length - 0.48, 0.1, config.width - 0.32), carpet, `${prefix}-cabin-floor`);
  floor.position.y = floorY;
  const sillLeft = vehicleMesh(new THREE.BoxGeometry(2.7, 0.18, 0.12), accent, `${prefix}-side-sill`);
  sillLeft.position.set(-0.03, floorY + 0.04, -config.width * 0.5);
  const sillRight = sillLeft.clone();
  sillRight.name = `${prefix}-side-sill`;
  sillRight.position.z = config.width * 0.5;
  vehicle.add(bodyCore, floor, sillLeft, sillRight);
  cutawayShell.push(sillRight);

  const hoodLength = config.kind === "suv" ? 1.3 : 1.35;
  const hood = vehicleMesh(new THREE.BoxGeometry(hoodLength, 0.24, config.width - 0.18), body, `${prefix}-hood`);
  hood.position.set(config.length * 0.5 - hoodLength * 0.52, bodyCenterY + bodyHeight * 0.5, 0);
  hood.rotation.z = config.kind === "suv" ? -0.015 : -0.035;
  const trunkLength = config.kind === "suv" ? 0.7 : 0.92;
  const trunkBase = vehicleMesh(new THREE.BoxGeometry(trunkLength, 0.22, config.width - 0.2), body, `${prefix}-trunk-base`);
  trunkBase.position.set(-config.length * 0.5 + trunkLength * 0.52, bodyCenterY + bodyHeight * 0.48, 0);
  vehicle.add(hood, trunkBase);

  const cabinLength = config.kind === "suv" ? 3.22 : 2.84;
  const cabinCenterX = config.kind === "suv" ? -0.18 : -0.08;
  const roofY = config.height - 0.08;
  const roof = vehicleMesh(new THREE.BoxGeometry(cabinLength * 0.62, 0.14, config.width - 0.22), body, `${prefix}-roof`);
  roof.position.set(cabinCenterX - 0.08, roofY, 0);
  vehicle.add(roof);
  cutawayShell.push(roof);

  const frontGlassX = cabinCenterX + cabinLength * 0.43;
  const rearGlassX = cabinCenterX - cabinLength * 0.43;
  const glassCenterY = (bodyCenterY + bodyHeight * 0.62 + roofY) * 0.5;
  const glassHeight = roofY - (bodyCenterY + bodyHeight * 0.6);
  const windshield = vehicleMesh(new THREE.BoxGeometry(0.055, glassHeight, config.width - 0.34), glass, `${prefix}-front-windshield`);
  windshield.position.set(frontGlassX, glassCenterY, 0);
  windshield.rotation.z = config.kind === "suv" ? 0.24 : 0.4;
  const rearWindow = vehicleMesh(new THREE.BoxGeometry(0.055, glassHeight * 0.88, config.width - 0.4), glass, `${prefix}-rear-window`);
  rearWindow.position.set(rearGlassX, glassCenterY, 0);
  rearWindow.rotation.z = config.kind === "suv" ? -0.12 : -0.34;
  vehicle.add(windshield);
  if (config.kind !== "suv") vehicle.add(rearWindow);

  for (const z of [-config.width * 0.5, config.width * 0.5]) {
    for (const [x, rotation] of [[frontGlassX, 0.4], [cabinCenterX, 0], [rearGlassX, -0.34]] as const) {
      const pillar = vehicleMesh(new THREE.BoxGeometry(0.11, glassHeight + 0.08, 0.1), dark, `${prefix}-window-pillar`);
      pillar.position.set(x, glassCenterY, z);
      pillar.rotation.z = config.kind === "suv" && rotation !== 0 ? rotation * 0.52 : rotation;
      vehicle.add(pillar);
      if (z > 0) cutawayShell.push(pillar);
    }
  }

  const doorCenterXs = [0.64, -0.72];
  for (const side of [-1, 1]) {
    doorCenterXs.forEach((centerX, doorIndex) => {
      const pivot = new THREE.Group();
      pivot.name = `${prefix}-${doorIndex === 0 ? "front" : "rear"}-door-pivot`;
      pivot.position.set(centerX + 0.5, floorY + 0.02, side * (config.width * 0.5 + 0.025));
      const lowerDoor = vehicleMesh(new THREE.BoxGeometry(1.02, bodyHeight * 0.82, 0.07), body, `${prefix}-door-panel`);
      lowerDoor.position.set(-0.5, bodyHeight * 0.48, 0);
      const doorWindow = vehicleMesh(new THREE.BoxGeometry(0.88, glassHeight * 0.83, 0.045), glass, `${prefix}-door-window`);
      doorWindow.position.set(-0.5, bodyHeight + glassHeight * 0.46, 0);
      const handle = vehicleMesh(new THREE.BoxGeometry(0.2, 0.045, 0.045), chrome, `${prefix}-door-handle`);
      handle.position.set(-0.23, bodyHeight * 0.78, side * 0.045);
      const innerPanel = vehicleMesh(new THREE.BoxGeometry(0.82, 0.3, 0.04), interiorDark, `${prefix}-door-inner-panel`);
      innerPanel.position.set(-0.5, bodyHeight * 0.42, -side * 0.045);
      pivot.add(lowerDoor, doorWindow, handle, innerPanel);
      vehicle.add(pivot);
      doorPivots.push({ pivot, side });
      if (side > 0) cutawayShell.push(pivot);
    });
  }

  const addSeat = (x: number, z: number, name: string, backHeight = 0.64) => {
    const seat = new THREE.Group();
    seat.name = name;
    seat.position.set(x, 0, z);
    const cushion = vehicleMesh(new THREE.BoxGeometry(0.58, 0.13, 0.52), interior, `${prefix}-seat-cushion`);
    cushion.position.y = floorY + 0.32;
    const back = vehicleMesh(new THREE.BoxGeometry(0.14, backHeight, 0.54), interior, `${prefix}-seat-back`);
    back.position.set(-0.24, floorY + 0.62, 0);
    back.rotation.z = -0.08;
    const headrest = vehicleMesh(new THREE.BoxGeometry(0.16, 0.22, 0.34), interior, `${prefix}-seat-headrest`);
    headrest.position.set(-0.29, floorY + 0.98, 0);
    const rail = vehicleMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 6), chrome, `${prefix}-headrest-rail`);
    rail.position.set(-0.26, floorY + 0.84, 0.12);
    const railPair = rail.clone();
    railPair.position.z = -0.12;
    seat.add(cushion, back, headrest, rail, railPair);
    vehicle.add(seat);
  };
  addSeat(0.62, -0.47, `${prefix}-driver-seat`);
  addSeat(0.62, 0.47, `${prefix}-front-passenger-seat`);
  for (const z of [-0.5, 0, 0.5]) addSeat(-0.77, z, `${prefix}-rear-passenger-seat`, 0.58);

  const dash = vehicleMesh(new THREE.BoxGeometry(0.72, 0.32, config.width - 0.38), interiorDark, `${prefix}-dashboard`);
  dash.position.set(frontGlassX - 0.34, floorY + 0.72, 0);
  const instrument = vehicleMesh(new THREE.BoxGeometry(0.08, 0.21, 0.36), screenMaterial, `${prefix}-digital-instrument`);
  instrument.position.set(frontGlassX - 0.7, floorY + 0.91, -0.44);
  const infotainment = vehicleMesh(new THREE.BoxGeometry(0.08, 0.31, 0.48), screenMaterial, `${prefix}-infotainment-screen`);
  infotainment.position.set(frontGlassX - 0.68, floorY + 0.92, 0.06);
  const steering = vehicleMesh(new THREE.TorusGeometry(0.18, 0.028, 7, 16), dark, `${prefix}-steering-wheel`);
  steering.rotation.y = Math.PI * 0.5;
  steering.position.set(frontGlassX - 0.72, floorY + 0.75, -0.47);
  const console = vehicleMesh(new THREE.BoxGeometry(0.92, 0.26, 0.28), interiorDark, `${prefix}-center-console`);
  console.position.set(0.25, floorY + 0.27, 0);
  const selector = vehicleMesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), chrome, `${prefix}-drive-selector`);
  selector.position.set(0.35, floorY + 0.47, 0);
  vehicle.add(dash, instrument, infotainment, steering, console, selector);

  for (const side of [-1, 1]) {
    const mirrorArm = vehicleMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.23, 6), dark, `${prefix}-mirror-arm`);
    mirrorArm.rotation.x = Math.PI * 0.5;
    mirrorArm.position.set(frontGlassX - 0.08, glassCenterY - 0.1, side * (config.width * 0.5 + 0.1));
    const mirror = vehicleMesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), glass, `${prefix}-side-mirror`);
    mirror.position.set(frontGlassX - 0.08, glassCenterY - 0.1, side * (config.width * 0.5 + 0.23));
    vehicle.add(mirrorArm, mirror);
  }

  const axleXs = [-config.wheelBase * 0.5, config.wheelBase * 0.5];
  for (const x of axleXs) {
    for (const side of [-1, 1]) {
      const z = side * (config.width * 0.5 + 0.02);
      const tire = vehicleMesh(new THREE.CylinderGeometry(config.wheelRadius, config.wheelRadius, 0.22, 18), tireMaterial, `${prefix}-wheel`);
      tire.rotation.x = Math.PI * 0.5;
      tire.position.set(x, wheelY, z);
      const rim = vehicleMesh(new THREE.CylinderGeometry(config.wheelRadius * 0.58, config.wheelRadius * 0.58, 0.235, 16), rimMaterial, `${prefix}-wheel-rim`);
      rim.rotation.x = Math.PI * 0.5;
      rim.position.copy(tire.position);
      const disc = vehicleMesh(new THREE.CylinderGeometry(config.wheelRadius * 0.4, config.wheelRadius * 0.4, 0.24, 16), brakeMaterial, `${prefix}-brake-disc`);
      disc.rotation.x = Math.PI * 0.5;
      disc.position.copy(tire.position);
      const caliper = vehicleMesh(new THREE.BoxGeometry(0.08, 0.18, 0.06), caliperMaterial, `${prefix}-brake-caliper`);
      caliper.position.set(x + 0.11, wheelY, z + side * 0.12);
      vehicle.add(tire, disc, rim, caliper);
      for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
        const spoke = vehicleMesh(new THREE.BoxGeometry(config.wheelRadius * 0.4, 0.045, 0.025), chrome, `${prefix}-wheel-spoke`);
        spoke.position.set(x, wheelY, z + side * 0.13);
        spoke.rotation.z = spokeIndex * Math.PI * 0.4;
        vehicle.add(spoke);
      }
    }
  }

  const bumperFront = vehicleMesh(new THREE.BoxGeometry(0.16, 0.23, config.width - 0.15), dark, `${prefix}-front-bumper`);
  bumperFront.position.set(config.length * 0.5, bodyCenterY - 0.13, 0);
  const bumperRear = vehicleMesh(new THREE.BoxGeometry(0.16, 0.23, config.width - 0.15), dark, `${prefix}-rear-bumper`);
  bumperRear.position.set(-config.length * 0.5, bodyCenterY - 0.13, 0);
  vehicle.add(bumperFront, bumperRear);
  for (const side of [-1, 1]) {
    const headlamp = vehicleMesh(new THREE.BoxGeometry(0.08, 0.2, 0.42), lampMaterial, `${prefix}-headlamp`);
    headlamp.position.set(config.length * 0.5 + 0.08, bodyCenterY + 0.17, side * config.width * 0.3);
    const indicator = vehicleMesh(new THREE.BoxGeometry(0.085, 0.09, 0.17), amberMaterial, `${prefix}-front-indicator`);
    indicator.position.set(config.length * 0.5 + 0.09, bodyCenterY + 0.12, side * config.width * 0.42);
    const tail = vehicleMesh(new THREE.BoxGeometry(0.08, 0.22, 0.36), tailMaterial, `${prefix}-tail-light`);
    tail.position.set(-config.length * 0.5 - 0.08, bodyCenterY + 0.22, side * config.width * 0.31);
    vehicle.add(headlamp, indicator, tail);
  }

  const trunkPivot = new THREE.Group();
  trunkPivot.name = `${prefix}-trunk-pivot`;
  if (config.kind === "suv") {
    trunkPivot.position.set(-config.length * 0.5 + 0.04, roofY - 0.02, 0);
    const hatchLower = vehicleMesh(new THREE.BoxGeometry(0.12, 0.36, config.width - 0.18), body, `${prefix}-trunk-hatch-lower`);
    hatchLower.position.y = -(roofY - bodyCenterY) + 0.18;
    const hatchHeader = vehicleMesh(new THREE.BoxGeometry(0.12, 0.14, config.width - 0.18), body, `${prefix}-trunk-hatch-header`);
    hatchHeader.position.y = -0.07;
    const hatchGlass = vehicleMesh(new THREE.BoxGeometry(0.07, glassHeight * 0.78, config.width - 0.36), glass, `${prefix}-trunk-window`);
    hatchGlass.position.set(-0.07, -glassHeight * 0.54, 0);
    trunkPivot.add(hatchLower, hatchHeader, hatchGlass);
    for (const side of [-1, 1]) {
      const hatchPillar = vehicleMesh(new THREE.BoxGeometry(0.13, glassHeight * 0.82, 0.12), dark, `${prefix}-trunk-window-pillar`);
      hatchPillar.position.set(-0.01, -glassHeight * 0.54, side * (config.width * 0.5 - 0.12));
      trunkPivot.add(hatchPillar);
    }
  } else {
    trunkPivot.position.set(-config.length * 0.5 + 1.02, bodyCenterY + bodyHeight * 0.58, 0);
    const lid = vehicleMesh(new THREE.BoxGeometry(0.92, 0.1, config.width - 0.2), body, `${prefix}-trunk-lid`);
    lid.position.x = -0.46;
    trunkPivot.add(lid);
  }
  vehicle.add(trunkPivot);

  const cargoFloor = vehicleMesh(new THREE.BoxGeometry(config.kind === "suv" ? 1.15 : 0.78, 0.05, config.width - 0.38), carpet, `${prefix}-cargo-floor`);
  cargoFloor.position.set(-config.length * 0.5 + (config.kind === "suv" ? 0.75 : 0.52), floorY + 0.12, 0);
  const cargoShelf = vehicleMesh(new THREE.BoxGeometry(config.kind === "suv" ? 1.1 : 0.7, 0.04, config.width - 0.4), interiorDark, `${prefix}-cargo-shelf`);
  cargoShelf.position.set(cargoFloor.position.x, floorY + (config.kind === "suv" ? 0.76 : 0.55), 0);
  vehicle.add(cargoFloor, cargoShelf);

  if (config.panoramicRoof) {
    const panorama = vehicleMesh(new THREE.BoxGeometry(cabinLength * 0.46, 0.035, config.width * 0.62), glass, `${prefix}-panoramic-roof`);
    panorama.position.set(cabinCenterX - 0.08, roofY + 0.08, 0);
    vehicle.add(panorama);
    cutawayShell.push(panorama);
  }

  if (config.roofRail) {
    for (const side of [-1, 1]) {
      const rail = vehicleMesh(new THREE.CylinderGeometry(0.025, 0.025, 2.45, 7), chrome, `${prefix}-roof-rail`);
      rail.rotation.z = Math.PI * 0.5;
      rail.position.set(-0.18, roofY + 0.18, side * config.width * 0.37);
      vehicle.add(rail);
    }
    const skidFront = vehicleMesh(new THREE.BoxGeometry(0.28, 0.16, config.width * 0.58), chrome, `${prefix}-front-skid-plate`);
    skidFront.position.set(config.length * 0.5 + 0.05, wheelY - 0.02, 0);
    const skidRear = skidFront.clone();
    skidRear.name = `${prefix}-rear-skid-plate`;
    skidRear.position.x = -config.length * 0.5 - 0.05;
    vehicle.add(skidFront, skidRear);
  }

  if (config.kind === "taxi") {
    const taxiSign = vehicleMesh(new THREE.BoxGeometry(0.62, 0.22, 0.23), amberMaterial, `${prefix}-roof-sign`);
    taxiSign.position.set(0.05, roofY + 0.2, 0);
    taxiSign.userData.displayText = "TAXI 出租车";
    const meter = vehicleMesh(new THREE.BoxGeometry(0.18, 0.19, 0.24), screenMaterial, `${prefix}-fare-meter`);
    meter.position.set(frontGlassX - 0.86, floorY + 0.84, 0.38);
    const serviceScreen = vehicleMesh(new THREE.BoxGeometry(0.08, 0.3, 0.42), screenMaterial, `${prefix}-rear-service-screen`);
    serviceScreen.position.set(0.27, floorY + 0.76, 0.47);
    const licence = vehicleMesh(new THREE.BoxGeometry(0.03, 0.18, 0.32), screenMaterial, `${prefix}-driver-licence-display`);
    licence.position.set(0.18, floorY + 0.92, -0.62);
    vehicle.add(taxiSign, meter, serviceScreen, licence);
    cutawayShell.push(taxiSign);
  }

  const cabinLights: THREE.PointLight[] = [];
  for (const x of [-0.65, 0.65]) {
    const light = new THREE.PointLight(0xffdca0, 0, 2.8, 1.8);
    light.name = `${prefix}-cabin-light`;
    light.position.set(x, roofY - 0.22, 0);
    cabinLights.push(light);
    vehicle.add(light);
  }

  vehicle.userData = {
    modelType: "detailed-road-vehicle",
    vehicleKind: config.kind,
    generatedLocally: true,
    dimensions: new THREE.Vector3(config.length, config.height, config.width),
    seatCount: 5,
    doorCount: 4,
    wheelCount: 4,
    setDoorsOpen(open: boolean) {
      doorPivots.forEach(({ pivot, side }) => { pivot.rotation.y = open ? side * 0.76 : 0; });
    },
    setTrunkOpen(open: boolean) {
      trunkPivot.rotation.z = open ? (config.kind === "suv" ? -1.08 : -0.82) : 0;
      trunkPivot.userData.open = open;
    },
    setInteriorCutaway(cutaway: boolean) {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered(powered: boolean) {
      lampMaterial.emissiveIntensity = powered ? 4.2 : 0.16;
      tailMaterial.emissiveIntensity = powered ? 3.4 : 0.12;
      amberMaterial.emissiveIntensity = powered ? 2.4 : 0.1;
      screenMaterial.emissiveIntensity = powered ? 2.3 : 0.28;
      cabinLights.forEach((light) => { light.intensity = powered ? 1.7 : 0; });
    },
  };
  vehicle.userData.setDoorsOpen(false);
  vehicle.userData.setTrunkOpen(false);
  vehicle.userData.setInteriorCutaway(false);
  vehicle.userData.setPowered(false);
  return vehicle;
}

export function buildDetailedElectricTaxi() {
  return buildDetailedRoadVehicle({
    kind: "taxi",
    length: 4.76,
    width: 1.84,
    height: 1.58,
    wheelRadius: 0.34,
    wheelBase: 2.82,
    bodyColor: 0xe1ad2f,
    accentColor: 0x263a3e,
    interiorColor: 0x455458,
    roofRail: false,
    panoramicRoof: false,
  });
}

export function buildDetailedPrivateSedan() {
  return buildDetailedRoadVehicle({
    kind: "sedan",
    length: 4.68,
    width: 1.86,
    height: 1.47,
    wheelRadius: 0.35,
    wheelBase: 2.76,
    bodyColor: 0x315d83,
    accentColor: 0x1e3447,
    interiorColor: 0xb8a58e,
    roofRail: false,
    panoramicRoof: true,
  });
}

export function buildDetailedPrivateSuv() {
  return buildDetailedRoadVehicle({
    kind: "suv",
    length: 4.86,
    width: 1.98,
    height: 1.8,
    wheelRadius: 0.39,
    wheelBase: 2.86,
    bodyColor: 0x647b65,
    accentColor: 0x273934,
    interiorColor: 0x796a58,
    roofRail: true,
    panoramicRoof: true,
  });
}
