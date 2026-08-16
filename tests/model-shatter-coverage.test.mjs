import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  createSceneShatterPair,
  measureModelGeometry,
} from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyAmusementPark } from "../app/lib/map/amusementPark.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";
import { buildLowPolyShoppingMall } from "../app/lib/map/shoppingMall.ts";
import { buildLowPolyResidentialCommunity } from "../app/lib/map/residentialCommunity.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";
import { buildLowPolyCityPark } from "../app/lib/map/cityPark.ts";
import { buildLowPolySportsCenter } from "../app/lib/map/sportsCenter.ts";
import { buildLowPolyCityCenter } from "../app/lib/map/cityCenter.ts";
import { buildLowPolyTownCenter } from "../app/lib/map/townCenter.ts";

const MAX_FRAGMENT_COUNT = 18 * 8 * 14;
const MAX_MATERIAL_BATCH_COUNT = 512;

const SCENARIOS = [
  {
    id: "amusement-park",
    route: "/demos/amusement-park",
    demo: new URL("../app/demos/amusement-park/AmusementParkDemo.tsx", import.meta.url),
    build: buildLowPolyAmusementPark,
    options: { seed: 401, spread: 6.5 },
  },
  {
    id: "school-campus",
    route: "/demos/school-campus",
    demo: new URL("../app/demos/school-campus/SchoolCampusDemo.tsx", import.meta.url),
    build: buildLowPolySchoolCampus,
    options: { seed: 402, spread: 5.5 },
  },
  {
    id: "shopping-mall",
    route: "/demos/shopping-mall",
    demo: new URL("../app/demos/shopping-mall/ShoppingMallDemo.tsx", import.meta.url),
    build: buildLowPolyShoppingMall,
    options: { seed: 403, spread: 6 },
  },
  {
    id: "residential-community",
    route: "/demos/residential-community",
    demo: new URL("../app/demos/residential-community/ResidentialCommunityDemo.tsx", import.meta.url),
    build: buildLowPolyResidentialCommunity,
    options: { seed: 404, spread: 5.5 },
  },
  {
    id: "fire-station",
    route: "/demos/fire-station",
    demo: new URL("../app/demos/fire-station/FireStationDemo.tsx", import.meta.url),
    build: buildLowPolyFireStation,
    options: { seed: 405, spread: 5 },
  },
  {
    id: "city-park",
    route: "/demos/city-park",
    demo: new URL("../app/demos/city-park/CityParkDemo.tsx", import.meta.url),
    build: buildLowPolyCityPark,
    options: { seed: 406, spread: 5.5 },
  },
  {
    id: "sports-center",
    route: "/demos/sports-center",
    demo: new URL("../app/demos/sports-center/SportsCenterDemo.tsx", import.meta.url),
    build: buildLowPolySportsCenter,
    options: { seed: 407, spread: 5 },
  },
  {
    id: "city-center",
    route: "/demos/city-center",
    demo: new URL("../app/demos/city-center/CityCenterDemo.tsx", import.meta.url),
    build: buildLowPolyCityCenter,
    options: { seed: 408, spread: 5.5 },
  },
  {
    id: "town-center",
    route: "/demos/town-center",
    demo: new URL("../app/demos/town-center/TownCenterDemo.tsx", import.meta.url),
    build: buildLowPolyTownCenter,
    options: { seed: 409, spread: 4.8 },
  },
];

const EXISTING_SHATTER_ROUTES = [
  "/demos/city-street-furniture",
  "/demos/residential-buildings",
  "/demos/hospital-campus",
];

function collectMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function rootTransform(root) {
  return {
    position: root.position.toArray(),
    quaternion: root.quaternion.toArray(),
    scale: root.scale.toArray(),
    rotationOrder: root.rotation.order,
  };
}

function interactionFunctions(root) {
  return new Map(
    Object.entries(root.userData).filter(([, value]) => typeof value === "function"),
  );
}

function assertFiniteValues(values, message) {
  for (const value of values) {
    assert.ok(Number.isFinite(value), `${message} contains a non-finite value`);
  }
}

