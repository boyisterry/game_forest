import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyAmusementPark } from "../app/lib/map/amusementPark.ts";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

function meshDescendants(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  return meshes;
}

function boxesHaveVolumeOverlap(first, second, epsilon = 0.015) {
  return Math.min(first.max.x, second.max.x) - Math.max(first.min.x, second.min.x) > epsilon
    && Math.min(first.max.y, second.max.y) - Math.max(first.min.y, second.min.y) > epsilon
    && Math.min(first.max.z, second.max.z) - Math.max(first.min.z, second.min.z) > epsilon;
}

function intervalOverlap(firstMin, firstMax, secondMin, secondMax) {
  return Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));
}

function setFerrisRotorAngle(park, degrees) {
  const angle = THREE.MathUtils.degToRad(degrees);
  const rotor = park.getObjectByName("amusement-park-ferris-wheel-rotor");
  rotor.rotation.z = angle;
  namedObjects(park, "amusement-park-ferris-cabin").forEach((cabin) => {
    cabin.rotation.z = -angle;
  });
  park.updateWorldMatrix(true, true);
}

test("builds a complete amusement district with ten navigable facility zones", () => {
  const park = buildLowPolyAmusementPark();
  assert.equal(park.name, "city-amusement-park-lowpoly");
  assert.equal(park.userData.generatedLocally, true);
  assert.equal(park.userData.modelType, "amusement-park");
  assert.equal(park.userData.facilityCount, 10);
  assert.equal(park.userData.attractionCount, 12);
  assert.equal(park.userData.cityBuildingCount, 0);
  assert.deepEqual(park.userData.facilities, [
    "overview", "coaster", "carousel", "pirate", "playground", "circus", "shooting", "karting", "ferris", "drop-tower",
  ]);

  assert.ok(park.getObjectByName("amusement-park-grand-entrance"));
  assert.ok(park.getObjectByName("amusement-park-central-fountain"));
  assert.equal(park.getObjectByName("amusement-park-city-skyline"), undefined);
  assert.ok(park.getObjectByName("amusement-park-protection-fence"));
  assert.equal(park.userData.fenceSegmentCount, 9);
  assert.equal(namedObjects(park, "amusement-park-protection-fence-segment").length, 9);
  assert.ok(namedObjects(park, "amusement-park-fence-post").length > 200);
  assert.equal(namedObjects(park, "amusement-park-fence-horizontal-rail").length, 18);
  assert.equal(park.userData.rideSafetyFenceCount, 7);
  assert.equal(namedObjects(park, "amusement-park-ride-safety-rail").length, 70);
  assert.equal(namedObjects(park, "amusement-park-ride-safety-post").length, 42);
  assert.equal(park.userData.entranceGateLaneCount, 3);
  assert.equal(park.userData.entranceClearWidth, 15.48);
  assert.equal(namedObjects(park, "amusement-park-entrance-gate-post").length, 4);
  assert.equal(namedObjects(park, "amusement-park-entrance-gate-lane").length, 3);
  const entrancePosts = namedObjects(park, "amusement-park-entrance-gate-post").sort((a, b) => a.position.x - b.position.x);
  const measuredEntranceClearWidth = entrancePosts.slice(0, -1).reduce((total, post, index) => (
    total + entrancePosts[index + 1].position.x - post.position.x - post.geometry.parameters.width
  ), 0);
  assert.ok(Math.abs(measuredEntranceClearWidth - park.userData.entranceClearWidth) < 1e-6);
  assert.equal(namedObjects(park, "amusement-park-city-building").length, 0);
  assert.equal(namedObjects(park, "amusement-park-perimeter-road").length, 5);
  assert.ok(namedObjects(park, "amusement-park-reused-tree-anchor").length >= 20);
  assert.equal(park.userData.treeAnchorCount, namedObjects(park, "amusement-park-reused-tree-anchor").length);
});

test("reuses existing city decorations instead of rebuilding substitutes", () => {
  const park = buildLowPolyAmusementPark();
  assert.deepEqual(park.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
    "city-food-truck-lowpoly",
  ]);
  assert.equal(namedObjects(park, "city-street-light-lowpoly").length, 22);
  assert.equal(namedObjects(park, "city-roadside-planter-lowpoly").length, 8);
  assert.equal(namedObjects(park, "city-food-truck-lowpoly").length, 2);
  assert.equal(park.userData.streetLightCount, 22);
  assert.equal(park.userData.planterCount, 8);
  assert.equal(park.userData.foodTruckCount, 2);
  assert.equal(namedObjects(park, "amusement-park-tree-trunk").length, 0);
  assert.equal(namedObjects(park, "amusement-park-lamp-post").length, 0);
});

