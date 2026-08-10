import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import type { MapSettings } from "./types";

export const CITY_MIN_X = -1100;
export const CITY_MAX_X = 1100;
export const CITY_MIN_Z = -1080;
export const CITY_MAX_Z = 860;
export const CITY_COAST_RAIL_Z = CITY_MAX_Z - 2;
export const CITY_WATER_Y = -1.35;
export const CITY_WEST_FENCE_X = CITY_MIN_X + 66;
export const CITY_EAST_FENCE_X = CITY_MAX_X - 66;
export const CITY_NORTH_FENCE_Z = CITY_MIN_Z + 66;

const ROAD_X = [-820, -360, 120, 500, 820];
const ROAD_Z = [-640, -180, 280, 700];
const CURB_HEIGHT = 0.24;
const RAMP_LENGTH = 4.2;
const CROSSWALK_STRIPE_WIDTH = 0.52;
const CROSSWALK_STRIPE_PITCH = 1.05;
const CROSSWALK_HALF_SPAN = 2.9;
const CROSSWALK_INNER_GAP = 0.9;
const BODY_COLORS = [0xc1bbb0, 0xa9b4bc, 0xd0b3a2, 0x99a8af, 0xc8c2b5, 0xb98f7b];

export type CityRoadDimensions = {
  motorWidth: number;
  bikeLaneWidth: number;
  bufferWidth: number;
  sidewalkWidth: number;
  streetOuter: number;
  corridorWidth: number;
};

export type CityRoadProfile = CityRoadDimensions & {
  horizontal: boolean;
  position: number;
  lanesPerDirection: number;
  laneWidth: number;
  start: number;
  end: number;
};

type CityBuildResult = {
  group: THREE.Group;
  roadPoints: THREE.Vector3[];
  stops: Array<{ x: number; z: number }>;
  buildings: number;
  streetTrees: number;
  streetLights: number;
  drawCalls: number;
};

type District = "harbor" | "waterfront" | "hills" | "oldtown" | "central";

type Building = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  district: District;
  color: THREE.Color;
  roofHeight: number;
};

function createCityRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomRange = (random: () => number, min: number, max: number) => min + (max - min) * random();

export function getCityRoadDimensions(tuning: number): CityRoadDimensions {
  const motorWidth = THREE.MathUtils.clamp(tuning * 2.7, 18, 31);
  const bikeLaneWidth = 3.2;
  const bufferWidth = 0.75;
  const sidewalkWidth = 8;
  const streetOuter = motorWidth * 0.5 + bikeLaneWidth + bufferWidth;
  return {
    motorWidth,
    bikeLaneWidth,
    bufferWidth,
    sidewalkWidth,
    streetOuter,
    corridorWidth: (streetOuter + sidewalkWidth) * 2,
  };
}

function roadProfile(tuning: number, seed: number, horizontal: boolean, position: number, index: number): CityRoadProfile {
  const mixed = Math.imul((seed ^ Math.round(position * 17) ^ (horizontal ? 0x68bc21eb : 0x2f6e2b1)) >>> 0, 2654435761) >>> 0;
  const random = ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
  const classOffset = ((seed >>> 3) + (horizontal ? 1 : 0)) % 3;
  const lanesPerDirection = 1 + ((index * 2 + classOffset) % 3);
  const laneWidth = THREE.MathUtils.clamp(3.05 + (tuning - 6.7) * 0.14 + (random - 0.5) * 0.28, 2.9, 3.8);
  const motorWidth = laneWidth * lanesPerDirection * 2;
  const bikeLaneWidth = THREE.MathUtils.lerp(2.7, 3.4, random);
  const bufferWidth = THREE.MathUtils.lerp(0.55, 0.9, 1 - random);
  const sidewalkWidth = THREE.MathUtils.lerp(6.5, 9.2, (random * 1.73) % 1);
  const streetOuter = motorWidth * 0.5 + bikeLaneWidth + bufferWidth;
  return {
    horizontal,
    position,
    start: horizontal ? CITY_MIN_X : CITY_MIN_Z,
    end: horizontal ? CITY_MAX_X : CITY_MAX_Z,
    lanesPerDirection,
    laneWidth,
    motorWidth,
    bikeLaneWidth,
    bufferWidth,
    sidewalkWidth,
    streetOuter,
    corridorWidth: (streetOuter + sidewalkWidth) * 2,
  };
}

const roadProfileCache = new Map<string, { x: CityRoadProfile[]; z: CityRoadProfile[] }>();

export function getCityRoadProfiles(tuning: number, seed = 0) {
  const key = `${tuning.toFixed(3)}:${seed >>> 0}`;
  const cached = roadProfileCache.get(key);
  if (cached) return cached;
  const profiles = {
    x: ROAD_X.map((position, index) => roadProfile(tuning, seed, false, position, index)),
    z: ROAD_Z.map((position, index) => roadProfile(tuning, seed, true, position, index)),
  };
  const assignLengths = (roads: CityRoadProfile[], junctions: number[], axisMin: number, axisMax: number, salt: number) => {
    roads.forEach((road, index) => {
      // Two perimeter spines always cross the city, preserving a reliable loop.
      if (index === 0 || index === roads.length - 1 || road.lanesPerDirection === 3) return;
      const mixed = Math.imul((seed ^ Math.round(road.position * 31) ^ salt) >>> 0, 2246822519) >>> 0;
      const random = ((mixed ^ (mixed >>> 13)) >>> 0) / 4294967296;
      const maxSpan = Math.max(1, junctions.length - 1);
      const span = Math.min(maxSpan, road.lanesPerDirection === 1 ? 1 + (random > 0.72 ? 1 : 0) : Math.min(2, maxSpan));
      const startIndex = Math.min(Math.floor(random * (junctions.length - span)), junctions.length - span - 1);
      const endIndex = startIndex + span;
      const endCap = 18 + random * 12;
      road.start = Math.max(axisMin, junctions[startIndex] - endCap);
      road.end = Math.min(axisMax, junctions[endIndex] + endCap);
    });
  };
  assignLengths(profiles.x, ROAD_Z, CITY_MIN_Z, CITY_MAX_Z, 0x51a9d3);
  assignLengths(profiles.z, ROAD_X, CITY_MIN_X, CITY_MAX_X, 0x83c6b7);
  roadProfileCache.set(key, profiles);
  return profiles;
}

