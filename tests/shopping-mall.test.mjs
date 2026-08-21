import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyShoppingMall, SHOPPING_MALL_SCALE } from "../app/lib/map/shoppingMall.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

function worldBounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function overlapsXZ(a, b, tolerance = 0.01) {
  return a.min.x < b.max.x - tolerance
    && a.max.x > b.min.x + tolerance
    && a.min.z < b.max.z - tolerance
    && a.max.z > b.min.z + tolerance;
}

function overlaps3D(a, b, tolerance = 0.01) {
  return overlapsXZ(a, b, tolerance)
    && a.min.y < b.max.y - tolerance
    && a.max.y > b.min.y + tolerance;
}

function gapXZ(a, b) {
  const x = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const z = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(x, z);
}

function assertGroundedOn(object, surface, message) {
  const objectBounds = worldBounds(object);
  const surfaceBounds = worldBounds(surface);
  assert.ok(
    Math.abs(objectBounds.min.y - surfaceBounds.max.y) <= 0.025,
    `${message}: expected ${objectBounds.min.y.toFixed(3)} to meet ${surfaceBounds.max.y.toFixed(3)}`,
  );
}

test("builds a five-building open-air shopping centre", () => {
  const mall = buildLowPolyShoppingMall();
  assert.equal(mall.name, "city-shopping-mall-lowpoly");
  assert.equal(mall.userData.modelType, "shopping-mall");
  assert.equal(mall.userData.generatedLocally, true);
  assert.equal(mall.userData.buildingCount, 5);
  assert.deepEqual(mall.userData.zones, ["overview", "exterior", "courtyard", "food-street", "lifestyle", "upper-arcade", "interior"]);
  assert.ok(mall.getObjectByName("shopping-mall-north-anchor"));
  assert.ok(mall.getObjectByName("shopping-mall-west-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-east-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-southwest-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-southeast-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-grand-entry"));
});

test("wraps every mall wing in a continuous glass curtain facade", () => {
  const mall = buildLowPolyShoppingMall();
  const panels = namedObjects(mall, "shopping-mall-glass-curtain-panel");
  const mullions = namedObjects(mall, "shopping-mall-curtain-wall-mullion");
  assert.ok(panels.length > 300);
  assert.ok(mullions.length > 100);
  assert.ok(panels.every((panel) => panel.material.transparent));
  assert.deepEqual(new Set(panels.map((panel) => panel.userData.facadeSide)), new Set(["+x", "-x", "+z", "-z"]));
  assert.equal(namedObjects(mall, "shopping-mall-upper-window").length, 0);
});

test("keeps the grand entrance fully open and barrier free", () => {
  const mall = buildLowPolyShoppingMall();
  const entrance = mall.getObjectByName("shopping-mall-grand-entry");
  const opening = mall.getObjectByName("shopping-mall-open-entry-void");
  assert.ok(entrance && opening);
  assert.equal(opening.userData.width, 21 * SHOPPING_MALL_SCALE);
  assert.equal(opening.userData.clearHeight, 11.8 * SHOPPING_MALL_SCALE);
  assert.equal(opening.userData.barrierFree, true);
  assert.equal(opening.userData.openToCourtyard, true);
  assert.equal(mall.getObjectByName("shopping-mall-entry-glass-portal"), undefined);
  assert.equal(namedObjects(entrance, "shopping-mall-entry-tower").length, 2);
  assert.equal(namedObjects(entrance, "shopping-mall-entry-sign-beam").length, 1);
  assert.equal(namedObjects(mall, "shopping-mall-dropoff-layby").length, 2);
  assert.ok(mall.getObjectByName("shopping-mall-pedestrian-entry-plaza"));
  assert.equal(mall.getObjectByName("shopping-mall-main-dropoff").userData.separatedFromEntry, true);
});

test("places outward-facing ground-floor stores around the whole complex", () => {
  const mall = buildLowPolyShoppingMall();
  const storefronts = namedObjects(mall, "shopping-mall-storefront");
  const exterior = storefronts.filter((store) => store.userData.exterior);
  const courtyard = storefronts.filter((store) => !store.userData.exterior);
  assert.equal(storefronts.length, 62);
  assert.equal(exterior.length, 34);
  assert.equal(courtyard.length, 28);
  assert.equal(mall.userData.storefrontCount, 62);
  assert.equal(mall.userData.exteriorStorefrontCount, 34);
  assert.equal(mall.userData.courtyardStorefrontCount, 28);
  assert.equal(namedObjects(mall, "shopping-mall-storefront-glass").length, 62);
  assert.equal(namedObjects(mall, "shopping-mall-storefront-door").length, 62);
  assert.ok(namedObjects(mall, "shopping-mall-storefront-door").every((door) => door.userData.operable && door.userData.clearWidth >= 1.4));
  assert.equal(namedObjects(mall, "shopping-mall-store-sign").length, 62);
  assert.equal(namedObjects(mall, "shopping-mall-store-awning").length, 62);
});

test("includes fast food, coffee, burger and milk tea tenants", () => {
  const mall = buildLowPolyShoppingMall();
  assert.deepEqual(mall.userData.tenantTypes, ["fast-food", "coffee", "burger", "milk-tea", "bakery", "convenience", "restaurant", "fashion"]);
  assert.ok(mall.userData.restaurantCount >= 40);
  assert.ok(mall.userData.coffeeShopCount >= 7);
  assert.ok(mall.userData.burgerShopCount >= 7);
  assert.ok(mall.userData.milkTeaShopCount >= 7);
  assert.ok(namedObjects(mall, "shopping-mall-food-counter").length >= 40);
  const tenantTypes = new Set(namedObjects(mall, "shopping-mall-storefront").map((store) => store.userData.tenantType));
  for (const type of ["fast-food", "coffee", "burger", "milk-tea"]) assert.ok(tenantTypes.has(type));
});

