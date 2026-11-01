import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * Planning, Wellbeing, Nudge Center and Pulse Check against the fake Supabase
 * (real Postgres + RLS + apply_life_mutation). Quick logs go through the same
 * IndexedDB outbox as transactions, so these also exercise the sync path.
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

async function serviceSql(query: string, params: unknown[] = []) {
  const res = await fetch(`${FAKE}/__test/service-sql`, {
    method: "POST",
    body: JSON.stringify({ sql: query, params }),
  });
  return (await res.json()) as Record<string, unknown>[];
}

test("navigation: Planning, Nudge Center and Wellbeing are available (no LATER labels)", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context, unique("nav"));
  await page.goto("/overview");
  if (isMobile) await page.getByRole("button", { name: /menu/i }).first().click();
  for (const name of ["Planning", "Nudge Center", "Wellbeing"]) {
    await expect(
      page.getByRole("link", { name, exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  await expect(page.getByText("LATER", { exact: true })).toHaveCount(0);
  // Only the username is shown in the app shell, never the sign-in email.
  await expect(page.locator("body")).not.toContainText("@example.com");
  await expect(page.getByText(/Stage \d/)).toHaveCount(0);
});

test("tasks: create one, then complete it (through the offline outbox)", async ({
  page,
  context,
}) => {
  const userId = await signIn(context, unique("tasks"));
  await page.goto("/planning/tasks");
  await page.getByRole("button", { name: "Add task" }).first().click();
  await page.getByLabel("Task", { exact: true }).fill("Renew passport photos");
  await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Renew passport photos").first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Mark done: Renew passport photos" }).first().click();
  await expect
    .poll(
      async () => (await sql<{ status: string }>(userId, "select status from tasks"))[0]?.status,
      { timeout: 15_000 },
    )
    .toBe("completed");
  const events = await sql<{ kind: string }>(userId, "select kind from life_events");
  expect(events.map((e) => e.kind)).toContain("task_completed");
});

test("wellbeing: asks for consent first, then logs water and a Pulse Check", async ({
  page,
  context,
}) => {
  const userId = await signIn(context, unique("well"));
  await page.goto("/wellbeing");
  await expect(page.getByText("Wellbeing logging is off")).toBeVisible();
  await expect(page.getByTestId("water-quick-log")).toHaveCount(0);

  await sql(userId, "select set_consent('wellbeing_data', true, 'settings')");
  await page.goto("/wellbeing/water");
  // en-US accounts default to US fluid ounces; storage is always millilitres.
  await page.getByRole("button", { name: "+ 8 fl oz" }).click();
  await expect
    .poll(
      async () =>
        (await sql<{ amount_ml: number }>(userId, "select amount_ml from water_logs")).map(
          (r) => r.amount_ml,
        ),
      {
        timeout: 15_000,
      },
    )
    .toEqual([237]);

  await page.goto("/nudges/pulse");
  await page.getByText("4 · Good").first().click();
  await page.getByRole("button", { name: "Save Pulse Check" }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<{ source: string; mood: number }>(userId, "select source, mood from mood_logs")
        )[0],
      { timeout: 15_000 },
    )
    .toEqual({ source: "pulse_check", mood: 4 });
  // Nothing was invented: no sleep, meals or activity exist.
  expect(
    await sql(
      userId,
      "select 1 from sleep_logs union all select 1 from meal_logs union all select 1 from activity_logs",
    ),
  ).toEqual([]);
});

test("nudge center: shows delivered nudges, hides held ones, marks read and dismisses", async ({
  page,
  context,
}) => {
  const userId = await signIn(context, unique("nudge"));
  await serviceSql(
    `insert into notifications (user_id, category, kind, title, body, action_url, dedupe_key, status, delivered_at, decision_reason, digest)
     values ($1, 'planning', 'task_reminder', 'Reminder: Pay rent', 'Due today.', '/planning/tasks', 'e2e:1', 'delivered', now(), null, null),
            ($1, 'routines', 'habit_reminder', 'Time for: Stretch', null, '/planning/habits', 'e2e:2', 'suppressed', null, 'category_off', null)`,
    [userId],
  );
  await page.goto("/nudges");
  const item = page.getByTestId("notification").filter({ hasText: "Reminder: Pay rent" });
  await expect(item).toHaveAttribute("data-unread", "true");
  await expect(page.getByText("Time for: Stretch")).toHaveCount(0);
  await item.getByRole("button", { name: /^Mark read/ }).click();
  await expect(item).toHaveAttribute("data-unread", "false");
  await item.getByRole("button", { name: /^Dismiss/ }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();

  await page.goto("/nudges/history");
  await expect(page.getByText("Time for: Stretch")).toBeVisible();
  await expect(page.getByText(/you turned this category off/)).toBeVisible();
  const rows = await sql<{ read_at: string | null; dismissed_at: string | null }>(
    userId,
    "select read_at, dismissed_at from notifications where dedupe_key = 'e2e:1'",
  );
  expect(rows[0]?.read_at).not.toBeNull();
  expect(rows[0]?.dismissed_at).not.toBeNull();
});

test("users never see each other's planning or wellbeing records", async ({ page, context }) => {
  const alice = await signIn(context, unique("alice"));
  const bobRes = await fetch(`${FAKE}/__test/users`, {
    method: "POST",
    body: JSON.stringify({ email: unique("bob") }),
  });
  const { id: bob } = (await bobRes.json()) as { id: string };
  await sql(bob, "select set_consent('wellbeing_data', true, 'settings')");
  await sql(bob, "select apply_life_mutation($1, 'task', 'create', $2, $3, null, null)", [
    crypto.randomUUID(),
    crypto.randomUUID(),
    JSON.stringify({ title: "Bob's secret task" }),
  ]);
  await sql(bob, "select apply_life_mutation($1, 'meal_log', 'create', $2, $3, null, null)", [
    crypto.randomUUID(),
    crypto.randomUUID(),
    JSON.stringify({
      meal_type: "lunch",
      description: "Bob's lunch",
      eaten_at: new Date().toISOString(),
      local_date: new Date().toISOString().slice(0, 10),
    }),
  ]);
  await sql(alice, "select set_consent('wellbeing_data', true, 'settings')");
  await page.goto("/planning/tasks");
  await expect(page.getByText("Bob's secret task")).toHaveCount(0);
  await page.goto("/wellbeing/meals");
  await expect(page.getByText("Bob's lunch")).toHaveCount(0);
});
