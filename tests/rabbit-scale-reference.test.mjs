import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  prepareRabbitRiderReference,
  RABBIT_RIDER_REFERENCE_LENGTH_METERS,
  RABBIT_RIDER_REFERENCE_SIZE,
  RABBIT_RIDER_URL,
} from "../app/lib/map/rabbitRiderReference.ts";
import {
  advanceWheelAngle,
  RIDER_WHEEL_RADIUS_METERS,
  RiderWheelMotion,
} from "../app/lib/map/riderWheelMotion.ts";
import {
  RABBIT_RIDER_COLLISION_RADIUS_METERS,
  RABBIT_RIDER_LENGTH_METERS,
  RABBIT_RIDER_WIDTH_METERS,
} from "../app/lib/map/riderDimensions.ts";

test("collision circle contains the normalized rabbit-scooter footprint", () => {
  assert.ok(RABBIT_RIDER_COLLISION_RADIUS_METERS >= RABBIT_RIDER_LENGTH_METERS * 0.5);
  assert.ok(RABBIT_RIDER_COLLISION_RADIUS_METERS >= RABBIT_RIDER_WIDTH_METERS * 0.5);
  assert.equal(RABBIT_RIDER_COLLISION_RADIUS_METERS, 1.05);
});

test("replaces incomplete tire fragments with closed rolling rubber tires", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, 0, 0, -0.9, 0, 0, -1, 0.1, 0,
    0.58, -0.9, 0, 0.7, -0.78, 0, 0.58, -0.66, 0,
    -0.52, -0.9, 0, -0.4, -0.78, 0, -0.52, -0.66, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const material = new THREE.MeshStandardMaterial();
  const sourceMesh = new THREE.Mesh(geometry, material);
  const model = new THREE.Group();
  model.add(sourceMesh);

  const wheels = new RiderWheelMotion(model);
  const start = wheels.getState();
  assert.equal(start.spinRadians, 0);
  assert.equal(wheels.root.name, "rabbit-scooter-wheel-motion");
  assert.equal(wheels.root.userData.sourceTireFragmentsRemoved, true);
  assert.equal(wheels.root.userData.completeTireSurface, true);
  assert.equal(start.frontTriangles, 1);
  assert.equal(start.rearTriangles, 1);
  assert.equal(sourceMesh.geometry.index.count, 3, "the stationary body must retain only its own triangle");
  let wheelMeshCount = 0;
  wheels.root.traverse((object) => { if (object instanceof THREE.Mesh) wheelMeshCount += 1; });
  assert.equal(wheelMeshCount, 2, "only the two closed tire meshes should be added");
  const frontTire = model.getObjectByName("rabbit-scooter-front-tire");
  const rearTire = model.getObjectByName("rabbit-scooter-rear-tire");
  assert.equal(frontTire.material.name, "rabbit-scooter-clean-rubber");
  assert.equal(rearTire.material, frontTire.material, "both tires should share one rubber material");
  assert.equal(frontTire.material.map.name, "rabbit-scooter-molded-rubber-tread");
  assert.equal(frontTire.material.map, frontTire.material.bumpMap);
  assert.ok(frontTire.geometry instanceof THREE.TorusGeometry);

  wheels.update(0.1, 4.4, 0.2);
  const forward = wheels.getState();
  assert.ok(Math.abs(forward.spinRadians + 2) < 1e-8);
  assert.equal(forward.angularSpeedRadiansPerSecond, -4.4 / RIDER_WHEEL_RADIUS_METERS);
  assert.equal(forward.steerRadians, 0.2);
  assert.ok(Math.abs(model.getObjectByName("rabbit-scooter-front-wheel-rotor").rotation.z + 2) < 1e-8);
  assert.ok(Math.abs(model.getObjectByName("rabbit-scooter-rear-wheel-rotor").rotation.z + 2) < 1e-8);

  const reverse = advanceWheelAngle(forward.spinRadians, -4.4, 0.1);
  assert.ok(Math.abs(reverse) < 1e-8, "reverse travel must unwind the wheel in the opposite direction");
  assert.equal(advanceWheelAngle(reverse, 0, 1), reverse, "an idle scooter must not rotate its wheels");
});

