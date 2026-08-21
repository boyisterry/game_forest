import * as THREE from "three";

export type ResidentialGateVariant = "standard" | "premium" | "villa";

export type ResidentialGateModel = THREE.Group & {
  userData: {
    mapLayer: "exterior";
    modelType: `residential-gate-${ResidentialGateVariant}`;
    generatedLocally: true;
    gateVariant: ResidentialGateVariant;
    moduleGridMeters: 1;
    footprintCells: { x: number; z: number };
    frontDirection: "+z";
    vehicleLaneCount: number;
    pedestrianLaneCount: number;
    vehicleClearWidthMeters: number;
    pedestrianClearWidthMeters: number;
    gateOpen: boolean;
    powered: boolean;
    setGateOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

type GateMaterials = {
  paving: THREE.MeshStandardMaterial;
  pavingLine: THREE.MeshStandardMaterial;
  lightLens: THREE.MeshStandardMaterial;
};

type GateBuildContext = {
  group: ResidentialGateModel;
  materials: GateMaterials;
  gatePivots: Array<{ pivot: THREE.Group; closed: THREE.Vector3; open: THREE.Vector3 }>;
  lights: THREE.PointLight[];
};

function gateMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  collisionRole: "solid" | "rideable-surface" | "ignore" = "solid",
  mapLayer: "exterior" | "micro-detail" | "animated-detail" = "exterior",
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = collisionRole === "solid";
  object.receiveShadow = collisionRole !== "ignore";
  object.userData.mapCollisionRole = collisionRole;
  object.userData.mapLayer = mapLayer;
  if (collisionRole === "rideable-surface") object.userData.surfaceProfileId = "site-surface";
  return object;
}

function box(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  name: string,
  collisionRole: "solid" | "rideable-surface" | "ignore" = "solid",
  mapLayer: "exterior" | "micro-detail" | "animated-detail" = "exterior",
) {
  const object = gateMesh(new THREE.BoxGeometry(...size), material, name, collisionRole, mapLayer);
  object.position.set(...position);
  return object;
}

function addModularPaving(
  group: THREE.Group,
  width: number,
  depth: number,
  materials: GateMaterials,
  prefix: string,
) {
  const surface = box(
    [width, 0.12, depth],
    [0, 0.06, 0],
    materials.paving,
    `${prefix}-modular-paving`,
    "rideable-surface",
  );
  surface.userData.gridModuleMeters = 1;
  surface.userData.footprintCells = { x: width, z: depth };
  group.add(surface);

  for (let x = -width * 0.5 + 1; x < width * 0.5; x += 1) {
    group.add(box(
      [0.018, 0.008, depth - 0.08],
      [x, 0.124, 0],
      materials.pavingLine,
      `${prefix}-grid-joint-x`,
      "ignore",
      "micro-detail",
    ));
  }
  for (let z = -depth * 0.5 + 1; z < depth * 0.5; z += 1) {
    group.add(box(
      [width - 0.08, 0.008, 0.018],
      [0, 0.124, z],
      materials.pavingLine,
      `${prefix}-grid-joint-z`,
      "ignore",
      "micro-detail",
    ));
  }
}

function addLaneMarking(
  group: THREE.Group,
  x: number,
  width: number,
  depth: number,
  material: THREE.Material,
  prefix: string,
  role: "vehicle" | "pedestrian",
) {
  const lane = box(
    [width, 0.012, depth],
    [x, 0.126, 0],
    material,
    `${prefix}-${role}-lane-surface`,
    "rideable-surface",
  );
  lane.userData.laneRole = role;
  lane.userData.clearWidthMeters = width;
  lane.userData.gridAligned = true;
  group.add(lane);
}

function addLamp(
  context: GateBuildContext,
  position: THREE.Vector3,
  housingMaterial: THREE.Material,
  prefix: string,
  style: "wall" | "lantern" = "wall",
) {
  const housing = style === "lantern"
    ? gateMesh(new THREE.CylinderGeometry(0.24, 0.31, 0.5, 8), housingMaterial, `${prefix}-lamp-housing`, "ignore", "micro-detail")
    : box([0.58, 0.2, 0.32], [0, 0, 0], housingMaterial, `${prefix}-lamp-housing`, "ignore", "micro-detail");
  housing.position.copy(position);
  const lens = style === "lantern"
    ? gateMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 8), context.materials.lightLens, `${prefix}-lamp-lens`, "ignore", "micro-detail")
    : box([0.4, 0.08, 0.22], [0, 0, 0], context.materials.lightLens, `${prefix}-lamp-lens`, "ignore", "micro-detail");
  lens.position.copy(position).add(new THREE.Vector3(0, style === "lantern" ? 0 : -0.13, 0.08));
  const light = new THREE.PointLight(0xffc875, 0, style === "lantern" ? 8 : 10, 2);
  light.name = `${prefix}-point-light`;
  light.position.copy(position).add(new THREE.Vector3(0, -0.12, 0.5));
  light.castShadow = false;
  context.group.add(housing, lens, light);
  context.lights.push(light);
}

