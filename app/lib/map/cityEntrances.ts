import {
  CURB_HEIGHT_METERS,
  NO_SURFACE_KEY,
  IMPLICIT_GROUND_SURFACE_KEY,
  canonicalTupleKey,
} from "./cityCollisionTypes.ts";
import type { RoadEntrancePortSource } from "./cityCollisionTypes.ts";
import { getCatalogEntry } from "./cityCatalog.ts";
import type { EntranceAnchor, InternalRoad } from "./cityCatalog.ts";
import type {
  CityMapDocumentSnapshot,
  GridPlacement,
  WorldPlacement,
} from "./cityDocument.ts";
import type {
  CityRoadGraph,
  RoadCrossSection,
  RoadEdge,
  RoadNode,
  RoadSideProfile,
} from "./cityRoadGraph.ts";
import { sideWidth } from "./cityRoadGraph.ts";
import {
  deriveRoadCollisionSources,
  splitRoadGraphAtIntersections,
} from "./cityRoads.ts";
import type {
  DerivedRoadCollisionSources,
  DerivedRoadSurface,
} from "./cityRoads.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  TILE_SIZE_METERS,
} from "./cityTiles.ts";
import { CITY_SURFACE_CHUNK_SIZE_METERS } from "./cityCollisionWire.ts";

export type EntranceConnectionKind = "road-side" | "stub-end";
export type EntranceRoadSurfaceKind = "sidewalk" | "bike-lane" | "asphalt";

export type WorldEntrancePortMetadata = Readonly<{
  placementId: string;
  catalogId: string;
  entranceId: string;
  internalRoadName: string;
  internalRoadSource: InternalRoad["sourceSurface"];
  expectedTemplateSurfaceProfileId: string;
  widthMeters: number;
  worldCenterXZ: readonly [x: number, z: number];
  /** A→B orientation is deterministic from the transformed outward vector. */
  worldSegmentXZ: readonly [ax: number, az: number, bx: number, bz: number];
  worldOutwardXZ: readonly [x: number, z: number];
}>;

export type DrivewayChunkRef = Readonly<{
  chunkX: number;
  chunkZ: number;
  chunkKey: string;
}>;

export type ChunkedRoadEntrancePortSource = Readonly<{
  chunkX: number;
  chunkZ: number;
  roadSurfaceId: string;
  sourceId: string;
  source: RoadEntrancePortSource;
}>;

export type EntranceStitchPlan = Readonly<{
  placementId: string;
  entranceId: string;
  groupId: string;
  transitionProfileId: "smooth";
  templateWorldSegmentXZ: readonly [number, number, number, number];
  templateWorldOutwardXZ: readonly [number, number];
  /** The road owner points back into the site, opposite the template owner. */
  roadWorldOutwardXZ: readonly [number, number];
  roadPortSourceIds: readonly string[];
  requiresResolvedTemplatePort: true;
}>;

export type DerivedCityDriveway = Readonly<{
  id: string;
  placementId: string;
  catalogId: string;
  entranceId: string;
  internalRoadName: string;
  connectionKind: EntranceConnectionKind;
  roadEdgeId: string;
  roadSide: "left" | "right" | "end-a" | "end-b";
  roadTargetSurfaceKind: EntranceRoadSurfaceKind;
  roadTargetSurfaceId: string;
  drivewayRoadSurfaceId: string;
  surfaceProfileId: "driveway";
  widthMeters: number;
  lengthMeters: number;
  siteSegmentXZ: readonly [number, number, number, number];
  roadSegmentXZ: readonly [number, number, number, number];
  /** site A, site B, road B, road A */
  worldQuadXZ: readonly [number, number, number, number, number, number, number, number];
  roadTargetY: number;
  affectedChunks: readonly DrivewayChunkRef[];
  roadPortSources: readonly ChunkedRoadEntrancePortSource[];
  stitchPlan: EntranceStitchPlan;
}>;

export type UnconnectedCityEntrance = Readonly<{
  port: WorldEntrancePortMetadata;
  reason: "no-forward-road" | "road-too-far";
  nearestDistanceMeters: number | null;
}>;

