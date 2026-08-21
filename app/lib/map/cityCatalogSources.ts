import * as THREE from "three";
import {
  CITY_CATALOG,
  DERIVED_TEMPLATE_DESCRIPTORS,
  getCatalogEntry,
  getDerivedTemplateDescriptor,
  validateCityCatalog,
  type CatalogEntrySnapshot,
  type CatalogSource,
  type DerivedTemplateDescriptorSnapshot,
} from "./cityCatalog.ts";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHighRiseResidential,
  buildLowPolyHotDogKiosk,
  buildLowPolyNewsstand,
  buildLowPolyOfficeCampus,
  buildLowPolyParkStreetLight,
  buildLowPolyPhoneBooth,
  buildLowPolyResidentialBuilding,
  buildLowPolyRoadsidePlanter,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
} from "./cityFurniture.ts";
import { buildLowPolyHospitalCampus } from "./hospitalCampus.ts";
import { buildLowPolyAmusementPark } from "./amusementPark.ts";
import { buildLowPolySchoolCampus } from "./schoolCampus.ts";
import { buildLowPolyShoppingMall } from "./shoppingMall.ts";
import { buildLowPolyResidentialCommunity } from "./residentialCommunity.ts";
import { buildLowPolyFireStation } from "./fireStation.ts";
import { buildLowPolyCityPark } from "./cityPark.ts";
import { buildLowPolySportsCenter } from "./sportsCenter.ts";
import { buildLowPolyCityCenter } from "./cityCenter.ts";
import { buildLowPolyTownCenter } from "./townCenter.ts";
import { buildLowPolyStandardResidentialCommunity } from "./standardResidentialCommunity.ts";
import { buildLowPolyLuxuryVillaCommunity } from "./luxuryVillaCommunity.ts";
import {
  buildLowPolyFoodProcessingPlant,
  buildLowPolyMechanizedFactory,
  buildLowPolyTechnologyPark,
} from "./modernIndustrialDistricts.ts";
import {
  buildLowPolyPremiumResidentialGate,
  buildLowPolyStandardResidentialGate,
  buildLowPolyVillaResidentialGate,
} from "./residentialGates.ts";
import { applyReviewedCityMapLodTags } from "./cityMapLodTags.ts";
import {
  acquireResourceCacheLease,
  disposeSceneResources,
  internScenePrimitiveGeometries,
  retireResourceCacheGeneration,
  type ResourceCacheLease,
} from "./cityResourceCache.ts";

export type CatalogFactoryAdapter = Readonly<{
  factoryId: string;
  build: (options?: CatalogSourceBuildOptions) => THREE.Group;
}>;

export type CatalogSourceBuildOptions = Readonly<{
  /** Profiling/test control; production catalog construction keeps the default enabled path. */
  optimizeStatic?: boolean;
}>;

export type CatalogModelPackView = Readonly<{
  all: readonly Readonly<{
    id: string;
    wood: THREE.BufferGeometry;
    leaves: THREE.BufferGeometry;
    showroomWood?: THREE.BufferGeometry;
  }>[];
}>;

export type OwnedCatalogSource = Readonly<{
  group: THREE.Group;
  sourceIdentity: string;
  resourceCacheLease: ResourceCacheLease;
}>;

export type CatalogSourceSnapshotView = Readonly<{
  generation: number;
  catalogEntries: readonly CatalogEntrySnapshot[];
  derivedTemplates: readonly DerivedTemplateDescriptorSnapshot[];
  getCatalogEntry: (id: string) => CatalogEntrySnapshot | undefined;
  getDerivedTemplateDescriptor: (id: string) => DerivedTemplateDescriptorSnapshot | undefined;
  getFactoryAdapter: (factoryId: string) => CatalogFactoryAdapter | undefined;
  createOwnedSource: (
    source: CatalogSource,
    options?: CatalogSourceBuildOptions,
  ) => OwnedCatalogSource | undefined;
}>;

export type CatalogSourceSnapshotLease = Readonly<{
  value: CatalogSourceSnapshotView;
  release: () => void;
}>;