function addCamera(
  group: THREE.Group,
  position: [number, number, number],
  rotationY: number,
  metal: THREE.Material,
  lens: THREE.Material,
  prefix: string,
) {
  const camera = new THREE.Group();
  camera.name = `${prefix}-license-camera`;
  camera.position.set(...position);
  camera.rotation.y = rotationY;
  const arm = box([0.12, 0.12, 0.75], [0, 0, 0.22], metal, `${prefix}-camera-arm`, "ignore", "micro-detail");
  const body = box([0.38, 0.28, 0.58], [0, 0, 0.72], metal, `${prefix}-camera-body`, "ignore", "micro-detail");
  const glass = gateMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), lens, `${prefix}-camera-lens`, "ignore", "micro-detail");
  glass.rotation.x = Math.PI * 0.5;
  glass.position.set(0, 0, 1.02);
  camera.add(arm, body, glass);
  group.add(camera);
}

function addIntercom(
  group: THREE.Group,
  position: [number, number, number],
  panel: THREE.Material,
  lens: THREE.Material,
  prefix: string,
) {
  const intercom = box([0.42, 0.72, 0.12], position, panel, `${prefix}-intercom`, "ignore", "micro-detail");
  const screen = box([0.26, 0.18, 0.025], [position[0], position[1] + 0.13, position[2] + 0.072], lens, `${prefix}-intercom-screen`, "ignore", "micro-detail");
  const button = gateMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), lens, `${prefix}-intercom-button`, "ignore", "micro-detail");
  button.rotation.x = Math.PI * 0.5;
  button.position.set(position[0], position[1] - 0.18, position[2] + 0.08);
  group.add(intercom, screen, button);
}

function addSign(
  group: THREE.Group,
  position: [number, number, number],
  size: [number, number, number],
  faceMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  prefix: string,
  emblem: "bars" | "diamond" | "leaf",
) {
  group.add(box(size, position, faceMaterial, `${prefix}-name-sign`, "ignore", "micro-detail"));
  const z = position[2] + size[2] * 0.5 + 0.025;
  if (emblem === "bars") {
    for (let index = 0; index < 4; index += 1) {
      group.add(box([0.72, 0.06, 0.035], [position[0] - 1.35 + index * 0.9, position[1], z], trimMaterial, `${prefix}-sign-letter-bar`, "ignore", "micro-detail"));
    }
  } else if (emblem === "diamond") {
    const diamond = box([0.58, 0.58, 0.035], [position[0], position[1], z], trimMaterial, `${prefix}-sign-emblem`, "ignore", "micro-detail");
    diamond.rotation.z = Math.PI * 0.25;
    group.add(diamond);
  } else {
    for (const side of [-1, 1]) {
      const leaf = box([0.34, 0.7, 0.035], [position[0] + side * 0.18, position[1], z], trimMaterial, `${prefix}-sign-leaf`, "ignore", "micro-detail");
      leaf.rotation.z = side * 0.48;
      group.add(leaf);
    }
  }
}