test("includes the flagship animated rides and game venues", () => {
  const park = buildLowPolyAmusementPark();
  assert.equal(namedObjects(park, "amusement-park-coaster-rail").length, 2);
  assert.equal(park.getObjectByName("amusement-park-roller-coaster").userData.trackOffsetMode, "curve-normal");
  assert.equal(namedObjects(park, "amusement-park-coaster-track-spine").length, 1);
  assert.equal(namedObjects(park, "amusement-park-coaster-cross-tie").length, 72);
  assert.equal(namedObjects(park, "amusement-park-coaster-car").length, 4);
  assert.ok(namedObjects(park, "amusement-park-coaster-support").length >= 45);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse").length, 12);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse-leg").length, 48);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse-hoof").length, 48);
  assert.equal(namedObjects(park, "amusement-park-carousel-saddle").length, 12);
  assert.equal(namedObjects(park, "amusement-park-carousel-stirrup").length, 24);
  assert.equal(namedObjects(park, "amusement-park-carousel-horse-bridle").length, 12);
  assert.equal(namedObjects(park, "amusement-park-carousel-canopy-valance").length, 12);
  assert.ok(namedObjects(park, "amusement-park-carousel-horse").every((horse) => horse.userData.saddleFitted && horse.userData.footStirrups));
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-seat").length, 72);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-safety-panel").length, 60);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-glass-wall").length, 60);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-glass-roof").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-handrail").length, 24);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-door-frame").length, 12);
  assert.equal(namedObjects(park, "amusement-park-ferris-cabin-door").length, 12);
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin-door").every((door) => door.userData.operable));
  assert.equal(namedObjects(park, "amusement-park-shooting-target").length, 7);
  assert.equal(namedObjects(park, "amusement-park-go-kart").length, 6);
  assert.equal(namedObjects(park, "amusement-park-go-kart-wheel").length, 24);
  assert.equal(namedObjects(park, "amusement-park-go-kart-steering-wheel").length, 6);
  assert.equal(namedObjects(park, "amusement-park-go-kart-seat").length, 6);
  assert.equal(namedObjects(park, "amusement-park-go-kart-safety-bumper").length, 12);
  assert.ok(namedObjects(park, "amusement-park-go-kart").every((kart) => kart.userData.wheelCount === 4 && kart.userData.steeringWheel));
  assert.equal(namedObjects(park, "amusement-park-coaster-passenger-seat").length, 8);
  assert.equal(namedObjects(park, "amusement-park-coaster-lap-bar").length, 8);
  assert.equal(namedObjects(park, "amusement-park-coaster-guide-wheel").length, 16);
  assert.ok(namedObjects(park, "amusement-park-coaster-car").every((car) => car.userData.passengerCapacity === 2 && car.userData.underfrictionWheels));
  const pirateShip = park.getObjectByName("amusement-park-pirate-ship");
  assert.equal(pirateShip.userData.passengerCapacity, 24);
  assert.equal(namedObjects(park, "amusement-park-pirate-passenger-seat").length, 24);
  assert.equal(namedObjects(park, "amusement-park-pirate-seat-restraint").length, 24);
  assert.equal(namedObjects(park, "amusement-park-pirate-seat-bench").length, 6);
  assert.equal(namedObjects(park, "amusement-park-pirate-suspension-arm").length, 2);
  assert.equal(namedObjects(park, "amusement-park-pirate-pivot-bearing").length, 2);
  assert.equal(namedObjects(park, "amusement-park-pirate-foundation").length, 4);
  assert.equal(namedObjects(park, "amusement-park-pirate-porthole").length, 12);
  assert.equal(namedObjects(park, "amusement-park-pirate-deck-handrail").length, 8);
  assert.equal(namedObjects(park, "amusement-park-pirate-rigging").length, 2);
  assert.equal(namedObjects(park, "amusement-park-pirate-sail-panel").length, 5);
  assert.equal(namedObjects(park, "amusement-park-pirate-sail-seam").length, 4);
  assert.equal(namedObjects(park, "amusement-park-pirate-sail-yard").length, 2);
  assert.equal(namedObjects(park, "amusement-park-pirate-sail-rigging").length, 2);
  assert.equal(park.getObjectByName("amusement-park-pirate-sail").userData.symmetricalAboutMast, true);
  assert.equal(namedObjects(park, "amusement-park-pirate-boarding-gate").length, 2);
  assert.ok(namedObjects(park, "amusement-park-pirate-boarding-gate").every((gate) => gate.userData.operable && gate.userData.state === "open"));
  assert.ok(park.getObjectByName("amusement-park-pirate-pivot"));
  const indoorPlayground = park.getObjectByName("amusement-park-indoor-playground");
  assert.deepEqual(indoorPlayground.userData.activityZones, ["toddler-ball-pit", "climbing-maze", "tube-slide"]);
  assert.equal(namedObjects(park, "amusement-park-playground-play-platform").length, 3);
  assert.equal(namedObjects(park, "amusement-park-playground-padded-post").length, 12);
  assert.equal(namedObjects(park, "amusement-park-playground-safety-net").length, 9);
  assert.equal(namedObjects(park, "amusement-park-playground-crawl-tunnel").length, 2);
  assert.equal(namedObjects(park, "amusement-park-playground-padded-step").length, 8);
  assert.equal(namedObjects(park, "amusement-park-playground-ball").length, 18);
  assert.equal(park.getObjectByName("amusement-park-playground-tube-slide").userData.groundLanding, true);
  assert.ok(park.getObjectByName("amusement-park-circus"));
  const dropTower = park.getObjectByName("amusement-park-drop-tower");
  const dropCarriage = park.getObjectByName("amusement-park-drop-tower-carriage");
  assert.equal(dropTower.userData.seatCount, 12);
  assert.equal(dropCarriage.userData.passengerCapacity, 12);
  assert.equal(namedObjects(park, "amusement-park-drop-tower-passenger-seat").length, 12);
  assert.equal(namedObjects(park, "amusement-park-drop-tower-seat-restraint").length, 12);
  assert.equal(namedObjects(park, "amusement-park-drop-tower-guide-rail").length, 4);
  assert.equal(namedObjects(park, "amusement-park-drop-tower-lattice-brace").length, 7);
  const bumperCars = park.getObjectByName("amusement-park-bumper-cars");
  const spinningCups = park.getObjectByName("amusement-park-spinning-cups");
  assert.equal(bumperCars.userData.overheadPowerGrid, true);
  assert.equal(namedObjects(park, "amusement-park-bumper-car").length, 5);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-wheel").length, 20);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-rubber-bumper").length, 5);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-steering-wheel").length, 5);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-safety-belt").length, 5);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-collector-pole").length, 5);
  assert.equal(namedObjects(park, "amusement-park-bumper-car-collector-shoe").length, 5);
  assert.ok(namedObjects(park, "amusement-park-bumper-car").every((car) => car.userData.wheelCount === 4 && car.userData.overheadCollector));
  assert.equal(spinningCups.userData.cupCount, 7);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup").length, 7);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup-saucer").length, 7);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup-handle").length, 7);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup-rim").length, 7);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup-seat").length, 21);
  assert.equal(namedObjects(park, "amusement-park-spinning-cup-control-wheel").length, 7);
  assert.ok(namedObjects(park, "amusement-park-spinning-cup").every((cup) => cup.userData.passengerCapacity === 3 && cup.userData.hasControlWheel));
  assert.equal(park.userData.loadingGateCount, 7);
  assert.equal(park.userData.loadingAccessCount, 6);
  const loadingGates = namedObjects(park, "amusement-park-ride-loading-gate");
  assert.equal(loadingGates.length, 7);
  assert.ok(loadingGates.every((gate) => gate.userData.operable && gate.userData.state === "open"));
  assert.ok(park.getObjectByName("amusement-park-carousel-loading-step"));
  assert.ok(park.getObjectByName("amusement-park-pirate-loading-platform"));
  assert.ok(park.getObjectByName("amusement-park-coaster-loading-platform"));
  assert.ok(park.getObjectByName("amusement-park-ferris-loading-platform"));
  assert.ok(park.getObjectByName("amusement-park-drop-tower-loading-platform"));
  assert.equal(namedObjects(park, "amusement-park-ferris-access-walkway").length, 2);
  assert.ok(park.getObjectByName("amusement-park-drop-tower-access-walkway"));
  park.updateWorldMatrix(true, true);
  const dropPlatformTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-drop-tower-loading-platform")).max.y;
  const dropCarriageBottom = new THREE.Box3().setFromObject(dropCarriage).min.y;
  assert.ok(Math.abs(dropCarriageBottom - dropPlatformTop) < 0.12, "drop tower carriage should rest on the loading platform");
  assert.ok(park.getObjectByName("amusement-park-playground-entrance-header"));
  assert.equal(park.userData.indoorPlaygroundEntranceWidth, 17.78);
  assert.equal(park.userData.shootingServiceOpeningWidth, 14);
  assert.equal(indoorPlayground.userData.entranceType, "fully-open");
  assert.equal(namedObjects(park, "amusement-park-playground-glass-wall").length, 0, "playground entrance should not retain the two freestanding glass panels");
  assert.equal(namedObjects(park, "amusement-park-shooting-gallery-wall").length, 3, "shooting gallery front should remain genuinely open");
  const kartTrack = park.getObjectByName("amusement-park-kart-track");
  const kartTrackSize = new THREE.Box3().setFromObject(kartTrack).getSize(new THREE.Vector3());
  assert.ok(kartTrackSize.y < 0.01, "kart circuit should be a flat road ribbon rather than a buried tube");
  assert.equal(namedObjects(park, "amusement-park-kart-safety-barrier").length, 2);
  const kartPit = park.getObjectByName("amusement-park-kart-pit-building");
  const kartPitBounds = new THREE.Box3().setFromObject(kartPit);
  const kartTrackBounds = new THREE.Box3().setFromObject(kartTrack);
  assert.equal(kartPit.userData.garageBayCount, 3);
  assert.equal(namedObjects(park, "amusement-park-kart-pit-garage-door").length, 3);
  assert.equal(kartPitBounds.intersectsBox(kartTrackBounds), false, "kart pit building must stand outside the racing surface");
  const safetyWalkway = park.getObjectByName("amusement-park-kart-safety-walkway");
  assert.equal(safetyWalkway.userData.perimeterEmergencyAccess, true);
  assert.ok(safetyWalkway.userData.clearWidthMeters >= 2);

  assert.equal(namedObjects(park, "amusement-park-city-building").length, 0, "high-rises should not stand beside the amusement park");
  assert.equal(namedObjects(park, "amusement-park-city-window").length, 0);
  assert.equal(namedObjects(park, "amusement-park-city-roof-cap").length, 0);

  const visitorCentre = park.getObjectByName("amusement-park-coaster-visitor-centre");
  const visitorPath = park.getObjectByName("amusement-park-coaster-visitor-access-path");
  const coasterLoadingPlatform = park.getObjectByName("amusement-park-coaster-loading-platform");
  assert.deepEqual(visitorCentre.userData.services, ["tickets", "information", "lockers", "first-aid", "toilets"]);
  assert.equal(namedObjects(park, "amusement-park-coaster-ticket-counter").length, 4);
  assert.equal(namedObjects(park, "amusement-park-coaster-visitor-locker").length, 12);
  assert.equal(namedObjects(park, "amusement-park-coaster-visitor-service-room").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-visitor-queue-rail").length, 6);
  assert.equal(namedObjects(park, "amusement-park-coaster-visitor-entrance-door").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-visitor-canopy-post").length, 2);
  assert.ok(namedObjects(park, "amusement-park-coaster-ticket-counter").some((counter) => counter.userData.accessibleCounter));
  assert.equal(visitorPath.userData.barrierFree, true);
  assert.ok(visitorPath.userData.clearWidthMeters >= 3.2);
  assert.equal(visitorPath.userData.connectsVisitorCentreToLoadingPlatform, true);
  assert.equal(visitorPath.userData.accessType, "ground-path-elevator-bridge");
  assert.equal(namedObjects(park, "amusement-park-coaster-platform-lift").length, 1);
  assert.equal(namedObjects(park, "amusement-park-coaster-lift-glass").length, 4);
  assert.equal(namedObjects(park, "amusement-park-coaster-access-bridge").length, 1);
  assert.equal(namedObjects(park, "amusement-park-coaster-access-bridge-handrail").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-platform-deck").length, 2);
  assert.equal(namedObjects(park, "amusement-park-coaster-platform-column").length, 6);
  assert.equal(namedObjects(park, "amusement-park-coaster-platform-boarding-gate").length, 6);
  assert.equal(namedObjects(park, "amusement-park-coaster-station-roof-panel").length, 3);
  assert.equal(namedObjects(park, "amusement-park-coaster-station-canopy-column").length, 6);
  assert.equal(namedObjects(park, "amusement-park-coaster-loading-step").length, 7);
  assert.equal(park.getObjectByName("amusement-park-coaster-station-canopy").userData.risingTrackExitNotch, true);
  assert.ok(namedObjects(park, "amusement-park-coaster-platform-deck").every((deck) => {
    const size = new THREE.Box3().setFromObject(deck).getSize(new THREE.Vector3());
    return size.z > size.x;
  }), "station platforms should run parallel to the straight station track");
  const visitorCentreMeshes = [];
  const loadingPlatformMeshes = [];
  visitorCentre.traverse((object) => { if (object.isMesh) visitorCentreMeshes.push(object); });
  coasterLoadingPlatform.traverse((object) => { if (object.isMesh) loadingPlatformMeshes.push(object); });
  assert.ok(visitorCentreMeshes.every((visitorPart) => loadingPlatformMeshes.every((platformPart) => (
    !new THREE.Box3().setFromObject(visitorPart).intersectsBox(new THREE.Box3().setFromObject(platformPart))
  ))), "visitor centre parts must remain physically clear of the loading platform parts");
  const visitorPartBounds = visitorCentreMeshes.map((visitorPart) => new THREE.Box3().setFromObject(visitorPart));
  assert.ok(namedObjects(park, "amusement-park-coaster-rail").every((rail) => {
    const positions = rail.geometry.getAttribute("position");
    const vertex = new THREE.Vector3();
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
      vertex.fromBufferAttribute(positions, vertexIndex).applyMatrix4(rail.matrixWorld);
      if (visitorPartBounds.some((bounds) => bounds.containsPoint(vertex))) return false;
    }
    return true;
  }), "visitor centre must remain clear of the coaster rails");
  const visitorAccessMeshes = [];
  visitorPath.traverse((object) => { if (object.isMesh) visitorAccessMeshes.push(object); });
  assert.ok(namedObjects(park, "amusement-park-coaster-support").every((support) => visitorAccessMeshes.every((accessPart) => (
    !new THREE.Box3().setFromObject(support).intersectsBox(new THREE.Box3().setFromObject(accessPart))
  ))), "coaster supports must not stand in the visitor access route");
  const coasterFence = park.getObjectByName("amusement-park-coaster-safety-fence");
  const coasterFenceMeshes = [];
  coasterFence.traverse((object) => { if (object.isMesh) coasterFenceMeshes.push(object); });
  const coasterSteps = namedObjects(park, "amusement-park-coaster-loading-step");
  assert.equal(coasterFence.userData.gateSide, "right");
  assert.ok(coasterFenceMeshes.every((fencePart) => coasterSteps.every((step) => (
    !new THREE.Box3().setFromObject(fencePart).intersectsBox(new THREE.Box3().setFromObject(step))
  ))), "station stairs should pass through the side gate without hitting the safety fence");
  assert.ok(namedObjects(park, "amusement-park-coaster-station-roof-panel").every((roofPanel) => {
    roofPanel.geometry.computeBoundingBox();
    return namedObjects(park, "amusement-park-coaster-rail").every((rail) => {
      const positions = rail.geometry.getAttribute("position");
      const vertex = new THREE.Vector3();
      const localVertex = new THREE.Vector3();
      for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
        vertex.fromBufferAttribute(positions, vertexIndex).applyMatrix4(rail.matrixWorld);
        localVertex.copy(vertex);
        roofPanel.worldToLocal(localVertex);
        if (roofPanel.geometry.boundingBox.containsPoint(localVertex)) return false;
      }
      return true;
    });
  }), "rising track should pass through the canopy exit notch without hitting the roof");

  park.updateWorldMatrix(true, true);
  const lowestCabin = namedObjects(park, "amusement-park-ferris-cabin")
    .sort((a, b) => new THREE.Box3().setFromObject(a).min.y - new THREE.Box3().setFromObject(b).min.y)[0];
  const lowestDoor = lowestCabin.getObjectByName("amusement-park-ferris-cabin-door");
  const doorBottom = new THREE.Box3().setFromObject(lowestDoor).min.y;
  const platformTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-ferris-loading-platform")).max.y;
  assert.ok(Math.abs(doorBottom - platformTop) < 0.1, "lowest Ferris cabin door should align with its loading platform");
});

