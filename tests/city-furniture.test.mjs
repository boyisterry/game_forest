import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHotDogKiosk,
  buildLowPolyHighRiseResidential,
  buildLowPolyNewsstand,
  buildLowPolyOfficeCampus,
  buildLowPolyPhoneBooth,
  buildLowPolyRoadsidePlanter,
  buildLowPolyResidentialBuilding,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "../app/lib/map/cityFurniture.ts";
import { createFurnitureShatterPair, measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";

test("generates a self-contained low-poly street light with switchable illumination", () => {
  const lamp = buildLowPolyStreetLight();
  assert.equal(lamp.name, "city-street-light-lowpoly");
  assert.equal(lamp.userData.generatedLocally, true);
  const lens = lamp.getObjectByName("street-light-warm-lens");
  assert.ok(lens?.isMesh);
  lamp.userData.setPowered(true);
  assert.ok(lens.material.emissiveIntensity >= 3);
  lamp.userData.setPowered(false);
  assert.ok(lens.material.emissiveIntensity < 1);
});

test("generates a traffic light with vehicle, pedestrian and phase controls", () => {
  const signal = buildLowPolyTrafficLight();
  assert.equal(signal.name, "city-traffic-light-lowpoly");
  assert.equal(signal.userData.generatedLocally, true);
  assert.ok(signal.getObjectByName("traffic-light-vehicle-head"));
  assert.ok(signal.getObjectByName("pedestrian-signal-face"));
  assert.ok(signal.getObjectByName("pedestrian-crossing-button"));
  signal.userData.setPhase("green");
  const lenses = [];
  signal.traverse((object) => {
    if (object.name === "traffic-light-lens") lenses.push(object);
  });
  assert.equal(lenses.length, 3);
  assert.equal(lenses.filter((lens) => lens.material.emissiveIntensity > 3).length, 1);
  assert.equal(lenses[0].material.toneMapped, false);
  assert.equal(lenses[1].material.toneMapped, false);
  assert.equal(lenses[2].material.toneMapped, false);
  assert.equal(lenses[2].material.emissive.getHex(), 0x00f04c);
  signal.userData.setPhase("yellow");
  assert.equal(lenses[0].material.emissiveIntensity, 0);
  assert.ok(lenses[1].material.emissiveIntensity > 3);
  assert.equal(lenses[2].material.emissiveIntensity, 0);
  const spillLight = signal.getObjectByName("traffic-signal-status-light");
  assert.equal(spillLight.position.y, 4.18);
  assert.ok(spillLight.distance < 0.84);
  const headSize = new THREE.Box3().setFromObject(signal.getObjectByName("traffic-light-vehicle-head")).getSize(new THREE.Vector3());
  assert.ok(headSize.y < 1.8, "vehicle signal head should stay below the 2.4 m rider reference");
});

test("generates a mirrored traffic-light mast without reversing the signal face", () => {
  const signal = buildLowPolyTrafficLight(-1);
  const head = signal.getObjectByName("traffic-light-vehicle-head");
  const arm = signal.getObjectByName("traffic-light-mast-arm");
  const lens = signal.getObjectByName("traffic-light-lens");

  assert.equal(signal.userData.armSide, -1);
  assert.ok(head.position.x < 0, "mirrored signal head should hang to the left of its pole");
  assert.ok(arm.position.x < 0, "mirrored mast arm should extend toward the junction");
  assert.ok(lens.position.z > 0, "signal lens should keep facing local +Z");
});

test("generates a roadside food truck with wheels, service hatch and lighting controls", () => {
  const truck = buildLowPolyFoodTruck();
  assert.equal(truck.name, "city-food-truck-lowpoly");
  assert.equal(truck.userData.generatedLocally, true);
  assert.equal(truck.getObjectByName("food-truck-service-body"), undefined);
  assert.equal(truck.getObjectByName("food-truck-serving-opening"), undefined);
  assert.ok(truck.getObjectByName("food-truck-interior-floor"));
  assert.ok(truck.getObjectByName("food-truck-interior-far-wall"));
  assert.equal(truck.children.filter((child) => child.name === "food-truck-serving-side-pillar").length, 2);
  assert.ok(truck.userData.occupantSpace.x >= 2.8);
  assert.ok(truck.getObjectByName("food-truck-menu-board"));
  assert.equal(truck.children.filter((child) => child.name === "food-truck-wheel").length, 4);
  const truckBounds = new THREE.Box3().setFromObject(truck);
  assert.ok(Math.abs(truckBounds.min.y) < 1e-6, "food-truck tyres should touch the placement surface");
  const counter = truck.getObjectByName("food-truck-serving-counter");
  assert.ok(counter.position.y <= 1.25, "serving counter should remain reachable at rider scale");
  let truckRadius = 0;
  truck.updateWorldMatrix(true, true);
  truck.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      truckRadius = Math.max(truckRadius, Math.hypot(vertex.x, vertex.z));
    }
  });
  assert.ok(truckRadius < 3.9, "food truck should stay within its enlarged display pedestal");
  const hatch = truck.getObjectByName("food-truck-serving-hatch-pivot");
  truck.userData.setServingOpen(false);
  assert.equal(hatch.rotation.x, 0);
  truck.userData.setServingOpen(true);
  assert.ok(hatch.rotation.x < -1);
  truck.userData.setLights(true);
  assert.ok(truck.getObjectByName("food-truck-serving-light").intensity > 2);
});

