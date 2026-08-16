import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyCityPark } from "../app/lib/map/cityPark.ts";

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

function pointInsideXZ(point, bounds, clearance = 0.35) {
  return point.x > bounds.min.x - clearance
    && point.x < bounds.max.x + clearance
    && point.z > bounds.min.z - clearance
    && point.z < bounds.max.z + clearance;
}

test("builds a complete six-zone open urban park", () => {
  const park = buildLowPolyCityPark();
  assert.equal(park.name, "city-park-lowpoly");
  assert.equal(park.userData.modelType, "city-park");
  assert.equal(park.userData.generatedLocally, true);
  assert.deepEqual(park.userData.zones, ["entrance", "lake", "recreation", "garden", "amphitheatre", "service"]);
  assert.equal(park.userData.buildingCount, 4);
  assert.ok(park.getObjectByName("city-park-main-gateway"));
  assert.ok(park.getObjectByName("city-park-central-lake"));
  assert.ok(park.getObjectByName("city-park-botanical-garden"));
  assert.ok(park.getObjectByName("city-park-open-air-amphitheatre"));
  assert.ok(park.getObjectByName("city-park-visitor-service-centre"));
});

test("keeps four entrances open and connects accessible walking and cycling loops", () => {
  const park = buildLowPolyCityPark();
  const entrances = namedObjects(park, "city-park-open-entrance");
  assert.equal(park.userData.entranceCount, 4);
  assert.equal(entrances.length, 4);
  assert.ok(entrances.every((entrance) => entrance.userData.alwaysOpen));
  assert.deepEqual(new Set(entrances.map((entrance) => entrance.userData.entranceName)), new Set(["south", "north", "west", "east"]));
  const walking = park.getObjectByName("city-park-walking-loop");
  const cycling = park.getObjectByName("city-park-cycling-loop");
  assert.equal(walking.userData.continuous, true);
  assert.equal(walking.userData.barrierFree, true);
  assert.equal(cycling.userData.continuous, true);
  assert.equal(cycling.userData.barrierFree, true);
  assert.equal(park.userData.walkingLoopLengthMeters, 344);
  assert.equal(park.userData.cyclingLoopLengthMeters, 398);
  assert.ok(namedObjects(park, "city-park-accessible-path").every((path) => path.userData.barrierFree));
  assert.equal(park.userData.fenceSegmentCount, 8);
  assert.equal(namedObjects(park, "city-park-low-boundary-fence").length, 8);
  const lights = namedObjects(park, "city-street-light-lowpoly");
  assert.ok(lights.every((light) => (light.position.x / 77.175) ** 2 + (light.position.z / 52.5) ** 2 > 1));
});

