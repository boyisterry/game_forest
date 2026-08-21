import * as THREE from "three";

export type CityBusModel = THREE.Group & {
  userData: {
    modelType: "electric-city-bus";
    generatedLocally: true;
    dimensions: THREE.Vector3;
    passengerSeatCount: number;
    prioritySeatCount: number;
    wheelchairSpaceCount: number;
    doorCount: number;
    wheelCount: number;
    stopButtonCount: number;
    grabHandleCount: number;
    cctvCount: number;
    setDoorsOpen: (open: boolean) => void;
    setRampDeployed: (deployed: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

function busMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildDetailedElectricCityBus(): CityBusModel {
  const bus = new THREE.Group() as CityBusModel;
  bus.name = "transport-electric-city-bus";
  const cutawayShell: THREE.Object3D[] = [];
  const doorPanels: Array<{ panel: THREE.Object3D; closedX: number; direction: number }> = [];

  const bodyWhite = new THREE.MeshStandardMaterial({ color: 0xe9ece8, roughness: 0.58, metalness: 0.28 });
  const bodyGreen = new THREE.MeshStandardMaterial({ color: 0x28776f, roughness: 0.55, metalness: 0.24 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: 0x26373c, roughness: 0.46, metalness: 0.42 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xa9d3d8,
    emissive: 0x0b2024,
    emissiveIntensity: 0.02,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 0.42,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const interiorWall = new THREE.MeshStandardMaterial({ color: 0xd7d9d2, roughness: 0.84 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3f494a, roughness: 0.96 });
  const aisleMaterial = new THREE.MeshStandardMaterial({ color: 0x566769, roughness: 0.92 });
  const seatBlue = new THREE.MeshStandardMaterial({ color: 0x397c96, roughness: 0.86 });
  const seatPriority = new THREE.MeshStandardMaterial({ color: 0xd8a73c, roughness: 0.84 });
  const wheelchairBlue = new THREE.MeshStandardMaterial({ color: 0x2f79b9, roughness: 0.88 });
  const railYellow = new THREE.MeshStandardMaterial({ color: 0xe1bd3e, roughness: 0.46, metalness: 0.32 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151a1b, roughness: 0.94 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x8b999b, roughness: 0.35, metalness: 0.7 });
  const dashboard = new THREE.MeshStandardMaterial({ color: 0x263236, roughness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({
    color: 0x244b58,
    emissive: 0x3bc0db,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  const destination = new THREE.MeshStandardMaterial({
    color: 0x3f2a0c,
    emissive: 0xffb229,
    emissiveIntensity: 1.15,
    roughness: 0.34,
  });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff1c2,
    emissive: 0xffcf69,
    emissiveIntensity: 0.2,
    roughness: 0.3,
  });
  const redLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xa12827,
    emissive: 0xff342f,
    emissiveIntensity: 0.16,
    roughness: 0.3,
  });

  const chassis = busMesh(new THREE.BoxGeometry(11.7, 0.28, 2.42), bodyDark, "city-bus-chassis");
  chassis.position.y = 0.46;
  const floor = busMesh(new THREE.BoxGeometry(11.35, 0.14, 2.24), floorMaterial, "city-bus-passenger-floor");
  floor.position.y = 0.66;
  const aisle = busMesh(new THREE.BoxGeometry(9.4, 0.025, 0.56), aisleMaterial, "city-bus-central-aisle");
  aisle.position.set(-0.25, 0.75, 0);
  const roof = busMesh(new THREE.BoxGeometry(11.65, 0.2, 2.5), bodyWhite, "city-bus-roof-shell");
  roof.position.y = 3.18;
  bus.add(chassis, floor, aisle, roof);
  cutawayShell.push(roof);

  for (const z of [-1.24, 1.24]) {
    const lowerPanel = busMesh(new THREE.BoxGeometry(11.5, 0.72, 0.12), bodyGreen, "city-bus-lower-side-panel");
    lowerPanel.position.set(0, 1.04, z);
    const upperRail = busMesh(new THREE.BoxGeometry(11.5, 0.34, 0.13), bodyWhite, "city-bus-upper-side-rail");
    upperRail.position.set(0, 2.98, z);
    bus.add(lowerPanel, upperRail);
    if (z > 0) cutawayShell.push(lowerPanel, upperRail);
  }

  // Keep the areas behind both windscreens physically open. The end caps are
  // built as frames instead of solid walls so the transparent glazing can
  // reveal the driver zone and passenger cabin from outside.
  const frontLowerShell = busMesh(new THREE.BoxGeometry(0.16, 0.72, 2.4), bodyGreen, "city-bus-front-lower-shell");
  frontLowerShell.position.set(5.74, 1.1, 0);
  const frontHeader = busMesh(new THREE.BoxGeometry(0.16, 0.28, 2.4), bodyWhite, "city-bus-front-window-header");
  frontHeader.position.set(5.74, 3.0, 0);
  const rearLowerShell = busMesh(new THREE.BoxGeometry(0.18, 0.98, 2.4), bodyGreen, "city-bus-rear-lower-shell");
  rearLowerShell.position.set(-5.74, 1.18, 0);
  const rearHeader = busMesh(new THREE.BoxGeometry(0.18, 0.42, 2.4), bodyGreen, "city-bus-rear-window-header");
  rearHeader.position.set(-5.74, 2.98, 0);
  bus.add(frontLowerShell, frontHeader, rearLowerShell, rearHeader);
  for (const z of [-1.13, 1.13]) {
    const frontPillar = busMesh(new THREE.BoxGeometry(0.16, 1.46, 0.16), bodyDark, "city-bus-front-window-pillar");
    frontPillar.position.set(5.74, 2.18, z);
    const rearPillar = busMesh(new THREE.BoxGeometry(0.18, 1.18, 0.18), bodyDark, "city-bus-rear-window-pillar");
    rearPillar.position.set(-5.74, 2.2, z);
    bus.add(frontPillar, rearPillar);
  }
  const frontWindshield = busMesh(new THREE.BoxGeometry(0.08, 1.35, 2.08), glass, "city-bus-front-windshield");
  frontWindshield.position.set(5.84, 2.18, 0);
  const rearWindow = busMesh(new THREE.BoxGeometry(0.08, 1.05, 1.86), glass, "city-bus-rear-window");
  rearWindow.position.set(-5.84, 2.2, 0);
  bus.add(frontWindshield, rearWindow);

  const windowXs = [-4.7, -3.55, -2.4, -1.25, 0.0, 1.15, 2.3, 3.45, 4.6];
  for (const z of [-1.31, 1.31]) {
    windowXs.forEach((x, index) => {
      const isDoorOpening = z > 0 && (index === 4 || index === 7);
      if (!isDoorOpening) {
        const pane = busMesh(new THREE.BoxGeometry(0.98, 1.25, 0.075), glass, "city-bus-side-window");
        pane.position.set(x, 2.18, z);
        bus.add(pane);
        if (z > 0) cutawayShell.push(pane);
      }
      const pillar = busMesh(new THREE.BoxGeometry(0.12, 1.36, 0.12), bodyDark, "city-bus-window-pillar");
      pillar.position.set(x - 0.56, 2.2, z);
      bus.add(pillar);
      if (z > 0) cutawayShell.push(pillar);
    });
  }

  const addDoor = (centerX: number, name: string) => {
    const frame = busMesh(new THREE.BoxGeometry(1.72, 2.05, 0.1), bodyDark, `${name}-frame`);
    frame.position.set(centerX, 1.8, 1.32);
    bus.add(frame);
    cutawayShell.push(frame);
    for (const side of [-1, 1]) {
      const panel = busMesh(new THREE.BoxGeometry(0.72, 1.82, 0.08), glass, `${name}-panel`);
      panel.position.set(centerX + side * 0.39, 1.82, 1.39);
      panel.userData.operable = true;
      bus.add(panel);
      cutawayShell.push(panel);
      doorPanels.push({ panel, closedX: panel.position.x, direction: side });
      const edge = busMesh(new THREE.BoxGeometry(0.06, 1.82, 0.1), railYellow, `${name}-safety-edge`);
      edge.position.set(-side * 0.31, 0, 0.01);
      panel.add(edge);
    }
  };
  addDoor(3.55, "city-bus-front-door");
  addDoor(0.05, "city-bus-middle-door");

  for (const x of [-3.85, 3.9]) {
    for (const z of [-1.24, 1.24]) {
      const tire = busMesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 14), rubber, "city-bus-wheel");
      tire.rotation.x = Math.PI * 0.5;
      tire.position.set(x, 0.56, z);
      const wheelHub = busMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12), hub, "city-bus-wheel-hub");
      wheelHub.rotation.x = Math.PI * 0.5;
      wheelHub.position.copy(tire.position);
      bus.add(tire, wheelHub);
    }
  }

  for (const x of [-3.85, 3.9]) {
    for (const z of [-0.89, 0.89]) {
      const arch = busMesh(new THREE.BoxGeometry(1.55, 0.52, 0.3), interiorWall, "city-bus-interior-wheel-arch");
      arch.position.set(x, 0.96, z);
      bus.add(arch);
    }
  }

  const passengerSeatPositions: Array<{ x: number; z: number; priority: boolean }> = [];
  const rows = [-4.65, -3.55, -2.45, -1.35, -0.25, 0.85, 1.95];
  const seatZs = [-0.9, -0.47, 0.47, 0.9];
  rows.forEach((x) => {
    seatZs.forEach((z) => {
      const wheelchairOmission = z > 0 && (x === -0.25 || x === 0.85);
      if (!wheelchairOmission) passengerSeatPositions.push({ x, z, priority: x === 1.95 });
    });
  });
  passengerSeatPositions.forEach(({ x, z, priority }) => {
    const seat = new THREE.Group();
    seat.name = priority ? "city-bus-priority-seat" : "city-bus-passenger-seat";
    seat.userData.priority = priority;
    seat.position.set(x, 0, z);
    const material = priority ? seatPriority : seatBlue;
    const cushion = busMesh(new THREE.BoxGeometry(0.43, 0.12, 0.38), material, "city-bus-seat-cushion");
    cushion.position.y = 1.03;
    const back = busMesh(new THREE.BoxGeometry(0.12, 0.65, 0.4), material, "city-bus-seat-back");
    back.position.set(-0.18, 1.33, 0);
    const leg = busMesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), bodyDark, "city-bus-seat-leg");
    leg.position.y = 0.85;
    const seatGrab = busMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.31, 7), railYellow, "city-bus-seat-back-grab-rail");
    seatGrab.rotation.x = Math.PI * 0.5;
    seatGrab.position.set(-0.25, 1.58, 0);
    seat.add(cushion, back, leg, seatGrab);
    bus.add(seat);
  });

  const wheelchairFloor = busMesh(new THREE.BoxGeometry(2.05, 0.035, 0.94), wheelchairBlue, "city-bus-wheelchair-space");
  wheelchairFloor.position.set(0.3, 0.77, 0.72);
  wheelchairFloor.userData.capacity = 1;
  const wheelchairBackrest = busMesh(new THREE.BoxGeometry(0.14, 0.86, 0.74), seatBlue, "city-bus-wheelchair-backrest");
  wheelchairBackrest.position.set(1.28, 1.22, 0.72);
  const wheelchairRail = busMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.65, 8), railYellow, "city-bus-wheelchair-handrail");
  wheelchairRail.position.set(0.25, 1.42, 0.22);
  wheelchairRail.rotation.z = Math.PI * 0.5;
  const wheelchairButton = busMesh(new THREE.BoxGeometry(0.1, 0.18, 0.08), wheelchairBlue, "city-bus-wheelchair-stop-button");
  wheelchairButton.position.set(1.14, 1.56, 1.18);
  wheelchairButton.userData.accessibleControl = true;
  bus.add(wheelchairFloor, wheelchairBackrest, wheelchairRail, wheelchairButton);

  const driverSeat = new THREE.Group();
  driverSeat.name = "city-bus-driver-seat";
  driverSeat.position.set(4.65, 0, -0.72);
  const driverCushion = busMesh(new THREE.BoxGeometry(0.55, 0.16, 0.52), seatBlue, "city-bus-driver-seat-cushion");
  driverCushion.position.y = 1.04;
  const driverBack = busMesh(new THREE.BoxGeometry(0.16, 0.82, 0.55), seatBlue, "city-bus-driver-seat-back");
  driverBack.position.set(-0.22, 1.42, 0);
  driverSeat.add(driverCushion, driverBack);
  bus.add(driverSeat);
  const driverPartition = busMesh(new THREE.BoxGeometry(0.08, 1.72, 1.05), glass, "city-bus-driver-partition");
  driverPartition.position.set(3.65, 1.7, -0.72);
  const dash = busMesh(new THREE.BoxGeometry(0.85, 0.46, 1.02), dashboard, "city-bus-dashboard");
  dash.position.set(5.25, 1.22, -0.67);
  const instrument = busMesh(new THREE.BoxGeometry(0.08, 0.28, 0.48), screen, "city-bus-driver-instrument-screen");
  instrument.position.set(4.8, 1.46, -0.67);
  instrument.rotation.z = -0.25;
  const wheel = busMesh(new THREE.TorusGeometry(0.22, 0.035, 7, 16), bodyDark, "city-bus-steering-wheel");
  wheel.rotation.y = Math.PI * 0.5;
  wheel.position.set(4.95, 1.45, -0.68);
  const fareConsole = busMesh(new THREE.BoxGeometry(0.48, 0.92, 0.42), dashboard, "city-bus-fare-console");
  fareConsole.position.set(3.55, 1.2, 0.38);
  const validator = busMesh(new THREE.BoxGeometry(0.22, 0.34, 0.16), screen, "city-bus-card-validator");
  validator.position.set(3.55, 1.78, 0.38);
  const accelerator = busMesh(new THREE.BoxGeometry(0.22, 0.05, 0.12), bodyDark, "city-bus-driver-accelerator-pedal");
  accelerator.position.set(5.18, 0.78, -0.84);
  accelerator.rotation.z = -0.18;
  const brake = busMesh(new THREE.BoxGeometry(0.3, 0.05, 0.15), bodyDark, "city-bus-driver-brake-pedal");
  brake.position.set(5.15, 0.79, -0.54);
  brake.rotation.z = -0.18;
  const extinguisher = busMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10), redLightMaterial, "city-bus-fire-extinguisher");
  extinguisher.position.set(3.72, 1.02, -1.05);
  bus.add(driverPartition, dash, instrument, wheel, fareConsole, validator, accelerator, brake, extinguisher);

  for (const centerX of [0.05, 3.55]) {
    const threshold = busMesh(new THREE.BoxGeometry(1.55, 0.025, 0.32), railYellow, "city-bus-door-safety-threshold");
    threshold.position.set(centerX, 0.78, 1.08);
    threshold.userData.highContrast = true;
    bus.add(threshold);
  }

  for (const z of [-0.31, 0.31]) {
    const overhead = busMesh(new THREE.CylinderGeometry(0.035, 0.035, 9.1, 8), railYellow, "city-bus-overhead-handrail");
    overhead.rotation.z = Math.PI * 0.5;
    overhead.position.set(-0.25, 2.72, z);
    bus.add(overhead);
  }
  const stanchionXs = [-4.6, -3.5, -2.4, -1.3, -0.2, 0.9, 2.0];
  stanchionXs.forEach((x) => {
    for (const z of [-0.31, 0.31]) {
      const pole = busMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.94, 8), railYellow, "city-bus-vertical-stanchion");
      pole.position.set(x, 1.75, z);
      bus.add(pole);
    }
  });
  for (let index = 0; index < 12; index += 1) {
    const x = -4.35 + index * 0.72;
    const handle = busMesh(new THREE.TorusGeometry(0.1, 0.025, 6, 10), railYellow, "city-bus-grab-handle");
    handle.position.set(x, 2.38, index % 2 ? -0.32 : 0.32);
    bus.add(handle);
  }
  for (let index = 0; index < 8; index += 1) {
    const button = busMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 8), redLightMaterial, "city-bus-stop-button");
    button.rotation.x = Math.PI * 0.5;
    button.position.set(-3.9 + index * 0.95, 1.6, index % 2 ? -0.35 : 0.35);
    bus.add(button);
  }

  for (let index = 0; index < 8; index += 1) {
    const vent = busMesh(new THREE.BoxGeometry(0.46, 0.04, 0.16), bodyDark, "city-bus-ceiling-air-vent");
    vent.position.set(-4.15 + index * 1.08, 3.02, index % 2 ? -0.58 : 0.58);
    bus.add(vent);
  }
  for (const x of [-4.25, -2.0, 0.4, 2.55]) {
    const hammer = busMesh(new THREE.BoxGeometry(0.05, 0.24, 0.08), redLightMaterial, "city-bus-emergency-hammer");
    hammer.position.set(x, 2.28, -1.21);
    hammer.rotation.z = -0.55;
    bus.add(hammer);
  }

  const nextStopDisplay = busMesh(new THREE.BoxGeometry(1.25, 0.36, 0.12), destination, "city-bus-next-stop-display");
  nextStopDisplay.position.set(3.6, 2.68, 0);
  nextStopDisplay.userData.displayText = "下一站 河湾广场";
  const routeMap = busMesh(new THREE.BoxGeometry(3.4, 0.36, 0.06), screen, "city-bus-route-map-display");
  routeMap.position.set(-1.35, 2.62, -1.2);
  bus.add(nextStopDisplay, routeMap);
  for (const x of [-4.5, -1.5, 1.5, 4.4]) {
    const camera = busMesh(new THREE.SphereGeometry(0.09, 7, 5), dashboard, "city-bus-cctv-camera");
    camera.position.set(x, 2.85, x % 3 ? -0.85 : 0.85);
    bus.add(camera);
  }

  const rampPivot = new THREE.Group();
  rampPivot.name = "city-bus-wheelchair-ramp-pivot";
  rampPivot.position.set(0.05, 0.68, 1.26);
  const ramp = busMesh(new THREE.BoxGeometry(1.35, 0.07, 1.35), hub, "city-bus-wheelchair-ramp");
  ramp.position.z = 0.63;
  ramp.userData.operable = true;
  rampPivot.add(ramp);
  bus.add(rampPivot);

  const frontDestination = busMesh(new THREE.BoxGeometry(0.09, 0.38, 1.35), destination, "city-bus-front-destination-display");
  frontDestination.position.set(5.91, 2.95, 0);
  frontDestination.userData.displayText = "R12 河湾总站";
  const sideDestination = busMesh(new THREE.BoxGeometry(1.9, 0.34, 0.06), destination, "city-bus-side-destination-display");
  sideDestination.position.set(2.0, 2.92, 1.34);
  sideDestination.userData.displayText = "R12 河湾总站";
  bus.add(frontDestination, sideDestination);
  cutawayShell.push(sideDestination);

  const frontBumper = busMesh(new THREE.BoxGeometry(0.18, 0.22, 2.26), bodyDark, "city-bus-front-bumper");
  frontBumper.position.set(5.91, 0.58, 0);
  const rearBumper = busMesh(new THREE.BoxGeometry(0.18, 0.22, 2.26), bodyDark, "city-bus-rear-bumper");
  rearBumper.position.set(-5.91, 0.58, 0);
  const licensePlate = busMesh(new THREE.BoxGeometry(0.04, 0.18, 0.5), bodyWhite, "city-bus-license-plate");
  licensePlate.position.set(6.02, 0.68, 0);
  const chargingPort = busMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 12), bodyDark, "city-bus-charging-port");
  chargingPort.rotation.x = Math.PI * 0.5;
  chargingPort.position.set(-4.72, 1.18, -1.31);
  bus.add(frontBumper, rearBumper, licensePlate, chargingPort);
  for (const x of [-4.9, -2.6, -0.3, 2.0, 4.55]) {
    for (const z of [-1.32, 1.32]) {
      const reflector = busMesh(new THREE.BoxGeometry(0.18, 0.08, 0.035), redLightMaterial, "city-bus-side-reflector");
      reflector.position.set(x, 0.78, z);
      bus.add(reflector);
      if (z > 0) cutawayShell.push(reflector);
    }
  }

  const emergencyHatch = busMesh(new THREE.BoxGeometry(1.2, 0.06, 0.85), bodyDark, "city-bus-roof-emergency-hatch");
  emergencyHatch.position.set(4.15, 3.31, 0);
  bus.add(emergencyHatch);

  for (const z of [-0.72, 0.72]) {
    const headlamp = busMesh(new THREE.BoxGeometry(0.08, 0.22, 0.38), lightMaterial, "city-bus-headlamp");
    headlamp.position.set(5.91, 0.95, z);
    const tail = busMesh(new THREE.BoxGeometry(0.08, 0.35, 0.24), redLightMaterial, "city-bus-tail-light");
    tail.position.set(-5.91, 1.15, z);
    bus.add(headlamp, tail);
  }
  for (const x of [-4.5, -2.6, -0.7, 1.2, 3.1]) {
    const cabinLight = busMesh(new THREE.BoxGeometry(1.25, 0.05, 0.22), lightMaterial, "city-bus-interior-light");
    cabinLight.position.set(x, 3.03, 0);
    bus.add(cabinLight);
  }

  for (const z of [-1.55, 1.55]) {
    const arm = busMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 7), bodyDark, "city-bus-mirror-arm");
    arm.rotation.x = Math.PI * 0.5;
    arm.position.set(5.25, 2.22, z * 0.84);
    const mirror = busMesh(new THREE.BoxGeometry(0.12, 0.38, 0.25), glass, "city-bus-side-mirror");
    mirror.position.set(5.25, 2.22, z);
    bus.add(arm, mirror);
  }

  for (const x of [-2.2, 0, 2.2]) {
    const battery = busMesh(new THREE.BoxGeometry(1.65, 0.32, 1.55), bodyDark, "city-bus-roof-battery-pack");
    battery.position.set(x, 3.42, 0);
    bus.add(battery);
  }
  const hvac = busMesh(new THREE.BoxGeometry(1.45, 0.4, 1.35), bodyWhite, "city-bus-roof-hvac");
  hvac.position.set(-4.15, 3.45, 0);
  bus.add(hvac);

  const interiorLights: THREE.PointLight[] = [];
  for (const x of [-3.6, 0, 3.4]) {
    const light = new THREE.PointLight(0xffd78a, 0, 4.2, 1.8);
    light.name = "city-bus-cabin-point-light";
    light.position.set(x, 2.65, 0);
    interiorLights.push(light);
    bus.add(light);
  }

  bus.userData = {
    modelType: "electric-city-bus",
    generatedLocally: true,
    dimensions: new THREE.Vector3(11.8, 3.65, 2.55),
    passengerSeatCount: passengerSeatPositions.length,
    prioritySeatCount: passengerSeatPositions.filter((seat) => seat.priority).length,
    wheelchairSpaceCount: 1,
    doorCount: 2,
    wheelCount: 4,
    stopButtonCount: 8,
    grabHandleCount: 12,
    cctvCount: 4,
    setDoorsOpen(open: boolean) {
      doorPanels.forEach(({ panel, closedX, direction }) => {
        panel.position.x = closedX + (open ? direction * 0.34 : 0);
      });
    },
    setRampDeployed(deployed: boolean) {
      rampPivot.rotation.x = deployed ? 0 : -Math.PI * 0.5;
      rampPivot.userData.deployed = deployed;
    },
    setInteriorCutaway(cutaway: boolean) {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered(powered: boolean) {
      glass.emissiveIntensity = powered ? 0.06 : 0.02;
      destination.emissiveIntensity = powered ? 3.2 : 1.15;
      screen.emissiveIntensity = powered ? 2.2 : 0.45;
      lightMaterial.emissiveIntensity = powered ? 3.8 : 0.2;
      redLightMaterial.emissiveIntensity = powered ? 3.2 : 0.16;
      interiorLights.forEach((light) => { light.intensity = powered ? 2.6 : 0; });
    },
  };
  bus.userData.setDoorsOpen(false);
  bus.userData.setRampDeployed(false);
  bus.userData.setInteriorCutaway(false);
  bus.userData.setPowered(false);
  return bus;
}
