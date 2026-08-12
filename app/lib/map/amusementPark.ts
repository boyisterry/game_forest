import * as THREE from "three";
import { buildLowPolyFoodTruck, buildLowPolyRoadsidePlanter, buildLowPolyStreetLight } from "./cityFurniture.ts";

export type AmusementFacility =
  | "overview"
  | "coaster"
  | "carousel"
  | "pirate"
  | "playground"
  | "circus"
  | "shooting"
  | "karting"
  | "ferris"
  | "drop-tower";

export type AmusementParkModel = THREE.Group & {
  userData: {
    modelType: "amusement-park";
    generatedLocally: true;
    facilities: AmusementFacility[];
    facilityCount: number;
    attractionCount: number;
    cityBuildingCount: number;
    decorationSources: string[];
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    foodTruckCount: number;
    fenceSegmentCount: number;
    scaleReferenceLengthMeters: number;
    ferrisCabinCapacity: number;
    rideScaleStandard: "rabbit-rider";
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setMotionEnabled: (enabled: boolean) => void;
    update: (delta: number, elapsed: number) => void;
  };
};

function parkMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  facility?: AmusementFacility,
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (facility) object.userData.facility = facility;
  return object;
}

function beamBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  name: string,
  facility?: AmusementFacility,
) {
  const direction = end.clone().sub(start);
  const beam = parkMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, name, facility);
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
}

function assignFacility(root: THREE.Object3D, facility: AmusementFacility) {
  root.userData.facility = facility;
  root.traverse((object) => {
    if (!object.userData.facility) object.userData.facility = facility;
  });
}

