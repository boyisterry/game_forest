import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  buildLowPolyFoodProcessingPlant,
  buildLowPolyMechanizedFactory,
  buildLowPolyTechnologyPark,
} from "../app/lib/map/modernIndustrialDistricts.ts";

const VARIANTS = [
  ["technology-park", buildLowPolyTechnologyPark, [260, 32, 180], 2, 112],
  ["food-processing-plant", buildLowPolyFoodProcessingPlant, [280, 30, 200], 3, 128],
  ["mechanized-factory", buildLowPolyMechanizedFactory, [300, 34, 210], 3, 160],
];

function named(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

function isWorldVisible(object) {
  for (let cursor = object; cursor; cursor = cursor.parent) if (!cursor.visible) return false;
  return true;
}

function overlapsXZ(a, b, tolerance = 1e-6) {
  return a.min.x < b.max.x - tolerance && a.max.x > b.min.x + tolerance
    && a.min.z < b.max.z - tolerance && a.max.z > b.min.z + tolerance;
}

function bounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

test("three industrial districts expose large 1m-grid independent sites and shared smart infrastructure", () => {
  for (const [variant, build, size, lineCount, solarCount] of VARIANTS) {
    const district = build();
    assert.equal(district.userData.modelType, variant);
    assert.equal(district.userData.facilityVariant, variant);
    assert.equal(district.userData.moduleGridMeters, 1);
    assert.equal(district.userData.generatedLocally, true);
    assert.deepEqual(district.userData.siteSize.toArray(), size);
    assert.equal(district.userData.scaleStandard, "rabbit-rider");
    assert.equal(district.userData.scaleReferenceLengthMeters, 2.4);
    assert.equal(district.userData.automatedProductionLineCount, lineCount);
    assert.equal(district.userData.solarPanelCount, solarCount);
    assert.equal(district.userData.photovoltaicCapacityKilowattsPeak, Math.round(solarCount * 0.55));
    assert.ok(district.getObjectByName("modern-industrial-smart-entry-gate"));
    assert.ok(district.getObjectByName("modern-industrial-perimeter-fence"));
    assert.ok(district.getObjectByName("modern-industrial-smart-energy-centre"));
    assert.equal(named(district, "modern-industrial-pooled-night-light").length, 5);
  }
});

test("photovoltaics stay on factory roofs while automated production and high-bay warehousing remain complete", () => {
  for (const [variant, build, , lineCount, solarCount] of VARIANTS) {
    const district = build();
    district.updateMatrixWorld(true);
    const panels = named(district, "modern-industrial-solar-panel");
    const supports = named(district, "modern-industrial-solar-panel-support");
    const roofs = named(district, "modern-industrial-building-roof").map((roof) => bounds(roof));
    const rooftopSystem = district.getObjectByName("modern-industrial-rooftop-photovoltaic-system");
    assert.equal(district.userData.photovoltaicMounting, "factory-rooftop");
    assert.equal(rooftopSystem.userData.roofMounted, true);
    assert.equal(rooftopSystem.userData.independentGroundArray, false);
    assert.equal(district.getObjectByName("modern-industrial-photovoltaic-array"), undefined);
    assert.equal(district.getObjectByName("modern-industrial-solar-parking-canopy"), undefined);
    assert.equal(panels.length, solarCount, `${variant} panels`);
    assert.equal(supports.length, solarCount * 2, `${variant} short roof mounts`);
    for (const panel of panels) {
      const panelBounds = bounds(panel);
      const host = roofs.find((roof) => panelBounds.min.x >= roof.min.x - 0.01
        && panelBounds.max.x <= roof.max.x + 0.01
        && panelBounds.min.z >= roof.min.z - 0.01
        && panelBounds.max.z <= roof.max.z + 0.01);
      assert.ok(host, `${variant} panel should stay inside a factory roof`);
      assert.ok(panelBounds.min.y >= host.max.y - 0.01 && panelBounds.min.y <= host.max.y + 0.25, `${variant} panel should sit just above its roof`);
      assert.equal(panel.userData.roofMounted, true);
    }
    for (const support of supports) {
      const supportBounds = bounds(support);
      assert.ok(Math.abs(supportBounds.min.y - support.userData.roofTopY) <= 0.01, `${variant} roof mount should start on the roof`);
    }
    assert.equal(named(district, "modern-industrial-automated-production-line").length, lineCount);
    assert.equal(named(district, "modern-industrial-robot-base").length, lineCount * 3);
    assert.equal(named(district, "modern-industrial-line-carrier").length, lineCount * 4);
    assert.equal(named(district, "modern-industrial-automated-high-bay-warehouse").length, 1);
    assert.equal(named(district, "modern-industrial-warehouse-rack-shelf").length, 96);
    assert.equal(named(district, "modern-industrial-warehouse-storage-bin").length, 192);
    assert.equal(named(district, "modern-industrial-warehouse-stacker-crane").length, 2);
    assert.equal(named(district, "modern-industrial-autonomous-guided-vehicle").length, 6);
    assert.equal(named(district, "modern-industrial-fast-charger").length, 8);
  }
});

test("production controls animate carriers, AGVs and stacker cranes and pause deterministically", () => {
  for (const [, build] of VARIANTS) {
    const district = build();
    const carrier = named(district, "modern-industrial-line-carrier")[0];
    const agv = named(district, "modern-industrial-autonomous-guided-vehicle")[0];
    const crane = named(district, "modern-industrial-warehouse-stacker-crane")[0];
    const before = [carrier.position.x, agv.position.z, crane.position.z];
    district.userData.update(0.75);
    const animated = [carrier.position.x, agv.position.z, crane.position.z];
    assert.notDeepEqual(animated, before);
    district.userData.setProductionRunning(false);
    district.userData.update(1.25);
    assert.deepEqual([carrier.position.x, agv.position.z, crane.position.z], animated);
    district.userData.setProductionRunning(true);
    district.userData.update(0.5);
    assert.notDeepEqual([carrier.position.x, agv.position.z, crane.position.z], animated);
  }
});

test("night power is explicit, pooled and reversible", () => {
  for (const [, build] of VARIANTS) {
    const district = build();
    const lights = named(district, "modern-industrial-pooled-night-light");
    assert.ok(lights.every((light) => light instanceof THREE.PointLight && !light.visible && light.intensity === 0 && !light.castShadow));
    district.userData.setPowered(true);
    assert.ok(lights.every((light) => light.visible && light.intensity > 0));
    district.userData.setPowered(false);
    assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
  }
});

test("each district has purpose-specific modern process facilities", () => {
  const technology = buildLowPolyTechnologyPark();
  assert.ok(technology.getObjectByName("technology-park-innovation-tower"));
  assert.ok(technology.getObjectByName("technology-park-data-centre"));
  assert.equal(named(technology, "technology-park-server-rack").length, 10);
  assert.ok(technology.getObjectByName("technology-park-clean-research-laboratory"));
  assert.ok(technology.getObjectByName("technology-park-autonomous-drone-pad"));

  const food = buildLowPolyFoodProcessingPlant();
  assert.ok(food.getObjectByName("food-processing-plant-raw-material-receiving"));
  assert.ok(food.getObjectByName("food-processing-plant-clean-processing-hall"));
  assert.ok(food.getObjectByName("food-processing-plant-quality-laboratory"));
  assert.equal(named(food, "food-processing-plant-process-tank").length, 3);
  assert.equal(named(food, "food-processing-plant-cold-dock-door").length, 3);
  assert.equal(named(food, "food-processing-plant-treatment-basin").length, 2);

  const mechanized = buildLowPolyMechanizedFactory();
  assert.ok(mechanized.getObjectByName("mechanized-factory-machining-hall"));
  assert.ok(mechanized.getObjectByName("mechanized-factory-robotic-welding-hall"));
  assert.ok(mechanized.getObjectByName("mechanized-factory-final-assembly-hall"));
  assert.equal(named(mechanized, "mechanized-factory-cnc-machine").length, 8);
  assert.ok(mechanized.getObjectByName("mechanized-factory-overhead-gantry-crane"));
  assert.ok(mechanized.getObjectByName("mechanized-factory-enclosed-paint-booth"));
});

test("building foundations stay clear of the internal road hierarchy", () => {
  const roadNames = new Set(["modern-industrial-main-road", "modern-industrial-cross-road", "modern-industrial-front-logistics-road"]);
  for (const [variant, build] of VARIANTS) {
    const district = build();
    district.updateMatrixWorld(true);
    const roads = [];
    const foundations = [];
    district.traverse((object) => {
      if (roadNames.has(object.name)) roads.push(object);
      if (object.name === "modern-industrial-building-foundation" || object.name === "modern-industrial-warehouse-foundation") foundations.push(object);
    });
    for (const foundation of foundations) {
      for (const road of roads) assert.equal(overlapsXZ(bounds(foundation), bounds(road)), false, `${variant}: ${foundation.parent?.name} overlaps ${road.name}`);
    }
  }
});

test("large scenes keep visible meshes, geometry batches and shadows within editor budgets", () => {
  for (const [variant, build] of VARIANTS) {
    const district = build();
    let visibleMeshes = 0;
    let shadowCasters = 0;
    district.traverse((object) => {
      for (const value of [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]) assert.ok(Number.isFinite(value), `${variant} finite transform`);
      if (!(object instanceof THREE.Mesh) || !isWorldVisible(object)) return;
      visibleMeshes += 1;
      if (object.castShadow) shadowCasters += 1;
    });
    assert.ok(visibleMeshes <= 190, `${variant} visible meshes ${visibleMeshes}`);
    assert.ok(shadowCasters <= 50, `${variant} shadow casters ${shadowCasters}`);
    assert.ok(district.userData.renderBatchCount <= 80, `${variant} render batches`);
  }
});

test("catalog, independent routes and the shared showroom expose all three districts", async () => {
  const [catalog, sources, demo, technologyPage, foodPage, mechanizedPage, archive] = await Promise.all([
    readFile(new URL("../app/lib/map/cityCatalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/cityCatalogSources.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/industrial-zones/IndustrialZoneDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/technology-park/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/food-processing-plant/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/mechanized-factory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const [id, page] of [["technology-park", technologyPage], ["food-processing-plant", foodPage], ["mechanized-factory", mechanizedPage]]) {
    assert.match(catalog, new RegExp(`id: "${id}"`));
    assert.match(sources, new RegExp(`factoryId: "${id}"`));
    assert.match(page, new RegExp(`variant="${id}"`));
    assert.match(archive, new RegExp(`href: "/demos/${id}"`));
  }
  assert.match(demo, /createSceneShatterPair/);
  assert.match(demo, /ShatterMorphController/);
  assert.match(demo, /setProductionRunning/);
  assert.match(demo, /RABBIT_RIDER_URL/);
});