export function getCityRoadWidthRange(tuning: number, seed = 0) {
  const profiles = getCityRoadProfiles(tuning, seed);
  const widths = [...profiles.x, ...profiles.z].map((profile) => profile.motorWidth);
  return { min: Math.min(...widths), max: Math.max(...widths) };
}

function densePolyline(points: Array<[number, number]>, step = 18) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const distance = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.ceil(distance / step));
    for (let j = 0; j < count; j += 1) {
      const t = j / count;
      out.push(new THREE.Vector3(THREE.MathUtils.lerp(ax, bx, t), 0.045, THREE.MathUtils.lerp(az, bz, t)));
    }
  }
  const last = points[points.length - 1];
  out.push(new THREE.Vector3(last[0], 0.045, last[1]));
  return out;
}

export function clampToCity(x: number, z: number, inset = 0) {
  return {
    x: THREE.MathUtils.clamp(x, CITY_WEST_FENCE_X + inset, CITY_EAST_FENCE_X - inset),
    z: THREE.MathUtils.clamp(z, CITY_NORTH_FENCE_Z + inset, CITY_COAST_RAIL_Z - inset),
  };
}

function nearestRoad(value: number, profiles: CityRoadProfile[]) {
  let closest = profiles[0];
  let distance = Math.abs(value - closest.position);
  for (const profile of profiles.slice(1)) {
    const candidate = Math.abs(value - profile.position);
    if (candidate < distance) {
      closest = profile;
      distance = candidate;
    }
  }
  return { distance, profile: closest };
}

function roadsIntersect(a: CityRoadProfile, b: CityRoadProfile) {
  const horizontal = a.horizontal ? a : b;
  const vertical = a.horizontal ? b : a;
  return vertical.position >= horizontal.start && vertical.position <= horizontal.end
    && horizontal.position >= vertical.start && horizontal.position <= vertical.end;
}

function citySurfaceHeight(x: number, z: number, tuning: number, seed: number) {
  const profiles = getCityRoadProfiles(tuning, seed);
  const activeX = profiles.x.filter((profile) => z >= profile.start && z <= profile.end);
  const activeZ = profiles.z.filter((profile) => x >= profile.start && x <= profile.end);
  const nearestX = activeX.length ? nearestRoad(x, activeX) : null;
  const nearestZ = activeZ.length ? nearestRoad(z, activeZ) : null;
  const sidewalkOuterX = nearestX ? nearestX.profile.streetOuter + nearestX.profile.sidewalkWidth : -Infinity;
  const sidewalkOuterZ = nearestZ ? nearestZ.profile.streetOuter + nearestZ.profile.sidewalkWidth : -Infinity;
  if ((nearestX && nearestX.distance <= nearestX.profile.streetOuter) || (nearestZ && nearestZ.distance <= nearestZ.profile.streetOuter)) return 0;
  const onXSidewalk = Boolean(nearestX && nearestX.distance <= sidewalkOuterX);
  const onZSidewalk = Boolean(nearestZ && nearestZ.distance <= sidewalkOuterZ);
  if (!onXSidewalk && !onZSidewalk) return 0;

  if (nearestX && nearestZ && onXSidewalk && onZSidewalk && roadsIntersect(nearestX.profile, nearestZ.profile)) {
    const localX = nearestX.distance - nearestX.profile.streetOuter;
    const localZ = nearestZ.distance - nearestZ.profile.streetOuter;
    let ramp = 1;
    if (localX <= RAMP_LENGTH && Math.abs(localZ - nearestZ.profile.sidewalkWidth * 0.5) <= 1.7) {
      ramp = Math.min(ramp, THREE.MathUtils.clamp(localX / RAMP_LENGTH, 0, 1));
    }
    if (localZ <= RAMP_LENGTH && Math.abs(localX - nearestX.profile.sidewalkWidth * 0.5) <= 1.7) {
      ramp = Math.min(ramp, THREE.MathUtils.clamp(localZ / RAMP_LENGTH, 0, 1));
    }
    return CURB_HEIGHT * ramp;
  }
  return CURB_HEIGHT;
}

export function sampleCitySurface(x = 0, z = 0, tuning = 8, seed = 0) {
  const height = citySurfaceHeight(x, z, tuning, seed);
  const epsilon = 0.18;
  const gx = (citySurfaceHeight(x + epsilon, z, tuning, seed) - citySurfaceHeight(x - epsilon, z, tuning, seed)) / (epsilon * 2);
  const gz = (citySurfaceHeight(x, z + epsilon, tuning, seed) - citySurfaceHeight(x, z - epsilon, tuning, seed)) / (epsilon * 2);
  return { ax: 0, az: 0, steep: false, height, gx, gz, speedCap: height > 0.04 ? 12 : Infinity };
}

