import * as THREE from "three";
import { applySceneShadowPolicy, createOptimizedStaticSceneBatch } from "./sceneInstanceBatch.ts";

type CollisionRole = "solid" | "rideable-surface" | "ignore";
export type ModernIndustrialVariant = "technology-park" | "food-processing-plant" | "mechanized-factory";

type IndustrialConfig = Readonly<{
  variant: ModernIndustrialVariant;
  modelType: "technology-park" | "food-processing-plant" | "mechanized-factory";
  width: number;
  depth: number;
  height: number;
  solarRows: number;
  solarColumns: number;
  accent: number;
  secondary: number;
}>;

export type ModernIndustrialDistrictModel = THREE.Group & {
  userData: {
    mapLayer: "exterior";
    modelType: ModernIndustrialVariant;
    generatedLocally: true;
    moduleGridMeters: 1;
    siteSize: THREE.Vector3;
    facilityVariant: ModernIndustrialVariant;
    solarPanelCount: number;
    photovoltaicMounting: "factory-rooftop";
    photovoltaicCapacityKilowattsPeak: number;
    automatedProductionLineCount: number;
    automatedWarehouseCount: 1;
    warehouseRackBayCount: number;
    warehouseStackerCraneCount: 2;
    agvCount: number;
    chargingPointCount: number;
    buildingCount: number;
    renderBatchCount: number;
    scaleReferenceLengthMeters: 2.4;
    scaleStandard: "rabbit-rider";
    setPowered: (powered: boolean) => void;
    setProductionRunning: (running: boolean) => void;
    update: (deltaSeconds: number) => void;
  };
};

const CONFIGS: Record<ModernIndustrialVariant, IndustrialConfig> = {
  "technology-park": {
    variant: "technology-park", modelType: "technology-park", width: 260, depth: 180, height: 32,
    solarRows: 6, solarColumns: 16, accent: 0x21a7c5, secondary: 0x4bc6a4,
  },
  "food-processing-plant": {
    variant: "food-processing-plant", modelType: "food-processing-plant", width: 280, depth: 200, height: 30,
    solarRows: 7, solarColumns: 16, accent: 0x54a66a, secondary: 0xf0a853,
  },
  "mechanized-factory": {
    variant: "mechanized-factory", modelType: "mechanized-factory", width: 300, depth: 210, height: 34,
    solarRows: 8, solarColumns: 18, accent: 0x287aa5, secondary: 0xe38643,
  },
};

function industrialMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "interior" | "micro-detail" | "animated-detail" = "exterior",
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = collisionRole === "solid" && !material.transparent;
  mesh.receiveShadow = collisionRole !== "ignore";
  mesh.userData = { mapCollisionRole: collisionRole, mapLayer };
  if (collisionRole === "rideable-surface") mesh.userData.surfaceProfileId = "site-surface";
  return mesh;
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "interior" | "micro-detail" | "animated-detail" = "exterior",
) {
  const mesh = industrialMesh(new THREE.BoxGeometry(...size), material, name, collisionRole, mapLayer);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radii: [number, number],
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  name: string,
  sides = 12,
  collisionRole: CollisionRole = "solid",
) {
  const mesh = industrialMesh(new THREE.CylinderGeometry(radii[0], radii[1], height, sides), material, name, collisionRole);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addModernBuilding(
  root: THREE.Group,
  materials: Materials,
  spec: Readonly<{ name: string; role: string; x: number; z: number; width: number; depth: number; height: number; glassFront?: boolean }>,
) {
  const building = new THREE.Group();
  building.name = spec.name;
  building.position.set(spec.x, 0, spec.z);
  building.userData = {
    facilityRole: spec.role,
    modernIndustrialBuilding: true,
    heightMeters: spec.height,
    buildingSizeMeters: new THREE.Vector3(spec.width, spec.height, spec.depth),
    clearInteriorHeightMeters: Math.max(spec.height - 2, 4),
    frontDirection: "+z",
  };
  addBox(building, [spec.width + 2, 0.6, spec.depth + 2], [0, 0.3, 0], materials.foundation, "modern-industrial-building-foundation");
  addBox(building, [spec.width, 0.22, spec.depth], [0, 0.71, 0], materials.floor, "modern-industrial-building-floor", "rideable-surface", "interior");
  addBox(building, [spec.width, spec.height, 0.5], [0, spec.height * 0.5 + 0.6, -spec.depth * 0.5], materials.wall, "modern-industrial-building-rear-wall");
  addBox(building, [0.5, spec.height, spec.depth], [-spec.width * 0.5, spec.height * 0.5 + 0.6, 0], materials.wall, "modern-industrial-building-side-wall");
  addBox(building, [0.5, spec.height, spec.depth], [spec.width * 0.5, spec.height * 0.5 + 0.6, 0], materials.wall, "modern-industrial-building-side-wall");
  addBox(building, [spec.width, 0.7, spec.depth], [0, spec.height + 0.95, 0], materials.roof, "modern-industrial-building-roof");
  const frontMaterial = spec.glassFront ? materials.glass : materials.wall;
  addBox(building, [spec.width * 0.38, spec.height * 0.68, 0.32], [-spec.width * 0.3, spec.height * 0.5 + 0.4, spec.depth * 0.5], frontMaterial, "modern-industrial-building-front-panel");
  addBox(building, [spec.width * 0.38, spec.height * 0.68, 0.32], [spec.width * 0.3, spec.height * 0.5 + 0.4, spec.depth * 0.5], frontMaterial, "modern-industrial-building-front-panel");
  addBox(building, [spec.width, spec.height * 0.18, 0.36], [0, spec.height * 0.91 + 0.45, spec.depth * 0.5], materials.accent, "modern-industrial-building-facade-band", "ignore");
  addBox(building, [spec.width * 0.16, spec.height * 0.62, 0.2], [0, spec.height * 0.46 + 0.52, spec.depth * 0.5 + 0.1], materials.glass, "modern-industrial-building-entry-glass", "ignore");
  addBox(building, [spec.width * 0.2, 0.28, 3.2], [0, spec.height * 0.7, spec.depth * 0.5 + 1.35], materials.accent, "modern-industrial-building-entry-canopy");
  root.add(building);
  return building;
}

type Materials = Readonly<{
  ground: THREE.MeshStandardMaterial;
  landscape: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  marking: THREE.MeshStandardMaterial;
  foundation: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  solar: THREE.MeshStandardMaterial;
  solarFrame: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  crate: THREE.MeshStandardMaterial;
  warning: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  water: THREE.MeshPhysicalMaterial;
}>;

function createMaterials(config: IndustrialConfig): Materials {
  return {
    ground: new THREE.MeshStandardMaterial({ color: 0x879487, roughness: 0.98 }),
    landscape: new THREE.MeshStandardMaterial({ color: 0x6f9871, roughness: 0.98 }),
    road: new THREE.MeshStandardMaterial({ color: 0x444c50, roughness: 0.98 }),
    marking: new THREE.MeshStandardMaterial({ color: 0xf3efdc, roughness: 0.86 }),
    foundation: new THREE.MeshStandardMaterial({ color: 0x9ba5a5, roughness: 0.96 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xc1c7c4, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xe5e7e2, roughness: 0.82 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xaeb9bb, roughness: 0.72, metalness: 0.16 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6d797d, roughness: 0.55, metalness: 0.58 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x26363d, roughness: 0.46, metalness: 0.68 }),
    accent: new THREE.MeshStandardMaterial({ color: config.accent, roughness: 0.6, metalness: 0.12 }),
    secondary: new THREE.MeshStandardMaterial({ color: config.secondary, roughness: 0.68, metalness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x80c8d8, roughness: 0.18, transparent: true, opacity: 0.48, transmission: 0.22, depthWrite: false }),
    solar: new THREE.MeshStandardMaterial({ color: 0x173f64, roughness: 0.32, metalness: 0.3 }),
    solarFrame: new THREE.MeshStandardMaterial({ color: 0xb8c2c3, roughness: 0.42, metalness: 0.72 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x253238, roughness: 0.7 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xd39c58, roughness: 0.88 }),
    warning: new THREE.MeshStandardMaterial({ color: 0xf2bf43, roughness: 0.74 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: config.accent, emissiveIntensity: 0.05, roughness: 0.32 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x3f91a4, roughness: 0.22, transparent: true, opacity: 0.72, depthWrite: false }),
  };
}

function addPhotovoltaics(root: THREE.Group, config: IndustrialConfig, materials: Materials) {
  const solarRoot = new THREE.Group();
  solarRoot.name = "modern-industrial-rooftop-photovoltaic-system";
  solarRoot.userData = {
    renewableEnergy: true,
    gridConnected: true,
    roofMounted: true,
    independentGroundArray: false,
    panelTiltDegrees: 12,
  };

  root.updateMatrixWorld(true);
  const roofSlots: Array<Array<{ x: number; z: number; roofTopY: number; roofHostName: string }>> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name !== "modern-industrial-building-roof") return;
    const roofBounds = new THREE.Box3().setFromObject(object);
    const roofSize = roofBounds.getSize(new THREE.Vector3());
    const columns = Math.max(1, Math.floor((roofSize.x - 5) / 4));
    const rows = Math.max(1, Math.floor((roofSize.z - 5) / 3));
    const slots: Array<{ x: number; z: number; roofTopY: number; roofHostName: string }> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        slots.push({
          x: roofBounds.getCenter(new THREE.Vector3()).x + (column - (columns - 1) * 0.5) * 4,
          z: roofBounds.getCenter(new THREE.Vector3()).z + (row - (rows - 1) * 0.5) * 3,
          roofTopY: roofBounds.max.y,
          roofHostName: object.parent?.name ?? "modern-industrial-building",
        });
      }
    }
    roofSlots.push(slots);
  });

  const targetPanelCount = config.solarRows * config.solarColumns + 16;
  const slotCursor = roofSlots.map(() => 0);
  let panelCount = 0;
  while (panelCount < targetPanelCount) {
    let placedThisPass = false;
    roofSlots.forEach((slots, roofIndex) => {
      if (panelCount >= targetPanelCount) return;
      const slot = slots[slotCursor[roofIndex]++];
      if (!slot) return;
      placedThisPass = true;
      const panel = addBox(
        solarRoot,
        [3.5, 0.12, 2.2],
        [slot.x, slot.roofTopY + 0.5, slot.z],
        materials.solar,
        "modern-industrial-solar-panel",
        "ignore",
        "micro-detail",
      );
      panel.rotation.x = -THREE.MathUtils.degToRad(12);
      panel.userData = {
        ...panel.userData,
        roofMounted: true,
        roofHostName: slot.roofHostName,
        roofTopY: slot.roofTopY,
      };
      const lowMount = addBox(
        solarRoot,
        [3.3, 0.2, 0.12],
        [slot.x, slot.roofTopY + 0.1, slot.z + 0.78],
        materials.solarFrame,
        "modern-industrial-solar-panel-support",
        "ignore",
        "micro-detail",
      );
      const highMount = addBox(
        solarRoot,
        [3.3, 0.55, 0.12],
        [slot.x, slot.roofTopY + 0.275, slot.z - 0.78],
        materials.solarFrame,
        "modern-industrial-solar-panel-support",
        "ignore",
        "micro-detail",
      );
      lowMount.userData = { ...lowMount.userData, roofMounted: true, roofHostName: slot.roofHostName, roofTopY: slot.roofTopY };
      highMount.userData = { ...highMount.userData, roofMounted: true, roofHostName: slot.roofHostName, roofTopY: slot.roofTopY };
      panelCount += 1;
    });
    if (!placedThisPass) throw new Error(`${config.variant} factory roofs cannot accommodate ${targetPanelCount} photovoltaic panels`);
  }
  root.add(solarRoot);
  return panelCount;
}

