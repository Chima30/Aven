import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Signed-in finance flows against the fake Supabase (real Postgres + RLS).
 * Covers: accounts, online + OFFLINE transaction entry, sync, pending display,
 * projected vs confirmed balances, conflicts and cross-user isolation.
 */

const FAKE = "http://127.0.0.1:54400";

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const res = await fetch(`${FAKE}/__test/users`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const { id, cookieName, cookieValue } = (await res.json()) as {
    id: string;
    cookieName: string;
    cookieValue: string;
  };
  await context.addCookies([
    { name: cookieName, value: cookieValue, domain: "127.0.0.1", path: "/" },
  ]);
  return id;
}

async function sql<T = Record<string, unknown>>(
  userId: string,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await fetch(`${FAKE}/__test/sql`, {
    method: "POST",
    body: JSON.stringify({ userId, sql: query, params }),
  });
  return (await res.json()) as T[];
}

/** Locale-independent NGN amount matcher: "₦1,000.00" or "NGN 1,000.00" (minus sign optional). */
const ngn = (amount: string, negative = false) =>
  new RegExp(`^${negative ? "−" : ""}(₦|NGN\\s?)${amount.replace(/[.,]/g, (c) => `\\${c}`)}$`);

const unique = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function createAccount(page: Page, name: string, balance: string) {
  await page.goto("/money/accounts?new=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Currency").selectOption("NGN");
  await dialog.getByLabel("Current balance").fill(balance);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addExpense(page: Page, amount: string, description: string) {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New transaction" });
  await dialog.getByLabel(/^Amount/).fill(amount);
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).toBeHidden();
}

const confirmed = (page: Page) =>
  page.locator("p", { hasText: /^Confirmed balance$/ }).locator("xpath=following-sibling::p[1]");

