import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createShowcaseRenderBudget,
  hasContinuousShowcaseActivity,
} from "../app/lib/map/showcaseRenderBudget.ts";

test("showcase continuous contract covers every animated state without pinning static views", () => {
  assert.equal(hasContinuousShowcaseActivity({}), false);
  assert.equal(hasContinuousShowcaseActivity({ focusBlend: 0.001 }), false);
  assert.equal(hasContinuousShowcaseActivity({ autoRotate: true }), true);
  assert.equal(hasContinuousShowcaseActivity({ focusBlend: 0.002 }), true);
  assert.equal(hasContinuousShowcaseActivity({ morphChanged: true }), true);
  assert.equal(hasContinuousShowcaseActivity({ internalAnimation: true }), true);
  assert.equal(hasContinuousShowcaseActivity({ controlsChanged: true }), true);
});

test("showcase budget idles static views and throttles continuous shadow refreshes", () => {
  const originals = {
    document: globalThis.document,
    window: globalThis.window,
    performance: globalThis.performance,
  };
  let now = 0;
  const listeners = new Map();
  const fakeTarget = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const controls = {
    addEventListener: fakeTarget.addEventListener,
    removeEventListener: fakeTarget.removeEventListener,
  };
  const shadowUpdates = [];
  const renderer = {
    shadowMap: { autoUpdate: true, needsUpdate: false },
    render() { shadowUpdates.push(this.shadowMap.needsUpdate); },
    setPixelRatio() {},
    setSize() {},
  };
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { ...fakeTarget, visibilityState: "visible" },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { ...fakeTarget, devicePixelRatio: 2 },
    });
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: { now: () => now },
    });
    const budget = createShowcaseRenderBudget({
      renderer,
      host: { clientWidth: 800, clientHeight: 600 },
      controls,
    });
    assert.equal(renderer.shadowMap.autoUpdate, false);
    assert.equal(budget.render({}, {}, true), true);
    now = 50;
    assert.equal(budget.render({}, {}, true), true);
    now = 110;
    assert.equal(budget.render({}, {}, true), true);
    assert.deepEqual(shadowUpdates, [true, false, true]);
    now = 500;
    assert.equal(budget.render({}, {}, false), false, "static view must leave the RAF render path idle");
    budget.invalidate(false);
    assert.equal(budget.render({}, {}, false), true, "non-shadow UI changes must wake one render window");
    assert.equal(shadowUpdates.at(-1), false);
    budget.dispose();
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originals.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originals.window });
    Object.defineProperty(globalThis, "performance", { configurable: true, value: originals.performance });
  }
});

const DEMOS = [
  "amusement-park/AmusementParkDemo.tsx",
  "city-center/CityCenterDemo.tsx",
  "city-park/CityParkDemo.tsx",
  "city-street-furniture/CityFurnitureDemo.tsx",
  "fire-station/FireStationDemo.tsx",
  "hospital-campus/HospitalCampusDemo.tsx",
  "industrial-zones/IndustrialZoneDemo.tsx",
  "luxury-villa-community/LuxuryVillaCommunityDemo.tsx",
  "residential-community/ResidentialCommunityDemo.tsx",
  "school-campus/SchoolCampusDemo.tsx",
  "shopping-mall/ShoppingMallDemo.tsx",
  "sports-center/SportsCenterDemo.tsx",
  "standard-residential-community/StandardResidentialCommunityDemo.tsx",
  "town-center/TownCenterDemo.tsx",
  "transportation/TransportationDemo.tsx",
];

test("every standalone showcase uses the shared budget and an explicit continuous contract", async () => {
  for (const relative of DEMOS) {
    const source = await readFile(new URL(`../app/demos/${relative}`, import.meta.url), "utf8");
    assert.match(source, /createShowcaseRenderBudget\(/, relative);
    assert.match(source, /hasContinuousShowcaseActivity\(/, relative);
    assert.match(source, /renderBudget\.dispose\(\)/, relative);
    assert.doesNotMatch(source, /renderer\.render\(scene, camera\)/, relative);
    assert.doesNotMatch(source, /renderBudget\.render\(scene, camera, true\)/, relative);
  }
});

test("the three heaviest community showcases pool lights and trim shadow casters", async () => {
  for (const relative of [
    "standard-residential-community/StandardResidentialCommunityDemo.tsx",
    "residential-community/ResidentialCommunityDemo.tsx",
    "luxury-villa-community/LuxuryVillaCommunityDemo.tsx",
  ]) {
    const source = await readFile(new URL(`../app/demos/${relative}`, import.meta.url), "utf8");
    assert.match(source, /createScenePointLightPool\(/, relative);
    assert.match(source, /applySceneShadowPolicy\(/, relative);
    assert.match(source, /pointLightPool\.setPowered\(on\)/, relative);
  }
});