test("builds a grounded Ferris visitor centre with a real staffed ticket pavilion", () => {
  const park = buildLowPolyAmusementPark();
  park.updateWorldMatrix(true, true);

  const visitorCentre = park.getObjectByName("amusement-park-ferris-visitor-centre");
  assert.ok(visitorCentre, "Ferris wheel needs a dedicated visitor-centre building");
  assert.deepEqual(visitorCentre.userData.services, ["tickets", "information", "accessibility-assistance"]);
  assert.equal(visitorCentre.userData.circulation, "separated-entry-exit");
  assert.equal(visitorCentre.userData.barrierFree, true);

  const visitorFloor = park.getObjectByName("amusement-park-ferris-visitor-floor");
  const visitorRoof = park.getObjectByName("amusement-park-ferris-visitor-roof");
  const visitorPorch = park.getObjectByName("amusement-park-ferris-visitor-porch");
  const visitorCanopy = park.getObjectByName("amusement-park-ferris-visitor-canopy");
  assert.ok(visitorFloor && visitorRoof && visitorPorch && visitorCanopy, "visitor centre needs a floor, roof, porch and entrance canopy");
  const visitorFloorSize = new THREE.Box3().setFromObject(visitorFloor).getSize(new THREE.Vector3());
  assert.ok(Math.max(visitorFloorSize.x, visitorFloorSize.z) >= 8);
  assert.ok(Math.min(visitorFloorSize.x, visitorFloorSize.z) >= 5);
  assert.ok(namedObjects(park, "amusement-park-ferris-visitor-wall").length >= 3);
  assert.ok(namedObjects(park, "amusement-park-ferris-visitor-window").length >= 2);
  assert.equal(namedObjects(park, "amusement-park-ferris-visitor-entrance-door").length, 1);
  assert.equal(namedObjects(park, "amusement-park-ferris-visitor-exit-door").length, 1);

  const accessibleDoor = park.getObjectByName("amusement-park-ferris-visitor-accessible-door");
  assert.ok(accessibleDoor, "east facade needs a dedicated door to the accessible approach");
  assert.equal(accessibleDoor.userData.thresholdFree, true);
  assert.equal(accessibleDoor.userData.connectsAccessibleApproachToVisitorCentre, true);
  assert.ok(accessibleDoor.userData.clearWidthMeters >= 1.5);
  const visitorFloorBounds = new THREE.Box3().setFromObject(visitorFloor);
  const accessibleDoorBounds = new THREE.Box3().setFromObject(accessibleDoor);
  const accessibleDoorSize = accessibleDoorBounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(accessibleDoorBounds.getCenter(new THREE.Vector3()).x - visitorFloorBounds.max.x) < 0.2);
  assert.ok(accessibleDoorSize.x < 0.25 && accessibleDoorSize.z >= 1.5, "accessible door must open through the east wall");
  const isEastFacadePart = (part) => {
    const bounds = new THREE.Box3().setFromObject(part);
    const size = bounds.getSize(new THREE.Vector3());
    return size.x < 0.4 && Math.abs(bounds.getCenter(new THREE.Vector3()).x - visitorFloorBounds.max.x) < 0.25;
  };
  const eastFacadeParts = [
    ...namedObjects(park, "amusement-park-ferris-visitor-wall"),
    ...namedObjects(park, "amusement-park-ferris-visitor-window"),
    ...namedObjects(park, "amusement-park-ferris-visitor-window-frame"),
  ].filter(isEastFacadePart);
  const eastWallSegments = namedObjects(park, "amusement-park-ferris-visitor-wall").filter(isEastFacadePart);
  assert.ok(eastWallSegments.length >= 2, "east wall must be split into real segments around the accessible door");
  assert.ok(eastFacadeParts.every((part) => !boxesHaveVolumeOverlap(
    new THREE.Box3().setFromObject(part),
    accessibleDoorBounds,
  )), "east wall, glazing and frames must leave the accessible doorway physically open");

  const ticketBooths = namedObjects(park, "amusement-park-ferris-ticket-booth");
  assert.equal(ticketBooths.length, 2);
  assert.ok(ticketBooths.every((booth) => booth.userData.staffed && booth.userData.serviceRole));
  assert.ok(ticketBooths.some((booth) => booth.userData.accessibleCounter));

  const siteTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-site-base")).max.y;
  const porchTop = new THREE.Box3().setFromObject(visitorPorch).max.y;
  const canopyBounds = new THREE.Box3().setFromObject(visitorCanopy);
  const canopyPosts = namedObjects(park, "amusement-park-ferris-visitor-canopy-post");
  assert.equal(canopyPosts.length, 4, "entrance canopy should stand on four real supports");
  canopyPosts.forEach((post) => {
    const postBounds = new THREE.Box3().setFromObject(post);
    assert.ok(postBounds.min.y >= siteTop - 0.05, "canopy posts must not be buried below the park surface");
    assert.ok(postBounds.min.y <= porchTop + 0.05, "canopy posts must reach the porch instead of floating");
    assert.ok(postBounds.max.y >= canopyBounds.min.y - 0.06, "canopy posts must meet the canopy underside");
    assert.ok(postBounds.max.y <= canopyBounds.max.y + 0.08, "canopy posts must stop at the canopy structure");
  });
});

