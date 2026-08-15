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
  object.castShadow = true;
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
  const glass = new THREE.MeshStandardMaterial({ color: 0x72abb5, emissive: 0x285763, emissiveIntensity: 0.1, roughness: 0.2, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide });
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
  for (const [x, z, width, depth] of [
    [-40, 24, 85, 3.2], [-40, -28, 85, 3.2], [-76, -17, 3.2, 88], [-41, -17, 3.2, 88], [-7, -17, 3.2, 88],
    [53, 33, 70, 4.2], [53, 28, 4.2, 10],
  ] as Array<[number, number, number, number]>) {
    const path = communityMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "residential-community-pedestrian-path");
    path.position.set(x, 0.61, z);
    community.add(path);
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
    const postCount = Math.max(2, Math.floor(length / 2));
    for (let index = 0; index <= postCount; index += 1) {
      const offset = -length * 0.5 + index / postCount * length;
      const post = communityMesh(new THREE.BoxGeometry(0.13, 1.8, 0.13), fenceMaterial, `${name}-post`, zone);
      post.position.set(horizontal ? offset : 0, 1.78, horizontal ? 0 : offset);
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
  addFenceSegment("residential-community-residential-fence", -16, 35, 42, true, "residential");

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
    panel.userData = { side, closedX: side * 3, openX: side * 9.4, open: false };
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
    tower.position.set(x, 0.58, z);
    tower.scale.set(1, 1.7, 1);
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
    building.position.set(x, 0.58, z);
    building.scale.set(1.35, 1.85, 1.35);
    building.userData.zone = "residential";
    building.userData.frontDirection = "+z";
    householdCount += building.userData.apartmentCount;
    residentialModels.push(building);
    community.add(building);
  }

  // Central garden, all-age activity spaces, parcel station and waste point.
  const garden = new THREE.Group();
  garden.name = "residential-community-central-garden";
  garden.position.set(-42, 0, 11);
  const gardenDeck = communityMesh(new THREE.CylinderGeometry(12, 12, 0.16, 32), warmPaving, "residential-community-garden-plaza", "residential");
  gardenDeck.position.y = 0.64;
  const pond = communityMesh(new THREE.CylinderGeometry(4.2, 4.2, 0.18, 28), water, "residential-community-water-feature", "residential");
  pond.position.y = 0.78;
  garden.add(gardenDeck, pond);
  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    const bench = communityMesh(new THREE.BoxGeometry(2.2, 0.5, 0.65), timber, "residential-community-garden-bench", "residential");
    bench.position.set(Math.cos(angle) * 8, 0.95, Math.sin(angle) * 8);
    bench.rotation.y = -angle;
    garden.add(bench);
  }
  community.add(garden);

  const childrenArea = communityMesh(new THREE.BoxGeometry(17, 0.14, 11), rubber, "residential-community-children-playground", "residential");
  childrenArea.position.set(-18, 0.64, 2);
  community.add(childrenArea);
  const slidePlatform = communityMesh(new THREE.BoxGeometry(2.4, 1.7, 2.4), playYellow, "residential-community-play-tower", "residential");
  slidePlatform.position.set(-20, 1.45, 2);
  const slide = communityMesh(new THREE.BoxGeometry(1.25, 0.18, 4.8), playRed, "residential-community-play-slide", "residential");
  slide.position.set(-20, 1.25, 5.1);
  slide.rotation.x = -0.34;
  const climbing = communityMesh(new THREE.TorusGeometry(2, 0.16, 6, 20, Math.PI), playBlue, "residential-community-climbing-frame", "residential");
  climbing.position.set(-13.5, 2.55, 1.8);
  community.add(slidePlatform, slide, climbing);

  const fitnessArea = communityMesh(new THREE.BoxGeometry(15, 0.14, 8), warmPaving, "residential-community-senior-fitness-area", "residential");
  fitnessArea.position.set(-78, 0.64, 18);
  community.add(fitnessArea);
  for (const x of [-83, -78, -73]) {
    const bar = communityMesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), dark, "residential-community-fitness-equipment", "residential");
    bar.position.set(x, 1.72, 18);
    community.add(bar);
  }

  const parcelStation = communityMesh(new THREE.BoxGeometry(12, 3.2, 4), brick, "residential-community-parcel-station", "residential");
  parcelStation.position.set(-15, 2.2, 28);
  const parcelDoors = communityMesh(new THREE.BoxGeometry(10.8, 2.25, 0.12), warmGlass, "residential-community-parcel-lockers", "residential");
  parcelDoors.position.set(-15, 2.05, 30.05);
  const wasteStation = communityMesh(new THREE.BoxGeometry(7, 2.6, 4), dark, "residential-community-waste-sorting-station", "residential");
  wasteStation.position.set(-2, 1.9, 28);
  community.add(parcelStation, parcelDoors, wasteStation);

  for (const [index, x] of [-77, -58].entries()) {
    const ramp = communityMesh(new THREE.BoxGeometry(10, 0.35, 11), asphalt, "residential-community-underground-garage-ramp", "residential");
    ramp.position.set(x, 0.55, 27.5);
    ramp.rotation.x = -0.13;
    ramp.userData = { garageIndex: index + 1, vehicleAccess: true, downDirection: "-z" };
    community.add(ramp);
    for (const side of [-1, 1]) {
      const wall = communityMesh(new THREE.BoxGeometry(0.25, 1.25, 11), concrete, "residential-community-garage-ramp-wall", "residential");
      wall.position.set(x + side * 5, 1.15, 27.5);
      community.add(wall);
    }
  }

  // Open neighbourhood retail: fourteen outward-facing stores and a second floor.
  const commercial = new THREE.Group();
  commercial.name = "residential-community-commercial-street";
  commercial.position.set(0, 0, 49.5);
  commercial.userData = { zone: "commercial", openToPublicStreet: true, frontDirection: "+z" };
  const commercialCore = communityMesh(new THREE.BoxGeometry(148, 7.6, 19), cream, "residential-community-commercial-building", "commercial");
  commercialCore.position.y = 4.35;
  const commercialRoof = communityMesh(new THREE.BoxGeometry(150, 0.32, 19.8), dark, "residential-community-commercial-roof", "commercial");
  commercialRoof.position.y = 8.3;
  commercial.add(commercialCore, commercialRoof);
  cutawayShell.push(commercialCore, commercialRoof);
  for (const y of [0.65, 4.3]) {
    const floorSlab = communityMesh(new THREE.BoxGeometry(147.5, 0.18, 18.5), concrete, "residential-community-commercial-floor-slab", "commercial");
    floorSlab.position.y = y;
    commercial.add(floorSlab);
  }
  const tenantTypes = ["supermarket", "pharmacy", "breakfast", "coffee", "bakery", "restaurant", "milk-tea", "convenience", "laundry", "salon", "clinic", "bookstore", "fresh-food", "community-bank"];
  const storefrontWidth = 148 / tenantTypes.length;
  for (let boundary = 1; boundary < tenantTypes.length; boundary += 1) {
    const divider = communityMesh(new THREE.BoxGeometry(0.14, 3.4, 17.4), concrete, "residential-community-commercial-tenant-divider", "commercial");
    divider.position.set(-74 + storefrontWidth * boundary, 2.35, 0);
    divider.userData = { separatesTenantBays: true, boundaryIndex: boundary };
    commercial.add(divider);
  }
  tenantTypes.forEach((tenantType, index) => {
    const x = -74 + storefrontWidth * (index + 0.5);
    const store = new THREE.Group();
    store.name = "residential-community-storefront";
    store.position.set(x, 0, 9.58);
    store.userData = { tenantType, outwardFacing: true, zone: "commercial" };
    const window = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.45, 2.65, 0.12), glass, "residential-community-storefront-glass", "commercial");
    window.position.y = 2.25;
    const sign = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.5, 0.72, 0.2), index % 2 ? brick : warmPaving, "residential-community-store-sign", "commercial");
    sign.position.set(0, 4.12, 0.08);
    const awning = communityMesh(new THREE.BoxGeometry(storefrontWidth - 0.7, 0.16, 1.45), index % 3 ? dark : brick, "residential-community-store-awning", "commercial");
    awning.position.set(0, 3.55, 0.82);
    store.add(window, sign, awning);
    cutawayShell.push(window, sign, awning);
    commercial.add(store);
  });
  for (let index = 0; index < 18; index += 1) {
    const x = -69 + index * 8.1;
    const upperWindow = communityMesh(new THREE.BoxGeometry(4.8, 1.8, 0.12), glass, "residential-community-commercial-upper-window", "commercial");
    upperWindow.position.set(x, 6.45, 9.58);
    commercial.add(upperWindow);
    cutawayShell.push(upperWindow);
  }
  community.add(commercial);

  // Parallel parking sits in a dedicated inset lay-by between foot traffic and through traffic.
  for (let index = 0; index < 18; index += 1) {
    const x = -84 + index * 9.8;
    const parking = communityMesh(new THREE.BoxGeometry(5.2, 0.04, 2.7), asphalt, "residential-community-commercial-parking-bay", "commercial");
    parking.position.set(x, 0.65, 64);
    parking.userData = { parkingType: "parallel", separatedFromSidewalk: true, separatedFromThroughLane: true };
    const stripe = communityMesh(new THREE.BoxGeometry(0.09, 0.025, 2.6), cream, "residential-community-commercial-parking-line", "commercial");
    stripe.position.set(x - 2.65, 0.68, 64);
    community.add(parking, stripe);
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
    panel.position.set(side * 2.5, 1.8, 0);
    panel.userData = { side, closedX: side * 2.5, openX: side * 8, open: false };
    accessGatePanels.push(panel);
    kindergartenGate.add(panel);
  }
  community.add(kindergartenGate);

  const addKindergartenBuilding = (name: string, x: number, z: number, width: number, depth: number, floors: number, color: THREE.Material) => {
    const building = new THREE.Group();
    building.name = name;
    building.position.set(x, 0, z);
    building.userData = { zone: "kindergarten", frontDirection: "+z", floors };
    const height = floors * 3.45;
    const body = communityMesh(new THREE.BoxGeometry(width, height, depth), cream, "residential-community-kindergarten-building-shell", "kindergarten");
    body.position.y = 0.65 + height * 0.5;
    const roof = communityMesh(new THREE.BoxGeometry(width + 0.6, 0.42, depth + 0.6), color, "residential-community-kindergarten-roof", "kindergarten");
    roof.position.y = 0.65 + height + 0.2;
    building.add(body, roof);
    cutawayShell.push(body, roof);
    for (let floor = 0; floor < floors; floor += 1) {
      const y = 2.05 + floor * 3.45;
      const bayCount = Math.max(3, Math.floor(width / 4.8));
      for (let bay = 0; bay < bayCount; bay += 1) {
        const window = communityMesh(new THREE.BoxGeometry(2.8, 1.65, 0.14), glass, "residential-community-kindergarten-window", "kindergarten");
        window.position.set(-width * 0.5 + width / bayCount * (bay + 0.5), y, depth * 0.5 + 0.08);
        building.add(window);
        cutawayShell.push(window);
      }
    }
    const door = communityMesh(new THREE.BoxGeometry(3.2, 2.4, 0.16), glass, "residential-community-kindergarten-entrance", "kindergarten");
    door.position.set(0, 1.85, depth * 0.5 + 0.12);
    const canopy = communityMesh(new THREE.BoxGeometry(7, 0.28, 2.2), color, "residential-community-kindergarten-canopy", "kindergarten");
    canopy.position.set(0, 3.4, depth * 0.5 + 1);
    building.add(door, canopy);
    community.add(building);
    return building;
  };
  const teaching = addKindergartenBuilding("residential-community-kindergarten-teaching-building", 52, -51, 48, 14, 2, playYellow);
  addKindergartenBuilding("residential-community-kindergarten-multipurpose-building", 31, -31, 16, 15, 1, playBlue);
  addKindergartenBuilding("residential-community-kindergarten-admin-kitchen", 80, -31, 15, 29, 1, brick);

  let kindergartenClassroomCount = 0;
  for (let floor = 0; floor < 2; floor += 1) {
    for (let room = 0; room < 4; room += 1) {
      kindergartenClassroomCount += 1;
      const classroom = new THREE.Group();
      classroom.name = "residential-community-kindergarten-classroom";
      classroom.position.set(-17 + room * 11.2, 0.72 + floor * 3.45, 0);
      classroom.userData = { roomNumber: kindergartenClassroomCount, capacity: 20 };
      for (let table = 0; table < 4; table += 1) {
        const desk = communityMesh(new THREE.CylinderGeometry(0.72, 0.72, 0.42, 12), playYellow, "residential-community-kindergarten-activity-table", "kindergarten");
        desk.position.set((table % 2) * 2.4 - 1.2, 0.72, Math.floor(table / 2) * 2.2 - 1.1);
        classroom.add(desk);
      }
      teaching.add(classroom);
    }
  }

  const kindergartenPlayground = communityMesh(new THREE.BoxGeometry(58, 0.15, 28), rubber, "residential-community-kindergarten-playground", "kindergarten");
  kindergartenPlayground.position.set(55, 0.65, 8);
  community.add(kindergartenPlayground);
  const track = communityMesh(new THREE.RingGeometry(7.2, 9.3, 32), playRed, "residential-community-kindergarten-running-loop", "kindergarten");
  track.rotation.x = -Math.PI * 0.5;
  track.scale.x = 1.75;
  track.position.set(55, 0.74, 8);
  community.add(track);
  const sandpit = communityMesh(new THREE.CylinderGeometry(4, 4, 0.22, 24), warmPaving, "residential-community-kindergarten-sandpit", "kindergarten");
  sandpit.position.set(76, 0.82, 7);
  community.add(sandpit);
  for (const [x, z, material] of [[34, 4, playYellow], [39, 11, playBlue], [75, 17, playRed]] as Array<[number, number, THREE.Material]>) {
    const playTower = communityMesh(new THREE.BoxGeometry(3.1, 2.6, 3.1), material, "residential-community-kindergarten-play-equipment", "kindergarten");
    playTower.position.set(x, 1.95, z);
    community.add(playTower);
  }
  const pickup = communityMesh(new THREE.BoxGeometry(55, 0.12, 7), asphalt, "residential-community-kindergarten-pickup-zone", "kindergarten");
  pickup.position.set(54, 0.55, 35.5);
  community.add(pickup);
  const pickupAccess = communityMesh(new THREE.BoxGeometry(7, 0.12, 28), asphalt, "residential-community-kindergarten-access-road", "kindergarten");
  pickupAccess.position.set(78, 0.56, 52);
  pickupAccess.userData = { oneWay: true, connectsPickupToPublicRoad: true, clearWidth: 7 };
  community.add(pickupAccess);
  for (let index = 0; index < 8; index += 1) {
    const marking = communityMesh(new THREE.BoxGeometry(4.5, 0.025, 0.12), playYellow, "residential-community-kindergarten-pickup-marking", "kindergarten");
    marking.position.set(30 + index * 7, 0.63, 35.5);
    community.add(marking);
  }

  // Reuse the established city furnishing collection across all three zones.
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const lightPositions: Array<[number, number]> = [
    [-84, 51], [-62, 60], [-36, 60], [-10, 60], [18, 60], [44, 60], [72, 60], [88, 48],
    [-82, 29], [-57, 27], [-30, 27], [-4, 27], [-82, -31], [-40, -31], [2, -31], [21, 32], [52, 32], [84, 32],
  ];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.58, z);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    community.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-72, 57], [-46, 57], [-20, 57], [6, 57], [32, 57], [58, 57], [-63, 8], [-25, 9], [31, 25], [78, 25]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.62, z);
    planter.scale.setScalar(1.1);
    planter.userData.sourceCollection = "city-street-furniture";
    community.add(planter);
  });
  const treePositions: Array<[number, number]> = [
    [-85, -58], [-60, -61], [-30, -61], [-3, -60], [-84, -38], [-57, -31], [-26, -33], [1, -38],
    [-84, -2], [-57, 0], [-4, 3], [-84, 21], [-55, 26], [-28, 25], [3, 21],
    [22, -59], [38, -62], [66, -62], [85, -59], [22, -43], [67, -40], [85, -17], [23, -7], [84, 4], [22, 20], [86, 22],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "residential-community-reused-tree-anchor";
    anchor.position.set(x, 0.55, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    community.add(anchor);
  });

  community.userData = {
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
