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

function placeFacadeObject(
  object: THREE.Object3D,
  frontDirection: "+z" | "-z" | "+x" | "-x",
  width: number,
  depth: number,
  offset = 0,
) {
  if (frontDirection === "+z" || frontDirection === "-z") {
    object.position.z = (frontDirection === "+z" ? 1 : -1) * (depth * 0.5 + offset);
  } else {
    object.position.x = (frontDirection === "+x" ? 1 : -1) * (width * 0.5 + offset);
    object.rotation.y = Math.PI * 0.5;
  }
}

function addSupportedBench(
  parent: THREE.Object3D,
  x: number,
  z: number,
  rotationY: number,
  timber: THREE.Material,
  steel: THREE.Material,
  zone: CityCenterZone,
  name = "city-center-public-bench",
) {
  const bench = new THREE.Group();
  bench.name = name;
  bench.position.set(x, 0, z);
  bench.rotation.y = rotationY;
  bench.userData = { zone, supported: true, seatHeightMeters: 0.48 };
  const seat = cityMesh(new THREE.BoxGeometry(4, 0.22, 0.78), timber, `${name}-seat`, zone);
  seat.position.y = 1.06;
  const back = cityMesh(new THREE.BoxGeometry(4, 1.05, 0.18), timber, `${name}-back`, zone);
  back.position.set(0, 1.55, 0.32);
  back.rotation.x = -0.12;
  bench.add(seat, back);
  for (const supportX of [-1.45, 1.45]) {
    const support = cityMesh(new THREE.BoxGeometry(0.18, 0.95, 0.58), steel, `${name}-support`, zone);
    support.position.set(supportX, 0.58, 0);
    bench.add(support);
  }
  parent.add(bench);
  return bench;
}

