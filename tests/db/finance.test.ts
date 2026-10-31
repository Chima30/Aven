import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asUser,
  createTestDatabase,
  createUser,
  pgErrorCode,
  type TestDb,
} from "./harness";

/**
 * Stage 2 finance: balances, transfers, budgets, goals, idempotency,
 * conflicts and cross-user isolation — against real PostgreSQL.
 */

let db: TestDb;
let alice: string;
let bob: string;

type Result = {
  status: "applied" | "conflict" | "rejected";
  replayed?: boolean;
  reason?: string;
  message?: string;
  server_version?: number;
  record?: Record<string, unknown>;
};

async function mutate(
  user: string,
  entity: string,
  operation: string,
  recordId: string,
  payload: Record<string, unknown>,
  baseVersion: number | null = null,
  mutationId: string = randomUUID(),
): Promise<Result> {
  return asUser(db, user, async (c) => {
    const { rows } = await c.query<{ r: Result }>(
      "select apply_finance_mutation($1, $2, $3, $4, $5, $6) as r",
      [mutationId, entity, operation, recordId, JSON.stringify(payload), baseVersion],
    );
    return rows[0]!.r;
  });
}

async function createAccount(
  user: string,
  currency = "NGN",
  opening = 0,
  name = `Acct ${randomUUID().slice(0, 6)}`,
) {
  const id = randomUUID();
  const r = await mutate(user, "financial_account", "create", id, {
    name,
    account_type: "bank",
    currency_code: currency,
    opening_balance_minor: String(opening),
  });
  expect(r.status).toBe("applied");
  return id;
}

async function category(user: string, kind: "income" | "expense", name: string) {
  const { rows } = await asUser(db, user, (c) =>
    c.query<{ id: string }>("select id from transaction_categories where kind = $1 and name = $2", [
      kind,
      name,
    ]),
  );
  return rows[0]!.id;
}

async function tx(
  user: string,
  kind: "income" | "expense" | "transfer",
  account: string,
  amount: number,
  extra: Record<string, unknown> = {},
  currency = "NGN",
) {
  const id = randomUUID();
  const r = await mutate(user, "transaction", "create", id, {
    kind,
    account_id: account,
    amount_minor: String(amount),
    currency_code: currency,
    occurred_on: "2026-11-05",
    ...extra,
  });
  return { id, r };
}

async function balance(user: string, account: string): Promise<bigint> {
  const { rows } = await asUser(db, user, (c) =>
    c.query<{ balance_minor: string }>(
      "select balance_minor from account_balances where account_id = $1",
      [account],
    ),
  );
  return BigInt(rows[0]!.balance_minor);
}

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
});

afterAll(async () => {
  await db?.close();
});

describe("default categories", () => {
  it("seeds 6 income and 12 expense categories per user", async () => {
    const { rows } = await asUser(db, alice, (c) =>
      c.query(
        "select kind, count(*)::int as n from transaction_categories group by kind order by kind",
      ),
    );
    expect(rows).toEqual([
      { kind: "expense", n: 12 },
      { kind: "income", n: 6 },
    ]);
  });
});

