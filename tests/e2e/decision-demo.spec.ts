import { expect, test } from "@playwright/test";

test("example decisions materially adapt advice without writing user data", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/demo");
  await expect(page.getByText("Example workspace · local simulation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open next month's scenario" })).toBeDisabled();
  await expect(page.getByText(/10% below/)).toBeVisible();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(page.getByText(/2026-11: rejected/)).toBeVisible();
  await page.getByRole("button", { name: "Open next month's scenario" }).click();
  await expect(page.getByText(/Last time you declined a 10% cut/)).toBeVisible();
  await page.getByLabel("Your food target (NGN)").fill("52000");
  await page.getByRole("button", { name: "Use my amount" }).click();
  await page.getByRole("button", { name: "Open next month's scenario" }).click();
  await expect(page.getByText(/AVEN uses your number instead of its own/)).toBeVisible();
  await page.getByRole("button", { name: "Reset example workspace" }).click();
  await expect(page.getByText("Make your first decision above.")).toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