export function buildLowPolyAmusementPark(): AmusementParkModel {
  const park = new THREE.Group() as AmusementParkModel;
  park.name = "city-amusement-park-lowpoly";

  const paving = new THREE.MeshStandardMaterial({ color: 0xe2d3b6, roughness: 0.93 });
  const road = new THREE.MeshStandardMaterial({ color: 0x4f555b, roughness: 0.98 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26333d, roughness: 0.64, metalness: 0.34 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab5b6, roughness: 0.42, metalness: 0.62 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf6e9c9, roughness: 0.82 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd94e46, roughness: 0.72 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3c7fa3, roughness: 0.7 });
  const aqua = new THREE.MeshStandardMaterial({ color: 0x50aaa3, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf0b94f, roughness: 0.74 });
  const purple = new THREE.MeshStandardMaterial({ color: 0x8b5ca5, roughness: 0.75 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe5879b, roughness: 0.78 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe77945, roughness: 0.75 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x5c8a55, roughness: 0.98 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x8b5e3d, roughness: 0.88 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4fa6bd, roughness: 0.24, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x67a7bb,
    emissive: 0x153846,
    emissiveIntensity: 0.06,
    roughness: 0.22,
    metalness: 0.16,
  });
  const ferrisCabinGlass = new THREE.MeshPhysicalMaterial({
    color: 0x9bd8e2,
    emissive: 0x214d5a,
    emissiveIntensity: 0.08,
    roughness: 0.12,
    metalness: 0.04,
    transmission: 0.46,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bulbMaterials = [0xff4d59, 0xffc857, 0x5ed2c7, 0x6ba9ff, 0xd886ff].map((color) => new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.12,
    roughness: 0.38,
  }));
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f8296,
    emissive: 0xffb45c,
    emissiveIntensity: 0.08,
    roughness: 0.3,
  });
  const animatedBulbs: THREE.MeshStandardMaterial[] = [...bulbMaterials, windowMaterial];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const reusedFoodTrucks: ReturnType<typeof buildLowPolyFoodTruck>[] = [];

  const site = parkMesh(new THREE.BoxGeometry(180, 0.4, 130), grass, "amusement-park-site-base", "overview");
  site.position.y = 0.2;
  park.add(site);

  // Full-height protective perimeter. The city-facing south edge leaves one
  // controlled opening aligned with the grand entrance and ticket booths.
  const protectionFence = new THREE.Group();
  protectionFence.name = "amusement-park-protection-fence";
  park.add(protectionFence);
  const addProtectionFenceSegment = (length: number, x: number, z: number, alongX: boolean) => {
    const segment = new THREE.Group();
    segment.name = "amusement-park-protection-fence-segment";
    segment.position.set(x, 0, z);
    segment.userData.controlledPerimeter = true;
    protectionFence.add(segment);
    const base = parkMesh(
      new THREE.BoxGeometry(alongX ? length : 0.55, 0.58, alongX ? 0.55 : length),
      ivory,
      "amusement-park-fence-masonry-base",
      "overview",
    );
    base.position.y = 0.69;
    segment.add(base);
    for (const height of [1.2, 3.0]) {
      const rail = parkMesh(
        new THREE.BoxGeometry(alongX ? length : 0.16, 0.16, alongX ? 0.16 : length),
        dark,
        "amusement-park-fence-horizontal-rail",
        "overview",
      );
      rail.position.y = height;
      segment.add(rail);
    }
    const posts = Math.ceil(length / 2.7);
    for (let index = 0; index <= posts; index += 1) {
      const offset = -length * 0.5 + index / posts * length;
      const post = parkMesh(new THREE.BoxGeometry(0.14, 2.55, 0.14), dark, "amusement-park-fence-post", "overview");
      post.position.set(alongX ? offset : 0, 1.87, alongX ? 0 : offset);
      segment.add(post);
    }
  };
  addProtectionFenceSegment(178, 0, -64, true);
  addProtectionFenceSegment(128, -89, 0, false);
  addProtectionFenceSegment(128, 89, 0, false);
  addProtectionFenceSegment(68, -55, 64, true);
  addProtectionFenceSegment(68, 55, 64, true);

  const promenade = parkMesh(new THREE.BoxGeometry(154, 0.12, 9.5), paving, "amusement-park-main-promenade", "overview");
  promenade.position.set(0, 0.46, 42);
  park.add(promenade);
  const centralWalk = parkMesh(new THREE.BoxGeometry(10, 0.13, 98), paving, "amusement-park-central-walk", "overview");
  centralWalk.position.set(0, 0.47, 4);
  park.add(centralWalk);
  for (const z of [-38, -12, 16]) {
    const crossWalk = parkMesh(new THREE.BoxGeometry(160, 0.11, 5.4), paving, "amusement-park-cross-walk", "overview");
    crossWalk.position.set(0, 0.47, z);
    park.add(crossWalk);
  }

  const perimeterRoads = [
    { size: [176, 5] as const, position: [0, 61] as const },
    { size: [176, 5] as const, position: [0, -61] as const },
    { size: [5, 118] as const, position: [-86, 0] as const },
    { size: [5, 118] as const, position: [86, 0] as const },
  ];
  perimeterRoads.forEach(({ size, position }) => {
    const lane = parkMesh(new THREE.BoxGeometry(size[0], 0.1, size[1]), road, "amusement-park-perimeter-road", "overview");
    lane.position.set(position[0], 0.48, position[1]);
    park.add(lane);
  });

  const addBulb = (parent: THREE.Object3D, x: number, y: number, z: number, index: number, name = "amusement-park-light-bulb") => {
    const bulb = parkMesh(new THREE.SphereGeometry(0.14, 8, 6), bulbMaterials[index % bulbMaterials.length], name);
    bulb.position.set(x, y, z);
    parent.add(bulb);
    return bulb;
  };

  const treeAnchors: THREE.Group[] = [];
  const addTreeAnchor = (x: number, z: number, scale = 1) => {
    const anchor = new THREE.Group();
    anchor.name = "amusement-park-reused-tree-anchor";
    anchor.position.set(x, 0.42, z);
    anchor.rotation.y = ((treeAnchors.length * 137.5) % 360) * Math.PI / 180;
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    anchor.userData.scaleMultiplier = scale;
    treeAnchors.push(anchor);
    park.add(anchor);
  };
  for (let x = -76; x <= 76; x += 12) {
    addTreeAnchor(x, 49.5, 0.9);
    if (Math.abs(x) > 10) addTreeAnchor(x, 33.5, 0.76);
  }
  for (const [x, z] of [[-81, 20], [-81, -10], [-81, -43], [81, 20], [81, -10], [81, -43]] as const) addTreeAnchor(x, z, 1);

  // Grand city-facing entrance and ticket plaza.
  const entrance = new THREE.Group();
  entrance.name = "amusement-park-grand-entrance";
  entrance.position.set(0, 0.5, 55);
  entrance.scale.setScalar(1.28);
  for (const x of [-8, 8]) {
    const tower = parkMesh(new THREE.CylinderGeometry(1.45, 1.8, 7.4, 10), ivory, "amusement-park-entrance-tower", "overview");
    tower.position.set(x, 3.7, 0);
    const roof = parkMesh(new THREE.ConeGeometry(2.2, 3.4, 10), x < 0 ? red : blue, "amusement-park-entrance-roof", "overview");
    roof.position.set(x, 9.1, 0);
    entrance.add(tower, roof);
  }
  const arch = new THREE.Group();
  for (let i = 0; i <= 16; i += 1) {
    const angle = Math.PI - i * Math.PI / 16;
    const x = Math.cos(angle) * 7.2;
    const y = 3.6 + Math.sin(angle) * 4.4;
    const block = parkMesh(new THREE.BoxGeometry(0.92, 0.85, 0.9), i % 2 ? red : ivory, "amusement-park-entrance-arch", "overview");
    block.position.set(x, y, 0);
    block.rotation.z = angle - Math.PI * 0.5;
    arch.add(block);
    addBulb(arch, x, y + 0.55, 0.55, i);
  }
  entrance.add(arch);
  for (const x of [-12, 12]) {
    const booth = parkMesh(new THREE.BoxGeometry(4.8, 3, 3.2), x < 0 ? pink : aqua, "amusement-park-ticket-booth", "overview");
    booth.position.set(x, 1.5, 0);
    const boothWindow = parkMesh(new THREE.BoxGeometry(2.4, 1.25, 0.08), windowMaterial, "amusement-park-ticket-window", "overview");
    boothWindow.position.set(x, 1.75, -1.64);
    entrance.add(booth, boothWindow);
  }
  park.add(entrance);

  // Central fountain works as the visual anchor for the ring promenade.
  const fountain = new THREE.Group();
  fountain.name = "amusement-park-central-fountain";
  fountain.position.set(0, 0.5, 39);
  fountain.scale.setScalar(1.25);
  const basin = parkMesh(new THREE.CylinderGeometry(4.3, 4.5, 0.55, 24), ivory, "amusement-park-fountain-basin", "overview");
  const pool = parkMesh(new THREE.CylinderGeometry(3.8, 3.8, 0.08, 24), water, "amusement-park-fountain-water", "overview");
  pool.position.y = 0.34;
  const column = parkMesh(new THREE.CylinderGeometry(0.45, 0.7, 3.2, 10), ivory, "amusement-park-fountain-column", "overview");
  column.position.y = 1.85;
  const crown = parkMesh(new THREE.ConeGeometry(1.25, 1.5, 10), yellow, "amusement-park-fountain-crown", "overview");
  crown.position.y = 4.2;
  fountain.add(basin, pool, column, crown);
  park.add(fountain);

  // Carousel.
  const carousel = new THREE.Group();
  carousel.name = "amusement-park-carousel";
  carousel.position.set(-38, 0.5, 17);
  carousel.scale.setScalar(1.52);
  const carouselTurntable = new THREE.Group();
  carouselTurntable.name = "amusement-park-carousel-turntable";
  carouselTurntable.position.y = 0.5;
  carousel.add(carouselTurntable);
  const carouselBase = parkMesh(new THREE.CylinderGeometry(5.8, 6.1, 0.75, 24), red, "amusement-park-carousel-base", "carousel");
  carouselTurntable.add(carouselBase);
  const carouselRoof = parkMesh(new THREE.ConeGeometry(6.2, 3.2, 24), ivory, "amusement-park-carousel-canopy", "carousel");
  carouselRoof.position.y = 6.9;
  carouselTurntable.add(carouselRoof);
  const carouselPole = parkMesh(new THREE.CylinderGeometry(0.45, 0.55, 7, 10), yellow, "amusement-park-carousel-center-pole", "carousel");
  carouselPole.position.y = 3.5;
  carouselTurntable.add(carouselPole);
  const horses: THREE.Group[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * Math.PI * 2;
    const horse = new THREE.Group();
    horse.name = "amusement-park-carousel-horse";
    horse.userData.phase = i / 12 * Math.PI * 2;
    const pole = parkMesh(new THREE.CylinderGeometry(0.08, 0.08, 5.6, 6), steel, "amusement-park-carousel-horse-pole", "carousel");
    pole.position.y = 3.3;
    const body = parkMesh(new THREE.CapsuleGeometry(0.42, 1.0, 3, 8), i % 2 ? blue : pink, "amusement-park-carousel-horse-body", "carousel");
    body.rotation.z = Math.PI * 0.5;
    body.position.y = 2.4;
    const head = parkMesh(new THREE.ConeGeometry(0.34, 0.9, 7), ivory, "amusement-park-carousel-horse-head", "carousel");
    head.rotation.z = -Math.PI * 0.32;
    head.position.set(0.75, 2.75, 0);
    horse.add(pole, body, head);
    horse.position.set(Math.cos(angle) * 4.1, 0, Math.sin(angle) * 4.1);
    horse.rotation.y = -angle;
    horses.push(horse);
    carouselTurntable.add(horse);
    addBulb(carouselTurntable, Math.cos(angle) * 5.2, 5.9, Math.sin(angle) * 5.2, i);
  }
  assignFacility(carousel, "carousel");
  park.add(carousel);

  // Pirate ship with a true suspended pivot.
  const pirate = new THREE.Group();
  pirate.name = "amusement-park-pirate-ship";
  pirate.position.set(-10, 0.5, 17);
  pirate.scale.setScalar(1.58);
  for (const side of [-1, 1]) {
    const left = new THREE.Vector3(side * 4.5, 0.25, -2.8);
    const right = new THREE.Vector3(side * 4.5, 0.25, 2.8);
    const top = new THREE.Vector3(side * 4.5, 8.5, 0);
    pirate.add(
      beamBetween(left, top, 0.22, steel, "amusement-park-pirate-support", "pirate"),
      beamBetween(right, top, 0.22, steel, "amusement-park-pirate-support", "pirate"),
    );
  }
  const piratePivot = new THREE.Group();
  piratePivot.name = "amusement-park-pirate-pivot";
  piratePivot.position.y = 8.1;
  const suspension = parkMesh(new THREE.CylinderGeometry(0.14, 0.14, 6.2, 8), dark, "amusement-park-pirate-suspension", "pirate");
  suspension.position.y = -3.1;
  const hull = parkMesh(new THREE.BoxGeometry(8.3, 1.6, 3), timber, "amusement-park-pirate-hull", "pirate");
  hull.position.y = -6.3;
  hull.rotation.z = -0.05;
  const bow = parkMesh(new THREE.ConeGeometry(1.55, 2.4, 4), red, "amusement-park-pirate-bow", "pirate");
  bow.rotation.z = -Math.PI * 0.5;
  bow.position.set(5.1, -6.15, 0);
  const mast = parkMesh(new THREE.CylinderGeometry(0.11, 0.16, 5, 7), dark, "amusement-park-pirate-mast", "pirate");
  mast.position.y = -3.5;
  const sail = parkMesh(new THREE.ConeGeometry(1.75, 3.7, 3), ivory, "amusement-park-pirate-sail", "pirate");
  sail.rotation.z = -Math.PI * 0.5;
  sail.position.set(1.5, -3.7, 0);
  piratePivot.add(suspension, hull, bow, mast, sail);
  pirate.add(piratePivot);
  park.add(pirate);

  // Ferris wheel with cabins that remain upright.
  const ferris = new THREE.Group();
  ferris.name = "amusement-park-ferris-wheel";
  ferris.position.set(53, 0.5, 14);
  for (const x of [-6.2, 6.2]) {
    ferris.add(
      beamBetween(new THREE.Vector3(x, 0.2, -3.8), new THREE.Vector3(0, 19, -1.8), 0.32, steel, "amusement-park-ferris-support", "ferris"),
      beamBetween(new THREE.Vector3(x, 0.2, 3.8), new THREE.Vector3(0, 19, 1.8), 0.32, steel, "amusement-park-ferris-support", "ferris"),
    );
  }
  const ferrisWheel = new THREE.Group();
  ferrisWheel.name = "amusement-park-ferris-wheel-rotor";
  ferrisWheel.position.y = 19;
  const ferrisRadius = 16;
  const rim = parkMesh(new THREE.TorusGeometry(ferrisRadius, 0.32, 8, 64), blue, "amusement-park-ferris-rim", "ferris");
  ferrisWheel.add(rim);
  const cabins: THREE.Group[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * Math.PI * 2;
    const spoke = parkMesh(new THREE.CylinderGeometry(0.11, 0.11, ferrisRadius, 6), steel, "amusement-park-ferris-spoke", "ferris");
    spoke.position.set(Math.cos(angle) * ferrisRadius * 0.5, Math.sin(angle) * ferrisRadius * 0.5, 0);
    spoke.rotation.z = angle - Math.PI * 0.5;
    ferrisWheel.add(spoke);
    const cabin = new THREE.Group();
    cabin.name = "amusement-park-ferris-cabin";
    cabin.userData.angle = angle;
    cabin.userData.capacity = 6;
    cabin.userData.enclosure = "sealed-glass";
    cabin.position.set(Math.cos(angle) * ferrisRadius, Math.sin(angle) * ferrisRadius, 0);
    const cabinFloor = parkMesh(new THREE.BoxGeometry(4.8, 0.3, 2.7), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-body", "ferris");
    cabinFloor.position.y = -0.62;
    const glassRoof = parkMesh(new THREE.BoxGeometry(4.72, 0.14, 2.62), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-roof", "ferris");
    glassRoof.position.y = 1.75;
    cabin.add(cabinFloor, glassRoof);

    // A solid waist-high perimeter protects seated passengers. Four glazed
    // upper walls and a glazed roof close the cabin without losing the view.
    for (const z of [-1.28, 1.28]) {
      const lowerPanel = parkMesh(new THREE.BoxGeometry(4.72, 0.76, 0.16), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-safety-panel", "ferris");
      lowerPanel.position.set(0, -0.08, z);
      const glazedWall = parkMesh(new THREE.BoxGeometry(4.5, 1.45, 0.08), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-wall", "ferris");
      glazedWall.position.set(0, 1.02, z);
      const handrail = parkMesh(new THREE.CylinderGeometry(0.055, 0.055, 4.55, 6), steel, "amusement-park-ferris-cabin-handrail", "ferris");
      handrail.rotation.z = Math.PI * 0.5;
      handrail.position.set(0, 0.36, z * 1.01);
      cabin.add(lowerPanel, glazedWall, handrail);
    }
    for (const x of [-2.32, 2.32]) {
      const lowerPanel = parkMesh(new THREE.BoxGeometry(0.16, 0.76, 2.42), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-safety-panel", "ferris");
      lowerPanel.position.set(x, -0.08, 0);
      const glazedWall = parkMesh(new THREE.BoxGeometry(0.08, 1.45, 2.3), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-wall", "ferris");
      glazedWall.position.set(x, 1.02, 0);
      cabin.add(lowerPanel, glazedWall);
    }
    for (const x of [-2.25, 2.25]) {
      for (const z of [-1.15, 1.15]) {
        const post = parkMesh(new THREE.CylinderGeometry(0.09, 0.09, 2.25, 6), steel, "amusement-park-ferris-cabin-post", "ferris");
        post.position.set(x, 0.55, z);
        cabin.add(post);
      }
    }
    for (const z of [-1.32, 1.32]) {
      const roofRail = parkMesh(new THREE.BoxGeometry(4.95, 0.16, 0.14), steel, "amusement-park-ferris-cabin-roof-frame", "ferris");
      roofRail.position.set(0, 1.78, z);
      cabin.add(roofRail);
    }
    for (const x of [-2.4, 2.4]) {
      const roofRail = parkMesh(new THREE.BoxGeometry(0.14, 0.16, 2.55), steel, "amusement-park-ferris-cabin-roof-frame", "ferris");
      roofRail.position.set(x, 1.78, 0);
      cabin.add(roofRail);
    }
    const doorFrame = parkMesh(new THREE.BoxGeometry(0.12, 1.45, 0.1), steel, "amusement-park-ferris-cabin-door-frame", "ferris");
    doorFrame.position.set(2.38, 0.98, 0);
    cabin.add(doorFrame);
    for (let seat = 0; seat < 6; seat += 1) {
      const seatPad = parkMesh(new THREE.BoxGeometry(1.15, 0.32, 0.68), pink, "amusement-park-ferris-cabin-seat", "ferris");
      seatPad.position.set(-1.45 + (seat % 3) * 1.45, -0.2, seat < 3 ? -0.78 : 0.78);
      cabin.add(seatPad);
    }
    cabins.push(cabin);
    ferrisWheel.add(cabin);
    addBulb(ferrisWheel, Math.cos(angle) * ferrisRadius, Math.sin(angle) * ferrisRadius, 1.65, i);
  }
  ferris.add(ferrisWheel);
  park.add(ferris);

  // Circus tent and family show plaza.
  const circus = new THREE.Group();
  circus.name = "amusement-park-circus";
  circus.position.set(-56, 0.5, -10);
  circus.scale.setScalar(1.35);
  const circusBody = parkMesh(new THREE.CylinderGeometry(7.2, 7.2, 4.2, 16), ivory, "amusement-park-circus-tent-body", "circus");
  circusBody.position.y = 2.1;
  const circusRoof = parkMesh(new THREE.ConeGeometry(8.2, 7.2, 16), red, "amusement-park-circus-tent-roof", "circus");
  circusRoof.position.y = 7.8;
  const circusDoor = parkMesh(new THREE.BoxGeometry(2.8, 3.2, 0.25), purple, "amusement-park-circus-entrance", "circus");
  circusDoor.position.set(0, 1.7, 7.25);
  const flagPole = parkMesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6), steel, "amusement-park-circus-flag-pole", "circus");
  flagPole.position.y = 13.1;
  const flag = parkMesh(new THREE.BoxGeometry(2.1, 1, 0.06), yellow, "amusement-park-circus-flag", "circus");
  flag.position.set(1.1, 14.2, 0);
  circus.add(circusBody, circusRoof, circusDoor, flagPole, flag);
  for (let i = 0; i < 16; i += 1) {
    const angle = i / 16 * Math.PI * 2;
    addBulb(circus, Math.cos(angle) * 7.1, 4.45, Math.sin(angle) * 7.1, i);
  }
  park.add(circus);

  // Indoor playground / 翻斗乐 pavilion.
  const playground = new THREE.Group();
  playground.name = "amusement-park-indoor-playground";
  playground.position.set(-24, 0.5, -10);
  playground.scale.setScalar(1.42);
  const playHall = parkMesh(new THREE.BoxGeometry(13, 6.8, 10), aqua, "amusement-park-playground-hall", "playground");
  playHall.position.y = 3.4;
  const playGlass = parkMesh(new THREE.BoxGeometry(11.5, 4.2, 0.1), glass, "amusement-park-playground-glass-wall", "playground");
  playGlass.position.set(0, 3.6, 5.05);
  const playRoof = parkMesh(new THREE.BoxGeometry(13.7, 0.6, 10.7), yellow, "amusement-park-playground-roof", "playground");
  playRoof.position.y = 7.05;
  playground.add(playHall, playGlass, playRoof);
  for (let i = 0; i < 3; i += 1) {
    const tower = parkMesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2 + i * 0.8, 10), [pink, blue, orange][i], "amusement-park-playground-climbing-tower", "playground");
    tower.position.set(-4 + i * 4, 2 + i * 0.4, 3.9);
    playground.add(tower);
  }
  const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 5.4, 4.2),
    new THREE.Vector3(-1.5, 6.1, 4.4),
    new THREE.Vector3(1.2, 4.4, 4.7),
    new THREE.Vector3(4.3, 5.6, 4.2),
  ]);
  const tubeSlide = parkMesh(new THREE.TubeGeometry(tubeCurve, 36, 0.52, 10, false), orange, "amusement-park-playground-tube-slide", "playground");
  playground.add(tubeSlide);
  park.add(playground);

  // Shooting gallery with moving targets.
  const shooting = new THREE.Group();
  shooting.name = "amusement-park-shooting-gallery";
  shooting.position.set(12, 0.5, -10);
  shooting.scale.setScalar(1.4);
  const gallery = parkMesh(new THREE.BoxGeometry(11, 5.2, 7), timber, "amusement-park-shooting-gallery-building", "shooting");
  gallery.position.y = 2.6;
  const galleryRoof = parkMesh(new THREE.BoxGeometry(12, 0.65, 8), red, "amusement-park-shooting-gallery-roof", "shooting");
  galleryRoof.position.y = 5.55;
  const counter = parkMesh(new THREE.BoxGeometry(10, 1, 1.2), yellow, "amusement-park-shooting-gallery-counter", "shooting");
  counter.position.set(0, 1, 4);
  shooting.add(gallery, galleryRoof, counter);
  const targets: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i += 1) {
    const target = parkMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 16), i % 2 ? blue : red, "amusement-park-shooting-target", "shooting");
    target.rotation.x = Math.PI * 0.5;
    target.position.set(-4.2 + i * 1.4, 2.5 + (i % 2) * 1.25, 3.58);
    target.userData.baseY = target.position.y;
    target.userData.phase = i * 0.7;
    targets.push(target);
    shooting.add(target);
  }
  park.add(shooting);

  // Drop tower and rotating observation ring.
  const dropTower = new THREE.Group();
  dropTower.name = "amusement-park-drop-tower";
  dropTower.position.set(69, 0.5, -8);
  dropTower.scale.setScalar(1.7);
  const tower = parkMesh(new THREE.CylinderGeometry(0.7, 1.2, 20, 10), dark, "amusement-park-drop-tower-column", "drop-tower");
  tower.position.y = 10;
  const towerCap = parkMesh(new THREE.ConeGeometry(2.2, 2.8, 10), red, "amusement-park-drop-tower-cap", "drop-tower");
  towerCap.position.y = 21.4;
  const dropCarriage = new THREE.Group();
  dropCarriage.name = "amusement-park-drop-tower-carriage";
  const carriage = parkMesh(new THREE.CylinderGeometry(2.4, 2.4, 1.2, 16), yellow, "amusement-park-drop-tower-seat-ring", "drop-tower");
  dropCarriage.add(carriage);
  dropCarriage.position.y = 4;
  dropTower.add(tower, towerCap, dropCarriage);
  park.add(dropTower);

  // Spinning teacups and bumper car pavilion fill the family district.
  const cups = new THREE.Group();
  cups.name = "amusement-park-spinning-cups";
  cups.position.set(18, 0.5, 17);
  cups.scale.setScalar(1.42);
  const cupBase = parkMesh(new THREE.CylinderGeometry(5.3, 5.5, 0.5, 20), purple, "amusement-park-spinning-cups-base", "overview");
  cups.add(cupBase);
  const cupCars: THREE.Group[] = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = i / 7 * Math.PI * 2;
    const cup = new THREE.Group();
    cup.name = "amusement-park-spinning-cup";
    const bowl = parkMesh(new THREE.CylinderGeometry(1.15, 0.78, 1.1, 12), bulbMaterials[i % bulbMaterials.length], "amusement-park-spinning-cup-body", "overview");
    bowl.position.y = 0.8;
    cup.add(bowl);
    cup.position.set(Math.cos(angle) * 3.25, 0.3, Math.sin(angle) * 3.25);
    cup.userData.phase = angle;
    cupCars.push(cup);
    cups.add(cup);
  }
  park.add(cups);

  const bumper = new THREE.Group();
  bumper.name = "amusement-park-bumper-cars";
  bumper.position.set(-68, 0.5, 17);
  bumper.scale.setScalar(1.38);
  const bumperFloor = parkMesh(new THREE.BoxGeometry(11, 0.45, 8), steel, "amusement-park-bumper-cars-floor", "overview");
  const bumperRoof = parkMesh(new THREE.BoxGeometry(12, 0.55, 9), blue, "amusement-park-bumper-cars-roof", "overview");
  bumperRoof.position.y = 5.8;
  bumper.add(bumperFloor, bumperRoof);
  for (const x of [-5.3, 5.3]) for (const z of [-3.8, 3.8]) {
    const post = parkMesh(new THREE.CylinderGeometry(0.15, 0.15, 5.6, 6), dark, "amusement-park-bumper-cars-post", "overview");
    post.position.set(x, 2.8, z);
    bumper.add(post);
  }
  const bumperCars: THREE.Group[] = [];
  for (let i = 0; i < 5; i += 1) {
    const car = new THREE.Group();
    car.name = "amusement-park-bumper-car";
    const body = parkMesh(new THREE.BoxGeometry(2.15, 0.7, 1.35), bulbMaterials[i], "amusement-park-bumper-car-body", "overview");
    body.position.y = 0.55;
    car.add(body);
    car.userData.phase = i * 1.3;
    bumperCars.push(car);
    bumper.add(car);
  }
  park.add(bumper);

  // Roller coaster uses two rails, repeated supports, and a four-car train.
  const coaster = new THREE.Group();
  coaster.name = "amusement-park-roller-coaster";
  const coasterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-78, 6, -49),
    new THREE.Vector3(-62, 13, -52),
    new THREE.Vector3(-45, 32, -49),
    new THREE.Vector3(-24, 8, -49),
    new THREE.Vector3(2, 22, -41),
    new THREE.Vector3(-10, 6, -27),
    new THREE.Vector3(-38, 11, -25),
    new THREE.Vector3(-69, 6, -32),
  ], true, "catmullrom", 0.35);
  for (const zOffset of [-0.55, 0.55]) {
    const railCurve = new THREE.CatmullRomCurve3(coasterCurve.points.map((point) => point.clone().add(new THREE.Vector3(0, 0, zOffset))), true, "catmullrom", 0.35);
    coaster.add(parkMesh(new THREE.TubeGeometry(railCurve, 220, 0.24, 6, true), red, "amusement-park-coaster-rail", "coaster"));
  }
  for (let i = 0; i < 48; i += 1) {
    const point = coasterCurve.getPointAt(i / 48);
    const support = parkMesh(new THREE.CylinderGeometry(0.18, 0.24, Math.max(0.4, point.y - 0.45), 6), steel, "amusement-park-coaster-support", "coaster");
    support.position.set(point.x, point.y * 0.5 + 0.2, point.z);
    coaster.add(support);
  }
  const coasterTrain = new THREE.Group();
  coasterTrain.name = "amusement-park-coaster-train";
  const coasterCars: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const car = parkMesh(new THREE.BoxGeometry(1.55, 1.05, 2.5), i % 2 ? yellow : blue, "amusement-park-coaster-car", "coaster");
    coasterCars.push(car);
    coasterTrain.add(car);
  }
  coaster.add(coasterTrain);
  park.add(coaster);

  // Kart circuit follows the entertainment district at the eastern edge.
  const karting = new THREE.Group();
  karting.name = "amusement-park-karting-circuit";
  const kartCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(17, 0.7, -45),
    new THREE.Vector3(38, 0.7, -53),
    new THREE.Vector3(69, 0.7, -46),
    new THREE.Vector3(74, 0.7, -29),
    new THREE.Vector3(57, 0.7, -20),
    new THREE.Vector3(30, 0.7, -23),
    new THREE.Vector3(15, 0.7, -33),
  ], true, "catmullrom", 0.35);
  const kartTrack = parkMesh(new THREE.TubeGeometry(kartCurve, 180, 3.3, 8, true), road, "amusement-park-kart-track", "karting");
  kartTrack.rotation.x = 0;
  karting.add(kartTrack);
  for (const offset of [-2.25, 2.25]) {
    const lineCurve = new THREE.CatmullRomCurve3(kartCurve.points.map((point) => point.clone().add(new THREE.Vector3(0, 0.08, offset * 0.25))), true, "catmullrom", 0.35);
    karting.add(parkMesh(new THREE.TubeGeometry(lineCurve, 180, 0.09, 5, true), ivory, "amusement-park-kart-track-line", "karting"));
  }
  const karts: THREE.Group[] = [];
  for (let i = 0; i < 6; i += 1) {
    const kart = new THREE.Group();
    kart.name = "amusement-park-go-kart";
    kart.userData.phase = i / 6;
    const body = parkMesh(new THREE.BoxGeometry(1.3, 0.62, 2.35), bulbMaterials[i % bulbMaterials.length], "amusement-park-go-kart-body", "karting");
    body.position.y = 0.4;
    const driver = parkMesh(new THREE.SphereGeometry(0.35, 8, 6), ivory, "amusement-park-go-kart-driver", "karting");
    driver.position.set(-0.2, 1.05, 0);
    kart.add(body, driver);
    karts.push(kart);
    karting.add(kart);
  }
  const kartPit = parkMesh(new THREE.BoxGeometry(18, 5.5, 6), orange, "amusement-park-kart-pit-building", "karting");
  kartPit.position.set(42, 3.2, -55);
  karting.add(kartPit);
  park.add(karting);

  // A compact city skyline makes the amusement park a self-contained urban display district.
  const city = new THREE.Group();
  city.name = "amusement-park-city-skyline";
  const buildingSpecs = [
    [-78, 10, 9, 15, blue], [-64, 9, 8, 21, ivory], [-50, 10, 8, 14, pink],
    [14, 10, 8, 16, aqua], [31, 9, 9, 22, ivory], [48, 11, 8, 15, orange], [65, 9, 9, 25, blue], [79, 8, 8, 18, purple],
  ] as const;
  buildingSpecs.forEach(([x, width, depth, height, material], buildingIndex) => {
    const building = parkMesh(new THREE.BoxGeometry(width, height, depth), material, "amusement-park-city-building", "overview");
    building.position.set(x, height * 0.5 + 0.45, -57);
    city.add(building);
    const floors = Math.max(3, Math.floor(height / 2.2));
    for (let floor = 0; floor < floors; floor += 1) {
      for (const wx of [-0.28, 0, 0.28]) {
        const window = parkMesh(new THREE.BoxGeometry(width * 0.16, 0.75, 0.08), windowMaterial, "amusement-park-city-window", "overview");
        window.position.set(x + wx * width, 1.7 + floor * 2.0, -57 + depth * 0.5 + 0.05);
        city.add(window);
      }
    }
    if (buildingIndex % 2 === 0) {
      const roof = parkMesh(new THREE.ConeGeometry(width * 0.24, 2.2, 4), dark, "amusement-park-city-roof", "overview");
      roof.position.set(x, height + 1.55, -57);
      roof.rotation.y = Math.PI * 0.25;
      city.add(roof);
    }
  });
  park.add(city);

  // Shops and benches frame the promenade. Common props below reuse the exact
  // city-furniture builders already used by the main model showroom.
  for (const x of [-74, -63, 63, 74]) {
    const shop = parkMesh(new THREE.BoxGeometry(5.6, 3.6, 4), x < 0 ? pink : yellow, "amusement-park-promenade-shop", "overview");
    shop.position.set(x, 2.3, 45.5);
    const awning = parkMesh(new THREE.BoxGeometry(6.1, 0.35, 1.5), x < 0 ? ivory : red, "amusement-park-promenade-awning", "overview");
    awning.position.set(x, 3.8, 42.9);
    park.add(shop, awning);
  }
  for (const x of [-28, -16, 16, 28]) {
    const bench = parkMesh(new THREE.BoxGeometry(3.2, 0.35, 0.7), timber, "amusement-park-bench", "overview");
    bench.position.set(x, 1, 46.5);
    park.add(bench);
  }

  for (const [x, z, rotation] of [[-39, 47.5, 0], [39, 47.5, Math.PI]] as const) {
    const truck = buildLowPolyFoodTruck();
    truck.position.set(x, 0.5, z);
    truck.rotation.y = rotation;
    truck.scale.setScalar(0.72);
    truck.userData.setServingOpen(true);
    truck.userData.sourceCollection = "city-street-furniture";
    reusedFoodTrucks.push(truck);
    park.add(truck);
  }

  const planterPositions = [
    [-49, 35.2, 0], [-26, 35.2, 0], [26, 35.2, 0], [49, 35.2, 0],
    [-49, 51.7, Math.PI], [-26, 51.7, Math.PI], [26, 51.7, Math.PI], [49, 51.7, Math.PI],
  ] as const;
  planterPositions.forEach(([x, z, rotation]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.5, z);
    planter.rotation.y = rotation;
    planter.scale.setScalar(0.72);
    planter.userData.sourceCollection = "city-street-furniture";
    park.add(planter);
  });

  for (let x = -70; x <= 70; x += 14) {
    for (const [z, rotation] of [[34.5, 0], [50.5, Math.PI]] as const) {
      const streetLight = buildLowPolyStreetLight();
      streetLight.position.set(x, 0.5, z);
      streetLight.rotation.y = rotation;
      streetLight.scale.setScalar(0.64);
      streetLight.userData.sourceCollection = "city-street-furniture";
      reusedStreetLights.push(streetLight);
      park.add(streetLight);
    }
  }

  let motionEnabled = true;
  let rideTime = 0;
  const tempPoint = new THREE.Vector3();
  const tempTangent = new THREE.Vector3();

  park.userData = {
    modelType: "amusement-park",
    generatedLocally: true,
    facilities: ["overview", "coaster", "carousel", "pirate", "playground", "circus", "shooting", "karting", "ferris", "drop-tower"],
    facilityCount: 10,
    attractionCount: 12,
    cityBuildingCount: buildingSpecs.length,
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
      "city-food-truck-lowpoly",
    ],
    treeAnchorCount: treeAnchors.length,
    streetLightCount: reusedStreetLights.length,
    planterCount: planterPositions.length,
    foodTruckCount: reusedFoodTrucks.length,
    fenceSegmentCount: 5,
    scaleReferenceLengthMeters: 2.4,
    ferrisCabinCapacity: 6,
    rideScaleStandard: "rabbit-rider",
    siteSize: new THREE.Vector3(180, 39.5, 130),
    setPowered(powered: boolean) {
      animatedBulbs.forEach((material, index) => {
        material.emissiveIntensity = powered ? 2.2 + (index % 3) * 0.35 : (material === windowMaterial ? 0.08 : 0.12);
      });
      windowMaterial.color.setHex(powered ? 0xffc775 : 0x4f8296);
      ferrisCabinGlass.emissive.setHex(powered ? 0x7b521e : 0x214d5a);
      ferrisCabinGlass.emissiveIntensity = powered ? 0.48 : 0.08;
      reusedStreetLights.forEach((streetLight) => streetLight.userData.setPowered(powered));
      reusedFoodTrucks.forEach((truck) => truck.userData.setLights(powered));
    },
    setMotionEnabled(enabled: boolean) {
      motionEnabled = enabled;
    },
    update(delta: number, elapsed: number) {
      if (motionEnabled) rideTime += Math.min(delta, 0.05);
      const time = motionEnabled ? rideTime : rideTime;

      carouselTurntable.rotation.y = time * 0.52;
      horses.forEach((horse) => { horse.position.y = Math.sin(time * 2.3 + horse.userData.phase) * 0.35; });
      piratePivot.rotation.z = Math.sin(time * 0.88) * 0.72;
      ferrisWheel.rotation.z = time * 0.14;
      cabins.forEach((cabin) => { cabin.rotation.z = -ferrisWheel.rotation.z; });
      dropCarriage.position.y = 4 + (Math.sin(time * 0.78 - Math.PI * 0.5) * 0.5 + 0.5) * 14.5;
      dropCarriage.rotation.y = time * 0.34;
      cups.rotation.y = time * 0.42;
      cupCars.forEach((cup) => { cup.rotation.y = -time * 1.25 + cup.userData.phase; });
      targets.forEach((target) => { target.position.y = target.userData.baseY + Math.sin(time * 1.8 + target.userData.phase) * 0.34; });
      bumperCars.forEach((car, index) => {
        const phase = car.userData.phase;
        car.position.set(Math.sin(time * (0.44 + index * 0.02) + phase) * 4, 0.25, Math.cos(time * (0.56 + index * 0.02) + phase * 1.3) * 2.7);
        car.rotation.y = time * 0.6 + phase;
      });

      const trainProgress = (time * 0.035) % 1;
      coasterCars.forEach((car, index) => {
        const progress = (trainProgress - index * 0.012 + 1) % 1;
        coasterCurve.getPointAt(progress, tempPoint);
        coasterCurve.getTangentAt(progress, tempTangent);
        car.position.copy(tempPoint);
        car.lookAt(tempPoint.clone().add(tempTangent));
      });
      karts.forEach((kart, index) => {
        const progress = (time * (0.045 + index * 0.0015) + kart.userData.phase) % 1;
        kartCurve.getPointAt(progress, tempPoint);
        kartCurve.getTangentAt(progress, tempTangent);
        kart.position.copy(tempPoint).add(new THREE.Vector3(0, 0.65, 0));
        kart.lookAt(tempPoint.clone().add(tempTangent));
      });

      if (elapsed > -1) {
        bulbMaterials.forEach((material, index) => {
          if (material.emissiveIntensity > 1) material.emissiveIntensity = 1.8 + (Math.sin(elapsed * 3 + index * 1.2) * 0.5 + 0.5) * 1.4;
        });
      }
    },
  };

  park.userData.setPowered(false);
  park.userData.setMotionEnabled(true);
  return park;
}
