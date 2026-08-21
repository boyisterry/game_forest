import type * as THREE from "three";

type BatchedInstanceInfo = Readonly<{
  active: boolean;
  visible: boolean;
  geometryIndex: number;
}>;

type BatchedGeometryInfo = Readonly<{
  active: boolean;
  start: number;
  count: number;
  indexCount: number;
  vertexCount: number;
}>;

type InspectedBatchedMesh = THREE.BatchedMesh & Readonly<{
  _instanceInfo: readonly BatchedInstanceInfo[];
  _geometryInfo: readonly BatchedGeometryInfo[];
}>;

export type CitySceneStructureMetrics = Readonly<{
  colorRanges: number;
  shadowRanges: number;
  triangles: number;
  shadowTriangles: number;
}>;

export type CitySceneStructureMetricOptions = Readonly<{
  batchedMultiDraw: boolean;
  shadowMapType?: "pcf" | "vsm";
}>;

function assertNonNegativeRangeValue(value: number, label: string, allowInfinity = false) {
  if (value < 0 || Number.isNaN(value) || (!allowInfinity && !Number.isFinite(value))) {
    throw new TypeError(`${label} must be a non-negative ${allowInfinity ? "number or Infinity" : "finite number"}`);
  }
}

function geometryElementCount(geometry: THREE.BufferGeometry) {
  const count = geometry.getIndex()?.count
    ?? geometry.getAttribute("position")?.count
    ?? 0;
  assertNonNegativeRangeValue(count, "geometry element count");
  return count;
}

export function clipToGeometryDrawRange(
  geometry: THREE.BufferGeometry,
  start: number,
  count: number,
): number {
  assertNonNegativeRangeValue(start, "render range start");
  assertNonNegativeRangeValue(count, "render range count", true);
  const rangeStart = geometry.drawRange.start;
  const rangeCount = geometry.drawRange.count;
  assertNonNegativeRangeValue(rangeStart, "geometry drawRange start");
  assertNonNegativeRangeValue(rangeCount, "geometry drawRange count", true);

  const rangeEnd = Number.isFinite(rangeCount) ? rangeStart + rangeCount : Infinity;
  const clippedStart = Math.max(0, start, rangeStart);
  const clippedEnd = Math.min(
    geometryElementCount(geometry),
    start + count,
    rangeEnd,
  );
  return Math.max(0, clippedEnd - clippedStart);
}

export function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent;
  }
  return true;
}

function assertBatchedInternals(mesh: THREE.BatchedMesh): InspectedBatchedMesh {
  const candidate = mesh as THREE.BatchedMesh & {
    _instanceInfo?: unknown;
    _geometryInfo?: unknown;
  };
  if (!Array.isArray(candidate._instanceInfo) || !Array.isArray(candidate._geometryInfo)) {
    throw new TypeError(
      "BatchedMesh private fields _instanceInfo/_geometryInfo are missing; update cityStructureMetrics for this three.js version",
    );
  }

  for (const [index, value] of candidate._geometryInfo.entries()) {
    if (!value || typeof value !== "object") {
      throw new TypeError(`BatchedMesh _geometryInfo[${index}] is not an object`);
    }
    const info = value as Partial<BatchedGeometryInfo>;
    if (typeof info.active !== "boolean") {
      throw new TypeError(`BatchedMesh _geometryInfo[${index}].active is not boolean`);
    }
    for (const field of ["start", "count", "vertexCount"] as const) {
      const fieldValue = info[field];
      if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
        throw new TypeError(`BatchedMesh _geometryInfo[${index}].${field} is invalid`);
      }
    }
    if (typeof info.indexCount !== "number"
      || !Number.isFinite(info.indexCount)
      || info.indexCount < -1) {
      throw new TypeError(`BatchedMesh _geometryInfo[${index}].indexCount is invalid`);
    }
  }

  for (const [index, value] of candidate._instanceInfo.entries()) {
    if (!value || typeof value !== "object") {
      throw new TypeError(`BatchedMesh _instanceInfo[${index}] is not an object`);
    }
    const info = value as Partial<BatchedInstanceInfo>;
    if (typeof info.active !== "boolean" || typeof info.visible !== "boolean") {
      throw new TypeError(`BatchedMesh _instanceInfo[${index}] active/visible state is invalid`);
    }
    if (!Number.isSafeInteger(info.geometryIndex) || (info.geometryIndex ?? -1) < 0) {
      throw new TypeError(`BatchedMesh _instanceInfo[${index}].geometryIndex is invalid`);
    }
    if (info.active) {
      const geometry = candidate._geometryInfo[info.geometryIndex!];
      if (!geometry || typeof geometry !== "object" || (geometry as Partial<BatchedGeometryInfo>).active !== true) {
        throw new TypeError(`BatchedMesh active instance ${index} references an inactive geometry`);
      }
    }
  }

  return candidate as InspectedBatchedMesh;
}

