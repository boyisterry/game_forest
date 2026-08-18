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
  side: "center" | "left" | "right";
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
  side: "left" | "right";
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

export type DerivedRoadCollisionSources = Readonly<{
  surfaces: readonly DerivedRoadSurface[];
  boundaries: readonly DerivedRoadBoundary[];
  ramps: readonly DerivedCurbRamp[];
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

const ROAD_CURB_TRANSITION_INDEX = BUILTIN_SURFACE_TRANSITIONS.findIndex((profile) => profile.id === "road-curb");

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

export function deriveRoadCollisionSources(graphInput: Readonly<CityRoadGraph>): DerivedRoadCollisionSources {
  const graph = splitRoadGraphAtIntersections(graphInput);
  const nodes = nodeMap(graph);
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
  const surfaceKeyByIdentity = stableUint32Ids(surfaceIdentityKeys);
  const boundaryIdentityKeys = graph.edges.flatMap((edge) => [
    canonicalTupleKey(["road-boundary", edge.id, "left", 0]),
    canonicalTupleKey(["road-boundary", edge.id, "left", 1]),
    canonicalTupleKey(["road-boundary", edge.id, "right", 0]),
    canonicalTupleKey(["road-boundary", edge.id, "right", 1]),
  ]);
  const boundaryKeyByIdentity = stableUint32Ids(boundaryIdentityKeys);
  const surfaces: DerivedRoadSurface[] = [];
  const boundaries: DerivedRoadBoundary[] = [];

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
    const crossSection = edge.profile.crossSection;
    const centerHalf = ((crossSection.lanesAToB + crossSection.lanesBToA) * crossSection.laneWidth
      + crossSection.medianWidth) * 0.5;
    addSurface(edge, "center", "center", "asphalt", 0, quad(a, b, roadFrame, centerHalf, -centerHalf));

    const surfacesForSide = new Map<"left" | "right", { bike: DerivedRoadSurface; sidewalk: DerivedRoadSurface }>();
    for (const side of ["left", "right"] as const) {
      const sign = side === "left" ? 1 : -1;
      const offsets = sideComponentOffsets(crossSection, side);
      addSurface(edge, side, `${side}-bike`, "bike-lane", 0,
        quad(a, b, roadFrame, sign * offsets.outerBike, sign * offsets.innerBike));
      const bike = surfaces[surfaces.length - 1];
      addSurface(edge, side, `${side}-sidewalk`, "sidewalk", CURB_HEIGHT_METERS,
        quad(a, b, roadFrame, sign * offsets.outerSidewalk, sign * offsets.innerSidewalk));
      const sidewalk = surfaces[surfaces.length - 1];
      surfacesForSide.set(side, { bike, sidewalk });

      if (offsets.profile.sidewalkWidth <= 0) continue;
      const boundaryOffsets = [offsets.innerSidewalk, offsets.outerSidewalk];
      for (let curbRun = 0; curbRun < boundaryOffsets.length; curbRun += 1) {
        const offset = sign * boundaryOffsets[curbRun];
        const identity = canonicalTupleKey(["road-boundary", edge.id, side, curbRun]);
        const segment = Object.freeze([
          a.x + roadFrame.leftX * offset,
          a.z + roadFrame.leftZ * offset,
          b.x + roadFrame.leftX * offset,
          b.z + roadFrame.leftZ * offset,
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

  const incident = new Map<string, RoadEdge[]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.a, edge.b]) {
      const list = incident.get(nodeId) ?? [];
      list.push(edge);
      incident.set(nodeId, list);
    }
  }
  const ramps: DerivedCurbRamp[] = [];
  for (const [nodeId, edges] of incident) {
    if (edges.length < 3) continue;
    for (const edge of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
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
