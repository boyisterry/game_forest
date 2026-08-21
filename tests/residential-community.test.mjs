import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyResidentialCommunity } from "../app/lib/map/residentialCommunity.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

function worldBounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function overlapsXZ(a, b, tolerance = 0.05) {
  return a.min.x < b.max.x - tolerance
    && a.max.x > b.min.x + tolerance
    && a.min.z < b.max.z - tolerance
    && a.max.z > b.min.z + tolerance;
}

function overlaps3D(a, b, tolerance = 0.02) {
  return overlapsXZ(a, b, tolerance)
    && a.min.y < b.max.y - tolerance
    && a.max.y > b.min.y + tolerance;
}

function pointInsideXZ(point, bounds, clearance = 0.35) {
  return point.x > bounds.min.x - clearance
    && point.x < bounds.max.x + clearance
    && point.z > bounds.min.z - clearance
    && point.z < bounds.max.z + clearance;
}

function distanceXZ(a, b) {
  const xGap = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const zGap = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(xGap, zGap);
}

function assertPairwiseDisjoint(objects, label, overlap = overlaps3D) {
  for (let first = 0; first < objects.length; first += 1) {
    for (let second = first + 1; second < objects.length; second += 1) {
      assert.equal(overlap(worldBounds(objects[first]), worldBounds(objects[second])), false, `${label} ${first + 1} and ${second + 1} should remain separate`);
    }
  }
}

test("builds one complete community with three distinct planning zones", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.name, "city-residential-community-lowpoly");
  assert.equal(community.userData.modelType, "residential-community");
  assert.equal(community.userData.generatedLocally, true);
  assert.deepEqual(community.userData.zones, ["residential", "commercial", "kindergarten"]);
  assert.ok(community.getObjectByName("residential-community-main-gate"));
  assert.ok(community.getObjectByName("residential-community-commercial-street"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-gate"));
  assert.equal(namedObjects(community, "residential-community-fire-lane").length, 4);
});

test("connects the main gate through a 13 metre commercial arcade with protected footways", () => {
  const community = buildLowPolyResidentialCommunity();
  const commercial = community.getObjectByName("residential-community-commercial-street");
  const mainGate = community.getObjectByName("residential-community-main-gate");
  const arrivalLane = community.getObjectByName("residential-community-main-arrival-lane");
  const arrivalWalks = namedObjects(community, "residential-community-main-arrival-walk");
  const fireLanes = namedObjects(community, "residential-community-fire-lane");
  const publicRoad = community.getObjectByName("residential-community-public-road");
  const arcadeWalls = namedObjects(community, "residential-community-commercial-arcade-side-wall").sort((a, b) => a.getWorldPosition(new THREE.Vector3()).x - b.getWorldPosition(new THREE.Vector3()).x);

  assert.equal(mainGate.userData.controlledAccess, true);
  assert.equal(mainGate.userData.clearWidth, 12);
  assert.equal(commercial.userData.arcadeClearWidth, 13);
  assert.equal(commercial.userData.directlyConnectsMainGate, true);
  assert.equal(arcadeWalls.length, 2);
  assert.equal(arcadeWalls[1].position.x - arcadeWalls[0].position.x, 13);
  assert.equal(community.getObjectByName("residential-community-commercial-arcade-upper-bridge").userData.minimumClearanceBelow, 4.3);

  assert.equal(arrivalLane.userData.connectsFireLaneToPublicRoad, true);
  assert.ok(arrivalLane.userData.clearWidth >= 7);
  assert.equal(arrivalWalks.length, 2);
  assert.ok(arrivalWalks.every((walk) => walk.userData.barrierFree && walk.userData.protectedFromVehicles && walk.userData.clearWidth >= 2.2));
  assert.ok(fireLanes.some((road) => overlapsXZ(worldBounds(arrivalLane), worldBounds(road))), "arrival lane should meet the residential fire loop");
  assert.ok(overlapsXZ(worldBounds(arrivalLane), worldBounds(publicRoad)), "arrival lane should reach the public road");
  assert.ok(arrivalWalks.every((walk) => !overlapsXZ(worldBounds(walk), worldBounds(arrivalLane))), "both arrival footways should remain physically protected from cars");

  const circulationBounds = [worldBounds(arrivalLane), ...arrivalWalks.map(worldBounds)];
  const leftWall = worldBounds(arcadeWalls[0]);
  const rightWall = worldBounds(arcadeWalls[1]);
  assert.ok(circulationBounds.every((bounds) => bounds.min.x >= leftWall.max.x && bounds.max.x <= rightWall.min.x), "vehicle and pedestrian arrival routes should fit inside the open arcade");
});

