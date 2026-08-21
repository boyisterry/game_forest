import { getCatalogEntry } from "./cityCatalog.ts";
import {
  CITY_CATALOG_SCHEMA_VERSION,
  CITY_DOCUMENT_SCHEMA_VERSION,
  parseCityMapDocument,
  type CityMapDocument,
  type CityMapDocumentSnapshot,
  type GridPlacement,
} from "./cityDocument.ts";
import { assertGridPlacementsAllowed } from "./cityEditorOccupancy.ts";
import {
  corridorMeters,
  createRoadProfile,
  type CityRoadGraph,
  type RoadPresetId,
} from "./cityRoadGraph.ts";
import { splitRoadGraphAtIntersections } from "./cityRoads.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  type Yaw90,
} from "./cityTiles.ts";

export const CEDAR_CROSSING_NAME_EN = "Cedar Crossing";
export const CEDAR_CROSSING_NAME_ZH = "雪松新城";
/** Bump when the shipped editor-native layout must replace an older builtin. */
export const CEDAR_CROSSING_CONTENT_VERSION = 2;

// The main grid deliberately forms large, legible city blocks. Local streets
// are added only where a multi-sided public entrance needs its own frontage.
const ROAD_X = Object.freeze([-1000, 0, 1000] as const);
const ROAD_Z = Object.freeze([-1000, -700, -380, -60, 280, 600, 820] as const);
const SITE_TO_SIDEWALK_GAP_METERS = 1;
const HOSPITAL_LOCAL_EAST_X = 156;
const HOSPITAL_LOCAL_NORTH_Z = -800;
const PARK_LOCAL_WEST_X = 391.5;
const PARK_LOCAL_EAST_X = 608.5;
const PARK_LOCAL_NORTH_Z = -306;
const PARK_LOCAL_SOUTH_Z = -134;

function nodeId(xIndex: number, zIndex: number) {
  return `cedar-node-${xIndex}-${zIndex}`;
}

function horizontalPreset(zIndex: number): RoadPresetId {
  if (zIndex === 1 || zIndex === 3) return "two-way-3";
  if (zIndex === 2 || zIndex === 4) return "two-way-2";
  return "two-way-1";
}

function verticalPreset(xIndex: number): RoadPresetId {
  if (xIndex === 1) return "two-way-3";
  return "two-way-1";
}

