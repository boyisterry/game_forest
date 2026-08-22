import * as THREE from "three";
import {
  applySceneShadowPolicy,
  createOptimizedStaticSceneBatch,
  createScenePointLightPool,
  markCityMutableMaterials,
} from "./sceneInstanceBatch.ts";
import { applyReviewedCityMapLodTags } from "./cityMapLodTags.ts";
import { buildLowPolyRoadsidePlanter, buildLowPolyStreetLight } from "./cityFurniture.ts";

export type FireStationZone = "response" | "command" | "living" | "training";

export type FireStationModel = THREE.Group & {
  userData: {
    modelType: "fire-station-campus";
    generatedLocally: true;
    zones: FireStationZone[];
    buildingCount: number;
    apparatusBayCount: number;
    fireEngineCount: number;
    commandDeskCount: number;
    dormBedCount: number;
    trainingTowerFloors: number;
    trainingFacilityCount: number;
    equipmentRackCount: number;
    hydrantCount: number;
    fenceSegmentCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setApparatusDoorsOpen: (open: boolean) => void;
    setResponseGatesOpen: (open: boolean) => void;
    setVisitorGateOpen: (open: boolean) => void;
    setServiceGateOpen: (open: boolean) => void;
    setAlertActive: (active: boolean) => void;
    update: (elapsedSeconds: number) => void;
    renderBatchCount: number;
    mergedSourceMeshCount: number;
    pooledNightLightCount: number;
    shadowCastersRemoved: number;
  };
};

function fireMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: FireStationZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

function beamBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, name: string, zone?: FireStationZone) {
  const direction = end.clone().sub(start);
  const beam = fireMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, name, zone);
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
}