test("centres the park on an ecological lake, bridge, pavilion and animated fountains", () => {
  const park = buildLowPolyCityPark();
  const lake = park.getObjectByName("city-park-central-lake");
  const bridge = park.getObjectByName("city-park-lake-bridge");
  assert.equal(park.userData.lakeCount, 1);
  assert.equal(lake.userData.ecologicalShore, true);
  assert.equal(park.userData.bridgeCount, 1);
  assert.equal(bridge.userData.barrierFree, true);
  assert.ok(bridge.userData.clearWidth >= 4);
  assert.equal(namedObjects(park, "city-park-bridge-guardrail").length, 4);
  const bridgeRamps = namedObjects(park, "city-park-bridge-access-ramp");
  const bridgeApproaches = namedObjects(park, "city-park-bridge-approach-path");
  assert.equal(bridgeRamps.length, 2);
  assert.equal(bridgeApproaches.length, 2);
  assert.ok(bridgeRamps.every((ramp) => ramp.userData.barrierFree && ramp.userData.maximumGradient === "1:12"));
  assert.ok(bridgeApproaches.every((path) => path.userData.barrierFree && path.userData.connectsToWalkingLoop));
  assert.equal(namedObjects(park, "city-park-bridge-ramp-edge-curb").length, 4);
  assert.equal(namedObjects(park, "city-park-bridge-ramp-handrail").length, 8);
  assert.equal(namedObjects(park, "city-park-bridge-ramp-handrail-post").length, 12);
  const pavilion = park.getObjectByName("city-park-lake-pavilion");
  const pavilionFloor = park.getObjectByName("city-park-pavilion-floor");
  const bridgeDeck = park.getObjectByName("city-park-bridge-deck");
  const bridgeDeckTop = worldBounds(bridgeDeck).max.y;
  const approachTop = worldBounds(bridgeApproaches[0]).max.y;
  for (const ramp of bridgeRamps) {
    ramp.updateWorldMatrix(true, false);
    const topEndpoints = [-3, 3]
      .map((x) => ramp.localToWorld(new THREE.Vector3(x, 0.09, 0)))
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    assert.ok(Math.abs(topEndpoints[0].y - bridgeDeckTop) < 0.02, "bridge ramp should meet the deck without a lip");
    assert.ok(Math.abs(topEndpoints[1].y - approachTop) < 0.02, "bridge ramp should meet its approach without a lip");
  }
  assert.ok(pavilion);
  assert.equal(pavilion.userData.floorFlushWithBridge, true);
  assert.ok(Math.abs(worldBounds(pavilionFloor).max.y - worldBounds(bridgeDeck).max.y) < 0.02);
  assert.equal(namedObjects(park, "city-park-pavilion-guardrail").length, 2);
  const wetlandIslands = namedObjects(park, "city-park-wetland-island");
  assert.equal(wetlandIslands.length, 2);
  assert.ok(wetlandIslands.every((island) => !overlapsXZ(worldBounds(island), worldBounds(bridgeDeck))), "wetland habitat should not intrude into the bridge deck");
  const shore = park.getObjectByName("city-park-lake-safety-buffer");
  assert.equal(shore.userData.nonSlip, true);
  assert.ok(shore.userData.minimumWidthMeters >= 2);
  assert.equal(park.getObjectByName("city-park-lake-shore-slope").userData.maximumGradient, "1:12");
  assert.equal(namedObjects(park, "city-park-lake-shore-guardrail").length, 2);
  assert.equal(park.userData.fountainJetCount, 10);
  const fountainBases = namedObjects(park, "city-park-lake-fountain-base");
  const fountainJets = namedObjects(park, "city-park-fountain-water-jet");
  assert.equal(fountainBases.length, 2);
  assert.equal(fountainJets.length, 10);
  assert.ok(fountainBases.every((base) => base.userData.locatedInOpenWater));
  assert.ok(fountainJets.every((jet) => jet.userData.locatedInOpenWater));
  for (const base of fountainBases) {
    const lakeEquation = (base.position.x / 36.5) ** 2 + ((base.position.z + 8) / 21.5) ** 2;
    assert.ok(lakeEquation < 0.7, "fountain base should sit well inside the lake boundary");
    assert.ok(Math.abs(base.position.z + 8) > 3.3, "fountain base should clear the bridge deck");
    assert.ok(base.position.y - 0.125 < lake.position.y, "fountain base should be partly submerged");
  }
});

test("provides children, an open activity lawn and all-age fitness facilities without a basketball court", () => {
  const park = buildLowPolyCityPark();
  assert.equal(park.userData.playgroundCount, 1);
  assert.ok(park.getObjectByName("city-park-children-playground"));
  const playStructure = park.getObjectByName("city-park-play-structure");
  const slide = park.getObjectByName("city-park-play-slide");
  assert.equal(playStructure.userData.supported, true);
  assert.equal(namedObjects(park, "city-park-play-platform-post").length, 4);
  assert.equal(namedObjects(park, "city-park-play-platform-guardrail").length, 3);
  assert.equal(namedObjects(park, "city-park-play-stair").length, 6);
  assert.equal(slide.userData.supportedAtPlatform, true);
  assert.equal(slide.userData.groundLandingY, 0.7);
  assert.equal(namedObjects(park, "city-park-play-slide-side-rail").length, 2);
  assert.ok(park.getObjectByName("city-park-play-slide-landing"));
  assert.equal(namedObjects(park, "city-park-play-rocking-horse").length, 3);
  assert.equal(namedObjects(park, "city-park-rocking-horse-spring").length, 3);
  assert.equal(park.getObjectByName("city-park-play-swing-set").userData.seatCount, 2);
  assert.equal(namedObjects(park, "city-park-play-swing-seat").length, 2);
  assert.equal(park.getObjectByName("city-park-play-seesaw").userData.seatCount, 2);
  assert.ok(park.getObjectByName("city-park-play-sandbox"));
  assert.equal(park.userData.sportsCourtCount, 0);
  assert.equal(park.userData.activityLawnCount, 1);
  const activityLawn = park.getObjectByName("city-park-open-activity-lawn");
  assert.ok(activityLawn);
  assert.equal(activityLawn.userData.openUse, true);
  assert.equal(activityLawn.userData.ballCourt, false);
  assert.equal(activityLawn.userData.clearOfCirculationLoops, true);
  const [lawnRadiusX, lawnRadiusZ] = activityLawn.userData.outerExtentMeters;
  for (let step = 0; step < 72; step += 1) {
    const angle = step / 72 * Math.PI * 2;
    const x = activityLawn.position.x + Math.cos(angle) * lawnRadiusX;
    const z = activityLawn.position.z + Math.sin(angle) * lawnRadiusZ;
    assert.ok(Math.hypot(x / 1.47, z) < 42.2, "the whole activity lawn should remain inside the walking loop");
  }
  const lawnSubgrade = park.getObjectByName("city-park-activity-lawn-subgrade");
  assert.ok(lawnSubgrade);
  assert.equal(lawnSubgrade.userData.groundContactY, 0.4);
  assert.equal(namedObjects(park, "city-park-community-sports-court").length, 0);
  assert.equal(namedObjects(park, "city-park-basketball-pole").length, 0);
  assert.equal(namedObjects(park, "city-park-basketball-backboard").length, 0);
  assert.equal(park.userData.fitnessEquipmentCount, 10);
  assert.equal(namedObjects(park, "city-park-fitness-equipment").length, 10);
});

