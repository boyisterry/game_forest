import assert from "node:assert/strict";
import test from "node:test";

import { emptyCityDocument } from "../app/lib/map/cityDocument.ts";
import {
  deriveCityEntrances,
  deriveCityEntranceRoadRuntime,
} from "../app/lib/map/cityEntrances.ts";
import { createImplicitGroundSurfaceSample } from "../app/lib/map/cityCollision.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { CitySurfaceIndex } from "../app/lib/map/citySurfaceIndex.ts";

function gridHospital(yaw) {
  const rotated = yaw === 90 || yaw === 270;
  const w = rotated ? 62 : 80;
  const d = rotated ? 80 : 62;
  return {
    id: `hospital-${yaw}`,
    catalogId: "hospital-campus",
    poseKind: "grid",
    i: 1100 - w / 2,
    j: 1080 - d / 2,
    yaw,
  };
}

function documentWith(placements, graph) {
  return {
    ...structuredClone(emptyCityDocument()),
    placements,
    graph,
  };
}

function crossingRoad(id, centerX, centerZ, outwardX, outwardZ, distance = 60) {
  const targetX = centerX + outwardX * distance;
  const targetZ = centerZ + outwardZ * distance;
  const tangentX = outwardZ;
  const tangentZ = -outwardX;
  return {
    nodes: [
      { id: `${id}-a`, x: targetX - tangentX * 200, z: targetZ - tangentZ * 200 },
      { id: `${id}-b`, x: targetX + tangentX * 200, z: targetZ + tangentZ * 200 },
    ],
    edge: {
      id,
      a: `${id}-a`,
      b: `${id}-b`,
      profile: createRoadProfile("two-way-1"),
    },
  };
}

function mainPort(result, placementId) {
  return result.ports.find((port) => port.placementId === placementId && port.entranceId === "main");
}

function mainDriveway(result, placementId) {
  return result.driveways.find((driveway) => driveway.placementId === placementId && driveway.entranceId === "main");
}

test("hospital entrance ports and outside driveways support all four grid yaw values", () => {
  const cases = [
    { yaw: 0, center: [0, 31], outward: [0, 1] },
    { yaw: 90, center: [31, 0], outward: [1, 0] },
    { yaw: 180, center: [0, -31], outward: [0, -1] },
    { yaw: 270, center: [-31, 0], outward: [-1, 0] },
  ];
  for (const expected of cases) {
    const placement = gridHospital(expected.yaw);
    const road = crossingRoad(
      `road-${expected.yaw}`,
      expected.center[0],
      expected.center[1],
      expected.outward[0],
      expected.outward[1],
    );
    const graph = { nodes: road.nodes, edges: [road.edge], intersectionOverrides: {} };
    const result = deriveCityEntrances(documentWith([placement], graph));
    const port = mainPort(result, placement.id);
    const driveway = mainDriveway(result, placement.id);
    assert.ok(port && driveway, `missing yaw ${expected.yaw} entrance connection`);
    assert.deepEqual(port.worldCenterXZ.map((value) => Math.round(value)), expected.center);
    assert.deepEqual(port.worldOutwardXZ.map((value) => Math.round(value)), expected.outward);
    const siteCenterX = (driveway.siteSegmentXZ[0] + driveway.siteSegmentXZ[2]) * 0.5;
    const siteCenterZ = (driveway.siteSegmentXZ[1] + driveway.siteSegmentXZ[3]) * 0.5;
    const roadCenterX = (driveway.roadSegmentXZ[0] + driveway.roadSegmentXZ[2]) * 0.5;
    const roadCenterZ = (driveway.roadSegmentXZ[1] + driveway.roadSegmentXZ[3]) * 0.5;
    assert.ok(
      (roadCenterX - siteCenterX) * expected.outward[0]
        + (roadCenterZ - siteCenterZ) * expected.outward[1] >= 0,
      "the driveway may only be generated outside the site",
    );
    assert.equal(driveway.connectionKind, "road-side");
    assert.equal(driveway.internalRoadName, "main-access");
  }
});

test("the nearest forward road wins regardless of graph edge order", () => {
  const placement = gridHospital(0);
  const near = crossingRoad("near", 0, 31, 0, 1, 60);
  const far = crossingRoad("far", 0, 31, 0, 1, 120);
  const graph = {
    nodes: [...far.nodes, ...near.nodes],
    edges: [far.edge, near.edge],
    intersectionOverrides: {},
  };
  const first = deriveCityEntrances(documentWith([placement], graph));
  const second = deriveCityEntrances(documentWith([placement], { ...graph, edges: [...graph.edges].reverse() }));
  assert.equal(mainDriveway(first, placement.id).roadEdgeId, "near");
  assert.equal(mainDriveway(second, placement.id).roadEdgeId, "near");
  assert.equal(mainDriveway(first, placement.id).id, mainDriveway(second, placement.id).id);
});