test("provides a complete mixed residential compound and everyday services", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.residentialBuildingCount, 8);
  assert.equal(community.userData.highRiseCount, 4);
  assert.equal(community.userData.midRiseCount, 4);
  assert.equal(community.userData.householdCount, 368);
  assert.equal(namedObjects(community, "residential-community-high-rise-1").length, 1);
  assert.equal(namedObjects(community, "residential-community-mid-rise-4").length, 1);
  assert.ok(community.getObjectByName("residential-community-central-garden"));
  assert.ok(community.getObjectByName("residential-community-children-playground"));
  assert.ok(community.getObjectByName("residential-community-senior-fitness-area"));
  assert.ok(community.getObjectByName("residential-community-parcel-station"));
  assert.ok(community.getObjectByName("residential-community-parcel-lockers"));
  assert.ok(community.getObjectByName("residential-community-waste-sorting-station"));
  assert.equal(namedObjects(community, "residential-community-underground-garage-ramp").length, 2);
  assert.equal(community.userData.garageEntranceCount, 2);
  assert.equal(community.getObjectByName("residential-community-high-rise-1").scale.y, 1.7);
  assert.equal(community.getObjectByName("residential-community-mid-rise-1").scale.y, 1.85);
});

test("routes residential paths between buildings and keeps service pockets out of the fire lane", () => {
  const community = buildLowPolyResidentialCommunity();
  const paths = namedObjects(community, "residential-community-pedestrian-path");
  const expectedRoles = new Set([
    "residential-main-spine",
    "residential-secondary-spine",
    "high-rise-south-entry-walk",
    "high-rise-north-entry-walk",
    "mid-rise-south-entry-walk",
    "mid-rise-middle-entry-walk",
    "residential-north-promenade",
    "residential-gate-walk",
  ]);
  assert.equal(paths.length, expectedRoles.size);
  assert.deepEqual(new Set(paths.map((path) => path.userData.role)), expectedRoles);
  assert.ok(paths.every((path) => path.userData.barrierFree && path.userData.clearWidth >= 3));

  const homes = [
    ...Array.from({ length: 4 }, (_, index) => community.getObjectByName(`residential-community-high-rise-${index + 1}`)),
    ...Array.from({ length: 4 }, (_, index) => community.getObjectByName(`residential-community-mid-rise-${index + 1}`)),
  ];
  assert.ok(homes.every((home) => home.userData.frontDirection === "+z"));
  const longSpines = paths.filter((path) => path.userData.role === "residential-main-spine" || path.userData.role === "residential-secondary-spine");
  assert.equal(longSpines.length, 2);
  for (const path of longSpines) {
    assert.ok(homes.every((home) => !overlapsXZ(worldBounds(path), worldBounds(home))), `${path.userData.role} should occupy the gap between homes, not the former through-building line`);
  }

  const buildingAccesses = namedObjects(community, "residential-community-building-access");
  assert.equal(buildingAccesses.length, 8);
  assert.ok(buildingAccesses.every((entry) => entry.userData.barrierFree && entry.userData.maximumGradient === "1:12"));
  assert.equal(namedObjects(community, "residential-community-building-access-ramp").length, 8);
  assert.ok(namedObjects(community, "residential-community-building-entry-support").every((support) => support.userData.grounded));

  const fireLanes = namedObjects(community, "residential-community-fire-lane").map(worldBounds);
  const serviceObjects = [
    community.getObjectByName("residential-community-senior-fitness-area"),
    community.getObjectByName("residential-community-parcel-station"),
    community.getObjectByName("residential-community-waste-sorting-station"),
  ];
  for (const service of serviceObjects) {
    assert.ok(fireLanes.every((roadBounds) => !overlapsXZ(worldBounds(service), roadBounds)), `${service.name} should stay clear of every fire lane`);
  }
});

test("grounds the garden seating and replaces placeholder recreation objects with complete equipment", () => {
  const community = buildLowPolyResidentialCommunity();
  const benches = namedObjects(community, "residential-community-garden-bench");
  const benchLegs = namedObjects(community, "residential-community-garden-bench-leg");
  assert.equal(benches.length, 6);
  assert.equal(namedObjects(community, "residential-community-garden-bench-seat").length, 6);
  assert.equal(namedObjects(community, "residential-community-garden-bench-backrest").length, 6);
  assert.equal(benchLegs.length, 12);
  assert.ok(benches.every((bench) => bench.userData.supportedByLegs && bench.userData.facesWaterFeature));
  assert.ok(benches.every((bench) => namedObjects(bench, "residential-community-garden-bench-leg").length === 2));
  assert.ok(benchLegs.every((leg) => Math.abs(worldBounds(leg).min.y - leg.userData.groundContactY) < 0.001 && leg.userData.grounded));

  const playStructure = community.getObjectByName("residential-community-play-structure");
  const slide = community.getObjectByName("residential-community-play-slide");
  assert.equal(playStructure.userData.supported, true);
  assert.equal(playStructure.userData.barrierFreeTransfer, true);
  assert.equal(namedObjects(playStructure, "residential-community-play-platform-post").length, 4);
  assert.equal(namedObjects(playStructure, "residential-community-play-guardrail").length, 3);
  assert.equal(namedObjects(playStructure, "residential-community-play-stair").length, 5);
  assert.equal(slide.userData.supportedAtPlatform, true);
  assert.equal(slide.userData.correctDownhillDirection, "+z");
  assert.equal(namedObjects(playStructure, "residential-community-play-slide-side-rail").length, 2);
  assert.ok(community.getObjectByName("residential-community-play-slide-landing"));

  const climbing = community.getObjectByName("residential-community-climbing-frame");
  const climbingSupports = namedObjects(climbing, "residential-community-climbing-frame-support");
  assert.equal(climbing.userData.groundSupported, true);
  assert.equal(climbingSupports.length, 4);
  assert.ok(climbingSupports.every((support) => support.userData.grounded && Math.abs(worldBounds(support).min.y - support.userData.groundContactY) < 0.001));
  const swing = community.getObjectByName("residential-community-play-swing");
  assert.equal(swing.userData.groundSupported, true);
  assert.equal(swing.userData.seatCount, 2);
  assert.equal(namedObjects(swing, "residential-community-play-swing-leg").length, 4);
  assert.equal(namedObjects(swing, "residential-community-play-swing-seat").length, 2);
  assert.equal(namedObjects(community, "residential-community-play-rocking-horse").length, 2);

  const fitnessEquipment = namedObjects(community, "residential-community-fitness-equipment");
  assert.equal(fitnessEquipment.length, 3);
  assert.ok(fitnessEquipment.every((equipment) => equipment.userData.grounded));
  const fitnessBases = namedObjects(community, "residential-community-fitness-equipment-base");
  assert.equal(fitnessBases.length, 3);
  assert.ok(fitnessBases.every((base) => base.userData.grounded && Math.abs(worldBounds(base).min.y - base.userData.groundContactY) < 0.001));
});

