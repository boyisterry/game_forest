import * as THREE from "three";
import { buildLowPolyRoadsidePlanter, buildLowPolyStreetLight } from "./cityFurniture.ts";

export const SHOPPING_MALL_SCALE = 1.15;

export type MallZone = "overview" | "exterior" | "courtyard" | "food-street" | "lifestyle" | "upper-arcade" | "interior";
export type MallTenant = "fast-food" | "coffee" | "burger" | "milk-tea" | "bakery" | "convenience" | "restaurant" | "fashion";
export type MallNightLightingZone = "storefront" | "facade" | "arcade" | "courtyard" | "entry" | "wayfinding";

export type ShoppingMallModel = THREE.Group & {
  userData: {
    modelType: "shopping-mall";
    generatedLocally: true;
    zones: MallZone[];
    buildingCount: number;
    storefrontCount: number;
    exteriorStorefrontCount: number;
    courtyardStorefrontCount: number;
    tenantTypes: MallTenant[];
    restaurantCount: number;
    coffeeShopCount: number;
    burgerShopCount: number;
    milkTeaShopCount: number;
    openAirCourtyardCount: number;
    promenadeClearWidth: number;
    throughRouteOpenToSky: boolean;
    upperBridgeCount: number;
    escalatorCount: number;
    streetLightCount: number;
    planterCount: number;
    interiorStoreCount: number;
    tenantInteriorTypeCount: number;
    upperInteriorFloorCount: number;
    serviceCoreCount: number;
    accessibleLiftCount: number;
    fireStairCount: number;
    familyRestroomCount: number;
    wayfindingCount: number;
    nightLightingZones: MallNightLightingZone[];
    nightLightSourceCount: number;
    nightFixtureCount: number;
    lateNightOperational: true;
    powered: boolean;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    scaleMultiplier: number;
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
  };
};

