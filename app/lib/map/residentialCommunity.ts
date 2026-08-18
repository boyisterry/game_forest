import * as THREE from "three";
import {
  buildLowPolyHighRiseResidential,
  buildLowPolyResidentialBuilding,
  buildLowPolyRoadsidePlanter,
  buildLowPolyStreetLight,
} from "./cityFurniture.ts";

export type ResidentialCommunityZone = "residential" | "commercial" | "kindergarten";

export type ResidentialCommunityModel = THREE.Group & {
  userData: {
    modelType: "residential-community";
    generatedLocally: true;
    zones: ResidentialCommunityZone[];
    residentialBuildingCount: number;
    highRiseCount: number;
    midRiseCount: number;
    householdCount: number;
    commercialBuildingCount: number;
    storefrontCount: number;
    kindergartenBuildingCount: number;
    kindergartenClassroomCount: number;
    kindergartenCapacity: number;
    garageEntranceCount: number;
    fenceSegmentCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    setAccessGatesOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    update: (deltaSeconds: number) => void;
  };
};

function communityMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: ResidentialCommunityZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  const isFlatSurface = /(base|road|path|marking|line|floor-slab|playground|layby|parking-bay|clear-zone|landing|water-feature)/.test(name);
  const isTransparentSurface = material.transparent || /(glass|window|door|lift|cabin|water)/.test(name);
  object.castShadow = !isFlatSurface && !isTransparentSurface;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