function setInstance(mesh: THREE.InstancedMesh, index: number, dummy: THREE.Object3D, position: [number, number, number], scale: [number, number, number], rotationY = 0) {
  dummy.position.set(...position);
  dummy.scale.set(...scale);
  dummy.rotation.set(0, rotationY, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function addRoad(
  group: THREE.Group,
  horizontal: boolean,
  position: number,
  dimensions: CityRoadProfile,
  asphalt: THREE.Material,
  whiteMarking: THREE.Material,
  yellowMarking: THREE.Material,
  perpendicularProfiles: CityRoadProfile[],
) {
  const start = dimensions.start;
  const end = dimensions.end;
  const length = end - start;
  const center = (start + end) * 0.5;
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? length : dimensions.streetOuter * 2, 0.08, horizontal ? dimensions.streetOuter * 2 : length),
    asphalt,
  );
  road.name = "city-road-asphalt";
  road.userData.roadProfile = {
    lanesPerDirection: dimensions.lanesPerDirection,
    motorWidth: dimensions.motorWidth,
    sidewalkWidth: dimensions.sidewalkWidth,
    start,
    end,
    length,
  };
  road.position.set(horizontal ? center : position, 0.01, horizontal ? position : center);
  road.receiveShadow = true;
  group.add(road);

  // Longitudinal markings stop before each junction, as they do on real streets.
  const activeJunctions = perpendicularProfiles.filter((profile) => roadsIntersect(dimensions, profile));
  const boundaries = [start, ...activeJunctions.map((profile) => profile.position), end];
  const clearSegments: Array<[number, number]> = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const segmentStart = boundaries[i] + (i === 0 ? 0 : activeJunctions[i - 1].streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN * 2 + 1);
    const segmentEnd = boundaries[i + 1] - (i === boundaries.length - 2 ? 0 : activeJunctions[i].streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN * 2 + 1);
    if (segmentEnd > segmentStart) clearSegments.push([segmentStart, segmentEnd]);
  }

  const flatUnit = new THREE.PlaneGeometry(1, 1);
  flatUnit.rotateX(-Math.PI * 0.5);
  const addSolidLines = (name: string, offsets: number[], width: number, material: THREE.Material) => {
    const lines = new THREE.InstancedMesh(flatUnit, material, clearSegments.length * offsets.length);
    lines.name = name;
    lines.userData.surfaceMarking = true;
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const [segmentStart, segmentEnd] of clearSegments) {
      const along = (segmentStart + segmentEnd) * 0.5;
      const segmentLength = segmentEnd - segmentStart;
      for (const offset of offsets) {
        setInstance(lines, index++, dummy,
          horizontal ? [along, 0.051, position + offset] : [position + offset, 0.051, along],
          horizontal ? [segmentLength, 1, width] : [width, 1, segmentLength]);
      }
    }
    lines.instanceMatrix.needsUpdate = true;
    group.add(lines);
  };

  // Two-way urban road: double solid yellow centre line, white dashed lane dividers,
  // solid white motor/bicycle separation and a thin outer edge line.
  addSolidLines("city-road-double-yellow-center", [-0.16, 0.16], 0.12, yellowMarking);
  addSolidLines("city-bike-lane-boundary", [-dimensions.motorWidth * 0.5, dimensions.motorWidth * 0.5], 0.18, whiteMarking);
  addSolidLines("city-road-edge-line", [
    -(dimensions.motorWidth * 0.5 + dimensions.bikeLaneWidth),
    dimensions.motorWidth * 0.5 + dimensions.bikeLaneWidth,
  ], 0.12, whiteMarking);

  const dashLength = 3.2;
  const dashGap = 5.8;
  const dashOffsets: number[] = [];
  for (let lane = 1; lane < dimensions.lanesPerDirection; lane += 1) {
    dashOffsets.push(-dimensions.laneWidth * lane, dimensions.laneWidth * lane);
  }
  const dashPositions: Array<{ along: number; offset: number }> = [];
  for (const [segmentStart, segmentEnd] of clearSegments) {
    for (let along = segmentStart + dashGap * 0.5; along + dashLength <= segmentEnd; along += dashLength + dashGap) {
      for (const offset of dashOffsets) dashPositions.push({ along, offset });
    }
  }
  const dashGeometry = new THREE.PlaneGeometry(horizontal ? dashLength : 0.15, horizontal ? 0.15 : dashLength);
  dashGeometry.rotateX(-Math.PI * 0.5);
  const laneDashes = new THREE.InstancedMesh(dashGeometry, whiteMarking, dashPositions.length);
  laneDashes.name = "city-motor-lane-dashes";
  laneDashes.userData.surfaceMarking = true;
  const dashDummy = new THREE.Object3D();
  dashPositions.forEach(({ along, offset }, index) => {
    setInstance(laneDashes, index, dashDummy,
      horizontal ? [along, 0.051, position + offset] : [position + offset, 0.051, along],
      [1, 1, 1]);
  });
  laneDashes.instanceMatrix.needsUpdate = true;
  group.add(laneDashes);
}