test("a parallel road endpoint produces a stable stub T connection", () => {
  const placement = gridHospital(0);
  const graph = {
    nodes: [
      { id: "stub-a", x: 0, z: 70 },
      { id: "stub-b", x: 0, z: 140 },
    ],
    edges: [{ id: "stub", a: "stub-a", b: "stub-b", profile: createRoadProfile("two-way-1") }],
    intersectionOverrides: {},
  };
  const result = deriveCityEntrances(documentWith([placement], graph));
  const driveway = mainDriveway(result, placement.id);
  assert.ok(driveway);
  assert.equal(driveway.connectionKind, "stub-end");
  assert.equal(driveway.roadSide, "end-a");
  assert.equal(driveway.roadTargetSurfaceKind, "asphalt");
  assert.deepEqual(
    [(driveway.roadSegmentXZ[0] + driveway.roadSegmentXZ[2]) * 0.5,
      (driveway.roadSegmentXZ[1] + driveway.roadSegmentXZ[3]) * 0.5],
    [0, 70],
  );
});

test("wide site ports split deterministically at 64 m road-chunk boundaries", () => {
  const placement = {
    id: "fire",
    catalogId: "fire-station",
    poseKind: "world",
    x: 64,
    z: 0,
    yawRadians: 0,
    scale: 1,
  };
  const road = crossingRoad("response-road", 64, 55, 0, 1, 60);
  const graph = { nodes: road.nodes, edges: [road.edge], intersectionOverrides: {} };
  const result = deriveCityEntrances(documentWith([placement], graph));
  const driveway = result.driveways.find((item) => item.placementId === "fire" && item.entranceId === "response");
  assert.ok(driveway);
  assert.equal(driveway.widthMeters, 80);
  assert.equal(driveway.roadPortSources.length, 2);
  assert.deepEqual(driveway.roadPortSources.map((source) => source.chunkX), [0, 1]);
  assert.equal(new Set(driveway.roadPortSources.map((source) => source.source.localSurfaceKey)).size, 2);
  assert.ok(driveway.roadPortSources.every((source) => source.roadSurfaceId === driveway.drivewayRoadSurfaceId));
  assert.ok(driveway.roadPortSources.every((source) => source.source.worldOutwardXZ[1] === -1));
  assert.deepEqual(driveway.stitchPlan.roadPortSourceIds, driveway.roadPortSources.map((source) => source.sourceId));
});

test("catalog internal-road source metadata is preserved for later resolved-port staging", () => {
  const placement = gridHospital(0);
  const road = crossingRoad("city-road", 0, 31, 0, 1);
  const result = deriveCityEntrances(documentWith(
    [placement],
    { nodes: road.nodes, edges: [road.edge], intersectionOverrides: {} },
  ));
  const port = mainPort(result, placement.id);
  const driveway = mainDriveway(result, placement.id);
  assert.deepEqual(port.internalRoadSource, { kind: "mesh-group", exactName: "hospital-campus-internal-road" });
  assert.equal(port.expectedTemplateSurfaceProfileId, "site-surface");
  assert.equal(driveway.stitchPlan.transitionProfileId, "smooth");
  assert.equal(driveway.stitchPlan.requiresResolvedTemplatePort, true);
  assert.deepEqual(
    driveway.stitchPlan.roadWorldOutwardXZ,
    port.worldOutwardXZ.map((value) => -value),
  );
});

test("connections beyond the configured limit stay explicit and conservative", () => {
  const placement = gridHospital(0);
  const road = crossingRoad("far", 0, 31, 0, 1, 300);
  const result = deriveCityEntrances(
    documentWith([placement], { nodes: road.nodes, edges: [road.edge], intersectionOverrides: {} }),
    { maxConnectionMeters: 50 },
  );
  assert.equal(mainDriveway(result, placement.id), undefined);
  assert.equal(result.unconnected.find((item) => item.port.entranceId === "main")?.reason, "road-too-far");
});

