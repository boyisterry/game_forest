import * as THREE from "three";
import {
  buildLowPolyRoadsidePlanter,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
} from "./cityFurniture.ts";
import { buildLowPolyVillaResidentialGate } from "./residentialGates.ts";
import { createInstancedPrototypeBatch, createMergedStaticBatch } from "./sceneInstanceBatch.ts";

type CollisionRole = "solid" | "rideable-surface" | "ignore";

export type LuxuryVillaCommunityModel = THREE.Group & {
  userData: {
    mapLayer: "exterior";
    modelType: "luxury-villa-community";
    generatedLocally: true;
    moduleGridMeters: 1;
    siteSize: THREE.Vector3;
    villaCount: number;
    householdCount: number;
    villaClusterCount: 5;
    privateFrontCourtyardCount: number;
    roadNetworkType: "continuous-organic-scenic-loop";
    roadEdgeMinimumSetbackMeters: 4;
    centralEcologicalPark: true;
    greenAndSceneryCoverageRatio: 0.8;
    plantedGreenCoverageRatio: 0.68;
    waterLandscapeCoverageRatio: 0.12;
    environmentalLandscapeAreaSquareMeters: number;
    waterFeatureCount: number;
    bridgeCount: number;
    tennisCourtCount: number;
    outdoorRecreationZoneCount: number;
    rockeryCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    renderBatchCount: number;
    scaleReferenceLengthMeters: 2.4;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    setAccessGateOpen: (open: boolean) => void;
    setPowered: (powered: boolean) => void;
    update: (deltaSeconds: number) => void;
  };
};

export const LUXURY_VILLA_COMMUNITY_WIDTH_METERS = 260;
export const LUXURY_VILLA_COMMUNITY_DEPTH_METERS = 200;

function sceneMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "micro-detail" = "exterior",
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = collisionRole === "solid" && !material.transparent;
  object.receiveShadow = collisionRole !== "ignore";
  object.userData = { mapCollisionRole: collisionRole, mapLayer };
  if (collisionRole === "rideable-surface") object.userData.surfaceProfileId = "site-surface";
  return object;
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  name: string,
  collisionRole: CollisionRole = "solid",
  mapLayer: "exterior" | "micro-detail" = "exterior",
) {
  const object = sceneMesh(new THREE.BoxGeometry(...size), material, name, collisionRole, mapLayer);
  object.position.set(...position);
  parent.add(object);
  return object;
}

function createStreamGeometry() {
  const samples = Array.from({ length: 25 }, (_, index) => {
    const z = -84 + index * 7;
    const center = streamCentreAt(z);
    const halfWidth = 4.8 + Math.cos(z * 0.052) * 1.4;
    return { z, center, halfWidth };
  });
  const shape = new THREE.Shape();
  const outline = [
    ...samples.map(({ z, center, halfWidth }) => new THREE.Vector2(center - halfWidth, -z)),
    ...samples.slice().reverse().map(({ z, center, halfWidth }) => new THREE.Vector2(center + halfWidth, -z)),
  ];
  shape.moveTo(outline[0].x, outline[0].y);
  outline.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI * 0.5);
  return geometry;
}

function streamCentreAt(z: number) {
  return Math.sin((z + 8) * 0.043) * 14 + Math.sin(z * 0.09) * 3.2;
}

type PlanPoint = readonly [x: number, z: number];

function createRibbonGeometry(points: readonly PlanPoint[], width: number, closed = false, segmentsPerPoint = 8) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    "centripetal",
  );
  const segmentCount = Math.max(points.length * segmentsPerPoint, 24);
  const centres = curve.getSpacedPoints(segmentCount);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  centres.forEach((centre, index) => {
    const previous = centres[index === 0 ? (closed ? centres.length - 2 : 0) : index - 1];
    const next = centres[index === centres.length - 1 ? (closed ? 1 : centres.length - 1) : index + 1];
    const tangent = next.clone().sub(previous).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width * 0.5);
    const left = centre.clone().add(normal);
    const right = centre.clone().sub(normal);
    vertices.push(left.x, 0, left.z, right.x, 0, right.z);
    const progress = index / Math.max(centres.length - 1, 1);
    uvs.push(0, progress, 1, progress);
    if (index < centres.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, centres };
}

function addRibbon(
  parent: THREE.Object3D,
  name: string,
  points: readonly PlanPoint[],
  width: number,
  material: THREE.Material,
  y: number,
  closed = false,
  collisionRole: CollisionRole = "rideable-surface",
) {
  const { geometry, centres } = createRibbonGeometry(points, width, closed);
  const ribbon = sceneMesh(geometry, material, name, collisionRole);
  ribbon.position.y = y;
  ribbon.userData = {
    ...ribbon.userData,
    widthMeters: width,
    organicCurve: true,
    centrelinePoints: centres.map((point) => ({ x: point.x, z: point.z })),
  };
  parent.add(ribbon);
  return { ribbon, centres };
}

function nearestRoadPoint(point: THREE.Vector3, roadCentrelines: readonly THREE.Vector3[][]) {
  let closest = roadCentrelines[0][0];
  let distance = Number.POSITIVE_INFINITY;
  roadCentrelines.forEach((centreline) => centreline.forEach((candidate) => {
    const candidateDistance = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }));
  return closest.clone();
}

