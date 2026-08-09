import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import type { MapSettings } from "./types";

export const CITY_MIN_X = -1100;
export const CITY_MAX_X = 1100;
export const CITY_MIN_Z = -1080;
export const CITY_MAX_Z = 870;

const ROAD_X = [-820, -360, 120, 500, 820];
const ROAD_Z = [-640, -180, 280, 700];
const CURB_HEIGHT = 0.24;
const RAMP_LENGTH = 4.2;
const BODY_COLORS = [0xc1bbb0, 0xa9b4bc, 0xd0b3a2, 0x99a8af, 0xc8c2b5, 0xb98f7b];

export type CityRoadDimensions = {
  motorWidth: number;
  bikeLaneWidth: number;
  bufferWidth: number;
  sidewalkWidth: number;
  streetOuter: number;
  corridorWidth: number;
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
  const sidewalkWidth = 5.2;
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
    x: THREE.MathUtils.clamp(x, CITY_MIN_X + inset, CITY_MAX_X - inset),
    z: THREE.MathUtils.clamp(z, CITY_MIN_Z + inset, CITY_MAX_Z - inset),
  };
}

function nearestDistance(value: number, roads: number[]) {
  let closest = Infinity;
  for (const road of roads) closest = Math.min(closest, Math.abs(value - road));
  return closest;
}

function citySurfaceHeight(x: number, z: number, tuning: number) {
  const dimensions = getCityRoadDimensions(tuning);
  const dx = nearestDistance(x, ROAD_X);
  const dz = nearestDistance(z, ROAD_Z);
  const sidewalkOuter = dimensions.streetOuter + dimensions.sidewalkWidth;
  if (dx <= dimensions.streetOuter || dz <= dimensions.streetOuter) return 0;
  if (dx > sidewalkOuter && dz > sidewalkOuter) return 0;

  let ramp = 1;
  if (dx <= sidewalkOuter && dz <= sidewalkOuter + RAMP_LENGTH) {
    ramp = Math.min(ramp, THREE.MathUtils.clamp((dz - dimensions.streetOuter) / RAMP_LENGTH, 0, 1));
  }
  if (dz <= sidewalkOuter && dx <= sidewalkOuter + RAMP_LENGTH) {
    ramp = Math.min(ramp, THREE.MathUtils.clamp((dx - dimensions.streetOuter) / RAMP_LENGTH, 0, 1));
  }
  return CURB_HEIGHT * ramp;
}

export function sampleCitySurface(x = 0, z = 0, tuning = 8) {
  const height = citySurfaceHeight(x, z, tuning);
  const epsilon = 0.18;
  const gx = (citySurfaceHeight(x + epsilon, z, tuning) - citySurfaceHeight(x - epsilon, z, tuning)) / (epsilon * 2);
  const gz = (citySurfaceHeight(x, z + epsilon, tuning) - citySurfaceHeight(x, z - epsilon, tuning)) / (epsilon * 2);
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
  dimensions: CityRoadDimensions,
  asphalt: THREE.Material,
  marking: THREE.Material,
) {
  const start = horizontal ? CITY_MIN_X : CITY_MIN_Z;
  const end = horizontal ? CITY_MAX_X : CITY_MAX_Z;
  const length = end - start;
  const center = (start + end) * 0.5;
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? length : dimensions.streetOuter * 2, 0.08, horizontal ? dimensions.streetOuter * 2 : length),
    asphalt,
  );
  road.name = "city-road-asphalt";
  road.position.set(horizontal ? center : position, 0.01, horizontal ? position : center);
  road.receiveShadow = true;
  group.add(road);

  const dashLength = 11;
  const dashGap = 15;
  const dashCount = Math.floor(length / (dashLength + dashGap));
  const lineGeometry = new THREE.PlaneGeometry(horizontal ? dashLength : 0.25, horizontal ? 0.25 : dashLength);
  lineGeometry.rotateX(-Math.PI * 0.5);
  for (const offset of [0, -dimensions.motorWidth * 0.5, dimensions.motorWidth * 0.5]) {
    const dashes = new THREE.InstancedMesh(lineGeometry, marking, dashCount);
    dashes.name = offset === 0 ? "city-road-center-dashes" : "city-bike-lane-dashes";
    dashes.userData.surfaceMarking = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i += 1) {
      const along = start + 9 + i * (dashLength + dashGap);
      setInstance(
        dashes,
        i,
        dummy,
        horizontal ? [along, 0.051, position + offset] : [position + offset, 0.051, along],
        [1, 1, 1],
      );
    }
    dashes.instanceMatrix.needsUpdate = true;
    group.add(dashes);
  }
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