function createCurbRampGeometry(width: number, length: number, height: number) {
  const hw = width * 0.5;
  const hl = length * 0.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -hw, 0, -hl, hw, 0, -hl, hw, height, hl, -hw, height, hl,
    -hw, 0, -hl, -hw, height, hl, -hw, height, hl, hw, height, hl,
    hw, height, hl, hw, 0, -hl, -hw, 0, -hl, -hw, 0, -hl,
    hw, 0, -hl, hw, height, hl,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 7, 8, 9,
    10, 11, 12, 10, 12, 13,
    14, 15, 16, 14, 16, 17,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function addSidewalkNetwork(group: THREE.Group, xProfiles: CityRoadProfile[], zProfiles: CityRoadProfile[]) {
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.93, metalness: 0 });
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0xbcb6aa, roughness: 0.96 });
  const crosswalkMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f0e8,
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const segmentCount = ROAD_Z.length * 2 * (ROAD_X.length + 1) + ROAD_X.length * 2 * (ROAD_Z.length + 1);
  const sidewalks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sidewalkMaterial, segmentCount);
  const dummy = new THREE.Object3D();
  let sidewalkIndex = 0;

  for (const horizontalRoad of zProfiles) {
    const junctions = xProfiles.filter((profile) => roadsIntersect(horizontalRoad, profile));
    const boundaries = [horizontalRoad.start, ...junctions.map((profile) => profile.position), horizontalRoad.end];
    for (const side of [-1, 1]) {
      for (let i = 0; i < boundaries.length - 1; i += 1) {
        const start = boundaries[i] + (i === 0 ? 0 : junctions[i - 1].corridorWidth * 0.5);
        const end = boundaries[i + 1] - (i === boundaries.length - 2 ? 0 : junctions[i].corridorWidth * 0.5);
        if (end <= start) continue;
        setInstance(sidewalks, sidewalkIndex++, dummy,
          [(start + end) * 0.5, CURB_HEIGHT * 0.5, horizontalRoad.position + side * (horizontalRoad.streetOuter + horizontalRoad.sidewalkWidth * 0.5)],
          [end - start, CURB_HEIGHT, horizontalRoad.sidewalkWidth]);
      }
    }
  }
  for (const verticalRoad of xProfiles) {
    const junctions = zProfiles.filter((profile) => roadsIntersect(verticalRoad, profile));
    const boundaries = [verticalRoad.start, ...junctions.map((profile) => profile.position), verticalRoad.end];
    for (const side of [-1, 1]) {
      for (let i = 0; i < boundaries.length - 1; i += 1) {
        const start = boundaries[i] + (i === 0 ? 0 : junctions[i - 1].corridorWidth * 0.5);
        const end = boundaries[i + 1] - (i === boundaries.length - 2 ? 0 : junctions[i].corridorWidth * 0.5);
        if (end <= start) continue;
        setInstance(sidewalks, sidewalkIndex++, dummy,
          [verticalRoad.position + side * (verticalRoad.streetOuter + verticalRoad.sidewalkWidth * 0.5), CURB_HEIGHT * 0.5, (start + end) * 0.5],
          [verticalRoad.sidewalkWidth, CURB_HEIGHT, end - start]);
      }
    }
  }
  sidewalks.count = sidewalkIndex;
  sidewalks.instanceMatrix.needsUpdate = true;
  sidewalks.receiveShadow = true;
  group.add(sidewalks);

  const cornerPads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    sidewalkMaterial,
    ROAD_X.length * ROAD_Z.length * 4,
  );
  cornerPads.name = "city-sidewalk-corner-pads";
  let cornerIndex = 0;
  for (const verticalRoad of xProfiles) {
    for (const horizontalRoad of zProfiles) {
      if (!roadsIntersect(verticalRoad, horizontalRoad)) continue;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          setInstance(cornerPads, cornerIndex++, dummy,
            [
              verticalRoad.position + sx * (verticalRoad.streetOuter + verticalRoad.sidewalkWidth * 0.5),
              CURB_HEIGHT * 0.5,
              horizontalRoad.position + sz * (horizontalRoad.streetOuter + horizontalRoad.sidewalkWidth * 0.5),
            ],
            [verticalRoad.sidewalkWidth, CURB_HEIGHT, horizontalRoad.sidewalkWidth]);
        }
      }
    }
  }
  cornerPads.count = cornerIndex;
  cornerPads.instanceMatrix.needsUpdate = true;
  cornerPads.receiveShadow = true;
  group.add(cornerPads);

  const rampCount = ROAD_X.length * ROAD_Z.length * 8;
  const ramps = new THREE.InstancedMesh(createCurbRampGeometry(3.4, RAMP_LENGTH, CURB_HEIGHT), rampMaterial, rampCount);
  let rampIndex = 0;
  for (const verticalRoad of xProfiles) {
    for (const horizontalRoad of zProfiles) {
      if (!roadsIntersect(verticalRoad, horizontalRoad)) continue;
      const x = verticalRoad.position;
      const z = horizontalRoad.position;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          setInstance(ramps, rampIndex++, dummy,
            [x + sx * (verticalRoad.streetOuter + RAMP_LENGTH * 0.5), 0, z + sz * (horizontalRoad.streetOuter + horizontalRoad.sidewalkWidth * 0.5)],
            [1, 1, 1], sx * Math.PI * 0.5);
          setInstance(ramps, rampIndex++, dummy,
            [x + sx * (verticalRoad.streetOuter + verticalRoad.sidewalkWidth * 0.5), 0, z + sz * (horizontalRoad.streetOuter + RAMP_LENGTH * 0.5)],
            [1, 1, 1], sz > 0 ? 0 : Math.PI);
        }
      }
    }
  }
  ramps.count = rampIndex;
  ramps.instanceMatrix.needsUpdate = true;
  ramps.receiveShadow = true;
  group.add(ramps);

  const maxRoadMarkingWidth = Math.max(...[...xProfiles, ...zProfiles].map((road) => road.streetOuter * 2));
  const maxStripesPerCrossing = Math.ceil(maxRoadMarkingWidth / CROSSWALK_STRIPE_PITCH) + 2;
  const stripeCount = ROAD_X.length * ROAD_Z.length * maxStripesPerCrossing * 4;
  const stripeGeometry = new THREE.PlaneGeometry(1, 1);
  stripeGeometry.rotateX(-Math.PI * 0.5);
  const stripes = new THREE.InstancedMesh(stripeGeometry, crosswalkMaterial, stripeCount);
  stripes.name = "city-crosswalk-markings";
  stripes.userData.surfaceMarking = true;
  stripes.userData.innerGap = CROSSWALK_INNER_GAP;
  let stripeIndex = 0;
  for (const verticalRoad of xProfiles) {
    for (const horizontalRoad of zProfiles) {
      if (!roadsIntersect(verticalRoad, horizontalRoad)) continue;
      const x = verticalRoad.position;
      const z = horizontalRoad.position;
      for (const side of [-1, 1]) {
        const verticalMarkingHalf = verticalRoad.streetOuter - verticalRoad.bufferWidth;
        for (let shift = -verticalMarkingHalf + CROSSWALK_STRIPE_WIDTH * 0.5;
          shift <= verticalMarkingHalf - CROSSWALK_STRIPE_WIDTH * 0.5;
          shift += CROSSWALK_STRIPE_PITCH) {
          setInstance(stripes, stripeIndex++, dummy,
            [x + shift, 0.052, z + side * (horizontalRoad.streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN)],
            [CROSSWALK_STRIPE_WIDTH, 1, CROSSWALK_HALF_SPAN * 2]);
        }
        const horizontalMarkingHalf = horizontalRoad.streetOuter - horizontalRoad.bufferWidth;
        for (let shift = -horizontalMarkingHalf + CROSSWALK_STRIPE_WIDTH * 0.5;
          shift <= horizontalMarkingHalf - CROSSWALK_STRIPE_WIDTH * 0.5;
          shift += CROSSWALK_STRIPE_PITCH) {
          setInstance(stripes, stripeIndex++, dummy,
            [x + side * (verticalRoad.streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN), 0.052, z + shift],
            [CROSSWALK_HALF_SPAN * 2, 1, CROSSWALK_STRIPE_WIDTH]);
        }
      }
    }
  }
  stripes.count = stripeIndex;
  stripes.instanceMatrix.needsUpdate = true;
  group.add(stripes);

  const stopLines = new THREE.InstancedMesh(stripeGeometry, crosswalkMaterial, ROAD_X.length * ROAD_Z.length * 4);
  stopLines.name = "city-intersection-stop-lines";
  stopLines.userData.surfaceMarking = true;
  stopLines.userData.trafficSide = "right";
  let stopIndex = 0;
  for (const verticalRoad of xProfiles) {
    for (const horizontalRoad of zProfiles) {
      if (!roadsIntersect(verticalRoad, horizontalRoad)) continue;
      const x = verticalRoad.position;
      const z = horizontalRoad.position;
      const stopDistanceX = verticalRoad.streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN * 2 + 0.9;
      const stopDistanceZ = horizontalRoad.streetOuter + CROSSWALK_INNER_GAP + CROSSWALK_HALF_SPAN * 2 + 0.9;
      // Left-hand-drive vehicles use right-hand traffic. In the map's world-axis
      // convention, each line belongs on the approaching half shown below.
      setInstance(stopLines, stopIndex++, dummy, [x + verticalRoad.motorWidth * 0.25, 0.053, z + stopDistanceZ], [verticalRoad.motorWidth * 0.5, 1, 0.42]);
      setInstance(stopLines, stopIndex++, dummy, [x - verticalRoad.motorWidth * 0.25, 0.053, z - stopDistanceZ], [verticalRoad.motorWidth * 0.5, 1, 0.42]);
      setInstance(stopLines, stopIndex++, dummy, [x + stopDistanceX, 0.053, z - horizontalRoad.motorWidth * 0.25], [0.42, 1, horizontalRoad.motorWidth * 0.5]);
      setInstance(stopLines, stopIndex++, dummy, [x - stopDistanceX, 0.053, z + horizontalRoad.motorWidth * 0.25], [0.42, 1, horizontalRoad.motorWidth * 0.5]);
    }
  }
  stopLines.count = stopIndex;
  stopLines.instanceMatrix.needsUpdate = true;
  group.add(stopLines);
}