test("fits every storefront with an accessible and individually identified interior", () => {
  const mall = buildLowPolyShoppingMall();
  const storefronts = namedObjects(mall, "shopping-mall-storefront");
  const modules = namedObjects(mall, "shopping-mall-store-interior-module");
  const floors = namedObjects(mall, "shopping-mall-store-floor-finish");
  const clearZones = namedObjects(mall, "shopping-mall-store-entry-clear-zone");
  const checkouts = namedObjects(mall, "shopping-mall-store-checkout-counter");
  const nameplates = namedObjects(mall, "shopping-mall-store-interior-nameplate");

  assert.equal(mall.userData.interiorStoreCount, 62);
  assert.equal(modules.length, storefronts.length);
  assert.equal(floors.length, storefronts.length);
  assert.equal(clearZones.length, storefronts.length);
  assert.equal(checkouts.length, storefronts.length);
  assert.equal(nameplates.length, storefronts.length);

  const seenIndexes = new Set();
  for (const store of storefronts) {
    const { storefrontIndex, tenantType } = store.userData;
    assert.ok(Number.isInteger(storefrontIndex) && !seenIndexes.has(storefrontIndex));
    seenIndexes.add(storefrontIndex);

    const storeModules = namedObjects(store, "shopping-mall-store-interior-module");
    assert.equal(storeModules.length, 1, `store ${storefrontIndex} should own one interior module`);
    const interiorModule = storeModules[0];
    assert.equal(interiorModule.userData.storefrontIndex, storefrontIndex);
    assert.equal(interiorModule.userData.tenantType, tenantType);
    assert.equal(interiorModule.userData.enterable, true);
    assert.ok(interiorModule.userData.clearAisleWidth >= 1.5);
    assert.ok(interiorModule.userData.interiorDepth >= 5.5);

    for (const objectName of [
      "shopping-mall-store-floor-finish",
      "shopping-mall-store-entry-clear-zone",
      "shopping-mall-store-checkout-counter",
      "shopping-mall-store-interior-nameplate",
    ]) {
      const object = namedObjects(interiorModule, objectName);
      assert.equal(object.length, 1, `store ${storefrontIndex} should own one ${objectName}`);
      assert.equal(object[0].userData.storefrontIndex, storefrontIndex);
      assert.equal(object[0].userData.tenantType, tenantType);
    }

    const floor = interiorModule.getObjectByName("shopping-mall-store-floor-finish");
    const clearZone = interiorModule.getObjectByName("shopping-mall-store-entry-clear-zone");
    const checkout = interiorModule.getObjectByName("shopping-mall-store-checkout-counter");
    const door = store.getObjectByName("shopping-mall-storefront-door");
    assert.equal(door.userData.thresholdFree, true);
    assertGroundedOn(door, floor, `store ${storefrontIndex} door threshold`);
    assertGroundedOn(checkout, floor, `store ${storefrontIndex} checkout`);
    assert.equal(overlapsXZ(worldBounds(checkout), worldBounds(clearZone)), false, `store ${storefrontIndex} checkout should keep its entrance aisle clear`);
  }
  assert.equal(seenIndexes.size, 62);
});

test("gives all eight tenant types distinct, floor-supported fit-outs", () => {
  const mall = buildLowPolyShoppingMall();
  const modules = namedObjects(mall, "shopping-mall-store-interior-module");
  const fixtures = namedObjects(mall, "shopping-mall-tenant-fixture");
  const expectedTenantTypes = new Set(mall.userData.tenantTypes);

  assert.equal(mall.userData.tenantInteriorTypeCount, 8);
  assert.equal(expectedTenantTypes.size, 8);
  assert.deepEqual(new Set(modules.map((interiorModule) => interiorModule.userData.tenantType)), expectedTenantTypes);
  assert.ok(fixtures.length >= modules.length * 2);

  for (const interiorModule of modules) {
    const floor = interiorModule.getObjectByName("shopping-mall-store-floor-finish");
    const clearZone = interiorModule.getObjectByName("shopping-mall-store-entry-clear-zone");
    const moduleFixtures = namedObjects(interiorModule, "shopping-mall-tenant-fixture");
    const fixtureTypes = new Set(moduleFixtures.map((fixture) => fixture.userData.fixtureType));
    assert.ok(moduleFixtures.length >= 2, `store ${interiorModule.userData.storefrontIndex} needs more than a placeholder counter`);
    assert.ok(fixtureTypes.size >= 2, `store ${interiorModule.userData.storefrontIndex} should have a recognisable tenant-specific fit-out`);
    for (const fixture of moduleFixtures) {
      assert.equal(fixture.userData.tenantType, interiorModule.userData.tenantType);
      assert.equal(fixture.userData.storefrontIndex, interiorModule.userData.storefrontIndex);
      assert.equal(fixture.userData.supportedToFloor, true);
      assert.equal(typeof fixture.userData.fixtureType, "string");
      assert.ok(fixture.userData.fixtureType.length > 0);
      assertGroundedOn(fixture, floor, `store ${interiorModule.userData.storefrontIndex} fixture ${fixture.userData.fixtureType}`);
      assert.equal(overlapsXZ(worldBounds(fixture), worldBounds(clearZone)), false, `store ${interiorModule.userData.storefrontIndex} fixture should keep its entrance aisle clear`);
    }
  }
});

test("keeps all shop partitions, entries and tenant fit-outs outside the accessible aisle", () => {
  const mall = buildLowPolyShoppingMall();
  const storefronts = namedObjects(mall, "shopping-mall-storefront");
  const finishesByTenant = new Map();

  assert.equal(storefronts.length, 62);
  for (const store of storefronts) {
    const storeIndex = store.userData.storefrontIndex;
    const interior = store.getObjectByName("shopping-mall-store-interior-module");
    const door = store.getObjectByName("shopping-mall-storefront-door");
    const glazing = store.getObjectByName("shopping-mall-storefront-glass");
    const clearZone = interior.getObjectByName("shopping-mall-store-entry-clear-zone");
    const clearAisle = interior.getObjectByName("shopping-mall-store-clear-aisle");
    const checkout = interior.getObjectByName("shopping-mall-store-checkout-counter");
    const partitions = namedObjects(interior, "shopping-mall-store-side-partition");
    const fixtures = namedObjects(interior, "shopping-mall-tenant-fixture");
    const floor = interior.getObjectByName("shopping-mall-store-floor-finish");

    assert.equal(partitions.length, 2, `store ${storeIndex} should have two side partitions`);
    assert.ok(clearAisle.userData.clearWidth >= 1.5, `store ${storeIndex} should preserve a 1.5 m central aisle`);
    for (const partition of partitions) {
      for (const opening of [door, glazing, clearZone]) {
        assert.equal(
          overlaps3D(worldBounds(partition), worldBounds(opening)),
          false,
          `store ${storeIndex} partition should not cut through ${opening.name}`,
        );
      }
    }
    for (const obstruction of [...fixtures, checkout]) {
      assert.equal(
        overlapsXZ(worldBounds(clearAisle), worldBounds(obstruction)),
        false,
        `store ${storeIndex} central aisle should remain clear of ${obstruction.userData.fixtureType ?? obstruction.name}`,
      );
    }

    assert.equal(floor.userData.finishKey, store.userData.tenantType);
    const finish = `${floor.material.uuid}:${floor.material.color.getHexString()}`;
    const tenantFinishes = finishesByTenant.get(store.userData.tenantType) ?? new Set();
    tenantFinishes.add(finish);
    finishesByTenant.set(store.userData.tenantType, tenantFinishes);
  }

  assert.equal(finishesByTenant.size, 8);
  assert.ok([...finishesByTenant.values()].every((finishes) => finishes.size === 1));
  assert.equal(new Set([...finishesByTenant.values()].map((finishes) => [...finishes][0])).size, 8);
});

