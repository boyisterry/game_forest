import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyShoppingMall, SHOPPING_MALL_SCALE } from "../app/lib/map/shoppingMall.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("builds a five-building open-air shopping centre", () => {
  const mall = buildLowPolyShoppingMall();
  assert.equal(mall.name, "city-shopping-mall-lowpoly");
  assert.equal(mall.userData.modelType, "shopping-mall");
  assert.equal(mall.userData.generatedLocally, true);
  assert.equal(mall.userData.buildingCount, 5);
  assert.deepEqual(mall.userData.zones, ["overview", "exterior", "courtyard", "food-street", "lifestyle", "upper-arcade"]);
  assert.ok(mall.getObjectByName("shopping-mall-north-anchor"));
  assert.ok(mall.getObjectByName("shopping-mall-west-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-east-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-southwest-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-southeast-wing"));
  assert.ok(mall.getObjectByName("shopping-mall-grand-entry"));
});

test("wraps every mall wing in a continuous glass curtain facade", () => {
  const mall = buildLowPolyShoppingMall();
  const panels = namedObjects(mall, "shopping-mall-glass-curtain-panel");
  const mullions = namedObjects(mall, "shopping-mall-curtain-wall-mullion");
  assert.ok(panels.length > 300);
  assert.ok(mullions.length > 100);
  assert.ok(panels.every((panel) => panel.material.transparent));
  assert.deepEqual(new Set(panels.map((panel) => panel.userData.facadeSide)), new Set(["+x", "-x", "+z", "-z"]));
  assert.equal(namedObjects(mall, "shopping-mall-upper-window").length, 0);
});

test("keeps the grand entrance fully open and barrier free", () => {
  const mall = buildLowPolyShoppingMall();
  const entrance = mall.getObjectByName("shopping-mall-grand-entry");
  const opening = mall.getObjectByName("shopping-mall-open-entry-void");
  assert.ok(entrance && opening);
  assert.equal(opening.userData.width, 21 * SHOPPING_MALL_SCALE);
  assert.equal(opening.userData.clearHeight, 11.8 * SHOPPING_MALL_SCALE);
  assert.equal(opening.userData.barrierFree, true);
  assert.equal(opening.userData.openToCourtyard, true);
  assert.equal(mall.getObjectByName("shopping-mall-entry-glass-portal"), undefined);
  assert.equal(namedObjects(entrance, "shopping-mall-entry-tower").length, 2);
  assert.equal(namedObjects(entrance, "shopping-mall-entry-sign-beam").length, 1);
});

test("places outward-facing ground-floor stores around the whole complex", () => {
  const mall = buildLowPolyShoppingMall();
  const storefronts = namedObjects(mall, "shopping-mall-storefront");
  const exterior = storefronts.filter((store) => store.userData.exterior);
  const courtyard = storefronts.filter((store) => !store.userData.exterior);
  assert.equal(storefronts.length, 62);
  assert.equal(exterior.length, 34);
  assert.equal(courtyard.length, 28);
  assert.equal(mall.userData.storefrontCount, 62);
  assert.equal(mall.userData.exteriorStorefrontCount, 34);
  assert.equal(mall.userData.courtyardStorefrontCount, 28);
  assert.equal(namedObjects(mall, "shopping-mall-storefront-glass").length, 62);
  assert.equal(namedObjects(mall, "shopping-mall-store-sign").length, 62);
  assert.equal(namedObjects(mall, "shopping-mall-store-awning").length, 62);
});

test("includes fast food, coffee, burger and milk tea tenants", () => {
  const mall = buildLowPolyShoppingMall();
  assert.deepEqual(mall.userData.tenantTypes, ["fast-food", "coffee", "burger", "milk-tea", "bakery", "convenience", "restaurant", "fashion"]);
  assert.ok(mall.userData.restaurantCount >= 40);
  assert.ok(mall.userData.coffeeShopCount >= 7);
  assert.ok(mall.userData.burgerShopCount >= 7);
  assert.ok(mall.userData.milkTeaShopCount >= 7);
  assert.ok(namedObjects(mall, "shopping-mall-food-counter").length >= 40);
  const tenantTypes = new Set(namedObjects(mall, "shopping-mall-storefront").map((store) => store.userData.tenantType));
  for (const type of ["fast-food", "coffee", "burger", "milk-tea"]) assert.ok(tenantTypes.has(type));
});

test("keeps the central mall partially open to the sky", () => {
  const mall = buildLowPolyShoppingMall();
  const courtyard = mall.getObjectByName("shopping-mall-open-air-courtyard");
  const openSky = mall.getObjectByName("shopping-mall-open-sky-void");
  assert.equal(courtyard.userData.openToSky, true);
  assert.deepEqual(openSky.userData.size, { width: 38 * SHOPPING_MALL_SCALE, depth: 41 * SHOPPING_MALL_SCALE });
  const promenade = mall.getObjectByName("shopping-mall-open-air-promenade");
  assert.deepEqual(promenade.userData, { clearWidth: 10 * SHOPPING_MALL_SCALE, continuous: true, barrierFree: true, openToSky: true, connectsEntryToAnchor: true });
  assert.equal(mall.userData.promenadeClearWidth, 10 * SHOPPING_MALL_SCALE);
  assert.equal(mall.userData.throughRouteOpenToSky, true);
  assert.equal(namedObjects(mall, "shopping-mall-partial-glass-canopy").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-outdoor-dining-table").length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-outdoor-dining-chair").length, 32);
  const umbrellas = namedObjects(mall, "shopping-mall-dining-umbrella");
  assert.equal(umbrellas.length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-dining-umbrella-pole").length, 8);
  assert.equal(namedObjects(mall, "shopping-mall-dining-umbrella-finial").length, 8);
  assert.ok(umbrellas.every((umbrella) => umbrella.rotation.x === 0));
  assert.ok(umbrellas.every((umbrella) => umbrella.userData.apexDirection === "+y"));
  assert.ok(umbrellas.every((umbrella) => umbrella.material.side === THREE.DoubleSide));
  assert.equal(namedObjects(mall, "shopping-mall-courtyard-fountain").length, 2);
});

