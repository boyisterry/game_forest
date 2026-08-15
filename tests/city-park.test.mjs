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
  assert.ok(park.getObjectByName("city-park-lake-pavilion"));
  assert.equal(namedObjects(park, "city-park-pavilion-guardrail").length, 2);
  assert.equal(namedObjects(park, "city-park-wetland-island").length, 2);
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

test("provides children, sports and all-age fitness facilities", () => {
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
  assert.equal(park.userData.sportsCourtCount, 1);
  assert.ok(park.getObjectByName("city-park-community-sports-court"));
  assert.equal(park.userData.fitnessEquipmentCount, 10);
  assert.equal(namedObjects(park, "city-park-fitness-equipment").length, 10);
});

test("includes a botanical garden, greenhouse and accessible amphitheatre", () => {
  const park = buildLowPolyCityPark();
  assert.equal(park.userData.greenhouseCount, 1);
  assert.equal(park.userData.flowerBedCount, 15);
  assert.equal(namedObjects(park, "city-park-botanical-flower-bed").length, 15);
  assert.equal(namedObjects(park, "city-park-botanical-flowers").length, 15);
  assert.equal(namedObjects(park, "city-park-greenhouse-glass-wall").length, 6);
  const greenhouse = park.getObjectByName("city-park-greenhouse");
  const greenhouseRoofs = namedObjects(park, "city-park-greenhouse-glass-roof");
  assert.equal(greenhouseRoofs.length, 2);
  assert.equal(namedObjects(park, "city-park-greenhouse-entry-door").length, 2);
  assert.equal(greenhouse.userData.structurallyFramed, true);
  assert.equal(greenhouse.userData.roofPitchRadians, 0.24);
  assert.equal(namedObjects(park, "city-park-greenhouse-frame-post").length, 11);
  assert.equal(namedObjects(park, "city-park-greenhouse-ridge-beam").length, 1);
  assert.equal(namedObjects(park, "city-park-greenhouse-eave-beam").length, 2);
  assert.ok(greenhouseRoofs.every((roof) => Math.abs(Math.abs(roof.rotation.z) - 0.24) < 0.001));
  const roofBounds = greenhouseRoofs.map((roof) => new THREE.Box3().setFromObject(roof));
  assert.ok(roofBounds.every((bounds) => bounds.min.y >= 6.34), "greenhouse roof should meet the wall eaves instead of cutting through them");
  const theatre = park.getObjectByName("city-park-open-air-amphitheatre");
  assert.equal(park.userData.amphitheatreSeatRows, 6);
  assert.equal(theatre.userData.accessibleFrontRow, true);
  assert.equal(namedObjects(park, "city-park-amphitheatre-seat-row").length, 6);
  assert.equal(namedObjects(park, "city-park-amphitheatre-wheelchair-space").length, 4);
  assert.equal(namedObjects(park, "city-park-amphitheatre-access-path").length, 2);
  assert.ok(namedObjects(park, "city-park-amphitheatre-access-path").every((path) => path.userData.barrierFree));
  assert.ok(park.getObjectByName("city-park-amphitheatre-stage"));
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
  assert.ok(benchLegs.every((leg) => {
    const legBottom = leg.position.y - leg.geometry.parameters.height * 0.5;
    return Math.abs(legBottom - leg.userData.groundContactY) < 0.001;
  }));
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
  assert.equal(namedObjects(park, "city-roadside-planter-lowpoly").length, 12);
  assert.equal(namedObjects(park, "city-park-reused-tree-anchor").length, 49);
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
  assert.match(demoSource, /露天剧场/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /综合城市公园/);
  assert.match(archiveSource, /\/demos\/city-park/);
  assert.match(studioSource, /消防局 · 城市公园/);
});