export type CityEntranceDerivation = Readonly<{
  graph: CityRoadGraph;
  ports: readonly WorldEntrancePortMetadata[];
  driveways: readonly DerivedCityDriveway[];
  unconnected: readonly UnconnectedCityEntrance[];
}>;

export type CityEntranceRoadRuntime = Readonly<{
  entrances: CityEntranceDerivation;
  collisionSources: DerivedRoadCollisionSources;
}>;

export type CityEntranceDeriveOptions = Readonly<{
  maxConnectionMeters?: number;
}>;

type PlacementTransform = Readonly<{
  x: number;
  z: number;
  yawRadians: number;
  scale: number;
}>;

type TargetCandidate = Readonly<{
  edge: Readonly<RoadEdge>;
  kind: EntranceConnectionKind;
  side: DerivedCityDriveway["roadSide"];
  targetSurfaceKind: EntranceRoadSurfaceKind;
  targetSurfaceId: string;
  targetX: number;
  targetZ: number;
  targetY: number;
  distance: number;
  score: number;
}>;

type PendingDriveway = Readonly<{
  port: WorldEntrancePortMetadata;
  target: TargetCandidate;
  id: string;
  drivewayRoadSurfaceId: string;
  roadSegmentXZ: readonly [number, number, number, number];
  quadXZ: readonly [number, number, number, number, number, number, number, number];
  affectedChunks: readonly DrivewayChunkRef[];
  clippedPortSegments: readonly Readonly<{
    chunkX: number;
    chunkZ: number;
    segment: readonly [number, number, number, number];
    identity: string;
  }>[];
}>;

const EPSILON = 1e-7;
const CHUNK_NUDGE_METERS = 1e-6;
const DEFAULT_MAX_CONNECTION_METERS = 512;

function cardinalVector(outward: EntranceAnchor["outward"]): readonly [number, number] {
  if (outward === "+x") return Object.freeze([1, 0] as const);
  if (outward === "-x") return Object.freeze([-1, 0] as const);
  if (outward === "+z") return Object.freeze([0, 1] as const);
  return Object.freeze([0, -1] as const);
}

function rotateXZ(x: number, z: number, yawRadians: number): readonly [number, number] {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const normalize = (value: number) => Math.abs(value) <= EPSILON ? 0 : value;
  return Object.freeze([
    normalize(cosine * x + sine * z),
    normalize(-sine * x + cosine * z),
  ] as const);
}

function placementTransform(
  placement: Readonly<GridPlacement | WorldPlacement>,
): PlacementTransform | null {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) return null;
  if (placement.poseKind === "world") {
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.z)
      || !Number.isFinite(placement.yawRadians)
      || !Number.isFinite(placement.scale) || placement.scale <= 0) {
      throw new TypeError(`placement ${placement.id} has an invalid world transform`);
    }
    return Object.freeze({
      x: placement.x,
      z: placement.z,
      yawRadians: placement.yawRadians,
      scale: placement.scale,
    });
  }
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  const rotated = placement.yaw === 90 || placement.yaw === 270
    ? { w: base.d, d: base.w }
    : base;
  return Object.freeze({
    x: CITY_TILE_ORIGIN_X + (placement.i + rotated.w * 0.5) * TILE_SIZE_METERS,
    z: CITY_TILE_ORIGIN_Z + (placement.j + rotated.d * 0.5) * TILE_SIZE_METERS,
    yawRadians: placement.yaw * Math.PI / 180,
    scale: 1,
  });
}

