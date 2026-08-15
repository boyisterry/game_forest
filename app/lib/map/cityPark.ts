import * as THREE from "three";
import {
  buildLowPolyFoodTruck,
  buildLowPolyParkStreetLight,
  buildLowPolyRoadsidePlanter,
} from "./cityFurniture.ts";

export type CityParkZone = "entrance" | "lake" | "recreation" | "garden" | "amphitheatre" | "service";

export type CityParkModel = THREE.Group & {
  userData: {
    modelType: "city-park";
    generatedLocally: true;
    zones: CityParkZone[];
    buildingCount: number;
    entranceCount: number;
    lakeCount: number;
    bridgeCount: number;
    walkingLoopLengthMeters: number;
    cyclingLoopLengthMeters: number;
    playgroundCount: number;
    sportsCourtCount: number;
    fitnessEquipmentCount: number;
    amphitheatreSeatRows: number;
    greenhouseCount: number;
    flowerBedCount: number;
    benchCount: number;
    fountainJetCount: number;
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
    setWaterMotionEnabled: (enabled: boolean) => void;
    setServiceCutaway: (cutaway: boolean) => void;
    update: (elapsedSeconds: number) => void;
  };
};

function parkMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: CityParkZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

function beamBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, name: string, zone?: CityParkZone) {
  const direction = end.clone().sub(start);
  const beam = parkMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, name, zone);
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
}

