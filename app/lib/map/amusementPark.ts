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
    rideSafetyFenceCount: number;
    entranceGateLaneCount: number;
    entranceClearWidth: number;
    loadingGateCount: number;
    loadingAccessCount: number;
    indoorPlaygroundEntranceWidth: number;
    shootingServiceOpeningWidth: number;
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

function buildFlatRibbonGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number, halfWidth: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).setY(0).normalize();
    normal.set(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
    const left = point.clone().add(normal);
    const right = point.clone().sub(normal);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, t * 12, 1, t * 12);
    if (index === segments) continue;
    const a = index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  const playNet = new THREE.MeshStandardMaterial({
    color: 0xf4f0d6,
    roughness: 0.72,
    transparent: true,
    opacity: 0.48,
    wireframe: true,
    side: THREE.DoubleSide,
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
  // Return the perimeter to the ticket booths so visitors cannot bypass the
  // controlled central opening along either side of the entrance plaza.
  addProtectionFenceSegment(9, -21, 59.5, false);
  addProtectionFenceSegment(9, 21, 59.5, false);
  addProtectionFenceSegment(2.6, -19.7, 55, true);
  addProtectionFenceSegment(2.6, 19.7, 55, true);

  const promenade = parkMesh(new THREE.BoxGeometry(154, 0.12, 9.5), paving, "amusement-park-main-promenade", "overview");
  promenade.position.set(0, 0.46, 42);
  park.add(promenade);
  const centralWalk = parkMesh(new THREE.BoxGeometry(10, 0.13, 98), paving, "amusement-park-central-walk", "overview");
  centralWalk.position.set(0, 0.47, 4);
  park.add(centralWalk);
  for (const z of [-38, -12, 32]) {
    const crossWalk = parkMesh(new THREE.BoxGeometry(160, 0.11, 5.4), paving, "amusement-park-cross-walk", "overview");
    crossWalk.position.set(0, 0.47, z);
    park.add(crossWalk);
  }

  const perimeterRoads = [
    { size: [68, 5] as const, position: [-55, 61] as const },
    { size: [68, 5] as const, position: [55, 61] as const },
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

  const addRideSafetyFence = (
    facility: AmusementFacility,
    centerX: number,
    centerZ: number,
    width: number,
    depth: number,
    gateWidth = 3.2,
    gateSide: "front" | "right" = "front",
  ) => {
    const fence = new THREE.Group();
    fence.name = `amusement-park-${facility}-safety-fence`;
    fence.userData = { facility, gateSide };
    const addRail = (railWidth: number, railDepth: number, x: number, z: number) => {
      for (const y of [0.68, 1.28]) {
        const rail = parkMesh(new THREE.BoxGeometry(railWidth, 0.14, railDepth), dark, "amusement-park-ride-safety-rail", facility);
        rail.position.set(x, y, z);
        fence.add(rail);
      }
    };
    addRail(width, 0.12, centerX, centerZ - depth * 0.5);
    addRail(0.12, depth, centerX - width * 0.5, centerZ);
    const postPositions: Array<[number, number]> = [
      [centerX - width * 0.5, centerZ - depth * 0.5], [centerX + width * 0.5, centerZ - depth * 0.5],
      [centerX - width * 0.5, centerZ + depth * 0.5], [centerX + width * 0.5, centerZ + depth * 0.5],
    ];
    if (gateSide === "front") {
      addRail(0.12, depth, centerX + width * 0.5, centerZ);
      const frontSideWidth = (width - gateWidth) * 0.5;
      addRail(frontSideWidth, 0.12, centerX - (gateWidth + frontSideWidth) * 0.5, centerZ + depth * 0.5);
      addRail(frontSideWidth, 0.12, centerX + (gateWidth + frontSideWidth) * 0.5, centerZ + depth * 0.5);
      postPositions.push(
        [centerX - gateWidth * 0.5, centerZ + depth * 0.5],
        [centerX + gateWidth * 0.5, centerZ + depth * 0.5],
      );
    } else {
      addRail(width, 0.12, centerX, centerZ + depth * 0.5);
      const sideDepth = (depth - gateWidth) * 0.5;
      addRail(0.12, sideDepth, centerX + width * 0.5, centerZ - (gateWidth + sideDepth) * 0.5);
      addRail(0.12, sideDepth, centerX + width * 0.5, centerZ + (gateWidth + sideDepth) * 0.5);
      postPositions.push(
        [centerX + width * 0.5, centerZ - gateWidth * 0.5],
        [centerX + width * 0.5, centerZ + gateWidth * 0.5],
      );
    }
    postPositions.forEach(([x, z]) => {
      const post = parkMesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), dark, "amusement-park-ride-safety-post", facility);
      post.position.set(x, 0.92, z);
      fence.add(post);
    });
    const gatePivot = new THREE.Group();
    gatePivot.name = "amusement-park-ride-loading-gate";
    gatePivot.position.set(
      gateSide === "front" ? centerX - gateWidth * 0.5 : centerX + width * 0.5,
      0,
      gateSide === "front" ? centerZ + depth * 0.5 : centerZ - gateWidth * 0.5,
    );
    gatePivot.rotation.y = gateSide === "front" ? Math.PI * 0.5 : 0;
    gatePivot.userData = { facility, operable: true, clearWidth: gateWidth, state: "open" };
    for (const y of [0.68, 1.28]) {
      const gateRail = parkMesh(new THREE.BoxGeometry(gateWidth, 0.14, 0.12), yellow, "amusement-park-ride-loading-gate-rail", facility);
      gateRail.position.set(gateWidth * 0.5, y, 0);
      gatePivot.add(gateRail);
    }
    fence.add(gatePivot);
    park.add(fence);
    return fence;
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
  const entranceGate = new THREE.Group();
  entranceGate.name = "amusement-park-entrance-gate";
  entranceGate.userData = { laneCount: 3, clearWidth: 15.48, state: "open" };
  for (const x of [-8.1, -2.7, 2.7, 8.1]) {
    const post = parkMesh(new THREE.BoxGeometry(0.24, 2.25, 0.24), dark, "amusement-park-entrance-gate-post", "overview");
    post.position.set(x, 1.525, 58);
    const scanner = parkMesh(new THREE.BoxGeometry(0.44, 0.28, 0.5), aqua, "amusement-park-entrance-gate-scanner", "overview");
    scanner.position.set(x, 2.55, 58);
    entranceGate.add(post, scanner);
  }
  for (const x of [-5.4, 0, 5.4]) {
    const laneMarker = parkMesh(new THREE.BoxGeometry(4.8, 0.025, 0.12), ivory, "amusement-park-entrance-gate-lane", "overview");
    laneMarker.position.set(x, 0.515, 58);
    entranceGate.add(laneMarker);
  }
  park.add(entranceGate);

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
  carousel.position.set(-43, 0.5, 17);
  carousel.scale.setScalar(1.52);
  const carouselTurntable = new THREE.Group();
  carouselTurntable.name = "amusement-park-carousel-turntable";
  carouselTurntable.position.y = 0.5;
  carousel.add(carouselTurntable);
  const carouselBase = parkMesh(new THREE.CylinderGeometry(5.8, 6.1, 0.75, 24), red, "amusement-park-carousel-base", "carousel");
  const carouselDeck = parkMesh(new THREE.CylinderGeometry(5.65, 5.65, 0.16, 24), ivory, "amusement-park-carousel-deck", "carousel");
  carouselDeck.position.y = 0.46;
  const carouselTrim = parkMesh(new THREE.TorusGeometry(5.78, 0.16, 8, 36), yellow, "amusement-park-carousel-decorative-trim", "carousel");
  carouselTrim.rotation.x = Math.PI * 0.5;
  carouselTrim.position.y = 0.43;
  carouselTurntable.add(carouselBase, carouselDeck, carouselTrim);
  const carouselRoof = parkMesh(new THREE.ConeGeometry(6.2, 3.2, 24), ivory, "amusement-park-carousel-canopy", "carousel");
  carouselRoof.position.y = 6.9;
  carouselTurntable.add(carouselRoof);
  const carouselPole = parkMesh(new THREE.CylinderGeometry(0.45, 0.55, 7, 10), yellow, "amusement-park-carousel-center-pole", "carousel");
  carouselPole.position.y = 3.5;
  const carouselCrown = parkMesh(new THREE.SphereGeometry(0.52, 10, 8), red, "amusement-park-carousel-canopy-crown", "carousel");
  carouselCrown.position.y = 8.62;
  carouselTurntable.add(carouselPole, carouselCrown);
  for (let panelIndex = 0; panelIndex < 12; panelIndex += 1) {
    const angle = panelIndex / 12 * Math.PI * 2;
    const valance = parkMesh(new THREE.BoxGeometry(2.85, 0.7, 0.16), panelIndex % 2 ? red : blue, "amusement-park-carousel-canopy-valance", "carousel");
    valance.position.set(Math.cos(angle) * 5.6, 5.55, Math.sin(angle) * 5.6);
    valance.rotation.y = -angle;
    carouselTurntable.add(valance);
  }
  const horses: THREE.Group[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * Math.PI * 2;
    const horse = new THREE.Group();
    horse.name = "amusement-park-carousel-horse";
    horse.userData = { phase: i / 12 * Math.PI * 2, passengerCapacity: 1, saddleFitted: true, footStirrups: true };
    const pole = parkMesh(new THREE.CylinderGeometry(0.08, 0.08, 5.6, 6), steel, "amusement-park-carousel-horse-pole", "carousel");
    pole.position.y = 3.3;
    const horseMaterial = i % 3 === 0 ? ivory : i % 2 ? blue : pink;
    const body = parkMesh(new THREE.CapsuleGeometry(0.54, 1.4, 4, 10), horseMaterial, "amusement-park-carousel-horse-body", "carousel");
    body.rotation.z = Math.PI * 0.5;
    body.position.y = 2.5;
    const neck = parkMesh(new THREE.CapsuleGeometry(0.28, 0.72, 3, 8), horseMaterial, "amusement-park-carousel-horse-neck", "carousel");
    neck.rotation.z = -0.52;
    neck.position.set(0.92, 2.92, 0);
    const head = parkMesh(new THREE.CapsuleGeometry(0.3, 0.48, 3, 8), horseMaterial, "amusement-park-carousel-horse-head", "carousel");
    head.rotation.z = -Math.PI * 0.38;
    head.position.set(1.35, 3.38, 0);
    const muzzle = parkMesh(new THREE.CapsuleGeometry(0.18, 0.28, 3, 8), ivory, "amusement-park-carousel-horse-muzzle", "carousel");
    muzzle.rotation.z = Math.PI * 0.5;
    muzzle.position.set(1.68, 3.22, 0);
    horse.add(pole, body, neck, head, muzzle);
    for (const earZ of [-0.17, 0.17]) {
      const ear = parkMesh(new THREE.ConeGeometry(0.11, 0.4, 6), horseMaterial, "amusement-park-carousel-horse-ear", "carousel");
      ear.position.set(1.22, 3.85, earZ);
      ear.rotation.z = -0.24;
      horse.add(ear);
    }
    for (const [legX, legZ, legTilt] of [[-0.68, -0.3, -0.12], [-0.58, 0.3, 0.12], [0.62, -0.3, 0.18], [0.7, 0.3, -0.18]] as Array<[number, number, number]>) {
      const leg = parkMesh(new THREE.CylinderGeometry(0.11, 0.14, 1.25, 7), horseMaterial, "amusement-park-carousel-horse-leg", "carousel");
      leg.position.set(legX, 1.72, legZ);
      leg.rotation.z = legTilt;
      const hoof = parkMesh(new THREE.BoxGeometry(0.34, 0.2, 0.28), dark, "amusement-park-carousel-horse-hoof", "carousel");
      hoof.position.set(legX + legTilt * 0.45, 1.05, legZ);
      horse.add(leg, hoof);
    }
    const saddleBlanket = parkMesh(new THREE.BoxGeometry(1.08, 0.12, 0.88), red, "amusement-park-carousel-saddle-blanket", "carousel");
    saddleBlanket.position.set(-0.08, 2.98, 0);
    const saddle = parkMesh(new THREE.CapsuleGeometry(0.27, 0.56, 3, 8), dark, "amusement-park-carousel-saddle", "carousel");
    saddle.rotation.z = Math.PI * 0.5;
    saddle.position.set(-0.08, 3.12, 0);
    const bridle = parkMesh(new THREE.TorusGeometry(0.31, 0.045, 6, 12), red, "amusement-park-carousel-horse-bridle", "carousel");
    bridle.rotation.y = Math.PI * 0.5;
    bridle.position.set(1.42, 3.38, 0);
    const tail = parkMesh(new THREE.ConeGeometry(0.28, 1.25, 8), ivory, "amusement-park-carousel-horse-tail", "carousel");
    tail.rotation.z = -Math.PI * 0.42;
    tail.position.set(-1.32, 2.35, 0);
    horse.add(saddleBlanket, saddle, bridle, tail);
    for (const side of [-1, 1]) {
      const stirrup = parkMesh(new THREE.TorusGeometry(0.18, 0.035, 6, 10), steel, "amusement-park-carousel-stirrup", "carousel");
      stirrup.position.set(-0.05, 2.45, side * 0.58);
      stirrup.rotation.x = Math.PI * 0.5;
      horse.add(stirrup);
    }
    horse.position.set(Math.cos(angle) * 4.1, 0, Math.sin(angle) * 4.1);
    horse.rotation.y = -angle;
    horses.push(horse);
    carouselTurntable.add(horse);
    addBulb(carouselTurntable, Math.cos(angle) * 5.2, 5.9, Math.sin(angle) * 5.2, i);
  }
  assignFacility(carousel, "carousel");
  park.add(carousel);
  for (let index = 0; index < 5; index += 1) {
    const height = 0.28 * (index + 1);
    const step = parkMesh(new THREE.BoxGeometry(4.2, height, 0.72), paving, "amusement-park-carousel-loading-step", "carousel");
    step.position.set(-43, 0.4 + height * 0.5, 26.7 + index * 0.62);
    park.add(step);
  }

  // Pirate ship with a true suspended pivot.
  const pirate = new THREE.Group();
  pirate.name = "amusement-park-pirate-ship";
  pirate.position.set(-15, 0.4, 18);
  pirate.scale.setScalar(1.58);
  pirate.userData = { passengerCapacity: 24, seatRowCount: 6, restraintsPerSeat: true, truePivotAxis: true, operableBoardingGates: 2 };
  for (const side of [-1, 1]) {
    const left = new THREE.Vector3(side * 4.5, 0.08, -2.8);
    const right = new THREE.Vector3(side * 4.5, 0.08, 2.8);
    const top = new THREE.Vector3(side * 4.5, 11.1, 0);
    pirate.add(
      beamBetween(left, top, 0.22, steel, "amusement-park-pirate-support", "pirate"),
      beamBetween(right, top, 0.22, steel, "amusement-park-pirate-support", "pirate"),
    );
    const foundationA = parkMesh(new THREE.CylinderGeometry(0.72, 0.92, 0.36, 10), dark, "amusement-park-pirate-foundation", "pirate");
    foundationA.position.set(side * 4.5, 0.18, -2.8);
    const foundationB = foundationA.clone();
    foundationB.name = "amusement-park-pirate-foundation";
    foundationB.position.z = 2.8;
    const frameBrace = beamBetween(new THREE.Vector3(side * 4.5, 2.3, -2.2), new THREE.Vector3(side * 4.5, 2.3, 2.2), 0.13, steel, "amusement-park-pirate-frame-brace", "pirate");
    pirate.add(foundationA, foundationB, frameBrace);
  }
  const pivotAxle = beamBetween(new THREE.Vector3(-4.95, 11.1, 0), new THREE.Vector3(4.95, 11.1, 0), 0.28, dark, "amusement-park-pirate-pivot-axle", "pirate");
  pirate.add(pivotAxle);
  for (const side of [-1, 1]) {
    const bearing = parkMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.48, 12), yellow, "amusement-park-pirate-pivot-bearing", "pirate");
    bearing.rotation.z = Math.PI * 0.5;
    bearing.position.set(side * 4.5, 11.1, 0);
    pirate.add(bearing);
  }
  const piratePivot = new THREE.Group();
  piratePivot.name = "amusement-park-pirate-pivot";
  piratePivot.position.y = 11.1;
  piratePivot.userData = { pivotAxis: "z", maximumSwingRadians: 0.3, suspendedFromBearings: true };
  const suspension = parkMesh(new THREE.CylinderGeometry(0.16, 0.16, 7.8, 8), dark, "amusement-park-pirate-suspension", "pirate");
  suspension.position.y = -3.9;
  for (const side of [-1, 1]) {
    const suspensionArm = beamBetween(new THREE.Vector3(side * 3.45, -0.05, 0), new THREE.Vector3(side * 3.45, -7.05, 0), 0.14, steel, "amusement-park-pirate-suspension-arm", "pirate");
    piratePivot.add(suspensionArm);
  }

  const shipBody = new THREE.Group();
  shipBody.name = "amusement-park-pirate-ship-body";
  shipBody.rotation.z = -0.05;
  shipBody.userData = { deckCapacity: 24, seatRows: 6, hullLayers: 3 };
  const hull = parkMesh(new THREE.BoxGeometry(8.3, 1.6, 3), timber, "amusement-park-pirate-hull", "pirate");
  hull.position.y = -7.9;
  const keel = parkMesh(new THREE.CapsuleGeometry(0.62, 6.9, 4, 12), dark, "amusement-park-pirate-keel", "pirate");
  keel.rotation.z = Math.PI * 0.5;
  keel.scale.z = 1.35;
  keel.position.y = -8.45;
  const deck = parkMesh(new THREE.BoxGeometry(8.15, 0.18, 2.65), ivory, "amusement-park-pirate-deck", "pirate");
  deck.position.y = -7.02;
  const bow = parkMesh(new THREE.ConeGeometry(1.55, 2.4, 4), red, "amusement-park-pirate-bow", "pirate");
  bow.rotation.z = -Math.PI * 0.5;
  bow.position.set(5.1, -7.75, 0);
  const stern = parkMesh(new THREE.ConeGeometry(1.2, 2, 4), blue, "amusement-park-pirate-stern", "pirate");
  stern.rotation.z = Math.PI * 0.5;
  stern.position.set(-4.9, -7.78, 0);
  shipBody.add(hull, keel, deck, bow, stern);

  for (const side of [-1, 1]) {
    const sidePanel = parkMesh(new THREE.BoxGeometry(8.55, 1.42, 0.16), side > 0 ? red : blue, "amusement-park-pirate-hull-side-panel", "pirate");
    sidePanel.position.set(0, -7.82, side * 1.54);
    shipBody.add(sidePanel);
    for (let portIndex = 0; portIndex < 6; portIndex += 1) {
      const porthole = parkMesh(new THREE.TorusGeometry(0.18, 0.055, 6, 10), yellow, "amusement-park-pirate-porthole", "pirate");
      porthole.position.set(-3.25 + portIndex * 1.3, -7.72, side * 1.64);
      porthole.rotation.x = Math.PI * 0.5;
      shipBody.add(porthole);
    }
    for (let railIndex = 0; railIndex < 8; railIndex += 1) {
      if (railIndex === 3 || railIndex === 4) continue;
      const railPost = parkMesh(new THREE.CylinderGeometry(0.045, 0.055, 1.05, 7), steel, "amusement-park-pirate-deck-rail-post", "pirate");
      railPost.position.set(-3.8 + railIndex * 1.08, -6.42, side * 1.43);
      shipBody.add(railPost);
    }
    for (const railY of [-6.72, -6.12]) {
      for (const railX of [-2.55, 2.55]) {
        const rail = parkMesh(new THREE.BoxGeometry(3.1, 0.08, 0.08), steel, "amusement-park-pirate-deck-handrail", "pirate");
        rail.position.set(railX, railY, side * 1.43);
        shipBody.add(rail);
      }
    }
    const boardingGate = new THREE.Group();
    boardingGate.name = "amusement-park-pirate-boarding-gate";
    boardingGate.position.set(0, -6.42, side * 1.43);
    boardingGate.userData = { operable: true, state: "open", clearWidthMeters: 1.85 };
    for (const gateX of [-0.94, 0.94]) {
      const gatePost = parkMesh(new THREE.CylinderGeometry(0.055, 0.065, 1.05, 7), yellow, "amusement-park-pirate-boarding-gate-post", "pirate");
      gatePost.position.x = gateX;
      boardingGate.add(gatePost);
    }
    shipBody.add(boardingGate);
  }

  const seatRows = [-3.25, -1.95, -0.65, 0.65, 1.95, 3.25];
  seatRows.forEach((rowX, rowIndex) => {
    const bench = parkMesh(new THREE.BoxGeometry(0.82, 0.22, 2.4), rowIndex % 2 ? red : blue, "amusement-park-pirate-seat-bench", "pirate");
    bench.position.set(rowX, -6.72, 0);
    const backrest = parkMesh(new THREE.BoxGeometry(0.16, 0.92, 2.4), rowIndex % 2 ? red : blue, "amusement-park-pirate-seat-back", "pirate");
    backrest.position.set(rowX - 0.34, -6.3, 0);
    shipBody.add(bench, backrest);
    for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
      const seatZ = -0.9 + seatIndex * 0.6;
      const seatPad = parkMesh(new THREE.BoxGeometry(0.62, 0.08, 0.5), ivory, "amusement-park-pirate-passenger-seat", "pirate");
      seatPad.position.set(rowX, -6.58, seatZ);
      const restraint = parkMesh(new THREE.TorusGeometry(0.24, 0.055, 6, 10, Math.PI), dark, "amusement-park-pirate-seat-restraint", "pirate");
      restraint.position.set(rowX + 0.12, -6.06, seatZ);
      restraint.rotation.y = Math.PI * 0.5;
      shipBody.add(seatPad, restraint);
    }
  });

  const mast = parkMesh(new THREE.CylinderGeometry(0.12, 0.19, 5.6, 8), dark, "amusement-park-pirate-mast", "pirate");
  mast.position.set(-0.25, -4.15, 0);
  const sail = new THREE.Group();
  sail.name = "amusement-park-pirate-sail";
  sail.userData = { symmetricalAboutMast: true, clothPanelCount: 5, doubleSided: true, clearOfPassengerDeck: true };
  const pirateSailMaterial = ivory.clone();
  pirateSailMaterial.side = THREE.DoubleSide;
  const pirateSailAccentMaterial = red.clone();
  pirateSailAccentMaterial.side = THREE.DoubleSide;
  const sailPanelCount = 5;
  for (let panelIndex = 0; panelIndex < sailPanelCount; panelIndex += 1) {
    const topLeft = -2.3 + panelIndex / sailPanelCount * 4.1;
    const topRight = -2.3 + (panelIndex + 1) / sailPanelCount * 4.1;
    const bottomLeft = -2.7 + panelIndex / sailPanelCount * 4.9;
    const bottomRight = -2.7 + (panelIndex + 1) / sailPanelCount * 4.9;
    const panelShape = new THREE.Shape();
    panelShape.moveTo(bottomLeft, -5.65);
    panelShape.lineTo(topLeft, -2.25);
    panelShape.lineTo(topRight, -2.25);
    panelShape.lineTo(bottomRight, -5.65);
    panelShape.closePath();
    const panel = parkMesh(new THREE.ShapeGeometry(panelShape), panelIndex % 2 ? pirateSailAccentMaterial : pirateSailMaterial, "amusement-park-pirate-sail-panel", "pirate");
    panel.position.z = 0.08 + (2 - Math.abs(panelIndex - 2)) * 0.025;
    panel.userData = { panelNumber: panelIndex + 1, doubleSided: true };
    sail.add(panel);
  }
  for (let seamIndex = 1; seamIndex < sailPanelCount; seamIndex += 1) {
    const topX = -2.3 + seamIndex / sailPanelCount * 4.1;
    const bottomX = -2.7 + seamIndex / sailPanelCount * 4.9;
    sail.add(beamBetween(
      new THREE.Vector3(topX, -2.25, 0.13),
      new THREE.Vector3(bottomX, -5.65, 0.13),
      0.022,
      steel,
      "amusement-park-pirate-sail-seam",
      "pirate",
    ));
  }
  const upperYard = beamBetween(new THREE.Vector3(-2.6, -2.15, 0), new THREE.Vector3(2.1, -2.15, 0), 0.085, timber, "amusement-park-pirate-sail-yard", "pirate");
  const lowerYard = beamBetween(new THREE.Vector3(-2.97, -5.78, 0), new THREE.Vector3(2.47, -5.78, 0), 0.075, timber, "amusement-park-pirate-sail-yard", "pirate");
  const upperSailRopeLeft = beamBetween(new THREE.Vector3(-0.25, -1.35, 0), new THREE.Vector3(-2.6, -2.15, 0), 0.022, steel, "amusement-park-pirate-sail-rigging", "pirate");
  const upperSailRopeRight = beamBetween(new THREE.Vector3(-0.25, -1.35, 0), new THREE.Vector3(2.1, -2.15, 0), 0.022, steel, "amusement-park-pirate-sail-rigging", "pirate");
  sail.add(upperYard, lowerYard, upperSailRopeLeft, upperSailRopeRight);
  const pirateFlagPole = parkMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 6), steel, "amusement-park-pirate-flag-pole", "pirate");
  pirateFlagPole.position.set(-0.25, -0.78, 0);
  const pirateFlag = parkMesh(new THREE.BoxGeometry(1.25, 0.62, 0.06), red, "amusement-park-pirate-flag", "pirate");
  pirateFlag.position.set(0.36, -0.52, 0);
  const riggingFront = beamBetween(new THREE.Vector3(-0.25, -1.35, 0), new THREE.Vector3(4.7, -6.45, 0), 0.025, steel, "amusement-park-pirate-rigging", "pirate");
  const riggingRear = beamBetween(new THREE.Vector3(-0.25, -1.35, 0), new THREE.Vector3(-4.25, -6.45, 0), 0.025, steel, "amusement-park-pirate-rigging", "pirate");
  shipBody.add(mast, sail, pirateFlagPole, pirateFlag, riggingFront, riggingRear);
  for (let bulbIndex = 0; bulbIndex < 10; bulbIndex += 1) {
    addBulb(shipBody, -4.05 + bulbIndex * 0.9, -5.95, bulbIndex % 2 ? -1.5 : 1.5, bulbIndex);
  }

  piratePivot.add(suspension, shipBody);
  pirate.add(piratePivot);
  assignFacility(pirate, "pirate");
  park.add(pirate);
  const piratePlatform = parkMesh(new THREE.BoxGeometry(14, 6.65, 4), paving, "amusement-park-pirate-loading-platform", "pirate");
  piratePlatform.position.set(-15, 3.725, 23);
  park.add(piratePlatform);
  for (let index = 0; index < 14; index += 1) {
    const height = 0.475 * (index + 1);
    const step = parkMesh(new THREE.BoxGeometry(3.2, height, 0.4), paving, "amusement-park-pirate-loading-step", "pirate");
    step.position.set(-15, 0.4 + height * 0.5, 29.8 - index * 0.36);
    park.add(step);
  }

  // Ferris wheel with cabins that remain upright.
  const ferris = new THREE.Group();
  ferris.name = "amusement-park-ferris-wheel";
  ferris.position.set(53, 0.5, 14);
  const addSegmentedFerrisSupport = (start: THREE.Vector3, end: THREE.Vector3, legIndex: number) => {
    const segmentCount = 6;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const segmentStart = start.clone().lerp(end, segmentIndex / segmentCount);
      const segmentEnd = start.clone().lerp(end, (segmentIndex + 1) / segmentCount);
      const support = beamBetween(segmentStart, segmentEnd, 0.32, steel, "amusement-park-ferris-support", "ferris");
      support.userData = { facility: "ferris", legIndex, segmentIndex, segmentedForBoardingClearance: true };
      ferris.add(support);
    }
    const footing = parkMesh(new THREE.CylinderGeometry(0.78, 0.92, 0.28, 10), dark, "amusement-park-ferris-support-footing", "ferris");
    // The wheel group itself is raised by 0.5 m. Keep the footing's world
    // bottom on the 0.40 m site surface instead of leaving a visible gap.
    footing.position.copy(start).setY(0.04);
    footing.userData = { grounded: true, legIndex };
    ferris.add(footing);
  };
  let ferrisLegIndex = 0;
  for (const x of [-6.2, 6.2]) {
    addSegmentedFerrisSupport(new THREE.Vector3(x, 0.2, -3.8), new THREE.Vector3(0, 19, -1.8), ferrisLegIndex++);
  }
  // Splay the rear pair farther out and behind the boarding circulation. This
  // keeps the A-frame structurally legible without threading a diagonal leg
  // through the accessible bridge or visitor pavilion.
  for (const x of [-10, 10]) {
    addSegmentedFerrisSupport(new THREE.Vector3(x, 0.2, 7), new THREE.Vector3(0, 19, 1.8), ferrisLegIndex++);
  }
  const ferrisWheel = new THREE.Group();
  ferrisWheel.name = "amusement-park-ferris-wheel-rotor";
  ferrisWheel.position.y = 19;
  const ferrisRadius = 16;
  const rim = parkMesh(new THREE.TorusGeometry(ferrisRadius, 0.32, 8, 64), blue, "amusement-park-ferris-rim", "ferris");
  ferrisWheel.add(rim);
  const cabins: THREE.Group[] = [];
  const cabinDoors: THREE.Mesh[] = [];
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
    // The passenger door faces along the axle (+z), rather than into the
    // wheel's rotating x/y plane. This gives the fixed boarding platform a
    // permanently safe side and matches real observation-wheel stations.
    const rearZ = -1.28;
    {
      const lowerPanel = parkMesh(new THREE.BoxGeometry(4.72, 0.76, 0.16), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-safety-panel", "ferris");
      lowerPanel.position.set(0, -0.08, rearZ);
      const glazedWall = parkMesh(new THREE.BoxGeometry(4.5, 1.45, 0.08), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-wall", "ferris");
      glazedWall.position.set(0, 1.02, rearZ);
      cabin.add(lowerPanel, glazedWall);
    }
    for (const x of [-2.32, 2.32]) {
      const lowerPanel = parkMesh(new THREE.BoxGeometry(0.16, 0.76, 2.42), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-safety-panel", "ferris");
      lowerPanel.position.set(x, -0.08, 0);
      const glazedWall = parkMesh(new THREE.BoxGeometry(0.08, 1.45, 2.3), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-wall", "ferris");
      glazedWall.position.set(x, 1.02, 0);
      const handrail = parkMesh(new THREE.CylinderGeometry(0.055, 0.055, 2.28, 6), steel, "amusement-park-ferris-cabin-handrail", "ferris");
      handrail.rotation.x = Math.PI * 0.5;
      handrail.position.set(x * 1.01, 0.36, 0);
      cabin.add(lowerPanel, glazedWall, handrail);
    }
    for (const x of [-1.52, 1.52]) {
      const fixedLower = parkMesh(new THREE.BoxGeometry(1.68, 0.76, 0.16), bulbMaterials[i % bulbMaterials.length], "amusement-park-ferris-cabin-safety-panel", "ferris");
      fixedLower.position.set(x, -0.08, 1.28);
      const fixedGlass = parkMesh(new THREE.BoxGeometry(1.58, 1.45, 0.08), ferrisCabinGlass, "amusement-park-ferris-cabin-glass-wall", "ferris");
      fixedGlass.position.set(x, 1.02, 1.28);
      cabin.add(fixedLower, fixedGlass);
    }
    const cabinDoor = parkMesh(new THREE.BoxGeometry(1.25, 2.2, 0.12), ferrisCabinGlass, "amusement-park-ferris-cabin-door", "ferris");
    cabinDoor.position.set(0, 0.63, 1.34);
    cabinDoor.userData = {
      operable: true,
      clearWidth: 1.25,
      state: "closed",
      boardingSide: "+z-axis",
      opensOnlyWhenCabinDocked: true,
    };
    cabin.add(cabinDoor);
    cabinDoors.push(cabinDoor);
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
    const doorFrame = parkMesh(new THREE.BoxGeometry(1.48, 0.12, 0.12), steel, "amusement-park-ferris-cabin-door-frame", "ferris");
    doorFrame.position.set(0, 1.76, 1.39);
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

  // Ferris visitor and boarding centre. The former solid block has been
  // replaced with a thin, column-supported dock behind the cabin doors, a
  // staffed glass pavilion, separate entry/exit lanes, safe stairs and a
  // five-flight 1:12 accessible route.
  const ferrisStation = new THREE.Group();
  ferrisStation.name = "amusement-park-ferris-boarding-centre";
  ferrisStation.userData = {
    facility: "ferris",
    axialBoarding: true,
    passengerFlowsSeparated: true,
    boardingAlignmentToleranceDegrees: 0.08,
  };
  park.add(ferrisStation);

  const ferrisPlatformTop = 3.03;
  const ferrisPlatform = parkMesh(
    new THREE.BoxGeometry(6.8, 0.2, 1.9),
    paving,
    "amusement-park-ferris-loading-platform",
    "ferris",
  );
  ferrisPlatform.position.set(53, ferrisPlatformTop - 0.1, 16.42);
  ferrisPlatform.userData = {
    facility: "ferris",
    barrierFreeBoarding: true,
    separatedBoardingAndExit: true,
    construction: "thin-column-supported-deck",
    workingGapMeters: 0.07,
  };
  ferrisStation.add(ferrisPlatform);

  for (const x of [50.15, 53, 55.85]) {
    for (const z of [15.82, 17.02]) {
      const deckSupport = parkMesh(
        new THREE.CylinderGeometry(0.13, 0.18, 2.43, 8),
        dark,
        "amusement-park-ferris-deck-support",
        "ferris",
      );
      deckSupport.position.set(x, 1.615, z);
      deckSupport.userData = { grounded: true, supportsDeck: true };
      ferrisStation.add(deckSupport);
    }
  }
  for (const z of [15.72, 17.12]) {
    const underframe = parkMesh(new THREE.BoxGeometry(6.3, 0.18, 0.16), steel, "amusement-park-ferris-deck-underframe", "ferris");
    underframe.position.set(53, 2.77, z);
    ferrisStation.add(underframe);
  }
  const ferrisWarningStrip = parkMesh(new THREE.BoxGeometry(6.25, 0.035, 0.14), yellow, "amusement-park-ferris-warning-strip", "ferris");
  ferrisWarningStrip.position.set(53, 3.0475, 15.55);
  ferrisWarningStrip.userData = { tactile: true, standBehind: true };
  ferrisStation.add(ferrisWarningStrip);

  const addFerrisDeckRail = (width: number, depth: number, x: number, z: number) => {
    for (const [railY, railRole] of [[3.58, "mid"], [4.07, "top"]] as const) {
      const rail = parkMesh(new THREE.BoxGeometry(width, 0.12, depth), dark, "amusement-park-ferris-boarding-rail", "ferris");
      rail.position.set(x, railY, z);
      rail.userData = { guardHeightMeters: 1.1, railRole };
      ferrisStation.add(rail);
    }
    const postCount = Math.max(2, Math.ceil(Math.max(width, depth) / 1.5));
    for (let index = 0; index <= postCount; index += 1) {
      const ratio = index / postCount;
      const post = parkMesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), dark, "amusement-park-ferris-boarding-rail-post", "ferris");
      post.position.set(
        width > depth ? x - width * 0.5 + width * ratio : x,
        3.605,
        depth >= width ? z - depth * 0.5 + depth * ratio : z,
      );
      ferrisStation.add(post);
    }
  };
  // Leave only a 1.4 m opening opposite the 1.25 m cabin door. The old
  // 2.9 m gap exposed most of the platform whenever a cabin moved away.
  addFerrisDeckRail(2.64, 0.1, 50.98, 15.53);
  addFerrisDeckRail(2.64, 0.1, 55.02, 15.53);
  addFerrisDeckRail(0.1, 1.75, 49.66, 16.47);
  // The east side is the accessible transfer opening. Its sliding gate is
  // parked clear of the 1.5 m connector instead of blocking the ramp.
  addFerrisDeckRail(0.1, 0.14, 56.34, 17.3);
  // Close every fixed portion of the rear deck edge; only the two 1.3 m
  // stair gates remain as controlled openings.
  addFerrisDeckRail(1.395, 0.1, 50.2975, 17.31);
  addFerrisDeckRail(0.99, 0.1, 53.0, 17.31);
  addFerrisDeckRail(1.395, 0.1, 55.7025, 17.31);

  const platformInterlockGate = new THREE.Group();
  platformInterlockGate.name = "amusement-park-ferris-platform-interlock-gate";
  platformInterlockGate.position.set(53, ferrisPlatformTop, 15.53);
  platformInterlockGate.userData = {
    facility: "ferris",
    interlocked: true,
    opensOnlyWhenCabinDocked: true,
    state: "closed",
    clearWidthMeters: 1.3,
  };
  for (const x of [-0.7, 0.7]) {
    const post = parkMesh(
      new THREE.BoxGeometry(0.1, 1.15, 0.1),
      dark,
      "amusement-park-ferris-platform-interlock-gate-post",
      "ferris",
    );
    post.position.set(x, 0.575, 0);
    platformInterlockGate.add(post);
  }
  const interlockLeaf = parkMesh(
    new THREE.BoxGeometry(1.28, 0.86, 0.08),
    aqua,
    "amusement-park-ferris-platform-interlock-gate-leaf",
    "ferris",
  );
  interlockLeaf.position.set(0, 0.55, 0);
  platformInterlockGate.add(interlockLeaf);
  ferrisStation.add(platformInterlockGate);

  const accessibleTransferGate = new THREE.Group();
  accessibleTransferGate.name = "amusement-park-ferris-accessible-transfer-gate";
  accessibleTransferGate.position.set(56.55, ferrisPlatformTop, 16.35);
  accessibleTransferGate.userData = {
    operable: true,
    state: "closed",
    clearWidthMeters: 1.56,
    slidingPocket: "+z",
    interlocked: true,
    opensOnlyWhenCabinDocked: true,
  };
  for (const z of [-0.83, 0.83]) {
    const post = parkMesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), dark, "amusement-park-ferris-accessible-transfer-gate-post", "ferris");
    post.position.set(0, 0.575, z);
    accessibleTransferGate.add(post);
  }
  const accessibleTransferGateLeaf = parkMesh(
    new THREE.BoxGeometry(0.08, 0.86, 1.54),
    yellow,
    "amusement-park-ferris-accessible-transfer-gate-leaf",
    "ferris",
  );
  accessibleTransferGateLeaf.position.set(0, 0.55, 0);
  accessibleTransferGate.add(accessibleTransferGateLeaf);
  ferrisStation.add(accessibleTransferGate);

  const platformFlowGates: THREE.Group[] = [];
  const platformFlowGateLeaves: THREE.Mesh[] = [];
  for (const [x, role] of [[51.75, "boarding"], [54.25, "exit"]] as const) {
    const gate = new THREE.Group();
    gate.name = "amusement-park-ferris-platform-boarding-gate";
    gate.position.set(x, 3.03, 17.3);
    gate.userData = {
      facility: "ferris",
      gateRole: role,
      operable: true,
      state: "closed",
      clearWidthMeters: 1.3,
      interlocked: true,
      opensOnlyWhenCabinDocked: true,
    };
    const gatePostA = parkMesh(new THREE.BoxGeometry(0.11, 1.1, 0.11), dark, "amusement-park-ferris-platform-gate-post", "ferris");
    gatePostA.position.set(-0.7, 0.55, 0);
    const gatePostB = gatePostA.clone();
    gatePostB.position.x = 0.7;
    const gateLeaf = parkMesh(new THREE.BoxGeometry(1.28, 0.86, 0.08), role === "boarding" ? aqua : yellow, "amusement-park-ferris-platform-gate-leaf", "ferris");
    gateLeaf.position.set(0, 0.55, 0);
    gate.add(gatePostA, gatePostB, gateLeaf);
    ferrisStation.add(gate);
    platformFlowGates.push(gate);
    platformFlowGateLeaves.push(gateLeaf);
  }

  const boardingBridge = parkMesh(new THREE.BoxGeometry(1.32, 0.08, 0.09), steel, "amusement-park-ferris-boarding-bridge", "ferris");
  boardingBridge.position.set(53, 2.99, 15.62);
  boardingBridge.userData = { retractable: true, extendsOnlyWhenStopped: true, state: "retracted", workingGapMeters: 0.07 };
  ferrisStation.add(boardingBridge);

  const platformStair = new THREE.Group();
  platformStair.name = "amusement-park-ferris-platform-stair";
  const ferrisStairRise = (ferrisPlatformTop - 0.4) / 15;
  platformStair.userData = {
    facility: "ferris",
    connectsGroundToPlatform: true,
    riserHeightMeters: ferrisStairRise,
    treadDepthMeters: 0.34,
    laneCount: 2,
  };
  for (const [stairX, role] of [[51.75, "entry"], [54.25, "exit"]] as const) {
    for (let stepIndex = 0; stepIndex < 15; stepIndex += 1) {
      const stepTop = 0.4 + ferrisStairRise * (stepIndex + 1);
      const previousTop = 0.4 + ferrisStairRise * stepIndex;
      const step = parkMesh(new THREE.BoxGeometry(1.6, 0.12, 0.34), paving, "amusement-park-ferris-platform-step", "ferris");
      step.position.set(stairX, stepTop - 0.06, 22.468 - stepIndex * 0.352);
      step.userData = { laneRole: role, stepNumber: stepIndex + 1, treadDepthMeters: 0.34, riserHeightMeters: ferrisStairRise };
      const riser = parkMesh(new THREE.BoxGeometry(1.6, ferrisStairRise, 0.08), ivory, "amusement-park-ferris-platform-step-riser", "ferris");
      riser.position.set(stairX, (previousTop + stepTop) * 0.5, step.position.z + 0.17);
      riser.userData = { laneRole: role, stepNumber: stepIndex + 1, supportsTread: true };
      platformStair.add(step, riser);
    }
    for (const side of [-0.62, 0.62]) {
      const stringer = beamBetween(
        new THREE.Vector3(stairX + side, 0.46, 22.62),
        new THREE.Vector3(stairX + side, 2.92, 17.36),
        0.075,
        steel,
        "amusement-park-ferris-stair-stringer",
        "ferris",
      );
      stringer.userData = { laneRole: role, supportsTreads: true };
      platformStair.add(stringer);
    }
    for (const side of [-0.84, 0.84]) {
      const handrail = beamBetween(
        new THREE.Vector3(stairX + side, 1.55, 22.62),
        new THREE.Vector3(stairX + side, 4.08, 17.32),
        0.055,
        dark,
        "amusement-park-ferris-stair-handrail",
        "ferris",
      );
      handrail.userData = { laneRole: role, continuous: true };
      platformStair.add(handrail);
      for (let postIndex = 0; postIndex < 5; postIndex += 1) {
        const ratio = postIndex / 4;
        const treadTop = 0.4 + ferrisStairRise * (1 + ratio * 14);
        const post = parkMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 7), dark, "amusement-park-ferris-stair-handrail-post", "ferris");
        post.position.set(stairX + side, treadTop + 0.525, 22.468 - ratio * 4.928);
        platformStair.add(post);
      }
    }
  }
  ferrisStation.add(platformStair);

  const visitorCentre = new THREE.Group();
  visitorCentre.name = "amusement-park-ferris-visitor-centre";
  visitorCentre.userData = {
    facility: "ferris",
    services: ["tickets", "information", "accessibility-assistance"],
    circulation: "separated-entry-exit",
    barrierFree: true,
  };
  const ferrisVisitorFloor = parkMesh(new THREE.BoxGeometry(11, 0.18, 5.2), paving, "amusement-park-ferris-visitor-floor", "ferris");
  ferrisVisitorFloor.position.set(53, 0.49, 23.1);
  const ferrisVisitorRoof = parkMesh(new THREE.BoxGeometry(11.6, 0.36, 5.75), blue, "amusement-park-ferris-visitor-roof", "ferris");
  ferrisVisitorRoof.position.set(53, 4.5, 23.05);
  const ferrisVisitorRoofCap = parkMesh(new THREE.BoxGeometry(10.9, 0.18, 5.1), aqua, "amusement-park-ferris-visitor-roof-cap", "ferris");
  ferrisVisitorRoofCap.position.set(53, 4.74, 23.05);
  visitorCentre.add(ferrisVisitorFloor, ferrisVisitorRoof, ferrisVisitorRoofCap);

  for (const [x, width] of [[48.6, 2.2], [53, 0.7]] as const) {
    const rearWall = parkMesh(new THREE.BoxGeometry(width, 3.72, 0.2), ivory, "amusement-park-ferris-visitor-wall", "ferris");
    rearWall.position.set(x, 2.44, 20.55);
    visitorCentre.add(rearWall);
  }
  // A real observation window gives the operator a direct view of the
  // boarding deck; the previous full-height wall made that sightline false.
  const operatorViewPlinth = parkMesh(new THREE.BoxGeometry(2.2, 0.72, 0.2), ivory, "amusement-park-ferris-visitor-wall", "ferris");
  operatorViewPlinth.position.set(57.4, 0.94, 20.55);
  const operatorViewWindow = parkMesh(new THREE.BoxGeometry(2.08, 2.2, 0.08), ferrisCabinGlass, "amusement-park-ferris-operator-view-window", "ferris");
  operatorViewWindow.position.set(57.4, 2.38, 20.43);
  const operatorViewHeader = parkMesh(new THREE.BoxGeometry(2.2, 0.76, 0.2), ivory, "amusement-park-ferris-visitor-wall", "ferris");
  operatorViewHeader.position.set(57.4, 4.06, 20.55);
  visitorCentre.add(operatorViewPlinth, operatorViewWindow, operatorViewHeader);
  for (const [x, width] of [[49.275, 3.55], [53, 0.9], [56.725, 3.55]] as const) {
    const frontWall = parkMesh(new THREE.BoxGeometry(width, 3.72, 0.18), ivory, "amusement-park-ferris-visitor-wall", "ferris");
    frontWall.position.set(x, 2.44, 25.61);
    visitorCentre.add(frontWall);
  }
  for (const x of [47.58]) {
    const sidePlinth = parkMesh(new THREE.BoxGeometry(0.18, 0.86, 5.02), ivory, "amusement-park-ferris-visitor-wall", "ferris");
    sidePlinth.position.set(x, 1.01, 23.08);
    const sideWindow = parkMesh(new THREE.BoxGeometry(0.08, 2.55, 4.65), ferrisCabinGlass, "amusement-park-ferris-visitor-window", "ferris");
    sideWindow.position.set(x + (x < 53 ? -0.055 : 0.055), 2.7, 23.08);
    const sideHeader = parkMesh(new THREE.BoxGeometry(0.2, 0.5, 5.1), dark, "amusement-park-ferris-visitor-window-frame", "ferris");
    sideHeader.position.set(x, 4.05, 23.08);
    visitorCentre.add(sidePlinth, sideWindow, sideHeader);
  }
  // Split the east elevation around a genuine step-free side door rather
  // than letting the accessible path terminate against a glass wall.
  for (const [z, depth] of [[21.61, 2.08], [24.97, 1.24]] as const) {
    const sidePlinth = parkMesh(new THREE.BoxGeometry(0.18, 0.86, depth), ivory, "amusement-park-ferris-visitor-wall", "ferris");
    sidePlinth.position.set(58.42, 1.01, z);
    const sideWindow = parkMesh(new THREE.BoxGeometry(0.08, 2.55, Math.max(0.2, depth - 0.12)), ferrisCabinGlass, "amusement-park-ferris-visitor-window", "ferris");
    sideWindow.position.set(58.475, 2.7, z);
    visitorCentre.add(sidePlinth, sideWindow);
  }
  const eastSideHeader = parkMesh(new THREE.BoxGeometry(0.2, 0.5, 5.1), dark, "amusement-park-ferris-visitor-window-frame", "ferris");
  eastSideHeader.position.set(58.42, 4.05, 23.08);
  const accessibleDoorHeader = parkMesh(new THREE.BoxGeometry(0.2, 0.62, 1.7), ivory, "amusement-park-ferris-visitor-wall", "ferris");
  accessibleDoorHeader.position.set(58.42, 3.5, 23.5);
  const accessibleDoor = parkMesh(new THREE.BoxGeometry(0.08, 2.62, 1.6), ferrisCabinGlass, "amusement-park-ferris-visitor-accessible-door", "ferris");
  accessibleDoor.position.set(58.53, 1.89, 23.5);
  accessibleDoor.userData = {
    operable: true,
    thresholdFree: true,
    clearWidthMeters: 1.5,
    connectsAccessibleApproachToVisitorCentre: true,
  };
  visitorCentre.add(eastSideHeader, accessibleDoorHeader, accessibleDoor);
  for (const [x, name, role] of [
    [51.8, "amusement-park-ferris-visitor-entrance-door", "entry"],
    [54.2, "amusement-park-ferris-visitor-exit-door", "exit"],
  ] as const) {
    const door = parkMesh(new THREE.BoxGeometry(1.5, 2.62, 0.08), ferrisCabinGlass, name, "ferris");
    door.position.set(x, 1.89, 25.72);
    door.userData = { operable: true, thresholdFree: true, laneRole: role, clearWidthMeters: 1.5 };
    const header = parkMesh(new THREE.BoxGeometry(1.72, 0.14, 0.12), dark, "amusement-park-ferris-visitor-door-frame", "ferris");
    header.position.set(x, 3.27, 25.7);
    visitorCentre.add(door, header);
  }

  const ferrisVisitorPorch = parkMesh(new THREE.BoxGeometry(4.4, 0.12, 0.9), paving, "amusement-park-ferris-visitor-porch", "ferris");
  ferrisVisitorPorch.position.set(53, 0.52, 26.05);
  const ferrisVisitorCanopy = parkMesh(new THREE.BoxGeometry(4.4, 0.28, 2.2), yellow, "amusement-park-ferris-visitor-canopy", "ferris");
  ferrisVisitorCanopy.position.set(53, 3.88, 26.45);
  visitorCentre.add(ferrisVisitorPorch, ferrisVisitorCanopy);
  for (const x of [50.92, 55.08]) {
    for (const z of [26, 27.3]) {
      const supportTop = 3.74;
      const groundTop = 0.58;
      const postHeight = supportTop - groundTop;
      const canopyPost = parkMesh(new THREE.CylinderGeometry(0.075, 0.09, postHeight, 8), dark, "amusement-park-ferris-visitor-canopy-post", "ferris");
      canopyPost.position.set(x, groundTop + postHeight * 0.5, z);
      canopyPost.userData = { groundedOnPorch: true, supportsCanopy: true };
      visitorCentre.add(canopyPost);
    }
  }

  for (const [x, accessibleCounter, serviceRole] of [
    [49.2, true, "tickets-and-accessibility"],
    [56.8, false, "tickets-and-information"],
  ] as const) {
    const booth = new THREE.Group();
    booth.name = "amusement-park-ferris-ticket-booth";
    booth.position.set(x, 0, 24.05);
    booth.userData = { staffed: true, serviceRole, accessibleCounter };
    const boothBody = parkMesh(new THREE.BoxGeometry(1.85, accessibleCounter ? 0.72 : 0.92, 0.72), x < 53 ? aqua : yellow, "amusement-park-ferris-ticket-counter", "ferris");
    boothBody.position.y = 0.58 + (accessibleCounter ? 0.36 : 0.46);
    const boothScreen = parkMesh(new THREE.BoxGeometry(1.55, 1.25, 0.08), ferrisCabinGlass, "amusement-park-ferris-ticket-window", "ferris");
    boothScreen.position.set(0, 2.05, 0.34);
    const terminal = parkMesh(new THREE.BoxGeometry(0.36, 0.42, 0.18), dark, "amusement-park-ferris-ticket-terminal", "ferris");
    terminal.position.set(0.48, 1.2, 0.18);
    booth.add(boothBody, boothScreen, terminal);
    visitorCentre.add(booth);
  }
  const ferrisInformationDesk = parkMesh(new THREE.BoxGeometry(1.4, 0.78, 0.65), blue, "amusement-park-ferris-information-desk", "ferris");
  ferrisInformationDesk.position.set(48.9, 0.97, 21.6);
  ferrisInformationDesk.userData = { staffed: true, lowCounterSection: true };
  visitorCentre.add(ferrisInformationDesk);

  const operatorBooth = new THREE.Group();
  operatorBooth.name = "amusement-park-ferris-operator-booth";
  operatorBooth.position.set(56.7, 0.58, 21.65);
  operatorBooth.userData = { staffed: true, viewsBoardingPlatform: true };
  const operatorWindow = parkMesh(new THREE.BoxGeometry(2.2, 1.8, 0.08), ferrisCabinGlass, "amusement-park-ferris-operator-window", "ferris");
  operatorWindow.position.set(0, 1.75, -0.72);
  const operatorConsole = parkMesh(new THREE.BoxGeometry(1.7, 0.72, 0.62), dark, "amusement-park-ferris-control-console", "ferris");
  operatorConsole.position.set(0, 0.36, -0.25);
  const emergencyStop = parkMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 10), red, "amusement-park-ferris-emergency-stop", "ferris");
  emergencyStop.position.set(0.48, 0.82, -0.3);
  const statusLight = parkMesh(new THREE.SphereGeometry(0.13, 8, 6), bulbMaterials[2], "amusement-park-ferris-status-light", "ferris");
  statusLight.position.set(-0.5, 1.0, -0.3);
  operatorBooth.add(operatorWindow, operatorConsole, emergencyStop, statusLight);
  visitorCentre.add(operatorBooth);

  const ferrisVisitorSign = new THREE.Group();
  ferrisVisitorSign.name = "amusement-park-ferris-visitor-sign";
  ferrisVisitorSign.position.set(53, 3.8, 25.78);
  const signBoard = parkMesh(new THREE.BoxGeometry(4.6, 0.62, 0.1), blue, "amusement-park-ferris-visitor-sign-board", "ferris");
  const signWheel = parkMesh(new THREE.TorusGeometry(0.22, 0.045, 6, 16), yellow, "amusement-park-ferris-visitor-sign-wheel", "ferris");
  signWheel.position.set(-1.75, 0, 0.08);
  ferrisVisitorSign.add(signBoard, signWheel);
  visitorCentre.add(ferrisVisitorSign);
  ferrisStation.add(visitorCentre);

  const buildFerrisQueueLane = (role: "entry" | "exit", x: number) => {
    const lane = new THREE.Group();
    lane.name = `amusement-park-ferris-${role}-queue-lane`;
    lane.userData = {
      facility: "ferris",
      laneRole: role,
      oneWay: true,
      separatedFromOpposingFlow: true,
      connectsVisitorCentreToLoadingPlatform: true,
      clearWidthMeters: 1.5,
    };
    const floor = parkMesh(new THREE.BoxGeometry(1.6, 0.045, 2.75), role === "entry" ? aqua : yellow, `amusement-park-ferris-${role}-queue-floor`, "ferris");
    floor.position.set(x, 0.6025, 24.075);
    floor.userData = { laneRole: role, slipResistant: true };
    lane.add(floor);
    for (const side of [-0.8, 0.8]) {
      for (const [z, railLength] of [[23.35, 0.9], [24.65, 0.9]] as const) {
        const queueRail = parkMesh(new THREE.BoxGeometry(0.08, 0.12, railLength), dark, `amusement-park-ferris-${role}-queue-rail`, "ferris");
        queueRail.position.set(x + side, 1.42, z);
        lane.add(queueRail);
        for (const endOffset of [-railLength * 0.5 + 0.09, railLength * 0.5 - 0.09]) {
          const queuePost = parkMesh(new THREE.CylinderGeometry(0.045, 0.055, 0.92, 7), dark, "amusement-park-ferris-queue-post", "ferris");
          queuePost.position.set(x + side, 1.0, z + endOffset);
          lane.add(queuePost);
        }
      }
    }
    ferrisStation.add(lane);
    return lane;
  };
  buildFerrisQueueLane("entry", 51.75);
  buildFerrisQueueLane("exit", 54.25);

  const rampGroundTop = 0.58;
  const rampRun = 6.312;
  const rampRise = (ferrisPlatformTop - rampGroundTop) / 5;
  const accessibleRamp = new THREE.Group();
  accessibleRamp.name = "amusement-park-ferris-accessible-ramp";
  accessibleRamp.userData = {
    facility: "ferris",
    barrierFree: true,
    connectsGroundToPlatform: true,
    clearWidthMeters: 1.5,
    maxGradient: rampRise / rampRun,
    flightCount: 5,
    alternateRoute: "five-flight-switchback",
  };
  const rampWestX = 61;
  const rampEastX = rampWestX + rampRun;
  const rampFlightZ = [4, 5.8, 7.6, 9.4, 11.2];
  const rampLandingPoints: Array<[number, number, number]> = [[rampEastX, 3.1, rampGroundTop]];
  for (let flightIndex = 0; flightIndex < 5; flightIndex += 1) {
    const startsEast = flightIndex % 2 === 0;
    const startX = startsEast ? rampEastX : rampWestX;
    const endX = startsEast ? rampWestX : rampEastX;
    const startTop = rampGroundTop + rampRise * flightIndex;
    const endTop = rampGroundTop + rampRise * (flightIndex + 1);
    const directionX = endX - startX;
    const slopeAngle = Math.atan2(endTop - startTop, directionX);
    const flightLength = Math.hypot(directionX, endTop - startTop);
    const flight = parkMesh(new THREE.BoxGeometry(flightLength, 0.14, 1.7), paving, "amusement-park-ferris-accessible-ramp-flight", "ferris");
    flight.position.set((startX + endX) * 0.5, (startTop + endTop) * 0.5 - 0.07, rampFlightZ[flightIndex]);
    flight.rotation.z = slopeAngle;
    flight.userData = { flightNumber: flightIndex + 1, gradient: rampRise / rampRun, clearWidthMeters: 1.5 };
    accessibleRamp.add(flight);
    for (const side of [-0.82, 0.82]) {
      const stringer = beamBetween(
        new THREE.Vector3(startX, startTop - 0.18, rampFlightZ[flightIndex] + side),
        new THREE.Vector3(endX, endTop - 0.18, rampFlightZ[flightIndex] + side),
        0.075,
        steel,
        "amusement-park-ferris-accessible-ramp-stringer",
        "ferris",
      );
      stringer.userData = { supportsFlight: flightIndex + 1 };
      accessibleRamp.add(stringer);
      const handrail = beamBetween(
        new THREE.Vector3(startX, startTop + 1.0, rampFlightZ[flightIndex] + side),
        new THREE.Vector3(endX, endTop + 1.0, rampFlightZ[flightIndex] + side),
        0.05,
        dark,
        "amusement-park-ferris-accessible-ramp-handrail",
        "ferris",
      );
      accessibleRamp.add(handrail);
      for (const ratio of [0, 0.5, 1]) {
        const surfaceTop = THREE.MathUtils.lerp(startTop, endTop, ratio);
        const handrailPost = parkMesh(
          new THREE.CylinderGeometry(0.04, 0.05, 0.96, 7),
          dark,
          "amusement-park-ferris-accessible-ramp-handrail-post",
          "ferris",
        );
        handrailPost.position.set(
          THREE.MathUtils.lerp(startX, endX, ratio),
          surfaceTop + 0.48,
          rampFlightZ[flightIndex] + side,
        );
        handrailPost.userData = { groundedOnRamp: true, flightNumber: flightIndex + 1 };
        accessibleRamp.add(handrailPost);
      }
    }
    const landingZ = flightIndex === 4 ? 11.1 : rampFlightZ[flightIndex] + 0.9;
    rampLandingPoints.push([endX, landingZ, endTop]);
  }
  rampLandingPoints.forEach(([x, z, top], index) => {
    const landing = parkMesh(new THREE.BoxGeometry(1.8, 0.14, 1.72), paving, "amusement-park-ferris-accessible-ramp-landing", "ferris");
    landing.position.set(x, top - 0.07, z);
    landing.userData = { landingNumber: index + 1, turningSpaceMeters: 1.8 };
    accessibleRamp.add(landing);
    const columnHeight = top - 0.54;
    if (columnHeight > 0.12) {
      for (const columnZ of [z - 0.55, z + 0.55]) {
        const landingColumn = parkMesh(
          new THREE.CylinderGeometry(0.09, 0.13, columnHeight, 8),
          steel,
          "amusement-park-ferris-accessible-ramp-support-column",
          "ferris",
        );
        landingColumn.position.set(x, 0.4 + columnHeight * 0.5, columnZ);
        landingColumn.userData = { grounded: true, supportsLanding: index + 1 };
        accessibleRamp.add(landingColumn);
      }
    }
    const outsideX = x < (rampWestX + rampEastX) * 0.5 ? x - 0.9 : x + 0.9;
    const turnRail = beamBetween(
      new THREE.Vector3(outsideX, top + 1, z - 0.82),
      new THREE.Vector3(outsideX, top + 1, z + 0.82),
      0.05,
      dark,
      "amusement-park-ferris-accessible-ramp-handrail",
      "ferris",
    );
    accessibleRamp.add(turnRail);
    for (const railZ of [z - 0.78, z + 0.78]) {
      const turnPost = parkMesh(new THREE.CylinderGeometry(0.04, 0.05, 0.96, 7), dark, "amusement-park-ferris-accessible-ramp-handrail-post", "ferris");
      turnPost.position.set(outsideX, top + 0.48, railZ);
      turnPost.userData = { groundedOnLanding: true, landingNumber: index + 1 };
      accessibleRamp.add(turnPost);
    }
  });
  // The elevated connection deliberately takes a U-shaped route: first east
  // below the cabin plane, then north outside the wheel radius, and finally
  // west on the axle side. A direct diagonal/L-shaped link would enter the
  // moving gondola envelope between the coarse animation samples.
  const rampSouthBridge = parkMesh(new THREE.BoxGeometry(rampRun, 0.14, 1.7), paving, "amusement-park-ferris-accessible-ramp-top-connector", "ferris");
  rampSouthBridge.position.set((rampWestX + rampEastX) * 0.5, ferrisPlatformTop - 0.07, 11.1);
  const rampEastBridge = parkMesh(new THREE.BoxGeometry(1.7, 0.14, 5.15), paving, "amusement-park-ferris-accessible-ramp-top-connector", "ferris");
  rampEastBridge.position.set(rampEastX, ferrisPlatformTop - 0.07, 13.675);
  const rampAxialBridgeLength = rampEastX - 56.4;
  const rampAxialBridge = parkMesh(new THREE.BoxGeometry(rampAxialBridgeLength, 0.14, 1.7), paving, "amusement-park-ferris-accessible-ramp-top-connector", "ferris");
  rampAxialBridge.position.set((rampEastX + 56.4) * 0.5, ferrisPlatformTop - 0.07, 16.35);
  accessibleRamp.add(rampSouthBridge, rampEastBridge, rampAxialBridge);

  // Ground the elevated U-link with a small steel substructure. Its supports
  // remain behind the axial cabin plane and outside the wheel legs.
  for (const [x, z] of [
    [62, 11.1], [64.2, 11.1], [66.3, 11.1],
    [rampEastX, 12.5], [rampEastX, 14.3], [rampEastX, 15.8],
    [58.2, 16.35], [61.2, 16.35], [64.2, 16.35],
  ] as const) {
    const connectorColumn = parkMesh(
      new THREE.CylinderGeometry(0.09, 0.14, ferrisPlatformTop - 0.54, 8),
      steel,
      "amusement-park-ferris-accessible-ramp-support-column",
      "ferris",
    );
    connectorColumn.position.set(x, 0.4 + (ferrisPlatformTop - 0.54) * 0.5, z);
    connectorColumn.userData = { grounded: true, supportsTopConnector: true };
    accessibleRamp.add(connectorColumn);
  }

  const addRampConnectorRail = (start: THREE.Vector3, end: THREE.Vector3) => {
    const rail = beamBetween(start, end, 0.05, dark, "amusement-park-ferris-accessible-ramp-handrail", "ferris");
    accessibleRamp.add(rail);
    for (const ratio of [0, 0.5, 1]) {
      const post = parkMesh(new THREE.CylinderGeometry(0.04, 0.05, 0.96, 7), dark, "amusement-park-ferris-accessible-ramp-handrail-post", "ferris");
      post.position.copy(start).lerp(end, ratio).setY(ferrisPlatformTop + 0.48);
      post.userData = { groundedOnTopConnector: true };
      accessibleRamp.add(post);
    }
  };
  addRampConnectorRail(new THREE.Vector3(rampWestX, 4.03, 10.22), new THREE.Vector3(rampEastX, 4.03, 10.22));
  addRampConnectorRail(new THREE.Vector3(rampWestX, 4.03, 11.98), new THREE.Vector3(rampEastX, 4.03, 11.98));
  addRampConnectorRail(new THREE.Vector3(rampEastX - 0.88, 4.03, 11.1), new THREE.Vector3(rampEastX - 0.88, 4.03, 16.35));
  addRampConnectorRail(new THREE.Vector3(rampEastX + 0.88, 4.03, 11.1), new THREE.Vector3(rampEastX + 0.88, 4.03, 16.35));
  // Near the wheel, the south rail retracts with the ride interlock. Keeping
  // its fixed section east of x=59 avoids the narrow 1-degree collision
  // windows that a coarse animation test previously missed.
  addRampConnectorRail(new THREE.Vector3(59, 4.03, 15.45), new THREE.Vector3(rampEastX, 4.03, 15.45));
  addRampConnectorRail(new THREE.Vector3(56.4, 4.03, 17.25), new THREE.Vector3(rampEastX, 4.03, 17.25));
  const connectorInterlock = new THREE.Group();
  connectorInterlock.name = "amusement-park-ferris-accessible-connector-interlock";
  connectorInterlock.position.set(59, ferrisPlatformTop, 16.35);
  connectorInterlock.userData = {
    interlocked: true,
    closesWhenRideMoves: true,
    opensOnlyWhenCabinDocked: true,
    state: "closed",
    clearWidthMeters: 1.54,
  };
  for (const z of [-0.82, 0.82]) {
    const post = parkMesh(new THREE.BoxGeometry(0.1, 1.12, 0.1), dark, "amusement-park-ferris-accessible-connector-gate-post", "ferris");
    post.position.set(0, 0.56, z);
    connectorInterlock.add(post);
  }
  const connectorInterlockGateLeaf = parkMesh(new THREE.BoxGeometry(0.08, 0.86, 1.54), aqua, "amusement-park-ferris-accessible-connector-gate-leaf", "ferris");
  connectorInterlockGateLeaf.position.y = 0.55;
  connectorInterlock.add(connectorInterlockGateLeaf);
  accessibleRamp.add(connectorInterlock);

  const connectorMovableGuard = new THREE.Group();
  connectorMovableGuard.name = "amusement-park-ferris-accessible-connector-movable-guard";
  connectorMovableGuard.position.set(60.3, ferrisPlatformTop, 17.15);
  connectorMovableGuard.userData = { interlocked: true, deploysOnlyWhenCabinDocked: true, state: "stored" };
  for (const railY of [0.58, 1.05]) {
    const movableRail = parkMesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), dark, "amusement-park-ferris-accessible-connector-movable-rail", "ferris");
    movableRail.position.y = railY;
    connectorMovableGuard.add(movableRail);
  }
  for (const x of [-1.25, 0, 1.25]) {
    const movablePost = parkMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), dark, "amusement-park-ferris-accessible-connector-movable-post", "ferris");
    movablePost.position.set(x, 0.55, 0);
    connectorMovableGuard.add(movablePost);
  }
  accessibleRamp.add(connectorMovableGuard);
  for (const [width, depth, x, z] of [
    [rampRun, 0.08, (rampWestX + rampEastX) * 0.5, 10.28],
    [rampRun, 0.08, (rampWestX + rampEastX) * 0.5, 11.92],
    [0.08, 5.15, rampEastX - 0.82, 13.675],
    [0.08, 5.15, rampEastX + 0.82, 13.675],
    [rampEastX - 59, 0.06, (rampEastX + 59) * 0.5, 15.53],
    [rampAxialBridgeLength, 0.06, (rampEastX + 56.4) * 0.5, 17.17],
  ] as const) {
    const curb = parkMesh(new THREE.BoxGeometry(width, 0.18, depth), yellow, "amusement-park-ferris-accessible-ramp-edge-curb", "ferris");
    curb.position.set(x, ferrisPlatformTop + 0.09, z);
    accessibleRamp.add(curb);
  }
  ferrisStation.add(accessibleRamp);

  const ferrisArrivalWalk = new THREE.Group();
  ferrisArrivalWalk.name = "amusement-park-ferris-access-walkway";
  ferrisArrivalWalk.userData = { barrierFree: true, connectsCrossWalkToVisitorCentre: true, clearWidthMeters: 3.6 };
  const arrivalWalkSlab = parkMesh(new THREE.BoxGeometry(4.2, 0.1, 2.55), paving, "amusement-park-ferris-arrival-walk-slab", "ferris");
  arrivalWalkSlab.position.set(53, 0.53, 26.925);
  const arrivalTransitionRun = 1.2;
  const arrivalTransitionDrop = 0.055;
  const arrivalTransition = parkMesh(new THREE.BoxGeometry(4.0, 0.08, arrivalTransitionRun), paving, "amusement-park-ferris-arrival-transition-ramp", "ferris");
  arrivalTransition.position.set(53, 0.5125, 28.8);
  arrivalTransition.rotation.x = Math.asin(arrivalTransitionDrop / arrivalTransitionRun);
  arrivalTransition.userData = { barrierFree: true, gradient: arrivalTransitionDrop / arrivalTransitionRun, connectsToCrossWalk: true };
  ferrisArrivalWalk.add(arrivalWalkSlab, arrivalTransition);
  park.add(ferrisArrivalWalk);

  const ferrisAccessibleWalk = new THREE.Group();
  ferrisAccessibleWalk.name = "amusement-park-ferris-access-walkway";
  ferrisAccessibleWalk.userData = { barrierFree: true, connectsVisitorCentreToRamp: true, clearWidthMeters: 1.6 };
  const accessibleWalkEast = parkMesh(new THREE.BoxGeometry(1.6, 0.1, 21.0), paving, "amusement-park-ferris-accessible-approach-slab", "ferris");
  accessibleWalkEast.position.set(68.75, 0.53, 13.55);
  const accessibleWalkNorth = parkMesh(new THREE.BoxGeometry(10.4, 0.1, 1.6), paving, "amusement-park-ferris-accessible-approach-slab", "ferris");
  accessibleWalkNorth.position.set(63.65, 0.53, 23.5);
  const accessibleWalkSouth = parkMesh(new THREE.BoxGeometry(2, 0.1, 1.6), paving, "amusement-park-ferris-accessible-approach-slab", "ferris");
  accessibleWalkSouth.position.set(67.95, 0.53, 3.1);
  ferrisAccessibleWalk.add(accessibleWalkEast, accessibleWalkNorth, accessibleWalkSouth);
  park.add(ferrisAccessibleWalk);

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
  const playFloor = parkMesh(new THREE.BoxGeometry(13, 0.24, 10), aqua, "amusement-park-playground-hall", "playground");
  playFloor.position.y = 0.12;
  const playRearWall = parkMesh(new THREE.BoxGeometry(13, 6.8, 0.24), aqua, "amusement-park-playground-wall", "playground");
  playRearWall.position.set(0, 3.4, -4.88);
  const playLeftWall = parkMesh(new THREE.BoxGeometry(0.24, 6.8, 10), aqua, "amusement-park-playground-wall", "playground");
  playLeftWall.position.set(-6.38, 3.4, 0);
  const playRightWall = playLeftWall.clone();
  playRightWall.position.x = 6.38;
  const playEntranceHeader = parkMesh(new THREE.BoxGeometry(13, 1.4, 0.24), aqua, "amusement-park-playground-entrance-header", "playground");
  playEntranceHeader.position.set(0, 6.1, 4.88);
  const playRoof = parkMesh(new THREE.BoxGeometry(13.7, 0.6, 10.7), yellow, "amusement-park-playground-roof", "playground");
  playRoof.position.y = 7.05;
  playground.add(playFloor, playRearWall, playLeftWall, playRightWall, playEntranceHeader, playRoof);
  playground.userData = {
    entranceClearWidth: 17.78,
    entranceType: "fully-open",
    levelCount: 3,
    activityZones: ["toddler-ball-pit", "climbing-maze", "tube-slide"],
    fullyPadded: true,
    safetyNetEnclosed: true,
  };

  // A three-level padded play maze replaces the former unsupported tower blocks.
  const platformSpecs: Array<[number, number, number, THREE.Material]> = [
    [-3.8, 1.35, -1.8, pink], [0, 2.85, -2, blue], [3.8, 4.35, -1.6, orange],
  ];
  platformSpecs.forEach(([x, y, z, material], platformIndex) => {
    const playPlatform = new THREE.Group();
    playPlatform.name = "amusement-park-playground-play-platform";
    playPlatform.position.set(x, 0, z);
    playPlatform.userData = { level: platformIndex + 1, padded: true, safetyNetEnclosed: true };
    const deck = parkMesh(new THREE.BoxGeometry(3.1, 0.28, 3), material, "amusement-park-playground-platform-deck", "playground");
    deck.position.y = y;
    playPlatform.add(deck);
    for (const postX of [-1.35, 1.35]) {
      for (const postZ of [-1.3, 1.3]) {
        const post = parkMesh(new THREE.CylinderGeometry(0.14, 0.18, y - 0.25, 8), yellow, "amusement-park-playground-padded-post", "playground");
        post.position.set(postX, (y - 0.25) * 0.5 + 0.25, postZ);
        playPlatform.add(post);
      }
    }
    for (const side of [-1, 1]) {
      const sideNet = parkMesh(new THREE.PlaneGeometry(2.8, 1.45, 3, 2), playNet, "amusement-park-playground-safety-net", "playground");
      sideNet.position.set(side * 1.43, y + 0.82, 0);
      sideNet.rotation.y = Math.PI * 0.5;
      playPlatform.add(sideNet);
    }
    const rearNet = parkMesh(new THREE.PlaneGeometry(2.8, 1.45, 3, 2), playNet, "amusement-park-playground-safety-net", "playground");
    rearNet.position.set(0, y + 0.82, -1.42);
    playPlatform.add(rearNet);
    playground.add(playPlatform);
  });

  for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
    const stair = parkMesh(new THREE.BoxGeometry(1.7, 0.26, 0.58), stepIndex % 2 ? pink : yellow, "amusement-park-playground-padded-step", "playground");
    stair.position.set(-3.8 + stepIndex * 0.48, 0.45 + stepIndex * 0.29, 0.2 - stepIndex * 0.22);
    stair.userData = { padded: true, stepNumber: stepIndex + 1 };
    playground.add(stair);
  }

  const crawlTunnelSpecs: Array<[THREE.Vector3, THREE.Vector3, THREE.Material]> = [
    [new THREE.Vector3(-2.3, 2.05, -1.8), new THREE.Vector3(-0.9, 3.05, -2), purple],
    [new THREE.Vector3(1.5, 3.55, -1.9), new THREE.Vector3(2.5, 4.55, -1.7), aqua],
  ];
  crawlTunnelSpecs.forEach(([start, end, material]) => {
    const tunnelCurve = new THREE.LineCurve3(start, end);
    const tunnel = parkMesh(new THREE.TubeGeometry(tunnelCurve, 12, 0.7, 10, false), material, "amusement-park-playground-crawl-tunnel", "playground");
    tunnel.userData = { enclosed: true, padded: true };
    playground.add(tunnel);
  });

  const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.8, 4.45, -0.1),
    new THREE.Vector3(5.1, 4.0, 0.8),
    new THREE.Vector3(4.8, 2.7, 2.25),
    new THREE.Vector3(3.2, 1.65, 2.9),
    new THREE.Vector3(1.7, 0.68, 3.15),
  ], false, "centripetal");
  const tubeSlide = parkMesh(new THREE.TubeGeometry(tubeCurve, 48, 0.64, 12, false), orange, "amusement-park-playground-tube-slide", "playground");
  tubeSlide.userData = { enclosed: true, startsAtLevel: 3, groundLanding: true };
  const slideLanding = parkMesh(new THREE.BoxGeometry(2.6, 0.16, 2.2), yellow, "amusement-park-playground-slide-landing", "playground");
  slideLanding.position.set(1.7, 0.25, 3.55);
  playground.add(tubeSlide, slideLanding);

  const ballPit = new THREE.Group();
  ballPit.name = "amusement-park-playground-ball-pit";
  ballPit.position.set(-3.7, 0, 2.5);
  ballPit.userData = { toddlerZone: true, ballCount: 18 };
  const pitBase = parkMesh(new THREE.BoxGeometry(4.1, 0.42, 3), aqua, "amusement-park-playground-ball-pit-base", "playground");
  pitBase.position.y = 0.42;
  ballPit.add(pitBase);
  for (let ballIndex = 0; ballIndex < 18; ballIndex += 1) {
    const ball = parkMesh(new THREE.IcosahedronGeometry(0.24, 1), bulbMaterials[ballIndex % bulbMaterials.length], "amusement-park-playground-ball", "playground");
    ball.position.set(-1.55 + (ballIndex % 6) * 0.62, 0.78 + (ballIndex % 2) * 0.12, -0.82 + Math.floor(ballIndex / 6) * 0.76);
    ballPit.add(ball);
  }
  playground.add(ballPit);
  park.add(playground);

  // Shooting gallery with moving targets.
  const shooting = new THREE.Group();
  shooting.name = "amusement-park-shooting-gallery";
  shooting.position.set(12, 0.5, -10);
  shooting.scale.setScalar(1.4);
  const galleryFloor = parkMesh(new THREE.BoxGeometry(11, 0.25, 7), timber, "amusement-park-shooting-gallery-building", "shooting");
  galleryFloor.position.y = 0.125;
  const galleryRear = parkMesh(new THREE.BoxGeometry(11, 5.2, 0.24), timber, "amusement-park-shooting-gallery-wall", "shooting");
  galleryRear.position.set(0, 2.6, -3.38);
  const galleryLeft = parkMesh(new THREE.BoxGeometry(0.24, 5.2, 7), timber, "amusement-park-shooting-gallery-wall", "shooting");
  galleryLeft.position.set(-5.38, 2.6, 0);
  const galleryRight = galleryLeft.clone();
  galleryRight.position.x = 5.38;
  const galleryRoof = parkMesh(new THREE.BoxGeometry(12, 0.65, 8), red, "amusement-park-shooting-gallery-roof", "shooting");
  galleryRoof.position.y = 5.55;
  const counter = parkMesh(new THREE.BoxGeometry(10, 1, 1.2), yellow, "amusement-park-shooting-gallery-counter", "shooting");
  counter.position.set(0, 1, 4);
  shooting.add(galleryFloor, galleryRear, galleryLeft, galleryRight, galleryRoof, counter);
  shooting.userData.serviceOpeningWidth = 14;
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
  dropTower.userData = { seatCount: 12, guideRailCount: 4, restraintType: "over-shoulder", rotatingCarriage: true };
  const tower = parkMesh(new THREE.CylinderGeometry(0.74, 1.2, 20, 12), dark, "amusement-park-drop-tower-column", "drop-tower");
  tower.position.y = 10;
  const towerCap = parkMesh(new THREE.ConeGeometry(2.35, 2.8, 12), red, "amusement-park-drop-tower-cap", "drop-tower");
  towerCap.position.y = 21.35;
  for (let railIndex = 0; railIndex < 4; railIndex += 1) {
    const angle = railIndex / 4 * Math.PI * 2;
    const guideRail = parkMesh(new THREE.BoxGeometry(0.18, 19.2, 0.18), steel, "amusement-park-drop-tower-guide-rail", "drop-tower");
    guideRail.position.set(Math.cos(angle) * 0.9, 10, Math.sin(angle) * 0.9);
    dropTower.add(guideRail);
  }
  for (let braceIndex = 0; braceIndex < 7; braceIndex += 1) {
    const brace = parkMesh(new THREE.TorusGeometry(1.05, 0.08, 6, 16), steel, "amusement-park-drop-tower-lattice-brace", "drop-tower");
    brace.rotation.x = Math.PI * 0.5;
    brace.position.y = 2.2 + braceIndex * 2.75;
    dropTower.add(brace);
  }
  const machineryBase = parkMesh(new THREE.CylinderGeometry(1.85, 2.2, 1.05, 14), steel, "amusement-park-drop-tower-machinery-base", "drop-tower");
  machineryBase.position.y = 0.55;
  const dropCarriage = new THREE.Group();
  dropCarriage.name = "amusement-park-drop-tower-carriage";
  dropCarriage.userData = { passengerCapacity: 12, rotating: true, overShoulderRestraints: true };
  const carriage = parkMesh(new THREE.CylinderGeometry(2.35, 2.5, 0.58, 18), yellow, "amusement-park-drop-tower-seat-ring", "drop-tower");
  carriage.position.y = 0.18;
  dropCarriage.add(carriage);
  for (let seatIndex = 0; seatIndex < 12; seatIndex += 1) {
    const angle = seatIndex / 12 * Math.PI * 2;
    const seat = new THREE.Group();
    seat.name = "amusement-park-drop-tower-passenger-seat";
    seat.position.set(Math.cos(angle) * 2.55, 0, Math.sin(angle) * 2.55);
    seat.rotation.y = -angle + Math.PI * 0.5;
    seat.userData = { seatNumber: seatIndex + 1, facesOutward: true, restrained: true };
    const cushion = parkMesh(new THREE.BoxGeometry(0.82, 0.2, 0.82), seatIndex % 2 ? red : blue, "amusement-park-drop-tower-seat-cushion", "drop-tower");
    cushion.position.y = 0.62;
    const back = parkMesh(new THREE.BoxGeometry(0.82, 1.2, 0.18), seatIndex % 2 ? red : blue, "amusement-park-drop-tower-seat-back", "drop-tower");
    back.position.set(0, 1.18, -0.34);
    const restraint = parkMesh(new THREE.TorusGeometry(0.37, 0.07, 6, 12, Math.PI), dark, "amusement-park-drop-tower-seat-restraint", "drop-tower");
    restraint.position.set(0, 1.2, 0.18);
    restraint.rotation.x = Math.PI * 0.5;
    const footrest = parkMesh(new THREE.BoxGeometry(0.7, 0.12, 0.42), steel, "amusement-park-drop-tower-footrest", "drop-tower");
    footrest.position.set(0, 0.15, 0.55);
    seat.add(cushion, back, restraint, footrest);
    dropCarriage.add(seat);
  }
  const carriageCanopy = parkMesh(new THREE.TorusGeometry(2.75, 0.13, 8, 24), steel, "amusement-park-drop-tower-carriage-canopy", "drop-tower");
  carriageCanopy.rotation.x = Math.PI * 0.5;
  carriageCanopy.position.y = 1.92;
  dropCarriage.add(carriageCanopy);
  dropCarriage.position.y = 0.42;
  dropTower.add(tower, towerCap, machineryBase, dropCarriage);
  park.add(dropTower);
  const dropPlatform = parkMesh(new THREE.CylinderGeometry(4.25, 4.25, 0.62, 20), paving, "amusement-park-drop-tower-loading-platform", "drop-tower");
  dropPlatform.position.set(69, 0.71, -8);
  park.add(dropPlatform);
  const dropAccess = parkMesh(new THREE.BoxGeometry(2.8, 0.1, 4.25), paving, "amusement-park-drop-tower-access-walkway", "drop-tower");
  dropAccess.position.set(69, 0.51, -1.65);
  park.add(dropAccess);
  for (let index = 0; index < 3; index += 1) {
    const height = 0.2 * (index + 1);
    const step = parkMesh(new THREE.BoxGeometry(2.8, height, 0.65), paving, "amusement-park-drop-tower-loading-step", "drop-tower");
    step.position.set(69, 0.4 + height * 0.5, -3.7 + index * 0.55);
    park.add(step);
  }
  for (let railIndex = 0; railIndex < 10; railIndex += 1) {
    const angle = (railIndex / 12 + 0.08) * Math.PI * 2;
    if (Math.sin(angle) > 0.72) continue;
    const platformRail = parkMesh(new THREE.BoxGeometry(0.18, 1.15, 0.18), dark, "amusement-park-drop-tower-platform-rail", "drop-tower");
    platformRail.position.set(69 + Math.cos(angle) * 4, 1.58, -8 + Math.sin(angle) * 4);
    park.add(platformRail);
  }

  // Spinning teacups and bumper car pavilion fill the family district.
  const cups = new THREE.Group();
  cups.name = "amusement-park-spinning-cups";
  cups.position.set(18, 0.5, 17);
  cups.scale.setScalar(1.42);
  cups.userData = { cupCount: 7, passengersPerCup: 3, individualRotation: true, centralControlWheels: true };
  const cupBase = parkMesh(new THREE.CylinderGeometry(5.3, 5.5, 0.5, 20), purple, "amusement-park-spinning-cups-base", "overview");
  const cupDeck = parkMesh(new THREE.CylinderGeometry(5.18, 5.18, 0.14, 24), ivory, "amusement-park-spinning-cups-deck", "overview");
  cupDeck.position.y = 0.32;
  const cupCentrepiece = new THREE.Group();
  cupCentrepiece.name = "amusement-park-spinning-cups-centrepiece";
  const teaPot = parkMesh(new THREE.SphereGeometry(1.05, 14, 10), pink, "amusement-park-spinning-cups-teapot-body", "overview");
  teaPot.scale.y = 0.78;
  teaPot.position.y = 1.18;
  const teaPotLid = parkMesh(new THREE.CylinderGeometry(0.42, 0.6, 0.22, 12), yellow, "amusement-park-spinning-cups-teapot-lid", "overview");
  teaPotLid.position.y = 2.04;
  const teaPotKnob = parkMesh(new THREE.SphereGeometry(0.18, 8, 6), red, "amusement-park-spinning-cups-teapot-knob", "overview");
  teaPotKnob.position.y = 2.28;
  const teaPotSpout = parkMesh(new THREE.ConeGeometry(0.34, 1.35, 10), pink, "amusement-park-spinning-cups-teapot-spout", "overview");
  teaPotSpout.rotation.z = -Math.PI * 0.5;
  teaPotSpout.position.set(1.22, 1.32, 0);
  const teaPotHandle = parkMesh(new THREE.TorusGeometry(0.72, 0.13, 8, 16, Math.PI * 1.45), yellow, "amusement-park-spinning-cups-teapot-handle", "overview");
  teaPotHandle.rotation.y = Math.PI * 0.5;
  teaPotHandle.position.set(-0.92, 1.28, 0);
  cupCentrepiece.add(teaPot, teaPotLid, teaPotKnob, teaPotSpout, teaPotHandle);
  cups.add(cupBase, cupDeck, cupCentrepiece);
  const cupCars: THREE.Group[] = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = i / 7 * Math.PI * 2;
    const cup = new THREE.Group();
    cup.name = "amusement-park-spinning-cup";
    cup.userData = { phase: angle, passengerCapacity: 3, hasControlWheel: true, hasHandle: true };
    const saucer = parkMesh(new THREE.CylinderGeometry(1.48, 1.55, 0.18, 16), ivory, "amusement-park-spinning-cup-saucer", "overview");
    saucer.position.y = 0.18;
    const bowl = parkMesh(new THREE.CylinderGeometry(1.35, 0.92, 1.22, 16, 1, true), bulbMaterials[i % bulbMaterials.length], "amusement-park-spinning-cup-body", "overview");
    bowl.position.y = 0.86;
    const cupFloor = parkMesh(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 16), dark, "amusement-park-spinning-cup-floor", "overview");
    cupFloor.position.y = 0.37;
    const cupRim = parkMesh(new THREE.TorusGeometry(1.35, 0.11, 8, 20), yellow, "amusement-park-spinning-cup-rim", "overview");
    cupRim.rotation.x = Math.PI * 0.5;
    cupRim.position.y = 1.47;
    const cupHandle = parkMesh(new THREE.TorusGeometry(0.63, 0.12, 8, 16), bulbMaterials[i % bulbMaterials.length], "amusement-park-spinning-cup-handle", "overview");
    cupHandle.rotation.y = Math.PI * 0.5;
    cupHandle.position.set(1.28, 1.02, 0);
    cup.add(saucer, bowl, cupFloor, cupRim, cupHandle);
    for (let seatIndex = 0; seatIndex < 3; seatIndex += 1) {
      const seatAngle = seatIndex / 3 * Math.PI * 2;
      const seat = parkMesh(new THREE.BoxGeometry(0.78, 0.22, 0.48), ivory, "amusement-park-spinning-cup-seat", "overview");
      seat.position.set(Math.cos(seatAngle) * 0.72, 0.68, Math.sin(seatAngle) * 0.72);
      seat.rotation.y = -seatAngle + Math.PI * 0.5;
      cup.add(seat);
    }
    const controlColumn = parkMesh(new THREE.CylinderGeometry(0.09, 0.12, 0.68, 8), steel, "amusement-park-spinning-cup-control-column", "overview");
    controlColumn.position.y = 0.78;
    const controlWheel = parkMesh(new THREE.TorusGeometry(0.38, 0.07, 7, 14), red, "amusement-park-spinning-cup-control-wheel", "overview");
    controlWheel.rotation.x = Math.PI * 0.5;
    controlWheel.position.y = 1.15;
    cup.add(controlColumn, controlWheel);
    cup.position.set(Math.cos(angle) * 3.25, 0.3, Math.sin(angle) * 3.25);
    cupCars.push(cup);
    cups.add(cup);
  }
  for (let bulbIndex = 0; bulbIndex < 20; bulbIndex += 1) {
    const angle = bulbIndex / 20 * Math.PI * 2;
    addBulb(cups, Math.cos(angle) * 5.1, 0.52, Math.sin(angle) * 5.1, bulbIndex);
  }
  park.add(cups);
  for (let index = 0; index < 3; index += 1) {
    const height = 0.16 * (index + 1);
    const step = parkMesh(new THREE.BoxGeometry(3.2, height, 0.62), paving, "amusement-park-spinning-cups-loading-step", "overview");
    step.position.set(18, 0.4 + height * 0.5, 24.8 + index * 0.56);
    park.add(step);
  }

  const bumper = new THREE.Group();
  bumper.name = "amusement-park-bumper-cars";
  bumper.position.set(-68, 0.5, 17);
  bumper.scale.setScalar(1.38);
  bumper.userData = { carCount: 5, passengersPerCar: 1, overheadPowerGrid: true, enclosedArena: true };
  const bumperFloor = parkMesh(new THREE.BoxGeometry(11, 0.45, 8), steel, "amusement-park-bumper-cars-floor", "overview");
  const bumperRoof = parkMesh(new THREE.BoxGeometry(12, 0.55, 9), blue, "amusement-park-bumper-cars-roof", "overview");
  bumperRoof.position.y = 5.8;
  const bumperPowerGrid = parkMesh(new THREE.PlaneGeometry(10.8, 7.8, 12, 9), playNet, "amusement-park-bumper-cars-power-grid", "overview");
  bumperPowerGrid.rotation.x = -Math.PI * 0.5;
  bumperPowerGrid.position.y = 5.42;
  bumper.add(bumperFloor, bumperRoof, bumperPowerGrid);
  for (const x of [-5.3, 5.3]) for (const z of [-3.8, 3.8]) {
    const post = parkMesh(new THREE.CylinderGeometry(0.15, 0.15, 5.6, 6), dark, "amusement-park-bumper-cars-post", "overview");
    post.position.set(x, 2.8, z);
    bumper.add(post);
  }
  for (const [x, z, width, depth] of [[0, -3.84, 11, 0.16], [-5.42, 0, 0.16, 7.8], [5.42, 0, 0.16, 7.8]] as Array<[number, number, number, number]>) {
    const barrier = parkMesh(new THREE.BoxGeometry(width, 0.62, depth), dark, "amusement-park-bumper-cars-arena-barrier", "overview");
    barrier.position.set(x, 0.48, z);
    bumper.add(barrier);
  }
  const bumperCars: THREE.Group[] = [];
  for (let i = 0; i < 5; i += 1) {
    const car = new THREE.Group();
    car.name = "amusement-park-bumper-car";
    car.userData = { phase: i * 1.3, passengerCapacity: 1, wheelCount: 4, safetyBelt: true, overheadCollector: true };
    const chassis = parkMesh(new THREE.CylinderGeometry(1.03, 1.14, 0.24, 14), dark, "amusement-park-bumper-car-chassis", "overview");
    chassis.scale.z = 0.7;
    chassis.position.y = 0.24;
    const rubberBumper = parkMesh(new THREE.TorusGeometry(1.08, 0.16, 8, 20), dark, "amusement-park-bumper-car-rubber-bumper", "overview");
    rubberBumper.scale.y = 0.66;
    rubberBumper.rotation.x = Math.PI * 0.5;
    rubberBumper.position.y = 0.3;
    const body = parkMesh(new THREE.CapsuleGeometry(0.5, 0.9, 4, 10), bulbMaterials[i], "amusement-park-bumper-car-body", "overview");
    body.rotation.x = Math.PI * 0.5;
    body.scale.x = 1.12;
    body.position.set(0, 0.66, 0.03);
    const hood = parkMesh(new THREE.BoxGeometry(1.15, 0.32, 0.6), bulbMaterials[i], "amusement-park-bumper-car-hood", "overview");
    hood.position.set(0, 0.62, 0.72);
    const seat = parkMesh(new THREE.BoxGeometry(0.82, 0.18, 0.55), red, "amusement-park-bumper-car-seat", "overview");
    seat.position.set(0, 0.92, -0.22);
    const seatBack = parkMesh(new THREE.BoxGeometry(0.82, 0.82, 0.16), red, "amusement-park-bumper-car-seat-back", "overview");
    seatBack.position.set(0, 1.28, -0.52);
    const steeringColumn = parkMesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 8), steel, "amusement-park-bumper-car-steering-column", "overview");
    steeringColumn.rotation.x = -0.5;
    steeringColumn.position.set(0, 1.02, 0.3);
    const steeringWheel = parkMesh(new THREE.TorusGeometry(0.25, 0.05, 6, 12), dark, "amusement-park-bumper-car-steering-wheel", "overview");
    steeringWheel.rotation.x = -0.5;
    steeringWheel.position.set(0, 1.2, 0.44);
    const safetyBelt = parkMesh(new THREE.BoxGeometry(0.72, 0.07, 0.08), yellow, "amusement-park-bumper-car-safety-belt", "overview");
    safetyBelt.position.set(0, 1.08, -0.08);
    safetyBelt.rotation.z = 0.18;
    car.add(chassis, rubberBumper, body, hood, seat, seatBack, steeringColumn, steeringWheel, safetyBelt);
    for (const wheelX of [-0.7, 0.7]) {
      for (const wheelZ of [-0.48, 0.48]) {
        const wheel = parkMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 8), dark, "amusement-park-bumper-car-wheel", "overview");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(wheelX, 0.16, wheelZ);
        car.add(wheel);
      }
    }
    const collectorPole = beamBetween(new THREE.Vector3(0.25, 1.1, -0.48), new THREE.Vector3(0.5, 5.05, -0.65), 0.045, steel, "amusement-park-bumper-car-collector-pole", "overview");
    const collectorShoe = parkMesh(new THREE.BoxGeometry(0.58, 0.1, 0.18), yellow, "amusement-park-bumper-car-collector-shoe", "overview");
    collectorShoe.position.set(0.5, 5.1, -0.65);
    for (const lightX of [-0.38, 0.38]) {
      const headlight = parkMesh(new THREE.SphereGeometry(0.1, 7, 5), ivory, "amusement-park-bumper-car-headlight", "overview");
      headlight.position.set(lightX, 0.7, 1.03);
      car.add(headlight);
    }
    car.add(collectorPole, collectorShoe);
    bumperCars.push(car);
    bumper.add(car);
  }
  park.add(bumper);

  // Roller coaster uses two rails, repeated supports, and a four-car train.
  const coaster = new THREE.Group();
  coaster.name = "amusement-park-roller-coaster";
  coaster.userData = { railCount: 2, crossTieCount: 72, trackOffsetMode: "curve-normal", supportSystem: "portal-frames-with-station-clear-span", stationPedestrianZoneClear: true };
  const coasterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-78, 2.4, -41),
    new THREE.Vector3(-78, 2.4, -46),
    new THREE.Vector3(-78, 2.4, -51),
    new THREE.Vector3(-78, 2.4, -56),
    new THREE.Vector3(-62, 13, -52),
    new THREE.Vector3(-45, 32, -49),
    new THREE.Vector3(-24, 8, -49),
    new THREE.Vector3(2, 22, -41),
    new THREE.Vector3(-10, 6, -27),
    new THREE.Vector3(-38, 11, -25),
    new THREE.Vector3(-69, 4.2, -32),
  ], true, "catmullrom", 0.35);
  const buildCoasterOffsetCurve = (sideOffset: number, verticalOffset = 0) => {
    const points: THREE.Vector3[] = [];
    for (let sampleIndex = 0; sampleIndex < 160; sampleIndex += 1) {
      const t = sampleIndex / 160;
      const point = coasterCurve.getPointAt(t);
      const tangent = coasterCurve.getTangentAt(t).setY(0).normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      points.push(point.add(normal.multiplyScalar(sideOffset)).add(new THREE.Vector3(0, verticalOffset, 0)));
    }
    return new THREE.CatmullRomCurve3(points, true, "centripetal");
  };
  for (const sideOffset of [-0.55, 0.55]) {
    const railCurve = buildCoasterOffsetCurve(sideOffset);
    coaster.add(parkMesh(new THREE.TubeGeometry(railCurve, 220, 0.24, 6, true), red, "amusement-park-coaster-rail", "coaster"));
  }
  const coasterSpineCurve = buildCoasterOffsetCurve(0, -0.4);
  coaster.add(parkMesh(new THREE.TubeGeometry(coasterSpineCurve, 220, 0.13, 6, true), dark, "amusement-park-coaster-track-spine", "coaster"));
  for (let tieIndex = 0; tieIndex < 72; tieIndex += 1) {
    const point = coasterCurve.getPointAt(tieIndex / 72);
    const tangent = coasterCurve.getTangentAt(tieIndex / 72).setY(0).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const tie = parkMesh(new THREE.BoxGeometry(1.62, 0.12, 0.16), dark, "amusement-park-coaster-cross-tie", "coaster");
    tie.position.copy(point).add(new THREE.Vector3(0, -0.18, 0));
    tie.rotation.y = Math.atan2(-normal.z, normal.x);
    coaster.add(tie);
  }
  for (let supportIndex = 0; supportIndex < 32; supportIndex += 1) {
    const t = supportIndex / 32;
    const point = coasterCurve.getPointAt(t);
    const tangent = coasterCurve.getTangentAt(t).setY(0).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const inStationPedestrianZone = point.x > -85 && point.x < -71 && point.z > -58 && point.z < -39;
    if (inStationPedestrianZone) continue;
    const inVisitorFrontZone = point.x > -72 && point.x < -48 && point.z > -56 && point.z < -44;
    if (inVisitorFrontZone) continue;
    const topA = point.clone().add(normal.clone().multiplyScalar(1.48)).add(new THREE.Vector3(0, -0.46, 0));
    const topB = point.clone().add(normal.clone().multiplyScalar(-1.48)).add(new THREE.Vector3(0, -0.46, 0));
    for (const top of [topA, topB]) {
      const legHeight = Math.max(0.5, top.y - 0.5);
      const leg = parkMesh(new THREE.CylinderGeometry(0.18, 0.25, legHeight, 7), steel, "amusement-park-coaster-support", "coaster");
      leg.position.set(top.x, 0.5 + legHeight * 0.5, top.z);
      leg.userData = { supportType: "portal-leg" };
      coaster.add(leg);
    }
    const crossbeam = beamBetween(topA, topB, 0.12, dark, "amusement-park-coaster-support-crossbeam", "coaster");
    coaster.add(crossbeam);
  }
  const coasterTrain = new THREE.Group();
  coasterTrain.name = "amusement-park-coaster-train";
  coasterTrain.userData = { carCount: 4, passengersPerCar: 2, linkedTrain: true, restraintType: "lap-bar" };
  const coasterCars: THREE.Group[] = [];
  for (let i = 0; i < 4; i += 1) {
    const car = new THREE.Group();
    car.name = "amusement-park-coaster-car";
    car.userData = { carNumber: i + 1, passengerCapacity: 2, underfrictionWheels: true, lapBarCount: 2 };
    const chassis = parkMesh(new THREE.BoxGeometry(1.9, 0.28, 2.9), dark, "amusement-park-coaster-car-chassis", "coaster");
    chassis.position.y = -0.12;
    const body = parkMesh(new THREE.BoxGeometry(2.05, 0.72, 2.55), i % 2 ? yellow : blue, "amusement-park-coaster-car-body", "coaster");
    body.position.y = 0.34;
    const nose = parkMesh(new THREE.ConeGeometry(1.02, 1.2, 4), i % 2 ? yellow : blue, "amusement-park-coaster-car-nose", "coaster");
    nose.rotation.set(Math.PI * 0.5, Math.PI * 0.25, 0);
    nose.position.set(0, 0.4, 1.65);
    car.add(chassis, body, nose);
    for (const seatX of [-0.48, 0.48]) {
      const seat = parkMesh(new THREE.BoxGeometry(0.78, 0.22, 0.82), red, "amusement-park-coaster-passenger-seat", "coaster");
      seat.position.set(seatX, 0.82, -0.2);
      const back = parkMesh(new THREE.BoxGeometry(0.78, 0.95, 0.18), red, "amusement-park-coaster-seat-back", "coaster");
      back.position.set(seatX, 1.25, -0.54);
      const lapBar = parkMesh(new THREE.TorusGeometry(0.3, 0.065, 6, 12, Math.PI), dark, "amusement-park-coaster-lap-bar", "coaster");
      lapBar.position.set(seatX, 1.05, 0.1);
      lapBar.rotation.x = Math.PI * 0.5;
      car.add(seat, back, lapBar);
    }
    for (const wheelX of [-0.72, 0.72]) {
      for (const wheelZ of [-0.88, 0.88]) {
        const wheel = parkMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 10), dark, "amusement-park-coaster-guide-wheel", "coaster");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(wheelX, -0.35, wheelZ);
        car.add(wheel);
      }
    }
    const coupler = parkMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.65, 8), steel, "amusement-park-coaster-car-coupler", "coaster");
    coupler.rotation.x = Math.PI * 0.5;
    coupler.position.set(0, -0.08, -1.72);
    car.add(coupler);
    coasterCars.push(car);
    coasterTrain.add(car);
  }
  coaster.add(coasterTrain);
  park.add(coaster);
  const coasterPlatform = new THREE.Group();
  coasterPlatform.name = "amusement-park-coaster-loading-platform";
  coasterPlatform.userData = { splitSidePlatforms: true, platformTopMeters: 3.18, trackChannelClearWidthMeters: 2.4, supportedSlab: true };
  const coasterPlatformSpecs: Array<[number, number, number]> = [[-74.35, 4.6, 1], [-81.05, 3.5, -1]];
  coasterPlatformSpecs.forEach(([deckX, deckWidth, outerDirection], platformIndex) => {
    const deck = parkMesh(new THREE.BoxGeometry(deckWidth, 0.28, 14.4), paving, "amusement-park-coaster-platform-deck", "coaster");
    deck.position.set(deckX, 3.04, -48.2);
    deck.userData = { platformRole: platformIndex === 0 ? "boarding" : "exit" };
    const outerX = deckX + outerDirection * (deckWidth * 0.5 - 0.09);
    const innerX = deckX - outerDirection * (deckWidth * 0.5 - 0.09);
    const fascia = parkMesh(new THREE.BoxGeometry(0.18, 0.52, 14.4), platformIndex === 0 ? blue : aqua, "amusement-park-coaster-platform-fascia", "coaster");
    fascia.position.set(outerX, 2.84, -48.2);
    coasterPlatform.add(deck, fascia);
    for (const columnZ of [-54, -48.2, -42.4]) {
      const column = parkMesh(new THREE.CylinderGeometry(0.16, 0.23, 2.5, 8), steel, "amusement-park-coaster-platform-column", "coaster");
      column.position.set(deckX, 1.75, columnZ);
      coasterPlatform.add(column);
    }
    const outerRail = parkMesh(new THREE.BoxGeometry(0.09, 0.09, 14), dark, "amusement-park-coaster-platform-guardrail", "coaster");
    outerRail.position.set(outerX, 4.08, -48.2);
    coasterPlatform.add(outerRail);
    for (const postZ of [-54.9, -52.2, -49.5, -46.8, -44.1, -41.3]) {
      const guardPost = parkMesh(new THREE.CylinderGeometry(0.045, 0.055, 0.92, 7), dark, "amusement-park-coaster-platform-guard-post", "coaster");
      guardPost.position.set(outerX, 3.62, postZ);
      coasterPlatform.add(guardPost);
    }
    for (const gateZ of [-52.2, -48.2, -44.2]) {
      const boardingGate = parkMesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), yellow, "amusement-park-coaster-platform-boarding-gate", "coaster");
      boardingGate.position.set(innerX, 3.92, gateZ);
      boardingGate.userData = { operable: true, state: "open", clearWidthMeters: 1.6 };
      coasterPlatform.add(boardingGate);
    }
  });

  const stationCanopy = new THREE.Group();
  stationCanopy.name = "amusement-park-coaster-station-canopy";
  stationCanopy.userData = { roofType: "dual-pitch", risingTrackExitNotch: true, supportColumnsOutsideTrackChannel: true };
  const westRoofPanel = parkMesh(new THREE.BoxGeometry(5.7, 0.26, 15.3), blue, "amusement-park-coaster-station-roof-panel", "coaster");
  westRoofPanel.position.set(-80.1, 6.32, -48.2);
  westRoofPanel.rotation.z = 0.12;
  const eastNorthRoofPanel = parkMesh(new THREE.BoxGeometry(5.7, 0.26, 12), aqua, "amusement-park-coaster-station-roof-panel", "coaster");
  eastNorthRoofPanel.position.set(-74.8, 6.32, -46.6);
  eastNorthRoofPanel.rotation.z = -0.12;
  const eastSouthRoofPanel = parkMesh(new THREE.BoxGeometry(3.8, 0.26, 3.2), aqua, "amusement-park-coaster-station-roof-panel", "coaster");
  eastSouthRoofPanel.position.set(-75.75, 6.32, -54.2);
  eastSouthRoofPanel.rotation.z = -0.12;
  stationCanopy.add(westRoofPanel, eastNorthRoofPanel, eastSouthRoofPanel);
  for (const canopyX of [-82.7, -72.2]) {
    for (const canopyZ of [-54.6, -48.2, -41.8]) {
      const canopyColumn = parkMesh(new THREE.CylinderGeometry(0.12, 0.17, 3.05, 8), dark, "amusement-park-coaster-station-canopy-column", "coaster");
      canopyColumn.position.set(canopyX, 4.68, canopyZ);
      stationCanopy.add(canopyColumn);
    }
  }
  const stationSign = parkMesh(new THREE.BoxGeometry(5.2, 0.9, 0.16), yellow, "amusement-park-coaster-station-sign", "coaster");
  stationSign.position.set(-74.5, 5.45, -55.75);
  stationCanopy.add(stationSign);
  coasterPlatform.add(stationCanopy);
  park.add(coasterPlatform);
  for (let index = 0; index < 7; index += 1) {
    const height = 0.38 * (7 - index);
    const step = parkMesh(new THREE.BoxGeometry(0.68, height, 3.2), paving, "amusement-park-coaster-loading-step", "coaster");
    step.position.set(-71.7 + index * 0.58, 0.5 + height * 0.5, -49);
    park.add(step);
  }
  for (const side of [-1, 1]) {
    const stairRail = beamBetween(
      new THREE.Vector3(-71.95, 3.72, -49 + side * 1.52),
      new THREE.Vector3(-68.2, 1.38, -49 + side * 1.52),
      0.055,
      dark,
      "amusement-park-coaster-loading-stair-handrail",
      "coaster",
    );
    park.add(stairRail);
  }

  const coasterVisitorCentre = new THREE.Group();
  coasterVisitorCentre.name = "amusement-park-coaster-visitor-centre";
  coasterVisitorCentre.position.set(-62, 0.5, -60.5);
  coasterVisitorCentre.userData = {
    zone: "coaster",
    frontDirection: "+z",
    services: ["tickets", "information", "lockers", "first-aid", "toilets"],
    ticketCounterCount: 4,
    lockerCount: 12,
    barrierFree: true,
    connectedToLoadingPlatform: true,
  };
  const visitorFloor = parkMesh(new THREE.BoxGeometry(24, 0.24, 7.5), paving, "amusement-park-coaster-visitor-floor", "coaster");
  visitorFloor.position.y = 0.12;
  const visitorRearWall = parkMesh(new THREE.BoxGeometry(24, 6.3, 0.24), aqua, "amusement-park-coaster-visitor-wall", "coaster");
  visitorRearWall.position.set(0, 3.15, -3.63);
  const visitorLeftWall = parkMesh(new THREE.BoxGeometry(0.24, 6.3, 7.5), aqua, "amusement-park-coaster-visitor-wall", "coaster");
  visitorLeftWall.position.set(-11.88, 3.15, 0);
  const visitorRightWall = visitorLeftWall.clone();
  visitorRightWall.position.x = 11.88;
  for (const side of [-1, 1]) {
    const frontWall = parkMesh(new THREE.BoxGeometry(9, 6.3, 0.24), aqua, "amusement-park-coaster-visitor-wall", "coaster");
    frontWall.position.set(side * 7.5, 3.15, 3.63);
    const frontGlass = parkMesh(new THREE.BoxGeometry(7.8, 3.4, 0.1), windowMaterial, "amusement-park-coaster-visitor-window", "coaster");
    frontGlass.position.set(side * 7.5, 3.3, 3.78);
    coasterVisitorCentre.add(frontWall, frontGlass);
  }
  const visitorRoof = parkMesh(new THREE.BoxGeometry(25, 0.42, 8.5), blue, "amusement-park-coaster-visitor-roof", "coaster");
  visitorRoof.position.y = 6.52;
  const visitorCanopy = parkMesh(new THREE.BoxGeometry(7.2, 0.28, 2.4), red, "amusement-park-coaster-visitor-canopy", "coaster");
  visitorCanopy.position.set(0, 4.9, 4.45);
  visitorCanopy.rotation.x = -0.08;
  const visitorSign = parkMesh(new THREE.BoxGeometry(6.4, 1.05, 0.18), yellow, "amusement-park-coaster-visitor-sign", "coaster");
  visitorSign.position.set(0, 5.55, 3.82);
  const visitorPorch = parkMesh(new THREE.BoxGeometry(8.2, 0.12, 2.2), paving, "amusement-park-coaster-visitor-porch", "coaster");
  visitorPorch.position.set(0, 0.12, 4.45);
  coasterVisitorCentre.add(visitorFloor, visitorRearWall, visitorLeftWall, visitorRightWall, visitorRoof, visitorCanopy, visitorSign, visitorPorch);
  for (const doorX of [-1.35, 1.35]) {
    const entranceDoor = parkMesh(new THREE.BoxGeometry(2.45, 3.55, 0.08), glass, "amusement-park-coaster-visitor-entrance-door", "coaster");
    entranceDoor.position.set(doorX, 2.02, 3.76);
    entranceDoor.userData = { automaticSliding: true, state: "open", clearWidthMeters: 2.45 };
    coasterVisitorCentre.add(entranceDoor);
  }
  for (const postX of [-3.15, 3.15]) {
    const canopyPost = parkMesh(new THREE.CylinderGeometry(0.1, 0.13, 4.52, 8), dark, "amusement-park-coaster-visitor-canopy-post", "coaster");
    canopyPost.position.set(postX, 2.5, 4.38);
    coasterVisitorCentre.add(canopyPost);
  }

  for (let counterIndex = 0; counterIndex < 4; counterIndex += 1) {
    const counter = parkMesh(new THREE.BoxGeometry(3.1, 1.05, 0.9), counterIndex % 2 ? orange : yellow, "amusement-park-coaster-ticket-counter", "coaster");
    counter.position.set(-7.4 + counterIndex * 3.7, 0.85, -1.85);
    counter.userData = { counterNumber: counterIndex + 1, accessibleCounter: counterIndex === 3 };
    coasterVisitorCentre.add(counter);
  }
  const informationDesk = parkMesh(new THREE.CylinderGeometry(1.25, 1.4, 1.05, 12, 1, false, 0, Math.PI), blue, "amusement-park-coaster-information-desk", "coaster");
  informationDesk.position.set(-7.6, 0.85, 1.4);
  informationDesk.rotation.y = Math.PI * 0.5;
  coasterVisitorCentre.add(informationDesk);
  for (let lockerIndex = 0; lockerIndex < 12; lockerIndex += 1) {
    const row = Math.floor(lockerIndex / 6);
    const column = lockerIndex % 6;
    const locker = parkMesh(new THREE.BoxGeometry(0.82, 1.15, 0.55), steel, "amusement-park-coaster-visitor-locker", "coaster");
    locker.position.set(-10.1 + column * 0.92, 0.85 + row * 1.2, -3.28);
    coasterVisitorCentre.add(locker);
  }
  for (const [name, x, z, material] of [["first-aid", 8.6, -1.8, red], ["toilets", 8.6, 1.65, blue]] as Array<[string, number, number, THREE.Material]>) {
    const serviceRoom = parkMesh(new THREE.BoxGeometry(5, 3.1, 2.7), material, "amusement-park-coaster-visitor-service-room", "coaster");
    serviceRoom.position.set(x, 1.67, z);
    serviceRoom.userData = { service: name, publiclyAccessible: true };
    coasterVisitorCentre.add(serviceRoom);
  }
  for (let railIndex = 0; railIndex < 6; railIndex += 1) {
    const queueRail = parkMesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), steel, "amusement-park-coaster-visitor-queue-rail", "coaster");
    queueRail.position.set(-2.2, 1.05, 0.25 + railIndex * 0.55);
    coasterVisitorCentre.add(queueRail);
    for (const railX of [-4.5, 0.1]) {
      const queuePost = parkMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.85, 8), steel, "amusement-park-coaster-visitor-queue-post", "coaster");
      queuePost.position.set(railX, 0.7, 0.25 + railIndex * 0.55);
      coasterVisitorCentre.add(queuePost);
    }
  }
  park.add(coasterVisitorCentre);

  const visitorPathStart = new THREE.Vector3(-62, 0.58, -56.65);
  const visitorPathEnd = new THREE.Vector3(-67.8, 0.58, -53.5);
  const visitorPathDirection = visitorPathEnd.clone().sub(visitorPathStart);
  const visitorPath = new THREE.Group();
  visitorPath.name = "amusement-park-coaster-visitor-access-path";
  visitorPath.userData = {
    barrierFree: true,
    clearWidthMeters: 3.2,
    connectsVisitorCentreToLoadingPlatform: true,
    accessType: "ground-path-elevator-bridge",
    stepFree: true,
  };
  const groundConnector = parkMesh(new THREE.BoxGeometry(3.2, 0.12, visitorPathDirection.length()), paving, "amusement-park-coaster-access-ground-connector", "coaster");
  groundConnector.position.copy(visitorPathStart).add(visitorPathEnd).multiplyScalar(0.5);
  groundConnector.rotation.y = Math.atan2(visitorPathDirection.x, visitorPathDirection.z);
  visitorPath.add(groundConnector);

  const liftTower = new THREE.Group();
  liftTower.name = "amusement-park-coaster-platform-lift";
  liftTower.position.set(-68.8, 0.5, -53.1);
  liftTower.userData = { accessible: true, servesLevels: [0, 3.18], enclosed: true };
  const liftFloor = parkMesh(new THREE.BoxGeometry(3, 0.18, 3), paving, "amusement-park-coaster-lift-floor", "coaster");
  liftFloor.position.y = 0.09;
  const liftRoof = parkMesh(new THREE.BoxGeometry(3.2, 0.22, 3.2), blue, "amusement-park-coaster-lift-roof", "coaster");
  liftRoof.position.y = 4.18;
  liftTower.add(liftFloor, liftRoof);
  for (const x of [-1.42, 1.42]) {
    for (const z of [-1.42, 1.42]) {
      const liftPost = parkMesh(new THREE.CylinderGeometry(0.07, 0.09, 4, 8), dark, "amusement-park-coaster-lift-post", "coaster");
      liftPost.position.set(x, 2.05, z);
      liftTower.add(liftPost);
    }
  }
  for (const side of [-1, 1]) {
    const liftGlassX = parkMesh(new THREE.BoxGeometry(0.08, 3.7, 2.7), glass, "amusement-park-coaster-lift-glass", "coaster");
    liftGlassX.position.set(side * 1.43, 2.05, 0);
    const liftGlassZ = parkMesh(new THREE.BoxGeometry(2.7, 3.7, 0.08), glass, "amusement-park-coaster-lift-glass", "coaster");
    liftGlassZ.position.set(0, 2.05, side * 1.43);
    liftTower.add(liftGlassX, liftGlassZ);
  }
  const liftCar = parkMesh(new THREE.BoxGeometry(2.5, 0.16, 2.5), yellow, "amusement-park-coaster-lift-car", "coaster");
  liftCar.position.y = 0.28;
  liftTower.add(liftCar);
  visitorPath.add(liftTower);

  const bridgeStart = new THREE.Vector3(-69.55, 3.1, -52.15);
  const bridgeEnd = new THREE.Vector3(-72.35, 3.1, -51.2);
  const bridgeDirection = bridgeEnd.clone().sub(bridgeStart);
  const accessBridge = parkMesh(new THREE.BoxGeometry(2.1, 0.16, bridgeDirection.length()), paving, "amusement-park-coaster-access-bridge", "coaster");
  accessBridge.position.copy(bridgeStart).add(bridgeEnd).multiplyScalar(0.5);
  accessBridge.rotation.y = Math.atan2(bridgeDirection.x, bridgeDirection.z);
  visitorPath.add(accessBridge);
  const bridgeNormal = new THREE.Vector3(-bridgeDirection.z, 0, bridgeDirection.x).normalize();
  for (const side of [-1, 1]) {
    const railOffset = bridgeNormal.clone().multiplyScalar(side * 1.02);
    visitorPath.add(beamBetween(
      bridgeStart.clone().add(railOffset).add(new THREE.Vector3(0, 0.92, 0)),
      bridgeEnd.clone().add(railOffset).add(new THREE.Vector3(0, 0.92, 0)),
      0.045,
      dark,
      "amusement-park-coaster-access-bridge-handrail",
      "coaster",
    ));
  }
  park.add(visitorPath);

  // Kart circuit follows the entertainment district at the eastern edge.
  const karting = new THREE.Group();
  karting.name = "amusement-park-karting-circuit";
  const kartCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(73, 0.54, -37),
    new THREE.Vector3(64.8, 0.54, -24.3),
    new THREE.Vector3(45, 0.54, -19),
    new THREE.Vector3(25.2, 0.54, -24.3),
    new THREE.Vector3(17, 0.54, -37),
    new THREE.Vector3(25.2, 0.54, -49.7),
    new THREE.Vector3(45, 0.54, -55),
    new THREE.Vector3(64.8, 0.54, -49.7),
  ], true, "centripetal");
  const kartTrack = parkMesh(buildFlatRibbonGeometry(kartCurve, 192, 3.3), road, "amusement-park-kart-track", "karting");
  karting.add(kartTrack);
  for (const offset of [-1.25, 1.25]) {
    const edgePoints: THREE.Vector3[] = [];
    for (let index = 0; index < 96; index += 1) {
      const t = index / 96;
      const point = kartCurve.getPointAt(t);
      const tangent = kartCurve.getTangentAt(t).setY(0).normalize();
      edgePoints.push(point.add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(offset)).setY(0.6));
    }
    const lineCurve = new THREE.CatmullRomCurve3(edgePoints, true, "centripetal");
    karting.add(parkMesh(new THREE.TubeGeometry(lineCurve, 192, 0.07, 5, true), ivory, "amusement-park-kart-track-line", "karting"));
  }
  for (const offset of [-3.45, 3.45]) {
    const barrierPoints: THREE.Vector3[] = [];
    for (let index = 0; index < 96; index += 1) {
      const t = index / 96;
      const point = kartCurve.getPointAt(t);
      const tangent = kartCurve.getTangentAt(t).setY(0).normalize();
      barrierPoints.push(point.add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(offset)).setY(0.96));
    }
    const barrierCurve = new THREE.CatmullRomCurve3(barrierPoints, true, "centripetal");
    karting.add(parkMesh(new THREE.TubeGeometry(barrierCurve, 192, 0.12, 6, true), steel, "amusement-park-kart-safety-barrier", "karting"));
  }
  const karts: THREE.Group[] = [];
  for (let i = 0; i < 6; i += 1) {
    const kart = new THREE.Group();
    kart.name = "amusement-park-go-kart";
    kart.userData = { phase: i / 6, vehicleType: "single-seat-go-kart", wheelCount: 4, steeringWheel: true, safetyBumper: true };
    const chassis = parkMesh(new THREE.BoxGeometry(1.55, 0.16, 2.65), dark, "amusement-park-go-kart-chassis", "karting");
    chassis.position.y = 0.24;
    const body = parkMesh(new THREE.BoxGeometry(1.4, 0.42, 1.35), bulbMaterials[i % bulbMaterials.length], "amusement-park-go-kart-body", "karting");
    body.position.set(0, 0.48, 0.15);
    const nose = parkMesh(new THREE.BoxGeometry(1.2, 0.34, 0.95), bulbMaterials[i % bulbMaterials.length], "amusement-park-go-kart-nose", "karting");
    nose.position.set(0, 0.42, 0.98);
    const engine = parkMesh(new THREE.BoxGeometry(0.88, 0.66, 0.72), steel, "amusement-park-go-kart-engine", "karting");
    engine.position.set(0, 0.6, -0.92);
    const seat = parkMesh(new THREE.BoxGeometry(0.86, 0.18, 0.72), dark, "amusement-park-go-kart-seat", "karting");
    seat.position.set(0, 0.74, -0.08);
    const seatBack = parkMesh(new THREE.BoxGeometry(0.86, 0.82, 0.16), dark, "amusement-park-go-kart-seat-back", "karting");
    seatBack.position.set(0, 1.05, -0.42);
    const steeringColumn = parkMesh(new THREE.CylinderGeometry(0.045, 0.055, 0.58, 8), steel, "amusement-park-go-kart-steering-column", "karting");
    steeringColumn.rotation.x = -0.55;
    steeringColumn.position.set(0, 0.92, 0.42);
    const steeringWheel = parkMesh(new THREE.TorusGeometry(0.28, 0.055, 6, 12), dark, "amusement-park-go-kart-steering-wheel", "karting");
    steeringWheel.rotation.x = -0.55;
    steeringWheel.position.set(0, 1.12, 0.58);
    const frontBumper = parkMesh(new THREE.BoxGeometry(1.85, 0.14, 0.16), steel, "amusement-park-go-kart-safety-bumper", "karting");
    frontBumper.position.set(0, 0.26, 1.45);
    const rearBumper = frontBumper.clone();
    rearBumper.name = "amusement-park-go-kart-safety-bumper";
    rearBumper.position.z = -1.45;
    kart.add(chassis, body, nose, engine, seat, seatBack, steeringColumn, steeringWheel, frontBumper, rearBumper);
    for (const wheelX of [-0.9, 0.9]) {
      for (const wheelZ of [-0.88, 0.88]) {
        const wheel = parkMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), dark, "amusement-park-go-kart-wheel", "karting");
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(wheelX, 0.34, wheelZ);
        kart.add(wheel);
      }
    }
    for (const headlightX of [-0.38, 0.38]) {
      const headlight = parkMesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), ivory, "amusement-park-go-kart-headlight", "karting");
      headlight.position.set(headlightX, 0.52, 1.47);
      kart.add(headlight);
    }
    const driverTorso = parkMesh(new THREE.CylinderGeometry(0.25, 0.3, 0.62, 8), bulbMaterials[(i + 2) % bulbMaterials.length], "amusement-park-go-kart-driver-torso", "karting");
    driverTorso.position.set(0, 1.15, -0.05);
    const driver = parkMesh(new THREE.SphereGeometry(0.34, 8, 6), ivory, "amusement-park-go-kart-driver", "karting");
    driver.position.set(0, 1.63, -0.05);
    kart.add(driverTorso, driver);
    karts.push(kart);
    karting.add(kart);
  }
  const kartPit = new THREE.Group();
  kartPit.name = "amusement-park-kart-pit-building";
  kartPit.position.set(9, 0, -37);
  kartPit.userData = { zone: "karting", garageBayCount: 3, trackClearanceMeters: 1.5, serviceFrontFacing: "+x" };
  const kartPitShell = parkMesh(new THREE.BoxGeometry(6, 5.5, 18), orange, "amusement-park-kart-pit-shell", "karting");
  kartPitShell.position.y = 3.2;
  const kartPitRoof = parkMesh(new THREE.BoxGeometry(6.7, 0.35, 18.7), red, "amusement-park-kart-pit-roof", "karting");
  kartPitRoof.position.y = 6.12;
  kartPit.add(kartPitShell, kartPitRoof);
  for (const [bayIndex, z] of [-6, 0, 6].entries()) {
    const garageDoor = parkMesh(new THREE.BoxGeometry(0.18, 3.4, 4.6), dark, "amusement-park-kart-pit-garage-door", "karting");
    garageDoor.position.set(3.06, 2.25, z);
    garageDoor.userData = { bayNumber: bayIndex + 1, facesTrack: true };
    kartPit.add(garageDoor);
  }
  karting.add(kartPit);

  const kartSafetyWalkway = parkMesh(new THREE.BoxGeometry(74, 0.12, 2), paving, "amusement-park-kart-safety-walkway", "karting");
  kartSafetyWalkway.position.set(47, 0.56, -60.2);
  kartSafetyWalkway.userData = { perimeterEmergencyAccess: true, clearWidthMeters: 2 };
  karting.add(kartSafetyWalkway);
  park.add(karting);

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

  addRideSafetyFence("carousel", -43, 17, 22, 22);
  addRideSafetyFence("pirate", -15, 18, 30, 24);
  addRideSafetyFence("overview", 18, 17, 18, 18);
  addRideSafetyFence("overview", -68, 17, 18, 14);
  // Pull the front fence two metres forward to create a real covered arrival
  // forecourt, while keeping it clear of the public cross-walk at z=32.
  const ferrisSafetyFence = addRideSafetyFence("ferris", 53, 15, 34, 26, 4.2);
  const ferrisSafetyGate = ferrisSafetyFence.getObjectByName("amusement-park-ride-loading-gate");
  if (ferrisSafetyGate) {
    // Park the sliding leaf beside the 4.2 m opening. The old inward-swinging
    // leaf cut across the visitor-centre approach even while marked "open".
    ferrisSafetyGate.position.set(46.7, 0, 28);
    ferrisSafetyGate.rotation.y = 0;
    ferrisSafetyGate.userData.gateType = "sliding";
    ferrisSafetyGate.userData.separatedEntryExit = true;
  }
  addRideSafetyFence("drop-tower", 69, -8, 13, 17);
  addRideSafetyFence("coaster", -78, -49, 14, 16, 4.2, "right");

  let motionEnabled = true;
  let rideTime = 0;
  const tempPoint = new THREE.Vector3();
  const tempTangent = new THREE.Vector3();
  const updateFerrisBoardingState = () => {
    const cabinInterval = Math.PI * 2 / cabins.length;
    const normalizedAngle = ((ferrisWheel.rotation.z % cabinInterval) + cabinInterval) % cabinInterval;
    const alignmentError = Math.min(normalizedAngle, cabinInterval - normalizedAngle);
    // The 1.25 m cabin door has only 2.5 cm of lateral tolerance on either
    // side of the 1.30 m platform opening. At a 16 m wheel radius even one
    // degree produces roughly 28 cm of offset, so boarding may only unlock
    // when the cabin is accurately docked.
    const alignmentTolerance = THREE.MathUtils.degToRad(0.08);
    const stationOpen = !motionEnabled && alignmentError <= alignmentTolerance;

    accessibleTransferGate.userData.state = stationOpen ? "open" : "closed";
    accessibleTransferGateLeaf.position.z = stationOpen ? 1.7 : 0;

    connectorInterlock.userData.state = stationOpen ? "open" : "closed";
    connectorInterlockGateLeaf.position.z = stationOpen ? 1.7 : 0;
    connectorMovableGuard.userData.state = stationOpen ? "deployed" : "stored";
    connectorMovableGuard.position.set(
      stationOpen ? 57.7 : 60.3,
      ferrisPlatformTop,
      stationOpen ? 15.45 : 17.15,
    );

    platformFlowGates.forEach((gate, index) => {
      gate.userData.state = stationOpen ? "open" : "closed";
      const leaf = platformFlowGateLeaves[index];
      leaf.rotation.y = stationOpen ? Math.PI * 0.5 : 0;
      leaf.position.set(stationOpen ? -0.64 : 0, 0.55, stationOpen ? -0.64 : 0);
    });
    platformInterlockGate.userData.state = stationOpen ? "open" : "closed";
    interlockLeaf.rotation.y = stationOpen ? Math.PI * 0.5 : 0;
    interlockLeaf.position.set(stationOpen ? -0.64 : 0, 0.55, stationOpen ? 0.64 : 0);
    boardingBridge.position.z = stationOpen ? 15.46 : 15.62;
    boardingBridge.userData.state = stationOpen ? "extended" : "retracted";

    cabinDoors.forEach((door, index) => {
      const cabinAngle = cabins[index].userData.angle + ferrisWheel.rotation.z;
      const dockingError = Math.abs(Math.atan2(
        Math.sin(cabinAngle + Math.PI * 0.5),
        Math.cos(cabinAngle + Math.PI * 0.5),
      ));
      const doorOpen = stationOpen && dockingError <= alignmentTolerance;
      door.userData.state = doorOpen ? "open" : "closed";
      // The glazed leaf slides completely into its concealed side pocket.
      // Hiding only the leaf preserves the frame and makes the clear opening
      // visually truthful without intersecting the fixed glazing.
      door.visible = !doorOpen;
    });
  };

  park.userData = {
    mapLayer: "exterior",
    modelType: "amusement-park",
    generatedLocally: true,
    facilities: ["overview", "coaster", "carousel", "pirate", "playground", "circus", "shooting", "karting", "ferris", "drop-tower"],
    facilityCount: 10,
    attractionCount: 12,
    cityBuildingCount: 0,
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
    fenceSegmentCount: 9,
    rideSafetyFenceCount: 7,
    entranceGateLaneCount: 3,
    entranceClearWidth: 15.48,
    loadingGateCount: 7,
    loadingAccessCount: 6,
    indoorPlaygroundEntranceWidth: 17.78,
    shootingServiceOpeningWidth: 14,
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
      updateFerrisBoardingState();
    },
    update(delta: number, elapsed: number) {
      if (motionEnabled) rideTime += Math.min(delta, 0.05);
      const time = motionEnabled ? rideTime : rideTime;

      carouselTurntable.rotation.y = time * 0.52;
      horses.forEach((horse) => { horse.position.y = Math.sin(time * 2.3 + horse.userData.phase) * 0.35; });
      piratePivot.rotation.z = Math.sin(time * 0.88) * 0.3;
      ferrisWheel.rotation.z = time * 0.14;
      cabins.forEach((cabin) => { cabin.rotation.z = -ferrisWheel.rotation.z; });
      updateFerrisBoardingState();
      dropCarriage.position.y = 0.42 + (Math.sin(time * 0.78 - Math.PI * 0.5) * 0.5 + 0.5) * 18.08;
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
        car.position.copy(tempPoint).add(new THREE.Vector3(0, 0.8, 0));
        car.lookAt(car.position.clone().add(tempTangent));
      });
      karts.forEach((kart, index) => {
        const progress = (time * (0.045 + index * 0.0015) + kart.userData.phase) % 1;
        kartCurve.getPointAt(progress, tempPoint);
        kartCurve.getTangentAt(progress, tempTangent);
        kart.position.copy(tempPoint).add(new THREE.Vector3(0, 0.12, 0));
        kart.lookAt(kart.position.clone().add(tempTangent));
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
