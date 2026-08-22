import {
  BUILTIN_SURFACE_TRANSITIONS,
  CURB_HEIGHT_METERS,
  canonicalTupleKey,
} from "./cityCollisionTypes.ts";
import type { PackedExplicitBoundarySource, RoadSurfaceHandleRecord } from "./cityCollisionTypes.ts";
import {
  ROAD_AXIS_EPSILON_METERS,
  corridorMeters,
  sideWidth,
  validateCityRoadGraph,
} from "./cityRoadGraph.ts";
import type {
  CityRoadGraph,
  RoadCrossSection,
  RoadEdge,
  RoadNode,
  RoadSideProfile,
} from "./cityRoadGraph.ts";
import { rasterizeWorldAabb2d } from "./cityTiles.ts";
import type { TileRect } from "./cityTiles.ts";

export type RoadCorridorAabb = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>;

export type DerivedRoadSurface = Readonly<{
  edgeId: string;
  side: "center" | "left" | "right" | "junction";
  surfaceProfileId: "asphalt" | "bike-lane" | "sidewalk" | "driveway";
  localSurfaceKey: number;
  roadSurfaceId: string;
  y: number;
  /** Optional per-corner heights matching quadXZ; absent means a flat `y`. */
  cornerY?: readonly [number, number, number, number];
  quadXZ: readonly [
    axLeft: number,
    azLeft: number,
    axRight: number,
    azRight: number,
    bxRight: number,
    bzRight: number,
    bxLeft: number,
    bzLeft: number,
  ];
}>;

export type DerivedRoadBoundary = Readonly<{
  edgeId: string;
  side: "left" | "right" | "junction";
  curbRun: number;
  groupKey: number;
  transitionProfileId: "road-curb";
  segmentXZ: readonly [ax: number, az: number, bx: number, bz: number];
  leftSurfaceKey: number;
  rightSurfaceKey: number;
}>;

export type DerivedCurbRamp = Readonly<{
  nodeId: string;
  approachEdgeId: string;
  side: "left" | "right";
  transitionProfileId: "smooth";
  lengthMeters: 4.2;
}>;

export type DerivedRoadCrosswalk = Readonly<{
  nodeId: string;
  approachEdgeId: string;
  centerX: number;
  centerZ: number;
  directionX: number;
  directionZ: number;
  widthMeters: number;
  depthMeters: number;
  stripeCount: number;
}>;

export type DerivedRoadMarking = Readonly<{
  edgeId: string;
  kind: "double-center" | "motor-lane-divider" | "bike-lane-boundary" | "road-edge";
  color: "white" | "yellow";
  widthMeters: number;
  segmentXZ: readonly [ax: number, az: number, bx: number, bz: number];
  dashLengthMeters?: number;
  dashGapMeters?: number;
}>;

export type DerivedBikeLaneArrow = Readonly<{
  edgeId: string;
  side: "left" | "right";
  x: number;
  z: number;
  directionX: number;
  directionZ: number;
}>;

export type DerivedRoadCollisionSources = Readonly<{
  surfaces: readonly DerivedRoadSurface[];
  boundaries: readonly DerivedRoadBoundary[];
  ramps: readonly DerivedCurbRamp[];
  /** Visual-only zebra crossings. They never contribute collision geometry. */
  crosswalks: readonly DerivedRoadCrosswalk[];
  /** Visual-only longitudinal lane paint, already trimmed around junctions. */
  markings: readonly DerivedRoadMarking[];
  /** Visual-only directional symbols centred in the bicycle lane. */
  bikeLaneArrows: readonly DerivedBikeLaneArrow[];
  surfaceHandles: readonly RoadSurfaceHandleRecord[];
  packedBoundaries: PackedExplicitBoundarySource;
}>;

type DirectionFrame = Readonly<{
  dx: number;
  dz: number;
  leftX: number;
  leftZ: number;
  length: number;
}>;

type CardinalDirection = "north" | "east" | "south" | "west";
type JunctionSidewalkPlan = Readonly<{
  nodeId: string;
  identity: string;
  variant: string;
  firstEdgeId: string;
  firstDirection: CardinalDirection;
  firstSide: CardinalDirection;
  secondEdgeId: string;
  secondDirection: CardinalDirection;
  secondSide: CardinalDirection;
}>;

const ROAD_CURB_TRANSITION_INDEX = BUILTIN_SURFACE_TRANSITIONS.findIndex((profile) => profile.id === "road-curb");
export const ROAD_CROSSWALK_DEPTH_METERS = 4.2;
export const ROAD_CROSSWALK_INNER_GAP_METERS = 0.8;

function nodeMap(graph: Readonly<CityRoadGraph>) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function frame(a: Readonly<RoadNode>, b: Readonly<RoadNode>): DirectionFrame {
  const rawX = b.x - a.x;
  const rawZ = b.z - a.z;
  const length = Math.hypot(rawX, rawZ);
  if (length <= ROAD_AXIS_EPSILON_METERS) throw new TypeError("road edge has zero length");
  const dx = rawX / length;
  const dz = rawZ / length;
  // x points east and +z points south, so a direction's visual left is (dz,-dx).
  return { dx, dz, leftX: dz, leftZ: -dx, length };
}

