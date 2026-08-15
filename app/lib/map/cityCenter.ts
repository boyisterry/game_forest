import * as THREE from "three";
import {
  buildLowPolyFoodTruck,
  buildLowPolyRoadsidePlanter,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "./cityFurniture.ts";

export type CityCenterZone = "landmark" | "transit" | "bus" | "taxi" | "map" | "plaza";

export type CityCenterModel = THREE.Group & {
  userData: {
    modelType: "city-center";
    generatedLocally: true;
    zones: CityCenterZone[];
    buildingCount: number;
    landmarkTowerCount: number;
    transitPlatformCount: number;
    railTrackCount: number;
    busBayCount: number;
    busCount: number;
    taxiStandCount: number;
    taxiCount: number;
    mapEntranceCount: number;
    mapBoardCount: number;
    independentFacilityCount: number;
    fountainCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    foodTruckCount: number;
    trafficLightCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setRushHour: (active: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    update: (elapsedSeconds: number) => void;
  };
};

function cityMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: CityCenterZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

export function buildLowPolyCityCenter(): CityCenterModel {
  const center = new THREE.Group() as CityCenterModel;
  center.name = "metropolitan-city-center-lowpoly";
  const cutawayShells: THREE.Object3D[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];
  const rushHourVehicles: THREE.Object3D[] = [];
  let rushHour = false;
  let isPowered = false;

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc7c3b9, roughness: 0.94 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xe1d7c6, roughness: 0.9 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xeee9dc, roughness: 0.82 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.76 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x78878c, roughness: 0.42, metalness: 0.64 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263a42, roughness: 0.56, metalness: 0.35 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x485052, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x78986a, roughness: 0.98 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3c7890, roughness: 0.7 });
  const coral = new THREE.MeshStandardMaterial({ color: 0xc95f45, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b348, roughness: 0.72 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9a704a, roughness: 0.84 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4b9eb2, emissive: 0x164b58, emissiveIntensity: 0.12, roughness: 0.18, transparent: true, opacity: 0.82 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x62a2b4, emissive: 0x1d4d5b, emissiveIntensity: 0.08, roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide });
  const warmGlass = new THREE.MeshStandardMaterial({ color: 0xf2c77c, emissive: 0xffa42f, emissiveIntensity: 0.08, roughness: 0.22, transparent: true, opacity: 0.68, depthWrite: false });
  const mapScreen = new THREE.MeshStandardMaterial({ color: 0x244d5a, emissive: 0x55d6df, emissiveIntensity: 0.35, roughness: 0.2 });
  const destinationBoard = new THREE.MeshStandardMaterial({ color: 0x263d49, emissive: 0x64cddc, emissiveIntensity: 0.3, roughness: 0.25 });

  const site = cityMesh(new THREE.BoxGeometry(210, 0.4, 165), concrete, "city-center-site-base");
  site.position.y = 0.2;
  const landscapedBase = cityMesh(new THREE.BoxGeometry(202, 0.12, 157), grass, "city-center-landscape-base");
  landscapedBase.position.y = 0.45;
  center.add(site, landscapedBase);

  // A perimeter boulevard and an internal cross street keep motor traffic out of the civic square.
  const southRoad = cityMesh(new THREE.BoxGeometry(204, 0.15, 12), asphalt, "city-center-south-boulevard", "plaza");
  southRoad.position.set(0, 0.56, 74);
  const eastRoad = cityMesh(new THREE.BoxGeometry(11, 0.15, 145), asphalt, "city-center-east-transit-road", "plaza");
  eastRoad.position.set(96, 0.56, -1);
  const connectorRoad = cityMesh(new THREE.BoxGeometry(192, 0.14, 9), asphalt, "city-center-modal-connector-road", "plaza");
  connectorRoad.position.set(0, 0.58, 36);
  center.add(southRoad, eastRoad, connectorRoad);
  for (let x = -94; x <= 94; x += 16) {
    const roadMark = cityMesh(new THREE.BoxGeometry(7, 0.025, 0.13), white, "city-center-road-marking", "plaza");
    roadMark.position.set(x, 0.66, 74);
    center.add(roadMark);
  }

  // Civic core: a landmark tower, two mixed-use wings, a public square and a sunken retail court.
  const civicPlaza = new THREE.Group();
  civicPlaza.name = "city-center-civic-plaza";
  civicPlaza.userData = { zone: "plaza", hasSunkenCourtOpening: true };
  for (const [x, z, width, depth] of [[-16.5, -1, 47, 63], [37.5, -1, 9, 63], [20, -12.25, 26, 40.5], [20, 28.25, 26, 4.5]] as Array<[number, number, number, number]>) {
    const slab = cityMesh(new THREE.BoxGeometry(width, 0.18, depth), paving, "city-center-civic-plaza-slab", "plaza");
    slab.position.set(x, 0.64, z);
    civicPlaza.add(slab);
  }
  center.add(civicPlaza);
  const plazaAxis = cityMesh(new THREE.BoxGeometry(13, 0.05, 118), white, "city-center-pedestrian-axis", "plaza");
  plazaAxis.position.set(0, 0.76, 10);
  center.add(plazaAxis);

  const addTower = (name: string, x: number, z: number, width: number, depth: number, height: number, accent: THREE.Material) => {
    const tower = new THREE.Group();
    tower.name = name;
    tower.position.set(x, 0, z);
    const frontDirection = Math.abs(x) > Math.abs(z) ? (x > 0 ? "-x" : "+x") : (z < 0 ? "+z" : "-z");
    tower.userData = { zone: "landmark", frontDirection, facesCivicPlaza: true };
    const podium = cityMesh(new THREE.BoxGeometry(width + 8, 5.5, depth + 7), pale, "city-center-tower-podium", "landmark");
    podium.position.y = 3.35;
    const shell = cityMesh(new THREE.BoxGeometry(width, height, depth), glass, "city-center-tower-glass-shell", "landmark");
    shell.position.y = 6.1 + height * 0.5;
    const crown = cityMesh(new THREE.BoxGeometry(width + 0.8, 1.1, depth + 0.8), accent, "city-center-tower-crown", "landmark");
    crown.position.y = 6.1 + height + 0.55;
    tower.add(podium, shell, crown);
    cutawayShells.push(shell);
    for (let floor = 1; floor < Math.floor(height / 3.6); floor += 1) {
      const slab = cityMesh(new THREE.BoxGeometry(width - 0.7, 0.16, depth - 0.7), concrete, "city-center-tower-floor-slab", "landmark");
      slab.position.y = 6.1 + floor * 3.6;
      tower.add(slab);
    }
    for (let mullion = -2; mullion <= 2; mullion += 1) {
      const frontMullion = cityMesh(new THREE.BoxGeometry(0.18, height, 0.2), steel, "city-center-tower-facade-mullion", "landmark");
      if (frontDirection === "+z" || frontDirection === "-z") {
        frontMullion.position.set(mullion * width * 0.17, 6.1 + height * 0.5, (frontDirection === "+z" ? 1 : -1) * (depth * 0.5 + 0.11));
      } else {
        frontMullion.position.set((frontDirection === "+x" ? 1 : -1) * (width * 0.5 + 0.11), 6.1 + height * 0.5, mullion * depth * 0.17);
      }
      tower.add(frontMullion);
    }
    center.add(tower);
    return tower;
  };
  const landmark = addTower("city-center-landmark-tower", 5, -25, 28, 25, 58, coral);
  landmark.userData.floorCount = 16;
  landmark.userData.heightMeters = 64;
  addTower("city-center-mixed-use-east-tower", 48, -11, 22, 20, 34, blue);
  addTower("city-center-mixed-use-west-tower", -42, 8, 21, 19, 30, yellow);

  const fountainBasin = cityMesh(new THREE.CylinderGeometry(9, 9.5, 0.55, 32), concrete, "city-center-plaza-fountain-basin", "plaza");
  fountainBasin.position.set(4, 0.87, 18);
  const fountainWater = cityMesh(new THREE.CylinderGeometry(8.5, 8.5, 0.22, 32), water, "city-center-plaza-fountain-water", "plaza");
  fountainWater.position.set(4, 1.17, 18);
  center.add(fountainBasin, fountainWater);
  for (let jet = 0; jet < 8; jet += 1) {
    const angle = jet / 8 * Math.PI * 2;
    const waterJet = cityMesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 8), water, "city-center-fountain-water-jet", "plaza");
    waterJet.position.set(4 + Math.cos(angle) * 4.8, 3, 18 + Math.sin(angle) * 4.8);
    waterJet.userData.baseY = 3;
    waterJet.userData.phase = jet * 0.55;
    center.add(waterJet);
  }
  const sunkenCourt = cityMesh(new THREE.BoxGeometry(24, 0.12, 16), timber, "city-center-sunken-retail-court", "plaza");
  sunkenCourt.position.set(20, 0.51, 17);
  sunkenCourt.userData = { sunken: true, depthMeters: 0.18, barrierFreeRamp: true };
  center.add(sunkenCourt);
  for (const [x, z, width, depth] of [[7.5, 17, 0.35, 18], [32.5, 17, 0.35, 18], [20, 8.5, 25, 0.35], [20, 25.5, 25, 0.35]] as Array<[number, number, number, number]>) {
    const wall = cityMesh(new THREE.BoxGeometry(width, 0.7, depth), concrete, "city-center-sunken-retail-retaining-wall", "plaza");
    wall.position.set(x, 0.78, z);
    center.add(wall);
  }
  for (let step = 0; step < 5; step += 1) {
    const stair = cityMesh(new THREE.BoxGeometry(0.9, 0.12, 4.6), paving, "city-center-sunken-retail-access-stair", "plaza");
    stair.position.set(7.5 + step * 0.8, 0.72 - step * 0.04, 14);
    center.add(stair);
  }
  const sunkenRamp = cityMesh(new THREE.BoxGeometry(5, 0.12, 2.2), paving, "city-center-sunken-retail-access-ramp", "plaza");
  sunkenRamp.position.set(10, 0.63, 21);
  sunkenRamp.rotation.z = -0.035;
  sunkenRamp.userData = { barrierFree: true, maximumGradient: "1:12" };
  center.add(sunkenRamp);
  for (let shop = 0; shop < 5; shop += 1) {
    const shopfront = cityMesh(new THREE.BoxGeometry(4.2, 2.8, 0.18), warmGlass, "city-center-plaza-shopfront", "plaza");
    shopfront.position.set(11 + shop * 4.5, 2.1, 8.32);
    center.add(shopfront);
    cutawayShells.push(shopfront);
  }

  // Independent integrated transport hub: its own hall, entrances, concourse, platforms and rail tracks.
  const transitHub = new THREE.Group();
  transitHub.name = "city-center-independent-transport-hub";
  transitHub.position.set(-64, 0, -39);
  transitHub.userData = { zone: "transit", facilityType: "transport-hub", independentFacility: true, entranceCount: 2, interchangeModes: ["rail", "metro", "walking"] };
  const hubApron = cityMesh(new THREE.BoxGeometry(69, 0.2, 59), concrete, "city-center-transport-hub-apron", "transit");
  hubApron.position.y = 0.68;
  const hubHall = cityMesh(new THREE.BoxGeometry(55, 13, 20), pale, "city-center-transport-hub-hall-shell", "transit");
  hubHall.position.set(0, 7.3, 14);
  const hubGlass = cityMesh(new THREE.BoxGeometry(44, 8, 0.24), glass, "city-center-transport-hub-glass-facade", "transit");
  hubGlass.position.set(0, 7, 24.08);
  const hubRoof = cityMesh(new THREE.BoxGeometry(61, 1.1, 25), steel, "city-center-transport-hub-roof", "transit");
  hubRoof.position.set(0, 14.25, 13);
  transitHub.add(hubApron, hubHall, hubGlass, hubRoof);
  cutawayShells.push(hubHall, hubGlass, hubRoof);
  for (const x of [-12, 12]) {
    const entrance = new THREE.Group();
    entrance.name = "city-center-transport-hub-entrance";
    entrance.position.set(x, 0, 24.3);
    entrance.userData = { clearWidth: 7, accessible: true, physicalPortal: true };
    for (const side of [-1, 1]) {
      const pier = cityMesh(new THREE.BoxGeometry(0.45, 5.4, 0.7), steel, "city-center-transport-hub-entrance-pier", "transit");
      pier.position.set(side * 3.75, 3.35, 0);
      entrance.add(pier);
    }
    const canopy = cityMesh(new THREE.BoxGeometry(8.4, 0.42, 2.4), blue, "city-center-transport-hub-entrance-canopy", "transit");
    canopy.position.set(0, 6.15, 0.75);
    const doorHeader = cityMesh(new THREE.BoxGeometry(7.9, 0.38, 0.62), steel, "city-center-transport-hub-entrance-header", "transit");
    doorHeader.position.set(0, 5.85, 0);
    entrance.add(canopy, doorHeader);
    transitHub.add(entrance);
  }
  const departureBoard = cityMesh(new THREE.BoxGeometry(14, 4.5, 0.35), destinationBoard, "city-center-hub-departure-board", "transit");
  departureBoard.position.set(0, 7.2, 23.85);
  transitHub.add(departureBoard);
  for (let track = 0; track < 4; track += 1) {
    const railZ = -18 + track * 6.3;
    for (const side of [-1, 1]) {
      const rail = cityMesh(new THREE.BoxGeometry(63, 0.18, 0.12), steel, "city-center-hub-rail", "transit");
      rail.position.set(0, 0.98, railZ + side * 0.7);
      transitHub.add(rail);
    }
    const sleeperCount = 16;
    for (let sleeper = 0; sleeper < sleeperCount; sleeper += 1) {
      const railSleeper = cityMesh(new THREE.BoxGeometry(0.25, 0.12, 2.2), timber, "city-center-hub-rail-sleeper", "transit");
      railSleeper.position.set(-29 + sleeper * 3.85, 0.85, railZ);
      transitHub.add(railSleeper);
    }
  }
  for (let platform = 0; platform < 4; platform += 1) {
    const platformZ = -21.2 + platform * 6.3;
    const platformDeck = cityMesh(new THREE.BoxGeometry(62, 0.42, 2.25), paving, "city-center-hub-platform", "transit");
    platformDeck.position.set(0, 1.15, platformZ);
    const platformCanopy = cityMesh(new THREE.BoxGeometry(57, 0.35, 2.7), blue, "city-center-hub-platform-canopy", "transit");
    platformCanopy.position.set(0, 5.2, platformZ);
    transitHub.add(platformDeck, platformCanopy);
    for (const x of [-24, -12, 0, 12, 24]) {
      const column = cityMesh(new THREE.CylinderGeometry(0.12, 0.16, 4, 8), steel, "city-center-hub-canopy-column", "transit");
      column.position.set(x, 3.1, platformZ);
      transitHub.add(column);
    }
  }
  for (const x of [-18, 18]) {
    const stair = new THREE.Group();
    stair.name = "city-center-hub-platform-stair";
    stair.userData = { connectsHallToPlatforms: true, clearWidthMeters: 3.2 };
    for (let step = 0; step < 9; step += 1) {
      const tread = cityMesh(new THREE.BoxGeometry(3.2, 0.28, 1.05), concrete, "city-center-hub-platform-stair-tread", "transit");
      tread.position.set(x, 1.25 + step * 0.38, 2.8 - step * 0.72);
      stair.add(tread);
    }
    transitHub.add(stair);
  }
  const hubElevator = new THREE.Group();
  hubElevator.name = "city-center-hub-platform-elevator";
  hubElevator.position.set(0, 0, 0.5);
  hubElevator.userData = { stepFree: true, connectsHallToPlatforms: true, carCapacity: 13 };
  const elevatorShaft = cityMesh(new THREE.BoxGeometry(3.3, 7, 3.3), glass, "city-center-hub-elevator-shaft", "transit");
  elevatorShaft.position.y = 4.3;
  const elevatorDoor = cityMesh(new THREE.BoxGeometry(2.2, 3, 0.18), steel, "city-center-hub-elevator-door", "transit");
  elevatorDoor.position.set(0, 2.3, 1.74);
  hubElevator.add(elevatorShaft, elevatorDoor);
  transitHub.add(hubElevator);
  for (const x of [-9, 9]) {
    const escalator = new THREE.Group();
    escalator.name = "city-center-hub-platform-escalator";
    escalator.position.set(x, 0, 0.2);
    escalator.userData = { connectsHallToPlatforms: true, direction: x < 0 ? "up" : "down" };
    const belt = cityMesh(new THREE.BoxGeometry(2.1, 0.35, 8.2), dark, "city-center-hub-escalator-belt", "transit");
    belt.position.set(0, 2.8, 0);
    belt.rotation.x = -0.42;
    escalator.add(belt);
    for (const side of [-1, 1]) {
      const balustrade = cityMesh(new THREE.BoxGeometry(0.12, 1, 8.4), glass, "city-center-hub-escalator-balustrade", "transit");
      balustrade.position.set(side * 1.05, 3.25, 0);
      balustrade.rotation.x = -0.42;
      escalator.add(balustrade);
    }
    transitHub.add(escalator);
  }
  center.add(transitHub);

  const buildBus = (name: string, color: THREE.Material) => {
    const bus = new THREE.Group();
    bus.name = name;
    const body = cityMesh(new THREE.BoxGeometry(3, 2.8, 10.5), color, "city-center-bus-body", "bus");
    body.position.y = 2.15;
    const windowBand = cityMesh(new THREE.BoxGeometry(3.05, 1.1, 8.2), glass, "city-center-bus-window-band", "bus");
    windowBand.position.set(0, 2.75, -0.2);
    bus.add(body, windowBand);
    for (const z of [-3.4, 3.4]) {
      for (const x of [-1.45, 1.45]) {
        const wheel = cityMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 12), dark, "city-center-bus-wheel", "bus");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(x, 1.1, z);
        bus.add(wheel);
      }
    }
    return bus;
  };

  // Independent bus terminal: eight saw-tooth bays, sheltered passenger island and its own entry/exit.
  const busStation = new THREE.Group();
  busStation.name = "city-center-independent-bus-station";
  busStation.position.set(59, 0, -47);
  busStation.userData = { zone: "bus", facilityType: "public-bus-station", independentFacility: true, entranceCount: 2, bayCount: 8 };
  const busApron = cityMesh(new THREE.BoxGeometry(68, 0.18, 52), asphalt, "city-center-bus-station-apron", "bus");
  busApron.position.y = 0.67;
  const busConcourse = cityMesh(new THREE.BoxGeometry(58, 0.22, 11), paving, "city-center-bus-passenger-concourse", "bus");
  busConcourse.position.set(0, 0.86, -16);
  const busCanopy = cityMesh(new THREE.BoxGeometry(60, 0.55, 13), blue, "city-center-bus-station-canopy", "bus");
  busCanopy.position.set(0, 6.2, -16);
  busStation.add(busApron, busConcourse, busCanopy);
  for (const x of [-25, -15, -5, 5, 15, 25]) {
    const column = cityMesh(new THREE.CylinderGeometry(0.14, 0.18, 5.1, 8), steel, "city-center-bus-canopy-column", "bus");
    column.position.set(x, 3.55, -16);
    busStation.add(column);
  }
  for (let bay = 0; bay < 8; bay += 1) {
    const x = -26.5 + bay * 7.55;
    const bayLine = cityMesh(new THREE.BoxGeometry(0.12, 0.035, 21), yellow, "city-center-bus-bay-line", "bus");
    bayLine.position.set(x, 0.79, 5);
    const stopSign = cityMesh(new THREE.BoxGeometry(2.4, 2.1, 0.2), destinationBoard, "city-center-bus-bay-sign", "bus");
    stopSign.position.set(x + 2.8, 2.25, -10.4);
    busStation.add(bayLine, stopSign);
    if (bay < 6) {
      const bus = buildBus("city-center-public-bus", bay % 2 ? coral : blue);
      bus.position.set(x + 3.2, 0, 5);
      bus.userData = { route: `C${bay + 1}`, bay: bay + 1, vehicleMode: "bus" };
      rushHourVehicles.push(bus);
      busStation.add(bus);
    }
  }
  for (const z of [-22, 22]) {
    const gate = new THREE.Group();
    gate.name = "city-center-bus-station-gate";
    gate.position.set(33.6, 0, z);
    gate.userData = { direction: z < 0 ? "entry" : "exit", separateFromTaxi: true, clearWidth: 6, physicalPortal: true };
    for (const side of [-1, 1]) {
      const post = cityMesh(new THREE.BoxGeometry(0.5, 4.8, 0.5), steel, "city-center-bus-station-gate-post", "bus");
      post.position.set(0, 3.05, side * 3.25);
      gate.add(post);
    }
    const gateSign = cityMesh(new THREE.BoxGeometry(0.55, 0.5, 7), destinationBoard, "city-center-bus-station-gate-sign", "bus");
    gateSign.position.set(0, 5.5, 0);
    gate.add(gateSign);
    busStation.add(gate);
  }
  const safeWalkway = cityMesh(new THREE.BoxGeometry(6, 0.16, 44), paving, "city-center-bus-passenger-safe-walkway", "bus");
  safeWalkway.position.set(30.3, 0.87, 0);
  safeWalkway.userData = { protectedFromBusTraffic: true, connectsBothGatesToConcourse: true, clearWidthMeters: 6 };
  busStation.add(safeWalkway);
  const safeWalkwayRail = cityMesh(new THREE.BoxGeometry(0.12, 1.15, 44), steel, "city-center-bus-passenger-safety-rail", "bus");
  safeWalkwayRail.position.set(27.25, 1.46, 0);
  busStation.add(safeWalkwayRail);
  center.add(busStation);

  const buildTaxi = (index: number) => {
    const taxi = new THREE.Group();
    taxi.name = "city-center-taxi";
    const body = cityMesh(new THREE.BoxGeometry(2.1, 1.15, 4.5), yellow, "city-center-taxi-body", "taxi");
    body.position.y = 1.25;
    const cabin = cityMesh(new THREE.BoxGeometry(1.8, 1.05, 2.35), glass, "city-center-taxi-cabin", "taxi");
    cabin.position.set(0, 2.05, -0.2);
    const roofSign = cityMesh(new THREE.BoxGeometry(1.1, 0.35, 0.45), warmGlass, "city-center-taxi-roof-sign", "taxi");
    roofSign.position.set(0, 2.78, -0.2);
    taxi.add(body, cabin, roofSign);
    for (const z of [-1.4, 1.4]) {
      for (const x of [-1, 1]) {
        const wheel = cityMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10), dark, "city-center-taxi-wheel", "taxi");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(x, 0.82, z);
        taxi.add(wheel);
      }
    }
    taxi.userData = { fleetNumber: index + 1, vehicleMode: "taxi" };
    return taxi;
  };

  // Independent taxi rank: separated from bus movements and provided with a covered passenger queue.
  const taxiRank = new THREE.Group();
  taxiRank.name = "city-center-independent-taxi-rank";
  taxiRank.position.set(72, 0, 31);
  taxiRank.userData = { zone: "taxi", facilityType: "taxi-rank", independentFacility: true, standCount: 12, queueSeparatedFromBus: true };
  const taxiApron = cityMesh(new THREE.BoxGeometry(46, 0.18, 28), asphalt, "city-center-taxi-rank-apron", "taxi");
  taxiApron.position.y = 0.68;
  const taxiIsland = cityMesh(new THREE.BoxGeometry(39, 0.22, 5.8), paving, "city-center-taxi-passenger-island", "taxi");
  taxiIsland.position.set(0, 0.88, -9.6);
  const taxiCanopy = cityMesh(new THREE.BoxGeometry(41, 0.38, 6.8), coral, "city-center-taxi-rank-canopy", "taxi");
  taxiCanopy.position.set(0, 4.5, -9.6);
  taxiRank.add(taxiApron, taxiIsland, taxiCanopy);
  for (let stand = 0; stand < 12; stand += 1) {
    const row = Math.floor(stand / 6);
    const column = stand % 6;
    const x = -17.5 + column * 7;
    const z = -3 + row * 8;
    const marker = cityMesh(new THREE.BoxGeometry(3, 0.04, 5.4), yellow, "city-center-taxi-stand", "taxi");
    marker.position.set(x, 0.79, z);
    marker.scale.x = 0.92;
    taxiRank.add(marker);
    if (stand < 8) {
      const taxi = buildTaxi(stand);
      taxi.position.set(x, 0, z);
      rushHourVehicles.push(taxi);
      taxiRank.add(taxi);
    }
  }
  center.add(taxiRank);

  // Independent city-map entrance: a true gateway with information pavilion and large readable map boards.
  const mapEntrance = new THREE.Group();
  mapEntrance.name = "city-center-independent-map-entrance";
  mapEntrance.position.set(0, 0, 67);
  mapEntrance.userData = { zone: "map", facilityType: "city-map-entrance", independentFacility: true, clearWidth: 16, accessible: true };
  const mapForecourt = cityMesh(new THREE.BoxGeometry(56, 0.18, 19), paving, "city-center-map-entrance-forecourt", "map");
  mapForecourt.position.y = 0.69;
  const leftPier = cityMesh(new THREE.BoxGeometry(5, 13, 4), pale, "city-center-map-entrance-pier", "map");
  leftPier.position.set(-11, 7.25, 0);
  const rightPier = leftPier.clone();
  rightPier.name = "city-center-map-entrance-pier";
  rightPier.position.x = 11;
  const gateway = cityMesh(new THREE.BoxGeometry(27, 3.2, 4.6), blue, "city-center-map-entrance-gateway", "map");
  gateway.position.set(0, 12.15, 0);
  const portalScreen = cityMesh(new THREE.BoxGeometry(15, 2.1, 0.28), mapScreen, "city-center-map-entrance-title-screen", "map");
  portalScreen.position.set(0, 12.15, 2.42);
  mapEntrance.add(mapForecourt, leftPier, rightPier, gateway, portalScreen);
  for (const x of [-21, 21]) {
    const mapBoard = cityMesh(new THREE.BoxGeometry(8.5, 5.5, 0.42), mapScreen, "city-center-map-information-board", "map");
    mapBoard.position.set(x, 3.9, 1.8);
    mapBoard.userData = {
      mapType: x < 0 ? "district-overview" : "transport-network",
      multilingual: true,
      content: x < 0 ? ["landmarks", "public-square", "visitor-services"] : ["rail", "bus", "taxi", "walking"],
    };
    for (let route = 0; route < 4; route += 1) {
      const horizontal = route % 2 === 0;
      const routeLine = cityMesh(
        new THREE.BoxGeometry(horizontal ? 5.8 : 0.24, horizontal ? 0.24 : 3.5, 0.1),
        route % 3 === 0 ? coral : route % 3 === 1 ? yellow : white,
        "city-center-map-route-line",
        "map",
      );
      routeLine.position.set(horizontal ? 0 : -2.2 + route * 1.45, -1.45 + route * 0.95, 0.26);
      mapBoard.add(routeLine);
    }
    const currentLocation = cityMesh(new THREE.CircleGeometry(0.32, 16), coral, "city-center-map-you-are-here", "map");
    currentLocation.position.set(x < 0 ? 1.8 : -1.4, -0.8, 0.32);
    mapBoard.add(currentLocation);
    mapEntrance.add(mapBoard);
  }
  const infoPavilion = cityMesh(new THREE.BoxGeometry(16, 5, 8), glass, "city-center-map-information-pavilion", "map");
  infoPavilion.position.set(31, 3.2, -1);
  const infoRoof = cityMesh(new THREE.BoxGeometry(17, 0.5, 9), coral, "city-center-map-information-roof", "map");
  infoRoof.position.set(31, 5.95, -1);
  mapEntrance.add(infoPavilion, infoRoof);
  cutawayShells.push(infoPavilion);
  center.add(mapEntrance);

  // Existing city-furniture models are reused throughout the public realm.
  const lightPositions: Array<[number, number]> = [
    [-93, 67], [-72, 67], [-48, 67], [-24, 67], [24, 67], [48, 67], [72, 67], [93, 67],
    [-91, 35], [-70, 35], [-43, 35], [-20, 35], [20, 35], [43, 35], [68, 35], [91, 35],
    [-94, 5], [-94, -28], [-94, -62], [94, 10], [94, -20], [94, -50],
    [-22, 23], [25, 24], [45, -30], [-31, -20],
  ];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.58, z);
    light.scale.setScalar(0.94);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    center.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-27, 27], [-12, 27], [17, 27], [32, 27], [-26, -1], [36, -2], [-28, 53], [-12, 53], [12, 53], [28, 53]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.68, z);
    planter.scale.setScalar(1.02);
    planter.userData.sourceCollection = "city-street-furniture";
    center.add(planter);
  });
  for (const x of [-19, -7]) {
    const truck = buildLowPolyFoodTruck();
    truck.position.set(x, 0.68, 42);
    truck.rotation.y = -Math.PI * 0.5;
    truck.scale.setScalar(0.9);
    truck.userData.sourceCollection = "city-street-furniture";
    truck.userData.setServingOpen(true);
    reusedFoodTrucks.push(truck);
    center.add(truck);
  }
  for (const [index, [x, z]] of [[-93, 69], [94, 69], [94, 35], [-93, 35], [93, -72], [-93, -72]].entries()) {
    const signal = buildLowPolyTrafficLight(index % 2 ? -1 : 1);
    signal.position.set(x, 0.66, z);
    signal.userData.sourceCollection = "city-street-furniture";
    signal.userData.setPhase(index < 4 ? "green" : "red");
    center.add(signal);
  }
  const treePositions: Array<[number, number]> = [
    [-99, -75], [-78, -75], [-52, -75], [-25, -75], [2, -75], [30, -75], [60, -75], [86, -75],
    [-99, -52], [-99, -18], [-99, 18], [-99, 52], [99, -63], [99, -34], [99, 54],
    [-83, 50], [-65, 50], [-44, 50], [46, 53], [66, 53], [84, 53],
    [-31, 21], [-15, 20], [23, 20], [39, 20], [-31, -18], [38, -23],
    [-78, 29], [-54, 30], [62, 16], [82, 15], [54, -18],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "city-center-reused-tree-anchor";
    anchor.position.set(x, 0.58, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    center.add(anchor);
  });

  center.userData = {
    modelType: "city-center",
    generatedLocally: true,
    zones: ["landmark", "transit", "bus", "taxi", "map", "plaza"],
    buildingCount: 8,
    landmarkTowerCount: 3,
    transitPlatformCount: 4,
    railTrackCount: 4,
    busBayCount: 8,
    busCount: 6,
    taxiStandCount: 12,
    taxiCount: 8,
    mapEntranceCount: 1,
    mapBoardCount: 2,
    independentFacilityCount: 4,
    fountainCount: 1,
    treeAnchorCount: treePositions.length,
    streetLightCount: lightPositions.length,
    planterCount: planterPositions.length,
    foodTruckCount: reusedFoodTrucks.length,
    trafficLightCount: 6,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-food-truck-lowpoly",
      "city-traffic-light-lowpoly",
    ],
    siteSize: new THREE.Vector3(210, 66, 165),
    setPowered: (powered) => {
      isPowered = powered;
      glass.emissiveIntensity = powered ? 1.1 : 0.08;
      warmGlass.emissiveIntensity = powered ? 2.3 : 0.08;
      mapScreen.emissiveIntensity = rushHour ? 3.8 : powered ? 3.2 : 0.35;
      destinationBoard.emissiveIntensity = rushHour ? 3.4 : powered ? 2.6 : 0.3;
      water.emissiveIntensity = powered ? 0.65 : 0.12;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      reusedFoodTrucks.forEach((truck) => truck.userData.setLights(powered));
    },
    setRushHour: (active) => {
      rushHour = active;
      destinationBoard.emissiveIntensity = active ? 3.4 : isPowered ? 2.6 : 0.3;
      mapScreen.emissiveIntensity = active ? 3.8 : isPowered ? 3.2 : 0.35;
      rushHourVehicles.forEach((vehicle, index) => {
        if (!vehicle.userData.rushHome) vehicle.userData.rushHome = vehicle.position.clone();
        vehicle.userData.rushOffset = index * 0.37;
        if (!active) vehicle.position.copy(vehicle.userData.rushHome);
      });
    },
    setInteriorCutaway: (cutaway) => { cutawayShells.forEach((object) => { object.visible = !cutaway; }); },
    update: (elapsedSeconds) => {
      center.traverse((object) => {
        if (object.name !== "city-center-fountain-water-jet") return;
        object.scale.y = 0.82 + Math.sin(elapsedSeconds * 2.4 + object.userData.phase) * 0.17;
      });
      if (!rushHour) return;
      rushHourVehicles.forEach((vehicle, index) => {
        const home = vehicle.userData.rushHome as THREE.Vector3;
        const travel = Math.sin(elapsedSeconds * 1.35 + vehicle.userData.rushOffset) * (vehicle.userData.vehicleMode === "bus" ? 3.5 : 2.2);
        vehicle.position.y = home.y + Math.sin(elapsedSeconds * 2.1 + index * 0.45) * 0.035;
        if (vehicle.userData.vehicleMode === "bus") vehicle.position.z = home.z + travel;
        else vehicle.position.x = home.x + travel;
      });
      destinationBoard.emissiveIntensity = 3 + Math.sin(elapsedSeconds * 3) * 0.35;
    },
  };
  center.userData.setPowered(false);
  center.userData.setRushHour(false);
  center.userData.setInteriorCutaway(false);
  return center;
}
