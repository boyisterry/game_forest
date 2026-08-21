import * as THREE from "three";
import {
  applySceneShadowPolicy,
  createOptimizedStaticSceneBatch,
  createScenePointLightPool,
  markCityMutableMaterials,
} from "./sceneInstanceBatch.ts";
import { applyReviewedCityMapLodTags } from "./cityMapLodTags.ts";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHotDogKiosk,
  buildLowPolyNewsstand,
  buildLowPolyPhoneBooth,
  buildLowPolyRoadsidePlanter,
  buildLowPolyStreetLight,
} from "./cityFurniture.ts";

export type TownCenterZone = "civic" | "culture" | "market" | "commerce" | "service" | "transport" | "square";

export type TownCenterModel = THREE.Group & {
  userData: {
    modelType: "town-center";
    generatedLocally: true;
    zones: TownCenterZone[];
    buildingCount: number;
    townHallFloorCount: number;
    clockTowerHeightMeters: number;
    libraryReadingSeatCount: number;
    cultureHallSeatCount: number;
    indoorMarketStallCount: number;
    outdoorMarketStallCount: number;
    mainStreetShopCount: number;
    publicServiceCounterCount: number;
    postOfficeCounterCount: number;
    parkingSpaceCount: number;
    busStopCount: number;
    bicycleStandCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    foodTruckCount: number;
    reusedKioskCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setMarketDay: (active: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    update: (elapsedSeconds: number) => void;
    renderBatchCount: number;
    mergedSourceMeshCount: number;
    pooledNightLightCount: number;
    shadowCastersRemoved: number;
  };
};

function townMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: TownCenterZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

export function buildLowPolyTownCenter(
  options: Readonly<{ optimizeStatic?: boolean }> = {},
): TownCenterModel {
  const town = new THREE.Group() as TownCenterModel;
  town.name = "walkable-town-center-lowpoly";
  const cutawayShells: THREE.Object3D[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];
  const marketCanopies: THREE.Object3D[] = [];
  const clockHandSets: THREE.Group[] = [];
  let marketDay = false;
  let isPowered = false;

  const stone = new THREE.MeshStandardMaterial({ color: 0xc7c0b2, roughness: 0.95 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xddd1bc, roughness: 0.91 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xefe7d6, roughness: 0.84 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf5eedf, roughness: 0.8 });
  const brick = new THREE.MeshStandardMaterial({ color: 0xa95842, roughness: 0.87 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0x9b4938, roughness: 0.82 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x477c8e, roughness: 0.72 });
  const green = new THREE.MeshStandardMaterial({ color: 0x668764, roughness: 0.82 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8aa48, roughness: 0.75 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x936846, roughness: 0.87 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x65767a, roughness: 0.5, metalness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3f43, roughness: 0.62, metalness: 0.25 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x515859, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x78966d, roughness: 0.98 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6fa6ae, emissive: 0x204a51, emissiveIntensity: 0.08, roughness: 0.2, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const warmWindow = new THREE.MeshStandardMaterial({ color: 0xf0c77e, emissive: 0xffa53f, emissiveIntensity: 0.08, roughness: 0.25, transparent: true, opacity: 0.72, depthWrite: false });
  const clockFace = new THREE.MeshStandardMaterial({ color: 0xf3e6c8, emissive: 0xffcc72, emissiveIntensity: 0.18, roughness: 0.56 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4a99aa, emissive: 0x164751, emissiveIntensity: 0.12, roughness: 0.18, transparent: true, opacity: 0.84 });

  const site = townMesh(new THREE.BoxGeometry(175, 0.4, 135), stone, "town-center-site-base");
  site.position.y = 0.2;
  const landscape = townMesh(new THREE.BoxGeometry(168, 0.12, 128), grass, "town-center-landscape-base");
  landscape.position.y = 0.45;
  town.add(site, landscape);

  // Slow perimeter streets leave the civic square fully pedestrianised.
  for (const [x, z, width, depth] of [[0, 61, 169, 10], [0, -61, 169, 10], [-81, 0, 10, 112], [81, 0, 10, 112]] as Array<[number, number, number, number]>) {
    const road = townMesh(new THREE.BoxGeometry(width, 0.15, depth), asphalt, "town-center-perimeter-street", "transport");
    road.position.set(x, 0.56, z);
    town.add(road);
  }
  const mainWalk = townMesh(new THREE.BoxGeometry(17, 0.16, 116), paving, "town-center-pedestrian-main-axis", "square");
  mainWalk.position.set(0, 0.66, 0);
  const crossWalk = townMesh(new THREE.BoxGeometry(140, 0.16, 13), paving, "town-center-pedestrian-cross-axis", "square");
  crossWalk.position.set(0, 0.67, 7);
  const centralSquare = townMesh(new THREE.BoxGeometry(68, 0.2, 50), paving, "town-center-civic-square", "square");
  centralSquare.position.set(0, 0.69, 5);
  town.add(mainWalk, crossWalk, centralSquare);
  for (const [x, z, width, depth, axis] of [[0, 61, 17, 10, "north-south"], [0, -61, 17, 10, "north-south"], [81, 7, 10, 13, "east-west"], [-81, 7, 10, 13, "east-west"]] as Array<[number, number, number, number, string]>) {
    const connection = townMesh(new THREE.BoxGeometry(width, 0.09, depth), paving, "town-center-pedestrian-road-connection", "transport");
    connection.position.set(x, 0.71, z);
    connection.userData = { raisedCrossing: true, continuousToPedestrianAxis: true, axis };
    town.add(connection);
  }

  const addGabledBuilding = (
    name: string,
    zone: TownCenterZone,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    wallMaterial: THREE.Material,
    roofMaterial: THREE.Material,
  ) => {
    const building = new THREE.Group();
    building.name = name;
    building.position.set(x, 0, z);
    const frontSign = z < 5 ? 1 : -1;
    building.userData = { zone, frontDirection: "toward-square", publicEntranceFacing: frontSign > 0 ? "+z" : "-z" };
    const shell = townMesh(new THREE.BoxGeometry(width, height, depth), wallMaterial, "town-center-building-shell", zone);
    shell.position.y = 0.65 + height * 0.5;
    const roof = new THREE.Group();
    roof.name = "town-center-gabled-roof";
    roof.userData = { zone, geometry: "two-plane-pitched-roof", ridgeAxis: "x" };
    const rise = Math.min(depth * 0.28, 5);
    const halfRun = depth * 0.5 + 0.55;
    const slopeLength = Math.hypot(halfRun, rise);
    const pitchAngle = Math.atan2(rise, halfRun);
    const roofWidth = width + 1.2;
    const ridgeOpening = name === "town-center-town-hall" ? 12 : 0;
    const xSections = ridgeOpening > 0
      ? [
          { width: (roofWidth - ridgeOpening) * 0.5, x: -(roofWidth + ridgeOpening) * 0.25 },
          { width: (roofWidth - ridgeOpening) * 0.5, x: (roofWidth + ridgeOpening) * 0.25 },
        ]
      : [{ width: roofWidth, x: 0 }];
    for (const side of [-1, 1]) {
      for (const section of xSections) {
        const plane = townMesh(new THREE.BoxGeometry(section.width, 0.45, slopeLength), roofMaterial, "town-center-gabled-roof-plane", zone);
        plane.position.set(section.x, 0.65 + height + rise * 0.5, side * (depth * 0.25 + 0.275));
        plane.rotation.x = side * pitchAngle;
        roof.add(plane);
      }
    }
    const entrance = townMesh(new THREE.BoxGeometry(3.2, 3.5, 0.24), glass, "town-center-public-building-entrance", zone);
    entrance.position.set(0, 2.4, frontSign * (depth * 0.5 + 0.13));
    entrance.userData = { barrierFree: true, clearWidthMeters: 2.8, facing: frontSign > 0 ? "+z" : "-z" };
    const entranceCanopy = townMesh(new THREE.BoxGeometry(5.2, 0.25, 2.1), roofMaterial, "town-center-public-building-entrance-canopy", zone);
    entranceCanopy.position.set(0, 4.65, frontSign * (depth * 0.5 + 0.9));
    entranceCanopy.rotation.x = frontSign * 0.08;
    building.add(shell, roof, entrance, entranceCanopy);
    cutawayShells.push(shell, roof);
    town.add(building);
    return building;
  };

  // Town hall and civic clock tower form the visual centre without metropolitan high-rise scale.
  const townHall = addGabledBuilding("town-center-town-hall", "civic", 0, -42, 39, 21, 12, pale, terracotta);
  townHall.userData = {
    ...townHall.userData,
    floorCount: 3,
    publicEntranceFacing: "+z",
    interiorSpaces: ["public-lobby", "service-hall", "council-chamber", "administration-offices", "records-room"],
    accessibleElevator: true,
    stairCoreCount: 2,
  };
  const hallPortico = new THREE.Group();
  hallPortico.name = "town-center-town-hall-portico";
  hallPortico.position.set(0, 0, -30.8);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    const column = townMesh(new THREE.CylinderGeometry(0.5, 0.62, 7, 10), cream, "town-center-town-hall-column", "civic");
    column.position.set(x, 4.15, 0);
    hallPortico.add(column);
  }
  const porticoRoof = townMesh(new THREE.BoxGeometry(21, 0.65, 5), stone, "town-center-town-hall-portico-roof", "civic");
  porticoRoof.position.y = 7.75;
  hallPortico.add(porticoRoof);
  town.add(hallPortico);
  for (let floor = 0; floor < 3; floor += 1) {
    for (let bay = 0; bay < 7; bay += 1) {
      if (floor === 0 && bay === 3) continue;
      const window = townMesh(new THREE.BoxGeometry(2.7, 2.2, 0.16), warmWindow, "town-center-town-hall-window", "civic");
      window.position.set(-15 + bay * 5, 3.1 + floor * 3.6, -31.43);
      town.add(window);
      cutawayShells.push(window);
    }
  }

  // Three fitted civic floors remain visible when the exterior shell is cut away.
  const townHallInterior = new THREE.Group();
  townHallInterior.name = "town-center-town-hall-interior";
  townHallInterior.userData = { floorCount: 3, publiclyAccessibleFloors: [1, 2], accessibleElevator: true };
  const civicFloorLevels = [0.78, 4.38, 7.98];
  civicFloorLevels.forEach((floorY, floorIndex) => {
    const slab = townMesh(new THREE.BoxGeometry(37, 0.18, 19), floorIndex === 0 ? stone : cream, "town-center-town-hall-floor-slab", "civic");
    slab.position.y = floorY;
    slab.userData = { floorNumber: floorIndex + 1 };
    townHallInterior.add(slab);
    for (const x of [-12, -6, 0, 6, 12]) {
      const ceilingLight = townMesh(new THREE.BoxGeometry(2.6, 0.08, 0.7), warmWindow, "town-center-town-hall-ceiling-light", "civic");
      ceilingLight.position.set(x, floorY + 3.25, floorIndex === 1 ? 4 : -4);
      townHallInterior.add(ceilingLight);
    }
  });

  const lobbyDesk = townMesh(new THREE.BoxGeometry(7.2, 1.05, 1.3), timber, "town-center-town-hall-reception-desk", "civic");
  lobbyDesk.position.set(0, 1.4, 5.2);
  townHallInterior.add(lobbyDesk);
  for (let counterIndex = 0; counterIndex < 5; counterIndex += 1) {
    const counter = townMesh(new THREE.BoxGeometry(3.8, 1, 1.1), counterIndex % 2 ? blue : timber, "town-center-town-hall-service-counter", "civic");
    counter.position.set(-9.2 + counterIndex * 4.6, 1.38, -5.8);
    counter.userData = { serviceNumber: counterIndex + 1, publicFacing: "+z" };
    townHallInterior.add(counter);
  }
  for (let chairIndex = 0; chairIndex < 12; chairIndex += 1) {
    const row = Math.floor(chairIndex / 6);
    const column = chairIndex % 6;
    const chair = new THREE.Group();
    chair.name = "town-center-town-hall-waiting-chair";
    chair.position.set(-8.5 + column * 3.4, 0, 1.2 + row * 2.2);
    const seat = townMesh(new THREE.BoxGeometry(1.35, 0.16, 1.15), blue, "town-center-town-hall-waiting-chair-seat", "civic");
    seat.position.y = 1.27;
    const back = townMesh(new THREE.BoxGeometry(1.35, 0.9, 0.16), blue, "town-center-town-hall-waiting-chair-back", "civic");
    back.position.set(0, 1.7, -0.5);
    for (const legX of [-0.48, 0.48]) {
      const leg = townMesh(new THREE.BoxGeometry(0.1, 0.42, 0.72), dark, "town-center-town-hall-waiting-chair-leg", "civic");
      leg.position.set(legX, 0.99, 0);
      chair.add(leg);
    }
    chair.add(seat, back);
    townHallInterior.add(chair);
  }

  const councilTable = townMesh(new THREE.RingGeometry(4.2, 6.8, 24, 1, 0, Math.PI * 1.55), timber, "town-center-town-hall-council-table", "civic");
  councilTable.rotation.x = -Math.PI * 0.5;
  councilTable.rotation.z = Math.PI * 0.72;
  councilTable.position.set(0, 5.18, -0.5);
  townHallInterior.add(councilTable);
  for (let seatIndex = 0; seatIndex < 14; seatIndex += 1) {
    const angle = -Math.PI * 0.27 + seatIndex / 13 * Math.PI * 1.54;
    const councilSeat = new THREE.Group();
    councilSeat.name = "town-center-town-hall-council-seat";
    councilSeat.position.set(Math.cos(angle) * 7.7, 0, -0.5 + Math.sin(angle) * 7.7);
    councilSeat.rotation.y = -angle - Math.PI * 0.5;
    const seat = townMesh(new THREE.BoxGeometry(1.1, 0.16, 1), terracotta, "town-center-town-hall-council-seat-cushion", "civic");
    seat.position.y = 4.95;
    const back = townMesh(new THREE.BoxGeometry(1.1, 0.85, 0.14), terracotta, "town-center-town-hall-council-seat-back", "civic");
    back.position.set(0, 5.35, 0.43);
    councilSeat.add(seat, back);
    townHallInterior.add(councilSeat);
  }
  const mayorDais = townMesh(new THREE.BoxGeometry(8, 0.3, 2.2), stone, "town-center-town-hall-council-dais", "civic");
  mayorDais.position.set(0, 4.72, -7.3);
  townHallInterior.add(mayorDais);

  for (const x of [-11.5, -3.8, 3.8, 11.5]) {
    const partition = townMesh(new THREE.BoxGeometry(0.14, 3.15, 8), glass, "town-center-town-hall-office-partition", "civic");
    partition.position.set(x, 9.6, -2.4);
    townHallInterior.add(partition);
  }
  for (let deskIndex = 0; deskIndex < 8; deskIndex += 1) {
    const column = deskIndex % 4;
    const row = Math.floor(deskIndex / 4);
    const desk = townMesh(new THREE.BoxGeometry(3.4, 0.24, 1.4), timber, "town-center-town-hall-office-desk", "civic");
    desk.position.set(-11.4 + column * 7.6, 8.88, -5.5 + row * 5.8);
    townHallInterior.add(desk);
  }
  const recordsRoom = townMesh(new THREE.BoxGeometry(7.2, 2.7, 0.55), dark, "town-center-town-hall-records-storage", "civic");
  recordsRoom.position.set(-14.2, 9.45, 5.5);
  recordsRoom.userData = { secureRoom: true };
  townHallInterior.add(recordsRoom);

  for (const coreX of [-15.5, 15.5]) {
    const stairCore = new THREE.Group();
    stairCore.name = "town-center-town-hall-stair-core";
    stairCore.position.set(coreX, 0, -6.5);
    stairCore.userData = { servesFloors: [1, 2, 3], emergencyEgress: true };
    for (let level = 0; level < 2; level += 1) {
      for (let stepIndex = 0; stepIndex < 10; stepIndex += 1) {
        const step = townMesh(new THREE.BoxGeometry(2.4, 0.18, 0.5), stone, "town-center-town-hall-stair-step", "civic");
        step.position.set(0, 0.96 + level * 3.6 + stepIndex * 0.35, -2.2 + stepIndex * 0.43);
        stairCore.add(step);
      }
    }
    townHallInterior.add(stairCore);
  }
  const elevator = new THREE.Group();
  elevator.name = "town-center-town-hall-elevator";
  elevator.position.set(12.5, 0, 5.5);
  elevator.userData = { servesFloors: [1, 2, 3], barrierFree: true };
  const elevatorShaft = townMesh(new THREE.BoxGeometry(3.1, 10.7, 3.1), glass, "town-center-town-hall-elevator-shaft", "civic");
  elevatorShaft.position.y = 6.05;
  elevator.add(elevatorShaft);
  for (const floorY of civicFloorLevels) {
    const door = townMesh(new THREE.BoxGeometry(1.8, 2.35, 0.12), steel, "town-center-town-hall-elevator-door", "civic");
    door.position.set(0, floorY + 1.25, 1.62);
    elevator.add(door);
  }
  townHallInterior.add(elevator);
  townHall.add(townHallInterior);

  const clockTower = new THREE.Group();
  clockTower.name = "town-center-clock-tower";
  clockTower.position.set(0, 0, -42);
  clockTower.userData = {
    zone: "civic",
    heightMeters: 38,
    interiorLevels: ["town-hall-access", "maintenance", "clockwork", "belfry"],
    spiralStairStepCount: 44,
    mechanicalClockwork: true,
  };
  const towerShaft = townMesh(new THREE.BoxGeometry(9, 17, 9), brick, "town-center-clock-tower-shaft", "civic");
  towerShaft.position.y = 18;
  const belfry = townMesh(new THREE.BoxGeometry(11, 5, 11), pale, "town-center-clock-belfry", "civic");
  belfry.position.y = 27;
  const spire = townMesh(new THREE.ConeGeometry(7.6, 8, 4), terracotta, "town-center-clock-spire", "civic");
  spire.rotation.y = Math.PI * 0.25;
  spire.position.y = 33.5;
  clockTower.add(towerShaft, belfry, spire);
  cutawayShells.push(towerShaft, belfry, spire);

  const towerCore = townMesh(new THREE.CylinderGeometry(0.22, 0.3, 16.5, 10), steel, "town-center-clock-tower-stair-core", "civic");
  towerCore.position.y = 18;
  clockTower.add(towerCore);
  for (let stepIndex = 0; stepIndex < 6; stepIndex += 1) {
    const accessStep = townMesh(new THREE.BoxGeometry(2.2, 0.16, 0.62), stone, "town-center-clock-tower-access-step", "civic");
    accessStep.position.set(0, 8.18 + stepIndex * 0.3, 3.1 - stepIndex * 0.55);
    accessStep.userData = { connectsTownHallThirdFloor: true };
    clockTower.add(accessStep);
  }
  for (let stepIndex = 0; stepIndex < 44; stepIndex += 1) {
    const angle = stepIndex * Math.PI * 0.31;
    const step = townMesh(new THREE.BoxGeometry(1.9, 0.13, 0.58), stone, "town-center-clock-tower-spiral-step", "civic");
    step.position.set(Math.cos(angle) * 2.05, 9.9 + stepIndex * 0.35, Math.sin(angle) * 2.05);
    step.rotation.y = -angle;
    step.userData = { stepNumber: stepIndex + 1, maintenanceAccess: true };
    clockTower.add(step);
  }
  for (const platformY of [10, 17.4, 24.2]) {
    const platform = townMesh(new THREE.RingGeometry(1.25, 3.75, 16), steel, "town-center-clock-tower-maintenance-platform", "civic");
    platform.rotation.x = -Math.PI * 0.5;
    platform.position.y = platformY;
    platform.userData = { safetyRailRequired: true };
    clockTower.add(platform);
    for (let railIndex = 0; railIndex < 8; railIndex += 1) {
      const angle = railIndex / 8 * Math.PI * 2;
      const railPost = townMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6), dark, "town-center-clock-tower-platform-rail", "civic");
      railPost.position.set(Math.cos(angle) * 3.55, platformY + 0.52, Math.sin(angle) * 3.55);
      clockTower.add(railPost);
    }
  }
  const clockAxle = townMesh(new THREE.CylinderGeometry(0.18, 0.18, 8.2, 10), steel, "town-center-clock-tower-clock-axle", "civic");
  clockAxle.rotation.x = Math.PI * 0.5;
  clockAxle.position.y = 27.5;
  clockTower.add(clockAxle);
  for (const [radius, z, material] of [[1.65, -1.2, yellow], [1.15, 0, terracotta], [0.82, 1.2, steel]] as Array<[number, number, THREE.Material]>) {
    const gear = townMesh(new THREE.TorusGeometry(radius, 0.18, 8, 20), material, "town-center-clock-tower-clockwork-gear", "civic");
    gear.position.set(0, 27.5, z);
    gear.userData = { connectedToClockAxle: true };
    clockTower.add(gear);
  }
  const bell = townMesh(new THREE.CylinderGeometry(0.7, 1.35, 1.8, 14), yellow, "town-center-clock-tower-bell", "civic");
  bell.position.y = 25.8;
  const clapper = townMesh(new THREE.CylinderGeometry(0.13, 0.2, 1.6, 8), dark, "town-center-clock-tower-bell-clapper", "civic");
  clapper.position.y = 24.95;
  clockTower.add(bell, clapper);
  for (const z of [-5.56, 5.56]) {
    const face = townMesh(new THREE.CylinderGeometry(2.1, 2.1, 0.18, 24), clockFace, "town-center-clock-face", "civic");
    face.rotation.x = Math.PI * 0.5;
    face.position.set(0, 27.5, z);
    clockTower.add(face);
    cutawayShells.push(face);
    for (let tick = 0; tick < 12; tick += 1) {
      const angle = tick / 12 * Math.PI * 2;
      const marker = townMesh(new THREE.BoxGeometry(0.16, tick % 3 === 0 ? 0.58 : 0.36, 0.08), dark, "town-center-clock-minute-marker", "civic");
      marker.position.set(Math.sin(angle) * 1.62, 27.5 + Math.cos(angle) * 1.62, z + (z > 0 ? 0.13 : -0.13));
      marker.rotation.z = -angle;
      clockTower.add(marker);
      cutawayShells.push(marker);
    }
    const handSet = new THREE.Group();
    handSet.name = "town-center-clock-hand-set";
    handSet.position.set(0, 27.5, z + (z > 0 ? 0.18 : -0.18));
    const minuteHand = townMesh(new THREE.BoxGeometry(0.14, 1.45, 0.1), dark, "town-center-clock-minute-hand", "civic");
    minuteHand.position.y = 0.62;
    const hourHand = townMesh(new THREE.BoxGeometry(0.2, 1, 0.12), dark, "town-center-clock-hour-hand", "civic");
    hourHand.position.set(0.28, 0.35, 0);
    hourHand.rotation.z = -0.7;
    handSet.add(minuteHand, hourHand);
    clockHandSets.push(handSet);
    clockTower.add(handSet);
    cutawayShells.push(handSet);
  }
  town.add(clockTower);

  // Library with visible reading room, shelving and a sheltered entrance facing the square.
  const library = addGabledBuilding("town-center-public-library", "culture", -53, -22, 34, 25, 9, cream, blue);
  library.userData = { ...library.userData, floorCount: 2, readingSeatCount: 48 };
  for (let bay = 0; bay < 6; bay += 1) {
    const window = townMesh(new THREE.BoxGeometry(4.2, 3.6, 0.18), glass, "town-center-library-window", "culture");
    window.position.set(-66 + bay * 5.2, 4.8, -9.42);
    town.add(window);
    cutawayShells.push(window);
  }
  for (let shelf = 0; shelf < 12; shelf += 1) {
    const row = Math.floor(shelf / 6);
    const column = shelf % 6;
    const bookcase = townMesh(new THREE.BoxGeometry(0.75, 2.6, 3.6), timber, "town-center-library-bookcase", "culture");
    bookcase.position.set(-65 + column * 5, 2, -27 + row * 8);
    town.add(bookcase);
  }
  for (let table = 0; table < 6; table += 1) {
    const readingTable = townMesh(new THREE.BoxGeometry(3.6, 0.25, 1.4), timber, "town-center-library-reading-table", "culture");
    readingTable.position.set(-65 + table * 5, 1.4, -15);
    town.add(readingTable);
    const tableX = -65 + table * 5;
    const chairOffsets: Array<[number, number, number]> = [
      [-1.2, -1.25, 0], [0, -1.25, 0], [1.2, -1.25, 0],
      [-1.2, 1.25, Math.PI], [0, 1.25, Math.PI], [1.2, 1.25, Math.PI],
      [-2.25, 0, Math.PI * 0.5], [2.25, 0, -Math.PI * 0.5],
    ];
    chairOffsets.forEach(([offsetX, offsetZ, rotation]) => {
      const chair = new THREE.Group();
      chair.name = "town-center-library-reading-chair";
      chair.position.set(tableX + offsetX, 0, -15 + offsetZ);
      chair.rotation.y = rotation;
      chair.userData = { readingSeat: true };
      const seat = townMesh(new THREE.BoxGeometry(0.72, 0.16, 0.72), timber, "town-center-library-chair-seat", "culture");
      seat.position.y = 1.05;
      const back = townMesh(new THREE.BoxGeometry(0.72, 0.9, 0.12), timber, "town-center-library-chair-back", "culture");
      back.position.set(0, 1.45, 0.34);
      chair.add(seat, back);
      town.add(chair);
    });
  }

  // Cultural hall and 180-seat community auditorium.
  const cultureHall = addGabledBuilding("town-center-cultural-hall", "culture", 53, -23, 38, 27, 11, pale, terracotta);
  cultureHall.userData = { ...cultureHall.userData, auditoriumCapacity: 180, multipurpose: true };
  const stage = townMesh(new THREE.BoxGeometry(19, 1.2, 5.5), timber, "town-center-cultural-hall-stage", "culture");
  stage.position.set(53, 1.3, -33);
  town.add(stage);
  for (let row = 0; row < 9; row += 1) {
    for (let block = 0; block < 4; block += 1) {
      const seats = townMesh(new THREE.BoxGeometry(4.2, 0.65, 1.1), block % 2 ? blue : brick, "town-center-cultural-hall-seat-block", "culture");
      seats.position.set(45.5 + block * 5, 1.15 + row * 0.18, -28 + row * 1.7);
      town.add(seats);
    }
  }
  for (let bay = 0; bay < 7; bay += 1) {
    const window = townMesh(new THREE.BoxGeometry(4, 3.6, 0.18), warmWindow, "town-center-cultural-hall-window", "culture");
    window.position.set(38.5 + bay * 4.8, 5.2, -9.42);
    town.add(window);
    cutawayShells.push(window);
  }

  // Covered market and outdoor stalls occupy a dedicated market lane.
  const marketHall = addGabledBuilding("town-center-market-hall", "market", -55, 31, 39, 24, 7.5, brick, dark);
  marketHall.userData = { ...marketHall.userData, indoorStallCount: 16, publicEntranceFacing: "-z" };
  for (let stall = 0; stall < 16; stall += 1) {
    const row = Math.floor(stall / 8);
    const column = stall % 8;
    const counter = townMesh(new THREE.BoxGeometry(3.3, 1.1, 1.5), column % 3 === 0 ? green : column % 3 === 1 ? yellow : blue, "town-center-indoor-market-stall", "market");
    counter.position.set(-69 + column * 4, 1.3, 26 + row * 8);
    town.add(counter);
  }
  for (let stall = 0; stall < 12; stall += 1) {
    const row = Math.floor(stall / 6);
    const column = stall % 6;
    const x = -70 + column * 6.2;
    const z = 47 + row * 6;
    const counter = townMesh(new THREE.BoxGeometry(3.5, 1, 1.4), timber, "town-center-outdoor-market-stall", "market");
    counter.position.set(x, 1.25, z);
    const canopy = townMesh(new THREE.ConeGeometry(3, 1.25, 4), stall % 2 ? yellow : brick, "town-center-outdoor-market-canopy", "market");
    canopy.rotation.y = Math.PI * 0.25;
    canopy.position.set(x, 4, z);
    canopy.visible = false;
    canopy.userData = { homeY: 4, phase: stall * 0.4 };
    marketCanopies.push(canopy);
    town.add(counter, canopy);
  }

  // Six independent main-street shop houses create active frontages facing the civic square.
  for (let shop = 0; shop < 6; shop += 1) {
    const x = 29.5 + shop * 8.4;
    const shopHouse = new THREE.Group();
    shopHouse.name = "town-center-main-street-shop";
    shopHouse.position.set(x, 0, 32);
    shopHouse.userData = { zone: "commerce", shopNumber: shop + 1, frontageFacing: "-z", use: ["bakery", "cafe", "grocer", "pharmacy", "craft", "restaurant"][shop] };
    const shell = townMesh(new THREE.BoxGeometry(7.3, 8.8, 18), shop % 2 ? cream : pale, "town-center-shop-house-shell", "commerce");
    shell.position.y = 5.05;
    const roof = townMesh(new THREE.BoxGeometry(7.9, 0.65, 19), shop % 2 ? terracotta : blue, "town-center-shop-house-roof", "commerce");
    roof.position.y = 9.75;
    const storefront = townMesh(new THREE.BoxGeometry(5.5, 3.2, 0.2), glass, "town-center-shop-storefront", "commerce");
    storefront.position.set(0, 2.7, -9.1);
    const awning = townMesh(new THREE.BoxGeometry(6.1, 0.28, 2), shop % 2 ? yellow : brick, "town-center-shop-awning", "commerce");
    awning.position.set(0, 4.7, -9.8);
    awning.rotation.x = -0.18;
    shopHouse.add(shell, roof, storefront, awning);
    cutawayShells.push(shell, roof, storefront);
    town.add(shopHouse);
  }

  // Civic service centre and post office remain easy to reach from the southern arrival street.
  const serviceCenter = addGabledBuilding("town-center-public-service-centre", "service", -18, 49, 28, 15, 6.5, pale, green);
  serviceCenter.userData = { ...serviceCenter.userData, counterCount: 6, accessible: true };
  for (let counter = 0; counter < 6; counter += 1) {
    const desk = townMesh(new THREE.BoxGeometry(2.8, 1.1, 1), timber, "town-center-public-service-counter", "service");
    desk.position.set(-29 + counter * 4.4, 1.35, 47);
    town.add(desk);
  }
  const postOffice = addGabledBuilding("town-center-post-office", "service", 16, 49, 25, 15, 6.5, cream, brick);
  postOffice.userData = { ...postOffice.userData, counterCount: 4, parcelLockers: 12 };
  for (let counter = 0; counter < 4; counter += 1) {
    const desk = townMesh(new THREE.BoxGeometry(3.2, 1.1, 1), blue, "town-center-post-office-counter", "service");
    desk.position.set(9 + counter * 4.5, 1.35, 47);
    town.add(desk);
  }
  for (let locker = 0; locker < 12; locker += 1) {
    const row = Math.floor(locker / 6);
    const column = locker % 6;
    const parcelLocker = townMesh(new THREE.BoxGeometry(1.3, 1.25, 0.7), yellow, "town-center-post-office-parcel-locker", "service");
    parcelLocker.position.set(6 + column * 1.4, 1.35 + row * 1.3, 56.8);
    town.add(parcelLocker);
  }

  // The square is centred on an artistic fountain of interlocking ribbons and arcing water veils.
  const artFountain = new THREE.Group();
  artFountain.name = "town-center-square-art-fountain";
  artFountain.position.set(0, 0, 8);
  artFountain.userData = {
    zone: "square",
    artisticForm: "three-interlocking-ribbons",
    waterJetCount: 6,
    basinDiameterMeters: 14.4,
  };
  const basin = townMesh(new THREE.CylinderGeometry(6.8, 7.2, 0.5, 36), stone, "town-center-square-fountain-basin", "square");
  basin.position.y = 0.96;
  const pool = townMesh(new THREE.CylinderGeometry(6.45, 6.45, 0.18, 36), water, "town-center-square-fountain-water", "square");
  pool.position.y = 1.25;
  const sculpturePlinth = townMesh(new THREE.CylinderGeometry(1.35, 1.75, 0.62, 16), dark, "town-center-square-fountain-sculpture-plinth", "square");
  sculpturePlinth.position.y = 1.55;
  artFountain.add(basin, pool, sculpturePlinth);

  const ribbonMaterials = [terracotta, steel, yellow];
  for (let ribbonIndex = 0; ribbonIndex < 3; ribbonIndex += 1) {
    const ribbon = townMesh(
      new THREE.TorusGeometry(2.65, 0.23, 8, 32, Math.PI * 1.32),
      ribbonMaterials[ribbonIndex],
      "town-center-square-fountain-art-ribbon",
      "square",
    );
    ribbon.position.y = 4.25;
    ribbon.rotation.set(0, ribbonIndex * Math.PI / 3, -0.38 + ribbonIndex * 0.08);
    ribbon.userData = { structuralBaseY: 1.55, interlocking: true };
    artFountain.add(ribbon);
  }
  const crystal = townMesh(new THREE.IcosahedronGeometry(0.82, 1), warmWindow, "town-center-square-fountain-crystal", "square");
  crystal.position.y = 4.5;
  crystal.userData = { suspendedByRibbons: true, nightIlluminated: true };
  artFountain.add(crystal);

  for (let jetIndex = 0; jetIndex < 6; jetIndex += 1) {
    const angle = jetIndex / 6 * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(angle) * 5.3, 1.38, Math.sin(angle) * 5.3);
    const end = new THREE.Vector3(Math.cos(angle) * 1.05, 2.25, Math.sin(angle) * 1.05);
    const control = start.clone().lerp(end, 0.48);
    control.y = 4.15;
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    const waterJet = townMesh(new THREE.TubeGeometry(curve, 16, 0.075, 6, false), water, "town-center-square-fountain-water-jet", "square");
    waterJet.userData = { arcingIntoBasin: true, jetIndex };
    artFountain.add(waterJet);
  }
  const crownJet = townMesh(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 8), water, "town-center-square-fountain-crown-jet", "square");
  crownJet.position.y = 6.55;
  artFountain.add(crownJet);
  town.add(artFountain);

  const squareSurfaceY = 0.79;
  for (let bench = 0; bench < 8; bench += 1) {
    const angle = bench / 8 * Math.PI * 2;
    const benchGroup = new THREE.Group();
    benchGroup.name = "town-center-square-bench";
    benchGroup.position.set(Math.cos(angle) * 18, 0, 8 + Math.sin(angle) * 15);
    benchGroup.rotation.y = -angle + Math.PI * 0.5;
    benchGroup.userData = { zone: "square", supportedByLegs: true, facesFountain: true, groundContactY: squareSurfaceY };
    const seat = townMesh(new THREE.BoxGeometry(4.2, 0.24, 1), timber, "town-center-square-bench-seat", "square");
    seat.position.y = 1.28;
    const backrest = townMesh(new THREE.BoxGeometry(4.2, 0.78, 0.18), timber, "town-center-square-bench-backrest", "square");
    backrest.position.set(0, 1.72, 0.4);
    benchGroup.add(seat, backrest);
    for (const legX of [-1.48, 1.48]) {
      const leg = townMesh(new THREE.BoxGeometry(0.24, 0.37, 0.66), dark, "town-center-square-bench-leg", "square");
      leg.position.set(legX, squareSurfaceY + 0.185, 0);
      leg.userData = { groundContactY: squareSurfaceY };
      benchGroup.add(leg);
    }
    for (const armX of [-1.94, 0, 1.94]) {
      const armPost = townMesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), dark, "town-center-square-bench-armrest-post", "square");
      armPost.position.set(armX, 1.57, -0.28);
      const armTop = townMesh(new THREE.BoxGeometry(0.14, 0.12, 0.78), dark, "town-center-square-bench-armrest", "square");
      armTop.position.set(armX, 1.84, 0.02);
      benchGroup.add(armPost, armTop);
    }
    town.add(benchGroup);
  }

  // Two local bus stops and short-stay parking support the centre without becoming a large transport hub.
  for (const [index, [x, z, rotation]] of [[-55, 60, 0], [55, -60, Math.PI]].entries()) {
    const stop = new THREE.Group();
    stop.name = "town-center-local-bus-stop";
    stop.position.set(x, 0, z);
    stop.rotation.y = rotation;
    stop.userData = { zone: "transport", stopNumber: index + 1, sheltered: true, accessible: true };
    const platform = townMesh(new THREE.BoxGeometry(15, 0.2, 3.5), paving, "town-center-bus-stop-platform", "transport");
    platform.position.y = 0.78;
    const shelter = townMesh(new THREE.BoxGeometry(13, 0.35, 3.3), blue, "town-center-bus-stop-shelter", "transport");
    shelter.position.y = 4.5;
    for (const px of [-5.5, 0, 5.5]) {
      const post = townMesh(new THREE.CylinderGeometry(0.12, 0.16, 3.5, 8), steel, "town-center-bus-stop-post", "transport");
      post.position.set(px, 2.7, 0);
      stop.add(post);
    }
    stop.add(platform, shelter);
    town.add(stop);
  }
  let parkingSpaceCount = 0;
  for (const startX of [-73, 40]) {
    for (let bay = 0; bay < 16; bay += 1) {
      parkingSpaceCount += 1;
      const x = startX + (bay % 8) * 4.2;
      const z = 56 - Math.floor(bay / 8) * 6;
      const space = townMesh(new THREE.BoxGeometry(3.4, 0.04, 5.2), asphalt, "town-center-parking-space", "transport");
      space.position.set(x, 0.68, z);
      const line = townMesh(new THREE.BoxGeometry(0.08, 0.025, 5.1), cream, "town-center-parking-line", "transport");
      line.position.set(x - 1.75, 0.71, z);
      town.add(space, line);
    }
  }
  for (let rack = 0; rack < 10; rack += 1) {
    const bicycleStand = townMesh(new THREE.TorusGeometry(0.65, 0.08, 6, 14, Math.PI), steel, "town-center-bicycle-stand", "transport");
    bicycleStand.rotation.y = Math.PI * 0.5;
    bicycleStand.position.set(-8 + rack * 1.7, 1.25, 35);
    town.add(bicycleStand);
  }

  const parkingLightPositions: Array<[number, number, number]> = [
    [-72, 44.5, -Math.PI * 0.5],
    [-57, 44.5, -Math.PI * 0.5],
    [-42, 44.5, -Math.PI * 0.5],
    [42, 44.5, -Math.PI * 0.5],
    [57, 44.5, -Math.PI * 0.5],
    [72, 44.5, -Math.PI * 0.5],
    [-36, 52, Math.PI],
    [36, 52, 0],
  ];
  const generalLightPositions: Array<[number, number, number]> = [
    [-75, -54, Math.PI * 0.5], [-52, -54, Math.PI * 0.5], [-28, -54, Math.PI * 0.5],
    [0, -54, Math.PI * 0.5], [28, -54, Math.PI * 0.5], [52, -54, Math.PI * 0.5], [75, -54, Math.PI * 0.5],
    [-74, -28, 0], [-74, 2, 0], [-74, 31, 0],
    [74, -30, Math.PI], [74, 0, Math.PI], [74, 29, Math.PI], [0, 31, -Math.PI * 0.5],
  ];
  const lightPositions = [
    ...parkingLightPositions.map(([x, z, rotation]) => ({ x, z, rotation, parkingPerimeter: true, groundY: 0.51 })),
    ...generalLightPositions.map(([x, z, rotation]) => ({ x, z, rotation, parkingPerimeter: false, groundY: 0.58 })),
  ];
  lightPositions.forEach(({ x, z, rotation, parkingPerimeter, groundY }) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, groundY, z);
    light.rotation.y = rotation;
    light.scale.setScalar(0.9);
    light.userData.sourceCollection = "city-street-furniture";
    light.userData.parkingPerimeter = parkingPerimeter;
    light.userData.clearOfParkingSpaces = true;
    light.userData.groundContactY = groundY;
    reusedStreetLights.push(light);
    town.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-26, -13], [-13, -13], [13, -13], [26, -13], [-27, 26], [-14, 26], [14, 26], [27, 26], [-34, 7], [34, 7], [-34, 18], [34, 18]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.73, z);
    planter.scale.setScalar(0.96);
    planter.userData.sourceCollection = "city-street-furniture";
    town.add(planter);
  });
  for (const x of [-10, 4]) {
    const truck = buildLowPolyFoodTruck();
    truck.position.set(x, 0.7, 42);
    truck.rotation.y = -Math.PI * 0.5;
    truck.scale.setScalar(0.87);
    truck.userData.sourceCollection = "city-street-furniture";
    truck.userData.setServingOpen(true);
    reusedFoodTrucks.push(truck);
    town.add(truck);
  }
  const hotDog = buildLowPolyHotDogKiosk();
  hotDog.position.set(21, 0.72, 22);
  hotDog.scale.setScalar(0.88);
  hotDog.userData.setServingOpen(true);
  hotDog.userData.sourceCollection = "city-street-furniture";
  town.add(hotDog);
  const newsstand = buildLowPolyNewsstand();
  newsstand.position.set(-24, 0.72, 22);
  newsstand.scale.setScalar(0.9);
  newsstand.userData.setOpen(true);
  newsstand.userData.sourceCollection = "city-street-furniture";
  town.add(newsstand);
  for (const x of [-37, 37]) {
    const phone = buildLowPolyPhoneBooth();
    phone.position.set(x, 0.72, -4);
    phone.scale.setScalar(0.88);
    phone.userData.setDoorOpen(false);
    phone.userData.sourceCollection = "city-street-furniture";
    town.add(phone);
  }
  const treePositions: Array<[number, number]> = [[-85, -64], [-63, -64], [-38, -64], [-15, -64], [15, -64], [40, -64], [65, -64], [85, -64], [-85, -40], [-85, -12], [-85, 16], [-85, 44], [85, -42], [85, -15], [85, 14], [85, 44], [-68, 16], [-47, 14], [47, 14], [68, 15], [-31, 34], [31, 34], [-29, -8], [29, -8], [-18, 29], [18, 29], [-57, 47], [58, 46]];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "town-center-reused-tree-anchor";
    anchor.position.set(x, 0.58, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    town.add(anchor);
  });

  const performanceDynamicRoots = [...cutawayShells, ...marketCanopies, ...clockHandSets];
  applyReviewedCityMapLodTags(town, "town-center");
  const shadowMetrics = applySceneShadowPolicy(town, { dynamicRoots: performanceDynamicRoots });
  const staticRenderBatch = createOptimizedStaticSceneBatch({
    name: "town-center-static-render-batch",
    parent: town,
    excludedRoots: performanceDynamicRoots,
    mutableMaterials: markCityMutableMaterials([glass, warmWindow, clockFace, water]),
    cellSizeMeters: 70,
    enabled: options.optimizeStatic !== false,
  });
  const pooledNightLights = createScenePointLightPool({
    name: "town-center-night-light-pool",
    root: town,
    cellSizeMeters: 64,
    maximumDistance: 46,
  });

  town.userData = {
    mapLayer: "exterior",
    modelType: "town-center",
    generatedLocally: true,
    zones: ["civic", "culture", "market", "commerce", "service", "transport", "square"],
    buildingCount: 13,
    townHallFloorCount: 3,
    clockTowerHeightMeters: 38,
    libraryReadingSeatCount: 48,
    cultureHallSeatCount: 180,
    indoorMarketStallCount: 16,
    outdoorMarketStallCount: 12,
    mainStreetShopCount: 6,
    publicServiceCounterCount: 6,
    postOfficeCounterCount: 4,
    parkingSpaceCount,
    busStopCount: 2,
    bicycleStandCount: 10,
    treeAnchorCount: treePositions.length,
    streetLightCount: lightPositions.length,
    planterCount: planterPositions.length,
    foodTruckCount: reusedFoodTrucks.length,
    reusedKioskCount: 4,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-food-truck-lowpoly",
      "city-hot-dog-kiosk-lowpoly",
      "city-newsstand-lowpoly",
      "city-phone-booth-lowpoly",
    ],
    siteSize: new THREE.Vector3(175, 41, 135),
    renderBatchCount: staticRenderBatch.userData.batchCount,
    mergedSourceMeshCount: staticRenderBatch.userData.mergedSourceMeshCount,
    pooledNightLightCount: pooledNightLights.pooledLightCount,
    shadowCastersRemoved: shadowMetrics.shadowCastersRemoved,
    setPowered: (powered) => {
      isPowered = powered;
      glass.emissiveIntensity = powered ? 1.1 : 0.08;
      warmWindow.emissiveIntensity = powered ? 2.3 : 0.08;
      clockFace.emissiveIntensity = powered ? 2.8 : 0.18;
      water.emissiveIntensity = powered ? 0.55 : 0.12;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      reusedFoodTrucks.forEach((truck) => truck.userData.setLights(powered));
      hotDog.userData.setPowered(powered);
      newsstand.userData.setPowered(powered);
      town.traverse((object) => {
        if (object.name === "city-phone-booth-lowpoly") object.userData.setPowered(powered);
      });
      pooledNightLights.setPowered(powered);
    },
    setMarketDay: (active) => {
      marketDay = active;
      marketCanopies.forEach((canopy) => { canopy.visible = active; });
      reusedFoodTrucks.forEach((truck) => truck.userData.setServingOpen(active));
      if (!active) clockFace.emissiveIntensity = isPowered ? 2.8 : 0.18;
    },
    setInteriorCutaway: (cutaway) => { cutawayShells.forEach((object) => { object.visible = !cutaway; }); },
    update: (elapsedSeconds) => {
      clockHandSets.forEach((handSet, index) => { handSet.rotation.z = -elapsedSeconds * 0.035 + index * 0.02; });
      if (!marketDay) return;
      marketCanopies.forEach((canopy) => {
        canopy.position.y = canopy.userData.homeY + Math.sin(elapsedSeconds * 2 + canopy.userData.phase) * 0.08;
      });
      clockFace.emissiveIntensity = (isPowered ? 2.8 : 0.18) + Math.sin(elapsedSeconds * 1.8) * 0.12;
    },
  };
  town.userData.setPowered(false);
  town.userData.setMarketDay(false);
  town.userData.setInteriorCutaway(false);
  return town;
}