export function buildLowPolyFireStation(
  options: Readonly<{ optimizeStatic?: boolean }> = {},
): FireStationModel {
  const station = new THREE.Group() as FireStationModel;
  station.name = "city-fire-station-campus-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const apparatusDoors: THREE.Mesh[] = [];
  const fireEngines: THREE.Group[] = [];
  const responseGatePanels: THREE.Mesh[] = [];
  const visitorGatePanels: THREE.Mesh[] = [];
  const serviceGatePanels: THREE.Mesh[] = [];
  const alertLights: THREE.PointLight[] = [];
  const alertBeaconMaterials: THREE.MeshStandardMaterial[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  let alertActive = false;

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc7c2b8, roughness: 0.94 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xeee9de, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.8 });
  const fireRed = new THREE.MeshStandardMaterial({ color: 0xc94d3f, emissive: 0x5c120d, emissiveIntensity: 0.08, roughness: 0.68 });
  const deepRed = new THREE.MeshStandardMaterial({ color: 0x8e312b, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303f45, roughness: 0.58, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x98a4a7, roughness: 0.4, metalness: 0.62 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4c5355, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x75936a, roughness: 0.98 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xdcd4c5, roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x966e4e, roughness: 0.86 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x536f7e, roughness: 0.96 });
  const hose = new THREE.MeshStandardMaterial({ color: 0xe3bd55, roughness: 0.82 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6fa5b0, emissive: 0x234853, emissiveIntensity: 0.1, roughness: 0.24, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xffd89a, emissive: 0xffa13c, emissiveIntensity: 0.15, roughness: 0.3 });
  const alertMaterial = new THREE.MeshStandardMaterial({ color: 0xd93630, emissive: 0xff2018, emissiveIntensity: 0.1, roughness: 0.28 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4f9fb2, emissive: 0x174552, emissiveIntensity: 0.12, roughness: 0.2, transparent: true, opacity: 0.8 });

  const site = fireMesh(new THREE.BoxGeometry(155, 0.38, 110), concrete, "fire-station-site-base");
  site.position.y = 0.19;
  const lawn = fireMesh(new THREE.BoxGeometry(147, 0.13, 102), grass, "fire-station-landscape-base");
  lawn.position.y = 0.45;
  station.add(site, lawn);

  const publicRoad = fireMesh(new THREE.BoxGeometry(151, 0.13, 9), asphalt, "fire-station-public-response-road", "response");
  publicRoad.position.set(0, 0.54, 50.5);
  const publicSidewalk = fireMesh(new THREE.BoxGeometry(151, 0.13, 3.8), paving, "fire-station-public-sidewalk", "response");
  publicSidewalk.position.set(0, 0.61, 44);
  station.add(publicRoad, publicSidewalk);
  for (let x = -70; x <= 70; x += 14) {
    const marking = fireMesh(new THREE.BoxGeometry(6, 0.025, 0.12), white, "fire-station-public-road-marking", "response");
    marking.position.set(x, 0.62, 51);
    station.add(marking);
  }

  // Six unobstructed response lanes connect each appliance bay directly to the city road.
  const bayCenters = [-64, -49, -34, -19, -4, 11];
  bayCenters.forEach((x, index) => {
    const lane = fireMesh(new THREE.BoxGeometry(12.2, 0.13, 25), asphalt, "fire-station-response-lane", "response");
    lane.position.set(x, 0.57, 32.5);
    lane.userData = { bayNumber: index + 1, directToPublicRoad: true, clearWidth: 12.2 };
    station.add(lane);
    for (const side of [-1, 1]) {
      const line = fireMesh(new THREE.BoxGeometry(0.12, 0.025, 24), white, "fire-station-response-lane-line", "response");
      line.position.set(x + side * 6.05, 0.65, 32.5);
      station.add(line);
    }
  });
  const visitorRoad = fireMesh(new THREE.BoxGeometry(18, 0.13, 25), asphalt, "fire-station-visitor-access-road", "command");
  visitorRoad.position.set(53, 0.57, 32.5);
  const serviceRoad = fireMesh(new THREE.BoxGeometry(7, 0.13, 91), asphalt, "fire-station-service-road", "living");
  serviceRoad.position.set(73, 0.56, -1);
  station.add(visitorRoad, serviceRoad);

  const addBuilding = (name: string, zone: FireStationZone, x: number, z: number, width: number, depth: number, floors: number, accent: THREE.Material) => {
    const building = new THREE.Group();
    building.name = name;
    building.position.set(x, 0, z);
    building.userData = {
      zone,
      floors,
      floorPitchMeters: 3.45,
      buildingSizeMeters: new THREE.Vector3(width, floors * 3.45, depth),
      frontDirection: "+z",
    };
    const height = floors * 3.45;
    const body = new THREE.Group();
    body.name = "fire-station-building-shell";
    if (name === "fire-station-apparatus-hall") {
      const rearWall = fireMesh(new THREE.BoxGeometry(width, height, 0.4), pale, "fire-station-apparatus-rear-wall", zone);
      rearWall.position.set(0, 0.65 + height * 0.5, -depth * 0.5);
      const leftWall = fireMesh(new THREE.BoxGeometry(0.5, height, depth), pale, "fire-station-apparatus-side-wall", zone);
      leftWall.position.set(-width * 0.5, 0.65 + height * 0.5, 0);
      const rightWall = leftWall.clone();
      rightWall.position.x = width * 0.5;
      const upperFront = fireMesh(new THREE.BoxGeometry(width, height - 6.7, 0.4), pale, "fire-station-apparatus-upper-front-wall", zone);
      upperFront.position.set(0, 0.65 + 6.7 + (height - 6.7) * 0.5, depth * 0.5);
      body.add(rearWall, leftWall, rightWall, upperFront);
      const localBayCenters = bayCenters.map((worldX) => worldX - x);
      const openingHalfWidth = 5.8;
      let wallStart = -width * 0.5;
      for (const center of localBayCenters) {
        const wallEnd = center - openingHalfWidth;
        const pier = fireMesh(new THREE.BoxGeometry(wallEnd - wallStart, 6.7, 0.4), pale, "fire-station-apparatus-front-pier", zone);
        pier.position.set((wallStart + wallEnd) * 0.5, 4, depth * 0.5);
        body.add(pier);
        wallStart = center + openingHalfWidth;
      }
      const endPier = fireMesh(new THREE.BoxGeometry(width * 0.5 - wallStart, 6.7, 0.4), pale, "fire-station-apparatus-front-pier", zone);
      endPier.position.set((wallStart + width * 0.5) * 0.5, 4, depth * 0.5);
      body.add(endPier);
    } else {
      const solidBody = fireMesh(new THREE.BoxGeometry(width, height, depth), pale, "fire-station-building-solid-shell", zone);
      solidBody.position.y = 0.65 + height * 0.5;
      body.add(solidBody);
    }
    const roof = fireMesh(new THREE.BoxGeometry(width + 0.6, 0.35, depth + 0.6), dark, "fire-station-building-roof", zone);
    roof.position.y = 0.65 + height + 0.18;
    const accentBand = fireMesh(new THREE.BoxGeometry(width + 0.08, 0.7, 0.25), accent, "fire-station-building-accent-band", zone);
    accentBand.position.set(0, 0.65 + height - 0.55, depth * 0.5 + 0.1);
    building.add(body, roof, accentBand);
    cutawayShell.push(body, roof);
    station.add(building);
    return { building, width, depth, height, roofY: 0.65 + height };
  };

  const apparatusHall = addBuilding("fire-station-apparatus-hall", "response", -26.5, 8, 105, 27, 3, fireRed);
  const command = addBuilding("fire-station-command-centre", "command", 43, 8, 28, 29, 4, deepRed);
  const living = addBuilding("fire-station-living-quarters", "living", -42, -18, 48, 20, 3, fireRed);
  const warehouse = addBuilding("fire-station-equipment-warehouse", "living", 5, -34, 27, 18, 2, dark);

  // Apparatus hall doors, upper windows and pedestrian access.
  bayCenters.forEach((worldX, index) => {
    const localX = worldX - apparatusHall.building.position.x;
    const bayFrame = new THREE.Group();
    bayFrame.name = "fire-station-apparatus-bay-frame";
    bayFrame.position.set(localX, 0, apparatusHall.depth * 0.5 + 0.08);
    for (const side of [-1, 1]) {
      const jamb = fireMesh(new THREE.BoxGeometry(0.75, 6.6, 0.45), deepRed, "fire-station-apparatus-bay-jamb", "response");
      jamb.position.set(side * 6.32, 3.8, 0);
      bayFrame.add(jamb);
    }
    const lintel = fireMesh(new THREE.BoxGeometry(13.4, 0.75, 0.45), deepRed, "fire-station-apparatus-bay-lintel", "response");
    lintel.position.set(0, 6.72, 0);
    bayFrame.add(lintel);
    const door = fireMesh(new THREE.BoxGeometry(11.6, 5.2, 0.22), metal, "fire-station-apparatus-door", "response");
    door.position.set(localX, 3.25, apparatusHall.depth * 0.5 + 0.34);
    door.userData = { bayNumber: index + 1, closedY: 3.25, openY: 8.8, operable: true };
    apparatusDoors.push(door);
    apparatusHall.building.add(bayFrame, door);
    for (let slat = 1; slat < 6; slat += 1) {
      const joint = fireMesh(new THREE.BoxGeometry(11.4, 0.055, 0.04), dark, "fire-station-apparatus-door-joint", "response");
      joint.position.set(0, -2.5 + slat * 0.85, 0.13);
      door.add(joint);
    }
    const number = fireMesh(new THREE.BoxGeometry(1.25, 0.7, 0.12), warmLight, "fire-station-bay-number-panel", "response");
    number.position.set(localX, 6.75, apparatusHall.depth * 0.5 + 0.42);
    number.userData.bayNumber = index + 1;
    apparatusHall.building.add(number);
  });
  for (let floor = 1; floor < 3; floor += 1) {
    for (let bay = 0; bay < 12; bay += 1) {
      const window = fireMesh(new THREE.BoxGeometry(4.8, 1.5, 0.14), glass, "fire-station-apparatus-upper-window", "response");
      window.position.set(-48 + bay * 8.7, 2.35 + floor * 3.45, apparatusHall.depth * 0.5 + 0.13);
      apparatusHall.building.add(window);
      cutawayShell.push(window);
    }
  }

  const addFacadeWindows = (building: typeof command, columns: number) => {
    for (let floor = 0; floor < Math.round(building.height / 3.45); floor += 1) {
      for (let column = 0; column < columns; column += 1) {
        const window = fireMesh(new THREE.BoxGeometry(building.width / columns - 0.75, 1.55, 0.14), glass, "fire-station-building-window", building.building.userData.zone);
        window.position.set(-building.width * 0.5 + building.width / columns * (column + 0.5), 2.2 + floor * 3.45, building.depth * 0.5 + 0.12);
        building.building.add(window);
        cutawayShell.push(window);
      }
    }
  };
  addFacadeWindows(command, 5);
  addFacadeWindows(living, 8);
  addFacadeWindows(warehouse, 4);

  const commandEntrance = fireMesh(new THREE.BoxGeometry(5.4, 2.6, 0.18), glass, "fire-station-command-entrance", "command");
  commandEntrance.position.set(0, 1.95, command.depth * 0.5 + 0.18);
  const commandCanopy = fireMesh(new THREE.BoxGeometry(10, 0.3, 2.8), fireRed, "fire-station-command-entrance-canopy", "command");
  commandCanopy.position.set(0, 3.65, command.depth * 0.5 + 1.2);
  command.building.add(commandEntrance, commandCanopy);

  // Command floor, watch room and dispatch screens.
  let commandDeskCount = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      commandDeskCount += 1;
      const desk = fireMesh(new THREE.BoxGeometry(2.2, 0.14, 0.85), timber, "fire-station-command-desk", "command");
      desk.position.set(35 + column * 4.5, 1.35, 2 + row * 3.2);
      const screen = fireMesh(new THREE.BoxGeometry(0.9, 0.55, 0.1), warmLight, "fire-station-command-screen", "command");
      screen.position.set(desk.position.x, 1.85, desk.position.z - 0.2);
      station.add(desk, screen);
    }
  }
  const dispatchWall = fireMesh(new THREE.BoxGeometry(10, 3.2, 0.18), glass, "fire-station-dispatch-video-wall", "command");
  dispatchWall.position.set(43, 4.9, -6.42);
  station.add(dispatchWall);

  // Living facilities: dormitory, locker room, kitchen and dining area.
  let dormBedCount = 0;
  for (let floor = 0; floor < 2; floor += 1) {
    for (let room = 0; room < 4; room += 1) {
      for (let bedIndex = 0; bedIndex < 2; bedIndex += 1) {
        dormBedCount += 1;
        const bed = fireMesh(new THREE.BoxGeometry(2, 0.55, 0.88), fabric, "fire-station-dorm-bed", "living");
        bed.position.set(-59 + room * 8.5, 1.08 + floor * 3.45, -21 + bedIndex * 3.2);
        station.add(bed);
      }
    }
  }
  const turnoutReadyArea = new THREE.Group();
  turnoutReadyArea.name = "fire-station-turnout-ready-area";
  turnoutReadyArea.userData = { adjacentToApparatusHall: true, clearAisleWidth: 3.2 };
  for (let locker = 0; locker < 24; locker += 1) {
    const row = Math.floor(locker / 12);
    const column = locker % 12;
    const cabinet = fireMesh(new THREE.BoxGeometry(0.85, 2.05, 0.65), locker % 2 ? deepRed : metal, "fire-station-turnout-gear-locker", "living");
    cabinet.position.set(-69 + column * 5.6, 1.68, -3.85 + row * 1.25);
    cabinet.rotation.y = row === 0 ? 0 : Math.PI;
    cabinet.userData = { ...cabinet.userData, adjacentToApparatusHall: true, row: row + 1 };
    turnoutReadyArea.add(cabinet);
  }
  station.add(turnoutReadyArea);
  for (let table = 0; table < 4; table += 1) {
    const diningTable = fireMesh(new THREE.BoxGeometry(3.2, 0.18, 1.4), timber, "fire-station-dining-table", "living");
    diningTable.position.set(-58 + table * 10, 1.35, -13);
    station.add(diningTable);
  }

  // Equipment warehouse racks and breathing-apparatus cylinders.
  let equipmentRackCount = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      equipmentRackCount += 1;
      const rack = fireMesh(new THREE.BoxGeometry(4.2, 2.7, 0.65), metal, "fire-station-equipment-rack", "living");
      rack.position.set(-4 + column * 6, 2.05, -39 + row * 4.5);
      station.add(rack);
      for (const offset of [-1.3, 0, 1.3]) {
        const cylinder = fireMesh(new THREE.CylinderGeometry(0.22, 0.22, 1.15, 10), fireRed, "fire-station-breathing-cylinder", "living");
        cylinder.position.set(rack.position.x + offset, 1.55, rack.position.z - 0.42);
        station.add(cylinder);
      }
    }
  }

  // Six differentiated fire appliances use realistic human/rabbit-compatible scale.
  const vehicleKinds = ["pump", "pump", "ladder", "rescue", "hazmat", "water-tanker"] as const;
  const buildFireEngine = (kind: typeof vehicleKinds[number], index: number) => {
    const vehicle = new THREE.Group();
    vehicle.name = "fire-station-fire-engine";
    vehicle.userData = { kind, bayNumber: index + 1, capacity: kind === "ladder" ? 4 : 6, forwardDirection: "+z" };
    const body = fireMesh(new THREE.BoxGeometry(2.9, 2.35, 5.4), fireRed, "fire-engine-body", "response");
    body.position.set(0, 1.65, -0.65);
    const cab = fireMesh(new THREE.BoxGeometry(2.9, 2.15, 2.5), fireRed, "fire-engine-cab", "response");
    cab.position.set(0, 1.58, 3.25);
    const windshield = fireMesh(new THREE.BoxGeometry(2.35, 0.9, 0.12), glass, "fire-engine-windshield", "response");
    windshield.position.set(0, 2.05, 4.55);
    const bumper = fireMesh(new THREE.BoxGeometry(3.05, 0.35, 0.45), metal, "fire-engine-bumper", "response");
    bumper.position.set(0, 0.65, 4.62);
    vehicle.add(body, cab, windshield, bumper);
    for (const side of [-1, 1]) {
      for (const z of [-2.4, 2.7]) {
        const wheel = fireMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.32, 12), dark, "fire-engine-wheel", "response");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(side * 1.52, 0.67, z);
        vehicle.add(wheel);
      }
      for (let compartment = 0; compartment < 3; compartment += 1) {
        const hatch = fireMesh(new THREE.BoxGeometry(0.12, 1.25, 1.3), metal, "fire-engine-equipment-compartment", "response");
        hatch.position.set(side * 1.48, 1.7, -2 + compartment * 1.55);
        vehicle.add(hatch);
      }
    }
    const blueBeaconMaterial = alertMaterial.clone();
    blueBeaconMaterial.color.setHex(index % 2 ? 0x286bc0 : 0xd93630);
    blueBeaconMaterial.emissive.setHex(index % 2 ? 0x246dff : 0xff2018);
    alertBeaconMaterials.push(blueBeaconMaterial);
    const beacon = fireMesh(new THREE.BoxGeometry(2.2, 0.22, 0.35), blueBeaconMaterial, "fire-engine-emergency-lightbar", "response");
    beacon.position.set(0, 2.85, 3.25);
    vehicle.add(beacon);
    const point = new THREE.PointLight(index % 2 ? 0x317dff : 0xff3024, 0, 12, 2);
    point.name = "fire-engine-emergency-point-light";
    point.position.copy(beacon.position);
    alertLights.push(point);
    vehicle.add(point);
    if (kind === "ladder") {
      const ladderBase = fireMesh(new THREE.BoxGeometry(1.3, 0.55, 4.6), metal, "fire-engine-ladder-base", "response");
      ladderBase.position.set(0, 3.15, -0.8);
      vehicle.add(ladderBase);
      for (const side of [-0.52, 0.52]) {
        const rail = beamBetween(new THREE.Vector3(side, 3.55, -3), new THREE.Vector3(side, 3.55, 1.8), 0.08, white, "fire-engine-aerial-ladder-rail", "response");
        vehicle.add(rail);
      }
      for (let rung = 0; rung < 9; rung += 1) {
        const rungBeam = fireMesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 8), white, "fire-engine-aerial-ladder-rung", "response");
        rungBeam.rotation.z = Math.PI * 0.5;
        rungBeam.position.set(0, 3.55, -2.8 + rung * 0.55);
        vehicle.add(rungBeam);
      }
    }
    if (kind === "water-tanker") {
      const tank = fireMesh(new THREE.CylinderGeometry(1.18, 1.18, 4.6, 16), metal, "fire-engine-water-tank", "response");
      tank.rotation.x = Math.PI * 0.5;
      tank.position.set(0, 2.05, -0.7);
      vehicle.add(tank);
    }
    return vehicle;
  };
  vehicleKinds.forEach((kind, index) => {
    const vehicle = buildFireEngine(kind, index);
    vehicle.position.set(bayCenters[index], 0.62, 15.8);
    vehicle.userData.readyPositionZ = 15.8;
    vehicle.userData.responsePositionZ = 29.5;
    fireEngines.push(vehicle);
    station.add(vehicle);
  });

  // Eight-storey live-fire training tower with balconies and external escape stairs.
  const trainingTower = new THREE.Group();
  trainingTower.name = "fire-station-training-tower";
  trainingTower.position.set(60, 0, -34);
  trainingTower.userData = { zone: "training", floorCount: 8, liveFireRated: true };
  const towerBody = fireMesh(new THREE.BoxGeometry(14, 29, 14), concrete, "fire-station-training-tower-shell", "training");
  towerBody.position.y = 15.1;
  const towerRoof = fireMesh(new THREE.BoxGeometry(14.6, 0.4, 14.6), dark, "fire-station-training-tower-roof", "training");
  towerRoof.position.y = 29.75;
  trainingTower.add(towerBody, towerRoof);
  cutawayShell.push(towerBody, towerRoof);
  for (let floor = 0; floor < 8; floor += 1) {
    const y = 2.25 + floor * 3.55;
    const window = fireMesh(new THREE.BoxGeometry(2.4, 1.65, 0.18), dark, "fire-station-training-window", "training");
    window.position.set(0, y, 7.1);
    const balcony = fireMesh(new THREE.BoxGeometry(7.2, 0.25, 2), metal, "fire-station-training-balcony", "training");
    balcony.position.set(0, y - 1, 7.85);
    const rail = fireMesh(new THREE.BoxGeometry(7.2, 1, 0.12), metal, "fire-station-training-balcony-rail", "training");
    rail.position.set(0, y - 0.45, 8.75);
    trainingTower.add(window, balcony, rail);
    for (const side of [-1, 1]) {
      const sideRail = fireMesh(new THREE.BoxGeometry(0.12, 1, 2), metal, "fire-station-training-balcony-side-rail", "training");
      sideRail.position.set(side * 3.54, y - 0.45, 7.85);
      trainingTower.add(sideRail);
    }
  }
  const rappel = beamBetween(new THREE.Vector3(5.8, 29.6, 7.4), new THREE.Vector3(5.8, 0.8, 7.4), 0.045, hose, "fire-station-rappel-rope", "training");
  trainingTower.add(rappel);
  station.add(trainingTower);

  const drillYard = fireMesh(new THREE.BoxGeometry(52, 0.14, 34), asphalt, "fire-station-drill-yard", "training");
  drillYard.position.set(38, 0.58, -33);
  station.add(drillYard);
  const waterPoolBase = fireMesh(new THREE.BoxGeometry(15, 0.7, 8), concrete, "fire-station-training-water-pool-base", "training");
  waterPoolBase.position.set(24, 0.93, -43);
  const waterPool = fireMesh(new THREE.BoxGeometry(13.5, 0.18, 6.5), water, "fire-station-training-water-pool", "training");
  waterPool.position.set(24, 1.32, -43);
  station.add(waterPoolBase, waterPool);
  for (let obstacle = 0; obstacle < 5; obstacle += 1) {
    const wall = fireMesh(new THREE.BoxGeometry(0.4, 2 + obstacle * 0.28, 5), obstacle % 2 ? fireRed : concrete, "fire-station-training-obstacle", "training");
    wall.position.set(20 + obstacle * 7, 1.6 + obstacle * 0.14, -24);
    station.add(wall);
  }
  const smokeMaze = new THREE.Group();
  smokeMaze.name = "fire-station-smoke-maze";
  smokeMaze.position.set(42, 0, -43);
  smokeMaze.userData = { entranceClearWidth: 3, corridorClearWidth: 3, continuousRoute: true };
  const mazeFloor = fireMesh(new THREE.BoxGeometry(14, 0.15, 8), concrete, "fire-station-smoke-maze-floor", "training");
  mazeFloor.position.y = 0.65;
  const mazeRoof = fireMesh(new THREE.BoxGeometry(14.4, 0.25, 8.4), dark, "fire-station-smoke-maze-roof", "training");
  mazeRoof.position.y = 4.55;
  const mazeLeftWall = fireMesh(new THREE.BoxGeometry(0.25, 3.8, 8), dark, "fire-station-smoke-maze-side-wall", "training");
  mazeLeftWall.position.set(-6.875, 2.55, 0);
  const mazeRightWall = mazeLeftWall.clone();
  mazeRightWall.position.x = 6.875;
  const mazeRearWall = fireMesh(new THREE.BoxGeometry(14, 3.8, 0.25), dark, "fire-station-smoke-maze-rear-wall", "training");
  mazeRearWall.position.set(0, 2.55, -3.88);
  smokeMaze.add(mazeFloor, mazeRoof, mazeLeftWall, mazeRightWall, mazeRearWall);
  cutawayShell.push(mazeRoof, mazeRightWall);
  for (const side of [-1, 1]) {
    const entranceWall = fireMesh(new THREE.BoxGeometry(5.5, 3.8, 0.25), dark, "fire-station-smoke-maze-front-wall", "training");
    entranceWall.position.set(side * 4.25, 2.55, 3.88);
    smokeMaze.add(entranceWall);
  }
  const mazeEntrance = new THREE.Group();
  mazeEntrance.name = "fire-station-smoke-maze-entrance";
  mazeEntrance.position.set(0, 0.65, 4);
  mazeEntrance.userData = { clearWidth: 3, accessibleFromDrillYard: true };
  smokeMaze.add(mazeEntrance);
  for (const [index, x, z] of [[0, -1.5, 2], [1, 1.5, 0], [2, -1.5, -2]] as Array<[number, number, number]>) {
    const partition = fireMesh(new THREE.BoxGeometry(10.5, 2.8, 0.22), metal, "fire-station-smoke-maze-partition", "training");
    partition.position.set(x, 2.05, z);
    partition.userData = { routeOrder: index + 1, alternatingSideGap: index % 2 === 0 ? "+x" : "-x" };
    smokeMaze.add(partition);
  }
  station.add(smokeMaze);

  // Hydrants support vehicle refill and outdoor hose drills.
  const hydrantPositions: Array<[number, number]> = [[-70, 20], [-40, 20], [-10, 20], [18, 19], [28, -18], [48, -18], [18, -49], [52, -50]];
  hydrantPositions.forEach(([x, z]) => {
    const hydrant = new THREE.Group();
    hydrant.name = "fire-station-hydrant";
    hydrant.position.set(x, 0.6, z);
    const stem = fireMesh(new THREE.CylinderGeometry(0.28, 0.35, 1.25, 10), fireRed, "fire-station-hydrant-stem", "training");
    stem.position.y = 0.72;
    const cap = fireMesh(new THREE.SphereGeometry(0.34, 10, 6), deepRed, "fire-station-hydrant-cap", "training");
    cap.position.y = 1.42;
    const outlet = fireMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.65, 10), metal, "fire-station-hydrant-outlet", "training");
    outlet.rotation.z = Math.PI * 0.5;
    outlet.position.set(0.42, 0.82, 0);
    hydrant.add(stem, cap, outlet);
    station.add(hydrant);
  });

  // Secure perimeter with dedicated response, visitor and service openings.
  let fenceSegmentCount = 0;
  const addFence = (x: number, z: number, length: number, horizontal: boolean) => {
    const segment = new THREE.Group();
    segment.name = "fire-station-security-fence";
    segment.position.set(x, 0, z);
    fenceSegmentCount += 1;
    const base = fireMesh(new THREE.BoxGeometry(horizontal ? length : 0.42, 0.45, horizontal ? 0.42 : length), concrete, "fire-station-fence-base");
    base.position.y = 0.75;
    segment.add(base);
    const count = Math.max(2, Math.floor(length / 2));
    for (let index = 0; index <= count; index += 1) {
      const offset = -length * 0.5 + index / count * length;
      const post = fireMesh(new THREE.BoxGeometry(0.13, 2, 0.13), dark, "fire-station-fence-post");
      post.position.set(horizontal ? offset : 0, 1.88, horizontal ? 0 : offset);
      segment.add(post);
    }
    for (const y of [1.3, 2.28]) {
      const rail = fireMesh(new THREE.BoxGeometry(horizontal ? length : 0.1, 0.1, horizontal ? 0.1 : length), dark, "fire-station-fence-rail");
      rail.position.y = y;
      segment.add(rail);
    }
    station.add(segment);
  };
  addFence(0, -54, 151, true);
  addFence(-76, -2, 104, false);
  addFence(76, -27, 54, false);
  addFence(76, 31, 34, false);
  addFence(-73, 46, 6, true);
  addFence(30.5, 46, 27, true);
  addFence(69, 46, 14, true);
  bayCenters.forEach((x, index) => {
    const responseGate = new THREE.Group();
    responseGate.name = "fire-station-response-gate";
    responseGate.position.set(x, 0, 46);
    responseGate.userData = { bayNumber: index + 1, clearWidth: 12.2, controlledAccess: true, defaultOpen: true };
    for (const side of [-1, 1]) {
      const post = fireMesh(new THREE.BoxGeometry(0.3, 6.5, 0.3), deepRed, "fire-station-response-gate-post", "response");
      post.position.set(side * 6.25, 3.8, 0);
      responseGate.add(post);
    }
    const lintel = fireMesh(new THREE.BoxGeometry(12.8, 0.4, 0.4), deepRed, "fire-station-response-gate-lintel", "response");
    lintel.position.y = 7;
    const panel = fireMesh(new THREE.BoxGeometry(12.1, 2.2, 0.16), dark, "fire-station-response-gate-panel", "response");
    panel.position.y = 5.9;
    panel.userData = { bayNumber: index + 1, closedY: 1.75, openY: 5.9, open: true };
    responseGatePanels.push(panel);
    responseGate.add(lintel, panel);
    station.add(responseGate);
  });
  const visitorGate = new THREE.Group();
  visitorGate.name = "fire-station-visitor-gate";
  visitorGate.position.set(53, 0, 46);
  visitorGate.userData = { clearWidth: 18, controlledAccess: true, defaultOpen: false };
  for (const side of [-1, 1]) {
    const post = fireMesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), deepRed, "fire-station-visitor-gate-post", "command");
    post.position.set(side * 9.25, 2.2, 0);
    const panel = fireMesh(new THREE.BoxGeometry(8.9, 2.2, 0.16), dark, "fire-station-visitor-gate-panel", "command");
    panel.position.set(side * 4.5, 1.75, 0);
    panel.userData = { side, closedX: side * 4.5, openX: side * 13.8, open: false };
    visitorGatePanels.push(panel);
    visitorGate.add(post, panel);
  }
  station.add(visitorGate);
  const serviceGate = new THREE.Group();
  serviceGate.name = "fire-station-service-gate";
  serviceGate.position.set(76, 0, 7);
  serviceGate.userData = { clearWidth: 8, controlledAccess: true };
  for (const side of [-1, 1]) {
    const post = fireMesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), deepRed, "fire-station-service-gate-post", "living");
    post.position.set(0, 2.2, side * 4.25);
    serviceGate.add(post);
  }
  const serviceGatePanel = fireMesh(new THREE.BoxGeometry(0.18, 2.3, 7.9), dark, "fire-station-service-gate-panel", "living");
  serviceGatePanel.position.y = 1.75;
  serviceGatePanel.userData = { closedZ: 0, openZ: 8.4, open: false };
  serviceGatePanels.push(serviceGatePanel);
  serviceGate.add(serviceGatePanel);
  station.add(serviceGate);

  // Reused city furniture and tree anchors.
  const lightPositions: Array<[number, number]> = [[-70, 43], [-51, 43], [-32, 43], [-13, 43], [6, 43], [29, 43], [53, 43], [70, 39], [-71, -8], [-70, -42], [-35, -31], [5, -50], [26, -16], [54, -16]];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.58, z);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    station.add(light);
  });
  const planterPositions: Array<[number, number]> = [[27, 24], [39, 24], [51, 24], [63, 24], [-62, -30], [-46, -30], [-30, -30], [6, -20]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.62, z);
    planter.scale.setScalar(1.08);
    planter.userData.sourceCollection = "city-street-furniture";
    station.add(planter);
  });
  const treePositions: Array<[number, number]> = [[-69, -49], [-52, -49], [-32, -49], [-12, -49], [8, -49], [-69, -34], [-56, -31], [-35, -33], [-18, -32], [71, -48], [71, -36], [71, -20], [69, 20], [61, 29], [32, 29], [22, -11]];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "fire-station-reused-tree-anchor";
    anchor.position.set(x, 0.55, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    station.add(anchor);
  });

  const performanceDynamicRoots = [
    ...cutawayShell,
    ...apparatusDoors,
    ...fireEngines,
    ...responseGatePanels,
    ...visitorGatePanels,
    ...serviceGatePanels,
  ];
  applyReviewedCityMapLodTags(station, "fire-station");
  const shadowMetrics = applySceneShadowPolicy(station, { dynamicRoots: performanceDynamicRoots });
  const staticRenderBatch = createOptimizedStaticSceneBatch({
    name: "fire-station-static-render-batch",
    parent: station,
    excludedRoots: performanceDynamicRoots,
    mutableMaterials: markCityMutableMaterials([glass, warmLight, fireRed, water, alertMaterial, ...alertBeaconMaterials]),
    cellSizeMeters: 68,
    enabled: options.optimizeStatic !== false,
  });
  const pooledNightLights = createScenePointLightPool({
    name: "fire-station-night-light-pool",
    root: station,
    excludedLights: alertLights,
    cellSizeMeters: 60,
    maximumDistance: 42,
  });

  station.userData = {
    mapLayer: "exterior",
    modelType: "fire-station-campus",
    generatedLocally: true,
    zones: ["response", "command", "living", "training"],
    buildingCount: 5,
    apparatusBayCount: bayCenters.length,
    fireEngineCount: vehicleKinds.length,
    commandDeskCount,
    dormBedCount,
    trainingTowerFloors: 8,
    trainingFacilityCount: 4,
    equipmentRackCount,
    hydrantCount: hydrantPositions.length,
    fenceSegmentCount,
    treeAnchorCount: treePositions.length,
    streetLightCount: lightPositions.length,
    planterCount: planterPositions.length,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
    ],
    // The west hydrant/fence assembly reaches x=-79.3; keep the centered site envelope honest.
    siteSize: new THREE.Vector3(159, 31, 110),
    renderBatchCount: staticRenderBatch.userData.batchCount,
    mergedSourceMeshCount: staticRenderBatch.userData.mergedSourceMeshCount,
    pooledNightLightCount: pooledNightLights.pooledLightCount,
    shadowCastersRemoved: shadowMetrics.shadowCastersRemoved,
    setPowered: (powered) => {
      glass.emissiveIntensity = powered ? 1.25 : 0.1;
      warmLight.emissiveIntensity = powered ? 2.2 : 0.15;
      fireRed.emissiveIntensity = powered ? 0.35 : 0.08;
      water.emissiveIntensity = powered ? 0.52 : 0.12;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      pooledNightLights.setPowered(powered);
    },
    setInteriorCutaway: (cutaway) => { cutawayShell.forEach((object) => { object.visible = !cutaway; }); },
    setApparatusDoorsOpen: (open) => {
      apparatusDoors.forEach((door) => {
        door.position.y = open ? door.userData.openY as number : door.userData.closedY as number;
        door.userData.open = open;
      });
    },
    setResponseGatesOpen: (open) => {
      responseGatePanels.forEach((panel) => {
        panel.position.y = open ? panel.userData.openY as number : panel.userData.closedY as number;
        panel.userData.open = open;
      });
    },
    setVisitorGateOpen: (open) => {
      visitorGatePanels.forEach((panel) => {
        panel.position.x = open ? panel.userData.openX as number : panel.userData.closedX as number;
        panel.userData.open = open;
      });
    },
    setServiceGateOpen: (open) => {
      serviceGatePanels.forEach((panel) => {
        panel.position.z = open ? panel.userData.openZ as number : panel.userData.closedZ as number;
        panel.userData.open = open;
      });
    },
    setAlertActive: (active) => {
      alertActive = active;
      station.userData.setApparatusDoorsOpen(active);
      if (active) station.userData.setResponseGatesOpen(true);
      fireEngines.forEach((engine) => {
        engine.position.z = active ? engine.userData.responsePositionZ as number : engine.userData.readyPositionZ as number;
        engine.userData.responding = active;
      });
      if (!active) {
        alertMaterial.emissiveIntensity = 0.1;
        alertBeaconMaterials.forEach((material) => { material.emissiveIntensity = 0.1; });
        alertLights.forEach((light) => { light.intensity = 0; });
      }
    },
    update: (elapsedSeconds) => {
      if (!alertActive) return;
      const phase = Math.floor(elapsedSeconds * 5) % 2;
      alertMaterial.emissiveIntensity = phase ? 3.5 : 0.2;
      alertBeaconMaterials.forEach((material, index) => { material.emissiveIntensity = (index + phase) % 2 ? 3.5 : 0.2; });
      alertLights.forEach((light, index) => { light.intensity = (index + phase) % 2 ? 6 : 0.4; });
    },
  };
  station.userData.setPowered(false);
  station.userData.setInteriorCutaway(false);
  station.userData.setApparatusDoorsOpen(false);
  station.userData.setResponseGatesOpen(true);
  station.userData.setVisitorGateOpen(false);
  station.userData.setServiceGateOpen(false);
  station.userData.setAlertActive(false);
  return station;
}
