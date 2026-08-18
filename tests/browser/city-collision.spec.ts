import { expect, test } from "@playwright/test";

test("module worker transfer and IndexedDB payload cache are real browser paths", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/collision-fixture");
  const result = page.getByTestId("collision-result");
  await expect(result).toHaveAttribute("data-state", "passed");
  await expect(page.getByTestId("source-detached")).toHaveText("true");
  await expect(page.getByTestId("render-intact")).toHaveText("true");
  await expect(page.getByTestId("idb-hit")).toHaveText("true");
  await expect(page.getByTestId("stale-rejected")).toHaveText("true");
  expect(Number(await page.getByTestId("animation-frames").textContent())).toBeGreaterThanOrEqual(2);
  expect(consoleErrors).toEqual([]);
});