function visibleBatchedInstances(mesh: THREE.BatchedMesh) {
  return assertBatchedInternals(mesh)._instanceInfo.filter(
    (instance) => instance.active && instance.visible,
  );
}

export function effectiveRenderableInstanceCount(mesh: THREE.Mesh): number {
  if (!isEffectivelyVisible(mesh)) return 0;
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) {
    return visibleBatchedInstances(mesh as THREE.BatchedMesh).length;
  }
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const count = (mesh as THREE.InstancedMesh).count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError("InstancedMesh count must be a non-negative safe integer");
    }
    return count;
  }
  return 1;
}

function visibleMaterialGroupCount(mesh: THREE.Mesh) {
  const material = mesh.material;
  if (!Array.isArray(material)) return material.visible ? 1 : 0;
  if (mesh.geometry.groups.length === 0) return 0;
  return mesh.geometry.groups.reduce((count, group) => {
    const groupMaterial = material[group.materialIndex];
    return count + Number(Boolean(groupMaterial?.visible));
  }, 0);
}

export function effectiveRenderRangeCount(
  mesh: THREE.Mesh,
  batchedMultiDraw: boolean,
): number {
  const instances = effectiveRenderableInstanceCount(mesh);
  if (instances === 0) return 0;
  const materialRanges = visibleMaterialGroupCount(mesh);
  if (materialRanges === 0) return 0;
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) {
    if (Array.isArray(mesh.material)) {
      throw new TypeError("city BatchedMesh metrics require one material per pool");
    }
    return batchedMultiDraw ? 1 : instances;
  }
  return materialRanges;
}

function batchedTriangleCount(mesh: THREE.BatchedMesh) {
  if (Array.isArray(mesh.material)) {
    throw new TypeError("city BatchedMesh metrics require one material per pool");
  }
  const inspected = assertBatchedInternals(mesh);
  let triangles = 0;
  for (const instance of inspected._instanceInfo) {
    if (!instance.active || !instance.visible) continue;
    const geometry = inspected._geometryInfo[instance.geometryIndex];
    if (!geometry?.active) {
      throw new TypeError("BatchedMesh active instance references a missing geometry range");
    }
    triangles += geometry.count / 3;
  }
  return triangles;
}

export function effectiveTriangleCount(mesh: THREE.Mesh): number {
  const instances = effectiveRenderableInstanceCount(mesh);
  if (instances === 0) return 0;
  const material = mesh.material;
  if (!Array.isArray(material) && !material.visible) return 0;
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) {
    return batchedTriangleCount(mesh as THREE.BatchedMesh);
  }

  const geometry = mesh.geometry;
  if (Array.isArray(material)) {
    if (geometry.groups.length === 0) return 0;
    let triangles = 0;
    for (const group of geometry.groups) {
      const groupMaterial = material[group.materialIndex];
      if (!groupMaterial?.visible) continue;
      triangles += clipToGeometryDrawRange(geometry, group.start, group.count) / 3;
    }
    return triangles * instances;
  }

  return clipToGeometryDrawRange(
    geometry,
    0,
    geometryElementCount(geometry),
  ) / 3 * instances;
}

export function measureCitySceneStructure(
  root: THREE.Object3D,
  options: CitySceneStructureMetricOptions,
): CitySceneStructureMetrics {
  let colorRanges = 0;
  let shadowRanges = 0;
  let triangles = 0;
  let shadowTriangles = 0;
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const ranges = effectiveRenderRangeCount(mesh, options.batchedMultiDraw);
    const meshTriangles = effectiveTriangleCount(mesh);
    colorRanges += ranges;
    triangles += meshTriangles;
    const entersShadowPass = mesh.castShadow
      || (options.shadowMapType === "vsm" && mesh.receiveShadow);
    if (entersShadowPass) {
      shadowRanges += ranges;
      shadowTriangles += meshTriangles;
    }
  });
  return Object.freeze({ colorRanges, shadowRanges, triangles, shadowTriangles });
}