function assertFiniteObjectTransforms(root, scenarioId) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    assertFiniteValues(object.position.toArray(), `${scenarioId} ${object.name} position`);
    assertFiniteValues(object.quaternion.toArray(), `${scenarioId} ${object.name} quaternion`);
    assertFiniteValues(object.scale.toArray(), `${scenarioId} ${object.name} scale`);
    assertFiniteValues(object.matrix.elements, `${scenarioId} ${object.name} matrix`);
    assertFiniteValues(object.matrixWorld.elements, `${scenarioId} ${object.name} world matrix`);
  });
}

function assertFiniteShatterGeometry(mesh, scenarioId) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  assert.ok(position, `${scenarioId} ${mesh.name} should have positions`);

  for (const attributeName of [
    "shardCenter",
    "shardRepair",
    "shardBlast",
    "shardAxisAngle",
    "shardScaleStagger",
  ]) {
    const attribute = geometry.getAttribute(attributeName);
    assert.ok(attribute, `${scenarioId} ${mesh.name} should have ${attributeName}`);
    assert.equal(attribute.count, position.count, `${scenarioId} ${attributeName} should cover every vertex`);
  }

  for (const [attributeName, attribute] of Object.entries(geometry.attributes)) {
    assertFiniteValues(attribute.array, `${scenarioId} ${mesh.name} ${attributeName}`);
  }

  const index = geometry.getIndex();
  if (index) {
    for (const value of index.array) {
      assert.ok(Number.isInteger(value), `${scenarioId} ${mesh.name} index should be an integer`);
      assert.ok(value >= 0 && value < position.count, `${scenarioId} ${mesh.name} index should address a vertex`);
    }
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  assert.ok(geometry.boundingBox, `${scenarioId} ${mesh.name} should have bounds`);
  assert.ok(geometry.boundingSphere, `${scenarioId} ${mesh.name} should have a bounding sphere`);
  assertFiniteValues(geometry.boundingBox.min.toArray(), `${scenarioId} ${mesh.name} minimum bounds`);
  assertFiniteValues(geometry.boundingBox.max.toArray(), `${scenarioId} ${mesh.name} maximum bounds`);
  assertFiniteValues(geometry.boundingSphere.center.toArray(), `${scenarioId} ${mesh.name} sphere center`);
  assert.ok(Number.isFinite(geometry.boundingSphere.radius), `${scenarioId} ${mesh.name} sphere radius should be finite`);

  const repair = geometry.getAttribute("shardRepair");
  const blast = geometry.getAttribute("shardBlast");
  for (let indexOffset = 0; indexOffset < repair.count; indexOffset += 1) {
    const distance = Math.hypot(
      repair.getX(indexOffset) - blast.getX(indexOffset),
      repair.getY(indexOffset) - blast.getY(indexOffset),
      repair.getZ(indexOffset) - blast.getZ(indexOffset),
    );
    if (distance > 1e-4) return true;
  }
  return false;
}

function shatterUniforms(root) {
  const uniforms = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const uniform = material.userData.shatterAmount;
      if (uniform) uniforms.push(uniform);
    }
  });
  return uniforms;
}

function assertUniformAmount(uniforms, amount, scenarioId) {
  assert.ok(uniforms.length > 0, `${scenarioId} should expose shatter uniforms`);
  for (const uniform of uniforms) {
    assert.equal(uniform.value, amount, `${scenarioId} shatter uniform should be ${amount}`);
  }
}

function archiveCategoryBlock(source, route) {
  const marker = `href: "${route}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${route} should be registered in the model archive`);
  const start = source.lastIndexOf("  {", markerIndex);
  const end = source.indexOf("\n  },", markerIndex);
  assert.ok(start >= 0 && end > markerIndex, `${route} should have a complete archive entry`);
  return source.slice(start, end + 5);
}

