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
  assert.match(hospital, /HOSPITAL_RIDER_FOREGROUND = new THREE\.Vector3\(0, 0\.46, 34\.5\)/);
  assert.doesNotMatch(city, /riderAnchor\.position\.copy\(next/);
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