test("generates an opening hot-dog kiosk with a grill, canopy and rooftop sign", () => {
  const kiosk = buildLowPolyHotDogKiosk();
  assert.equal(kiosk.name, "city-hot-dog-kiosk-lowpoly");
  assert.equal(kiosk.userData.generatedLocally, true);
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-grill"));
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-canopy"));
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-sign-sausage"));
  assert.equal(kiosk.getObjectByName("hot-dog-kiosk-cabinet"), undefined);
  assert.equal(kiosk.getObjectByName("hot-dog-kiosk-serving-opening"), undefined);
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-interior-floor"));
  assert.equal(kiosk.children.filter((child) => child.name === "hot-dog-kiosk-corner-post" && child.position.z > 0).length, 2);
  const lowerRearWall = kiosk.getObjectByName("hot-dog-kiosk-rear-lower-wall");
  const upperRearWall = kiosk.getObjectByName("hot-dog-kiosk-back-wall");
  const lowerRearTop = lowerRearWall.position.y + lowerRearWall.geometry.parameters.height * 0.5;
  const upperRearBottom = upperRearWall.position.y - upperRearWall.geometry.parameters.height * 0.5;
  assert.ok(Math.abs(lowerRearTop - upperRearBottom) < 1e-9, "rear wall panels should meet without coplanar overlap");
  assert.ok(kiosk.userData.occupantSpace.x > 2.5);
  assert.ok(kiosk.userData.occupantSpace.y > 2.7);
  const hatch = kiosk.getObjectByName("hot-dog-kiosk-hatch-pivot");
  kiosk.userData.setServingOpen(false);
  assert.equal(hatch.rotation.x, 0);
  kiosk.userData.setServingOpen(true);
  assert.ok(hatch.rotation.x < -1);
  kiosk.userData.setPowered(true);
  assert.ok(kiosk.getObjectByName("hot-dog-kiosk-interior-light").intensity > 3);
  kiosk.userData.setPowered(false);
  assert.equal(kiosk.getObjectByName("hot-dog-kiosk-interior-light").intensity, 0);
});

test("generates a newsstand with layered publications and an opening shutter", () => {
  const stand = buildLowPolyNewsstand();
  assert.equal(stand.name, "city-newsstand-lowpoly");
  assert.equal(stand.userData.generatedLocally, true);
  assert.ok(stand.getObjectByName("newsstand-display-opening"));
  const publications = [];
  stand.traverse((object) => {
    if (object.name === "newsstand-newspaper-magazine") publications.push(object);
  });
  assert.equal(publications.length, 15);
  const shutter = stand.getObjectByName("newsstand-shutter-pivot");
  stand.userData.setOpen(false);
  assert.equal(shutter.rotation.x, 0);
  stand.userData.setOpen(true);
  assert.ok(shutter.rotation.x < -1);
  stand.userData.setPowered(true);
  assert.ok(stand.getObjectByName("newsstand-interior-light").intensity > 4);
  stand.userData.setPowered(false);
  assert.equal(stand.getObjectByName("newsstand-interior-light").intensity, 0);
});

