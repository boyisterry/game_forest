import type {
  PackedExplicitBoundarySource,
  RoadSurfaceHandleRecord,
  SurfaceTransitionProfile,
} from "./cityCollisionTypes.ts";

export type RoadPresetId = "one-way-1" | "two-way-1" | "two-way-2" | "two-way-3";
export type SidewalkWidthTier = "narrow" | "medium" | "wide";

/** Per-side sidewalk widths used by the road brush. Existing roads use medium. */
export const SIDEWALK_WIDTH_METERS: Readonly<Record<SidewalkWidthTier, number>> = Object.freeze({
  narrow: 4,
  medium: 8,
  wide: 12,
});

export type RoadSideProfile = {
  bikeLaneWidth: number;
  bikeBufferWidth: number;
  parkingWidth: number;
  sidewalkWidth: number;
  vergeWidth: number;
};

export type RoadCrossSection = {
  lanesAToB: number;
  lanesBToA: number;
  laneWidth: number;
  medianWidth: number;
  left: RoadSideProfile;
  right: RoadSideProfile;
};

export type RoadProfile =
  | { source: "preset"; presetId: RoadPresetId; crossSection: RoadCrossSection }
  | { source: "frozen-import"; crossSection: RoadCrossSection };

export type RoadNode = { id: string; x: number; z: number };

export type RoadEdge = {
  id: string;
  a: string;
  b: string;
  profile: RoadProfile;
};

export type IntersectionOverride = {
  needTrafficLights?: boolean;
};

export type CityRoadGraph = {
  nodes: RoadNode[];
  edges: RoadEdge[];
  intersectionOverrides: Record<string, IntersectionOverride>;
};

/** Public DTOs PR4 produces for the collision compiler. */
export type RoadCollisionCompileDto = Readonly<{
  transitions: readonly SurfaceTransitionProfile[];
  surfaceHandles: readonly RoadSurfaceHandleRecord[];
  boundaries: PackedExplicitBoundarySource;
}>;

export const ROAD_AXIS_EPSILON_METERS = 1e-4;
export const ROAD_MERGE_SLOP_METERS = 0.9;

const EMPTY_SIDE: Readonly<RoadSideProfile> = Object.freeze({
  bikeLaneWidth: 0,
  bikeBufferWidth: 0,
  parkingWidth: 0,
  sidewalkWidth: 0,
  vergeWidth: 0,
});

const BIKE_SIDE: Readonly<RoadSideProfile> = Object.freeze({
  bikeLaneWidth: 3,
  bikeBufferWidth: 1,
  parkingWidth: 0,
  sidewalkWidth: 8,
  vergeWidth: 0,
});

function copySide(side: Readonly<RoadSideProfile>): RoadSideProfile {
  return { ...side };
}

function makePreset(lanesAToB: number, lanesBToA: number, oneWay = false): RoadCrossSection {
  return {
    lanesAToB,
    lanesBToA,
    laneWidth: 3,
    medianWidth: 0,
    left: copySide(oneWay ? EMPTY_SIDE : BIKE_SIDE),
    right: copySide(BIKE_SIDE),
  };
}