for (const scenario of SCENARIOS) {
  test(`${scenario.id} builds a finite, independent and reversible shattered scene`, () => {
    const normal = scenario.build();
    normal.position.set(1.25, 0.35, -2.5);
    normal.quaternion.setFromEuler(new THREE.Euler(0.04, -0.17, 0.03));
    normal.scale.set(1.04, 0.97, 1.02);
    normal.updateMatrix();

    const initialTransform = rootTransform(normal);
    const initialInteractions = interactionFunctions(normal);
    const pair = createSceneShatterPair(normal, scenario.options);

    assert.equal(pair.normal, normal);
    assert.notEqual(pair.normal, pair.shattered);
    assert.notEqual(pair.root, pair.normal);
    assert.notEqual(pair.root, pair.shattered);
    assert.equal(pair.normal.userData.modelState, "normal");
    assert.equal(pair.shattered.userData.modelState, "shattered");
    assert.ok(pair.fragmentCount > 0 && pair.fragmentCount <= MAX_FRAGMENT_COUNT);
    assert.ok(pair.materialBatchCount > 0 && pair.materialBatchCount <= MAX_MATERIAL_BATCH_COUNT);

    const normalMeshes = collectMeshes(pair.normal);
    const shatteredMeshes = collectMeshes(pair.shattered);
    assert.equal(shatteredMeshes.length, pair.materialBatchCount);
    const normalGeometryIds = new Set(normalMeshes.map((mesh) => mesh.geometry.uuid));
    for (const mesh of shatteredMeshes) {
      assert.ok(!normalGeometryIds.has(mesh.geometry.uuid), `${scenario.id} should not reuse normal geometry objects`);
    }

    const normalMetrics = measureModelGeometry(pair.normal);
    const shatteredMetrics = measureModelGeometry(pair.shattered);
    assert.ok(shatteredMetrics.faceCount > 0);
    assert.ok(shatteredMetrics.faceCount <= normalMetrics.faceCount);
    assert.ok(
      shatteredMetrics.faceCount >= normalMetrics.faceCount * 0.95,
      `${scenario.id} shattered geometry should retain at least 95% of visible source faces`,
    );

    let hasDistinctBlastPose = false;
    for (const mesh of shatteredMeshes) {
      hasDistinctBlastPose = assertFiniteShatterGeometry(mesh, scenario.id) || hasDistinctBlastPose;
    }
    assert.equal(hasDistinctBlastPose, true, `${scenario.id} repair and blast poses should differ`);
    assertFiniteObjectTransforms(pair.root, scenario.id);

    const uniforms = shatterUniforms(pair.shattered);
    pair.setAmount(0);
    assert.equal(pair.normal.visible, true);
    assert.equal(pair.shattered.visible, false);
    assertUniformAmount(uniforms, 0, scenario.id);

    pair.setAmount(1);
    assert.equal(pair.normal.visible, false);
    assert.equal(pair.shattered.visible, true);
    assertUniformAmount(uniforms, 1, scenario.id);

    pair.setAmount(0);
    assert.equal(pair.normal.visible, true);
    assert.equal(pair.shattered.visible, false);
    assertUniformAmount(uniforms, 0, scenario.id);
    assert.deepEqual(rootTransform(pair.normal), initialTransform);
    for (const [key, callback] of initialInteractions) {
      assert.equal(pair.normal.userData[key], callback, `${scenario.id} should preserve ${key}`);
    }
  });
}

test("all nine new showrooms expose reversible shatter controls", async () => {
  const sources = await Promise.all(SCENARIOS.map((scenario) => readFile(scenario.demo, "utf8")));
  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const scenario = SCENARIOS[index];
    const source = sources[index];
    assert.match(source, /createSceneShatterPair/, `${scenario.id} should build its shattered scene`);
    assert.match(source, /ShatterMorphController/, `${scenario.id} should animate shatter transitions`);
    assert.match(source, /setShattered/, `${scenario.id} should expose a shatter action`);
    assert.match(source, /onClick=\{toggleShattered\}/, `${scenario.id} should render a shatter button`);
    assert.match(source, /破碎/, `${scenario.id} should label the shatter action`);
    assert.match(source, /修复/, `${scenario.id} should label the restore action`);
  }
});

test("the model archive exposes all twelve normal and shattered showroom routes", async () => {
  const source = await readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8");
  const expectedRoutes = [...EXISTING_SHATTER_ROUTES, ...SCENARIOS.map((scenario) => scenario.route)].sort();
  const registeredRoutes = [...new Set(
    [...source.matchAll(/href: "(\/demos\/[^\"]+)"/g)].map((match) => match[1]),
  )].sort();
  assert.deepEqual(registeredRoutes, expectedRoutes);

  for (const scenario of SCENARIOS) {
    const block = archiveCategoryBlock(source, scenario.route);
    assert.match(block, /正常\s*\/\s*破碎/, `${scenario.route} should advertise normal and shattered versions`);
  }

  // These routes already expose their own established dual-version mechanisms.
  for (const route of EXISTING_SHATTER_ROUTES) archiveCategoryBlock(source, route);
});
