import type * as THREE from "three";
import {
  getBuiltinSurfaceProfile,
  type CollisionContainmentPolicy,
  type DeepReadonly,
  type MapCollisionRole,
} from "./cityCollisionTypes.ts";

export const CITY_CATALOG_SCHEMA_VERSION = 1;

export type CatalogCategory = "decoration" | "building" | "scene";
export type Cardinal = "+z" | "-z" | "+x" | "-x";
export type MapLayer = "exterior" | "interior" | "micro-detail" | "animated-detail";

export type EntranceAnchor = {
  id: string;
  localX: number;
  localZ: number;
  widthMeters: number;
  outward: Cardinal;
  connectsInternalRoad?: string;
};

export type LocalSurfaceRect = {
  localX: number;
  localZ: number;
  width: number;
  depth: number;
};

export type InternalRoadSourceSurface =
  | { kind: "mesh-group"; exactName: string }
  | {
      kind: "rideable-at-point";
      sampleLocalX: number;
      sampleLocalZ: number;
      expectedProfileId: "site-surface";
    };

export type InternalRoad = {
  name: string;
  sourceSurface: InternalRoadSourceSurface;
  sourceRect: LocalSurfaceRect;
  outward: Cardinal;
  localX: number;
  localZ: number;
  width: number;
  depth: number;
};

export type FootprintKind = "rect" | "circle";
export type SitePadMaterial = "paving" | "grass" | "soil-grate";
export type MapLodPolicy =
  | { mode: "instanced-parts" }
  | {
      mode: "tagged-exterior";
      hideLayers: Array<"interior" | "micro-detail" | "animated-detail">;
      mergeStaticByMaterial: true;
    };

export type CatalogSource =
  | { kind: "factory"; factoryId: string }
  | { kind: "model-pack"; modelId: string };

export type CollisionMeshSelection =
  | { source: "mesh-userData" }
  | {
      source: "catalog-mesh-names";
      solidNames: string[];
      rideableSurfaceNames?: string[];
      ignoreNames?: string[];
    };

export type SurfaceProfileSelection = {
  byName?: Record<string, string>;
  defaultRideableProfileId: string;
};

export type CatalogEntry = {
  id: string;
  collection: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  category: CatalogCategory;
  titleZh: string;
  titleEn: string;
  source: CatalogSource;
  mapScale: number;
  footprintKind: FootprintKind;
  siteSizeMeters: { x: number; z: number };
  circleDiameterMeters?: number;
  sitePad?: { material: SitePadMaterial; surfaceProfileId: string };
  footprintOverride?: { w: number; d: number };
  nonCollidingOverhangNames?: string[];
  collisionMeshes: CollisionMeshSelection;
  collisionContainment: CollisionContainmentPolicy;
  containmentRequiredNames?: string[];
  surfaceProfiles: SurfaceProfileSelection;
  reviewedCollisionRoleHash?: string;
  snap: "cell" | "road-verge" | "intersection-corner";
  reservation: "none" | "object" | "site";
  entrances?: EntranceAnchor[];
  internalRoads?: InternalRoad[];
  frontDirection?: Cardinal;
  mapLod: MapLodPolicy;
  maxRecommendedCount: number;
  defaultHeightScale: number;
};

export type TemplateBuildDescriptor = {
  templateId: string;
  source: CatalogSource;
  mapScale: number;
  siteSizeMeters?: { x: number; z: number };
  sitePad?: { material: SitePadMaterial; surfaceProfileId: string; sizeMeters: { x: number; z: number } };
  nonCollidingOverhangNames?: readonly string[];
  mapLod: MapLodPolicy;
  collisionMeshes: CollisionMeshSelection;
  collisionContainment: CollisionContainmentPolicy;
  containmentRequiredNames?: string[];
  surfaceProfiles: SurfaceProfileSelection;
  reviewedCollisionRoleHash?: string;
  entrances?: EntranceAnchor[];
  internalRoads?: InternalRoad[];
};