export function buildLowPolyShoppingMall(): ShoppingMallModel {
  const mall = new THREE.Group() as ShoppingMallModel;
  mall.name = "city-shopping-mall-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];
  const nightLightSources: THREE.PointLight[] = [];
  const nightLightIntents: Array<{
    parent: THREE.Object3D;
    position: THREE.Vector3;
    zone: MallNightLightingZone;
    onIntensity: number;
    distance: number;
  }> = [];
  const nightFixtures: THREE.Mesh[] = [];
  const sharedGeometryTypes = new Set([
    "BoxGeometry",
    "CapsuleGeometry",
    "ConeGeometry",
    "CylinderGeometry",
    "DodecahedronGeometry",
    "SphereGeometry",
  ]);
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const mallMesh = <T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: MallZone) => {
    let resolvedGeometry = geometry;
    if (sharedGeometryTypes.has(geometry.type)) {
      const parameters = (geometry as THREE.BufferGeometry & { parameters?: unknown }).parameters;
      const key = `${geometry.type}:${JSON.stringify(parameters)}`;
      const shared = geometryCache.get(key) as T | undefined;
      if (shared) {
        geometry.dispose();
        resolvedGeometry = shared;
      } else {
        geometryCache.set(key, geometry);
      }
    }
    const mesh = new THREE.Mesh(resolvedGeometry, material);
    mesh.name = name;
    mesh.castShadow = zone !== "interior"
      && !material.transparent
      && !/(?:floor|slab|road|paving|line|clear-zone|water|rug|apron|landing|tread|safety-edge)/.test(name);
    mesh.receiveShadow = true;
    if (zone) mesh.userData.zone = zone;
    return mesh;
  };

  const stone = new THREE.MeshStandardMaterial({ color: 0xc8c0b2, roughness: 0.95 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xe2d8c4, roughness: 0.92 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4b5154, roughness: 0.98 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf1eadc, roughness: 0.82 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xb65b42, roughness: 0.78 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd6ad70, roughness: 0.82 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x29373d, roughness: 0.6, metalness: 0.28 });
  const escalatorMetal = new THREE.MeshStandardMaterial({ color: 0x758187, roughness: 0.34, metalness: 0.7 });
  const escalatorTread = new THREE.MeshStandardMaterial({ color: 0x343d41, roughness: 0.58, metalness: 0.52 });
  const safetyYellow = new THREE.MeshStandardMaterial({ color: 0xe4b94c, roughness: 0.58, metalness: 0.18 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9d714d, roughness: 0.85 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4da3b9, emissive: 0x174657, emissiveIntensity: 0.12, roughness: 0.2, transparent: true, opacity: 0.78 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x76aeb9, emissive: 0x274e59, emissiveIntensity: 0.025, roughness: 0.22, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide });
  // Storefront glazing has its own material so night mode never makes
  // escalator guards, display cases, lift cabins or glass roofs self-illuminate.
  const storefrontGlass = glass.clone();
  storefrontGlass.color.setHex(0x82b8bf);
  storefrontGlass.emissive.setHex(0x7d512b);
  storefrontGlass.emissiveIntensity = 0.025;
  storefrontGlass.opacity = 0.42;
  const curtainGlass = new THREE.MeshPhysicalMaterial({
    color: 0x6da9b7,
    emissive: 0x244d59,
    emissiveIntensity: 0.035,
    roughness: 0.12,
    metalness: 0.05,
    transmission: 0.32,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const warmWindow = new THREE.MeshStandardMaterial({ color: 0xe8c58f, emissive: 0xffad55, emissiveIntensity: 0.12, roughness: 0.28 });
  const warmLamp = new THREE.MeshStandardMaterial({ color: 0xffd99a, emissive: 0xffa33c, emissiveIntensity: 0.18, roughness: 0.3 });
  const interiorWall = new THREE.MeshStandardMaterial({ color: 0xe9e2d5, roughness: 0.86 });
  const interiorFloor = new THREE.MeshStandardMaterial({ color: 0xd8cab4, roughness: 0.72 });
  const paleTile = new THREE.MeshStandardMaterial({ color: 0xeee9df, roughness: 0.68 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb58a42, roughness: 0.35, metalness: 0.58 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x6c4938, roughness: 0.82 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0x71857d, roughness: 0.9 });
  const kitchenSteel = new THREE.MeshStandardMaterial({ color: 0x929a9b, roughness: 0.32, metalness: 0.72 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x507850, roughness: 0.9 });
  const restroomBlue = new THREE.MeshStandardMaterial({ color: 0x6b91a3, roughness: 0.72 });
  const emergencyGreen = new THREE.MeshStandardMaterial({ color: 0x3c8b65, emissive: 0x1b5d3c, emissiveIntensity: 0.24, roughness: 0.52 });
  const fashionFabric = new THREE.MeshStandardMaterial({ color: 0x566d8d, roughness: 0.78 });
  const nightWarm = new THREE.MeshStandardMaterial({ color: 0xffd8a1, emissive: 0xff9b3f, emissiveIntensity: 0.04, roughness: 0.3 });
  const nightCool = new THREE.MeshStandardMaterial({ color: 0xc8efff, emissive: 0x56c8ff, emissiveIntensity: 0.03, roughness: 0.25 });
  const nightAmber = new THREE.MeshStandardMaterial({ color: 0xffbd69, emissive: 0xff6f32, emissiveIntensity: 0.04, roughness: 0.35 });

  const registerNightFixture = (
    fixture: THREE.Mesh,
    nightLightingZone: MallNightLightingZone,
    mountType: "ceiling" | "wall" | "ground" | "water",
    mountSurfaceY: number,
  ) => {
    fixture.userData = {
      ...fixture.userData,
      nightLightingZone,
      mountType,
      mountSurfaceY,
      clearOfVehicleRoutes: mountType === "ground" ? true : undefined,
    };
    fixture.castShadow = false;
    fixture.receiveShadow = false;
    nightFixtures.push(fixture);
    return fixture;
  };

  const addNightLightSource = (
    parent: THREE.Object3D,
    position: THREE.Vector3,
    zone: MallNightLightingZone,
    color: number,
    onIntensity: number,
    distance: number,
  ) => {
    void color;
    nightLightIntents.push({ parent, position: position.clone(), zone, onIntensity, distance });
  };

  const FLOOR_PITCH = 4.25;
  const GROUND_SLAB_TOP = 0.61;
  const GROUND_FINISH_Y = 0.65;
  const floorFinishY = (level: number) => GROUND_FINISH_Y + level * FLOOR_PITCH;

  const tenantColors: Record<MallTenant, number> = {
    "fast-food": 0xe06d3e,
    coffee: 0x6f4c37,
    burger: 0xd64a3b,
    "milk-tea": 0xd49b58,
    bakery: 0xe3b46d,
    convenience: 0x3a8d70,
    restaurant: 0x9a4c46,
    fashion: 0x566d8d,
  };
  const tenantMaterials = Object.fromEntries(
    Object.entries(tenantColors).map(([type, color]) => [type, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.68 })]),
  ) as Record<MallTenant, THREE.MeshStandardMaterial>;
  const tenantAwningMaterials = Object.fromEntries(
    Object.entries(tenantColors).map(([type, color]) => [type, new THREE.MeshStandardMaterial({ color, roughness: 0.72 })]),
  ) as Record<MallTenant, THREE.MeshStandardMaterial>;
  const tenantFloorColors: Record<MallTenant, number> = {
    "fast-food": 0xead3be,
    coffee: 0xd8c8b7,
    burger: 0xe4c5bc,
    "milk-tea": 0xead9c4,
    bakery: 0xeee0c6,
    convenience: 0xcbded4,
    restaurant: 0xd8c4bf,
    fashion: 0xcdd3dc,
  };
  const tenantAccentColors: Record<MallTenant, number> = {
    "fast-food": 0xd95f31,
    coffee: 0x76513a,
    burger: 0xc94336,
    "milk-tea": 0xd59a57,
    bakery: 0xd7a454,
    convenience: 0x328568,
    restaurant: 0x8d423e,
    fashion: 0x526887,
  };
  const tenantFloorMaterials = Object.fromEntries(
    Object.entries(tenantFloorColors).map(([type, color]) => [type, new THREE.MeshStandardMaterial({ color, roughness: 0.74 })]),
  ) as Record<MallTenant, THREE.MeshStandardMaterial>;
  const tenantAccentMaterials = Object.fromEntries(
    Object.entries(tenantAccentColors).map(([type, color]) => [type, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.04, roughness: 0.6 })]),
  ) as Record<MallTenant, THREE.MeshStandardMaterial>;
  const coffeeUmbrella = tenantMaterials.coffee.clone();
  coffeeUmbrella.side = THREE.DoubleSide;
  coffeeUmbrella.emissiveIntensity = 0.03;
  const milkTeaUmbrella = tenantMaterials["milk-tea"].clone();
  milkTeaUmbrella.side = THREE.DoubleSide;
  milkTeaUmbrella.emissiveIntensity = 0.03;

  const site = mallMesh(new THREE.BoxGeometry(160, 0.4, 120), stone, "shopping-mall-site-base", "overview");
  site.position.y = 0.2;
  mall.add(site);
  const plazaBase = mallMesh(new THREE.BoxGeometry(146, 0.13, 106), paving, "shopping-mall-pedestrian-district", "overview");
  plazaBase.position.y = GROUND_FINISH_Y - 0.065;
  mall.add(plazaBase);

  for (const [x, z, width, depth] of [
    [0, 55, 150, 7], [0, -55, 150, 7], [-75, 0, 7, 104], [75, 0, 7, 104],
  ] as Array<[number, number, number, number]>) {
    const road = mallMesh(new THREE.BoxGeometry(width, 0.1, depth), asphalt, "shopping-mall-perimeter-road", "exterior");
    road.position.set(x, 0.48, z);
    mall.add(road);
  }

  // Drop-off loop and realistic parking strips outside the storefront line.
  const dropoff = new THREE.Group();
  dropoff.name = "shopping-mall-main-dropoff";
  dropoff.userData = { pedestrianCoreClearWidth: 54 * SHOPPING_MALL_SCALE, separatedFromEntry: true };
  for (const x of [-42, 42]) {
    const layby = mallMesh(new THREE.BoxGeometry(26, 0.11, 9), asphalt, "shopping-mall-dropoff-layby", "exterior");
    layby.position.set(x, 0.5, 47);
    dropoff.add(layby);
  }
  mall.add(dropoff);
  const entryPlaza = mallMesh(new THREE.BoxGeometry(54, 0.13, 14), paving, "shopping-mall-pedestrian-entry-plaza", "exterior");
  entryPlaza.position.set(0, GROUND_FINISH_Y - 0.065, 47);
  mall.add(entryPlaza);
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 9; bay += 1) {
      const parking = mallMesh(new THREE.BoxGeometry(2.35, 0.04, 5.1), asphalt, "shopping-mall-parking-space", "exterior");
      parking.position.set(side * 68, 0.53, -32 + bay * 8);
      mall.add(parking);
      const stripe = mallMesh(new THREE.BoxGeometry(0.08, 0.025, 5), ivory, "shopping-mall-parking-line", "exterior");
      stripe.position.set(side * 66.8, 0.57, -32 + bay * 8);
      mall.add(stripe);
    }
  }

  type Wing = { group: THREE.Group; width: number; depth: number; floors: number; innerSide: "+x" | "-x" | "+z" | "-z"; outerSide: "+x" | "-x" | "+z" | "-z" };
  const addWing = ({ name, x, z, width, depth, floors, innerSide, outerSide }: {
    name: string; x: number; z: number; width: number; depth: number; floors: number; innerSide: Wing["innerSide"]; outerSide: Wing["outerSide"];
  }): Wing => {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, z);
    group.userData.zone = "lifestyle";
    mall.add(group);
    const pitch = FLOOR_PITCH;
    const height = floors * pitch;
    const horizontalWing = width >= depth;
    const longLength = horizontalWing ? width : depth;
    const shortLength = horizontalWing ? depth : width;
    const innerSign = innerSide === "+x" || innerSide === "+z" ? 1 : -1;
    const outerSign = outerSide === "+x" || outerSide === "+z" ? 1 : -1;
    const stairLongOffsets = [-longLength * 0.5 + 8.2, longLength * 0.5 - 8.2];
    const upperEntryOffsets = name.includes("southwest")
      ? [0, 16]
      : name.includes("southeast")
        ? [0, -16]
        : [-8, 8];
    const core = new THREE.Group();
    core.name = "shopping-mall-building-core";
    core.userData = { segmented: true, openRetailPerimeter: true };
    const compactShell = new THREE.Group();
    compactShell.name = "shopping-mall-compact-core-shell";
    compactShell.userData = { uShaped: true, openLiftLobby: true, openSide: innerSide, groundedAt: GROUND_FINISH_Y };
    const coreWallHeight = height - 0.2;
    const coreLong = 7.2;
    const coreShort = 4.8;
    for (const end of [-1, 1]) {
      const endWall = mallMesh(
        new THREE.BoxGeometry(horizontalWing ? 0.12 : coreShort, coreWallHeight, horizontalWing ? coreShort : 0.12),
        ivory,
        "shopping-mall-compact-core-wall",
        "interior",
      );
      endWall.position.set(horizontalWing ? end * (coreLong * 0.5 - 0.06) : 0, GROUND_FINISH_Y + coreWallHeight * 0.5, horizontalWing ? 0 : end * (coreLong * 0.5 - 0.06));
      compactShell.add(endWall);
    }
    const rearWall = mallMesh(
      new THREE.BoxGeometry(horizontalWing ? coreLong : 0.12, coreWallHeight, horizontalWing ? 0.12 : coreLong),
      ivory,
      "shopping-mall-compact-core-wall",
      "interior",
    );
    rearWall.position.set(
      horizontalWing ? 0 : -innerSign * (coreShort * 0.5 - 0.06),
      GROUND_FINISH_Y + coreWallHeight * 0.5,
      horizontalWing ? -innerSign * (coreShort * 0.5 - 0.06) : 0,
    );
    compactShell.add(rearWall);
    core.add(compactShell);
    group.add(core);
    cutawayShell.push(core);

    const addSlabPiece = (slab: THREE.Group, length: number, shortSpan: number, longCenter: number, shortCenter: number, floor: number) => {
      if (length <= 0.08 || shortSpan <= 0.08) return;
      const piece = mallMesh(
        new THREE.BoxGeometry(horizontalWing ? length : shortSpan, 0.18, horizontalWing ? shortSpan : length),
        stone,
        "shopping-mall-interior-floor-slab-piece",
        "lifestyle",
      );
      piece.position.set(horizontalWing ? longCenter : shortCenter, GROUND_SLAB_TOP - 0.09 + floor * pitch, horizontalWing ? shortCenter : longCenter);
      piece.userData = { floorNumber: floor + 1, partOfOpeningSlab: floor > 0 };
      slab.add(piece);
    };
    for (let floor = 0; floor < floors; floor += 1) {
      const slab = new THREE.Group();
      slab.name = "shopping-mall-interior-floor-slab";
      slab.userData = { floorNumber: floor + 1, structuralTopY: GROUND_SLAB_TOP + floor * pitch };
      group.add(slab);
      const usableLong = longLength - 1.8;
      const usableShort = shortLength - 1.8;
      if (floor === 0) {
        addSlabPiece(slab, usableLong, usableShort, 0, 0, floor);
        continue;
      }
      const openings = [
        { center: stairLongOffsets[0], width: 3.7, depth: 4.2, type: "fire-stair" },
        { center: 0, width: 3.3, depth: 3.3, type: "lift" },
        { center: stairLongOffsets[1], width: 3.7, depth: 4.2, type: "fire-stair" },
      ].sort((a, b) => a.center - b.center);
      const halfLong = usableLong * 0.5;
      const halfShort = usableShort * 0.5;
      let cursor = -halfLong;
      for (const opening of openings) {
        const start = Math.max(-halfLong, opening.center - opening.width * 0.5);
        const end = Math.min(halfLong, opening.center + opening.width * 0.5);
        addSlabPiece(slab, start - cursor, usableShort, (cursor + start) * 0.5, 0, floor);
        const sideDepth = halfShort - opening.depth * 0.5;
        addSlabPiece(slab, end - start, sideDepth, opening.center, -(opening.depth * 0.5 + sideDepth * 0.5), floor);
        addSlabPiece(slab, end - start, sideDepth, opening.center, opening.depth * 0.5 + sideDepth * 0.5, floor);
        const openingMarker = new THREE.Group();
        openingMarker.name = "shopping-mall-vertical-circulation-floor-opening";
        openingMarker.position.set(horizontalWing ? opening.center : 0, GROUND_SLAB_TOP + floor * pitch, horizontalWing ? 0 : opening.center);
        openingMarker.userData = { floorNumber: floor + 1, openingType: opening.type, clearWidth: opening.width, clearDepth: opening.depth };
        slab.add(openingMarker);
        cursor = end;
      }
      addSlabPiece(slab, halfLong - cursor, usableShort, (cursor + halfLong) * 0.5, 0, floor);
    }
    const roof = mallMesh(new THREE.BoxGeometry(width + 0.5, 0.34, depth + 0.5), charcoal, "shopping-mall-flat-roof", "lifestyle");
    roof.position.y = GROUND_SLAB_TOP + height + 0.17;
    group.add(roof);
    cutawayShell.push(roof);
    for (let floor = 1; floor < floors; floor += 1) {
      const band = mallMesh(new THREE.BoxGeometry(width + 0.12, 0.32, depth + 0.12), terracotta, "shopping-mall-floor-band", "lifestyle");
      band.position.y = GROUND_SLAB_TOP + floor * pitch;
      group.add(band);
      cutawayShell.push(band);
    }
    const facadeSides: Wing["innerSide"][] = ["+x", "-x", "+z", "-z"];
    facadeSides.forEach((side) => {
      const horizontal = side.endsWith("z");
      const length = horizontal ? width : depth;
      const bays = Math.max(3, Math.floor(length / 6.5));
      const bayWidth = length / bays;
      const addCurtainPane = (offset: number, span: number, floor: number, panelHeight = 3.72, centerY = 2.65 + floor * pitch) => {
        if (span <= 0.18 || panelHeight <= 0.18) return;
        const pane = mallMesh(
          new THREE.BoxGeometry(horizontal ? span : 0.16, panelHeight, horizontal ? 0.16 : span),
          curtainGlass,
          "shopping-mall-glass-curtain-panel",
          floor === 0 ? "exterior" : "upper-arcade",
        );
        pane.position.set(
          horizontal ? offset : side === "+x" ? width * 0.5 + 0.11 : -width * 0.5 - 0.11,
          centerY,
          horizontal ? side === "+z" ? depth * 0.5 + 0.11 : -depth * 0.5 - 0.11 : offset,
        );
        pane.userData.facadeSide = side;
        group.add(pane);
        cutawayShell.push(pane);
      };
      for (let floor = 0; floor < floors; floor += 1) {
        // On the courtyard and street elevations the ground-floor shopfronts
        // themselves form the curtain wall. End elevations remain fully glazed.
        if (floor === 0 && (side === innerSide || side === outerSide)) continue;
        for (let bay = 0; bay < bays; bay += 1) {
          const offset = -length * 0.5 + (bay + 0.5) * bayWidth;
          const paneStart = offset - bayWidth * 0.5 + 0.12;
          const paneEnd = offset + bayWidth * 0.5 - 0.12;
          const upperEntryOffset = floor === 1 && side === innerSide
            ? upperEntryOffsets.find((entryOffset) => entryOffset + 0.95 > paneStart && entryOffset - 0.95 < paneEnd)
            : undefined;
          const loadingOpening = name.includes("north-anchor") && floor === 0 && (side === "+x" || side === "-x")
            ? { center: -3.6, halfWidth: 2.05, height: 3.2 }
            : undefined;
          const opening = upperEntryOffset !== undefined
            ? { center: upperEntryOffset, halfWidth: 0.95, height: 2.55 }
            : loadingOpening;
          if (!opening || opening.center + opening.halfWidth <= paneStart || opening.center - opening.halfWidth >= paneEnd) {
            addCurtainPane(offset, bayWidth - 0.24, floor);
            continue;
          }
          const openingStart = Math.max(paneStart, opening.center - opening.halfWidth);
          const openingEnd = Math.min(paneEnd, opening.center + opening.halfWidth);
          addCurtainPane((paneStart + openingStart) * 0.5, openingStart - paneStart, floor);
          addCurtainPane((openingEnd + paneEnd) * 0.5, paneEnd - openingEnd, floor);
          const panelTop = 2.65 + floor * pitch + 1.86;
          const openingBottom = floor === 1 ? floorFinishY(1) : GROUND_FINISH_Y;
          const transomBottom = openingBottom + opening.height;
          addCurtainPane((openingStart + openingEnd) * 0.5, openingEnd - openingStart, floor, panelTop - transomBottom, (panelTop + transomBottom) * 0.5);
        }
      }
      for (let bay = 0; bay <= bays; bay += 1) {
        const offset = -length * 0.5 + bay * bayWidth;
        const shopElevation = side === innerSide || side === outerSide;
        const loadingOpeningMullion = name.includes("north-anchor")
          && (side === "+x" || side === "-x")
          && Math.abs(offset + 3.6) < 2.2;
        const upperEntryMullion = side === innerSide
          && upperEntryOffsets.some((entryOffset) => Math.abs(offset - entryOffset) < 1.06);
        const raisedMullion = shopElevation || loadingOpeningMullion;
        const mullionBottom = upperEntryMullion
          ? floorFinishY(1) + 2.73
          : raisedMullion
            ? floorFinishY(1) + 0.08
            : 0.78;
        const mullionTop = GROUND_SLAB_TOP + height - 0.28;
        const mullionHeight = mullionTop - mullionBottom;
        const mullion = mallMesh(
          new THREE.BoxGeometry(horizontal ? 0.18 : 0.24, mullionHeight, horizontal ? 0.24 : 0.18),
          charcoal,
          "shopping-mall-curtain-wall-mullion",
          "lifestyle",
        );
        mullion.position.set(
          horizontal ? offset : side === "+x" ? width * 0.5 + 0.2 : -width * 0.5 - 0.2,
          mullionBottom + mullionHeight * 0.5,
          horizontal ? side === "+z" ? depth * 0.5 + 0.2 : -depth * 0.5 - 0.2 : offset,
        );
        mullion.userData = { startsAboveStorefront: shopElevation, clearsLoadingOpening: loadingOpeningMullion, clearsUpperEntry: upperEntryMullion };
        group.add(mullion);
        cutawayShell.push(mullion);
      }
    });

    for (const offset of upperEntryOffsets) {
      const portal = new THREE.Group();
      portal.name = "shopping-mall-upper-entry-portal";
      portal.userData = { floorNumber: 2, connectsInnerFacadeToGallery: true, wingName: name };
      const horizontal = innerSide.endsWith("z");
      const sideSign = innerSide.startsWith("+") ? 1 : -1;
      const facadeX = horizontal ? offset : sideSign * (width * 0.5 + 0.13);
      const facadeZ = horizontal ? sideSign * (depth * 0.5 + 0.13) : offset;
      const door = mallMesh(
        new THREE.BoxGeometry(horizontal ? 1.7 : 0.1, 2.55, horizontal ? 0.1 : 1.7),
        glass,
        "shopping-mall-upper-entry-door",
        "upper-arcade",
      );
      door.position.set(facadeX, floorFinishY(1) + 1.275, facadeZ);
      door.userData = { floorNumber: 2, clearWidth: 1.7, thresholdFree: true, connectsUpperArcade: true };
      portal.add(door);
      for (const frameOffset of [-0.94, 0.94]) {
        const post = mallMesh(
          new THREE.BoxGeometry(horizontal ? 0.12 : 0.16, 2.72, horizontal ? 0.16 : 0.12),
          charcoal,
          "shopping-mall-upper-entry-frame",
          "upper-arcade",
        );
        post.position.set(horizontal ? facadeX + frameOffset : facadeX, floorFinishY(1) + 1.36, horizontal ? facadeZ : facadeZ + frameOffset);
        portal.add(post);
      }
      const header = mallMesh(
        new THREE.BoxGeometry(horizontal ? 2 : 0.16, 0.18, horizontal ? 0.16 : 2),
        charcoal,
        "shopping-mall-upper-entry-frame",
        "upper-arcade",
      );
      header.position.set(facadeX, floorFinishY(1) + 2.64, facadeZ);
      const threshold = mallMesh(
        new THREE.BoxGeometry(horizontal ? 2.1 : 2.6, 0.08, horizontal ? 2.6 : 2.1),
        sand,
        "shopping-mall-upper-entry-threshold",
        "upper-arcade",
      );
      threshold.position.set(
        horizontal ? offset : sideSign * (width * 0.5 + 0.6),
        floorFinishY(1) - 0.04,
        horizontal ? sideSign * (depth * 0.5 + 0.6) : offset,
      );
      threshold.userData = { floorNumber: 2, barrierFree: true, bridgesFacadeToGallery: true };
      portal.add(header, threshold);
      group.add(portal);
    }

    const servesFloors = Array.from({ length: floors }, (_, index) => index + 1);
    const positionOnWingAxes = (object: THREE.Object3D, long: number, short: number, y: number) => {
      object.position.set(horizontalWing ? long : short, y, horizontalWing ? short : long);
    };
    const wingAxisVector = (long: number, y: number, short: number) => new THREE.Vector3(
      horizontalWing ? long : short,
      y,
      horizontalWing ? short : long,
    );
    const wingAxisBox = (long: number, vertical: number, short: number) => new THREE.BoxGeometry(
      horizontalWing ? long : short,
      vertical,
      horizontalWing ? short : long,
    );
    const serviceCore = new THREE.Group();
    serviceCore.name = "shopping-mall-service-core";
    serviceCore.userData = {
      wingName: name,
      servesFloors,
      backOfHouseWidth: 2.2,
      connectedToGroundExit: true,
      upperPublicLinksPerFloor: 3,
    };
    group.add(serviceCore);

    for (let level = 0; level < floors; level += 1) {
      const serviceCorridor = mallMesh(
        new THREE.BoxGeometry(horizontalWing ? width - 11 : 2.2, 0.04, horizontalWing ? 2.2 : depth - 11),
        paleTile,
        "shopping-mall-back-of-house-corridor",
        "interior",
      );
      serviceCorridor.position.set(horizontalWing ? 0 : -3.6, floorFinishY(level) - 0.02, horizontalWing ? -3.6 : 0);
      serviceCorridor.userData = { floorNumber: level + 1, clearWidth: 2.2, staffOnly: true, continuous: true, routedAroundCore: true };
      group.add(serviceCorridor);
    }

    const lift = new THREE.Group();
    lift.name = "shopping-mall-accessible-lift";
    lift.userData = { wingName: name, accessible: true, barrierFree: true, servesFloors };
    serviceCore.add(lift);
    const liftShaft = new THREE.Group();
    liftShaft.name = "shopping-mall-lift-shaft";
    liftShaft.userData = { openFrame: true, groundedAt: GROUND_FINISH_Y, doorOpeningsAtEveryFloor: true };
    const shaftHeight = height - 0.2;
    for (const postX of [-1.15, 1.15]) {
      for (const postZ of [-1.15, 1.15]) {
        const post = mallMesh(new THREE.BoxGeometry(0.16, shaftHeight, 0.16), charcoal, "shopping-mall-lift-shaft-post", "interior");
        post.position.set(postX, GROUND_FINISH_Y + shaftHeight * 0.5, postZ);
        liftShaft.add(post);
      }
    }
    for (let level = 0; level < floors; level += 1) {
      const beam = mallMesh(new THREE.BoxGeometry(2.46, 0.14, 0.14), charcoal, "shopping-mall-lift-shaft-beam", "interior");
      beam.position.set(0, floorFinishY(level) + 2.55, -1.15);
      liftShaft.add(beam);
    }
    lift.add(liftShaft);
    const liftCar = mallMesh(new THREE.BoxGeometry(2.05, 2.55, 2.05), glass, "shopping-mall-lift-car", "interior");
    liftCar.position.y = GROUND_FINISH_Y + 1.275;
    lift.add(liftCar);
    const liftLandingSillGeometry = wingAxisBox(1.7, 0.06, 0.6);
    for (let level = 0; level < floors; level += 1) {
      const door = mallMesh(
        new THREE.BoxGeometry(horizontalWing ? 1.55 : 0.08, 2.25, horizontalWing ? 0.08 : 1.55),
        escalatorMetal,
        "shopping-mall-lift-door",
        "interior",
      );
      positionOnWingAxes(door, 0, innerSign * 1.32, floorFinishY(level) + 1.125);
      door.userData = { floorNumber: level + 1, clearWidth: 1.4, accessible: true };
      lift.add(door);
      const landingSill = mallMesh(
        liftLandingSillGeometry,
        paleTile,
        "shopping-mall-lift-landing-sill",
        "interior",
      );
      positionOnWingAxes(landingSill, 0, innerSign * 1.34, floorFinishY(level) - 0.03);
      landingSill.userData = { floorNumber: level + 1, thresholdFree: true, connectsCarToLobby: true };
      lift.add(landingSill);
      const liftSign = mallMesh(
        wingAxisBox(0.65, 0.34, 0.06),
        warmLamp,
        "shopping-mall-lift-floor-indicator",
        "interior",
      );
      positionOnWingAxes(liftSign, 1.12, innerSign * 1.37, floorFinishY(level) + 2.25);
      lift.add(liftSign);
    }

    const stairTreadGeometry = wingAxisBox(1.34, 0.14, 0.28);
    const intermediateLandingGeometry = wingAxisBox(3.25, 0.16, 0.55);
    const upperLandingGeometry = wingAxisBox(3.25, 0.16, 0.82);
    const fireDoorGeometry = wingAxisBox(1.35, 2.25, 0.1);
    const fireExitSignGeometry = wingAxisBox(0.9, 0.34, 0.08);
    stairLongOffsets.forEach((longOffset, stairIndex) => {
      const stair = new THREE.Group();
      stair.name = "shopping-mall-fire-stair";
      positionOnWingAxes(stair, longOffset, 0, 0);
      const riserCountPerStorey = 24;
      const riserHeight = FLOOR_PITCH / riserCountPerStorey;
      stair.userData = {
        wingName: name,
        stairIndex,
        servesFloors,
        groundExit: true,
        groundExitSide: outerSide,
        enclosed: true,
        twoFlight: true,
        riserCountPerStorey,
        riserHeight,
        clearFlightWidth: 1.34,
      };
      serviceCore.add(stair);

      const enclosureHeight = height - 0.04;
      for (const wallLong of [-1.74, 1.74]) {
        const wall = mallMesh(
          wingAxisBox(0.12, enclosureHeight, 4.08),
          interiorWall,
          "shopping-mall-fire-stair-enclosure-wall",
          "interior",
        );
        positionOnWingAxes(wall, wallLong, 0, GROUND_FINISH_Y + enclosureHeight * 0.5);
        wall.userData = { wallSide: "flight-side", fireRated: true };
        stair.add(wall);
      }

      const addDoorWall = (shortSide: number, doorLevels: number[]) => {
        const clearDoorWidth = 1.45;
        const sidePanelWidth = (3.6 - clearDoorWidth) * 0.5;
        for (const wallLong of [-(clearDoorWidth + sidePanelWidth) * 0.5, (clearDoorWidth + sidePanelWidth) * 0.5]) {
          const sidePanel = mallMesh(
            wingAxisBox(sidePanelWidth, enclosureHeight, 0.12),
            interiorWall,
            "shopping-mall-fire-stair-enclosure-wall",
            "interior",
          );
          positionOnWingAxes(sidePanel, wallLong, shortSide * 2.02, GROUND_FINISH_Y + enclosureHeight * 0.5);
          sidePanel.userData = { wallSide: shortSide === innerSign ? "public-lobby" : "exit-side", fireRated: true };
          stair.add(sidePanel);
        }
        for (let level = 0; level < floors; level += 1) {
          const hasDoor = doorLevels.includes(level);
          const bandHeight = hasDoor ? FLOOR_PITCH - 2.3 : FLOOR_PITCH;
          const bandBottom = floorFinishY(level) + (hasDoor ? 2.3 : 0);
          const topPanel = mallMesh(
            wingAxisBox(clearDoorWidth, Math.max(0.1, bandHeight - (level === floors - 1 ? 0.04 : 0)), 0.12),
            interiorWall,
            "shopping-mall-fire-stair-enclosure-wall",
            "interior",
          );
          positionOnWingAxes(topPanel, 0, shortSide * 2.02, bandBottom + Math.max(0.1, bandHeight - (level === floors - 1 ? 0.04 : 0)) * 0.5);
          topPanel.userData = { wallSide: shortSide === innerSign ? "public-lobby" : "exit-side", floorNumber: level + 1, fireRated: true };
          stair.add(topPanel);
        }
      };
      addDoorWall(innerSign, Array.from({ length: floors }, (_, level) => level));
      addDoorWall(outerSign, [0]);

      for (let level = 0; level < floors - 1; level += 1) {
        const levelBase = floorFinishY(level);
        for (let flightIndex = 0; flightIndex < 2; flightIndex += 1) {
          const flightLong = flightIndex === 0 ? -0.76 : 0.76;
          const shortStart = flightIndex === 0 ? innerSign * 1.48 : -innerSign * 1.28;
          const shortEnd = flightIndex === 0 ? -innerSign * 1.28 : innerSign * 1.48;
          for (let stepIndex = 0; stepIndex < 12; stepIndex += 1) {
            const t = (stepIndex + 0.5) / 12;
            const riseIndex = flightIndex * 12 + stepIndex + 1;
            const tread = mallMesh(
              stairTreadGeometry,
              stone,
              "shopping-mall-fire-stair-tread",
              "interior",
            );
            positionOnWingAxes(
              tread,
              flightLong,
              THREE.MathUtils.lerp(shortStart, shortEnd, t),
              levelBase + riseIndex * riserHeight - 0.07,
            );
            tread.userData = { floorNumber: level + 1, flightNumber: flightIndex + 1, riserIndex: riseIndex };
            stair.add(tread);
          }
          for (const railLong of [flightLong - 0.67, flightLong + 0.67]) {
            const railStartRise = flightIndex === 0 ? 1 : 12;
            const railEndRise = flightIndex === 0 ? 12 : 24;
            const rail = mallMesh(
              new THREE.TubeGeometry(
                new THREE.LineCurve3(
                  wingAxisVector(railLong, levelBase + railStartRise * riserHeight + 0.92, shortStart),
                  wingAxisVector(railLong, levelBase + railEndRise * riserHeight + 0.92, shortEnd),
                ),
                1,
                0.05,
                7,
                false,
              ),
              charcoal,
              "shopping-mall-fire-stair-handrail",
              "interior",
            );
            stair.add(rail);
          }
        }
        const intermediateLanding = mallMesh(
          intermediateLandingGeometry,
          stone,
          "shopping-mall-fire-stair-landing",
          "interior",
        );
        positionOnWingAxes(intermediateLanding, 0, -innerSign * 1.58, levelBase + FLOOR_PITCH * 0.5 - 0.08);
        intermediateLanding.userData = { floorNumber: level + 1, landingType: "intermediate", connectsFlights: true };
        stair.add(intermediateLanding);
        const upperLanding = mallMesh(
          upperLandingGeometry,
          stone,
          "shopping-mall-fire-stair-landing",
          "interior",
        );
        positionOnWingAxes(upperLanding, 0, innerSign * 1.58, floorFinishY(level + 1) - 0.08);
        upperLanding.userData = { floorNumber: level + 2, landingType: "upper", connectsToFireDoor: true };
        stair.add(upperLanding);
      }

      for (let level = 0; level < floors; level += 1) {
        const fireDoor = mallMesh(
          fireDoorGeometry,
          terracotta,
          "shopping-mall-fire-stair-door",
          "interior",
        );
        positionOnWingAxes(fireDoor, 0, innerSign * 2.04, floorFinishY(level) + 1.125);
        fireDoor.userData = { floorNumber: level + 1, clearWidth: 1.35, fireRated: true, selfClosing: true, opensToPublicLink: level > 0 };
        stair.add(fireDoor);
        const exitSign = mallMesh(
          fireExitSignGeometry,
          emergencyGreen,
          "shopping-mall-emergency-exit-sign",
          "interior",
        );
        positionOnWingAxes(exitSign, 0, innerSign * 2.1, floorFinishY(level) + 2.55);
        exitSign.userData = { floorNumber: level + 1, facesPublicLobby: true };
        stair.add(exitSign);
      }

      const enclosureExitDoor = mallMesh(
        fireDoorGeometry,
        terracotta,
        "shopping-mall-fire-stair-ground-exit-door",
        "interior",
      );
      positionOnWingAxes(enclosureExitDoor, 0, outerSign * 2.04, GROUND_FINISH_Y + 1.125);
      enclosureExitDoor.userData = { clearWidth: 1.35, fireRated: true, exitsToward: outerSide };
      stair.add(enclosureExitDoor);

      const exitRun = shortLength * 0.5 - 2.1;
      const groundExitCorridor = mallMesh(
        wingAxisBox(1.8, 0.04, exitRun),
        paleTile,
        "shopping-mall-fire-stair-ground-exit-corridor",
        "interior",
      );
      positionOnWingAxes(groundExitCorridor, longOffset, outerSign * (2.1 + exitRun * 0.5), GROUND_FINISH_Y - 0.02);
      groundExitCorridor.userData = { stairIndex, wingName: name, clearWidth: 1.8, directToExterior: true, exitSide: outerSide };
      group.add(groundExitCorridor);

      const exteriorExitDoor = mallMesh(
        wingAxisBox(1.55, 2.45, 0.12),
        emergencyGreen,
        "shopping-mall-fire-stair-exterior-exit-door",
        "interior",
      );
      positionOnWingAxes(exteriorExitDoor, longOffset, outerSign * (shortLength * 0.5 + 0.08), GROUND_FINISH_Y + 1.225);
      exteriorExitDoor.userData = { stairIndex, wingName: name, clearWidth: 1.55, finalExit: true, facadeSide: outerSide };
      group.add(exteriorExitDoor);
    });

    for (let level = 1; level < floors; level += 1) {
      const upperZone = new THREE.Group();
      upperZone.name = "shopping-mall-upper-interior-zone";
      upperZone.userData = {
        wingName: name,
        floorNumber: level + 1,
        accessible: true,
        connectedToServiceCore: true,
        clearCorridorWidth: 3.1,
        serviceCoreLinkCount: 3,
      };
      group.add(upperZone);
      const corridorShort = innerSign * (shortLength * 0.5 - 2.05);
      const corridor = mallMesh(
        new THREE.BoxGeometry(horizontalWing ? width - 8 : 3.1, 0.04, horizontalWing ? 3.1 : depth - 8),
        interiorFloor,
        "shopping-mall-upper-interior-corridor",
        "interior",
      );
      positionOnWingAxes(corridor, 0, corridorShort, floorFinishY(level) - 0.02);
      corridor.userData = { floorNumber: level + 1, clearWidth: 3.1, barrierFree: true, furnitureFree: true };
      upperZone.add(corridor);

      const corridorCoreEdge = innerSign * (Math.abs(corridorShort) - 1.55);
      for (const link of [
        { long: stairLongOffsets[0], openingEdge: 2.1, clearWidth: 1.8, destination: "fire-stair", stairIndex: 0 },
        { long: 0, openingEdge: 1.34, clearWidth: 2.4, destination: "accessible-lift", stairIndex: undefined },
        { long: stairLongOffsets[1], openingEdge: 2.1, clearWidth: 1.8, destination: "fire-stair", stairIndex: 1 },
      ] as const) {
        const openingEdge = innerSign * link.openingEdge;
        const linkLength = Math.abs(corridorCoreEdge - openingEdge);
        const coreLink = mallMesh(
          wingAxisBox(link.clearWidth, 0.04, linkLength),
          paleTile,
          "shopping-mall-upper-core-link",
          "interior",
        );
        positionOnWingAxes(coreLink, link.long, (corridorCoreEdge + openingEdge) * 0.5, floorFinishY(level) - 0.02);
        coreLink.userData = {
          floorNumber: level + 1,
          destination: link.destination,
          stairIndex: link.stairIndex,
          clearWidth: link.clearWidth,
          barrierFree: link.destination === "accessible-lift",
          levelTransition: false,
          connectsPublicCorridor: true,
        };
        upperZone.add(coreLink);
      }

      const furnishingShort = corridorShort - innerSign * 2.55;
      const addFurnishingPocket = (long: number, pocketLong: number, type: string) => {
        const pocket = new THREE.Group();
        pocket.name = "shopping-mall-upper-furnishing-pocket";
        positionOnWingAxes(pocket, long, furnishingShort, floorFinishY(level));
        pocket.userData = { floorNumber: level + 1, furnishingType: type, outsideClearCorridor: true };
        const finish = mallMesh(
          wingAxisBox(pocketLong, 0.025, 1.55),
          paleTile,
          "shopping-mall-upper-furnishing-pocket-floor",
          "interior",
        );
        finish.position.y = -0.0125;
        pocket.add(finish);
        upperZone.add(pocket);
        return pocket;
      };
      for (const seatOffset of [-5.2, 5.2]) {
        const pocket = addFurnishingPocket(seatOffset, 2.8, "lounge-bench");
        const bench = new THREE.Group();
        bench.name = "shopping-mall-upper-lounge-bench";
        bench.userData = { floorNumber: level + 1, supportedToFloor: true, outsideClearCorridor: true };
        const seat = mallMesh(wingAxisBox(2.2, 0.16, 0.62), upholstery, "shopping-mall-upper-bench-seat", "interior");
        seat.position.y = 0.48;
        const back = mallMesh(wingAxisBox(2.2, 0.72, 0.16), upholstery, "shopping-mall-upper-bench-back", "interior");
        positionOnWingAxes(back, 0, -innerSign * 0.3, 0.76);
        bench.add(seat, back);
        for (const supportOffset of [-0.72, 0.72]) {
          const support = mallMesh(wingAxisBox(0.14, 0.4, 0.48), brass, "shopping-mall-upper-bench-support", "interior");
          positionOnWingAxes(support, supportOffset, 0, 0.2);
          bench.add(support);
        }
        pocket.add(bench);
      }
      const furnishingOffset = longLength > 60 ? 13 : 8.4;
      const directoryPocket = addFurnishingPocket(-furnishingOffset, 2.2, "floor-directory");
      const directory = mallMesh(wingAxisBox(1.15, 2.1, 0.16), warmWindow, "shopping-mall-floor-directory", "interior");
      directory.position.y = 1.05;
      directory.userData = { floorNumber: level + 1, includesAccessibleRoutes: true, grounded: true, outsideClearCorridor: true };
      directoryPocket.add(directory);
      const planterPocket = addFurnishingPocket(furnishingOffset, 2.2, "interior-planter");
      const interiorPlanter = new THREE.Group();
      interiorPlanter.name = "shopping-mall-interior-planter";
      interiorPlanter.userData = { floorNumber: level + 1, outsideClearCorridor: true };
      const planterPot = mallMesh(new THREE.CylinderGeometry(0.48, 0.58, 0.72, 10), stone, "shopping-mall-interior-planter-pot", "interior");
      planterPot.position.y = 0.36;
      const plantCrown = mallMesh(new THREE.DodecahedronGeometry(0.72, 0), foliage, "shopping-mall-interior-plant-crown", "interior");
      plantCrown.position.y = 1.2;
      interiorPlanter.add(planterPot, plantCrown);
      planterPocket.add(interiorPlanter);
      const luminaire = mallMesh(
        wingAxisBox(7.2, 0.08, 0.32),
        warmLamp,
        "shopping-mall-interior-luminaire",
        "interior",
      );
      positionOnWingAxes(luminaire, 0, corridorShort, floorFinishY(level) + 3.62);
      luminaire.userData = { floorNumber: level + 1, suspendedFromStructure: true };
      upperZone.add(luminaire);
      const ceilingUnderside = level < floors - 1 ? floorFinishY(level + 1) - 0.22 : GROUND_SLAB_TOP + height;

      // Neutral-white bands just inside both glass elevations reveal the
      // occupied upper floors while leaving the curtain glass itself dark.
      for (const facadeSign of [-1, 1]) {
        const facadeWash = registerNightFixture(
          mallMesh(
            wingAxisBox(Math.max(5, longLength - 9), 2.82, 0.08),
            (level + (facadeSign > 0 ? 1 : 0)) % 2 === 0 ? nightWarm : nightCool,
            "shopping-mall-night-facade-wash-light",
            "upper-arcade",
          ),
          "facade",
          "wall",
          floorFinishY(level),
        );
        positionOnWingAxes(
          facadeWash,
          0,
          facadeSign * (shortLength * 0.5 - 0.34),
          floorFinishY(level) + 1.72,
        );
        facadeWash.userData.floorNumber = level + 1;
        facadeWash.userData.wingName = name;
        upperZone.add(facadeWash);
        cutawayShell.push(facadeWash);
      }
      const mountBottom = floorFinishY(level) + 3.66;
      const mountHeight = Math.max(0.12, ceilingUnderside - mountBottom);
      for (const mountOffset of [-2.8, 2.8]) {
        const mount = mallMesh(
          new THREE.BoxGeometry(0.07, mountHeight, 0.07),
          charcoal,
          "shopping-mall-interior-luminaire-mount",
          "interior",
        );
        positionOnWingAxes(mount, mountOffset, corridorShort, mountBottom + mountHeight * 0.5);
        mount.userData = { floorNumber: level + 1, connectedToCeiling: true };
        upperZone.add(mount);
      }
    }
    return { group, width, depth, floors, innerSide, outerSide };
  };

  const north = addWing({ name: "shopping-mall-north-anchor", x: 0, z: -38, width: 108, depth: 20, floors: 4, innerSide: "+z", outerSide: "-z" });
  const west = addWing({ name: "shopping-mall-west-wing", x: -56, z: 0, width: 20, depth: 56, floors: 3, innerSide: "+x", outerSide: "-x" });
  const east = addWing({ name: "shopping-mall-east-wing", x: 56, z: 0, width: 20, depth: 56, floors: 3, innerSide: "-x", outerSide: "+x" });
  const southWest = addWing({ name: "shopping-mall-southwest-wing", x: -34, z: 37, width: 42, depth: 20, floors: 3, innerSide: "-z", outerSide: "+z" });
  const southEast = addWing({ name: "shopping-mall-southeast-wing", x: 34, z: 37, width: 42, depth: 20, floors: 3, innerSide: "-z", outerSide: "+z" });
  const wings = [north, west, east, southWest, southEast];

  // A few broad, shadow-free sources provide actual illumination behind the
  // glowing shop and floor proxies. Keeping these clustered by wing avoids
  // the cost of one real light per shop while still making the whole complex
  // read as occupied.
  wings.forEach((wing) => {
    const horizontalWing = wing.width >= wing.depth;
    const longLength = horizontalWing ? wing.width : wing.depth;
    const storefrontOffsets = longLength > 80 ? [-28, 28] : [0];
    storefrontOffsets.forEach((offset) => {
      addNightLightSource(
        wing.group,
        new THREE.Vector3(horizontalWing ? offset : 0, 2.65, horizontalWing ? 0 : offset),
        "storefront",
        0xffc77a,
        4.2,
        longLength > 80 ? 34 : 30,
      );
    });
    addNightLightSource(
      wing.group,
      new THREE.Vector3(0, 1.2 + wing.floors * FLOOR_PITCH * 0.5, 0),
      "facade",
      0xb8dcff,
      3.5,
      Math.max(32, longLength * 0.58),
    );
  });

  const tenants: MallTenant[] = ["fast-food", "coffee", "burger", "milk-tea", "bakery", "convenience", "restaurant", "fashion"];
  let storefrontIndex = 0;
  let exteriorCount = 0;
  let courtyardCount = 0;
  const addStorefront = (wing: Wing, side: Wing["innerSide"], offset: number, tenant: MallTenant, exterior: boolean) => {
    const horizontal = side.endsWith("z");
    const signMaterial = tenantMaterials[tenant];
    const awningMaterial = tenantAwningMaterials[tenant];
    const frontage = 4.6;
    const depth = 0.24;
    const frontX = horizontal ? offset : side === "+x" ? wing.width * 0.5 + 0.16 : -wing.width * 0.5 - 0.16;
    const frontZ = horizontal ? side === "+z" ? wing.depth * 0.5 + 0.16 : -wing.depth * 0.5 - 0.16 : offset;
    const store = new THREE.Group();
    store.name = "shopping-mall-storefront";
    const inwardDirection = side === "+z" ? "-z" : side === "-z" ? "+z" : side === "+x" ? "-x" : "+x";
    store.userData = { tenantType: tenant, exterior, storefrontIndex, frontSide: side, inwardDirection, enterable: true };
    store.position.set(frontX, 0, frontZ);
    wing.group.add(store);
    const window = mallMesh(new THREE.BoxGeometry(horizontal ? 3.05 : depth, 2.55, horizontal ? depth : 3.05), storefrontGlass, "shopping-mall-storefront-glass", exterior ? "exterior" : "courtyard");
    window.position.set(horizontal ? -0.72 : 0, GROUND_FINISH_Y + 1.275, horizontal ? 0 : -0.72);
    const door = mallMesh(new THREE.BoxGeometry(horizontal ? 1.22 : depth + 0.03, 2.55, horizontal ? depth + 0.03 : 1.22), storefrontGlass, "shopping-mall-storefront-door", exterior ? "exterior" : "courtyard");
    door.position.set(horizontal ? 1.58 : 0, GROUND_FINISH_Y + 1.275, horizontal ? 0 : 1.58);
    door.userData = { tenantType: tenant, storefrontIndex, clearWidth: 1.22 * SHOPPING_MALL_SCALE, operable: true, thresholdFree: true };
    const sign = mallMesh(new THREE.BoxGeometry(horizontal ? frontage : 0.3, 0.72, horizontal ? 0.3 : frontage), signMaterial, "shopping-mall-store-sign", exterior ? "exterior" : "courtyard");
    sign.position.y = 3.82;
    const awning = mallMesh(new THREE.BoxGeometry(horizontal ? frontage + 0.5 : 1.45, 0.18, horizontal ? 1.45 : frontage + 0.5), awningMaterial, "shopping-mall-store-awning", exterior ? "exterior" : "courtyard");
    awning.position.set(horizontal ? 0 : side === "+x" ? 0.78 : -0.78, 3.25, horizontal ? side === "+z" ? 0.78 : -0.78 : 0);
    store.add(window, door, sign, awning);
    cutawayShell.push(window, sign, awning);

    // A warm occupied-shop panel sits behind each window. It lights the
    // interior through neutral glass instead of making the glazing itself
    // glow blue, so all 62 businesses read as open after dark.
    const inwardOffset = 0.16;
    const storefrontGlow = registerNightFixture(
      mallMesh(
        new THREE.BoxGeometry(horizontal ? 2.92 : 0.05, 2.38, horizontal ? 0.05 : 2.92),
        nightWarm,
        "shopping-mall-night-storefront-light",
        "interior",
      ),
      "storefront",
      "wall",
      GROUND_FINISH_Y,
    );
    storefrontGlow.position.set(
      horizontal ? -0.72 : side === "+x" ? -inwardOffset : inwardOffset,
      GROUND_FINISH_Y + 1.22,
      horizontal ? side === "+z" ? -inwardOffset : inwardOffset : -0.72,
    );
    storefrontGlow.userData.storefrontIndex = storefrontIndex;
    storefrontGlow.userData.tenantType = tenant;
    store.add(storefrontGlow);
    cutawayShell.push(storefrontGlow);

    const interior = new THREE.Group();
    interior.name = "shopping-mall-store-interior-module";
    interior.rotation.y = side === "+z" ? 0 : side === "-z" ? Math.PI : side === "+x" ? Math.PI * 0.5 : -Math.PI * 0.5;
    interior.userData = {
      tenantType: tenant,
      storefrontIndex,
      enterable: true,
      clearAisleWidth: 1.55,
      interiorDepth: 5.6,
      inwardDirection,
      finishKey: tenant,
    };
    store.add(interior);

    const floor = mallMesh(new THREE.BoxGeometry(4.8, 0.04, 5.6), tenantFloorMaterials[tenant], "shopping-mall-store-floor-finish", "interior");
    floor.position.set(0, GROUND_FINISH_Y - 0.02, -2.8);
    floor.userData = { tenantType: tenant, storefrontIndex, finishKey: tenant, width: 4.8 };
    const backWall = mallMesh(new THREE.BoxGeometry(4.8, 3.96, 0.12), interiorWall, "shopping-mall-store-back-wall", "interior");
    backWall.position.set(0, GROUND_FINISH_Y + 1.98, -5.54);
    const floorAccent = mallMesh(new THREE.BoxGeometry(0.22, 0.018, 5.15), tenantAccentMaterials[tenant], "shopping-mall-store-floor-accent", "interior");
    floorAccent.position.set(2.17, GROUND_FINISH_Y + 0.009, -2.8);
    floorAccent.userData = { tenantType: tenant, storefrontIndex, finishKey: tenant };
    interior.add(floor, backWall, floorAccent);
    for (const partitionX of [-2.34, 2.34]) {
      const partition = mallMesh(new THREE.BoxGeometry(0.12, 3.96, 5.6), interiorWall, "shopping-mall-store-side-partition", "interior");
      partition.position.set(partitionX, GROUND_FINISH_Y + 1.98, -2.8);
      interior.add(partition);
    }

    const doorLocalX = side === "+z" || side === "-x" ? 1.58 : -1.58;
    const clearZone = mallMesh(new THREE.BoxGeometry(1.35, 0.015, 1.9), paleTile, "shopping-mall-store-entry-clear-zone", "interior");
    clearZone.position.set(doorLocalX, GROUND_FINISH_Y + 0.0075, -0.95);
    clearZone.userData = { tenantType: tenant, storefrontIndex, clearWidth: 1.35, clearDepth: 1.9, barrierFree: true };
    interior.add(clearZone);

    const clearAisle = mallMesh(new THREE.BoxGeometry(1.55, 0.006, 4.35), paleTile, "shopping-mall-store-clear-aisle", "interior");
    clearAisle.position.set(0, GROUND_FINISH_Y + 0.003, -3.075);
    clearAisle.userData = { tenantType: tenant, storefrontIndex, clearWidth: 1.55, continuous: true, barrierFree: true };
    const entryLinkWidth = Math.abs(doorLocalX) + 1.32;
    const entryLink = mallMesh(new THREE.BoxGeometry(entryLinkWidth, 0.006, 1.3), paleTile, "shopping-mall-store-clear-aisle-entry-link", "interior");
    entryLink.position.set(doorLocalX * 0.5, GROUND_FINISH_Y + 0.003, -0.95);
    entryLink.userData = { tenantType: tenant, storefrontIndex, connectsDoorToCenterAisle: true, barrierFree: true };
    interior.add(clearAisle, entryLink);

    const checkout = new THREE.Group();
    checkout.name = "shopping-mall-store-checkout-counter";
    checkout.position.set(-Math.sign(doorLocalX) * 1.55, 0, -4.45);
    checkout.userData = { tenantType: tenant, storefrontIndex, supportedToFloor: true, sideMounted: true, clearsCenterAisle: true };
    interior.add(checkout);
    const foodTenant = ["fast-food", "burger", "milk-tea", "coffee", "bakery", "restaurant"].includes(tenant);
    const counter = mallMesh(
      new THREE.BoxGeometry(1.3, 0.9, 0.62),
      foodTenant ? timber : darkWood,
      foodTenant ? "shopping-mall-food-counter" : "shopping-mall-retail-counter",
      "interior",
    );
    counter.position.y = GROUND_FINISH_Y + 0.45;
    const counterTop = mallMesh(new THREE.BoxGeometry(1.4, 0.09, 0.72), foodTenant ? brass : charcoal, "shopping-mall-checkout-countertop", "interior");
    counterTop.position.y = GROUND_FINISH_Y + 0.945;
    const register = mallMesh(new THREE.BoxGeometry(0.38, 0.26, 0.28), charcoal, "shopping-mall-point-of-sale", "interior");
    register.position.set(-0.3, GROUND_FINISH_Y + 1.12, 0);
    checkout.add(counter, counterTop, register);

    const nameplate = mallMesh(new THREE.BoxGeometry(2.65, 0.54, 0.08), signMaterial, "shopping-mall-store-interior-nameplate", "interior");
    nameplate.position.set(0, 3.78, -5.43);
    nameplate.userData = { tenantType: tenant, storefrontIndex, identifiesTenant: true };
    interior.add(nameplate);
    const ceilingLight = mallMesh(new THREE.BoxGeometry(2.8, 0.08, 0.34), warmLamp, "shopping-mall-interior-luminaire", "interior");
    ceilingLight.position.set(0, 4.59, -2.5);
    ceilingLight.userData = { tenantType: tenant, storefrontIndex, mountType: "ceiling" };
    const lightMount = mallMesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), charcoal, "shopping-mall-store-ceiling-light-mount", "interior");
    lightMount.position.set(0, 4.655, -2.5);
    interior.add(ceilingLight, lightMount);

    const addFixture = (fixtureType: string, x: number, z: number, width: number, height: number, fixtureDepth: number, material: THREE.Material) => {
      const fixture = mallMesh(new THREE.BoxGeometry(width, height, fixtureDepth), material, "shopping-mall-tenant-fixture", "interior");
      fixture.position.set(x, GROUND_FINISH_Y + height * 0.5, z);
      fixture.userData = { tenantType: tenant, storefrontIndex, fixtureType, supportedToFloor: true, groundContactY: GROUND_FINISH_Y };
      interior.add(fixture);
      return fixture;
    };
    const addWallDetail = (detailName: string, x: number, y: number, z: number, width: number, height: number, detailDepth: number, material: THREE.Material) => {
      const detail = mallMesh(new THREE.BoxGeometry(width, height, detailDepth), material, detailName, "interior");
      detail.position.set(x, y, z);
      interior.add(detail);
      return detail;
    };

    if (tenant === "fast-food") {
      const kitchenLine = addFixture("kitchen-line", -1.55, -2.55, 1.25, 0.92, 0.72, kitchenSteel);
      const hotplate = mallMesh(new THREE.BoxGeometry(0.72, 0.12, 0.42), charcoal, "shopping-mall-fast-food-hotplate", "interior");
      hotplate.position.y = 0.52;
      kitchenLine.add(hotplate);
      const pickupShelf = addFixture("pickup-shelf", 1.55, -3.0, 1.0, 1.18, 0.5, terracotta);
      const tray = mallMesh(new THREE.BoxGeometry(0.72, 0.08, 0.36), safetyYellow, "shopping-mall-fast-food-tray", "interior");
      tray.position.set(0, 0.63, 0);
      pickupShelf.add(tray);
      const menu = addWallDetail("shopping-mall-menu-board", 0, 3.35, -5.43, 2.55, 0.76, 0.07, warmWindow);
      menu.userData.fixtureFor = "fast-food";
      kitchenLine.userData.hasExtraction = true;
    } else if (tenant === "coffee") {
      const espressoBar = addFixture("espresso-bar", -1.55, -2.6, 1.35, 0.96, 0.7, darkWood);
      const machine = mallMesh(new THREE.BoxGeometry(0.68, 0.42, 0.4), kitchenSteel, "shopping-mall-espresso-machine", "interior");
      machine.position.y = 0.69;
      espressoBar.add(machine);
      const pastryCase = addFixture("pastry-case", 1.55, -3.05, 1.12, 1.06, 0.58, glass);
      const pastryShelf = mallMesh(new THREE.BoxGeometry(0.92, 0.06, 0.46), brass, "shopping-mall-pastry-shelf", "interior");
      pastryShelf.position.y = 0.15;
      pastryCase.add(pastryShelf);
      for (const pendantX of [-0.75, 0, 0.75]) {
        const cord = mallMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.92, 6), charcoal, "shopping-mall-coffee-pendant-cord", "interior");
        cord.position.set(pendantX, 4.22, -3.4);
        const shade = mallMesh(new THREE.ConeGeometry(0.2, 0.28, 10, 1, true), warmLamp, "shopping-mall-coffee-pendant", "interior");
        shade.position.set(pendantX, 3.82, -3.4);
        interior.add(cord, shade);
      }
    } else if (tenant === "burger") {
      const grill = addFixture("grill-line", -1.55, -2.65, 1.25, 0.92, 0.72, kitchenSteel);
      grill.userData.hasExtraction = true;
      addFixture("fryer-station", 1.55, -2.8, 0.95, 0.9, 0.72, charcoal);
      addWallDetail("shopping-mall-burger-exhaust-hood", -1.55, 3.25, -5.205, 1.45, 0.65, 0.55, kitchenSteel);
      addWallDetail("shopping-mall-menu-board", 0.8, 3.35, -5.43, 1.65, 0.72, 0.07, warmWindow);
    } else if (tenant === "milk-tea") {
      const teaBar = addFixture("tea-bar", -1.55, -2.6, 1.28, 0.96, 0.72, darkWood);
      for (const canisterX of [-0.35, 0, 0.35]) {
        const canister = mallMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 8), glass, "shopping-mall-topping-canister", "interior");
        canister.position.set(canisterX, 0.6, 0);
        teaBar.add(canister);
      }
      const cupDisplay = addFixture("cup-display", 1.55, -3.0, 1.05, 1.45, 0.48, sand);
      for (const shelfY of [0.45, 0.85, 1.25]) {
        const shelf = mallMesh(new THREE.BoxGeometry(0.88, 0.05, 0.38), brass, "shopping-mall-cup-display-shelf", "interior");
        shelf.position.y = shelfY - 0.72;
        cupDisplay.add(shelf);
      }
    } else if (tenant === "bakery") {
      const pastryCase = addFixture("glass-pastry-case", -1.55, -2.55, 1.35, 1.08, 0.72, glass);
      const displayTop = mallMesh(new THREE.BoxGeometry(1.15, 0.08, 0.55), brass, "shopping-mall-bakery-display-tray", "interior");
      displayTop.position.y = 0.28;
      pastryCase.add(displayTop);
      const breadRack = addFixture("bread-rack", 1.55, -3.0, 1.05, 1.75, 0.5, timber);
      for (const shelfY of [-0.45, 0, 0.45]) {
        const shelf = mallMesh(new THREE.BoxGeometry(0.9, 0.06, 0.42), sand, "shopping-mall-bread-shelf", "interior");
        shelf.position.y = shelfY;
        breadRack.add(shelf);
      }
    } else if (tenant === "convenience") {
      const gondola = addFixture("retail-shelf", -1.55, -2.55, 0.82, 1.72, 1.25, paleTile);
      for (const shelfY of [-0.45, 0, 0.45]) {
        const shelf = mallMesh(new THREE.BoxGeometry(0.72, 0.06, 1.1), charcoal, "shopping-mall-retail-shelf-tier", "interior");
        shelf.position.y = shelfY;
        gondola.add(shelf);
      }
      const chiller = addFixture("wall-chiller", 1.55, -3.05, 1.08, 1.85, 0.55, glass);
      const chillerDoor = mallMesh(new THREE.BoxGeometry(0.92, 1.55, 0.05), glass, "shopping-mall-chiller-door", "interior");
      chillerDoor.position.z = 0.3;
      chiller.add(chillerDoor);
    } else if (tenant === "restaurant") {
      const hostStand = addFixture("host-stand", -1.55, -2.5, 0.85, 1.05, 0.58, darkWood);
      hostStand.userData.reservationPoint = true;
      const banquette = addFixture("banquette", 1.55, -3.0, 1.25, 1.0, 0.68, upholstery);
      const tableTop = mallMesh(new THREE.BoxGeometry(0.82, 0.08, 0.58), timber, "shopping-mall-restaurant-tabletop", "interior");
      tableTop.position.set(0, 0.12, -0.72);
      const tableSupport = mallMesh(new THREE.CylinderGeometry(0.1, 0.14, 0.58, 8), brass, "shopping-mall-restaurant-table-support", "interior");
      tableSupport.position.set(0, -0.21, -0.72);
      tableSupport.userData = { supportedToFloor: true, groundContactY: GROUND_FINISH_Y };
      banquette.add(tableTop, tableSupport);
    } else {
      const garmentRack = addFixture("garment-rack", -1.55, -2.7, 1.18, 1.65, 0.6, brass);
      const rail = mallMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 7), charcoal, "shopping-mall-garment-rail", "interior");
      rail.rotation.z = Math.PI * 0.5;
      rail.position.y = 0.52;
      garmentRack.add(rail);
      const plinth = addFixture("display-plinth", 1.55, -3.0, 0.92, 0.38, 0.92, paleTile);
      const mannequin = mallMesh(new THREE.CapsuleGeometry(0.2, 0.68, 4, 8), fashionFabric, "shopping-mall-fashion-mannequin", "interior");
      mannequin.position.y = 0.73;
      plinth.add(mannequin);
    }
    storefrontIndex += 1;
    if (exterior) exteriorCount += 1; else courtyardCount += 1;
  };

  const populateSide = (wing: Wing, side: Wing["innerSide"], count: number, exterior: boolean, seed: number) => {
    const horizontal = side.endsWith("z");
    const length = horizontal ? wing.width : wing.depth;
    for (let index = 0; index < count; index += 1) {
      let offset = -length * 0.5 + 3.6 + index * (length - 7.2) / Math.max(count - 1, 1);
      if (wing === north && side === north.innerSide && count === 10) {
        if (index === 4) offset -= 1.6;
        if (index === 5) offset += 1.6;
      }
      addStorefront(wing, side, offset, tenants[(seed + index) % tenants.length], exterior);
    }
  };
  populateSide(north, north.outerSide, 12, true, 0);
  populateSide(west, west.outerSide, 6, true, 2);
  populateSide(east, east.outerSide, 6, true, 4);
  populateSide(southWest, southWest.outerSide, 5, true, 1);
  populateSide(southEast, southEast.outerSide, 5, true, 3);
  populateSide(north, north.innerSide, 10, false, 5);
  populateSide(west, west.innerSide, 5, false, 0);
  populateSide(east, east.innerSide, 5, false, 2);
  populateSide(southWest, southWest.innerSide, 4, false, 3);
  populateSide(southEast, southEast.innerSide, 4, false, 1);

  // Central court is intentionally open to the sky; only the dining edges are covered.
  const courtyard = new THREE.Group();
  courtyard.name = "shopping-mall-open-air-courtyard";
  courtyard.userData.openToSky = true;
  mall.add(courtyard);
  const courtFloor = mallMesh(new THREE.BoxGeometry(76, 0.12, 54), paving, "shopping-mall-courtyard-floor", "courtyard");
  courtFloor.position.set(0, GROUND_FINISH_Y - 0.06, 4);
  courtyard.add(courtFloor);
  const promenade = mallMesh(new THREE.BoxGeometry(10, 0.1, 74), sand, "shopping-mall-open-air-promenade", "courtyard");
  promenade.position.set(0, GROUND_FINISH_Y - 0.05, 10);
  promenade.userData = { clearWidth: 10 * SHOPPING_MALL_SCALE, continuous: true, barrierFree: true, openToSky: true, connectsEntryToAnchor: true };
  courtyard.add(promenade);
  const anchorLobby = new THREE.Group();
  anchorLobby.name = "shopping-mall-north-anchor-lobby";
  anchorLobby.userData = { clearWidth: 8.7, barrierFree: true, openEntry: true, connectsPromenadeToAnchor: true };
  const anchorLobbyFloor = mallMesh(new THREE.BoxGeometry(9.2, 0.06, 3), paleTile, "shopping-mall-anchor-lobby-floor", "interior");
  anchorLobbyFloor.position.set(0, GROUND_FINISH_Y - 0.03, -27.5);
  anchorLobby.add(anchorLobbyFloor);
  for (const x of [-4.48, 4.48]) {
    const column = mallMesh(new THREE.BoxGeometry(0.22, 4, 0.22), charcoal, "shopping-mall-anchor-lobby-column", "interior");
    column.position.set(x, GROUND_FINISH_Y + 2, -27.85);
    anchorLobby.add(column);
  }
  const lobbyHeader = mallMesh(new THREE.BoxGeometry(9.2, 0.2, 0.32), timber, "shopping-mall-anchor-lobby-header", "interior");
  lobbyHeader.position.set(0, GROUND_FINISH_Y + 4.05, -27.85);
  anchorLobby.add(lobbyHeader);
  for (const x of [-2.6, 0, 2.6]) {
    const light = mallMesh(new THREE.BoxGeometry(1.25, 0.08, 0.22), warmLamp, "shopping-mall-anchor-lobby-light", "interior");
    light.position.set(x, GROUND_FINISH_Y + 3.91, -27.85);
    anchorLobby.add(light);
  }
  mall.add(anchorLobby);
  for (const x of [-17, 17]) {
    const fountain = mallMesh(new THREE.BoxGeometry(10, 0.62, 4.4), stone, "shopping-mall-courtyard-fountain", "courtyard");
    fountain.position.set(x, 0.9, 2);
    const fountainWater = mallMesh(new THREE.BoxGeometry(9.2, 0.18, 3.6), water, "shopping-mall-courtyard-fountain-water", "courtyard");
    fountainWater.position.set(x, 1.28, 2);
    courtyard.add(fountain, fountainWater);
    for (const lightX of [-3.2, -1.05, 1.05, 3.2]) {
      const underwaterLight = registerNightFixture(
        mallMesh(
          new THREE.CylinderGeometry(0.18, 0.22, 0.08, 10),
          nightCool,
          "shopping-mall-night-courtyard-light",
          "courtyard",
        ),
        "courtyard",
        "ground",
        1.31,
      );
      underwaterLight.position.set(x + lightX, 1.35, 2);
      underwaterLight.userData.waterMounted = true;
      courtyard.add(underwaterLight);
    }
    addNightLightSource(courtyard, new THREE.Vector3(x, 1.72, 2), "courtyard", 0x54d9ff, 2.8, 12);
  }
  const courtyardFurnitureLift = GROUND_FINISH_Y - GROUND_SLAB_TOP;
  const diningPositions: Array<[number, number]> = [[-25, -7], [-15, -7], [15, -7], [25, -7], [-25, 13], [-15, 8], [15, 8], [25, 13]];
  for (const [x, z] of diningPositions) {
      const table = new THREE.Group();
      table.name = "shopping-mall-outdoor-dining-table";
      table.position.set(x, courtyardFurnitureLift, z);
      table.userData = { groundSupported: true, seats: 4, groundContactY: GROUND_FINISH_Y };
      const tabletop = mallMesh(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 16), timber, "shopping-mall-outdoor-tabletop", "food-street");
      tabletop.position.y = 1.25;
      const tableSupport = mallMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.57, 10), charcoal, "shopping-mall-outdoor-table-support", "food-street");
      tableSupport.position.y = 0.895;
      const tableFoot = mallMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12), charcoal, "shopping-mall-outdoor-table-foot", "food-street");
      tableFoot.position.y = 0.65;
      table.add(tabletop, tableSupport, tableFoot);
      const umbrellaAssembly = new THREE.Group();
      umbrellaAssembly.name = "shopping-mall-dining-umbrella-assembly";
      umbrellaAssembly.position.set(x, GROUND_FINISH_Y - (2.05 - 2.85 * 0.5), z);
      umbrellaAssembly.userData = { canopyOrientation: "apex-up", groundMounted: true, groundContactY: GROUND_FINISH_Y };
      const umbrellaPole = mallMesh(new THREE.CylinderGeometry(0.085, 0.085, 2.85, 10), charcoal, "shopping-mall-dining-umbrella-pole", "food-street");
      umbrellaPole.position.y = 2.05;
      const umbrella = mallMesh(
        new THREE.ConeGeometry(2.15, 0.7, 16, 1, true),
        x < 0 ? coffeeUmbrella : milkTeaUmbrella,
        "shopping-mall-dining-umbrella",
        "food-street",
      );
      umbrella.position.y = 3.35;
      umbrella.userData = { apexDirection: "+y", undersideVisible: true };
      const finial = mallMesh(new THREE.SphereGeometry(0.13, 10, 7), charcoal, "shopping-mall-dining-umbrella-finial", "food-street");
      finial.position.y = 3.76;
      const umbrellaPendant = registerNightFixture(
        mallMesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), nightWarm, "shopping-mall-night-courtyard-light", "food-street"),
        "courtyard",
        "ceiling",
        3.025,
      );
      umbrellaPendant.position.y = 2.94;
      umbrellaAssembly.add(umbrellaPole, umbrella, finial, umbrellaPendant);
      courtyard.add(table, umbrellaAssembly);
      for (const [dx, dz] of [[-1.55, 0], [1.55, 0], [0, -1.55], [0, 1.55]]) {
        const chair = new THREE.Group();
        chair.name = "shopping-mall-outdoor-dining-chair";
        chair.position.set(x + dx, courtyardFurnitureLift, z + dz);
        chair.rotation.y = Math.atan2(dx, dz);
        chair.userData = { groundSupported: true, facesTable: true, groundContactY: GROUND_FINISH_Y };
        const chairSeat = mallMesh(new THREE.BoxGeometry(0.68, 0.12, 0.65), upholstery, "shopping-mall-outdoor-chair-seat", "food-street");
        chairSeat.position.y = 1.02;
        const chairBack = mallMesh(new THREE.BoxGeometry(0.68, 0.72, 0.12), upholstery, "shopping-mall-outdoor-chair-back", "food-street");
        chairBack.position.set(0, 1.36, 0.27);
        chair.add(chairSeat, chairBack);
        for (const supportX of [-0.23, 0.23]) {
          const support = mallMesh(new THREE.BoxGeometry(0.08, 0.35, 0.42), charcoal, "shopping-mall-outdoor-chair-support", "food-street");
          support.position.set(supportX, 0.785, 0);
          chair.add(support);
        }
        courtyard.add(chair);
      }
  }

  // Four shared warm pools cover pairs of dining umbrellas. This keeps the
  // tables readable at night without paying for one real light per table.
  for (const [x, z] of [[-20, -7], [20, -7], [-20, 10.5], [20, 10.5]] as Array<[number, number]>) {
    addNightLightSource(courtyard, new THREE.Vector3(x, 3.05, z), "courtyard", 0xffc782, 3.2, 13.5);
  }

  for (const x of [-31, 31]) {
    const canopy = mallMesh(new THREE.BoxGeometry(13, 0.28, 41), glass, "shopping-mall-partial-glass-canopy", "courtyard");
    canopy.position.set(x, 8.4, 4);
    courtyard.add(canopy);
    for (const z of [-14, 4, 22]) {
      const post = mallMesh(new THREE.BoxGeometry(0.28, 7.8, 0.28), charcoal, "shopping-mall-canopy-post", "courtyard");
      post.position.set(x, 4.45, z);
      courtyard.add(post);
    }
    for (const z of [-12, 4, 20]) {
      const canopyLight = registerNightFixture(
        mallMesh(new THREE.BoxGeometry(2.4, 0.1, 0.34), nightWarm, "shopping-mall-night-courtyard-light", "courtyard"),
        "courtyard",
        "ceiling",
        8.26,
      );
      canopyLight.position.set(x, 8.21, z);
      courtyard.add(canopyLight);
    }
    addNightLightSource(courtyard, new THREE.Vector3(x, 6.7, 4), "courtyard", 0xffbd72, 3.8, 24);
  }

  // Low bollards keep the open-air promenade legible without occupying its
  // ten-metre clear centre line or any vehicle surface.
  for (const x of [-6.5, 6.5]) {
    for (const z of [-10, 2, 14, 26]) {
      const bollardLight = registerNightFixture(
        mallMesh(new THREE.CylinderGeometry(0.13, 0.16, 0.82, 10), nightAmber, "shopping-mall-night-courtyard-light", "courtyard"),
        "courtyard",
        "ground",
        GROUND_FINISH_Y,
      );
      bollardLight.position.set(x, GROUND_FINISH_Y + 0.41, z);
      courtyard.add(bollardLight);
    }
  }
  const openSkyMarker = new THREE.Group();
  openSkyMarker.name = "shopping-mall-open-sky-void";
  openSkyMarker.userData.size = { width: 38 * SHOPPING_MALL_SCALE, depth: 41 * SHOPPING_MALL_SCALE };
  courtyard.add(openSkyMarker);

  for (const [x, z] of [[-24, -17], [24, -17], [-24, 20], [24, 20]] as Array<[number, number]>) {
    const lounge = new THREE.Group();
    lounge.name = "shopping-mall-courtyard-lounge";
    lounge.position.set(x, courtyardFurnitureLift, z);
    lounge.userData = { seatingCapacity: 6, outsidePromenade: true, groundSupported: true, groundContactY: GROUND_FINISH_Y };
    const rug = mallMesh(new THREE.BoxGeometry(7.2, 0.035, 4.2), sand, "shopping-mall-lounge-rug", "interior");
    rug.position.y = 0.6275;
    lounge.add(rug);
    for (const seatZ of [-1.25, 1.25]) {
      const sofa = new THREE.Group();
      sofa.name = "shopping-mall-lounge-sofa";
      sofa.position.z = seatZ;
      const sofaSeat = mallMesh(new THREE.BoxGeometry(4.2, 0.34, 0.92), upholstery, "shopping-mall-lounge-sofa-seat", "interior");
      sofaSeat.position.y = 1.02;
      const sofaBack = mallMesh(new THREE.BoxGeometry(4.2, 0.78, 0.18), upholstery, "shopping-mall-lounge-sofa-back", "interior");
      sofaBack.position.set(0, 1.35, seatZ < 0 ? -0.38 : 0.38);
      sofa.add(sofaSeat, sofaBack);
      for (const supportX of [-1.45, 1.45]) {
        const support = mallMesh(new THREE.BoxGeometry(0.16, 0.39, 0.68), brass, "shopping-mall-lounge-sofa-support", "interior");
        support.position.set(supportX, 0.805, 0);
        sofa.add(support);
      }
      lounge.add(sofa);
    }
    const coffeeTable = mallMesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 14), timber, "shopping-mall-lounge-coffee-table", "interior");
    coffeeTable.position.y = 1.0;
    const coffeeTableBase = mallMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.34, 8), brass, "shopping-mall-lounge-coffee-table-support", "interior");
    coffeeTableBase.position.y = 0.78;
    lounge.add(coffeeTable, coffeeTableBase);
    courtyard.add(lounge);
  }

  for (const [x, z] of [[-7.2, -18], [7.2, -18], [-7.2, 29], [7.2, 29]] as Array<[number, number]>) {
    const pylon = new THREE.Group();
    pylon.name = "shopping-mall-wayfinding-pylon";
    pylon.position.set(x, courtyardFurnitureLift, z);
    pylon.userData = { routeMap: true, accessibleRouteShown: true, outsidePromenade: true, groundContactY: GROUND_FINISH_Y };
    const base = mallMesh(new THREE.BoxGeometry(1.3, 0.12, 0.8), charcoal, "shopping-mall-wayfinding-base", "interior");
    base.position.y = 0.67;
    const screen = mallMesh(new THREE.BoxGeometry(1.05, 2.55, 0.18), warmWindow, "shopping-mall-wayfinding-screen", "interior");
    screen.position.y = 1.95;
    const cap = mallMesh(new THREE.BoxGeometry(1.18, 0.15, 0.32), brass, "shopping-mall-wayfinding-cap", "interior");
    cap.position.y = 3.28;
    const wayfindingLight = registerNightFixture(
      mallMesh(new THREE.BoxGeometry(0.92, 0.06, 0.24), nightWarm, "shopping-mall-night-wayfinding-light", "interior"),
      "wayfinding",
      "ceiling",
      3.245,
    );
    wayfindingLight.position.y = 3.175;
    pylon.add(base, screen, cap, wayfindingLight);
    addNightLightSource(pylon, new THREE.Vector3(0, 2.15, 0.38), "wayfinding", 0xffca82, 1.25, 5.5);
    courtyard.add(pylon);
  }

  const customerService = new THREE.Group();
  customerService.name = "shopping-mall-customer-service-desk";
  customerService.position.set(-13, 0, 25);
  customerService.userData = { accessibleLowCounter: true, inductionLoop: true, outsidePromenade: true, groundContactY: GROUND_FINISH_Y };
  const serviceDesk = mallMesh(new THREE.BoxGeometry(5, 0.95, 1.4), darkWood, "shopping-mall-customer-service-counter", "interior");
  serviceDesk.position.y = GROUND_FINISH_Y + 0.475;
  const lowCounter = mallMesh(new THREE.BoxGeometry(1.35, 0.72, 1.55), paleTile, "shopping-mall-customer-service-low-counter", "interior");
  lowCounter.position.set(1.82, GROUND_FINISH_Y + 0.36, 0);
  const serviceCanopy = mallMesh(new THREE.BoxGeometry(6.2, 0.18, 2.4), glass, "shopping-mall-customer-service-canopy", "interior");
  serviceCanopy.position.y = 3.65;
  customerService.add(serviceDesk, lowCounter, serviceCanopy);
  for (const x of [-2.65, 2.65]) {
    const post = mallMesh(new THREE.BoxGeometry(0.15, 3, 0.15), brass, "shopping-mall-customer-service-canopy-post", "interior");
    post.position.set(x, 2.15, 0);
    customerService.add(post);
  }
  courtyard.add(customerService);

  const addFamilyRestroom = (wing: Wing, x: number, z: number, restroomIndex: number) => {
    const restroom = new THREE.Group();
    restroom.name = "shopping-mall-family-restroom-core";
    restroom.position.set(x, 0, z);
    restroom.rotation.y = wing.width < wing.depth ? -Math.PI * 0.5 : Math.PI;
    restroom.userData = {
      accessible: true,
      familyFriendly: true,
      adultChangingTable: true,
      restroomIndex,
      safeServicePocket: true,
      facesBackOfHouseCorridor: true,
    };
    wing.group.add(restroom);
    const floor = mallMesh(new THREE.BoxGeometry(4.8, 0.04, 3.4), paleTile, "shopping-mall-restroom-floor", "interior");
    floor.position.y = GROUND_FINISH_Y - 0.02;
    const rearWall = mallMesh(new THREE.BoxGeometry(4.8, 3.1, 0.12), interiorWall, "shopping-mall-restroom-wall", "interior");
    rearWall.position.set(0, GROUND_FINISH_Y + 1.55, -1.64);
    restroom.add(floor, rearWall);
    for (const sideX of [-2.34, 2.34]) {
      const sideWall = mallMesh(new THREE.BoxGeometry(0.12, 3.1, 3.4), interiorWall, "shopping-mall-restroom-wall", "interior");
      sideWall.position.set(sideX, GROUND_FINISH_Y + 1.55, 0);
      restroom.add(sideWall);
    }
    const accessibleDoor = mallMesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), restroomBlue, "shopping-mall-restroom-accessible-door", "interior");
    accessibleDoor.position.set(-1.1, GROUND_FINISH_Y + 1.1, 1.66);
    const changingTable = mallMesh(new THREE.BoxGeometry(1.2, 0.12, 0.7), paleTile, "shopping-mall-restroom-changing-table", "interior");
    changingTable.position.set(1.25, GROUND_FINISH_Y + 0.9, -1.1);
    const sink = mallMesh(new THREE.CylinderGeometry(0.42, 0.36, 0.22, 12), ivory, "shopping-mall-restroom-sink", "interior");
    sink.position.set(1.2, GROUND_FINISH_Y + 0.85, 0.3);
    restroom.add(accessibleDoor, changingTable, sink);
  };
  addFamilyRestroom(north, -11, 0, 0);
  addFamilyRestroom(west, 0, -10, 1);
  addFamilyRestroom(east, 0, -10, 2);
  addFamilyRestroom(southWest, -7.5, 0, 3);
  addFamilyRestroom(southEast, 7.5, 0, 4);

  // Upper circulation hugs the inner facades. Supported open-air galleries
  // replace the former floating slabs that crossed and visually roofed the court.
  const arcadeSpecs = [
    { x: 0, z: -26.24, width: 84, depth: 3.2, guardSide: "+z" as const },
    { x: -44.24, z: 3, width: 3.2, depth: 42, guardSide: "+x" as const },
    { x: 44.24, z: 3, width: 3.2, depth: 42, guardSide: "-x" as const },
    { x: -28, z: 25.24, width: 24, depth: 3.2, guardSide: "-z" as const },
    { x: 28, z: 25.24, width: 24, depth: 3.2, guardSide: "-z" as const },
  ];
  mall.updateMatrixWorld(true);
  const storefrontObstacleNames = new Set([
    "shopping-mall-storefront-glass",
    "shopping-mall-storefront-door",
    "shopping-mall-store-sign",
    "shopping-mall-store-awning",
    "shopping-mall-upper-entry-door",
  ]);
  const storefrontObstacles: THREE.Box3[] = [];
  mall.traverse((object) => {
    if (!storefrontObstacleNames.has(object.name)) return;
    const obstacle = new THREE.Box3().setFromObject(object);
    const isDoor = object.name.endsWith("door");
    obstacle.min.x -= isDoor ? 0.72 : 0.2;
    obstacle.max.x += isDoor ? 0.72 : 0.2;
    obstacle.min.z -= isDoor ? 0.72 : 0.2;
    obstacle.max.z += isDoor ? 0.72 : 0.2;
    storefrontObstacles.push(obstacle);
  });
  arcadeSpecs.forEach(({ x, z, width, depth, guardSide }) => {
    const arcade = new THREE.Group();
    arcade.name = "shopping-mall-supported-open-air-arcade";
    arcade.position.set(x, 0, z);
    arcade.userData = { attachedToFacade: true, openAir: true, guardSide };
    mall.add(arcade);
    const gallery = new THREE.Group();
    gallery.name = "shopping-mall-upper-arcade";
    gallery.position.y = floorFinishY(1) - 0.15;
    arcade.add(gallery);
    const horizontal = width > depth;
    const length = horizontal ? width : depth;
    if (guardSide === "-z" && width === 24) {
      const openingX = x < 0 ? 10 : -10;
      const openingHalfWidth = 1.7;
      const frontMin = -width * 0.5;
      const frontMax = width * 0.5;
      const landingNotchDepth = 0.7;
      const rearKeepDepth = depth * 0.5 - landingNotchDepth;
      const rearSlab = mallMesh(new THREE.BoxGeometry(width, 0.3, rearKeepDepth), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
      rearSlab.position.z = landingNotchDepth + rearKeepDepth * 0.5;
      gallery.add(rearSlab);
      for (const [start, end] of [[frontMin, openingX - openingHalfWidth], [openingX + openingHalfWidth, frontMax]] as Array<[number, number]>) {
        if (end - start < 0.5) continue;
        const segment = mallMesh(new THREE.BoxGeometry(end - start, 0.3, landingNotchDepth), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
        segment.position.set((start + end) * 0.5, 0, landingNotchDepth * 0.5);
        gallery.add(segment);
      }
      for (const [start, end] of [[frontMin, openingX - openingHalfWidth], [openingX + openingHalfWidth, frontMax]] as Array<[number, number]>) {
        if (end - start < 0.5) continue;
        const segment = mallMesh(new THREE.BoxGeometry(end - start, 0.3, depth * 0.5), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
        segment.position.set((start + end) * 0.5, 0, -depth * 0.25);
        gallery.add(segment);
      }
      const opening = new THREE.Group();
      opening.name = "shopping-mall-escalator-floor-opening";
      opening.position.set(openingX, 0.15, (-depth * 0.5 + landingNotchDepth) * 0.5);
      opening.userData = { clearWidth: 3.4, clearDepth: depth * 0.5 + landingNotchDepth, openToEscalator: true, guardedSides: 3 };
      gallery.add(opening);
    } else {
      const slab = mallMesh(new THREE.BoxGeometry(width, 0.3, depth), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
      gallery.add(slab);
    }
    if (guardSide === "-z" && width === 24) {
      const openingX = x < 0 ? 10 : -10;
      const openingHalfWidth = 1.7;
      for (const [start, end] of [[-width * 0.5, openingX - openingHalfWidth], [openingX + openingHalfWidth, width * 0.5]] as Array<[number, number]>) {
        if (end - start < 0.5) continue;
        const guard = mallMesh(new THREE.BoxGeometry(end - start, 1.25, 0.18), glass, "shopping-mall-arcade-glass-guard", "upper-arcade");
        guard.position.set((start + end) * 0.5, floorFinishY(1) + 0.625, -depth * 0.5 + 0.08);
        guard.userData = { protectsEscalatorOpening: true };
        arcade.add(guard);
      }
    } else {
      const guard = mallMesh(
        new THREE.BoxGeometry(horizontal ? width : 0.18, 1.25, horizontal ? 0.18 : depth),
        glass,
        "shopping-mall-arcade-glass-guard",
        "upper-arcade",
      );
      guard.position.set(
        guardSide === "+x" ? width * 0.5 - 0.08 : guardSide === "-x" ? -width * 0.5 + 0.08 : 0,
        floorFinishY(1) + 0.625,
        guardSide === "+z" ? depth * 0.5 - 0.08 : guardSide === "-z" ? -depth * 0.5 + 0.08 : 0,
      );
      arcade.add(guard);
    }
    const supportIntervals = Math.ceil(length / 6);
    const acceptedOffsets: number[] = [];
    const candidateDeltas = [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.2, -2.2, 2.75, -2.75];
    for (let index = 0; index <= supportIntervals; index += 1) {
      const nominalOffset = -length * 0.5 + index / supportIntervals * length;
      let offset: number | undefined;
      for (const delta of candidateDeltas) {
        const candidate = THREE.MathUtils.clamp(nominalOffset + delta, -length * 0.5 + 0.22, length * 0.5 - 0.22);
        if (acceptedOffsets.some((accepted) => Math.abs(accepted - candidate) < 0.72)) continue;
        const candidateLocalX = horizontal ? candidate : guardSide === "+x" ? -1.35 : 1.35;
        const candidateLocalZ = horizontal ? guardSide === "+z" ? -1.35 : 1.35 : candidate;
        const columnEnvelope = new THREE.Box3(
          new THREE.Vector3(x + candidateLocalX - 0.16, GROUND_FINISH_Y, z + candidateLocalZ - 0.16),
          new THREE.Vector3(x + candidateLocalX + 0.16, floorFinishY(1), z + candidateLocalZ + 0.16),
        );
        if (storefrontObstacles.some((obstacle) => obstacle.intersectsBox(columnEnvelope))) continue;
        offset = candidate;
        break;
      }
      if (offset === undefined) continue;
      acceptedOffsets.push(offset);
      const supportLocalX = horizontal ? offset : guardSide === "+x" ? -1.35 : 1.35;
      const supportLocalZ = horizontal ? guardSide === "+z" ? -1.35 : 1.35 : offset;
      const support = mallMesh(new THREE.BoxGeometry(0.3, 4, 0.3), charcoal, "shopping-mall-arcade-support-column", "upper-arcade");
      support.position.set(supportLocalX, 2.6, supportLocalZ);
      support.userData = { facadeSideSupport: true, clearsStorefrontEnvelope: true, adjustedFromNominal: Math.abs(offset - nominalOffset) > 0.01 };
      const pergola = mallMesh(
        new THREE.BoxGeometry(horizontal ? 0.24 : 3.45, 0.18, horizontal ? 3.45 : 0.24),
        timber,
        "shopping-mall-arcade-pergola-slat",
        "upper-arcade",
      );
      pergola.position.set(horizontal ? offset : 0, 7.65, horizontal ? 0 : offset);
      arcade.add(support, pergola);
      for (const shortOffset of [-1.35, 1.35]) {
        const upperPost = mallMesh(
          new THREE.BoxGeometry(0.22, 2.66, 0.22),
          charcoal,
          "shopping-mall-arcade-pergola-column",
          "upper-arcade",
        );
        upperPost.position.set(horizontal ? offset : shortOffset, 6.23, horizontal ? shortOffset : offset);
        upperPost.userData = { supportsPergolaSlat: true, groundedOnGallery: true };
        arcade.add(upperPost);
      }
    }

    acceptedOffsets.forEach((offset) => {
      const arcadeLight = registerNightFixture(
        mallMesh(
          new THREE.BoxGeometry(horizontal ? 1.2 : 0.18, 0.08, horizontal ? 0.18 : 1.2),
          nightWarm,
          "shopping-mall-night-arcade-ceiling-light",
          "upper-arcade",
        ),
        "arcade",
        "ceiling",
        7.56,
      );
      arcadeLight.position.set(horizontal ? offset : 0, 7.52, horizontal ? 0 : offset);
      arcade.add(arcadeLight);
    });
    addNightLightSource(
      arcade,
      new THREE.Vector3(0, 6.35, 0),
      "arcade",
      0xffc879,
      3.6,
      Math.min(36, Math.max(18, length * 0.6)),
    );
  });

  const addCornerBridge = (start: THREE.Vector3, end: THREE.Vector3) => {
    const direction = end.clone().sub(start);
    const length = Math.hypot(direction.x, direction.z);
    const bridge = new THREE.Group();
    bridge.name = "shopping-mall-upper-bridge";
    bridge.position.copy(start).add(end).multiplyScalar(0.5);
    bridge.rotation.y = -Math.atan2(direction.z, direction.x);
    bridge.userData = { cornerConnection: true, spanLength: length * SHOPPING_MALL_SCALE, crossesCourtyard: false };
    mall.add(bridge);
    const slab = mallMesh(new THREE.BoxGeometry(length, 0.32, 3.2), sand, "shopping-mall-upper-bridge-slab", "upper-arcade");
    const guardA = mallMesh(new THREE.BoxGeometry(length, 1.18, 0.14), glass, "shopping-mall-bridge-glass-guard", "upper-arcade");
    guardA.position.set(0, 0.74, -1.52);
    const guardB = guardA.clone();
    guardB.position.z = 1.52;
    bridge.add(slab, guardA, guardB);
  };
  addCornerBridge(new THREE.Vector3(-42, floorFinishY(1) - 0.16, -26.24), new THREE.Vector3(-44.24, floorFinishY(1) - 0.16, -18));
  addCornerBridge(new THREE.Vector3(42, floorFinishY(1) - 0.16, -26.24), new THREE.Vector3(44.24, floorFinishY(1) - 0.16, -18));
  addCornerBridge(new THREE.Vector3(-44.24, floorFinishY(1) - 0.16, 24), new THREE.Vector3(-40, floorFinishY(1) - 0.16, 25.24));
  addCornerBridge(new THREE.Vector3(44.24, floorFinishY(1) - 0.16, 24), new THREE.Vector3(40, floorFinishY(1) - 0.16, 25.24));

  // Two symmetrical escalators rise in the same physical +Z direction to the
  // south-wing galleries. Individual horizontal treads replace the old pair
  // of oppositely rotated ramp boxes.
  for (const [index, x] of [-18, 18].entries()) {
    const escalator = new THREE.Group();
    escalator.name = "shopping-mall-escalator";
    escalator.position.set(x, 0, 19.5);
    const lowerY = GROUND_FINISH_Y - 0.08;
    const upperY = floorFinishY(1) - 0.08;
    const run = 8.2;
    const slopeLength = Math.hypot(run, upperY - lowerY);
    const slopeAngle = Math.atan2(upperY - lowerY, run);
    const landingOffset = run * 0.5 + 1.1;
    escalator.userData = {
      physicalSlopeDirection: "+z",
      travelDirection: index === 0 ? "up" : "down",
      lowerLanding: { x, y: GROUND_FINISH_Y - 0.11, z: 19.5 - landingOffset },
      upperLanding: { x, y: floorFinishY(1) - 0.11, z: 19.5 + landingOffset },
      connectedToUpperArcade: true,
      outsideCentralPromenade: true,
      coordinateSpace: "mall-local",
    };
    mall.add(escalator);

    const lowerLanding = mallMesh(new THREE.BoxGeometry(2.7, 0.22, 2.2), escalatorMetal, "shopping-mall-escalator-lower-landing", "upper-arcade");
    lowerLanding.position.set(0, GROUND_FINISH_Y - 0.11, -landingOffset);
    const upperLanding = mallMesh(new THREE.BoxGeometry(2.7, 0.22, 2.3), escalatorMetal, "shopping-mall-escalator-upper-landing", "upper-arcade");
    upperLanding.position.set(0, floorFinishY(1) - 0.11, landingOffset);
    escalator.add(lowerLanding, upperLanding);

    for (const side of [-1, 1]) {
      const lowerGuard = mallMesh(new THREE.BoxGeometry(0.12, 1.1, 2.25), glass, "shopping-mall-escalator-landing-guard", "upper-arcade");
      lowerGuard.position.set(side * 1.3, GROUND_FINISH_Y + 0.5, -landingOffset);
      const upperGuard = mallMesh(new THREE.BoxGeometry(0.12, 1.1, 2.35), glass, "shopping-mall-escalator-landing-guard", "upper-arcade");
      upperGuard.position.set(side * 1.3, floorFinishY(1) + 0.55, landingOffset);
      escalator.add(lowerGuard, upperGuard);
      for (const [y, startZ, endZ] of [
        [GROUND_FINISH_Y + 0.5, -landingOffset - 1.12, -landingOffset + 1.12],
        [floorFinishY(1) + 0.55, landingOffset - 1.17, landingOffset + 1.17],
      ] as Array<[number, number, number]>) {
        for (const z of [startZ, endZ]) {
          const guardReturn = mallMesh(new THREE.BoxGeometry(0.86, 1.1, 0.12), glass, "shopping-mall-escalator-guard-return", "upper-arcade");
          guardReturn.position.set(side * 1.73, y, z);
          guardReturn.userData = { side, leavesTravelPathClear: true };
          escalator.add(guardReturn);
        }
      }
    }

    const stringer = mallMesh(new THREE.BoxGeometry(2.35, 0.28, slopeLength), escalatorMetal, "shopping-mall-escalator-underframe", "upper-arcade");
    stringer.position.set(0, (lowerY + upperY) * 0.5 - 0.2, 0);
    stringer.rotation.x = -slopeAngle;
    escalator.add(stringer);

    const stepCount = 18;
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      const t = stepIndex / (stepCount - 1);
      const step = mallMesh(new THREE.BoxGeometry(2.2, 0.16, 0.68), escalatorTread, "shopping-mall-escalator-step", "upper-arcade");
      step.position.set(0, THREE.MathUtils.lerp(lowerY, upperY, t), THREE.MathUtils.lerp(-run * 0.5, run * 0.5, t));
      const edge = mallMesh(new THREE.BoxGeometry(2.12, 0.035, 0.07), nightAmber, "shopping-mall-escalator-step-safety-edge", "upper-arcade");
      edge.position.set(0, step.position.y + 0.095, step.position.z - 0.29);
      escalator.add(step, edge);
    }

    for (const side of [-1, 1]) {
      const rail = mallMesh(new THREE.BoxGeometry(0.12, 1.05, slopeLength + 0.35), glass, "shopping-mall-escalator-glass-rail", "upper-arcade");
      rail.position.set(side * 1.18, (lowerY + upperY) * 0.5 + 0.52, 0);
      rail.rotation.x = -slopeAngle;
      const handrailCurve = new THREE.LineCurve3(
        new THREE.Vector3(side * 1.18, lowerY + 1.12, -run * 0.5),
        new THREE.Vector3(side * 1.18, upperY + 1.12, run * 0.5),
      );
      const handrail = mallMesh(new THREE.TubeGeometry(handrailCurve, 1, 0.07, 8, false), charcoal, "shopping-mall-escalator-handrail", "upper-arcade");
      escalator.add(rail, handrail);
      const skirtLightCurve = new THREE.LineCurve3(
        new THREE.Vector3(side * 1.08, lowerY + 0.26, -run * 0.5),
        new THREE.Vector3(side * 1.08, upperY + 0.26, run * 0.5),
      );
      const skirtLight = registerNightFixture(
        mallMesh(
          new THREE.TubeGeometry(skirtLightCurve, 1, 0.045, 6, false),
          nightCool,
          "shopping-mall-night-arcade-ceiling-light",
          "upper-arcade",
        ),
        "arcade",
        "wall",
        GROUND_FINISH_Y,
      );
      skirtLight.userData.escalatorIndex = index;
      escalator.add(skirtLight);
    }
    addNightLightSource(
      escalator,
      new THREE.Vector3(0, (lowerY + upperY) * 0.5 + 1.15, 0),
      "arcade",
      0xffc679,
      2.6,
      13,
    );
  }

  const entry = new THREE.Group();
  entry.name = "shopping-mall-grand-entry";
  entry.position.set(0, 0, 46.5);
  mall.add(entry);
  for (const x of [-12, 12]) {
    const tower = mallMesh(new THREE.BoxGeometry(2.1, 13, 2.1), terracotta, "shopping-mall-entry-tower", "exterior");
    tower.position.set(x, 7, 0);
    entry.add(tower);
  }
  const entryBeam = mallMesh(new THREE.BoxGeometry(26, 1.1, 1.4), charcoal, "shopping-mall-entry-sign-beam", "exterior");
  entryBeam.position.y = 12.6;
  entry.add(entryBeam);
  const entryMarquee = registerNightFixture(
    mallMesh(new THREE.BoxGeometry(19.5, 0.42, 0.08), nightAmber, "shopping-mall-night-entry-light", "exterior"),
    "entry",
    "wall",
    12.6,
  );
  entryMarquee.position.set(0, 12.62, 0.74);
  entry.add(entryMarquee);
  for (const x of [-10.9, 10.9]) {
    const towerWash = registerNightFixture(
      mallMesh(new THREE.BoxGeometry(0.16, 8.2, 0.12), nightCool, "shopping-mall-night-entry-light", "exterior"),
      "entry",
      "wall",
      GROUND_FINISH_Y,
    );
    towerWash.position.set(x, 5.2, 1.08);
    entry.add(towerWash);
  }
  for (const x of [-7, 0, 7]) {
    const soffit = registerNightFixture(
      mallMesh(new THREE.BoxGeometry(1.5, 0.1, 0.42), nightWarm, "shopping-mall-night-entry-light", "exterior"),
      "entry",
      "ceiling",
      12.05,
    );
    soffit.position.set(x, 12, 0.4);
    entry.add(soffit);
    addNightLightSource(entry, new THREE.Vector3(x, 10.8, 1.1), "entry", 0xffb96f, 4.5, 18);
  }
  const openEntry = new THREE.Group();
  openEntry.name = "shopping-mall-open-entry-void";
  openEntry.userData = {
    width: 21 * SHOPPING_MALL_SCALE,
    clearHeight: 11.8 * SHOPPING_MALL_SCALE,
    barrierFree: true,
    openToCourtyard: true,
  };
  entry.add(openEntry);

  for (const [sideSign, index] of [[-1, 0], [1, 1]] as Array<[number, number]>) {
    const loadingCourt = new THREE.Group();
    loadingCourt.name = "shopping-mall-loading-court";
    loadingCourt.position.set(sideSign * 54.08, 0, -41.6);
    loadingCourt.userData = {
      loadingCourtIndex: index,
      endWallSide: sideSign < 0 ? "west" : "east",
      connectsPerimeterRoad: true,
      connectedToBackOfHouse: true,
      separatedFromPublicCourt: true,
    };
    const apron = mallMesh(new THREE.BoxGeometry(11, 0.08, 8), asphalt, "shopping-mall-loading-apron", "interior");
    apron.position.set(sideSign * 5.5, GROUND_FINISH_Y - 0.04, 0);
    const accessLane = mallMesh(new THREE.BoxGeometry(6.6, 0.08, 5.2), asphalt, "shopping-mall-loading-access-lane", "interior");
    accessLane.position.set(sideSign * 14.3, GROUND_FINISH_Y - 0.04, 0);
    const dock = mallMesh(new THREE.BoxGeometry(1.5, 0.65, 5.2), stone, "shopping-mall-loading-dock", "interior");
    dock.position.set(sideSign * 0.92, GROUND_FINISH_Y + 0.325, 0);
    const shutter = mallMesh(new THREE.BoxGeometry(0.14, 3.2, 3.8), charcoal, "shopping-mall-service-door", "interior");
    shutter.position.set(sideSign * 0.11, GROUND_FINISH_Y + 1.6, 0);
    shutter.userData = { clearWidth: 3.8, endWallOpening: true, independentFromStorefronts: true };
    const serviceLink = mallMesh(new THREE.BoxGeometry(5.7, 0.04, 2.2), paleTile, "shopping-mall-loading-service-link", "interior");
    serviceLink.position.set(-sideSign * 2.85, GROUND_FINISH_Y - 0.02, 0);
    serviceLink.userData = { staffOnly: true, connectsDoorToBackOfHouse: true, clearWidth: 2.2 };
    const serviceSign = mallMesh(new THREE.BoxGeometry(0.18, 0.55, 2.2), emergencyGreen, "shopping-mall-loading-service-sign", "interior");
    serviceSign.position.set(sideSign * 0.2, GROUND_FINISH_Y + 3.55, 0);
    const loadingWallLight = registerNightFixture(
      mallMesh(new THREE.BoxGeometry(0.18, 0.42, 2.65), nightCool, "shopping-mall-night-facade-wash-light", "exterior"),
      "facade",
      "wall",
      GROUND_FINISH_Y,
    );
    loadingWallLight.position.set(sideSign * 0.32, GROUND_FINISH_Y + 4.05, 0);
    loadingWallLight.userData.loadingCourtIndex = index;
    loadingCourt.add(apron, accessLane, dock, shutter, serviceLink, serviceSign, loadingWallLight);
    addNightLightSource(
      loadingCourt,
      new THREE.Vector3(sideSign * 1.45, GROUND_FINISH_Y + 3.7, 0),
      "facade",
      0xd8eeff,
      3.2,
      14,
    );
    for (const bollardZ of [-2.65, 2.65]) {
      const bollard = mallMesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), safetyYellow, "shopping-mall-loading-bollard", "interior");
      bollard.position.set(sideSign * 1.9, GROUND_FINISH_Y + 0.45, bollardZ);
      loadingCourt.add(bollard);
    }
    for (const guideZ of [-2.55, 2.55]) {
      const guide = mallMesh(new THREE.BoxGeometry(8.5, 0.025, 0.1), ivory, "shopping-mall-loading-guide-line", "interior");
      guide.position.set(sideSign * 5.7, GROUND_FINISH_Y + 0.0125, guideZ);
      loadingCourt.add(guide);
    }
    mall.add(loadingCourt);
  }

  const lightPositions: Array<[number, number]> = [[-62, 46], [-58, 40], [-20, 50], [20, 50], [58, 40], [62, 46], [-68, 28], [68, 28], [-68, -28], [68, -28], [-68, -48], [0, -50], [68, -48]];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.48, z);
    light.scale.setScalar(1.02);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    mall.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-62, 38], [62, 38], [-62, -32], [62, -32], [-38, -20], [38, -20], [-10, 17], [10, 17], [-10.5, -12], [10.5, -12]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, GROUND_FINISH_Y, z);
    planter.scale.setScalar(1.12);
    planter.userData.sourceCollection = "city-street-furniture";
    mall.add(planter);
  });

  // Merge the many authored lighting intents into one broad, shadow-free
  // source per customer-facing zone. Emissive fixtures preserve the local
  // pools and colour accents while the six real lights provide illumination
  // without multiplying the fragment-lighting cost across every mall mesh.
  mall.updateMatrixWorld(true);
  const nightZoneColors: Record<MallNightLightingZone, number> = {
    storefront: 0xffc77a,
    facade: 0xc7e5ff,
    arcade: 0xffc879,
    courtyard: 0xffc782,
    entry: 0xffb96f,
    wayfinding: 0xffca82,
  };
  const nightZones: MallNightLightingZone[] = ["storefront", "facade", "arcade", "courtyard", "entry", "wayfinding"];
  nightZones.forEach((zone) => {
    const intents = nightLightIntents.filter((intent) => intent.zone === zone);
    if (intents.length === 0) return;
    const positions = intents.map((intent) => mall.worldToLocal(intent.parent.localToWorld(intent.position.clone())));
    const centre = positions.reduce((sum, position) => sum.add(position), new THREE.Vector3()).multiplyScalar(1 / positions.length);
    const coverage = intents.reduce(
      (largest, intent, index) => Math.max(largest, centre.distanceTo(positions[index]) + intent.distance),
      0,
    );
    const onIntensity = Math.min(90, Math.max(18, intents.reduce((sum, intent) => sum + intent.onIntensity, 0) * 4.5));
    const source = new THREE.PointLight(nightZoneColors[zone], 0, Math.min(125, coverage), 1.8);
    source.name = "shopping-mall-night-light-source";
    source.position.copy(centre);
    source.castShadow = false;
    source.visible = false;
    source.userData = { zone, onIntensity, powered: false, mergedIntentCount: intents.length };
    mall.add(source);
    nightLightSources.push(source);
  });

  const restaurantTenants: MallTenant[] = ["fast-food", "coffee", "burger", "milk-tea", "bakery", "restaurant"];
  const countTenant = (tenant: MallTenant) => {
    let count = 0;
    mall.traverse((object) => { if (object.name === "shopping-mall-storefront" && object.userData.tenantType === tenant) count += 1; });
    return count;
  };
  const restaurantCount = restaurantTenants.reduce((total, tenant) => total + countTenant(tenant), 0);
  const countNamed = (name: string) => {
    let count = 0;
    mall.traverse((object) => { if (object.name === name) count += 1; });
    return count;
  };
  const interiorTenantTypes = new Set<MallTenant>();
  mall.traverse((object) => {
    if (object.name === "shopping-mall-store-interior-module") interiorTenantTypes.add(object.userData.tenantType as MallTenant);
  });
  mall.userData = {
    mapLayer: "exterior",
    modelType: "shopping-mall",
    generatedLocally: true,
    zones: ["overview", "exterior", "courtyard", "food-street", "lifestyle", "upper-arcade", "interior"],
    buildingCount: wings.length,
    storefrontCount: storefrontIndex,
    exteriorStorefrontCount: exteriorCount,
    courtyardStorefrontCount: courtyardCount,
    tenantTypes: tenants,
    restaurantCount,
    coffeeShopCount: countTenant("coffee"),
    burgerShopCount: countTenant("burger"),
    milkTeaShopCount: countTenant("milk-tea"),
    openAirCourtyardCount: 1,
    promenadeClearWidth: 10 * SHOPPING_MALL_SCALE,
    throughRouteOpenToSky: true,
    upperBridgeCount: 4,
    escalatorCount: 2,
    streetLightCount: lightPositions.length,
    planterCount: planterPositions.length,
    interiorStoreCount: countNamed("shopping-mall-store-interior-module"),
    tenantInteriorTypeCount: interiorTenantTypes.size,
    upperInteriorFloorCount: countNamed("shopping-mall-upper-interior-zone"),
    serviceCoreCount: countNamed("shopping-mall-service-core"),
    accessibleLiftCount: countNamed("shopping-mall-accessible-lift"),
    fireStairCount: countNamed("shopping-mall-fire-stair"),
    familyRestroomCount: countNamed("shopping-mall-family-restroom-core"),
    wayfindingCount: countNamed("shopping-mall-wayfinding-pylon"),
    nightLightingZones: ["storefront", "facade", "arcade", "courtyard", "entry", "wayfinding"],
    nightLightSourceCount: nightLightSources.length,
    nightFixtureCount: nightFixtures.length,
    lateNightOperational: true,
    powered: false,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    scaleMultiplier: SHOPPING_MALL_SCALE,
    siteSize: new THREE.Vector3(160, 18, 120).multiplyScalar(SHOPPING_MALL_SCALE),
    setPowered: (powered) => {
      mall.userData.powered = powered;
      storefrontGlass.emissiveIntensity = powered ? 0.12 : 0.025;
      warmWindow.emissiveIntensity = powered ? 3.4 : 0.12;
      warmLamp.emissiveIntensity = powered ? 4.6 : 0.18;
      water.emissiveIntensity = powered ? 0.9 : 0.12;
      emergencyGreen.emissiveIntensity = powered ? 1.15 : 0.24;
      Object.values(tenantMaterials).forEach((material) => { material.emissiveIntensity = powered ? 2.35 : 0.08; });
      nightWarm.emissiveIntensity = powered ? 4.4 : 0.04;
      nightCool.emissiveIntensity = powered ? 3.2 : 0.03;
      nightAmber.emissiveIntensity = powered ? 3.8 : 0.04;
      nightLightSources.forEach((light) => {
        light.visible = powered;
        light.intensity = powered ? light.userData.onIntensity : 0;
        light.userData.powered = powered;
      });
      reusedStreetLights.forEach((light) => {
        light.userData.setPowered(powered);
        light.traverse((object) => {
          if (object instanceof THREE.Light) object.visible = powered;
        });
      });
    },
    setInteriorCutaway: (cutaway) => { cutawayShell.forEach((object) => { object.visible = !cutaway; }); },
  };
  mall.scale.setScalar(SHOPPING_MALL_SCALE);
  mall.userData.setPowered(false);
  mall.userData.setInteriorCutaway(false);
  return mall;
}
