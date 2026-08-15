import * as THREE from "three";
import { buildLowPolyRoadsidePlanter, buildLowPolyStreetLight } from "./cityFurniture.ts";

export const SHOPPING_MALL_SCALE = 1.15;

export type MallZone = "overview" | "exterior" | "courtyard" | "food-street" | "lifestyle" | "upper-arcade";
export type MallTenant = "fast-food" | "coffee" | "burger" | "milk-tea" | "bakery" | "convenience" | "restaurant" | "fashion";

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
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    scaleMultiplier: number;
    siteSize: THREE.Vector3;
    setPowered: (powered: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
  };
};

function mallMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: MallZone) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (zone) mesh.userData.zone = zone;
  return mesh;
}

export function buildLowPolyShoppingMall(): ShoppingMallModel {
  const mall = new THREE.Group() as ShoppingMallModel;
  mall.name = "city-shopping-mall-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const reusedStreetLights: ReturnType<typeof buildLowPolyStreetLight>[] = [];

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
  const glass = new THREE.MeshStandardMaterial({ color: 0x76aeb9, emissive: 0x274e59, emissiveIntensity: 0.1, roughness: 0.22, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide });
  const curtainGlass = new THREE.MeshPhysicalMaterial({
    color: 0x6da9b7,
    emissive: 0x244d59,
    emissiveIntensity: 0.1,
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
  plazaBase.position.y = 0.47;
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
  entryPlaza.position.set(0, 0.58, 47);
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
    const pitch = 4.25;
    const height = floors * pitch;
    const core = mallMesh(new THREE.BoxGeometry(width - 1.5, height - 0.35, depth - 1.5), ivory, "shopping-mall-building-core", "lifestyle");
    core.position.y = 0.55 + height * 0.5;
    group.add(core);
    cutawayShell.push(core);
    for (let floor = 0; floor <= floors; floor += 1) {
      const slab = mallMesh(new THREE.BoxGeometry(width - 1.8, 0.18, depth - 1.8), stone, "shopping-mall-interior-floor-slab", "lifestyle");
      slab.position.y = 0.65 + floor * pitch;
      group.add(slab);
    }
    const roof = mallMesh(new THREE.BoxGeometry(width + 0.5, 0.34, depth + 0.5), charcoal, "shopping-mall-flat-roof", "lifestyle");
    roof.position.y = 0.68 + height;
    group.add(roof);
    cutawayShell.push(roof);
    for (let floor = 1; floor < floors; floor += 1) {
      const band = mallMesh(new THREE.BoxGeometry(width + 0.12, 0.32, depth + 0.12), terracotta, "shopping-mall-floor-band", "lifestyle");
      band.position.y = 0.55 + floor * pitch;
      group.add(band);
      cutawayShell.push(band);
    }
    const facadeSides: Wing["innerSide"][] = ["+x", "-x", "+z", "-z"];
    facadeSides.forEach((side) => {
      const horizontal = side.endsWith("z");
      const length = horizontal ? width : depth;
      const bays = Math.max(3, Math.floor(length / 6.5));
      const bayWidth = length / bays;
      for (let floor = 0; floor < floors; floor += 1) {
        // On the courtyard and street elevations the ground-floor shopfronts
        // themselves form the curtain wall. End elevations remain fully glazed.
        if (floor === 0 && (side === innerSide || side === outerSide)) continue;
        for (let bay = 0; bay < bays; bay += 1) {
          const offset = -length * 0.5 + (bay + 0.5) * bayWidth;
          const pane = mallMesh(
            new THREE.BoxGeometry(horizontal ? bayWidth - 0.24 : 0.16, 3.72, horizontal ? 0.16 : bayWidth - 0.24),
            curtainGlass,
            "shopping-mall-glass-curtain-panel",
            floor === 0 ? "exterior" : "upper-arcade",
          );
          pane.position.set(
            horizontal ? offset : side === "+x" ? width * 0.5 + 0.11 : -width * 0.5 - 0.11,
            2.65 + floor * pitch,
            horizontal ? side === "+z" ? depth * 0.5 + 0.11 : -depth * 0.5 - 0.11 : offset,
          );
          pane.userData.facadeSide = side;
          group.add(pane);
          cutawayShell.push(pane);
        }
      }
      for (let bay = 0; bay <= bays; bay += 1) {
        const offset = -length * 0.5 + bay * bayWidth;
        const mullion = mallMesh(
          new THREE.BoxGeometry(horizontal ? 0.18 : 0.24, height - 0.45, horizontal ? 0.24 : 0.18),
          charcoal,
          "shopping-mall-curtain-wall-mullion",
          "lifestyle",
        );
        mullion.position.set(
          horizontal ? offset : side === "+x" ? width * 0.5 + 0.2 : -width * 0.5 - 0.2,
          0.78 + (height - 0.45) * 0.5,
          horizontal ? side === "+z" ? depth * 0.5 + 0.2 : -depth * 0.5 - 0.2 : offset,
        );
        group.add(mullion);
        cutawayShell.push(mullion);
      }
    });
    return { group, width, depth, floors, innerSide, outerSide };
  };

  const north = addWing({ name: "shopping-mall-north-anchor", x: 0, z: -38, width: 108, depth: 20, floors: 4, innerSide: "+z", outerSide: "-z" });
  const west = addWing({ name: "shopping-mall-west-wing", x: -56, z: 0, width: 20, depth: 56, floors: 3, innerSide: "+x", outerSide: "-x" });
  const east = addWing({ name: "shopping-mall-east-wing", x: 56, z: 0, width: 20, depth: 56, floors: 3, innerSide: "-x", outerSide: "+x" });
  const southWest = addWing({ name: "shopping-mall-southwest-wing", x: -34, z: 37, width: 42, depth: 20, floors: 3, innerSide: "-z", outerSide: "+z" });
  const southEast = addWing({ name: "shopping-mall-southeast-wing", x: 34, z: 37, width: 42, depth: 20, floors: 3, innerSide: "-z", outerSide: "+z" });
  const wings = [north, west, east, southWest, southEast];

  const tenants: MallTenant[] = ["fast-food", "coffee", "burger", "milk-tea", "bakery", "convenience", "restaurant", "fashion"];
  let storefrontIndex = 0;
  let exteriorCount = 0;
  let courtyardCount = 0;
  const addStorefront = (wing: Wing, side: Wing["innerSide"], offset: number, tenant: MallTenant, exterior: boolean) => {
    const horizontal = side.endsWith("z");
    const signMaterial = tenantMaterials[tenant];
    const frontage = 4.6;
    const depth = 0.24;
    const frontX = horizontal ? offset : side === "+x" ? wing.width * 0.5 + 0.16 : -wing.width * 0.5 - 0.16;
    const frontZ = horizontal ? side === "+z" ? wing.depth * 0.5 + 0.16 : -wing.depth * 0.5 - 0.16 : offset;
    const store = new THREE.Group();
    store.name = "shopping-mall-storefront";
    store.userData = { tenantType: tenant, exterior, storefrontIndex };
    store.position.set(frontX, 0, frontZ);
    wing.group.add(store);
    const window = mallMesh(new THREE.BoxGeometry(horizontal ? 3.05 : depth, 2.55, horizontal ? depth : 3.05), glass, "shopping-mall-storefront-glass", exterior ? "exterior" : "courtyard");
    window.position.set(horizontal ? -0.72 : 0, 2.15, horizontal ? 0 : -0.72);
    const door = mallMesh(new THREE.BoxGeometry(horizontal ? 1.22 : depth + 0.03, 2.55, horizontal ? depth + 0.03 : 1.22), glass, "shopping-mall-storefront-door", exterior ? "exterior" : "courtyard");
    door.position.set(horizontal ? 1.58 : 0, 2.15, horizontal ? 0 : 1.58);
    door.userData = { tenantType: tenant, clearWidth: 1.22 * SHOPPING_MALL_SCALE, operable: true };
    const sign = mallMesh(new THREE.BoxGeometry(horizontal ? frontage : 0.3, 0.72, horizontal ? 0.3 : frontage), signMaterial, "shopping-mall-store-sign", exterior ? "exterior" : "courtyard");
    sign.position.y = 3.82;
    const awning = mallMesh(new THREE.BoxGeometry(horizontal ? frontage + 0.5 : 1.45, 0.18, horizontal ? 1.45 : frontage + 0.5), signMaterial, "shopping-mall-store-awning", exterior ? "exterior" : "courtyard");
    awning.position.set(horizontal ? 0 : side === "+x" ? 0.78 : -0.78, 3.25, horizontal ? side === "+z" ? 0.78 : -0.78 : 0);
    const interiorGlow = mallMesh(new THREE.BoxGeometry(horizontal ? frontage - 0.5 : 0.12, 2.35, horizontal ? 0.12 : frontage - 0.5), warmWindow, "shopping-mall-store-interior-glow", exterior ? "exterior" : "courtyard");
    interiorGlow.position.set(horizontal ? 0 : side === "+x" ? -0.32 : 0.32, 2.1, horizontal ? side === "+z" ? -0.32 : 0.32 : 0);
    const ceilingLight = mallMesh(new THREE.BoxGeometry(horizontal ? 2.6 : 0.38, 0.08, horizontal ? 0.38 : 2.6), warmLamp, "shopping-mall-store-ceiling-light", exterior ? "exterior" : "courtyard");
    ceilingLight.position.set(horizontal ? 0 : side === "+x" ? -0.75 : 0.75, 3.42, horizontal ? side === "+z" ? -0.75 : 0.75 : 0);
    store.add(interiorGlow, window, door, sign, awning, ceilingLight);
    cutawayShell.push(window, door, sign, awning);
    if (["fast-food", "burger", "milk-tea", "coffee", "bakery", "restaurant"].includes(tenant)) {
      const counter = mallMesh(new THREE.BoxGeometry(horizontal ? 2.8 : 0.68, 0.95, horizontal ? 0.68 : 2.8), timber, "shopping-mall-food-counter", exterior ? "exterior" : "food-street");
      counter.position.set(horizontal ? 0 : side === "+x" ? -0.9 : 0.9, 1.03, horizontal ? side === "+z" ? -0.9 : 0.9 : 0);
      store.add(counter);
    }
    storefrontIndex += 1;
    if (exterior) exteriorCount += 1; else courtyardCount += 1;
  };

  const populateSide = (wing: Wing, side: Wing["innerSide"], count: number, exterior: boolean, seed: number) => {
    const horizontal = side.endsWith("z");
    const length = horizontal ? wing.width : wing.depth;
    for (let index = 0; index < count; index += 1) {
      const offset = -length * 0.5 + 3.6 + index * (length - 7.2) / Math.max(count - 1, 1);
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
  courtFloor.position.set(0, 0.55, 4);
  courtyard.add(courtFloor);
  const promenade = mallMesh(new THREE.BoxGeometry(10, 0.1, 74), sand, "shopping-mall-open-air-promenade", "courtyard");
  promenade.position.set(0, 0.66, 10);
  promenade.userData = { clearWidth: 10 * SHOPPING_MALL_SCALE, continuous: true, barrierFree: true, openToSky: true, connectsEntryToAnchor: true };
  courtyard.add(promenade);
  for (const x of [-17, 17]) {
    const fountain = mallMesh(new THREE.BoxGeometry(10, 0.62, 4.4), stone, "shopping-mall-courtyard-fountain", "courtyard");
    fountain.position.set(x, 0.9, 2);
    const fountainWater = mallMesh(new THREE.BoxGeometry(9.2, 0.18, 3.6), water, "shopping-mall-courtyard-fountain-water", "courtyard");
    fountainWater.position.set(x, 1.28, 2);
    courtyard.add(fountain, fountainWater);
  }
  for (const x of [-25, -15, 15, 25]) {
    for (const z of [-7, 13]) {
      const table = mallMesh(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 16), timber, "shopping-mall-outdoor-dining-table", "food-street");
      table.position.set(x, 1.25, z);
      const umbrellaAssembly = new THREE.Group();
      umbrellaAssembly.name = "shopping-mall-dining-umbrella-assembly";
      umbrellaAssembly.position.set(x, 0, z);
      umbrellaAssembly.userData = { canopyOrientation: "apex-up", groundMounted: true };
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
      umbrellaAssembly.add(umbrellaPole, umbrella, finial);
      courtyard.add(table, umbrellaAssembly);
      for (const [dx, dz] of [[-1.55, 0], [1.55, 0], [0, -1.55], [0, 1.55]]) {
        const chair = mallMesh(new THREE.BoxGeometry(0.65, 0.75, 0.65), charcoal, "shopping-mall-outdoor-dining-chair", "food-street");
        chair.position.set(x + dx, 0.95, z + dz);
        courtyard.add(chair);
      }
    }
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
  }
  const openSkyMarker = new THREE.Group();
  openSkyMarker.name = "shopping-mall-open-sky-void";
  openSkyMarker.userData.size = { width: 38 * SHOPPING_MALL_SCALE, depth: 41 * SHOPPING_MALL_SCALE };
  courtyard.add(openSkyMarker);

  // Upper circulation hugs the inner facades. Supported open-air galleries
  // replace the former floating slabs that crossed and visually roofed the court.
  const arcadeSpecs = [
    { x: 0, z: -26.8, width: 84, depth: 3.2, guardSide: "+z" as const },
    { x: -45.8, z: 3, width: 3.2, depth: 42, guardSide: "+x" as const },
    { x: 45.8, z: 3, width: 3.2, depth: 42, guardSide: "-x" as const },
    { x: -28, z: 26.8, width: 24, depth: 3.2, guardSide: "-z" as const },
    { x: 28, z: 26.8, width: 24, depth: 3.2, guardSide: "-z" as const },
  ];
  arcadeSpecs.forEach(({ x, z, width, depth, guardSide }) => {
    const arcade = new THREE.Group();
    arcade.name = "shopping-mall-supported-open-air-arcade";
    arcade.position.set(x, 0, z);
    arcade.userData = { attachedToFacade: true, openAir: true, guardSide };
    mall.add(arcade);
    const gallery = new THREE.Group();
    gallery.name = "shopping-mall-upper-arcade";
    gallery.position.y = 4.95;
    arcade.add(gallery);
    const horizontal = width > depth;
    const length = horizontal ? width : depth;
    if (guardSide === "-z" && width === 24) {
      const openingX = x < 0 ? 10 : -10;
      const openingHalfWidth = 1.7;
      const rearSlab = mallMesh(new THREE.BoxGeometry(width, 0.3, depth * 0.5), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
      rearSlab.position.z = depth * 0.25;
      gallery.add(rearSlab);
      const frontMin = -width * 0.5;
      const frontMax = width * 0.5;
      for (const [start, end] of [[frontMin, openingX - openingHalfWidth], [openingX + openingHalfWidth, frontMax]] as Array<[number, number]>) {
        if (end - start < 0.5) continue;
        const segment = mallMesh(new THREE.BoxGeometry(end - start, 0.3, depth * 0.5), sand, "shopping-mall-upper-arcade-slab-segment", "upper-arcade");
        segment.position.set((start + end) * 0.5, 0, -depth * 0.25);
        gallery.add(segment);
      }
      const opening = new THREE.Group();
      opening.name = "shopping-mall-escalator-floor-opening";
      opening.position.set(openingX, 0.15, -depth * 0.25);
      opening.userData = { clearWidth: 3.4, clearDepth: depth * 0.5, openToEscalator: true, guardedSides: 3 };
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
        guard.position.set((start + end) * 0.5, 5.7, -depth * 0.5 + 0.08);
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
        5.7,
        guardSide === "+z" ? depth * 0.5 - 0.08 : guardSide === "-z" ? -depth * 0.5 + 0.08 : 0,
      );
      arcade.add(guard);
    }
    const supportIntervals = Math.ceil(length / 8);
    for (let index = 0; index <= supportIntervals; index += 1) {
      const offset = -length * 0.5 + index / supportIntervals * length;
      const support = mallMesh(new THREE.BoxGeometry(0.3, 4.35, 0.3), charcoal, "shopping-mall-arcade-support-column", "upper-arcade");
      support.position.set(horizontal ? offset : 0, 2.7, horizontal ? 0 : offset);
      const pergola = mallMesh(
        new THREE.BoxGeometry(horizontal ? 0.24 : 3.45, 0.18, horizontal ? 3.45 : 0.24),
        timber,
        "shopping-mall-arcade-pergola-slat",
        "upper-arcade",
      );
      pergola.position.set(horizontal ? offset : 0, 7.65, horizontal ? 0 : offset);
      arcade.add(support, pergola);
    }
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
  addCornerBridge(new THREE.Vector3(-42, 5.1, -26.8), new THREE.Vector3(-45.8, 5.1, -18));
  addCornerBridge(new THREE.Vector3(42, 5.1, -26.8), new THREE.Vector3(45.8, 5.1, -18));
  addCornerBridge(new THREE.Vector3(-45.8, 5.1, 24), new THREE.Vector3(-40, 5.1, 26.8));
  addCornerBridge(new THREE.Vector3(45.8, 5.1, 24), new THREE.Vector3(40, 5.1, 26.8));

  // Two symmetrical escalators rise in the same physical +Z direction to the
  // south-wing galleries. Individual horizontal treads replace the old pair
  // of oppositely rotated ramp boxes.
  for (const [index, x] of [-18, 18].entries()) {
    const escalator = new THREE.Group();
    escalator.name = "shopping-mall-escalator";
    escalator.position.set(x, 0, 19.5);
    const lowerY = 0.82;
    const upperY = 5.05;
    const run = 10;
    const slopeLength = Math.hypot(run, upperY - lowerY);
    const slopeAngle = Math.atan2(upperY - lowerY, run);
    escalator.userData = {
      physicalSlopeDirection: "+z",
      travelDirection: index === 0 ? "up" : "down",
      lowerLanding: { x, y: 0.69, z: 13.3 },
      upperLanding: { x, y: 5.02, z: 25.65 },
      connectedToUpperArcade: true,
      outsideCentralPromenade: true,
      coordinateSpace: "mall-local",
    };
    mall.add(escalator);

    const lowerLanding = mallMesh(new THREE.BoxGeometry(2.7, 0.22, 2.2), escalatorMetal, "shopping-mall-escalator-lower-landing", "upper-arcade");
    lowerLanding.position.set(0, 0.69, -6.2);
    const upperLanding = mallMesh(new THREE.BoxGeometry(2.7, 0.22, 2.3), escalatorMetal, "shopping-mall-escalator-upper-landing", "upper-arcade");
    upperLanding.position.set(0, 5.02, 6.15);
    escalator.add(lowerLanding, upperLanding);

    for (const side of [-1, 1]) {
      const lowerGuard = mallMesh(new THREE.BoxGeometry(0.12, 1.1, 2.25), glass, "shopping-mall-escalator-landing-guard", "upper-arcade");
      lowerGuard.position.set(side * 1.3, 1.3, -6.2);
      const upperGuard = mallMesh(new THREE.BoxGeometry(0.12, 1.1, 2.35), glass, "shopping-mall-escalator-landing-guard", "upper-arcade");
      upperGuard.position.set(side * 1.3, 5.65, 6.15);
      escalator.add(lowerGuard, upperGuard);
      for (const [y, startZ, endZ] of [[1.3, -7.32, -5.08], [5.65, 4.98, 7.32]] as Array<[number, number, number]>) {
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
      const edge = mallMesh(new THREE.BoxGeometry(2.12, 0.035, 0.07), safetyYellow, "shopping-mall-escalator-step-safety-edge", "upper-arcade");
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
    }
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
  const openEntry = new THREE.Group();
  openEntry.name = "shopping-mall-open-entry-void";
  openEntry.userData = {
    width: 21 * SHOPPING_MALL_SCALE,
    clearHeight: 11.8 * SHOPPING_MALL_SCALE,
    barrierFree: true,
    openToCourtyard: true,
  };
  entry.add(openEntry);

  const lightPositions: Array<[number, number]> = [[-62, 46], [-42, 49], [-20, 50], [20, 50], [42, 49], [62, 46], [-68, 25], [68, 25], [-68, -25], [68, -25], [-46, -52], [0, -52], [46, -52]];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.48, z);
    light.scale.setScalar(1.02);
    light.userData.sourceCollection = "city-street-furniture";
    reusedStreetLights.push(light);
    mall.add(light);
  });
  const planterPositions: Array<[number, number]> = [[-42, 31], [-20, 31], [20, 31], [42, 31], [-38, -20], [38, -20], [-10, 17], [10, 17], [-8, -12], [8, -12]];
  planterPositions.forEach(([x, z]) => {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.55, z);
    planter.scale.setScalar(1.12);
    planter.userData.sourceCollection = "city-street-furniture";
    mall.add(planter);
  });

  const restaurantTenants: MallTenant[] = ["fast-food", "coffee", "burger", "milk-tea", "bakery", "restaurant"];
  const countTenant = (tenant: MallTenant) => {
    let count = 0;
    mall.traverse((object) => { if (object.name === "shopping-mall-storefront" && object.userData.tenantType === tenant) count += 1; });
    return count;
  };
  const restaurantCount = restaurantTenants.reduce((total, tenant) => total + countTenant(tenant), 0);
  mall.userData = {
    modelType: "shopping-mall",
    generatedLocally: true,
    zones: ["overview", "exterior", "courtyard", "food-street", "lifestyle", "upper-arcade"],
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
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    scaleMultiplier: SHOPPING_MALL_SCALE,
    siteSize: new THREE.Vector3(160, 18, 120).multiplyScalar(SHOPPING_MALL_SCALE),
    setPowered: (powered) => {
      glass.emissiveIntensity = powered ? 0.65 : 0.1;
      curtainGlass.emissiveIntensity = powered ? 0.82 : 0.1;
      warmWindow.emissiveIntensity = powered ? 2.2 : 0.12;
      warmLamp.emissiveIntensity = powered ? 2.8 : 0.18;
      water.emissiveIntensity = powered ? 0.62 : 0.12;
      Object.values(tenantMaterials).forEach((material) => { material.emissiveIntensity = powered ? 1.15 : 0.08; });
      reusedStreetLights.forEach((light) => light.userData.setPowered(powered));
    },
    setInteriorCutaway: (cutaway) => { cutawayShell.forEach((object) => { object.visible = !cutaway; }); },
  };
  mall.scale.setScalar(SHOPPING_MALL_SCALE);
  mall.userData.setPowered(false);
  mall.userData.setInteriorCutaway(false);
  return mall;
}
