import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * Stage 3–4 flows against the fake Supabase (real Postgres + RLS).
 *
 * These run WITHOUT Walrus or Tatum credentials (the e2e server has none), so
 * they check the honest "not configured" states, the deterministic
 * recommendations, the decision workflow and the wallet/consent UIs. Live
 * Walrus and Tatum behaviour is verified separately with your own keys
 * (npm run verify:walrus / verify:tatum).
 */

const FAKE = "http://127.0.0.1:54400";
const unique = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

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
) {
  const res = await fetch(`${FAKE}/__test/sql`, {
    method: "POST",
    body: JSON.stringify({ userId, sql: query, params }),
  });
  return (await res.json()) as T[];
}

function monthsAgo(n: number, day: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day));
  return d.toISOString().slice(0, 10);
}

async function mutate(userId: string, entity: string, payload: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const rows = await sql<{ r: { status: string } }>(
    userId,
    "select apply_finance_mutation($1, $2, 'create', $3, $4) as r",
    [crypto.randomUUID(), entity, id, JSON.stringify(payload)],
  );
  expect(rows[0]?.r.status).toBe("applied");
  return id;
}

/** Three complete months of salary and a Food budget that is broken every month. */
async function seedHistory(userId: string) {
  const [food] = await sql<{ id: string }>(
    userId,
    "select id from transaction_categories where name = 'Food' and kind = 'expense'",
  );
  const [salary] = await sql<{ id: string }>(
    userId,
    "select id from transaction_categories where name = 'Salary' and kind = 'income'",
  );
  const account = await mutate(userId, "financial_account", {
    name: "Checking",
    account_type: "bank",
    currency_code: "USD",
  });
  await mutate(userId, "budget", {
    name: "Food",
    category_id: food!.id,
    currency_code: "USD",
    limit_minor: 40000,
    starts_on: monthsAgo(6, 1),
  });
  for (const n of [3, 2, 1]) {
    await mutate(userId, "transaction", {
      kind: "income",
      account_id: account,
      amount_minor: 300000,
      currency_code: "USD",
      category_id: salary!.id,
      occurred_on: monthsAgo(n, 25),
    });
    await mutate(userId, "transaction", {
      kind: "expense",
      account_id: account,
      amount_minor: 50000,
      currency_code: "USD",
      category_id: food!.id,
      occurred_on: monthsAgo(n, 12),
    });
  }
}