describe("balances", () => {
  it("opening balance + income − expense, with the opening balance counted once", async () => {
    const acct = await createAccount(alice, "NGN", 500_000);
    expect(await balance(alice, acct)).toBe(500_000n);
    const salary = await category(alice, "income", "Salary");
    const food = await category(alice, "expense", "Food");
    expect((await tx(alice, "income", acct, 1_000_000, { category_id: salary })).r.status).toBe(
      "applied",
    );
    expect((await tx(alice, "expense", acct, 250_050, { category_id: food })).r.status).toBe(
      "applied",
    );
    expect(await balance(alice, acct)).toBe(500_000n + 1_000_000n - 250_050n);
  });

  it("supports zero- and three-decimal currencies exactly", async () => {
    const yen = await createAccount(alice, "JPY", 1500);
    const kwd = await createAccount(alice, "KWD", 1250);
    await tx(alice, "expense", yen, 999, {}, "JPY");
    await tx(alice, "income", kwd, 1, {}, "KWD");
    expect(await balance(alice, yen)).toBe(501n);
    expect(await balance(alice, kwd)).toBe(1251n);
  });

  it("allows a negative opening balance (e.g. a credit card)", async () => {
    const card = await createAccount(alice, "USD", -12_345);
    expect(await balance(alice, card)).toBe(-12_345n);
  });

  it("rejects a currency that does not match the account", async () => {
    const acct = await createAccount(alice, "NGN");
    const { r } = await tx(alice, "expense", acct, 100, {}, "USD");
    expect(r).toMatchObject({ status: "rejected" });
  });

  it("rejects zero, negative and oversized amounts", async () => {
    const acct = await createAccount(alice, "NGN");
    for (const amount of [0, -5]) {
      expect((await tx(alice, "expense", acct, amount)).r.status).toBe("rejected");
    }
    const huge = await mutate(alice, "transaction", "create", randomUUID(), {
      kind: "expense",
      account_id: acct,
      amount_minor: "9000000000000001",
      currency_code: "NGN",
      occurred_on: "2026-11-05",
    });
    expect(huge.status).toBe("rejected");
  });

  it("users cannot write finance tables directly", async () => {
    const acct = await createAccount(alice, "NGN");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            `insert into transactions (id, user_id, kind, account_id, amount_minor, currency_code, occurred_on)
             values ($1, $2, 'income', $3, 100, 'NGN', '2026-11-01')`,
            [randomUUID(), alice, acct],
          ),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update financial_accounts set opening_balance_minor = 999999999"),
        ),
      ),
    ).toBe("42501");
  });
});

describe("transfers", () => {
  it("move money between two accounts and are not income or expense", async () => {
    const from = await createAccount(alice, "GBP", 10_000);
    const to = await createAccount(alice, "GBP", 0);
    const { r } = await tx(alice, "transfer", from, 2_500, { transfer_account_id: to }, "GBP");
    expect(r.status).toBe("applied");
    expect(await balance(alice, from)).toBe(7_500n);
    expect(await balance(alice, to)).toBe(2_500n);

    const { rows } = await asUser(db, alice, (c) =>
      c.query(
        "select * from finance_summary('2026-11-01', '2026-11-30') where currency_code = 'GBP'",
      ),
    );
    expect(rows).toEqual([]); // transfers never appear in income/expense summaries
  });

  it("are atomic: a failing transfer changes neither account", async () => {
    const from = await createAccount(alice, "EUR", 10_000);
    const to = await createAccount(alice, "USD", 0); // different currency → must fail
    const { r } = await tx(alice, "transfer", from, 2_500, { transfer_account_id: to }, "EUR");
    expect(r.status).toBe("rejected");
    expect(await balance(alice, from)).toBe(10_000n);
    expect(await balance(alice, to)).toBe(0n);
  });

  it("cannot target the same account, or another user's account", async () => {
    const mine = await createAccount(alice, "CAD", 1_000);
    const bobs = await createAccount(bob, "CAD", 0);
    expect(
      (await tx(alice, "transfer", mine, 10, { transfer_account_id: mine }, "CAD")).r.status,
    ).toBe("rejected");
    const stolen = await tx(alice, "transfer", mine, 10, { transfer_account_id: bobs }, "CAD");
    expect(stolen.r).toMatchObject({ status: "rejected", message: "Not found." });
    expect(await balance(bob, bobs)).toBe(0n);
  });

  it("cannot carry a category", async () => {
    const a = await createAccount(alice, "AUD");
    const b = await createAccount(alice, "AUD");
    const food = await category(alice, "expense", "Food");
    const { r } = await tx(
      alice,
      "transfer",
      a,
      10,
      { transfer_account_id: b, category_id: food },
      "AUD",
    );
    expect(r.status).toBe("rejected");
  });
});