test.describe("money", () => {
  test("new users see honest empty states", async ({ page, context }) => {
    await signIn(context, unique("empty"));
    await page.goto("/money");
    await expect(page.getByRole("heading", { name: "No accounts yet" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("₦");
  });

  test("records transactions online, offline, and syncs them exactly once", async ({
    page,
    context,
  }) => {
    const userId = await signIn(context, unique("offline"));
    await createAccount(page, "Wallet", "10000.50");
    await expect(confirmed(page)).toHaveText(ngn("10,000.50"));

    // Online: saved to the device, synced, and reflected in the confirmed balance.
    await addExpense(page, "250.50", "Lunch");
    await expect(confirmed(page)).toHaveText(ngn("9,750.00"), { timeout: 15_000 });

    // Offline: kept on the device, shown as pending, confirmed balance unchanged.
    await context.setOffline(true);
    await addExpense(page, "1000", "Taxi");
    await expect(
      page.getByRole("heading", { name: /On this device · not yet synced \(1\)/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/Projected (₦|NGN\s?)8,750\.00 · includes 1 unsynced change/),
    ).toBeVisible();
    await expect(confirmed(page)).toHaveText(ngn("9,750.00"));
    await expect(
      page.getByRole("status").filter({ hasText: "Offline · 1 pending" }).first(),
    ).toBeVisible();

    // Back online: the change syncs automatically, once.
    await context.setOffline(false);
    await expect(confirmed(page)).toHaveText(ngn("8,750.00"), { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /not yet synced/ })).toHaveCount(0);

    const rows = await sql<{ n: number }>(userId, "select count(*)::int as n from transactions");
    expect(rows[0]?.n).toBe(2);
    const events = await sql<{ kind: string }>(userId, "select kind from finance_events");
    expect(events.map((e) => e.kind)).toContain("sync_completed");
  });

  test("a stale offline edit becomes a conflict the user can resolve", async ({
    page,
    context,
  }) => {
    const userId = await signIn(context, unique("conflict"));
    await createAccount(page, "Main", "0");
    await addExpense(page, "100", "Groceries");
    await expect(confirmed(page)).toHaveText(ngn("100.00", true), { timeout: 15_000 });

    await page.getByRole("link", { name: /Groceries/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
    // Let any refresh from the first sync finish, so this page holds version 1.
    await page.waitForLoadState("networkidle");

    // Another device changes the same transaction while this one is offline.
    await context.setOffline(true);
    const [tx] = await sql<{ id: string; account_id: string }>(
      userId,
      "select id, account_id from transactions",
    );
    await sql(
      userId,
      "select apply_finance_mutation(gen_random_uuid(), 'transaction', 'update', $1, $2::jsonb, 1)",
      [
        tx!.id,
        JSON.stringify({
          kind: "expense",
          account_id: tx!.account_id,
          amount_minor: "20000",
          currency_code: "NGN",
          occurred_on: "2026-11-01",
          description: "Groceries (other device)",
        }),
      ],
    );

    await page.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit transaction" });
    await dialog.getByLabel(/^Amount/).fill("150");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    // Wait until the edit is safely stored on this device before reconnecting.
    await expect(dialog).toBeHidden();

    await context.setOffline(false);
    await page.goto("/money/sync");
    await expect(page.getByRole("heading", { name: "Needs your decision" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Groceries \(other device\)/)).toBeVisible();

    // Nothing was overwritten yet.
    let current = await sql<{ amount_minor: number }>(
      userId,
      "select amount_minor from transactions",
    );
    expect(current[0]?.amount_minor).toBe(20000);

    await page.getByRole("button", { name: "Keep my version" }).click();
    await expect(page.getByRole("heading", { name: "Everything is synced" })).toBeVisible({
      timeout: 20_000,
    });
    current = await sql<{ amount_minor: number }>(userId, "select amount_minor from transactions");
    expect(current[0]?.amount_minor).toBe(15000);
  });

  test("users cannot open another user's transaction", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const owner = await signIn(ownerContext, unique("owner"));
    const ownerPage = await ownerContext.newPage();
    await createAccount(ownerPage, "Private", "0");
    await addExpense(ownerPage, "5", "Secret purchase");
    await expect
      .poll(async () => (await sql(owner, "select id from transactions")).length, {
        timeout: 15_000,
      })
      .toBe(1);
    const [tx] = await sql<{ id: string }>(owner, "select id from transactions");

    const otherContext = await browser.newContext();
    await signIn(otherContext, unique("intruder"));
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`/money/transactions/${tx!.id}`);
    // RLS hides the row, so the page renders "not found" (status may be 200 once streaming has begun).
    await expect(otherPage.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
    await expect(otherPage.getByText("Secret purchase")).toHaveCount(0);
    await ownerContext.close();
    await otherContext.close();
  });

  test("budgets count expenses only and show what's left", async ({ page, context }) => {
    await signIn(context, unique("budget"));
    await createAccount(page, "Spending", "50000");
    await addExpense(page, "300", "Shopping");
    await expect(confirmed(page)).toHaveText(ngn("49,700.00"), { timeout: 15_000 });

    await page.goto("/money/budgets?new=1");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Everything");
    await dialog.getByLabel("Currency").selectOption("NGN");
    await dialog.getByLabel("Monthly limit").fill("1000");
    await dialog.getByRole("button", { name: "Create budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Everything" })).toBeVisible();
    await expect(
      page.getByText(/(₦|NGN\s?)300\.00 spent of (₦|NGN\s?)1,000\.00 · 30%/),
    ).toBeVisible();
  });

  test("the cached offline page lets you record a transaction with no connection at all", async ({
    page,
    context,
  }) => {
    const userId = await signIn(context, unique("pwa"));
    await createAccount(page, "Cash", "500");
    // Wait until the service worker is active and has cached the offline page and its scripts.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state;
    });
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.goto("/money").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    const form = page.getByRole("region", { name: "Record a transaction offline" });
    await expect(form).toBeVisible({ timeout: 10_000 });
    await form.getByLabel(/^Amount/).fill("120");
    await form.getByLabel("Description").fill("Bus fare");
    await form.getByRole("button", { name: "Save transaction" }).click();
    await expect(form.getByText(/1 change is waiting/)).toBeVisible();

    await context.setOffline(false);
    await page.goto("/money/accounts");
    await expect
      .poll(async () => (await sql(userId, "select id from transactions")).length, {
        timeout: 20_000,
      })
      .toBe(1);
    const [row] = await sql<{ description: string; amount_minor: number }>(
      userId,
      "select description, amount_minor from transactions",
    );
    expect(row).toEqual({ description: "Bus fare", amount_minor: 12000 });
  });
});