test("provides a detailed public greenhouse with accessible circulation and climate-service details", () => {
  const park = buildLowPolyCityPark();
  assert.equal(park.userData.greenhouseCount, 1);
  assert.equal(park.userData.flowerBedCount, 15);
  assert.equal(namedObjects(park, "city-park-botanical-flower-bed").length, 15);
  assert.equal(namedObjects(park, "city-park-botanical-flowers").length, 15);
  const greenhouse = park.getObjectByName("city-park-greenhouse");
  assert.ok(greenhouse);
  assert.equal(greenhouse.userData.structurallyFramed, true);
  assert.equal(greenhouse.userData.publiclyAccessible, true);

  const roofPanels = namedObjects(greenhouse, "city-park-greenhouse-glass-roof-panel");
  const wallPanels = namedObjects(greenhouse, "city-park-greenhouse-glass-wall-panel");
  const framePosts = namedObjects(greenhouse, "city-park-greenhouse-frame-post");
  const roofRafters = namedObjects(greenhouse, "city-park-greenhouse-roof-rafter");
  assert.ok(roofPanels.length >= 12, "greenhouse roof should be visibly divided into maintainable glass panels");
  assert.ok(wallPanels.length >= 16, "greenhouse walls should be split into realistic framed bays");
  assert.equal(framePosts.length, 14);
  assert.ok(roofRafters.length >= 12);
  assert.equal(namedObjects(park, "city-park-greenhouse-ridge-beam").length, 1);
  assert.equal(namedObjects(park, "city-park-greenhouse-eave-beam").length, 2);

  const doors = namedObjects(greenhouse, "city-park-greenhouse-entry-door");
  assert.equal(doors.length, 2);
  assert.ok(doors.every((door) => door.userData.accessible));
  assert.ok(park.getObjectByName("city-park-greenhouse-entry-canopy"));
  assert.ok(namedObjects(greenhouse, "city-park-greenhouse-entry-canopy-post").length >= 2);

  const aisle = park.getObjectByName("city-park-greenhouse-central-aisle");
  const crossAisle = park.getObjectByName("city-park-greenhouse-cross-aisle");
  const plantingBeds = namedObjects(greenhouse, "city-park-greenhouse-interior-planting-bed");
  assert.ok(aisle);
  assert.equal(aisle.userData.barrierFree, true);
  assert.ok(aisle.userData.clearWidthMeters >= 2.4);
  assert.equal(plantingBeds.length, 8);
  const aisleBounds = worldBounds(aisle);
  assert.ok(plantingBeds.every((bed) => !overlapsXZ(worldBounds(bed), aisleBounds)), "interior planting beds should keep the central accessible aisle clear");
  assert.ok(crossAisle);
  const crossAisleBounds = worldBounds(crossAisle);
  assert.ok(plantingBeds.every((bed) => !overlapsXZ(worldBounds(bed), crossAisleBounds)), "interior planting beds should keep the cross aisle clear");
  const pottingBench = park.getObjectByName("city-park-greenhouse-potting-bench");
  assert.ok(pottingBench);
  assert.equal(overlapsXZ(worldBounds(pottingBench), aisleBounds), false, "the potting bench should stay beside, rather than across, the accessible aisle");

  const entryForecourt = park.getObjectByName("city-park-greenhouse-entry-forecourt");
  assert.ok(entryForecourt);
  const forecourtBounds = worldBounds(entryForecourt);
  const exteriorFlowerBeds = namedObjects(park, "city-park-botanical-flower-bed");
  assert.ok(exteriorFlowerBeds.every((bed) => !overlapsXZ(worldBounds(bed), forecourtBounds)), "botanical beds should keep the greenhouse entrance forecourt open");
  assert.equal(wallPanels.filter((panel) => panel.userData.entranceInfill).length, 2, "the greenhouse front should be glazed on both sides of its doors");
  const canopyPosts = namedObjects(greenhouse, "city-park-greenhouse-entry-canopy-post");
  assert.ok(canopyPosts.every((post) => Math.abs(worldBounds(post).min.y - post.userData.groundContactY) < 0.001));

  assert.ok(namedObjects(greenhouse, "city-park-greenhouse-rain-gutter").length >= 2);
  assert.ok(namedObjects(greenhouse, "city-park-greenhouse-ventilation-fan").length >= 2);
  assert.ok(namedObjects(greenhouse, "city-park-greenhouse-plant-label").length >= 8);
  assert.ok(framePosts.every((post) => worldBounds(post).min.y <= 0.8), "greenhouse frame posts should reach their foundation");
});

