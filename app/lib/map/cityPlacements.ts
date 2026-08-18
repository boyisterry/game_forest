import * as THREE from "three";
import {
  CITY_MAX_X,
  CITY_MAX_Z,
  CITY_MIN_X,
  CITY_MIN_Z,
  ROAD_X,
  ROAD_Z,
  roadsIntersect,
  type CityRoadProfile,
} from "./city.ts";
import {
  DEFAULT_LAMP_HEIGHT_SCALE,
  type LegacyMassingPlacement,
  type WorldPlacement,
} from "./cityDocument.ts";
import type { MapSettings } from "./types.ts";

export const LEGACY_MASSING_CATALOG_ID = "legacy-massing-block";

type District = "harbor" | "waterfront" | "hills" | "oldtown" | "central";

export type RainHarborRoadProfiles = Readonly<{
  x: readonly CityRoadProfile[];
  z: readonly CityRoadProfile[];
}>;

export type StreetFurniturePlacements = Readonly<{
  lights: readonly WorldPlacement[];
  trees: readonly WorldPlacement[];
  placements: readonly WorldPlacement[];
}>;

export type LegacyMassingBoxPartRole =
  | "body"
  | "plinth"
  | "roof"
  | "trim"
  | "door"
  | "awning"
  | "window";

/**
 * A renderer composes this transform before applying the role's base geometry.
 * Door/window base depth stays explicit so the same record also gives collision
 * code the true world dimensions without losing legacy matrix equivalence.
 */
export type LegacyMassingBoxPart = Readonly<{
  role: LegacyMassingBoxPartRole;
  collisionRole: "solid" | "ignore";
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  baseWidth: number;
  baseHeight: number;
  baseDepth: number;
}>;

export type WorldPoint = Readonly<{ x: number; z: number }>;