export const ROAD_PRESET_CROSS_SECTIONS: Readonly<Record<RoadPresetId, Readonly<RoadCrossSection>>> =
  Object.freeze({
    "one-way-1": Object.freeze(makePreset(1, 0, true)),
    "two-way-1": Object.freeze(makePreset(1, 1)),
    "two-way-2": Object.freeze(makePreset(2, 2)),
    "two-way-3": Object.freeze(makePreset(3, 3)),
  });

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number`);
  }
}

function assertLaneCount(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 12) {
    throw new TypeError(`${label} must be an integer between 0 and 12`);
  }
}

export function createRoadProfile(
  presetId: RoadPresetId,
  sidewalkWidthTier: SidewalkWidthTier = "medium",
): RoadProfile {
  const preset = ROAD_PRESET_CROSS_SECTIONS[presetId];
  if (!preset) throw new TypeError(`unknown road preset: ${presetId}`);
  const sidewalkWidth = SIDEWALK_WIDTH_METERS[sidewalkWidthTier];
  if (sidewalkWidth === undefined) throw new TypeError(`unknown sidewalk width tier: ${sidewalkWidthTier}`);
  const left = copySide(preset.left);
  const right = copySide(preset.right);
  // A width tier adjusts only sidewalks that exist in the preset. In particular,
  // the facility-free side of the one-way preset stays facility-free.
  if (left.sidewalkWidth > 0) left.sidewalkWidth = sidewalkWidth;
  if (right.sidewalkWidth > 0) right.sidewalkWidth = sidewalkWidth;
  return {
    source: "preset",
    presetId,
    crossSection: {
      ...preset,
      left,
      right,
    },
  };
}

export function sideWidth(side: Readonly<RoadSideProfile>): number {
  return side.bikeLaneWidth
    + side.bikeBufferWidth
    + side.parkingWidth
    + side.sidewalkWidth
    + side.vergeWidth;
}

export function corridorMeters(edge: Pick<RoadEdge, "profile">): number {
  const crossSection = edge.profile.crossSection;
  return sideWidth(crossSection.left)
    + (crossSection.lanesAToB + crossSection.lanesBToA) * crossSection.laneWidth
    + crossSection.medianWidth
    + sideWidth(crossSection.right);
}

export function isAxisAlignedRoad(
  a: Pick<RoadNode, "x" | "z">,
  b: Pick<RoadNode, "x" | "z">,
): boolean {
  return Math.abs(a.x - b.x) <= ROAD_AXIS_EPSILON_METERS
    || Math.abs(a.z - b.z) <= ROAD_AXIS_EPSILON_METERS;
}

export function reverseRoadEdgeRepresentation(edge: Readonly<RoadEdge>): RoadEdge {
  const crossSection = edge.profile.crossSection;
  return {
    ...edge,
    a: edge.b,
    b: edge.a,
    profile: {
      ...edge.profile,
      crossSection: {
        ...crossSection,
        lanesAToB: crossSection.lanesBToA,
        lanesBToA: crossSection.lanesAToB,
        left: copySide(crossSection.right),
        right: copySide(crossSection.left),
      },
    },
  };
}

export function reverseRoadTraffic(edge: Readonly<RoadEdge>): RoadEdge {
  const crossSection = edge.profile.crossSection;
  return {
    ...edge,
    profile: {
      ...edge.profile,
      crossSection: {
        ...crossSection,
        lanesAToB: crossSection.lanesBToA,
        lanesBToA: crossSection.lanesAToB,
        left: copySide(crossSection.left),
        right: copySide(crossSection.right),
      },
    },
  };
}

export function mirrorRoadFacilities(edge: Readonly<RoadEdge>): RoadEdge {
  const crossSection = edge.profile.crossSection;
  return {
    ...edge,
    profile: {
      ...edge.profile,
      crossSection: {
        ...crossSection,
        left: copySide(crossSection.right),
        right: copySide(crossSection.left),
      },
    },
  };
}

export function validateRoadCrossSection(crossSection: Readonly<RoadCrossSection>, label = "road") {
  assertLaneCount(crossSection.lanesAToB, `${label}.lanesAToB`);
  assertLaneCount(crossSection.lanesBToA, `${label}.lanesBToA`);
  if (crossSection.lanesAToB + crossSection.lanesBToA === 0) {
    throw new TypeError(`${label} must contain at least one travel lane`);
  }
  assertFiniteNonNegative(crossSection.laneWidth, `${label}.laneWidth`);
  if (crossSection.laneWidth <= 0) throw new TypeError(`${label}.laneWidth must be greater than zero`);
  assertFiniteNonNegative(crossSection.medianWidth, `${label}.medianWidth`);
  for (const sideName of ["left", "right"] as const) {
    const side = crossSection[sideName];
    for (const key of ["bikeLaneWidth", "bikeBufferWidth", "parkingWidth", "sidewalkWidth", "vergeWidth"] as const) {
      assertFiniteNonNegative(side[key], `${label}.${sideName}.${key}`);
    }
  }
}

export function validateCityRoadGraph(graph: Readonly<CityRoadGraph>): void {
  const nodes = new Map<string, Readonly<RoadNode>>();
  for (const node of graph.nodes) {
    if (!node.id || nodes.has(node.id)) throw new TypeError(`duplicate or empty road node id: ${node.id}`);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.z)) {
      throw new TypeError(`road node ${node.id} coordinates must be finite`);
    }
    nodes.set(node.id, node);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id || edgeIds.has(edge.id)) throw new TypeError(`duplicate or empty road edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (edge.a === edge.b) throw new TypeError(`road edge ${edge.id} has identical endpoints`);
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) throw new TypeError(`road edge ${edge.id} references a missing node`);
    if (!isAxisAlignedRoad(a, b)) throw new TypeError(`road edge ${edge.id} must be axis aligned`);
    if (Math.hypot(a.x - b.x, a.z - b.z) <= ROAD_AXIS_EPSILON_METERS) {
      throw new TypeError(`road edge ${edge.id} has zero length`);
    }
    validateRoadCrossSection(edge.profile.crossSection, `road edge ${edge.id}`);
    if (edge.profile.source === "preset" && !ROAD_PRESET_CROSS_SECTIONS[edge.profile.presetId]) {
      throw new TypeError(`road edge ${edge.id} has an unknown preset`);
    }
  }

  for (const nodeId of Object.keys(graph.intersectionOverrides)) {
    if (!nodes.has(nodeId)) throw new TypeError(`intersection override references missing node ${nodeId}`);
  }
}