function addAutomationLine(
  root: THREE.Group,
  materials: Materials,
  position: [number, number, number],
  lineIndex: number,
  carriers: THREE.Mesh[],
) {
  const line = new THREE.Group();
  line.name = "modern-industrial-automated-production-line";
  line.position.set(...position);
  line.userData = { lineIndex, automated: true, sensorControlled: true, emergencyStops: 4 };
  addBox(line, [32, 0.42, 2.8], [0, 1.55, 0], materials.belt, "modern-industrial-conveyor-belt", "solid", "interior");
  for (let index = 0; index <= 8; index += 1) {
    addBox(line, [0.16, 1.3, 2.5], [-16 + index * 4, 0.86, 0], materials.steel, "modern-industrial-conveyor-support", "solid", "interior");
    const roller = addCylinder(line, [0.15, 0.15], 2.55, [-16 + index * 4, 1.8, 0], materials.solarFrame, "modern-industrial-conveyor-roller", 10, "ignore");
    roller.rotation.x = Math.PI * 0.5;
  }
  for (const x of [-10, 0, 10]) {
    addCylinder(line, [0.8, 1], 0.5, [x, 0.95, -3.2], materials.darkSteel, "modern-industrial-robot-base", 12);
    const lower = addBox(line, [0.7, 2.8, 0.7], [x, 2.45, -3.2], materials.accent, "modern-industrial-robot-arm", "solid", "interior");
    lower.rotation.z = lineIndex % 2 === 0 ? -0.28 : 0.28;
    const upper = addBox(line, [2.6, 0.58, 0.58], [x + (lineIndex % 2 === 0 ? 1 : -1), 3.72, -3.2], materials.secondary, "modern-industrial-robot-arm", "solid", "interior");
    upper.rotation.z = lineIndex % 2 === 0 ? 0.35 : -0.35;
    addBox(line, [0.48, 0.48, 1.1], [x + (lineIndex % 2 === 0 ? 2.15 : -2.15), 4.15, -3.2], materials.darkSteel, "modern-industrial-robot-tool", "solid", "interior");
  }
  for (let index = 0; index < 4; index += 1) {
    const carrier = addBox(line, [2.2, 0.9, 1.8], [-13 + index * 8, 2.22, 0], materials.crate, "modern-industrial-line-carrier", "ignore", "animated-detail");
    carrier.userData = { lineIndex, lineOffset: index * 8, animated: true };
    carriers.push(carrier);
  }
  root.add(line);
  return line;
}