test("details both underground garage approaches with slope protection and drainage", () => {
  const community = buildLowPolyResidentialCommunity();
  const entrances = namedObjects(community, "residential-community-garage-entrance");
  const westFireLane = namedObjects(community, "residential-community-fire-lane")
    .find((road) => worldBounds(road).max.x < 0 && worldBounds(road).getSize(new THREE.Vector3()).z > 90);
  assert.equal(entrances.length, 2);
  assert.ok(westFireLane);
  assert.ok(entrances.every((entrance) => entrance.userData.entersFrom === "west-fire-lane" && entrance.userData.clearWidth >= 7.5));
  assert.equal(namedObjects(community, "residential-community-garage-ramp-portal").length, 2);
  assert.equal(namedObjects(community, "residential-community-garage-ramp-curb").length, 4);
  assert.equal(namedObjects(community, "residential-community-garage-ramp-guardrail").length, 4);
  assert.equal(namedObjects(community, "residential-community-garage-ramp-drain").length, 2);
  assert.ok(namedObjects(community, "residential-community-garage-ramp-portal").every((portal) => portal.userData.supported && portal.userData.clearHeight >= 2.4));
  assert.ok(namedObjects(community, "residential-community-underground-garage-ramp").every((ramp) => ramp.userData.maximumGradient === "1:6" && ramp.userData.downDirection === "+x"));
  assert.ok(namedObjects(community, "residential-community-garage-ramp-curb").every((curb) => curb.userData.followsRampSlope));
  assert.ok(namedObjects(community, "residential-community-garage-ramp-guardrail").every((rail) => rail.userData.followsRampSlope));
  assert.ok(namedObjects(community, "residential-community-garage-ramp-drain").every((drain) => drain.userData.transverseDrain));

  const fireLaneBounds = worldBounds(westFireLane);
  for (const entrance of entrances) {
    const ramp = namedObjects(entrance, "residential-community-underground-garage-ramp")[0];
    const portal = namedObjects(entrance, "residential-community-garage-ramp-portal")[0];
    const portalHeader = namedObjects(portal, "residential-community-garage-portal-header")[0];
    const portalPiers = namedObjects(portal, "residential-community-garage-portal-pier").sort((a, b) => a.position.z - b.position.z);
    const highEnd = ramp.localToWorld(new THREE.Vector3(-ramp.geometry.parameters.width * 0.5, ramp.geometry.parameters.height * 0.5, 0));
    const portalPosition = portal.getWorldPosition(new THREE.Vector3());
    const headerBounds = worldBounds(portalHeader);

    assert.equal(portal.userData.locatedAtHighEnd, true);
    assert.equal(portal.userData.connectsFireLane, true);
    assert.ok(Math.abs(highEnd.x - fireLaneBounds.max.x) <= 0.2, "the high end of each garage ramp should meet the west fire lane edge");
    assert.ok(Math.abs(highEnd.y - fireLaneBounds.max.y) <= 0.02, "the high end of each garage ramp should be flush with the fire lane");
    assert.ok(Math.abs(portalPosition.x - highEnd.x) <= 0.4, "the portal should stand at the high end rather than the underground low end");
    assert.ok(headerBounds.min.y - highEnd.y >= portal.userData.clearHeight - 0.02, "the portal header should preserve its declared vertical clearance above the ramp");
    const measuredClearWidth = worldBounds(portalPiers[1]).min.z - worldBounds(portalPiers[0]).max.z;
    assert.ok(measuredClearWidth >= 6, "the portal piers should preserve a practical two-way vehicle opening");
  }
});

