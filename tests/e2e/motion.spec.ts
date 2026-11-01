import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Scroll animations must never leave content hidden: not on long pages, not
 * after moving between tabs of the same section.
 */

const FAKE = "http://127.0.0.1:54400";
const unique = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function signIn(context: BrowserContext): Promise<void> {
  const res = await fetch(`${FAKE}/__test/users`, {
    method: "POST",
    body: JSON.stringify({ email: unique("motion") }),
  });
  const { cookieName, cookieValue } = (await res.json()) as {
    cookieName: string;
    cookieValue: string;
  };
  await context.addCookies([
    { name: cookieName, value: cookieValue, domain: "127.0.0.1", path: "/" },
  ]);
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
}

const hiddenCount = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("#main .reveal")].filter(
        (el) => getComputedStyle(el).opacity !== "1" && !el.classList.contains("is-visible"),
      ).length,
  );

test("moving between tabs never leaves sections hidden", async ({ page, context }) => {
  test.setTimeout(90_000); // visits eight pages
  await signIn(context);
  await page.goto("/intelligence");
  for (const tab of ["Walrus Memory", "Insights & recommendations", "Walrus Memory"]) {
    await page.getByRole("link", { name: tab, exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await scrollThrough(page);
    await expect.poll(() => hiddenCount(page), { timeout: 5_000 }).toBe(0);
  }
  for (const path of [
    "/planning",
    "/planning/calendar",
    "/planning/tasks",
    "/wellbeing",
    "/nudges",
  ]) {
    await page.goto(path);
    await scrollThrough(page);
    await expect.poll(() => hiddenCount(page), { timeout: 5_000 }).toBe(0);
  }
});

test("a very tall section still appears when only part of it is on screen", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/intelligence/memory");
  await page.evaluate(() => {
    const s = document.createElement("section");
    s.id = "tall";
    s.style.height = "30000px";
    s.textContent = "Long list";
    document.querySelector("#main")!.appendChild(s);
  });
  await page.locator("#tall").scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("#tall")!).opacity))
    .toBe("1");
});