function createContext(variant: ResidentialGateVariant, width: number, depth: number): GateBuildContext {
  const group = new THREE.Group() as ResidentialGateModel;
  group.name = `city-residential-gate-${variant}-lowpoly`;
  const materials = {
    paving: new THREE.MeshStandardMaterial({ color: 0xb7b3aa, roughness: 0.96 }),
    pavingLine: new THREE.MeshStandardMaterial({ color: 0x817f79, roughness: 0.98 }),
    lightLens: new THREE.MeshStandardMaterial({
      color: 0xffe0a0,
      emissive: 0xffa83d,
      emissiveIntensity: 0.16,
      roughness: 0.3,
    }),
  };
  addModularPaving(group, width, depth, materials, `residential-gate-${variant}`);
  return { group, materials, gatePivots: [], lights: [] };
}

function finishGate(
  context: GateBuildContext,
  variant: ResidentialGateVariant,
  footprint: { x: number; z: number },
  vehicleLaneCount: number,
  pedestrianLaneCount: number,
  vehicleClearWidthMeters: number,
  pedestrianClearWidthMeters: number,
) {
  const setGateOpen = (open: boolean) => {
    context.gatePivots.forEach(({ pivot, closed, open: openRotation }) => {
      const rotation = open ? openRotation : closed;
      pivot.rotation.set(rotation.x, rotation.y, rotation.z);
      pivot.userData.state = open ? "open" : "closed";
    });
    context.group.userData.gateOpen = open;
  };
  const setPowered = (powered: boolean) => {
    context.materials.lightLens.emissiveIntensity = powered ? 3.4 : 0.16;
    context.lights.forEach((light) => {
      light.visible = powered;
      light.intensity = powered ? 3.2 : 0;
    });
    context.group.userData.powered = powered;
  };
  context.group.userData = {
    mapLayer: "exterior",
    modelType: `residential-gate-${variant}`,
    generatedLocally: true,
    gateVariant: variant,
    moduleGridMeters: 1,
    footprintCells: footprint,
    frontDirection: "+z",
    vehicleLaneCount,
    pedestrianLaneCount,
    vehicleClearWidthMeters,
    pedestrianClearWidthMeters,
    gateOpen: false,
    powered: false,
    setGateOpen,
    setPowered,
  };
  setGateOpen(false);
  setPowered(false);
  return context.group;
}

function addBarrierArm(
  context: GateBuildContext,
  x: number,
  direction: 1 | -1,
  length: number,
  y: number,
  material: THREE.Material,
  stripe: THREE.Material,
  prefix: string,
) {
  const pivot = new THREE.Group();
  pivot.name = `${prefix}-vehicle-barrier-pivot`;
  pivot.position.set(x, y, 1.1);
  pivot.userData.mapLayer = "animated-detail";
  const arm = box([length, 0.16, 0.18], [direction * length * 0.5, 0, 0], material, `${prefix}-vehicle-barrier-arm`, "solid", "animated-detail");
  pivot.add(arm);
  for (let index = 0; index < Math.floor(length); index += 1) {
    pivot.add(box([0.42, 0.19, 0.2], [direction * (0.55 + index), 0, 0], stripe, `${prefix}-barrier-reflector`, "ignore", "micro-detail"));
  }
  context.group.add(pivot);
  context.gatePivots.push({
    pivot,
    closed: new THREE.Vector3(0, 0, 0),
    open: new THREE.Vector3(0, 0, direction * Math.PI * 0.48),
  });
}

