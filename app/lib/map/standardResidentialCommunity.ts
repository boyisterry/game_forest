import * as THREE from "three";
import {
  buildLowPolyResidentialBuilding,
  buildLowPolyRoadsidePlanter,
  buildLowPolyStreetLight,
} from "./cityFurniture.ts";
import { buildDetailedPrivateSedan, buildDetailedPrivateSuv } from "./cityRoadVehicles.ts";
import { buildLowPolyStandardResidentialGate } from "./residentialGates.ts";
import { createInstancedPrototypeBatch, createMergedStaticBatch } from "./sceneInstanceBatch.ts";

export type StandardResidentialCommunityModel = THREE.Group & {
  userData: {
    mapLayer: "exterior";
    modelType: "standard-residential-community";
    generatedLocally: true;
    moduleGridMeters: 1;
    siteSize: THREE.Vector3;
    residentialBuildingCount: number;
    residentialBuildingTypeCount: 1;
    householdCount: number;
    residentialRowCount: number;
    rowsPerSide: number;
    leftRowCount: number;
    rightRowCount: number;
    parkingRowCount: number;
    parkingSpaceCount: number;
    parkedVehicleCount: number;
    greenCoverageRatio: number;
    greenAreaSquareMeters: number;
    fitnessEquipmentCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    renderBatchCount: number;
    unbatchedSourceMeshCount: number;
    treeRenderBatchCount: number;
    scaleReferenceLengthMeters: 2.4;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    setAccessGateOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

export const STANDARD_COMMUNITY_MIN_ROWS = 3;
export const STANDARD_COMMUNITY_MAX_ROWS = 6;
export const STANDARD_COMMUNITY_ROW_PITCH_METERS = 36;
export const STANDARD_COMMUNITY_SITE_WIDTH_METERS = 160;
export const STANDARD_COMMUNITY_BASE_DEPTH_METERS = 140;

export type StandardResidentialCommunityOptions = Readonly<{
  rowsPerSide?: number;
  optimizeStatic?: boolean;
}>;

export function standardCommunityDepthForRows(rowsPerSide: number) {
  if (!Number.isInteger(rowsPerSide)
    || rowsPerSide < STANDARD_COMMUNITY_MIN_ROWS
    || rowsPerSide > STANDARD_COMMUNITY_MAX_ROWS) {
    throw new RangeError(`standard community rows must be ${STANDARD_COMMUNITY_MIN_ROWS}-${STANDARD_COMMUNITY_MAX_ROWS}`);
  }
  return STANDARD_COMMUNITY_BASE_DEPTH_METERS
    + (rowsPerSide - STANDARD_COMMUNITY_MIN_ROWS) * STANDARD_COMMUNITY_ROW_PITCH_METERS;
}

type CollisionRole = "solid" | "rideable-surface" | "ignore";

function communityMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "micro-detail" | "interior" = "exterior",
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = collisionRole === "solid" && !material.transparent;
  object.receiveShadow = collisionRole !== "ignore";
  object.userData.mapCollisionRole = collisionRole;
  object.userData.mapLayer = mapLayer;
  if (collisionRole === "rideable-surface") object.userData.surfaceProfileId = "site-surface";
  return object;
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "micro-detail" | "interior" = "exterior",
) {
  const object = communityMesh(new THREE.BoxGeometry(...size), material, name, collisionRole, mapLayer);
  object.position.set(...position);
  parent.add(object);
  return object;
}

export function buildLowPolyStandardResidentialCommunity(
  options: StandardResidentialCommunityOptions = {},
): StandardResidentialCommunityModel {
  const rowsPerSide = options.rowsPerSide ?? STANDARD_COMMUNITY_MIN_ROWS;
  const siteDepth = standardCommunityDepthForRows(rowsPerSide);
  const siteHalfDepth = siteDepth * 0.5;
  const community = new THREE.Group() as StandardResidentialCommunityModel;
  community.name = "city-standard-residential-community-lowpoly";

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.96 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x789a68, roughness: 0.98 });
  const grassLight = new THREE.MeshStandardMaterial({ color: 0x8cab74, roughness: 0.98 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4c5356, roughness: 0.98 });
  const parking = new THREE.MeshStandardMaterial({ color: 0x62696a, roughness: 0.96 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xd9d1c0, roughness: 0.93 });
  const line = new THREE.MeshStandardMaterial({ color: 0xf4f0df, roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x35464b, roughness: 0.58, metalness: 0.32 });
  const rubberBlue = new THREE.MeshStandardMaterial({ color: 0x4f899a, roughness: 0.9 });
  const fitnessYellow = new THREE.MeshStandardMaterial({ color: 0xe2ad3d, roughness: 0.72, metalness: 0.12 });
  const fitnessRed = new THREE.MeshStandardMaterial({ color: 0xc85d4c, roughness: 0.76 });

  const site = communityMesh(
    new THREE.BoxGeometry(STANDARD_COMMUNITY_SITE_WIDTH_METERS, 0.5, siteDepth),
    concrete,
    "standard-community-site-base",
  );
  site.position.y = 0.25;
  community.add(site);

  // Six disjoint planning rectangles reserve exactly 30% of every supported
  // footprint. Roads and foundations sit above the lawn finish, so the same
  // modular plan scales from three to six rows without z-fighting.
  const sideBeltDepth = siteDepth - 16;
  const centralBeltDepth = siteDepth - 20;
  const rowGardenDepth = siteDepth * 0.24 + 4.32;
  const landscapeZones: Array<[string, number, number, number, number]> = [
    ["west-green-belt", -77, 0, 6, sideBeltDepth],
    ["east-green-belt", 77, 0, 6, sideBeltDepth],
    ["central-road-green-buffer-west", -7.5, 0, 6, centralBeltDepth],
    ["central-road-green-buffer-east", 7.5, 0, 6, centralBeltDepth],
    ["west-residential-garden", -36.5, 0, 50, rowGardenDepth],
    ["east-residential-garden", 36.5, 0, 50, rowGardenDepth],
  ];
  const greenAreaSquareMeters = landscapeZones.reduce((sum, [, , , width, depth]) => sum + width * depth, 0);
  landscapeZones.forEach(([zone, x, z, width, depth], index) => {
    const lawn = communityMesh(
      new THREE.BoxGeometry(width - 0.04, 0.08, depth - 0.04),
      index % 2 === 0 ? grass : grassLight,
      "standard-community-landscape-zone",
      "rideable-surface",
    );
    lawn.position.set(x, 0.54, z);
    lawn.userData = {
      ...lawn.userData,
      landscapeZone: zone,
      areaSquareMeters: width * depth,
      countsTowardGreenCoverage: true,
    };
    community.add(lawn);
  });

  const frontBuildingZ = siteHalfDepth - 38;
  const buildingRows = Array.from(
    { length: rowsPerSide },
    (_, rowIndex) => frontBuildingZ - rowIndex * STANDARD_COMMUNITY_ROW_PITCH_METERS,
  );
  const roadRows = buildingRows.map((buildingZ) => buildingZ + 12);
  const roadMarkings: THREE.Object3D[] = [];
  roadRows.forEach((z, rowIndex) => {
    for (const side of [-1, 1] as const) {
      const road = communityMesh(new THREE.BoxGeometry(70, 0.14, 7), asphalt, "standard-community-residential-row-road", "rideable-surface");
      road.position.set(side * 39, 0.57, z);
      road.userData = {
        ...road.userData,
        rowIndex,
        communitySide: side < 0 ? "left" : "right",
        fireAccess: true,
        clearWidthMeters: 7,
        connectsToCentralDividerRoad: true,
      };
      community.add(road);
    }
    for (let x = -66; x <= 66; x += 12) {
      const marking = addBox(community, [5.5, 0.022, 0.12], [x, 0.651, z], line, "standard-community-road-centre-marking", "ignore", "micro-detail");
      roadMarkings.push(marking);
    }
  });
  for (const x of [-70.5, 70.5]) {
    const sideRoad = communityMesh(new THREE.BoxGeometry(7, 0.14, siteDepth - 24), asphalt, "standard-community-perimeter-fire-road", "rideable-surface");
    sideRoad.position.set(x, 0.57, 0);
    sideRoad.userData = { ...sideRoad.userData, fireAccess: true, clearWidthMeters: 7 };
    community.add(sideRoad);
  }
  const rearRoad = communityMesh(new THREE.BoxGeometry(148, 0.14, 7), asphalt, "standard-community-perimeter-fire-road", "rideable-surface");
  rearRoad.position.set(0, 0.57, -siteHalfDepth + 7.5);
  rearRoad.userData = { ...rearRoad.userData, fireAccess: true, clearWidthMeters: 7 };
  community.add(rearRoad);
  const arrivalRoad = communityMesh(
    new THREE.BoxGeometry(8, 0.14, siteDepth - 7),
    asphalt,
    "standard-community-main-arrival-road",
    "rideable-surface",
  );
  arrivalRoad.position.set(0, 0.57, 3.5);
  arrivalRoad.userData = {
    ...arrivalRoad.userData,
    connectsGateToRoadNetwork: true,
    clearWidthMeters: 8,
    circulationRole: "central-residential-divider",
    separatesLeftAndRightResidentialZones: true,
  };
  community.add(arrivalRoad);
  for (let z = -siteHalfDepth + 13; z <= siteHalfDepth - 10; z += 12) {
    const marking = addBox(
      community,
      [0.12, 0.022, 5.5],
      [0, 0.651, z],
      line,
      "standard-community-central-road-marking",
      "ignore",
      "micro-detail",
    );
    roadMarkings.push(marking);
  }

  const residentialBuildings: THREE.Group[] = [];
  const sharedResidentialMaterials = new Map<string, THREE.Material>();
  const residentialMaterialKey = (material: THREE.Material) => {
    const standard = material as THREE.MeshStandardMaterial;
    return [
      material.type,
      standard.color?.getHexString() ?? "",
      standard.emissive?.getHexString() ?? "",
      standard.emissiveIntensity ?? "",
      standard.roughness ?? "",
      standard.metalness ?? "",
      material.transparent,
      material.opacity,
      material.side,
      material.depthWrite,
    ].join("|");
  };
  const shareModelMaterials = (building: THREE.Object3D, registry = sharedResidentialMaterials) => {
    building.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const shared = materials.map((material) => {
        const key = residentialMaterialKey(material);
        const existing = registry.get(key);
        if (existing) return existing;
        registry.set(key, material);
        return material;
      });
      child.material = Array.isArray(child.material) ? shared : shared[0];
    });
  };
  const buildingXs = [-48, -32, -16, 16, 32, 48];
  buildingRows.forEach((z, rowIndex) => {
    buildingXs.forEach((x, columnIndex) => {
      const building = buildLowPolyResidentialBuilding();
      shareModelMaterials(building);
      building.name = `standard-community-residential-building-${rowIndex + 1}-${columnIndex + 1}`;
      building.position.set(x, 0.5, z);
      building.scale.setScalar(1.45);
      building.rotation.y = 0;
      Object.assign(building.userData, {
        communityType: "standard",
        rowIndex,
        columnIndex,
        communitySide: x < 0 ? "left" : "right",
        sideColumnIndex: columnIndex % 3,
        householdCount: 20,
        frontDirection: "+z",
        sourceModel: "city-residential-building-lowpoly",
      });
      residentialBuildings.push(building);
      community.add(building);

      const pathDepth = 8;
      const path = communityMesh(new THREE.BoxGeometry(2.4, 0.12, pathDepth), paving, "standard-community-building-entry-path", "rideable-surface");
      path.position.set(x, 0.64, z + 8);
      path.userData = { ...path.userData, rowIndex, columnIndex, barrierFree: true, clearWidthMeters: 2.4 };
      community.add(path);
    });
  });
  const residentialRenderBatch = createInstancedPrototypeBatch({
    name: "standard-community-residential-render-batch",
    parent: community,
    prototype: residentialBuildings[0],
    placements: residentialBuildings,
    enabled: options.optimizeStatic !== false,
  });

  const parkingSpaces: THREE.Group[] = [];
  const parkedVehicles: THREE.Group[] = [];
  const vehicleMaterialRegistries = new Map<string, Map<string, THREE.Material>>();
  const parkingXs = Array.from({ length: 22 }, (_, index) => -63 + index * 6)
    .filter((x) => Math.abs(x) >= 7);
  roadRows.forEach((roadZ, rowIndex) => {
    for (const side of [-1, 1] as const) {
      const layby = communityMesh(new THREE.BoxGeometry(61, 0.11, 6.4), parking, "standard-community-ground-parking-layby", "rideable-surface");
      layby.position.set(side * 36.5, 0.605, roadZ + 6.7);
      layby.userData = {
        ...layby.userData,
        rowIndex,
        communitySide: side < 0 ? "left" : "right",
        parkingType: "ground",
        connectedToRoad: true,
        clearsCentralDividerRoad: true,
      };
      community.add(layby);
    }
    parkingXs.forEach((x, spaceIndex) => {
      const bay = new THREE.Group();
      bay.name = "standard-community-ground-parking-space";
      bay.position.set(x, 0, roadZ + 6.7);
      bay.userData = { rowIndex, spaceIndex, parkingType: "ground", moduleAligned: true, clearWidthMeters: 2.7, depthMeters: 5.4 };
      addBox(bay, [0.08, 0.018, 5.4], [-1.31, 0.67, 0], line, "standard-community-parking-side-line", "ignore", "micro-detail");
      addBox(bay, [0.08, 0.018, 5.4], [1.31, 0.67, 0], line, "standard-community-parking-side-line", "ignore", "micro-detail");
      addBox(bay, [2.7, 0.018, 0.08], [0, 0.67, 2.66], line, "standard-community-parking-stop-line", "ignore", "micro-detail");
      community.add(bay);
      parkingSpaces.push(bay);
      if ((spaceIndex + rowIndex * 2) % 5 === 1) {
        const vehicle = (spaceIndex + rowIndex) % 2 === 0 ? buildDetailedPrivateSedan() : buildDetailedPrivateSuv();
        const vehicleKind = vehicle.userData.vehicleKind as string;
        const vehicleRegistry = vehicleMaterialRegistries.get(vehicleKind) ?? new Map<string, THREE.Material>();
        vehicleMaterialRegistries.set(vehicleKind, vehicleRegistry);
        shareModelMaterials(vehicle, vehicleRegistry);
        vehicle.name = "standard-community-parked-private-vehicle";
        vehicle.position.set(x, 0.67, roadZ + 6.7);
        vehicle.rotation.y = Math.PI * 0.5;
        vehicle.userData.parkingRowIndex = rowIndex;
        vehicle.userData.parked = true;
        community.add(vehicle);
        parkedVehicles.push(vehicle);
      }
    });
  });
  const vehicleRenderBatches = ["sedan", "suv"].flatMap((vehicleKind) => {
    const placements = parkedVehicles.filter((vehicle) => vehicle.userData.vehicleKind === vehicleKind);
    if (placements.length === 0) return [];
    return [createInstancedPrototypeBatch({
      name: `standard-community-${vehicleKind}-render-batch`,
      parent: community,
      prototype: placements[0],
      placements,
      enabled: options.optimizeStatic !== false,
    })];
  });

  const fitness = new THREE.Group();
  fitness.name = "standard-community-outdoor-fitness-zone";
  const fitnessZ = buildingRows[Math.floor(rowsPerSide * 0.5)] - 9;
  fitness.position.set(-32, 0, fitnessZ);
  fitness.userData = {
    accessible: true,
    ageFriendly: true,
    safetyBufferMeters: 1.5,
    groundSupported: true,
    placementZone: "dedicated-west-fitness-garden",
    separatedFromCentralRoad: true,
    dedicatedPocket: true,
    insideResidentialBoundary: true,
  };
  const fitnessSurface = communityMesh(new THREE.BoxGeometry(20, 0.12, 10), rubberBlue, "standard-community-fitness-safety-surface", "rideable-surface");
  fitnessSurface.position.y = 0.64;
  fitness.add(fitnessSurface);
  const fitnessBoundaryMaterial = new THREE.MeshStandardMaterial({ color: 0x52724a, roughness: 0.92 });
  for (const z of [-4.75, 4.75]) {
    addBox(fitness, [19.8, 0.62, 0.28], [0, 0.98, z], fitnessBoundaryMaterial, "standard-community-fitness-pocket-boundary");
  }
  addBox(fitness, [0.28, 0.62, 9.8], [-9.75, 0.98, 0], fitnessBoundaryMaterial, "standard-community-fitness-pocket-boundary");
  for (const z of [-3.4, 3.4]) {
    addBox(fitness, [0.28, 0.62, 3], [9.75, 0.98, z], fitnessBoundaryMaterial, "standard-community-fitness-pocket-boundary");
  }
  addBox(fitness, [0.16, 1.75, 0.16], [8.85, 1.58, 0], dark, "standard-community-fitness-pocket-sign-post");
  addBox(fitness, [1.7, 0.68, 0.12], [8.85, 2.25, 0], fitnessYellow, "standard-community-fitness-pocket-sign", "ignore", "micro-detail");
  const fitnessEquipment: THREE.Group[] = [];
  const addFitnessStation = (name: string, x: number, z: number, kind: string) => {
    const station = new THREE.Group();
    station.name = "standard-community-fitness-equipment";
    station.position.set(x, 0.7, z);
    station.userData = { equipmentType: kind, groundSupported: true, safetyClearanceMeters: 1.5 };
    addBox(station, [1.5, 0.18, 1.25], [0, 0.09, 0], concrete, `${name}-base`);
    if (kind === "pull-up-bars") {
      for (const px of [-0.62, 0.62]) addBox(station, [0.12, 2.5, 0.12], [px, 1.43, 0], dark, `${name}-post`);
      addBox(station, [1.36, 0.12, 0.12], [0, 2.62, 0], fitnessYellow, `${name}-bar`);
    } else if (kind === "waist-twister") {
      addBox(station, [0.14, 1.35, 0.14], [0, 0.85, 0], dark, `${name}-post`);
      addBox(station, [1.25, 0.12, 0.12], [0, 1.45, 0], fitnessYellow, `${name}-handle`);
      for (const px of [-0.42, 0.42]) {
        const disc = communityMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), fitnessRed, `${name}-twist-disc`);
        disc.position.set(px, 0.27, 0);
        station.add(disc);
      }
    } else if (kind === "air-walker") {
      for (const px of [-0.52, 0.52]) addBox(station, [0.12, 2, 0.12], [px, 1.18, 0], dark, `${name}-post`);
      addBox(station, [1.16, 0.12, 0.12], [0, 2.08, 0], fitnessYellow, `${name}-handle`);
      for (const px of [-0.38, 0.38]) {
        addBox(station, [0.12, 1.15, 0.12], [px, 0.92, 0], fitnessRed, `${name}-swing-arm`);
        addBox(station, [0.42, 0.1, 0.7], [px, 0.35, 0.16], fitnessYellow, `${name}-pedal`);
      }
    } else {
      for (const px of [-0.48, 0.48]) addBox(station, [0.1, 1.75, 0.1], [px, 1.05, 0], dark, `${name}-post`);
      for (const y of [0.72, 1.25, 1.82]) addBox(station, [1.05, 0.1, 0.1], [0, y, 0], fitnessYellow, `${name}-stretch-bar`);
    }
    fitness.add(station);
    fitnessEquipment.push(station);
  };
  addFitnessStation("fitness-pull-up", -7.8, -2.4, "pull-up-bars");
  addFitnessStation("fitness-waist", -2.7, -2.4, "waist-twister");
  addFitnessStation("fitness-walker", 2.7, -2.4, "air-walker");
  addFitnessStation("fitness-stretch", 7.8, -2.4, "stretch-frame");
  addFitnessStation("fitness-pull-up", -5.3, 2.4, "pull-up-bars");
  addFitnessStation("fitness-walker", 0, 2.4, "air-walker");
  addFitnessStation("fitness-waist", 5.3, 2.4, "waist-twister");
  community.add(fitness);

  const standardGate = buildLowPolyStandardResidentialGate();
  standardGate.name = "standard-community-main-gate";
  standardGate.position.set(0, 0.5, siteHalfDepth - 3);
  standardGate.userData.sourceModel = "city-residential-gate-standard-lowpoly";
  community.add(standardGate);

  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x405156, roughness: 0.58, metalness: 0.32 });
  const fenceGroups: THREE.Group[] = [];
  const addFence = (x: number, z: number, length: number, horizontal: boolean) => {
    const fence = new THREE.Group();
    fence.name = "standard-community-perimeter-fence";
    fence.position.set(x, 0, z);
    fence.userData = { protectedBoundary: true, antiClimb: true };
    addBox(fence, horizontal ? [length, 0.45, 0.4] : [0.4, 0.45, length], [0, 0.72, 0], concrete, "standard-community-fence-base");
    const posts = Math.max(2, Math.floor(length / 2));
    for (let index = 0; index <= posts; index += 1) {
      const offset = -length * 0.5 + index / posts * length;
      addBox(fence, [0.12, 1.7, 0.12], [horizontal ? offset : 0, 1.75, horizontal ? 0 : offset], fenceMaterial, "standard-community-fence-post");
    }
    for (const y of [1.25, 2.12]) {
      addBox(fence, horizontal ? [length, 0.1, 0.1] : [0.1, 0.1, length], [0, y, 0], fenceMaterial, "standard-community-fence-rail");
    }
    community.add(fence);
    fenceGroups.push(fence);
  };
  addFence(0, -siteHalfDepth + 0.6, 158, true);
  addFence(-79.4, 0, siteDepth - 0.2, false);
  addFence(79.4, 0, siteDepth - 0.2, false);
  addFence(-44.7, siteHalfDepth - 0.6, 69.4, true);
  addFence(44.7, siteHalfDepth - 0.6, 69.4, true);

  const streetLights: THREE.Group[] = [];
  const streetLightMaterials = new Map<string, THREE.Material>();
  roadRows.forEach((z) => {
    for (const x of [-60, -36, -12, 12, 36, 60]) {
      const light = buildLowPolyStreetLight();
      shareModelMaterials(light, streetLightMaterials);
      light.position.set(x, 0.62, z - 4.8);
      light.rotation.y = Math.PI;
      light.userData.sourceCollection = "city-street-furniture";
      light.userData.surfaceY = 0.62;
      light.userData.grounded = true;
      community.add(light);
      streetLights.push(light);
    }
  });
  const axialLightRows = Array.from(
    { length: Math.max(5, rowsPerSide + 2) },
    (_, index) => -siteHalfDepth + 10 + index * ((siteDepth - 20) / Math.max(4, rowsPerSide + 1)),
  );
  for (const z of axialLightRows) {
    for (const x of [-5.3, 5.3]) {
      const light = buildLowPolyStreetLight();
      shareModelMaterials(light, streetLightMaterials);
      light.position.set(x, 0.62, z);
      light.rotation.y = x < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      light.userData.sourceCollection = "city-street-furniture";
      light.userData.surfaceY = 0.62;
      light.userData.grounded = true;
      community.add(light);
      streetLights.push(light);
    }
  }

  const planterZ = siteHalfDepth - 4;
  const planterPositions: Array<[number, number]> = [
    [-67, planterZ], [-53, planterZ], [-36, planterZ],
    [36, planterZ], [53, planterZ], [67, planterZ],
  ];
  const planterGroups: THREE.Group[] = [];
  const planterMaterials = new Map<string, THREE.Material>();
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    shareModelMaterials(planter, planterMaterials);
    planter.position.set(x, 0.62, z);
    planter.scale.setScalar(1.05);
    planter.userData.sourceCollection = "city-street-furniture";
    community.add(planter);
    planterGroups.push(planter);
  });

  const treePositions: Array<[number, number, "roadside" | "central-green" | "fitness-green" | "row-garden" | "boundary-green" | "entry-green"]> = [];
  roadRows.forEach((z) => {
    for (const x of [-48, -32, 32, 48]) treePositions.push([x, z - 5.2, "roadside"]);
  });
  for (const [x, z] of [
    [-8.5, fitnessZ - 8], [8.5, fitnessZ - 8], [-8.5, fitnessZ + 8], [8.5, fitnessZ + 8],
    [-55, fitnessZ - 6], [-55, fitnessZ + 6], [55, fitnessZ - 6], [55, fitnessZ + 6],
  ] as Array<[number, number]>) {
    treePositions.push([x, z, "central-green"]);
  }
  treePositions.push([-44, fitnessZ, "fitness-green"], [-20, fitnessZ, "fitness-green"]);
  for (const z of buildingRows) {
    for (const x of [-56, -8, 8, 56]) treePositions.push([x, z - 8, "row-garden"]);
  }
  for (const x of [-77, 77]) {
    const boundaryTreeCount = rowsPerSide + 1;
    for (let index = 0; index < boundaryTreeCount; index += 1) {
      const z = -siteHalfDepth + 18 + index * ((siteDepth - 36) / Math.max(1, boundaryTreeCount - 1));
      treePositions.push([x, z, "boundary-green"]);
    }
  }
  treePositions.push([-58, siteHalfDepth - 4, "entry-green"], [58, siteHalfDepth - 4, "entry-green"]);
  treePositions.forEach(([x, z, placementZone]) => {
    const anchor = new THREE.Group();
    anchor.name = "standard-community-reused-tree-anchor";
    anchor.position.set(x, 0.62, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    anchor.userData.surfaceY = 0.62;
    anchor.userData.grounded = true;
    anchor.userData.treeScaleClass = "small";
    anchor.userData.placementZone = placementZone;
    anchor.userData.roadsideTree = placementZone === "roadside";
    community.add(anchor);
  });

  const staticRenderBatch = createMergedStaticBatch({
    name: "standard-community-static-detail-render-batch",
    parent: community,
    sources: [...roadMarkings, ...parkingSpaces, fitness, ...fenceGroups, ...streetLights, ...planterGroups],
    enabled: options.optimizeStatic !== false,
  });
  const nightLightPool = new THREE.Group();
  nightLightPool.name = "standard-community-night-light-pool";
  const nightLightSources: THREE.PointLight[] = [];
  const pooledLightRows = [
    roadRows[0] - 1,
    roadRows[Math.floor((roadRows.length - 1) * 0.5)] - 1,
    roadRows[roadRows.length - 1] - 1,
  ];
  const pooledLightPlacements: Array<[number, number, number, number]> = pooledLightRows.flatMap((z) => [
    [-32, 7, z, 34], [0, 7, z, 34], [32, 7, z, 34],
  ]);
  pooledLightPlacements.push([-48, 4.8, fitnessZ, 24], [0, 4.8, fitnessZ, 24], [48, 4.8, fitnessZ, 24]);
  for (const [x, y, z, distance] of pooledLightPlacements) {
    const light = new THREE.PointLight(0xffc57d, 0, distance, 1.9);
    light.name = "standard-community-pooled-night-light";
    light.position.set(x, y, z);
    light.castShadow = false;
    light.visible = false;
    light.userData = { pooled: true, coversMultipleFixtures: true };
    nightLightPool.add(light);
    nightLightSources.push(light);
  }
  community.add(nightLightPool);

  community.userData = {
    mapLayer: "exterior",
    modelType: "standard-residential-community",
    generatedLocally: true,
    moduleGridMeters: 1,
    siteSize: new THREE.Vector3(STANDARD_COMMUNITY_SITE_WIDTH_METERS, 55, siteDepth),
    residentialBuildingCount: residentialBuildings.length,
    residentialBuildingTypeCount: 1,
    householdCount: residentialBuildings.length * 20,
    residentialRowCount: rowsPerSide,
    rowsPerSide,
    leftRowCount: rowsPerSide,
    rightRowCount: rowsPerSide,
    communityLayout: "left-right-central-road",
    centralDividerRoadWidthMeters: 8,
    parkingRowCount: roadRows.length,
    parkingLaybyCount: roadRows.length * 2,
    parkingSpaceCount: parkingSpaces.length,
    parkedVehicleCount: parkedVehicles.length,
    greenCoverageRatio: greenAreaSquareMeters / (STANDARD_COMMUNITY_SITE_WIDTH_METERS * siteDepth),
    greenAreaSquareMeters,
    fitnessEquipmentCount: fitnessEquipment.length,
    fitnessZoneSide: "left",
    treeAnchorCount: treePositions.length,
    streetLightCount: streetLights.length,
    renderBatchCount: residentialRenderBatch.userData.batchCount
      + vehicleRenderBatches.reduce((sum, batch) => sum + batch.userData.batchCount, 0)
      + staticRenderBatch.userData.batchCount,
    unbatchedSourceMeshCount: residentialRenderBatch.userData.sourceMeshCount
      + vehicleRenderBatches.reduce((sum, batch) => sum + batch.userData.sourceMeshCount, 0)
      + staticRenderBatch.userData.sourceMeshCount,
    treeRenderBatchCount: 0,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-residential-gate-standard-lowpoly",
    ],
    setAccessGateOpen: (open) => standardGate.userData.setGateOpen(open),
    setPowered: (powered) => {
      standardGate.userData.setPowered(powered);
      streetLights.forEach((light) => {
        light.userData.setPowered(powered);
        light.userData.powered = powered;
        light.traverse((object) => {
          if (object instanceof THREE.Light) object.visible = false;
        });
      });
      residentialBuildings.forEach((building) => {
        building.userData.setPowered?.(powered);
        building.traverse((object) => {
          if (object instanceof THREE.Light) object.visible = false;
        });
      });
      parkedVehicles.forEach((vehicle) => {
        vehicle.userData.setPowered?.(powered);
        vehicle.traverse((object) => {
          if (object instanceof THREE.Light) object.visible = false;
        });
      });
      nightLightSources.forEach((light) => {
        light.visible = powered;
        light.intensity = powered ? 3.4 : 0;
      });
      standardGate.traverse((object) => {
        if (object instanceof THREE.Light) object.visible = powered;
      });
    },
  };
  community.userData.setAccessGateOpen(false);
  community.userData.setPowered(false);
  return community;
}