describe("categories", () => {
  it("must match the transaction type and belong to the user", async () => {
    const acct = await createAccount(alice, "NGN");
    const salary = await category(alice, "income", "Salary");
    expect((await tx(alice, "expense", acct, 10, { category_id: salary })).r.status).toBe(
      "rejected",
    );
    const bobsFood = await category(bob, "expense", "Food");
    expect((await tx(alice, "expense", acct, 10, { category_id: bobsFood })).r).toMatchObject({
      status: "rejected",
      message: "Not found.",
    });
  });

  it("can be created, renamed and archived; names are unique per user while active", async () => {
    const id = randomUUID();
    expect(
      (await mutate(alice, "category", "create", id, { kind: "expense", name: "Pets" })).status,
    ).toBe("applied");
    expect(
      (await mutate(alice, "category", "create", randomUUID(), { kind: "expense", name: "pets" }))
        .status,
    ).toBe("rejected");
    // Bob can use the same name.
    expect(
      (await mutate(bob, "category", "create", randomUUID(), { kind: "expense", name: "Pets" }))
        .status,
    ).toBe("applied");
    const archived = await mutate(alice, "category", "update", id, { archived: true }, 1);
    expect(archived).toMatchObject({ status: "applied", server_version: 2 });
  });
});

describe("idempotency (offline retries)", () => {
  it("replays the same response instead of creating a duplicate", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const mutationId = randomUUID();
    const recordId = randomUUID();
    const payload = {
      kind: "income",
      account_id: acct,
      amount_minor: "5000",
      currency_code: "NGN",
      occurred_on: "2026-11-02",
    };
    const first = await mutate(alice, "transaction", "create", recordId, payload, null, mutationId);
    const second = await mutate(
      alice,
      "transaction",
      "create",
      recordId,
      payload,
      null,
      mutationId,
    );
    expect(first.status).toBe("applied");
    expect(second).toMatchObject({ status: "applied", replayed: true });
    expect(await balance(alice, acct)).toBe(5000n);
    const { rowCount } = await asUser(db, alice, (c) =>
      c.query("select 1 from transactions where id = $1", [recordId]),
    );
    expect(rowCount).toBe(1);
  });

  it("is safe under concurrent duplicate delivery", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const mutationId = randomUUID();
    const recordId = randomUUID();
    const payload = {
      kind: "income",
      account_id: acct,
      amount_minor: "700",
      currency_code: "NGN",
      occurred_on: "2026-11-02",
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        mutate(alice, "transaction", "create", recordId, payload, null, mutationId),
      ),
    );
    expect(results.every((r) => r.status === "applied")).toBe(true);
    expect(results.filter((r) => r.replayed).length).toBe(3);
    expect(await balance(alice, acct)).toBe(700n);
  });

  it("a different mutation reusing an existing record id is a conflict, not a duplicate row", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const { id } = await tx(alice, "income", acct, 100);
    const again = await mutate(alice, "transaction", "create", id, {
      kind: "income",
      account_id: acct,
      amount_minor: "100",
      currency_code: "NGN",
      occurred_on: "2026-11-02",
    });
    expect(again).toMatchObject({ status: "conflict", reason: "exists" });
    expect(await balance(alice, acct)).toBe(100n);
  });
});