test("gives the Ferris visitor centre separated queues and safe accessible boarding", () => {
  const park = buildLowPolyAmusementPark();
  park.updateWorldMatrix(true, true);

  const entryLane = park.getObjectByName("amusement-park-ferris-entry-queue-lane");
  const exitLane = park.getObjectByName("amusement-park-ferris-exit-queue-lane");
  assert.ok(entryLane && exitLane, "Ferris boarding must provide physically separate entry and exit lanes");
  for (const [lane, role] of [[entryLane, "entry"], [exitLane, "exit"]]) {
    assert.equal(lane.userData.laneRole, role);
    assert.equal(lane.userData.oneWay, true);
    assert.equal(lane.userData.separatedFromOpposingFlow, true);
    assert.equal(lane.userData.connectsVisitorCentreToLoadingPlatform, true);
    assert.ok(lane.userData.clearWidthMeters >= 1.5);
  }
  const entryFloor = park.getObjectByName("amusement-park-ferris-entry-queue-floor");
  const exitFloor = park.getObjectByName("amusement-park-ferris-exit-queue-floor");
  assert.ok(entryFloor && exitFloor);
  assert.equal(
    boxesHaveVolumeOverlap(new THREE.Box3().setFromObject(entryFloor), new THREE.Box3().setFromObject(exitFloor)),
    false,
    "entry and exit queue floors must not merge into one conflicting path",
  );
  assert.ok(namedObjects(park, "amusement-park-ferris-entry-queue-rail").length >= 4);
  assert.ok(namedObjects(park, "amusement-park-ferris-exit-queue-rail").length >= 4);

  const loadingPlatform = park.getObjectByName("amusement-park-ferris-loading-platform");
  const boardingBridge = park.getObjectByName("amusement-park-ferris-boarding-bridge");
  const accessibleRamp = park.getObjectByName("amusement-park-ferris-accessible-ramp");
  const platformStair = park.getObjectByName("amusement-park-ferris-platform-stair");
  assert.ok(loadingPlatform && boardingBridge && accessibleRamp && platformStair);
  assert.equal(loadingPlatform.userData.barrierFreeBoarding, true);
  assert.equal(loadingPlatform.userData.separatedBoardingAndExit, true);
  assert.equal(boardingBridge.userData.retractable, true);
  assert.equal(boardingBridge.userData.extendsOnlyWhenStopped, true);
  assert.equal(boardingBridge.userData.state, "retracted", "boarding bridge must default to its sweep-safe retracted state");
  assert.equal(accessibleRamp.userData.barrierFree, true);
  assert.equal(accessibleRamp.userData.connectsGroundToPlatform, true);
  assert.ok(accessibleRamp.userData.clearWidthMeters >= 1.5);
  assert.ok(accessibleRamp.userData.maxGradient <= 1 / 12);
  assert.ok(accessibleRamp.userData.flightCount >= 3);
  assert.ok(namedObjects(park, "amusement-park-ferris-accessible-ramp-flight").length >= 3);
  assert.ok(namedObjects(park, "amusement-park-ferris-accessible-ramp-landing").length >= 4);
  assert.ok(namedObjects(park, "amusement-park-ferris-accessible-ramp-handrail").length >= 6);

  const accessibleWalk = namedObjects(park, "amusement-park-ferris-access-walkway")
    .find((walkway) => walkway.userData.connectsVisitorCentreToRamp);
  const approachSlabs = namedObjects(park, "amusement-park-ferris-accessible-approach-slab");
  assert.ok(accessibleWalk && approachSlabs.length >= 3);
  assert.ok(accessibleWalk.userData.clearWidthMeters >= 1.5);
  assert.ok(approachSlabs.every((slab) => {
    const size = new THREE.Box3().setFromObject(slab).getSize(new THREE.Vector3());
    return Math.min(size.x, size.z) >= 1.5 - 1e-6;
  }), "every accessible approach segment must provide at least 1.5 m of actual clear width");

  const arrivalSlab = park.getObjectByName("amusement-park-ferris-arrival-walk-slab");
  const frontDoors = [
    park.getObjectByName("amusement-park-ferris-visitor-entrance-door"),
    park.getObjectByName("amusement-park-ferris-visitor-exit-door"),
  ];
  assert.ok(arrivalSlab && frontDoors.every(Boolean));
  const arrivalTop = new THREE.Box3().setFromObject(arrivalSlab).max.y;
  frontDoors.forEach((door) => {
    const doorBottom = new THREE.Box3().setFromObject(door).min.y;
    assert.ok(Math.abs(doorBottom - arrivalTop) <= 0.02, "arrival walk and front door thresholds must differ by no more than 2 cm");
  });
  const accessibleDoor = park.getObjectByName("amusement-park-ferris-visitor-accessible-door");
  assert.ok(accessibleDoor);
  const accessibleDoorBounds = new THREE.Box3().setFromObject(accessibleDoor);
  const accessibleDoorCentre = accessibleDoorBounds.getCenter(new THREE.Vector3());
  const sideApproach = approachSlabs.reduce((closest, slab) => {
    const slabCentre = new THREE.Box3().setFromObject(slab).getCenter(new THREE.Vector3());
    const distance = Math.hypot(slabCentre.x - accessibleDoorCentre.x, slabCentre.z - accessibleDoorCentre.z);
    return !closest || distance < closest.distance ? { slab, distance } : closest;
  }, undefined).slab;
  const sideApproachBounds = new THREE.Box3().setFromObject(sideApproach);
  assert.ok(intervalOverlap(sideApproachBounds.min.z, sideApproachBounds.max.z, accessibleDoorBounds.min.z, accessibleDoorBounds.max.z) >= 1.4);
  assert.ok(sideApproachBounds.min.x <= accessibleDoorBounds.max.x && sideApproachBounds.max.x >= accessibleDoorBounds.min.x);
  assert.ok(Math.abs(accessibleDoorBounds.min.y - sideApproachBounds.max.y) <= 0.02, "side door and accessible path must have a threshold-free transition");

  const rampLandings = namedObjects(park, "amusement-park-ferris-accessible-ramp-landing");
  const rampStart = rampLandings.toSorted((first, second) => (
    new THREE.Box3().setFromObject(first).max.y - new THREE.Box3().setFromObject(second).max.y
  ))[0];
  const rampStartBounds = new THREE.Box3().setFromObject(rampStart);
  const connectedApproach = approachSlabs.find((slab) => {
    const slabBounds = new THREE.Box3().setFromObject(slab);
    return intervalOverlap(slabBounds.min.x, slabBounds.max.x, rampStartBounds.min.x, rampStartBounds.max.x) >= 1.2
      && intervalOverlap(slabBounds.min.z, slabBounds.max.z, rampStartBounds.min.z, rampStartBounds.max.z) >= 1.2;
  });
  assert.ok(connectedApproach, "accessible approach must physically overlap the ramp start landing");
  assert.ok(Math.abs(rampStartBounds.max.y - new THREE.Box3().setFromObject(connectedApproach).max.y) <= 0.02, "approach and ramp start must be flush within 2 cm");

  assert.equal(platformStair.userData.connectsGroundToPlatform, true);
  assert.ok(platformStair.userData.riserHeightMeters <= 0.18);
  assert.ok(platformStair.userData.treadDepthMeters >= 0.28);
  const platformSteps = namedObjects(park, "amusement-park-ferris-platform-step");
  assert.ok(platformSteps.length >= 14, "full-height platform stair needs safe, realistically sized risers");
  const siteTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-site-base")).max.y;
  const platformTop = new THREE.Box3().setFromObject(loadingPlatform).max.y;
  const stairBounds = platformSteps.reduce(
    (bounds, step) => bounds.union(new THREE.Box3().setFromObject(step)),
    new THREE.Box3(),
  );
  assert.ok(Math.abs(stairBounds.min.y - siteTop) < 0.12, "platform stair must start on the park surface");
  assert.ok(Math.abs(stairBounds.max.y - platformTop) < 0.12, "platform stair must finish flush with the boarding deck");
  const platformRisers = namedObjects(park, "amusement-park-ferris-platform-step-riser");
  assert.equal(platformRisers.length, platformSteps.length, "every stair tread needs a solid riser");
  platformRisers.forEach((riser) => {
    assert.equal(riser.userData.supportsTread, true);
    const matchingStep = platformSteps.find((step) => (
      step.userData.laneRole === riser.userData.laneRole
      && step.userData.stepNumber === riser.userData.stepNumber
    ));
    assert.ok(matchingStep);
    const riserBounds = new THREE.Box3().setFromObject(riser);
    const stepBounds = new THREE.Box3().setFromObject(matchingStep);
    const previousStep = platformSteps.find((step) => (
      step.userData.laneRole === riser.userData.laneRole
      && step.userData.stepNumber === riser.userData.stepNumber - 1
    ));
    const previousSurfaceTop = previousStep ? new THREE.Box3().setFromObject(previousStep).max.y : siteTop;
    assert.ok(Math.abs(riserBounds.min.y - previousSurfaceTop) <= 0.02, "each riser must rise continuously from the prior tread or site surface");
    assert.ok(Math.abs(riserBounds.max.y - stepBounds.max.y) <= 0.02, "each solid riser must meet the top of its tread");
    assert.ok(intervalOverlap(riserBounds.min.z, riserBounds.max.z, stepBounds.min.z, stepBounds.max.z) > 0.02);
  });

  const supportFootings = namedObjects(park, "amusement-park-ferris-support-footing");
  assert.equal(supportFootings.length, 4);
  assert.ok(supportFootings.every((footing) => (
    footing.userData.grounded
    && Math.abs(new THREE.Box3().setFromObject(footing).min.y - siteTop) <= 0.02
  )), "all four wheel footings must sit on the site surface");

  const platformGates = namedObjects(park, "amusement-park-ferris-platform-boarding-gate");
  assert.equal(platformGates.length, 2);
  assert.deepEqual(platformGates.map((gate) => gate.userData.gateRole).sort(), ["boarding", "exit"]);
  assert.ok(platformGates.every((gate) => (
    gate.userData.operable
    && gate.userData.state === "closed"
    && gate.userData.interlocked
    && gate.userData.opensOnlyWhenCabinDocked
    && gate.userData.clearWidthMeters >= 1.2
  )));

  const interlockGate = park.getObjectByName("amusement-park-ferris-platform-interlock-gate");
  assert.ok(interlockGate, "cabin-side platform edge needs a normally closed interlocked gate");
  assert.equal(interlockGate.userData.interlocked, true);
  assert.equal(interlockGate.userData.opensOnlyWhenCabinDocked, true);
  assert.equal(interlockGate.userData.state, "closed");
  assert.ok(interlockGate.userData.clearWidthMeters >= 1.25 && interlockGate.userData.clearWidthMeters <= 1.4);
  const interlockBounds = new THREE.Box3().setFromObject(interlockGate);
  const platformBounds = new THREE.Box3().setFromObject(loadingPlatform);
  assert.ok(Math.abs(interlockBounds.getCenter(new THREE.Vector3()).z - platformBounds.min.z) <= 0.2, "interlock gate must protect the cabin-side platform edge");
  const interlockPosts = namedObjects(interlockGate, "amusement-park-ferris-platform-interlock-gate-post")
    .toSorted((first, second) => new THREE.Box3().setFromObject(first).min.x - new THREE.Box3().setFromObject(second).min.x);
  assert.equal(interlockPosts.length, 2);
  const measuredInterlockOpening = new THREE.Box3().setFromObject(interlockPosts[1]).min.x
    - new THREE.Box3().setFromObject(interlockPosts[0]).max.x;
  assert.ok(measuredInterlockOpening >= 1.25 && measuredInterlockOpening <= 1.4, "physical interlock opening must match a 1.25-1.4 m cabin door");
  const interlockLeaf = interlockGate.getObjectByName("amusement-park-ferris-platform-interlock-gate-leaf");
  assert.ok(interlockLeaf, "interlock gate needs a physical leaf across the cabin-side opening");
  const interlockLeafSize = new THREE.Box3().setFromObject(interlockLeaf).getSize(new THREE.Vector3());
  assert.ok(interlockLeafSize.x >= 1.2 && interlockLeafSize.z <= 0.25);

  const connectorInterlock = park.getObjectByName("amusement-park-ferris-accessible-connector-interlock");
  const connectorLeaf = park.getObjectByName("amusement-park-ferris-accessible-connector-gate-leaf");
  assert.ok(connectorInterlock && connectorLeaf);
  assert.equal(connectorInterlock.userData.interlocked, true);
  assert.equal(connectorInterlock.userData.closesWhenRideMoves, true);
  assert.equal(connectorInterlock.userData.opensOnlyWhenCabinDocked, true);
  assert.equal(connectorInterlock.userData.state, "closed");
  assert.ok(connectorInterlock.userData.clearWidthMeters >= 1.5);
  const connectorPosts = namedObjects(connectorInterlock, "amusement-park-ferris-accessible-connector-gate-post")
    .toSorted((first, second) => new THREE.Box3().setFromObject(first).min.z - new THREE.Box3().setFromObject(second).min.z);
  assert.equal(connectorPosts.length, 2);
  const measuredConnectorOpening = new THREE.Box3().setFromObject(connectorPosts[1]).min.z
    - new THREE.Box3().setFromObject(connectorPosts[0]).max.z;
  assert.ok(measuredConnectorOpening >= 1.5);
  const connectorLeafSize = new THREE.Box3().setFromObject(connectorLeaf).getSize(new THREE.Vector3());
  assert.ok(connectorLeafSize.z >= measuredConnectorOpening - 0.05, "closed connector leaf must span the actual clear opening");
  const connectorBounds = new THREE.Box3().setFromObject(connectorInterlock);
  const connectorCentre = connectorBounds.getCenter(new THREE.Vector3());
  const connectorDeck = namedObjects(accessibleRamp, "amusement-park-ferris-accessible-ramp-top-connector").find((deck) => {
    const bounds = new THREE.Box3().setFromObject(deck);
    return connectorCentre.x >= bounds.min.x && connectorCentre.x <= bounds.max.x
      && connectorCentre.z >= bounds.min.z && connectorCentre.z <= bounds.max.z;
  });
  assert.ok(connectorDeck);
  const connectorDeckWidth = new THREE.Box3().setFromObject(connectorDeck).getSize(new THREE.Vector3()).z;
  assert.ok(connectorLeafSize.z >= connectorDeckWidth * 0.85, "connector leaf must protect nearly the full bridge width");

  const rearPlatformRails = namedObjects(park, "amusement-park-ferris-boarding-rail")
    .map((rail) => new THREE.Box3().setFromObject(rail))
    .filter((bounds) => Math.abs(bounds.getCenter(new THREE.Vector3()).z - platformBounds.max.z) <= 0.2);
  assert.ok(rearPlatformRails.length >= 3);
  const controlledRearOpenings = platformGates.map((gate) => {
    const centreX = new THREE.Box3().setFromObject(gate).getCenter(new THREE.Vector3()).x;
    return [centreX - gate.userData.clearWidthMeters * 0.5, centreX + gate.userData.clearWidthMeters * 0.5];
  });
  for (let x = platformBounds.min.x + 0.05; x <= platformBounds.max.x - 0.05; x += 0.05) {
    const isControlledOpening = controlledRearOpenings.some(([minX, maxX]) => x >= minX - 0.02 && x <= maxX + 0.02);
    if (isControlledOpening) continue;
    assert.ok(rearPlatformRails.some((bounds) => x >= bounds.min.x - 0.08 && x <= bounds.max.x + 0.08), `rear platform edge is unguarded near x=${x.toFixed(2)}`);
  }

  const queueParts = [
    ...namedObjects(park, "amusement-park-ferris-entry-queue-floor"),
    ...namedObjects(park, "amusement-park-ferris-exit-queue-floor"),
    ...namedObjects(park, "amusement-park-ferris-entry-queue-rail"),
    ...namedObjects(park, "amusement-park-ferris-exit-queue-rail"),
    ...namedObjects(park, "amusement-park-ferris-queue-post"),
  ];
  const stairParts = [
    ...namedObjects(park, "amusement-park-ferris-platform-step"),
    ...namedObjects(park, "amusement-park-ferris-platform-step-riser"),
    ...namedObjects(park, "amusement-park-ferris-stair-stringer"),
    ...namedObjects(park, "amusement-park-ferris-stair-handrail"),
    ...namedObjects(park, "amusement-park-ferris-stair-handrail-post"),
  ];
  const queueBounds = queueParts.map((part) => ({ part, bounds: new THREE.Box3().setFromObject(part) }));
  const stairBoundsByPart = stairParts.map((part) => ({ part, bounds: new THREE.Box3().setFromObject(part) }));
  const circulationCollisions = [];
  for (const queuePart of queueBounds) {
    for (const stairPart of stairBoundsByPart) {
      if (boxesHaveVolumeOverlap(queuePart.bounds, stairPart.bounds)) {
        circulationCollisions.push([queuePart.part.name, stairPart.part.name]);
      }
    }
  }
  assert.deepEqual(circulationCollisions, [], "queue floors, rails and posts must remain physically clear of every stair component");

  const movableGuard = park.getObjectByName("amusement-park-ferris-accessible-connector-movable-guard");
  assert.ok(movableGuard);
  assert.equal(movableGuard.userData.state, "stored");
  park.userData.setMotionEnabled(false);
  assert.ok(platformGates.every((gate) => gate.userData.state === "open"));
  assert.equal(interlockGate.userData.state, "open");
  assert.equal(connectorInterlock.userData.state, "open");
  assert.equal(movableGuard.userData.state, "deployed");
  assert.equal(boardingBridge.userData.state, "extended");
  park.userData.setMotionEnabled(true);
  assert.ok(platformGates.every((gate) => gate.userData.state === "closed"));
  assert.equal(interlockGate.userData.state, "closed");
  assert.equal(connectorInterlock.userData.state, "closed");
  assert.equal(movableGuard.userData.state, "stored");
  assert.equal(boardingBridge.userData.state, "retracted");
});

