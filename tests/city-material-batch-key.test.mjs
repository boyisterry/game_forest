import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  cityMaterialBatchKey,
  encodeCityMaterialBatchKey,
  observedPhysicalMaterialProperties,
  PHYSICAL_PROPERTY_MANIFEST,
} from "../app/lib/map/cityMaterialBatchKey.ts";
import { DEFAULT_CATALOG_FACTORY_ADAPTERS } from "../app/lib/map/cityCatalogSources.ts";
import { disposeSceneResources } from "../app/lib/map/cityResourceCache.ts";
import { createOptimizedStaticSceneBatch } from "../app/lib/map/sceneInstanceBatch.ts";

function legacyTemplateKey(material, includeDiffuseColor = true) {
  const textureKey = (texture) => texture?.uuid ?? "";
  return [
    material.type,
    includeDiffuseColor ? material.color?.getHexString() ?? "" : "<instance-color>",
    material.emissive?.getHexString() ?? "",
    material.emissiveIntensity ?? "",
    material.roughness ?? "",
    material.metalness ?? "",
    material.shininess ?? "",
    material.specular?.getHexString() ?? "",
    material.opacity,
    Number(material.transparent),
    material.alphaTest,
    material.side,
    Number(material.depthTest),
    Number(material.depthWrite),
    material.blending,
    Number(material.premultipliedAlpha),
    Number(material.vertexColors),
    Number(material.toneMapped),
    Number(material.flatShading),
    Number(material.wireframe),
    textureKey(material.map),
    textureKey(material.normalMap),
    textureKey(material.roughnessMap),
    textureKey(material.metalnessMap),
    textureKey(material.emissiveMap),
    textureKey(material.alphaMap),
    textureKey(material.aoMap),
    textureKey(material.lightMap),
    textureKey(material.envMap),
    material.customProgramCacheKey(),
  ].join("|");
}

test("physical manifest exactly covers the locked three.js public property surface", () => {
  assert.deepEqual([...PHYSICAL_PROPERTY_MANIFEST].sort(), observedPhysicalMaterialProperties());
});

test("standard material keys stay byte-identical while physical state is separated", () => {
  const standard = new THREE.MeshStandardMaterial({
    color: 0x7395aa,
    emissive: 0x112233,
    emissiveIntensity: 0.4,
    roughness: 0.37,
    metalness: 0.18,
  });
  assert.equal(encodeCityMaterialBatchKey(standard), legacyTemplateKey(standard));
  assert.equal(
    encodeCityMaterialBatchKey(standard, { includeDiffuseColor: false }),
    legacyTemplateKey(standard, false),
  );
  const clear = new THREE.MeshPhysicalMaterial({ transmission: 0.85, clearcoat: 0.2 });
  const solid = new THREE.MeshPhysicalMaterial({ transmission: 0.1, clearcoat: 0.2 });
  assert.notEqual(encodeCityMaterialBatchKey(clear), encodeCityMaterialBatchKey(solid));
  standard.dispose();
  clear.dispose();
  solid.dispose();
});

test("unknown classes and non-default unencoded physical state fall back to identity", () => {
  const unsupported = new THREE.ShaderMaterial();
  const first = new THREE.MeshPhysicalMaterial({ anisotropy: 0.4 });
  const second = new THREE.MeshPhysicalMaterial({ anisotropy: 0.4 });
  assert.equal(encodeCityMaterialBatchKey(unsupported), null);
  assert.equal(encodeCityMaterialBatchKey(first), null);
  assert.notEqual(cityMaterialBatchKey(first), cityMaterialBatchKey(second));
  unsupported.dispose();
  first.dispose();
  second.dispose();
});

test("physical differences remain separate static material buckets", () => {
  const root = new THREE.Group();
  const first = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhysicalMaterial({ transmission: 0.15 }),
  );
  const second = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhysicalMaterial({ transmission: 0.85 }),
  );
  second.position.x = 2;
  root.add(first, second);
  const proxy = createOptimizedStaticSceneBatch({ name: "physical-key-test", parent: root });
  assert.equal(proxy.userData.materialCount, 2);
  assert.equal(proxy.userData.batchCount, 0, "singletons stay authored instead of being falsely merged");
  assert.equal(first.visible, true);
  assert.equal(second.visible, true);
  disposeSceneResources(root);
});

test("all supported catalog factory materials are fully encoded", () => {
  for (const adapter of DEFAULT_CATALOG_FACTORY_ADAPTERS) {
    const root = adapter.build();
    try {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!["MeshBasicMaterial", "MeshPhongMaterial", "MeshStandardMaterial", "MeshPhysicalMaterial"]
            .includes(material.type)) continue;
          assert.notEqual(encodeCityMaterialBatchKey(material), null,
            `${adapter.factoryId}:${object.name}:${material.type} has non-default unencoded state`);
        }
      });
    } finally {
      disposeSceneResources(root);
    }
  }
});