function createCedarRoadGraph(): CityRoadGraph {
  const nodes = ROAD_Z.flatMap((z, zIndex) => ROAD_X.map((x, xIndex) => ({
    id: nodeId(xIndex, zIndex),
    x,
    z,
  })));
  const edges: CityRoadGraph["edges"] = [];
  for (let zIndex = 0; zIndex < ROAD_Z.length; zIndex += 1) {
    for (let xIndex = 0; xIndex < ROAD_X.length - 1; xIndex += 1) {
      edges.push({
        id: `cedar-street-${zIndex}-${xIndex}`,
        a: nodeId(xIndex, zIndex),
        b: nodeId(xIndex + 1, zIndex),
        profile: createRoadProfile(horizontalPreset(zIndex)),
      });
    }
  }
  for (let xIndex = 0; xIndex < ROAD_X.length; xIndex += 1) {
    for (let zIndex = 0; zIndex < ROAD_Z.length - 1; zIndex += 1) {
      edges.push({
        id: `cedar-avenue-${xIndex}-${zIndex}`,
        a: nodeId(xIndex, zIndex),
        b: nodeId(xIndex, zIndex + 1),
        profile: createRoadProfile(verticalPreset(xIndex)),
      });
    }
  }
  const intersectionOverrides: CityRoadGraph["intersectionOverrides"] = {};
  // The hospital has entrances on its south, east and north sides, so these two
  // connected local streets place a real sidewalk one metre from every gate.
  nodes.push(
    { id: "cedar-hospital-north-west", x: 0, z: HOSPITAL_LOCAL_NORTH_Z },
    { id: "cedar-hospital-north-east", x: HOSPITAL_LOCAL_EAST_X, z: HOSPITAL_LOCAL_NORTH_Z },
    { id: "cedar-hospital-south-east", x: HOSPITAL_LOCAL_EAST_X, z: -700 },
  );
  edges.push(
    {
      id: "cedar-hospital-north-street",
      a: "cedar-hospital-north-west",
      b: "cedar-hospital-north-east",
      profile: createRoadProfile("two-way-1"),
    },
    {
      id: "cedar-hospital-east-street",
      a: "cedar-hospital-north-east",
      b: "cedar-hospital-south-east",
      profile: createRoadProfile("two-way-1"),
    },
  );

  // The civic park is a complete block: four local streets surround it and
  // connect back into both arterial boundaries. All four authored park gates
  // therefore open directly to a sidewalk rather than an empty superblock.
  nodes.push(
    { id: "cedar-park-north-west-main", x: 0, z: PARK_LOCAL_NORTH_Z },
    { id: "cedar-park-north-east-main", x: 1000, z: PARK_LOCAL_NORTH_Z },
    { id: "cedar-park-south-west-main", x: 0, z: PARK_LOCAL_SOUTH_Z },
    { id: "cedar-park-south-east-main", x: 1000, z: PARK_LOCAL_SOUTH_Z },
    { id: "cedar-park-west-north", x: PARK_LOCAL_WEST_X, z: -380 },
    { id: "cedar-park-west-south", x: PARK_LOCAL_WEST_X, z: -60 },
    { id: "cedar-park-east-north", x: PARK_LOCAL_EAST_X, z: -380 },
    { id: "cedar-park-east-south", x: PARK_LOCAL_EAST_X, z: -60 },
  );
  edges.push(
    {
      id: "cedar-park-north-street",
      a: "cedar-park-north-west-main",
      b: "cedar-park-north-east-main",
      profile: createRoadProfile("two-way-1"),
    },
    {
      id: "cedar-park-south-street",
      a: "cedar-park-south-west-main",
      b: "cedar-park-south-east-main",
      profile: createRoadProfile("two-way-1"),
    },
    {
      id: "cedar-park-west-avenue",
      a: "cedar-park-west-north",
      b: "cedar-park-west-south",
      profile: createRoadProfile("two-way-1"),
    },
    {
      id: "cedar-park-east-avenue",
      a: "cedar-park-east-north",
      b: "cedar-park-east-south",
      profile: createRoadProfile("two-way-1"),
    },
  );
  return splitRoadGraphAtIntersections({ nodes, edges, intersectionOverrides });
}

function footprint(catalogId: string, yaw: Yaw90) {
  const entry = getCatalogEntry(catalogId);
  if (!entry) throw new TypeError(`unknown Cedar Crossing catalog entry: ${catalogId}`);
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return yaw === 90 || yaw === 270 ? { w: base.d, d: base.w } : base;
}

function atCenter(
  id: string,
  catalogId: string,
  x: number,
  z: number,
  yaw: Yaw90 = 0,
): GridPlacement {
  const size = footprint(catalogId, yaw);
  const i = x - CITY_TILE_ORIGIN_X - size.w * 0.5;
  const j = z - CITY_TILE_ORIGIN_Z - size.d * 0.5;
  if (!Number.isInteger(i * 2) || !Number.isInteger(j * 2)) {
    throw new TypeError(`placement ${id} does not align to the half-tile editor grid`);
  }
  return { id, catalogId, poseKind: "grid", i, j, yaw };
}

function horizontalRoadHalfWidth(roadZ: number) {
  const zIndex = ROAD_Z.indexOf(roadZ as typeof ROAD_Z[number]);
  if (zIndex < 0) throw new TypeError(`unknown Cedar Crossing horizontal road: ${roadZ}`);
  return corridorMeters({ profile: createRoadProfile(horizontalPreset(zIndex)) }) * 0.5;
}