describe("conflicts (optimistic versions)", () => {
  it("applies an edit based on the current version and bumps the version", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const { id } = await tx(alice, "expense", acct, 100);
    const r = await mutate(
      alice,
      "transaction",
      "update",
      id,
      {
        kind: "expense",
        account_id: acct,
        amount_minor: "250",
        currency_code: "NGN",
        occurred_on: "2026-11-05",
      },
      1,
    );
    expect(r).toMatchObject({ status: "applied", server_version: 2 });
    expect(await balance(alice, acct)).toBe(-250n);
  });

  it("detects a stale edit and returns the server copy without overwriting", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const { id } = await tx(alice, "expense", acct, 100);
    const edit = (amount: string, base: number) =>
      mutate(
        alice,
        "transaction",
        "update",
        id,
        {
          kind: "expense",
          account_id: acct,
          amount_minor: amount,
          currency_code: "NGN",
          occurred_on: "2026-11-05",
        },
        base,
      );
    expect((await edit("200", 1)).status).toBe("applied"); // device A
    const stale = await edit("300", 1); // device B, still on version 1
    expect(stale).toMatchObject({ status: "conflict", reason: "version", server_version: 2 });
    expect(stale.record).toMatchObject({ amount_minor: 200 });
    expect(await balance(alice, acct)).toBe(-200n);
  });

  it("refuses to delete a record that changed elsewhere; deleting a missing record is a no-op", async () => {
    const acct = await createAccount(alice, "NGN", 0);
    const { id } = await tx(alice, "expense", acct, 100);
    expect((await mutate(alice, "transaction", "delete", id, {}, 7)).status).toBe("conflict");
    expect((await mutate(alice, "transaction", "delete", id, {}, 1)).status).toBe("applied");
    expect(await balance(alice, acct)).toBe(0n);
    expect(await mutate(alice, "transaction", "delete", id, {}, 1)).toMatchObject({
      status: "applied",
      note: "already_deleted",
    });
  });

  it("records a sync_failed event for a conflicting offline transaction", async () => {
    const { rows } = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from finance_events where kind = 'sync_failed'"),
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("cross-user protection", () => {
  it("User A cannot read, edit or delete User B's transactions by guessing ids", async () => {
    const bobAcct = await createAccount(bob, "NGN", 1000);
    const { id: bobTx } = await tx(bob, "expense", bobAcct, 100);

    const read = await asUser(db, alice, (c) =>
      c.query("select * from transactions where id = $1", [bobTx]),
    );
    expect(read.rowCount).toBe(0);

    const edit = await mutate(
      alice,
      "transaction",
      "update",
      bobTx,
      {
        kind: "expense",
        account_id: bobAcct,
        amount_minor: "1",
        currency_code: "NGN",
        occurred_on: "2026-11-05",
      },
      1,
    );
    expect(edit).toMatchObject({ status: "conflict", reason: "not_found" });
    expect(edit.record).toBeUndefined();
    await mutate(alice, "transaction", "delete", bobTx, {}, 1);
    expect(await balance(bob, bobAcct)).toBe(900n);

    const recreate = await mutate(alice, "transaction", "create", bobTx, {
      kind: "income",
      account_id: await createAccount(alice),
      amount_minor: "1",
      currency_code: "NGN",
      occurred_on: "2026-11-05",
    });
    expect(recreate).toMatchObject({ status: "rejected", message: "Not found." });
  });

  it("User A cannot post into User B's account", async () => {
    const bobAcct = await createAccount(bob, "NGN", 0);
    const r = await mutate(alice, "transaction", "create", randomUUID(), {
      kind: "income",
      account_id: bobAcct,
      amount_minor: "100000",
      currency_code: "NGN",
      occurred_on: "2026-11-05",
    });
    expect(r).toMatchObject({ status: "rejected", message: "Not found." });
    expect(await balance(bob, bobAcct)).toBe(0n);
  });

  it("User A cannot edit User B's account, budget or goal", async () => {
    const bobAcct = await createAccount(bob, "USD", 0);
    const budget = randomUUID();
    await mutate(bob, "budget", "create", budget, {
      name: "Everything",
      currency_code: "USD",
      limit_minor: "10000",
      starts_on: "2026-11-01",
    });
    const goal = randomUUID();
    await mutate(bob, "savings_goal", "create", goal, {
      name: "Car",
      currency_code: "USD",
      target_minor: "500000",
    });

    for (const [entity, id, payload] of [
      ["financial_account", bobAcct, { name: "pwned" }],
      ["budget", budget, { limit_minor: "1" }],
      ["savings_goal", goal, { target_minor: "1" }],
    ] as const) {
      expect((await mutate(alice, entity, "update", id, payload, 1)).status).toBe("conflict");
    }
    const contribution = await mutate(alice, "savings_goal_entry", "create", randomUUID(), {
      goal_id: goal,
      kind: "contribution",
      amount_minor: "1",
      occurred_on: "2026-11-05",
    });
    expect(contribution).toMatchObject({ status: "rejected", message: "Not found." });
  });

  it.each([
    "financial_accounts",
    "transactions",
    "transaction_categories",
    "budgets",
    "savings_goals",
    "savings_goal_entries",
    "finance_events",
    "account_balances",
    "savings_goal_progress",
  ])("%s: users only see their own rows; anonymous visitors see nothing", async (table) => {
    const { rows } = await asUser(db, alice, (c) =>
      c.query<{ user_id: string }>(`select user_id from public.${table}`),
    );
    expect(rows.every((r) => r.user_id === alice)).toBe(true);
    expect(
      await pgErrorCode(asAnon(db, (c: pg.PoolClient) => c.query(`select * from public.${table}`))),
    ).toBe("42501");
  });

  it("anonymous visitors cannot call the mutation function", async () => {
    expect(
      await pgErrorCode(
        asAnon(db, (c) =>
          c.query("select apply_finance_mutation($1, 'transaction', 'create', $2, '{}'::jsonb)", [
            randomUUID(),
            randomUUID(),
          ]),
        ),
      ),
    ).toBe("42501");
  });
});

describe("budgets", () => {
  it("count expenses only, in the budget's currency and category, for the month", async () => {
    const carol = await createUser(db, "carol@example.com");
    const ngn = await createAccount(carol, "NGN", 0);
    const ngn2 = await createAccount(carol, "NGN", 0);
    const usd = await createAccount(carol, "USD", 0);
    const food = await category(carol, "expense", "Food");
    const transport = await category(carol, "expense", "Transport");
    const salary = await category(carol, "income", "Salary");

    const foodBudget = randomUUID();
    const total = randomUUID();
    await mutate(carol, "budget", "create", foodBudget, {
      name: "Food",
      category_id: food,
      currency_code: "NGN",
      limit_minor: "10000",
      starts_on: "2026-11-01",
    });
    await mutate(carol, "budget", "create", total, {
      name: "All spending",
      currency_code: "NGN",
      limit_minor: "20000",
      starts_on: "2026-11-01",
    });

    await tx(carol, "expense", ngn, 6000, { category_id: food });
    await tx(carol, "expense", ngn, 3000, { category_id: transport });
    await tx(carol, "income", ngn, 50000, { category_id: salary }); // not spending
    await tx(carol, "transfer", ngn, 9000, { transfer_account_id: ngn2 }); // not spending
    await tx(carol, "expense", usd, 999, {}, "USD"); // other currency
    await tx(carol, "expense", ngn, 1000, { category_id: food, occurred_on: "2026-10-31" }); // last month

    const { rows } = await asUser(db, carol, (c) =>
      c.query("select budget_id, spent_minor, limit_minor from budget_progress('2026-11-15')"),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.budget_id, r]));
    expect(byId[foodBudget]).toMatchObject({ spent_minor: "6000", limit_minor: "10000" });
    expect(byId[total]).toMatchObject({ spent_minor: "9000", limit_minor: "20000" });

    const history = await asUser(db, carol, (c) =>
      c.query("select month::text, spent_minor from budget_history($1, 6, '2026-12-10')", [
        foodBudget,
      ]),
    );
    expect(history.rows).toEqual([
      { month: "2026-12-01", spent_minor: "0" },
      { month: "2026-11-01", spent_minor: "6000" },
    ]);
  });

  it("emits threshold and exceeded events once each (no spam)", async () => {
    const dan = await createUser(db, "dan@example.com");
    const acct = await createAccount(dan, "NGN", 0);
    const food = await category(dan, "expense", "Food");
    await mutate(dan, "budget", "create", randomUUID(), {
      name: "Food",
      category_id: food,
      currency_code: "NGN",
      limit_minor: "1000",
      alert_threshold_pct: 80,
      starts_on: "2026-11-01",
    });
    await tx(dan, "expense", dan ? acct : acct, 500, { category_id: food });
    let events = await asUser(db, dan, (c) =>
      c.query("select kind from finance_events order by id"),
    );
    expect(events.rows).toEqual([]);
    await tx(dan, "expense", acct, 300, { category_id: food }); // 80%
    await tx(dan, "expense", acct, 50, { category_id: food }); // still above threshold
    await tx(dan, "expense", acct, 300, { category_id: food }); // exceeded
    await tx(dan, "expense", acct, 300, { category_id: food }); // exceeded again
    events = await asUser(db, dan, (c) => c.query("select kind from finance_events order by id"));
    expect(events.rows.map((r) => r.kind)).toEqual(["budget_threshold_reached", "budget_exceeded"]);
  });

  it("only one active budget per currency and category", async () => {
    const eve = await createUser(db, "eve@example.com");
    const make = () =>
      mutate(eve, "budget", "create", randomUUID(), {
        name: "All",
        currency_code: "EUR",
        limit_minor: "100",
        starts_on: "2026-11-01",
      });
    expect((await make()).status).toBe("applied");
    expect((await make()).status).toBe("rejected");
  });

  it("cannot track an income category", async () => {
    const salary = await category(alice, "income", "Salary");
    const r = await mutate(alice, "budget", "create", randomUUID(), {
      name: "Bad",
      category_id: salary,
      currency_code: "NGN",
      limit_minor: "100",
      starts_on: "2026-11-01",
    });
    expect(r.status).toBe("rejected");
  });
});

