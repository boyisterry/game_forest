import { expect, test, type Page, type TestInfo } from "@playwright/test";

type RouteId = "editor-fit" | "replica-0-main-road" | "replica-2-1-mall";

async function readState(page: Page) {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("render_game_to_text is unavailable");
    return JSON.parse(render());
  });
}

async function resetSamples(page: Page) {
  await page.evaluate(() => {
    const reset = (window as Window & { reset_city_performance_samples?: () => void })
      .reset_city_performance_samples;
    if (!reset) throw new Error("reset_city_performance_samples is unavailable");
    reset();
  });
}

async function selectRoute(page: Page, id: RouteId) {
  return page.evaluate((routeId) => {
    const select = (window as Window & {
      set_city_performance_route?: (value: RouteId) => Readonly<{
        id: RouteId;
        durationSeconds: number;
        targetX: number;
        targetZ: number;
      }>;
    }).set_city_performance_route;
    if (!select) throw new Error("set_city_performance_route is unavailable");
    return select(routeId);
  }, id);
}

async function captureRoute(
  page: Page,
  testInfo: TestInfo,
  inputKey: "ArrowRight" | "w",
  routeId: RouteId,
  durationSeconds: number,
) {
  await resetSamples(page);
  const route = await selectRoute(page, routeId);
  expect(route.durationSeconds).toBe(durationSeconds);
  await page.keyboard.down(inputKey);
  await page.waitForTimeout(durationSeconds * 1_000);
  const performance = (await readState(page)).cityPerformance as Record<string, number | string | boolean>;
  const screenshotPath = testInfo.outputPath(`${routeId}.png`);
  await page.locator("canvas.scene-canvas").screenshot({ path: screenshotPath });
  await testInfo.attach(`${routeId} visual`, { path: screenshotPath, contentType: "image/png" });
  await page.keyboard.up(inputKey);

  expect(performance.frameSamples).toBeGreaterThan(0);
  expect(performance.cpuRenderSamples).toBeGreaterThan(0);
  expect(performance.normalCpuRenderSamples).toBeGreaterThan(0);
  expect(performance.cpuRenderP50Ms).toBeGreaterThan(0);
  expect(Number(performance.cpuRenderP95Ms)).toBeGreaterThanOrEqual(Number(performance.cpuRenderP50Ms));
  expect(Number(performance.normalCpuRenderP95Ms)).toBeGreaterThanOrEqual(
    Number(performance.normalCpuRenderP50Ms),
  );
  expect(performance.colorCallsAverage).toBeGreaterThan(0);
  expect(performance.colorCallsMax).toBeGreaterThan(0);
  expect(performance.renderPassProbeMisses).toBe(0);
  if (performance.gpuTimerSupported) {
    expect(performance.gpuRenderSamples).toBeGreaterThan(0);
    expect(Number(performance.gpuRenderP95Ms)).toBeGreaterThanOrEqual(Number(performance.gpuRenderP50Ms));
    expect(performance.normalGpuRenderSamples).toBeGreaterThan(0);
  }
  return Object.freeze({ route, performance, screenshotPath });
}