test("cuts real openings around the commercial and kindergarten stairs instead of passing them through upper slabs", () => {
  const community = buildLowPolyResidentialCommunity();
  const commercialUpperSlab = namedObjects(community, "residential-community-commercial-floor-slab")
    .find((slab) => slab.userData.stairOpeningCount === 2);
  assert.ok(commercialUpperSlab);
  const commercialSlabPieces = namedObjects(commercialUpperSlab, "residential-community-commercial-floor-slab-piece");
  const commercialTreads = namedObjects(community, "residential-community-commercial-stair-tread");
  assert.ok(commercialSlabPieces.length >= 3);
  assert.equal(namedObjects(community, "residential-community-commercial-stair").length, 2);
  assert.ok(commercialTreads.every((tread) => commercialSlabPieces.every((piece) => !overlaps3D(worldBounds(tread), worldBounds(piece)))), "commercial stair treads should rise through two actual floor openings");

  const kindergartenUpperSlab = namedObjects(community, "residential-community-kindergarten-floor-slab")
    .find((slab) => slab.userData.stairOpening === true);
  assert.ok(kindergartenUpperSlab);
  const kindergartenSlabPieces = namedObjects(kindergartenUpperSlab, "residential-community-kindergarten-floor-slab-piece");
  const kindergartenTreads = namedObjects(community, "residential-community-kindergarten-internal-stair-tread");
  assert.ok(kindergartenSlabPieces.length >= 2);
  assert.ok(community.getObjectByName("residential-community-kindergarten-stair-landing"));
  assert.ok(kindergartenTreads.every((tread) => kindergartenSlabPieces.every((piece) => !overlaps3D(worldBounds(tread), worldBounds(piece)))), "kindergarten stair treads should rise through a real second-floor opening");
});

test("adds paved links for the two northern homes, senior fitness pocket and kindergarten playground", () => {
  const community = buildLowPolyResidentialCommunity();
  const pedestrianPaths = namedObjects(community, "residential-community-pedestrian-path");
  const northPromenade = pedestrianPaths.find((path) => path.userData.role === "residential-north-promenade");
  assert.ok(northPromenade);

  const midRiseLinks = namedObjects(community, "residential-community-mid-rise-access-link");
  assert.equal(midRiseLinks.length, 2);
  assert.deepEqual(new Set(midRiseLinks.map((link) => link.userData.buildingName)), new Set([
    "residential-community-mid-rise-3",
    "residential-community-mid-rise-4",
  ]));
  for (const link of midRiseLinks) {
    assert.equal(link.userData.barrierFree, true);
    assert.equal(link.userData.connectsAccessToPromenade, true);
    const buildingAccess = namedObjects(community, "residential-community-building-access")
      .find((entry) => entry.userData.buildingName === link.userData.buildingName);
    assert.ok(buildingAccess);
    assert.ok(distanceXZ(worldBounds(link), worldBounds(buildingAccess)) <= 0.05, `${link.userData.buildingName} paving should meet its accessible entrance`);
    assert.ok(distanceXZ(worldBounds(link), worldBounds(northPromenade)) <= 0.05, `${link.userData.buildingName} paving should meet the north promenade`);
  }

  const fitnessPath = community.getObjectByName("residential-community-fitness-access-path");
  const fitnessArea = community.getObjectByName("residential-community-senior-fitness-area");
  assert.equal(fitnessPath.userData.barrierFree, true);
  assert.equal(fitnessPath.userData.connectsFitnessToPedestrianNetwork, true);
  assert.ok(distanceXZ(worldBounds(fitnessPath), worldBounds(fitnessArea)) <= 0.05);
  assert.ok(pedestrianPaths.some((path) => distanceXZ(worldBounds(fitnessPath), worldBounds(path)) <= 0.05), "fitness paving should meet the residential pedestrian network");

  const playground = community.getObjectByName("residential-community-kindergarten-playground");
  const playgroundConnectors = namedObjects(community, "residential-community-kindergarten-playground-connector");
  assert.ok(playgroundConnectors.length >= 2);
  assert.ok(playgroundConnectors.every((connector) => connector.userData.barrierFree && connector.userData.connectsPlaygroundToPedestrianNetwork));
  assert.ok(playgroundConnectors.every((connector) => distanceXZ(worldBounds(connector), worldBounds(playground)) <= 0.05), "each kindergarten connector should physically meet the playground paving");
});

test("keeps a declared sanitation buffer between the waste station and children's play", () => {
  const community = buildLowPolyResidentialCommunity();
  const waste = community.getObjectByName("residential-community-waste-sorting-station");
  const playground = community.getObjectByName("residential-community-children-playground");
  const declaredBuffer = waste.userData.sanitationBufferFromPlayground;
  assert.ok(Number.isFinite(declaredBuffer));
  assert.ok(declaredBuffer >= 5, "the sanitation buffer should be meaningful at rabbit-rider scale");
  assert.ok(distanceXZ(worldBounds(waste), worldBounds(playground)) >= declaredBuffer - 0.05, "the physical waste/playground separation should honour the declared sanitation buffer");
});