function worldPort(
  placement: Readonly<GridPlacement | WorldPlacement>,
  entrance: Readonly<EntranceAnchor>,
  internalRoad: Readonly<InternalRoad>,
): WorldEntrancePortMetadata {
  const transform = placementTransform(placement);
  if (!transform) throw new TypeError(`unknown catalog entry ${placement.catalogId}`);
  const localOutward = cardinalVector(entrance.outward);
  // Consistent A→B tangent for segment ordinals; this is perpendicular to
  // outward and survives all four right-angle yaw variants.
  const localTangent = Object.freeze([localOutward[1], -localOutward[0]] as const);
  const halfWidth = entrance.widthMeters * 0.5;
  const localA = [
    entrance.localX - localTangent[0] * halfWidth,
    entrance.localZ - localTangent[1] * halfWidth,
  ] as const;
  const localB = [
    entrance.localX + localTangent[0] * halfWidth,
    entrance.localZ + localTangent[1] * halfWidth,
  ] as const;
  const center = rotateXZ(entrance.localX * transform.scale, entrance.localZ * transform.scale, transform.yawRadians);
  const a = rotateXZ(localA[0] * transform.scale, localA[1] * transform.scale, transform.yawRadians);
  const b = rotateXZ(localB[0] * transform.scale, localB[1] * transform.scale, transform.yawRadians);
  const outward = rotateXZ(localOutward[0], localOutward[1], transform.yawRadians);
  const expectedProfile = internalRoad.sourceSurface.kind === "rideable-at-point"
    ? internalRoad.sourceSurface.expectedProfileId
    : (getCatalogEntry(placement.catalogId)?.surfaceProfiles.defaultRideableProfileId ?? "site-surface");
  return Object.freeze({
    placementId: placement.id,
    catalogId: placement.catalogId,
    entranceId: entrance.id,
    internalRoadName: internalRoad.name,
    internalRoadSource: internalRoad.sourceSurface,
    expectedTemplateSurfaceProfileId: expectedProfile,
    widthMeters: entrance.widthMeters * transform.scale,
    worldCenterXZ: Object.freeze([transform.x + center[0], transform.z + center[1]] as const),
    worldSegmentXZ: Object.freeze([
      transform.x + a[0], transform.z + a[1],
      transform.x + b[0], transform.z + b[1],
    ] as const),
    worldOutwardXZ: Object.freeze(outward as [number, number]),
  });
}

function edgeFrame(edge: Readonly<RoadEdge>, nodes: ReadonlyMap<string, Readonly<RoadNode>>) {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) throw new TypeError(`edge ${edge.id} references a missing node`);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, b, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length, length };
}

function cross(ax: number, az: number, bx: number, bz: number) {
  return ax * bz - az * bx;
}

function centerHalf(section: Readonly<RoadCrossSection>) {
  return ((section.lanesAToB + section.lanesBToA) * section.laneWidth + section.medianWidth) * 0.5;
}

function rideableOuterExtent(section: Readonly<RoadCrossSection>, side: "left" | "right") {
  const profile = section[side];
  return centerHalf(section)
    + profile.bikeLaneWidth
    + profile.bikeBufferWidth
    + profile.parkingWidth
    + profile.sidewalkWidth;
}

function targetSurface(profile: Readonly<RoadSideProfile>) {
  if (profile.sidewalkWidth > 0) return { kind: "sidewalk" as const, variant: "sidewalk", y: CURB_HEIGHT_METERS };
  if (profile.bikeLaneWidth + profile.bikeBufferWidth + profile.parkingWidth > 0) {
    return { kind: "bike-lane" as const, variant: "bike", y: 0 };
  }
  return { kind: "asphalt" as const, variant: "center", y: 0 };
}