export function buildLowPolyCityPark(): CityParkModel {
  const park = new THREE.Group() as CityParkModel;
  park.name = "city-park-lowpoly";
  const reusedStreetLights: ReturnType<typeof buildLowPolyParkStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];
  const serviceCutawayShell: THREE.Object3D[] = [];
  const waterJets: THREE.Mesh[] = [];
  let waterMotionEnabled = true;

  const grass = new THREE.MeshStandardMaterial({ color: 0x729768, roughness: 0.98 });
  const meadow = new THREE.MeshStandardMaterial({ color: 0x86a978, roughness: 0.98 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xddd4c1, roughness: 0.92 });
  const warmPaving = new THREE.MeshStandardMaterial({ color: 0xd6b67e, roughness: 0.88 });
  const cycleBlue = new THREE.MeshStandardMaterial({ color: 0x4d8592, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x35484c, roughness: 0.62, metalness: 0.28 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x956b47, roughness: 0.88 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xa8a49b, roughness: 0.96 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xeee8d9, roughness: 0.84 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xb9654d, roughness: 0.8 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4d9fb2, emissive: 0x174651, emissiveIntensity: 0.14, roughness: 0.2, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x77aeb8, emissive: 0x234b55, emissiveIntensity: 0.08, roughness: 0.18, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xffd89b, emissive: 0xffa33e, emissiveIntensity: 0.14, roughness: 0.3 });
  const flowerMaterials = [0xe66e68, 0xf0ba4e, 0x8f6fba, 0xf0a3b7, 0x5ea57a].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }));
  const playBlue = new THREE.MeshStandardMaterial({ color: 0x4d93aa, roughness: 0.74 });
  const playYellow = new THREE.MeshStandardMaterial({ color: 0xe6b84d, roughness: 0.74 });
  const playRed = new THREE.MeshStandardMaterial({ color: 0xd96552, roughness: 0.74 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x78a78d, roughness: 0.94 });

  const site = parkMesh(new THREE.BoxGeometry(185, 0.4, 140), grass, "city-park-site-base");
  site.position.y = 0.2;
  park.add(site);
  const meadowPatches = [
    [-58, -28, 42, 34], [58, -3, 43, 38], [-50, 38, 50, 28], [54, 43, 42, 22],
  ] as Array<[number, number, number, number]>;
  meadowPatches.forEach(([x, z, width, depth]) => {
    const patch = parkMesh(new THREE.BoxGeometry(width, 0.08, depth), meadow, "city-park-meadow", "garden");
    patch.position.set(x, 0.47, z);
    park.add(patch);
  });

  // Two concentric accessible loops establish clear walking and cycling circulation.
  const cyclingLoop = parkMesh(new THREE.RingGeometry(49, 52.5, 96), cycleBlue, "city-park-cycling-loop", "entrance");
  cyclingLoop.rotation.x = -Math.PI * 0.5;
  cyclingLoop.scale.x = 1.47;
  cyclingLoop.position.y = 0.55;
  cyclingLoop.userData = { continuous: true, barrierFree: true, oneWay: true, lengthMeters: 398 };
  park.add(cyclingLoop);
  const walkingLoop = parkMesh(new THREE.RingGeometry(42.5, 45.2, 96), warmPaving, "city-park-walking-loop", "entrance");
  walkingLoop.rotation.x = -Math.PI * 0.5;
  walkingLoop.scale.x = 1.47;
  walkingLoop.position.y = 0.57;
  walkingLoop.userData = { continuous: true, barrierFree: true, lengthMeters: 344 };
  park.add(walkingLoop);

  const accessiblePathSpecs = [
    [0, 52, 12, 34], [0, -51, 8, 36], [-73, 0, 38, 8], [73, 0, 38, 8],
  ] as Array<[number, number, number, number]>;
  for (const [x, z, width, depth] of accessiblePathSpecs) {
    const path = parkMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "city-park-accessible-path", "entrance");
    path.position.set(x, 0.59, z);
    path.userData = { barrierFree: true, clearWidth: Math.min(width, depth) };
    park.add(path);
  }

  // Central ecological lake, island pavilion and an east-west viewing bridge.
  const lakeBank = parkMesh(new THREE.CircleGeometry(1, 64), stone, "city-park-lake-bank", "lake");
  lakeBank.rotation.x = -Math.PI * 0.5;
  lakeBank.scale.set(39, 24, 1);
  lakeBank.position.set(0, 0.58, -8);
  park.add(lakeBank);
  const lake = parkMesh(new THREE.CircleGeometry(1, 64), water, "city-park-central-lake", "lake");
  lake.rotation.x = -Math.PI * 0.5;
  lake.scale.set(36.5, 21.5, 1);
  lake.position.set(0, 0.67, -8);
  lake.userData = { ecologicalShore: true, maximumDepthMeters: 2.8 };
  park.add(lake);
  const lakeSafetyBuffer = parkMesh(new THREE.RingGeometry(1, 1.1, 64), meadow, "city-park-lake-safety-buffer", "lake");
  lakeSafetyBuffer.rotation.x = -Math.PI * 0.5;
  lakeSafetyBuffer.scale.set(36.5, 21.5, 1);
  lakeSafetyBuffer.position.set(0, 0.7, -8);
  lakeSafetyBuffer.userData = { nonSlip: true, visualShoreBoundary: true, minimumWidthMeters: 2.15 };
  park.add(lakeSafetyBuffer);
  const lakeShoreSlope = parkMesh(new THREE.RingGeometry(1.1, 1.16, 64), stone, "city-park-lake-shore-slope", "lake");
  lakeShoreSlope.rotation.x = -Math.PI * 0.5;
  lakeShoreSlope.scale.set(36.5, 21.5, 1);
  lakeShoreSlope.position.set(0, 0.64, -8);
  lakeShoreSlope.userData = { profile: "soft-graded-bank", maximumGradient: "1:12", tactileEdge: true };
  park.add(lakeShoreSlope);
  for (const side of [-1, 1]) {
    const shoreRail = new THREE.Group();
    shoreRail.name = "city-park-lake-shore-guardrail";
    shoreRail.position.set(0, 0, -8 + side * 23.2);
    shoreRail.userData = { heightMeters: 1.15, protectedViewingEdge: true };
    for (const y of [1.08, 1.62]) {
      const rail = parkMesh(new THREE.BoxGeometry(30, 0.11, 0.12), dark, "city-park-lake-shore-guardrail-rail", "lake");
      rail.position.y = y;
      shoreRail.add(rail);
    }
    for (let x = -15; x <= 15; x += 3) {
      const post = parkMesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), dark, "city-park-lake-shore-guardrail-post", "lake");
      post.position.set(x, 1.14, 0);
      shoreRail.add(post);
    }
    park.add(shoreRail);
  }
  for (const x of [-18, 18]) {
    const wetland = parkMesh(new THREE.CircleGeometry(1, 24), meadow, "city-park-wetland-island", "lake");
    wetland.rotation.x = -Math.PI * 0.5;
    wetland.scale.set(5.5, 3.5, 1);
    wetland.position.set(x, 0.75, -13 + x * 0.08);
    park.add(wetland);
  }

  const bridge = new THREE.Group();
  bridge.name = "city-park-lake-bridge";
  bridge.position.set(0, 0, -8);
  bridge.userData = { barrierFree: true, clearWidth: 4.2, spanMeters: 78 };
  const deck = parkMesh(new THREE.BoxGeometry(78, 0.28, 4.2), timber, "city-park-bridge-deck", "lake");
  deck.position.y = 1.05;
  bridge.add(deck);
  for (const side of [-1, 1]) {
    for (const centreX of [-22, 22]) {
      const rail = parkMesh(new THREE.BoxGeometry(34, 1, 0.12), dark, "city-park-bridge-guardrail", "lake");
      rail.position.set(centreX, 1.65, side * 2.0);
      bridge.add(rail);
    }
    for (let x = -37; x <= 37; x += 4) {
      if (Math.abs(x) < 5) continue;
      const post = parkMesh(new THREE.BoxGeometry(0.11, 1.25, 0.11), dark, "city-park-bridge-guard-post", "lake");
      post.position.set(x, 1.55, side * 2.0);
      bridge.add(post);
    }
  }
  park.add(bridge);

  const pavilion = new THREE.Group();
  pavilion.name = "city-park-lake-pavilion";
  pavilion.position.set(0, 1.22, -8);
  const pavilionFloor = parkMesh(new THREE.CylinderGeometry(5.2, 5.2, 0.32, 16), stone, "city-park-pavilion-floor", "lake");
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const column = parkMesh(new THREE.CylinderGeometry(0.18, 0.22, 4.5, 8), timber, "city-park-pavilion-column", "lake");
    column.position.set(Math.cos(angle) * 4.2, 2.4, Math.sin(angle) * 4.2);
    pavilion.add(column);
  }
  const pavilionRoof = parkMesh(new THREE.ConeGeometry(6.8, 2.6, 8), terracotta, "city-park-pavilion-roof", "lake");
  pavilionRoof.position.y = 5.7;
  pavilion.add(pavilionFloor, pavilionRoof);
  for (const side of [-1, 1]) {
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= 14; step += 1) {
      const angle = side > 0
        ? 0.4 + step / 14 * (Math.PI - 0.8)
        : Math.PI + 0.4 + step / 14 * (Math.PI - 0.8);
      points.push(new THREE.Vector3(Math.cos(angle) * 4.75, 1.05, Math.sin(angle) * 4.75));
      if (step % 2 === 0) {
        const post = parkMesh(new THREE.BoxGeometry(0.11, 1.05, 0.11), dark, "city-park-pavilion-guard-post", "lake");
        post.position.set(Math.cos(angle) * 4.75, 0.68, Math.sin(angle) * 4.75);
        pavilion.add(post);
      }
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const pavilionRail = parkMesh(new THREE.TubeGeometry(curve, 28, 0.075, 6, false), dark, "city-park-pavilion-guardrail", "lake");
    pavilion.add(pavilionRail);
  }
  park.add(pavilion);

  // Keep both aeration fountains in open water, clear of the bridge deck and pavilion.
  const fountainPositions = [
    { x: -16, z: -20 },
    { x: 16, z: 4 },
  ];
  for (const { x: fountainX, z: fountainZ } of fountainPositions) {
    const fountainBase = parkMesh(new THREE.CylinderGeometry(1.2, 1.2, 0.25, 16), dark, "city-park-lake-fountain-base", "lake");
    fountainBase.position.set(fountainX, 0.72, fountainZ);
    fountainBase.userData = { ...fountainBase.userData, locatedInOpenWater: true, waterSurfaceY: 0.67 };
    park.add(fountainBase);
    for (let jet = 0; jet < 5; jet += 1) {
      const angle = jet / 5 * Math.PI * 2;
      const waterJet = parkMesh(new THREE.CylinderGeometry(0.07, 0.12, 3.6, 8), water, "city-park-fountain-water-jet", "lake");
      waterJet.position.set(fountainX + Math.cos(angle) * 0.65, 2.55, fountainZ + Math.sin(angle) * 0.65);
      waterJet.userData = {
        ...waterJet.userData,
        phase: jet * 0.65 + (fountainX > 0 ? 0.4 : 0),
        locatedInOpenWater: true,
        fountainCenter: { x: fountainX, z: fountainZ },
      };
      waterJets.push(waterJet);
      park.add(waterJet);
    }
  }

  // South entrance plaza with landmark gateway, information and bicycle parking.
  const entrancePlaza = parkMesh(new THREE.BoxGeometry(48, 0.14, 19), warmPaving, "city-park-main-entrance-plaza", "entrance");
  entrancePlaza.position.set(0, 0.62, 57);
  park.add(entrancePlaza);
  const gateway = new THREE.Group();
  gateway.name = "city-park-main-gateway";
  gateway.position.set(0, 0, 67);
  gateway.userData = { clearWidth: 18, barrierFree: true, alwaysOpen: true };
  for (const x of [-10, 10]) {
    const pier = parkMesh(new THREE.BoxGeometry(1.5, 6.2, 1.5), stone, "city-park-gateway-pier", "entrance");
    pier.position.set(x, 3.5, 0);
    gateway.add(pier);
  }
  const gatewayBeam = parkMesh(new THREE.BoxGeometry(22, 0.8, 1.2), timber, "city-park-gateway-beam", "entrance");
  gatewayBeam.position.y = 6.2;
  gateway.add(gatewayBeam);
  park.add(gateway);
  for (const x of [-18, 18]) {
    const rack = new THREE.Group();
    rack.name = "city-park-bicycle-rack";
    rack.position.set(x, 0.65, 58);
    for (let slot = 0; slot < 6; slot += 1) {
      const hoop = parkMesh(new THREE.TorusGeometry(0.55, 0.07, 6, 14, Math.PI), dark, "city-park-bicycle-rack-hoop", "entrance");
      hoop.position.set(slot * 1.15 - 2.9, 0.58, 0);
      rack.add(hoop);
    }
    park.add(rack);
  }

  // West children's playground and east community sports area.
  const playground = parkMesh(new THREE.BoxGeometry(32, 0.14, 23), rubber, "city-park-children-playground", "recreation");
  playground.position.set(-57, 0.63, 18);
  park.add(playground);
  const playStructure = new THREE.Group();
  playStructure.name = "city-park-play-structure";
  playStructure.userData = { supported: true, platformHeightMeters: 3.1, fallProtection: true };
  const platform = parkMesh(new THREE.BoxGeometry(5.2, 0.28, 4.6), playBlue, "city-park-play-platform", "recreation");
  platform.position.set(-57, 3.1, 15.2);
  playStructure.add(platform);
  for (const [x, z] of [[-59.2, 13.3], [-54.8, 13.3], [-59.2, 17.1], [-54.8, 17.1]] as Array<[number, number]>) {
    const post = parkMesh(new THREE.CylinderGeometry(0.17, 0.22, 2.5, 8), dark, "city-park-play-platform-post", "recreation");
    post.position.set(x, 1.84, z);
    post.userData = { groundContactY: 0.7 };
    playStructure.add(post);
  }
  const playRoof = parkMesh(new THREE.ConeGeometry(3.7, 1.7, 4), playRed, "city-park-play-tower-roof", "recreation");
  playRoof.position.set(-57, 5.55, 15.2);
  playRoof.rotation.y = Math.PI * 0.25;
  playStructure.add(playRoof);
  for (const x of [-59.15, -54.85]) {
    const guard = parkMesh(new THREE.BoxGeometry(0.16, 1.15, 4.2), playYellow, "city-park-play-platform-guardrail", "recreation");
    guard.position.set(x, 3.75, 15.2);
    playStructure.add(guard);
  }
  const backGuard = parkMesh(new THREE.BoxGeometry(4.5, 1.15, 0.16), playYellow, "city-park-play-platform-guardrail", "recreation");
  backGuard.position.set(-57, 3.75, 13.25);
  playStructure.add(backGuard);
  for (let step = 0; step < 6; step += 1) {
    const stair = parkMesh(new THREE.BoxGeometry(2.2, 0.42, 0.72), playYellow, "city-park-play-stair", "recreation");
    stair.position.set(-57, 0.91 + step * 0.42, 10.55 + step * 0.62);
    playStructure.add(stair);
  }
  for (const x of [-58.3, -55.7]) {
    const handrail = beamBetween(
      new THREE.Vector3(x, 1.35, 10.2),
      new THREE.Vector3(x, 3.85, 13.4),
      0.09,
      dark,
      "city-park-play-stair-handrail",
      "recreation",
    );
    playStructure.add(handrail);
  }
  const slideStart = new THREE.Vector3(-57, 3.05, 17.55);
  const slideEnd = new THREE.Vector3(-57, 0.88, 24.8);
  const slideLength = slideStart.distanceTo(slideEnd);
  const slide = parkMesh(new THREE.BoxGeometry(1.8, 0.18, slideLength), playRed, "city-park-play-slide", "recreation");
  slide.position.copy(slideStart).add(slideEnd).multiplyScalar(0.5);
  slide.rotation.x = Math.atan2(slideStart.y - slideEnd.y, slideEnd.z - slideStart.z);
  slide.userData = { supportedAtPlatform: true, groundLandingY: 0.7, sideProtection: true };
  playStructure.add(slide);
  for (const x of [-58, -56]) {
    const slideRail = beamBetween(
      new THREE.Vector3(x, slideStart.y + 0.42, slideStart.z),
      new THREE.Vector3(x, slideEnd.y + 0.42, slideEnd.z),
      0.09,
      playYellow,
      "city-park-play-slide-side-rail",
      "recreation",
    );
    playStructure.add(slideRail);
  }
  const slideLanding = parkMesh(new THREE.BoxGeometry(2.4, 0.12, 2.3), warmPaving, "city-park-play-slide-landing", "recreation");
  slideLanding.position.set(-57, 0.77, 25.55);
  playStructure.add(slideLanding);
  park.add(playStructure);

  // Additional all-ability play equipment gives the playground distinct activities.
  for (const [index, x] of [-68, -64, -60].entries()) {
    const rockingHorse = new THREE.Group();
    rockingHorse.name = "city-park-play-rocking-horse";
    rockingHorse.position.set(x, 0, 20.6 + (index % 2) * 2.2);
    rockingHorse.userData = { anchored: true, springMounted: true };
    const rocker = parkMesh(new THREE.TorusGeometry(0.78, 0.09, 6, 18, Math.PI), dark, "city-park-rocking-horse-rocker", "recreation");
    rocker.position.y = 0.78;
    const spring = parkMesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 8), playYellow, "city-park-rocking-horse-spring", "recreation");
    spring.position.y = 1.13;
    const body = parkMesh(new THREE.BoxGeometry(1.45, 0.62, 0.48), index % 2 ? playBlue : playRed, "city-park-rocking-horse-body", "recreation");
    body.position.y = 1.62;
    const head = parkMesh(new THREE.BoxGeometry(0.48, 0.82, 0.48), index % 2 ? playBlue : playRed, "city-park-rocking-horse-head", "recreation");
    head.position.set(0.62, 2.05, 0);
    const handle = parkMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), dark, "city-park-rocking-horse-handle", "recreation");
    handle.rotation.x = Math.PI * 0.5;
    handle.position.set(0.55, 2.18, 0);
    rockingHorse.add(rocker, spring, body, head, handle);
    park.add(rockingHorse);
  }

  const swing = new THREE.Group();
  swing.name = "city-park-play-swing-set";
  swing.position.set(-47, 0, 20);
  swing.userData = { seatCount: 2, groundAnchored: true, safetyZoneMeters: 5 };
  for (const x of [-2.9, 2.9]) {
    for (const z of [-1.65, 1.65]) {
      swing.add(beamBetween(
        new THREE.Vector3(x, 0.7, z),
        new THREE.Vector3(x * 0.72, 4.6, 0),
        0.12,
        dark,
        "city-park-play-swing-frame",
        "recreation",
      ));
    }
  }
  const swingBeam = parkMesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 10), dark, "city-park-play-swing-beam", "recreation");
  swingBeam.rotation.z = Math.PI * 0.5;
  swingBeam.position.y = 4.6;
  swing.add(swingBeam);
  for (const x of [-1.25, 1.25]) {
    for (const chainX of [-0.42, 0.42]) {
      const chain = parkMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.25, 6), dark, "city-park-play-swing-chain", "recreation");
      chain.position.set(x + chainX, 3.45, 0);
      swing.add(chain);
    }
    const seat = parkMesh(new THREE.BoxGeometry(1.15, 0.13, 0.52), playYellow, "city-park-play-swing-seat", "recreation");
    seat.position.set(x, 2.3, 0);
    swing.add(seat);
  }
  park.add(swing);

  const seesaw = new THREE.Group();
  seesaw.name = "city-park-play-seesaw";
  seesaw.position.set(-68, 0, 10);
  seesaw.userData = { groundAnchored: true, seatCount: 2 };
  const seesawSupport = parkMesh(new THREE.CylinderGeometry(0.35, 0.48, 1.1, 8), playBlue, "city-park-play-seesaw-support", "recreation");
  seesawSupport.position.y = 1.25;
  const seesawBeam = parkMesh(new THREE.BoxGeometry(6.4, 0.24, 0.52), playRed, "city-park-play-seesaw-beam", "recreation");
  seesawBeam.position.y = 1.9;
  seesawBeam.rotation.z = 0.08;
  seesaw.add(seesawSupport, seesawBeam);
  for (const x of [-2.55, 2.55]) {
    const seat = parkMesh(new THREE.BoxGeometry(0.9, 0.16, 0.85), playYellow, "city-park-play-seesaw-seat", "recreation");
    seat.position.set(x, 2.13 + x * 0.08, 0);
    const handle = parkMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), dark, "city-park-play-seesaw-handle", "recreation");
    handle.rotation.x = Math.PI * 0.5;
    handle.position.set(x * 0.76, 2.55 + x * 0.06, 0);
    seesaw.add(seat, handle);
  }
  park.add(seesaw);
  const sandbox = parkMesh(new THREE.CylinderGeometry(5, 5, 0.28, 24), warmPaving, "city-park-play-sandbox", "recreation");
  sandbox.position.set(-70, 0.82, 24);
  park.add(sandbox);

  const sportsCourt = parkMesh(new THREE.BoxGeometry(30, 0.14, 17), cycleBlue, "city-park-community-sports-court", "recreation");
  sportsCourt.position.set(58, 0.64, 19);
  park.add(sportsCourt);
  for (const x of [-13, 13]) {
    const pole = parkMesh(new THREE.CylinderGeometry(0.12, 0.16, 3.6, 8), dark, "city-park-basketball-pole", "recreation");
    pole.position.set(58 + x, 2.45, 19);
    const board = parkMesh(new THREE.BoxGeometry(0.18, 1.2, 1.9), ivory, "city-park-basketball-backboard", "recreation");
    board.position.set(58 + x * 0.96, 3.65, 19);
    park.add(pole, board);
  }
  let fitnessEquipmentCount = 0;
  for (let index = 0; index < 10; index += 1) {
    fitnessEquipmentCount += 1;
    const x = 43 + (index % 5) * 7;
    const z = 32 + Math.floor(index / 5) * 6;
    const equipment = parkMesh(new THREE.CylinderGeometry(0.12, 0.15, 2.4, 8), index % 2 ? playYellow : playBlue, "city-park-fitness-equipment", "recreation");
    equipment.position.set(x, 1.75, z);
    const handle = parkMesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), dark, "city-park-fitness-handle", "recreation");
    handle.position.set(x, 2.55, z);
    park.add(equipment, handle);
  }

  // North-west botanical garden with greenhouse and accessible flower beds.
  const botanical = new THREE.Group();
  botanical.name = "city-park-botanical-garden";
  botanical.position.set(-57, 0, -39);
  botanical.userData = { zone: "garden", accessible: true };
  const gardenFloor = parkMesh(new THREE.BoxGeometry(47, 0.12, 29), warmPaving, "city-park-botanical-garden-floor", "garden");
  gardenFloor.position.y = 0.6;
  botanical.add(gardenFloor);
  let flowerBedCount = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      flowerBedCount += 1;
      const bed = parkMesh(new THREE.BoxGeometry(5.6, 0.55, 3.2), stone, "city-park-botanical-flower-bed", "garden");
      bed.position.set(-18 + column * 9, 0.9, -9 + row * 7.5);
      const flowers = parkMesh(new THREE.BoxGeometry(5, 0.22, 2.6), flowerMaterials[(row + column) % flowerMaterials.length], "city-park-botanical-flowers", "garden");
      flowers.position.set(bed.position.x, 1.26, bed.position.z);
      botanical.add(bed, flowers);
    }
  }
  park.add(botanical);

  const greenhouse = new THREE.Group();
  greenhouse.name = "city-park-greenhouse";
  greenhouse.position.set(-58, 0, -53);
  greenhouse.userData = { zone: "garden", frontDirection: "+z", structurallyFramed: true, roofPitchRadians: 0.24 };
  const greenhouseFloor = parkMesh(new THREE.BoxGeometry(30, 0.25, 14), stone, "city-park-greenhouse-floor", "garden");
  greenhouseFloor.position.y = 0.67;
  for (const x of [-15, 15]) {
    const wall = parkMesh(new THREE.BoxGeometry(0.18, 5.8, 14), glass, "city-park-greenhouse-glass-wall", "garden");
    wall.position.set(x, 3.45, 0);
    greenhouse.add(wall);
  }
  for (const z of [-7]) {
    const wall = parkMesh(new THREE.BoxGeometry(30, 5.8, 0.18), glass, "city-park-greenhouse-glass-wall", "garden");
    wall.position.set(0, 3.45, z);
    greenhouse.add(wall);
  }
  for (const x of [-8.5, 8.5]) {
    const frontWall = parkMesh(new THREE.BoxGeometry(13, 5.8, 0.18), glass, "city-park-greenhouse-glass-wall", "garden");
    frontWall.position.set(x, 3.45, 7);
    greenhouse.add(frontWall);
  }
  const frontHeader = parkMesh(new THREE.BoxGeometry(4, 2.4, 0.18), glass, "city-park-greenhouse-glass-wall", "garden");
  frontHeader.position.set(0, 5.15, 7);
  greenhouse.add(frontHeader);
  for (const side of [-1, 1]) {
    const door = parkMesh(new THREE.BoxGeometry(1.9, 3.4, 0.16), glass, "city-park-greenhouse-entry-door", "garden");
    door.position.set(side * 1, 2.25, 7.12);
    door.userData = { accessible: true, clearWidthMeters: 2, operationalLeaf: side > 0 ? "right" : "left" };
    greenhouse.add(door);
  }
  for (const side of [-1, 1]) {
    const roof = parkMesh(new THREE.BoxGeometry(15.6, 0.18, 14.2), glass, "city-park-greenhouse-glass-roof", "garden");
    roof.position.set(side * 7.58, 8.32, 0);
    roof.rotation.z = side * -0.24;
    greenhouse.add(roof);
  }
  for (const [x, z] of [[-15, -7], [-15, 0], [-15, 7], [15, -7], [15, 0], [15, 7], [-7.5, -7], [0, -7], [7.5, -7], [-7.5, 7], [7.5, 7]] as Array<[number, number]>) {
    const framePost = parkMesh(new THREE.BoxGeometry(0.2, 5.8, 0.2), dark, "city-park-greenhouse-frame-post", "garden");
    framePost.position.set(x, 3.45, z);
    greenhouse.add(framePost);
  }
  const ridgeBeam = parkMesh(new THREE.BoxGeometry(0.28, 0.28, 14.4), dark, "city-park-greenhouse-ridge-beam", "garden");
  ridgeBeam.position.set(0, 10.22, 0);
  greenhouse.add(ridgeBeam);
  for (const x of [-15, 15]) {
    const eaveBeam = parkMesh(new THREE.BoxGeometry(0.28, 0.28, 14.4), dark, "city-park-greenhouse-eave-beam", "garden");
    eaveBeam.position.set(x, 6.45, 0);
    greenhouse.add(eaveBeam);
  }
  greenhouse.add(greenhouseFloor);
  park.add(greenhouse);

  // North-east open-air amphitheatre faces a sheltered stage.
  const amphitheatre = new THREE.Group();
  amphitheatre.name = "city-park-open-air-amphitheatre";
  amphitheatre.position.set(56, 0, -38);
  amphitheatre.userData = { zone: "amphitheatre", seatRows: 6, accessibleFrontRow: true };
  for (let row = 0; row < 6; row += 1) {
    const tier = parkMesh(new THREE.RingGeometry(8 + row * 2.7, 9.6 + row * 2.7, 40, 1, 0, Math.PI), row % 2 ? stone : warmPaving, "city-park-amphitheatre-seat-row", "amphitheatre");
    tier.rotation.x = -Math.PI * 0.5;
    tier.rotation.z = Math.PI;
    tier.position.y = 0.72 + row * 0.42;
    amphitheatre.add(tier);
  }
  const stage = parkMesh(new THREE.BoxGeometry(20, 0.65, 8), timber, "city-park-amphitheatre-stage", "amphitheatre");
  stage.position.set(0, 1, 2.5);
  const stageRoof = parkMesh(new THREE.BoxGeometry(22, 0.35, 10), terracotta, "city-park-amphitheatre-stage-roof", "amphitheatre");
  stageRoof.position.set(0, 7.2, 2.5);
  amphitheatre.add(stage, stageRoof);
  for (const x of [-6, -2, 2, 6]) {
    const wheelchairBay = parkMesh(new THREE.BoxGeometry(1.8, 0.08, 2.4), paving, "city-park-amphitheatre-wheelchair-space", "amphitheatre");
    wheelchairBay.position.set(x, 0.76, -6.2);
    wheelchairBay.userData = { wheelchairAccessible: true, companionSeatAdjacent: true };
    amphitheatre.add(wheelchairBay);
  }
  for (const x of [-9.5, 9.5]) {
    for (const z of [-1, 6]) {
      const post = parkMesh(new THREE.BoxGeometry(0.25, 6.4, 0.25), dark, "city-park-amphitheatre-stage-post", "amphitheatre");
      post.position.set(x, 4, z);
      amphitheatre.add(post);
    }
  }
  park.add(amphitheatre);
  const amphitheatrePath = parkMesh(new THREE.BoxGeometry(5, 0.12, 44), paving, "city-park-amphitheatre-access-path", "amphitheatre");
  amphitheatrePath.position.set(73, 0.61, -22);
  amphitheatrePath.userData = { barrierFree: true, clearWidth: 5, connectsTo: "east-entrance-path" };
  const amphitheatreConnector = parkMesh(new THREE.BoxGeometry(14, 0.12, 5), paving, "city-park-amphitheatre-access-path", "amphitheatre");
  amphitheatreConnector.position.set(66, 0.62, -44);
  amphitheatreConnector.userData = { barrierFree: true, clearWidth: 5, connectsTo: "wheelchair-front-row" };
  park.add(amphitheatrePath, amphitheatreConnector);

  // Visitor centre combines park information, cafe, toilets and first aid.
  const visitorCentre = new THREE.Group();
  visitorCentre.name = "city-park-visitor-service-centre";
  visitorCentre.position.set(54, 0, 52);
  visitorCentre.userData = { zone: "service", frontDirection: "+z", services: ["information", "cafe", "toilets", "first-aid"] };
  const serviceBody = parkMesh(new THREE.BoxGeometry(34, 6.8, 16), ivory, "city-park-service-building-shell", "service");
  serviceBody.position.y = 4.05;
  const serviceRoof = parkMesh(new THREE.BoxGeometry(35, 0.35, 17), dark, "city-park-service-building-roof", "service");
  serviceRoof.position.y = 7.63;
  visitorCentre.add(serviceBody, serviceRoof);
  serviceCutawayShell.push(serviceBody, serviceRoof);
  for (let bay = 0; bay < 6; bay += 1) {
    const window = parkMesh(new THREE.BoxGeometry(4.2, 2.4, 0.15), glass, "city-park-service-building-window", "service");
    window.position.set(-14 + bay * 5.6, 3.2, 8.08);
    visitorCentre.add(window);
    serviceCutawayShell.push(window);
  }
  const serviceEntrance = parkMesh(new THREE.BoxGeometry(4.6, 2.7, 0.18), glass, "city-park-service-centre-entrance", "service");
  serviceEntrance.position.set(0, 2.05, 8.13);
  const infoDesk = parkMesh(new THREE.BoxGeometry(5, 0.9, 1), timber, "city-park-information-desk", "service");
  infoDesk.position.set(48, 1.4, 50);
  const cafeCounter = parkMesh(new THREE.BoxGeometry(6, 1, 1.1), terracotta, "city-park-cafe-counter", "service");
  cafeCounter.position.set(61, 1.45, 50);
  visitorCentre.add(serviceEntrance);
  park.add(visitorCentre, infoDesk, cafeCounter);
  const serviceAccessPath = parkMesh(new THREE.BoxGeometry(48, 0.12, 5), paving, "city-park-service-access-path", "service");
  serviceAccessPath.position.set(30, 0.59, 60);
  serviceAccessPath.userData = { barrierFree: true, clearWidth: 5, connectsTo: "south-entrance-path" };
  park.add(serviceAccessPath);

  for (const [index, x] of [-27, -16].entries()) {
    const truck = buildLowPolyFoodTruck();
    truck.position.set(x, 0.64, 59);
    truck.rotation.y = -Math.PI * 0.5;
    truck.scale.setScalar(0.95);
    truck.userData.sourceCollection = "city-street-furniture";
    truck.userData.setServingOpen(true);
    reusedFoodTrucks.push(truck);
    park.add(truck);
  }

  // Benches follow the inner loop and retain clear path widths.
  let benchCount = 0;
  for (let index = 0; index < 24; index += 1) {
    benchCount += 1;
    const angle = index / 24 * Math.PI * 2;
    const x = Math.cos(angle) * 58;
    const z = Math.sin(angle) * 40;
    let surfaceY = 0.4;
    for (const [patchX, patchZ, width, depth] of meadowPatches) {
      if (Math.abs(x - patchX) <= width * 0.5 && Math.abs(z - patchZ) <= depth * 0.5) surfaceY = Math.max(surfaceY, 0.51);
    }
    for (const [pathX, pathZ, width, depth] of accessiblePathSpecs) {
      if (Math.abs(x - pathX) <= width * 0.5 && Math.abs(z - pathZ) <= depth * 0.5) surfaceY = Math.max(surfaceY, 0.65);
    }
    const bench = new THREE.Group();
    bench.name = "city-park-bench";
    bench.userData = { zone: "entrance", supportedByLegs: true, surfaceY };
    bench.position.set(x, 0, z);
    bench.rotation.y = -angle;
    const seat = parkMesh(new THREE.BoxGeometry(2.4, 0.18, 0.72), timber, "city-park-bench-seat", "entrance");
    seat.position.y = surfaceY + 0.43;
    const backrest = parkMesh(new THREE.BoxGeometry(2.4, 0.72, 0.14), timber, "city-park-bench-backrest", "entrance");
    backrest.position.set(0, surfaceY + 0.84, 0.29);
    bench.add(seat, backrest);
    for (const legX of [-0.78, 0.78]) {
      const leg = parkMesh(new THREE.BoxGeometry(0.18, 0.34, 0.52), dark, "city-park-bench-leg", "entrance");
      leg.position.set(legX, surfaceY + 0.17, 0);
      leg.userData = { ...leg.userData, groundContactY: surfaceY };
      bench.add(leg);
    }
    park.add(bench);
  }

  // Four open entrances are framed by a low guidance fence rather than a closed compound wall.
  let fenceSegmentCount = 0;
  const addFence = (x: number, z: number, length: number, horizontal: boolean) => {
    const segment = new THREE.Group();
    segment.name = "city-park-low-boundary-fence";
    segment.position.set(x, 0, z);
    segment.userData = { guidanceBoundary: true, heightMeters: 1.25 };
    fenceSegmentCount += 1;
    const count = Math.max(2, Math.floor(length / 2.5));
    for (let index = 0; index <= count; index += 1) {
      const offset = -length * 0.5 + index / count * length;
      const post = parkMesh(new THREE.BoxGeometry(0.12, 1.25, 0.12), dark, "city-park-fence-post");
      post.position.set(horizontal ? offset : 0, 1.15, horizontal ? 0 : offset);
      segment.add(post);
    }
    for (const y of [0.85, 1.45]) {
      const rail = parkMesh(new THREE.BoxGeometry(horizontal ? length : 0.1, 0.1, horizontal ? 0.1 : length), dark, "city-park-fence-rail");
      rail.position.y = y;
      segment.add(rail);
    }
    park.add(segment);
  };
  addFence(-51, 69, 82, true);
  addFence(51, 69, 82, true);
  addFence(-51, -69, 82, true);
  addFence(51, -69, 82, true);
  addFence(-92, 39, 60, false);
  addFence(-92, -39, 60, false);
  addFence(92, 39, 60, false);
  addFence(92, -39, 60, false);
  for (const [name, x, z, width, direction] of [
    ["south", 0, 69, 20, "-z"], ["north", 0, -69, 18, "+z"], ["west", -92, 0, 18, "+x"], ["east", 92, 0, 18, "-x"],
  ] as Array<[string, number, number, number, string]>) {
    const marker = new THREE.Group();
    marker.name = "city-park-open-entrance";
    marker.position.set(x, 0, z);
    marker.userData = { entranceName: name, clearWidth: width, alwaysOpen: true, inwardDirection: direction };
    park.add(marker);
  }

  // Reuse established street furniture and forest tree assets.
  const botanicalLightRelocations = new Map<number, [number, number]>([
    [16, [-81, -23]],
    [17, [-81, -38]],
    [18, [-81, -55]],
    [19, [-35, -58]],
  ]);
  for (let index = 0; index < 28; index += 1) {
    const angle = index / 28 * Math.PI * 2;
    const [lightX, lightZ] = botanicalLightRelocations.get(index) ?? [Math.cos(angle) * 82, Math.sin(angle) * 58];
    const radialAngle = Math.atan2(lightZ, lightX);
    const light = buildLowPolyParkStreetLight();
    light.position.set(lightX, 0.4, lightZ);
    light.rotation.y = Math.PI - radialAngle;
    light.scale.setScalar(0.9);
    light.userData.sourceCollection = "city-street-furniture";
    light.userData.anchoredToGround = true;
    light.userData.facesParkInterior = true;
    reusedStreetLights.push(light);
    park.add(light);
  }
  const planterPositions: Array<[number, number]> = [[-24, 65], [-14, 65], [14, 65], [24, 65], [38, 66], [50, 66], [62, 66], [72, 66], [-73, -29], [-60, -29], [-47, -29], [-34, -29]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.63, z);
    planter.scale.setScalar(0.95);
    planter.userData.sourceCollection = "city-street-furniture";
    park.add(planter);
  });

  const treePositions: Array<[number, number]> = [
    [-84, -60], [-68, -61], [-48, -62], [-28, -61], [27, -62], [47, -61], [68, -60], [84, -57],
    [-85, -43], [-79, -24], [-84, -5], [-83, 20], [-82, 43], [-75, 59],
    [84, -45], [83, -24], [85, 18], [84, 42], [75, 59],
    [-70, -48], [-44, -48], [-72, -15], [-54, -12], [-70, 5], [-40, 3], [-75, 34], [-42, 38],
    [72, -52], [44, -55], [76, -15], [48, -12], [79, 8], [42, 4], [75, 34], [38, 39],
    [-24, 47], [0, 43], [24, 47], [-22, -38], [0, -43], [22, -38], [-40, 27], [40, 27], [-38, -23], [38, -23],
    [-88, 57], [88, 57], [-88, -57], [88, -57],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "city-park-reused-tree-anchor";
    anchor.position.set(x, 0.55, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    park.add(anchor);
  });

  park.userData = {
    modelType: "city-park",
    generatedLocally: true,
    zones: ["entrance", "lake", "recreation", "garden", "amphitheatre", "service"],
    buildingCount: 4,
    entranceCount: 4,
    lakeCount: 1,
    bridgeCount: 1,
    walkingLoopLengthMeters: 344,
    cyclingLoopLengthMeters: 398,
    playgroundCount: 1,
    sportsCourtCount: 1,
    fitnessEquipmentCount,
    amphitheatreSeatRows: 6,
    greenhouseCount: 1,
    flowerBedCount,
    benchCount,
    fountainJetCount: waterJets.length,
    fenceSegmentCount,
    treeAnchorCount: treePositions.length,
    streetLightCount: reusedStreetLights.length,
    planterCount: planterPositions.length,
    foodTruckCount: reusedFoodTrucks.length,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-park-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-food-truck-lowpoly",
    ],
    siteSize: new THREE.Vector3(185, 12, 140),
    setPowered: (powered) => {
      glass.emissiveIntensity = powered ? 0.85 : 0.08;
      warmLight.emissiveIntensity = powered ? 2.3 : 0.14;
      water.emissiveIntensity = powered ? 0.48 : 0.14;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      reusedFoodTrucks.forEach((truck) => truck.userData.setLights(powered));
    },
    setWaterMotionEnabled: (enabled) => {
      waterMotionEnabled = enabled;
      waterJets.forEach((jet) => {
        jet.visible = true;
        jet.userData.motionPaused = !enabled;
      });
    },
    setServiceCutaway: (cutaway) => { serviceCutawayShell.forEach((object) => { object.visible = !cutaway; }); },
    update: (elapsedSeconds) => {
      if (!waterMotionEnabled) return;
      waterJets.forEach((jet) => {
        const pulse = 0.82 + Math.sin(elapsedSeconds * 2.4 + jet.userData.phase) * 0.18;
        jet.scale.y = pulse;
        jet.position.y = 0.92 + 1.8 * pulse;
      });
    },
  };
  park.userData.setPowered(false);
  park.userData.setWaterMotionEnabled(true);
  park.userData.setServiceCutaway(false);
  return park;
}