test("closes the full-width accessible transfer gate whenever the Ferris wheel can move", () => {
  const park = buildLowPolyAmusementPark();
  park.updateWorldMatrix(true, true);

  const transferGate = park.getObjectByName("amusement-park-ferris-accessible-transfer-gate");
  const transferLeaf = park.getObjectByName("amusement-park-ferris-accessible-transfer-gate-leaf");
  assert.ok(transferGate && transferLeaf);
  assert.equal(transferGate.userData.operable, true);
  assert.equal(transferGate.userData.interlocked, true);
  assert.equal(transferGate.userData.opensOnlyWhenCabinDocked, true);
  assert.equal(transferGate.userData.state, "closed");
  assert.ok(transferGate.userData.clearWidthMeters >= 1.5);
  const transferPosts = namedObjects(transferGate, "amusement-park-ferris-accessible-transfer-gate-post")
    .toSorted((first, second) => new THREE.Box3().setFromObject(first).min.z - new THREE.Box3().setFromObject(second).min.z);
  assert.equal(transferPosts.length, 2);
  const measuredTransferOpening = new THREE.Box3().setFromObject(transferPosts[1]).min.z
    - new THREE.Box3().setFromObject(transferPosts[0]).max.z;
  assert.ok(measuredTransferOpening >= 1.5);
  const transferLeafSize = new THREE.Box3().setFromObject(transferLeaf).getSize(new THREE.Vector3());
  assert.ok(transferLeafSize.z >= measuredTransferOpening - 0.05, "closed transfer leaf must span the complete 1.5 m opening");

  setFerrisRotorAngle(park, 0.09);
  park.userData.setMotionEnabled(false);
  assert.equal(transferGate.userData.state, "closed", "a stopped but misaligned wheel must keep the transfer gate closed");
  park.userData.setMotionEnabled(true);
  setFerrisRotorAngle(park, 0);
  park.userData.setMotionEnabled(false);
  assert.equal(transferGate.userData.state, "open");
  park.userData.setMotionEnabled(true);
  assert.equal(transferGate.userData.state, "closed");
});