function fnv1a32(text: string) {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableUint32Ids(keys: readonly string[]) {
  const used = new Set<number>([0xfffffffe, 0xffffffff]);
  const output = new Map<string, number>();
  for (const key of [...new Set(keys)].sort()) {
    let candidate = fnv1a32(key);
    while (used.has(candidate)) candidate = (candidate + 1) >>> 0;
    used.add(candidate);
    output.set(key, candidate);
  }
  return output;
}

function edgeEndpoints(edge: Readonly<RoadEdge>, nodes: ReadonlyMap<string, Readonly<RoadNode>>) {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) throw new TypeError(`edge ${edge.id} references a missing node`);
  return { a, b };
}

function outwardCardinalDirection(
  edge: Readonly<RoadEdge>,
  nodeId: string,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): CardinalDirection | null {
  const node = nodes.get(nodeId);
  const other = nodes.get(edge.a === nodeId ? edge.b : edge.a);
  if (!node || !other) return null;
  const dx = other.x - node.x;
  const dz = other.z - node.z;
  if (Math.abs(dx) > ROAD_AXIS_EPSILON_METERS && Math.abs(dz) <= ROAD_AXIS_EPSILON_METERS) {
    return dx > 0 ? "east" : "west";
  }
  if (Math.abs(dz) > ROAD_AXIS_EPSILON_METERS && Math.abs(dx) <= ROAD_AXIS_EPSILON_METERS) {
    return dz > 0 ? "south" : "north";
  }
  return null;
}

function deriveJunctionSidewalkPlans(
  incident: ReadonlyMap<string, readonly Readonly<RoadEdge>[]>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): readonly JunctionSidewalkPlan[] {
  const plans: JunctionSidewalkPlan[] = [];
  const corners = [
    ["north-east", "north", "east", "east", "north"],
    ["south-east", "south", "east", "east", "south"],
    ["south-west", "south", "west", "west", "south"],
    ["north-west", "north", "west", "west", "north"],
  ] as const satisfies readonly (readonly [
    string,
    CardinalDirection,
    CardinalDirection,
    CardinalDirection,
    CardinalDirection,
  ])[];
  const oppositeBridges = {
    north: ["north-bridge", "west", "east", "north", "north"],
    east: ["east-bridge", "north", "south", "east", "east"],
    south: ["south-bridge", "west", "east", "south", "south"],
    west: ["west-bridge", "north", "south", "west", "west"],
  } as const satisfies Readonly<Record<CardinalDirection, readonly [
    string,
    CardinalDirection,
    CardinalDirection,
    CardinalDirection,
    CardinalDirection,
  ]>>;

  for (const [nodeId, rawEdges] of [...incident].sort(([left], [right]) => left.localeCompare(right))) {
    const byDirection = new Map<CardinalDirection, Readonly<RoadEdge>>();
    for (const edge of [...rawEdges].sort((left, right) => left.id.localeCompare(right.id))) {
      const direction = outwardCardinalDirection(edge, nodeId, nodes);
      if (direction && !byDirection.has(direction)) byDirection.set(direction, edge);
    }
    if (byDirection.size < 3) continue;

    const append = (
      variant: string,
      firstDirection: CardinalDirection,
      secondDirection: CardinalDirection,
      firstSide: CardinalDirection,
      secondSide: CardinalDirection,
    ) => {
      const first = byDirection.get(firstDirection);
      const second = byDirection.get(secondDirection);
      if (!first || !second) return;
      plans.push(Object.freeze({
        nodeId,
        identity: canonicalTupleKey(["road-surface", "junction-sidewalk", nodeId, variant]),
        variant,
        firstEdgeId: first.id,
        firstDirection,
        firstSide,
        secondEdgeId: second.id,
        secondDirection,
        secondSide,
      }));
    };

    for (const [variant, firstDirection, secondDirection, firstSide, secondSide] of corners) {
      append(variant, firstDirection, secondDirection, firstSide, secondSide);
    }
    if (byDirection.size === 3) {
      const missing = (["north", "east", "south", "west"] as const)
        .find((direction) => !byDirection.has(direction));
      if (missing) append(...oppositeBridges[missing]);
    }
  }
  return Object.freeze(plans);
}

function endpointSegmentAtNode(
  surface: Readonly<DerivedRoadSurface>,
  edge: Readonly<RoadEdge>,
  nodeId: string,
) {
  const offset = edge.a === nodeId ? 0 : 4;
  return Object.freeze([
    surface.quadXZ[offset],
    surface.quadXZ[offset + 1],
    surface.quadXZ[offset + 2],
    surface.quadXZ[offset + 3],
  ] as const);
}