function districtFor(x: number, z: number): District {
  if (z > 360 && x < -120) return "harbor";
  if (z > 360) return "waterfront";
  if (x > 460 && z < -250) return "hills";
  if (x < -300 && z < 120) return "oldtown";
  return "central";
}

function heightForDistrict(district: District, random: () => number) {
  if (district === "central") return randomRange(random, 56, 138);
  if (district === "oldtown") return randomRange(random, 22, 52);
  if (district === "harbor") return randomRange(random, 14, 36);
  if (district === "hills") return randomRange(random, 25, 64);
  return randomRange(random, 30, 76);
}

function addBuildings(
  group: THREE.Group,
  settings: MapSettings,
  collision: CollisionWorld,
  xProfiles: CityRoadProfile[],
  zProfiles: CityRoadProfile[],
) {
  const random = createCityRandom(settings.seed ^ 0x51c17);
  const xEdges = [CITY_MIN_X, ...ROAD_X, CITY_MAX_X];
  const zEdges = [CITY_MIN_Z, ...ROAD_Z, CITY_MAX_Z];
  const records: Building[] = [];
  // Keep a shallow frontage zone between the sidewalk and the first building
  // line. Perimeter plots are then aligned to that frontage instead of being
  // centred deep inside their cells.
  for (let xi = 0; xi < xEdges.length - 1; xi += 1) {
    for (let zi = 0; zi < zEdges.length - 1; zi += 1) {
      const x0 = xEdges[xi] + (xi === 0 ? 12 : xProfiles[xi - 1].corridorWidth * 0.5 + 1.6);
      const x1 = xEdges[xi + 1] - (xi === xEdges.length - 2 ? 12 : xProfiles[xi].corridorWidth * 0.5 + 1.6);
      const z0 = zEdges[zi] + (zi === 0 ? 12 : zProfiles[zi - 1].corridorWidth * 0.5 + 1.6);
      const z1 = zEdges[zi + 1] - (zi === zEdges.length - 2 ? 12 : zProfiles[zi].corridorWidth * 0.5 + 1.6);
      if (x1 - x0 < 74 || z1 - z0 < 74) continue;
      const district = districtFor((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      const cols = district === "central" ? 3 : 2;
      const rows = district === "central" ? 3 : 2;
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (random() > Math.min(0.97, 0.62 + settings.cityDensity * 0.28)) continue;
          const cellW = (x1 - x0) / cols;
          const cellD = (z1 - z0) / rows;
          const width = cellW * randomRange(random, 0.52, 0.72);
          const depth = cellD * randomRange(random, 0.52, 0.72);
          const frontageX = randomRange(random, 2, 4);
          const frontageZ = randomRange(random, 2, 4);
          let x = x0 + cellW * (col + 0.5) + randomRange(random, -cellW * 0.04, cellW * 0.04);
          let z = z0 + cellD * (row + 0.5) + randomRange(random, -cellD * 0.04, cellD * 0.04);
          if (col === 0) x = x0 + frontageX + width * 0.5;
          else if (col === cols - 1) x = x1 - frontageX - width * 0.5;
          if (row === 0) z = z0 + frontageZ + depth * 0.5;
          else if (row === rows - 1) z = z1 - frontageZ - depth * 0.5;
          const height = heightForDistrict(district, random) * randomRange(random, 0.9, 1.1);
          const color = new THREE.Color(BODY_COLORS[Math.floor(random() * BODY_COLORS.length)]);
          if (district === "oldtown") color.lerp(new THREE.Color(0xc47f60), 0.42);
          if (district === "central") color.lerp(new THREE.Color(0x8eaabd), 0.35);
          if (district === "harbor") color.lerp(new THREE.Color(0xa6a89e), 0.28);
          records.push({ x, z, width, depth, height, district, color, roofHeight: randomRange(random, 2.2, 6.2) });
          collision.registerStatic({ x, z, r: Math.min(width, depth) * 0.47 });
        }
      }
    }
  }

  const dummy = new THREE.Object3D();
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.02 }),
    records.length,
  );
  bodies.name = "city-building-bodies";
  const plinths = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x777a78, roughness: 0.9 }),
    records.length,
  );
  const roofs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x596168, roughness: 0.72, metalness: 0.16 }),
    records.length,
  );
  const trims = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe2ded3, roughness: 0.86 }),
    records.length * 2,
  );
  const doors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x355064, roughness: 0.32, metalness: 0.24 }),
    records.length,
  );
  const awnings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xc16d49, roughness: 0.8 }),
    records.length,
  );

  const windowMatrices: THREE.Matrix4[] = [];
  const windowGeometry = new THREE.BoxGeometry(1, 1, 0.14);
  records.forEach((record, index) => {
    setInstance(bodies, index, dummy, [record.x, record.height * 0.5 + 0.6, record.z], [record.width, record.height, record.depth]);
    bodies.setColorAt(index, record.color);
    setInstance(plinths, index, dummy, [record.x, 0.6, record.z], [record.width + 1.4, 1.2, record.depth + 1.4]);
    setInstance(roofs, index, dummy,
      [record.x + record.width * 0.14, record.height + record.roofHeight * 0.5 + 0.6, record.z - record.depth * 0.12],
      [record.width * 0.34, record.roofHeight, record.depth * 0.32]);
    for (let band = 0; band < 2; band += 1) {
      setInstance(trims, index * 2 + band, dummy,
        [record.x, record.height * (band === 0 ? 0.36 : 0.7), record.z],
        [record.width + 0.7, 0.48, record.depth + 0.7]);
    }
    const doorWidth = THREE.MathUtils.clamp(record.width * 0.12, 3.2, 6.5);
    setInstance(doors, index, dummy,
      [record.x, 2.5, record.z + record.depth * 0.501 + 0.05], [doorWidth, 4.8, 1]);
    setInstance(awnings, index, dummy,
      [record.x, 5.25, record.z + record.depth * 0.5 + 1.25], [doorWidth * 2.1, 0.28, 2.5]);

    const floors = THREE.MathUtils.clamp(Math.floor((record.height - 7) / 6), 3, 14);
    const frontColumns = THREE.MathUtils.clamp(Math.floor(record.width / 13), 3, 6);
    const sideColumns = THREE.MathUtils.clamp(Math.floor(record.depth / 13), 3, 5);
    const windowWidth = Math.min(4.2, record.width / (frontColumns * 1.65));
    const windowDepth = Math.min(4.2, record.depth / (sideColumns * 1.65));
    for (let floor = 0; floor < floors; floor += 1) {
      const y = 8 + floor * ((record.height - 11) / Math.max(1, floors - 1));
      for (let col = 0; col < frontColumns; col += 1) {
        const px = record.x + ((col + 1) / (frontColumns + 1) - 0.5) * record.width * 0.82;
        for (const face of [-1, 1]) {
          dummy.position.set(px, y, record.z + face * record.depth * 0.501);
          dummy.scale.set(windowWidth, 2.45, 1);
          dummy.rotation.set(0, face < 0 ? Math.PI : 0, 0);
          dummy.updateMatrix();
          windowMatrices.push(dummy.matrix.clone());
        }
      }
      for (let col = 0; col < sideColumns; col += 1) {
        const pz = record.z + ((col + 1) / (sideColumns + 1) - 0.5) * record.depth * 0.82;
        for (const face of [-1, 1]) {
          dummy.position.set(record.x + face * record.width * 0.501, y, pz);
          dummy.scale.set(windowDepth, 2.45, 1);
          dummy.rotation.set(0, face > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0);
          dummy.updateMatrix();
          windowMatrices.push(dummy.matrix.clone());
        }
      }
    }
  });

  for (const mesh of [bodies, plinths, roofs, trims, doors, awnings]) mesh.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  roofs.castShadow = true;
  group.add(bodies, plinths, roofs, trims, doors, awnings);

  const windows = new THREE.InstancedMesh(
    windowGeometry,
    new THREE.MeshStandardMaterial({ color: 0x77a9c3, emissive: 0x19364a, emissiveIntensity: 0.18, roughness: 0.2, metalness: 0.34 }),
    windowMatrices.length,
  );
  windowMatrices.forEach((matrix, index) => windows.setMatrixAt(index, matrix));
  windows.instanceMatrix.needsUpdate = true;
  group.add(windows);
  return records.length;
}

