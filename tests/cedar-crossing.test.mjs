import assert from "node:assert/strict";
import test from "node:test";

import { createCedarCrossingDocument } from "../app/lib/map/cedarCrossing.ts";
import { getCatalogEntry } from "../app/lib/map/cityCatalog.ts";
import { parseCityMapDocument } from "../app/lib/map/cityDocument.ts";
import { deriveCityEntrances, deriveCityEntranceRoadRuntime } from "../app/lib/map/cityEntrances.ts";
import { deriveTrafficSignalPlacements } from "../app/lib/map/citySignals.ts";
import { CITY_TILE_ORIGIN_X, CITY_TILE_ORIGIN_Z } from "../app/lib/map/cityTiles.ts";

function pointInQuad(quad, x, z) {
  let positive = false;
  let negative = false;
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    const cross = (quad[next * 2] - quad[index * 2]) * (z - quad[index * 2 + 1])
      - (quad[next * 2 + 1] - quad[index * 2 + 1]) * (x - quad[index * 2]);
    if (cross > 1e-7) positive = true;
    if (cross < -1e-7) negative = true;
  }
  return !(positive && negative);
}

function reachableNodeIds(document) {
  const adjacency = new Map(document.graph.nodes.map((node) => [node.id, []]));
  for (const edge of document.graph.edges) {
    adjacency.get(edge.a).push(edge.b);
    adjacency.get(edge.b).push(edge.a);
  }
  const first = document.graph.nodes[0].id;
  const visited = new Set([first]);
  const queue = [first];
  while (queue.length > 0) {
    for (const next of adjacency.get(queue.shift())) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

test("Cedar Crossing is deterministic, frozen and round-trips as a city document", () => {
  const first = createCedarCrossingDocument();
  const second = createCedarCrossingDocument();
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.graph.edges));
  assert.ok(Object.isFrozen(first.placements));
  assert.deepEqual(parseCityMapDocument(JSON.parse(JSON.stringify(first))).document, first);
});

test("Cedar Crossing uses a connected hierarchy of arterial and local streets", () => {
  const document = createCedarCrossingDocument();
  assert.equal(document.graph.nodes.length, 36);
  assert.equal(document.graph.edges.length, 56);
  assert.equal(reachableNodeIds(document).size, document.graph.nodes.length);
  assert.deepEqual(
    [...new Set(document.graph.edges.map((edge) => edge.profile.presetId))].sort(),
    ["two-way-1", "two-way-2", "two-way-3"],
  );
  for (const edge of document.graph.edges) {
    assert.equal(edge.profile.source, "preset");
    assert.ok(edge.profile.crossSection.left.sidewalkWidth > 0, `${edge.id} needs a left sidewalk`);
    assert.ok(edge.profile.crossSection.right.sidewalkWidth > 0, `${edge.id} needs a right sidewalk`);
  }
});

test("Cedar Crossing fills every city band with scenes, neighbourhoods and street life", () => {
  const document = createCedarCrossingDocument();
  assert.equal(document.placements.length, 126);
  assert.ok(document.placements.every((placement) => placement.poseKind === "grid"));
  const counts = { scene: 0, building: 0, decoration: 0 };
  const ids = new Set();
  for (const placement of document.placements) {
    assert.equal(ids.has(placement.id), false, `duplicate placement ${placement.id}`);
    ids.add(placement.id);
    const entry = getCatalogEntry(placement.catalogId);
    assert.ok(entry, `missing catalog entry ${placement.catalogId}`);
    counts[entry.category] += 1;
  }
  assert.deepEqual(counts, { scene: 14, building: 18, decoration: 94 });
  for (const catalogId of [
    "technology-park", "food-processing-plant", "mechanized-factory",
    "school-campus", "hospital-campus", "fire-station", "city-center",
    "shopping-mall", "city-park", "sports-center",
    "standard-residential-community", "luxury-villa-community", "residential-community",
    "office-campus", "high-rise-residential",
    "residential-building", "small-villa", "street-light", "street-tree",
    "roadside-planter", "food-truck", "hot-dog-kiosk", "newsstand", "phone-booth",
  ]) {
    assert.ok(document.placements.some((placement) => placement.catalogId === catalogId), catalogId);
  }
  for (const requiredDistrict of [
    "cedar-industrial-technology",
    "cedar-industrial-food",
    "cedar-industrial-mechanized",
    "cedar-public-fire",
    "cedar-public-hospital",
    "cedar-public-school",
    "cedar-residential-standard",
    "cedar-residential-luxury",
    "cedar-residential-complete",
    "cedar-commerce-mall",
    "cedar-commerce-community",
    "cedar-civic-centre",
    "cedar-civic-park",
  ]) {
    assert.ok(document.placements.some((placement) => placement.id === requiredDistrict), requiredDistrict);
  }
  assert.equal(document.placements.filter((placement) => placement.catalogId === "fire-station").length, 1);
});