export type CatalogSourceRegistry = Readonly<{
  captureSnapshot: () => CatalogSourceSnapshotLease;
  replaceCatalog: (
    entries: readonly CatalogEntrySnapshot[],
    derivedTemplates: readonly DerivedTemplateDescriptorSnapshot[],
  ) => void;
  replaceFactory: (factoryId: string, build: () => THREE.Group) => void;
  replaceModelPack: (pack: CatalogModelPackView | null) => void;
  retire: () => Promise<void>;
}>;

const buildTrafficLightLeftArm = () => buildLowPolyTrafficLight(-1);

export const DEFAULT_CATALOG_FACTORY_ADAPTERS: readonly CatalogFactoryAdapter[] = Object.freeze([
  Object.freeze({ factoryId: "street-light", build: buildLowPolyStreetLight }),
  Object.freeze({ factoryId: "park-street-light", build: buildLowPolyParkStreetLight }),
  Object.freeze({ factoryId: "traffic-light", build: buildTrafficLightLeftArm }),
  Object.freeze({ factoryId: "food-truck", build: buildLowPolyFoodTruck }),
  Object.freeze({ factoryId: "hot-dog-kiosk", build: buildLowPolyHotDogKiosk }),
  Object.freeze({ factoryId: "newsstand", build: buildLowPolyNewsstand }),
  Object.freeze({ factoryId: "phone-booth", build: buildLowPolyPhoneBooth }),
  Object.freeze({ factoryId: "roadside-planter", build: buildLowPolyRoadsidePlanter }),
  Object.freeze({ factoryId: "residential-building", build: buildLowPolyResidentialBuilding }),
  Object.freeze({ factoryId: "high-rise-residential", build: buildLowPolyHighRiseResidential }),
  Object.freeze({ factoryId: "small-villa", build: buildLowPolySmallVilla }),
  Object.freeze({ factoryId: "residential-gate-standard", build: buildLowPolyStandardResidentialGate }),
  Object.freeze({ factoryId: "residential-gate-premium", build: buildLowPolyPremiumResidentialGate }),
  Object.freeze({ factoryId: "residential-gate-villa", build: buildLowPolyVillaResidentialGate }),
  Object.freeze({ factoryId: "office-campus", build: buildLowPolyOfficeCampus }),
  Object.freeze({ factoryId: "hospital-campus", build: buildLowPolyHospitalCampus }),
  Object.freeze({ factoryId: "amusement-park", build: buildLowPolyAmusementPark }),
  Object.freeze({ factoryId: "school-campus", build: buildLowPolySchoolCampus }),
  Object.freeze({ factoryId: "shopping-mall", build: buildLowPolyShoppingMall }),
  Object.freeze({ factoryId: "technology-park", build: buildLowPolyTechnologyPark }),
  Object.freeze({ factoryId: "food-processing-plant", build: buildLowPolyFoodProcessingPlant }),
  Object.freeze({ factoryId: "mechanized-factory", build: buildLowPolyMechanizedFactory }),
  Object.freeze({ factoryId: "standard-residential-community", build: buildLowPolyStandardResidentialCommunity }),
  Object.freeze({ factoryId: "standard-residential-community-4-rows", build: (options) => buildLowPolyStandardResidentialCommunity({ ...options, rowsPerSide: 4 }) }),
  Object.freeze({ factoryId: "standard-residential-community-5-rows", build: (options) => buildLowPolyStandardResidentialCommunity({ ...options, rowsPerSide: 5 }) }),
  Object.freeze({ factoryId: "standard-residential-community-6-rows", build: (options) => buildLowPolyStandardResidentialCommunity({ ...options, rowsPerSide: 6 }) }),
  Object.freeze({ factoryId: "luxury-villa-community", build: buildLowPolyLuxuryVillaCommunity }),
  Object.freeze({ factoryId: "residential-community", build: buildLowPolyResidentialCommunity }),
  Object.freeze({ factoryId: "fire-station", build: buildLowPolyFireStation }),
  Object.freeze({ factoryId: "city-park", build: buildLowPolyCityPark }),
  Object.freeze({ factoryId: "sports-center", build: buildLowPolySportsCenter }),
  Object.freeze({ factoryId: "city-center", build: buildLowPolyCityCenter }),
  Object.freeze({ factoryId: "town-center", build: buildLowPolyTownCenter }),
]);

function cloneSnapshotValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneSnapshotValue)) as T;
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) copy[key] = cloneSnapshotValue(nested);
    return Object.freeze(copy) as T;
  }
  return value;
}

function makeStreetTreeSource(template: CatalogModelPackView["all"][number]) {
  const group = new THREE.Group();
  group.name = "street-tree-template";
  group.userData.mapLayer = "exterior";
  const woodGeometry = (template.showroomWood ?? template.wood).clone();
  const leavesGeometry = template.leaves.clone();
  const wood = new THREE.Mesh(woodGeometry, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: Boolean(woodGeometry.getAttribute("color")),
    roughness: 0.96,
    metalness: 0,
  }));
  wood.name = "street-tree-wood";
  wood.userData.mapCollisionRole = "solid";
  const leaves = new THREE.Mesh(leavesGeometry, new THREE.MeshPhongMaterial({
    color: 0xffffff,
    vertexColors: Boolean(leavesGeometry.getAttribute("color")),
    specular: 0x78955e,
    shininess: 12,
    emissive: 0x142806,
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
  }));
  leaves.name = "street-tree-leaves";
  leaves.userData.mapCollisionRole = "ignore";
  leaves.userData.mapLayer = "micro-detail";
  group.add(wood, leaves);
  return group;
}

function validateFactoryCoverage(
  entries: readonly CatalogEntrySnapshot[],
  derived: readonly DerivedTemplateDescriptorSnapshot[],
  adapters: ReadonlyMap<string, CatalogFactoryAdapter>,
) {
  const required = [
    ...entries.flatMap((entry) => entry.source.kind === "factory" ? [entry.source.factoryId] : []),
    ...derived.flatMap((entry) => entry.source.kind === "factory" ? [entry.source.factoryId] : []),
  ];
  for (const factoryId of new Set(required)) {
    if (!adapters.has(factoryId)) throw new TypeError(`missing catalog factory adapter: ${factoryId}`);
  }
}