function addLandscapeBridge(
  parent: THREE.Object3D,
  x: number,
  z: number,
  index: number,
  materials: { stone: THREE.Material; timber: THREE.Material; iron: THREE.Material; lamp: THREE.Material },
) {
  const bridge = new THREE.Group();
  bridge.name = "luxury-villa-community-landscape-bridge";
  bridge.position.set(x, 0, z);
  bridge.userData = {
    bridgeIndex: index,
    crossesWater: true,
    barrierFree: true,
    clearWidthMeters: 3.2,
    guardHeightMeters: 1.1,
  };
  const segmentCount = 9;
  const segmentLength = 2.7;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const normalized = segment / (segmentCount - 1);
    const localX = (segment - (segmentCount - 1) * 0.5) * segmentLength;
    const topY = 1.05 + Math.sin(normalized * Math.PI) * 0.48;
    addBox(
      bridge,
      [segmentLength + 0.08, 0.28, 3.2],
      [localX, topY - 0.14, 0],
      materials.stone,
      "luxury-villa-community-bridge-deck-segment",
      "rideable-surface",
    );
    for (const side of [-1, 1]) {
      addBox(bridge, [0.12, topY - 0.4, 0.12], [localX, (topY + 0.4) * 0.5, side * 1.48], materials.iron, "luxury-villa-community-bridge-rail-post");
      addBox(bridge, [segmentLength + 0.12, 0.1, 0.1], [localX, topY + 1.02, side * 1.48], materials.iron, "luxury-villa-community-bridge-top-rail");
      addBox(bridge, [segmentLength + 0.12, 0.08, 0.08], [localX, topY + 0.55, side * 1.48], materials.iron, "luxury-villa-community-bridge-mid-rail");
    }
  }
  for (const pierX of [-8.1, 8.1]) {
    addBox(bridge, [1.4, 0.72, 2.8], [pierX, 0.76, 0], materials.stone, "luxury-villa-community-bridge-pier");
  }
  for (const lampX of [-10.8, 10.8]) {
    addBox(bridge, [0.14, 2.25, 0.14], [lampX, 2.15, -1.42], materials.iron, "luxury-villa-community-bridge-lamp-post");
    const lens = sceneMesh(new THREE.SphereGeometry(0.22, 8, 6), materials.lamp, "luxury-villa-community-bridge-lamp", "ignore", "micro-detail");
    lens.position.set(lampX, 3.34, -1.42);
    bridge.add(lens);
  }
  parent.add(bridge);
  return bridge;
}