test("opens the neighbourhood commercial street directly to the public road", () => {
  const community = buildLowPolyResidentialCommunity();
  const street = community.getObjectByName("residential-community-commercial-street");
  assert.equal(street.userData.openToPublicStreet, true);
  assert.equal(street.userData.frontDirection, "+z");
  assert.ok(community.getObjectByName("residential-community-public-road"));
  assert.ok(community.getObjectByName("residential-community-public-sidewalk"));
  assert.equal(community.userData.commercialBuildingCount, 1);
  assert.equal(community.userData.storefrontCount, 14);
  assert.equal(namedObjects(community, "residential-community-storefront").length, 14);
  assert.equal(namedObjects(community, "residential-community-storefront-glass").length, 14);
  assert.equal(namedObjects(community, "residential-community-storefront-door").length, 14);
  assert.equal(namedObjects(community, "residential-community-storefront-clear-zone").length, 14);
  assert.equal(namedObjects(community, "residential-community-store-sign").length, 14);
  assert.equal(namedObjects(community, "residential-community-store-awning").length, 14);
  assert.equal(namedObjects(community, "residential-community-commercial-interior-counter").length, 14);
  assert.equal(namedObjects(community, "residential-community-commercial-tenant-furnishing").length, 28);
  assert.ok(namedObjects(community, "residential-community-storefront").every((store) => store.userData.enterable && store.userData.clearDoorWidth >= 1.5));
  assert.ok(namedObjects(community, "residential-community-storefront-door").every((door) => door.userData.thresholdFree && door.userData.outwardFacing));
  assert.equal(namedObjects(community, "residential-community-commercial-parking-bay").length, 18);
  const roadBox = worldBounds(community.getObjectByName("residential-community-public-road"));
  const walkBox = worldBounds(community.getObjectByName("residential-community-public-sidewalk"));
  const parkingBays = namedObjects(community, "residential-community-commercial-parking-bay");
  assert.ok(parkingBays.every((bay) => {
    const box = worldBounds(bay);
    return box.min.z > walkBox.max.z && box.max.z < roadBox.min.z && bay.userData.parkingType === "parallel";
  }));
  assert.equal(parkingBays.filter((bay) => bay.userData.accessible).length, 2);

  const laybys = namedObjects(community, "residential-community-commercial-parking-layby");
  assert.equal(laybys.length, 2);
  assert.ok(laybys.every((layby) => layby.userData.grounded && Math.abs(worldBounds(layby).max.y - layby.userData.surfaceY) < 0.001));
  assert.ok(parkingBays.every((bay) => laybys.some((layby) => overlapsXZ(worldBounds(bay), worldBounds(layby)))), "every parking bay should sit on one of the two continuous lay-by slabs");
  const entranceClearances = [
    community.getObjectByName("residential-community-main-arrival-lane"),
    ...namedObjects(community, "residential-community-main-arrival-walk"),
    ...namedObjects(community, "residential-community-kindergarten-access-road"),
  ];
  assert.equal(namedObjects(community, "residential-community-kindergarten-access-road").length, 2);
  for (const parkingObject of [...parkingBays, ...laybys]) {
    assert.ok(entranceClearances.every((entry) => !overlapsXZ(worldBounds(parkingObject), worldBounds(entry))), `${parkingObject.name} should keep the residential arcade and both kindergarten access roads open`);
  }
  const tenants = new Set(namedObjects(community, "residential-community-storefront").map((store) => store.userData.tenantType));
  for (const tenant of ["supermarket", "pharmacy", "breakfast", "coffee", "restaurant", "clinic"]) assert.ok(tenants.has(tenant));
});