function addAutomatedWarehouse(
  root: THREE.Group,
  materials: Materials,
  position: [number, number, number],
  cranes: THREE.Group[],
) {
  const warehouse = new THREE.Group();
  warehouse.name = "modern-industrial-automated-high-bay-warehouse";
  warehouse.position.set(...position);
  warehouse.userData = {
    automatedWarehouse: true,
    warehouseManagementSystem: true,
    highBayStorage: true,
    temperatureMonitoring: true,
  };
  addBox(warehouse, [56, 0.6, 34], [0, 0.3, 0], materials.foundation, "modern-industrial-warehouse-foundation");
  addBox(warehouse, [54, 0.2, 32], [0, 0.7, 0], materials.floor, "modern-industrial-warehouse-floor", "rideable-surface", "interior");
  addBox(warehouse, [56, 0.6, 34], [0, 14.6, 0], materials.roof, "modern-industrial-warehouse-roof");
  addBox(warehouse, [56, 14, 0.45], [0, 7.5, -17], materials.wall, "modern-industrial-warehouse-wall");
  addBox(warehouse, [0.45, 14, 34], [-28, 7.5, 0], materials.wall, "modern-industrial-warehouse-wall");
  addBox(warehouse, [0.45, 14, 34], [28, 7.5, 0], materials.wall, "modern-industrial-warehouse-wall");
  addBox(warehouse, [56, 2.2, 0.35], [0, 13.4, 17], materials.accent, "modern-industrial-warehouse-header");
  for (const x of [-20, -12, -4, 4, 12, 20]) {
    for (let level = 0; level < 4; level += 1) {
      for (const z of [-11, -5, 1, 7]) {
        addBox(warehouse, [5.4, 0.18, 2.2], [x, 2 + level * 2.75, z], materials.steel, "modern-industrial-warehouse-rack-shelf", "solid", "interior");
        addBox(warehouse, [2, 1.6, 1.8], [x - 1.3, 2.85 + level * 2.75, z], level % 2 === 0 ? materials.crate : materials.secondary, "modern-industrial-warehouse-storage-bin", "solid", "interior");
        addBox(warehouse, [2, 1.6, 1.8], [x + 1.3, 2.85 + level * 2.75, z], level % 2 === 0 ? materials.secondary : materials.crate, "modern-industrial-warehouse-storage-bin", "solid", "interior");
      }
    }
  }
  for (const x of [-8, 8]) {
    const crane = new THREE.Group();
    crane.name = "modern-industrial-warehouse-stacker-crane";
    crane.position.set(x, 0, 0);
    crane.userData = { automated: true, aisleLengthMeters: 28, travelOffset: x };
    addBox(crane, [0.55, 12, 0.55], [0, 6.7, 0], materials.warning, "modern-industrial-stacker-mast", "solid", "animated-detail");
    addBox(crane, [4.6, 0.5, 1.4], [0, 5.5, 0], materials.darkSteel, "modern-industrial-stacker-carriage", "solid", "animated-detail");
    addBox(crane, [1.5, 0.18, 3.2], [0, 5.3, 1.55], materials.warning, "modern-industrial-stacker-fork", "solid", "animated-detail");
    warehouse.add(crane);
    cranes.push(crane);
  }
  root.add(warehouse);
  return warehouse;
}

function addGateFenceAndRoads(root: THREE.Group, config: IndustrialConfig, materials: Materials) {
  const crossRoadZ = config.variant === "mechanized-factory" ? 2 : 12;
  addBox(root, [config.width, 0.18, 12], [0, 0.59, config.depth * 0.5 - 13], materials.road, "modern-industrial-front-logistics-road", "rideable-surface");
  addBox(root, [12, 0.18, config.depth - 26], [0, 0.59, -1], materials.road, "modern-industrial-main-road", "rideable-surface");
  addBox(root, [config.width - 26, 0.18, 10], [0, 0.59, crossRoadZ], materials.road, "modern-industrial-cross-road", "rideable-surface");
  for (const x of [-3.2, 3.2]) addBox(root, [0.12, 0.03, config.depth - 28], [x, 0.7, -1], materials.marking, "modern-industrial-road-marking", "ignore", "micro-detail");
  for (let index = -6; index <= 6; index += 1) addBox(root, [4, 0.03, 0.14], [index * 9, 0.7, config.depth * 0.5 - 13], materials.marking, "modern-industrial-road-marking", "ignore", "micro-detail");

  const gate = new THREE.Group();
  gate.name = "modern-industrial-smart-entry-gate";
  // Keep the complete gate canopy inside the declared factory-site envelope.
  gate.position.set(0, 0, config.depth * 0.5 - 2.75);
  gate.userData = { smartAccessControl: true, licencePlateRecognition: true, separatedPedestrianGate: true };
  addBox(gate, [24, 0.6, 5.2], [0, 0.3, 0], materials.foundation, "modern-industrial-gate-foundation");
  for (const x of [-10, 10]) addBox(gate, [1.1, 6.8, 1.1], [x, 4, 0], materials.darkSteel, "modern-industrial-gate-column");
  addBox(gate, [22, 0.7, 5.5], [0, 7.5, 0], materials.accent, "modern-industrial-gate-canopy");
  addBox(gate, [5.2, 4.2, 3.8], [14.2, 2.7, 0], materials.glass, "modern-industrial-security-centre", "ignore");
  addBox(gate, [8, 0.18, 0.18], [-5, 1.4, 0.2], materials.warning, "modern-industrial-vehicle-barrier");
  addBox(gate, [2, 2.3, 0.18], [7, 1.75, 0.2], materials.darkSteel, "modern-industrial-pedestrian-turnstile");
  root.add(gate);

  const fence = new THREE.Group();
  fence.name = "modern-industrial-perimeter-fence";
  const segments: Array<[number, number, number, boolean]> = [
    [0, -config.depth * 0.5 + 0.5, config.width - 1, true],
    [-config.width * 0.5 + 0.5, 0, config.depth - 1, false],
    [config.width * 0.5 - 0.5, 0, config.depth - 1, false],
    [-config.width * 0.25 - 7, config.depth * 0.5 - 0.5, config.width * 0.5 - 14.12, true],
    [config.width * 0.25 + 7, config.depth * 0.5 - 0.5, config.width * 0.5 - 14.12, true],
  ];
  segments.forEach(([x, z, length, horizontal]) => {
    addBox(fence, horizontal ? [length, 0.35, 0.3] : [0.3, 0.35, length], [x, 0.68, z], materials.foundation, "modern-industrial-fence-base");
    const count = Math.max(2, Math.floor(length / 4));
    for (let index = 0; index <= count; index += 1) {
      const offset = -length * 0.5 + index / count * length;
      addBox(fence, [0.12, 2.3, 0.12], [horizontal ? x + offset : x, 1.95, horizontal ? z : z + offset], materials.darkSteel, "modern-industrial-fence-post");
    }
    for (const y of [1.25, 2.15, 2.85]) addBox(fence, horizontal ? [length, 0.08, 0.08] : [0.08, 0.08, length], [x, y, z], materials.darkSteel, "modern-industrial-fence-rail");
  });
  root.add(fence);
  return gate;
}

