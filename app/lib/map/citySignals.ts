import {
  CURB_HEIGHT_METERS,
  canonicalFloat64Bits,
  canonicalTupleKey,
} from "./cityCollisionTypes.ts";
import type { CityMapDocumentSnapshot } from "./cityDocument.ts";
import type {
  CityRoadGraph,
  RoadCrossSection,
  RoadEdge,
  RoadNode,
  RoadSideProfile,
} from "./cityRoadGraph.ts";
import { splitRoadGraphAtIntersections } from "./cityRoads.ts";

export type SignalPhase = "red" | "green";
export type ApproachCardinal = "+x" | "-x" | "+z" | "-z";

export type DerivedTrafficSignalPlacement = Readonly<{
  kind: "derived";
  templateId: "traffic-light";
  /** Stable across phase-only changes and edge-array reordering. */
  placementId: string;
  ownerId: string;
  nodeId: string;
  approachEdgeId: string;
  approachCardinal: ApproachCardinal;
  approachDirectionXZ: readonly [x: number, z: number];
  sourceRoadSide: "left" | "right";
  inboundLaneCount: number;
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  uniformScale: 1;
  resolvedHeightScale: number;
  signalPhase: SignalPhase;
  /** Phase is deliberately excluded: a light change does not rebuild collision. */
  collisionVariantId: string;
}>;

export type CitySignalDerivation = Readonly<{
  graph: CityRoadGraph;
  placements: readonly DerivedTrafficSignalPlacement[];
  enabledNodeIds: readonly string[];
}>;

type Approach = Readonly<{
  node: Readonly<RoadNode>;
  edge: Readonly<RoadEdge>;
  tx: number;
  tz: number;
  cardinal: ApproachCardinal;
  sourceRoadSide: "left" | "right";
  sideProfile: Readonly<RoadSideProfile>;
  inboundLaneCount: number;
}>;

const AXIS_EPSILON = 1e-7;
const SIGNAL_SIDEWALK_FRACTION = 0.34;

/** `undefined` inherits the document flag; true/false are explicit overrides. */
export function resolveIntersectionTrafficLights(
  documentDefault: boolean,
  nodeOverride: boolean | undefined,
): boolean {
  return nodeOverride ?? documentDefault;
}

function directionCardinal(x: number, z: number): ApproachCardinal {
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? "+x" : "-x";
  return z > 0 ? "+z" : "-z";
}

function edgeFrame(
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
) {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) throw new TypeError(`edge ${edge.id} references a missing node`);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return {
    a,
    b,
    dx: (b.x - a.x) / length,
    dz: (b.z - a.z) / length,
  };
}

function incomingApproach(
  node: Readonly<RoadNode>,
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): Approach | null {
  const frame = edgeFrame(edge, nodes);
  const section = edge.profile.crossSection;
  if (edge.b === node.id && section.lanesAToB > 0) {
    return Object.freeze({
      node,
      edge,
      tx: frame.dx,
      tz: frame.dz,
      cardinal: directionCardinal(frame.dx, frame.dz),
      sourceRoadSide: "right",
      sideProfile: section.right,
      inboundLaneCount: section.lanesAToB,
    });
  }
  if (edge.a === node.id && section.lanesBToA > 0) {
    return Object.freeze({
      node,
      edge,
      tx: -frame.dx,
      tz: -frame.dz,
      cardinal: directionCardinal(-frame.dx, -frame.dz),
      sourceRoadSide: "left",
      sideProfile: section.left,
      inboundLaneCount: section.lanesBToA,
    });
  }
  return null;
}

function signalOffsetForSide(
  section: Readonly<RoadCrossSection>,
  side: "left" | "right",
) {
  // Right-hand traffic: A→B occupies the representation's right half and
  // B→A its left half. This remains invariant when the edge representation
  // is reversed because the reversal helper also swaps lanes and side data.
  const laneCount = side === "right" ? section.lanesAToB : section.lanesBToA;
  const profile = section[side];
  return section.medianWidth * 0.5
    + laneCount * section.laneWidth
    + profile.bikeLaneWidth
    + profile.bikeBufferWidth
    + profile.parkingWidth
    + profile.sidewalkWidth * SIGNAL_SIDEWALK_FRACTION;
}

function crossingSetback(
  approach: Approach,
  incident: readonly Readonly<RoadEdge>[],
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
) {
  const awayX = -approach.tx;
  const awayZ = -approach.tz;
  let result = 0;
  for (const edge of incident) {
    if (edge.id === approach.edge.id) continue;
    const frame = edgeFrame(edge, nodes);
    if (Math.abs(frame.dx * approach.tx + frame.dz * approach.tz) > AXIS_EPSILON) continue;
    // Visual left of a→b in the project's x/+z-south coordinate system.
    const leftX = frame.dz;
    const leftZ = -frame.dx;
    const side = awayX * leftX + awayZ * leftZ >= 0 ? "left" : "right";
    result = Math.max(result, signalOffsetForSide(edge.profile.crossSection, side));
  }
  return result > 0 ? result : Math.max(2, approach.edge.profile.crossSection.laneWidth);
}