function sideCandidate(
  port: WorldEntrancePortMetadata,
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): TargetCandidate | null {
  const frame = edgeFrame(edge, nodes);
  const outX = port.worldOutwardXZ[0];
  const outZ = port.worldOutwardXZ[1];
  const denominator = cross(outX, outZ, frame.dx, frame.dz);
  if (Math.abs(denominator) <= EPSILON) return null;
  const fromPortX = frame.a.x - port.worldCenterXZ[0];
  const fromPortZ = frame.a.z - port.worldCenterXZ[1];
  const centerDistance = cross(fromPortX, fromPortZ, frame.dx, frame.dz) / denominator;
  const edgeT = cross(fromPortX, fromPortZ, outX, outZ) / denominator;
  if (centerDistance <= EPSILON || edgeT < -EPSILON || edgeT > frame.length + EPSILON) return null;
  const leftX = frame.dz;
  const leftZ = -frame.dx;
  const towardSiteX = -outX;
  const towardSiteZ = -outZ;
  const side = towardSiteX * leftX + towardSiteZ * leftZ >= 0 ? "left" : "right";
  const extent = rideableOuterExtent(edge.profile.crossSection, side);
  const normalProjection = Math.abs(outX * leftX + outZ * leftZ);
  if (normalProjection <= EPSILON) return null;
  const distance = Math.max(0, centerDistance - extent / normalProjection);
  const target = targetSurface(edge.profile.crossSection[side]);
  const targetVariant = target.variant === "center" ? "center" : `${side}-${target.variant}`;
  return Object.freeze({
    edge,
    kind: "road-side",
    side,
    targetSurfaceKind: target.kind,
    targetSurfaceId: canonicalTupleKey(["road-surface", edge.id, targetVariant]),
    targetX: port.worldCenterXZ[0] + outX * distance,
    targetZ: port.worldCenterXZ[1] + outZ * distance,
    targetY: target.y,
    distance,
    score: distance,
  });
}

function stubCandidate(
  port: WorldEntrancePortMetadata,
  edge: Readonly<RoadEdge>,
  nodes: ReadonlyMap<string, Readonly<RoadNode>>,
): TargetCandidate | null {
  const frame = edgeFrame(edge, nodes);
  const outX = port.worldOutwardXZ[0];
  const outZ = port.worldOutwardXZ[1];
  if (Math.abs(outX * frame.dx + outZ * frame.dz) < 1 - EPSILON) return null;
  let selected: { node: Readonly<RoadNode>; side: "end-a" | "end-b"; along: number; lateral: number } | null = null;
  for (const [node, side] of [[frame.a, "end-a"], [frame.b, "end-b"]] as const) {
    const vx = node.x - port.worldCenterXZ[0];
    const vz = node.z - port.worldCenterXZ[1];
    const along = vx * outX + vz * outZ;
    const lateral = Math.abs(cross(vx, vz, outX, outZ));
    if (along <= EPSILON) continue;
    if (!selected || along < selected.along || (along === selected.along && side < selected.side)) {
      selected = { node, side, along, lateral };
    }
  }
  if (!selected) return null;
  const corridorHalf = Math.max(
    centerHalf(edge.profile.crossSection) + sideWidth(edge.profile.crossSection.left),
    centerHalf(edge.profile.crossSection) + sideWidth(edge.profile.crossSection.right),
  );
  if (selected.lateral > Math.max(port.widthMeters * 0.5, corridorHalf) + EPSILON) return null;
  return Object.freeze({
    edge,
    kind: "stub-end",
    side: selected.side,
    targetSurfaceKind: "asphalt",
    targetSurfaceId: canonicalTupleKey(["road-surface", edge.id, "center"]),
    targetX: selected.node.x,
    targetZ: selected.node.z,
    targetY: 0,
    distance: Math.hypot(
      selected.node.x - port.worldCenterXZ[0],
      selected.node.z - port.worldCenterXZ[1],
    ),
    score: selected.along + selected.lateral,
  });
}

function nearestRoad(
  port: WorldEntrancePortMetadata,
  graph: Readonly<CityRoadGraph>,
) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidates = graph.edges.flatMap((edge) => {
    const side = sideCandidate(port, edge, nodes);
    const stub = stubCandidate(port, edge, nodes);
    return [side, stub].filter((candidate): candidate is TargetCandidate => candidate !== null);
  });
  candidates.sort((left, right) => left.score - right.score
    || (left.kind === right.kind ? 0 : left.kind === "road-side" ? -1 : 1)
    || left.edge.id.localeCompare(right.edge.id));
  return candidates[0] ?? null;
}

function segmentAtTarget(
  port: WorldEntrancePortMetadata,
  target: TargetCandidate,
): readonly [number, number, number, number] {
  const site = port.worldSegmentXZ;
  const centerX = (site[0] + site[2]) * 0.5;
  const centerZ = (site[1] + site[3]) * 0.5;
  const shiftX = target.targetX - centerX;
  const shiftZ = target.targetZ - centerZ;
  return Object.freeze([
    site[0] + shiftX, site[1] + shiftZ,
    site[2] + shiftX, site[3] + shiftZ,
  ] as const);
}

