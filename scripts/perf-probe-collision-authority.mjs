import * as THREE from "three";

import {
  CITY_CATALOG,
  resolveMapCollisionRole,
  toTemplateBuildDescriptor,
} from "../app/lib/map/cityCatalog.ts";
import { createCatalogSourceRegistry } from "../app/lib/map/cityCatalogSources.ts";
import { compileCollisionSource } from "../app/lib/map/cityCollisionCompileCore.ts";
import { CompiledCityCollisionRuntime } from "../app/lib/map/cityCompiledCollisionRuntime.ts";
import { disposeSceneResources } from "../app/lib/map/cityResourceCache.ts";
import {
  isCollisionSourceEligible,
  packTemplateCollisionSource,
  packTemplateSurfaceCollisionSources,
} from "../app/lib/map/cityTemplateCollisionSource.ts";

const STATIC_FALSE_HOOKS = [
  "setPowered",
  "setLights",
  "setWaterMotionEnabled",
  "setAlertActive",
  "setServingOpen",
  "setOpen",
  "setDoorOpen",
  "setApparatusDoorsOpen",
  "setResponseGatesOpen",
  "setVisitorGateOpen",
  "setServiceGateOpen",
];

function prepareLikeCanonicalSource(root, entry) {
  root.traverse((object) => {
    for (const name of STATIC_FALSE_HOOKS) {
      const hook = object.userData[name];
      if (typeof hook === "function") hook(false);
    }
    if (typeof object.userData.setPhase === "function") object.userData.setPhase("red");
  });
  root.scale.multiplyScalar(entry.mapScale);
  const hiddenLayers = entry.mapLod.mode === "tagged-exterior"
    ? new Set(entry.mapLod.hideLayers)
    : new Set();
  const nonCollidingOverhangNames = new Set(entry.nonCollidingOverhangNames ?? []);
  root.traverse((object) => {
    if (nonCollidingOverhangNames.has(object.name)) object.userData.mapCollisionRole = "ignore";
    if (hiddenLayers.has(object.userData.mapLayer)) object.visible = false;
  });
  return hiddenLayers;
}

function effectivelyVisible(object, root) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}

function sourceTriangleCount(mesh) {
  const positions = mesh.geometry.getAttribute("position");
  if (!positions) return 0;
  const perInstance = Math.floor((mesh.geometry.getIndex()?.count ?? positions.count) / 3);
  return perInstance * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
}

function ancestorState(object, root, hiddenLayers) {
  let renderProxy = false;
  let renderProxySource = false;
  let hiddenMapLayer = false;
  for (let node = object; node; node = node.parent) {
    renderProxy ||= node.userData.renderProxy === true;
    renderProxySource ||= typeof node.userData.renderProxySource === "string";
    hiddenMapLayer ||= hiddenLayers.has(node.userData.mapLayer);
    if (node === root) break;
  }
  return { renderProxy, renderProxySource, hiddenMapLayer };
}

function disposeTree(root) {
  disposeSceneResources(root);
  root.clear();
}