function endpointWorldSide(
  segment: readonly [number, number, number, number],
  node: Readonly<RoadNode>,
  direction: CardinalDirection,
): CardinalDirection {
  const midpointX = (segment[0] + segment[2]) * 0.5;
  const midpointZ = (segment[1] + segment[3]) * 0.5;
  if (direction === "north" || direction === "south") return midpointX < node.x ? "west" : "east";
  return midpointZ < node.z ? "north" : "south";
}

function junctionQuadFromSegments(
  first: readonly [number, number, number, number],
  second: readonly [number, number, number, number],
): DerivedRoadSurface["quadXZ"] | null {
  const xs = [first[0], first[2], second[0], second[2]];
  const zs = [first[1], first[3], second[1], second[3]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  if (maxX - minX <= ROAD_AXIS_EPSILON_METERS || maxZ - minZ <= ROAD_AXIS_EPSILON_METERS) return null;
  return Object.freeze([minX, minZ, maxX, minZ, maxX, maxZ, minX, maxZ] as const);
}

type JunctionPoint = Readonly<{ x: number; z: number }>;

function endpointInnerOuter(
  segment: readonly [number, number, number, number],
  node: Readonly<RoadNode>,
) {
  const first = Object.freeze({ x: segment[0], z: segment[1] });
  const second = Object.freeze({ x: segment[2], z: segment[3] });
  const firstDistance = Math.hypot(first.x - node.x, first.z - node.z);
  const secondDistance = Math.hypot(second.x - node.x, second.z - node.z);
  return firstDistance <= secondDistance
    ? Object.freeze({ inner: first, outer: second })
    : Object.freeze({ inner: second, outer: first });
}

function orthogonalCorner(
  first: JunctionPoint,
  second: JunctionPoint,
  node: Readonly<RoadNode>,
  preferNear: boolean,
) {
  const candidates = [
    Object.freeze({ x: first.x, z: second.z }),
    Object.freeze({ x: second.x, z: first.z }),
  ];
  return [...candidates].sort((left, right) => {
    const leftDistance = Math.hypot(left.x - node.x, left.z - node.z);
    const rightDistance = Math.hypot(right.x - node.x, right.z - node.z);
    return preferNear ? leftDistance - rightDistance : rightDistance - leftDistance;
  })[0];
}

function junctionBoundaryIdentity(plan: Readonly<JunctionSidewalkPlan>, curbRun: number) {
  return canonicalTupleKey(["road-boundary", "junction", plan.nodeId, plan.variant, curbRun]);
}

export function corridorWorldAabb(
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): RoadCorridorAabb {
  const { a, b } = edgeEndpoints(edge, nodes);
  const halfWidth = corridorMeters(edge) * 0.5;
  const horizontal = Math.abs(a.z - b.z) <= ROAD_AXIS_EPSILON_METERS;
  return Object.freeze({
    minX: Math.min(a.x, b.x) - (horizontal ? 0 : halfWidth),
    minZ: Math.min(a.z, b.z) - (horizontal ? halfWidth : 0),
    maxX: Math.max(a.x, b.x) + (horizontal ? 0 : halfWidth),
    maxZ: Math.max(a.z, b.z) + (horizontal ? halfWidth : 0),
  });
}

export function rasterRoadCorridor(
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): TileRect {
  const bounds = corridorWorldAabb(edge, nodes);
  return rasterizeWorldAabb2d(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
}

function intersectionPoint(
  edgeA: Readonly<RoadEdge>,
  edgeB: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): Readonly<{ x: number; z: number }> | null {
  const first = edgeEndpoints(edgeA, nodes);
  const second = edgeEndpoints(edgeB, nodes);
  const firstHorizontal = Math.abs(first.a.z - first.b.z) <= ROAD_AXIS_EPSILON_METERS;
  const secondHorizontal = Math.abs(second.a.z - second.b.z) <= ROAD_AXIS_EPSILON_METERS;
  if (firstHorizontal === secondHorizontal) return null;
  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;
  const x = vertical.a.x;
  const z = horizontal.a.z;
  const inHorizontal = x >= Math.min(horizontal.a.x, horizontal.b.x) - ROAD_AXIS_EPSILON_METERS
    && x <= Math.max(horizontal.a.x, horizontal.b.x) + ROAD_AXIS_EPSILON_METERS;
  const inVertical = z >= Math.min(vertical.a.z, vertical.b.z) - ROAD_AXIS_EPSILON_METERS
    && z <= Math.max(vertical.a.z, vertical.b.z) + ROAD_AXIS_EPSILON_METERS;
  return inHorizontal && inVertical ? Object.freeze({ x, z }) : null;
}

/** Split geometric crossings into graph nodes without changing a/b traffic semantics. */
export function splitRoadGraphAtIntersections(graph: Readonly<CityRoadGraph>): CityRoadGraph {
  validateCityRoadGraph(graph);
  const nodes = nodeMap(graph);
  const cuts = new Map<string, Array<{ t: number; nodeId: string }>>();
  for (const edge of graph.edges) cuts.set(edge.id, []);

  const findOrCreateNode = (x: number, z: number) => {
    const existing = [...nodes.values()].find((node) =>
      Math.abs(node.x - x) <= ROAD_AXIS_EPSILON_METERS
      && Math.abs(node.z - z) <= ROAD_AXIS_EPSILON_METERS);
    if (existing) return existing.id;
    const id = canonicalTupleKey(["road-node", `x:${x}`, `z:${z}`]);
    const node = { id, x, z };
    nodes.set(id, node);
    return id;
  };

  for (let firstIndex = 0; firstIndex < graph.edges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < graph.edges.length; secondIndex += 1) {
      const firstEdge = graph.edges[firstIndex];
      const secondEdge = graph.edges[secondIndex];
      const point = intersectionPoint(firstEdge, secondEdge, nodes);
      if (!point) continue;
      const nodeId = findOrCreateNode(point.x, point.z);
      for (const edge of [firstEdge, secondEdge]) {
        const endpoints = edgeEndpoints(edge, nodes);
        const length = Math.hypot(endpoints.b.x - endpoints.a.x, endpoints.b.z - endpoints.a.z);
        const t = Math.hypot(point.x - endpoints.a.x, point.z - endpoints.a.z) / length;
        if (t > ROAD_AXIS_EPSILON_METERS && t < 1 - ROAD_AXIS_EPSILON_METERS) {
          cuts.get(edge.id)!.push({ t, nodeId });
        }
      }
    }
  }

  const edges: RoadEdge[] = [];
  for (const edge of graph.edges) {
    const interior = cuts.get(edge.id)!
      .sort((left, right) => left.t - right.t || left.nodeId.localeCompare(right.nodeId))
      .filter((cut, index, list) => index === 0 || cut.nodeId !== list[index - 1].nodeId);
    const chain = [edge.a, ...interior.map((cut) => cut.nodeId), edge.b];
    for (let index = 0; index < chain.length - 1; index += 1) {
      edges.push({
        ...structuredClone(edge),
        id: chain.length === 2 ? edge.id : canonicalTupleKey(["road-edge-split", edge.id, index]),
        a: chain[index],
        b: chain[index + 1],
      });
    }
  }
  const output = {
    nodes: [...nodes.values()].map((node) => ({ ...node })),
    edges,
    intersectionOverrides: structuredClone(graph.intersectionOverrides),
  };
  validateCityRoadGraph(output);
  return output;
}

function sideComponentOffsets(crossSection: Readonly<RoadCrossSection>, side: "left" | "right") {
  const centerHalf = ((crossSection.lanesAToB + crossSection.lanesBToA) * crossSection.laneWidth
    + crossSection.medianWidth) * 0.5;
  const profile = crossSection[side];
  const beforeSidewalk = profile.bikeLaneWidth + profile.bikeBufferWidth + profile.parkingWidth;
  return {
    profile,
    innerBike: centerHalf,
    outerBike: centerHalf + beforeSidewalk,
    innerSidewalk: centerHalf + beforeSidewalk,
    outerSidewalk: centerHalf + beforeSidewalk + profile.sidewalkWidth,
  };
}

function quad(
  a: Readonly<RoadNode>,
  b: Readonly<RoadNode>,
  roadFrame: DirectionFrame,
  leftOffset: number,
  rightOffset: number,
): DerivedRoadSurface["quadXZ"] {
  return Object.freeze([
    a.x + roadFrame.leftX * leftOffset,
    a.z + roadFrame.leftZ * leftOffset,
    a.x + roadFrame.leftX * rightOffset,
    a.z + roadFrame.leftZ * rightOffset,
    b.x + roadFrame.leftX * rightOffset,
    b.z + roadFrame.leftZ * rightOffset,
    b.x + roadFrame.leftX * leftOffset,
    b.z + roadFrame.leftZ * leftOffset,
  ]);
}

function insetEndpoint(
  node: Readonly<RoadNode>,
  roadFrame: DirectionFrame,
  distance: number,
  fromStart: boolean,
): RoadNode {
  const sign = fromStart ? 1 : -1;
  return {
    id: node.id,
    x: node.x + roadFrame.dx * distance * sign,
    z: node.z + roadFrame.dz * distance * sign,
  };
}

function segmentAtOffset(
  a: Readonly<RoadNode>,
  b: Readonly<RoadNode>,
  roadFrame: DirectionFrame,
  offset: number,
): DerivedRoadMarking["segmentXZ"] {
  return Object.freeze([
    a.x + roadFrame.leftX * offset,
    a.z + roadFrame.leftZ * offset,
    b.x + roadFrame.leftX * offset,
    b.z + roadFrame.leftZ * offset,
  ] as const);
}

function junctionRoadExtent(
  edge: Readonly<RoadEdge>,
  nodeId: string,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
  incident: ReadonlyMap<string, readonly Readonly<RoadEdge>[]>,
) {
  const edges = incident.get(nodeId) ?? [];
  if (edges.length < 3) return 0;
  const endpoints = edgeEndpoints(edge, nodes);
  const current = frame(endpoints.a, endpoints.b);
  let extent = 0;
  for (const other of edges) {
    if (other.id === edge.id) continue;
    const otherEndpoints = edgeEndpoints(other, nodes);
    const otherFrame = frame(otherEndpoints.a, otherEndpoints.b);
    const sinAngle = Math.abs(current.dx * otherFrame.dz - current.dz * otherFrame.dx);
    if (sinAngle <= ROAD_AXIS_EPSILON_METERS) continue;
    // Project the intersecting corridor's half-width onto this approach. The
    // divisor also keeps angled future roads from leaving a sidewalk wedge in
    // the middle of the junction.
    extent = Math.max(extent, corridorMeters(other) * 0.5 / sinAngle);
  }
  return extent;
}

export function deriveRoadCollisionSources(graphInput: Readonly<CityRoadGraph>): DerivedRoadCollisionSources {
  const graph = splitRoadGraphAtIntersections(graphInput);
  const nodes = nodeMap(graph);
  const incident = new Map<string, RoadEdge[]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.a, edge.b]) {
      const list = incident.get(nodeId) ?? [];
      list.push(edge);
      incident.set(nodeId, list);
    }
  }
  const junctionSidewalkPlans = deriveJunctionSidewalkPlans(incident, nodes);
  const surfaceIdentityKeys: string[] = [];
  for (const edge of graph.edges) {
    surfaceIdentityKeys.push(
      canonicalTupleKey(["road-surface", edge.id, "center"]),
      canonicalTupleKey(["road-surface", edge.id, "left-bike"]),
      canonicalTupleKey(["road-surface", edge.id, "right-bike"]),
      canonicalTupleKey(["road-surface", edge.id, "left-sidewalk"]),
      canonicalTupleKey(["road-surface", edge.id, "right-sidewalk"]),
    );
  }
  surfaceIdentityKeys.push(...junctionSidewalkPlans.map((plan) => plan.identity));
  const surfaceKeyByIdentity = stableUint32Ids(surfaceIdentityKeys);
  const boundaryIdentityKeys = graph.edges.flatMap((edge) => [
    canonicalTupleKey(["road-boundary", edge.id, "left", 0]),
    canonicalTupleKey(["road-boundary", edge.id, "left", 1]),
    canonicalTupleKey(["road-boundary", edge.id, "right", 0]),
    canonicalTupleKey(["road-boundary", edge.id, "right", 1]),
  ]);
  boundaryIdentityKeys.push(...junctionSidewalkPlans.flatMap((plan) => [
    junctionBoundaryIdentity(plan, 0),
    junctionBoundaryIdentity(plan, 1),
  ]));
  const boundaryKeyByIdentity = stableUint32Ids(boundaryIdentityKeys);
  const surfaces: DerivedRoadSurface[] = [];
  const boundaries: DerivedRoadBoundary[] = [];
  const markings: DerivedRoadMarking[] = [];
  const bikeLaneArrows: DerivedBikeLaneArrow[] = [];

  const addSurface = (
    edge: Readonly<RoadEdge>,
    side: DerivedRoadSurface["side"],
    variant: string,
    profileId: DerivedRoadSurface["surfaceProfileId"],
    y: number,
    surfaceQuad: DerivedRoadSurface["quadXZ"],
  ) => {
    const identity = canonicalTupleKey(["road-surface", edge.id, variant]);
    surfaces.push(Object.freeze({
      edgeId: edge.id,
      side,
      surfaceProfileId: profileId,
      localSurfaceKey: surfaceKeyByIdentity.get(identity)!,
      roadSurfaceId: identity,
      y,
      quadXZ: surfaceQuad,
    }));
  };

  for (const edge of graph.edges) {
    const { a, b } = edgeEndpoints(edge, nodes);
    const roadFrame = frame(a, b);
    const junctionExtentA = junctionRoadExtent(edge, edge.a, nodes, incident);
    const junctionExtentB = junctionRoadExtent(edge, edge.b, nodes, incident);
    const requestedInsetA = junctionExtentA > 0
      ? junctionExtentA + ROAD_CROSSWALK_INNER_GAP_METERS + ROAD_CROSSWALK_DEPTH_METERS
      : 0;
    const requestedInsetB = junctionExtentB > 0
      ? junctionExtentB + ROAD_CROSSWALK_INNER_GAP_METERS + ROAD_CROSSWALK_DEPTH_METERS
      : 0;
    const insetScale = requestedInsetA + requestedInsetB > roadFrame.length * 0.9
      ? roadFrame.length * 0.9 / (requestedInsetA + requestedInsetB)
      : 1;
    const insetA = requestedInsetA * insetScale;
    const insetB = requestedInsetB * insetScale;
    const facilityA = insetEndpoint(a, roadFrame, insetA, true);
    const facilityB = insetEndpoint(b, roadFrame, insetB, false);
    const crossSection = edge.profile.crossSection;
    const centerHalf = ((crossSection.lanesAToB + crossSection.lanesBToA) * crossSection.laneWidth
      + crossSection.medianWidth) * 0.5;
    addSurface(edge, "center", "center", "asphalt", 0, quad(a, b, roadFrame, centerHalf, -centerHalf));

    const addMarking = (
      kind: DerivedRoadMarking["kind"],
      color: DerivedRoadMarking["color"],
      offset: number,
      widthMeters: number,
      dashed = false,
    ) => markings.push(Object.freeze({
      edgeId: edge.id,
      kind,
      color,
      widthMeters,
      segmentXZ: segmentAtOffset(facilityA, facilityB, roadFrame, offset),
      ...(dashed ? { dashLengthMeters: 3.2, dashGapMeters: 5.8 } : {}),
    }));

    if (crossSection.lanesAToB > 0 && crossSection.lanesBToA > 0) {
      const centerLineOffset = Math.max(crossSection.medianWidth * 0.5, 0.16);
      addMarking("double-center", "yellow", -centerLineOffset, 0.12);
      addMarking("double-center", "yellow", centerLineOffset, 0.12);
    }
    for (let lane = 1; lane < crossSection.lanesBToA; lane += 1) {
      addMarking(
        "motor-lane-divider",
        "white",
        crossSection.medianWidth * 0.5 + crossSection.laneWidth * lane,
        0.14,
        true,
      );
    }
    for (let lane = 1; lane < crossSection.lanesAToB; lane += 1) {
      addMarking(
        "motor-lane-divider",
        "white",
        -(crossSection.medianWidth * 0.5 + crossSection.laneWidth * lane),
        0.14,
        true,
      );
    }

    for (const side of ["left", "right"] as const) {
      const sign = side === "left" ? 1 : -1;
      const offsets = sideComponentOffsets(crossSection, side);
      addSurface(edge, side, `${side}-bike`, "bike-lane", 0,
        quad(facilityA, facilityB, roadFrame, sign * offsets.outerBike, sign * offsets.innerBike));
      const bike = surfaces[surfaces.length - 1];
      addSurface(edge, side, `${side}-sidewalk`, "sidewalk", CURB_HEIGHT_METERS,
        quad(facilityA, facilityB, roadFrame, sign * offsets.outerSidewalk, sign * offsets.innerSidewalk));
      const sidewalk = surfaces[surfaces.length - 1];

      if (offsets.profile.bikeLaneWidth > 0) {
        addMarking("bike-lane-boundary", "white", sign * offsets.innerBike, 0.18);
        addMarking(
          "road-edge",
          "white",
          sign * (offsets.innerBike + offsets.profile.bikeLaneWidth + offsets.profile.bikeBufferWidth),
          0.11,
        );
        const hasTrafficDirection = side === "right"
          ? crossSection.lanesAToB > 0
          : crossSection.lanesBToA > 0;
        if (hasTrafficDirection) {
          const arrowCount = Math.max(1, Math.floor(Math.max(0, roadFrame.length - insetA - insetB) / 85));
          const bikeOffset = sign * (offsets.innerBike + offsets.profile.bikeLaneWidth * 0.5);
          for (let arrow = 0; arrow < arrowCount; arrow += 1) {
            const t = (arrow + 0.5) / arrowCount;
            bikeLaneArrows.push(Object.freeze({
              edgeId: edge.id,
              side,
              x: facilityA.x + (facilityB.x - facilityA.x) * t + roadFrame.leftX * bikeOffset,
              z: facilityA.z + (facilityB.z - facilityA.z) * t + roadFrame.leftZ * bikeOffset,
              directionX: side === "right" ? roadFrame.dx : -roadFrame.dx,
              directionZ: side === "right" ? roadFrame.dz : -roadFrame.dz,
            }));
          }
        }
      }

      if (offsets.profile.sidewalkWidth <= 0) continue;
      const boundaryOffsets = [offsets.innerSidewalk, offsets.outerSidewalk];
      for (let curbRun = 0; curbRun < boundaryOffsets.length; curbRun += 1) {
        const offset = sign * boundaryOffsets[curbRun];
        const identity = canonicalTupleKey(["road-boundary", edge.id, side, curbRun]);
        const segment = Object.freeze([
          facilityA.x + roadFrame.leftX * offset,
          facilityA.z + roadFrame.leftZ * offset,
          facilityB.x + roadFrame.leftX * offset,
          facilityB.z + roadFrame.leftZ * offset,
        ] as const);
        // The segment follows a→b. For the left curb the centre is on the
        // segment's right; for the right curb it is on the left.
        boundaries.push(Object.freeze({
          edgeId: edge.id,
          side,
          curbRun,
          groupKey: boundaryKeyByIdentity.get(identity)!,
          transitionProfileId: "road-curb",
          segmentXZ: segment,
          // Slots are mathematical cross-product sides in XZ:
          // [left] is cross(B-A,P-A)>0 and [right] is <0. Since +Z points
          // south, this is intentionally not the same as visual road left.
          leftSurfaceKey: side === "left"
            ? (curbRun === 0 ? bike.localSurfaceKey : sidewalk.localSurfaceKey)
            : (curbRun === 0 ? sidewalk.localSurfaceKey : 0xfffffffe),
          rightSurfaceKey: side === "left"
            ? (curbRun === 0 ? sidewalk.localSurfaceKey : 0xfffffffe)
            : (curbRun === 0 ? bike.localSurfaceKey : sidewalk.localSurfaceKey),
        }));
      }
    }
  }

  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const sidewalkByEdge = new Map<string, readonly DerivedRoadSurface[]>();
  for (const edge of graph.edges) {
    sidewalkByEdge.set(edge.id, Object.freeze(surfaces.filter((surface) =>
      surface.edgeId === edge.id && surface.surfaceProfileId === "sidewalk")));
  }
  const findEndpoint = (
    nodeId: string,
    edgeId: string,
    direction: CardinalDirection,
    side: CardinalDirection,
  ) => {
    const edge = edgeById.get(edgeId);
    const node = nodes.get(nodeId);
    if (!edge || !node) return null;
    for (const surface of sidewalkByEdge.get(edgeId) ?? []) {
      const segment = endpointSegmentAtNode(surface, edge, nodeId);
      if (Math.hypot(segment[2] - segment[0], segment[3] - segment[1])
        <= ROAD_AXIS_EPSILON_METERS) continue;
      if (endpointWorldSide(segment, node, direction) === side) {
        return Object.freeze({ segment, surface });
      }
    }
    return null;
  };
  for (const plan of junctionSidewalkPlans) {
    const first = findEndpoint(
      plan.nodeId,
      plan.firstEdgeId,
      plan.firstDirection,
      plan.firstSide,
    );
    const second = findEndpoint(
      plan.nodeId,
      plan.secondEdgeId,
      plan.secondDirection,
      plan.secondSide,
    );
    if (!first || !second) continue;
    const surfaceQuad = junctionQuadFromSegments(first.segment, second.segment);
    if (!surfaceQuad) continue;
    const junctionSurface = Object.freeze({
      edgeId: canonicalTupleKey(["road-junction", plan.nodeId]),
      side: "junction",
      surfaceProfileId: "sidewalk",
      localSurfaceKey: surfaceKeyByIdentity.get(plan.identity)!,
      roadSurfaceId: plan.identity,
      y: CURB_HEIGHT_METERS,
      quadXZ: surfaceQuad,
    } satisfies DerivedRoadSurface);
    surfaces.push(junctionSurface);

    const node = nodes.get(plan.nodeId)!;
    const firstPoints = endpointInnerOuter(first.segment, node);
    const secondPoints = endpointInnerOuter(second.segment, node);
    const innerNeighborKey = (edgeId: string, sidewalk: Readonly<DerivedRoadSurface>) => {
      const edge = edgeById.get(edgeId)!;
      if (sidewalk.side !== "left" && sidewalk.side !== "right") return 0xfffffffe;
      const offsets = sideComponentOffsets(edge.profile.crossSection, sidewalk.side);
      return offsets.innerSidewalk - offsets.innerBike <= ROAD_AXIS_EPSILON_METERS
        ? surfaceKeyByIdentity.get(canonicalTupleKey(["road-surface", edgeId, "center"]))!
        : 0xfffffffe;
    };
    const firstNeighborKey = innerNeighborKey(plan.firstEdgeId, first.surface);
    const secondNeighborKey = innerNeighborKey(plan.secondEdgeId, second.surface);
    const boundaryEdgeId = canonicalTupleKey(["road-junction", plan.nodeId, plan.variant]);

    const appendBoundary = (
      curbRun: number,
      start: JunctionPoint,
      end: JunctionPoint,
      neighborSurfaceKey: number,
    ) => {
      if (Math.hypot(end.x - start.x, end.z - start.z) <= ROAD_AXIS_EPSILON_METERS) return;
      const centerX = (surfaceQuad[0] + surfaceQuad[2] + surfaceQuad[4] + surfaceQuad[6]) * 0.25;
      const centerZ = (surfaceQuad[1] + surfaceQuad[3] + surfaceQuad[5] + surfaceQuad[7]) * 0.25;
      const cross = (end.x - start.x) * (centerZ - start.z)
        - (end.z - start.z) * (centerX - start.x);
      const connectorOnLeft = cross >= 0;
      boundaries.push(Object.freeze({
        edgeId: boundaryEdgeId,
        side: "junction",
        curbRun,
        groupKey: boundaryKeyByIdentity.get(junctionBoundaryIdentity(plan, curbRun))!,
        transitionProfileId: "road-curb",
        segmentXZ: Object.freeze([start.x, start.z, end.x, end.z] as const),
        leftSurfaceKey: connectorOnLeft ? junctionSurface.localSurfaceKey : neighborSurfaceKey,
        rightSurfaceKey: connectorOnLeft ? neighborSurfaceKey : junctionSurface.localSurfaceKey,
      }));
    };

    if (plan.variant.endsWith("-bridge")) {
      const innerMidpoint = Math.abs(firstPoints.inner.x - secondPoints.inner.x)
          >= Math.abs(firstPoints.inner.z - secondPoints.inner.z)
        ? Object.freeze({ x: node.x, z: firstPoints.inner.z })
        : Object.freeze({ x: firstPoints.inner.x, z: node.z });
      appendBoundary(0, firstPoints.inner, innerMidpoint, firstNeighborKey);
      appendBoundary(0, innerMidpoint, secondPoints.inner, secondNeighborKey);
      appendBoundary(1, firstPoints.outer, secondPoints.outer, 0xfffffffe);
    } else {
      const innerCorner = orthogonalCorner(firstPoints.inner, secondPoints.inner, node, true);
      const outerCorner = orthogonalCorner(firstPoints.outer, secondPoints.outer, node, false);
      appendBoundary(0, firstPoints.inner, innerCorner, firstNeighborKey);
      appendBoundary(0, innerCorner, secondPoints.inner, secondNeighborKey);
      appendBoundary(1, firstPoints.outer, outerCorner, 0xfffffffe);
      appendBoundary(1, outerCorner, secondPoints.outer, 0xfffffffe);
    }
  }

  const ramps: DerivedCurbRamp[] = [];
  const crosswalks: DerivedRoadCrosswalk[] = [];
  for (const [nodeId, edges] of incident) {
    if (edges.length < 3) continue;
    for (const edge of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
      const node = nodes.get(nodeId)!;
      const otherId = edge.a === nodeId ? edge.b : edge.a;
      const other = nodes.get(otherId)!;
      const outward = frame(node, other);
      const junctionExtent = junctionRoadExtent(edge, nodeId, nodes, incident);
      const crossSection = edge.profile.crossSection;
      const crossingWidth = corridorMeters(edge)
        - crossSection.left.sidewalkWidth - crossSection.left.vergeWidth
        - crossSection.right.sidewalkWidth - crossSection.right.vergeWidth;
      const crossingOffset = junctionExtent
        + ROAD_CROSSWALK_INNER_GAP_METERS
        + ROAD_CROSSWALK_DEPTH_METERS * 0.5;
      crosswalks.push(Object.freeze({
        nodeId,
        approachEdgeId: edge.id,
        centerX: node.x + outward.dx * crossingOffset,
        centerZ: node.z + outward.dz * crossingOffset,
        directionX: outward.dx,
        directionZ: outward.dz,
        widthMeters: crossingWidth,
        depthMeters: ROAD_CROSSWALK_DEPTH_METERS,
        stripeCount: Math.max(5, Math.round(crossingWidth / 1.2)),
      }));
      for (const side of ["left", "right"] as const) {
        ramps.push(Object.freeze({
          nodeId,
          approachEdgeId: edge.id,
          side,
          transitionProfileId: "smooth",
          lengthMeters: 4.2,
        }));
      }
    }
  }

  const boundaryXZ = new Float32Array(boundaries.length * 4);
  const boundaryTransitionProfileIndices = new Uint16Array(boundaries.length);
  const boundaryGroupKeys = new Uint32Array(boundaries.length);
  const boundarySurfaceKeyPairs = new Uint32Array(boundaries.length * 2);
  boundaries.forEach((boundary, index) => {
    boundaryXZ.set(boundary.segmentXZ, index * 4);
    boundaryTransitionProfileIndices[index] = ROAD_CURB_TRANSITION_INDEX;
    boundaryGroupKeys[index] = boundary.groupKey;
    boundarySurfaceKeyPairs[index * 2] = boundary.leftSurfaceKey;
    boundarySurfaceKeyPairs[index * 2 + 1] = boundary.rightSurfaceKey;
  });
  const surfaceHandles = surfaces.map(({ localSurfaceKey, roadSurfaceId }) =>
    Object.freeze({ localSurfaceKey, roadSurfaceId }));
  return Object.freeze({
    surfaces: Object.freeze(surfaces),
    boundaries: Object.freeze(boundaries),
    ramps: Object.freeze(ramps),
    crosswalks: Object.freeze(crosswalks),
    markings: Object.freeze(markings),
    bikeLaneArrows: Object.freeze(bikeLaneArrows),
    surfaceHandles: Object.freeze(surfaceHandles),
    packedBoundaries: Object.freeze({
      boundaryXZ,
      boundaryTransitionProfileIndices,
      boundaryGroupKeys,
      boundarySurfaceKeyPairs,
    }),
  });
}

export function crossSectionSideWidth(side: Readonly<RoadSideProfile>) {
  return sideWidth(side);
}