function atNorthSideOfRoad(id: string, catalogId: string, x: number, roadZ: number) {
  const size = footprint(catalogId, 0);
  return atCenter(
    id,
    catalogId,
    x,
    roadZ - horizontalRoadHalfWidth(roadZ) - SITE_TO_SIDEWALK_GAP_METERS - size.d * 0.5,
  );
}

function atSouthSideOfRoad(id: string, catalogId: string, x: number, roadZ: number) {
  const size = footprint(catalogId, 180);
  return atCenter(
    id,
    catalogId,
    x,
    roadZ + horizontalRoadHalfWidth(roadZ) + SITE_TO_SIDEWALK_GAP_METERS + size.d * 0.5,
    180,
  );
}

function createScenePlacements() {
  return [
    // INDUSTRIAL BLOCK · three complete editor factories share one block and
    // line their public gates along the same southern sidewalk.
    atNorthSideOfRoad("cedar-industrial-technology", "technology-park", -805, -700),
    atNorthSideOfRoad("cedar-industrial-food", "food-processing-plant", -535, -700),
    atNorthSideOfRoad("cedar-industrial-mechanized", "mechanized-factory", -245, -700),

    // PUBLIC-SERVICE BLOCK · exactly one fire station serves the surrounding
    // hospital, school and sports blocks. Every main gate touches the arterial
    // sidewalk; the hospital's other two gates touch its local streets.
    atNorthSideOfRoad("cedar-public-hospital", "hospital-campus", 100, -700),
    atNorthSideOfRoad("cedar-public-fire", "fire-station", 270, -700),
    atNorthSideOfRoad("cedar-public-school", "school-campus", 465, -700),
    atNorthSideOfRoad("cedar-public-sports", "sports-center", 760, -700),

    // RESIDENTIAL BLOCK · the three editor community families form one
    // neighbourhood rather than being scattered across unrelated blocks.
    atNorthSideOfRoad("cedar-residential-standard", "standard-residential-community", -820, -380),
    atNorthSideOfRoad("cedar-residential-luxury", "luxury-villa-community", -520, -380),
    atNorthSideOfRoad("cedar-residential-complete", "residential-community", -240, -380),

    // MIXED COMMERCIAL BLOCK · a shopping centre and a larger standard
    // community share one perimeter road and one continuous public sidewalk.
    atNorthSideOfRoad("cedar-commerce-mall", "shopping-mall", 220, -380),
    atNorthSideOfRoad("cedar-commerce-community", "standard-residential-community-5-rows", 520, -380),

    // CIVIC BLOCK · the west entrance of the city centre is also one metre from
    // the west avenue, while its primary entrance faces the southern boulevard.
    atNorthSideOfRoad("cedar-civic-centre", "city-center", -879, -60),

    // PARK BLOCK · the four exact local street coordinates above are derived
    // from this site's 185×140m editor footprint plus 15m road half-width.
    atCenter("cedar-civic-park", "city-park", 500, -220),

  ];
}

function createNeighbourhoodPlacements() {
  const placements: GridPlacement[] = [];
  const columns = [-900, -730, -560, -390, -220, 150, 330, 730, 900] as const;
  const types = [
    "residential-building",
    "high-rise-residential",
    "office-campus",
    "small-villa",
  ] as const;
  // Two opposed street walls use the same front-direction rule as hand-placed
  // editor buildings: the northern row faces south, the southern row faces
  // north, and both sit one metre behind their sidewalk.
  for (const [column, x] of columns.entries()) {
    const northType = types[column % types.length];
    const southType = types[(column + 2) % types.length];
    placements.push(atNorthSideOfRoad(`cedar-urban-north-${column}`, northType, x, 280));
    placements.push(atSouthSideOfRoad(`cedar-urban-south-${column}`, southType, x, -60));
  }
  return placements;
}