test.describe("intelligence", () => {
  test("explains a recommendation and records the user's decision", async ({ page, context }) => {
    const userId = await signIn(context, unique("intel"));
    await seedHistory(userId);

    await page.goto("/intelligence");
    await expect(
      page.getByRole("heading", { level: 1, name: "Insights & recommendations" }),
    ).toBeVisible();
    await expect(page.getByText("Walrus Memory isn't configured")).toBeVisible();

    const card = page.getByTestId("recommendation").filter({ hasText: "Bring Food down to" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("went over its");
    await expect(card).toContainText("3 of the last 3 months");

    await card.getByRole("button", { name: "Decline" }).click();
    await expect(card).toContainText("Declined.", { timeout: 15_000 });
    await expect(card).toContainText("Memory is off");

    await page.reload();
    // The answered card stays in this month's list, without the buttons.
    await expect(card).toContainText("You declined this");
    await expect(card.getByRole("button", { name: "Decline" })).toHaveCount(0);
    const answers = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Your recent answers" }) });
    await expect(answers).toContainText("Bring Food down to");
    await expect(answers).toContainText("Declined");

    const decisions = await sql<{ status: string }>(
      userId,
      "select status from recommendations where kind = 'reduce_category_spend'",
    );
    expect(decisions).toEqual([{ status: "rejected" }]);
  });

  test("a changed amount is saved as the user's own target", async ({ page, context }) => {
    const userId = await signIn(context, unique("modify"));
    await seedHistory(userId);
    await page.goto("/intelligence");
    const card = page.getByTestId("recommendation").filter({ hasText: "Bring Food down to" });
    await card.getByRole("button", { name: "Change amount" }).click();
    await card.getByLabel(/Your amount/).fill("470");
    await card.getByRole("button", { name: "Save my amount" }).click();
    await expect(card).toContainText("Updated with your amount.", { timeout: 15_000 });
    await expect(card).toContainText(/You changed the amount: \$470\.00/);
    const rows = await sql<{ status: string; response_minor: number }>(
      userId,
      "select status, response_minor from recommendations where kind = 'reduce_category_spend'",
    );
    expect(rows).toEqual([{ status: "modified", response_minor: 47000 }]);
  });

  test("new users get an honest empty state", async ({ page, context }) => {
    await signIn(context, unique("fresh"));
    await page.goto("/intelligence");
    await expect(page.getByRole("heading", { name: "Not enough history yet" })).toBeVisible();
  });

  test("memory and integration pages are honest when nothing is configured", async ({
    page,
    context,
  }) => {
    await signIn(context, unique("mem"));
    await page.goto("/intelligence/memory");
    await expect(page.getByText("Walrus Memory isn't configured on this server")).toBeVisible();
    await expect(page.getByTestId("memory-count-stored")).toHaveText("0");
    await expect(page.getByRole("heading", { name: "No memories yet" })).toBeVisible();

    await page.goto("/settings/integrations");
    await expect(page.getByText("Not configured")).toHaveCount(2);
    await expect(page.getByText(/TATUM_API_KEY is not set/)).toBeVisible();
  });
});

test.describe("privacy", () => {
  test("financial memory needs the Walrus disclosures acknowledged", async ({ page, context }) => {
    await signIn(context, unique("consent"));
    await page.goto("/settings/privacy");
    const allow = page.getByRole("button", { name: "Grant: Remember financial context" });
    await expect(
      page.getByText(/Deleting from Walrus is not supported by the MemWal SDK/),
    ).toBeVisible();
    await allow.click();
    // Native validation blocks the form until the box is ticked.
    await expect(
      page.getByRole("button", { name: "Withdraw: Remember financial context" }),
    ).toHaveCount(0);
    await page.getByLabel(/I understand, including that memories can.t be deleted/).check();
    await allow.click();
    await expect(
      page.getByRole("button", { name: "Withdraw: Remember financial context" }),
    ).toBeVisible();
    // Other memory categories stay locked.
    await expect(
      page.getByRole("button", { name: "Grant: Remember wellbeing routines" }),
    ).toBeDisabled();
  });
});

test.describe("sui wallets", () => {
  test("validates, saves and removes read-only wallets", async ({ page, context }) => {
    const userId = await signIn(context, unique("wallet"));
    await page.goto("/money/wallets");
    await expect(page.getByText("Sui access isn't configured")).toBeVisible();

    await page.getByLabel("Sui Mainnet address").fill("suiprivkey1notanaddress");
    await page.getByRole("button", { name: "Add wallet" }).click();
    await expect(page.getByText(/Enter a Sui address/)).toBeVisible();

    const address = `0x${"ab".repeat(32)}`;
    await page.getByLabel("Sui Mainnet address").fill(address.toUpperCase().replace("0X", "0x"));
    await page.getByLabel("Label (optional)").fill("Main wallet");
    await page.getByRole("button", { name: "Add wallet" }).click();
    await expect(page.getByRole("heading", { name: "Main wallet" })).toBeVisible();
    await expect(page.getByText(address)).toBeVisible();

    const rows = await sql<{ address: string }>(userId, "select address from sui_wallets");
    expect(rows).toEqual([{ address }]);

    await page.getByRole("button", { name: "Remove wallet Main wallet" }).click();
    await expect(page.getByRole("heading", { name: "No wallets yet" })).toBeVisible();
  });
});