test("generates a lit phone booth with a telephone and opening framed door", () => {
  const booth = buildLowPolyPhoneBooth();
  assert.equal(booth.name, "city-phone-booth-lowpoly");
  assert.equal(booth.userData.generatedLocally, true);
  assert.ok(booth.getObjectByName("phone-booth-telephone"));
  assert.ok(booth.getObjectByName("phone-booth-handset"));
  const boothSize = new THREE.Box3().setFromObject(booth).getSize(new THREE.Vector3());
  assert.ok(boothSize.y < 3.2, "phone booth should remain close to rider scale");
  const door = booth.getObjectByName("phone-booth-door-pivot");
  booth.userData.setDoorOpen(false);
  assert.equal(door.rotation.y, 0);
  booth.userData.setDoorOpen(true);
  assert.ok(door.rotation.y < -1);
  booth.userData.setPowered(true);
  assert.ok(booth.getObjectByName("phone-booth-interior-light").intensity > 2);
});

test("generates a long roadside planter with masonry, soil, shrubs and flowers", () => {
  const planter = buildLowPolyRoadsidePlanter();
  assert.equal(planter.name, "city-roadside-planter-lowpoly");
  assert.equal(planter.userData.generatedLocally, true);
  assert.ok(planter.getObjectByName("roadside-planter-soil-bed"));
  assert.equal(planter.children.filter((child) => child.name === "roadside-planter-shrub").length, 4);
  assert.equal(planter.children.filter((child) => child.name === "roadside-planter-flower-blossom").length, 8);
  assert.equal(planter.userData.plantingSlots.length, 12);
  const metrics = measureModelGeometry(planter);
  assert.ok(metrics.size.x > 6);
  assert.ok(metrics.size.x > metrics.size.z * 3);
  assert.ok(metrics.faceCount > 400);
});

test("generates an enterable five-storey residential building with an operable door and connected stairs", () => {
  const building = buildLowPolyResidentialBuilding();
  assert.equal(building.name, "city-residential-building-lowpoly");
  assert.equal(building.userData.generatedLocally, true);
  assert.equal(building.userData.floorCount, 5);
  assert.equal(building.userData.apartmentCount, 20);
  assert.ok(building.getObjectByName("residential-building-entrance"));
  assert.equal(building.getObjectByName("residential-building-main-body"), undefined);
  assert.ok(building.getObjectByName("residential-building-left-wing"));
  assert.ok(building.getObjectByName("residential-building-right-wing"));
  assert.ok(building.getObjectByName("residential-building-stairwell-glazing"));
  assert.equal(building.children.filter((child) => child.name === "residential-building-stairwell-mullion").length, 5);
  const doorPivot = building.getObjectByName("residential-building-door-pivot");
  const entranceDoor = building.getObjectByName("residential-building-entrance");
  const entryStep = building.getObjectByName("residential-building-entry-step");
  assert.ok(doorPivot);
  assert.equal(entranceDoor.geometry.parameters.width, 1.18);
  assert.equal(entranceDoor.geometry.parameters.height, 1.78);
  building.updateWorldMatrix(true, true);
  const entranceDoorBounds = new THREE.Box3().setFromObject(entranceDoor);
  const entryStepBounds = new THREE.Box3().setFromObject(entryStep);
  assert.ok(entranceDoorBounds.min.y > entryStepBounds.max.y);
  assert.equal(building.children.filter((child) => child.name === "residential-building-entrance-sidelight").length, 2);
  building.userData.setDoorOpen(true);
  assert.ok(doorPivot.rotation.y < -1);
  building.userData.setDoorOpen(false);
  assert.equal(doorPivot.rotation.y, 0);
  assert.deepEqual(building.userData.floorLevels.map((level) => Number(level.toFixed(2))), [0.52, 2.14, 3.76, 5.38, 7]);
  assert.equal(building.children.filter((child) => child.name === "residential-building-floor-platform").length, 5);
  assert.equal(building.children.filter((child) => child.name === "residential-building-stair-landing").length, 4);
  assert.equal(building.children.filter((child) => child.name === "residential-building-stair-step").length, 64);
  assert.equal(building.children.filter((child) => child.name === "residential-building-floor-door").length, 10);
  assert.equal(building.children.filter((child) => child.name === "residential-building-floor-door-handle").length, 10);
  assert.ok(building.userData.climbPath.length > 64);
  assert.equal(building.userData.climbPath[0].y, building.userData.floorLevels[0]);
  assert.equal(building.userData.climbPath.at(-1).y, building.userData.floorLevels.at(-1));
  assert.ok(building.userData.climbPath.every((point, index, path) => index === 0 || point.y >= path[index - 1].y));
  assert.ok(building.getObjectByName("residential-building-water-tank"));
  const balconyFloors = building.children.filter((child) => child.name === "residential-building-balcony-floor");
  const balconyRails = building.children.filter((child) => child.name === "residential-building-balcony-rail");
  const balconySideRails = building.children.filter((child) => child.name === "residential-building-balcony-side-rail");
  assert.equal(balconyFloors.length, 8);
  assert.equal(balconyRails.length, 8);
  assert.equal(balconySideRails.length, 16);
  assert.equal(building.children.filter((child) => child.name === "residential-building-balcony-post").length, 0);
  balconyFloors.forEach((floor, index) => {
    const floorBounds = new THREE.Box3().setFromObject(floor);
    const frontRailBounds = new THREE.Box3().setFromObject(balconyRails[index]);
    assert.ok(frontRailBounds.min.y - floorBounds.max.y > 0.009);
    for (const sideRail of balconySideRails.slice(index * 2, index * 2 + 2)) {
      const sideRailBounds = new THREE.Box3().setFromObject(sideRail);
      assert.ok(sideRailBounds.min.y - floorBounds.max.y > 0.009);
    }
  });
  assert.equal(building.children.filter((child) => child.name === "residential-building-air-conditioner").length, 2);
  const buildingLight = building.getObjectByName("residential-building-night-light");
  const buildingWindow = building.getObjectByName("residential-building-window");
  building.userData.setPowered(true);
  assert.ok(buildingLight.intensity > 4);
  assert.ok(buildingWindow.material.emissiveIntensity > 2);
  building.userData.setPowered(false);
  assert.equal(buildingLight.intensity, 0);
  const metrics = measureModelGeometry(building);
  assert.ok(metrics.size.y > 10);
  assert.ok(metrics.size.x > 7);
  assert.ok(metrics.faceCount > 1_000);
});

