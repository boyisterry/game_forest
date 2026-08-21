import { expect, test } from "@playwright/test";

test("the heaviest static showcase idles and wakes for the complete shatter animation", async ({ page }) => {
  await page.addInitScript(() => {
    let drawCalls = 0;
    for (const constructorName of ["WebGLRenderingContext", "WebGL2RenderingContext"] as const) {
      const Constructor = window[constructorName];
      if (!Constructor) continue;
      for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
        const prototype = Constructor.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        const original = prototype[method];
        if (typeof original !== "function" || original.name === "showcaseBudgetDrawProbe") continue;
        prototype[method] = function showcaseBudgetDrawProbe(...args: unknown[]) {
          drawCalls += 1;
          return original.apply(this, args);
        };
      }
    }
    Object.defineProperty(window, "__takeShowcaseDrawCalls", {
      value: () => {
        const value = drawCalls;
        drawCalls = 0;
        return value;
      },
    });
  });
  await page.goto("/demos/standard-residential-community");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1_200);
  await page.evaluate(() => (window as Window & { __takeShowcaseDrawCalls(): number }).__takeShowcaseDrawCalls());
  await page.waitForTimeout(650);
  const idleDrawCalls = await page.evaluate(
    () => (window as Window & { __takeShowcaseDrawCalls(): number }).__takeShowcaseDrawCalls(),
  );
  expect(idleDrawCalls).toBe(0);

  await page.getByRole("button", { name: "破碎完整小区" }).click();
  await page.waitForTimeout(650);
  const animatedDrawCalls = await page.evaluate(
    () => (window as Window & { __takeShowcaseDrawCalls(): number }).__takeShowcaseDrawCalls(),
  );
  expect(animatedDrawCalls).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "修复完整小区" })).toBeVisible();
});