export function buildLowPolyStandardResidentialGate(): ResidentialGateModel {
  const context = createContext("standard", 20, 6);
  const { group } = context;
  const prefix = "residential-gate-standard";
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.92 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9c654f, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x34434a, roughness: 0.62, metalness: 0.42 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc84e42, roughness: 0.72 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x78aeb7, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.76 });
  const lane = new THREE.MeshStandardMaterial({ color: 0x777b7b, roughness: 0.96 });
  const walk = new THREE.MeshStandardMaterial({ color: 0xd4c6a8, roughness: 0.94 });

  addLaneMarking(group, -4.75, 5.5, 5.6, lane, prefix, "vehicle");
  addLaneMarking(group, 2.75, 5.5, 5.6, lane, prefix, "vehicle");
  addLaneMarking(group, 7.5, 2, 5.6, walk, prefix, "pedestrian");

  group.add(
    box([1, 4.3, 1.2], [-8.5, 2.27, 0], brick, `${prefix}-outer-pier`),
    box([1, 4.3, 1.2], [6, 2.27, 0], brick, `${prefix}-lane-pier`),
    box([1, 4.3, 1.2], [9, 2.27, 0], brick, `${prefix}-outer-pier`),
    box([14.5, 0.42, 4.8], [-1.25, 4.55, 0], metal, `${prefix}-vehicle-canopy`),
    box([3.5, 0.3, 3.8], [7.5, 4.3, 0], concrete, `${prefix}-pedestrian-canopy`),
  );
  for (const x of [-8.5, 6, 9]) {
    group.add(box([1.18, 0.25, 1.38], [x, 4.54, 0], concrete, `${prefix}-pier-cap`));
  }

  const booth = new THREE.Group();
  booth.name = `${prefix}-security-booth`;
  booth.position.set(-1, 0.12, -0.15);
  booth.add(
    box([2, 0.18, 3], [0, 0.09, 0], concrete, `${prefix}-booth-foundation`),
    box([2, 0.55, 3], [0, 0.455, 0], brick, `${prefix}-booth-plinth`),
    box([2, 0.28, 3.2], [0, 3.08, 0], metal, `${prefix}-booth-roof`),
    box([1.82, 2.18, 0.08], [0, 1.75, 1.46], glass, `${prefix}-booth-window`, "ignore"),
    box([1.82, 2.18, 0.08], [0, 1.75, -1.46], glass, `${prefix}-booth-window`, "ignore"),
    box([0.08, 2.18, 2.72], [-0.96, 1.75, 0], glass, `${prefix}-booth-window`, "ignore"),
    box([0.08, 2.18, 2.72], [0.96, 1.75, 0], glass, `${prefix}-booth-window`, "ignore"),
    box([1.15, 0.7, 0.55], [0, 1.05, 0.8], concrete, `${prefix}-booth-desk`, "ignore", "micro-detail"),
  );
  group.add(booth);

  addBarrierArm(context, -2.1, -1, 5.3, 1.16, metal, red, prefix);
  addBarrierArm(context, 0.1, 1, 5.2, 1.16, metal, red, prefix);

  const pedPivot = new THREE.Group();
  pedPivot.name = `${prefix}-pedestrian-gate-pivot`;
  pedPivot.position.set(6.5, 0.15, 0.8);
  pedPivot.userData.mapLayer = "animated-detail";
  pedPivot.add(
    box([1.9, 0.1, 0.1], [0.95, 0.06, 0], metal, `${prefix}-pedestrian-gate-bottom-rail`, "solid", "animated-detail"),
    box([1.9, 0.1, 0.1], [0.95, 1.24, 0], metal, `${prefix}-pedestrian-gate-top-rail`, "solid", "animated-detail"),
    box([0.1, 1.28, 0.1], [0.05, 0.65, 0], metal, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
    box([0.1, 1.28, 0.1], [1.85, 0.65, 0], metal, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
  );
  for (let x = 0.35; x < 1.8; x += 0.38) {
    pedPivot.add(box([0.055, 1.12, 0.07], [x, 0.65, 0], metal, `${prefix}-pedestrian-gate-picket`, "solid", "animated-detail"));
  }
  group.add(pedPivot);
  context.gatePivots.push({ pivot: pedPivot, closed: new THREE.Vector3(), open: new THREE.Vector3(0, -Math.PI * 0.48, 0) });

  addSign(group, [-1.25, 4.58, 2.25], [5.6, 0.9, 0.12], brick, concrete, prefix, "bars");
  addIntercom(group, [6.62, 1.35, 0.72], metal, context.materials.lightLens, prefix);
  addCamera(group, [-1.9, 3.48, 0.2], Math.PI, metal, glass, prefix);
  addCamera(group, [-0.1, 3.48, 0.2], Math.PI, metal, glass, prefix);
  addLamp(context, new THREE.Vector3(-7.5, 4.15, 1.8), metal, prefix);
  addLamp(context, new THREE.Vector3(4.9, 4.15, 1.8), metal, prefix);

  return finishGate(context, "standard", { x: 20, z: 6 }, 2, 1, 5.5, 2);
}

function addPremiumSlidingLeaf(
  context: GateBuildContext,
  laneCenter: number,
  direction: 1 | -1,
  bronze: THREE.Material,
  glass: THREE.Material,
  prefix: string,
) {
  const pivot = new THREE.Group();
  pivot.name = `${prefix}-sliding-gate-pivot`;
  pivot.position.set(laneCenter, 0.15, 0.85);
  pivot.userData.mapLayer = "animated-detail";
  const infill = box([5.35, 1.18, 0.06], [0, 0.78, 0.02], glass, `${prefix}-sliding-gate-glass`, "ignore", "animated-detail");
  pivot.add(
    box([5.7, 0.12, 0.14], [0, 0.08, 0], bronze, `${prefix}-sliding-gate-bottom-rail`, "solid", "animated-detail"),
    box([5.7, 0.12, 0.14], [0, 1.48, 0], bronze, `${prefix}-sliding-gate-top-rail`, "solid", "animated-detail"),
    box([0.12, 1.52, 0.14], [-2.79, 0.78, 0], bronze, `${prefix}-sliding-gate-side-rail`, "solid", "animated-detail"),
    box([0.12, 1.52, 0.14], [2.79, 0.78, 0], bronze, `${prefix}-sliding-gate-side-rail`, "solid", "animated-detail"),
    infill,
  );
  for (let x = -2.45; x <= 2.45; x += 0.7) {
    pivot.add(box([0.055, 1.22, 0.11], [x, 0.78, 0.05], bronze, `${prefix}-sliding-gate-fin`, "ignore", "micro-detail"));
  }
  context.group.add(pivot);
  context.gatePivots.push({
    pivot,
    closed: new THREE.Vector3(0, 0, 0),
    open: new THREE.Vector3(0, 0, 0),
  });
  pivot.userData.slideDirection = direction;
  pivot.userData.motionType = "telescopic-slide";
  pivot.userData.closedX = laneCenter;
  pivot.userData.openX = laneCenter + direction * 2.35;
}

export function buildLowPolyPremiumResidentialGate(): ResidentialGateModel {
  const context = createContext("premium", 24, 8);
  const { group } = context;
  const prefix = "residential-gate-premium";
  const limestone = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.78 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x283338, roughness: 0.52, metalness: 0.36 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x9b7443, roughness: 0.48, metalness: 0.62 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x76a8ad, roughness: 0.16, transmission: 0.24, transparent: true, opacity: 0.72 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4f9eaa, emissive: 0x183a43, emissiveIntensity: 0.22, roughness: 0.22, transparent: true, opacity: 0.82 });
  const road = new THREE.MeshStandardMaterial({ color: 0x535b5d, roughness: 0.94 });
  const walk = new THREE.MeshStandardMaterial({ color: 0xcfc3aa, roughness: 0.9 });

  addLaneMarking(group, -4.8, 6.2, 7.6, road, prefix, "vehicle");
  addLaneMarking(group, 4.8, 6.2, 7.6, road, prefix, "vehicle");
  addLaneMarking(group, -10.25, 2.1, 7.6, walk, prefix, "pedestrian");
  addLaneMarking(group, 10.25, 2.1, 7.6, walk, prefix, "pedestrian");

  const central = new THREE.Group();
  central.name = `${prefix}-concierge-pavilion`;
  central.position.set(0, 0.12, -0.15);
  central.add(
    box([3.2, 0.22, 4.5], [0, 0.11, 0], limestone, `${prefix}-pavilion-foundation`),
    box([3.2, 0.52, 4.5], [0, 0.48, 0], charcoal, `${prefix}-pavilion-plinth`),
    box([2.95, 2.35, 0.08], [0, 1.9, 2.15], glass, `${prefix}-pavilion-glass`, "ignore"),
    box([2.95, 2.35, 0.08], [0, 1.9, -2.15], glass, `${prefix}-pavilion-glass`, "ignore"),
    box([0.08, 2.35, 4.1], [-1.48, 1.9, 0], glass, `${prefix}-pavilion-glass`, "ignore"),
    box([0.08, 2.35, 4.1], [1.48, 1.9, 0], glass, `${prefix}-pavilion-glass`, "ignore"),
    box([3.5, 0.3, 4.9], [0, 3.25, 0], bronze, `${prefix}-pavilion-roof`),
    box([1.8, 0.72, 0.62], [0, 1.08, 1.25], limestone, `${prefix}-concierge-desk`, "ignore", "micro-detail"),
    box([0.55, 0.28, 0.05], [0, 1.38, 1.58], context.materials.lightLens, `${prefix}-visitor-screen`, "ignore", "micro-detail"),
  );
  group.add(central);

  for (const side of [-1, 1]) {
    const towerX = side * 8.6;
    group.add(
      box([1.1, 5.8, 1.4], [towerX, 3.02, 0], limestone, `${prefix}-monument-pier`),
      box([1.35, 0.25, 1.65], [towerX, 5.95, 0], bronze, `${prefix}-pier-cap`),
      box([0.3, 4.2, 0.12], [towerX - side * 0.58, 3.2, 0.75], bronze, `${prefix}-vertical-fin`, "ignore", "micro-detail"),
    );
    const planter = box([2.1, 0.65, 2.1], [side * 10.45, 0.445, -2.5], limestone, `${prefix}-landscape-planter`, "solid");
    const pool = gateMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20), water, `${prefix}-reflecting-pool`, "ignore", "micro-detail");
    pool.position.set(side * 10.45, 0.82, -2.5);
    group.add(planter, pool);
  }
  group.add(
    box([18.3, 0.38, 5.8], [0, 6.05, 0], charcoal, `${prefix}-floating-canopy`),
    box([16.8, 0.16, 5.2], [0, 5.78, 0], bronze, `${prefix}-canopy-soffit`, "ignore", "micro-detail"),
  );
  for (const x of [-8.2, -6.8, 6.8, 8.2]) {
    group.add(box([0.18, 5.45, 0.35], [x, 2.845, -1.9], bronze, `${prefix}-canopy-column`));
  }

  addPremiumSlidingLeaf(context, -4.8, -1, bronze, glass, prefix);
  addPremiumSlidingLeaf(context, 4.8, 1, bronze, glass, prefix);

  for (const side of [-1, 1]) {
    const pedPivot = new THREE.Group();
    pedPivot.name = `${prefix}-pedestrian-gate-pivot`;
    pedPivot.position.set(side * 9.2, 0.15, 0.85);
    pedPivot.userData.mapLayer = "animated-detail";
    const leafCenter = side * 1.025;
    pedPivot.add(
      box([2.05, 0.12, 0.12], [leafCenter, 0.08, 0], bronze, `${prefix}-pedestrian-gate-bottom-rail`, "solid", "animated-detail"),
      box([2.05, 0.12, 0.12], [leafCenter, 1.52, 0], bronze, `${prefix}-pedestrian-gate-top-rail`, "solid", "animated-detail"),
      box([0.12, 1.58, 0.12], [side * 0.06, 0.8, 0], bronze, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
      box([0.12, 1.58, 0.12], [side * 1.99, 0.8, 0], bronze, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
      box([1.76, 1.28, 0.055], [leafCenter, 0.8, 0.025], glass, `${prefix}-pedestrian-gate-glass`, "ignore", "animated-detail"),
    );
    group.add(pedPivot);
    context.gatePivots.push({ pivot: pedPivot, closed: new THREE.Vector3(), open: new THREE.Vector3(0, -side * Math.PI * 0.48, 0) });
    addIntercom(group, [side * 9.1, 1.45, 1.25], charcoal, context.materials.lightLens, `${prefix}-${side < 0 ? "west" : "east"}`);
    addLamp(context, new THREE.Vector3(side * 8.6, 5.25, 1), charcoal, prefix);
  }
  addSign(group, [0, 6.08, 2.82], [4.8, 1, 0.12], charcoal, bronze, prefix, "diamond");
  addCamera(group, [-1.3, 3.65, 1.2], Math.PI, charcoal, glass, `${prefix}-entry`);
  addCamera(group, [1.3, 3.65, 1.2], Math.PI, charcoal, glass, `${prefix}-exit`);

  const model = finishGate(context, "premium", { x: 24, z: 8 }, 2, 2, 6.2, 2.1);
  const baseSetGateOpen = model.userData.setGateOpen;
  model.userData.setGateOpen = (open: boolean) => {
    baseSetGateOpen(open);
    context.gatePivots.forEach(({ pivot }) => {
      if (typeof pivot.userData.openX === "number") {
        pivot.position.x = open ? pivot.userData.openX : pivot.userData.closedX;
        pivot.scale.x = open ? 0.16 : 1;
      }
    });
    model.userData.gateOpen = open;
  };
  model.userData.setGateOpen(false);
  return model;
}

function addVillaIronLeaf(
  context: GateBuildContext,
  pivotX: number,
  direction: 1 | -1,
  iron: THREE.Material,
  gold: THREE.Material,
  prefix: string,
) {
  const pivot = new THREE.Group();
  pivot.name = `${prefix}-swing-gate-pivot`;
  pivot.position.set(pivotX, 0.15, 0.75);
  pivot.userData.mapLayer = "animated-detail";
  const width = 3;
  pivot.add(
    box([width, 0.12, 0.14], [direction * width * 0.5, 0.08, 0], iron, `${prefix}-swing-gate-bottom-rail`, "solid", "animated-detail"),
    box([width, 0.12, 0.14], [direction * width * 0.5, 1.65, 0], iron, `${prefix}-swing-gate-top-rail`, "solid", "animated-detail"),
  );
  for (let index = 0; index <= 6; index += 1) {
    const x = direction * (0.2 + index * 0.42);
    const picketHeight = 1.75 + Math.sin((index / 6) * Math.PI) * 0.42;
    const picket = box([0.08, picketHeight, 0.09], [x, picketHeight * 0.5, 0], iron, `${prefix}-gate-picket`, "solid", "animated-detail");
    const tip = gateMesh(new THREE.ConeGeometry(0.1, 0.28, 6), gold, `${prefix}-gate-picket-finial`, "ignore", "micro-detail");
    tip.position.set(x, 1.9 + Math.sin((index / 6) * Math.PI) * 0.42, 0);
    pivot.add(picket, tip);
  }
  context.group.add(pivot);
  context.gatePivots.push({ pivot, closed: new THREE.Vector3(), open: new THREE.Vector3(0, direction * Math.PI * 0.47, 0) });
}

export function buildLowPolyVillaResidentialGate(): ResidentialGateModel {
  const context = createContext("villa", 18, 7);
  const { group } = context;
  const prefix = "residential-gate-villa";
  const stone = new THREE.MeshStandardMaterial({ color: 0xb5a78f, roughness: 0.94 });
  const stucco = new THREE.MeshStandardMaterial({ color: 0xe4ddcc, roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x684737, roughness: 0.82 });
  const tile = new THREE.MeshStandardMaterial({ color: 0x7b3d32, roughness: 0.88 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x202a2a, roughness: 0.58, metalness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb68b42, roughness: 0.45, metalness: 0.68 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8eb1ad, roughness: 0.22, transparent: true, opacity: 0.78 });
  const road = new THREE.MeshStandardMaterial({ color: 0x716d65, roughness: 0.98 });
  const walk = new THREE.MeshStandardMaterial({ color: 0xc8b58f, roughness: 0.94 });

  addLaneMarking(group, 0, 6, 6.6, road, prefix, "vehicle");
  addLaneMarking(group, 5.5, 2, 6.6, walk, prefix, "pedestrian");

  for (const x of [-3.5, 3.5, 7.5]) {
    group.add(
      box([1, 4.2, 1.4], [x, 2.22, 0], stone, `${prefix}-stone-pier`),
      box([1.25, 0.22, 1.65], [x, 4.43, 0], stucco, `${prefix}-pier-cap`),
    );
    const cap = gateMesh(new THREE.ConeGeometry(0.72, 0.62, 4), tile, `${prefix}-pier-roof`);
    cap.rotation.y = Math.PI * 0.25;
    cap.position.set(x, 4.84, 0);
    group.add(cap);
    addLamp(context, new THREE.Vector3(x, 4.9, 0.55), iron, prefix, "lantern");
  }
  group.add(
    box([2, 2.4, 1], [-8, 1.32, 0], stone, `${prefix}-estate-wall`),
    box([1, 2.4, 1], [8.5, 1.32, 0], stone, `${prefix}-estate-wall`),
  );

  const guardhouse = new THREE.Group();
  guardhouse.name = `${prefix}-guardhouse`;
  guardhouse.position.set(-6, 0.12, -0.25);
  guardhouse.add(
    box([3.2, 0.22, 4.4], [0, 0.11, 0], stone, `${prefix}-guardhouse-foundation`),
    box([3, 0.6, 4.2], [0, 0.52, 0], stone, `${prefix}-guardhouse-plinth`),
    box([3, 2.35, 0.12], [0, 1.95, 2], glass, `${prefix}-guardhouse-window`, "ignore"),
    box([3, 2.35, 0.12], [0, 1.95, -2], stucco, `${prefix}-guardhouse-back-wall`),
    box([0.12, 2.35, 4], [-1.44, 1.95, 0], stucco, `${prefix}-guardhouse-side-wall`),
    box([0.12, 2.35, 4], [1.44, 1.95, 0], glass, `${prefix}-guardhouse-window`, "ignore"),
    box([1.45, 0.72, 0.62], [0, 1.05, 1.15], timber, `${prefix}-guardhouse-desk`, "ignore", "micro-detail"),
  );
  const roof = gateMesh(new THREE.ConeGeometry(1.9, 1.35, 4), tile, `${prefix}-guardhouse-hip-roof`);
  roof.rotation.y = Math.PI * 0.25;
  roof.position.y = 3.8;
  guardhouse.add(roof);
  group.add(guardhouse);

  addVillaIronLeaf(context, -3, 1, iron, gold, prefix);
  addVillaIronLeaf(context, 3, -1, iron, gold, prefix);

  const pedestrian = new THREE.Group();
  pedestrian.name = `${prefix}-pedestrian-gate-pivot`;
  pedestrian.position.set(4.5, 0.15, 0.75);
  pedestrian.userData.mapLayer = "animated-detail";
  pedestrian.add(
    box([2, 0.12, 0.12], [1, 0.08, 0], iron, `${prefix}-pedestrian-gate-bottom-rail`, "solid", "animated-detail"),
    box([2, 0.12, 0.12], [1, 1.72, 0], iron, `${prefix}-pedestrian-gate-top-rail`, "solid", "animated-detail"),
    box([0.1, 1.78, 0.12], [0.05, 0.9, 0], iron, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
    box([0.1, 1.78, 0.12], [1.95, 0.9, 0], iron, `${prefix}-pedestrian-gate-side-rail`, "solid", "animated-detail"),
  );
  for (const x of [0.35, 0.75, 1.15, 1.55]) {
    pedestrian.add(box([0.065, 1.55, 0.09], [x, 0.9, 0], iron, `${prefix}-pedestrian-gate-picket`, "solid", "animated-detail"));
    const finial = gateMesh(new THREE.ConeGeometry(0.095, 0.25, 6), gold, `${prefix}-pedestrian-gate-finial`, "ignore", "micro-detail");
    finial.position.set(x, 1.78, 0);
    pedestrian.add(finial);
  }
  group.add(pedestrian);
  context.gatePivots.push({ pivot: pedestrian, closed: new THREE.Vector3(), open: new THREE.Vector3(0, -Math.PI * 0.48, 0) });

  addSign(group, [-7.98, 1.72, 0.53], [1.65, 0.82, 0.08], timber, gold, prefix, "leaf");
  addIntercom(group, [4.1, 1.42, 0.78], iron, context.materials.lightLens, prefix);
  addCamera(group, [-3.5, 3.4, 0.55], Math.PI, iron, glass, prefix);

  return finishGate(context, "villa", { x: 18, z: 7 }, 1, 1, 6, 2);
}