function chunksForQuad(quad: readonly number[]): readonly DrivewayChunkRef[] {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const zs = [quad[1], quad[3], quad[5], quad[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const firstX = Math.floor((minX + EPSILON) / CITY_SURFACE_CHUNK_SIZE_METERS);
  const lastX = Math.floor((maxX - EPSILON) / CITY_SURFACE_CHUNK_SIZE_METERS);
  const firstZ = Math.floor((minZ + EPSILON) / CITY_SURFACE_CHUNK_SIZE_METERS);
  const lastZ = Math.floor((maxZ - EPSILON) / CITY_SURFACE_CHUNK_SIZE_METERS);
  const chunks: DrivewayChunkRef[] = [];
  for (let chunkX = Math.min(firstX, lastX); chunkX <= Math.max(firstX, lastX); chunkX += 1) {
    for (let chunkZ = Math.min(firstZ, lastZ); chunkZ <= Math.max(firstZ, lastZ); chunkZ += 1) {
      chunks.push(Object.freeze({
        chunkX,
        chunkZ,
        chunkKey: canonicalTupleKey(["road-chunk", chunkX, chunkZ]),
      }));
    }
  }
  return Object.freeze(chunks);
}

function splitPortAtChunkBoundaries(
  port: WorldEntrancePortMetadata,
  drivewayId: string,
) {
  const [ax, az, bx, bz] = port.worldSegmentXZ;
  const dx = bx - ax;
  const dz = bz - az;
  const cuts = [0, 1];
  const addAxisCuts = (start: number, delta: number) => {
    if (Math.abs(delta) <= EPSILON) return;
    const min = Math.min(start, start + delta);
    const max = Math.max(start, start + delta);
    const firstLine = Math.floor(min / CITY_SURFACE_CHUNK_SIZE_METERS) + 1;
    const lastLine = Math.ceil(max / CITY_SURFACE_CHUNK_SIZE_METERS) - 1;
    for (let line = firstLine; line <= lastLine; line += 1) {
      const value = line * CITY_SURFACE_CHUNK_SIZE_METERS;
      const t = (value - start) / delta;
      if (t > EPSILON && t < 1 - EPSILON) cuts.push(t);
    }
  };
  addAxisCuts(ax, dx);
  addAxisCuts(az, dz);
  cuts.sort((left, right) => left - right);
  const unique = cuts.filter((cut, index) => index === 0 || Math.abs(cut - cuts[index - 1]) > EPSILON);
  const records: Array<{
    chunkX: number;
    chunkZ: number;
    segment: readonly [number, number, number, number];
    identity: string;
  }> = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const t0 = unique[index];
    const t1 = unique[index + 1];
    if (t1 - t0 <= EPSILON) continue;
    const mid = (t0 + t1) * 0.5;
    const sampleX = ax + dx * mid + port.worldOutwardXZ[0] * CHUNK_NUDGE_METERS;
    const sampleZ = az + dz * mid + port.worldOutwardXZ[1] * CHUNK_NUDGE_METERS;
    const chunkX = Math.floor(sampleX / CITY_SURFACE_CHUNK_SIZE_METERS);
    const chunkZ = Math.floor(sampleZ / CITY_SURFACE_CHUNK_SIZE_METERS);
    const segment = Object.freeze([
      ax + dx * t0, az + dz * t0,
      ax + dx * t1, az + dz * t1,
    ] as const);
    records.push({
      chunkX,
      chunkZ,
      segment,
      identity: canonicalTupleKey(["entrance-driveway-surface", drivewayId, chunkX, chunkZ]),
    });
  }
  return Object.freeze(records);
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

function allocateStableSurfaceKeys(identityKeys: readonly string[], occupied: readonly number[]) {
  const used = new Set<number>([NO_SURFACE_KEY, IMPLICIT_GROUND_SURFACE_KEY, ...occupied]);
  const result = new Map<string, number>();
  for (const identity of [...new Set(identityKeys)].sort()) {
    let candidate = fnv1a32(identity);
    while (used.has(candidate)) candidate = (candidate + 1) >>> 0;
    used.add(candidate);
    result.set(identity, candidate);
  }
  return result;
}

export function deriveCityEntrances(
  document: CityMapDocumentSnapshot,
  options: CityEntranceDeriveOptions = {},
): CityEntranceDerivation {
  const maxConnectionMeters = options.maxConnectionMeters ?? DEFAULT_MAX_CONNECTION_METERS;
  if (!Number.isFinite(maxConnectionMeters) || maxConnectionMeters <= 0) {
    throw new TypeError("maxConnectionMeters must be a finite positive number");
  }
  const graph = splitRoadGraphAtIntersections(structuredClone(document.graph) as CityRoadGraph);
  const ports: WorldEntrancePortMetadata[] = [];
  for (const placement of document.placements) {
    if (placement.poseKind === "legacy-massing") continue;
    const entry = getCatalogEntry(placement.catalogId);
    if (!entry?.entrances?.length) continue;
    const internalRoads = new Map((entry.internalRoads ?? []).map((road) => [road.name, road]));
    for (const entrance of entry.entrances) {
      const internalRoad = entrance.connectsInternalRoad
        ? internalRoads.get(entrance.connectsInternalRoad)
        : undefined;
      if (!internalRoad) continue;
      ports.push(worldPort(placement, entrance, internalRoad));
    }
  }
  ports.sort((left, right) => left.placementId.localeCompare(right.placementId)
    || left.entranceId.localeCompare(right.entranceId));

  const pending: PendingDriveway[] = [];
  const unconnected: UnconnectedCityEntrance[] = [];
  for (const port of ports) {
    const target = nearestRoad(port, graph);
    if (!target) {
      unconnected.push(Object.freeze({ port, reason: "no-forward-road", nearestDistanceMeters: null }));
      continue;
    }
    if (target.distance > maxConnectionMeters) {
      unconnected.push(Object.freeze({
        port,
        reason: "road-too-far",
        nearestDistanceMeters: target.distance,
      }));
      continue;
    }
    const id = canonicalTupleKey(["entrance-driveway", port.placementId, port.entranceId]);
    const drivewayRoadSurfaceId = canonicalTupleKey([
      "entrance-driveway-surface",
      port.placementId,
      port.entranceId,
    ]);
    const roadSegmentXZ = segmentAtTarget(port, target);
    const quadXZ = Object.freeze([
      port.worldSegmentXZ[0], port.worldSegmentXZ[1],
      port.worldSegmentXZ[2], port.worldSegmentXZ[3],
      roadSegmentXZ[2], roadSegmentXZ[3],
      roadSegmentXZ[0], roadSegmentXZ[1],
    ] as const);
    pending.push(Object.freeze({
      port,
      target,
      id,
      drivewayRoadSurfaceId,
      roadSegmentXZ,
      quadXZ,
      affectedChunks: chunksForQuad(quadXZ),
      clippedPortSegments: splitPortAtChunkBoundaries(port, id),
    }));
  }

  const roadSources = deriveRoadCollisionSources(graph);
  const keyByIdentity = allocateStableSurfaceKeys(
    pending.flatMap((item) => item.clippedPortSegments.map((segment) => segment.identity)),
    roadSources.surfaces.map((surface) => surface.localSurfaceKey),
  );
  const driveways: DerivedCityDriveway[] = pending.map((item) => {
    const roadPortSources = item.clippedPortSegments.map((segment) => {
      const sourceId = canonicalTupleKey([
        "entrance-port-source",
        item.port.placementId,
        item.port.entranceId,
        segment.chunkX,
        segment.chunkZ,
      ]);
      const source: RoadEntrancePortSource = Object.freeze({
        placementId: item.port.placementId,
        entranceId: item.port.entranceId,
        localSurfaceKey: keyByIdentity.get(segment.identity)!,
        worldSegmentXZ: segment.segment,
        worldOutwardXZ: Object.freeze([
          -item.port.worldOutwardXZ[0],
          -item.port.worldOutwardXZ[1],
        ] as const),
      });
      return Object.freeze({
        chunkX: segment.chunkX,
        chunkZ: segment.chunkZ,
        roadSurfaceId: item.drivewayRoadSurfaceId,
        sourceId,
        source,
      });
    });
    const groupId = canonicalTupleKey(["entrance", item.port.placementId, item.port.entranceId]);
    const stitchPlan: EntranceStitchPlan = Object.freeze({
      placementId: item.port.placementId,
      entranceId: item.port.entranceId,
      groupId,
      transitionProfileId: "smooth",
      templateWorldSegmentXZ: item.port.worldSegmentXZ,
      templateWorldOutwardXZ: item.port.worldOutwardXZ,
      roadWorldOutwardXZ: Object.freeze([
        -item.port.worldOutwardXZ[0],
        -item.port.worldOutwardXZ[1],
      ] as const),
      roadPortSourceIds: Object.freeze(roadPortSources.map((source) => source.sourceId)),
      requiresResolvedTemplatePort: true,
    });
    return Object.freeze({
      id: item.id,
      placementId: item.port.placementId,
      catalogId: item.port.catalogId,
      entranceId: item.port.entranceId,
      internalRoadName: item.port.internalRoadName,
      connectionKind: item.target.kind,
      roadEdgeId: item.target.edge.id,
      roadSide: item.target.side,
      roadTargetSurfaceKind: item.target.targetSurfaceKind,
      roadTargetSurfaceId: item.target.targetSurfaceId,
      drivewayRoadSurfaceId: item.drivewayRoadSurfaceId,
      surfaceProfileId: "driveway",
      widthMeters: item.port.widthMeters,
      lengthMeters: item.target.distance,
      siteSegmentXZ: item.port.worldSegmentXZ,
      roadSegmentXZ: item.roadSegmentXZ,
      worldQuadXZ: item.quadXZ,
      roadTargetY: item.target.targetY,
      affectedChunks: item.affectedChunks,
      roadPortSources: Object.freeze(roadPortSources),
      stitchPlan,
    });
  });
  driveways.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    graph,
    ports: Object.freeze(ports),
    driveways: Object.freeze(driveways),
    unconnected: Object.freeze(unconnected),
  });
}

