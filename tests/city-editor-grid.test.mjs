import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createCityEditorGrid,
  shouldShowCityEditorGrid,
} from "../app/lib/map/cityEditorGrid.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  OCCUPANCY_TILES_X,
  OCCUPANCY_TILES_Z,
  TILE_SIZE_METERS,
} from "../app/lib/map/cityTiles.ts";

test("city editor grid is visible only for an enabled idle city document", () => {
  const base = {
    enabled: true,
    mapType: "city",
    driveMode: false,
    pendingDrive: false,
    hasDocument: true,
  };
  assert.equal(shouldShowCityEditorGrid(base), true);
  for (const input of [
    { ...base, enabled: false },
    { ...base, mapType: "forest" },
    { ...base, driveMode: true },
    { ...base, pendingDrive: true },
    { ...base, hasDocument: false },
  ]) assert.equal(shouldShowCityEditorGrid(input), false);
});

test("city editor grid covers the exact rectangular occupancy frame", () => {
  const grid = createCityEditorGrid();
  const bounds = new THREE.Box3().setFromObject(grid.mesh);
  assert.ok(Math.abs(bounds.min.x - CITY_TILE_ORIGIN_X) < 1e-9);
  assert.ok(Math.abs(bounds.max.x - (CITY_TILE_ORIGIN_X + OCCUPANCY_TILES_X * TILE_SIZE_METERS)) < 1e-9);
  assert.ok(Math.abs(bounds.min.z - CITY_TILE_ORIGIN_Z) < 1e-9);
  assert.ok(Math.abs(bounds.max.z - (CITY_TILE_ORIGIN_Z + OCCUPANCY_TILES_Z * TILE_SIZE_METERS)) < 1e-9);
  assert.ok(Math.abs(bounds.min.y - bounds.max.y) < 1e-9);
  assert.equal(grid.mesh.position.z, -110);
  grid.dispose();
});

test("grid shader exposes 1m, 10m, and 100m antialiased fade levels", () => {
  const grid = createCityEditorGrid();
  assert.ok(grid.mesh.material instanceof THREE.ShaderMaterial);
  const material = grid.mesh.material;
  assert.deepEqual(material.uniforms.uGridSteps.value.toArray(), [1, 10, 100]);
  assert.match(material.fragmentShader, /fwidth\s*\(/);
  assert.match(material.fragmentShader, /oneMetreFade/);
  assert.match(material.fragmentShader, /tenMetreFade/);
  assert.match(material.fragmentShader, /hundredMetreFade/);
  assert.match(material.fragmentShader, /boundaryDistance/);
  assert.match(material.fragmentShader, /xAxis/);
  assert.match(material.fragmentShader, /zAxis/);
  assert.equal(material.transparent, true);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.polygonOffset, true);
  assert.equal(grid.mesh.visible, false);
  grid.dispose();
});

test("hover state accepts only cells inside the editable frame", () => {
  const grid = createCityEditorGrid();
  const material = grid.mesh.material;
  assert.ok(material instanceof THREE.ShaderMaterial);

  grid.setHoveredCell({ i: 12, j: 34 });
  assert.equal(material.uniforms.uHasHoveredCell.value, 1);
  assert.deepEqual(material.uniforms.uHoveredCell.value.toArray(), [12, 34]);

  for (const cell of [
    null,
    { i: -1, j: 0 },
    { i: 0, j: OCCUPANCY_TILES_Z },
    { i: OCCUPANCY_TILES_X, j: 0 },
    { i: 1.5, j: 2 },
  ]) {
    grid.setHoveredCell(cell);
    assert.equal(material.uniforms.uHasHoveredCell.value, 0);
    assert.deepEqual(material.uniforms.uHoveredCell.value.toArray(), [-1, -1]);
  }
  grid.dispose();
});

test("city editor grid explicitly detaches and disposes owned GPU resources once", () => {
  const grid = createCityEditorGrid();
  const parent = new THREE.Group();
  parent.add(grid.mesh);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  grid.mesh.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  const material = grid.mesh.material;
  assert.ok(material instanceof THREE.Material);
  material.addEventListener("dispose", () => { materialDisposals += 1; });

  grid.dispose();
  grid.dispose();
  assert.equal(grid.mesh.parent, null);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});