test("grounds every amphitheatre row and provides detailed seating, aisles and accessible viewing", () => {
  const park = buildLowPolyCityPark();
  const theatre = park.getObjectByName("city-park-open-air-amphitheatre");
  assert.equal(park.userData.amphitheatreSeatRows, 6);
  assert.equal(theatre.userData.accessibleFrontRow, true);
  const rows = namedObjects(theatre, "city-park-amphitheatre-seat-row");
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.userData.groundSupported));
  assert.ok(rows.every((row) => worldBounds(row).min.y <= 0.8), "each stepped seating row should include support down to the landscaped ground");
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-terrace-segment").length, 18);
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-seat-plank").length, 36);
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-seat-backrest").length, 36);
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-seat-support").length, 72);
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-backrest-bracket").length, 72);
  const steppedAisles = namedObjects(theatre, "city-park-amphitheatre-stepped-aisle");
  assert.equal(steppedAisles.length, 2);
  assert.ok(steppedAisles.every((aisle) => aisle.userData.groundSupported));
  assert.equal(namedObjects(theatre, "city-park-amphitheatre-aisle-handrail-post").length, 12);
  assert.equal(namedObjects(park, "city-park-amphitheatre-wheelchair-space").length, 4);
  assert.equal(namedObjects(park, "city-park-amphitheatre-access-path").length, 2);
  assert.ok(namedObjects(park, "city-park-amphitheatre-access-path").every((path) => path.userData.barrierFree));
  const connector = namedObjects(park, "city-park-amphitheatre-access-path").find((path) => path.userData.entersThroughOpenSide);
  assert.ok(connector);
  const connectorBounds = worldBounds(connector);
  const terraceSegments = namedObjects(theatre, "city-park-amphitheatre-terrace-segment");
  assert.ok(terraceSegments.every((segment) => !overlapsXZ(worldBounds(segment), connectorBounds)), "the accessible connector should enter through the open side instead of crossing a terrace");
  const viewingApronBounds = worldBounds(park.getObjectByName("city-park-amphitheatre-front-viewing-apron"));
  assert.ok(terraceSegments.every((segment) => !overlapsXZ(worldBounds(segment), viewingApronBounds)), "the wheelchair viewing apron should remain in front of the first terrace");
  assert.ok(park.getObjectByName("city-park-amphitheatre-stage"));
  const stageFoundation = park.getObjectByName("city-park-amphitheatre-stage-foundation");
  assert.ok(stageFoundation);
  assert.ok(worldBounds(stageFoundation).min.y <= 0.7);
  assert.ok(park.getObjectByName("city-park-amphitheatre-stage-roof"));
});