test("editor-native scenes form industrial, public, residential, and mixed-use blocks", () => {
  const document = createCedarCrossingDocument();
  const catalogById = new Map(document.placements.map((placement) => [placement.id, placement.catalogId]));
  assert.deepEqual(
    ["cedar-industrial-technology", "cedar-industrial-food", "cedar-industrial-mechanized"]
      .map((id) => catalogById.get(id)),
    ["technology-park", "food-processing-plant", "mechanized-factory"],
  );
  assert.deepEqual(
    ["cedar-residential-standard", "cedar-residential-luxury", "cedar-residential-complete"]
      .map((id) => catalogById.get(id)),
    ["standard-residential-community", "luxury-villa-community", "residential-community"],
  );
  assert.deepEqual(
    ["cedar-commerce-mall", "cedar-commerce-community"].map((id) => catalogById.get(id)),
    ["shopping-mall", "standard-residential-community-5-rows"],
  );
  assert.deepEqual(
    ["cedar-public-hospital", "cedar-public-fire", "cedar-public-school", "cedar-public-sports"]
      .map((id) => catalogById.get(id)),
    ["hospital-campus", "fire-station", "school-campus", "sports-center"],
  );

  const nodes = new Map(document.graph.nodes.map((node) => [node.id, node]));
  const lineLength = (axis, value) => document.graph.edges.reduce((total, edge) => {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (axis === "z" && a.z === value && b.z === value) return total + Math.abs(b.x - a.x);
    if (axis === "x" && a.x === value && b.x === value) return total + Math.abs(b.z - a.z);
    return total;
  }, 0);
  for (const z of [-1000, -700, -380, -60, 280, 600, 820]) assert.equal(lineLength("z", z), 2000);
  for (const x of [-1000, 0, 1000]) assert.equal(lineLength("x", x), 1820);
});

test("street furniture uses editor placements fully contained by real sidewalks", () => {
  const document = createCedarCrossingDocument();
  const sidewalks = deriveCityEntranceRoadRuntime(document).collisionSources.surfaces
    .filter((surface) => surface.surfaceProfileId === "sidewalk");
  const catalogIds = new Set([
    "street-light",
    "park-street-light",
    "street-tree",
    "roadside-planter",
    "food-truck",
    "hot-dog-kiosk",
    "newsstand",
    "phone-booth",
  ]);
  const counts = new Map();
  for (const placement of document.placements.filter((item) => catalogIds.has(item.catalogId))) {
    const entry = getCatalogEntry(placement.catalogId);
    assert.equal(entry.snap, "road-verge", placement.catalogId);
    const base = entry.footprintOverride;
    const rotated = placement.yaw === 90 || placement.yaw === 270;
    const width = rotated ? base.d : base.w;
    const depth = rotated ? base.w : base.d;
    const minX = CITY_TILE_ORIGIN_X + placement.i;
    const minZ = CITY_TILE_ORIGIN_Z + placement.j;
    const corners = [
      [minX, minZ],
      [minX + width, minZ],
      [minX + width, minZ + depth],
      [minX, minZ + depth],
    ];
    assert.ok(sidewalks.some((surface) =>
      corners.every(([x, z]) => pointInQuad(surface.quadXZ, x, z))),
    `${placement.id} must fit completely on one sidewalk surface`);
    counts.set(placement.catalogId, (counts.get(placement.catalogId) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    "street-light": 46,
    "street-tree": 28,
    "park-street-light": 4,
    "roadside-planter": 4,
    "food-truck": 3,
    "hot-dog-kiosk": 3,
    newsstand: 3,
    "phone-booth": 3,
  });
});

test("all authored scene entrances connect to rideable roads and traffic lights are derived", () => {
  const document = createCedarCrossingDocument();
  const entrances = deriveCityEntrances(document);
  assert.equal(entrances.unconnected.length, 0);
  assert.equal(entrances.ports.length, 20);
  assert.equal(entrances.driveways.length, 20);
  assert.ok(entrances.driveways.every((driveway) => driveway.lengthMeters === 1),
    "every authored gate must sit exactly one metre behind its sidewalk");
  const runtime = deriveCityEntranceRoadRuntime(document);
  assert.ok(runtime.collisionSources.surfaces.some((surface) => surface.surfaceProfileId === "sidewalk"));
  assert.ok(runtime.collisionSources.surfaces.some((surface) => surface.surfaceProfileId === "driveway"));
  assert.ok(runtime.collisionSources.markings.some((marking) => marking.kind === "double-center"));
  assert.ok(runtime.collisionSources.markings.some((marking) => marking.kind === "motor-lane-divider"));
  assert.ok(runtime.collisionSources.markings.some((marking) => marking.kind === "bike-lane-boundary"));
  assert.ok(runtime.collisionSources.bikeLaneArrows.length > 0);
  const signals = deriveTrafficSignalPlacements(document);
  assert.equal(signals.enabledNodeIds.length, 31);
  assert.equal(signals.placements.length, 102);
  assert.equal(signals.placements.length, runtime.collisionSources.crosswalks.length);
  for (const signal of signals.placements) {
    const sidewalk = runtime.collisionSources.surfaces.find((surface) =>
      surface.edgeId === signal.approachEdgeId
      && surface.side === signal.sourceRoadSide
      && surface.surfaceProfileId === "sidewalk");
    assert.ok(sidewalk, `missing signal sidewalk for ${signal.approachEdgeId}`);
    const xs = [sidewalk.quadXZ[0], sidewalk.quadXZ[2], sidewalk.quadXZ[4], sidewalk.quadXZ[6]];
    const zs = [sidewalk.quadXZ[1], sidewalk.quadXZ[3], sidewalk.quadXZ[5], sidewalk.quadXZ[7]];
    assert.ok(signal.x >= Math.min(...xs) && signal.x <= Math.max(...xs));
    assert.ok(signal.z >= Math.min(...zs) && signal.z <= Math.max(...zs));
  }
});