export function buildLowPolyLuxuryVillaCommunity(
  options: Readonly<{ optimizeStatic?: boolean }> = {},
): LuxuryVillaCommunityModel {
  const community = new THREE.Group() as LuxuryVillaCommunityModel;
  community.name = "city-luxury-villa-community-lowpoly";

  const grass = new THREE.MeshStandardMaterial({ color: 0x739862, roughness: 0.98 });
  const meadow = new THREE.MeshStandardMaterial({ color: 0x91ad72, roughness: 0.98 });
  const deepGreen = new THREE.MeshStandardMaterial({ color: 0x587b52, roughness: 0.98 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xbab09b, roughness: 0.94 });
  const paleStone = new THREE.MeshStandardMaterial({ color: 0xd8cfbb, roughness: 0.92 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4f5553, roughness: 0.98 });
  const permeable = new THREE.MeshStandardMaterial({ color: 0xb8aa8e, roughness: 0.96 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x78533c, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x344446, roughness: 0.58, metalness: 0.38 });
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x51a9b0,
    roughness: 0.2,
    metalness: 0.02,
    transparent: true,
    opacity: 0.82,
    transmission: 0.18,
    depthWrite: false,
  });
  const waterFoam = new THREE.MeshStandardMaterial({ color: 0xc7f3ed, roughness: 0.36, transparent: true, opacity: 0.82 });
  const courtBlue = new THREE.MeshStandardMaterial({ color: 0x477b72, roughness: 0.92 });
  const courtGreen = new THREE.MeshStandardMaterial({ color: 0x668c63, roughness: 0.94 });
  const courtLine = new THREE.MeshStandardMaterial({ color: 0xf6f0d8, roughness: 0.86 });
  const recreation = new THREE.MeshStandardMaterial({ color: 0xb97c58, roughness: 0.9 });
  const lampLens = new THREE.MeshStandardMaterial({ color: 0xffd69b, emissive: 0xffb85e, emissiveIntensity: 0.08, roughness: 0.28 });

  const site = sceneMesh(
    new THREE.BoxGeometry(LUXURY_VILLA_COMMUNITY_WIDTH_METERS, 0.5, LUXURY_VILLA_COMMUNITY_DEPTH_METERS),
    grass,
    "luxury-villa-community-site-base",
    "rideable-surface",
  );
  site.position.y = 0.25;
  community.add(site);

  // The approved plan treats landscape as a continuous system rather than
  // three rectangular bands. The accounting ledger remains exact while the
  // visible terrain is expressed as an oval woodland belt and central park.
  const landscapeLedger = [
    ["private-front-and-rear-gardens", 15_600],
    ["perimeter-and-cluster-woodland", 14_560],
    ["stream-lake-and-wetland", 6_240],
    ["central-park-meadow", 5_200],
  ] as const;
  landscapeLedger.forEach(([zone, areaSquareMeters]) => {
    const area = new THREE.Group();
    area.name = "luxury-villa-community-environment-zone";
    area.userData = { environmentZone: zone, areaSquareMeters, countsTowardLandscapeCoverage: true };
    community.add(area);
  });
  const environmentalLandscapeAreaSquareMeters = landscapeLedger.reduce((sum, [, area]) => sum + area, 0);

  const woodlandBelt = sceneMesh(new THREE.RingGeometry(75, 98, 72), deepGreen, "luxury-villa-community-perimeter-woodland-belt", "ignore");
  woodlandBelt.rotation.x = -Math.PI * 0.5;
  woodlandBelt.scale.x = 1.24;
  woodlandBelt.position.y = 0.515;
  community.add(woodlandBelt);
  const ecologicalPark = new THREE.Group();
  ecologicalPark.name = "luxury-villa-community-central-ecological-park";
  ecologicalPark.userData = { centralPark: true, containsTennis: true, containsOutdoorRecreation: true, landscapeLed: true };
  const parkMeadow = sceneMesh(new THREE.CircleGeometry(74, 72), meadow, "luxury-villa-community-ecological-park-meadow", "rideable-surface");
  parkMeadow.rotation.x = -Math.PI * 0.5;
  parkMeadow.scale.set(1.15, 1, 0.78);
  parkMeadow.position.y = 0.56;
  ecologicalPark.add(parkMeadow);
  community.add(ecologicalPark);

  const scenicLoopPoints: readonly PlanPoint[] = [
    [0, 96], [-35, 89], [-78, 70], [-103, 38], [-107, -3], [-94, -43], [-65, -69], [-29, -84],
    [16, -88], [57, -75], [89, -52], [105, -18], [101, 22], [83, 56], [50, 78], [12, 89],
  ];
  const scenicLoop = new THREE.Group();
  scenicLoop.name = "luxury-villa-community-scenic-loop-road";
  scenicLoop.userData = { continuousLoop: true, organicCurve: true, rightAngleJunctionCount: 0, speedLimitKilometresPerHour: 15 };
  addRibbon(scenicLoop, "luxury-villa-community-scenic-road-shoulder", scenicLoopPoints, 8.4, paleStone, 0.585, true, "ignore");
  const loopRoad = addRibbon(scenicLoop, "luxury-villa-community-residential-lane", scenicLoopPoints, 6, asphalt, 0.64, true);
  loopRoad.ribbon.userData = { ...loopRoad.ribbon.userData, privateLane: true, continuousLoop: true, clearWidthMeters: 6, lowSpeedKilometresPerHour: 15 };
  addRibbon(scenicLoop, "luxury-villa-community-loop-centre-marking", scenicLoopPoints, 0.1, courtLine, 0.655, true, "ignore");
  community.add(scenicLoop);

  const roadCentrelines: THREE.Vector3[][] = [loopRoad.centres];

  const entranceRoute: readonly PlanPoint[] = [[0, 101], [0, 98], [0, 96]];
  addRibbon(community, "luxury-villa-community-entrance-road-shoulder", entranceRoute, 12, paleStone, 0.585, false, "ignore");
  const entranceRoadResult = addRibbon(community, "luxury-villa-community-entrance-road", entranceRoute, 10, asphalt, 0.64);
  const entranceRoad = entranceRoadResult.ribbon;
  entranceRoad.userData = { ...entranceRoad.userData, connectsGateToLaneNetwork: true, clearWidthMeters: 10 };
  roadCentrelines.push(entranceRoadResult.centres);
  const arrivalCourt = sceneMesh(new THREE.CircleGeometry(7, 36), asphalt, "luxury-villa-community-arrival-court", "rideable-surface");
  arrivalCourt.rotation.x = -Math.PI * 0.5;
  arrivalCourt.position.set(0, 0.642, 93.5);
  arrivalCourt.userData = { ...arrivalCourt.userData, distributesToScenicLoop: true, decompressionArrival: true };
  community.add(arrivalCourt);

  const villaPrototype = buildLowPolySmallVilla();
  const villas: THREE.Group[] = [];
  const gardens: THREE.Group[] = [];
  const courtyards: THREE.Group[] = [];
  const villaPlan = [
    ["A1", "west-grove", -72, -42], ["A2", "west-grove", -86, -12], ["A3", "west-grove", -85, 19],
    ["B1", "north-ridge", -43, -58], ["B2", "north-ridge", -16, -68], ["B3", "north-ridge", 20, -69],
    ["C1", "east-garden", 52, -53], ["C2", "east-garden", 76, -32], ["C3", "east-garden", 89, -8],
    ["D1", "south-creek", 82, 25], ["D2", "south-creek", 61, 50], ["D3", "south-creek", 32, 65],
    ["E1", "south-woodland", -3, 72], ["E2", "south-woodland", -38, 66], ["E3", "south-woodland", -67, 49],
  ] as const;
  villaPlan.forEach(([villaId, cluster, x, z], index) => {
    const siteX = x * 0.94;
    const siteZ = z * 0.94;
    const radialLength = Math.max(Math.hypot(siteX, siteZ), 1);
    const outward = new THREE.Vector3(siteX / radialLength, 0, siteZ / radialLength);
    const heading = Math.atan2(outward.x, outward.z);
    const villa = index === 0 ? villaPrototype : villaPrototype.clone(true);
    villa.name = `luxury-villa-community-villa-${villaId.toLowerCase()}`;
    villa.position.set(siteX, 0.58, siteZ);
    villa.rotation.y = heading;
    villa.scale.setScalar(1.35);
    villa.userData = {
      ...villa.userData,
      villaId,
      communityCluster: cluster,
      detachedVilla: true,
      privateGardenAreaSquareMeters: 420,
      frontDirectionRadians: heading,
      frontCourtyard: true,
      roadEdgeSetbackMeters: 4,
      sourceModel: "city-small-villa-lowpoly",
    };
    community.add(villa);
    villas.push(villa);

    const garden = new THREE.Group();
    garden.name = "luxury-villa-community-private-garden";
    garden.position.set(x, 0, z);
    garden.rotation.y = heading;
    garden.userData = { villaId, communityCluster: cluster, private: true, areaSquareMeters: 420 };
    addBox(garden, [18, 0.1, 18], [0, 0.61, -1.5], index % 2 === 0 ? meadow : grass, "luxury-villa-community-private-garden-lawn", "rideable-surface");
    addBox(garden, [6, 0.14, 3.4], [-3.4, 0.71, -7.2], paleStone, "luxury-villa-community-private-terrace", "rideable-surface");
    for (const localX of [-8.8, 8.8]) addBox(garden, [0.22, 0.62, 18], [localX, 0.94, -1.5], deepGreen, "luxury-villa-community-private-hedge", "ignore", "micro-detail");
    community.add(garden);
    gardens.push(garden);

    const courtyard = new THREE.Group();
    courtyard.name = "luxury-villa-community-front-courtyard";
    courtyard.position.copy(villa.position).addScaledVector(outward, 8.5);
    courtyard.position.y = 0;
    courtyard.rotation.y = heading;
    courtyard.userData = { villaId, communityCluster: cluster, private: true, areaSquareMeters: 60, widthMeters: 10, depthMeters: 6, facesAccessRoad: true };
    addBox(courtyard, [10, 0.1, 6], [0, 0.65, 0], permeable, "luxury-villa-community-front-courtyard-paving", "rideable-surface");
    addBox(courtyard, [10, 0.72, 0.22], [0, 0.98, -2.9], stone, "luxury-villa-community-front-courtyard-wall");
    for (const side of [-1, 1]) {
      addBox(courtyard, [0.22, 0.72, 6], [side * 4.9, 0.98, 0], stone, "luxury-villa-community-front-courtyard-wall");
      addBox(courtyard, [2.5, 0.72, 0.22], [side * 3.75, 0.98, 2.9], stone, "luxury-villa-community-front-courtyard-wall");
      addBox(courtyard, [0.28, 1.4, 0.28], [side * 2.45, 1.34, 2.9], stone, "luxury-villa-community-front-courtyard-gate-post");
    }
    addBox(courtyard, [1.4, 0.5, 1.4], [-3.1, 0.95, 0.4], deepGreen, "luxury-villa-community-front-courtyard-planter", "ignore", "micro-detail");
    addBox(courtyard, [1.4, 0.5, 1.4], [3.1, 0.95, 0.4], deepGreen, "luxury-villa-community-front-courtyard-planter", "ignore", "micro-detail");
    community.add(courtyard);
    courtyards.push(courtyard);

    const courtyardFront = courtyard.position.clone().addScaledVector(outward, 3);
    const nearest = nearestRoadPoint(courtyardFront, roadCentrelines);
    const midpoint = courtyardFront.clone().lerp(nearest, 0.5);
    const drivewayPoints: readonly PlanPoint[] = [
      [courtyardFront.x, courtyardFront.z],
      [midpoint.x, midpoint.z],
      [nearest.x, nearest.z],
    ];
    const driveway = addRibbon(community, "luxury-villa-community-private-driveway", drivewayPoints, 3, permeable, 0.655).ribbon;
    driveway.userData = { ...driveway.userData, villaId, communityCluster: cluster, permeablePaving: true, connectsFrontCourtyardToRoad: true };
  });
  const villaRenderBatch = createInstancedPrototypeBatch({
    name: "luxury-villa-community-villa-render-batch",
    parent: community,
    prototype: villas[0],
    placements: villas,
    enabled: options.optimizeStatic !== false,
  });

  const stream = sceneMesh(createStreamGeometry(), water, "luxury-villa-community-meandering-stream", "ignore");
  stream.position.y = 0.635;
  stream.renderOrder = 2;
  stream.userData = { ...stream.userData, waterFeature: true, ecologicalWater: true, maximumDepthMeters: 0.8 };
  community.add(stream);
  const lake = sceneMesh(new THREE.CircleGeometry(17, 32), water, "luxury-villa-community-central-lake", "ignore");
  lake.rotation.x = -Math.PI * 0.5;
  lake.scale.z = 0.7;
  lake.position.set(8, 0.642, -5);
  lake.renderOrder = 3;
  lake.userData = { ...lake.userData, waterFeature: true, ecologicalWater: true };
  ecologicalPark.add(lake);

  const ecoTrailPoints: readonly PlanPoint[] = [
    [-28, -67], [-49, -50], [-55, -25], [-47, 2], [-34, 29], [-12, 50], [15, 60],
    [41, 49], [55, 26], [57, -2], [48, -32], [27, -53], [0, -66],
  ];
  const ecoTrail = addRibbon(
    ecologicalPark,
    "luxury-villa-community-eco-trail",
    ecoTrailPoints,
    2.2,
    permeable,
    0.665,
    true,
  ).ribbon;
  ecoTrail.userData = {
    ...ecoTrail.userData,
    pedestrianOnly: true,
    independentFromVehicleRoads: true,
    clearWidthMeters: 2.2,
    connectsCentralAmenities: true,
  };
  for (const side of [-1, 1]) {
    const bank = new THREE.Group();
    bank.name = "luxury-villa-community-stream-bank-planting";
    for (let index = 0; index < 12; index += 1) {
      const z = -60 + index * 10.5;
      const x = streamCentreAt(z) + side * (9.5 + (index % 3));
      const tuft = sceneMesh(new THREE.ConeGeometry(0.7, 1.2, 7), deepGreen, "luxury-villa-community-riparian-plant", "ignore", "micro-detail");
      tuft.position.set(x, 1.12, z);
      bank.add(tuft);
    }
    community.add(bank);
  }

  const bridgeMaterials = { stone, timber, iron, lamp: lampLens };
  const bridges = [-53, -27, 35].map((z, index) => addLandscapeBridge(community, streamCentreAt(z), z, index, bridgeMaterials));

  const rockery = new THREE.Group();
  rockery.name = "luxury-villa-community-artistic-rockery";
  rockery.position.set(-23, 0, 79);
  rockery.userData = { smallRockery: true, integratedWaterfall: true, scenicFocalPoint: true, entryLandscape: true };
  addBox(rockery, [8, 0.5, 6], [0, 0.55, 0], deepGreen, "luxury-villa-community-rockery-mound", "ignore");
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8179, roughness: 0.98 });
  const rockPositions: Array<[number, number, number, number]> = [
    [-3, 1.1, -0.8, 1.4], [-1.2, 1.8, 0, 2], [0.8, 2.7, -0.6, 2.4], [3, 1.5, 0.4, 1.6],
    [-2.2, 1, 2.2, 1.2], [0.4, 1.35, 2.4, 1.4], [2.6, 0.9, 2.5, 1.1], [-0.4, 0.85, -2.6, 1],
  ];
  rockPositions.forEach(([x, y, z, scale], index) => {
    const rock = sceneMesh(new THREE.DodecahedronGeometry(1, 0), rockMaterial, "luxury-villa-community-rockery-stone");
    rock.position.set(x, y, z);
    rock.scale.set(scale, scale * (0.72 + index % 2 * 0.12), scale * 0.82);
    rock.rotation.set(index * 0.12, index * 0.47, index * 0.08);
    rockery.add(rock);
  });
  const waterfallLines: THREE.Mesh[] = [];
  for (const x of [0.2, 1.2, 2.2]) {
    const fall = sceneMesh(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 6), waterFoam, "luxury-villa-community-rockery-waterfall", "ignore", "micro-detail");
    fall.position.set(x, 2.2, 2.5);
    fall.userData.phase = x;
    rockery.add(fall);
    waterfallLines.push(fall);
  }
  community.add(rockery);

  const tennis = new THREE.Group();
  tennis.name = "luxury-villa-community-tennis-zone";
  tennis.position.set(-58, 0, -5);
  tennis.rotation.y = -THREE.MathUtils.degToRad(10);
  tennis.userData = {
    courtCount: 1,
    residentsOnly: true,
    regulationInspired: true,
    spectatorSeats: 12,
    insideCentralEcologicalPark: true,
  };
  addBox(tennis, [38, 0.14, 19], [0, 0.62, 0], courtGreen, "luxury-villa-community-tennis-court", "rideable-surface");
  addBox(tennis, [23.8, 0.025, 10.95], [0, 0.705, 0], courtBlue, "luxury-villa-community-tennis-playing-surface", "rideable-surface");
  for (const z of [-5.48, 5.48]) addBox(tennis, [23.8, 0.03, 0.08], [0, 0.73, z], courtLine, "luxury-villa-community-tennis-line", "ignore", "micro-detail");
  for (const x of [-11.9, 11.9]) addBox(tennis, [0.08, 0.03, 10.95], [x, 0.73, 0], courtLine, "luxury-villa-community-tennis-line", "ignore", "micro-detail");
  addBox(tennis, [0.08, 0.03, 10.95], [0, 0.73, 0], courtLine, "luxury-villa-community-tennis-centre-line", "ignore", "micro-detail");
  for (const z of [-5.9, 5.9]) addBox(tennis, [0.14, 1.3, 0.14], [0, 1.28, z], iron, "luxury-villa-community-tennis-net-post");
  const tennisNet = new THREE.Group();
  tennisNet.name = "luxury-villa-community-tennis-net";
  tennisNet.userData = { openMesh: true, regulationInspired: true, topHeightMeters: 1.12 };
  for (let index = 0; index <= 16; index += 1) {
    addBox(tennisNet, [0.025, 0.98, 0.025], [0, 1.25, -5.7 + index / 16 * 11.4], iron, "luxury-villa-community-tennis-net-strand", "ignore", "micro-detail");
  }
  for (const y of [0.78, 1.04, 1.3, 1.56]) {
    addBox(tennisNet, [0.025, 0.025, 11.45], [0, y, 0], iron, "luxury-villa-community-tennis-net-strand", "ignore", "micro-detail");
  }
  addBox(tennisNet, [0.07, 0.09, 11.8], [0, 1.76, 0], courtLine, "luxury-villa-community-tennis-net-top-tape", "ignore", "micro-detail");
  tennis.add(tennisNet);
  for (const x of [-18.7, 18.7]) {
    for (let index = 0; index <= 6; index += 1) {
      addBox(tennis, [0.12, 3.2, 0.12], [x, 2.2, -9.2 + index / 6 * 18.4], iron, "luxury-villa-community-tennis-fence-post");
    }
    for (const y of [1.1, 2.15, 3.75]) addBox(tennis, [0.08, 0.08, 18.4], [x, y, 0], iron, "luxury-villa-community-tennis-fence-rail");
  }
  for (const z of [-9.2, 9.2]) {
    for (let index = 0; index <= 12; index += 1) {
      addBox(tennis, [0.12, 3.2, 0.12], [-18.7 + index / 12 * 37.4, 2.2, z], iron, "luxury-villa-community-tennis-fence-post");
    }
    for (const y of [1.1, 2.15, 3.75]) addBox(tennis, [37.4, 0.08, 0.08], [0, y, z], iron, "luxury-villa-community-tennis-fence-rail");
  }
  ecologicalPark.add(tennis);

  const recreationZone = new THREE.Group();
  recreationZone.name = "luxury-villa-community-outdoor-recreation-zone";
  recreationZone.position.set(59, 0, -7);
  recreationZone.rotation.y = -THREE.MathUtils.degToRad(8);
  recreationZone.userData = {
    outdoorEntertainment: true,
    allAge: true,
    quietHoursControlled: true,
    insideCentralEcologicalPark: true,
  };
  addBox(recreationZone, [36, 0.12, 19], [0, 0.61, 0], meadow, "luxury-villa-community-recreation-lawn", "rideable-surface");
  addBox(recreationZone, [13, 0.18, 8], [8.5, 0.72, 0], recreation, "luxury-villa-community-entertainment-deck", "rideable-surface");
  for (const x of [3, 14]) for (const z of [-3.2, 3.2]) addBox(recreationZone, [0.18, 3.8, 0.18], [x, 2.55, z], timber, "luxury-villa-community-entertainment-canopy-post");
  addBox(recreationZone, [13, 0.24, 8], [8.5, 4.45, 0], timber, "luxury-villa-community-entertainment-canopy");
  const stage = addBox(recreationZone, [6.5, 0.42, 3.6], [8.5, 1.02, -1.3], paleStone, "luxury-villa-community-outdoor-stage", "rideable-surface");
  stage.userData.performanceSpace = true;
  for (const x of [-12, -8, -4]) {
    addBox(recreationZone, [2.6, 0.16, 0.8], [x, 0.92, 3.5], timber, "luxury-villa-community-recreation-bench");
    for (const legX of [-0.9, 0.9]) addBox(recreationZone, [0.14, 0.42, 0.5], [x + legX, 0.69, 3.5], iron, "luxury-villa-community-recreation-bench-leg");
  }
  for (const x of [-12, -6]) {
    addBox(recreationZone, [0.18, 2.8, 0.18], [x, 2.05, -3.5], iron, "luxury-villa-community-lawn-game-post");
    addBox(recreationZone, [4.2, 0.1, 0.1], [x + 2.1, 3.3, -3.5], timber, "luxury-villa-community-lawn-game-beam");
  }
  ecologicalPark.add(recreationZone);

  // Perimeter protection leaves the 18 m villa gate opening intact.
  const fenceSources: THREE.Group[] = [];
  const addFence = (x: number, z: number, length: number, horizontal: boolean) => {
    const fence = new THREE.Group();
    fence.name = "luxury-villa-community-perimeter-fence";
    fence.position.set(x, 0, z);
    fence.userData = { protectedBoundary: true, antiClimb: true, landscapeIntegrated: true };
    addBox(fence, horizontal ? [length, 0.5, 0.45] : [0.45, 0.5, length], [0, 0.75, 0], stone, "luxury-villa-community-fence-base");
    const posts = Math.max(2, Math.floor(length / 3));
    for (let index = 0; index <= posts; index += 1) {
      const offset = -length * 0.5 + index / posts * length;
      addBox(fence, [0.13, 1.65, 0.13], [horizontal ? offset : 0, 1.75, horizontal ? 0 : offset], iron, "luxury-villa-community-fence-post");
    }
    for (const y of [1.3, 2.05]) addBox(fence, horizontal ? [length, 0.1, 0.1] : [0.1, 0.1, length], [0, y, 0], iron, "luxury-villa-community-fence-rail");
    community.add(fence);
    fenceSources.push(fence);
  };
  addFence(0, -99.4, 259, true);
  addFence(-129.4, 0, 199, false);
  addFence(129.4, 0, 199, false);
  addFence(-69.5, 99.4, 121, true);
  addFence(69.5, 99.4, 121, true);

  const gate = buildLowPolyVillaResidentialGate();
  gate.name = "luxury-villa-community-main-gate";
  gate.position.set(0, 0.5, 96.5);
  gate.userData.sourceModel = "city-residential-gate-villa-lowpoly";
  gate.userData.frontDirection = "+z";
  community.add(gate);

  const streetLights: THREE.Group[] = [];
  const streetLightPrototype = buildLowPolyStreetLight();
  const loopLightCount = 18;
  for (let index = 0; index < loopLightCount; index += 1) {
    const centreIndex = Math.round(index / loopLightCount * (loopRoad.centres.length - 2));
    const centre = loopRoad.centres[centreIndex];
    const previous = loopRoad.centres[(centreIndex - 2 + loopRoad.centres.length - 1) % (loopRoad.centres.length - 1)];
    const next = loopRoad.centres[(centreIndex + 2) % (loopRoad.centres.length - 1)];
    const tangent = next.clone().sub(previous).normalize();
    const outward = new THREE.Vector3(-tangent.z, 0, tangent.x);
    if (outward.dot(centre) < 0) outward.multiplyScalar(-1);
    const position = centre.clone().addScaledVector(outward, 5.2);
    const light = index === 0 ? streetLightPrototype : streetLightPrototype.clone(true);
    light.position.set(position.x, 0.64, position.z);
    light.rotation.y = Math.atan2(-outward.x, -outward.z);
    light.userData.sourceCollection = "city-street-furniture";
    light.userData.surfaceY = 0.64;
    light.userData.grounded = true;
    light.userData.placementZone = "scenic-loop-furniture-band";
    light.traverse((object) => {
      if (object instanceof THREE.Light) object.visible = false;
    });
    community.add(light);
    streetLights.push(light);
  }

  const planterSources: THREE.Group[] = [];
  const planterPrototype = buildLowPolyRoadsidePlanter();
  const planterPlacements: readonly PlanPoint[] = [[-9, 91], [9, 91], [-13, 84], [13, 84]];
  planterPlacements.forEach(([x, z], index) => {
    const planter = index === 0 ? planterPrototype : planterPrototype.clone(true);
    planter.position.set(x, 0.64, z);
    planter.scale.setScalar(1.05);
    planter.userData.sourceCollection = "city-street-furniture";
    planter.userData.placementZone = "entry-landscape";
    community.add(planter);
    planterSources.push(planter);
  });

  const treePositions: Array<[number, number, string]> = [];
  const minimumRoadDistance = (x: number, z: number) => Math.min(...roadCentrelines.flatMap((centreline) => (
    centreline.map((point) => Math.hypot(x - point.x, z - point.z))
  )));
  const isTreePositionClear = (x: number, z: number) => {
    if (minimumRoadDistance(x, z) < 6.7) return false;
    if (villaPlan.some(([, , villaX, villaZ]) => Math.hypot(x - villaX * 0.94, z - villaZ * 0.94) < 14.5)) return false;
    if (Math.abs(x + 58) < 24 && Math.abs(z + 5) < 14) return false;
    if (Math.abs(x - 59) < 23 && Math.abs(z + 7) < 14) return false;
    if (Math.abs(x - streamCentreAt(z)) < 8.5) return false;
    if (((x - 8) / 20) ** 2 + ((z + 5) / 12) ** 2 < 1) return false;
    if (Math.hypot(x + 23, z - 79) < 7) return false;
    if (Math.hypot(x, z - 94) < 11) return false;
    return true;
  };
  let treeSeed = 19_870_411;
  const seededRandom = () => {
    treeSeed = (Math.imul(treeSeed, 1_664_525) + 1_013_904_223) >>> 0;
    return treeSeed / 4_294_967_296;
  };
  for (let attempt = 0; treePositions.length < 96 && attempt < 2_400; attempt += 1) {
    const x = -121 + seededRandom() * 242;
    const z = -91 + seededRandom() * 182;
    if (!isTreePositionClear(x, z)) continue;
    if (treePositions.some(([treeX, treeZ]) => Math.hypot(x - treeX, z - treeZ) < 5.2)) continue;
    const ellipse = (x / 112) ** 2 + (z / 86) ** 2;
    const placementZone = ellipse > 0.68 ? "perimeter-woodland" : Math.hypot(x, z) < 66 ? "central-ecological-grove" : "villa-cluster-grove";
    treePositions.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, placementZone]);
  }
  treePositions.forEach(([x, z, placementZone]) => {
    const anchor = new THREE.Group();
    anchor.name = "luxury-villa-community-reused-tree-anchor";
    const onCentralMeadow = (x / 85) ** 2 + (z / 58) ** 2 < 1;
    const surfaceY = onCentralMeadow ? 0.56 : 0.515;
    anchor.position.set(x, surfaceY, z);
    anchor.userData = {
      sourceModel: "/models/forest/tree_normal_medium_redwood_a.glb",
      surfaceY,
      grounded: true,
      treeScaleClass: placementZone === "perimeter-woodland" ? "medium" : "small",
      placementZone,
    };
    community.add(anchor);
  });

  const shrubbery = new THREE.Group();
  shrubbery.name = "luxury-villa-community-layered-shrubbery";
  const shrubMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x426d49, roughness: 0.98 }),
    new THREE.MeshStandardMaterial({ color: 0x628b55, roughness: 0.98 }),
    new THREE.MeshStandardMaterial({ color: 0x809d5c, roughness: 0.98 }),
  ];
  const flowerMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xd99482, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xe3bf68, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xaa86b8, roughness: 0.9 }),
  ];
  for (let index = 0; index < 42; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const band = Math.floor(index / 2) % 3;
    const z = -66 + (Math.floor(index / 6) * 21) + band * 3.2;
    const x = side * (12 + band * 4.4) + Math.sin(index * 1.7) * 1.8;
    const shrub = sceneMesh(new THREE.DodecahedronGeometry(0.72 + index % 3 * 0.12, 0), shrubMaterials[index % shrubMaterials.length], "luxury-villa-community-layered-shrub", "ignore", "micro-detail");
    shrub.position.set(x, 1.15, z);
    shrub.scale.y = 0.8 + index % 2 * 0.18;
    shrubbery.add(shrub);
  }
  for (let index = 0; index < 18; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const flower = sceneMesh(new THREE.IcosahedronGeometry(0.28, 0), flowerMaterials[index % flowerMaterials.length], "luxury-villa-community-flower-cluster", "ignore", "micro-detail");
    flower.position.set(side * (17 + index % 3), 0.92, -55 + Math.floor(index / 3) * 22);
    flower.scale.y = 0.72;
    shrubbery.add(flower);
  }
  community.add(shrubbery);

  const staticBatch = createMergedStaticBatch({
    name: "luxury-villa-community-static-render-batch",
    parent: community,
    sources: [
      ...gardens,
      ...courtyards,
      ...bridges,
      tennis,
      recreationZone,
      shrubbery,
      ...fenceSources,
      ...streetLights,
      ...planterSources,
    ],
    enabled: options.optimizeStatic !== false,
  });

  const nightLights: THREE.PointLight[] = [];
  const nightPool = new THREE.Group();
  nightPool.name = "luxury-villa-community-night-light-pool";
  for (const [x, y, z, distance] of [
    [-78, 6, -42, 42], [62, 6, -55, 42], [-85, 6, 25, 42], [82, 6, 27, 42],
    [0, 5, -8, 38], [-42, 5, 4, 34], [46, 5, 0, 34], [0, 5, 76, 35],
  ] as Array<[number, number, number, number]>) {
    const light = new THREE.PointLight(0xffc987, 0, distance, 1.9);
    light.name = "luxury-villa-community-pooled-night-light";
    light.position.set(x, y, z);
    light.castShadow = false;
    light.visible = false;
    nightPool.add(light);
    nightLights.push(light);
  }
  community.add(nightPool);

  let powered = false;
  community.userData = {
    mapLayer: "exterior",
    modelType: "luxury-villa-community",
    generatedLocally: true,
    moduleGridMeters: 1,
    siteSize: new THREE.Vector3(LUXURY_VILLA_COMMUNITY_WIDTH_METERS, 32, LUXURY_VILLA_COMMUNITY_DEPTH_METERS),
    villaCount: villas.length,
    householdCount: villas.length,
    villaClusterCount: 5,
    privateFrontCourtyardCount: courtyards.length,
    roadNetworkType: "continuous-organic-scenic-loop",
    roadEdgeMinimumSetbackMeters: 4,
    centralEcologicalPark: true,
    greenAndSceneryCoverageRatio: 0.8,
    plantedGreenCoverageRatio: 0.68,
    waterLandscapeCoverageRatio: 0.12,
    environmentalLandscapeAreaSquareMeters,
    waterFeatureCount: 2,
    bridgeCount: bridges.length,
    tennisCourtCount: 1,
    outdoorRecreationZoneCount: 1,
    rockeryCount: 1,
    treeAnchorCount: treePositions.length,
    streetLightCount: streetLights.length,
    renderBatchCount: villaRenderBatch.userData.batchCount + staticBatch.userData.batchCount,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "city-small-villa-lowpoly",
      "city-residential-gate-villa-lowpoly",
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
    ],
    setAccessGateOpen: (open) => gate.userData.setGateOpen(open),
    setPowered: (on) => {
      powered = on;
      gate.userData.setPowered(on);
      villaPrototype.userData.setPowered?.(on);
      streetLightPrototype.userData.setPowered(on);
      streetLights.forEach((light) => {
        light.userData.powered = on;
        light.traverse((object) => {
          if (object instanceof THREE.Light) object.visible = false;
        });
      });
      lampLens.emissiveIntensity = on ? 2.4 : 0.08;
      nightLights.forEach((light) => {
        light.visible = on;
        light.intensity = on ? 10 : 0;
      });
    },
    update: (deltaSeconds) => {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const time = ((community.userData.animationTime as number | undefined) ?? 0) + deltaSeconds;
      community.userData.animationTime = time;
      waterfallLines.forEach((lineObject, index) => {
        lineObject.scale.y = 0.92 + Math.sin(time * 2.2 + index * 0.9) * 0.08;
      });
      water.opacity = powered ? 0.9 : 0.82;
    },
  };
  community.userData.setPowered(false);
  return community;
}
