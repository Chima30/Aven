import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { EXPORT_TABLES } from "@/lib/data/export";
import { CURRENCIES } from "@/lib/money/currencies";
import {
  asAnon,
  asService,
  asUser,
  createTestDatabase,
  createUser,
  pgErrorCode,
  type TestDb,
} from "./harness";

/**
 * Row Level Security and privilege tests.
 * Two real users (Alice and Bob) are created; every test proves that one
 * user cannot read or change the other's data, and that anonymous visitors
 * see nothing private.
 */

let db: TestDb;
let alice: string;
let bob: string;

/** Every table that holds data belonging to a user, with its owner column. */
const USER_OWNED_TABLES: Array<[table: string, ownerColumn: string]> = [
  ["profiles", "id"],
  ["user_preferences", "user_id"],
  ["notification_preferences", "user_id"],
  ["notification_category_preferences", "user_id"],
  ["consent_records", "user_id"],
  ["consent_state", "user_id"],
  ["audit_log", "user_id"],
  ["ai_usage_limits", "user_id"],
  ["ai_usage_daily", "user_id"],
  ["user_devices", "user_id"],
  ["sync_receipts", "user_id"],
  ["data_export_log", "user_id"],
];

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@example.com", { display_name: "Alice" });
  bob = await createUser(db, "bob@example.com", { display_name: "Bob" });
});

afterAll(async () => {
  await db?.close();
});