function addSidewalkNetwork(group: THREE.Group, dimensions: CityRoadDimensions) {
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.93, metalness: 0 });
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0xbcb6aa, roughness: 0.96 });
  const crosswalkMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f0e8,
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const edgesX = [CITY_MIN_X, ...ROAD_X, CITY_MAX_X];
  const edgesZ = [CITY_MIN_Z, ...ROAD_Z, CITY_MAX_Z];
  const segmentCount = ROAD_Z.length * 2 * (edgesX.length - 1) + ROAD_X.length * 2 * (edgesZ.length - 1);
  const sidewalks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sidewalkMaterial, segmentCount);
  const dummy = new THREE.Object3D();
  let sidewalkIndex = 0;

  for (const roadZ of ROAD_Z) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < edgesX.length - 1; i += 1) {
        const start = edgesX[i] + (i === 0 ? 0 : dimensions.corridorWidth * 0.5 + RAMP_LENGTH);
        const end = edgesX[i + 1] - (i === edgesX.length - 2 ? 0 : dimensions.corridorWidth * 0.5 + RAMP_LENGTH);
        if (end <= start) continue;
        setInstance(sidewalks, sidewalkIndex++, dummy,
          [(start + end) * 0.5, CURB_HEIGHT * 0.5, roadZ + side * (dimensions.streetOuter + dimensions.sidewalkWidth * 0.5)],
          [end - start, CURB_HEIGHT, dimensions.sidewalkWidth]);
      }
    }
  }
  for (const roadX of ROAD_X) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < edgesZ.length - 1; i += 1) {
        const start = edgesZ[i] + (i === 0 ? 0 : dimensions.corridorWidth * 0.5 + RAMP_LENGTH);
        const end = edgesZ[i + 1] - (i === edgesZ.length - 2 ? 0 : dimensions.corridorWidth * 0.5 + RAMP_LENGTH);
        if (end <= start) continue;
        setInstance(sidewalks, sidewalkIndex++, dummy,
          [roadX + side * (dimensions.streetOuter + dimensions.sidewalkWidth * 0.5), CURB_HEIGHT * 0.5, (start + end) * 0.5],
          [dimensions.sidewalkWidth, CURB_HEIGHT, end - start]);
      }
    }
  }
  sidewalks.count = sidewalkIndex;
  sidewalks.instanceMatrix.needsUpdate = true;
  sidewalks.receiveShadow = true;
  group.add(sidewalks);

  const rampCount = ROAD_X.length * ROAD_Z.length * 8;
  const ramps = new THREE.InstancedMesh(createCurbRampGeometry(3.4, RAMP_LENGTH, CURB_HEIGHT), rampMaterial, rampCount);
  let rampIndex = 0;
  for (const x of ROAD_X) {
    for (const z of ROAD_Z) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          setInstance(ramps, rampIndex++, dummy,
            [x + sx * (dimensions.streetOuter + RAMP_LENGTH * 0.5), 0, z + sz * (dimensions.streetOuter + dimensions.sidewalkWidth * 0.5)],
            [1, 1, 1], sx * Math.PI * 0.5);
          setInstance(ramps, rampIndex++, dummy,
            [x + sx * (dimensions.streetOuter + dimensions.sidewalkWidth * 0.5), 0, z + sz * (dimensions.streetOuter + RAMP_LENGTH * 0.5)],
            [1, 1, 1], sz > 0 ? 0 : Math.PI);
        }
      }
    }
  }
  ramps.instanceMatrix.needsUpdate = true;
  ramps.receiveShadow = true;
  group.add(ramps);

  const stripeCount = ROAD_X.length * ROAD_Z.length * 24;
  const stripeGeometry = new THREE.PlaneGeometry(1, 1);
  stripeGeometry.rotateX(-Math.PI * 0.5);
  const stripes = new THREE.InstancedMesh(stripeGeometry, crosswalkMaterial, stripeCount);
  stripes.name = "city-crosswalk-markings";
  stripes.userData.surfaceMarking = true;
  let stripeIndex = 0;
  for (const x of ROAD_X) {
    for (const z of ROAD_Z) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i += 1) {
          const shift = (i - 2.5) * 1.15;
          setInstance(stripes, stripeIndex++, dummy,
            [x, 0.052, z + side * (dimensions.streetOuter - 1.25) + shift],
            [dimensions.streetOuter * 2 - dimensions.bufferWidth * 2, 1, 0.55]);
          setInstance(stripes, stripeIndex++, dummy,
            [x + side * (dimensions.streetOuter - 1.25) + shift, 0.052, z],
            [0.55, 1, dimensions.streetOuter * 2 - dimensions.bufferWidth * 2]);
        }
      }
    }
  }
  stripes.instanceMatrix.needsUpdate = true;
  group.add(stripes);
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