const BODY_COLORS = Object.freeze([0xc1bbb0, 0xa9b4bc, 0xd0b3a2, 0x99a8af, 0xc8c2b5, 0xb98f7b]);

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

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a finite positive number`);
  return value;
}

function freezePlacement<T extends WorldPlacement | LegacyMassingPlacement>(placement: T): Readonly<T> {
  return Object.freeze(placement);
}

function farFromIntersections(value: number, roads: readonly number[], radius: number) {
  return roads.every((road) => Math.abs(value - road) > radius);
}

/** Pure extraction of the legacy street-light and street-tree placement loops. */
export function collectStreetFurniturePlacements(
  profiles: RainHarborRoadProfiles,
  lampHeightScale = DEFAULT_LAMP_HEIGHT_SCALE,
): StreetFurniturePlacements {
  positiveFinite(lampHeightScale, "lampHeightScale");
  const lights: WorldPlacement[] = [];
  const trees: WorldPlacement[] = [];
  const maxIntersectionRadius = Math.max(
    ...[...profiles.x, ...profiles.z].map((profile) => profile.corridorWidth * 0.6),
  );

  const addLight = (x: number, z: number, yawRadians: number) => {
    lights.push(freezePlacement({
      id: `rain-harbor-street-light-${String(lights.length).padStart(4, "0")}`,
      catalogId: "street-light",
      poseKind: "world",
      x,
      z,
      yawRadians,
      scale: 1,
      heightScale: lampHeightScale,
    }));
  };
  const addTree = (x: number, z: number, yawRadians: number, scale: number) => {
    trees.push(freezePlacement({
      id: `rain-harbor-street-tree-${String(trees.length).padStart(4, "0")}`,
      catalogId: "street-tree",
      poseKind: "world",
      x,
      z,
      yawRadians,
      scale,
    }));
  };

  for (const road of profiles.x) {
    const sidewalkCenter = road.streetOuter + road.sidewalkWidth * 0.62;
    const junctions = profiles.z.filter((profile) => roadsIntersect(road, profile)).map((profile) => profile.position);
    for (let z = road.start + 34; z < road.end - 28; z += 84) {
      if (!farFromIntersections(z, junctions, maxIntersectionRadius)) continue;
      addLight(road.position - sidewalkCenter, z, 0);
      addLight(road.position + sidewalkCenter, z, Math.PI);
      const treeZ = z + 42;
      if (treeZ < road.end - 18 && farFromIntersections(treeZ, junctions, maxIntersectionRadius)) {
        addTree(
          road.position - sidewalkCenter,
          treeZ,
          (treeZ * 0.017) % (Math.PI * 2),
          0.76 + ((Math.abs(treeZ) % 19) / 190),
        );
        addTree(
          road.position + sidewalkCenter,
          treeZ,
          (treeZ * 0.021 + 1.7) % (Math.PI * 2),
          0.74 + ((Math.abs(treeZ) % 23) / 205),
        );
      }
    }
  }

  for (const road of profiles.z) {
    const sidewalkCenter = road.streetOuter + road.sidewalkWidth * 0.62;
    const junctions = profiles.x.filter((profile) => roadsIntersect(road, profile)).map((profile) => profile.position);
    for (let x = road.start + 34; x < road.end - 28; x += 84) {
      if (!farFromIntersections(x, junctions, maxIntersectionRadius)) continue;
      addLight(x, road.position - sidewalkCenter, -Math.PI * 0.5);
      addLight(x, road.position + sidewalkCenter, Math.PI * 0.5);
      const treeX = x + 42;
      if (treeX < road.end - 18 && farFromIntersections(treeX, junctions, maxIntersectionRadius)) {
        addTree(
          treeX,
          road.position - sidewalkCenter,
          (treeX * 0.019) % (Math.PI * 2),
          0.76 + ((Math.abs(treeX) % 17) / 180),
        );
        addTree(
          treeX,
          road.position + sidewalkCenter,
          (treeX * 0.023 + 2.1) % (Math.PI * 2),
          0.75 + ((Math.abs(treeX) % 29) / 240),
        );
      }
    }
  }

  return Object.freeze({
    lights: Object.freeze(lights),
    trees: Object.freeze(trees),
    placements: Object.freeze([...lights, ...trees]),
  });
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

/** Pure extraction of the legacy procedural skyline records. */
export function collectBuildingPlacements(
  settings: Pick<MapSettings, "seed" | "cityDensity">,
  profiles: RainHarborRoadProfiles,
): readonly LegacyMassingPlacement[] {
  const random = createCityRandom(settings.seed ^ 0x51c17);
  const xEdges = [CITY_MIN_X, ...ROAD_X, CITY_MAX_X];
  const zEdges = [CITY_MIN_Z, ...ROAD_Z, CITY_MAX_Z];
  const placements: LegacyMassingPlacement[] = [];
  for (let xi = 0; xi < xEdges.length - 1; xi += 1) {
    for (let zi = 0; zi < zEdges.length - 1; zi += 1) {
      const x0 = xEdges[xi] + (xi === 0 ? 12 : profiles.x[xi - 1].corridorWidth * 0.5 + 1.6);
      const x1 = xEdges[xi + 1] - (xi === xEdges.length - 2 ? 12 : profiles.x[xi].corridorWidth * 0.5 + 1.6);
      const z0 = zEdges[zi] + (zi === 0 ? 12 : profiles.z[zi - 1].corridorWidth * 0.5 + 1.6);
      const z1 = zEdges[zi + 1] - (zi === zEdges.length - 2 ? 12 : profiles.z[zi].corridorWidth * 0.5 + 1.6);
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
          placements.push(freezePlacement({
            id: `rain-harbor-massing-${String(placements.length).padStart(4, "0")}`,
            catalogId: LEGACY_MASSING_CATALOG_ID,
            poseKind: "legacy-massing",
            x,
            z,
            yawRadians: 0,
            width,
            depth,
            height,
            roofHeight: randomRange(random, 2.2, 6.2),
            color: color.getHex(),
            district,
          }));
        }
      }
    }
  }
  return Object.freeze(placements);
}

function part(
  role: LegacyMassingBoxPartRole,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  yawRadians = 0,
  baseDepth = 1,
): LegacyMassingBoxPart {
  return Object.freeze({
    role,
    collisionRole: role === "window" ? "ignore" : "solid",
    x,
    y,
    z,
    yawRadians,
    scaleX,
    scaleY,
    scaleZ,
    baseWidth: 1,
    baseHeight: 1,
    baseDepth,
  });
}

/** The single source of truth for the seven legacy massing instance layers. */
export function buildLegacyMassingBoxParts(
  placement: Readonly<LegacyMassingPlacement>,
): readonly LegacyMassingBoxPart[] {
  const record = placement;
  const parts: LegacyMassingBoxPart[] = [
    part("body", record.x, record.height * 0.5 + 0.6, record.z, record.width, record.height, record.depth),
    part("plinth", record.x, 0.6, record.z, record.width + 1.4, 1.2, record.depth + 1.4),
    part(
      "roof",
      record.x + record.width * 0.14,
      record.height + record.roofHeight * 0.5 + 0.6,
      record.z - record.depth * 0.12,
      record.width * 0.34,
      record.roofHeight,
      record.depth * 0.32,
    ),
    part("trim", record.x, record.height * 0.36, record.z, record.width + 0.7, 0.48, record.depth + 0.7),
    part("trim", record.x, record.height * 0.7, record.z, record.width + 0.7, 0.48, record.depth + 0.7),
  ];
  const doorWidth = THREE.MathUtils.clamp(record.width * 0.12, 3.2, 6.5);
  parts.push(
    part("door", record.x, 2.5, record.z + record.depth * 0.501 + 0.05, doorWidth, 4.8, 1, 0, 0.18),
    part("awning", record.x, 5.25, record.z + record.depth * 0.5 + 1.25, doorWidth * 2.1, 0.28, 2.5),
  );

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
        parts.push(part(
          "window",
          px,
          y,
          record.z + face * record.depth * 0.501,
          windowWidth,
          2.45,
          1,
          face < 0 ? Math.PI : 0,
          0.14,
        ));
      }
    }
    for (let col = 0; col < sideColumns; col += 1) {
      const pz = record.z + ((col + 1) / (sideColumns + 1) - 0.5) * record.depth * 0.82;
      for (const face of [-1, 1]) {
        parts.push(part(
          "window",
          record.x + face * record.width * 0.501,
          y,
          pz,
          windowDepth,
          2.45,
          1,
          face > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          0.14,
        ));
      }
    }
  }
  return Object.freeze(parts);
}

export function legacyMassingPartWorldSize(partRecord: LegacyMassingBoxPart) {
  return Object.freeze({
    width: partRecord.baseWidth * partRecord.scaleX,
    height: partRecord.baseHeight * partRecord.scaleY,
    depth: partRecord.baseDepth * partRecord.scaleZ,
  });
}

export function collectRainHarborRoute(step = 18): readonly WorldPoint[] {
  positiveFinite(step, "step");
  const corners: readonly (readonly [number, number])[] = [
    [ROAD_X[0], ROAD_Z[0]],
    [ROAD_X[ROAD_X.length - 1], ROAD_Z[0]],
    [ROAD_X[ROAD_X.length - 1], ROAD_Z[ROAD_Z.length - 1]],
    [ROAD_X[0], ROAD_Z[ROAD_Z.length - 1]],
    [ROAD_X[0], ROAD_Z[0]],
  ];
  const points: WorldPoint[] = [];
  for (let index = 0; index < corners.length - 1; index += 1) {
    const [ax, az] = corners[index];
    const [bx, bz] = corners[index + 1];
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let cursor = 0; cursor < count; cursor += 1) {
      const t = cursor / count;
      points.push(Object.freeze({
        x: THREE.MathUtils.lerp(ax, bx, t),
        z: THREE.MathUtils.lerp(az, bz, t),
      }));
    }
  }
  const last = corners[corners.length - 1];
  points.push(Object.freeze({ x: last[0], z: last[1] }));
  return Object.freeze(points);
}

function nearestRoad(value: number, profiles: readonly CityRoadProfile[]) {
  let closest = profiles[0];
  let distance = Math.abs(value - closest.position);
  for (const profile of profiles.slice(1)) {
    const candidate = Math.abs(value - profile.position);
    if (candidate < distance) {
      closest = profile;
      distance = candidate;
    }
  }
  return closest;
}

/** Pure extraction of delivery-stop selection; rendering the beacons stays elsewhere. */
export function collectDeliveryStops(
  route: readonly WorldPoint[],
  count: number,
  profiles: RainHarborRoadProfiles,
): readonly WorldPoint[] {
  if (!Number.isInteger(count) || count < 0) throw new TypeError("delivery stop count must be a non-negative integer");
  const candidates: Array<{ point: WorldPoint; horizontal: boolean; profile: CityRoadProfile }> = [];
  for (let index = 1; index < route.length - 1; index += 1) {
    const point = route[index];
    const previous = route[index - 1];
    const next = route[index + 1];
    const dx = Math.abs(next.x - previous.x);
    const dz = Math.abs(next.z - previous.z);
    if (dx < dz * 3 && dz < dx * 3) continue;
    const horizontal = dx > dz;
    const profile = horizontal ? nearestRoad(point.z, profiles.z) : nearestRoad(point.x, profiles.x);
    const crossingRoads = horizontal
      ? profiles.x.filter((crossing) => roadsIntersect(profile, crossing))
      : profiles.z.filter((crossing) => roadsIntersect(profile, crossing));
    const along = horizontal ? point.x : point.z;
    if (crossingRoads.every((crossing) => Math.abs(along - crossing.position) > crossing.streetOuter + 8)) {
      candidates.push({ point, horizontal, profile });
    }
  }

  const result: WorldPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidateIndex = Math.min(
      candidates.length - 1,
      Math.floor(((index + 0.5) / count) * candidates.length),
    );
    const candidate = candidates[candidateIndex];
    if (!candidate) break;
    const side = index % 2 === 0 ? 1 : -1;
    const offset = candidate.profile.streetOuter + candidate.profile.sidewalkWidth * 0.5;
    result.push(Object.freeze({
      x: candidate.point.x + (candidate.horizontal ? 0 : side * offset),
      z: candidate.point.z + (candidate.horizontal ? side * offset : 0),
    }));
  }
  return Object.freeze(result);
}
