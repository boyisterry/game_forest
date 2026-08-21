import { expect, test } from "@playwright/test";

test("BatchedMesh spike selects a backend from real browser capabilities", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/performance-fixture");
  await expect(page.getByTestId("batch-spike-result")).not.toHaveAttribute("data-state", "running");
  const result = JSON.parse(await page.getByTestId("batch-spike-json").textContent() ?? "null");
  console.log(`CITY_BATCH_SPIKE ${JSON.stringify(result)}`);
  expect(result.state).toBe("passed");
  expect(result.liveInstances).toBe(96);
  expect(result.expandedCapacity).toBe(128);
  expect(result.capacityExpansionPassed).toBe(true);
  expect(result.geometryResizePassed).toBe(true);
  expect(result.lodSwitchPassed).toBe(true);
  expect(result.tintPassed).toBe(true);
  expect(result.visibilityPassed).toBe(true);
  expect(result.raycastPassed).toBe(true);
  expect(result.drawCallCompressionPassed).toBe(true);
  expect(result.recommendedBackend).toBe(result.multiDraw ? "batched-mesh" : "instanced-mesh");
  expect(errors).toEqual([]);
});