export type DerivedTemplateDescriptor = TemplateBuildDescriptor & {
  templateId: "traffic-light";
  source: { kind: "factory"; factoryId: "traffic-light" };
  paletteVisible: false;
  defaultHeightScale: number;
};

export type CatalogEntrySnapshot = DeepReadonly<CatalogEntry>;
export type TemplateBuildDescriptorSnapshot = DeepReadonly<TemplateBuildDescriptor>;
export type DerivedTemplateDescriptorSnapshot = DeepReadonly<DerivedTemplateDescriptor>;

export type RoleResolution = Readonly<{
  role: MapCollisionRole;
  surfaceProfileId?: string;
  source: "catalog-override" | "user-data" | "map-layer" | "name-rule" | "fallback";
  autoResolved: boolean;
  auditPath?: string;
}>;

export type CollisionRoleAudit = {
  autoSolid: Array<{
    normalizedToken: string;
    ancestorPath: string;
    meshCount: number;
    triangleCount: number;
  }>;
};

const INSTANCED_PARTS: MapLodPolicy = Object.freeze({ mode: "instanced-parts" });
const TAGGED_EXTERIOR: MapLodPolicy = Object.freeze({
  mode: "tagged-exterior",
  hideLayers: Object.freeze(["interior", "micro-detail", "animated-detail"]),
  mergeStaticByMaterial: true,
}) as MapLodPolicy;
const OPEN_COLLISION: CollisionMeshSelection = Object.freeze({ source: "mesh-userData" });
const SITE_SURFACE: SurfaceProfileSelection = Object.freeze({ defaultRideableProfileId: "site-surface" });

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value as DeepReadonly<T>;
}

function road(
  name: string,
  sourceSurface: InternalRoadSourceSurface,
  sourceRect: LocalSurfaceRect,
  outward: Cardinal,
  localX: number,
  localZ: number,
  width: number,
  depth: number,
): InternalRoad {
  return { name, sourceSurface, sourceRect, outward, localX, localZ, width, depth };
}

const factorySource = (factoryId: string): CatalogSource => ({ kind: "factory", factoryId });
const rect = (x: number, z: number) => ({ x, z });