function addChargingAndAgvs(root: THREE.Group, materials: Materials, config: IndustrialConfig, agvs: THREE.Group[]) {
  const charging = new THREE.Group();
  charging.name = "modern-industrial-electric-logistics-hub";
  charging.position.set(-config.width * 0.5 + 26, 0, config.depth * 0.5 - 25);
  charging.userData = { electricFleet: true, chargingPointCount: 8 };
  addBox(charging, [34, 0.16, 14], [0, 0.58, 0], materials.floor, "modern-industrial-charging-apron", "rideable-surface");
  for (let index = 0; index < 8; index += 1) {
    const x = -14 + index * 4;
    addBox(charging, [0.7, 2.1, 0.7], [x, 1.65, -4.8], materials.accent, "modern-industrial-fast-charger");
    addBox(charging, [0.55, 0.22, 0.12], [x, 2.25, -5.2], materials.glow, "modern-industrial-charger-screen", "ignore", "micro-detail");
    addBox(charging, [3.4, 0.025, 5.2], [x, 0.68, 1.2], materials.marking, "modern-industrial-charging-bay-marking", "ignore", "micro-detail");
  }
  root.add(charging);

  for (let index = 0; index < 6; index += 1) {
    const agv = new THREE.Group();
    agv.name = "modern-industrial-autonomous-guided-vehicle";
    agv.position.set(index % 2 === 0 ? -4 : 4, 0, -55 + index * 18);
    agv.userData = { agvIndex: index, autonomous: true, lidarNavigation: true, routeOffset: index * 18 };
    addBox(agv, [3.2, 0.62, 2], [0, 0.94, 0], materials.secondary, "modern-industrial-agv-body", "solid", "animated-detail");
    addBox(agv, [2.5, 0.72, 1.6], [0, 1.61, 0], materials.crate, "modern-industrial-agv-load", "solid", "animated-detail");
    addCylinder(agv, [0.14, 0.14], 0.2, [0, 1.8, 0], materials.glow, "modern-industrial-agv-lidar", 10, "ignore");
    root.add(agv);
    agvs.push(agv);
  }
}

function addTechnologyDetails(root: THREE.Group, materials: Materials) {
  const tower = new THREE.Group();
  tower.name = "technology-park-innovation-tower";
  tower.position.set(-100, 0, 38);
  addBox(tower, [38, 0.6, 30], [0, 0.3, 0], materials.foundation, "modern-industrial-building-foundation");
  for (let floor = 0; floor < 5; floor += 1) {
    addBox(tower, [36, 0.28, 28], [0, 1 + floor * 4.3, 0], materials.floor, "technology-park-office-floor", "solid", "interior");
    addBox(tower, [36, 3.6, 0.24], [0, 2.9 + floor * 4.3, 14], materials.glass, "technology-park-smart-glass-facade", "ignore");
  }
  addBox(tower, [38, 0.6, 30], [0, 22.3, 0], materials.roof, "technology-park-innovation-tower-roof");
  addBox(tower, [4, 6, 4], [0, 25.4, 0], materials.accent, "technology-park-digital-beacon");
  root.add(tower);

  const data = new THREE.Group();
  data.name = "technology-park-data-centre";
  data.position.set(75, 0, 38);
  addBox(data, [62, 0.6, 38], [0, 0.3, 0], materials.foundation, "modern-industrial-building-foundation");
  addBox(data, [60, 10, 36], [0, 5.7, 0], materials.wall, "technology-park-data-centre-shell");
  for (let index = 0; index < 10; index += 1) {
    addBox(data, [3.2, 3.5, 8], [-24 + index * 5.3, 2.55, 0], materials.darkSteel, "technology-park-server-rack", "solid", "interior");
    addBox(data, [2.5, 0.18, 0.12], [-24 + index * 5.3, 3.2, 4.08], materials.glow, "technology-park-server-status-display", "ignore", "micro-detail");
  }
  for (const x of [-20, -7, 7, 20]) addBox(data, [7, 2.4, 4], [x, 11.6, 0], materials.steel, "technology-park-data-centre-cooling-unit");
  root.add(data);

  const dronePad = industrialMesh(new THREE.CylinderGeometry(11, 11, 0.18, 32), materials.floor, "technology-park-autonomous-drone-pad", "rideable-surface");
  dronePad.position.set(0, 0.6, 55);
  dronePad.userData = { autonomousInspection: true, emergencyLogistics: true };
  root.add(dronePad);
  addBox(root, [8, 0.03, 1], [0, 0.71, 55], materials.marking, "technology-park-drone-pad-marking", "ignore", "micro-detail");
  addBox(root, [1, 0.03, 8], [0, 0.71, 55], materials.marking, "technology-park-drone-pad-marking", "ignore", "micro-detail");
}