describe("RLS is enabled everywhere", () => {
  it("has row level security enabled on every table in the public schema", async () => {
    const { rows } = await db.pool.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`);
    expect(rows.length).toBeGreaterThan(10);
    const withoutRls = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(withoutRls).toEqual([]);
  });

  it("covers every user-owned table in this test file", async () => {
    const { rows } = await db.pool.query<{ table_name: string }>(`
      select distinct table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'`);
    const tested = new Set(USER_OWNED_TABLES.map(([t]) => t));
    for (const { table_name } of rows) expect(tested.has(table_name)).toBe(true);
  });

  it("includes every user-owned table in the data export", () => {
    for (const [table] of USER_OWNED_TABLES) {
      expect(EXPORT_TABLES as readonly string[]).toContain(table);
    }
  });

  it("exposes no SECURITY DEFINER function in public without a fixed search_path", async () => {
    const { rows } = await db.pool.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
        )`);
    expect(rows).toEqual([]);
  });
});

describe("new user bootstrap", () => {
  it("creates a profile and default settings, but no fabricated data", async () => {
    const result = await asUser(db, alice, async (c) => ({
      profile: (await c.query("select display_name from profiles")).rows,
      prefs: (
        await c.query("select currency_code, ai_enabled, memory_paused from user_preferences")
      ).rows,
      consents: (await c.query("select category, granted from consent_state")).rows,
      categories: (
        await c.query("select category, frequency from notification_category_preferences")
      ).rows,
    }));
    expect(result.profile).toEqual([{ display_name: "Alice" }]);
    expect(result.prefs).toEqual([
      { currency_code: "USD", ai_enabled: false, memory_paused: false },
    ]);
    expect(result.consents).toHaveLength(7);
    expect(result.consents.every((r) => r.granted === false)).toBe(true);
    expect(result.categories).toHaveLength(8);
  });

  it("does not block sign-up when the display name is too long", async () => {
    const id = await createUser(db, "long@example.com", { display_name: "x".repeat(200) });
    const { rows } = await db.pool.query("select display_name from profiles where id = $1", [id]);
    expect(rows).toEqual([{ display_name: null }]);
  });
});

describe("cross-user isolation", () => {
  it.each(USER_OWNED_TABLES)("%s: Alice only ever sees her own rows", async (table, owner) => {
    // Give both users at least one row where users cannot insert directly.
    if (table === "user_devices" || table === "sync_receipts") {
      for (const uid of [alice, bob]) {
        await asUser(db, uid, async (c) => {
          const device = randomUUID();
          await c.query("insert into user_devices (id, user_id, label) values ($1, $2, 'Phone')", [
            device,
            uid,
          ]);
          await c.query(
            `insert into sync_receipts (user_id, client_mutation_id, device_id, entity, record_id, operation, result)
             values ($1, $2, $3, 'transactions', $4, 'create', 'applied')`,
            [uid, randomUUID(), device, randomUUID()],
          );
        });
      }
    }
    if (table === "ai_usage_daily") {
      await asService(db, async (c) => {
        await c.query("select record_ai_usage($1, 10, 20)", [alice]);
        await c.query("select record_ai_usage($1, 10, 20)", [bob]);
      });
    }
    if (table === "data_export_log") {
      await asUser(db, alice, (c) => c.query("select record_data_export('json', 100)"));
      await asUser(db, bob, (c) => c.query("select record_data_export('json', 100)"));
    }
    if (table === "consent_records") {
      await asUser(db, alice, (c) =>
        c.query("select set_consent('ai_processing', true, 'settings')"),
      );
      await asUser(db, bob, (c) =>
        c.query("select set_consent('ai_processing', true, 'settings')"),
      );
    }

    const seen = await asUser(db, alice, (c) =>
      c.query<{ owner: string }>(`select ${owner}::text as owner from public.${table}`),
    );
    expect(seen.rows.length).toBeGreaterThan(0);
    expect(seen.rows.every((r) => r.owner === alice)).toBe(true);

    // Bob's rows exist (as seen by the service role), proving the filter is RLS, not absence.
    const bobRows = await asService(db, (c) =>
      c.query(`select 1 from public.${table} where ${owner} = $1`, [bob]),
    );
    expect(bobRows.rowCount).toBeGreaterThan(0);
  });

  it("Alice cannot update Bob's profile or preferences (0 rows affected)", async () => {
    await asUser(db, alice, async (c) => {
      const p = await c.query("update profiles set display_name = 'Hacked' where id = $1", [bob]);
      const q = await c.query("update user_preferences set theme = 'dark' where user_id = $1", [
        bob,
      ]);
      const n = await c.query(
        "update notification_preferences set pause_nonessential = true where user_id = $1",
        [bob],
      );
      expect([p.rowCount, q.rowCount, n.rowCount]).toEqual([0, 0, 0]);
    });
    const { rows } = await db.pool.query("select display_name from profiles where id = $1", [bob]);
    expect(rows[0]).toEqual({ display_name: "Bob" });
  });

  it("Alice cannot move her own row to Bob (WITH CHECK)", async () => {
    // user_id is not in the column grant, so the update is rejected outright.
    const code = await pgErrorCode(
      asUser(db, alice, (c) =>
        c.query("update user_preferences set user_id = $1 where user_id = $2", [bob, alice]),
      ),
    );
    expect(code).toBe("42501");
  });

  it("Alice cannot register a device or sync receipt for Bob", async () => {
    const deviceCode = await pgErrorCode(
      asUser(db, alice, (c) =>
        c.query("insert into user_devices (id, user_id) values ($1, $2)", [randomUUID(), bob]),
      ),
    );
    expect(deviceCode).toBe("42501");

    const receiptCode = await pgErrorCode(
      asUser(db, alice, (c) =>
        c.query(
          `insert into sync_receipts (user_id, client_mutation_id, entity, record_id, operation, result)
           values ($1, $2, 'transactions', $3, 'create', 'applied')`,
          [bob, randomUUID(), randomUUID()],
        ),
      ),
    );
    expect(receiptCode).toBe("42501");
  });

  it("Alice cannot attach her sync receipt to Bob's device", async () => {
    const bobDevice = randomUUID();
    await asUser(db, bob, (c) =>
      c.query("insert into user_devices (id, user_id) values ($1, $2)", [bobDevice, bob]),
    );
    const code = await pgErrorCode(
      asUser(db, alice, (c) =>
        c.query(
          `insert into sync_receipts (user_id, client_mutation_id, device_id, entity, record_id, operation, result)
           values ($1, $2, $3, 'transactions', $4, 'create', 'applied')`,
          [alice, randomUUID(), bobDevice, randomUUID()],
        ),
      ),
    );
    expect(code).toBe("42501");
  });

  it("Alice cannot delete Bob's device", async () => {
    const bobDevice = randomUUID();
    await asUser(db, bob, (c) =>
      c.query("insert into user_devices (id, user_id) values ($1, $2)", [bobDevice, bob]),
    );
    const res = await asUser(db, alice, (c) =>
      c.query("delete from user_devices where id = $1", [bobDevice]),
    );
    expect(res.rowCount).toBe(0);
  });
});

describe("anonymous visitors", () => {
  it.each(USER_OWNED_TABLES)("cannot read %s", async (table) => {
    const code = await pgErrorCode(asAnon(db, (c) => c.query(`select * from public.${table}`)));
    expect(code).toBe("42501");
  });

  it("can read the public currency list only", async () => {
    const { rows } = await asAnon(db, (c) => c.query("select code from currencies"));
    expect(rows.length).toBe(CURRENCIES.length);
  });

  it("cannot call user functions", async () => {
    for (const sql of [
      "select set_consent('ai_processing', true, 'settings')",
      "select log_security_event('auth.signed_in')",
      "select consume_rate_limit('x', 1, 60)",
      "select record_data_export('json', 1)",
    ]) {
      expect(await pgErrorCode(asAnon(db, (c) => c.query(sql)))).toBe("42501");
    }
  });
});

describe("protected columns and write paths", () => {
  it("users cannot change created_at or forge audit entries", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update profiles set created_at = now() - interval '9 years'"),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("insert into audit_log (user_id, action) values ($1, 'auth.signed_in')", [alice]),
        ),
      ),
    ).toBe("42501");
    expect(await pgErrorCode(asUser(db, alice, (c) => c.query("delete from audit_log")))).toBe(
      "42501",
    );
  });

  it("users cannot raise their own AI limits or record AI usage", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("update ai_usage_limits set daily_request_limit = 1000")),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select record_ai_usage($1, 1, 1)", [alice])),
      ),
    ).toBe("42501");
  });

  it("users cannot write consent tables directly", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            "insert into consent_state (user_id, category, granted, policy_version) values ($1, 'memory_financial', true, 'x')",
            [alice],
          ),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("update consent_state set granted = true")),
      ),
    ).toBe("42501");
  });

  it("users cannot see the rate-limit table or the deletion log", async () => {
    for (const table of ["rate_limit_buckets", "account_deletion_log"]) {
      expect(
        await pgErrorCode(asUser(db, alice, (c) => c.query(`select * from public.${table}`))),
      ).toBe("42501");
    }
  });

  it("users cannot disable account security notifications", async () => {
    const code = await pgErrorCode(
      asUser(db, alice, (c) =>
        c.query(
          "update notification_category_preferences set frequency = 'off' where category = 'account_security'",
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("rejects unknown time zones and unsupported currencies", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("update user_preferences set time_zone = 'Mars/Olympus'")),
      ),
    ).toBe("22023");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("update user_preferences set currency_code = 'XYZ'")),
      ),
    ).toBe("23503");
    const ok = await asUser(db, alice, (c) =>
      c.query("update user_preferences set time_zone = 'Africa/Lagos', currency_code = 'NGN'"),
    );
    expect(ok.rowCount).toBe(1);
  });
});

describe("currency reference data", () => {
  it("matches the application currency list exactly", async () => {
    const { rows } = await db.pool.query<{ code: string; minor_units: number; name: string }>(
      "select code, minor_units, name from currencies order by code",
    );
    const fromDb = rows.map((r) => ({ code: r.code, minorUnits: r.minor_units, name: r.name }));
    const fromApp = [...CURRENCIES]
      .map((c) => ({ code: c.code, minorUnits: c.minorUnits, name: c.name }))
      .sort((a, b) => a.code.localeCompare(b.code));
    expect(fromDb).toEqual(fromApp);
  });
});
