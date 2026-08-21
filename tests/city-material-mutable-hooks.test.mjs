import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { buildLowPolyAmusementPark } from "../app/lib/map/amusementPark.ts";
import { buildLowPolyCityCenter } from "../app/lib/map/cityCenter.ts";
import { buildLowPolyCityPark } from "../app/lib/map/cityPark.ts";
import { buildLowPolyFireStation } from "../app/lib/map/fireStation.ts";
import { buildLowPolySchoolCampus } from "../app/lib/map/schoolCampus.ts";
import { buildLowPolyShoppingMall } from "../app/lib/map/shoppingMall.ts";
import { buildLowPolySportsCenter } from "../app/lib/map/sportsCenter.ts";
import { buildLowPolyTownCenter } from "../app/lib/map/townCenter.ts";

function collectMaterialBindings(root) {
  const materials = new Set();
  const bindings = new Map();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    bindings.set(object, object.material);
    entries.forEach((material) => materials.add(material));
  });
  return { materials, bindings };
}

function materialRenderState(material) {
  const state = {
    visible: material.visible,
    opacity: material.opacity,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
    side: material.side,
    blending: material.blending,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    toneMapped: material.toneMapped,
  };
  for (const key of ["roughness", "metalness", "emissiveIntensity", "clearcoat", "clearcoatRoughness", "transmission"]) {
    if (key in material) state[key] = material[key];
  }
  for (const key of ["color", "emissive", "specularColor", "attenuationColor"]) {
    if (material[key]?.isColor) state[key] = material[key].getHex();
  }
  return JSON.stringify(state);
}

function callNestedHook(root, hook, ...args) {
  root.traverse((object) => {
    if (object === root) return;
    const callback = object.userData[hook];
    if (typeof callback === "function") callback(...args);
  });
}

const factories = [
  {
    name: "amusement-park",
    build: buildLowPolyAmusementPark,
    batchCount: 126,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.update(1 / 60, 1.25);
    },
  },
  {
    name: "school-campus",
    build: buildLowPolySchoolCampus,
    batchCount: 89,
    mutate(root) { root.userData.setPowered(true); },
  },
  {
    name: "shopping-mall",
    build: buildLowPolyShoppingMall,
    batchCount: 268,
    mutate(root) { root.userData.setPowered(true); },
  },
  {
    name: "fire-station",
    build: buildLowPolyFireStation,
    batchCount: 83,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.setAlertActive(true);
      root.userData.update(0.3);
    },
  },
  {
    name: "city-park",
    build: buildLowPolyCityPark,
    batchCount: 179,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.update(1.25);
    },
  },
  {
    name: "sports-center",
    build: buildLowPolySportsCenter,
    batchCount: 122,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.setEventMode(true);
      root.userData.update(1.25);
    },
  },
  {
    name: "city-center",
    build: buildLowPolyCityCenter,
    batchCount: 171,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.setRushHour(true);
      callNestedHook(root, "setPhase", "yellow");
      root.userData.update(1.25);
    },
  },
  {
    name: "town-center",
    build: buildLowPolyTownCenter,
    batchCount: 149,
    mutate(root) {
      root.userData.setPowered(true);
      root.userData.setMarketDay(true);
      root.userData.update(1.25);
    },
  },
];

for (const factory of factories) {
  test(`${factory.name} explicitly marks every hook-mutated material`, () => {
    const root = factory.build();
    const { materials, bindings } = collectMaterialBindings(root);
    const before = new Map([...materials].map((material) => [material, materialRenderState(material)]));

    factory.mutate(root);

    const changed = [...materials].filter((material) => before.get(material) !== materialRenderState(material));
    assert.ok(changed.length > 0, `${factory.name} audit must exercise at least one material mutation`);
    assert.deepEqual(
      changed.filter((material) => material.userData.cityMutableMaterial !== true).map((material) => material.uuid),
      [],
      `${factory.name} has hook-mutated materials without cityMutableMaterial`,
    );
    for (const [object, material] of bindings) {
      assert.equal(object.material, material, `${factory.name}:${object.name} must retain its source material identity`);
    }
    assert.equal(root.userData.renderBatchCount, factory.batchCount,
      `${factory.name} supported-material proxy batch count changed without review`);
  });
}