function createStreetPlacements() {
  const placements: GridPlacement[] = [];
  // Every main east-west block receives editor-native lamps and trees inside
  // the actual sidewalk band. Offsets remain far from zebra crossings.
  for (let zIndex = 0; zIndex < ROAD_Z.length; zIndex += 1) {
    const z = ROAD_Z[zIndex];
    const halfCorridor = horizontalRoadHalfWidth(z);
    for (let xIndex = 0; xIndex < ROAD_X.length - 1; xIndex += 1) {
      const start = ROAD_X[xIndex];
      for (const [offsetIndex, x] of [start + 120, start + 880].entries()) {
        placements.push(atCenter(
          `cedar-lamp-${zIndex}-${xIndex}-${offsetIndex}`,
          "street-light",
          x,
          z - halfCorridor + 2,
        ));
        placements.push(atCenter(
          `cedar-tree-${zIndex}-${xIndex}-${offsetIndex}`,
          "street-tree",
          x,
          z + halfCorridor - 2,
        ));
      }
    }
  }

  // North-south avenues remain lit as well; each fixture sits two metres in
  // from the outer sidewalk edge and never touches a junction platform.
  for (const [avenue, x] of ROAD_X.entries()) {
    const halfCorridor = corridorMeters({ profile: createRoadProfile(verticalPreset(avenue)) }) * 0.5;
    for (const [lamp, z] of [-900, -540, -220, 120, 440, 710].entries()) {
      placements.push(atCenter(`cedar-avenue-lamp-${avenue}-${lamp}`, "street-light", x + halfCorridor - 2, z, 90));
    }
  }

  // The northern promenade carries the smaller editor decorations requested
  // for active sidewalks, plus park lights and long planting beds.
  for (const [index, x] of [-940, -500, 500, 940].entries()) {
    placements.push(atCenter(`cedar-park-light-${index}`, "park-street-light", x, 807));
  }
  for (const [index, x] of [-900, -540, 540, 900].entries()) {
    placements.push(atCenter(`cedar-planter-${index}`, "roadside-planter", x, 807));
  }
  const marketClusters = [
    [-820, -760, -700, -640],
    [160, 220, 280, 340],
    [660, 720, 780, 840],
  ] as const;
  const marketCatalogIds = ["food-truck", "hot-dog-kiosk", "newsstand", "phone-booth"] as const;
  for (const [cluster, xs] of marketClusters.entries()) {
    for (const [fixture, catalogId] of marketCatalogIds.entries()) {
      placements.push(atCenter(`cedar-market-${cluster}-${fixture}`, catalogId, xs[fixture], 833));
    }
  }
  return placements;
}

/**
 * A deterministic, editor-native showcase city. Every object is a regular
 * grid placement and every road uses the same graph/profile DTOs as user edits.
 */
export function createCedarCrossingDocument(): CityMapDocumentSnapshot {
  const graph = createCedarRoadGraph();
  const placements = [
    ...createScenePlacements(),
    ...createNeighbourhoodPlacements(),
    ...createStreetPlacements(),
  ];
  const roadOnly: CityMapDocument = {
    schemaVersion: CITY_DOCUMENT_SCHEMA_VERSION,
    catalogSchemaVersion: CITY_CATALOG_SCHEMA_VERSION,
    tileSizeMeters: 1,
    spawn: { x: 0, z: 520, heading: Math.PI },
    graph,
    placements: [],
    flags: {
      needTrafficLights: true,
      lampHeightScale: 1.32,
      signalHeightScale: 1.25,
    },
  };
  const roadSnapshot = parseCityMapDocument(roadOnly).document;
  // This is the same sequential occupancy check used by add/duplicate tools.
  for (const placement of placements) {
    try {
      assertGridPlacementsAllowed(roadSnapshot, [placement]);
    } catch (error) {
      throw new TypeError(`Cedar Crossing placement ${placement.id} is invalid`, { cause: error });
    }
  }
  assertGridPlacementsAllowed(roadSnapshot, placements);
  const parsed = parseCityMapDocument({ ...roadOnly, placements });
  if (parsed.catalogMisses.length > 0) {
    throw new TypeError(`Cedar Crossing contains unknown catalog entries: ${parsed.catalogMisses.join(", ")}`);
  }
  return parsed.document;
}