function normalizedYaw(tx: number, tz: number) {
  const value = Math.atan2(tz, -tx);
  if (Math.abs(Math.abs(value) - Math.PI) < AXIS_EPSILON) return Math.PI;
  return Math.abs(value) < Number.EPSILON ? 0 : value;
}

function qualifyIntersection(
  node: Readonly<RoadNode>,
  incident: readonly Readonly<RoadEdge>[],
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
) {
  const directions = new Set<ApproachCardinal>();
  for (const edge of incident) {
    const frame = edgeFrame(edge, nodes);
    const outwardX = edge.a === node.id ? frame.dx : -frame.dx;
    const outwardZ = edge.a === node.id ? frame.dz : -frame.dz;
    directions.add(directionCardinal(outwardX, outwardZ));
  }
  return directions.size >= 3;
}

export function deriveTrafficSignalPlacements(
  document: CityMapDocumentSnapshot,
): CitySignalDerivation {
  if (!Number.isFinite(document.flags.signalHeightScale) || document.flags.signalHeightScale <= 0) {
    throw new TypeError("signalHeightScale must be a finite positive number");
  }
  const graph = splitRoadGraphAtIntersections(structuredClone(document.graph) as CityRoadGraph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incidentByNode = new Map<string, RoadEdge[]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.a, edge.b]) {
      const list = incidentByNode.get(nodeId) ?? [];
      list.push(edge);
      incidentByNode.set(nodeId, list);
    }
  }

  const collisionVariantId = canonicalTupleKey([
    "derived-template-variant",
    "traffic-light",
    canonicalFloat64Bits(document.flags.signalHeightScale),
  ]);
  const placements: DerivedTrafficSignalPlacement[] = [];
  const enabledNodeIds: string[] = [];

  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    const incident = incidentByNode.get(node.id) ?? [];
    if (!qualifyIntersection(node, incident, nodes)) continue;
    const override = graph.intersectionOverrides[node.id]?.needTrafficLights;
    if (!resolveIntersectionTrafficLights(document.flags.needTrafficLights, override)) continue;

    const approaches = incident
      .map((edge) => incomingApproach(node, edge, nodes))
      .filter((value): value is Approach => value !== null)
      .sort((left, right) => left.edge.id.localeCompare(right.edge.id));
    if (approaches.length === 0) continue;
    enabledNodeIds.push(node.id);
    const horizontalScore = approaches
      .filter((approach) => Math.abs(approach.tx) > Math.abs(approach.tz))
      .reduce((sum, approach) => sum + approach.inboundLaneCount, 0);
    const verticalScore = approaches
      .filter((approach) => Math.abs(approach.tz) >= Math.abs(approach.tx))
      .reduce((sum, approach) => sum + approach.inboundLaneCount, 0);
    // Preserve Rain Harbor's tie-break: vertical approaches receive green.
    const greenAxis = verticalScore >= horizontalScore ? "vertical" : "horizontal";

    for (const approach of approaches) {
      const rightX = -approach.tz;
      const rightZ = approach.tx;
      const sideOffset = signalOffsetForSide(
        approach.edge.profile.crossSection,
        approach.sourceRoadSide,
      );
      const setback = crossingSetback(approach, incident, nodes);
      const horizontal = Math.abs(approach.tx) > Math.abs(approach.tz);
      const placementId = canonicalTupleKey([
        "derived",
        "traffic-light",
        node.id,
        approach.edge.id,
      ]);
      placements.push(Object.freeze({
        kind: "derived",
        templateId: "traffic-light",
        placementId,
        ownerId: placementId,
        nodeId: node.id,
        approachEdgeId: approach.edge.id,
        approachCardinal: approach.cardinal,
        approachDirectionXZ: Object.freeze([approach.tx, approach.tz] as const),
        sourceRoadSide: approach.sourceRoadSide,
        inboundLaneCount: approach.inboundLaneCount,
        x: node.x - approach.tx * setback + rightX * sideOffset,
        y: approach.sideProfile.sidewalkWidth > 0 ? CURB_HEIGHT_METERS : 0,
        z: node.z - approach.tz * setback + rightZ * sideOffset,
        yawRadians: normalizedYaw(approach.tx, approach.tz),
        uniformScale: 1,
        resolvedHeightScale: document.flags.signalHeightScale,
        signalPhase: (horizontal ? "horizontal" : "vertical") === greenAxis ? "green" : "red",
        collisionVariantId,
      }));
    }
  }

  placements.sort((left, right) => left.placementId.localeCompare(right.placementId));
  enabledNodeIds.sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    graph,
    placements: Object.freeze(placements),
    enabledNodeIds: Object.freeze(enabledNodeIds),
  });
}