test("20x Cedar Crossing completes the fixed 10s warm-up and 30s hardware characterization route", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await page.locator('[data-map-id="cedar-crossing"]')
    .getByRole("button", { name: /edit cedar crossing/i })
    .click();
  await page.waitForFunction(() => typeof (window as Window & {
    apply_city_performance_stress?: unknown;
  }).apply_city_performance_stress === "function");
  const apply = await page.evaluate(() => {
    const stress = (window as Window & {
      apply_city_performance_stress?: (value: number) => Readonly<{
        placements: number;
        roads: number;
        replicas: number;
        cameraRoute: readonly { durationSeconds: number }[];
      }>;
    }).apply_city_performance_stress;
    if (!stress) throw new Error("apply_city_performance_stress is unavailable");
    return stress(20);
  });
  expect(apply.placements).toBe(3_320);
  expect(apply.roads).toBe(1_100);
  expect(apply.replicas).toBe(20);
  expect(apply.cameraRoute.map((route) => route.durationSeconds)).toEqual([8, 12, 10]);
  await expect.poll(async () => (await readState(page)).cityDocument?.collisionReady, {
    timeout: 240_000,
  }).toBe(true);

  // Release protocol: a fixed ten-second warm-up precedes all sampled routes.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(10_000);
  await page.keyboard.up("ArrowRight");

  const editor = await captureRoute(page, testInfo, "ArrowRight", "editor-fit", 8);
  expect(editor.performance.shadowCpuRenderSamples).toBeGreaterThan(0);
  expect(editor.performance.shadowCallsMax).toBeGreaterThan(0);

  await selectRoute(page, "replica-0-main-road");
  await page.getByRole("tab", { name: /^play$/i }).click();
  await expect.poll(async () => (await readState(page)).mode).toBe("ride");
  expect((await readState(page)).cameraProjection.far).toBe(3_200);
  const ride = await captureRoute(page, testInfo, "w", "replica-0-main-road", 12);
  expect(ride.performance.riderStaticShadowCasters).toBe(0);
  expect(ride.performance.riderContactShadowVisible).toBe(true);
  await selectRoute(page, "replica-0-main-road");
  const rideCallAttribution = await page.evaluate(() => {
    const capture = (window as Window & {
      capture_city_render_call_attribution?: () => Readonly<{
        colorCalls: number;
        transmissionCalls: number;
        shadowCalls: number;
        byCategory: readonly Readonly<{ pass: string; category: string; calls: number; triangles: number }>[];
        topObjects: readonly Readonly<{ pass: string; category: string; objectName: string; calls: number }>[];
      }>;
    }).capture_city_render_call_attribution;
    if (!capture) throw new Error("capture_city_render_call_attribution is unavailable");
    return capture();
  });
  expect(rideCallAttribution.colorCalls).toBeGreaterThan(0);
  expect(rideCallAttribution.shadowCalls).toBeGreaterThan(0);
  expect(rideCallAttribution.transmissionCalls).toBe(0);
  expect(rideCallAttribution.colorCalls).toBeLessThanOrEqual(150);
  expect(rideCallAttribution.shadowCalls).toBeLessThanOrEqual(60);

  await page.getByRole("tab", { name: /^workshop$/i }).click();
  await expect.poll(async () => (await readState(page)).mode).toBe("map-editor");
  const mall = await captureRoute(page, testInfo, "ArrowRight", "replica-2-1-mall", 10);
  expect(mall.performance.shadowCpuRenderSamples).toBeGreaterThan(0);
  expect(mall.performance.shadowCallsMax).toBeGreaterThan(0);

  for (const route of [editor, ride, mall]) {
    expect(Number(route.performance.frameTimeP95Ms)).toBeLessThanOrEqual(16.7);
  }
  expect(Number(ride.performance.normalColorCallsP95)).toBeLessThanOrEqual(150);
  expect(Number(ride.performance.shadowCallsP95)).toBeLessThanOrEqual(60);

  expect(errors).toEqual([]);
  console.log(`CITY_HARDWARE_CHARACTERIZATION ${JSON.stringify({
    renderer: editor.performance.webglRenderer,
    gpuTimerSupported: editor.performance.gpuTimerSupported,
    rideBudget: {
      frameP95Pass: Number(ride.performance.frameTimeP95Ms) <= 16.7,
      colorCallsP95Pass: Number(ride.performance.normalColorCallsP95) <= 150,
      shadowCallsP95Pass: Number(ride.performance.shadowCallsP95) <= 60,
    },
    rideCallAttribution,
    editor: editor.performance,
    ride: ride.performance,
    mall: mall.performance,
  })}`);
});

test("heaviest showcase produces a release visual after its idle gate", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/demos/standard-residential-community");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1_200);
  const screenshotPath = testInfo.outputPath("standard-residential-community.png");
  await canvas.screenshot({ path: screenshotPath });
  await testInfo.attach("standard residential community visual", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

test("20x riding exposes exact color and shadow submission attribution", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.locator('[data-map-id="cedar-crossing"]')
    .getByRole("button", { name: /edit cedar crossing/i })
    .click();
  await page.waitForFunction(() => typeof (window as Window & {
    apply_city_performance_stress?: unknown;
  }).apply_city_performance_stress === "function");
  await page.evaluate(() => {
    const stress = (window as Window & { apply_city_performance_stress?: (value: number) => unknown })
      .apply_city_performance_stress;
    if (!stress) throw new Error("apply_city_performance_stress is unavailable");
    stress(20);
  });
  await expect.poll(async () => (await readState(page)).cityDocument?.collisionReady, {
    timeout: 240_000,
  }).toBe(true);
  await selectRoute(page, "replica-0-main-road");
  await page.getByRole("tab", { name: /^play$/i }).click();
  await expect.poll(async () => (await readState(page)).mode).toBe("ride");
  await page.keyboard.down("w");
  await page.waitForTimeout(2_000);
  await page.keyboard.up("w");
  const attribution = await page.evaluate(() => {
    const scopedWindow = window as Window & {
      set_city_performance_route?: (value: RouteId) => unknown;
      capture_city_render_call_attribution?: () => Readonly<{
        colorCalls: number;
        transmissionCalls: number;
        shadowCalls: number;
        byCategory: readonly Readonly<{ pass: string; category: string; calls: number; triangles: number }>[];
        topObjects: readonly Readonly<{
          pass: string;
          category: string;
          objectName: string;
          materialName: string;
          calls: number;
          triangles: number;
        }>[];
      }>;
    };
    if (!scopedWindow.set_city_performance_route || !scopedWindow.capture_city_render_call_attribution) {
      throw new Error("city call attribution hooks are unavailable");
    }
    scopedWindow.set_city_performance_route("replica-0-main-road");
    return scopedWindow.capture_city_render_call_attribution();
  });
  expect(attribution.colorCalls).toBeGreaterThan(0);
  expect(attribution.shadowCalls).toBeGreaterThan(0);
  expect(attribution.transmissionCalls).toBe(0);
  expect(attribution.colorCalls).toBeLessThanOrEqual(150);
  expect(attribution.shadowCalls).toBeLessThanOrEqual(60);
  expect(attribution.byCategory.reduce(
    (sum, entry) => sum + (entry.pass !== "shadow" ? entry.calls : 0),
    0,
  )).toBe(attribution.colorCalls);
  expect(attribution.byCategory.reduce(
    (sum, entry) => sum + (entry.pass === "shadow" ? entry.calls : 0),
    0,
  )).toBe(attribution.shadowCalls);
  console.log(`CITY_CALL_ATTRIBUTION ${JSON.stringify(attribution)}`);
});