test("connects the building group with upper arcades, bridges and escalators", () => {
  const mall = buildLowPolyShoppingMall();
  assert.equal(mall.userData.upperBridgeCount, 4);
  assert.equal(mall.userData.escalatorCount, 2);
  const bridges = namedObjects(mall, "shopping-mall-upper-bridge");
  assert.equal(bridges.length, 4);
  assert.ok(bridges.every((bridge) => bridge.userData.cornerConnection));
  assert.ok(bridges.every((bridge) => bridge.userData.spanLength < 12));
  assert.ok(bridges.every((bridge) => bridge.userData.crossesCourtyard === false));
  const escalators = namedObjects(mall, "shopping-mall-escalator");
  assert.equal(escalators.length, 2);
  assert.ok(escalators.every((escalator) => escalator.userData.physicalSlopeDirection === "+z"));
  assert.ok(escalators.every((escalator) => escalator.userData.lowerLanding.z < escalator.userData.upperLanding.z));
  assert.ok(escalators.every((escalator) => escalator.userData.upperLanding.y === 5.02));
  assert.ok(escalators.every((escalator) => escalator.userData.connectedToUpperArcade));
  assert.ok(escalators.every((escalator) => escalator.userData.outsideCentralPromenade));
  assert.deepEqual(escalators.map((escalator) => escalator.userData.travelDirection), ["up", "down"]);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-step").length, 36);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-step-safety-edge").length, 36);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-lower-landing").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-upper-landing").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-underframe").length, 2);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-glass-rail").length, 4);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-handrail").length, 4);
  assert.equal(namedObjects(mall, "shopping-mall-escalator-steps").length, 0);
  assert.equal(namedObjects(mall, "shopping-mall-upper-arcade").length, 5);
  assert.equal(namedObjects(mall, "shopping-mall-supported-open-air-arcade").length, 5);
  assert.ok(namedObjects(mall, "shopping-mall-arcade-support-column").length >= 30);
  assert.ok(namedObjects(mall, "shopping-mall-arcade-pergola-slat").length >= 30);
  assert.equal(namedObjects(mall, "shopping-mall-bridge-glass-guard").length, 8);
});

test("supports commercial night lighting and structural cutaway", () => {
  const mall = buildLowPolyShoppingMall();
  const sign = namedObjects(mall, "shopping-mall-store-sign")[0];
  const roof = namedObjects(mall, "shopping-mall-flat-roof")[0];
  const streetLights = namedObjects(mall, "street-light-point-light");
  assert.ok(sign instanceof THREE.Mesh && roof instanceof THREE.Mesh);
  mall.userData.setPowered(true);
  assert.ok(sign.material.emissiveIntensity > 1);
  assert.ok(streetLights.every((light) => light.intensity > 0));
  mall.userData.setPowered(false);
  assert.ok(streetLights.every((light) => light.intensity === 0));
  assert.equal(roof.visible, true);
  mall.userData.setInteriorCutaway(true);
  assert.equal(roof.visible, false);
});

test("uses the rabbit rider scale and fills an independent city site", () => {
  const mall = buildLowPolyShoppingMall();
  const metrics = measureModelGeometry(mall);
  assert.equal(mall.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(mall.userData.scaleStandard, "rabbit-rider");
  assert.equal(mall.userData.scaleMultiplier, SHOPPING_MALL_SCALE);
  assert.equal(mall.scale.x, SHOPPING_MALL_SCALE);
  assert.equal(mall.userData.siteSize.x, 184);
  assert.equal(mall.userData.siteSize.y, 20.7);
  assert.equal(mall.userData.siteSize.z, 138);
  assert.ok(metrics.size.x >= 183);
  assert.ok(metrics.size.z >= 137);
  assert.ok(metrics.size.y >= 19.5);
  assert.equal(namedObjects(mall, "city-street-light-lowpoly").length, 13);
  assert.equal(namedObjects(mall, "city-roadside-planter-lowpoly").length, 10);
});

test("exposes the shopping centre from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/shopping-mall/ShoppingMallDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyShoppingMall/);
  assert.match(demoSource, /都会里/);
  assert.match(demoSource, /外向临街商业/);
  assert.match(demoSource, /快餐 · 咖啡 · 汉堡 · 奶茶/);
  assert.match(demoSource, /兔子骑车主角约 2\.40 m 参考/);
  assert.match(archiveSource, /大型商业中心/);
  assert.match(archiveSource, /\/demos\/shopping-mall/);
  assert.match(studioSource, /学校 · 商业中心/);
});