test("opens Ferris station interlocks only at precise stopped-cabin alignment", () => {
  const park = buildLowPolyAmusementPark();
  const flowGates = namedObjects(park, "amusement-park-ferris-platform-boarding-gate");
  const platformInterlock = park.getObjectByName("amusement-park-ferris-platform-interlock-gate");
  const connectorInterlock = park.getObjectByName("amusement-park-ferris-accessible-connector-interlock");
  const transferGate = park.getObjectByName("amusement-park-ferris-accessible-transfer-gate");
  const movableGuard = park.getObjectByName("amusement-park-ferris-accessible-connector-movable-guard");
  const boardingBridge = park.getObjectByName("amusement-park-ferris-boarding-bridge");
  assert.equal(flowGates.length, 2);
  assert.ok(platformInterlock && connectorInterlock && transferGate && movableGuard && boardingBridge);

  setFerrisRotorAngle(park, 0.09);
  park.userData.setMotionEnabled(false);
  assert.ok(flowGates.every((gate) => gate.userData.state === "closed"));
  assert.equal(platformInterlock.userData.state, "closed");
  assert.equal(connectorInterlock.userData.state, "closed");
  assert.equal(transferGate.userData.state, "closed");
  assert.equal(movableGuard.userData.state, "stored");
  assert.equal(boardingBridge.userData.state, "retracted");

  park.userData.setMotionEnabled(true);
  setFerrisRotorAngle(park, 0);
  park.userData.setMotionEnabled(false);
  assert.ok(flowGates.every((gate) => gate.userData.state === "open"));
  assert.equal(platformInterlock.userData.state, "open");
  assert.equal(connectorInterlock.userData.state, "open");
  assert.equal(transferGate.userData.state, "open");
  assert.equal(movableGuard.userData.state, "deployed");
  assert.equal(boardingBridge.userData.state, "extended");

  park.userData.setMotionEnabled(true);
  assert.ok(flowGates.every((gate) => gate.userData.state === "closed"));
  assert.equal(platformInterlock.userData.state, "closed");
  assert.equal(connectorInterlock.userData.state, "closed");
  assert.equal(transferGate.userData.state, "closed");
  assert.equal(movableGuard.userData.state, "stored");
  assert.equal(boardingBridge.userData.state, "retracted");
});

