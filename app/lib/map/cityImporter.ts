import {
  ROAD_X,
  ROAD_Z,
  getCityRoadProfiles,
  type CityRoadProfile,
} from "./city.ts";
import { CITY_CATALOG_IDS } from "./cityCatalog.ts";
import {
  CITY_CATALOG_SCHEMA_VERSION,
  CITY_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_LAMP_HEIGHT_SCALE,
  DEFAULT_SIGNAL_HEIGHT_SCALE,
  deepFreeze,
  type CityMapDocument,
  type CityMapDocumentSnapshot,
} from "./cityDocument.ts";
import type {
  CityRoadGraph,
  RoadCrossSection,
  RoadEdge,
  RoadNode,
  RoadSideProfile,
} from "./cityRoadGraph.ts";
import { splitRoadGraphAtIntersections } from "./cityRoads.ts";
import {
  LEGACY_MASSING_CATALOG_ID,
  collectBuildingPlacements,
  collectRainHarborRoute,
  collectStreetFurniturePlacements,
} from "./cityPlacements.ts";
import { TILE_SIZE_METERS } from "./cityTiles.ts";
import type { MapSettings } from "./types.ts";

export type RainHarborImportOptions = Readonly<{
  lampHeightScale?: number;
  signalHeightScale?: number;
}>;

/** Legacy massing is a document-only parametric type, not a catalog template. */
export const RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS = Object.freeze([
  ...CITY_CATALOG_IDS,
  LEGACY_MASSING_CATALOG_ID,
]);

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a finite positive number`);
  return value;
}

function sideProfile(profile: Readonly<CityRoadProfile>): RoadSideProfile {
  return {
    bikeLaneWidth: profile.bikeLaneWidth,
    bikeBufferWidth: profile.bufferWidth,
    parkingWidth: 0,
    sidewalkWidth: profile.sidewalkWidth,
    vergeWidth: 0,
  };
}

/** Preserve every meter-valued field of the legacy symmetric road profile. */
export function frozenCrossSectionFromCityRoadProfile(
  profile: Readonly<CityRoadProfile>,
): Readonly<RoadCrossSection> {
  return deepFreeze({
    lanesAToB: profile.lanesPerDirection,
    lanesBToA: profile.lanesPerDirection,
    laneWidth: profile.laneWidth,
    medianWidth: 0,
    left: sideProfile(profile),
    right: sideProfile(profile),
  });
}

function initialRainHarborRoadGraph(
  xProfiles: readonly CityRoadProfile[],
  zProfiles: readonly CityRoadProfile[],
): CityRoadGraph {
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const addRoad = (profile: Readonly<CityRoadProfile>, axis: "x" | "z", index: number) => {
    const sourceId = `rain-harbor-road-${axis}-${String(index).padStart(2, "0")}`;
    const a: RoadNode = profile.horizontal
      ? { id: `${sourceId}-a`, x: profile.start, z: profile.position }
      : { id: `${sourceId}-a`, x: profile.position, z: profile.start };
    const b: RoadNode = profile.horizontal
      ? { id: `${sourceId}-b`, x: profile.end, z: profile.position }
      : { id: `${sourceId}-b`, x: profile.position, z: profile.end };
    nodes.push(a, b);
    edges.push({
      id: sourceId,
      a: a.id,
      b: b.id,
      profile: {
        source: "frozen-import",
        crossSection: frozenCrossSectionFromCityRoadProfile(profile),
      },
    });
  };
  xProfiles.forEach((profile, index) => addRoad(profile, "x", index));
  zProfiles.forEach((profile, index) => addRoad(profile, "z", index));
  return { nodes, edges, intersectionOverrides: {} };
}

/** Build the axis-aligned graph and turn every active geometric crossing into a shared node. */
export function collectRainHarborRoadGraph(
  profiles: Readonly<{ x: readonly CityRoadProfile[]; z: readonly CityRoadProfile[] }>,
): CityRoadGraph {
  if (profiles.x.length !== ROAD_X.length || profiles.z.length !== ROAD_Z.length) {
    throw new TypeError("Rain Harbor road profiles must contain all nine legacy spines");
  }
  return splitRoadGraphAtIntersections(initialRainHarborRoadGraph(profiles.x, profiles.z));
}

function legacySpawn() {
  const route = collectRainHarborRoute();
  const index = Math.floor(route.length * 0.08);
  const start = route[index];
  const next = route[index + 1] ?? start;
  return {
    x: start.x,
    z: start.z,
    heading: Math.atan2(next.x - start.x, next.z - start.z),
  };
}

/**
 * Opt-in migration of the procedural Rain Harbor settings into a v1 city
 * document. Calling this function never changes the live legacy renderer.
 */
export function importRainHarborDocument(
  settings: Readonly<MapSettings>,
  options: RainHarborImportOptions = {},
): CityMapDocumentSnapshot {
  const lampHeightScale = positiveFinite(
    options.lampHeightScale ?? DEFAULT_LAMP_HEIGHT_SCALE,
    "lampHeightScale",
  );
  const signalHeightScale = positiveFinite(
    options.signalHeightScale ?? DEFAULT_SIGNAL_HEIGHT_SCALE,
    "signalHeightScale",
  );
  const profiles = getCityRoadProfiles(settings.roadWidth, settings.seed);
  const graph = collectRainHarborRoadGraph(profiles);
  const furniture = collectStreetFurniturePlacements(profiles, lampHeightScale);
  const buildings = collectBuildingPlacements(settings, profiles);
  const document: CityMapDocument = {
    schemaVersion: CITY_DOCUMENT_SCHEMA_VERSION,
    catalogSchemaVersion: CITY_CATALOG_SCHEMA_VERSION,
    tileSizeMeters: TILE_SIZE_METERS,
    spawn: legacySpawn(),
    graph,
    placements: [...buildings, ...furniture.placements],
    flags: {
      needTrafficLights: true,
      lampHeightScale,
      signalHeightScale,
    },
  };
  return deepFreeze(document);
}