test("protects a fully equipped 160-child kindergarten with its own pickup flow", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.kindergartenBuildingCount, 3);
  assert.equal(community.userData.kindergartenClassroomCount, 8);
  assert.equal(community.userData.kindergartenCapacity, 160);
  assert.equal(namedObjects(community, "residential-community-kindergarten-classroom").length, 8);
  assert.equal(namedObjects(community, "residential-community-kindergarten-activity-table").length, 32);
  assert.equal(namedObjects(community, "residential-community-kindergarten-child-chair").length, 128);
  assert.ok(community.getObjectByName("residential-community-kindergarten-teaching-building"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-multipurpose-building"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-admin-kitchen"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-playground"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-running-loop"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-sandpit"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-pickup-zone"));
  const pickup = community.getObjectByName("residential-community-kindergarten-pickup-zone");
  const waitingPlaza = community.getObjectByName("residential-community-kindergarten-waiting-plaza");
  const pickupBox = worldBounds(pickup);
  const waitingBox = worldBounds(waitingPlaza);
  const publicRoadBox = worldBounds(community.getObjectByName("residential-community-public-road"));
  assert.equal(waitingPlaza.userData.protectedFromVehicles, true);
  assert.equal(pickup.userData.separatedFromWaitingPlaza, true);
  assert.equal(overlapsXZ(waitingBox, pickupBox), false, "the child waiting plaza must not occupy the vehicle drop-off lane");

  const accessRoads = namedObjects(community, "residential-community-kindergarten-access-road");
  assert.equal(accessRoads.length, 2);
  assert.deepEqual(new Set(accessRoads.map((road) => road.userData.flow)), new Set(["entry", "exit"]));
  assert.ok(accessRoads.every((road) => road.userData.oneWay && road.userData.formsLoop && road.userData.connectsPickupToPublicRoad));
  for (const accessRoad of accessRoads) {
    const accessBox = worldBounds(accessRoad);
    assert.ok(overlapsXZ(accessBox, pickupBox), `${accessRoad.userData.flow} road should join the pickup lane`);
    assert.ok(overlapsXZ(accessBox, publicRoadBox), `${accessRoad.userData.flow} road should join the public road`);
  }
  assertPairwiseDisjoint(accessRoads, "kindergarten one-way access road", overlapsXZ);

  const foundations = namedObjects(community, "residential-community-kindergarten-building-foundation");
  const floorSlabs = namedObjects(community, "residential-community-kindergarten-floor-slab");
  const windows = namedObjects(community, "residential-community-kindergarten-window");
  assert.equal(foundations.length, 3);
  assert.equal(floorSlabs.length, 4);
  assert.equal(windows.length, 22);
  assertPairwiseDisjoint(foundations, "kindergarten foundation", overlapsXZ);
  assertPairwiseDisjoint(floorSlabs, "kindergarten floor slab");
  assertPairwiseDisjoint(windows, "kindergarten window");
  for (const building of [
    community.getObjectByName("residential-community-kindergarten-teaching-building"),
    community.getObjectByName("residential-community-kindergarten-multipurpose-building"),
    community.getObjectByName("residential-community-kindergarten-admin-kitchen"),
  ]) {
    const entrance = namedObjects(building, "residential-community-kindergarten-entrance")[0];
    assert.ok(entrance);
    assert.ok(namedObjects(building, "residential-community-kindergarten-window").every((window) => !overlaps3D(worldBounds(window), worldBounds(entrance))), `${building.name} windows should leave its entrance clear`);
  }

  const tables = namedObjects(community, "residential-community-kindergarten-activity-table");
  assert.ok(tables.every((table) => table.userData.supportedToFloor && Math.abs(worldBounds(table).min.y - table.userData.groundContactY) < 0.001));
  const chairs = namedObjects(community, "residential-community-kindergarten-child-chair");
  const slabBounds = floorSlabs.map(worldBounds);
  assert.ok(chairs.every((chair) => {
    const bounds = worldBounds(chair);
    const centre = bounds.getCenter(new THREE.Vector3());
    return chair.userData.grounded && slabBounds.some((slab) => pointInsideXZ(centre, slab, 0) && Math.abs(bounds.min.y - slab.max.y) < 0.001);
  }), "every classroom chair should stand on a floor slab");

  const runningLoop = community.getObjectByName("residential-community-kindergarten-running-loop");
  const playSet = community.getObjectByName("residential-community-kindergarten-play-equipment");
  assert.equal(playSet.userData.supported, true);
  assert.equal(playSet.userData.outsideRunningLoop, true);
  assert.equal(overlapsXZ(worldBounds(playSet), worldBounds(runningLoop)), false, "the compound play set should not occupy the running loop");
  assert.equal(namedObjects(playSet, "residential-community-kindergarten-play-support").length, 4);
  assert.equal(namedObjects(playSet, "residential-community-kindergarten-play-slide-side-rail").length, 2);
  assert.equal(namedObjects(community, "residential-community-kindergarten-swing-seat").length, 2);
  assert.equal(namedObjects(community, "residential-community-kindergarten-rocking-horse").length, 2);
  const gate = community.getObjectByName("residential-community-kindergarten-gate");
  assert.equal(gate.userData.childSafe, true);
  assert.equal(gate.userData.controlledAccess, true);
  const gatePosts = namedObjects(gate, "residential-community-kindergarten-gate-post");
  const postWidth = gatePosts[0].geometry.parameters.width;
  const measuredClearWidth = gatePosts[1].position.x - gatePosts[0].position.x - postWidth;
  assert.equal(measuredClearWidth, gate.userData.clearWidth);
  assert.equal(gate.userData.measuredClearWidth, gate.userData.clearWidth);
});

test("secures residential and kindergarten zones without closing the retail frontage", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.fenceSegmentCount, 10);
  assert.equal(namedObjects(community, "residential-community-residential-fence").length, 5);
  assert.equal(namedObjects(community, "residential-community-kindergarten-fence").length, 5);
  assert.equal(community.getObjectByName("residential-community-commercial-fence"), undefined);
  const gatePanels = [
    ...namedObjects(community, "residential-community-main-gate-panel"),
    ...namedObjects(community, "residential-community-kindergarten-gate-panel"),
  ];
  assert.equal(gatePanels.length, 4);
  const mainGate = community.getObjectByName("residential-community-main-gate");
  const mainGatePiers = namedObjects(mainGate, "residential-community-gate-pier");
  assert.equal(mainGatePiers[1].position.x - mainGatePiers[0].position.x - mainGatePiers[0].geometry.parameters.width, mainGate.userData.clearWidth);
  assert.ok(gatePanels.every((panel) => panel.userData.open === false));
  community.userData.setAccessGatesOpen(true);
  assert.ok(gatePanels.every((panel) => panel.userData.open === true));
  assert.ok(namedObjects(community, "residential-community-residential-fence-post").length > 190);
  assert.ok(namedObjects(community, "residential-community-kindergarten-fence-post").length > 160);
});

test("reuses existing city decorations and keeps the rabbit rider scale", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(community.userData.scaleStandard, "rabbit-rider");
  assert.deepEqual(community.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
  ]);
  assert.equal(namedObjects(community, "residential-community-reused-tree-anchor").length, 26);
  assert.equal(namedObjects(community, "city-street-light-lowpoly").length, 18);
  assert.equal(namedObjects(community, "city-roadside-planter-lowpoly").length, 10);
  const metrics = measureModelGeometry(community);
  assert.ok(metrics.size.x >= 189);
  assert.ok(metrics.size.z >= 144);
  assert.ok(metrics.size.y >= 35);
  assert.equal(community.userData.siteSize.x, 190);
  assert.equal(community.userData.siteSize.y, 60);
  assert.equal(community.userData.siteSize.z, 145);
});