test("opens only the precisely docked lowest Ferris cabin door while boarding", () => {
  const park = buildLowPolyAmusementPark();
  const cabins = namedObjects(park, "amusement-park-ferris-cabin");
  const cabinDoors = namedObjects(park, "amusement-park-ferris-cabin-door");
  assert.equal(cabins.length, 12);
  assert.equal(cabinDoors.length, 12);
  assert.ok(cabinDoors.every((door) => door.userData.state === "closed"));
  assert.ok(cabinDoors.every((door) => door.visible), "all closed cabin door leaves should be visible by default");

  setFerrisRotorAngle(park, 0.09);
  park.userData.setMotionEnabled(false);
  assert.ok(cabinDoors.every((door) => door.userData.state === "closed"), "misaligned stopped cabins must remain locked");

  park.userData.setMotionEnabled(true);
  setFerrisRotorAngle(park, 0);
  park.userData.setMotionEnabled(false);
  park.updateWorldMatrix(true, true);
  const lowestCabin = cabins.toSorted((first, second) => (
    new THREE.Box3().setFromObject(first).min.y - new THREE.Box3().setFromObject(second).min.y
  ))[0];
  const dockedDoor = lowestCabin.getObjectByName("amusement-park-ferris-cabin-door");
  const openDoors = cabinDoors.filter((door) => door.userData.state === "open");
  assert.equal(openDoors.length, 1, "only one docked cabin door may open at the station");
  assert.equal(openDoors[0], dockedDoor, "the open door must belong to the lowest aligned cabin");
  assert.equal(dockedDoor.visible, false, "the docked sliding leaf must clear the cabin doorway");
  assert.ok(cabinDoors.filter((door) => door !== dockedDoor).every((door) => door.userData.state === "closed"));
  assert.ok(cabinDoors.filter((door) => door !== dockedDoor).every((door) => door.visible));

  park.userData.setMotionEnabled(true);
  assert.ok(cabinDoors.every((door) => door.userData.state === "closed"), "all cabin doors must close before ride motion resumes");
  assert.ok(cabinDoors.every((door) => door.visible));
});

test("keeps the Ferris visitor and boarding centre clear of ride and park obstructions", () => {
  const park = buildLowPolyAmusementPark();
  park.updateWorldMatrix(true, true);

  const clearanceRoots = [
    "amusement-park-ferris-visitor-centre",
    "amusement-park-ferris-entry-queue-lane",
    "amusement-park-ferris-exit-queue-lane",
    "amusement-park-ferris-accessible-ramp",
    "amusement-park-ferris-platform-stair",
    "amusement-park-ferris-loading-platform",
  ].map((name) => park.getObjectByName(name));
  assert.ok(clearanceRoots.every(Boolean), "all Ferris visitor and boarding structures must exist before checking clearances");
  const boardingCentre = park.getObjectByName("amusement-park-ferris-boarding-centre");
  assert.ok(boardingCentre);
  const clearanceMeshes = meshDescendants(boardingCentre);

  const wheelSupports = [
    ...namedObjects(park, "amusement-park-ferris-support"),
    ...namedObjects(park, "amusement-park-ferris-support-footing"),
  ];
  const supportCollisions = clearanceMeshes.filter((visitorPart) => wheelSupports.some((support) => boxesHaveVolumeOverlap(
    new THREE.Box3().setFromObject(visitorPart),
    new THREE.Box3().setFromObject(support),
  )));
  assert.deepEqual(supportCollisions.map((part) => part.name), [], "visitor centre, routes and platform must clear all wheel supports");

  const parkPaths = [
    ...namedObjects(park, "amusement-park-main-promenade"),
    ...namedObjects(park, "amusement-park-central-walk"),
    ...namedObjects(park, "amusement-park-cross-walk"),
  ];
  const pathCollisions = clearanceMeshes.filter((visitorPart) => parkPaths.some((path) => boxesHaveVolumeOverlap(
    new THREE.Box3().setFromObject(visitorPart),
    new THREE.Box3().setFromObject(path),
  )));
  assert.deepEqual(pathCollisions.map((part) => part.name), [], "Ferris visitor infrastructure must not be built through public park paths");

  const safetyFence = park.getObjectByName("amusement-park-ferris-safety-fence");
  const fenceMeshes = meshDescendants(safetyFence);
  const fenceCollisions = clearanceMeshes.filter((visitorPart) => fenceMeshes.some((fencePart) => boxesHaveVolumeOverlap(
    new THREE.Box3().setFromObject(visitorPart),
    new THREE.Box3().setFromObject(fencePart),
  )));
  assert.deepEqual(fenceCollisions.map((part) => part.name), [], "visitor routes must use safety-fence openings rather than crossing rails or posts");

  assert.equal(park.getObjectByName("amusement-park-ferris-boarding-bridge").userData.state, "retracted");
  assert.equal(park.getObjectByName("amusement-park-ferris-platform-interlock-gate").userData.state, "closed");
  assert.equal(park.getObjectByName("amusement-park-ferris-accessible-connector-interlock").userData.state, "closed");
  assert.equal(park.getObjectByName("amusement-park-ferris-accessible-connector-movable-guard").userData.state, "stored");
  assert.ok(namedObjects(park, "amusement-park-ferris-platform-boarding-gate").every((gate) => gate.userData.state === "closed"));
  const fixedStationMeshes = meshDescendants(boardingCentre);
  const fixedStationBounds = fixedStationMeshes.map((mesh) => ({
    mesh,
    bounds: new THREE.Box3().setFromObject(mesh),
  }));
  const rotor = park.getObjectByName("amusement-park-ferris-wheel-rotor");
  const cabins = namedObjects(park, "amusement-park-ferris-cabin");
  const cabinMeshes = cabins.flatMap((cabin) => meshDescendants(cabin));
  const sweepCollisions = [];
  for (let degree = 0; degree < 360; degree += 1) {
    const angle = THREE.MathUtils.degToRad(degree);
    rotor.rotation.z = angle;
    cabins.forEach((cabin) => { cabin.rotation.z = -angle; });
    park.updateWorldMatrix(true, true);
    for (const cabinPart of cabinMeshes) {
      const cabinPartBounds = new THREE.Box3().setFromObject(cabinPart);
      const collision = fixedStationBounds.find(({ bounds }) => boxesHaveVolumeOverlap(cabinPartBounds, bounds));
      if (collision && sweepCollisions.length < 20) {
        sweepCollisions.push({ degree, cabinPart: cabinPart.name, visitorPart: collision.mesh.name });
      }
    }
  }
  rotor.rotation.z = 0;
  cabins.forEach((cabin) => { cabin.rotation.z = 0; });
  park.updateWorldMatrix(true, true);
  assert.deepEqual(sweepCollisions, [], "every cabin child mesh must remain outside the entire fixed boarding centre through 360 one-degree samples");
});