test("generates an 18-storey residential tower with two elevators and an emergency stair", () => {
  const tower = buildLowPolyHighRiseResidential();
  assert.equal(tower.name, "city-high-rise-residential-lowpoly");
  assert.equal(tower.userData.generatedLocally, true);
  assert.equal(tower.userData.floorCount, 18);
  assert.equal(tower.userData.apartmentCount, 72);
  assert.equal(tower.userData.elevatorCount, 2);
  assert.equal(tower.userData.emergencyStairCount, 1);
  assert.equal(tower.userData.elevatorDoorFacing, "interior");
  assert.equal(tower.userData.observationGlazingFacing, "exterior");
  assert.equal(tower.userData.floorLevels.length, 18);
  assert.ok(tower.userData.floorLevels.every((level, index, levels) => index === 0 || level > levels[index - 1]));
  assert.equal(tower.children.filter((child) => child.name === "high-rise-floor-slab").length, 18);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-window").length, 108);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-apartment-door").length, 72);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-elevator-door").length, 36);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-elevator-cabin").length, 2);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-emergency-fire-door").length, 18);
  const emergencyStair = tower.getObjectByName("high-rise-emergency-stair");
  assert.ok(emergencyStair);
  assert.equal(emergencyStair.children.filter((child) => child.name === "high-rise-emergency-stair-step").length, 204);
  assert.equal(emergencyStair.children.filter((child) => child.name === "high-rise-emergency-stair-landing").length, 17);
  const cabins = tower.children.filter((child) => child.name === "high-rise-elevator-cabin");
  const landingDoors = tower.children.filter((child) => child.name === "high-rise-elevator-door");
  const observationGlazing = tower.getObjectByName("high-rise-elevator-core-glazing");
  assert.ok(landingDoors.every((door) => door.position.z < 0.5));
  assert.ok(landingDoors.every((door) => door.position.z < observationGlazing.position.z));
  assert.equal(cabins.flatMap((cabin) => cabin.children.filter((child) => child.name === "high-rise-elevator-cabin-inner-door")).length, 4);
  assert.ok(cabins.every((cabin) => cabin.children
    .filter((child) => child.name === "high-rise-elevator-cabin-inner-door")
    .every((door) => door.position.z < 0 && door.userData.facing === "interior")));
  tower.userData.setElevatorFloors([18, 1]);
  assert.deepEqual(tower.userData.elevatorFloors, [18, 1]);
  assert.equal(cabins[0].position.y, tower.userData.floorLevels[17]);
  assert.equal(cabins[1].position.y, tower.userData.floorLevels[0]);
  tower.userData.setElevatorFloors([99, -4]);
  assert.deepEqual(tower.userData.elevatorFloors, [18, 1]);
  assert.equal(tower.userData.elevatorAutoEnabled, true);
  assert.equal(tower.children.filter((child) => child.name === "high-rise-elevator-cabin")
    .flatMap((cabin) => cabin.children.filter((child) => child.name === "high-rise-elevator-motion-light")).length, 2);
  tower.userData.setElevatorAuto(false);
  const pausedPositions = cabins.map((cabin) => cabin.position.y);
  for (let frame = 0; frame < 80; frame += 1) tower.userData.updateElevators(0.05);
  assert.deepEqual(cabins.map((cabin) => cabin.position.y), pausedPositions);
  tower.userData.setElevatorAuto(true);
  for (let frame = 0; frame < 80; frame += 1) tower.userData.updateElevators(0.05);
  assert.ok(cabins.some((cabin, index) => cabin.position.y !== pausedPositions[index]));
  assert.notDeepEqual(tower.userData.elevatorTargetFloors, [18, 1]);
  tower.userData.setElevatorAuto(false);
  const frozenPositions = cabins.map((cabin) => cabin.position.y);
  for (let frame = 0; frame < 40; frame += 1) tower.userData.updateElevators(0.05);
  assert.deepEqual(cabins.map((cabin) => cabin.position.y), frozenPositions);
  tower.userData.setInteriorCutaway(true);
  assert.equal(tower.getObjectByName("high-rise-elevator-core-glazing").visible, false);
  assert.equal(emergencyStair.visible, true);
  tower.userData.setInteriorCutaway(false);
  assert.equal(tower.getObjectByName("high-rise-elevator-core-glazing").visible, true);
  tower.userData.setPowered(true);
  assert.ok(tower.getObjectByName("high-rise-night-light").intensity > 4);
  assert.ok(tower.getObjectByName("high-rise-window").material.emissiveIntensity > 2);
  tower.userData.setPowered(false);
  assert.equal(tower.getObjectByName("high-rise-night-light").intensity, 0);
  const metrics = measureModelGeometry(tower);
  assert.ok(metrics.size.y > 34);
  assert.ok(metrics.size.x > 12);
  assert.ok(metrics.faceCount > 7_000);
});