test("keeps the central mall partially open to the sky", () => {
  const mall = buildLowPolyShoppingMall();
  const courtyard = mall.getObjectByName("shopping-mall-open-air-courtyard");
  const openSky = mall.getObjectByName("shopping-mall-open-sky-void");
  assert.equal(courtyard.userData.openToSky, true);
  assert.deepEqual(openSky.userData.size, { width: 38 * SHOPPING_MALL_SCALE, depth: 41 * SHOPPING_MALL_SCALE });
  const promenade = mall.getObjectByName("shopping-mall-open-air-promenade");
  assert.deepEqual(promenade.userData, { clearWidth: 10 * SHOPPING_MALL_SCALE, continuous: true, barrierFree: true, openToSky: true, connectsEntryToAnchor: true });
  assert.equal(mall.userData.promenadeClearWidth, 10 * SHOPPING_MALL_SCALE);
  assert.equal(mall.userData.throughRouteOpenToSky, true);
  assert.equal(namedObjects(mall, "shopping-mall-partial-glass-canopy").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-outdoor-dining-table").length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-outdoor-dining-chair").length, 32);
  const umbrellas = namedObjects(mall, "shopping-mall-dining-umbrella");
  assert.equal(umbrellas.length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-dining-umbrella-pole").length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-dining-umbrella-finial").length, 8);
  assert.ok(umbrellas.every((umbrella) => umbrella.rotation.x === 0));
  assert.ok(umbrellas.every((umbrella) => umbrella.userData.apexDirection === "+y"));
  assert.ok(umbrellas.every((umbrella) => umbrella.material.side === THREE.DoubleSide));
  assert.equal(namedObjects(mall, "shopping-mall-courtyard-fountain").length, 2);
});

test("connects the building group with upper arcades, bridges and escalators", () => {
  const mall = buildLowPolyShoppingMall();
  assert.equal(mall.userData.upperBridgeCount, 4);
  assert.equal(mall.userData.escalatorCount, 2);
  const bridges = namedObjects(mall, "shopping-mall-upper-bridge");
  assert.equal(bridges.length, 4);
  assert.ok(bridges.every((bridge) => bridge.userData.cornerConnection));
  assert.ok(bridges.every((bridge) => bridge.userData.spanLength < 12));
  assert.ok(bridges.every((bridge) => bridge.userData.crossesCourtyard === false));
  const escalators = namedObjects(mall, "shopping-mall-escalator");
  assert.equal(escalators.length, 2);
  assert.ok(escalators.every((escalator) => escalator.userData.physicalSlopeDirection === "+z"));
  assert.ok(escalators.every((escalator) => escalator.userData.lowerLanding.z < escalator.userData.upperLanding.z));
  assert.ok(escalators.every((escalator) => escalator.userData.upperLanding.y === 4.79));
  assert.ok(escalators.every((escalator) => escalator.userData.connectedToUpperArcade));
  assert.ok(escalators.every((escalator) => escalator.userData.outsideCentralPromenade));
  assert.deepEqual(escalators.map((escalator) => escalator.userData.travelDirection), ["up", "down"]);
  assert.ok(escalators.every((escalator) => escalator.userData.coordinateSpace === "mall-local"));
  assert.equal(namedObjects(mall, "shopping-mall-escalator-step").length, 36);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-step-safety-edge").length, 36);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-lower-landing").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-upper-landing").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-underframe").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-glass-rail").length, 4);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-landing-guard").length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-guard-return").length, 16);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-floor-opening").length, 2);
  assert.ok(namedObjects(mall, "shopping-mall-escalator-floor-opening").every((opening) => opening.userData.guardedSides === 3 && opening.userData.clearWidth >= 3.4));
  for (const opening of namedObjects(mall, "shopping-mall-escalator-floor-opening")) {
    const halfWidth = opening.userData.clearWidth * 0.5;
    const frontSegments = namedObjects(opening.parent, "shopping-mall-upper-arcade-slab-segment").filter((segment) => segment.position.z < 0);
    assert.ok(frontSegments.every((segment) => {
      const width = segment.geometry.parameters.width;
      return segment.position.x + width * 0.5 <= opening.position.x - halfWidth || segment.position.x - width * 0.5 >= opening.position.x + halfWidth;
    }));
    const edgeGuards = namedObjects(opening.parent.parent, "shopping-mall-arcade-glass-guard");
    assert.ok(edgeGuards.every((guard) => {
      const width = guard.geometry.parameters.width;
      return guard.position.x + width * 0.5 <= opening.position.x - halfWidth || guard.position.x - width * 0.5 >= opening.position.x + halfWidth;
    }));
  }
  for (const escalator of escalators) {
    const lower = escalator.getObjectByName("shopping-mall-escalator-lower-landing");
    const upper = escalator.getObjectByName("shopping-mall-escalator-upper-landing");
    assert.deepEqual(
      { x: escalator.position.x + lower.position.x, y: lower.position.y, z: escalator.position.z + lower.position.z },
      escalator.userData.lowerLanding,
    );
    assert.deepEqual(
      { x: escalator.position.x + upper.position.x, y: upper.position.y, z: escalator.position.z + upper.position.z },
      escalator.userData.upperLanding,
    );
  }
  assert.equal(namedObjects(mall, "shopping-mall-escalator-handrail").length, 4);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-steps").length, 0);
  assert.equal(namedObjects(mall, "shopping-mall-upper-arcade").length, 5);
  assert.equal(namedObjects(mall, "shopping-mall-supported-open-air-arcade").length, 5);
  assert.ok(namedObjects(mall, "shopping-mall-arcade-support-column").length >= 30);
  assert.ok(namedObjects(mall, "shopping-mall-arcade-pergola-slat").length >= 30);
  assert.equal(namedObjects(mall, "shopping-mall-bridge-glass-guard").length, 8);
});

