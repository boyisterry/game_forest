import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  buildLowPolyPremiumResidentialGate,
  buildLowPolyStandardResidentialGate,
  buildLowPolyVillaResidentialGate,
} from "../app/lib/map/residentialGates.ts";
import { getCatalogEntry } from "../app/lib/map/cityCatalog.ts";

const GATES = [
  ["standard", buildLowPolyStandardResidentialGate, 20, 6, 2, 1],
  ["premium", buildLowPolyPremiumResidentialGate, 24, 8, 2, 2],
  ["villa", buildLowPolyVillaResidentialGate, 18, 7, 1, 1],
];

function named(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => material.dispose?.());
  });
}

test("three residential gates reserve exact integer 1m grid footprints", () => {
  for (const [variant, build, width, depth, vehicleLanes, pedestrianLanes] of GATES) {
    const gate = build();
    gate.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gate);
    const size = bounds.getSize(new THREE.Vector3());
    assert.equal(gate.userData.modelType, `residential-gate-${variant}`);
    assert.equal(gate.userData.moduleGridMeters, 1);
    assert.deepEqual(gate.userData.footprintCells, { x: width, z: depth });
    assert.equal(gate.userData.frontDirection, "+z");
    assert.equal(gate.userData.vehicleLaneCount, vehicleLanes);
    assert.equal(gate.userData.pedestrianLaneCount, pedestrianLanes);
    assert.ok(size.x <= width + 1e-6, `${variant} exceeds its ${width}m footprint width`);
    assert.ok(size.z <= depth + 1e-6, `${variant} exceeds its ${depth}m footprint depth`);
    assert.ok(bounds.min.y >= -1e-6, `${variant} has geometry below the ground datum`);
    assert.equal(named(gate, `residential-gate-${variant}-grid-joint-x`).length, width - 1);
    assert.equal(named(gate, `residential-gate-${variant}-grid-joint-z`).length, depth - 1);
    const paving = gate.getObjectByName(`residential-gate-${variant}-modular-paving`);
    assert.equal(paving.userData.gridModuleMeters, 1);
    assert.deepEqual(paving.userData.footprintCells, { x: width, z: depth });

    const entry = getCatalogEntry(`residential-gate-${variant}`);
    assert.deepEqual(entry.footprintOverride, { w: width, d: depth });
    assert.deepEqual(entry.siteSizeMeters, { x: width, z: depth });
    assert.equal(entry.mapScale, 1);
    assert.equal(entry.snap, "cell");
    assert.equal(entry.reservation, "object");
    dispose(gate);
  }
});

test("standard gate provides separate guarded vehicle and pedestrian access", () => {
  const gate = buildLowPolyStandardResidentialGate();
  assert.equal(named(gate, "residential-gate-standard-vehicle-barrier-pivot").length, 2);
  assert.equal(named(gate, "residential-gate-standard-pedestrian-gate-pivot").length, 1);
  assert.ok(gate.getObjectByName("residential-gate-standard-security-booth"));
  assert.equal(named(gate, "residential-gate-standard-license-camera").length, 2);
  assert.ok(gate.getObjectByName("residential-gate-standard-intercom"));
  const pivot = gate.getObjectByName("residential-gate-standard-vehicle-barrier-pivot");
  const closed = pivot.rotation.z;
  gate.userData.setGateOpen(true);
  assert.equal(gate.userData.gateOpen, true);
  assert.notEqual(pivot.rotation.z, closed);
  gate.userData.setGateOpen(false);
  assert.ok(Math.abs(pivot.rotation.z - closed) < 1e-8);
  dispose(gate);
});

test("premium gate includes a concierge pavilion, landscape threshold and telescopic gates", () => {
  const gate = buildLowPolyPremiumResidentialGate();
  assert.ok(gate.getObjectByName("residential-gate-premium-concierge-pavilion"));
  assert.equal(named(gate, "residential-gate-premium-landscape-planter").length, 2);
  assert.equal(named(gate, "residential-gate-premium-reflecting-pool").length, 2);
  assert.equal(named(gate, "residential-gate-premium-sliding-gate-pivot").length, 2);
  assert.equal(named(gate, "residential-gate-premium-pedestrian-gate-pivot").length, 2);
  const pivot = named(gate, "residential-gate-premium-sliding-gate-pivot")[0];
  const closedX = pivot.position.x;
  gate.userData.setGateOpen(true);
  assert.notEqual(pivot.position.x, closedX);
  assert.equal(pivot.scale.x, 0.16);
  gate.updateMatrixWorld(true);
  const openBounds = new THREE.Box3().setFromObject(gate).getSize(new THREE.Vector3());
  assert.ok(openBounds.x <= 24 + 1e-6);
  assert.ok(openBounds.z <= 8 + 1e-6);
  gate.userData.setGateOpen(false);
  assert.equal(pivot.position.x, closedX);
  assert.equal(pivot.scale.x, 1);
  dispose(gate);
});

test("villa gate has supported masonry, guardhouse and detailed iron leaves", () => {
  const gate = buildLowPolyVillaResidentialGate();
  assert.ok(gate.getObjectByName("residential-gate-villa-guardhouse"));
  assert.ok(gate.getObjectByName("residential-gate-villa-guardhouse-hip-roof"));
  assert.equal(named(gate, "residential-gate-villa-stone-pier").length, 3);
  assert.equal(named(gate, "residential-gate-villa-swing-gate-pivot").length, 2);
  assert.equal(named(gate, "residential-gate-villa-gate-picket").length, 14);
  assert.equal(named(gate, "residential-gate-villa-lamp-housing").length, 3);
  gate.userData.setGateOpen(true);
  assert.ok(named(gate, "residential-gate-villa-swing-gate-pivot").every((pivot) => Math.abs(pivot.rotation.y) > 1));
  dispose(gate);
});

test("all three gates expose switchable night lighting without shadow-casting point lights", () => {
  for (const [, build] of GATES) {
    const gate = build();
    const lights = [];
    gate.traverse((object) => {
      if (object instanceof THREE.PointLight) lights.push(object);
    });
    assert.ok(lights.length >= 2);
    assert.ok(lights.every((light) => !light.visible && light.intensity === 0 && !light.castShadow));
    gate.userData.setPowered(true);
    assert.equal(gate.userData.powered, true);
    assert.ok(lights.every((light) => light.visible && light.intensity > 0));
    gate.userData.setPowered(false);
    assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
    dispose(gate);
  }
});
