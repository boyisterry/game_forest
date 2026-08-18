import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";

import { createAsyncResourceOwner } from "../app/lib/map/resourceLease.ts";
import { disposeRiderResources } from "../app/lib/map/riderResources.ts";

test("resource owner waits for every lease and disposes exactly once", async () => {
  let disposeCount = 0;
  const resource = { id: 1 };
  const owner = createAsyncResourceOwner(async () => resource, (value) => {
    assert.equal(value, resource);
    disposeCount += 1;
  });
  const first = await owner.borrow();
  const second = await owner.borrow();
  assert.notEqual(first.release, second.release);
  assert.equal(owner.borrowerCount, 2);
  const retired = owner.retire();
  let retirementSettled = false;
  void retired.then(() => { retirementSettled = true; });
  await Promise.resolve();
  assert.equal(retirementSettled, false);
  assert.rejects(() => owner.borrow(), /retired/);
  first.release();
  first.release();
  assert.equal(owner.borrowerCount, 1);
  assert.equal(disposeCount, 0);
  second.release();
  await retired;
  assert.equal(disposeCount, 1);
});

test("retirement during load prevents a late borrower from reviving the resource", async () => {
  let resolveLoad;
  let disposeCount = 0;
  const owner = createAsyncResourceOwner(
    () => new Promise((resolve) => { resolveLoad = resolve; }),
    () => { disposeCount += 1; },
  );
  const pendingBorrow = owner.borrow();
  const retired = owner.retire();
  resolveLoad({ id: "late" });
  await assert.rejects(pendingBorrow, /retired while loading/);
  await retired;
  assert.equal(disposeCount, 1);
});

test("loader failure retires without calling dispose", async () => {
  let disposeCount = 0;
  const owner = createAsyncResourceOwner(
    async () => { throw new Error("missing pack"); },
    () => { disposeCount += 1; },
  );
  await assert.rejects(() => owner.borrow(), /missing pack/);
  await owner.retire();
  assert.equal(disposeCount, 0);
});

test("rider GLB resources are disposed once even when meshes share them", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));

  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  material.addEventListener("dispose", () => { materialDisposals += 1; });
  texture.addEventListener("dispose", () => { textureDisposals += 1; });

  disposeRiderResources(root);
  assert.equal(root.children.length, 0);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(textureDisposals, 1);

  disposeRiderResources(root);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(textureDisposals, 1);
});

test("ForestScene retires both late and mounted rider assets", async () => {
  const source = await readFile(new URL("../app/lib/map/ForestScene.ts", import.meta.url), "utf8");
  assert.match(source, /if \(this\.disposed\) \{\s*disposeRiderResources\(model\);\s*return;/);
  assert.match(source, /this\.disposeWorld\(\);\s*if \(this\.rider\) \{\s*disposeRiderResources\(this\.rider\);\s*this\.rider = null;/);
});