export function buildLowPolyResidentialCommunity(): ResidentialCommunityModel {
  const community = new THREE.Group() as ResidentialCommunityModel;
  community.name = "city-residential-community-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const accessGatePanels: THREE.Mesh[] = [];

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc8c2b7, roughness: 0.94 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xdfd7c7, roughness: 0.9 });
  const warmPaving = new THREE.MeshStandardMaterial({ color: 0xd7b784, roughness: 0.86 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4c5355, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x789b6c, roughness: 0.98 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x314248, roughness: 0.62, metalness: 0.28 });
  const brick = new THREE.MeshStandardMaterial({ color: 0xb75e49, roughness: 0.82 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf0e7d2, roughness: 0.82 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9c7049, roughness: 0.86 });
  const timberDark = new THREE.MeshStandardMaterial({ color: 0x65452f, roughness: 0.88 });
  const safetyBlue = new THREE.MeshStandardMaterial({ color: 0x2f718d, roughness: 0.7, metalness: 0.08 });
  const safetyYellow = new THREE.MeshStandardMaterial({ color: 0xf2c84f, roughness: 0.72 });
  const whiteLine = new THREE.MeshStandardMaterial({ color: 0xf5f0df, roughness: 0.88 });
  const interiorFloor = new THREE.MeshStandardMaterial({ color: 0xd9cab2, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x72abb5, emissive: 0x285763, emissiveIntensity: 0.1, roughness: 0.2, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide });
  const vehicleGlass = new THREE.MeshStandardMaterial({ color: 0x355d68, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.78, depthWrite: false });
  const warmGlass = new THREE.MeshStandardMaterial({ color: 0xe9bc79, emissive: 0xffa94f, emissiveIntensity: 0.12, roughness: 0.3 });
  const playBlue = new THREE.MeshStandardMaterial({ color: 0x4d94aa, roughness: 0.76 });
  const playYellow = new THREE.MeshStandardMaterial({ color: 0xe6b748, roughness: 0.76 });
  const playRed = new THREE.MeshStandardMaterial({ color: 0xd96855, roughness: 0.76 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x77a989, roughness: 0.92 });
  const water = new THREE.MeshStandardMaterial({ color: 0x55a8b8, emissive: 0x174b57, emissiveIntensity: 0.12, roughness: 0.2, transparent: true, opacity: 0.78 });

  const site = communityMesh(new THREE.BoxGeometry(190, 0.38, 145), concrete, "residential-community-site-base");
  site.position.y = 0.19;
  community.add(site);
  const landscape = communityMesh(new THREE.BoxGeometry(181, 0.12, 133), grass, "residential-community-landscape-base");
  landscape.position.y = 0.44;
  community.add(landscape);

  // Public road and arrival sidewalk run along the open commercial frontage.
  const publicRoad = communityMesh(new THREE.BoxGeometry(181, 0.12, 6.2), asphalt, "residential-community-public-road", "commercial");
  publicRoad.position.set(0, 0.52, 68.7);
  const publicWalk = communityMesh(new THREE.BoxGeometry(181, 0.13, 3), paving, "residential-community-public-sidewalk", "commercial");
  publicWalk.position.set(0, 0.59, 61);
  community.add(publicRoad, publicWalk);
  for (let x = -84; x <= 84; x += 12) {
    const roadMark = communityMesh(new THREE.BoxGeometry(5, 0.025, 0.12), cream, "residential-community-road-centre-marking", "commercial");
    roadMark.position.set(x, 0.59, 68.7);
    community.add(roadMark);
  }

  // A fire-service loop separates housing from the public commercial street.
  for (const [x, z, width, depth] of [
    [-40, 31, 96, 6], [-86, -17, 6, 102], [7, -17, 6, 102], [-40, -65, 96, 6],
  ] as Array<[number, number, number, number]>) {
    const road = communityMesh(new THREE.BoxGeometry(width, 0.13, depth), asphalt, "residential-community-fire-lane", "residential");
    road.position.set(x, 0.54, z);
    community.add(road);
  }
  // The internal pedestrian network runs through the clear gaps between buildings.
  // It deliberately avoids the former north/south alignments that cut through six homes.
  for (const [x, z, width, depth, role] of [
    [-57.5, -17, 3.2, 86.6, "residential-main-spine"],
    [-28, -33.5, 3.2, 53, "residential-secondary-spine"],
    [-57.5, -40.5, 45, 3.2, "high-rise-south-entry-walk"],
    [-57.5, -5.5, 45, 3.2, "high-rise-north-entry-walk"],
    [-16, -43.7, 27, 3, "mid-rise-south-entry-walk"],
    [-16, -21.7, 27, 3, "mid-rise-middle-entry-walk"],
    [-42, 24.8, 75, 3, "residential-north-promenade"],
    [-43, 29.4, 5, 11, "residential-gate-walk"],
  ] as Array<[number, number, number, number, string]>) {
    const path = communityMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "residential-community-pedestrian-path");
    path.position.set(x, 0.61, z);
    Object.assign(path.userData, { role, barrierFree: true, clearWidth: Math.min(width, depth) });
    community.add(path);
  }

  // A real, continuous arrival route passes through the commercial arcade to the public road.
  const mainArrivalLane = communityMesh(new THREE.BoxGeometry(7, 0.14, 34), asphalt, "residential-community-main-arrival-lane", "residential");
  mainArrivalLane.position.set(-43, 0.535, 50.5);
  Object.assign(mainArrivalLane.userData, { connectsFireLaneToPublicRoad: true, clearWidth: 7, controlledAtGate: true });
  community.add(mainArrivalLane);
  for (const x of [-48.1, -37.9]) {
    const arrivalWalk = communityMesh(new THREE.BoxGeometry(2.2, 0.12, 29), paving, "residential-community-main-arrival-walk", "residential");
    arrivalWalk.position.set(x, 0.61, 49.5);
    Object.assign(arrivalWalk.userData, { barrierFree: true, clearWidth: 2.2, protectedFromVehicles: true });
    community.add(arrivalWalk);
  }
  for (let index = 0; index < 6; index += 1) {
    const crossing = communityMesh(new THREE.BoxGeometry(6.4, 0.025, 0.36), whiteLine, "residential-community-main-arrival-crossing", "commercial");
    crossing.position.set(-43, 0.672, 60 + index * 0.48);
    community.add(crossing);
  }
  for (const z of [59.55, 62.85]) {
    const crossingRamp = communityMesh(new THREE.BoxGeometry(7, 0.12, 0.9), paving, "residential-community-main-arrival-raised-crossing-ramp", "commercial");
    crossingRamp.position.set(-43, 0.605, z);
    crossingRamp.rotation.x = z < 61 ? -0.07 : 0.07;
    Object.assign(crossingRamp.userData, { gentleTransition: true, maximumUpstand: 0.02 });
    community.add(crossingRamp);
  }

  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x40545a, roughness: 0.56, metalness: 0.36 });
  let fenceSegmentCount = 0;
  const addFenceSegment = (name: string, x: number, z: number, length: number, horizontal: boolean, zone: ResidentialCommunityZone) => {
    const segment = new THREE.Group();
    segment.name = name;
    segment.position.set(x, 0, z);
    segment.userData = { zone, protectedBoundary: true };
    fenceSegmentCount += 1;
    const base = communityMesh(new THREE.BoxGeometry(horizontal ? length : 0.42, 0.45, horizontal ? 0.42 : length), concrete, `${name}-masonry-base`, zone);
    base.position.y = 0.72;
    segment.add(base);
    const postCount = Math.max(2, Math.floor(length / (zone === "kindergarten" ? 0.82 : 2)));
    for (let index = 0; index <= postCount; index += 1) {
      const offset = -length * 0.5 + index / postCount * length;
      const post = communityMesh(new THREE.BoxGeometry(0.13, 1.8, 0.13), fenceMaterial, `${name}-post`, zone);
      post.position.set(horizontal ? offset : 0, 1.78, horizontal ? 0 : offset);
      post.userData = zone === "kindergarten" ? { antiClimbPicket: true, maximumClearGap: 0.82 } : {};
      segment.add(post);
    }
    for (const railY of [1.28, 2.18]) {
      const rail = communityMesh(new THREE.BoxGeometry(horizontal ? length : 0.1, 0.1, horizontal ? 0.1 : length), fenceMaterial, `${name}-horizontal-rail`, zone);
      rail.position.y = railY;
      segment.add(rail);
    }
    community.add(segment);
  };

  // Residential compound: one controlled opening on its southern edge.
  addFenceSegment("residential-community-residential-fence", -40, -69, 102, true, "residential");
  addFenceSegment("residential-community-residential-fence", -91, -17, 104, false, "residential");
  addFenceSegment("residential-community-residential-fence", 11, -17, 104, false, "residential");
  addFenceSegment("residential-community-residential-fence", -70, 35, 42, true, "residential");
  addFenceSegment("residential-community-residential-fence", -13, 35, 48, true, "residential");

  const residentialGate = new THREE.Group();
  residentialGate.name = "residential-community-main-gate";
  residentialGate.position.set(-43, 0, 35);
  residentialGate.userData = { clearWidth: 12, controlledAccess: true, frontDirection: "+z" };
  for (const x of [-6.6, 6.6]) {
    const pier = communityMesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), brick, "residential-community-gate-pier", "residential");
    pier.position.set(x, 2.2, 0);
    residentialGate.add(pier);
  }
  const gateBeam = communityMesh(new THREE.BoxGeometry(16, 0.65, 1.1), dark, "residential-community-gate-sign", "residential");
  gateBeam.position.y = 4.15;
  residentialGate.add(gateBeam);
  for (const side of [-1, 1]) {
    const panel = communityMesh(new THREE.BoxGeometry(5.9, 2.1, 0.14), fenceMaterial, "residential-community-main-gate-panel", "residential");
    panel.position.set(side * 3, 1.75, 0);
    Object.assign(panel.userData, { side, closedX: side * 3, openX: side * 9.4, open: false });
    accessGatePanels.push(panel);
    residentialGate.add(panel);
  }
  community.add(residentialGate);

  // Eight residential buildings create a mixed high-rise and mid-rise community.
  const residentialModels: THREE.Group[] = [];
  let householdCount = 0;
  for (const [index, x, z] of [
    [0, -72, -48], [1, -43, -48], [2, -72, -13], [3, -43, -13],
  ] as Array<[number, number, number]>) {
    const tower = buildLowPolyHighRiseResidential();
    tower.name = `residential-community-high-rise-${index + 1}`;
    tower.position.set(x, 0.5, z);
    tower.scale.set(1.25, 1.7, 1.25);
    tower.rotation.y = 0;
    tower.userData.zone = "residential";
    tower.userData.frontDirection = "+z";
    tower.userData.setElevatorAuto(true);
    householdCount += tower.userData.apartmentCount;
    residentialModels.push(tower);
    community.add(tower);
  }
  for (const [index, x, z] of [
    [0, -13, -50], [1, -13, -28], [2, -68, 16], [3, -19, 15],
  ] as Array<[number, number, number]>) {
    const building = buildLowPolyResidentialBuilding();
    building.name = `residential-community-mid-rise-${index + 1}`;
    building.position.set(x, 0.5, z);
    building.scale.set(1.35, 1.85, 1.35);
    building.userData.zone = "residential";
    building.userData.frontDirection = "+z";
    householdCount += building.userData.apartmentCount;
    residentialModels.push(building);
    community.add(building);
  }

  const addResidentialAccessibleEntry = (
    buildingName: string,
    x: number,
    doorZ: number,
    thresholdY: number,
    rampDirection: -1 | 1,
    rampZ: number,
  ) => {
    const entry = new THREE.Group();
    entry.name = "residential-community-building-access";
    entry.userData = { buildingName, barrierFree: true, maximumGradient: "1:12", frontDirection: "+z" };
    const landing = communityMesh(new THREE.BoxGeometry(4, 0.16, 1.35), paving, "residential-community-building-entry-landing", "residential");
    landing.position.set(x, thresholdY - 0.08, doorZ + 0.68);
    Object.assign(landing.userData, { thresholdY, levelWithDoor: true });
    entry.add(landing);
    for (const supportX of [-1.65, 1.65]) {
      const supportHeight = thresholdY - 0.5 - 0.16;
      const support = communityMesh(new THREE.BoxGeometry(0.2, supportHeight, 0.2), concrete, "residential-community-building-entry-support", "residential");
      support.position.set(x + supportX, 0.5 + supportHeight * 0.5, doorZ + 0.7);
      Object.assign(support.userData, { groundContactY: 0.5, grounded: true });
      entry.add(support);
    }
    const rise = thresholdY - 0.67;
    const rampLength = rise * 12;
    const rampAngle = Math.atan2(rise, rampLength);
    const ramp = communityMesh(new THREE.BoxGeometry(rampLength, 0.13, 1.45), warmPaving, "residential-community-building-access-ramp", "residential");
    ramp.position.set(x + rampDirection * (2 + rampLength * 0.5), (thresholdY + 0.67) * 0.5 - 0.045, rampZ);
    ramp.rotation.z = -rampDirection * rampAngle;
    Object.assign(ramp.userData, { maximumGradient: "1:12", rise, run: rampLength, connectsDoorToPath: true });
    entry.add(ramp);
    for (const side of [-1, 1]) {
      const handrail = communityMesh(new THREE.BoxGeometry(rampLength, 0.1, 0.1), safetyBlue, "residential-community-building-access-ramp-handrail", "residential");
      handrail.position.set(ramp.position.x, ramp.position.y + 0.92, rampZ + side * 0.68);
      handrail.rotation.z = ramp.rotation.z;
      entry.add(handrail);
      for (const localX of [-rampLength * 0.44, 0, rampLength * 0.44]) {
        const worldX = ramp.position.x + localX;
        const railY = ramp.position.y + 0.48 + Math.sin(ramp.rotation.z) * localX;
        const post = communityMesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), safetyBlue, "residential-community-building-access-ramp-post", "residential");
        post.position.set(worldX, railY, rampZ + side * 0.68);
        entry.add(post);
      }
    }
    const stepCount = Math.max(3, Math.ceil(rise / 0.17));
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      const topY = 0.67 + rise * (stepIndex + 1) / stepCount;
      const step = communityMesh(new THREE.BoxGeometry(1.7, topY - 0.5, 0.42), concrete, "residential-community-building-entry-step", "residential");
      step.position.set(x, 0.5 + (topY - 0.5) * 0.5, doorZ + 1.55 + stepIndex * 0.38);
      entry.add(step);
    }
    community.add(entry);
  };

  addResidentialAccessibleEntry("residential-community-high-rise-1", -72, -42.7, 1.18, 1, -40.7);
  addResidentialAccessibleEntry("residential-community-high-rise-2", -43, -42.7, 1.18, -1, -40.7);
  addResidentialAccessibleEntry("residential-community-high-rise-3", -72, -7.7, 1.18, 1, -5.7);
  addResidentialAccessibleEntry("residential-community-high-rise-4", -43, -7.7, 1.18, -1, -5.7);
  addResidentialAccessibleEntry("residential-community-mid-rise-1", -13, -46.7, 1.46, -1, -44.7);
  addResidentialAccessibleEntry("residential-community-mid-rise-2", -13, -24.7, 1.46, -1, -22.7);
  addResidentialAccessibleEntry("residential-community-mid-rise-3", -68, 19.3, 1.46, 1, 21.3);
  addResidentialAccessibleEntry("residential-community-mid-rise-4", -19, 18.3, 1.46, 1, 20.3);

  for (const [buildingName, x, z, depth] of [
    ["residential-community-mid-rise-3", -57.2, 22.65, 1.6],
    ["residential-community-mid-rise-4", -8.5, 22.15, 2.5],
  ] as Array<[string, number, number, number]>) {
    const accessLink = communityMesh(new THREE.BoxGeometry(3.2, 0.12, depth), paving, "residential-community-mid-rise-access-link", "residential");
    accessLink.position.set(x, 0.61, z);
    Object.assign(accessLink.userData, { buildingName, barrierFree: true, connectsAccessToPromenade: true, clearWidth: 3.2 });
    community.add(accessLink);
  }
  const midRiseFourEntryLink = communityMesh(new THREE.BoxGeometry(1.6, 0.12, 2.5), paving, "residential-community-building-access-link", "residential");
  midRiseFourEntryLink.position.set(-7.52, 0.61, 22.15);
  Object.assign(midRiseFourEntryLink.userData, { buildingName: "residential-community-mid-rise-4", barrierFree: true, connectsRampToNorthPromenade: true });
  community.add(midRiseFourEntryLink);

  // Central garden: a bounded reflecting pool and six supported seats face the water.
  const garden = new THREE.Group();
  garden.name = "residential-community-central-garden";
  garden.position.set(-42, 0, 11);
  garden.userData = { zone: "residential", barrierFree: true, seatingCount: 6 };
  const gardenDeck = communityMesh(new THREE.CylinderGeometry(12, 12, 0.16, 32), warmPaving, "residential-community-garden-plaza", "residential");
  gardenDeck.position.y = 0.64;
  const pondBase = communityMesh(new THREE.CylinderGeometry(4.65, 4.65, 0.34, 32), concrete, "residential-community-water-feature-basin", "residential");
  pondBase.position.y = 0.67;
  const pond = communityMesh(new THREE.CylinderGeometry(4.12, 4.12, 0.08, 32), water, "residential-community-water-feature", "residential");
  pond.position.y = 0.86;
  const pondRim = communityMesh(new THREE.TorusGeometry(4.38, 0.2, 8, 32), cream, "residential-community-water-feature-rim", "residential");
  pondRim.rotation.x = Math.PI * 0.5;
  pondRim.position.y = 0.88;
  garden.add(gardenDeck, pondBase, pond, pondRim);
  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    const bench = new THREE.Group();
    bench.name = "residential-community-garden-bench";
    bench.position.set(Math.cos(angle) * 8.3, 0, Math.sin(angle) * 8.3);
    bench.rotation.y = Math.PI * 0.5 - angle;
    bench.userData = { supportedByLegs: true, facesWaterFeature: true, seatHeight: 0.45 };
    const seat = communityMesh(new THREE.BoxGeometry(2.35, 0.14, 0.64), timber, "residential-community-garden-bench-seat", "residential");
    seat.position.y = 1.1;
    const back = communityMesh(new THREE.BoxGeometry(2.35, 0.72, 0.14), timber, "residential-community-garden-bench-backrest", "residential");
    back.position.set(0, 1.46, 0.27);
    bench.add(seat, back);
    for (const x of [-0.82, 0.82]) {
      const leg = communityMesh(new THREE.BoxGeometry(0.18, 0.38, 0.52), timberDark, "residential-community-garden-bench-leg", "residential");
      leg.position.set(x, 0.91, 0);
      Object.assign(leg.userData, { groundContactY: 0.72, grounded: true });
      bench.add(leg);
    }
    garden.add(bench);
  }
  community.add(garden);

  // A complete, ground-supported play set replaces the floating tower and reversed slide.
  const childrenArea = communityMesh(new THREE.BoxGeometry(21, 0.14, 16), rubber, "residential-community-children-playground", "residential");
  childrenArea.position.set(-18, 0.64, 2);
  Object.assign(childrenArea.userData, { impactSurface: true, inclusivePlay: true, clearSafetyMargin: 1.5 });
  community.add(childrenArea);
  const playStructure = new THREE.Group();
  playStructure.name = "residential-community-play-structure";
  playStructure.position.set(-21, 0, 0.5);
  playStructure.userData = { supported: true, ageRange: "3-8", barrierFreeTransfer: true };
  const playDeck = communityMesh(new THREE.BoxGeometry(3.1, 0.24, 3), playYellow, "residential-community-play-platform", "residential");
  playDeck.position.y = 2.28;
  playStructure.add(playDeck);
  for (const x of [-1.25, 1.25]) {
    for (const z of [-1.2, 1.2]) {
      const post = communityMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 8), safetyBlue, "residential-community-play-platform-post", "residential");
      post.position.set(x, 1.46, z);
      Object.assign(post.userData, { groundContactY: 0.71, grounded: true });
      playStructure.add(post);
    }
  }
  for (const [x, z, width, depth] of [[0, -1.4, 3.05, 0.12], [-1.46, 0, 0.12, 2.6], [1.46, 0, 0.12, 2.6]] as Array<[number, number, number, number]>) {
    const rail = communityMesh(new THREE.BoxGeometry(width, 0.72, depth), safetyBlue, "residential-community-play-guardrail", "residential");
    rail.position.set(x, 2.72, z);
    playStructure.add(rail);
  }
  const playRoof = communityMesh(new THREE.ConeGeometry(2.35, 1.2, 4), playRed, "residential-community-play-roof", "residential");
  playRoof.rotation.y = Math.PI * 0.25;
  playRoof.position.y = 4;
  playStructure.add(playRoof);
  for (let step = 0; step < 5; step += 1) {
    const topY = 0.71 + (step + 1) / 5 * (2.16 - 0.71);
    const height = topY - 0.71;
    const stair = communityMesh(new THREE.BoxGeometry(1.35, height, 0.54), playBlue, "residential-community-play-stair", "residential");
    stair.position.set(0, 0.71 + height * 0.5, -3.75 + step * 0.5);
    Object.assign(stair.userData, { groundContactY: 0.71, grounded: true, stepIndex: step + 1 });
    playStructure.add(stair);
  }
  const slideSlope = Math.atan2(1.5, 4.3);
  const slide = communityMesh(new THREE.BoxGeometry(1.25, 0.16, 4.55), playRed, "residential-community-play-slide", "residential");
  slide.position.set(0, 1.53, 3.1);
  slide.rotation.x = slideSlope;
  Object.assign(slide.userData, { supportedAtPlatform: true, correctDownhillDirection: "+z", landingClearance: 1.5 });
  playStructure.add(slide);
  for (const x of [-0.66, 0.66]) {
    const sideRail = communityMesh(new THREE.BoxGeometry(0.12, 0.32, 4.55), safetyYellow, "residential-community-play-slide-side-rail", "residential");
    sideRail.position.set(x, 1.69, 3.1);
    sideRail.rotation.x = slideSlope;
    playStructure.add(sideRail);
  }
  const slideLanding = communityMesh(new THREE.BoxGeometry(2.2, 0.08, 1.8), playYellow, "residential-community-play-slide-landing", "residential");
  slideLanding.position.set(0, 0.76, 5.8);
  playStructure.add(slideLanding);
  community.add(playStructure);

  const climbing = new THREE.Group();
  climbing.name = "residential-community-climbing-frame";
  climbing.position.set(-13.2, 0, 0.5);
  climbing.userData = { groundSupported: true };
  const climbingArch = communityMesh(new THREE.TorusGeometry(2, 0.14, 6, 20, Math.PI), playBlue, "residential-community-climbing-frame-arch", "residential");
  climbingArch.position.y = 0.72;
  climbing.add(climbingArch);
  for (const x of [-2, -0.7, 0.7, 2]) {
    const support = communityMesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 8), safetyBlue, "residential-community-climbing-frame-support", "residential");
    support.position.set(x, 1.61, 0);
    Object.assign(support.userData, { groundContactY: 0.71, grounded: true });
    climbing.add(support);
  }
  community.add(climbing);

  const swing = new THREE.Group();
  swing.name = "residential-community-play-swing";
  swing.position.set(-12.1, 0, 4.8);
  swing.userData = { groundSupported: true, seatCount: 2 };
  for (const x of [-1.7, 1.7]) {
    for (const z of [-0.7, 0.7]) {
      const leg = communityMesh(new THREE.CylinderGeometry(0.08, 0.12, 2.8, 8), safetyBlue, "residential-community-play-swing-leg", "residential");
      leg.position.set(x, 1.95, z);
      leg.rotation.z = x < 0 ? -0.18 : 0.18;
      swing.add(leg);
    }
  }
  const swingBeam = communityMesh(new THREE.BoxGeometry(4, 0.18, 0.18), safetyBlue, "residential-community-play-swing-beam", "residential");
  swingBeam.position.y = 3.28;
  swing.add(swingBeam);
  for (const x of [-0.9, 0.9]) {
    for (const chainX of [-0.24, 0.24]) {
      const chain = communityMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6), dark, "residential-community-play-swing-chain", "residential");
      chain.position.set(x + chainX, 2.48, 0);
      swing.add(chain);
    }
    const seat = communityMesh(new THREE.BoxGeometry(0.9, 0.12, 0.45), playYellow, "residential-community-play-swing-seat", "residential");
    seat.position.set(x, 1.75, 0);
    swing.add(seat);
  }
  community.add(swing);

  for (const [x, z, color] of [[-25.9, 4.8, playYellow], [-15.5, -2.2, playRed]] as Array<[number, number, THREE.Material]>) {
    const horse = new THREE.Group();
    horse.name = "residential-community-play-rocking-horse";
    horse.position.set(x, 0, z);
    const rocker = communityMesh(new THREE.TorusGeometry(0.9, 0.1, 6, 16, Math.PI), safetyBlue, "residential-community-rocking-horse-rocker", "residential");
    rocker.rotation.z = Math.PI;
    rocker.position.y = 1.71;
    const body = communityMesh(new THREE.CapsuleGeometry(0.38, 0.8, 4, 8), color, "residential-community-rocking-horse-body", "residential");
    body.rotation.z = Math.PI * 0.5;
    body.position.y = 2.08;
    const handle = communityMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark, "residential-community-rocking-horse-handle", "residential");
    handle.rotation.z = Math.PI * 0.5;
    handle.position.set(0.3, 2.4, 0);
    horse.add(rocker, body, handle);
    community.add(horse);
  }

  // The all-age fitness pocket is clear of both homes and the fire lane.
  const fitnessArea = communityMesh(new THREE.BoxGeometry(15, 0.14, 8), warmPaving, "residential-community-senior-fitness-area", "residential");
  fitnessArea.position.set(-75, 0.64, 4);
  Object.assign(fitnessArea.userData, { barrierFree: true, clearCirculationWidth: 1.8, wheelchairRestingSpace: true });
  community.add(fitnessArea);
  const fitnessAccessPath = communityMesh(new THREE.BoxGeometry(3, 0.12, 4.2), paving, "residential-community-fitness-access-path", "residential");
  fitnessAccessPath.position.set(-70, 0.61, -1.95);
  Object.assign(fitnessAccessPath.userData, { barrierFree: true, connectsFitnessToPedestrianNetwork: true, clearWidth: 3 });
  community.add(fitnessAccessPath);
  for (const [index, x, kind] of [[0, -79.5, "tai-chi-wheel"], [1, -75, "stepper"], [2, -70.5, "arm-cycle"]] as Array<[number, number, string]>) {
    const equipment = new THREE.Group();
    equipment.name = "residential-community-fitness-equipment";
    equipment.position.set(x, 0, 4);
    equipment.userData = { equipmentIndex: index + 1, equipmentType: kind, grounded: true };
    const base = communityMesh(new THREE.CylinderGeometry(0.52, 0.62, 0.18, 10), dark, "residential-community-fitness-equipment-base", "residential");
    base.position.y = 0.8;
    Object.assign(base.userData, { groundContactY: 0.71, grounded: true });
    const post = communityMesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 8), safetyBlue, "residential-community-fitness-equipment-post", "residential");
    post.position.y = 1.72;
    const handle = communityMesh(new THREE.TorusGeometry(0.55, 0.08, 6, 16), playYellow, "residential-community-fitness-equipment-handle", "residential");
    handle.position.y = 2.25;
    const pedal = communityMesh(new THREE.BoxGeometry(1.3, 0.12, 0.34), timberDark, "residential-community-fitness-equipment-pedal", "residential");
    pedal.position.y = 1.02;
    equipment.add(base, post, handle, pedal);
    community.add(equipment);
  }

  const parcelStation = communityMesh(new THREE.BoxGeometry(12, 3.2, 4), brick, "residential-community-parcel-station", "residential");
  parcelStation.position.set(-3, 2.1, 17);
  Object.assign(parcelStation.userData, { outsideFireLane: true, frontDirection: "+z" });
  const parcelDoors = communityMesh(new THREE.BoxGeometry(10.8, 2.25, 0.12), warmGlass, "residential-community-parcel-lockers", "residential");
  parcelDoors.position.set(-3, 2.05, 19.05);
  const parcelCanopy = communityMesh(new THREE.BoxGeometry(12.6, 0.18, 1.5), dark, "residential-community-parcel-canopy", "residential");
  parcelCanopy.position.set(-3, 3.82, 19.6);
  const wasteServicePad = communityMesh(new THREE.BoxGeometry(10, 0.12, 7), paving, "residential-community-waste-service-pad", "residential");
  wasteServicePad.position.set(-17, 0.61, -58);
  Object.assign(wasteServicePad.userData, { collectionAccessFromFireLane: true, grounded: true });
  const wasteStation = communityMesh(new THREE.BoxGeometry(7, 2.6, 4), dark, "residential-community-waste-sorting-station", "residential");
  wasteStation.position.set(-17, 1.8, -58);
  Object.assign(wasteStation.userData, {
    outsideFireLane: true,
    ventilated: true,
    screened: true,
    sanitationBufferFromPlayground: 48,
  });
  for (const x of [-19.2, -17, -14.8]) {
    const wasteDoor = communityMesh(new THREE.BoxGeometry(1.65, 1.8, 0.12), x === -17 ? playBlue : playYellow, "residential-community-waste-sorting-door", "residential");
    wasteDoor.position.set(x, 1.68, -55.95);
    community.add(wasteDoor);
  }
  community.add(parcelStation, parcelDoors, parcelCanopy, wasteServicePad, wasteStation);

  // Two side-entry garage ramps descend from the west fire lane, with real portals,
  // sloped curbs, guardrails and drainage instead of floating horizontal walls.
  for (const [index, z] of [-36, -25].entries()) {
    const garage = new THREE.Group();
    garage.name = "residential-community-garage-entrance";
    garage.position.set(-77, 0, z);
    garage.userData = { garageIndex: index + 1, entersFrom: "west-fire-lane", clearWidth: 7.5 };
    const slope = 0.165;
    const ramp = communityMesh(new THREE.BoxGeometry(12, 0.25, 7.5), asphalt, "residential-community-underground-garage-ramp", "residential");
    ramp.position.y = -0.5;
    ramp.rotation.z = -slope;
    Object.assign(ramp.userData, { garageIndex: index + 1, vehicleAccess: true, downDirection: "+x", maximumGradient: "1:6" });
    garage.add(ramp);
    for (const side of [-1, 1]) {
      const curb = communityMesh(new THREE.BoxGeometry(12, 0.58, 0.25), concrete, "residential-community-garage-ramp-curb", "residential");
      curb.position.set(0, -0.18, side * 3.62);
      curb.rotation.z = -slope;
      Object.assign(curb.userData, { followsRampSlope: true });
      const guardrail = communityMesh(new THREE.BoxGeometry(12, 0.12, 0.12), safetyBlue, "residential-community-garage-ramp-guardrail", "residential");
      guardrail.position.set(0, 0.72, side * 3.62);
      guardrail.rotation.z = -slope;
      Object.assign(guardrail.userData, { followsRampSlope: true });
      garage.add(curb, guardrail);
      for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
        const post = communityMesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), safetyBlue, "residential-community-garage-ramp-guardrail-post", "residential");
        post.position.set(x, 0.15 - Math.sin(slope) * x, side * 3.62);
        garage.add(post);
      }
    }
    const portal = new THREE.Group();
    portal.name = "residential-community-garage-ramp-portal";
    portal.position.set(-5.7, 0, 0);
    portal.userData = {
      clearHeight: 2.6,
      clearWidth: 7.5,
      supported: true,
      locatedAtHighEnd: true,
      connectsFireLane: true,
    };
    for (const side of [-1, 1]) {
      const pier = communityMesh(new THREE.BoxGeometry(0.45, 3.2, 0.4), concrete, "residential-community-garage-portal-pier", "residential");
      pier.position.set(0, 2.1, side * 3.95);
      portal.add(pier);
    }
    const header = communityMesh(new THREE.BoxGeometry(0.55, 0.5, 8.3), concrete, "residential-community-garage-portal-header", "residential");
    header.position.set(0, 3.45, 0);
    portal.add(header);
    garage.add(portal);
    const drain = communityMesh(new THREE.BoxGeometry(0.4, 0.08, 7), dark, "residential-community-garage-ramp-drain", "residential");
    drain.position.set(-5.5, 0.53, 0);
    Object.assign(drain.userData, { transverseDrain: true });
    garage.add(drain);
    community.add(garage);
  }

  // Open neighbourhood retail: fourteen genuinely enterable stores flank a 13 m
  // ground-floor arcade, while the second floor bridges across the community gate.
  const commercial = new THREE.Group();
  commercial.name = "residential-community-commercial-street";
  commercial.position.set(0, 0, 49.5);
  commercial.userData = { zone: "commercial", openToPublicStreet: true, frontDirection: "+z", arcadeClearWidth: 13, directlyConnectsMainGate: true };
  const commercialCore = new THREE.Group();
  commercialCore.name = "residential-community-commercial-building";
  commercialCore.userData = { shellType: "two-wing-arcade", enterableAtGroundFloor: true };
  const arcadeMinX = -49.5;
  const arcadeMaxX = -36.5;
  const wingRanges = [[-74, arcadeMinX], [arcadeMaxX, 74]] as Array<[number, number]>;
  wingRanges.forEach(([minX, maxX], wingIndex) => {
    const width = maxX - minX;
    const centreX = (minX + maxX) * 0.5;
    const rearWall = communityMesh(new THREE.BoxGeometry(width, 7.55, 0.42), cream, "residential-community-commercial-shell-wall", "commercial");
    rearWall.position.set(centreX, 4.34, -9.28);
    const roof = communityMesh(new THREE.BoxGeometry(width + 0.5, 0.32, 19.8), dark, "residential-community-commercial-roof", "commercial");
    roof.position.set(centreX, 8.3, 0);
    const upperFront = communityMesh(new THREE.BoxGeometry(width, 3.65, 0.36), cream, "residential-community-commercial-upper-facade", "commercial");
    upperFront.position.set(centreX, 6.22, 9.3);
    commercialCore.add(rearWall, roof, upperFront);
    if (wingIndex === 0) {
      const endWall = communityMesh(new THREE.BoxGeometry(0.42, 7.55, 18.5), cream, "residential-community-commercial-shell-wall", "commercial");
      endWall.position.set(minX, 4.34, 0);
      commercialCore.add(endWall);
    } else {
      const endWall = communityMesh(new THREE.BoxGeometry(0.42, 7.55, 18.5), cream, "residential-community-commercial-shell-wall", "commercial");
      endWall.position.set(maxX, 4.34, 0);
      commercialCore.add(endWall);
    }
  });
  for (const x of [arcadeMinX, arcadeMaxX]) {
    const arcadeWall = communityMesh(new THREE.BoxGeometry(0.36, 4.0, 18.5), cream, "residential-community-commercial-arcade-side-wall", "commercial");
    arcadeWall.position.set(x, 2.56, 0);
    commercialCore.add(arcadeWall);
  }
  const upperBridge = communityMesh(new THREE.BoxGeometry(13, 3.7, 18.5), cream, "residential-community-commercial-arcade-upper-bridge", "commercial");
  upperBridge.position.set(-43, 6.25, 0);
  Object.assign(upperBridge.userData, { minimumClearanceBelow: 4.3, spansMainArrival: true });
  commercialCore.add(upperBridge);
  commercial.add(commercialCore);
  cutawayShell.push(commercialCore);
  for (const [minX, maxX] of wingRanges) {
    const width = maxX - minX;
    const centreX = (minX + maxX) * 0.5;
    const groundSlab = communityMesh(new THREE.BoxGeometry(width - 0.15, 0.18, 18.5), concrete, "residential-community-commercial-floor-slab", "commercial");
    groundSlab.position.set(centreX, 0.59, 0);
    commercial.add(groundSlab);
  }
  // Keep the upper floor as one logical slab for cutaway/inspection, but build it
  // from pieces so both protected stairs rise through real openings.
  const upperFloorSlab = new THREE.Group();
  upperFloorSlab.name = "residential-community-commercial-floor-slab";
  upperFloorSlab.userData = { zone: "commercial", floor: 2, stairOpeningCount: 2, stairOpenings: true };
  for (const [x, z, width, depth] of [
    [0, -8.875, 147.5, 0.75],
    [0, 3.525, 147.5, 11.45],
    [-71.525, -5.35, 4.45, 6.3],
    [0, -5.35, 133.4, 6.3],
    [71.525, -5.35, 4.45, 6.3],
  ] as Array<[number, number, number, number]>) {
    const slabPiece = communityMesh(
      new THREE.BoxGeometry(width, 0.18, depth),
      concrete,
      "residential-community-commercial-floor-slab-piece",
      "commercial",
    );
    slabPiece.position.set(x, 4.3, z);
    Object.assign(slabPiece.userData, { floor: 2, bordersStairOpening: true });
    upperFloorSlab.add(slabPiece);
  }
  commercial.add(upperFloorSlab);

  const arcadeCeiling = communityMesh(new THREE.BoxGeometry(12.6, 0.18, 18.2), warmPaving, "residential-community-commercial-arcade-ceiling", "commercial");
  arcadeCeiling.position.set(-43, 4.14, 0);
  commercial.add(arcadeCeiling);
  for (const x of [-49.85, -36.15]) {
    for (const z of [-7.5, 0, 7.5]) {
      const column = communityMesh(new THREE.CylinderGeometry(0.28, 0.34, 3.55, 10), dark, "residential-community-commercial-arcade-column", "commercial");
      column.position.set(x, 2.36, z);
      Object.assign(column.userData, { groundContactY: 0.59, grounded: true });
      commercial.add(column);
    }
  }
  const arcadeSign = communityMesh(new THREE.BoxGeometry(10.5, 0.9, 0.24), brick, "residential-community-commercial-arcade-sign", "commercial");
  arcadeSign.position.set(-43, 3.45, 9.4);
  commercial.add(arcadeSign);
  cutawayShell.push(arcadeSign);

  const tenantTypes = ["supermarket", "pharmacy", "breakfast", "coffee", "bakery", "restaurant", "milk-tea", "convenience", "laundry", "salon", "clinic", "bookstore", "fresh-food", "community-bank"];
  const tenantBays: Array<{ tenantType: string; x: number; width: number }> = [];
  const tenantDistribution = [3, 11];
  let tenantCursor = 0;
  wingRanges.forEach(([minX, maxX], wingIndex) => {
    const count = tenantDistribution[wingIndex];
    const width = (maxX - minX) / count;
    for (let index = 0; index < count; index += 1) {
      tenantBays.push({ tenantType: tenantTypes[tenantCursor], x: minX + width * (index + 0.5), width });
      tenantCursor += 1;
      if (index < count - 1) {
        const divider = communityMesh(new THREE.BoxGeometry(0.14, 3.45, 17.4), concrete, "residential-community-commercial-tenant-divider", "commercial");
        divider.position.set(minX + width * (index + 1), 2.34, 0);
        Object.assign(divider.userData, { separatesTenantBays: true, boundaryIndex: tenantCursor });
        commercial.add(divider);
      }
    }
  });
  const fireDivider = communityMesh(new THREE.BoxGeometry(0.14, 3.45, 17.4), concrete, "residential-community-commercial-tenant-divider", "commercial");
  fireDivider.position.set(arcadeMaxX, 2.34, 0);
  Object.assign(fireDivider.userData, { separatesTenantBays: true, boundaryIndex: 13, arcadeFireSeparation: true });
  commercial.add(fireDivider);

  tenantBays.forEach(({ tenantType, x, width: storefrontWidth }, index) => {
    const store = new THREE.Group();
    store.name = "residential-community-storefront";
    store.position.set(x, 0, 9.58);
    store.userData = { tenantType, outwardFacing: true, zone: "commercial", enterable: true, clearDoorWidth: 1.5 };
    const doorWidth = Math.min(1.6, storefrontWidth * 0.24);
    const glazingWidth = Math.max(2.2, storefrontWidth - doorWidth - 0.72);
    const window = communityMesh(new THREE.BoxGeometry(glazingWidth, 2.65, 0.12), glass, "residential-community-storefront-glass", "commercial");
    window.position.set(-(doorWidth + 0.18) * 0.5, 2.005, 0);
    const door = communityMesh(new THREE.BoxGeometry(doorWidth, 2.65, 0.14), warmGlass, "residential-community-storefront-door", "commercial");
    door.position.set(storefrontWidth * 0.5 - doorWidth * 0.5 - 0.18, 2.005, 0.02);
    Object.assign(door.userData, { clearWidth: doorWidth, outwardFacing: true, thresholdFree: true });
    const doorHandle = communityMesh(new THREE.BoxGeometry(0.06, 0.48, 0.08), dark, "residential-community-storefront-door-handle", "commercial");
    doorHandle.position.set(door.position.x - doorWidth * 0.3, 2.05, 0.12);
    const sign = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.5, 0.72, 0.2), index % 2 ? brick : warmPaving, "residential-community-store-sign", "commercial");
    sign.position.set(0, 4.12, 0.08);
    const awning = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.7, 0.16, 1.45), index % 3 ? dark : brick, "residential-community-store-awning", "commercial");
    awning.position.set(0, 3.55, 0.82);
    const threshold = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.35, 0.1, 1.2), paving, "residential-community-storefront-clear-zone", "commercial");
    threshold.position.set(0, 0.62, 0.65);
    Object.assign(threshold.userData, { clearDepth: 1.2, barrierFree: true });
    const counter = communityMesh(new THREE.BoxGeometry(Math.min(3.4, storefrontWidth * 0.52), 1.05, 0.75), timber, "residential-community-commercial-interior-counter", "commercial");
    counter.position.set(-storefrontWidth * 0.12, 1.205, -4.9);
    Object.assign(counter.userData, { tenantType, lowAccessibleSection: true });
    store.add(window, door, doorHandle, sign, awning, threshold, counter);
    for (const side of [-1, 1]) {
      const furnishing = communityMesh(
        tenantType === "supermarket" || tenantType === "fresh-food" ? new THREE.BoxGeometry(1.0, 1.7, 4.2) : new THREE.BoxGeometry(1.45, 0.75, 1.45),
        side === -1 ? playYellow : playBlue,
        "residential-community-commercial-tenant-furnishing",
        "commercial",
      );
      furnishing.position.set(side * Math.min(2.0, storefrontWidth * 0.26), tenantType === "supermarket" || tenantType === "fresh-food" ? 1.53 : 1.055, -1.8);
      Object.assign(furnishing.userData, { tenantType, furnishingType: tenantType === "supermarket" || tenantType === "fresh-food" ? "shelf" : "table-or-display" });
      store.add(furnishing);
    }
    cutawayShell.push(window, door, sign, awning);
    commercial.add(store);
  });
  for (let index = 0; index < 18; index += 1) {
    const x = -69 + index * 8.1;
    const upperWindow = communityMesh(new THREE.BoxGeometry(4.8, 1.8, 0.12), glass, "residential-community-commercial-upper-window", "commercial");
    upperWindow.position.set(x, 6.45, 9.58);
    commercial.add(upperWindow);
    cutawayShell.push(upperWindow);
  }
  const upperCorridor = communityMesh(new THREE.BoxGeometry(140, 0.1, 2.1), interiorFloor, "residential-community-commercial-upper-corridor", "commercial");
  upperCorridor.position.set(0, 4.45, 6.4);
  commercial.add(upperCorridor);
  for (const x of [-68, 68]) {
    const stair = new THREE.Group();
    stair.name = "residential-community-commercial-stair";
    stair.position.set(x, 0, -5);
    stair.userData = { reachesSecondFloor: true, protectedEscape: true };
    for (let step = 0; step < 12; step += 1) {
      const topY = 0.68 + (step + 1) / 12 * (4.39 - 0.68);
      const height = topY - 0.68;
      const tread = communityMesh(new THREE.BoxGeometry(2.2, height, 0.5), concrete, "residential-community-commercial-stair-tread", "commercial");
      tread.position.set(0, 0.68 + height * 0.5, -3 + step * 0.48);
      stair.add(tread);
    }
    const stairSlope = Math.atan2(4.39 - 0.68, 11 * 0.48);
    for (const side of [-1, 1]) {
      const handrail = communityMesh(new THREE.BoxGeometry(0.1, 0.1, 5.8), safetyBlue, "residential-community-commercial-stair-handrail", "commercial");
      handrail.position.set(side * 1.05, 3.43, -0.36);
      handrail.rotation.x = -stairSlope;
      stair.add(handrail);
      for (const step of [0, 4, 8, 11]) {
        const topY = 0.68 + (step + 1) / 12 * (4.39 - 0.68);
        const post = communityMesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), safetyBlue, "residential-community-commercial-stair-handrail-post", "commercial");
        post.position.set(side * 1.05, topY + 0.45, -3 + step * 0.48);
        Object.assign(post.userData, { supportsHandrail: true, groundedToTread: true });
        stair.add(post);
      }
    }
    commercial.add(stair);
    const upperLandingLink = communityMesh(new THREE.BoxGeometry(2.4, 0.1, 8.1), interiorFloor, "residential-community-commercial-upper-landing-link", "commercial");
    upperLandingLink.position.set(x, 4.44, 1.3);
    Object.assign(upperLandingLink.userData, { connectsStairToUpperCorridor: true, clearWidth: 2.4 });
    commercial.add(upperLandingLink);
  }
  const lift = communityMesh(new THREE.BoxGeometry(3.2, 7.3, 3.2), glass, "residential-community-commercial-accessible-lift", "commercial");
  lift.position.set(62, 4.18, -5.6);
  Object.assign(lift.userData, { reachesSecondFloor: true, barrierFree: true });
  commercial.add(lift);
  community.add(commercial);

  // Parallel parking now sits on two continuous, grounded lay-by slabs with the
  // community arcade and kindergarten access kept completely clear.
  for (const [x, width] of [[-69.75, 38], [3.75, 77]] as Array<[number, number]>) {
    const layby = communityMesh(new THREE.BoxGeometry(width, 0.1, 3.05), asphalt, "residential-community-commercial-parking-layby", "commercial");
    layby.position.set(x, 0.55, 64.05);
    Object.assign(layby.userData, { grounded: true, surfaceY: 0.6, separatedFromThroughLane: true });
    community.add(layby);
  }
  const parkingCenters = [-86, -79.5, -73, -66.5, -60, -53.5, -32, -25.5, -19, -12.5, -6, 0.5, 7, 13.5, 20, 26.5, 33, 39.5];
  parkingCenters.forEach((x, index) => {
    const parking = communityMesh(new THREE.BoxGeometry(5.2, 0.04, 2.7), asphalt, "residential-community-commercial-parking-bay", "commercial");
    parking.position.set(x, 0.62, 64.05);
    Object.assign(parking.userData, { parkingType: "parallel", separatedFromSidewalk: true, separatedFromThroughLane: true, accessible: index === 6 || index === 7 });
    const stripe = communityMesh(new THREE.BoxGeometry(0.09, 0.025, 2.6), cream, "residential-community-commercial-parking-line", "commercial");
    stripe.position.set(x - 2.65, 0.655, 64.05);
    community.add(parking, stripe);
  });
  for (const x of [-82.75, -63.25, -28.75, -9.25, 10.25, 29.75]) {
    const island = communityMesh(new THREE.BoxGeometry(1.25, 0.14, 2.8), warmPaving, "residential-community-commercial-light-island", "commercial");
    island.position.set(x, 0.66, 64.05);
    community.add(island);
  }

  // Kindergarten has its own secure boundary, gate and separated pick-up area.
  addFenceSegment("residential-community-kindergarten-fence", 53.5, -66, 73, true, "kindergarten");
  addFenceSegment("residential-community-kindergarten-fence", 17, -18, 96, false, "kindergarten");
  addFenceSegment("residential-community-kindergarten-fence", 90, -18, 96, false, "kindergarten");
  addFenceSegment("residential-community-kindergarten-fence", 33, 30, 32, true, "kindergarten");
  addFenceSegment("residential-community-kindergarten-fence", 75, 30, 30, true, "kindergarten");
  const kindergartenGate = new THREE.Group();
  kindergartenGate.name = "residential-community-kindergarten-gate";
  kindergartenGate.position.set(54, 0, 30);
  kindergartenGate.userData = { clearWidth: 10, measuredClearWidth: 10, childSafe: true, controlledAccess: true, frontDirection: "+z" };
  for (const x of [-5.5, 5.5]) {
    const post = communityMesh(new THREE.BoxGeometry(1, 3.6, 1), playYellow, "residential-community-kindergarten-gate-post", "kindergarten");
    post.position.set(x, 2.3, 0);
    kindergartenGate.add(post);
  }
  const rainbowBeam = communityMesh(new THREE.BoxGeometry(13, 0.65, 1), playRed, "residential-community-kindergarten-gate-beam", "kindergarten");
  rainbowBeam.position.y = 4.15;
  kindergartenGate.add(rainbowBeam);
  for (const side of [-1, 1]) {
    const panel = communityMesh(new THREE.BoxGeometry(4.95, 2.25, 0.14), fenceMaterial, "residential-community-kindergarten-gate-panel", "kindergarten");
    panel.position.set(side * 2.5, 1.65, 0);
    Object.assign(panel.userData, { side, closedX: side * 2.5, openX: side * 8, open: false });
    accessGatePanels.push(panel);
    kindergartenGate.add(panel);
  }
  community.add(kindergartenGate);

  const addKindergartenBuilding = (name: string, x: number, z: number, width: number, depth: number, floors: number, color: THREE.Material) => {
    const building = new THREE.Group();
    building.name = name;
    building.position.set(x, 0, z);
    building.userData = { zone: "kindergarten", frontDirection: "+z", floors, grounded: true, barrierFreeEntrance: true };
    const height = floors * 3.45;
    const foundation = communityMesh(new THREE.BoxGeometry(width + 0.35, 0.22, depth + 0.35), concrete, "residential-community-kindergarten-building-foundation", "kindergarten");
    foundation.position.y = 0.61;
    const body = communityMesh(new THREE.BoxGeometry(width, height, depth), cream, "residential-community-kindergarten-building-shell", "kindergarten");
    body.position.y = 0.72 + height * 0.5;
    const roof = communityMesh(new THREE.BoxGeometry(width + 0.6, 0.42, depth + 0.6), color, "residential-community-kindergarten-roof", "kindergarten");
    roof.position.y = 0.72 + height + 0.2;
    building.add(foundation, body, roof);
    cutawayShell.push(body, roof);
    for (let floor = 0; floor < floors; floor += 1) {
      if (name === "residential-community-kindergarten-teaching-building" && floor === 1) {
        // Split the second-floor slab around the internal stair rather than
        // allowing the stair flight to pass through a solid floor plate.
        const floorSlab = new THREE.Group();
        floorSlab.name = "residential-community-kindergarten-floor-slab";
        floorSlab.userData = { zone: "kindergarten", floor: 2, stairOpening: true, openingClearWidth: 2.7 };
        for (const [slabX, slabZ, slabWidth, slabDepth] of [
          [0, -3.1125, 47.55, 7.325],
          [0, 6.4625, 47.55, 0.625],
          [-2.3125, 3.35, 42.925, 5.6],
          [22.8125, 3.35, 1.925, 5.6],
        ] as Array<[number, number, number, number]>) {
          const slabPiece = communityMesh(
            new THREE.BoxGeometry(slabWidth, 0.16, slabDepth),
            interiorFloor,
            "residential-community-kindergarten-floor-slab-piece",
            "kindergarten",
          );
          slabPiece.position.set(slabX, 4.25, slabZ);
          Object.assign(slabPiece.userData, { floor: 2, bordersStairOpening: true });
          floorSlab.add(slabPiece);
        }
        building.add(floorSlab);
      } else {
        const floorSlab = communityMesh(new THREE.BoxGeometry(width - 0.45, 0.16, depth - 0.45), interiorFloor, "residential-community-kindergarten-floor-slab", "kindergarten");
        floorSlab.position.y = 0.8 + floor * 3.45;
        building.add(floorSlab);
      }
      const y = 2.12 + floor * 3.45;
      const bayCount = Math.max(3, Math.floor(width / 4.8));
      for (let bay = 0; bay < bayCount; bay += 1) {
        const windowX = -width * 0.5 + width / bayCount * (bay + 0.5);
        if (floor === 0 && Math.abs(windowX) < 2.5) continue;
        const window = communityMesh(new THREE.BoxGeometry(2.8, 1.65, 0.14), glass, "residential-community-kindergarten-window", "kindergarten");
        window.position.set(windowX, y, depth * 0.5 + 0.08);
        building.add(window);
        cutawayShell.push(window);
      }
    }
    const door = communityMesh(new THREE.BoxGeometry(3.2, 2.4, 0.16), glass, "residential-community-kindergarten-entrance", "kindergarten");
    door.position.set(0, 2.08, depth * 0.5 + 0.12);
    const canopy = communityMesh(new THREE.BoxGeometry(7, 0.28, 2.2), color, "residential-community-kindergarten-canopy", "kindergarten");
    canopy.position.set(0, 3.4, depth * 0.5 + 1);
    building.add(door, canopy);
    cutawayShell.push(door);
    for (const canopyX of [-2.8, 2.8]) {
      const canopyPost = communityMesh(new THREE.CylinderGeometry(0.11, 0.14, 2.37, 8), dark, "residential-community-kindergarten-canopy-post", "kindergarten");
      canopyPost.position.set(canopyX, 2.075, depth * 0.5 + 1.65);
      Object.assign(canopyPost.userData, { groundContactY: 0.89, grounded: true });
      building.add(canopyPost);
    }
    const entryPlatform = communityMesh(new THREE.BoxGeometry(6.5, 0.14, 2.6), paving, "residential-community-kindergarten-entry-platform", "kindergarten");
    entryPlatform.position.set(0, 0.82, depth * 0.5 + 1.4);
    Object.assign(entryPlatform.userData, { barrierFree: true, thresholdFree: true });
    building.add(entryPlatform);
    const entryRamp = communityMesh(new THREE.BoxGeometry(2.4, 0.12, 4.68), paving, "residential-community-kindergarten-entry-ramp", "kindergarten");
    entryRamp.position.set(0, 0.635, depth * 0.5 + 5.04);
    entryRamp.rotation.x = Math.atan2(0.39, 4.68);
    Object.assign(entryRamp.userData, { maximumGradient: "1:12", connectsToGround: true, clearWidth: 2.4 });
    building.add(entryRamp);
    for (const side of [-1, 1]) {
      const handrail = communityMesh(new THREE.BoxGeometry(0.1, 0.1, 4.68), safetyBlue, "residential-community-kindergarten-entry-ramp-handrail", "kindergarten");
      handrail.position.set(side * 1.15, 1.42, depth * 0.5 + 5.04);
      handrail.rotation.x = entryRamp.rotation.x;
      building.add(handrail);
      for (const localZ of [-1.9, 0, 1.9]) {
        const rampSurfaceY = 0.695 - localZ * Math.sin(entryRamp.rotation.x);
        const post = communityMesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), safetyBlue, "residential-community-kindergarten-entry-ramp-handrail-post", "kindergarten");
        post.position.set(side * 1.15, rampSurfaceY + 0.45, depth * 0.5 + 5.04 + localZ);
        Object.assign(post.userData, { supportsRail: true, groundedToRamp: true });
        building.add(post);
      }
    }
    community.add(building);
    return building;
  };
  const teaching = addKindergartenBuilding("residential-community-kindergarten-teaching-building", 52, -51, 48, 14, 2, playYellow);
  const multipurpose = addKindergartenBuilding("residential-community-kindergarten-multipurpose-building", 31, -31, 16, 15, 1, playBlue);
  const adminKitchen = addKindergartenBuilding("residential-community-kindergarten-admin-kitchen", 80, -27, 12, 27, 1, brick);

  const groundCorridor = communityMesh(new THREE.BoxGeometry(44, 0.08, 2.1), warmPaving, "residential-community-kindergarten-corridor", "kindergarten");
  groundCorridor.position.set(0, 0.92, 4.8);
  Object.assign(groundCorridor.userData, { clearWidth: 2.1, barrierFree: true, floor: 1 });
  teaching.add(groundCorridor);
  const teachingUpperCorridor = new THREE.Group();
  teachingUpperCorridor.name = "residential-community-kindergarten-corridor";
  teachingUpperCorridor.userData = { zone: "kindergarten", clearWidth: 2.1, barrierFree: true, floor: 2, stairOpening: true };
  const upperCorridorPiece = communityMesh(
    new THREE.BoxGeometry(41.15, 0.08, 2.1),
    warmPaving,
    "residential-community-kindergarten-corridor-piece",
    "kindergarten",
  );
  upperCorridorPiece.position.set(-1.425, 4.37, 4.8);
  teachingUpperCorridor.add(upperCorridorPiece);
  teaching.add(teachingUpperCorridor);
  const teachingStair = new THREE.Group();
  teachingStair.name = "residential-community-kindergarten-internal-stair";
  teachingStair.position.set(20.5, 0, 3.7);
  teachingStair.userData = { protectedSides: true, childHandrail: true };
  for (let step = 0; step < 14; step += 1) {
    const topY = 0.88 + (step + 1) / 14 * (4.33 - 0.88);
    const height = topY - 0.88;
    const tread = communityMesh(new THREE.BoxGeometry(2.3, height, 0.42), concrete, "residential-community-kindergarten-internal-stair-tread", "kindergarten");
    tread.position.set(0, 0.88 + height * 0.5, -2.7 + step * 0.37);
    teachingStair.add(tread);
  }
  const teachingStairSlope = Math.atan2(4.33 - 0.88, 13 * 0.37);
  for (const side of [-1, 1]) {
    for (const [railName, verticalOffset] of [
      ["residential-community-kindergarten-internal-stair-handrail", 0.88],
      ["residential-community-kindergarten-internal-stair-child-handrail", 0.62],
    ] as Array<[string, number]>) {
      const handrail = communityMesh(new THREE.BoxGeometry(0.09, 0.09, 5.25), safetyBlue, railName, "kindergarten");
      handrail.position.set(side * 1.05, (0.88 + 4.33) * 0.5 + verticalOffset, -0.295);
      handrail.rotation.x = -teachingStairSlope;
      teachingStair.add(handrail);
    }
    for (const step of [0, 4, 8, 13]) {
      const topY = 0.88 + (step + 1) / 14 * (4.33 - 0.88);
      const post = communityMesh(new THREE.BoxGeometry(0.08, 0.92, 0.08), safetyBlue, "residential-community-kindergarten-internal-stair-balustrade", "kindergarten");
      post.position.set(side * 1.05, topY + 0.46, -2.7 + step * 0.37);
      Object.assign(post.userData, { supportsHandrails: true, groundedToTread: true });
      teachingStair.add(post);
    }
  }
  teaching.add(teachingStair);
  const teachingStairLanding = communityMesh(
    new THREE.BoxGeometry(3.2, 0.1, 1),
    interiorFloor,
    "residential-community-kindergarten-stair-landing",
    "kindergarten",
  );
  teachingStairLanding.position.set(19.8, 4.38, 6.25);
  Object.assign(teachingStairLanding.userData, { connectsStairToUpperCorridor: true, protectedLanding: true, clearWidth: 1.8 });
  teaching.add(teachingStairLanding);

  const stage = communityMesh(new THREE.BoxGeometry(11, 0.45, 3.2), timber, "residential-community-kindergarten-multipurpose-stage", "kindergarten");
  stage.position.set(0, 1.1, -4.7);
  multipurpose.add(stage);
  for (let row = 0; row < 4; row += 1) {
    for (let seatIndex = 0; seatIndex < 6; seatIndex += 1) {
      const seat = communityMesh(new THREE.BoxGeometry(0.7, 0.58, 0.7), row % 2 ? playBlue : playYellow, "residential-community-kindergarten-multipurpose-seat", "kindergarten");
      seat.position.set(-4.25 + seatIndex * 1.7, 1.17, -1.3 + row * 1.5);
      multipurpose.add(seat);
    }
  }
  for (const z of [-8.5, -3, 3.2]) {
    const kitchenCounter = communityMesh(new THREE.BoxGeometry(8.2, 1.05, 1), timber, "residential-community-kindergarten-kitchen-counter", "kindergarten");
    kitchenCounter.position.set(0, 1.405, z);
    adminKitchen.add(kitchenCounter);
  }
  for (const z of [7.2, 10]) {
    const officeDesk = communityMesh(new THREE.BoxGeometry(3.2, 0.8, 1.4), warmPaving, "residential-community-kindergarten-admin-desk", "kindergarten");
    officeDesk.position.set(0, 1.28, z);
    adminKitchen.add(officeDesk);
  }

  let kindergartenClassroomCount = 0;
  for (let floor = 0; floor < 2; floor += 1) {
    for (let room = 0; room < 4; room += 1) {
      kindergartenClassroomCount += 1;
      const classroom = new THREE.Group();
      classroom.name = "residential-community-kindergarten-classroom";
      classroom.position.set(-17 + room * 11.2, floor * 3.45, 0);
      classroom.userData = { roomNumber: kindergartenClassroomCount, capacity: 20, furnished: true, frontDirection: "+z" };
      for (let table = 0; table < 4; table += 1) {
        const desk = communityMesh(new THREE.CylinderGeometry(0.72, 0.72, 0.42, 12), playYellow, "residential-community-kindergarten-activity-table", "kindergarten");
        desk.position.set((table % 2) * 2.4 - 1.2, 1.09, Math.floor(table / 2) * 2.2 - 1.1);
        Object.assign(desk.userData, { supportedToFloor: true, groundContactY: 0.88 + floor * 3.45 });
        classroom.add(desk);
        for (let chairIndex = 0; chairIndex < 4; chairIndex += 1) {
          const angle = chairIndex / 4 * Math.PI * 2;
          const chair = communityMesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), chairIndex % 2 ? playBlue : playRed, "residential-community-kindergarten-child-chair", "kindergarten");
          chair.position.set(desk.position.x + Math.cos(angle) * 1.05, 1.09, desk.position.z + Math.sin(angle) * 1.05);
          Object.assign(chair.userData, { seatHeight: 0.32, grounded: true });
          classroom.add(chair);
        }
      }
      const cubby = communityMesh(new THREE.BoxGeometry(3.2, 1.25, 0.52), timber, "residential-community-kindergarten-classroom-cubby", "kindergarten");
      cubby.position.set(0, 1.43, -4.9);
      classroom.add(cubby);
      teaching.add(classroom);
    }
  }

  for (const [x, z, width, depth, role] of [
    [52, -22, 3, 29, "teaching-spine"],
    [41.5, -16, 21, 2.4, "multipurpose-link"],
    [66, -8, 28, 2.4, "admin-link"],
    [87, 8.5, 2.4, 33, "playground-east-bypass"],
    [70.5, 25, 33, 2.4, "gate-promenade"],
    [54, 27, 4.2, 7, "gate-link"],
  ] as Array<[number, number, number, number, string]>) {
    const path = communityMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "residential-community-kindergarten-pedestrian-path", "kindergarten");
    path.position.set(x, 0.61, z);
    Object.assign(path.userData, { role, barrierFree: true, clearWidth: Math.min(width, depth), separatedFromPickupFlow: true });
    community.add(path);
  }
  const kindergartenGateApron = communityMesh(new THREE.BoxGeometry(12, 0.12, 2.4), paving, "residential-community-kindergarten-gate-apron", "kindergarten");
  kindergartenGateApron.position.set(54, 0.61, 31);
  Object.assign(kindergartenGateApron.userData, { protectedWaitingConnection: true, barrierFree: true });
  community.add(kindergartenGateApron);

  const kindergartenPlayground = communityMesh(new THREE.BoxGeometry(58, 0.15, 28), rubber, "residential-community-kindergarten-playground", "kindergarten");
  kindergartenPlayground.position.set(55, 0.65, 8);
  Object.assign(kindergartenPlayground.userData, { impactAttenuatingSurface: true, separatedFromPickupFlow: true });
  community.add(kindergartenPlayground);
  for (const [role, x, z, width, depth, clearWidth] of [
    ["south-playground-entry", 66, -6.4, 3, 1, 3],
    ["east-playground-entry", 84.9, 8.5, 2, 2.4, 2.4],
    ["north-playground-entry", 70.5, 22.9, 4.2, 2, 4.2],
  ] as Array<[string, number, number, number, number, number]>) {
    const playgroundConnector = communityMesh(
      new THREE.BoxGeometry(width, 0.12, depth),
      paving,
      "residential-community-kindergarten-playground-connector",
      "kindergarten",
    );
    playgroundConnector.position.set(x, 0.61, z);
    Object.assign(playgroundConnector.userData, {
      role,
      barrierFree: true,
      connectsPlaygroundToPedestrianNetwork: true,
      clearWidth,
    });
    community.add(playgroundConnector);
  }
  const track = communityMesh(new THREE.RingGeometry(7.2, 9.3, 32), playRed, "residential-community-kindergarten-running-loop", "kindergarten");
  track.rotation.x = -Math.PI * 0.5;
  track.scale.x = 1.75;
  track.position.set(55, 0.74, 8);
  Object.assign(track.userData, { equipmentClear: true, loopLengthMeters: 83 });
  community.add(track);
  const sandpit = communityMesh(new THREE.CylinderGeometry(4, 4, 0.22, 24), warmPaving, "residential-community-kindergarten-sandpit", "kindergarten");
  sandpit.position.set(76, 0.82, 7);
  Object.assign(sandpit.userData, { raisedEdge: true, accessibleTransferEdge: true });
  community.add(sandpit);
  const sandBorder = communityMesh(new THREE.TorusGeometry(4, 0.18, 8, 24), timber, "residential-community-kindergarten-sandpit-border", "kindergarten");
  sandBorder.rotation.x = Math.PI * 0.5;
  sandBorder.position.set(76, 0.98, 7);
  community.add(sandBorder);
  const shadeRoof = communityMesh(new THREE.ConeGeometry(5.2, 1.1, 6), playYellow, "residential-community-kindergarten-sandpit-shade", "kindergarten");
  shadeRoof.position.set(76, 4.5, 7);
  community.add(shadeRoof);
  for (const x of [72.5, 79.5]) {
    const shadePost = communityMesh(new THREE.CylinderGeometry(0.11, 0.15, 3.55, 8), safetyBlue, "residential-community-kindergarten-sandpit-shade-post", "kindergarten");
    shadePost.position.set(x, 2.5, 7);
    Object.assign(shadePost.userData, { groundContactY: 0.725, grounded: true });
    community.add(shadePost);
  }

  const kindergartenPlaySet = new THREE.Group();
  kindergartenPlaySet.name = "residential-community-kindergarten-play-equipment";
  kindergartenPlaySet.position.set(33.5, 0, 5);
  kindergartenPlaySet.userData = { equipmentType: "compound-play-set", supported: true, outsideRunningLoop: true };
  const kidsDeck = communityMesh(new THREE.BoxGeometry(4.3, 0.24, 3.2), playYellow, "residential-community-kindergarten-play-platform", "kindergarten");
  kidsDeck.position.y = 2.15;
  kindergartenPlaySet.add(kidsDeck);
  for (const x of [-1.8, 1.8]) {
    for (const z of [-1.3, 1.3]) {
      const post = communityMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.3, 8), safetyBlue, "residential-community-kindergarten-play-support", "kindergarten");
      post.position.set(x, 1.37, z);
      Object.assign(post.userData, { groundContactY: 0.725, grounded: true });
      kindergartenPlaySet.add(post);
    }
  }
  for (const x of [-2.05, 2.05]) {
    const rail = communityMesh(new THREE.BoxGeometry(0.12, 0.78, 3.0), safetyBlue, "residential-community-kindergarten-play-guardrail", "kindergarten");
    rail.position.set(x, 2.65, 0);
    kindergartenPlaySet.add(rail);
  }
  const kidsRoof = communityMesh(new THREE.ConeGeometry(3.1, 1.2, 4), playRed, "residential-community-kindergarten-play-roof", "kindergarten");
  kidsRoof.rotation.y = Math.PI * 0.25;
  kidsRoof.position.y = 3.85;
  kindergartenPlaySet.add(kidsRoof);
  for (let step = 0; step < 5; step += 1) {
    const topY = 0.725 + (step + 1) / 5 * (2.03 - 0.725);
    const height = topY - 0.725;
    const stair = communityMesh(new THREE.BoxGeometry(1.5, height, 0.5), playBlue, "residential-community-kindergarten-play-stair", "kindergarten");
    stair.position.set(-1.1, 0.725 + height * 0.5, -3.65 + step * 0.46);
    Object.assign(stair.userData, { groundContactY: 0.725, grounded: true, stepIndex: step + 1 });
    kindergartenPlaySet.add(stair);
  }
  const kidsSlideAngle = Math.atan2(1.35, 4.1);
  const kidsSlide = communityMesh(new THREE.BoxGeometry(1.35, 0.16, 4.3), playRed, "residential-community-kindergarten-play-slide", "kindergarten");
  kidsSlide.position.set(1.0, 1.47, 3.3);
  kidsSlide.rotation.x = kidsSlideAngle;
  Object.assign(kidsSlide.userData, { supportedAtPlatform: true, safeLanding: true });
  kindergartenPlaySet.add(kidsSlide);
  for (const x of [0.3, 1.7]) {
    const rail = communityMesh(new THREE.BoxGeometry(0.12, 0.3, 4.3), safetyYellow, "residential-community-kindergarten-play-slide-side-rail", "kindergarten");
    rail.position.set(x, 1.62, 3.3);
    rail.rotation.x = kidsSlideAngle;
    kindergartenPlaySet.add(rail);
  }
  community.add(kindergartenPlaySet);

  const kindergartenSwing = new THREE.Group();
  kindergartenSwing.name = "residential-community-kindergarten-swing";
  kindergartenSwing.position.set(76, 0, 18);
  kindergartenSwing.userData = { groundSupported: true, outsideRunningLoop: true };
  for (const x of [-2, 2]) {
    for (const z of [-0.8, 0.8]) {
      const leg = communityMesh(new THREE.CylinderGeometry(0.1, 0.14, 3, 8), safetyBlue, "residential-community-kindergarten-swing-leg", "kindergarten");
      leg.position.set(x, 2.12, z);
      leg.rotation.z = x < 0 ? -0.18 : 0.18;
      kindergartenSwing.add(leg);
    }
  }
  const kinderSwingBeam = communityMesh(new THREE.BoxGeometry(4.6, 0.18, 0.18), safetyBlue, "residential-community-kindergarten-swing-beam", "kindergarten");
  kinderSwingBeam.position.y = 3.55;
  kindergartenSwing.add(kinderSwingBeam);
  for (const x of [-1.1, 1.1]) {
    for (const chainX of [-0.25, 0.25]) {
      const chain = communityMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.65, 6), dark, "residential-community-kindergarten-swing-chain", "kindergarten");
      chain.position.set(x + chainX, 2.65, 0);
      kindergartenSwing.add(chain);
    }
    const seat = communityMesh(new THREE.BoxGeometry(0.9, 0.12, 0.46), playYellow, "residential-community-kindergarten-swing-seat", "kindergarten");
    seat.position.set(x, 1.82, 0);
    kindergartenSwing.add(seat);
  }
  community.add(kindergartenSwing);

  const seesaw = new THREE.Group();
  seesaw.name = "residential-community-kindergarten-seesaw";
  seesaw.position.set(34, 0, 18);
  seesaw.userData = { groundSupported: true, outsideRunningLoop: true };
  const seesawBase = communityMesh(new THREE.CylinderGeometry(0.65, 0.8, 0.42, 8), safetyBlue, "residential-community-kindergarten-seesaw-base", "kindergarten");
  seesawBase.position.y = 0.94;
  const seesawBeam = communityMesh(new THREE.BoxGeometry(5.2, 0.22, 0.45), playYellow, "residential-community-kindergarten-seesaw-beam", "kindergarten");
  seesawBeam.position.y = 1.4;
  seesawBeam.rotation.z = 0.08;
  seesaw.add(seesawBase, seesawBeam);
  community.add(seesaw);
  for (const [x, z] of [[32, -1], [40, 19]] as Array<[number, number]>) {
    const rockingHorse = new THREE.Group();
    rockingHorse.name = "residential-community-kindergarten-rocking-horse";
    rockingHorse.position.set(x, 0, z);
    const spring = communityMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.58, 8), safetyBlue, "residential-community-kindergarten-rocking-horse-spring", "kindergarten");
    spring.position.y = 1.02;
    const body = communityMesh(new THREE.CapsuleGeometry(0.38, 0.82, 4, 8), playRed, "residential-community-kindergarten-rocking-horse-body", "kindergarten");
    body.rotation.z = Math.PI * 0.5;
    body.position.y = 1.62;
    rockingHorse.add(spring, body);
    community.add(rockingHorse);
  }

  // The protected waiting plaza and the pickup road are parallel, not overlapping.
  const waitingPlaza = communityMesh(new THREE.BoxGeometry(64, 0.12, 4), paving, "residential-community-kindergarten-waiting-plaza", "kindergarten");
  waitingPlaza.position.set(56, 0.61, 33.5);
  Object.assign(waitingPlaza.userData, { protectedFromVehicles: true, barrierFree: true });
  const pickup = communityMesh(new THREE.BoxGeometry(64, 0.12, 6), asphalt, "residential-community-kindergarten-pickup-zone", "kindergarten");
  pickup.position.set(56, 0.55, 39);
  Object.assign(pickup.userData, { oneWayLoop: true, separatedFromWaitingPlaza: true, dropoffBayCount: 8 });
  community.add(pickup);
  community.add(waitingPlaza);
  for (const [x, flow] of [[82, "entry"], [86, "exit"]] as Array<[number, string]>) {
    const pickupAccess = communityMesh(new THREE.BoxGeometry(4, 0.12, 25.5), asphalt, "residential-community-kindergarten-access-road", "kindergarten");
    pickupAccess.position.set(x, 0.56, 54.25);
    Object.assign(pickupAccess.userData, { oneWay: true, flow, connectsPickupToPublicRoad: true, clearWidth: 4, formsLoop: true });
    community.add(pickupAccess);
    const arrow = communityMesh(new THREE.ConeGeometry(0.7, 1.8, 3), whiteLine, "residential-community-kindergarten-traffic-arrow", "kindergarten");
    arrow.rotation.x = Math.PI * 0.5;
    arrow.rotation.z = flow === "entry" ? 0 : Math.PI;
    arrow.position.set(x, 0.66, 53);
    community.add(arrow);
  }
  for (const x of [29, 79]) {
    const dividerPlanter = communityMesh(new THREE.BoxGeometry(1.2, 0.7, 3.4), warmPaving, "residential-community-kindergarten-pickup-bollard-planter", "kindergarten");
    dividerPlanter.position.set(x, 0.91, 35.5);
    community.add(dividerPlanter);
  }
  for (let index = 0; index < 9; index += 1) {
    const bollard = communityMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8), safetyBlue, "residential-community-kindergarten-pickup-bollard", "kindergarten");
    bollard.position.set(32 + index * 5.5, 1.17, 35.5);
    Object.assign(bollard.userData, { groundContactY: 0.72, protectsWaitingPlaza: true });
    community.add(bollard);
  }
  for (let stripe = 0; stripe < 6; stripe += 1) {
    const crossing = communityMesh(new THREE.BoxGeometry(0.55, 0.025, 5.8), whiteLine, "residential-community-kindergarten-raised-crossing", "kindergarten");
    crossing.position.set(52.5 + stripe * 0.8, 0.66, 36.9);
    community.add(crossing);
  }
  for (let index = 0; index < 8; index += 1) {
    const marking = communityMesh(new THREE.BoxGeometry(4.5, 0.025, 0.12), playYellow, "residential-community-kindergarten-pickup-marking", "kindergarten");
    marking.position.set(30 + index * 7, 0.63, 39);
    community.add(marking);
  }

  const waitingCanopy = communityMesh(new THREE.BoxGeometry(22, 0.24, 3.3), playYellow, "residential-community-kindergarten-waiting-canopy", "kindergarten");
  waitingCanopy.position.set(56, 3.65, 33.3);
  community.add(waitingCanopy);
  for (const x of [46, 52.5, 59.5, 66]) {
    const post = communityMesh(new THREE.CylinderGeometry(0.11, 0.15, 2.93, 8), safetyBlue, "residential-community-kindergarten-waiting-canopy-post", "kindergarten");
    post.position.set(x, 2.135, 33.3);
    Object.assign(post.userData, { groundContactY: 0.67, grounded: true });
    community.add(post);
  }
  for (const x of [48, 55, 62]) {
    const seat = communityMesh(new THREE.BoxGeometry(4.6, 0.14, 0.62), timber, "residential-community-kindergarten-waiting-seat", "kindergarten");
    seat.position.set(x, 1.12, 33.2);
    const back = communityMesh(new THREE.BoxGeometry(4.6, 0.72, 0.14), timber, "residential-community-kindergarten-waiting-seat-backrest", "kindergarten");
    back.position.set(x, 1.48, 33.48);
    community.add(seat, back);
    for (const legX of [-1.65, 1.65]) {
      const leg = communityMesh(new THREE.BoxGeometry(0.18, 0.38, 0.48), timberDark, "residential-community-kindergarten-waiting-seat-leg", "kindergarten");
      leg.position.set(x + legX, 0.86, 33.2);
      Object.assign(leg.userData, { groundContactY: 0.67, grounded: true });
      community.add(leg);
    }
  }
  for (let index = 0; index < 6; index += 1) {
    const rack = communityMesh(new THREE.TorusGeometry(0.55, 0.055, 6, 12, Math.PI), dark, "residential-community-kindergarten-bicycle-rack", "kindergarten");
    rack.position.set(27 + index * 1.35, 0.72, 32.8);
    community.add(rack);
  }

  const addVehicle = (name: string, x: number, z: number, length: number, width: number, color: THREE.Material, zone: ResidentialCommunityZone, surfaceY = 0.64) => {
    const vehicle = new THREE.Group();
    vehicle.name = name;
    vehicle.position.set(x, surfaceY - 0.64, z);
    vehicle.userData = { zone, realisticScale: true, rabbitRiderReference: 2.4 };
    const body = communityMesh(new THREE.BoxGeometry(length, 0.72, width), color, `${name}-body`, zone);
    body.position.y = 1;
    const cabin = communityMesh(new THREE.BoxGeometry(length * 0.56, 0.62, width * 0.88), vehicleGlass, `${name}-cabin`, zone);
    cabin.position.set(-length * 0.04, 1.6, 0);
    vehicle.add(body, cabin);
    for (const wheelX of [-length * 0.32, length * 0.32]) {
      for (const wheelZ of [-width * 0.5, width * 0.5]) {
        const wheel = communityMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10), dark, `${name}-wheel`, zone);
        wheel.rotation.x = Math.PI * 0.5;
        wheel.position.set(wheelX, 0.94, wheelZ);
        vehicle.add(wheel);
      }
    }
    community.add(vehicle);
    return vehicle;
  };
  addVehicle("residential-community-parked-car", -86, 64.05, 4.35, 1.75, playBlue, "commercial");
  addVehicle("residential-community-parked-car", -66.5, 64.05, 4.35, 1.75, playRed, "commercial");
  addVehicle("residential-community-parked-car", -19, 64.05, 4.35, 1.75, playYellow, "commercial");
  addVehicle("residential-community-parked-car", 20, 64.05, 4.35, 1.75, brick, "commercial");
  const schoolBus = addVehicle("residential-community-kindergarten-school-bus", 70, 39, 6.8, 2.15, playYellow, "kindergarten", 0.61);
  schoolBus.userData.capacity = 14;
  const destination = communityMesh(new THREE.BoxGeometry(2.4, 0.42, 0.08), dark, "residential-community-kindergarten-school-bus-destination", "kindergarten");
  destination.position.set(70, 2, 40.11);
  community.add(destination);

  // Reuse the established city furnishing collection across all three zones.
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const lightPositions: Array<[number, number, number, number, ResidentialCommunityZone]> = [
    [-82.75, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [-63.25, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [-28.75, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [-9.25, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [10.25, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [29.75, 64.05, 0.73, -Math.PI * 0.5, "commercial"],
    [-62, -55, 0.5, Math.PI * 0.5, "residential"],
    [-33, -55, 0.5, Math.PI * 0.5, "residential"],
    [-62, -30, 0.5, 0, "residential"],
    [-33, -30, 0.5, Math.PI, "residential"],
    [-80, 12, 0.5, 0, "residential"],
    [1, -10, 0.5, Math.PI, "residential"],
    [21, -58, 0.5, 0, "kindergarten"],
    [87, -58, 0.5, Math.PI, "kindergarten"],
    [19, -18, 0.5, 0, "kindergarten"],
    [89, -5, 0.5, 0, "kindergarten"],
    [21, 24, 0.5, 0, "kindergarten"],
    [85, 27.5, 0.5, Math.PI, "kindergarten"],
  ];
  lightPositions.forEach(([x, z, surfaceY, rotationY, zone]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, surfaceY, z);
    light.rotation.y = rotationY;
    light.userData.sourceCollection = "city-street-furniture";
    light.userData.zone = zone;
    light.userData.surfaceY = surfaceY;
    light.userData.grounded = true;
    light.userData.armFaces = zone === "commercial" ? "+z" : "circulation";
    reusedStreetLights.push(light);
    community.add(light);
  });
  const planterPositions: Array<[number, number, number, ResidentialCommunityZone]> = [
    [-68, 37.5, 0.5, "commercial"], [-58, 37.5, 0.5, "commercial"],
    [-26, 37.5, 0.5, "commercial"], [-16, 37.5, 0.5, "commercial"],
    [10, 37.5, 0.5, "commercial"], [20, 37.5, 0.5, "commercial"],
    [-75, 10, 0.5, "residential"], [-20, -10, 0.5, "residential"],
    [28, 27, 0.5, "kindergarten"], [75, 28.2, 0.5, "kindergarten"],
  ];
  planterPositions.forEach(([x, z, surfaceY, zone]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, surfaceY, z);
    planter.scale.setScalar(1.1);
    planter.userData.sourceCollection = "city-street-furniture";
    planter.userData.zone = zone;
    planter.userData.surfaceY = surfaceY;
    planter.userData.grounded = true;
    community.add(planter);
  });
  const treePositions: Array<[number, number]> = [
    [-80, -58], [-70, -58], [-45, -58], [-4, -60], [-68, -30], [-38, -29], [-62, -23], [-5, -12], [-80, 17], [-61, 7],
    [22, -62], [84, -62], [22, -52], [85, -49], [20, -42], [87, -43], [22, 10], [45, -20.5],
    [64, -18], [22, 1], [20.5, -30], [22, 18], [22, -10], [36, 25], [40, 26], [45, 26],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "residential-community-reused-tree-anchor";
    anchor.position.set(x, 0.5, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    anchor.userData.surfaceY = 0.5;
    anchor.userData.grounded = true;
    community.add(anchor);
  });

  community.userData = {
    mapLayer: "exterior",
    modelType: "residential-community",
    generatedLocally: true,
    zones: ["residential", "commercial", "kindergarten"],
    residentialBuildingCount: residentialModels.length,
    highRiseCount: 4,
    midRiseCount: 4,
    householdCount,
    commercialBuildingCount: 1,
    storefrontCount: tenantTypes.length,
    kindergartenBuildingCount: 3,
    kindergartenClassroomCount,
    kindergartenCapacity: kindergartenClassroomCount * 20,
    garageEntranceCount: 2,
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
    siteSize: new THREE.Vector3(190, 60, 145),
    setAccessGatesOpen: (open) => {
      accessGatePanels.forEach((panel) => {
        panel.position.x = open ? panel.userData.openX as number : panel.userData.closedX as number;
        panel.userData.open = open;
      });
    },
    setPowered: (powered) => {
      glass.emissiveIntensity = powered ? 1.2 : 0.1;
      warmGlass.emissiveIntensity = powered ? 2.1 : 0.12;
      water.emissiveIntensity = powered ? 0.55 : 0.12;
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
      residentialModels.forEach((model) => {
        const setPowered = model.userData.setPowered as undefined | ((value: boolean) => void);
        setPowered?.(powered);
      });
    },
    setInteriorCutaway: (cutaway) => {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
      residentialModels.forEach((model) => {
        const setCutaway = model.userData.setInteriorCutaway as undefined | ((value: boolean) => void);
        setCutaway?.(cutaway);
      });
    },
    update: (deltaSeconds) => {
      residentialModels.forEach((model) => {
        const updateElevators = model.userData.updateElevators as undefined | ((delta: number) => void);
        updateElevators?.(deltaSeconds);
      });
    },
  };
  community.userData.setPowered(false);
  community.userData.setInteriorCutaway(false);
  community.userData.setAccessGatesOpen(false);
  return community;
}