test("makes every upper retail floor accessible and independently escapable", () => {
  const mall = buildLowPolyShoppingMall();
  const wingNames = [
    "shopping-mall-north-anchor",
    "shopping-mall-west-wing",
    "shopping-mall-east-wing",
    "shopping-mall-southwest-wing",
    "shopping-mall-southeast-wing",
  ];
  const serviceCores = namedObjects(mall, "shopping-mall-service-core");
  const lifts = namedObjects(mall, "shopping-mall-accessible-lift");
  const fireStairs = namedObjects(mall, "shopping-mall-fire-stair");
  const upperZones = namedObjects(mall, "shopping-mall-upper-interior-zone");

  assert.equal(serviceCores.length, 5);
  assert.ok(lifts.length >= 5);
  assert.ok(fireStairs.length >= 10);
  assert.equal(upperZones.length, 11);
  assert.equal(mall.userData.upperInteriorFloorCount, 11);
  assert.ok(mall.userData.accessibleLiftCount >= 5);
  assert.ok(mall.userData.fireStairCount >= 10);

  for (const wingName of wingNames) {
    const wing = mall.getObjectByName(wingName);
    const cores = namedObjects(wing, "shopping-mall-service-core");
    const wingUpperZones = namedObjects(wing, "shopping-mall-upper-interior-zone");
    assert.equal(cores.length, 1, `${wingName} should have one coordinated service core`);
    assert.ok(wingUpperZones.length >= 2, `${wingName} should furnish its upper floors`);

    const requiredFloors = new Set([1, ...wingUpperZones.map((zone) => zone.userData.floorNumber)]);
    assert.ok([...requiredFloors].every(Number.isInteger));
    const coreLifts = namedObjects(cores[0], "shopping-mall-accessible-lift");
    const coreStairs = namedObjects(cores[0], "shopping-mall-fire-stair");
    assert.ok(coreLifts.length >= 1, `${wingName} should have step-free vertical circulation`);
    assert.ok(coreStairs.length >= 2, `${wingName} should have two independent escape stairs`);
    for (const lift of coreLifts) {
      assert.ok(lift.userData.accessible || lift.userData.barrierFree);
      assert.ok([...requiredFloors].every((floor) => lift.userData.servesFloors.includes(floor)));
    }
    for (const stair of coreStairs) {
      assert.equal(stair.userData.groundExit, true);
      assert.ok([...requiredFloors].every((floor) => stair.userData.servesFloors.includes(floor)));
    }
  }
});

test("builds compliant two-flight fire stairs with protected final exits", () => {
  const mall = buildLowPolyShoppingMall();
  const stairs = namedObjects(mall, "shopping-mall-fire-stair");
  const finalExitDoors = namedObjects(mall, "shopping-mall-fire-stair-exterior-exit-door");
  const finalExitCorridors = namedObjects(mall, "shopping-mall-fire-stair-ground-exit-corridor");

  assert.equal(stairs.length, 10);
  assert.equal(finalExitDoors.length, stairs.length);
  assert.equal(finalExitCorridors.length, stairs.length);
  for (const stair of stairs) {
    const storeys = stair.userData.servesFloors.length - 1;
    const treads = namedObjects(stair, "shopping-mall-fire-stair-tread");
    const landings = namedObjects(stair, "shopping-mall-fire-stair-landing");
    const handrails = namedObjects(stair, "shopping-mall-fire-stair-handrail");
    const enclosureWalls = namedObjects(stair, "shopping-mall-fire-stair-enclosure-wall");
    const floorDoors = namedObjects(stair, "shopping-mall-fire-stair-door");
    const enclosureExit = stair.getObjectByName("shopping-mall-fire-stair-ground-exit-door");

    assert.equal(stair.userData.twoFlight, true);
    assert.equal(stair.userData.enclosed, true);
    assert.equal(stair.userData.riserCountPerStorey, 24);
    assert.ok(stair.userData.riserHeight <= 0.18);
    assert.ok(stair.userData.clearFlightWidth >= 1.2);
    assert.equal(treads.length, storeys * stair.userData.riserCountPerStorey);
    assert.equal(landings.length, storeys * 2);
    assert.equal(handrails.length, storeys * 4);
    assert.ok(enclosureWalls.length >= 4);
    assert.ok(enclosureWalls.every((wall) => wall.userData.fireRated));
    assert.equal(floorDoors.length, stair.userData.servesFloors.length);
    assert.deepEqual(
      new Set(floorDoors.map((door) => door.userData.floorNumber)),
      new Set(stair.userData.servesFloors),
    );

    for (let floorNumber = 1; floorNumber <= storeys; floorNumber += 1) {
      const storeyTreads = treads.filter((tread) => tread.userData.floorNumber === floorNumber);
      assert.equal(storeyTreads.length, 24);
      assert.equal(storeyTreads.filter((tread) => tread.userData.flightNumber === 1).length, 12);
      assert.equal(storeyTreads.filter((tread) => tread.userData.flightNumber === 2).length, 12);
      assert.deepEqual(
        [...new Set(storeyTreads.map((tread) => tread.userData.riserIndex))].sort((a, b) => a - b),
        Array.from({ length: 24 }, (_, index) => index + 1),
      );
    }

    const finalExit = finalExitDoors.find((door) => (
      door.userData.wingName === stair.userData.wingName
      && door.userData.stairIndex === stair.userData.stairIndex
    ));
    const exitCorridor = finalExitCorridors.find((corridor) => (
      corridor.userData.wingName === stair.userData.wingName
      && corridor.userData.stairIndex === stair.userData.stairIndex
    ));
    assert.ok(enclosureExit && finalExit && exitCorridor);
    assert.equal(finalExit.userData.finalExit, true);
    assert.equal(exitCorridor.userData.directToExterior, true);
    assert.ok(gapXZ(worldBounds(exitCorridor), worldBounds(enclosureExit)) <= 0.04);
    assert.ok(gapXZ(worldBounds(exitCorridor), worldBounds(finalExit)) <= 0.04);
  }
});

