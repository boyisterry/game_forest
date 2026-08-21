import { expect, test } from "@playwright/test";

test("the built-in Cedar Crossing opens as a complete editable and playable city", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  const card = page.locator('[data-map-id="cedar-crossing"]');
  await expect(card.getByRole("heading", { name: "Cedar Crossing" })).toBeVisible();
  await card.getByRole("button", { name: /edit cedar crossing/i }).click();
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");

  const state = async () => JSON.parse(await page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("render_game_to_text is unavailable");
    return render();
  }));
  await expect.poll(async () => (await state()).cityDocument?.placements).toBe(126);
  await expect.poll(async () => (await state()).cityDocument?.roads).toBe(56);
  await expect.poll(async () => (await state()).cityFacilities?.trees).toBeGreaterThan(0);
  await expect.poll(async () => (await state()).cityFacilities?.showroomStreetLights).toBeGreaterThan(0);
  await expect.poll(async () => (await state()).cityFacilities?.showroomTrafficLights).toBeGreaterThan(0);
  await expect.poll(async () => {
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return (await state()).cityDocument?.collisionReady;
  }, { timeout: 180_000 }).toBe(true);
  await page.evaluate(() => {
    const reset = (window as Window & { reset_city_performance_samples?: () => void })
      .reset_city_performance_samples;
    if (!reset) throw new Error("reset_city_performance_samples is unavailable");
    reset();
  });
  // Static editor frames intentionally idle-stop; hold a browse key while
  // sampling so this remains a steady rendered-frame benchmark.
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => (await state()).cityPerformance?.frameSamples, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(180);
  await page.keyboard.up("ArrowRight");
  const performanceState = (await state()).cityPerformance;
  expect(performanceState.webglVersion).toBeGreaterThanOrEqual(1);
  expect(typeof performanceState.webglRenderer).toBe("string");
  expect(typeof performanceState.multiDraw).toBe("boolean");
  expect(performanceState.batchBackend).toBe(
    performanceState.multiDraw ? "batched-mesh" : "instanced-mesh",
  );
  expect(performanceState.frameTimeP50Ms).toBeGreaterThan(0);
  expect(performanceState.frameTimeP95Ms).toBeGreaterThanOrEqual(performanceState.frameTimeP50Ms);
  expect(performanceState.collisionReleasedCanonicalSourceTrees).toBe(
    performanceState.placementLastAffectedCatalogs + 1,
  );
  console.log(`CEDAR_CITY_EDITOR_STEADY_PERFORMANCE ${JSON.stringify(performanceState)}`);
  await expect(page.getByTestId("editor-back-to-maps")).toBeVisible();
  await expect(page.getByTestId("map-autosave-status")).toHaveAttribute("data-state", "saved");
  await page.getByRole("tab", { name: /^play$/i }).click();
  await expect.poll(async () => (await state()).mode).toBe("ride");
  await page.evaluate(() => {
    (window as Window & { reset_city_performance_samples?: () => void })
      .reset_city_performance_samples?.();
  });
  await expect.poll(async () => (await state()).cityPerformance?.frameSamples, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(180);
  const ridePerformanceState = (await state()).cityPerformance;
  expect(ridePerformanceState.frameTimeP50Ms).toBeGreaterThan(0);
  expect(ridePerformanceState.frameTimeP95Ms).toBeGreaterThanOrEqual(ridePerformanceState.frameTimeP50Ms);
  expect(ridePerformanceState.riderStaticShadowCasters).toBe(0);
  expect(ridePerformanceState.riderContactShadowVisible).toBe(true);
  expect(ridePerformanceState.riderContactShadowOpacity).toBeGreaterThan(0);
  expect(ridePerformanceState.staticShadowRefreshes).toBe(0);
  console.log(`CEDAR_CITY_RIDE_STEADY_PERFORMANCE ${JSON.stringify(ridePerformanceState)}`);
  expect(errors).toEqual([]);
});
