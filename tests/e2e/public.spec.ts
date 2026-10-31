import { expect, test } from "@playwright/test";

/**
 * Signed-out behaviour. These tests run against a production build with a
 * placeholder Supabase URL, so they never touch a real database.
 */

test.describe("public pages", () => {
  test("landing page explains AVEN honestly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "finally talking to each other",
    );
    await expect(page.getByRole("link", { name: "Create your account" }).first()).toBeVisible();
    await expect(page.getByText("What works today, and what comes next.")).toBeVisible();
    // No invented money figures anywhere on the page.
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/[$₦€£¥]\s?\d/);
  });

  test("legal drafts are reachable and marked as drafts", async ({ page }) => {
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.getByText("Draft for review")).toBeVisible();
    }
  });

  test("offline page is available", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  });

  test("unknown pages show a helpful 404", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
  });

  test("has a skip link and a theme attribute", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});

test.describe("route protection", () => {
  for (const path of [
    "/overview",
    "/settings",
    "/settings/privacy",
    "/settings/data",
    "/money",
    "/money/transactions",
    "/money/wallets",
    "/intelligence",
    "/intelligence/memory",
    "/settings/integrations",
  ]) {
    test(`${path} redirects signed-out visitors to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%2F/g, "(%2F|/)")}`),
      );
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    });
  }

  test("ignores off-site ?next= targets (open redirect protection)", async ({ page }) => {
    await page.goto("/sign-in?next=//evil.example/steal");
    await expect(page.locator('input[name="next"]')).toHaveValue("/overview");
  });
});

test.describe("auth forms validate on the server", () => {
  test("sign-in rejects an invalid email without calling Supabase", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("sign-up enforces password strength and terms", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("What should we call you?").fill("Ada");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await expect(page.getByText("Please accept the terms and privacy policy.")).toBeVisible();
    // What the user typed (except the password) is kept.
    await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
  });

  test("password visibility can be toggled", async ({ page }) => {
    await page.goto("/sign-in");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });
});

test.describe("security", () => {
  test("sends security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("sign-out refuses GET and cross-site POST", async ({ request }) => {
    expect((await request.get("/auth/sign-out")).status()).toBe(405);
    const cross = await request.post("/auth/sign-out", {
      headers: { Origin: "https://evil.example" },
      form: { scope: "global" },
      maxRedirects: 0,
    });
    expect(cross.status()).toBe(403);
  });

  test("sign-out with no provenance headers fails closed", async ({ request }) => {
    const res = await request.post("/auth/sign-out", { form: { scope: "local" }, maxRedirects: 0 });
    expect(res.status()).toBe(403);
  });

  test("data export is not available to signed-out visitors", async ({ request, baseURL }) => {
    const res = await request.post("/settings/data/export", {
      headers: { Origin: baseURL! },
      maxRedirects: 0,
    });
    expect([303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/sign-in");
    expect(res.headers()["content-type"] ?? "").not.toContain("application/json");
  });
});

test.describe("PWA", () => {
  test("serves a manifest and an uncached service worker", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("AVEN");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-store");
    expect(await sw.text()).toContain("Pages are NEVER cached".replace("Pages", "pages"));
  });
});

test.describe("sync endpoint", () => {
  test("refuses signed-out and cross-site requests", async ({ request, baseURL }) => {
    const signedOut = await request.post("/api/sync", { headers: { Origin: baseURL! }, data: {} });
    expect(signedOut.status()).toBe(401);
    const crossSite = await request.post("/api/sync", {
      headers: { Origin: "https://evil.example" },
      data: {},
    });
    expect(crossSite.status()).toBe(403);
  });
});