export function buildLowPolyCityCenter(): CityCenterModel {
  const center = new THREE.Group() as CityCenterModel;
  center.name = "metropolitan-city-center-lowpoly";
  const cutawayShells: THREE.Object3D[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];
  const rushHourVehicles: THREE.Object3D[] = [];
  const animatedFountainJets: THREE.Object3D[] = [];
  const fountainPointLights: THREE.PointLight[] = [];
  let rushHour = false;
  let isPowered = false;
  let fountainCrystal: THREE.Object3D | null = null;

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
  const tactile = new THREE.MeshStandardMaterial({ color: 0xe8c74e, roughness: 0.78 });
  const fountainGlow = new THREE.MeshStandardMaterial({ color: 0x8ce7ef, emissive: 0x43d5e3, emissiveIntensity: 0.12, roughness: 0.12, transparent: true, opacity: 0.9 });
  const sailBlue = new THREE.MeshStandardMaterial({ color: 0x2d88a0, roughness: 0.34, metalness: 0.32, side: THREE.DoubleSide });
  const sailCoral = new THREE.MeshStandardMaterial({ color: 0xd76d51, roughness: 0.38, metalness: 0.26, side: THREE.DoubleSide });
  const sailGold = new THREE.MeshStandardMaterial({ color: 0xd8ad46, roughness: 0.34, metalness: 0.42, side: THREE.DoubleSide });
  const greenLamp = new THREE.MeshStandardMaterial({ color: 0x4c6e5d, emissive: 0x65d89c, emissiveIntensity: 0.18, roughness: 0.28 });
  const redLamp = new THREE.MeshStandardMaterial({ color: 0x7b423b, emissive: 0xff6657, emissiveIntensity: 0.18, roughness: 0.28 });

  const site = cityMesh(new THREE.BoxGeometry(210, 0.4, 165), concrete, "city-center-site-base");
  site.position.y = 0.2;
  const landscapedBase = new THREE.Group();
  landscapedBase.name = "city-center-landscape-base";
  landscapedBase.userData = { courtOpening: { minX: 7, maxX: 33, minZ: 8, maxZ: 26 } };
  for (const [x, z, width, depth] of [
    [0, -35.25, 202, 86.5],
    [0, 52.25, 202, 52.5],
    [-47, 17, 108, 18],
    [67, 17, 68, 18],
  ] as Array<[number, number, number, number]>) {
    const landscapePiece = cityMesh(new THREE.BoxGeometry(width, 0.12, depth), grass, "city-center-landscape-base-piece");
    landscapePiece.position.set(x, 0.45, z);
    landscapedBase.add(landscapePiece);
  }
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
  for (let x = -88; x <= 88; x += 16) {
    const connectorMark = cityMesh(new THREE.BoxGeometry(7, 0.025, 0.13), white, "city-center-connector-road-marking", "plaza");
    connectorMark.position.set(x, 0.67, 36);
    center.add(connectorMark);
  }
  for (let z = -64; z <= 64; z += 16) {
    const eastMark = cityMesh(new THREE.BoxGeometry(0.13, 0.025, 7), white, "city-center-east-road-marking", "plaza");
    eastMark.position.set(96, 0.67, z);
    center.add(eastMark);
  }
  for (const roadEdgeZ of [67.85, 80.15]) {
    const curb = cityMesh(new THREE.BoxGeometry(204, 0.22, 0.32), pale, "city-center-south-road-curb", "plaza");
    curb.position.set(0, 0.68, roadEdgeZ);
    center.add(curb);
  }
  for (const roadEdgeZ of [31.35, 40.65]) {
    const curb = cityMesh(new THREE.BoxGeometry(192, 0.22, 0.28), pale, "city-center-connector-road-curb", "plaza");
    curb.position.set(0, 0.68, roadEdgeZ);
    center.add(curb);
  }
  for (const roadEdgeX of [90.35, 101.65]) {
    const curb = cityMesh(new THREE.BoxGeometry(0.28, 0.22, 145), pale, "city-center-east-road-curb", "plaza");
    curb.position.set(roadEdgeX, 0.68, -1);
    center.add(curb);
  }
  for (const crossing of [
    { x: 0, z: 74, rotation: 0 },
    { x: 0, z: 36, rotation: 0 },
    { x: 88, z: 36, rotation: Math.PI * 0.5 },
  ]) {
    const crosswalk = new THREE.Group();
    crosswalk.name = "city-center-protected-crosswalk";
    crosswalk.position.set(crossing.x, 0, crossing.z);
    crosswalk.rotation.y = crossing.rotation;
    crosswalk.userData = { stepFree: true, tactileApproach: true };
    for (let stripe = -4; stripe <= 4; stripe += 1) {
      const marking = cityMesh(new THREE.BoxGeometry(0.72, 0.035, 7.6), white, "city-center-crosswalk-stripe", "plaza");
      marking.position.set(stripe * 1.25, 0.69, 0);
      crosswalk.add(marking);
    }
    center.add(crosswalk);
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
  const plazaAxis = cityMesh(new THREE.BoxGeometry(13, 0.05, 75), white, "city-center-pedestrian-axis", "plaza");
  plazaAxis.position.set(0, 0.76, 31.5);
  plazaAxis.userData = { terminatesAtLandmarkLobby: true, clearWidthMeters: 13, stepFree: true };
  center.add(plazaAxis);

  const addTower = (name: string, x: number, z: number, width: number, depth: number, height: number, accent: THREE.Material) => {
    const tower = new THREE.Group();
    tower.name = name;
    tower.position.set(x, 0, z);
    const frontDirection = (Math.abs(x) > Math.abs(z) ? (x > 0 ? "-x" : "+x") : (z < 0 ? "+z" : "-z")) as "+z" | "-z" | "+x" | "-x";
    tower.userData = { zone: "landmark", frontDirection, facesCivicPlaza: true, detailedGroundFloor: true };
    const podiumWidth = width + 8;
    const podiumDepth = depth + 7;
    const podium = cityMesh(new THREE.BoxGeometry(podiumWidth, 5.5, podiumDepth), pale, "city-center-tower-podium", "landmark");
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
      if (floor % 2 === 0) {
        const band = cityMesh(new THREE.BoxGeometry(width + 0.32, 0.18, depth + 0.32), accent, "city-center-tower-facade-band", "landmark");
        band.position.y = slab.position.y + 0.1;
        tower.add(band);
      }
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
    for (const cornerX of [-1, 1]) {
      for (const cornerZ of [-1, 1]) {
        const frame = cityMesh(new THREE.BoxGeometry(0.28, height + 0.8, 0.28), steel, "city-center-tower-corner-frame", "landmark");
        frame.position.set(cornerX * width * 0.5, 6.1 + height * 0.5, cornerZ * depth * 0.5);
        tower.add(frame);
      }
    }
    const entrance = new THREE.Group();
    entrance.name = "city-center-tower-main-entrance";
    entrance.userData = { zone: "landmark", clearWidthMeters: 6.4, stepFree: true, physicalPortal: true };
    if (frontDirection === "+z") entrance.position.set(0, 0, podiumDepth * 0.5 + 0.12);
    if (frontDirection === "-z") { entrance.position.set(0, 0, -podiumDepth * 0.5 - 0.12); entrance.rotation.y = Math.PI; }
    if (frontDirection === "+x") { entrance.position.set(podiumWidth * 0.5 + 0.12, 0, 0); entrance.rotation.y = Math.PI * 0.5; }
    if (frontDirection === "-x") { entrance.position.set(-podiumWidth * 0.5 - 0.12, 0, 0); entrance.rotation.y = -Math.PI * 0.5; }
    for (const doorX of [-1.62, 1.62]) {
      const door = cityMesh(new THREE.BoxGeometry(3.05, 3.75, 0.18), warmGlass, "city-center-tower-entrance-door", "landmark");
      door.position.set(doorX, 2.5, 0);
      entrance.add(door);
    }
    const entranceCanopy = cityMesh(new THREE.BoxGeometry(8.2, 0.38, 2.8), accent, "city-center-tower-entrance-canopy", "landmark");
    entranceCanopy.position.set(0, 4.85, 1.25);
    entrance.add(entranceCanopy);
    for (const supportX of [-3.45, 3.45]) {
      const support = cityMesh(new THREE.CylinderGeometry(0.13, 0.17, 4.15, 8), steel, "city-center-tower-entrance-canopy-column", "landmark");
      support.position.set(supportX, 2.7, 2.15);
      entrance.add(support);
    }
    for (let shop = -2; shop <= 2; shop += 1) {
      if (shop === 0) continue;
      const shopfront = cityMesh(new THREE.BoxGeometry(3.8, 2.9, 0.16), warmGlass, "city-center-podium-shopfront", "landmark");
      shopfront.position.set(shop * 4.15, 2.25, 0.02);
      entrance.add(shopfront);
    }
    tower.add(entrance);
    const serviceCore = cityMesh(new THREE.BoxGeometry(5.6, height + 4.8, 6.2), concrete, "city-center-tower-service-core", "landmark");
    serviceCore.position.set(0, 5.8 + height * 0.5, 0);
    tower.add(serviceCore);
    const lobbyDesk = cityMesh(new THREE.BoxGeometry(5.6, 1.05, 1.1), timber, "city-center-tower-lobby-desk", "landmark");
    lobbyDesk.position.set(0, 1.28, frontDirection === "+z" ? 5 : frontDirection === "-z" ? -5 : 0);
    if (frontDirection === "+x" || frontDirection === "-x") {
      lobbyDesk.position.set(frontDirection === "+x" ? 5 : -5, 1.28, 0);
      lobbyDesk.rotation.y = Math.PI * 0.5;
    }
    tower.add(lobbyDesk);
    for (const doorOffset of [-1.05, 1.05]) {
      const coreDoor = cityMesh(new THREE.BoxGeometry(1.75, 2.45, 0.14), steel, "city-center-tower-elevator-door", "landmark");
      coreDoor.position.y = 2.05;
      placeFacadeObject(coreDoor, frontDirection, 5.6, 6.2, 0.1);
      if (frontDirection === "+z" || frontDirection === "-z") coreDoor.position.x = doorOffset;
      else coreDoor.position.z = doorOffset;
      tower.add(coreDoor);
    }
    for (const seatOffset of [-1, 1]) {
      const lobbySeat = cityMesh(new THREE.BoxGeometry(2.6, 0.58, 0.92), blue, "city-center-tower-lobby-seat", "landmark");
      lobbySeat.position.y = 1.12;
      if (frontDirection === "+z" || frontDirection === "-z") {
        lobbySeat.position.set(seatOffset * 4.2, 1.12, frontDirection === "+z" ? 3 : -3);
      } else {
        lobbySeat.position.set(frontDirection === "+x" ? 3 : -3, 1.12, seatOffset * 4.2);
        lobbySeat.rotation.y = Math.PI * 0.5;
      }
      tower.add(lobbySeat);
    }
    for (const roofX of [-width * 0.2, width * 0.2]) {
      const plant = cityMesh(new THREE.BoxGeometry(width * 0.24, 2.4, depth * 0.28), steel, "city-center-tower-rooftop-plant", "landmark");
      plant.position.set(roofX, 7.3 + height, 0);
      tower.add(plant);
    }
    center.add(tower);
    return tower;
  };
  const landmark = addTower("city-center-landmark-tower", 5, -25, 28, 25, 58, coral);
  landmark.userData.floorCount = 16;
  landmark.userData.heightMeters = 64;
  addTower("city-center-mixed-use-east-tower", 48, -11, 22, 20, 34, blue);
  addTower("city-center-mixed-use-west-tower", -42, 8, 21, 19, 30, yellow);

  // "Cloud sails and tidal ring": an art fountain placed wholly on the west plaza slab.
  const artFountain = new THREE.Group();
  artFountain.name = "city-center-plaza-art-fountain";
  artFountain.position.set(-14, 0, 17);
  artFountain.userData = {
    zone: "plaza",
    artisticForm: "cloud-sail-tidal-ring",
    waterJetCount: 12,
    sailCount: 3,
    nightLightCount: 12,
    outerRadiusMeters: 6.9,
    clearOfPedestrianAxis: true,
    clearOfSunkenCourt: true,
  };
  const fountainBasin = cityMesh(new THREE.CylinderGeometry(6.6, 6.9, 0.35, 32), concrete, "city-center-plaza-fountain-basin", "plaza");
  fountainBasin.position.y = 0.9;
  const fountainWater = cityMesh(new THREE.CylinderGeometry(6.15, 6.15, 0.14, 32), water, "city-center-plaza-fountain-water", "plaza");
  fountainWater.position.y = 1.1;
  const maintenanceRing = cityMesh(new THREE.TorusGeometry(6.38, 0.14, 6, 32), steel, "city-center-fountain-maintenance-ring", "plaza");
  maintenanceRing.position.y = 1.17;
  maintenanceRing.rotation.x = Math.PI * 0.5;
  const centralIsland = cityMesh(new THREE.CylinderGeometry(1.35, 1.55, 0.55, 18), pale, "city-center-fountain-sculpture-island", "plaza");
  centralIsland.position.y = 1.32;
  artFountain.add(fountainBasin, fountainWater, maintenanceRing, centralIsland);
  const sailMaterials = [sailBlue, sailCoral, sailGold];
  const sailHeights = [6.4, 5.35, 4.5];
  for (let sailIndex = 0; sailIndex < 3; sailIndex += 1) {
    const sail = new THREE.Group();
    sail.name = "city-center-fountain-cloud-sail";
    sail.rotation.y = sailIndex * Math.PI * 2 / 3 - 0.35;
    sail.userData = { sculptural: true, heightMeters: sailHeights[sailIndex] };
    const height = sailHeights[sailIndex];
    const sailShape = new THREE.Shape();
    sailShape.moveTo(-0.5, 0);
    sailShape.quadraticCurveTo(1.65, height * 0.42, 0.72, height);
    sailShape.quadraticCurveTo(-0.62, height * 0.68, -0.5, 0);
    const sheet = cityMesh(new THREE.ShapeGeometry(sailShape, 12), sailMaterials[sailIndex], "city-center-fountain-cloud-sail-sheet", "plaza");
    sheet.position.set(0, 1.56, sailIndex * 0.08);
    sheet.castShadow = true;
    sail.add(sheet);
    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.5, 1.56, 0.05),
      new THREE.Vector3(0.55, 1.56 + height * 0.42, 0.05),
      new THREE.Vector3(0.95, 1.56 + height * 0.73, 0.05),
      new THREE.Vector3(0.72, 1.56 + height, 0.05),
    ]);
    const spine = cityMesh(new THREE.TubeGeometry(spineCurve, 18, 0.11, 6, false), steel, "city-center-fountain-cloud-sail-spine", "plaza");
    sail.add(spine);
    artFountain.add(sail);
  }
  for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
    const tidalRing = cityMesh(new THREE.TorusGeometry(2.05 - ringIndex * 0.58, 0.1, 6, 24), fountainGlow, "city-center-fountain-tidal-ring", "plaza");
    tidalRing.position.y = 1.76 + ringIndex * 0.48;
    tidalRing.rotation.x = Math.PI * 0.5;
    artFountain.add(tidalRing);
  }
  fountainCrystal = cityMesh(new THREE.OctahedronGeometry(0.58, 0), sailGold, "city-center-fountain-tidal-crystal", "plaza");
  fountainCrystal.position.set(0, 3.1, 0);
  artFountain.add(fountainCrystal);
  for (let jet = 0; jet < 12; jet += 1) {
    const angle = jet / 12 * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const jetCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      radial.clone().multiplyScalar(-1.85).setY(jet % 2 === 0 ? 2.8 : 2.4),
      radial.clone().multiplyScalar(-3.75).setY(0.28),
    );
    const arcJet = cityMesh(new THREE.TubeGeometry(jetCurve, 14, 0.075, 5, false), fountainGlow, "city-center-fountain-arc-jet", "plaza");
    arcJet.position.copy(radial.multiplyScalar(5.4)).setY(1.22);
    arcJet.userData = { phase: jet * 0.48, baseScaleY: 1 };
    animatedFountainJets.push(arcJet);
    artFountain.add(arcJet);
    const underwaterLight = cityMesh(new THREE.CylinderGeometry(0.22, 0.25, 0.08, 12), fountainGlow, "city-center-fountain-underwater-light", "plaza");
    underwaterLight.position.set(Math.cos(angle) * 4.8, 1.2, Math.sin(angle) * 4.8);
    underwaterLight.userData = { fixtureType: "submersible", phase: jet * 0.48 };
    artFountain.add(underwaterLight);
    if (jet % 3 === 0) {
      const pointLight = new THREE.PointLight(0x6de9f1, 0, 13, 2);
      pointLight.name = "city-center-fountain-point-light";
      pointLight.position.set(Math.cos(angle) * 3.9, 1.65, Math.sin(angle) * 3.9);
      fountainPointLights.push(pointLight);
      artFountain.add(pointLight);
    }
  }
  const crownJet = cityMesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), fountainGlow, "city-center-fountain-crown-jet", "plaza");
  crownJet.position.y = 3.65;
  crownJet.userData = { phase: 0.75, baseScaleY: 1 };
  animatedFountainJets.push(crownJet);
  artFountain.add(crownJet);
  center.add(artFountain);
  addSupportedBench(center, -22.3, 17, Math.PI * 0.5, timber, steel, "plaza", "city-center-fountain-bench");
  addSupportedBench(center, -18.5, 25.1, 0, timber, steel, "plaza", "city-center-fountain-bench");
  addSupportedBench(center, -18.5, 8.9, Math.PI, timber, steel, "plaza", "city-center-fountain-bench");

  // A genuine shallow sunken retail court with two openings instead of ramps piercing a continuous wall.
  const sunkenCourt = cityMesh(new THREE.BoxGeometry(24, 0.06, 16), timber, "city-center-sunken-retail-court", "plaza");
  sunkenCourt.position.set(20, 0.43, 17);
  sunkenCourt.userData = { sunken: true, depthMeters: 0.3, barrierFreeRamp: true, entranceCount: 2 };
  center.add(sunkenCourt);
  const retainingSegments: Array<[number, number, number, number]> = [
    [32.5, 17, 0.35, 18], [20, 8.5, 25, 0.35], [20, 25.5, 25, 0.35],
    [7.5, 9.25, 0.35, 2.5], [7.5, 17.4, 0.35, 4.2], [7.5, 23.95, 0.35, 4.1],
  ];
  retainingSegments.forEach(([x, z, width, depth]) => {
    const wall = cityMesh(new THREE.BoxGeometry(width, 0.62, depth), concrete, "city-center-sunken-retail-retaining-wall", "plaza");
    wall.position.set(x, 0.65, z);
    wall.userData = { protectiveEdge: true };
    center.add(wall);
    const topRail = cityMesh(new THREE.BoxGeometry(width === 0.35 ? 0.12 : width, 0.12, depth === 0.35 ? 0.12 : depth), steel, "city-center-sunken-retail-guardrail", "plaza");
    topRail.position.set(x, 1.35, z);
    center.add(topRail);
  });
  for (let step = 0; step < 2; step += 1) {
    const stair = cityMesh(new THREE.BoxGeometry(0.72, 0.15, 4.8), paving, "city-center-sunken-retail-access-stair", "plaza");
    stair.position.set(7.56 + step * 0.62, 0.65 - step * 0.15, 12.9);
    stair.userData = { stepHeightMeters: 0.15, totalRiseMeters: 0.3, entrance: "west-stair" };
    center.add(stair);
  }
  const sunkenRamp = cityMesh(new THREE.BoxGeometry(3.6, 0.12, 2.4), paving, "city-center-sunken-retail-access-ramp", "plaza");
  sunkenRamp.position.set(6.8, 0.58, 20.7);
  sunkenRamp.rotation.z = -Math.atan(1 / 12);
  sunkenRamp.userData = { barrierFree: true, maximumGradient: "1:12", widthMeters: 2.4, runMeters: 3.6, riseMeters: 0.3, entrance: "west-ramp" };
  center.add(sunkenRamp);
  for (const side of [-1, 1]) {
    const rampRail = cityMesh(new THREE.BoxGeometry(3.7, 0.12, 0.12), steel, "city-center-sunken-retail-ramp-handrail", "plaza");
    rampRail.position.set(6.8, 1.05, 20.7 + side * 1.18);
    rampRail.rotation.z = -Math.atan(1 / 12);
    center.add(rampRail);
  }
  const drain = cityMesh(new THREE.BoxGeometry(23.2, 0.05, 0.22), dark, "city-center-sunken-retail-linear-drain", "plaza");
  drain.position.set(20, 0.49, 24.9);
  center.add(drain);
  for (let shop = 0; shop < 5; shop += 1) {
    const shopGroup = new THREE.Group();
    shopGroup.name = "city-center-plaza-shop";
    shopGroup.position.set(11 + shop * 4.5, 0, 10.25);
    shopGroup.userData = { zone: "plaza", completeRetailUnit: true, unit: shop + 1 };
    const backWall = cityMesh(new THREE.BoxGeometry(4.15, 3.25, 0.22), pale, "city-center-plaza-shop-back-wall", "plaza");
    backWall.position.set(0, 2.02, -1.82);
    const roof = cityMesh(new THREE.BoxGeometry(4.25, 0.22, 3.8), concrete, "city-center-plaza-shop-roof", "plaza");
    roof.position.set(0, 3.58, 0);
    const shopfront = cityMesh(new THREE.BoxGeometry(4.1, 2.75, 0.16), warmGlass, "city-center-plaza-shopfront", "plaza");
    shopfront.position.set(0, 1.78, 1.82);
    const shopDoor = cityMesh(new THREE.BoxGeometry(1.15, 2.35, 0.18), glass, "city-center-plaza-shop-door", "plaza");
    shopDoor.position.set(1.25, 1.55, 1.93);
    const sign = cityMesh(new THREE.BoxGeometry(3.45, 0.58, 0.18), shop % 2 ? coral : blue, "city-center-plaza-shop-sign", "plaza");
    sign.position.set(0, 3.2, 1.98);
    const awning = cityMesh(new THREE.BoxGeometry(4.2, 0.2, 1.05), shop % 2 ? yellow : coral, "city-center-plaza-shop-awning", "plaza");
    awning.position.set(0, 2.88, 2.32);
    shopGroup.add(backWall, roof, shopfront, shopDoor, sign, awning);
    for (const side of [-1, 1]) {
      const sideWall = cityMesh(new THREE.BoxGeometry(0.18, 3.25, 3.75), pale, "city-center-plaza-shop-side-wall", "plaza");
      sideWall.position.set(side * 2.02, 2.02, 0);
      shopGroup.add(sideWall);
      const awningPost = cityMesh(new THREE.CylinderGeometry(0.07, 0.09, 2.35, 8), steel, "city-center-plaza-shop-awning-post", "plaza");
      awningPost.position.set(side * 1.92, 1.58, 2.72);
      shopGroup.add(awningPost);
    }
    const counter = cityMesh(new THREE.BoxGeometry(2.4, 0.95, 0.75), timber, "city-center-plaza-shop-counter", "plaza");
    counter.position.set(-0.3, 1.02, 0.65);
    shopGroup.add(counter);
    center.add(shopGroup);
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
  for (let mullion = -5; mullion <= 5; mullion += 1) {
    const facadeMullion = cityMesh(new THREE.BoxGeometry(0.18, 8.2, 0.22), steel, "city-center-hub-facade-mullion", "transit");
    facadeMullion.position.set(mullion * 4, 7, 24.23);
    transitHub.add(facadeMullion);
  }
  for (const skylightX of [-20, -10, 0, 10, 20]) {
    const skylight = cityMesh(new THREE.BoxGeometry(6.5, 0.12, 7.2), glass, "city-center-hub-roof-skylight", "transit");
    skylight.position.set(skylightX, 14.86, 13);
    transitHub.add(skylight);
  }
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
    for (const doorX of [-1.82, 1.82]) {
      const entranceDoor = cityMesh(new THREE.BoxGeometry(3.35, 4.4, 0.15), warmGlass, "city-center-transport-hub-entrance-door", "transit");
      entranceDoor.position.set(doorX, 3, 0.04);
      entrance.add(entranceDoor);
    }
    transitHub.add(entrance);
  }
  const departureBoard = cityMesh(new THREE.BoxGeometry(14, 4.5, 0.35), destinationBoard, "city-center-hub-departure-board", "transit");
  departureBoard.position.set(0, 7.2, 23.85);
  transitHub.add(departureBoard);
  for (let gate = -3; gate <= 3; gate += 1) {
    const fareGate = cityMesh(new THREE.BoxGeometry(0.55, 1.15, 2.25), steel, "city-center-hub-fare-gate", "transit");
    fareGate.position.set(gate * 3.2, 1.42, 7.4);
    const reader = cityMesh(new THREE.BoxGeometry(0.42, 0.16, 0.48), mapScreen, "city-center-hub-fare-gate-reader", "transit");
    reader.position.set(gate * 3.2, 2.08, 6.65);
    transitHub.add(fareGate, reader);
  }
  const serviceCounter = cityMesh(new THREE.BoxGeometry(8.5, 1.25, 1.4), timber, "city-center-hub-service-counter", "transit");
  serviceCounter.position.set(-19, 1.48, 10.3);
  transitHub.add(serviceCounter);
  for (let track = 0; track < 4; track += 1) {
    const railZ = -18 + track * 6.3;
    const ballastBed = cityMesh(new THREE.BoxGeometry(63, 0.2, 3.1), dark, "city-center-hub-ballast-bed", "transit");
    ballastBed.position.set(0, 0.73, railZ);
    transitHub.add(ballastBed);
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
    const platformDeck = cityMesh(new THREE.BoxGeometry(62, 0.42, 3.8), paving, "city-center-hub-platform", "transit");
    platformDeck.position.set(0, 1.15, platformZ);
    transitHub.add(platformDeck);
    for (const side of [-1, 1]) {
      const tactileStrip = cityMesh(new THREE.BoxGeometry(61, 0.055, 0.24), tactile, "city-center-hub-platform-tactile-strip", "transit");
      tactileStrip.position.set(0, 1.4, platformZ + side * 1.62);
      tactileStrip.userData = { distanceFromPlatformEdgeMeters: 0.28, raisedDots: true };
      transitHub.add(tactileStrip);
    }
    for (const canopyX of [-15.5, 15.5]) {
      const platformCanopy = cityMesh(new THREE.BoxGeometry(25.5, 0.35, 4.35), blue, "city-center-hub-platform-canopy", "transit");
      platformCanopy.position.set(canopyX, 5.2, platformZ);
      transitHub.add(platformCanopy);
    }
    for (const x of [-25, -15, -7, 7, 15, 25]) {
      for (const side of [-1, 1]) {
        const column = cityMesh(new THREE.CylinderGeometry(0.12, 0.16, 4, 8), steel, "city-center-hub-canopy-column", "transit");
        column.position.set(x, 3.1, platformZ + side * 1.35);
        transitHub.add(column);
      }
    }
    const platformSeat = addSupportedBench(transitHub, 19, platformZ, Math.PI * 0.5, timber, steel, "transit", "city-center-hub-platform-seat");
    platformSeat.position.y = 0.38;
    const nameSign = cityMesh(new THREE.BoxGeometry(4.4, 0.9, 0.18), destinationBoard, "city-center-hub-platform-name-sign", "transit");
    nameSign.position.set(-18, 3.25, platformZ);
    nameSign.userData = { platformNumber: platform + 1, bilingual: true };
    transitHub.add(nameSign);
    const platformLift = new THREE.Group();
    platformLift.name = "city-center-hub-platform-lift";
    platformLift.position.set(-6.5, 0, platformZ);
    platformLift.userData = { stepFree: true, connectsPlatformToBridge: true, platformNumber: platform + 1 };
    const liftShaft = cityMesh(new THREE.BoxGeometry(2.5, 6.25, 2.15), glass, "city-center-hub-platform-lift-shaft", "transit");
    liftShaft.position.y = 4.25;
    const liftDoor = cityMesh(new THREE.BoxGeometry(1.45, 2.35, 0.16), steel, "city-center-hub-platform-lift-door", "transit");
    liftDoor.position.set(1.33, 2.5, 0);
    liftDoor.rotation.y = Math.PI * 0.5;
    platformLift.add(liftShaft, liftDoor);
    transitHub.add(platformLift);
    const platformAccessStair = new THREE.Group();
    platformAccessStair.name = "city-center-hub-bridge-platform-stair";
    platformAccessStair.userData = { connectsBridgeToPlatform: true, platformNumber: platform + 1, clearWidthMeters: 1.7 };
    for (let step = 0; step < 10; step += 1) {
      const tread = cityMesh(new THREE.BoxGeometry(0.75, 0.26, 1.7), concrete, "city-center-hub-bridge-platform-stair-tread", "transit");
      tread.position.set(0.65 + step * 0.57, 6.72 - step * 0.56, platformZ);
      platformAccessStair.add(tread);
    }
    transitHub.add(platformAccessStair);
  }

  const pedestrianBridge = cityMesh(new THREE.BoxGeometry(5.4, 0.38, 32), paving, "city-center-hub-pedestrian-bridge", "transit");
  pedestrianBridge.position.set(0, 7.05, -9.5);
  pedestrianBridge.userData = { trackClearanceMeters: 5.7, connectsAllPlatforms: true, stepFree: true };
  transitHub.add(pedestrianBridge);
  for (const side of [-1, 1]) {
    const bridgeRail = cityMesh(new THREE.BoxGeometry(0.12, 1.35, 32), steel, "city-center-hub-bridge-guardrail", "transit");
    bridgeRail.position.set(side * 2.65, 7.82, -9.5);
    transitHub.add(bridgeRail);
  }
  const bridgeRoof = cityMesh(new THREE.BoxGeometry(6.8, 0.3, 34), glass, "city-center-hub-bridge-roof", "transit");
  bridgeRoof.position.set(0, 10.15, -9.5);
  transitHub.add(bridgeRoof);
  for (const z of [-23, -15, -7, 1, 5]) {
    for (const side of [-1, 1]) {
      const bridgeColumn = cityMesh(new THREE.BoxGeometry(0.18, 3.05, 0.18), steel, "city-center-hub-bridge-roof-column", "transit");
      bridgeColumn.position.set(side * 2.58, 8.55, z);
      transitHub.add(bridgeColumn);
    }
  }
  for (const x of [-16, 16]) {
    const stair = new THREE.Group();
    stair.name = "city-center-hub-platform-stair";
    stair.userData = { connectsHallToPlatforms: true, connectsHallToBridge: true, clearWidthMeters: 3.2, clearOfRailEnvelope: true };
    for (let step = 0; step < 11; step += 1) {
      const tread = cityMesh(new THREE.BoxGeometry(3.2, 0.3, 0.78), concrete, "city-center-hub-platform-stair-tread", "transit");
      tread.position.set(x, 1.2 + step * 0.55, 11.1 - step * 0.47);
      stair.add(tread);
    }
    transitHub.add(stair);
  }
  const hubElevator = new THREE.Group();
  hubElevator.name = "city-center-hub-platform-elevator";
  hubElevator.position.set(0, 0, 8.5);
  hubElevator.userData = { stepFree: true, connectsHallToPlatforms: true, connectsHallToBridge: true, carCapacity: 13, clearOfRailEnvelope: true };
  const elevatorShaft = cityMesh(new THREE.BoxGeometry(3.3, 8.2, 3.3), glass, "city-center-hub-elevator-shaft", "transit");
  elevatorShaft.position.y = 4.75;
  const elevatorDoor = cityMesh(new THREE.BoxGeometry(2.2, 3, 0.18), steel, "city-center-hub-elevator-door", "transit");
  elevatorDoor.position.set(0, 2.3, 1.74);
  const upperElevatorDoor = elevatorDoor.clone();
  upperElevatorDoor.name = "city-center-hub-elevator-door";
  upperElevatorDoor.position.y = 7.9;
  hubElevator.add(elevatorShaft, elevatorDoor, upperElevatorDoor);
  transitHub.add(hubElevator);
  for (const x of [-7, 7]) {
    const escalator = new THREE.Group();
    escalator.name = "city-center-hub-platform-escalator";
    escalator.position.set(x, 0, 9.8);
    escalator.userData = { connectsHallToPlatforms: true, connectsHallToBridge: true, direction: x < 0 ? "up" : "down", clearOfRailEnvelope: true };
    const belt = cityMesh(new THREE.BoxGeometry(2.1, 0.35, 8.2), dark, "city-center-hub-escalator-belt", "transit");
    belt.position.set(0, 4.1, 0);
    belt.rotation.x = 0.64;
    escalator.add(belt);
    for (let step = -5; step <= 5; step += 1) {
      const escalatorStep = cityMesh(new THREE.BoxGeometry(1.85, 0.18, 0.62), steel, "city-center-hub-escalator-step", "transit");
      escalatorStep.position.set(0, 4.1 + step * 0.46, step * 0.59);
      escalator.add(escalatorStep);
    }
    for (const side of [-1, 1]) {
      const balustrade = cityMesh(new THREE.BoxGeometry(0.12, 1, 8.4), glass, "city-center-hub-escalator-balustrade", "transit");
      balustrade.position.set(side * 1.05, 4.55, 0);
      balustrade.rotation.x = 0.64;
      escalator.add(balustrade);
    }
    transitHub.add(escalator);
  }
  center.add(transitHub);

  const buildBus = (name: string, color: THREE.Material) => {
    const bus = new THREE.Group();
    bus.name = name;
    bus.userData = { detailedVehicle: true, passengerDoorCount: 2 };
    const body = cityMesh(new THREE.BoxGeometry(3, 2.8, 10.5), color, "city-center-bus-body", "bus");
    body.position.y = 2.15;
    const windowBand = cityMesh(new THREE.BoxGeometry(3.05, 1.1, 8.2), glass, "city-center-bus-window-band", "bus");
    windowBand.position.set(0, 2.75, -0.2);
    bus.add(body, windowBand);
    for (const direction of [-1, 1]) {
      const windshield = cityMesh(new THREE.BoxGeometry(2.55, 1.18, 0.13), glass, "city-center-bus-windshield", "bus");
      windshield.position.set(0, 2.75, direction * 5.31);
      bus.add(windshield);
      const bumper = cityMesh(new THREE.BoxGeometry(2.72, 0.3, 0.22), steel, "city-center-bus-bumper", "bus");
      bumper.position.set(0, 0.95, direction * 5.35);
      bus.add(bumper);
      for (const x of [-0.92, 0.92]) {
        const lamp = cityMesh(new THREE.BoxGeometry(0.45, 0.32, 0.12), direction > 0 ? warmGlass : redLamp, direction > 0 ? "city-center-bus-headlight" : "city-center-bus-tail-light", "bus");
        lamp.position.set(x, 1.45, direction * 5.43);
        bus.add(lamp);
      }
    }
    const destination = cityMesh(new THREE.BoxGeometry(2.35, 0.42, 0.12), destinationBoard, "city-center-bus-destination-display", "bus");
    destination.position.set(0, 3.42, 5.4);
    bus.add(destination);
    for (const doorZ of [0.8, 3.1]) {
      const door = cityMesh(new THREE.BoxGeometry(0.12, 2.15, 1.55), warmGlass, "city-center-bus-door", "bus");
      door.position.set(1.56, 2.05, doorZ);
      bus.add(door);
    }
    for (const z of [-3.15, -1.55, 0.05, 1.65, 3.25]) {
      for (const side of [-1, 1]) {
        const mullion = cityMesh(new THREE.BoxGeometry(0.12, 1.18, 0.12), steel, "city-center-bus-window-mullion", "bus");
        mullion.position.set(side * 1.56, 2.75, z);
        bus.add(mullion);
      }
    }
    for (const side of [-1, 1]) {
      const mirror = cityMesh(new THREE.BoxGeometry(0.16, 0.42, 0.55), dark, "city-center-bus-side-mirror", "bus");
      mirror.position.set(side * 1.78, 2.8, 4.55);
      bus.add(mirror);
    }
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
  busStation.position.set(56, 0, -47);
  busStation.userData = { zone: "bus", facilityType: "public-bus-station", independentFacility: true, entranceCount: 2, bayCount: 8 };
  const busApron = cityMesh(new THREE.BoxGeometry(64, 0.18, 52), asphalt, "city-center-bus-station-apron", "bus");
  busApron.position.y = 0.67;
  const busConcourse = cityMesh(new THREE.BoxGeometry(62, 0.22, 11), paving, "city-center-bus-passenger-concourse", "bus");
  busConcourse.position.set(0, 0.86, -16);
  const busCanopy = cityMesh(new THREE.BoxGeometry(60, 0.55, 13), blue, "city-center-bus-station-canopy", "bus");
  busCanopy.position.set(0, 6.2, -16);
  busStation.add(busApron, busConcourse, busCanopy);
  for (const x of [-25, -15, -5, 5, 15, 25]) {
    for (const z of [-20.2, -11.8]) {
      const column = cityMesh(new THREE.CylinderGeometry(0.14, 0.18, 5.1, 8), steel, "city-center-bus-canopy-column", "bus");
      column.position.set(x, 3.55, z);
      busStation.add(column);
    }
    const roofBeam = cityMesh(new THREE.BoxGeometry(0.22, 0.28, 9.2), steel, "city-center-bus-canopy-roof-beam", "bus");
    roofBeam.position.set(x, 5.88, -16);
    busStation.add(roofBeam);
  }
  const waitingTactile = cityMesh(new THREE.BoxGeometry(60, 0.055, 0.3), tactile, "city-center-bus-concourse-tactile-strip", "bus");
  waitingTactile.position.set(0, 1.01, -10.62);
  busStation.add(waitingTactile);
  for (const x of [-22, -13, -4, 5, 14, 23]) {
    const seat = addSupportedBench(busStation, x, -17, 0, timber, steel, "bus", "city-center-bus-waiting-seat");
    seat.scale.setScalar(0.78);
  }
  for (let bay = 0; bay < 8; bay += 1) {
    const x = -26.5 + bay * 7.55;
    const bayLine = cityMesh(new THREE.BoxGeometry(0.12, 0.035, 21), yellow, "city-center-bus-bay-line", "bus");
    bayLine.position.set(x, 0.79, 5);
    bayLine.rotation.y = -0.18;
    bayLine.userData = { sawToothAngleDegrees: 10.3, bay: bay + 1 };
    const wheelStop = cityMesh(new THREE.BoxGeometry(3.2, 0.28, 0.35), concrete, "city-center-bus-bay-wheel-stop", "bus");
    wheelStop.position.set(x + 3.15, 0.91, -4.6);
    wheelStop.rotation.y = -0.18;
    const stopSign = cityMesh(new THREE.BoxGeometry(2.4, 2.1, 0.2), destinationBoard, "city-center-bus-bay-sign", "bus");
    stopSign.position.set(x + 2.8, 2.25, -10.4);
    busStation.add(bayLine, stopSign, wheelStop);
    if (bay < 6) {
      const bus = buildBus("city-center-public-bus", bay % 2 ? coral : blue);
      bus.position.set(x + 3.2, 0, 5);
      bus.rotation.y = -0.18;
      bus.userData = { ...bus.userData, route: `C${bay + 1}`, bay: bay + 1, vehicleMode: "bus" };
      rushHourVehicles.push(bus);
      busStation.add(bus);
    }
  }
  for (const z of [-22, 22]) {
    const gate = new THREE.Group();
    gate.name = "city-center-bus-station-gate";
    gate.position.set(31.2, 0, z);
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
  const safetyRail = new THREE.Group();
  safetyRail.name = "city-center-bus-passenger-safety-rail";
  safetyRail.userData = { segmented: true, concourseOpeningWidthMeters: 5.4 };
  for (const [z, length] of [[-21, 2], [-18.8, 1.6], [-7.2, 12.4], [10.5, 21]] as Array<[number, number]>) {
    const railSegment = cityMesh(new THREE.BoxGeometry(0.12, 1.15, length), steel, "city-center-bus-safety-rail-segment", "bus");
    railSegment.position.set(27.25, 1.46, z);
    railSegment.userData = { protectedWalkway: true, leavesConcourseOpening: true };
    safetyRail.add(railSegment);
  }
  busStation.add(safetyRail);
  const concourseCrossing = cityMesh(new THREE.BoxGeometry(5.2, 0.06, 5.4), white, "city-center-bus-concourse-crossing", "bus");
  concourseCrossing.position.set(28.5, 0.98, -16);
  concourseCrossing.userData = { stepFree: true, clearWidthMeters: 5.2 };
  busStation.add(concourseCrossing);
  for (const z of [-22, 22]) {
    const accessDrive = cityMesh(new THREE.BoxGeometry(6.5, 0.14, 7), asphalt, "city-center-bus-station-access-drive", "bus");
    accessDrive.position.set(34.8, 0.67, z);
    accessDrive.userData = { direction: z < 0 ? "entry" : "exit", connectsEastTransitRoad: true };
    busStation.add(accessDrive);
  }
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
    const hood = cityMesh(new THREE.BoxGeometry(1.95, 0.48, 1.25), yellow, "city-center-taxi-hood", "taxi");
    hood.position.set(0, 1.52, 1.78);
    const trunk = cityMesh(new THREE.BoxGeometry(1.95, 0.48, 1.05), yellow, "city-center-taxi-trunk", "taxi");
    trunk.position.set(0, 1.52, -1.78);
    taxi.add(hood, trunk);
    for (const direction of [-1, 1]) {
      const windshield = cityMesh(new THREE.BoxGeometry(1.68, 0.82, 0.12), glass, "city-center-taxi-windshield", "taxi");
      windshield.position.set(0, 2.18, direction * 1.04);
      windshield.rotation.x = direction * 0.42;
      taxi.add(windshield);
      const bumper = cityMesh(new THREE.BoxGeometry(1.95, 0.22, 0.18), steel, "city-center-taxi-bumper", "taxi");
      bumper.position.set(0, 0.95, direction * 2.31);
      taxi.add(bumper);
      for (const x of [-0.68, 0.68]) {
        const lamp = cityMesh(new THREE.BoxGeometry(0.36, 0.24, 0.11), direction > 0 ? warmGlass : redLamp, direction > 0 ? "city-center-taxi-headlight" : "city-center-taxi-tail-light", "taxi");
        lamp.position.set(x, 1.3, direction * 2.34);
        taxi.add(lamp);
      }
    }
    for (const side of [-1, 1]) {
      for (const doorZ of [-0.65, 0.65]) {
        const doorLine = cityMesh(new THREE.BoxGeometry(0.08, 0.84, 0.06), steel, "city-center-taxi-door-handle", "taxi");
        doorLine.position.set(side * 1.08, 1.72, doorZ);
        taxi.add(doorLine);
      }
      const mirror = cityMesh(new THREE.BoxGeometry(0.2, 0.28, 0.4), dark, "city-center-taxi-side-mirror", "taxi");
      mirror.position.set(side * 1.24, 2.03, 0.88);
      taxi.add(mirror);
    }
    for (const z of [-1.4, 1.4]) {
      for (const x of [-1, 1]) {
        const wheel = cityMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10), dark, "city-center-taxi-wheel", "taxi");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(x, 0.82, z);
        taxi.add(wheel);
      }
    }
    taxi.userData = { fleetNumber: index + 1, vehicleMode: "taxi", detailedVehicle: true };
    return taxi;
  };

  // Independent taxi rank: separated from bus movements and provided with a covered passenger queue.
  const taxiRank = new THREE.Group();
  taxiRank.name = "city-center-independent-taxi-rank";
  taxiRank.position.set(64, 0, 55);
  taxiRank.userData = { zone: "taxi", facilityType: "taxi-rank", independentFacility: true, standCount: 12, queueSeparatedFromBus: true, dedicatedAccessFromConnectorRoad: true };
  const taxiApron = cityMesh(new THREE.BoxGeometry(46, 0.18, 25.5), asphalt, "city-center-taxi-rank-apron", "taxi");
  taxiApron.position.y = 0.68;
  const taxiIsland = cityMesh(new THREE.BoxGeometry(39, 0.22, 5.8), paving, "city-center-taxi-passenger-island", "taxi");
  taxiIsland.position.set(0, 0.88, -8.8);
  const taxiCanopy = cityMesh(new THREE.BoxGeometry(41, 0.38, 6.8), coral, "city-center-taxi-rank-canopy", "taxi");
  taxiCanopy.position.set(0, 4.5, -8.8);
  taxiRank.add(taxiApron, taxiIsland, taxiCanopy);
  for (const x of [-18, -6, 6, 18]) {
    for (const z of [-11.2, -6.4]) {
      const column = cityMesh(new THREE.CylinderGeometry(0.13, 0.18, 3.55, 8), steel, "city-center-taxi-canopy-column", "taxi");
      column.position.set(x, 2.68, z);
      taxiRank.add(column);
    }
    const roofBeam = cityMesh(new THREE.BoxGeometry(0.22, 0.26, 5.4), steel, "city-center-taxi-canopy-roof-beam", "taxi");
    roofBeam.position.set(x, 4.3, -8.8);
    taxiRank.add(roofBeam);
  }
  for (const x of [-14.5, -5, 4.5, 14]) {
    const queueRail = cityMesh(new THREE.BoxGeometry(7.5, 1.05, 0.12), steel, "city-center-taxi-queue-rail", "taxi");
    queueRail.position.set(x, 1.52, -6.2);
    queueRail.userData = { queueSeparatedFromVehicleLane: true, leavesBoardingOpening: true };
    taxiRank.add(queueRail);
  }
  const accessibleStand = cityMesh(new THREE.BoxGeometry(5.2, 0.05, 6.4), blue, "city-center-taxi-accessible-stand", "taxi");
  accessibleStand.position.set(-18, 0.81, -1.8);
  accessibleStand.userData = { stepFree: true, extraTransferWidthMeters: 1.5 };
  taxiRank.add(accessibleStand);
  for (const x of [-13, 0, 13]) {
    const seat = addSupportedBench(taxiRank, x, -9.1, 0, timber, steel, "taxi", "city-center-taxi-waiting-seat");
    seat.scale.setScalar(0.78);
  }
  for (let stand = 0; stand < 12; stand += 1) {
    const row = Math.floor(stand / 6);
    const column = stand % 6;
    const x = -17.5 + column * 7;
    const z = -2.2 + row * 7.7;
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
  for (const x of [-10, 10]) {
    const taxiAccess = cityMesh(new THREE.BoxGeometry(7.4, 0.14, 3.4), asphalt, "city-center-taxi-rank-access-drive", "taxi");
    taxiAccess.position.set(x, 0.68, -13.7);
    taxiAccess.userData = { direction: x < 0 ? "entry" : "exit", connectsConnectorRoad: true };
    taxiRank.add(taxiAccess);
    const stopLine = cityMesh(new THREE.BoxGeometry(6.2, 0.035, 0.24), white, "city-center-taxi-access-stop-line", "taxi");
    stopLine.position.set(x, 0.79, -12.25);
    taxiRank.add(stopLine);
  }
  center.add(taxiRank);

  // Independent city-map entrance: a true gateway with information pavilion and large readable map boards.
  const mapEntrance = new THREE.Group();
  mapEntrance.name = "city-center-independent-map-entrance";
  mapEntrance.position.set(0, 0, 57);
  mapEntrance.userData = { zone: "map", facilityType: "city-map-entrance", independentFacility: true, clearWidth: 16, accessible: true, setBackFromMotorRoad: true };
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
    for (const supportX of [-2.7, 2.7]) {
      const support = cityMesh(new THREE.BoxGeometry(0.34, 3.15, 0.34), steel, "city-center-map-board-support", "map");
      support.position.set(x + supportX, 1.92, 1.8);
      const foot = cityMesh(new THREE.BoxGeometry(0.92, 0.18, 0.78), concrete, "city-center-map-board-support-foot", "map");
      foot.position.set(x + supportX, 0.87, 1.8);
      mapEntrance.add(support, foot);
    }
  }
  const infoPavilion = cityMesh(new THREE.BoxGeometry(16, 5, 8), glass, "city-center-map-information-pavilion", "map");
  infoPavilion.position.set(31, 3.2, -1);
  const infoRoof = cityMesh(new THREE.BoxGeometry(17, 0.5, 9), coral, "city-center-map-information-roof", "map");
  infoRoof.position.set(31, 5.95, -1);
  const pavilionDoor = cityMesh(new THREE.BoxGeometry(3.4, 3.5, 0.16), warmGlass, "city-center-map-pavilion-door", "map");
  pavilionDoor.position.set(27, 2.45, 3.08);
  const pavilionCounter = cityMesh(new THREE.BoxGeometry(7, 1.08, 1.2), timber, "city-center-map-pavilion-counter", "map");
  pavilionCounter.position.set(32.5, 1.42, 0.8);
  const lowCounter = cityMesh(new THREE.BoxGeometry(2.4, 0.78, 1.2), timber, "city-center-map-pavilion-accessible-counter", "map");
  lowCounter.position.set(27.8, 1.27, 0.8);
  lowCounter.userData = { accessibleHeightMeters: 0.78 };
  mapEntrance.add(infoPavilion, infoRoof, pavilionDoor, pavilionCounter, lowCounter);
  for (const [x, z] of [[23.4, -4.4], [38.6, -4.4], [23.4, 2.4], [38.6, 2.4]] as Array<[number, number]>) {
    const pavilionColumn = cityMesh(new THREE.BoxGeometry(0.28, 5.2, 0.28), steel, "city-center-map-pavilion-column", "map");
    pavilionColumn.position.set(x, 3.2, z);
    mapEntrance.add(pavilionColumn);
  }
  const tactileGuide = cityMesh(new THREE.BoxGeometry(1.1, 0.055, 17), tactile, "city-center-map-entrance-tactile-guide", "map");
  tactileGuide.position.set(0, 0.82, 0);
  mapEntrance.add(tactileGuide);
  cutawayShells.push(infoPavilion);
  center.add(mapEntrance);

  // Existing city-furniture models are reused throughout the public realm.
  const lightPositions: Array<[number, number]> = [
    [-88, 66.5], [-72, 66.5], [-56, 66.5], [-40, 66.5], [-24, 66.5], [24, 66.5], [36, 66.5], [88, 66.5],
    [-88, 29], [-70, 29], [-43, 29], [-20, 29], [20, 29], [43, 29], [68, 29], [87, 29],
    [-88, 5], [-101, -28], [-101, -62], [88, 10], [88, -20], [88, -50],
    [-22, 23], [35, 28], [18, -50], [-27, -18],
  ];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.58, z);
    light.scale.setScalar(0.94);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    center.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-27, 27], [-12, 27], [17, 27], [32, 27], [-26, -1], [68, -2], [-28, 45], [-12, 45], [12, 45], [28, 45]];
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
    [-83, 50], [-65, 50], [-44, 50], [46, 27.5], [66, 27.5], [84, 27.5],
    [-31, 21], [-24, 6], [23, 20], [39, 20], [-25, -19], [67, -17],
    [-78, 29], [-54, 30], [62, 16], [82, 15], [77, -16],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "city-center-reused-tree-anchor";
    anchor.position.set(x, 0.58, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    const grate = cityMesh(new THREE.RingGeometry(0.62, 1.32, 12), dark, "city-center-tree-grate", "plaza");
    grate.rotation.x = -Math.PI * 0.5;
    grate.position.y = 0.16;
    anchor.add(grate);
    center.add(anchor);
  });
  for (const [x, z, rotation] of [[-36, 45, 0], [36, 45, Math.PI], [-36, 27, 0], [40, 24, Math.PI]] as Array<[number, number, number]>) {
    addSupportedBench(center, x, z, rotation, timber, steel, "plaza");
  }
  for (const [rackX, rackZ] of [[-36, 52], [35, 52]] as Array<[number, number]>) {
    const bicycleParking = new THREE.Group();
    bicycleParking.name = "city-center-bicycle-parking";
    bicycleParking.position.set(rackX, 0, rackZ);
    bicycleParking.userData = { rackCount: 4, nearMapEntrance: true };
    for (let rack = -1.5; rack <= 1.5; rack += 1) {
      const hoop = cityMesh(new THREE.TorusGeometry(0.62, 0.07, 5, 12, Math.PI), steel, "city-center-bicycle-rack", "plaza");
      hoop.position.set(rack * 0.8, 1.05, 0);
      hoop.rotation.y = Math.PI * 0.5;
      bicycleParking.add(hoop);
      for (const side of [-1, 1]) {
        const foot = cityMesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6), steel, "city-center-bicycle-rack-foot", "plaza");
        foot.position.set(rack * 0.8, 0.7, side * 0.62);
        bicycleParking.add(foot);
      }
    }
    center.add(bicycleParking);
  }
  for (const z of [30.72, 41.28, 66.72]) {
    for (const x of [-8.2, -6.3, 6.3, 8.2]) {
      const bollard = cityMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.86, 8), steel, "city-center-pedestrian-bollard", "plaza");
      bollard.position.set(x, 1.12, z);
      bollard.userData = { protectsCrossing: true, clearCenterGapMeters: 12.6 };
      center.add(bollard);
    }
  }

  center.userData = {
    modelType: "city-center",
    generatedLocally: true,
    zones: ["landmark", "transit", "bus", "taxi", "map", "plaza"],
    buildingCount: 12,
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
      fountainGlow.emissiveIntensity = powered ? 2.4 : 0.12;
      greenLamp.emissiveIntensity = powered ? 2.1 : 0.18;
      redLamp.emissiveIntensity = powered ? 2.1 : 0.18;
      fountainPointLights.forEach((light) => { light.intensity = powered ? 2.2 : 0; });
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
      animatedFountainJets.forEach((jet) => {
        jet.scale.y = 0.96 + Math.sin(elapsedSeconds * 2.15 + jet.userData.phase) * 0.08;
      });
      if (fountainCrystal) fountainCrystal.rotation.y = elapsedSeconds * 0.18;
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