function farFromIntersections(value: number, roads: number[], radius: number) {
  return roads.every((road) => Math.abs(value - road) > radius);
}

function addStreetFurniture(group: THREE.Group, collision: CollisionWorld, xProfiles: CityRoadProfile[], zProfiles: CityRoadProfile[]) {
  const lightPositions: Array<[number, number]> = [];
  const maxIntersectionRadius = Math.max(...[...xProfiles, ...zProfiles].map((profile) => profile.corridorWidth * 0.6));
  for (const road of xProfiles) {
    const sidewalkCenter = road.streetOuter + road.sidewalkWidth * 0.66;
    const junctions = zProfiles.filter((profile) => roadsIntersect(road, profile)).map((profile) => profile.position);
    for (let z = road.start + 28; z < road.end - 24; z += 92) {
      if (farFromIntersections(z, junctions, maxIntersectionRadius)) lightPositions.push([road.position + sidewalkCenter, z]);
    }
  }
  for (const road of zProfiles) {
    const sidewalkCenter = road.streetOuter + road.sidewalkWidth * 0.66;
    const junctions = xProfiles.filter((profile) => roadsIntersect(road, profile)).map((profile) => profile.position);
    for (let x = road.start + 28; x < road.end - 24; x += 92) {
      if (farFromIntersections(x, junctions, maxIntersectionRadius)) lightPositions.push([x, road.position + sidewalkCenter]);
    }
  }

  const dummy = new THREE.Object3D();
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.13, 0.2, 6.8, 7),
    new THREE.MeshStandardMaterial({ color: 0x35434b, roughness: 0.68, metalness: 0.58 }),
    lightPositions.length,
  );
  const lamps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.75, 0.3, 0.38),
    new THREE.MeshStandardMaterial({ color: 0xffe2a2, emissive: 0xffc765, emissiveIntensity: 0.45, roughness: 0.52 }),
    lightPositions.length,
  );
  lightPositions.forEach(([x, z], index) => {
    setInstance(poles, index, dummy, [x, 3.4 + CURB_HEIGHT, z], [1, 1, 1]);
    setInstance(lamps, index, dummy, [x, 6.67 + CURB_HEIGHT, z], [1, 1, 1]);
  });
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  group.add(poles, lamps);

  const treePositions = lightPositions.filter((_, index) => index % 4 === 2);
  for (let x = -1000; x <= 1000; x += 88) treePositions.push([x, 818]);
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.28, 3.3, 7),
    new THREE.MeshStandardMaterial({ color: 0x685442, roughness: 1 }),
    treePositions.length,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.4, 1),
    new THREE.MeshStandardMaterial({ color: 0x5f8a57, roughness: 0.95 }),
    treePositions.length,
  );
  treePositions.forEach(([x, z], index) => {
    setInstance(trunks, index, dummy, [x, 1.65 + CURB_HEIGHT, z], [1, 1, 1]);
    setInstance(crowns, index, dummy, [x, 4.45 + CURB_HEIGHT, z], [1.15, 1.4, 1.15]);
    collision.registerStatic({ x, z, r: 0.72 });
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks, crowns);
  return { streetLights: lightPositions.length, streetTrees: treePositions.length };
}