test("keeps vertical openings and back-of-house routes free of structural obstructions", () => {
  const mall = buildLowPolyShoppingMall();
  const openings = namedObjects(mall, "shopping-mall-vertical-circulation-floor-opening");
  const corridors = namedObjects(mall, "shopping-mall-back-of-house-corridor");

  assert.ok(openings.length >= 30);
  for (const opening of openings) {
    const centre = new THREE.Vector3();
    const scale = new THREE.Vector3();
    opening.getWorldPosition(centre);
    opening.getWorldScale(scale);
    const longAxisIsX = Math.abs(opening.position.x) >= Math.abs(opening.position.z);
    const halfX = (longAxisIsX ? opening.userData.clearWidth : opening.userData.clearDepth) * scale.x * 0.5;
    const halfZ = (longAxisIsX ? opening.userData.clearDepth : opening.userData.clearWidth) * scale.z * 0.5;
    const openingBounds = new THREE.Box3(
      new THREE.Vector3(centre.x - halfX, -Infinity, centre.z - halfZ),
      new THREE.Vector3(centre.x + halfX, Infinity, centre.z + halfZ),
    );
    const slabPieces = namedObjects(opening.parent, "shopping-mall-interior-floor-slab-piece");
    assert.ok(slabPieces.length >= 4);
    assert.ok(
      slabPieces.every((piece) => !overlapsXZ(worldBounds(piece), openingBounds, 0.002)),
      `${opening.userData.openingType} opening on floor ${opening.userData.floorNumber} should be cut through the slab`,
    );
  }

  assert.ok(corridors.length >= 15);
  for (const corridor of corridors) {
    const wing = corridor.parent;
    const obstacles = [
      ...namedObjects(wing, "shopping-mall-compact-core-wall"),
      ...namedObjects(wing, "shopping-mall-accessible-lift"),
      ...namedObjects(wing, "shopping-mall-family-restroom-core"),
    ];
    for (const obstacle of obstacles) {
      assert.equal(
        overlapsXZ(worldBounds(corridor), worldBounds(obstacle)),
        false,
        `${wing.name} floor ${corridor.userData.floorNumber} BOH corridor should avoid ${obstacle.name}`,
      );
    }
  }
});

test("connects upper public corridors to lifts, two stairs and the open-air gallery", () => {
  const mall = buildLowPolyShoppingMall();
  const upperZones = namedObjects(mall, "shopping-mall-upper-interior-zone");

  assert.ok(upperZones.length >= 10);
  for (const zone of upperZones) {
    const wing = zone.parent;
    const corridor = zone.getObjectByName("shopping-mall-upper-interior-corridor");
    const links = namedObjects(zone, "shopping-mall-upper-core-link");
    const furniture = [
      ...namedObjects(zone, "shopping-mall-upper-lounge-bench"),
      ...namedObjects(zone, "shopping-mall-floor-directory"),
      ...namedObjects(zone, "shopping-mall-interior-planter"),
    ];

    assert.equal(links.length, 3);
    assert.equal(links.filter((link) => link.userData.destination === "accessible-lift").length, 1);
    assert.equal(links.filter((link) => link.userData.destination === "fire-stair").length, 2);
    for (const link of links) {
      assert.equal(link.userData.floorNumber, zone.userData.floorNumber);
      assert.equal(link.userData.connectsPublicCorridor, true);
      assert.ok(gapXZ(worldBounds(link), worldBounds(corridor)) <= 0.025);
      const destinationDoors = link.userData.destination === "accessible-lift"
        ? namedObjects(wing, "shopping-mall-lift-door").filter((door) => door.userData.floorNumber === zone.userData.floorNumber)
        : namedObjects(wing, "shopping-mall-fire-stair")
          .filter((stair) => stair.userData.stairIndex === link.userData.stairIndex)
          .flatMap((stair) => namedObjects(stair, "shopping-mall-fire-stair-door"))
          .filter((door) => door.userData.floorNumber === zone.userData.floorNumber);
      assert.ok(destinationDoors.length >= 1);
      assert.ok(destinationDoors.some((door) => gapXZ(worldBounds(link), worldBounds(door)) <= 0.03));
    }
    assert.ok(furniture.length >= 4);
    assert.ok(
      furniture.every((object) => !overlapsXZ(worldBounds(object), worldBounds(corridor))),
      `${wing.name} floor ${zone.userData.floorNumber} furniture should remain outside the clear corridor`,
    );
  }

  for (const wingName of [
    "shopping-mall-north-anchor",
    "shopping-mall-west-wing",
    "shopping-mall-east-wing",
    "shopping-mall-southwest-wing",
    "shopping-mall-southeast-wing",
  ]) {
    const wing = mall.getObjectByName(wingName);
    const portals = namedObjects(wing, "shopping-mall-upper-entry-portal");
    assert.ok(portals.length >= 2, `${wingName} should have two upper gallery portals`);
    for (const portal of portals) {
      const door = portal.getObjectByName("shopping-mall-upper-entry-door");
      const threshold = portal.getObjectByName("shopping-mall-upper-entry-threshold");
      assert.ok(door && threshold);
      assert.equal(door.userData.thresholdFree, true);
      assert.equal(threshold.userData.barrierFree, true);
      assertGroundedOn(door, threshold, `${wingName} upper gallery door`);
    }
  }
});

test("adds customer services without obstructing the open-air promenade", () => {
  const mall = buildLowPolyShoppingMall();
  const promenade = mall.getObjectByName("shopping-mall-open-air-promenade");
  const promenadeBounds = worldBounds(promenade);
  const restrooms = namedObjects(mall, "shopping-mall-family-restroom-core");
  const customerServices = namedObjects(mall, "shopping-mall-customer-service-desk");
  const wayfinding = namedObjects(mall, "shopping-mall-wayfinding-pylon");
  const lounges = namedObjects(mall, "shopping-mall-courtyard-lounge");

  assert.ok(restrooms.length >= 2);
  assert.equal(mall.userData.familyRestroomCount, restrooms.length);
  assert.ok(restrooms.every((restroom) => restroom.userData.accessible && restroom.userData.familyFriendly));
  assert.equal(customerServices.length, 1);
  assert.equal(wayfinding.length, 4);
  assert.equal(mall.userData.wayfindingCount, 4);
  assert.equal(lounges.length, 4);

  for (const object of [...customerServices, ...wayfinding, ...lounges]) {
    assert.equal(overlapsXZ(worldBounds(object), promenadeBounds), false, `${object.name} should remain outside the ten-metre through route`);
  }
});