describe("savings goals", () => {
  it("tracks contributions and withdrawals without touching any account", async () => {
    const frank = await createUser(db, "frank@example.com");
    const acct = await createAccount(frank, "USD", 10_000);
    const goal = randomUUID();
    await mutate(frank, "savings_goal", "create", goal, {
      name: "Laptop",
      currency_code: "USD",
      target_minor: "100000",
      target_date: "2027-06-01",
    });
    const entry = (kind: string, amount: string) =>
      mutate(frank, "savings_goal_entry", "create", randomUUID(), {
        goal_id: goal,
        kind,
        amount_minor: amount,
        occurred_on: "2026-11-05",
      });
    expect((await entry("contribution", "30000")).status).toBe("applied");
    expect((await entry("contribution", "25000")).status).toBe("applied");
    expect((await entry("withdrawal", "5000")).status).toBe("applied");
    expect((await entry("withdrawal", "999999")).status).toBe("rejected"); // more than saved

    const { rows } = await asUser(db, frank, (c) =>
      c.query("select saved_minor from savings_goal_progress where goal_id = $1", [goal]),
    );
    expect(rows[0].saved_minor).toBe("50000");
    expect(await balance(frank, acct)).toBe(10_000n);

    const events = await asUser(db, frank, (c) =>
      c.query(
        "select dedupe_key from finance_events where kind = 'savings_milestone_reached' order by id",
      ),
    );
    expect(events.rows.map((r) => r.dedupe_key)).toEqual([
      `goal:${goal}:milestone:25`,
      `goal:${goal}:milestone:50`,
    ]);
  });

  it("serialises concurrent withdrawals so the saved amount never goes negative", async () => {
    const gina = await createUser(db, "gina@example.com");
    const goal = randomUUID();
    await mutate(gina, "savings_goal", "create", goal, {
      name: "Trip",
      currency_code: "NGN",
      target_minor: "1000",
    });
    await mutate(gina, "savings_goal_entry", "create", randomUUID(), {
      goal_id: goal,
      kind: "contribution",
      amount_minor: "100",
      occurred_on: "2026-11-05",
    });
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        mutate(gina, "savings_goal_entry", "create", randomUUID(), {
          goal_id: goal,
          kind: "withdrawal",
          amount_minor: "60",
          occurred_on: "2026-11-05",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "applied").length).toBe(1);
    const { rows } = await asUser(db, gina, (c) =>
      c.query("select saved_minor from savings_goal_progress where goal_id = $1", [goal]),
    );
    expect(rows[0].saved_minor).toBe("40");
  });
});

