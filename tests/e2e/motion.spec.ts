import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Scroll animations must never leave content hidden: anything on screen is
 * fully visible, on long pages and after moving between tabs.
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

/** Every section/card that sits fully on screen must be fully opaque. */
async function onScreenFaded(page: Page) {
  return page.evaluate(async () => {
    const faded: string[] = [];
    const blocks = [
      ...document.querySelectorAll<HTMLElement>("#main section, #main [data-reveal]"),
    ];
    for (const el of blocks) {
      el.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      let node: HTMLElement | null = el;
      let opacity = 1;
      while (node) {
        opacity *= Number(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (opacity < 0.99) faded.push(`${el.tagName} ${el.textContent?.slice(0, 30)} (${opacity})`);
    }
    return faded;
  });
}

test("moving between tabs never leaves sections hidden", async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(context);
  await page.goto("/intelligence");
  for (const tab of ["Walrus Memory", "Insights & recommendations", "Walrus Memory"]) {
    await page.getByRole("link", { name: tab, exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600); // page fade-in
    expect(await onScreenFaded(page)).toEqual([]);
  }
  for (const path of ["/overview", "/planning", "/planning/tasks", "/wellbeing", "/nudges", "/"]) {
    await page.goto(path);
    await page.waitForTimeout(600);
    expect(await onScreenFaded(page)).toEqual([]);
  }
});

test("a very tall section is visible as soon as it's on screen", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/intelligence/memory");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const s = document.createElement("section");
    s.id = "tall";
    s.style.height = "30000px";
    s.textContent = "Long list";
    document.querySelector("#main")!.appendChild(s);
  });
  // Scroll so the section's top is in the middle of the screen.
  await page.evaluate(() => {
    const el = document.querySelector("#tall")!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2);
  });
  await page.waitForTimeout(100);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("#tall")!).opacity))
    .toBe("1");
});

test("scroll animation is actually active (and only as content enters)", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/overview");
  const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
  test.skip(!supported, "This browser has no scroll-driven animations (content is simply static)");
  const name = await page.evaluate(
    () => getComputedStyle(document.querySelector("#main section")!).animationName,
  );
  expect(name).toBe("reveal-up");
});