function equalTypedArray(left, right) {
  return left.constructor === right.constructor
    && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

function equalPackedTriangles(left, right) {
  return equalTypedArray(left.positions, right.positions)
    && equalTypedArray(left.indices, right.indices)
    && equalTypedArray(left.triangleRoles, right.triangleRoles)
    && equalTypedArray(left.triangleProfileIndices, right.triangleProfileIndices)
    && equalTypedArray(left.triangleSurfaceKeys, right.triangleSurfaceKeys)
    && equalTypedArray(left.sourceTriangleIds, right.sourceTriangleIds);
}

function equalSurfacePacks(left, right) {
  return left.length === right.length && left.every((source, index) => {
    const candidate = right[index];
    return source.chunkKey === candidate.chunkKey
      && source.sourceId === candidate.sourceId
      && equalPackedTriangles(source.triangles, candidate.triangles);
  });
}

function sameSweepHit(left, right) {
  if (left === null || right === null) return left === right;
  return Math.abs(left.toi - right.toi) <= 1e-9
    && Math.abs(left.normalX - right.normalX) <= 1e-9
    && Math.abs(left.normalZ - right.normalZ) <= 1e-9
    && left.ownerId === right.ownerId;
}

async function compareRepresentativeSweep(prePacked, postPacked) {
  const [preCompiled, postCompiled] = await Promise.all([
    compileCollisionSource(prePacked),
    compileCollisionSource(postPacked),
  ]);
  const makeRuntime = (source) => new CompiledCityCollisionRuntime([{
    ownerId: "collision-authority-probe-owner",
    ownerGeneration: 1,
    source,
    transform: { x: 0, y: 0, z: 0, yawRadians: 0, uniformScale: 1 },
  }]);
  const preRuntime = makeRuntime(preCompiled);
  const postRuntime = makeRuntime(postCompiled);
  try {
    const positions = postPacked.triangles.positions;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      minX = Math.min(minX, positions[index]);
      maxX = Math.max(maxX, positions[index]);
      minZ = Math.min(minZ, positions[index + 2]);
      maxZ = Math.max(maxZ, positions[index + 2]);
    }
    const requests = [];
    for (let step = 1; step < 20; step += 1) {
      const fraction = step / 20;
      requests.push({
        startX: minX - 2,
        startZ: minZ + (maxZ - minZ) * fraction,
        deltaX: maxX - minX + 4,
        deltaZ: 0,
        minY: 0,
        maxY: 2.4,
        radius: 0.25,
      });
      requests.push({
        startX: minX + (maxX - minX) * fraction,
        startZ: minZ - 2,
        deltaX: 0,
        deltaZ: maxZ - minZ + 4,
        minY: 0,
        maxY: 2.4,
        radius: 0.25,
      });
    }
    for (const request of requests) {
      const preHit = preRuntime.querySweep(request).hit;
      const postHit = postRuntime.querySweep(request).hit;
      if (!sameSweepHit(preHit, postHit)) return false;
      if (preHit) return true;
    }
    return false;
  } finally {
    preRuntime.dispose();
    postRuntime.dispose();
    preCompiled.fallback?.geometry.dispose();
    postCompiled.fallback?.geometry.dispose();
  }
}

const entries = CITY_CATALOG.filter((entry) => entry.source.kind === "factory");
const registry = createCatalogSourceRegistry();
const snapshot = registry.captureSnapshot();
const rows = [];

