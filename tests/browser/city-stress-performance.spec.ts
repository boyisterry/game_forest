import { expect, test } from "@playwright/test";

test("Cedar Crossing exposes bounded 1x, 10x and 20x production-path stress metrics", async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  const card = page.locator('[data-map-id="cedar-crossing"]');
  await card.getByRole("button", { name: /edit cedar crossing/i }).click();
  await page.waitForFunction(() => typeof (window as Window & {
    apply_city_performance_stress?: unknown;
  }).apply_city_performance_stress === "function");

  const state = async () => JSON.parse(await page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("render_game_to_text is unavailable");
    return render();
  }));
  const results: Array<Readonly<{
    multiplier: number;
    apply: Readonly<{
      renderApplyMs: number;
      roads: number;
      replicas: number;
      worldBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
      cameraFit: Readonly<{ cameraY: number; near: number; far: number }>;
    }>;
    performance: Record<string, number | string | boolean | null>;
  }>> = [];

  for (const multiplier of [1, 10, 20]) {
    const apply = await page.evaluate((nextMultiplier) => {
      const stress = (window as Window & {
        apply_city_performance_stress?: (value: number) => Readonly<{ renderApplyMs: number }>;
      }).apply_city_performance_stress;
      if (!stress) throw new Error("apply_city_performance_stress is unavailable");
      return stress(nextMultiplier);
    }, multiplier);
    await expect.poll(async () => (await state()).cityDocument?.placements, { timeout: 180_000 })
      .toBe(126 * multiplier);
    await expect.poll(async () => (await state()).cityDocument?.roads, { timeout: 180_000 })
      .toBe(56 * multiplier);
    await expect.poll(async () => {
      if (errors.length > 0) throw new Error(errors.join("\n"));
      return (await state()).cityDocument?.collisionReady;
    }, { timeout: 240_000 }).toBe(true);
    await page.evaluate(() => {
      (window as Window & { reset_city_performance_samples?: () => void })
        .reset_city_performance_samples?.();
    });
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(8_000);
    await page.keyboard.up("ArrowRight");
    await page.locator("canvas.scene-canvas").click({ position: { x: 960, y: 540 }, force: true });
    const performanceState = (await state()).cityPerformance;
    expect(performanceState.frameSamples).toBeGreaterThan(0);
    expect(apply.replicas).toBe(multiplier);
    expect(apply.roads).toBe(56 * multiplier);
    expect(apply.cameraFit.cameraY).toBeGreaterThan(180);
    expect(apply.cameraFit.near).toBeGreaterThanOrEqual(0.5);
    expect(apply.cameraFit.far).toBeGreaterThan(apply.cameraFit.cameraY);
    expect(performanceState.pickTestedPlacements).toBeGreaterThanOrEqual(126 * multiplier);
    expect(performanceState.pickCandidatePlacements).toBeLessThan(performanceState.pickTestedPlacements / 5);
    expect(performanceState.pickDurationMs).toBeLessThan(20);
    results.push(Object.freeze({ multiplier, apply, performance: performanceState }));
    console.log(`CEDAR_CITY_STRESS_${multiplier}X ${JSON.stringify({ apply, performance: performanceState })}`);
  }

  const [one, ten, twenty] = results;
  expect(one.performance.batchBackend).toBe("batched-mesh");
  expect(ten.performance.batchPools).toBe(one.performance.batchPools);
  expect(twenty.performance.batchPools).toBe(one.performance.batchPools);
  expect(Number(ten.performance.batchInstances)).toBeGreaterThan(Number(one.performance.batchInstances) * 8);
  expect(Number(twenty.performance.batchInstances)).toBeGreaterThan(Number(ten.performance.batchInstances) * 1.9);
  expect(Number(ten.performance.batchEstimatedBufferBytes)).toBeGreaterThan(
    Number(one.performance.batchEstimatedBufferBytes),
  );
  expect(Number(twenty.performance.batchEstimatedBufferBytes)).toBeGreaterThan(
    Number(ten.performance.batchEstimatedBufferBytes),
  );
  expect(twenty.apply.worldBounds.maxX).toBe(ten.apply.worldBounds.maxX);
  expect(twenty.apply.worldBounds.maxZ).toBeGreaterThan(ten.apply.worldBounds.maxZ);
  expect(Number(twenty.performance.batchVisibleInstances)).toBeGreaterThan(0);
  expect(Number(twenty.performance.triangles)).toBeGreaterThan(0);
  expect(Number(one.performance.collisionReleasedCanonicalSourceTrees)).toBeGreaterThan(0);
  expect(ten.performance.collisionReleasedCanonicalSourceTrees)
    .toBe(one.performance.collisionReleasedCanonicalSourceTrees);
  expect(twenty.performance.collisionReleasedCanonicalSourceTrees)
    .toBe(one.performance.collisionReleasedCanonicalSourceTrees);
  expect(errors).toEqual([]);
});