test("grounds reused furniture and keeps complete lamp, planter and tree geometry out of circulation conflicts", () => {
  const community = buildLowPolyResidentialCommunity();
  const treeAnchors = namedObjects(community, "residential-community-reused-tree-anchor");
  const streetLights = namedObjects(community, "city-street-light-lowpoly");
  const planters = namedObjects(community, "city-roadside-planter-lowpoly");
  const commercialIslands = namedObjects(community, "residential-community-commercial-light-island");
  const parkingBays = namedObjects(community, "residential-community-commercial-parking-bay");

  const commercialGroundSlabs = namedObjects(community, "residential-community-commercial-floor-slab")
    .filter((slab) => worldBounds(slab).max.y < 1);
  assert.equal(commercialGroundSlabs.length, 2);
  const buildingFootprints = [
    ...namedObjects(community, "high-rise-foundation"),
    ...namedObjects(community, "residential-building-foundation"),
    ...namedObjects(community, "residential-community-building-entry-landing"),
    ...namedObjects(community, "residential-community-building-access-ramp"),
    ...commercialGroundSlabs,
    ...namedObjects(community, "residential-community-kindergarten-building-foundation"),
    ...namedObjects(community, "residential-community-kindergarten-building-shell"),
    ...namedObjects(community, "residential-community-kindergarten-entry-platform"),
    ...namedObjects(community, "residential-community-kindergarten-entry-ramp"),
    community.getObjectByName("residential-community-parcel-station"),
    community.getObjectByName("residential-community-waste-sorting-station"),
  ];
  const exclusions = [
    community.getObjectByName("residential-community-public-road"),
    community.getObjectByName("residential-community-public-sidewalk"),
    ...namedObjects(community, "residential-community-fire-lane"),
    ...namedObjects(community, "residential-community-pedestrian-path"),
    community.getObjectByName("residential-community-main-arrival-lane"),
    ...namedObjects(community, "residential-community-main-arrival-walk"),
    community.getObjectByName("residential-community-kindergarten-pickup-zone"),
    ...namedObjects(community, "residential-community-kindergarten-access-road"),
    ...parkingBays,
    ...buildingFootprints,
    community.getObjectByName("residential-community-central-garden"),
    community.getObjectByName("residential-community-children-playground"),
    community.getObjectByName("residential-community-senior-fitness-area"),
    community.getObjectByName("residential-community-kindergarten-playground"),
    community.getObjectByName("residential-community-kindergarten-waiting-plaza"),
  ];
  assert.ok(exclusions.every(Boolean));
  const exclusionBounds = exclusions.map((object) => ({ object, bounds: worldBounds(object) }));

  assert.ok(treeAnchors.every((anchor) => anchor.userData.grounded && Math.abs(anchor.position.y - anchor.userData.surfaceY) < 0.001));
  for (const anchor of treeAnchors) {
    const point = anchor.getWorldPosition(new THREE.Vector3());
    assert.ok(exclusionBounds.every(({ bounds }) => !pointInsideXZ(point, bounds)), `tree at ${point.x}, ${point.z} should clear roads, buildings and activity surfaces`);
  }

  assert.ok(streetLights.every((light) => light.userData.grounded && Math.abs(worldBounds(light).min.y - light.userData.surfaceY) < 0.001));
  for (const light of streetLights) {
    const bounds = worldBounds(light);
    if (light.userData.zone === "commercial") {
      assert.equal(light.userData.armFaces, "+z");
      const lampDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(light.quaternion).normalize();
      assert.ok(lampDirection.dot(new THREE.Vector3(0, 0, 1)) > 0.99, "commercial lamp arms should illuminate the lay-by from their islands");
      assert.ok(commercialIslands.some((island) => pointInsideXZ(light.position, worldBounds(island), 0)), "each commercial lamp base should stand on a named light island");
      assert.ok(parkingBays.every((bay) => !overlapsXZ(bounds, worldBounds(bay))), "the complete commercial lamp, including its arm, should clear parked vehicles");
      assert.ok(exclusionBounds.every(({ object, bounds: exclusion }) => object.name === "residential-community-public-road" || !overlapsXZ(bounds, exclusion)), "a light island is the only allowed road-edge exception for a commercial lamp");
    } else {
      assert.ok(exclusionBounds.every(({ bounds: exclusion }) => !overlapsXZ(bounds, exclusion)), `the complete ${light.userData.zone} lamp, including its arm, should clear circulation and buildings`);
    }
  }

  assert.ok(planters.every((planter) => planter.userData.grounded && Math.abs(worldBounds(planter).min.y - planter.userData.surfaceY) < 0.001));
  for (const planter of planters) {
    const bounds = worldBounds(planter);
    assert.ok(exclusionBounds.every(({ bounds: exclusion }) => !overlapsXZ(bounds, exclusion)), `planter at ${planter.position.x}, ${planter.position.z} should not occupy a road, building or activity surface`);
  }
});