function addFoodDetails(root: THREE.Group, materials: Materials) {
  const tanks = new THREE.Group();
  tanks.name = "food-processing-plant-hygienic-tank-farm";
  tanks.position.set(-108, 0, -63);
  tanks.userData = { cleanInPlaceSystem: true, foodGradeStainlessSteel: true };
  for (const x of [-8, 0, 8]) {
    addCylinder(tanks, [3.1, 3.1], 8, [x, 4.6, 0], materials.solarFrame, "food-processing-plant-process-tank", 16);
    addCylinder(tanks, [0, 3.1], 2.2, [x, 9.7, 0], materials.solarFrame, "food-processing-plant-process-tank-roof", 16);
    addBox(tanks, [0.18, 7.8, 0.18], [x + 3.2, 4.5, 0], materials.darkSteel, "food-processing-plant-tank-ladder");
  }
  root.add(tanks);

  const cold = new THREE.Group();
  cold.name = "food-processing-plant-cold-chain-centre";
  cold.position.set(84, 0, 36);
  cold.userData = { temperatureZonesCelsius: [-24, -2, 4], automatedColdStorage: true };
  for (let index = 0; index < 5; index += 1) addBox(cold, [9, 2.4, 4], [-24 + index * 12, 15.4, 0], materials.steel, "food-processing-plant-refrigeration-unit");
  for (const x of [-20, 0, 20]) addBox(cold, [8, 4, 0.3], [x, 2.8, 17.18], materials.darkSteel, "food-processing-plant-cold-dock-door");
  root.add(cold);

  const waterPlant = new THREE.Group();
  waterPlant.name = "food-processing-plant-water-recovery-facility";
  waterPlant.position.set(105, 0, -72);
  waterPlant.userData = { waterReuseRatio: 0.65, anaerobicTreatment: true };
  for (const x of [-7, 7]) addCylinder(waterPlant, [6, 6], 1.2, [x, 1.1, 0], materials.water, "food-processing-plant-treatment-basin", 24, "ignore");
  addBox(waterPlant, [28, 0.16, 16], [0, 0.56, 0], materials.foundation, "food-processing-plant-treatment-apron", "rideable-surface");
  root.add(waterPlant);
}

function addMechanizedDetails(root: THREE.Group, materials: Materials) {
  const cnc = new THREE.Group();
  cnc.name = "mechanized-factory-cnc-machining-cell";
  cnc.position.set(-82, 0, 34);
  cnc.userData = { machineCount: 8, automatedToolChanging: true, digitalTwinMonitoring: true };
  for (let index = 0; index < 8; index += 1) {
    const x = -23 + index % 4 * 15;
    const z = -7 + Math.floor(index / 4) * 14;
    addBox(cnc, [10, 4.2, 8], [x, 2.8, z], materials.steel, "mechanized-factory-cnc-machine", "solid", "interior");
    addBox(cnc, [5.5, 2.4, 0.18], [x, 3, z + 4.08], materials.glass, "mechanized-factory-cnc-safety-window", "ignore", "interior");
    addBox(cnc, [1.2, 0.9, 0.16], [x + 3.8, 3.8, z + 4.18], materials.glow, "mechanized-factory-cnc-control-panel", "ignore", "micro-detail");
  }
  root.add(cnc);

  const crane = new THREE.Group();
  crane.name = "mechanized-factory-overhead-gantry-crane";
  crane.position.set(74, 0, 34);
  crane.userData = { ratedLoadTonnes: 20, automatedAntiSway: true };
  for (const x of [-30, 30]) addBox(crane, [1, 13, 1], [x, 7.2, 0], materials.warning, "mechanized-factory-gantry-column");
  addBox(crane, [62, 1.4, 1.4], [0, 13.5, 0], materials.warning, "mechanized-factory-gantry-beam");
  addBox(crane, [3.2, 2, 2.4], [0, 11.8, 0], materials.darkSteel, "mechanized-factory-gantry-trolley", "solid", "animated-detail");
  addBox(crane, [0.18, 6.5, 0.18], [0, 7.8, 0], materials.darkSteel, "mechanized-factory-crane-cable", "ignore", "animated-detail");
  root.add(crane);

  const paint = new THREE.Group();
  paint.name = "mechanized-factory-enclosed-paint-booth";
  paint.position.set(131, 0, -73);
  paint.userData = { vocRecovery: true, isolatedAirHandling: true };
  addBox(paint, [32, 0.6, 22], [0, 0.3, 0], materials.foundation, "modern-industrial-building-foundation");
  addBox(paint, [30, 9, 20], [0, 5.2, 0], materials.wall, "mechanized-factory-paint-booth-shell");
  addBox(paint, [12, 6, 0.25], [0, 4, 10.1], materials.glass, "mechanized-factory-paint-booth-door", "ignore");
  for (const x of [-9, 0, 9]) addCylinder(paint, [1, 1], 5, [x, 12, 0], materials.steel, "mechanized-factory-extraction-stack", 12);
  root.add(paint);
}