test("entrance driveways are real rideable ramp surfaces shared by runtime and renderer", () => {
  const placement = gridHospital(0);
  const road = crossingRoad("city-road", 0, 31, 0, 1, 60);
  const document = documentWith(
    [placement],
    { nodes: road.nodes, edges: [road.edge], intersectionOverrides: {} },
  );
  const derived = deriveCityEntranceRoadRuntime(document);
  const driveway = mainDriveway(derived.entrances, placement.id);
  assert.ok(driveway);
  const surface = derived.collisionSources.surfaces.find(
    (candidate) => candidate.roadSurfaceId === driveway.drivewayRoadSurfaceId,
  );
  assert.ok(surface);
  assert.equal(surface.surfaceProfileId, "driveway");
  assert.deepEqual(surface.cornerY, [0, 0, 0.24, 0.24]);

  const index = new CitySurfaceIndex(derived.collisionSources, 17, 23);
  const sampleAt = (x, z, currentY, previousHandle = null) => index.sampleCitySurface(
    x,
    z,
    { currentY, previousHandle, maxStepUpMeters: 0.30 },
    createImplicitGroundSurfaceSample(),
  );
  const siteX = (driveway.siteSegmentXZ[0] + driveway.siteSegmentXZ[2]) * 0.5;
  const siteZ = (driveway.siteSegmentXZ[1] + driveway.siteSegmentXZ[3]) * 0.5;
  const roadX = (driveway.roadSegmentXZ[0] + driveway.roadSegmentXZ[2]) * 0.5;
  const roadZ = (driveway.roadSegmentXZ[1] + driveway.roadSegmentXZ[3]) * 0.5;
  const middle = sampleAt((siteX + roadX) * 0.5, (siteZ + roadZ) * 0.5, 0.12);
  assert.equal(middle.profileId, "driveway");
  assert.ok(Math.abs(middle.height - 0.12) < 1e-6);
  assert.ok(middle.normalY > Math.cos(Math.PI / 6), "driveway remains below the 30° rideable limit");
  const nearRoad = sampleAt(
    siteX * 0.05 + roadX * 0.95,
    siteZ * 0.05 + roadZ * 0.95,
    middle.height,
    middle.handle,
  );
  assert.equal(nearRoad.handle.kind, "road");
  assert.equal(nearRoad.handle.roadSurfaceId, driveway.drivewayRoadSurfaceId);
  assert.ok(nearRoad.height > middle.height);

  const outwardX = driveway.stitchPlan.templateWorldOutwardXZ[0];
  const outwardZ = driveway.stitchPlan.templateWorldOutwardXZ[1];
  const sidewalk = sampleAt(roadX + outwardX * 3, roadZ + outwardZ * 3, 0.24);
  assert.equal(sidewalk.profileId, "sidewalk");
  assert.equal(index.findEarliestBoundaryCrossing(
    roadX + outwardX * 3,
    roadZ + outwardZ * 3,
    -outwardX * 6,
    -outwardZ * 6,
    sidewalk,
  ), null, "the driveway masks the underlying curb when leaving the sidewalk");
  const drivewayBeforeRoad = sampleAt(
    roadX - outwardX * 3,
    roadZ - outwardZ * 3,
    0.24,
  );
  assert.equal(index.findEarliestBoundaryCrossing(
    roadX - outwardX * 3,
    roadZ - outwardZ * 3,
    outwardX * 6,
    outwardZ * 6,
    drivewayBeforeRoad,
  ), null, "the driveway masks the underlying curb when entering the sidewalk");

  const tangentX = (driveway.siteSegmentXZ[2] - driveway.siteSegmentXZ[0]) / driveway.widthMeters;
  const tangentZ = (driveway.siteSegmentXZ[3] - driveway.siteSegmentXZ[1]) / driveway.widthMeters;
  const ordinaryX = roadX + tangentX * (driveway.widthMeters + 2);
  const ordinaryZ = roadZ + tangentZ * (driveway.widthMeters + 2);
  const ordinarySidewalk = sampleAt(
    ordinaryX + outwardX * 3,
    ordinaryZ + outwardZ * 3,
    0.24,
  );
  const ordinaryCurb = index.findEarliestBoundaryCrossing(
    ordinaryX + outwardX * 3,
    ordinaryZ + outwardZ * 3,
    -outwardX * 6,
    -outwardZ * 6,
    ordinarySidewalk,
  );
  assert.equal(ordinaryCurb?.kind, "road-curb");
  assert.equal(ordinaryCurb?.bumpStrength, 1, "curb outside the driveway keeps the strong bump");
});
