import * as THREE from "three";
import { getCatalogEntry } from "./cityCatalog.ts";
import type { GridPlacement } from "./cityDocument.ts";
import type { CityTemplateCache, VisualTemplateHandle } from "./cityTemplateCache.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  TILE_SIZE_METERS,
} from "./cityTiles.ts";
import type { ResourceLease } from "./resourceLease.ts";

export type CityPlacementPreviewInput = Readonly<{
  catalogId: string;
  i: number;
  j: number;
  yaw: GridPlacement["yaw"];
  valid: boolean;
}>;

export type CityPlacementPreview = Readonly<{
  root: THREE.Group;
  set: (input: CityPlacementPreviewInput | null) => void;
  getState: () => (CityPlacementPreviewInput & Readonly<{ visible: true }>) | Readonly<{ visible: false }>;
  dispose: () => void;
}>;

const VALID_COLOR = new THREE.Color(0x4fcf78);
const INVALID_COLOR = new THREE.Color(0xef5b56);

function baseFootprint(catalogId: string) {
  const entry = getCatalogEntry(catalogId);
  if (!entry) throw new TypeError(`unknown city placement preview catalog: ${catalogId}`);
  return entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
}

function footprintGridGeometry(width: number, depth: number) {
  const positions: number[] = [];
  for (let x = -width * 0.5; x <= width * 0.5 + 1e-7; x += 1) {
    positions.push(x, 0.055, -depth * 0.5, x, 0.055, depth * 0.5);
  }
  for (let z = -depth * 0.5; z <= depth * 0.5 + 1e-7; z += 1) {
    positions.push(-width * 0.5, 0.055, z, width * 0.5, 0.055, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function createCityPlacementPreview(cache: CityTemplateCache): CityPlacementPreview {
  const root = new THREE.Group();
  root.name = "city-placement-preview";
  root.visible = false;
  root.renderOrder = 50;
  let templateLease: ResourceLease<VisualTemplateHandle> | null = null;
  let catalogId: string | null = null;
  let modelMaterials: THREE.MeshBasicMaterial[] = [];
  let footprintMaterial: THREE.MeshBasicMaterial | null = null;
  let gridMaterial: THREE.LineBasicMaterial | null = null;
  let ownedGeometries: THREE.BufferGeometry[] = [];
  let currentInput: CityPlacementPreviewInput | null = null;
  let disposed = false;

  const clear = () => {
    root.clear();
    templateLease?.release();
    templateLease = null;
    for (const material of modelMaterials) material.dispose();
    modelMaterials = [];
    footprintMaterial?.dispose();
    footprintMaterial = null;
    gridMaterial?.dispose();
    gridMaterial = null;
    for (const geometry of ownedGeometries) geometry.dispose();
    ownedGeometries = [];
    catalogId = null;
    currentInput = null;
    root.visible = false;
  };

  const build = (nextCatalogId: string) => {
    clear();
    const entry = getCatalogEntry(nextCatalogId);
    if (!entry) throw new TypeError(`unknown city placement preview catalog: ${nextCatalogId}`);
    const footprint = baseFootprint(nextCatalogId);
    const model = new THREE.Group();
    model.name = "city-placement-preview-model";
    model.scale.y = entry.defaultHeightScale;
    templateLease = cache.getVisualTemplate({ kind: "catalog", catalogId: nextCatalogId });
    const definition = cache.getBatchTemplateDefinition(templateLease.value);
    for (const slot of definition?.slots ?? []) {
      const material = new THREE.MeshBasicMaterial({
        color: VALID_COLOR,
        transparent: true,
        opacity: 0.28,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(slot.nearGeometry, material);
      mesh.name = `city-placement-preview-${slot.slotId}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 51;
      model.add(mesh);
      modelMaterials.push(material);
    }

    const fillGeometry = new THREE.PlaneGeometry(footprint.w, footprint.d);
    const gridGeometry = footprintGridGeometry(footprint.w, footprint.d);
    ownedGeometries.push(fillGeometry, gridGeometry);
    footprintMaterial = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.16,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const fill = new THREE.Mesh(fillGeometry, footprintMaterial);
    fill.name = "city-placement-preview-footprint";
    fill.rotation.x = -Math.PI * 0.5;
    fill.position.y = 0.035;
    fill.renderOrder = 49;
    gridMaterial = new THREE.LineBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.82,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    grid.name = "city-placement-preview-grid";
    grid.renderOrder = 52;
    root.add(fill, grid, model);
    catalogId = nextCatalogId;
  };

  const set = (input: CityPlacementPreviewInput | null) => {
    if (disposed) return;
    if (!input) {
      currentInput = null;
      root.visible = false;
      return;
    }
    if (catalogId !== input.catalogId) build(input.catalogId);
    const footprint = baseFootprint(input.catalogId);
    const rotated = input.yaw === 90 || input.yaw === 270;
    const width = rotated ? footprint.d : footprint.w;
    const depth = rotated ? footprint.w : footprint.d;
    root.position.set(
      CITY_TILE_ORIGIN_X + (input.i + width * 0.5) * TILE_SIZE_METERS,
      0,
      CITY_TILE_ORIGIN_Z + (input.j + depth * 0.5) * TILE_SIZE_METERS,
    );
    root.rotation.set(0, THREE.MathUtils.degToRad(input.yaw), 0);
    const color = input.valid ? VALID_COLOR : INVALID_COLOR;
    for (const material of modelMaterials) material.color.copy(color);
    footprintMaterial?.color.copy(color);
    gridMaterial?.color.copy(color);
    root.visible = true;
    currentInput = Object.freeze({ ...input });
    root.updateMatrixWorld(true);
  };

  const getState = () => currentInput
    ? Object.freeze({ ...currentInput, visible: true as const })
    : Object.freeze({ visible: false as const });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clear();
    root.removeFromParent();
  };

  return Object.freeze({ root, set, getState, dispose });
}