test("generates an enterable furnished two-storey villa with a sealed chimney connection", () => {
  const villa = buildLowPolySmallVilla();
  assert.equal(villa.name, "city-small-villa-lowpoly");
  assert.equal(villa.userData.generatedLocally, true);
  assert.equal(villa.userData.floorCount, 2);
  assert.equal(villa.getObjectByName("small-villa-first-floor"), undefined);
  assert.ok(villa.getObjectByName("small-villa-ground-floor"));
  assert.equal(villa.children.filter((child) => child.name === "small-villa-second-floor-slab").length, 3);
  assert.ok(villa.getObjectByName("small-villa-gable-roof"));
  assert.ok(villa.getObjectByName("small-villa-front-door"));
  const villaDoorPivot = villa.getObjectByName("small-villa-front-door-pivot");
  villa.userData.setDoorOpen(true);
  assert.ok(villaDoorPivot.rotation.y < -1);
  villa.userData.setDoorOpen(false);
  assert.equal(villaDoorPivot.rotation.y, 0);
  const approachSteps = villa.children.filter((child) => child.name === "small-villa-approach-step");
  assert.equal(approachSteps.length, 2);
  villa.updateWorldMatrix(true, true);
  const approachBounds = approachSteps.map((step) => new THREE.Box3().setFromObject(step));
  const porchStepBounds = new THREE.Box3().setFromObject(villa.getObjectByName("small-villa-porch-step"));
  assert.ok(Math.abs(approachBounds[1].min.y) < 1e-6);
  assert.ok(approachBounds[1].max.y < approachBounds[0].max.y);
  assert.ok(approachBounds[0].max.y < porchStepBounds.max.y);
  villa.userData.setInteriorCutaway(true);
  assert.equal(villa.getObjectByName("small-villa-gable-roof").visible, false);
  assert.equal(villaDoorPivot.visible, false);
  assert.equal(villa.getObjectByName("small-villa-sofa").visible, true);
  villa.userData.setInteriorCutaway(false);
  assert.equal(villa.getObjectByName("small-villa-gable-roof").visible, true);
  assert.ok(villa.getObjectByName("small-villa-porch-roof"));
  assert.ok(villa.getObjectByName("small-villa-terrace"));
  const chimney = villa.getObjectByName("small-villa-chimney");
  const chimneyFlashing = villa.getObjectByName("small-villa-chimney-flashing");
  assert.ok(chimney);
  assert.ok(chimneyFlashing);
  assert.ok(chimney.position.y - chimney.geometry.parameters.height * 0.5 < chimneyFlashing.position.y);
  assert.ok(villa.getObjectByName("small-villa-living-room"));
  assert.ok(villa.getObjectByName("small-villa-sofa"));
  assert.ok(villa.getObjectByName("small-villa-television"));
  assert.ok(villa.getObjectByName("small-villa-dining-kitchen"));
  assert.ok(villa.getObjectByName("small-villa-kitchen-counter"));
  assert.ok(villa.getObjectByName("small-villa-stove"));
  assert.ok(villa.getObjectByName("small-villa-refrigerator"));
  assert.ok(villa.getObjectByName("small-villa-dining-table"));
  const villaStaircase = villa.getObjectByName("small-villa-staircase");
  const villaStairSteps = villaStaircase.children.filter((child) => child.name === "small-villa-stair-step");
  assert.ok(villaStaircase);
  assert.equal(villaStairSteps.length, 12);
  assert.ok(villaStairSteps[0].position.z < villaStairSteps.at(-1).position.z);
  assert.ok(villa.getObjectByName("small-villa-upstairs-landing"));
  const upstairsHallway = villa.getObjectByName("small-villa-upstairs-hallway");
  assert.ok(upstairsHallway);
  assert.ok(upstairsHallway.position.z > 1.5);
  const bathroomSideWall = villa.getObjectByName("small-villa-bathroom-side-wall");
  assert.ok(bathroomSideWall);
  assert.equal(villa.getObjectByName("small-villa-second-floor-interior").children.filter((child) => child.name === "small-villa-bathroom-front-wall").length, 2);
  assert.ok(bathroomSideWall.position.z + bathroomSideWall.geometry.parameters.depth * 0.5 < 0);
  assert.ok(villa.getObjectByName("small-villa-bed"));
  assert.ok(villa.getObjectByName("small-villa-wardrobe"));
  assert.ok(villa.getObjectByName("small-villa-toilet"));
  assert.ok(villa.getObjectByName("small-villa-toilet").position.z < -2);
  assert.ok(villa.getObjectByName("small-villa-bathroom-sink"));
  assert.ok(villa.getObjectByName("small-villa-shower-screen"));
  assert.deepEqual(Object.keys(villa.userData.roomAnchors).sort(), ["bathroom", "bedroom", "diningKitchen", "entrance", "livingRoom", "stairs"]);
  assert.equal(villa.children.filter((child) => child.name === "small-villa-shrub").length, 2);
  const villaLight = villa.getObjectByName("small-villa-night-light");
  const villaWindow = villa.getObjectByName("small-villa-window");
  villa.userData.setPowered(true);
  assert.ok(villaLight.intensity > 4);
  assert.ok(villaWindow.material.emissiveIntensity > 2);
  villa.userData.setPowered(false);
  assert.equal(villaLight.intensity, 0);
  const metrics = measureModelGeometry(villa);
  assert.ok(metrics.size.y > 7.4);
  assert.ok(metrics.size.x > 8);
  assert.ok(metrics.size.z > 7.5);
  assert.ok(metrics.faceCount > 400);
});