const RAW_CITY_CATALOG: CatalogEntry[] = [
  {
    id: "street-light", collection: 1, category: "decoration", titleZh: "城市路灯", titleEn: "Street light",
    source: factorySource("street-light"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(1, 1),
    footprintOverride: { w: 1, d: 1 }, nonCollidingOverhangNames: ["street-light-arm-rise", "street-light-arm", "street-light-lamp-housing", "street-light-lamp-cap", "street-light-warm-lens"],
    collisionMeshes: OPEN_COLLISION, collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "road-verge", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 600, defaultHeightScale: 1.32,
  },
  {
    id: "roadside-planter", collection: 1, category: "decoration", titleZh: "长条花坛", titleEn: "Roadside planter",
    source: factorySource("roadside-planter"), mapScale: 0.56, footprintKind: "rect", siteSizeMeters: rect(6.35, 1.75), footprintOverride: { w: 4, d: 1 },
    collisionMeshes: {
      source: "catalog-mesh-names",
      solidNames: ["roadside-planter-foundation", "roadside-planter-long-wall", "roadside-planter-end-wall", "roadside-planter-long-rim", "roadside-planter-end-rim"],
      ignoreNames: ["roadside-planter-masonry-seam", "roadside-planter-soil-bed", "roadside-planter-shrub", "roadside-planter-flower-stem", "roadside-planter-flower-blossom"],
    },
    collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "road-verge", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 240, defaultHeightScale: 1,
  },
  {
    id: "food-truck", collection: 1, category: "decoration", titleZh: "餐车", titleEn: "Food truck",
    source: factorySource("food-truck"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(5.85, 2.28), footprintOverride: { w: 6, d: 3 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["food-truck-chassis"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 48, defaultHeightScale: 1,
  },
  {
    id: "hot-dog-kiosk", collection: 1, category: "decoration", titleZh: "热狗亭", titleEn: "Hot-dog kiosk",
    source: factorySource("hot-dog-kiosk"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(3.5, 2.5), footprintOverride: { w: 4, d: 3 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 48, defaultHeightScale: 1,
  },
  {
    id: "newsstand", collection: 1, category: "decoration", titleZh: "报刊亭", titleEn: "Newsstand",
    source: factorySource("newsstand"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(3.5, 2.5), footprintOverride: { w: 4, d: 3 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 48, defaultHeightScale: 1,
  },
  {
    id: "phone-booth", collection: 1, category: "decoration", titleZh: "电话亭", titleEn: "Phone booth",
    source: factorySource("phone-booth"), mapScale: 0.58, footprintKind: "rect", siteSizeMeters: rect(3.16, 3.16), footprintOverride: { w: 2, d: 2 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 64, defaultHeightScale: 1,
  },
  {
    id: "street-tree", collection: 1, category: "decoration", titleZh: "行道树", titleEn: "Street tree",
    source: { kind: "model-pack", modelId: "tree_normal_medium_redwood_a" }, mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(1, 1), footprintOverride: { w: 1, d: 1 },
    nonCollidingOverhangNames: ["street-tree-leaves"],
    collisionMeshes: { source: "catalog-mesh-names", solidNames: ["street-tree-wood"], ignoreNames: ["street-tree-leaves"] },
    collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "road-verge", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 600, defaultHeightScale: 1,
  },
  {
    id: "residential-building", collection: 2, category: "building", titleZh: "居民楼", titleEn: "Residential building",
    source: factorySource("residential-building"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(7.4, 5.25), footprintOverride: { w: 8, d: 6 },
    nonCollidingOverhangNames: ["residential-building-entrance-canopy", "residential-building-balcony-floor", "residential-building-balcony-rail", "residential-building-balcony-side-rail"],
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["residential-building-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 80, defaultHeightScale: 1,
  },
  {
    id: "high-rise-residential", collection: 2, category: "building", titleZh: "高层住宅", titleEn: "High-rise residential",
    source: factorySource("high-rise-residential"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(13, 9), footprintOverride: { w: 13, d: 9 },
    nonCollidingOverhangNames: ["high-rise-balcony-floor", "high-rise-balcony-rail", "high-rise-balcony-side-rail", "high-rise-entrance-canopy"],
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["high-rise-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 48, defaultHeightScale: 1,
  },
  {
    id: "small-villa", collection: 2, category: "building", titleZh: "坡顶别墅", titleEn: "Small villa",
    source: factorySource("small-villa"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(8.3, 6.65), footprintOverride: { w: 9, d: 7 },
    nonCollidingOverhangNames: ["small-villa-porch-roof", "small-villa-terrace-rail", "small-villa-flower-box", "small-villa-shrub"],
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["small-villa-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 48, defaultHeightScale: 1,
  },
  {
    id: "office-campus", collection: 2, category: "building", titleZh: "办公园区", titleEn: "Office campus",
    source: factorySource("office-campus"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(30, 17), footprintOverride: { w: 30, d: 17 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["office-campus-floor-slab"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "object", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 24, defaultHeightScale: 1,
  },
  {
    id: "hospital-campus", collection: 3, category: "scene", titleZh: "综合医院", titleEn: "Hospital campus",
    source: factorySource("hospital-campus"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(80, 62), footprintOverride: { w: 80, d: 62 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["hospital-zone-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 4, defaultHeightScale: 1,
    entrances: [
      { id: "main", localX: 0, localZ: 31, widthMeters: 12, outward: "+z", connectsInternalRoad: "main-access" },
      { id: "emergency", localX: 40, localZ: 5, widthMeters: 8, outward: "+x", connectsInternalRoad: "emergency" },
      { id: "ward", localX: 0, localZ: -31, widthMeters: 10, outward: "-z", connectsInternalRoad: "ward" },
    ],
    internalRoads: [
      road("main-access", { kind: "mesh-group", exactName: "hospital-campus-internal-road" }, { localX: 0, localZ: 22, width: 76, depth: 6 }, "+z", 0, 25, 76, 12),
      road("emergency", { kind: "mesh-group", exactName: "hospital-campus-internal-road" }, { localX: 35.5, localZ: 5, width: 5, depth: 36 }, "+x", 36.5, 5, 7, 36),
      road("ward", { kind: "mesh-group", exactName: "hospital-campus-internal-road" }, { localX: 0, localZ: -29, width: 28, depth: 3.6 }, "-z", 0, -29.1, 28, 3.8),
    ],
  },
  {
    id: "amusement-park", collection: 4, category: "scene", titleZh: "大型游乐园", titleEn: "Amusement park",
    source: factorySource("amusement-park"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(180, 130), footprintOverride: { w: 180, d: 130 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["amusement-park-kart-pit-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "gate", localX: 0, localZ: 65, widthMeters: 16, outward: "+z", connectsInternalRoad: "gate-approach" }],
    internalRoads: [road("gate-approach", { kind: "rideable-at-point", sampleLocalX: 0, sampleLocalZ: 55, expectedProfileId: "site-surface" }, { localX: 0, localZ: 55, width: 16, depth: 1 }, "+z", 0, 60, 16, 10)],
  },
  {
    id: "school-campus", collection: 5, category: "scene", titleZh: "现代学校", titleEn: "School campus",
    source: factorySource("school-campus"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(170, 130), footprintOverride: { w: 170, d: 130 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["school-building-foundation", "school-natatorium-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "main", localX: 0, localZ: 65, widthMeters: 16, outward: "+z", connectsInternalRoad: "main-approach" }],
    internalRoads: [road("main-approach", { kind: "mesh-group", exactName: "school-campus-service-road" }, { localX: 0, localZ: 61.8, width: 158, depth: 4 }, "+z", 0, 62.4, 158, 5.2)],
  },
  {
    id: "shopping-mall", collection: 6, category: "scene", titleZh: "大型商业中心", titleEn: "Shopping mall",
    source: factorySource("shopping-mall"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(184, 138), footprintOverride: { w: 184, d: 138 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["shopping-mall-compact-core-wall"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "south", localX: 0, localZ: 69, widthMeters: 62.1, outward: "+z", connectsInternalRoad: "south-perimeter" }],
    internalRoads: [road("south-perimeter", { kind: "mesh-group", exactName: "shopping-mall-perimeter-road" }, { localX: 0, localZ: 63.25, width: 172.5, depth: 8.05 }, "+z", 0, 64.11, 172.5, 9.78)],
  },
  {
    id: "residential-community", collection: 7, category: "scene", titleZh: "完整住宅社区", titleEn: "Residential community",
    source: factorySource("residential-community"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(190, 145), footprintOverride: { w: 190, d: 145 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["high-rise-foundation", "residential-building-foundation", "residential-community-kindergarten-building-foundation"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "public-south", localX: 0, localZ: 72.5, widthMeters: 16, outward: "+z", connectsInternalRoad: "public-road" }],
    internalRoads: [road("public-road", { kind: "mesh-group", exactName: "residential-community-public-road" }, { localX: 0, localZ: 68.7, width: 181, depth: 6.2 }, "+z", 0, 69.05, 181, 6.9)],
  },
  {
    id: "fire-station", collection: 8, category: "scene", titleZh: "城市消防局", titleEn: "Fire station",
    source: factorySource("fire-station"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(159, 110), footprintOverride: { w: 159, d: 110 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["fire-station-building-solid-shell", "fire-station-training-tower-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "response", localX: 0, localZ: 55, widthMeters: 80, outward: "+z", connectsInternalRoad: "public-response" }],
    internalRoads: [road("public-response", { kind: "mesh-group", exactName: "fire-station-public-response-road" }, { localX: 0, localZ: 50.5, width: 151, depth: 9 }, "+z", 0, 50.5, 151, 9)],
  },
  {
    id: "city-park", collection: 9, category: "scene", titleZh: "综合城市公园", titleEn: "City park",
    source: factorySource("city-park"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(185, 140), footprintOverride: { w: 185, d: 140 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["city-park-service-building-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [
      { id: "south", localX: 0, localZ: 70, widthMeters: 20, outward: "+z", connectsInternalRoad: "south-plaza" },
      { id: "north", localX: 0, localZ: -70, widthMeters: 18, outward: "-z", connectsInternalRoad: "north-path" },
      { id: "west", localX: -92.5, localZ: 0, widthMeters: 18, outward: "-x", connectsInternalRoad: "west-path" },
      { id: "east", localX: 92.5, localZ: 0, widthMeters: 18, outward: "+x", connectsInternalRoad: "east-path" },
    ],
    internalRoads: [
      road("south-plaza", { kind: "mesh-group", exactName: "city-park-main-entrance-plaza" }, { localX: 0, localZ: 57, width: 48, depth: 19 }, "+z", 0, 58.75, 48, 22.5),
      road("north-path", { kind: "rideable-at-point", sampleLocalX: 0, sampleLocalZ: -51, expectedProfileId: "site-surface" }, { localX: 0, localZ: -51, width: 8, depth: 36 }, "-z", 0, -60.5, 18, 19),
      road("west-path", { kind: "rideable-at-point", sampleLocalX: -73, sampleLocalZ: 0, expectedProfileId: "site-surface" }, { localX: -73, localZ: 0, width: 38, depth: 8 }, "-x", -82.75, 0, 19.5, 18),
      road("east-path", { kind: "rideable-at-point", sampleLocalX: 73, sampleLocalZ: 0, expectedProfileId: "site-surface" }, { localX: 73, localZ: 0, width: 38, depth: 8 }, "+x", 82.75, 0, 19.5, 18),
    ],
  },
  {
    id: "park-street-light", collection: 9, category: "decoration", titleZh: "公园路灯", titleEn: "Park street light",
    source: factorySource("park-street-light"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(1, 1), footprintOverride: { w: 1, d: 1 },
    nonCollidingOverhangNames: ["park-street-light-crossbar", "park-street-light-lantern", "park-street-light-canopy", "park-street-light-warm-lens"],
    collisionMeshes: OPEN_COLLISION, collisionContainment: "open-allowed", surfaceProfiles: SITE_SURFACE,
    snap: "road-verge", reservation: "object", mapLod: INSTANCED_PARTS, maxRecommendedCount: 240, defaultHeightScale: 1,
  },
  {
    id: "sports-center", collection: 10, category: "scene", titleZh: "城市体育中心", titleEn: "Sports center",
    source: factorySource("sports-center"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(280, 190), footprintOverride: { w: 280, d: 190 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["sports-center-hall-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 1, defaultHeightScale: 1,
    entrances: [{ id: "public", localX: 0, localZ: 95, widthMeters: 24, outward: "+z", connectsInternalRoad: "public-road" }],
    internalRoads: [road("public-road", { kind: "mesh-group", exactName: "sports-center-public-road" }, { localX: 0, localZ: 89, width: 274, depth: 9 }, "+z", 0, 89.75, 274, 10.5)],
  },
  {
    id: "city-center", collection: 11, category: "scene", titleZh: "城市中心", titleEn: "City center",
    source: factorySource("city-center"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(210, 165), footprintOverride: { w: 210, d: 165 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["city-center-tower-podium", "city-center-transport-hub-hall-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 1, defaultHeightScale: 1,
    entrances: [
      { id: "map", localX: 0, localZ: 82.5, widthMeters: 16, outward: "+z", connectsInternalRoad: "south-boulevard" },
      { id: "transit-west", localX: -105, localZ: -39, widthMeters: 20, outward: "-x", connectsInternalRoad: "hub-apron-west" },
    ],
    internalRoads: [
      road("south-boulevard", { kind: "mesh-group", exactName: "city-center-south-boulevard" }, { localX: 0, localZ: 74, width: 204, depth: 12 }, "+z", 0, 75.25, 204, 14.5),
      road("hub-apron-west", { kind: "mesh-group", exactName: "city-center-transport-hub-apron" }, { localX: -64, localZ: -39, width: 69, depth: 59 }, "-x", -84.5, -39, 41, 20),
    ],
  },
  {
    id: "town-center", collection: 12, category: "scene", titleZh: "市镇中心", titleEn: "Town center",
    source: factorySource("town-center"), mapScale: 1, footprintKind: "rect", siteSizeMeters: rect(175, 135), footprintOverride: { w: 175, d: 135 },
    collisionMeshes: OPEN_COLLISION, collisionContainment: "closed-required", containmentRequiredNames: ["town-center-building-shell", "town-center-shop-house-shell"], surfaceProfiles: SITE_SURFACE,
    snap: "cell", reservation: "site", frontDirection: "+z", mapLod: TAGGED_EXTERIOR, maxRecommendedCount: 2, defaultHeightScale: 1,
    entrances: [{ id: "south", localX: 0, localZ: 67.5, widthMeters: 17, outward: "+z", connectsInternalRoad: "south-street" }],
    internalRoads: [road("south-street", { kind: "mesh-group", exactName: "town-center-perimeter-street" }, { localX: 0, localZ: 61, width: 169, depth: 10 }, "+z", 0, 61.75, 169, 11.5)],
  },
];

const RAW_DERIVED_TEMPLATE_DESCRIPTORS: DerivedTemplateDescriptor[] = [{
  templateId: "traffic-light",
  source: { kind: "factory", factoryId: "traffic-light" },
  mapScale: 1,
  mapLod: INSTANCED_PARTS,
  collisionMeshes: OPEN_COLLISION,
  collisionContainment: "open-allowed",
  surfaceProfiles: SITE_SURFACE,
  paletteVisible: false,
  defaultHeightScale: 1.25,
}];

export const CITY_CATALOG = deepFreeze(RAW_CITY_CATALOG) as readonly CatalogEntrySnapshot[];
export const DERIVED_TEMPLATE_DESCRIPTORS = deepFreeze(RAW_DERIVED_TEMPLATE_DESCRIPTORS) as readonly DerivedTemplateDescriptorSnapshot[];
export const CITY_CATALOG_IDS = Object.freeze(CITY_CATALOG.map((entry) => entry.id));
export const CITY_DERIVED_TEMPLATE_IDS = Object.freeze(DERIVED_TEMPLATE_DESCRIPTORS.map((entry) => entry.templateId));

const entryById = new Map(CITY_CATALOG.map((entry) => [entry.id, entry]));

export function getCatalogEntry(id: string): CatalogEntrySnapshot | undefined {
  return entryById.get(id);
}

export function getDerivedTemplateDescriptor(id: string): DerivedTemplateDescriptorSnapshot | undefined {
  return id === "traffic-light" ? DERIVED_TEMPLATE_DESCRIPTORS[0] : undefined;
}

export function toTemplateBuildDescriptor(entry: CatalogEntrySnapshot): TemplateBuildDescriptorSnapshot {
  const footprint = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return deepFreeze({
    templateId: entry.id,
    source: entry.source,
    mapScale: entry.mapScale,
    siteSizeMeters: entry.siteSizeMeters,
    sitePad: entry.sitePad ? { ...entry.sitePad, sizeMeters: { x: footprint.w, z: footprint.d } } : undefined,
    nonCollidingOverhangNames: entry.nonCollidingOverhangNames,
    mapLod: entry.mapLod,
    collisionMeshes: entry.collisionMeshes,
    collisionContainment: entry.collisionContainment,
    containmentRequiredNames: entry.containmentRequiredNames,
    surfaceProfiles: entry.surfaceProfiles,
    reviewedCollisionRoleHash: entry.reviewedCollisionRoleHash,
    entrances: entry.entrances,
    internalRoads: entry.internalRoads,
  });
}

export function stretchInternalRoadToKerb(
  seed: { name: string; sourceSurface: InternalRoadSourceSurface; sourceRect: LocalSurfaceRect },
  site: { x: number; z: number },
  outward: Cardinal,
): InternalRoad {
  const source = seed.sourceRect;
  let minX = source.localX - source.width * 0.5;
  let maxX = source.localX + source.width * 0.5;
  let minZ = source.localZ - source.depth * 0.5;
  let maxZ = source.localZ + source.depth * 0.5;
  if (outward === "+x") maxX = site.x * 0.5;
  if (outward === "-x") minX = -site.x * 0.5;
  if (outward === "+z") maxZ = site.z * 0.5;
  if (outward === "-z") minZ = -site.z * 0.5;
  if (minX >= maxX || minZ >= maxZ) throw new RangeError("internal road source does not extend toward the requested kerb");
  return {
    name: seed.name,
    sourceSurface: seed.sourceSurface,
    sourceRect: { ...source },
    outward,
    localX: (minX + maxX) * 0.5,
    localZ: (minZ + maxZ) * 0.5,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a finite positive number`);
}

export function validateCityCatalog(
  entries: readonly CatalogEntrySnapshot[] = CITY_CATALOG,
  derived: readonly DerivedTemplateDescriptorSnapshot[] = DERIVED_TEMPLATE_DESCRIPTORS,
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) throw new TypeError(`duplicate or empty catalog id: ${entry.id}`);
    ids.add(entry.id);
    assertPositive(entry.mapScale, `${entry.id}.mapScale`);
    assertPositive(entry.siteSizeMeters.x, `${entry.id}.siteSizeMeters.x`);
    assertPositive(entry.siteSizeMeters.z, `${entry.id}.siteSizeMeters.z`);
    assertPositive(entry.defaultHeightScale, `${entry.id}.defaultHeightScale`);
    if (!getBuiltinSurfaceProfile(entry.surfaceProfiles.defaultRideableProfileId)) {
      throw new TypeError(`${entry.id} has unknown default surface profile`);
    }
    if (entry.collisionContainment === "closed-required") {
      if (!entry.containmentRequiredNames?.length) throw new TypeError(`${entry.id} must name a containment component`);
    } else if (entry.containmentRequiredNames?.length) {
      throw new TypeError(`${entry.id} is open-allowed and cannot require containment names`);
    }
    const internalNames = new Set(entry.internalRoads?.map((item) => item.name) ?? []);
    if (internalNames.size !== (entry.internalRoads?.length ?? 0)) throw new TypeError(`${entry.id} has duplicate internal road names`);
    for (const entrance of entry.entrances ?? []) {
      assertPositive(entrance.widthMeters, `${entry.id}.${entrance.id}.widthMeters`);
      const onX = Math.abs(Math.abs(entrance.localX) - entry.siteSizeMeters.x * 0.5) <= 1;
      const onZ = Math.abs(Math.abs(entrance.localZ) - entry.siteSizeMeters.z * 0.5) <= 1;
      if (!onX && !onZ) throw new TypeError(`${entry.id}.${entrance.id} is not on the site boundary`);
      if (entrance.connectsInternalRoad && !internalNames.has(entrance.connectsInternalRoad)) {
        throw new TypeError(`${entry.id}.${entrance.id} references an unknown internal road`);
      }
    }
  }
  if (derived.length !== 1 || derived[0].templateId !== "traffic-light" || derived[0].paletteVisible !== false) {
    throw new TypeError("v1 requires exactly one hidden traffic-light derived template");
  }
  if (ids.has("traffic-light")) throw new TypeError("traffic-light must not be palette-visible");
}

function objectPath(object: THREE.Object3D) {
  const parts: string[] = [];
  for (let node: THREE.Object3D | null = object; node; node = node.parent) parts.push(node.name || "<unnamed>");
  return parts.reverse().join("/");
}

function lineage(object: THREE.Object3D) {
  const result: THREE.Object3D[] = [];
  for (let node: THREE.Object3D | null = object; node; node = node.parent) result.push(node);
  return result;
}

function normalizedTokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
}

function hasTokenSequence(tokens: readonly string[], sequence: readonly string[]) {
  return tokens.some((_, start) => sequence.every((part, index) => tokens[start + index] === part));
}

function selectionRole(name: string, selection: DeepReadonly<CollisionMeshSelection>): MapCollisionRole | undefined {
  if (selection.source !== "catalog-mesh-names") return undefined;
  if (selection.solidNames.includes(name)) return "solid";
  if (selection.rideableSurfaceNames?.includes(name)) return "rideable-surface";
  if (selection.ignoreNames?.includes(name)) return "ignore";
  return undefined;
}

export function resolveMapCollisionRole(
  meshOrGroup: THREE.Object3D,
  collisionSelection: DeepReadonly<CollisionMeshSelection>,
  surfaceProfileSelection: DeepReadonly<SurfaceProfileSelection>,
  audit: CollisionRoleAudit,
): RoleResolution {
  const ancestors = lineage(meshOrGroup);
  for (const node of ancestors) {
    const selected = selectionRole(node.name, collisionSelection);
    if (selected) return roleWithProfile(selected, "catalog-override", meshOrGroup, ancestors, surfaceProfileSelection, false);
  }
  for (const node of ancestors) {
    const explicit = node.userData.mapCollisionRole as MapCollisionRole | undefined;
    if (explicit === "solid" || explicit === "rideable-surface" || explicit === "ignore") {
      return roleWithProfile(explicit, "user-data", meshOrGroup, ancestors, surfaceProfileSelection, false);
    }
  }
  if (ancestors.some((node) => node.userData.mapLayer === "interior"
    || node.userData.mapLayer === "micro-detail"
    || node.userData.mapLayer === "animated-detail")) {
    return { role: "ignore", source: "map-layer", autoResolved: false };
  }
  const names = ancestors.map((node) => node.name);
  const geometry = (meshOrGroup as THREE.Mesh).geometry;
  if (geometry?.name) names.push(geometry.name);
  const material = (meshOrGroup as THREE.Mesh).material;
  for (const item of material ? (Array.isArray(material) ? material : [material]) : []) if (item.name) names.push(item.name);
  const tokens = names.flatMap(normalizedTokens);
  const ignore = ["leaf", "leaves", "lens", "bulb", "glow", "pane", "bolt"].some((token) => tokens.includes(token))
    || hasTokenSequence(tokens, ["window", "pane"]);
  if (ignore) return { role: "ignore", source: "name-rule", autoResolved: false };
  const rideable = ["road", "asphalt", "sidewalk", "lawn", "grass", "plaza", "path", "ramp", "walkway", "promenade", "crossing", "pavement"]
    .some((token) => tokens.includes(token));
  if (rideable) return roleWithProfile("rideable-surface", "name-rule", meshOrGroup, ancestors, surfaceProfileSelection, false);
  const position = geometry?.getAttribute?.("position");
  const triangleCount = geometry
    ? Math.floor(((geometry.getIndex?.()?.count ?? position?.count ?? 0) / 3))
    : 0;
  audit.autoSolid.push({
    normalizedToken: tokens.join("-"),
    ancestorPath: objectPath(meshOrGroup),
    meshCount: 1,
    triangleCount,
  });
  return { role: "solid", source: "fallback", autoResolved: true, auditPath: objectPath(meshOrGroup) };
}

function roleWithProfile(
  role: MapCollisionRole,
  source: RoleResolution["source"],
  object: THREE.Object3D,
  ancestors: readonly THREE.Object3D[],
  profiles: DeepReadonly<SurfaceProfileSelection>,
  autoResolved: boolean,
): RoleResolution {
  if (role !== "rideable-surface") return { role, source, autoResolved };
  let profileId: string | undefined;
  for (const node of ancestors) {
    profileId = profiles.byName?.[node.name] ?? (node.userData.mapSurfaceProfile as string | undefined);
    if (profileId) break;
  }
  profileId ??= profiles.defaultRideableProfileId;
  if (!getBuiltinSurfaceProfile(profileId)) throw new TypeError(`unknown surface profile ${profileId} at ${objectPath(object)}`);
  return { role, surfaceProfileId: profileId, source, autoResolved };
}

validateCityCatalog();
