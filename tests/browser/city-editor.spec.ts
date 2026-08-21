import { expect, test } from "@playwright/test";

test("map library creates, edits, persists, and play-launches isolated maps", async ({ page }) => {
  test.setTimeout(210_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();
  await expect(page.getByTestId("map-card")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: /deep forest/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /cedar crossing/i })).toBeVisible();
  const showcaseEntry = page.getByRole("link", { name: /open the city model showcase/i });
  await expect(page.getByTestId("city-model-showcase-entry")).toHaveAttribute("href", "/demos");
  await expect(showcaseEntry).toBeVisible();
  await showcaseEntry.click();
  await expect(page).toHaveURL(/\/demos\/?$/);
  await expect(page.getByRole("heading", { name: "城市模型展示区" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();

  await page.getByTestId("new-city-button").click();
  await page.getByTestId("new-city-name").fill("Browser Test City");
  await page.getByRole("button", { name: /create and edit/i }).click();
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
  const textState = async () => JSON.parse(await page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("render_game_to_text is unavailable");
    return render();
  }));
  await page.getByRole("tab", { name: /workshop/i }).waitFor();
  await expect(page.getByRole("heading", { name: /city map workshop/i })).toBeVisible();
  await expect(page.getByTestId("editor-back-to-maps")).toBeVisible();
  await expect(page.getByTestId("map-autosave-status")).toHaveAttribute("data-state", "saved");
  await expect(page.getByText("0placements", { exact: true })).toBeVisible();
  await expect.poll(async () => (await textState()).cityDocument?.collisionReady, {
    timeout: 60_000,
  }).toBe(true);

  // Empty editor space remains an OrbitControls gesture. Object drags lock
  // the camera separately; editor ownership must not disable view rotation.
  const canvas = page.locator("canvas.scene-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cameraBeforeOrbit = JSON.stringify((await textState()).cameraPosition);
  await canvas.dragTo(canvas, {
    sourcePosition: { x: Math.round(box!.width * 0.34), y: Math.round(box!.height * 0.32) },
    targetPosition: { x: Math.round(box!.width * 0.48), y: Math.round(box!.height * 0.42) },
  });
  await expect.poll(async () => JSON.stringify((await textState()).cameraPosition)).not.toBe(cameraBeforeOrbit);

  await page.getByPlaceholder(/search buildings/i).fill("street light");
  await page.getByRole("button", { name: /^01 street light /i }).click();
  const placementStat = page.locator(".city-document-stats span").first();
  const placementCount = async () => Number.parseInt((await placementStat.textContent()) ?? "", 10);
  const countBeforePlacement = await placementCount();
  const placementPoint = { x: Math.round(box!.width * 0.55), y: Math.round(box!.height * 0.55) };
  await canvas.hover({ position: placementPoint });
  await expect(page.getByTestId("city-placement-preview-status")).toHaveAttribute("data-valid", "true");
  await expect.poll(async () => (await textState()).cityPlacementPreview?.visible).toBe(true);
  await expect.poll(placementCount).toBe(countBeforePlacement);
  await canvas.click({ position: placementPoint });
  await expect.poll(async () => (await textState()).cityPlacementPreview?.visible).toBe(false);
  await expect(page.locator(".city-inspector dt").filter({ hasText: /^grid$/i })).toBeVisible();
  await expect.poll(placementCount).toBe(countBeforePlacement + 1);
  await expect.poll(async () => (await textState()).cityPerformance?.placementIncrementalCommits).toBe(1);
  await expect.poll(async () => (
    await textState()
  ).cityPerformance?.collisionOwnerIndexFullRebuild).toBe(false);
  const incrementalState = await textState();
  expect(incrementalState.cityPerformance.placementLastAdded).toBe(1);
  expect(incrementalState.cityPerformance.placementLastAffectedCatalogs).toBe(1);
  expect(incrementalState.cityPerformance.placementLastAffectedCells).toBe(1);
  expect(incrementalState.cityPerformance.collisionStagedOverActiveRuntime).toBe(true);
  expect(incrementalState.cityPerformance.collisionOwnerIndexFullRebuild).toBe(false);
  expect(incrementalState.cityPerformance.collisionOwnerIndexAddedOwners).toBeGreaterThan(0);
  expect(incrementalState.cityPerformance.collisionOwnerIndexAffectedCells).toBeGreaterThan(0);
  expect(incrementalState.cityPerformance.collisionReleasedCanonicalSourceTrees).toBe(1);
  expect(incrementalState.cityDocument.collisionReady).toBe(true);

  // The first compile releases the hidden canonical tree. A later height/yaw
  // owner rebuild must reuse the immutable packed payload without recreating it.
  await page.getByTestId("city-selection-toolbar").getByRole("button", { name: /rotate/i }).click();
  await expect.poll(async () => (
    await textState()
  ).cityPerformance?.placementIncrementalCommits).toBe(2);
  await expect.poll(async () => (
    await textState()
  ).cityPerformance?.collisionOwnerIndexUpdatedOwners).toBeGreaterThan(0);
  expect((await textState()).cityPerformance.collisionReleasedCanonicalSourceTrees).toBe(1);

  // The same pointer/cell must run through the same occupancy path and reject
  // a second object instead of silently stacking it in the v3 document.
  await canvas.click({ position: placementPoint });
  await expect.poll(placementCount).toBe(countBeforePlacement + 1);
  await expect(page.getByTestId("city-placement-preview-status")).toHaveAttribute("data-valid", "false");

  const gridToggle = page.getByRole("button", { name: /map editor grid/i });
  await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(true);
  await gridToggle.click();
  await expect(gridToggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(false);
  await gridToggle.click();
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(true);
  await expect.poll(async () => (await textState()).cityDocument?.collisionReady, {
    timeout: 60_000,
  }).toBe(true);
  await page.getByRole("tab", { name: /^play$/i }).click();
  await expect.poll(async () => (await textState()).mode).toBe("ride");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(false);
  const rideState = await textState();
  expect(rideState.drive.rider.x).toBeCloseTo(rideState.cityDocument.spawn.x, 1);
  expect(rideState.drive.rider.z).toBeCloseTo(rideState.cityDocument.spawn.z, 1);
  await page.getByRole("tab", { name: /workshop/i }).click();
  await expect.poll(async () => (await textState()).mode).toBe("map-editor");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /clear frame/i }).click();
  await expect.poll(placementCount).toBe(0);
  const roadStat = page.locator(".city-document-stats span").nth(1);
  const roadCount = async () => Number.parseInt((await roadStat.textContent()) ?? "", 10);
  await expect.poll(roadCount).toBe(0);

  await page.getByRole("button", { name: /^road$/i }).click();
  await canvas.dragTo(canvas, {
    sourcePosition: { x: Math.round(box!.width * 0.35), y: Math.round(box!.height * 0.45) },
    targetPosition: { x: Math.round(box!.width * 0.65), y: Math.round(box!.height * 0.45) },
  });
  await expect.poll(roadCount).toBeGreaterThan(0);
  await expect(page.getByTestId("map-autosave-status")).toHaveAttribute("data-state", "saved");
  const committedRoadCount = await roadCount();
  await page.getByTitle("Ctrl/Cmd+Z").click();
  await expect.poll(roadCount).toBe(0);
  await page.getByTitle("Ctrl/Cmd+Shift+Z").click();
  await expect.poll(roadCount).toBe(committedRoadCount);
  await page.getByRole("button", { name: /export json/i }).waitFor();

  // The grid switch is an editor preference, not map content. Keep it off
  // across a keyed workspace remount and a full browser reload.
  await gridToggle.click();
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(false);

  await page.getByRole("button", { name: /map library/i }).click();
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browser Test City" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Browser Test City" })).toBeVisible();

  await page.getByRole("button", { name: /edit browser test city/i }).click();
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
  await expect(gridToggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(false);
  // Direct play must suppress the grid even when the user's editor preference
  // is on; this catches permission leaks during the collision-loading phase.
  await gridToggle.click();
  await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(true);
  await page.getByRole("button", { name: /map library/i }).click();
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();

  await page.getByRole("button", { name: /play browser test city/i }).click();
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
  await expect(page.getByRole("tab", { name: /workshop/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /city map workshop/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /map editor grid/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /back to maps/i })).toBeVisible();
  await expect.poll(async () => (await textState()).app?.entryMode).toBe("play");
  await expect.poll(async () => (await textState()).cityEditorGrid?.visible).toBe(false);
  await expect.poll(async () => (await textState()).mode, { timeout: 60_000 }).toBe("ride");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();

  await page.getByRole("button", { name: /play deep forest/i }).click();
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
  await expect(page.getByRole("tab", { name: /workshop/i })).toHaveCount(0);
  await expect.poll(async () => (await textState()).mapType).toBe("forest");
  await expect.poll(async () => (await textState()).mode, { timeout: 60_000 }).toBe("ride");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: /choose your world/i })).toBeVisible();
  expect(errors).toEqual([]);
});