function buildModernIndustrialDistrict(
  variant: ModernIndustrialVariant,
  options: Readonly<{ optimizeStatic?: boolean }> = {},
): ModernIndustrialDistrictModel {
  const config = CONFIGS[variant];
  const root = new THREE.Group() as ModernIndustrialDistrictModel;
  root.name = `city-${variant}-lowpoly`;
  const materials = createMaterials(config);

  const site = addBox(root, [config.width, 0.5, config.depth], [0, 0.25, 0], materials.ground, "modern-industrial-site-base", "rideable-surface");
  site.userData = { ...site.userData, moduleGridMeters: 1, largeIndependentSite: true };
  addBox(root, [config.width - 20, 0.08, 22], [0, 0.54, -config.depth * 0.5 + 18], materials.landscape, "modern-industrial-landscape-buffer", "rideable-surface");
  const gate = addGateFenceAndRoads(root, config, materials);

  const buildings: THREE.Group[] = [];
  if (variant === "technology-park") {
    buildings.push(
      addModernBuilding(root, materials, { name: "technology-park-robotics-prototype-hall", role: "robotics-prototyping", x: -76, z: -35, width: 68, depth: 40, height: 12, glassFront: true }),
      addModernBuilding(root, materials, { name: "technology-park-clean-research-laboratory", role: "clean-research-lab", x: -40, z: 38, width: 46, depth: 32, height: 12, glassFront: true }),
    );
    addTechnologyDetails(root, materials);
  } else if (variant === "food-processing-plant") {
    buildings.push(
      addModernBuilding(root, materials, { name: "food-processing-plant-raw-material-receiving", role: "raw-material-receiving", x: -87, z: 38, width: 72, depth: 38, height: 11 }),
      addModernBuilding(root, materials, { name: "food-processing-plant-clean-processing-hall", role: "washing-cooking-filling", x: -83, z: -28, width: 78, depth: 48, height: 12, glassFront: true }),
      addModernBuilding(root, materials, { name: "food-processing-plant-packaging-centre", role: "automated-packaging", x: 40, z: -30, width: 62, depth: 44, height: 11, glassFront: true }),
      addModernBuilding(root, materials, { name: "food-processing-plant-quality-laboratory", role: "quality-laboratory", x: 32, z: 43, width: 42, depth: 32, height: 10, glassFront: true }),
    );
    addFoodDetails(root, materials);
  } else {
    buildings.push(
      addModernBuilding(root, materials, { name: "mechanized-factory-machining-hall", role: "cnc-machining", x: -84, z: 34, width: 82, depth: 48, height: 15, glassFront: true }),
      addModernBuilding(root, materials, { name: "mechanized-factory-robotic-welding-hall", role: "robotic-welding", x: -88, z: -42, width: 78, depth: 50, height: 14, glassFront: true }),
      addModernBuilding(root, materials, { name: "mechanized-factory-final-assembly-hall", role: "final-assembly", x: 78, z: 34, width: 88, depth: 50, height: 16, glassFront: true }),
    );
    addMechanizedDetails(root, materials);
  }

  const carriers: THREE.Mesh[] = [];
  if (variant === "technology-park") {
    addAutomationLine(root, materials, [-76, 0, -31], 0, carriers);
    addAutomationLine(root, materials, [-76, 0, -39], 1, carriers);
  } else if (variant === "food-processing-plant") {
    addAutomationLine(root, materials, [-83, 0, -27], 0, carriers);
    addAutomationLine(root, materials, [40, 0, -29], 1, carriers);
    addAutomationLine(root, materials, [-83, 0, -34], 2, carriers);
  } else {
    addAutomationLine(root, materials, [-88, 0, -41], 0, carriers);
    addAutomationLine(root, materials, [78, 0, 32], 1, carriers);
    addAutomationLine(root, materials, [78, 0, 39], 2, carriers);
  }

  const stackerCranes: THREE.Group[] = [];
  const warehousePosition: [number, number, number] = variant === "technology-park"
    ? [72, 0, -35]
    : variant === "food-processing-plant"
      ? [83, 0, 36]
      : [86, 0, -48];
  const warehouse = addAutomatedWarehouse(root, materials, warehousePosition, stackerCranes);
  warehouse.userData.variantPurpose = variant === "food-processing-plant" ? "automated-cold-chain-buffer" : "automated-material-and-finished-goods";

  const agvs: THREE.Group[] = [];
  addChargingAndAgvs(root, materials, config, agvs);
  const solarPanelCount = addPhotovoltaics(root, config, materials);

  const utility = new THREE.Group();
  utility.name = "modern-industrial-smart-energy-centre";
  utility.position.set(config.width * 0.5 - 23, 0, -config.depth * 0.5 + 18);
  utility.userData = { microgrid: true, batteryStorageMegawattHours: 4, heatRecovery: true };
  for (let index = 0; index < 6; index += 1) addBox(utility, [3.2, 3.4, 1.5], [-10 + index * 4, 2.25, 0], materials.wall, "modern-industrial-battery-cabinet");
  addBox(utility, [30, 0.2, 8], [0, 0.6, 0], materials.foundation, "modern-industrial-energy-centre-apron", "rideable-surface");
  root.add(utility);

  const nightLights: THREE.PointLight[] = [];
  const lightPool = new THREE.Group();
  lightPool.name = "modern-industrial-night-light-pool";
  for (const [x, z] of [[-70, 45], [70, 45], [-70, -40], [70, -40], [0, 0]] as Array<[number, number]>) {
    const light = new THREE.PointLight(0xdceeff, 0, 54, 1.8);
    light.name = "modern-industrial-pooled-night-light";
    light.position.set(x, 12, z);
    light.castShadow = false;
    light.visible = false;
    lightPool.add(light);
    nightLights.push(light);
  }
  root.add(lightPool);

  const dynamicRoots: THREE.Object3D[] = [...agvs, ...stackerCranes];
  carriers.forEach((carrier) => dynamicRoots.push(carrier));
  const shadow = applySceneShadowPolicy(root, { dynamicRoots, keepPattern: /(?:building|hall|tower|warehouse|roof|canopy|gantry|data-centre|cold-chain)/i });
  const staticBatch = createOptimizedStaticSceneBatch({
    name: `modern-industrial-${variant}-static-render-batch`,
    parent: root,
    excludedRoots: dynamicRoots,
    mutableMaterials: [materials.glow],
    cellSizeMeters: 70,
    enabled: options.optimizeStatic !== false,
  });

  let powered = false;
  let productionRunning = true;
  let elapsed = 0;
  root.userData = {
    mapLayer: "exterior",
    modelType: config.modelType,
    generatedLocally: true,
    moduleGridMeters: 1,
    siteSize: new THREE.Vector3(config.width, config.height, config.depth),
    facilityVariant: config.variant,
    solarPanelCount,
    photovoltaicMounting: "factory-rooftop",
    photovoltaicCapacityKilowattsPeak: Math.round(solarPanelCount * 0.55),
    automatedProductionLineCount: variant === "technology-park" ? 2 : 3,
    automatedWarehouseCount: 1,
    warehouseRackBayCount: 96,
    warehouseStackerCraneCount: 2,
    agvCount: agvs.length,
    chargingPointCount: 8,
    buildingCount: buildings.length + (variant === "technology-park" ? 3 : variant === "food-processing-plant" ? 3 : 3),
    renderBatchCount: staticBatch.userData.batchCount,
    shadowCastersRemoved: shadow.shadowCastersRemoved,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    setPowered: (on) => {
      powered = on;
      materials.glow.emissiveIntensity = on ? 2.8 : 0.05;
      nightLights.forEach((light) => {
        light.visible = on;
        light.intensity = on ? 15 : 0;
      });
      root.userData.powered = on;
    },
    setProductionRunning: (running) => {
      productionRunning = running;
      root.userData.productionRunning = running;
    },
    update: (deltaSeconds) => {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !productionRunning) return;
      elapsed += deltaSeconds;
      carriers.forEach((carrier) => {
        const offset = carrier.userData.lineOffset as number;
        carrier.position.x = -14 + (elapsed * 3.4 + offset) % 28;
      });
      agvs.forEach((agv, index) => {
        agv.position.z = -62 + (elapsed * (2.2 + index * 0.08) + index * 22) % 124;
      });
      stackerCranes.forEach((crane, index) => {
        crane.position.z = Math.sin(elapsed * 0.46 + index * Math.PI) * 12;
      });
      materials.glow.emissiveIntensity = powered ? 2.6 + Math.sin(elapsed * 2) * 0.2 : 0.05;
    },
  };
  root.userData.setPowered(false);
  root.userData.setProductionRunning(true);
  gate.userData.variant = variant;
  return root;
}

export function buildLowPolyTechnologyPark(options: Readonly<{ optimizeStatic?: boolean }> = {}) {
  return buildModernIndustrialDistrict("technology-park", options);
}

export function buildLowPolyFoodProcessingPlant(options: Readonly<{ optimizeStatic?: boolean }> = {}) {
  return buildModernIndustrialDistrict("food-processing-plant", options);
}

export function buildLowPolyMechanizedFactory(options: Readonly<{ optimizeStatic?: boolean }> = {}) {
  return buildModernIndustrialDistrict("mechanized-factory", options);
}