test("grounds the courtyard dining furniture with physical supports", () => {
  const mall = buildLowPolyShoppingMall();
  const courtFloor = mall.getObjectByName("shopping-mall-courtyard-floor");
  const tables = namedObjects(mall, "shopping-mall-outdoor-dining-table");
  const chairs = namedObjects(mall, "shopping-mall-outdoor-dining-chair");

  assert.equal(tables.length, 8);
  assert.equal(chairs.length, 32);
  for (const [index, table] of tables.entries()) {
    const supports = namedObjects(table, "shopping-mall-outdoor-table-support");
    assert.ok(supports.length >= 1, `table ${index} should have a physical pedestal or legs`);
    assert.ok(supports.some((support) => Math.abs(worldBounds(support).min.y - worldBounds(courtFloor).max.y) <= 0.025));
  }
  for (const [index, chair] of chairs.entries()) {
    const supports = namedObjects(chair, "shopping-mall-outdoor-chair-support");
    assert.ok(supports.length >= 2, `chair ${index} should have stable physical supports`);
    assert.ok(supports.every((support) => Math.abs(worldBounds(support).min.y - worldBounds(courtFloor).max.y) <= 0.025));
  }
});

test("keeps glass shopfronts clear of facade structure and supports every pergola slat", () => {
  const mall = buildLowPolyShoppingMall();
  const storefrontParts = [
    ...namedObjects(mall, "shopping-mall-storefront-glass"),
    ...namedObjects(mall, "shopping-mall-storefront-door"),
    ...namedObjects(mall, "shopping-mall-store-sign"),
    ...namedObjects(mall, "shopping-mall-store-awning"),
  ];
  const facadeStructure = [
    ...namedObjects(mall, "shopping-mall-curtain-wall-mullion"),
    ...namedObjects(mall, "shopping-mall-arcade-support-column"),
  ];

  for (const storefrontPart of storefrontParts) {
    for (const structure of facadeStructure) {
      assert.equal(
        overlaps3D(worldBounds(storefrontPart), worldBounds(structure), 0.005),
        false,
        `store ${storefrontPart.parent.userData.storefrontIndex} ${storefrontPart.name} should avoid ${structure.name}`,
      );
    }
  }

  const pergolaSlats = namedObjects(mall, "shopping-mall-arcade-pergola-slat");
  assert.ok(pergolaSlats.length >= 25);
  for (const slat of pergolaSlats) {
    const slatBounds = worldBounds(slat);
    const supportingColumns = namedObjects(slat.parent, "shopping-mall-arcade-pergola-column").filter((column) => {
      const columnBounds = worldBounds(column);
      return overlapsXZ(slatBounds, columnBounds, 0.001)
        && Math.abs(columnBounds.max.y - slatBounds.min.y) <= 0.025;
    });
    assert.ok(supportingColumns.length >= 2, "each pergola slat should meet two named upper support columns");
    assert.ok(supportingColumns.every((column) => column.userData.supportsPergolaSlat));
  }
});

test("separates loading, lighting and landscape elements from public shops", () => {
  const mall = buildLowPolyShoppingMall();
  const loadingCourts = namedObjects(mall, "shopping-mall-loading-court");
  const storefronts = namedObjects(mall, "shopping-mall-storefront");
  const groundBohCorridors = namedObjects(mall, "shopping-mall-back-of-house-corridor")
    .filter((corridor) => corridor.userData.floorNumber === 1);
  const streetLights = namedObjects(mall, "city-street-light-lowpoly");

  assert.ok(loadingCourts.length >= 2);
  for (const loadingCourt of loadingCourts) {
    const serviceDoor = loadingCourt.getObjectByName("shopping-mall-service-door");
    const serviceLink = loadingCourt.getObjectByName("shopping-mall-loading-service-link");
    const apron = loadingCourt.getObjectByName("shopping-mall-loading-apron");
    assert.ok(serviceDoor && serviceLink && apron);
    assert.ok(storefronts.every((store) => !overlaps3D(worldBounds(serviceDoor), worldBounds(store))));
    assert.ok(gapXZ(worldBounds(serviceLink), worldBounds(serviceDoor)) <= 0.06);
    assert.ok(groundBohCorridors.some((corridor) => gapXZ(worldBounds(serviceLink), worldBounds(corridor)) <= 0.12));
    assert.equal(serviceLink.userData.connectsDoorToBackOfHouse, true);

    const apronBounds = worldBounds(apron);
    for (const streetLight of streetLights) {
      const anchor = new THREE.Vector3();
      streetLight.getWorldPosition(anchor);
      const anchorOccupiesApron = anchor.x > apronBounds.min.x
        && anchor.x < apronBounds.max.x
        && anchor.z > apronBounds.min.z
        && anchor.z < apronBounds.max.z;
      assert.equal(anchorOccupiesApron, false, "street-light anchors should remain outside loading aprons");
    }
  }

  for (const planter of namedObjects(mall, "city-roadside-planter-lowpoly")) {
    assert.ok(
      storefronts.every((store) => !overlapsXZ(worldBounds(planter), worldBounds(store))),
      "landscape planters should not overlap shop envelopes",
    );
  }
});

