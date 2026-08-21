import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  clipToGeometryDrawRange,
  effectiveRenderableInstanceCount,
  effectiveRenderRangeCount,
  effectiveTriangleCount,
  isEffectivelyVisible,
  measureCitySceneStructure,
} from "../app/lib/map/cityStructureMetrics.ts";

function nonIndexedTriangles(count) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 9), 3));
  return geometry;
}

test("draw-range clipping matches renderer bounds for finite buffers and Infinity", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(300), 3));
  try {
    assert.equal(clipToGeometryDrawRange(geometry, 0, 100), 100);
    geometry.setDrawRange(10, Infinity);
    assert.equal(clipToGeometryDrawRange(geometry, 0, 100), 90);
    geometry.setDrawRange(10, 20);
    assert.equal(clipToGeometryDrawRange(geometry, 0, 100), 20);
    geometry.setDrawRange(0, Infinity);
    assert.equal(clipToGeometryDrawRange(geometry, 90, 40), 10);
    geometry.setDrawRange(80, 10);
    assert.equal(clipToGeometryDrawRange(geometry, 0, 40), 0);
    assert.throws(() => clipToGeometryDrawRange(geometry, -1, 3), /non-negative/);
  } finally {
    geometry.dispose();
  }
});

test("mesh metrics honor ancestor, material, group, drawRange, and instance visibility", () => {
  const geometry = nonIndexedTriangles(4);
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 6, 1);
  geometry.setDrawRange(3, 6);
  const visibleMaterial = new THREE.MeshBasicMaterial();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(geometry, [visibleMaterial, hiddenMaterial]);
  const parent = new THREE.Group();
  parent.add(mesh);
  try {
    assert.equal(isEffectivelyVisible(mesh), true);
    assert.equal(effectiveRenderableInstanceCount(mesh), 1);
    assert.equal(effectiveRenderRangeCount(mesh, true), 1);
    assert.equal(effectiveTriangleCount(mesh), 1);
    parent.visible = false;
    assert.equal(isEffectivelyVisible(mesh), false);
    assert.equal(effectiveRenderRangeCount(mesh, true), 0);
    assert.equal(effectiveTriangleCount(mesh), 0);
    parent.visible = true;

    const emptyGroupGeometry = nonIndexedTriangles(1);
    const emptyGroupMesh = new THREE.Mesh(emptyGroupGeometry, [visibleMaterial]);
    try {
      assert.equal(effectiveRenderRangeCount(emptyGroupMesh, true), 0);
      assert.equal(effectiveTriangleCount(emptyGroupMesh), 0);
    } finally {
      emptyGroupGeometry.dispose();
    }

    const instanced = new THREE.InstancedMesh(nonIndexedTriangles(1), visibleMaterial, 2);
    try {
      instanced.count = 0;
      assert.equal(effectiveRenderableInstanceCount(instanced), 0);
      assert.equal(effectiveRenderRangeCount(instanced, true), 0);
      assert.equal(effectiveTriangleCount(instanced), 0);
    } finally {
      instanced.geometry.dispose();
      instanced.dispose();
    }
  } finally {
    geometry.dispose();
    visibleMaterial.dispose();
    hiddenMaterial.dispose();
  }
});

test("BatchedMesh metrics count active visible geometry ranges instead of buffer capacity", () => {
  const material = new THREE.MeshBasicMaterial();
  const oneTriangle = nonIndexedTriangles(1);
  const twoTriangles = nonIndexedTriangles(2);
  const mesh = new THREE.BatchedMesh(4, 32, 0, material);
  try {
    const oneGeometryId = mesh.addGeometry(oneTriangle);
    const twoGeometryId = mesh.addGeometry(twoTriangles);
    const oneInstanceId = mesh.addInstance(oneGeometryId);
    const twoInstanceId = mesh.addInstance(twoGeometryId);
    assert.equal(effectiveRenderableInstanceCount(mesh), 2);
    assert.equal(effectiveRenderRangeCount(mesh, true), 1);
    assert.equal(effectiveRenderRangeCount(mesh, false), 2);
    assert.equal(effectiveTriangleCount(mesh), 3);

    mesh.setVisibleAt(twoInstanceId, false);
    assert.equal(effectiveRenderableInstanceCount(mesh), 1);
    assert.equal(effectiveRenderRangeCount(mesh, false), 1);
    assert.equal(effectiveTriangleCount(mesh), 1);

    mesh.deleteInstance(oneInstanceId);
    assert.equal(effectiveRenderableInstanceCount(mesh), 0);
    assert.equal(effectiveRenderRangeCount(mesh, true), 0);
    assert.equal(effectiveTriangleCount(mesh), 0);

    const internals = mesh;
    const saved = internals._instanceInfo;
    internals._instanceInfo = undefined;
    assert.throws(
      () => effectiveTriangleCount(mesh),
      /private fields _instanceInfo\/_geometryInfo are missing/,
    );
    internals._instanceInfo = saved;
  } finally {
    mesh.dispose();
    oneTriangle.dispose();
    twoTriangles.dispose();
    material.dispose();
  }
});

test("scene metrics keep PCF and VSM shadow eligibility explicit", () => {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  const caster = new THREE.Mesh(nonIndexedTriangles(2), material);
  caster.castShadow = true;
  const receiver = new THREE.Mesh(nonIndexedTriangles(1), material);
  receiver.receiveShadow = true;
  root.add(caster, receiver);
  try {
    assert.deepEqual(measureCitySceneStructure(root, {
      batchedMultiDraw: true,
      shadowMapType: "pcf",
    }), {
      colorRanges: 2,
      shadowRanges: 1,
      triangles: 3,
      shadowTriangles: 2,
    });
    assert.deepEqual(measureCitySceneStructure(root, {
      batchedMultiDraw: true,
      shadowMapType: "vsm",
    }), {
      colorRanges: 2,
      shadowRanges: 2,
      triangles: 3,
      shadowTriangles: 3,
    });
  } finally {
    caster.geometry.dispose();
    receiver.geometry.dispose();
    material.dispose();
  }
});