try {
  for (const entry of entries) {
    const postOwned = snapshot.value.createOwnedSource(entry.source, { optimizeStatic: true });
    if (!postOwned) throw new Error(`missing owned source for ${entry.id}`);
    const { group: root } = postOwned;
    let usesRenderProxyHelper = false;
    root.traverse((object) => {
      usesRenderProxyHelper ||= object.userData.optimizationEnabled === true;
    });
    if (!usesRenderProxyHelper) {
      disposeTree(root);
      continue;
    }
    const preOwned = snapshot.value.createOwnedSource(entry.source, { optimizeStatic: false });
    if (!preOwned) throw new Error(`missing pre-batch source for ${entry.id}`);
    const preRoot = preOwned.group;
    const hiddenLayers = prepareLikeCanonicalSource(root, entry);
    prepareLikeCanonicalSource(preRoot, entry);
    root.updateMatrixWorld(true);
    const descriptor = toTemplateBuildDescriptor(entry);
    const audit = { autoSolid: [] };
    const counts = {
      legacySolidTriangles: 0,
      legacyRideableTriangles: 0,
      authoritySolidTriangles: 0,
      authorityRideableTriangles: 0,
      restoredSolidTriangles: 0,
      restoredRideableTriangles: 0,
      restoredMeshes: 0,
      unmarkedHiddenCollisionMeshes: 0,
      unmarkedHiddenCollisionNames: [],
      proxyCollisionMeshes: 0,
    };
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const resolution = resolveMapCollisionRole(
        object,
        descriptor.collisionMeshes,
        descriptor.surfaceProfiles,
        audit,
      );
      if (resolution.role === "ignore") return;
      const triangles = sourceTriangleCount(object);
      const legacyEligible = effectivelyVisible(object, root);
      const authorityEligible = isCollisionSourceEligible(object, root, hiddenLayers);
      const state = ancestorState(object, root, hiddenLayers);
      const suffix = resolution.role === "solid" ? "SolidTriangles" : "RideableTriangles";
      if (legacyEligible) counts[`legacy${suffix}`] += triangles;
      if (authorityEligible) counts[`authority${suffix}`] += triangles;
      if (authorityEligible && !legacyEligible) {
        counts[`restored${suffix}`] += triangles;
        counts.restoredMeshes += 1;
      }
      if (state.renderProxy) counts.proxyCollisionMeshes += 1;
      if (!legacyEligible && !state.renderProxy && !state.hiddenMapLayer && !state.renderProxySource) {
        counts.unmarkedHiddenCollisionMeshes += 1;
        counts.unmarkedHiddenCollisionNames.push(object.name || "<unnamed>");
      }
    });

    const packedSolid = await packTemplateCollisionSource(root, descriptor, {
      sourceId: `collision-authority-probe:${entry.id}`,
      generation: 1,
      resolvedHeightScale: entry.defaultHeightScale,
      yieldEveryMeshes: 100_000,
    });
    const packedSurfaces = await packTemplateSurfaceCollisionSources(root, descriptor, {
      sourceId: `collision-authority-probe:${entry.id}`,
      generation: 1,
      resolvedHeightScale: entry.defaultHeightScale,
      yieldEveryMeshes: 100_000,
    });
    const prePackedSolid = await packTemplateCollisionSource(preRoot, descriptor, {
      sourceId: `collision-authority-probe:${entry.id}`,
      generation: 1,
      resolvedHeightScale: entry.defaultHeightScale,
      yieldEveryMeshes: 100_000,
    });
    const prePackedSurfaces = await packTemplateSurfaceCollisionSources(preRoot, descriptor, {
      sourceId: `collision-authority-probe:${entry.id}`,
      generation: 1,
      resolvedHeightScale: entry.defaultHeightScale,
      yieldEveryMeshes: 100_000,
    });
    const solidPrePostExact = equalPackedTriangles(
      packedSolid.triangles,
      prePackedSolid.triangles,
    );
    const surfacePrePostExact = equalSurfacePacks(packedSurfaces, prePackedSurfaces);
    const representativeSweepExact = await compareRepresentativeSweep(
      prePackedSolid,
      packedSolid,
    );
    if (!solidPrePostExact || !surfacePrePostExact || !representativeSweepExact) {
      throw new Error(`${entry.id} collision pack differs with static optimization enabled`);
    }
    rows.push({
      catalogId: entry.id,
      factoryId: entry.source.factoryId,
      ...counts,
      packedSolidTriangles: packedSolid.triangles.triangleRoles.length,
      packedSurfaceTriangles: packedSurfaces.reduce(
        (sum, source) => sum + source.triangles.triangleRoles.length,
        0,
      ),
      solidPrePostExact,
      surfacePrePostExact,
      representativeSweepExact,
    });
    disposeTree(root);
    disposeTree(preRoot);
    postOwned.resourceCacheLease.release();
    preOwned.resourceCacheLease.release();
  }
} finally {
  snapshot.release();
  await registry.retire();
}

console.log(JSON.stringify({
  factoryCount: rows.length,
  totals: rows.reduce((totals, row) => {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") totals[key] = (totals[key] ?? 0) + value;
    }
    return totals;
  }, {}),
  rows,
}, null, 2));