test("generates a broad furnished office campus with two wings, atrium and shared amenities", () => {
  const office = buildLowPolyOfficeCampus();
  assert.equal(office.name, "city-office-campus-lowpoly");
  assert.equal(office.userData.generatedLocally, true);
  assert.equal(office.userData.floorCount, 6);
  assert.equal(office.userData.wingCount, 2);
  assert.equal(office.userData.bridgeCount, 2);
  assert.equal(office.userData.workstationCount, 24);
  assert.equal(office.userData.meetingRoomCount, 6);
  assert.equal(office.userData.elevatorCount, 2);
  assert.equal(office.userData.emergencyStairCount, 2);
  assert.equal(office.children.filter((child) => child.name === "office-campus-floor-slab").length, 11);
  assert.equal(office.children.filter((child) => child.name === "office-campus-skybridge").length, 2);
  assert.equal(office.children.filter((child) => child.name === "office-campus-workstation-desk").length, 24);
  assert.equal(office.children.filter((child) => child.name === "office-campus-meeting-room-floor").length, 6);
  assert.equal(office.children.filter((child) => child.name === "office-campus-elevator-door").length, 11);
  assert.equal(office.children.filter((child) => child.name === "office-campus-elevator-cabin").length, 2);
  assert.equal(office.children.filter((child) => child.name === "office-campus-emergency-stair").length, 2);
  assert.equal(office.children.filter((child) => child.name === "office-campus-roof-terrace-rail").length, 4);
  const officeStairs = office.children.filter((child) => child.name === "office-campus-emergency-stair");
  assert.equal(officeStairs.flatMap((stair) => stair.children.filter((child) => child.name === "office-campus-emergency-stair-step")).length, 108);
  assert.equal(officeStairs.flatMap((stair) => stair.children.filter((child) => child.name === "office-campus-emergency-stair-landing")).length, 9);
  assert.equal(office.children.filter((child) => child.name === "office-campus-solar-panel").length, 6);
  assert.ok(office.getObjectByName("office-campus-atrium-glazing"));
  assert.ok(office.getObjectByName("office-campus-reception-desk"));
  assert.ok(office.getObjectByName("office-campus-lobby-turnstile"));
  assert.ok(office.getObjectByName("office-campus-atrium-stair-step"));
  assert.ok(office.getObjectByName("office-campus-cafe-counter"));
  assert.ok(office.getObjectByName("office-campus-phone-room"));
  assert.ok(office.getObjectByName("office-campus-loading-dock"));
  const frontWindow = office.getObjectByName("office-campus-curtain-window");
  office.userData.setInteriorCutaway(true);
  assert.equal(frontWindow.visible, false);
  office.userData.setInteriorCutaway(false);
  assert.equal(frontWindow.visible, true);
  office.userData.setPowered(true);
  assert.ok(frontWindow.material.emissiveIntensity > 2);
  assert.ok(office.getObjectByName("office-campus-lobby-light").intensity > 5);
  office.userData.setPowered(false);
  assert.equal(office.getObjectByName("office-campus-lobby-light").intensity, 0);
  const metrics = measureModelGeometry(office);
  assert.ok(metrics.size.x >= 30);
  assert.ok(metrics.size.z >= 17);
  assert.ok(metrics.size.x > metrics.size.y * 2);
  assert.ok(metrics.faceCount > 3_000);
});