function addDeliveryStops(
  group: THREE.Group,
  road: THREE.Vector3[],
  count: number,
  collision: CollisionWorld,
  xProfiles: CityRoadProfile[],
  zProfiles: CityRoadProfile[],
) {
  const points: Array<{ x: number; z: number }> = [];
  const markers = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(((i + 0.55) / count) * (road.length - 1));
    const p = road[index];
    const previous = road[Math.max(0, index - 1)];
    const next = road[Math.min(road.length - 1, index + 1)];
    const side = i % 2 === 0 ? 1 : -1;
    const horizontal = Math.abs(next.x - previous.x) > Math.abs(next.z - previous.z);
    const profile = horizontal ? nearestRoad(p.z, zProfiles).profile : nearestRoad(p.x, xProfiles).profile;
    const offset = profile.streetOuter + profile.sidewalkWidth * 0.5;
    const x = p.x + (horizontal ? 0 : side * offset);
    const z = p.z + (horizontal ? side * offset : 0);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 4.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x31434d, metalness: 0.34, roughness: 0.58 }),
    );
    post.position.set(x, 2.1 + CURB_HEIGHT, z);
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.08, 0),
      new THREE.MeshStandardMaterial({ color: 0xffb34e, emissive: 0xff8429, emissiveIntensity: 1.45, roughness: 0.48 }),
    );
    beacon.position.set(x, 4.85 + CURB_HEIGHT, z);
    beacon.rotation.y = i * 0.7;
    post.castShadow = true;
    beacon.castShadow = true;
    markers.add(post, beacon);
    points.push({ x, z });
    collision.registerStatic({ x, z, r: 0.82 });
  }
  group.add(markers);
  return points;
}

