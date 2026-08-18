import { expect, test } from "@playwright/test";

test("city workshop edits one authoritative v3 document", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
  await page.getByRole("tab", { name: /workshop/i }).waitFor();
  await page.getByRole("button", { name: /rain harbor/i }).click();
  await expect(page.getByRole("heading", { name: /city map workshop/i })).toBeVisible();
  await expect(page.getByText("0placements", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /import rain harbor/i }).click();
  await expect(page.getByText("0placements", { exact: true })).not.toBeVisible();

  await page.getByPlaceholder(/search buildings/i).fill("street light");
  await page.getByRole("button", { name: /^01 street light /i }).click();
  const canvas = page.locator("canvas.scene-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const placementStat = page.locator(".city-document-stats span").first();
  const placementCount = async () => Number.parseInt((await placementStat.textContent()) ?? "", 10);
  const countBeforePlacement = await placementCount();
  await canvas.click({ position: { x: Math.round(box!.width * 0.55), y: Math.round(box!.height * 0.55) } });
  await expect(page.getByText(/grid/i).last()).toBeVisible();
  await expect.poll(placementCount).toBe(countBeforePlacement + 1);

  // The same pointer/cell must run through the same occupancy path and reject
  // a second object instead of silently stacking it in the v3 document.
  await canvas.click({ position: { x: Math.round(box!.width * 0.55), y: Math.round(box!.height * 0.55) } });
  await expect.poll(placementCount).toBe(countBeforePlacement + 1);

  const textState = async () => JSON.parse(await page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("render_game_to_text is unavailable");
    return render();
  }));
  await expect.poll(async () => (await textState()).cityDocument?.collisionReady, {
    timeout: 60_000,
  }).toBe(true);
  await page.getByRole("tab", { name: /^play$/i }).click();
  await expect.poll(async () => (await textState()).mode).toBe("ride");
  const rideState = await textState();
  expect(rideState.drive.rider.x).toBeCloseTo(rideState.cityDocument.spawn.x, 1);
  expect(rideState.drive.rider.z).toBeCloseTo(rideState.cityDocument.spawn.z, 1);
  await page.getByRole("tab", { name: /workshop/i }).click();
  await expect.poll(async () => (await textState()).mode).toBe("map-editor");

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
  const committedRoadCount = await roadCount();
  await page.getByTitle("Ctrl/Cmd+Z").click();
  await expect.poll(roadCount).toBe(0);
  await page.getByTitle("Ctrl/Cmd+Shift+Z").click();
  await expect.poll(roadCount).toBe(committedRoadCount);
  await page.getByRole("button", { name: /export json/i }).waitFor();
  expect(errors).toEqual([]);
});