test("aligns every barrier-free ground finish to one continuous datum", () => {
  const mall = buildLowPolyShoppingMall();
  const datum = worldBounds(mall.getObjectByName("shopping-mall-pedestrian-district")).max.y;
  const groundFinishes = [
    mall.getObjectByName("shopping-mall-pedestrian-entry-plaza"),
    mall.getObjectByName("shopping-mall-courtyard-floor"),
    mall.getObjectByName("shopping-mall-open-air-promenade"),
    mall.getObjectByName("shopping-mall-anchor-lobby-floor"),
    ...namedObjects(mall, "shopping-mall-store-floor-finish"),
    ...namedObjects(mall, "shopping-mall-back-of-house-corridor").filter((corridor) => corridor.userData.floorNumber === 1),
    ...namedObjects(mall, "shopping-mall-loading-service-link"),
    ...namedObjects(mall, "shopping-mall-restroom-floor"),
    ...namedObjects(mall, "shopping-mall-fire-stair-ground-exit-corridor"),
    ...namedObjects(mall, "shopping-mall-escalator-lower-landing"),
  ];

  assert.ok(groundFinishes.length >= 80);
  for (const finish of groundFinishes) {
    assert.ok(
      Math.abs(worldBounds(finish).max.y - datum) <= 0.002,
      `${finish.name} should finish at the common barrier-free datum`,
    );
  }
  for (const groundDoor of [
    ...namedObjects(mall, "shopping-mall-storefront-door"),
    ...namedObjects(mall, "shopping-mall-restroom-accessible-door"),
    ...namedObjects(mall, "shopping-mall-fire-stair-ground-exit-door"),
    ...namedObjects(mall, "shopping-mall-fire-stair-exterior-exit-door"),
    ...namedObjects(mall, "shopping-mall-lift-door").filter((door) => door.userData.floorNumber === 1),
  ]) {
    assert.ok(
      Math.abs(worldBounds(groundDoor).min.y - datum) <= 0.002,
      `${groundDoor.name} should have a flush threshold`,
    );
  }
});

test("supports commercial night lighting and structural cutaway", () => {
  const mall = buildLowPolyShoppingMall();
  const sign = namedObjects(mall, "shopping-mall-store-sign")[0];
  const roof = namedObjects(mall, "shopping-mall-flat-roof")[0];
  const streetLights = namedObjects(mall, "street-light-point-light");
  const pooledLights = mall.getObjectByName("shopping-mall-pooled-night-lights").children;
  const interiorLights = namedObjects(mall, "shopping-mall-interior-luminaire");
  const interiors = namedObjects(mall, "shopping-mall-store-interior-module");
  const interiorFixtures = namedObjects(mall, "shopping-mall-tenant-fixture");
  const interiorNameplates = namedObjects(mall, "shopping-mall-store-interior-nameplate");
  const renderedOrMerged = (object) => object.visible || typeof object.userData.renderProxySource === "string";
  assert.ok(sign instanceof THREE.Mesh && roof instanceof THREE.Mesh);
  assert.ok(interiorLights.length >= 62);
  assert.ok(interiorLights.every((light) => light instanceof THREE.Mesh && "emissiveIntensity" in light.material));
  const daytimeInteriorIntensity = interiorLights.map((light) => light.material.emissiveIntensity);
  mall.userData.setPowered(true);
  assert.ok(sign.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledLights.every((light) => light.visible && light.intensity > 0));
  assert.ok(interiorLights.every((light, index) => light.material.emissiveIntensity > daytimeInteriorIntensity[index]));
  mall.userData.setPowered(false);
  assert.ok(streetLights.every((light) => light.intensity === 0));
  assert.ok(interiorLights.every((light, index) => light.material.emissiveIntensity === daytimeInteriorIntensity[index]));
  assert.equal(roof.visible, true);
  const opaqueCores = namedObjects(mall, "shopping-mall-building-core");
  assert.ok(opaqueCores.every((core) => core.visible));
  mall.userData.setInteriorCutaway(true);
  assert.equal(roof.visible, false);
  assert.ok(opaqueCores.every((core) => !core.visible));
  assert.ok(namedObjects(mall, "shopping-mall-curtain-wall-mullion").every((mullion) => !mullion.visible));
  assert.ok(namedObjects(mall, "shopping-mall-storefront-glass").every((pane) => !pane.visible));
  assert.ok(namedObjects(mall, "shopping-mall-interior-floor-slab").every((slab) => slab.visible));
  assert.ok(namedObjects(mall, "shopping-mall-food-counter").every(renderedOrMerged));
  assert.ok(interiors.every(renderedOrMerged));
  assert.ok(interiorFixtures.every(renderedOrMerged));
  assert.ok(interiorNameplates.every(renderedOrMerged));
  assert.ok(namedObjects(mall, "shopping-mall-service-core").every((core) => core.visible));
  assert.ok(namedObjects(mall, "shopping-mall-accessible-lift").every((lift) => lift.visible));
  assert.ok(namedObjects(mall, "shopping-mall-fire-stair").every((stair) => stair.visible));
  mall.userData.setInteriorCutaway(false);
  assert.ok(namedObjects(mall, "shopping-mall-flat-roof").every((object) => object.visible));
  assert.ok(namedObjects(mall, "shopping-mall-glass-curtain-panel").every((object) => object.visible));
});

test("lights every customer-facing commercial zone at night and restores its daytime state", () => {
  const mall = buildLowPolyShoppingMall();
  const fixtureNamesByZone = new Map([
    ["storefront", "shopping-mall-night-storefront-light"],
    ["facade", "shopping-mall-night-facade-wash-light"],
    ["arcade", "shopping-mall-night-arcade-ceiling-light"],
    ["courtyard", "shopping-mall-night-courtyard-light"],
    ["entry", "shopping-mall-night-entry-light"],
    ["wayfinding", "shopping-mall-night-wayfinding-light"],
  ]);
  const requiredZones = [...fixtureNamesByZone.keys()];

  assert.deepEqual(new Set(mall.userData.nightLightingZones), new Set(requiredZones));
  const fixtures = [];
  for (const [zone, objectName] of fixtureNamesByZone) {
    const zoneFixtures = namedObjects(mall, objectName);
    assert.ok(zoneFixtures.length > 0, `${zone} needs visible night-light fixtures`);
    assert.ok(zoneFixtures.every((fixture) => fixture instanceof THREE.Mesh));
    assert.ok(zoneFixtures.every((fixture) => fixture.userData.nightLightingZone === zone));
    fixtures.push(...zoneFixtures);
  }

  const lightSources = namedObjects(mall, "shopping-mall-night-light-source");
  assert.ok(lightSources.length >= requiredZones.length);
  assert.ok(lightSources.every((light) => light instanceof THREE.PointLight));
  for (const zone of requiredZones) {
    assert.ok(lightSources.some((light) => light.userData.zone === zone), `${zone} needs a real light source`);
  }

  const daytimeFixtureLevels = fixtures.map((fixture) => fixture.material.emissiveIntensity);
  assert.ok(daytimeFixtureLevels.every(Number.isFinite));
  assert.ok(lightSources.every((light) => light.intensity === 0));

  mall.userData.setPowered(true);
  assert.ok(fixtures.every((fixture, index) => fixture.material.emissiveIntensity > daytimeFixtureLevels[index]));
  assert.ok(lightSources.every((light) => light.intensity === light.userData.onIntensity && light.intensity > 0));
  const firstPoweredFixtureLevels = fixtures.map((fixture) => fixture.material.emissiveIntensity);
  const firstPoweredSourceLevels = lightSources.map((light) => light.intensity);

  // Repeated UI events must not progressively over-brighten the centre.
  mall.userData.setPowered(true);
  assert.deepEqual(fixtures.map((fixture) => fixture.material.emissiveIntensity), firstPoweredFixtureLevels);
  assert.deepEqual(lightSources.map((light) => light.intensity), firstPoweredSourceLevels);

  mall.userData.setPowered(false);
  assert.deepEqual(fixtures.map((fixture) => fixture.material.emissiveIntensity), daytimeFixtureLevels);
  assert.ok(lightSources.every((light) => light.intensity === 0));
});