test("completes the visitor service area and reuses city decorations", () => {
  const park = buildLowPolyCityPark();
  const service = park.getObjectByName("city-park-visitor-service-centre");
  assert.deepEqual(service.userData.services, ["information", "cafe", "toilets", "first-aid"]);
  assert.ok(park.getObjectByName("city-park-information-desk"));
  assert.ok(park.getObjectByName("city-park-cafe-counter"));
  const servicePath = park.getObjectByName("city-park-service-access-path");
  assert.equal(servicePath.userData.barrierFree, true);
  assert.ok(servicePath.userData.clearWidth >= 4);
  assert.equal(servicePath.position.x - servicePath.geometry.parameters.width * 0.5, 6);
  assert.equal(servicePath.position.x + servicePath.geometry.parameters.width * 0.5, 54);
  assert.equal(park.userData.benchCount, 24);
  const benches = namedObjects(park, "city-park-bench");
  const benchLegs = namedObjects(park, "city-park-bench-leg");
  assert.equal(benches.length, 24);
  assert.equal(namedObjects(park, "city-park-bench-seat").length, 24);
  assert.equal(namedObjects(park, "city-park-bench-backrest").length, 24);
  assert.equal(benchLegs.length, 48);
  assert.ok(benches.every((bench) => bench.userData.supportedByLegs));
  assert.ok(benches.every((bench) => typeof bench.userData.placementZone === "string" && bench.userData.placementZone.length > 0));
  assert.ok(benches.filter((bench) => bench.userData.placementZone === "lake-view").length >= 8);
  assert.ok(benches.every((bench) => namedObjects(bench, "city-park-bench-leg").length === 2));
  assert.ok(benchLegs.every((leg) => {
    const legBottom = leg.position.y - leg.geometry.parameters.height * 0.5;
    return Math.abs(legBottom - leg.userData.groundContactY) < 0.001;
  }));

  const benchExclusions = [
    park.getObjectByName("city-park-central-lake"),
    park.getObjectByName("city-park-greenhouse"),
    park.getObjectByName("city-park-open-activity-lawn"),
    park.getObjectByName("city-park-open-air-amphitheatre"),
    park.getObjectByName("city-park-bridge-deck"),
    ...namedObjects(park, "city-park-bridge-access-ramp"),
    ...namedObjects(park, "city-park-bridge-approach-path"),
  ];
  assert.ok(benchExclusions.every(Boolean));
  const exclusionBounds = benchExclusions.map((object) => worldBounds(object));
  for (const bench of benches) {
    const benchBounds = worldBounds(bench);
    assert.ok(exclusionBounds.every((bounds) => !overlapsXZ(benchBounds, bounds)), `bench in ${bench.userData.placementZone} should not overlap another park scene`);
    const radialDistance = Math.hypot(bench.position.x / 1.47, bench.position.z);
    assert.ok(radialDistance < 42.2 || radialDistance > 52.8, `bench at ${bench.position.x}, ${bench.position.z} should clear both circulation loops`);
  }
  assert.equal(park.userData.foodTruckCount, 2);
  assert.equal(namedObjects(park, "city-food-truck-lowpoly").length, 2);
  assert.equal(namedObjects(park, "city-park-street-light-lowpoly").length, 28);
  const streetLights = namedObjects(park, "city-park-street-light-lowpoly");
  assert.ok(streetLights.every((light) => light.userData.anchoredToGround && Math.abs(light.position.y - 0.4) < 0.001));
  assert.ok(streetLights.every((light) => namedObjects(light, "park-street-light-lantern").length === 2));
  assert.ok(streetLights.every((light) => namedObjects(light, "park-street-light-cage").length === 4));
  assert.ok(streetLights.every((light) => {
    const lampDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(light.quaternion).normalize();
    const towardPark = new THREE.Vector3(-light.position.x, 0, -light.position.z).normalize();
    return lampDirection.dot(towardPark) > 0.99;
  }), "street-light arms should face into the park");
  assert.ok(streetLights.every((light) => !(light.position.x >= -80.5 && light.position.x <= -33.5 && light.position.z >= -53.5 && light.position.z <= -24.5)), "street lights should not occupy the botanical garden beds or greenhouse apron");
  const planters = namedObjects(park, "city-roadside-planter-lowpoly");
  assert.equal(planters.length, 12);
  assert.ok(streetLights.every((light) => planters.every((planter) => !overlapsXZ(worldBounds(light), worldBounds(planter)))), "street lights and planters should occupy separate furniture pockets");
  const treeAnchors = namedObjects(park, "city-park-reused-tree-anchor");
  assert.equal(treeAnchors.length, 49);
  const treeExclusions = [
    park.getObjectByName("city-park-central-lake"),
    park.getObjectByName("city-park-botanical-garden"),
    park.getObjectByName("city-park-greenhouse"),
    park.getObjectByName("city-park-open-air-amphitheatre"),
    park.getObjectByName("city-park-open-activity-lawn"),
    park.getObjectByName("city-park-children-playground"),
    park.getObjectByName("city-park-visitor-service-centre"),
    ...namedObjects(park, "city-park-accessible-path"),
    ...namedObjects(park, "city-park-service-access-path"),
    ...namedObjects(park, "city-park-amphitheatre-access-path"),
  ];
  assert.ok(treeExclusions.every(Boolean));
  const treeExclusionBounds = treeExclusions.map((object) => worldBounds(object));
  for (let first = 0; first < treeAnchors.length; first += 1) {
    for (let second = first + 1; second < treeAnchors.length; second += 1) {
      assert.ok(treeAnchors[first].position.distanceTo(treeAnchors[second].position) >= 3.3, "reused tree crowns should not interpenetrate");
    }
  }
  for (const anchor of treeAnchors) {
    const point = anchor.getWorldPosition(new THREE.Vector3());
    assert.ok(treeExclusionBounds.every((bounds) => !pointInsideXZ(point, bounds)), `tree anchor at ${point.x}, ${point.z} should keep clear of water, facilities and main paths`);
    const radialDistance = Math.hypot(point.x / 1.47, point.z);
    assert.ok(radialDistance < 42.2 || radialDistance > 52.8, `tree anchor at ${point.x}, ${point.z} should clear both circulation loops`);
    assert.ok(Math.abs(anchor.position.y - anchor.userData.surfaceY) < 0.001, `tree anchor at ${point.x}, ${point.z} should sit on its recorded surface`);
    assert.equal(anchor.userData.grounded, true);
  }
  assert.deepEqual(park.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-park-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
    "city-food-truck-lowpoly",
  ]);
});