function addBuildings(group: THREE.Group, settings: MapSettings, collision: CollisionWorld, dimensions: CityRoadDimensions) {
  const random = createCityRandom(settings.seed ^ 0x51c17);
  const xEdges = [CITY_MIN_X, ...ROAD_X, CITY_MAX_X];
  const zEdges = [CITY_MIN_Z, ...ROAD_Z, CITY_MAX_Z];
  const records: Building[] = [];
  const roadMargin = dimensions.corridorWidth * 0.5 + 7;

  for (let xi = 0; xi < xEdges.length - 1; xi += 1) {
    for (let zi = 0; zi < zEdges.length - 1; zi += 1) {
      const x0 = xEdges[xi] + (xi === 0 ? 12 : roadMargin);
      const x1 = xEdges[xi + 1] - (xi === xEdges.length - 2 ? 12 : roadMargin);
      const z0 = zEdges[zi] + (zi === 0 ? 12 : roadMargin);
      const z1 = zEdges[zi + 1] - (zi === zEdges.length - 2 ? 12 : roadMargin);
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
          const x = x0 + cellW * (col + 0.5) + randomRange(random, -cellW * 0.06, cellW * 0.06);
          const z = z0 + cellD * (row + 0.5) + randomRange(random, -cellD * 0.06, cellD * 0.06);
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

function addStreetFurniture(group: THREE.Group, collision: CollisionWorld, dimensions: CityRoadDimensions) {
  const lightPositions: Array<[number, number]> = [];
  const sidewalkCenter = dimensions.streetOuter + dimensions.sidewalkWidth * 0.66;
  for (const x of ROAD_X) {
    for (let z = CITY_MIN_Z + 55; z < CITY_MAX_Z - 32; z += 92) {
      if (farFromIntersections(z, ROAD_Z, dimensions.corridorWidth * 0.6)) lightPositions.push([x + sidewalkCenter, z]);
    }
  }
  for (const z of ROAD_Z) {
    for (let x = CITY_MIN_X + 55; x < CITY_MAX_X - 32; x += 92) {
      if (farFromIntersections(x, ROAD_X, dimensions.corridorWidth * 0.6)) lightPositions.push([x, z + sidewalkCenter]);
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

function addDeliveryStops(group: THREE.Group, road: THREE.Vector3[], count: number, collision: CollisionWorld, dimensions: CityRoadDimensions) {
  const points: Array<{ x: number; z: number }> = [];
  const markers = new THREE.Group();
  const offset = dimensions.streetOuter + dimensions.sidewalkWidth * 0.5;
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(((i + 0.55) / count) * (road.length - 1));
    const p = road[index];
    const previous = road[Math.max(0, index - 1)];
    const next = road[Math.min(road.length - 1, index + 1)];
    const side = i % 2 === 0 ? 1 : -1;
    const horizontal = Math.abs(next.x - previous.x) > Math.abs(next.z - previous.z);
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

export function buildCityWorld(settings: MapSettings, collision: CollisionWorld): CityBuildResult {
  const group = new THREE.Group();
  group.name = "rain-harbor-city";
  const dimensions = getCityRoadDimensions(settings.roadWidth);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_MAX_X - CITY_MIN_X, 0.12, CITY_MAX_Z - CITY_MIN_Z),
    new THREE.MeshStandardMaterial({ color: 0x9a9d97, roughness: 0.94, metalness: 0 }),
  );
  ground.position.set(0, -0.08, (CITY_MIN_Z + CITY_MAX_Z) * 0.5);
  ground.receiveShadow = true;
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2700, 900),
    new THREE.MeshPhysicalMaterial({ color: 0x3d82a2, roughness: 0.28, metalness: 0.04, transparent: true, opacity: 0.9 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.02, 1300);
  group.add(sea);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.9, metalness: 0.01 });
  const marking = new THREE.MeshStandardMaterial({
    color: 0xf3eee0,
    roughness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  ROAD_X.forEach((x) => addRoad(group, false, x, dimensions, asphalt, marking));
  ROAD_Z.forEach((z) => addRoad(group, true, z, dimensions, asphalt, marking));
  addSidewalkNetwork(group, dimensions);

  const route = densePolyline([
    [-820, -640], [-360, -640], [-360, -180], [120, -180], [120, 280],
    [-600, 280], [-600, 700], [500, 700], [500, 280], [820, 280],
    [820, -640], [500, -640], [500, -180], [120, -180],
  ]);

  const buildings = addBuildings(group, settings, collision, dimensions);
  const furniture = addStreetFurniture(group, collision, dimensions);
  const stops = addDeliveryStops(group, route, settings.deliveryStops, collision, dimensions);

  const coastRail = new THREE.InstancedMesh(
    new THREE.BoxGeometry(12, 1.05, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xd3dbdc, roughness: 0.58, metalness: 0.32 }),
    184,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 184; i += 1) {
    const x = CITY_MIN_X + 6 + i * 12;
    setInstance(coastRail, i, dummy, [x, 0.52, 858], [1, 1, 1]);
    collision.registerStatic({ x, z: 858, r: 6.1 });
  }
  coastRail.instanceMatrix.needsUpdate = true;
  group.add(coastRail);

  return {
    group,
    roadPoints: route,
    stops,
    buildings,
    streetTrees: furniture.streetTrees,
    streetLights: furniture.streetLights,
    drawCalls: 34,
  };
}