test("supports night lighting, residential elevators and structural cutaway", () => {
  const community = buildLowPolyResidentialCommunity();
  const storefront = namedObjects(community, "residential-community-storefront-glass")[0];
  const kindergartenWindow = namedObjects(community, "residential-community-kindergarten-window")[0];
  const lights = namedObjects(community, "street-light-point-light");
  assert.ok(storefront instanceof THREE.Mesh && kindergartenWindow instanceof THREE.Mesh);
  community.userData.setPowered(true);
  assert.ok(storefront.material.emissiveIntensity > 1);
  assert.ok(lights.every((light) => light.intensity > 0));
  community.userData.setPowered(false);
  assert.ok(lights.every((light) => light.intensity === 0));
  assert.equal(kindergartenWindow.visible, true);
  community.userData.setInteriorCutaway(true);
  assert.equal(kindergartenWindow.visible, false);
  assert.equal(community.getObjectByName("residential-community-commercial-building").visible, false);
  assert.ok(namedObjects(community, "residential-community-storefront-glass").every((pane) => !pane.visible));
  assert.ok(namedObjects(community, "residential-community-commercial-upper-window").every((pane) => !pane.visible));
  assert.ok(namedObjects(community, "residential-community-commercial-floor-slab").every((slab) => slab.visible));
  assert.equal(namedObjects(community, "residential-community-commercial-tenant-divider").length, 13);
  assert.ok(namedObjects(community, "residential-community-commercial-tenant-divider").every((divider) => divider.visible && divider.userData.separatesTenantBays));
  community.userData.setInteriorCutaway(false);
  assert.equal(kindergartenWindow.visible, true);
  assert.doesNotThrow(() => community.userData.update(1 / 60));
});

test("batches repeated buildings, fences and street furniture for the standalone demo", () => {
  const community = buildLowPolyResidentialCommunity();
  let visibleMeshes = 0;
  let shadowCasters = 0;
  let instancedMeshes = 0;
  let visibleLights = 0;
  community.traverse((object) => {
    if (object instanceof THREE.Light && object.visible && object.intensity > 0) visibleLights += 1;
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    visibleMeshes += 1;
    if (object.castShadow) shadowCasters += 1;
    if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
  });
  assert.ok(community.userData.unbatchedSourceMeshCount >= 2_000);
  assert.ok(community.userData.renderBatchCount <= 70, `render batch budget regressed to ${community.userData.renderBatchCount}`);
  assert.ok(instancedMeshes >= 20);
  assert.ok(visibleMeshes <= 1_200, `visible mesh budget regressed to ${visibleMeshes}`);
  assert.ok(shadowCasters <= 1_000, `shadow caster budget regressed to ${shadowCasters}`);
  assert.equal(visibleLights, 0, "day mode must not submit zero-intensity point lights");

  const highRise = community.getObjectByName("residential-community-high-rise-1");
  const midRise = community.getObjectByName("residential-community-mid-rise-1");
  const highRiseBatch = community.getObjectByName("residential-community-high-rise-render-batch");
  const midRiseBatch = community.getObjectByName("residential-community-mid-rise-render-batch");
  assert.equal(highRise.visible, false);
  assert.equal(midRise.visible, false);
  assert.equal(highRiseBatch.visible, true);
  assert.equal(midRiseBatch.visible, true);
  community.userData.setInteriorCutaway(true);
  assert.equal(highRise.visible, true);
  assert.equal(midRise.visible, true);
  assert.equal(highRiseBatch.visible, false);
  assert.equal(midRiseBatch.visible, false);
  community.userData.setInteriorCutaway(false);
  assert.equal(highRise.visible, false);
  assert.equal(midRise.visible, false);
  assert.equal(highRiseBatch.visible, true);
  assert.equal(midRiseBatch.visible, true);

  community.userData.setPowered(true);
  visibleLights = 0;
  community.traverse((object) => {
    if (object instanceof THREE.Light && object.visible && object.intensity > 0) visibleLights += 1;
  });
  assert.ok(visibleLights > 0 && visibleLights <= 16, `night light pool regressed to ${visibleLights}`);
});

test("exposes the complete community from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/residential-community/ResidentialCommunityDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyResidentialCommunity/);
  assert.match(demoSource, /完整住宅组团/);
  assert.match(demoSource, /社区商业街/);
  assert.match(demoSource, /独立幼儿园/);
  assert.match(demoSource, /13 m 开放门廊/);
  assert.match(demoSource, /有支撑的花园座椅/);
  assert.match(demoSource, /复合儿童游具/);
  assert.match(demoSource, /受保护等候广场/);
  assert.match(demoSource, /kindergarten: .*rider: new THREE\.Vector3\(72, 0\.67, 33\.4\)/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(demoSource, /createInstancedPrototypeBatch/);
  assert.match(demoSource, /residential-community-tree-render-batch/);
  assert.doesNotMatch(demoSource, /object\.add\(template\.clone\(true\)\)/);
  assert.match(archiveSource, /完整住宅社区/);
  assert.match(archiveSource, /\/demos\/residential-community/);
  assert.match(studioSource, /商业中心 · 完整社区/);
});
