import * as THREE from "three";
import {
  buildLowPolyFoodTruck,
  buildLowPolyRoadsidePlanter,
  buildLowPolyStreetLight,
} from "./cityFurniture.ts";

export type SportsCenterZone = "stadium" | "arena" | "aquatics" | "outdoor" | "fitness" | "service";

export type SportsCenterModel = THREE.Group & {
  userData: {
    modelType: "sports-center";
    generatedLocally: true;
    zones: SportsCenterZone[];
    buildingCount: number;
    stadiumCapacity: number;
    runningTrackLanes: number;
    footballFieldCount: number;
    arenaCapacity: number;
    arenaCourtCount: number;
    swimmingLaneCount: number;
    basketballCourtCount: number;
    tennisCourtCount: number;
    skateParkCount: number;
    fitnessStationCount: number;
    parkingSpaceCount: number;
    floodlightTowerCount: number;
    entranceCount: number;
    fenceSegmentCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    foodTruckCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setEventMode: (active: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    update: (elapsedSeconds: number) => void;
  };
};

function sportsMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: SportsCenterZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

function stadiumCurve(halfStraight: number, radius: number, y: number) {
  const points: THREE.Vector3[] = [];
  const segments = 28;
  for (let index = 0; index <= segments; index += 1) {
    const angle = -Math.PI * 0.5 + index / segments * Math.PI;
    points.push(new THREE.Vector3(halfStraight + Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI * 0.5 + index / segments * Math.PI;
    points.push(new THREE.Vector3(-halfStraight + Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return new THREE.CatmullRomCurve3(points, true, "centripetal", 0.35);
}

function stadiumShape(halfStraight: number, radius: number, laneWidth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfStraight, -radius - laneWidth);
  shape.lineTo(halfStraight, -radius - laneWidth);
  shape.absarc(halfStraight, 0, radius + laneWidth, -Math.PI * 0.5, Math.PI * 0.5, false);
  shape.lineTo(-halfStraight, radius + laneWidth);
  shape.absarc(-halfStraight, 0, radius + laneWidth, Math.PI * 0.5, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.moveTo(-halfStraight, -radius);
  hole.lineTo(halfStraight, -radius);
  hole.absarc(halfStraight, 0, radius, -Math.PI * 0.5, Math.PI * 0.5, false);
  hole.lineTo(-halfStraight, radius);
  hole.absarc(-halfStraight, 0, radius, Math.PI * 0.5, Math.PI * 1.5, false);
  shape.holes.push(hole);
  return shape;
}

export function buildLowPolySportsCenter(): SportsCenterModel {
  const center = new THREE.Group() as SportsCenterModel;
  center.name = "city-sports-center-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const floodlights: THREE.PointLight[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];
  let eventMode = false;

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc7c3ba, roughness: 0.94 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xeee9dc, roughness: 0.84 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x304248, roughness: 0.58, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x99a6a9, roughness: 0.4, metalness: 0.62 });
  const stadiumBlue = new THREE.MeshStandardMaterial({ color: 0x315f78, roughness: 0.72 });
  const accentOrange = new THREE.MeshStandardMaterial({ color: 0xd46d43, roughness: 0.72 });
  const trackRed = new THREE.MeshStandardMaterial({ color: 0xb95046, roughness: 0.88 });
  const fieldGreen = new THREE.MeshStandardMaterial({ color: 0x4f8255, roughness: 0.98 });
  const courtBlue = new THREE.MeshStandardMaterial({ color: 0x497d9b, roughness: 0.9 });
  const tennisGreen = new THREE.MeshStandardMaterial({ color: 0x4f846c, roughness: 0.92 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x737f86, roughness: 0.94 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9a7049, roughness: 0.86 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x72a9b5, emissive: 0x234b56, emissiveIntensity: 0.08, roughness: 0.2, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide });
  const poolWater = new THREE.MeshStandardMaterial({ color: 0x429bb5, emissive: 0x174956, emissiveIntensity: 0.15, roughness: 0.18, transparent: true, opacity: 0.82 });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xffd89b, emissive: 0xffa23e, emissiveIntensity: 0.14, roughness: 0.3 });
  const scoreboard = new THREE.MeshStandardMaterial({ color: 0x263d49, emissive: 0x58c5dd, emissiveIntensity: 0.25, roughness: 0.28 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4b5254, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x789a6d, roughness: 0.98 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xded5c4, roughness: 0.92 });

  const site = sportsMesh(new THREE.BoxGeometry(280, 0.4, 190), concrete, "sports-center-site-base");
  site.position.y = 0.2;
  const landscape = sportsMesh(new THREE.BoxGeometry(272, 0.12, 182), grass, "sports-center-landscape-base");
  landscape.position.y = 0.45;
  center.add(site, landscape);

  const publicRoad = sportsMesh(new THREE.BoxGeometry(274, 0.13, 9), asphalt, "sports-center-public-road", "service");
  publicRoad.position.set(0, 0.54, 89);
  const publicWalk = sportsMesh(new THREE.BoxGeometry(274, 0.13, 4), paving, "sports-center-public-sidewalk", "service");
  publicWalk.position.set(0, 0.61, 82.5);
  center.add(publicRoad, publicWalk);
  for (let x = -132; x <= 132; x += 16) {
    const mark = sportsMesh(new THREE.BoxGeometry(7, 0.025, 0.12), white, "sports-center-public-road-marking", "service");
    mark.position.set(x, 0.62, 89.5);
    center.add(mark);
  }

  // Main stadium: eight-lane track, football pitch and two grandstands.
  const stadium = new THREE.Group();
  stadium.name = "sports-center-main-stadium";
  stadium.position.set(-45, 0, -15);
  stadium.userData = { zone: "stadium", capacity: 12000, frontDirection: "+z", trackLengthMeters: 400 };
  const stadiumBase = sportsMesh(new THREE.BoxGeometry(184, 0.35, 140), concrete, "sports-center-stadium-base", "stadium");
  stadiumBase.position.y = 0.62;
  const infield = sportsMesh(new THREE.BoxGeometry(105, 0.14, 68), fieldGreen, "sports-center-football-field", "stadium");
  infield.position.y = 0.9;
  infield.userData = { lengthMeters: 105, widthMeters: 68, regulationSize: true };
  const track = sportsMesh(new THREE.ShapeGeometry(stadiumShape(42.2, 36.5, 9.76), 24), trackRed, "sports-center-running-track", "stadium");
  track.rotation.x = -Math.PI * 0.5;
  track.position.y = 0.98;
  track.userData = { laneCount: 8, competitionStandard: true, measuredLapMeters: 400 };
  stadium.add(stadiumBase, infield, track);
  for (let lane = 0; lane <= 8; lane += 1) {
    const curve = stadiumCurve(42.2, 36.5 + lane * 1.22, 1.02);
    const line = sportsMesh(new THREE.TubeGeometry(curve, 130, 0.045, 5, true), white, "sports-center-running-track-lane-line", "stadium");
    stadium.add(line);
  }
  const fieldCenterLine = sportsMesh(new THREE.BoxGeometry(0.09, 0.035, 67.5), white, "sports-center-football-centre-line", "stadium");
  fieldCenterLine.position.y = 1.02;
  const fieldCircle = sportsMesh(new THREE.TorusGeometry(5.5, 0.07, 5, 40), white, "sports-center-football-centre-circle", "stadium");
  fieldCircle.rotation.x = Math.PI * 0.5;
  fieldCircle.position.y = 1.05;
  stadium.add(fieldCenterLine, fieldCircle);
  for (const x of [-52.5, 52.5]) {
    const goal = new THREE.Group();
    goal.name = "sports-center-football-goal";
    goal.position.set(x, 0.95, 0);
    for (const z of [-3.66, 3.66]) {
      const post = sportsMesh(new THREE.CylinderGeometry(0.08, 0.08, 2.44, 8), white, "sports-center-football-goal-post", "stadium");
      post.position.set(0, 1.22, z);
      goal.add(post);
    }
    const bar = sportsMesh(new THREE.CylinderGeometry(0.08, 0.08, 7.32, 8), white, "sports-center-football-goal-bar", "stadium");
    bar.rotation.x = Math.PI * 0.5;
    bar.position.y = 2.44;
    goal.add(bar);
    stadium.add(goal);
  }
  for (const side of [-1, 1]) {
    const stand = new THREE.Group();
    stand.name = "sports-center-stadium-grandstand";
    stand.position.set(0, 0, side * 49);
    stand.userData = { side: side > 0 ? "south" : "north", capacity: 6000 };
    for (let tier = 0; tier < 24; tier += 1) {
      const seatTier = sportsMesh(new THREE.BoxGeometry(132, 0.42 + tier * 0.32, 1.05), tier % 2 ? stadiumBlue : concrete, "sports-center-stadium-seat-tier", "stadium");
      seatTier.position.set(0, (0.42 + tier * 0.32) * 0.5, side * tier * 0.82);
      seatTier.userData.modeledSeats = 250;
      stand.add(seatTier);
    }
    const canopy = sportsMesh(new THREE.BoxGeometry(136, 0.45, 20), steel, "sports-center-stadium-canopy", "stadium");
    canopy.position.set(0, 12.2, side * 9);
    canopy.rotation.x = side * 0.09;
    stand.add(canopy);
    const rearBeam = sportsMesh(new THREE.BoxGeometry(136, 0.42, 0.6), steel, "sports-center-stadium-canopy-rear-beam", "stadium");
    rearBeam.position.set(0, 11.72, side * 17);
    stand.add(rearBeam);
    for (const x of [-60, -36, -12, 12, 36, 60]) {
      const support = sportsMesh(
        new THREE.CylinderGeometry(0.38, 0.52, 11.7, 10),
        steel,
        "sports-center-stadium-canopy-column",
        "stadium",
      );
      support.position.set(x, 5.85, side * 17);
      support.userData = { ...support.userData, structure: "rear-canopy-support", supportsCanopy: true };
      stand.add(support);
    }
    stadium.add(stand);
    for (const centreX of [-45, 0, 45]) {
      const standRail = sportsMesh(new THREE.BoxGeometry(36, 1.1, 0.12), dark, "sports-center-stadium-stand-guardrail", "stadium");
      standRail.position.set(centreX, 1.65, side * 47.3);
      stadium.add(standRail);
    }
    for (const x of [-57, -19, 19, 57]) {
      const wheelchairSpace = sportsMesh(new THREE.BoxGeometry(2.1, 0.08, 2.6), paving, "sports-center-accessible-spectator-space", "stadium");
      wheelchairSpace.position.set(x, 1.08, side * 45.5);
      wheelchairSpace.userData = { venue: "stadium", wheelchairAccessible: true, companionSeatAdjacent: true };
      stadium.add(wheelchairSpace);
    }
  }
  for (const [x, z] of [[-72, -50], [-25, -50], [25, -50], [72, -50], [-72, 50], [-25, 50], [25, 50], [72, 50]] as Array<[number, number]>) {
    const tower = new THREE.Group();
    tower.name = "sports-center-stadium-floodlight-tower";
    tower.position.set(x, 0, z);
    const mast = sportsMesh(new THREE.CylinderGeometry(0.25, 0.42, 24, 10), steel, "sports-center-floodlight-mast", "stadium");
    mast.position.y = 12.8;
    const rack = sportsMesh(new THREE.BoxGeometry(6, 2, 0.45), dark, "sports-center-floodlight-rack", "stadium");
    rack.position.y = 24.2;
    tower.add(mast, rack);
    for (let lamp = 0; lamp < 6; lamp += 1) {
      const panel = sportsMesh(new THREE.BoxGeometry(0.72, 0.85, 0.18), warmLight, "sports-center-stadium-floodlight-panel", "stadium");
      panel.position.set(-2.35 + lamp * 0.94, 24.2, -0.28);
      tower.add(panel);
    }
    const light = new THREE.PointLight(0xffe5ba, 0, 75, 1.3);
    light.name = "sports-center-stadium-event-light";
    light.position.set(0, 23, 0);
    floodlights.push(light);
    tower.add(light);
    stadium.add(tower);
  }
  center.add(stadium);

  const addHall = (name: string, zone: SportsCenterZone, x: number, z: number, width: number, depth: number, height: number, accent: THREE.Material) => {
    const hall = new THREE.Group();
    hall.name = name;
    hall.position.set(x, 0, z);
    hall.userData = { zone, frontDirection: "+z" };
    const body = sportsMesh(new THREE.BoxGeometry(width, height, depth), pale, "sports-center-hall-shell", zone);
    body.position.y = 0.65 + height * 0.5;
    const roof = sportsMesh(new THREE.BoxGeometry(width + 0.8, 0.5, depth + 0.8), dark, "sports-center-hall-roof", zone);
    roof.position.y = 0.65 + height + 0.24;
    const band = sportsMesh(new THREE.BoxGeometry(width + 0.1, 1, 0.25), accent, "sports-center-hall-accent-band", zone);
    band.position.set(0, height - 0.6, depth * 0.5 + 0.12);
    hall.add(body, roof, band);
    cutawayShell.push(body, roof, band);
    center.add(hall);
    return { hall, width, depth, height };
  };

  // Indoor arena with a regulation multi-use court and raked seating.
  const arena = addHall("sports-center-indoor-arena", "arena", 90, -57, 72, 48, 19, stadiumBlue);
  arena.hall.userData.capacity = 5200;
  const arenaCourt = sportsMesh(new THREE.BoxGeometry(30, 0.18, 17), timber, "sports-center-indoor-arena-court", "arena");
  arenaCourt.position.set(90, 0.9, -57);
  center.add(arenaCourt);
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 22; tier += 1) {
      const seats = sportsMesh(new THREE.BoxGeometry(40, 0.36 + tier * 0.22, 0.62), tier % 2 ? accentOrange : stadiumBlue, "sports-center-arena-seat-tier", "arena");
      seats.position.set(90, 1 + (0.36 + tier * 0.22) * 0.5, -57 + side * (9.2 + tier * 0.64));
      seats.userData.modeledSeats = 80;
      center.add(seats);
    }
  }
  for (const end of [-1, 1]) {
    for (let tier = 0; tier < 21; tier += 1) {
      const seats = sportsMesh(new THREE.BoxGeometry(0.62, 0.36 + tier * 0.22, 20), tier % 2 ? stadiumBlue : accentOrange, "sports-center-arena-seat-tier", "arena");
      seats.position.set(90 + end * (15.7 + tier * 0.64), 1 + (0.36 + tier * 0.22) * 0.5, -57);
      seats.userData.modeledSeats = 40;
      center.add(seats);
    }
  }
  for (const x of [-15, -9, -3, 3, 9, 15]) {
    const wheelchairSpace = sportsMesh(new THREE.BoxGeometry(1.8, 0.08, 2.2), paving, "sports-center-accessible-spectator-space", "arena");
    wheelchairSpace.position.set(90 + x, 0.96, -47.8);
    wheelchairSpace.userData = { venue: "arena", wheelchairAccessible: true, companionSeatAdjacent: true };
    center.add(wheelchairSpace);
  }
  for (const x of [-12, 12]) {
    const pole = sportsMesh(new THREE.CylinderGeometry(0.12, 0.16, 3.6, 8), dark, "sports-center-arena-basketball-pole", "arena");
    pole.position.set(90 + x, 2.6, -57);
    const board = sportsMesh(new THREE.BoxGeometry(0.18, 1.25, 2), glass, "sports-center-arena-basketball-backboard", "arena");
    board.position.set(90 + x * 1.02, 3.7, -57);
    center.add(pole, board);
  }
  const arenaScreen = sportsMesh(new THREE.BoxGeometry(7, 3.2, 7), scoreboard, "sports-center-arena-centre-scoreboard", "arena");
  arenaScreen.position.set(90, 10.5, -57);
  center.add(arenaScreen);
  for (let bay = 0; bay < 8; bay += 1) {
    const window = sportsMesh(new THREE.BoxGeometry(6.2, 3.5, 0.16), glass, "sports-center-arena-facade-window", "arena");
    window.position.set(90 - 27 + bay * 7.7, 6, -32.92);
    center.add(window);
    cutawayShell.push(window);
  }

  // Public competition natatorium: 50 m pool with ten lanes and spectator deck.
  const aquatics = addHall("sports-center-aquatics-centre", "aquatics", 94, 0, 76, 46, 13, courtBlue);
  const poolDeck = sportsMesh(new THREE.BoxGeometry(70, 0.25, 39), white, "sports-center-aquatics-pool-deck", "aquatics");
  poolDeck.position.set(94, 0.83, 0);
  const competitionPool = sportsMesh(new THREE.BoxGeometry(50, 0.22, 25), poolWater, "sports-center-competition-pool", "aquatics");
  competitionPool.position.set(90, 1.02, 0);
  competitionPool.userData = { lengthMeters: 50, widthMeters: 25, laneCount: 10 };
  center.add(poolDeck, competitionPool);
  for (let lane = 0; lane <= 10; lane += 1) {
    const rope = sportsMesh(new THREE.CylinderGeometry(0.06, 0.06, 49.4, 8), lane % 2 ? white : trackRed, "sports-center-swimming-lane-rope", "aquatics");
    rope.rotation.z = Math.PI * 0.5;
    rope.position.set(90, 1.18, -12.5 + lane * 2.5);
    center.add(rope);
  }
  for (let lane = 0; lane < 10; lane += 1) {
    const block = sportsMesh(new THREE.BoxGeometry(0.8, 0.48, 0.8), white, "sports-center-swimming-starting-block", "aquatics");
    block.position.set(65.4, 1.38, -11.25 + lane * 2.5);
    center.add(block);
  }
  for (let tier = 0; tier < 6; tier += 1) {
    const poolStand = sportsMesh(new THREE.BoxGeometry(54, 0.4 + tier * 0.34, 0.9), tier % 2 ? courtBlue : concrete, "sports-center-aquatics-seat-tier", "aquatics");
    poolStand.position.set(92, 1 + (0.4 + tier * 0.34) * 0.5, 15 + tier * 0.75);
    center.add(poolStand);
  }
  for (const x of [72, 80, 88, 96, 104, 112]) {
    const wheelchairSpace = sportsMesh(new THREE.BoxGeometry(1.8, 0.08, 2.2), paving, "sports-center-accessible-spectator-space", "aquatics");
    wheelchairSpace.position.set(x, 0.98, 21);
    wheelchairSpace.userData = { venue: "aquatics", wheelchairAccessible: true, companionSeatAdjacent: true };
    center.add(wheelchairSpace);
  }
  for (const side of [-1, 1]) {
    const poolRail = new THREE.Group();
    poolRail.name = "sports-center-pool-deck-guardrail";
    poolRail.position.set(90, 0, side * 13.6);
    poolRail.userData = { heightMeters: 1.2, emergencyBreakWidthMeters: 2.4 };
    for (const centreX of [-13.7, 13.7]) {
      const rail = sportsMesh(new THREE.BoxGeometry(23, 0.12, 0.12), steel, "sports-center-pool-deck-guardrail-rail", "aquatics");
      rail.position.set(centreX, 1.5, 0);
      poolRail.add(rail);
    }
    for (const x of [-25, -19, -13, -7, 7, 13, 19, 25]) {
      const post = sportsMesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), steel, "sports-center-pool-deck-guardrail-post", "aquatics");
      post.position.set(x, 1.05, 0);
      poolRail.add(post);
    }
    center.add(poolRail);
  }
  for (let bay = 0; bay < 9; bay += 1) {
    const window = sportsMesh(new THREE.BoxGeometry(6.4, 5.5, 0.16), glass, "sports-center-aquatics-facade-window", "aquatics");
    window.position.set(94 - 28 + bay * 7, 5, 23.12);
    center.add(window);
    cutawayShell.push(window);
  }

  // Public fitness centre with studios, equipment rows and service rooms.
  const fitness = addHall("sports-center-public-fitness-centre", "fitness", 57, 50, 40, 23, 9, accentOrange);
  let fitnessStationCount = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      fitnessStationCount += 1;
      const machine = sportsMesh(new THREE.BoxGeometry(1.4, 1.5, 1.2), column % 2 ? steel : dark, "sports-center-fitness-machine", "fitness");
      machine.position.set(44 + column * 5, 1.55, 44 + row * 5.2);
      center.add(machine);
    }
  }
  for (let bay = 0; bay < 6; bay += 1) {
    const window = sportsMesh(new THREE.BoxGeometry(5.2, 3.2, 0.16), glass, "sports-center-fitness-facade-window", "fitness");
    window.position.set(57 - 15 + bay * 6, 4.1, 61.62);
    center.add(window);
    cutawayShell.push(window);
  }

  // Outdoor courts and skate park occupy the south-east public activity zone.
  const addBasketballCourt = (x: number, z: number) => {
    const court = new THREE.Group();
    court.name = "sports-center-outdoor-basketball-court";
    court.position.set(x, 0, z);
    court.userData.zone = "outdoor";
    const surface = sportsMesh(new THREE.BoxGeometry(24, 0.14, 14), courtBlue, "sports-center-outdoor-basketball-surface", "outdoor");
    surface.position.y = 0.63;
    court.add(surface);
    for (const end of [-1, 1]) {
      const pole = sportsMesh(new THREE.CylinderGeometry(0.11, 0.15, 3.4, 8), dark, "sports-center-outdoor-basketball-pole", "outdoor");
      pole.position.set(end * 10, 2.4, 0);
      const board = sportsMesh(new THREE.BoxGeometry(0.18, 1.2, 1.9), white, "sports-center-outdoor-basketball-backboard", "outdoor");
      board.position.set(end * 10.45, 3.5, 0);
      const rim = sportsMesh(new THREE.TorusGeometry(0.46, 0.055, 6, 18), accentOrange, "sports-center-outdoor-basketball-rim", "outdoor");
      rim.rotation.x = Math.PI * 0.5;
      rim.position.set(end * 9.75, 3.05, 0);
      const net = sportsMesh(new THREE.CylinderGeometry(0.4, 0.27, 0.55, 12, 1, true), glass, "sports-center-outdoor-basketball-net", "outdoor");
      net.position.set(end * 9.75, 2.78, 0);
      court.add(pole, board, rim, net);
    }
    const centreLine = sportsMesh(new THREE.BoxGeometry(0.08, 0.025, 13.4), white, "sports-center-outdoor-basketball-marking", "outdoor");
    centreLine.position.y = 0.72;
    const centreCircle = sportsMesh(new THREE.TorusGeometry(1.8, 0.045, 5, 28), white, "sports-center-outdoor-basketball-marking", "outdoor");
    centreCircle.rotation.x = Math.PI * 0.5;
    centreCircle.position.y = 0.74;
    court.add(centreLine, centreCircle);
    center.add(court);
  };
  addBasketballCourt(112, 34);
  addBasketballCourt(112, 52);
  const addTennisCourt = (x: number, z: number) => {
    const court = new THREE.Group();
    court.name = "sports-center-outdoor-tennis-court";
    court.position.set(x, 0, z);
    court.userData.zone = "outdoor";
    const surface = sportsMesh(new THREE.BoxGeometry(28, 0.14, 13), tennisGreen, "sports-center-outdoor-tennis-surface", "outdoor");
    surface.position.y = 0.63;
    const net = sportsMesh(new THREE.BoxGeometry(0.12, 0.9, 12.2), glass, "sports-center-outdoor-tennis-net", "outdoor");
    net.position.y = 1.1;
    for (const z of [-6.25, 6.25]) {
      const post = sportsMesh(new THREE.CylinderGeometry(0.08, 0.1, 1.25, 8), dark, "sports-center-outdoor-tennis-net-post", "outdoor");
      post.position.set(0, 1.25, z);
      court.add(post);
    }
    const netTape = sportsMesh(new THREE.BoxGeometry(0.16, 0.09, 12.5), white, "sports-center-outdoor-tennis-net-tape", "outdoor");
    netTape.position.y = 1.56;
    const centreLine = sportsMesh(new THREE.BoxGeometry(27.4, 0.025, 0.07), white, "sports-center-outdoor-tennis-marking", "outdoor");
    centreLine.position.y = 0.72;
    court.add(surface, net, netTape, centreLine);
    center.add(court);
  };
  addTennisCourt(96, 70);
  addTennisCourt(124, 70);
  const skatePark = sportsMesh(new THREE.BoxGeometry(30, 0.18, 14), rubber, "sports-center-skate-park", "outdoor");
  skatePark.position.set(65, 0.65, 72);
  center.add(skatePark);
  for (const x of [55, 65, 75]) {
    const ramp = sportsMesh(new THREE.CylinderGeometry(3.4, 3.4, 6, 20, 1, false, 0, Math.PI), concrete, "sports-center-skate-ramp", "outdoor");
    ramp.rotation.z = Math.PI * 0.5;
    ramp.position.set(x, 1.45, 72);
    center.add(ramp);
  }

  // Ticketing, athlete and service entrances remain clearly separated.
  const service = addHall("sports-center-ticket-service-building", "service", 0, 68, 29, 15, 6.5, stadiumBlue);
  const ticketCounter = sportsMesh(new THREE.BoxGeometry(16, 1.15, 1), timber, "sports-center-ticket-counter", "service");
  ticketCounter.position.set(0, 1.55, 75.65);
  center.add(ticketCounter);
  for (let windowIndex = 0; windowIndex < 6; windowIndex += 1) {
    const ticketWindow = sportsMesh(new THREE.BoxGeometry(2.1, 1.4, 0.14), glass, "sports-center-ticket-window", "service");
    ticketWindow.position.set(-8 + windowIndex * 3.2, 2.4, 75.72);
    center.add(ticketWindow);
    cutawayShell.push(ticketWindow);
  }
  const entrancePlaza = sportsMesh(new THREE.BoxGeometry(90, 0.14, 20), paving, "sports-center-main-entrance-plaza", "service");
  entrancePlaza.position.set(-30, 0.62, 69);
  center.add(entrancePlaza);
  for (const [name, x, z, width, axis] of [["spectator", -30, 79.5, 24, "x"], ["athlete", -139, 20, 10, "z"], ["service", 139, -35, 10, "z"]] as Array<[string, number, number, number, "x" | "z"]>) {
    const entrance = new THREE.Group();
    entrance.name = "sports-center-controlled-entrance";
    entrance.position.set(x, 0, z);
    entrance.userData = { entranceType: name, clearWidth: width, controlledAccess: true, physicalPortal: true, boundaryAxis: axis };
    for (const side of [-1, 1]) {
      const post = sportsMesh(new THREE.BoxGeometry(0.55, 4.8, 0.55), dark, "sports-center-entrance-gate-post", "service");
      post.position.set(axis === "x" ? side * (width * 0.5 + 0.35) : 0, 3.05, axis === "z" ? side * (width * 0.5 + 0.35) : 0);
      entrance.add(post);
    }
    const sign = sportsMesh(new THREE.BoxGeometry(axis === "x" ? width + 1.3 : 0.7, 0.65, axis === "z" ? width + 1.3 : 0.7), stadiumBlue, "sports-center-entrance-gate-sign", "service");
    sign.position.y = 5.7;
    entrance.add(sign);
    center.add(entrance);
  }

  let parkingSpaceCount = 0;
  for (const startX of [-132, 18]) {
    for (let bay = 0; bay < 20; bay += 1) {
      parkingSpaceCount += 1;
      const x = startX + (bay % 10) * 3.5;
      const z = 75 - Math.floor(bay / 10) * 6;
      const parking = sportsMesh(new THREE.BoxGeometry(2.8, 0.04, 5.2), asphalt, "sports-center-parking-space", "service");
      parking.position.set(x, 0.64, z);
      const line = sportsMesh(new THREE.BoxGeometry(0.08, 0.025, 5.1), white, "sports-center-parking-line", "service");
      line.position.set(x - 1.43, 0.68, z);
      center.add(parking, line);
    }
  }

  // Secure event boundary leaves only the three named controlled entrances.
  let fenceSegmentCount = 0;
  const addFence = (x: number, z: number, length: number, horizontal: boolean) => {
    const segment = new THREE.Group();
    segment.name = "sports-center-security-fence";
    segment.position.set(x, 0, z);
    segment.userData = { lengthMeters: length, horizontal };
    fenceSegmentCount += 1;
    const count = Math.max(2, Math.floor(length / 2.2));
    for (let index = 0; index <= count; index += 1) {
      const offset = -length * 0.5 + index / count * length;
      const post = sportsMesh(new THREE.BoxGeometry(0.13, 2.2, 0.13), dark, "sports-center-fence-post");
      post.position.set(horizontal ? offset : 0, 1.82, horizontal ? 0 : offset);
      segment.add(post);
    }
    for (const y of [1.18, 2.15]) {
      const rail = sportsMesh(new THREE.BoxGeometry(horizontal ? length : 0.1, 0.1, horizontal ? 0.1 : length), dark, "sports-center-fence-rail");
      rail.position.y = y;
      segment.add(rail);
    }
    center.add(segment);
  };
  addFence(0, -94, 278, true);
  addFence(-139, -39.5, 109, false);
  addFence(-139, 52.25, 54.5, false);
  addFence(139, -67, 54, false);
  addFence(139, 24.75, 109.5, false);
  addFence(-90.5, 79.5, 97, true);
  addFence(60.5, 79.5, 157, true);

  const lightPositions: Array<[number, number]> = [[-130, 76], [-110, 76], [-88, 76], [-64, 76], [-42, 76], [-18, 76], [18, 76], [42, 76], [66, 76], [90, 76], [114, 76], [132, 76], [-133, 62], [-133, 34], [-133, 5], [-133, -28], [-133, -62], [133, -82], [133, -58], [133, -18], [133, 12], [133, 42], [80, 29], [104, 27], [48, 64], [18, 58]];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.58, z);
    light.scale.setScalar(0.95);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    center.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-70, 62], [-58, 62], [-46, 62], [-18, 62], [18, 62], [31, 62], [82, 28], [96, 28], [110, 28], [124, 28]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.62, z);
    planter.scale.setScalar(1.02);
    planter.userData.sourceCollection = "city-street-furniture";
    center.add(planter);
  });
  for (const [index, x] of [-70, -60, -50].entries()) {
    const truck = buildLowPolyFoodTruck();
    truck.position.set(x, 0.64, 72);
    truck.rotation.y = -Math.PI * 0.5;
    truck.scale.setScalar(0.9);
    truck.userData.sourceCollection = "city-street-furniture";
    truck.userData.setServingOpen(true);
    reusedFoodTrucks.push(truck);
    center.add(truck);
  }
  const treePositions: Array<[number, number]> = [[-132, -90], [-112, -90], [-92, -90], [-72, -90], [-52, -90], [-32, -90], [-12, -90], [8, -90], [28, -90], [48, -90], [68, -90], [88, -90], [108, -90], [128, -90], [134, -76], [134, -58], [134, -16], [134, 30], [134, 45], [134, 58], [-94, 61], [-86, 70], [-78, 76]];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "sports-center-reused-tree-anchor";
    anchor.position.set(x, 0.55, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    center.add(anchor);
  });

  center.userData = {
    mapLayer: "exterior",
    modelType: "sports-center",
    generatedLocally: true,
    zones: ["stadium", "arena", "aquatics", "outdoor", "fitness", "service"],
    buildingCount: 5,
    stadiumCapacity: 12000,
    runningTrackLanes: 8,
    footballFieldCount: 1,
    arenaCapacity: 5200,
    arenaCourtCount: 1,
    swimmingLaneCount: 10,
    basketballCourtCount: 2,
    tennisCourtCount: 2,
    skateParkCount: 1,
    fitnessStationCount,
    parkingSpaceCount,
    floodlightTowerCount: floodlights.length,
    entranceCount: 3,
    fenceSegmentCount,
    treeAnchorCount: treePositions.length,
    streetLightCount: lightPositions.length,
    planterCount: planterPositions.length,
    foodTruckCount: reusedFoodTrucks.length,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-food-truck-lowpoly",
    ],
    siteSize: new THREE.Vector3(280, 26, 190),
    setPowered: (powered) => {
      glass.emissiveIntensity = powered ? 1.05 : 0.08;
      warmLight.emissiveIntensity = powered ? 2.2 : 0.14;
      poolWater.emissiveIntensity = powered ? 0.6 : 0.15;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      reusedFoodTrucks.forEach((truck) => truck.userData.setLights(powered));
    },
    setEventMode: (active) => {
      eventMode = active;
      floodlights.forEach((light) => { light.intensity = active ? 7.5 : 0; });
      scoreboard.emissiveIntensity = active ? 2.8 : 0.25;
    },
    setInteriorCutaway: (cutaway) => { cutawayShell.forEach((object) => { object.visible = !cutaway; }); },
    update: (elapsedSeconds) => {
      if (!eventMode) return;
      scoreboard.emissiveIntensity = 2.5 + Math.sin(elapsedSeconds * 2) * 0.35;
    },
  };
  center.userData.setPowered(false);
  center.userData.setEventMode(false);
  center.userData.setInteriorCutaway(false);
  return center;
}