export function createCatalogSourceRegistry(init: Readonly<{
  catalogEntries?: readonly CatalogEntrySnapshot[];
  derivedTemplates?: readonly DerivedTemplateDescriptorSnapshot[];
  factoryAdapters?: readonly CatalogFactoryAdapter[];
  modelPack?: CatalogModelPackView | null;
}> = {}): CatalogSourceRegistry {
  let generation = 1;
  let entries = cloneSnapshotValue(init.catalogEntries ?? CITY_CATALOG);
  let derived = cloneSnapshotValue(init.derivedTemplates ?? DERIVED_TEMPLATE_DESCRIPTORS);
  let adapters = new Map((init.factoryAdapters ?? DEFAULT_CATALOG_FACTORY_ADAPTERS).map((adapter) => [adapter.factoryId, adapter]));
  let modelPack = init.modelPack ?? null;
  let retired = false;
  let snapshotBorrowers = 0;
  let retireResolve: (() => void) | null = null;
  let retirePromise: Promise<void> | null = null;

  validateCityCatalog(entries, derived);
  validateFactoryCoverage(entries, derived, adapters);

  const assertLive = () => {
    if (retired) throw new Error("catalog source registry is retired");
  };
  const bump = () => {
    generation += 1;
    void retireResourceCacheGeneration();
  };

  const captureSnapshot = (): CatalogSourceSnapshotLease => {
    assertLive();
    snapshotBorrowers += 1;
    const snapshotGeneration = generation;
    const snapshotEntries = entries;
    const snapshotDerived = derived;
    const snapshotAdapters = new Map(adapters);
    const snapshotModelPack = modelPack;
    const byId = new Map(snapshotEntries.map((entry) => [entry.id, entry]));
    const derivedById = new Map<string, DerivedTemplateDescriptorSnapshot>(
      snapshotDerived.map((entry) => [entry.templateId, entry]),
    );
    const getEntry = (id: string) => byId.get(id);
    const getDerived = (id: string) => derivedById.get(id);
    const getAdapter = (factoryId: string) => snapshotAdapters.get(factoryId);
    const createOwnedSource = (
      source: CatalogSource,
      options?: CatalogSourceBuildOptions,
    ): OwnedCatalogSource | undefined => {
      if (source.kind === "factory") {
        const adapter = snapshotAdapters.get(source.factoryId);
        if (!adapter) return undefined;
        const resourceCacheLease = acquireResourceCacheLease();
        let group: THREE.Group | undefined;
        try {
          group = adapter.build(options);
          group.userData.mapLayer ??= "exterior";
          applyReviewedCityMapLodTags(group, source.factoryId);
          internScenePrimitiveGeometries(group, resourceCacheLease);
          return Object.freeze({
            group,
            sourceIdentity: `factory:${source.factoryId}@${snapshotGeneration}`,
            resourceCacheLease,
          });
        } catch (error) {
          if (group) disposeSceneResources(group);
          resourceCacheLease.release();
          throw error;
        }
      }
      const template = snapshotModelPack?.all.find((candidate) => candidate.id === source.modelId);
      if (!template) return undefined;
      const resourceCacheLease = acquireResourceCacheLease();
      let group: THREE.Group | undefined;
      try {
        group = makeStreetTreeSource(template);
        internScenePrimitiveGeometries(group, resourceCacheLease);
        return Object.freeze({
          group,
          sourceIdentity: `model-pack:${source.modelId}@${snapshotGeneration}`,
          resourceCacheLease,
        });
      } catch (error) {
        if (group) disposeSceneResources(group);
        resourceCacheLease.release();
        throw error;
      }
    };
    const view = Object.freeze({
      generation: snapshotGeneration,
      catalogEntries: snapshotEntries,
      derivedTemplates: snapshotDerived,
      getCatalogEntry: getEntry,
      getDerivedTemplateDescriptor: getDerived,
      getFactoryAdapter: getAdapter,
      createOwnedSource,
    });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      snapshotBorrowers -= 1;
      if (retired && snapshotBorrowers === 0) {
        retireResolve?.();
        retireResolve = null;
      }
    };
    return Object.freeze({ value: view, release });
  };

  const replaceCatalog = (
    nextEntries: readonly CatalogEntrySnapshot[],
    nextDerived: readonly DerivedTemplateDescriptorSnapshot[],
  ) => {
    assertLive();
    validateCityCatalog(nextEntries, nextDerived);
    const frozenEntries = cloneSnapshotValue(nextEntries);
    const frozenDerived = cloneSnapshotValue(nextDerived);
    validateFactoryCoverage(frozenEntries, frozenDerived, adapters);
    entries = frozenEntries;
    derived = frozenDerived;
    bump();
  };

  const replaceFactory = (factoryId: string, build: () => THREE.Group) => {
    assertLive();
    if (!factoryId || typeof build !== "function") throw new TypeError("factory replacement is invalid");
    const nextBuild = factoryId === "traffic-light"
      ? () => (build as (armSide: -1) => THREE.Group)(-1)
      : build;
    adapters = new Map(adapters);
    adapters.set(factoryId, Object.freeze({ factoryId, build: nextBuild }));
    bump();
  };

  const replaceModelPack = (nextPack: CatalogModelPackView | null) => {
    assertLive();
    modelPack = nextPack;
    bump();
  };

  const retire = () => {
    if (retirePromise) return retirePromise;
    retired = true;
    if (snapshotBorrowers === 0) return Promise.resolve();
    retirePromise = new Promise<void>((resolve) => { retireResolve = resolve; });
    return retirePromise;
  };

  return Object.freeze({ captureSnapshot, replaceCatalog, replaceFactory, replaceModelPack, retire });
}

/** Convenience lookup for synchronous tooling; runtime rendering should capture a registry snapshot. */
export function getDefaultCatalogSource(source: CatalogSource): CatalogFactoryAdapter | undefined {
  if (source.kind !== "factory") return undefined;
  return DEFAULT_CATALOG_FACTORY_ADAPTERS.find((adapter) => adapter.factoryId === source.factoryId);
}

// Keep the direct exports exercised and make accidental catalog/source drift fail at module load.
validateFactoryCoverage(
  CITY_CATALOG,
  DERIVED_TEMPLATE_DESCRIPTORS,
  new Map(DEFAULT_CATALOG_FACTORY_ADAPTERS.map((adapter) => [adapter.factoryId, adapter])),
);

export { getCatalogEntry, getDerivedTemplateDescriptor };