test("keeps the late-night light rig bounded, shadow-free and dormant during daytime", () => {
  const mall = buildLowPolyShoppingMall();
  const nightSources = namedObjects(mall, "shopping-mall-night-light-source");
  const streetSources = namedObjects(mall, "street-light-point-light");
  const pooledSources = mall.getObjectByName("shopping-mall-pooled-night-lights").children;
  const allPointLights = [];
  mall.traverse((object) => { if (object instanceof THREE.PointLight) allPointLights.push(object); });

  assert.equal(mall.userData.nightLightSourceCount, nightSources.length);
  assert.ok(nightSources.length <= 6, "the six semantic zones should share at most six broad night sources");
  assert.deepEqual(
    new Set(nightSources.map((light) => light.userData.zone)),
    new Set(mall.userData.nightLightingZones),
  );
  assert.ok(pooledSources.length < streetSources.length, "street fixtures should collapse into fewer regional light sources");
  assert.ok(allPointLights.every((light) => light.castShadow === false));
  assert.ok(allPointLights.every((light) => light.intensity === 0 && light.visible === false));

  mall.userData.setPowered(true);
  assert.ok(nightSources.every((light) => light.visible && light.intensity === light.userData.onIntensity));
  assert.ok(streetSources.every((light) => !light.visible && light.intensity === 0));
  assert.ok(pooledSources.every((light) => light.visible && light.intensity > 0));

  mall.userData.setPowered(false);
  assert.ok(allPointLights.every((light) => light.intensity === 0 && light.visible === false));
});

test("mounts commercial night fixtures to real surfaces and keeps vehicle routes clear", () => {
  const mall = buildLowPolyShoppingMall();
  const fixtures = [
    ...namedObjects(mall, "shopping-mall-night-storefront-light"),
    ...namedObjects(mall, "shopping-mall-night-facade-wash-light"),
    ...namedObjects(mall, "shopping-mall-night-arcade-ceiling-light"),
    ...namedObjects(mall, "shopping-mall-night-courtyard-light"),
    ...namedObjects(mall, "shopping-mall-night-entry-light"),
    ...namedObjects(mall, "shopping-mall-night-wayfinding-light"),
  ];
  const mountTypes = new Set(fixtures.map((fixture) => fixture.userData.mountType));
  assert.ok(mountTypes.has("ground"));
  assert.ok(mountTypes.has("ceiling"));
  assert.ok(mountTypes.has("wall"));

  for (const fixture of fixtures) {
    assert.ok(Number.isFinite(fixture.userData.mountSurfaceY), `${fixture.name} needs an explicit mounting datum`);
    const surfaceY = fixture.userData.mountSurfaceY * mall.scale.y;
    const bounds = worldBounds(fixture);
    if (fixture.userData.mountType === "ground") {
      assert.ok(Math.abs(bounds.min.y - surfaceY) <= 0.025, `${fixture.name} should stand on its paving surface`);
      assert.equal(fixture.userData.clearOfVehicleRoutes, true);
    } else if (fixture.userData.mountType === "ceiling") {
      assert.ok(Math.abs(bounds.max.y - surfaceY) <= 0.025, `${fixture.name} should meet the underside above it`);
    } else {
      assert.equal(fixture.userData.mountType, "wall");
    }
  }

  const vehicleRoutes = [
    ...namedObjects(mall, "shopping-mall-perimeter-road"),
    ...namedObjects(mall, "shopping-mall-dropoff-layby"),
    ...namedObjects(mall, "shopping-mall-parking-space"),
    ...namedObjects(mall, "shopping-mall-loading-apron"),
    ...namedObjects(mall, "shopping-mall-loading-access-lane"),
  ];
  const groundFixtures = fixtures.filter((fixture) => fixture.userData.mountType === "ground");
  assert.ok(groundFixtures.length > 0);
  for (const fixture of groundFixtures) {
    for (const route of vehicleRoutes) {
      assert.equal(overlapsXZ(worldBounds(fixture), worldBounds(route)), false, `${fixture.name} should not occupy a vehicle route`);
    }
  }
});

test("uses the rabbit rider scale and fills an independent city site", () => {
  const mall = buildLowPolyShoppingMall();
  const metrics = measureModelGeometry(mall);
  assert.equal(mall.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(mall.userData.scaleStandard, "rabbit-rider");
  assert.equal(mall.userData.scaleMultiplier, SHOPPING_MALL_SCALE);
  assert.equal(mall.scale.x, SHOPPING_MALL_SCALE);
  assert.equal(mall.userData.siteSize.x, 184);
  assert.equal(mall.userData.siteSize.y, 20.7);
  assert.equal(mall.userData.siteSize.z, 138);
  assert.ok(metrics.size.x >= 183);
  assert.ok(metrics.size.z >= 137);
  assert.ok(metrics.size.y >= 19.5);
  assert.equal(namedObjects(mall, "city-street-light-lowpoly").length, 13);
  assert.equal(namedObjects(mall, "city-roadside-planter-lowpoly").length, 10);
});

test("exposes the shopping centre from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/shopping-mall/ShoppingMallDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyShoppingMall/);
  assert.match(demoSource, /都会里/);
  assert.match(demoSource, /外向临街商业/);
  assert.match(demoSource, /快餐 · 咖啡 · 汉堡 · 奶茶/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(archiveSource, /大型商业中心/);
  assert.match(archiveSource, /\/demos\/shopping-mall/);
  assert.match(studioSource, /学校 · 商业中心/);
});