/**
 * Produces the shared road-surface view used by rendering and live riding,
 * including the generated outside driveways. The site end inherits the
 * template's authored y=0 plane; the road end reaches the selected road
 * surface, so a sidewalk connection is a smooth 0.24m ramp while ordinary
 * curb segments keep their normal bump.
 */
export function deriveCityEntranceRoadRuntime(
  document: CityMapDocumentSnapshot,
  options: CityEntranceDeriveOptions = {},
): CityEntranceRoadRuntime {
  const entrances = deriveCityEntrances(document, options);
  const base = deriveRoadCollisionSources(entrances.graph);
  const localKeys = allocateStableSurfaceKeys(
    entrances.driveways.map((driveway) => driveway.drivewayRoadSurfaceId),
    base.surfaces.map((surface) => surface.localSurfaceKey),
  );
  const drivewaySurfaces: DerivedRoadSurface[] = entrances.driveways.map((driveway) => Object.freeze({
    edgeId: driveway.id,
    side: "center" as const,
    surfaceProfileId: "driveway" as const,
    localSurfaceKey: localKeys.get(driveway.drivewayRoadSurfaceId)!,
    roadSurfaceId: driveway.drivewayRoadSurfaceId,
    y: 0,
    cornerY: Object.freeze([
      0,
      0,
      driveway.roadTargetY,
      driveway.roadTargetY,
    ] as const),
    quadXZ: driveway.worldQuadXZ,
  }));
  const surfaces = Object.freeze([...base.surfaces, ...drivewaySurfaces]);
  return Object.freeze({
    entrances,
    collisionSources: Object.freeze({
      ...base,
      surfaces,
      surfaceHandles: Object.freeze(surfaces.map(({ localSurfaceKey, roadSurfaceId }) =>
        Object.freeze({ localSurfaceKey, roadSurfaceId }))),
    }),
  });
}