test("animates rides, supports pausing, and powers night lighting", () => {
  const park = buildLowPolyAmusementPark();
  const carousel = park.getObjectByName("amusement-park-carousel-turntable");
  const pirate = park.getObjectByName("amusement-park-pirate-pivot");
  const ferris = park.getObjectByName("amusement-park-ferris-wheel-rotor");
  const train = park.getObjectByName("amusement-park-coaster-train");
  assert.ok(carousel && pirate && ferris && train);

  park.userData.update(1, 1);
  assert.notEqual(carousel.rotation.y, 0);
  assert.notEqual(pirate.rotation.z, 0);
  assert.notEqual(ferris.rotation.z, 0);
  const firstCar = namedObjects(park, "amusement-park-coaster-car")[0];
  assert.ok(firstCar.position.length() > 10);
  const trackTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-kart-track")).max.y;
  const kartBottom = new THREE.Box3().setFromObject(namedObjects(park, "amusement-park-go-kart")[0]).min.y;
  assert.ok(kartBottom > trackTop, "go-karts should sit on top of the flat track");

  const pirateParts = [
    "amusement-park-pirate-suspension", "amusement-park-pirate-hull", "amusement-park-pirate-bow",
    "amusement-park-pirate-mast", "amusement-park-pirate-sail",
  ];
  for (const angle of [-0.3, 0.3]) {
    pirate.rotation.z = angle;
    park.updateMatrixWorld(true);
    const sweepBounds = pirateParts.reduce(
      (bounds, name) => bounds.union(new THREE.Box3().setFromObject(park.getObjectByName(name))),
      new THREE.Box3(),
    );
    assert.ok(sweepBounds.min.y > 0.4, "pirate ship sweep should clear the park surface");
  }
  pirate.rotation.z = 0;
  park.updateWorldMatrix(true, true);
  const pirateDeckTop = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-pirate-hull")).max.y;
  const piratePlatform = park.getObjectByName("amusement-park-pirate-loading-platform");
  const piratePlatformBounds = new THREE.Box3().setFromObject(piratePlatform);
  assert.ok(Math.abs(pirateDeckTop - piratePlatformBounds.max.y) < 0.1, "pirate loading platform should align with the resting deck");
  assert.equal(piratePlatformBounds.intersectsBox(new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-pirate-hull"))), false);
  const pirateSailBounds = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-pirate-sail"));
  const pirateDeckBounds = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-pirate-deck"));
  const pirateMastCentre = new THREE.Box3().setFromObject(park.getObjectByName("amusement-park-pirate-mast")).getCenter(new THREE.Vector3());
  assert.ok(pirateSailBounds.min.y > pirateDeckBounds.max.y, "sail cloth and yards should remain above the passenger deck");
  assert.ok(pirateSailBounds.min.x < pirateMastCentre.x && pirateSailBounds.max.x > pirateMastCentre.x, "sail should open to both sides of the mast");

  park.userData.setMotionEnabled(false);
  const previousRotation = carousel.rotation.y;
  park.userData.update(1, 2);
  assert.equal(carousel.rotation.y, previousRotation);

  const bulb = namedObjects(park, "amusement-park-light-bulb")[0];
  const nightLights = namedObjects(park, "street-light-point-light");
  const pooledLights = park.getObjectByName("amusement-park-night-light-pool").children;
  assert.ok(bulb instanceof THREE.Mesh);
  assert.ok(nightLights.length > 10);
  park.userData.setPowered(true);
  assert.ok(bulb.material.emissiveIntensity > 1);
  assert.ok(nightLights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => light.visible && light.intensity > 0));
  park.userData.setPowered(false);
  assert.ok(nightLights.every((light) => light.intensity === 0));
  assert.ok(pooledLights.every((light) => !light.visible && light.intensity === 0));
});

test("meets the intended independent city-showcase scale", () => {
  const park = buildLowPolyAmusementPark();
  const metrics = measureModelGeometry(park);
  assert.ok(metrics.size.x >= 178);
  assert.ok(metrics.size.y >= 39);
  assert.ok(metrics.size.z >= 128);
  assert.ok(metrics.faceCount > 10_000);
  assert.equal(park.userData.siteSize.x, 180);
  assert.equal(park.userData.siteSize.z, 130);
  assert.equal(park.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(park.userData.rideScaleStandard, "rabbit-rider");
  assert.equal(park.userData.ferrisCabinCapacity, 6);
});

test("sizes every major ride against the 2.4 metre rabbit-rider reference", () => {
  const park = buildLowPolyAmusementPark();
  park.updateMatrixWorld(true);
  const sizeOf = (name) => new THREE.Box3().setFromObject(park.getObjectByName(name)).getSize(new THREE.Vector3());
  const carousel = sizeOf("amusement-park-carousel");
  const horse = sizeOf("amusement-park-carousel-horse");
  const ferris = sizeOf("amusement-park-ferris-wheel");
  const cabin = sizeOf("amusement-park-ferris-cabin");
  const pirate = sizeOf("amusement-park-pirate-ship");
  const coaster = sizeOf("amusement-park-roller-coaster");
  const dropTower = sizeOf("amusement-park-drop-tower");

  assert.ok(carousel.x >= 18, "carousel should read as a full-size pavilion");
  assert.ok(Math.max(horse.x, horse.z) >= 3.2, "carousel horse should exceed the 2.4 m rider reference");
  assert.ok(ferris.y >= 36, "Ferris wheel should be a skyline-scale attraction");
  assert.ok(cabin.x >= 4.8 && cabin.z >= 2.7, "Ferris cabin should fit two rows of passengers");
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin").every((item) => item.userData.capacity === 6));
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin").every((item) => item.userData.enclosure === "sealed-glass"));
  assert.ok(namedObjects(park, "amusement-park-ferris-cabin-glass-wall").every((item) => item.material.transparent));
  assert.ok(pirate.x >= 17, "pirate ship should carry a full passenger deck");
  assert.ok(coaster.y >= 32, "roller coaster should rise above nearby buildings");
  assert.ok(dropTower.y >= 38, "drop tower should remain the tallest vertical ride");
});

test("exposes the amusement park showroom from the model archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/amusement-park/AmusementParkDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(demoSource, /buildLowPolyAmusementPark/);
  assert.match(demoSource, /奇境都会游乐园/);
  assert.match(demoSource, /云际过山车/);
  assert.match(demoSource, /彩虹翻斗乐/);
  assert.match(demoSource, /极速卡丁车场/);
  assert.match(demoSource, /点亮夜景/);
  assert.match(demoSource, /暂停所有设施/);
  assert.match(demoSource, /返回模型分类/);
  assert.match(demoSource, /\/models\/forest\/tree_normal_medium_redwood_a\.glb/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.doesNotMatch(demoSource, /buildLowPolyRabbitScaleReference/);
  assert.match(archiveSource, /大型游乐园/);
  assert.match(archiveSource, /\/demos\/amusement-park/);
  assert.match(studioSource, /医院 · 游乐园/);
});