test("creates separate normal and shattered versions from real low-poly triangles", () => {
  const lamp = buildLowPolyStreetLight();
  const pair = createFurnitureShatterPair(lamp, { seed: 31, trianglesPerShard: 4 });
  assert.equal(pair.normal, lamp);
  assert.equal(pair.normal.userData.modelState, "normal");
  assert.equal(pair.shattered.userData.modelState, "shattered");
  assert.ok(pair.shards.length > 12);
  assert.equal(pair.normal.visible, true);
  assert.equal(pair.shattered.visible, false);
  const initial = pair.shards[0].home.clone();
  pair.setAmount(1);
  assert.equal(pair.normal.visible, false);
  assert.equal(pair.shattered.visible, true);
  assert.ok(pair.shards[0].mesh.position.distanceTo(initial) > 0.25);
  pair.setAmount(0);
  assert.equal(pair.normal.visible, true);
  assert.equal(pair.shattered.visible, false);
});

test("measures exact model bounds and rendered triangle counts", () => {
  const signal = buildLowPolyTrafficLight();
  const metrics = measureModelGeometry(signal);
  assert.ok(metrics.size.x > 2.5);
  assert.ok(metrics.size.y > 5);
  assert.ok(metrics.size.z > 1);
  assert.ok(Number.isInteger(metrics.faceCount));
  assert.ok(metrics.faceCount > 300);
});