function addRestrictedBoundaryCompounds(group: THREE.Group, collision: CollisionWorld, seed: number) {
  const compounds = new THREE.Group();
  compounds.name = "city-restricted-boundary-compounds";
  compounds.userData.ridingBoundary = {
    westX: CITY_WEST_FENCE_X,
    eastX: CITY_EAST_FENCE_X,
    northZ: CITY_NORTH_FENCE_Z,
  };

  const compoundMaterial = new THREE.MeshStandardMaterial({ color: 0x8f948c, roughness: 0.96 });
  const compoundDepth = CITY_NORTH_FENCE_Z - CITY_MIN_Z;
  const sideWidth = CITY_WEST_FENCE_X - CITY_MIN_X;
  const northGround = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_MAX_X - CITY_MIN_X, 0.16, compoundDepth),
    compoundMaterial,
  );
  northGround.position.set(0, 0.08, CITY_MIN_Z + compoundDepth * 0.5);
  const westGround = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, 0.16, CITY_COAST_RAIL_Z - CITY_NORTH_FENCE_Z),
    compoundMaterial,
  );
  westGround.position.set(CITY_MIN_X + sideWidth * 0.5, 0.08, (CITY_NORTH_FENCE_Z + CITY_COAST_RAIL_Z) * 0.5);
  const eastGround = westGround.clone();
  eastGround.position.x = CITY_MAX_X - sideWidth * 0.5;
  for (const surface of [northGround, westGround, eastGround]) {
    surface.name = "city-restricted-compound-ground";
    surface.receiveShadow = true;
  }
  compounds.add(northGround, westGround, eastGround);

  const fenceLines = [
    { horizontal: true, fixed: CITY_NORTH_FENCE_Z, start: CITY_WEST_FENCE_X, end: CITY_EAST_FENCE_X },
    { horizontal: false, fixed: CITY_WEST_FENCE_X, start: CITY_NORTH_FENCE_Z, end: CITY_COAST_RAIL_Z },
    { horizontal: false, fixed: CITY_EAST_FENCE_X, start: CITY_NORTH_FENCE_Z, end: CITY_COAST_RAIL_Z },
  ];
  const fenceSpacing = 4;
  const totalPosts = fenceLines.reduce((total, line) => total + Math.ceil((line.end - line.start) / fenceSpacing) + 1, 0);
  const totalSegments = totalPosts - fenceLines.length;
  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x34464a, roughness: 0.5, metalness: 0.64 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 1.7, 0.24), fenceMaterial, totalPosts);
  posts.name = "city-boundary-fence-posts";
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fenceMaterial, totalSegments * 2);
  bars.name = "city-boundary-fence-bars";
  const dummy = new THREE.Object3D();
  let postIndex = 0;
  let barIndex = 0;
  for (const line of fenceLines) {
    const count = Math.ceil((line.end - line.start) / fenceSpacing) + 1;
    for (let i = 0; i < count; i += 1) {
      const along = THREE.MathUtils.lerp(line.start, line.end, i / (count - 1));
      const x = line.horizontal ? along : line.fixed;
      const z = line.horizontal ? line.fixed : along;
      setInstance(posts, postIndex++, dummy, [x, 0.93, z], [1, 1, 1]);
      collision.registerStatic({ x, z, r: 0.92 });
      if (i < count - 1) {
        const next = THREE.MathUtils.lerp(line.start, line.end, (i + 1) / (count - 1));
        const length = next - along;
        for (let level = 0; level < 2; level += 1) {
          setInstance(bars, barIndex++, dummy,
            [line.horizontal ? (along + next) * 0.5 : line.fixed, level === 0 ? 0.72 : 1.48,
              line.horizontal ? line.fixed : (along + next) * 0.5],
            line.horizontal ? [length, 0.13, 0.13] : [0.13, 0.13, length]);
        }
      }
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  bars.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  bars.castShadow = true;
  compounds.add(posts, bars);

  const random = createCityRandom(seed ^ 0xb04d3a7);
  const boundaryBuildings: Array<{ x: number; z: number; width: number; depth: number; height: number }> = [];
  for (let x = CITY_MIN_X + 64; x <= CITY_MAX_X - 64; x += 145) {
    boundaryBuildings.push({
      x: x + randomRange(random, -13, 13), z: CITY_MIN_Z + 27,
      width: randomRange(random, 62, 92), depth: randomRange(random, 27, 40), height: randomRange(random, 25, 58),
    });
  }
  for (let z = CITY_NORTH_FENCE_Z + 72; z <= CITY_COAST_RAIL_Z - 72; z += 155) {
    const depth = randomRange(random, 68, 104);
    boundaryBuildings.push({
      x: CITY_MIN_X + 27, z: z + randomRange(random, -15, 15),
      width: randomRange(random, 28, 42), depth, height: randomRange(random, 22, 52),
    });
    boundaryBuildings.push({
      x: CITY_MAX_X - 27, z: z + randomRange(random, -15, 15),
      width: randomRange(random, 28, 42), depth, height: randomRange(random, 22, 52),
    });
  }
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xa9ada6, roughness: 0.8 }),
    boundaryBuildings.length,
  );
  bodies.name = "city-boundary-compound-buildings";
  const roofs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x505c5e, roughness: 0.7, metalness: 0.16 }),
    boundaryBuildings.length,
  );
  boundaryBuildings.forEach((building, index) => {
    setInstance(bodies, index, dummy, [building.x, building.height * 0.5 + 0.18, building.z],
      [building.width, building.height, building.depth]);
    setInstance(roofs, index, dummy, [building.x, building.height + 1.5, building.z],
      [building.width + 1.4, 3, building.depth + 1.4]);
  });
  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  roofs.castShadow = true;
  compounds.add(bodies, roofs);

  const treePositions: Array<[number, number]> = [];
  for (let x = CITY_MIN_X + 28; x < CITY_MAX_X - 20; x += 72) treePositions.push([x, CITY_NORTH_FENCE_Z - 13]);
  for (let z = CITY_NORTH_FENCE_Z + 28; z < CITY_COAST_RAIL_Z - 20; z += 78) {
    treePositions.push([CITY_WEST_FENCE_X - 13, z], [CITY_EAST_FENCE_X + 13, z]);
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.32, 3.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x62503e, roughness: 1 }),
    treePositions.length,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.55, 1),
    new THREE.MeshStandardMaterial({ color: 0x557d51, roughness: 0.96 }),
    treePositions.length,
  );
  treePositions.forEach(([x, z], index) => {
    setInstance(trunks, index, dummy, [x, 1.96, z], [1, 1, 1]);
    setInstance(crowns, index, dummy, [x, 5.15, z], [1.2, 1.5, 1.2]);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  crowns.castShadow = true;
  compounds.add(trunks, crowns);
  group.add(compounds);
}

export function buildCityWorld(settings: MapSettings, collision: CollisionWorld): CityBuildResult {
  const group = new THREE.Group();
  group.name = "rain-harbor-city";
  const profiles = getCityRoadProfiles(settings.roadWidth, settings.seed);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_MAX_X - CITY_MIN_X, 0.12, CITY_MAX_Z - CITY_MIN_Z),
    new THREE.MeshStandardMaterial({ color: 0x9a9d97, roughness: 0.94, metalness: 0 }),
  );
  ground.name = "city-ground";
  ground.position.set(0, -0.08, (CITY_MIN_Z + CITY_MAX_Z) * 0.5);
  ground.receiveShadow = true;
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2700, 900),
    new THREE.MeshPhysicalMaterial({ color: 0x3d82a2, roughness: 0.28, metalness: 0.04, transparent: true, opacity: 0.9 }),
  );
  sea.name = "city-sea";
  sea.userData.surfaceY = CITY_WATER_Y;
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, CITY_WATER_Y, 1300);
  group.add(sea);

  const seawallMaterial = new THREE.MeshStandardMaterial({ color: 0x707a77, roughness: 0.92, metalness: 0.02 });
  const seawall = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_MAX_X - CITY_MIN_X, Math.abs(CITY_WATER_Y) + 0.18, 1.4),
    seawallMaterial,
  );
  seawall.name = "city-coast-seawall";
  seawall.position.set(0, CITY_WATER_Y * 0.5, CITY_MAX_Z - 0.7);
  seawall.receiveShadow = true;
  group.add(seawall);

  const coastCoping = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_MAX_X - CITY_MIN_X, 0.18, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xc6c3b7, roughness: 0.88 }),
  );
  coastCoping.name = "city-coast-coping";
  coastCoping.position.set(0, 0.09, CITY_MAX_Z - 0.9);
  coastCoping.receiveShadow = true;
  group.add(coastCoping);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.9, metalness: 0.01 });
  const whiteMarking = new THREE.MeshStandardMaterial({
    color: 0xf3eee0,
    roughness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const yellowMarking = new THREE.MeshStandardMaterial({
    color: 0xf2bf37,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  profiles.x.forEach((road) => addRoad(group, false, road.position, road, asphalt, whiteMarking, yellowMarking, profiles.z));
  profiles.z.forEach((road) => addRoad(group, true, road.position, road, asphalt, whiteMarking, yellowMarking, profiles.x));
  addSidewalkNetwork(group, profiles.x, profiles.z);

  const route = densePolyline([
    [ROAD_X[0], ROAD_Z[0]], [ROAD_X[ROAD_X.length - 1], ROAD_Z[0]],
    [ROAD_X[ROAD_X.length - 1], ROAD_Z[ROAD_Z.length - 1]],
    [ROAD_X[0], ROAD_Z[ROAD_Z.length - 1]], [ROAD_X[0], ROAD_Z[0]],
  ]);

  const buildings = addBuildings(group, settings, collision, profiles.x, profiles.z);
  const furniture = addStreetFurniture(group, collision, profiles.x, profiles.z);
  const stops = addDeliveryStops(group, route, settings.deliveryStops, collision, profiles.x, profiles.z);
  addRestrictedBoundaryCompounds(group, collision, settings.seed);

  const coastRail = new THREE.Group();
  coastRail.name = "city-coast-railing";
  coastRail.userData.collisionZ = CITY_COAST_RAIL_Z;
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x34474e, roughness: 0.48, metalness: 0.68 });
  const railSpacing = 8;
  const railSpan = CITY_MAX_X - CITY_MIN_X;
  const postCount = Math.floor(railSpan / railSpacing) + 1;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1.45, 0.2), railMaterial, postCount);
  posts.name = "city-coast-railing-posts";
  const railSegments = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMaterial, (postCount - 1) * 2);
  railSegments.name = "city-coast-railing-bars";
  const dummy = new THREE.Object3D();
  for (let i = 0; i < postCount; i += 1) {
    const x = THREE.MathUtils.lerp(CITY_MIN_X, CITY_MAX_X, i / (postCount - 1));
    setInstance(posts, i, dummy, [x, 0.78, CITY_COAST_RAIL_Z], [1, 1, 1]);
    collision.registerStatic({ x, z: CITY_COAST_RAIL_Z, r: 0.34 });
    if (i < postCount - 1) {
      const nextX = THREE.MathUtils.lerp(CITY_MIN_X, CITY_MAX_X, (i + 1) / (postCount - 1));
      const width = nextX - x;
      for (let level = 0; level < 2; level += 1) {
        setInstance(railSegments, i * 2 + level, dummy,
          [(x + nextX) * 0.5, level === 0 ? 0.72 : 1.35, CITY_COAST_RAIL_Z],
          [width, 0.12, 0.12]);
      }
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  railSegments.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  railSegments.castShadow = true;
  coastRail.add(posts, railSegments);
  group.add(coastRail);

  return {
    group,
    roadPoints: route,
    stops,
    buildings,
    streetTrees: furniture.streetTrees,
    streetLights: furniture.streetLights,
    drawCalls: 47,
  };
}