describe("archived accounts", () => {
  it("refuse new transactions but keep their history and balance", async () => {
    const acct = await createAccount(alice, "NGN", 100);
    await tx(alice, "income", acct, 50);
    const archived = await mutate(
      alice,
      "financial_account",
      "update",
      acct,
      { archived: true },
      1,
    );
    expect(archived.status).toBe("applied");
    const { r } = await tx(alice, "expense", acct, 10);
    expect(r).toMatchObject({ status: "rejected" });
    expect(await balance(alice, acct)).toBe(150n);
  });

  it("cannot change currency", async () => {
    const acct = await createAccount(alice, "NGN");
    // fin_account ignores currency on update; prove the trigger also blocks it.
    const code = await pgErrorCode(
      db.pool.query("update financial_accounts set currency_code = 'USD' where id = $1", [acct]),
    );
    expect(code).toBe("22023");
  });
});

describe("reporting", () => {
  it("lists, searches, filters and sorts with total count; summaries exclude transfers", async () => {
    const hal = await createUser(db, "hal@example.com");
    const a = await createAccount(hal, "NGN", 0, "Wallet");
    const b = await createAccount(hal, "NGN", 0, "Savings");
    const food = await category(hal, "expense", "Food");
    await tx(hal, "expense", a, 1500, {
      category_id: food,
      description: "Jollof rice",
      occurred_on: "2026-11-03",
    });
    await tx(hal, "expense", a, 300, {
      category_id: food,
      merchant: "Mama Put",
      occurred_on: "2026-11-04",
    });
    await tx(hal, "income", a, 90000, { occurred_on: "2026-11-01" });
    await tx(hal, "transfer", a, 1000, { transfer_account_id: b, occurred_on: "2026-11-02" });

    const list = (args: string) =>
      asUser(db, hal, (c) => c.query(`select * from list_transactions(${args})`)).then(
        (r) => r.rows,
      );
    const all = await list("");
    expect(all).toHaveLength(4);
    expect(Number(all[0].total_count)).toBe(4);
    expect((await list("p_q => 'jollof'")).map((r) => r.description)).toEqual(["Jollof rice"]);
    expect(await list("p_q => 'mama'")).toHaveLength(1);
    expect(await list("p_q => '%'")).toHaveLength(0); // no LIKE wildcards
    expect((await list("p_kind => 'transfer'"))[0]).toMatchObject({
      account_name: "Wallet",
      transfer_account_name: "Savings",
    });
    expect(await list(`p_account_id => '${b}'`)).toHaveLength(1);
    expect((await list("p_sort => 'amount_desc'"))[0].amount_minor).toBe("90000");
    expect(await list("p_from => '2026-11-03', p_to => '2026-11-03'")).toHaveLength(1);

    const summary = await asUser(db, hal, (c) =>
      c.query("select * from finance_summary('2026-11-01', '2026-11-30')"),
    );
    expect(summary.rows).toEqual([
      {
        currency_code: "NGN",
        income_minor: "90000",
        expense_minor: "1800",
        net_minor: "88200",
        transaction_count: 3,
      },
    ]);
    const byCategory = await asUser(db, hal, (c) =>
      c.query(
        "select category_name, expense_minor from spending_by_category('2026-11-01', '2026-11-30')",
      ),
    );
    expect(byCategory.rows).toEqual([{ category_name: "Food", expense_minor: "1800" }]);
    const trend = await asUser(db, hal, (c) =>
      c.query(
        "select month::text, income_minor, expense_minor from monthly_cashflow(2, '2026-11-20')",
      ),
    );
    expect(trend.rows).toEqual([
      { month: "2026-10-01", income_minor: "0", expense_minor: "0" },
      { month: "2026-11-01", income_minor: "90000", expense_minor: "1800" },
    ]);
  });

  it("records one sync_completed event per batch", async () => {
    const batch = randomUUID();
    await asUser(db, alice, (c) => c.query("select record_sync_completed($1, 3)", [batch]));
    await asUser(db, alice, (c) => c.query("select record_sync_completed($1, 3)", [batch]));
    const { rows } = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from finance_events where dedupe_key = $1", [
        `sync_completed:${batch}`,
      ]),
    );
    expect(rows[0].n).toBe(1);
  });
});