test("demo uses the forest normal tree and contains no third-party model or API URL", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.match(source, /tree_normal_medium_redwood_a\.glb/);
  assert.match(source, /tree_medium_redwood_a\.glb/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /buildLowPolyStreetLight/);
  assert.match(source, /buildLowPolyTrafficLight/);
  assert.match(source, /buildLowPolyFoodTruck/);
  assert.match(source, /buildLowPolyHotDogKiosk/);
  assert.match(source, /buildLowPolyNewsstand/);
  assert.match(source, /buildLowPolyOfficeCampus/);
  assert.match(source, /buildLowPolyPhoneBooth/);
  assert.match(source, /buildLowPolyRoadsidePlanter/);
  assert.match(source, /buildLowPolyResidentialBuilding/);
  assert.match(source, /buildLowPolyHighRiseResidential/);
  assert.match(source, /buildLowPolySmallVilla/);
  assert.match(source, /APARTMENT_SHOWCASE_SCALE = 1\.8/);
  assert.match(source, /VILLA_SHOWCASE_SCALE = 1\.3/);
  assert.match(source, /HIGH_RISE_SHOWCASE_SCALE = 1\.7/);
  assert.match(source, /OFFICE_SHOWCASE_SCALE = 1\.65/);
  assert.match(source, /addPedestal\(scene, -12, 6, 0x3f8c88, 3\.9\)/);
  assert.match(source, /pair\.root\.scale\.setScalar\(displayScale\)/);
  assert.match(source, /setApartmentDoorOpen/);
  assert.match(source, /setVillaDoorOpen/);
  assert.match(source, /setVillaInteriorCutaway/);
  assert.match(source, /关闭居民楼入口门/);
  assert.match(source, /打开居民楼入口门/);
  assert.match(source, /关闭别墅入口门/);
  assert.match(source, /打开别墅入口门/);
  assert.match(source, /查看别墅内部/);
  assert.match(source, /恢复别墅外观/);
  assert.match(source, /查看高层内部/);
  assert.match(source, /setHighRiseElevatorAuto/);
  assert.match(source, /setOfficeInteriorCutaway/);
  assert.match(source, /highRise\?\.userData\.updateElevators\(dt\)/);
  assert.match(source, /关闭电梯自动运行/);
  assert.match(source, /开启电梯自动运行/);
  assert.match(source, /查看办公楼内部/);
  assert.match(source, /恢复办公楼外观/);
  assert.match(source, /new THREE\.Vector3\(0, 0\.42, 50\)/);
  assert.match(source, /createFurnitureShatterPair/);
  assert.match(source, /ShatterMorphController/);
  assert.match(source, /破碎全部模型/);
});

test("every showcase card exposes expandable model data", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/number: "MODEL \d{2}"/g)?.length, 12);
  assert.equal(source.match(/stats: \[/g)?.length, 12);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{`model-data-\$\{model\.id\}`\}/);
  assert.match(source, /查看参数 \+/);
  assert.match(source, /收起参数 −/);
  assert.match(source, /模型大小（宽 × 高 × 深）/);
  assert.match(source, /模型面数/);
  assert.match(source, /measureModelGeometry/);
});

test("showcase list reveals a partial next row and scrolls vertically", async () => {
  const css = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.module.css", import.meta.url), "utf8");
  const modelCardsRule = css.match(/\.modelCards \{[^}]+\}/)?.[0] ?? "";
  assert.match(modelCardsRule, /height: 148px/);
  assert.match(modelCardsRule, /grid-template-columns: repeat\(5/);
  assert.match(modelCardsRule, /grid-auto-rows: max-content/);
  assert.match(modelCardsRule, /overflow-y: auto/);
  assert.match(modelCardsRule, /overflow-x: hidden/);
  assert.match(css, /height: 112px/);
  assert.match(css, /grid-template-columns: repeat\(2/);
  assert.doesNotMatch(css, /\.modelCards \{[^}]*display: flex/);
});

test("showcase card names and summaries reserve space without overlapping rows", async () => {
  const css = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.module.css", import.meta.url), "utf8");
  assert.match(css, /\.modelCard \{[^}]*min-height: 123px/);
  assert.match(css, /\.modelFocusButton \{[^}]*min-height: 94px/);
  assert.match(css, /\.modelCard strong \{[^}]*min-height: 32px/);
  assert.match(css, /\.modelCard small \{[^}]*min-height: 22px/);
  assert.match(css, /-webkit-line-clamp: 2/);
  assert.match(css, /\.expandButton \{[^}]*flex: 0 0 28px/);
});

test("the upper-left operation panel can be collapsed accessibly", async () => {
  const source = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.module.css", import.meta.url), "utf8");
  assert.match(source, /operationsCollapsed/);
  assert.match(source, /aria-expanded=\{!operationsCollapsed\}/);
  assert.match(source, /aria-controls="city-demo-operations"/);
  assert.match(source, /id="city-demo-operations"/);
  assert.match(source, /hidden=\{operationsCollapsed\}/);
  assert.match(source, /展开操作 ↓/);
  assert.match(source, /收起操作 ↑/);
  assert.match(css, /\.header\.collapsed/);
  assert.match(css, /\.headerContent\[hidden\]/);
});