test("normalizes the existing rabbit-rider model to a 2.40 metre scale reference", () => {
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 2), new THREE.MeshStandardMaterial()));
  const reference = prepareRabbitRiderReference(source);
  assert.equal(reference.name, "game-rabbit-rider-scale-reference");
  assert.equal(reference.userData.sourceModel, RABBIT_RIDER_URL);
  assert.equal(reference.userData.referenceSizeMeters, 2.4);
  assert.equal(reference.userData.referenceLengthMeters, 2.4);
  assert.equal(reference.userData.referenceMeasurement, "maximum-bounds-dimension");
  assert.equal(RABBIT_RIDER_REFERENCE_LENGTH_METERS, 2.4);
  assert.equal(RABBIT_RIDER_REFERENCE_SIZE, 2.4);
  const size = new THREE.Box3().setFromObject(reference).getSize(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 2.4) < 0.001);
});

test("uses the existing riding rabbit in the street, residential and hospital showrooms", async () => {
  const [city, hospital, streetPage, residentialPage, archive, forestScene, treeDemo, stoneDemo, shatterDemo, publicReference] = await Promise.all([
    readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/hospital-campus/HospitalCampusDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/city-street-furniture/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/residential-buildings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/shatter-morph-tree.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/stone-grind.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/shatter-morph.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/rabbit-scale-reference.js", import.meta.url), "utf8"),
  ]);
  for (const source of [city, hospital]) {
    assert.match(source, /prepareRabbitRiderReference/);
    assert.match(source, /RABBIT_RIDER_URL/);
    assert.match(source, /骑车兔子整体外廓约 2\.40 m/);
    assert.doesNotMatch(source, /buildLowPolyRabbitScaleReference/);
  }
  assert.match(city, /CATEGORY_RIDER_FOREGROUND/);
  assert.match(city, /street: new THREE\.Vector3\(0, 0\.46, 14\)/);
  assert.match(city, /residential: new THREE\.Vector3\(0, 0\.46, 68\)/);
  assert.match(city, /RESIDENTIAL_FOCUS_RIDER/);
  assert.match(city, /apartment: new THREE\.Vector3\(-28, 0\.46, 30\.5\)/);
  assert.match(city, /riderAnchor\.position\.copy\(next === "all"/);
  assert.match(hospital, /HOSPITAL_RIDER_FOREGROUND = new THREE\.Vector3\(0, 0\.46, 34\.5\)/);
  assert.doesNotMatch(hospital, /riderAnchor\.position\.copy\(RABBIT_REFERENCE_POSITION\[next\]\)/);
  assert.match(streetPage, /category="street"/);
  assert.match(residentialPage, /category="residential"/);
  assert.match(archive, /\/demos\/city-street-furniture/);
  assert.match(archive, /\/demos\/residential-buildings/);
  assert.doesNotMatch(archive, /#residential|#street/);
  assert.match(forestScene, /\/models\/rabbit-rider\.glb/);
  assert.match(forestScene, /private riderVisible = true/);
  for (const source of [treeDemo, stoneDemo, shatterDemo]) {
    assert.match(source, /loadRabbitRiderReference/);
    assert.match(source, /现有骑车兔子约 2\.40 m 参考/);
  }
  assert.match(publicReference, /\/models\/rabbit-rider\.glb/);
  assert.doesNotMatch(publicReference, /SphereGeometry|CapsuleGeometry/);
});

test("keeps buildings out of the street category and exposes them in residential", async () => {
  const city = await readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8");
  assert.match(city, /STREET_MODELS = new Set<ModelFocus>\(\["tree", "lamp", "signal", "phone", "truck", "hotdog", "newsstand", "planter"\]\)/);
  assert.match(city, /RESIDENTIAL_MODELS = new Set<ModelFocus>\(\["apartment", "villa", "highrise", "office", "standardGate", "premiumGate", "villaGate"\]\)/);
  assert.match(city, /category === "residential" \? buildLowPolyResidentialBuilding\(\) : null/);
  assert.match(city, /category === "residential" \? buildLowPolySmallVilla\(\) : null/);
  assert.match(city, /category === "street" \? buildLowPolyStreetLight\(\) : null/);
  assert.match(city, /visibleCards\.map/);
});