test("keeps city scale and supports night, water and service cutaway interactions", () => {
  const park = buildLowPolyCityPark();
  assert.equal(park.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(park.userData.scaleStandard, "rabbit-rider");
  const metrics = measureModelGeometry(park);
  assert.ok(metrics.size.x >= 184);
  assert.ok(metrics.size.z >= 139);
  assert.ok(metrics.size.y >= 10.3);
  assert.equal(park.userData.siteSize.x, 185);
  assert.equal(park.userData.siteSize.y, 12);
  assert.equal(park.userData.siteSize.z, 140);

  const streetLights = namedObjects(park, "street-light-point-light");
  const serviceWindow = namedObjects(park, "city-park-service-building-window")[0];
  assert.ok(serviceWindow instanceof THREE.Mesh);
  park.userData.setPowered(true);
  assert.ok(serviceWindow.material.emissiveIntensity > 0.8);
  assert.ok(streetLights.every((light) => light.intensity > 0));
  park.userData.setPowered(false);
  assert.ok(streetLights.every((light) => light.intensity === 0));

  const jets = namedObjects(park, "city-park-fountain-water-jet");
  park.userData.setWaterMotionEnabled(false);
  assert.ok(jets.every((jet) => jet.visible && jet.userData.motionPaused));
  const pausedScales = jets.map((jet) => jet.scale.y);
  park.userData.update(1.2);
  assert.deepEqual(jets.map((jet) => jet.scale.y), pausedScales);
  park.userData.setWaterMotionEnabled(true);
  park.userData.update(0.7);
  assert.ok(jets.every((jet) => jet.visible));
  assert.ok(new Set(jets.map((jet) => jet.scale.y.toFixed(3))).size > 1);

  assert.equal(serviceWindow.visible, true);
  park.userData.setServiceCutaway(true);
  assert.equal(serviceWindow.visible, false);
  park.userData.setServiceCutaway(false);
  assert.equal(serviceWindow.visible, true);
});

test("exposes the city park from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/city-park/CityParkDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyCityPark/);
  assert.match(demoSource, /入口广场与环形步道/);
  assert.match(demoSource, /中央生态湖区/);
  assert.match(demoSource, /植物花园与温室/);
  assert.match(demoSource, /开放活动草坪/);
  assert.match(demoSource, /分段玻璃/);
  assert.doesNotMatch(demoSource, /社区球场|篮球场/);
  assert.match(demoSource, /露天剧场/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /综合城市公园/);
  assert.match(archiveSource, /\/demos\/city-park/);
  assert.match(studioSource, /消防局 · 城市公园/);
});
