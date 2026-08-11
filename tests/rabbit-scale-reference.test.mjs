import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildLowPolyRabbitScaleReference } from "../app/lib/map/rabbitScaleReference.ts";

test("builds a locally generated 1.70 metre courier rabbit scale reference", () => {
  const rabbit = buildLowPolyRabbitScaleReference();
  assert.equal(rabbit.name, "low-poly-rabbit-scale-reference");
  assert.equal(rabbit.userData.generatedLocally, true);
  assert.equal(rabbit.userData.referenceHeightMeters, 1.7);
  assert.ok(rabbit.getObjectByName("rabbit-reference-body"));
  assert.ok(rabbit.getObjectByName("rabbit-reference-head"));
  assert.ok(rabbit.getObjectByName("rabbit-reference-satchel"));
  const size = new THREE.Box3().setFromObject(rabbit).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.y - 1.7) < 0.001, `expected 1.70 m, received ${size.y}`);
});

test("adds the rabbit reference to every independent model and effects scene", async () => {
  const [city, hospital, forestScene, treeDemo, stoneDemo, shatterDemo, publicRabbit] = await Promise.all([
    readFile(new URL("../app/demos/city-street-furniture/CityFurnitureDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/hospital-campus/HospitalCampusDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/shatter-morph-tree.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/stone-grind.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/shatter-morph.html", import.meta.url), "utf8"),
    readFile(new URL("../public/demos/rabbit-scale-reference.js", import.meta.url), "utf8"),
  ]);
  assert.match(city, /buildLowPolyRabbitScaleReference/);
  assert.match(city, /RABBIT_REFERENCE_POSITION/);
  assert.match(city, /兔子 1\.70 m 比例参考/);
  assert.match(hospital, /buildLowPolyRabbitScaleReference/);
  assert.match(hospital, /RABBIT_REFERENCE_POSITION/);
  assert.match(hospital, /兔子 1\.70 m 比例参考/);
  assert.match(forestScene, /\/models\/rabbit-rider\.glb/);
  assert.match(forestScene, /private riderVisible = true/);
  for (const source of [treeDemo, stoneDemo, shatterDemo]) {
    assert.match(source, /buildRabbitScaleReference/);
    assert.match(source, /兔子 1\.70 m 比例参考/);
  }
  assert.match(publicRabbit, /referenceHeightMeters: 1\.7/);
});
