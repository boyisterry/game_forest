import * as THREE from "three";

export type SchoolBusModel = THREE.Group & {
  userData: {
    modelType: "school-bus";
    generatedLocally: true;
    dimensions: THREE.Vector3;
    passengerSeatCount: number;
    doorCount: number;
    wheelCount: number;
    warningLightCount: number;
    setDoorsOpen: (open: boolean) => void;
    setStopArmExtended: (extended: boolean) => void;
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

export function buildDetailedSchoolBus(): SchoolBusModel {
  const bus = new THREE.Group() as SchoolBusModel;
  bus.name = "transport-school-bus";
  const cutawayShell: THREE.Object3D[] = [];
  const doorPanels: Array<{ panel: THREE.Object3D; closedX: number; direction: number }> = [];

  const bodyYellow = new THREE.MeshStandardMaterial({ color: 0xf0c12a, roughness: 0.48, metalness: 0.22 });
  const roofWhite = new THREE.MeshStandardMaterial({ color: 0xeff3ee, roughness: 0.62, metalness: 0.18 });
  const bodyBlack = new THREE.MeshStandardMaterial({ color: 0x1a2124, roughness: 0.5, metalness: 0.36 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc5cdce, roughness: 0.18, metalness: 0.88 });
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
  const interiorWall = new THREE.MeshStandardMaterial({ color: 0xe4d9c4, roughness: 0.86 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.96 });
  const aisleMaterial = new THREE.MeshStandardMaterial({ color: 0x4f4742, roughness: 0.92 });
  const seatGreen = new THREE.MeshStandardMaterial({ color: 0x3f6d52, roughness: 0.84 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151a1b, roughness: 0.94 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x8b999b, roughness: 0.35, metalness: 0.7 });
  const dashboard = new THREE.MeshStandardMaterial({ color: 0x2a3336, roughness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({
    color: 0x244b58,
    emissive: 0x3bc0db,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  const destination = new THREE.MeshStandardMaterial({
    color: 0x2b1d08,
    emissive: 0xffb229,
    emissiveIntensity: 1.15,
    roughness: 0.34,
  });
  const lettering = new THREE.MeshStandardMaterial({ color: 0x161c1e, roughness: 0.55 });
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
  const amberWarning = new THREE.MeshStandardMaterial({
    color: 0xd88912,
    emissive: 0xff9a18,
    emissiveIntensity: 0.35,
    roughness: 0.28,
  });
  const stopRed = new THREE.MeshStandardMaterial({
    color: 0xb1322c,
    roughness: 0.48,
    metalness: 0.12,
  });

  const chassis = busMesh(new THREE.BoxGeometry(9.45, 0.28, 2.38), bodyBlack, "city-school-bus-chassis");
  chassis.position.y = 0.52;
  const floor = busMesh(new THREE.BoxGeometry(7.55, 0.14, 2.18), floorMaterial, "city-school-bus-passenger-floor");
  floor.position.set(-0.42, 1.02, 0);
  const aisle = busMesh(new THREE.BoxGeometry(6.55, 0.025, 0.5), aisleMaterial, "city-school-bus-central-aisle");
  aisle.position.set(-0.55, 1.11, 0);
  const roof = busMesh(new THREE.BoxGeometry(7.82, 0.18, 2.48), roofWhite, "city-school-bus-roof-shell");
  roof.position.set(-0.38, 3.02, 0);
  bus.add(chassis, floor, aisle, roof);
  cutawayShell.push(roof);

  const hood = busMesh(new THREE.BoxGeometry(1.58, 0.46, 2.12), bodyYellow, "city-school-bus-hood");
  hood.position.set(4.02, 1.08, 0);
  hood.rotation.z = -0.06;
  const hoodTop = busMesh(new THREE.BoxGeometry(1.22, 0.1, 1.55), bodyBlack, "city-school-bus-hood-intake");
  hoodTop.position.set(4.08, 1.32, 0);
  const grille = busMesh(new THREE.BoxGeometry(0.12, 0.72, 1.48), chrome, "city-school-bus-grille");
  grille.position.set(4.74, 0.92, 0);
  const cowl = busMesh(new THREE.BoxGeometry(0.38, 0.36, 2.22), bodyBlack, "city-school-bus-cowl");
  cowl.position.set(3.18, 1.48, 0);
  bus.add(hood, hoodTop, grille, cowl);
  for (const z of [-0.82, 0.82]) {
    const marker = busMesh(new THREE.BoxGeometry(0.08, 0.08, 0.16), amberWarning, "city-school-bus-hood-marker-light");
    marker.position.set(4.68, 1.22, z);
    bus.add(marker);
  }

  for (const z of [-1.24, 1.24]) {
    const lowerPanel = busMesh(new THREE.BoxGeometry(7.7, 0.78, 0.12), bodyYellow, "city-school-bus-lower-side-panel");
    lowerPanel.position.set(-0.35, 1.18, z);
    const upperRail = busMesh(new THREE.BoxGeometry(7.7, 0.28, 0.13), bodyYellow, "city-school-bus-upper-side-rail");
    upperRail.position.set(-0.35, 2.88, z);
    bus.add(lowerPanel, upperRail);
    if (z > 0) cutawayShell.push(lowerPanel, upperRail);
    for (const y of [0.86, 1.32, 1.78]) {
      const rub = busMesh(new THREE.BoxGeometry(7.55, 0.07, 0.06), bodyBlack, "city-school-bus-rub-rail");
      rub.position.set(-0.32, y, z + Math.sign(z) * 0.04);
      bus.add(rub);
      if (z > 0) cutawayShell.push(rub);
    }
  }

  const frontLowerShell = busMesh(new THREE.BoxGeometry(0.16, 0.7, 2.36), bodyYellow, "city-school-bus-front-lower-shell");
  frontLowerShell.position.set(3.02, 1.22, 0);
  const frontHeader = busMesh(new THREE.BoxGeometry(0.16, 0.26, 2.36), bodyYellow, "city-school-bus-front-window-header");
  frontHeader.position.set(3.02, 2.86, 0);
  bus.add(frontLowerShell, frontHeader);
  for (const z of [-1.12, 1.12]) {
    const frontPillar = busMesh(new THREE.BoxGeometry(0.16, 1.28, 0.16), bodyBlack, "city-school-bus-front-window-pillar");
    frontPillar.position.set(3.02, 2.12, z);
    bus.add(frontPillar);
  }
  const frontWindshield = busMesh(new THREE.BoxGeometry(0.08, 1.22, 2.02), glass, "city-school-bus-front-windshield");
  frontWindshield.position.set(3.12, 2.1, 0);
  bus.add(frontWindshield);

  const windowXs = [-4.05, -2.95, -1.85, -0.75, 0.35, 1.45];
  for (const z of [-1.3, 1.3]) {
    windowXs.forEach((x) => {
      const isDoorOpening = z > 0 && x === 1.45;
      if (!isDoorOpening) {
        const pane = busMesh(new THREE.BoxGeometry(0.92, 1.12, 0.075), glass, "city-school-bus-side-window");
        pane.position.set(x, 2.16, z);
        bus.add(pane);
        if (z > 0) cutawayShell.push(pane);
      }
      const pillar = busMesh(new THREE.BoxGeometry(0.12, 1.22, 0.12), bodyBlack, "city-school-bus-window-pillar");
      pillar.position.set(x - 0.52, 2.18, z);
      bus.add(pillar);
      if (z > 0) cutawayShell.push(pillar);
    });
  }

  const doorFrame = busMesh(new THREE.BoxGeometry(1.42, 1.92, 0.1), bodyBlack, "city-school-bus-passenger-door-frame");
  doorFrame.position.set(2.15, 1.82, 1.31);
  bus.add(doorFrame);
  cutawayShell.push(doorFrame);
  for (const side of [-1, 1]) {
    const panel = busMesh(new THREE.BoxGeometry(0.58, 1.72, 0.08), glass, "city-school-bus-passenger-door-panel");
    panel.position.set(2.15 + side * 0.32, 1.84, 1.38);
    panel.userData.operable = true;
    bus.add(panel);
    cutawayShell.push(panel);
    doorPanels.push({ panel, closedX: panel.position.x, direction: side });
    const edge = busMesh(new THREE.BoxGeometry(0.05, 1.72, 0.09), amberWarning, "city-school-bus-passenger-door-safety-edge");
    edge.position.set(-side * 0.26, 0, 0.01);
    panel.add(edge);
  }

  // Build the rear as a framed body end rather than a single floating slab. The
  // emergency door pivots around its right-side hinge and sits flush inside the
  // corner panels, sill and roof header.
  const rearEnd = new THREE.Group();
  rearEnd.name = "city-school-bus-rear-body-end";
  rearEnd.userData.integratedBodyEnd = true;

  const rearLowerShell = busMesh(new THREE.BoxGeometry(0.18, 0.42, 2.36), bodyYellow, "city-school-bus-rear-lower-shell");
  rearLowerShell.position.set(-4.72, 0.86, 0);
  const rearHeader = busMesh(new THREE.BoxGeometry(0.18, 0.34, 2.36), bodyYellow, "city-school-bus-rear-window-header");
  rearHeader.position.set(-4.72, 2.84, 0);
  const rearRoofCap = busMesh(new THREE.BoxGeometry(0.55, 0.18, 2.48), roofWhite, "city-school-bus-rear-roof-cap");
  rearRoofCap.position.set(-4.565, 3.02, 0);
  const rearSill = busMesh(new THREE.BoxGeometry(0.2, 0.2, 1.76), bodyBlack, "city-school-bus-rear-door-sill");
  rearSill.position.set(-4.82, 0.96, 0);
  rearSill.userData.supportsEmergencyDoor = true;
  rearEnd.add(rearLowerShell, rearHeader, rearRoofCap, rearSill);

  for (const z of [-1.24, 1.24]) {
    const lowerReturn = busMesh(new THREE.BoxGeometry(0.54, 0.78, 0.12), bodyYellow, "city-school-bus-rear-side-return");
    lowerReturn.position.set(-4.47, 1.18, z);
    const upperReturn = busMesh(new THREE.BoxGeometry(0.54, 0.28, 0.13), bodyYellow, "city-school-bus-rear-side-return");
    upperReturn.position.set(-4.47, 2.88, z);
    rearEnd.add(lowerReturn, upperReturn);
  }

  for (const z of [-1.09, 1.09]) {
    const cornerPanel = busMesh(new THREE.BoxGeometry(0.2, 1.68, 0.18), bodyYellow, "city-school-bus-rear-corner-panel");
    cornerPanel.position.set(-4.72, 1.87, z);
    const cornerPillar = busMesh(new THREE.BoxGeometry(0.12, 1.58, 0.14), bodyBlack, "city-school-bus-rear-corner-pillar");
    cornerPillar.position.set(-4.83, 1.9, z * 0.91);
    rearEnd.add(cornerPanel, cornerPillar);
  }

  const rearDoorFrame = new THREE.Group();
  rearDoorFrame.name = "city-school-bus-rear-emergency-door-frame";
  for (const z of [-0.91, 0.91]) {
    const frameSide = busMesh(new THREE.BoxGeometry(0.12, 1.78, 0.08), bodyBlack, "city-school-bus-rear-emergency-door-frame-side");
    frameSide.position.set(-4.79, 1.88, z);
    rearDoorFrame.add(frameSide);
  }
  for (const y of [1.02, 2.74]) {
    const frameCross = busMesh(new THREE.BoxGeometry(0.12, 0.08, 1.9), bodyBlack, "city-school-bus-rear-emergency-door-frame-crossbar");
    frameCross.position.set(-4.79, y, 0);
    rearDoorFrame.add(frameCross);
  }
  rearEnd.add(rearDoorFrame);

  const rearDoor = new THREE.Group();
  rearDoor.name = "city-school-bus-rear-emergency-door";
  rearDoor.position.set(-4.88, 1.88, 0.91);
  rearDoor.userData.operable = true;
  rearDoor.userData.opensOutward = true;
  const rearDoorPanel = new THREE.Group();
  rearDoorPanel.name = "city-school-bus-rear-emergency-door-panel";
  const rearDoorLowerPanel = busMesh(new THREE.BoxGeometry(0.08, 0.65, 1.72), bodyYellow, "city-school-bus-rear-emergency-door-lower-panel");
  rearDoorLowerPanel.position.set(0, -0.485, -0.86);
  const rearDoorUpperPanel = busMesh(new THREE.BoxGeometry(0.08, 0.15, 1.72), bodyYellow, "city-school-bus-rear-emergency-door-upper-panel");
  rearDoorUpperPanel.position.set(0, 0.735, -0.86);
  for (const z of [-1.635, -0.085]) {
    const doorStile = busMesh(new THREE.BoxGeometry(0.08, 0.82, 0.17), bodyYellow, "city-school-bus-rear-emergency-door-stile");
    doorStile.position.set(0, 0.25, z);
    rearDoorPanel.add(doorStile);
  }
  rearDoorPanel.add(rearDoorLowerPanel, rearDoorUpperPanel);

  const rearWindowFrame = new THREE.Group();
  rearWindowFrame.name = "city-school-bus-rear-emergency-window-frame";
  for (const z of [-1.61, -0.11]) {
    const windowSide = busMesh(new THREE.BoxGeometry(0.035, 0.94, 0.05), bodyBlack, "city-school-bus-rear-emergency-window-frame-side");
    windowSide.position.set(-0.025, 0.25, z);
    rearWindowFrame.add(windowSide);
  }
  for (const y of [-0.2, 0.7]) {
    const windowCross = busMesh(new THREE.BoxGeometry(0.035, 0.05, 1.52), bodyBlack, "city-school-bus-rear-emergency-window-frame-crossbar");
    windowCross.position.set(-0.025, y, -0.86);
    rearWindowFrame.add(windowCross);
  }
  const rearWindowInset = busMesh(new THREE.BoxGeometry(0.04, 0.78, 1.34), glass, "city-school-bus-rear-emergency-window");
  rearWindowInset.position.set(-0.052, 0.25, -0.86);
  const rearHandle = busMesh(new THREE.BoxGeometry(0.055, 0.08, 0.4), chrome, "city-school-bus-rear-emergency-handle");
  rearHandle.position.set(-0.075, -0.43, -0.86);
  const emergencyLegend = busMesh(new THREE.BoxGeometry(0.035, 0.18, 0.76), destination, "city-school-bus-rear-emergency-legend");
  emergencyLegend.position.set(-0.07, -0.65, -0.86);
  emergencyLegend.userData.displayText = "紧急出口";
  rearDoor.add(rearDoorPanel, rearWindowFrame, rearWindowInset, rearHandle, emergencyLegend);

  for (const hingeY of [-0.5, 0, 0.5]) {
    const hinge = busMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), chrome, "city-school-bus-rear-emergency-door-hinge");
    hinge.position.set(-0.03, hingeY, -0.02);
    rearDoor.add(hinge);
  }
  rearEnd.add(rearDoor);
  bus.add(rearEnd);

  const wheelPlacements = [
    [3.28, -1.18],
    [3.28, 1.18],
    [-2.72, -1.18],
    [-2.72, 1.18],
    [-2.72, -0.84],
    [-2.72, 0.84],
  ] as const;
  for (const [x, z] of wheelPlacements) {
    const tire = busMesh(new THREE.CylinderGeometry(0.52, 0.52, 0.28, 14), rubber, "city-school-bus-wheel");
    tire.rotation.x = Math.PI * 0.5;
    tire.position.set(x, 0.54, z);
    const wheelHub = busMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), hub, "city-school-bus-wheel-hub");
    wheelHub.rotation.x = Math.PI * 0.5;
    wheelHub.position.copy(tire.position);
    bus.add(tire, wheelHub);
  }
  for (const x of [-2.72, 3.28]) {
    for (const z of [-1.26, 1.26]) {
      const fender = busMesh(new THREE.BoxGeometry(x < 0 ? 1.55 : 1.28, 0.42, 0.22), bodyBlack, "city-school-bus-wheel-fender");
      fender.position.set(x, 0.92, z);
      bus.add(fender);
      if (z > 0) cutawayShell.push(fender);
    }
  }
  for (const x of [-2.72, 3.28]) {
    for (const z of [-0.86, 0.86]) {
      const arch = busMesh(new THREE.BoxGeometry(1.42, 0.48, 0.28), interiorWall, "city-school-bus-interior-wheel-arch");
      arch.position.set(x, 1.08, z);
      bus.add(arch);
    }
  }

  const seatRows = [-3.85, -2.75, -1.65, -0.55, 0.55];
  const seatZs = [-0.88, -0.44, 0.44, 0.88];
  seatRows.forEach((x) => {
    seatZs.forEach((z) => {
      const seat = new THREE.Group();
      seat.name = "city-school-bus-passenger-seat";
      seat.position.set(x, 0, z);
      const cushion = busMesh(new THREE.BoxGeometry(0.46, 0.12, 0.4), seatGreen, "city-school-bus-seat-cushion");
      cushion.position.y = 1.38;
      const back = busMesh(new THREE.BoxGeometry(0.12, 0.82, 0.42), seatGreen, "city-school-bus-seat-back");
      back.position.set(-0.18, 1.78, 0);
      const headrest = busMesh(new THREE.BoxGeometry(0.14, 0.18, 0.32), seatGreen, "city-school-bus-seat-headrest");
      headrest.position.set(-0.18, 2.26, 0);
      const leg = busMesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), bodyBlack, "city-school-bus-seat-leg");
      leg.position.y = 1.2;
      const belt = busMesh(new THREE.BoxGeometry(0.04, 0.62, 0.05), lettering, "city-school-bus-seat-belt");
      belt.position.set(-0.08, 1.72, 0.16);
      seat.add(cushion, back, headrest, leg, belt);
      bus.add(seat);
    });
  });

  const driverSeat = new THREE.Group();
  driverSeat.name = "city-school-bus-driver-seat";
  driverSeat.position.set(2.48, 0, -0.72);
  const driverCushion = busMesh(new THREE.BoxGeometry(0.52, 0.14, 0.5), seatGreen, "city-school-bus-driver-seat-cushion");
  driverCushion.position.y = 1.42;
  const driverBack = busMesh(new THREE.BoxGeometry(0.14, 0.78, 0.52), seatGreen, "city-school-bus-driver-seat-back");
  driverBack.position.set(-0.2, 1.82, 0);
  driverSeat.add(driverCushion, driverBack);
  bus.add(driverSeat);

  const driverPartition = busMesh(new THREE.BoxGeometry(0.08, 1.55, 0.98), glass, "city-school-bus-driver-partition");
  driverPartition.position.set(1.72, 1.88, -0.72);
  const dash = busMesh(new THREE.BoxGeometry(0.78, 0.42, 0.98), dashboard, "city-school-bus-dashboard");
  dash.position.set(2.78, 1.48, -0.66);
  const instrument = busMesh(new THREE.BoxGeometry(0.08, 0.24, 0.42), screen, "city-school-bus-driver-instrument-screen");
  instrument.position.set(2.42, 1.68, -0.66);
  instrument.rotation.z = -0.22;
  const wheel = busMesh(new THREE.TorusGeometry(0.2, 0.032, 7, 16), bodyBlack, "city-school-bus-steering-wheel");
  wheel.rotation.y = Math.PI * 0.5;
  wheel.position.set(2.52, 1.68, -0.66);
  const accelerator = busMesh(new THREE.BoxGeometry(0.2, 0.05, 0.11), bodyBlack, "city-school-bus-driver-accelerator-pedal");
  accelerator.position.set(2.72, 1.12, -0.82);
  accelerator.rotation.z = -0.16;
  const brake = busMesh(new THREE.BoxGeometry(0.26, 0.05, 0.14), bodyBlack, "city-school-bus-driver-brake-pedal");
  brake.position.set(2.7, 1.13, -0.52);
  brake.rotation.z = -0.16;
  const extinguisher = busMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.48, 10), redLightMaterial, "city-school-bus-fire-extinguisher");
  extinguisher.position.set(1.82, 1.32, -1.08);
  bus.add(driverPartition, dash, instrument, wheel, accelerator, brake, extinguisher);

  const doorThreshold = busMesh(new THREE.BoxGeometry(1.28, 0.03, 0.3), amberWarning, "city-school-bus-door-safety-threshold");
  doorThreshold.position.set(2.15, 1.1, 1.05);
  bus.add(doorThreshold);

  for (const z of [-0.28, 0.28]) {
    const overhead = busMesh(new THREE.CylinderGeometry(0.03, 0.03, 6.4, 8), chrome, "city-school-bus-overhead-handrail");
    overhead.rotation.z = Math.PI * 0.5;
    overhead.position.set(-0.55, 2.62, z);
    bus.add(overhead);
  }
  for (let index = 0; index < 6; index += 1) {
    const handle = busMesh(new THREE.TorusGeometry(0.09, 0.022, 6, 10), chrome, "city-school-bus-grab-handle");
    handle.position.set(-3.4 + index * 0.95, 2.28, index % 2 ? -0.28 : 0.28);
    bus.add(handle);
  }
  for (const x of [-3.85, -1.65, 0.35, 1.85]) {
    const hammer = busMesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), redLightMaterial, "city-school-bus-emergency-hammer");
    hammer.position.set(x, 2.22, -1.18);
    hammer.rotation.z = -0.55;
    bus.add(hammer);
  }
  for (let index = 0; index < 8; index += 1) {
    const vent = busMesh(new THREE.BoxGeometry(0.42, 0.04, 0.16), bodyBlack, "city-school-bus-ceiling-air-vent");
    vent.position.set(-3.55 + index * 0.92, 2.9, index % 2 ? -0.55 : 0.55);
    bus.add(vent);
  }
  for (const x of [-3.9, -1.4, 0.8, 2.55]) {
    const camera = busMesh(new THREE.SphereGeometry(0.08, 7, 5), dashboard, "city-school-bus-cctv-camera");
    camera.position.set(x, 2.78, x % 3 ? -0.82 : 0.82);
    bus.add(camera);
  }

  const stopArm = new THREE.Group();
  stopArm.name = "city-school-bus-stop-arm-pivot";
  stopArm.position.set(2.92, 1.88, 1.34);
  const stopArmBar = busMesh(new THREE.BoxGeometry(0.62, 0.05, 0.05), bodyBlack, "city-school-bus-stop-arm-bar");
  stopArmBar.position.x = 0.3;
  const paddle = busMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 8), stopRed, "city-school-bus-stop-arm-paddle");
  paddle.rotation.x = Math.PI * 0.5;
  paddle.position.x = 0.58;
  const paddleWord = busMesh(new THREE.BoxGeometry(0.22, 0.08, 0.02), roofWhite, "city-school-bus-stop-arm-legend");
  paddleWord.position.set(0.58, 0, 0.03);
  stopArm.add(stopArmBar, paddle, paddleWord);
  bus.add(stopArm);

  const crossingGate = new THREE.Group();
  crossingGate.name = "city-school-bus-crossing-gate";
  crossingGate.position.set(4.78, 0.78, 0.18);
  const gateArm = busMesh(new THREE.BoxGeometry(0.05, 0.05, 1.42), bodyBlack, "city-school-bus-crossing-gate-arm");
  gateArm.position.z = 0.68;
  const gateTip = busMesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), amberWarning, "city-school-bus-crossing-gate-tip");
  gateTip.position.z = 1.38;
  crossingGate.add(gateArm, gateTip);
  bus.add(crossingGate);

  const frontDestination = busMesh(new THREE.BoxGeometry(0.08, 0.32, 1.22), destination, "city-school-bus-front-destination-display");
  frontDestination.position.set(3.12, 2.92, 0);
  frontDestination.userData.displayText = "校车";
  const sideLettering = busMesh(new THREE.BoxGeometry(1.65, 0.32, 0.05), lettering, "city-school-bus-side-lettering");
  sideLettering.position.set(-0.15, 1.55, 1.33);
  sideLettering.userData.displayText = "校车";
  bus.add(frontDestination, sideLettering);
  cutawayShell.push(sideLettering);

  const frontBumper = busMesh(new THREE.BoxGeometry(0.22, 0.28, 2.32), bodyBlack, "city-school-bus-front-bumper");
  frontBumper.position.set(4.78, 0.58, 0);
  const rearBumper = busMesh(new THREE.BoxGeometry(0.28, 0.3, 2.42), bodyBlack, "city-school-bus-rear-bumper");
  rearBumper.position.set(-4.9, 0.58, 0);
  rearBumper.userData.groundedToChassis = true;
  const frontLicensePlate = busMesh(new THREE.BoxGeometry(0.04, 0.16, 0.46), roofWhite, "city-school-bus-front-license-plate");
  frontLicensePlate.position.set(4.9, 0.7, 0);
  const rearLicensePlate = busMesh(new THREE.BoxGeometry(0.04, 0.17, 0.48), roofWhite, "city-school-bus-rear-license-plate");
  rearLicensePlate.position.set(-5.055, 0.78, 0);
  bus.add(frontBumper, rearBumper, frontLicensePlate, rearLicensePlate);

  const emergencyHatch = busMesh(new THREE.BoxGeometry(1.05, 0.1, 0.72), bodyBlack, "city-school-bus-roof-emergency-hatch");
  emergencyHatch.position.set(1.15, 3.16, 0);
  bus.add(emergencyHatch);

  // Warning lamps belong to the front/rear upper faces, not on top of the roof.
  const warningZs = [-0.9, -0.3, 0.3, 0.9];
  for (const x of [-4.84, 3.13]) {
    warningZs.forEach((z, index) => {
      const material = index === 0 || index === 3 ? redLightMaterial : amberWarning;
      const lamp = busMesh(new THREE.CylinderGeometry(0.105, 0.105, 0.075, 10), material, "city-school-bus-roof-warning-light");
      lamp.rotation.z = Math.PI * 0.5;
      lamp.position.set(x, 2.82, z);
      lamp.userData.mounting = x < 0 ? "rear-upper-face" : "front-upper-face";
      bus.add(lamp);
    });
  }

  for (const z of [-0.68, 0.68]) {
    const headlamp = busMesh(new THREE.BoxGeometry(0.1, 0.22, 0.28), lightMaterial, "city-school-bus-headlamp");
    headlamp.position.set(4.8, 0.86, z);
    const parkLamp = busMesh(new THREE.BoxGeometry(0.08, 0.1, 0.14), amberWarning, "city-school-bus-park-lamp");
    parkLamp.position.set(4.8, 1.06, z);
    const tailHousing = busMesh(new THREE.BoxGeometry(0.09, 0.68, 0.3), bodyBlack, "city-school-bus-rear-lamp-housing");
    tailHousing.position.set(-4.94, 1.27, z > 0 ? 0.91 : -0.91);
    const tail = busMesh(new THREE.BoxGeometry(0.075, 0.22, 0.22), redLightMaterial, "city-school-bus-tail-light");
    tail.position.set(-4.995, 1.45, z > 0 ? 0.91 : -0.91);
    const rearIndicator = busMesh(new THREE.BoxGeometry(0.075, 0.14, 0.22), amberWarning, "city-school-bus-rear-indicator");
    rearIndicator.position.set(-4.995, 1.22, z > 0 ? 0.91 : -0.91);
    const reverseLamp = busMesh(new THREE.BoxGeometry(0.075, 0.12, 0.22), lightMaterial, "city-school-bus-reverse-light");
    reverseLamp.position.set(-4.995, 1.04, z > 0 ? 0.91 : -0.91);
    bus.add(headlamp, parkLamp, tailHousing, tail, rearIndicator, reverseLamp);
  }

  const highBrakeLight = busMesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), redLightMaterial, "city-school-bus-high-mounted-brake-light");
  highBrakeLight.position.set(-4.97, 2.62, 0);
  const rearCamera = busMesh(new THREE.BoxGeometry(0.1, 0.12, 0.18), dashboard, "city-school-bus-rear-camera");
  rearCamera.position.set(-4.99, 2.73, 0);
  bus.add(highBrakeLight, rearCamera);
  for (const x of [-3.4, -1.6, 0.2, 1.8]) {
    const cabinLight = busMesh(new THREE.BoxGeometry(1.05, 0.05, 0.2), lightMaterial, "city-school-bus-interior-light");
    cabinLight.position.set(x, 2.92, 0);
    bus.add(cabinLight);
  }

  for (const z of [-1.58, 1.58]) {
    const arm = busMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.52, 7), bodyBlack, "city-school-bus-mirror-arm");
    arm.rotation.x = Math.PI * 0.5;
    arm.position.set(2.95, 2.18, z * 0.82);
    const mirror = busMesh(new THREE.BoxGeometry(0.12, 0.48, 0.22), glass, "city-school-bus-side-mirror");
    mirror.position.set(2.95, 2.18, z);
    bus.add(arm, mirror);
  }
  for (const z of [-0.95, 0.95]) {
    const crossView = busMesh(new THREE.SphereGeometry(0.11, 8, 6), chrome, "city-school-bus-cross-view-mirror");
    crossView.position.set(4.35, 1.42, z);
    bus.add(crossView);
  }

  const interiorLights: THREE.PointLight[] = [];
  for (const x of [-2.8, -0.4, 1.8]) {
    const light = new THREE.PointLight(0xffd78a, 0, 4.0, 1.8);
    light.name = "city-school-bus-cabin-point-light";
    light.position.set(x, 2.55, 0);
    interiorLights.push(light);
    bus.add(light);
  }

  bus.userData = {
    modelType: "school-bus",
    generatedLocally: true,
    dimensions: new THREE.Vector3(9.6, 3.2, 2.5),
    passengerSeatCount: seatRows.length * seatZs.length,
    doorCount: 2,
    wheelCount: 6,
    warningLightCount: 8,
    setDoorsOpen(open: boolean) {
      doorPanels.forEach(({ panel, closedX, direction }) => {
        panel.position.x = closedX + (open ? direction * 0.28 : 0);
      });
      rearDoor.rotation.y = open ? 1.15 : 0;
    },
    setStopArmExtended(extended: boolean) {
      stopArm.rotation.y = extended ? -Math.PI * 0.5 : 0;
      stopArm.userData.extended = extended;
      crossingGate.rotation.y = extended ? -Math.PI * 0.5 : 0;
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
      amberWarning.emissiveIntensity = powered ? 3.4 : 0.35;
      interiorLights.forEach((light) => { light.intensity = powered ? 2.6 : 0; });
    },
  };
  bus.userData.setDoorsOpen(false);
  bus.userData.setStopArmExtended(false);
  bus.userData.setInteriorCutaway(false);
  bus.userData.setPowered(false);
  return bus;
}
