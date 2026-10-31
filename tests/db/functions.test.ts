import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  asService,
  asUser,
  createTestDatabase,
  createUser,
  pgErrorCode,
  type TestDb,
} from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
});

afterAll(async () => {
  await db?.close();
});

describe("consent", () => {
  it("records history, updates state and writes an audit entry", async () => {
    await asUser(db, alice, (c) =>
      c.query("select set_consent('wellbeing_data', true, 'settings')"),
    );
    await asUser(db, alice, (c) =>
      c.query("select set_consent('wellbeing_data', false, 'settings')"),
    );
    const r = await asUser(db, alice, async (c) => ({
      history: (
        await c.query(
          "select granted from consent_records where category = 'wellbeing_data' order by created_at, id",
        )
      ).rows.map((x) => x.granted),
      state: (await c.query("select granted from consent_state where category = 'wellbeing_data'"))
        .rows[0],
      audit: (
        await c.query("select action from audit_log where action like 'consent.%' order by id")
      ).rows.map((x) => x.action),
    }));
    expect(r.history).toHaveLength(2);
    expect(r.history).toContain(true);
    expect(r.state).toEqual({ granted: false });
    expect(r.audit).toEqual(["consent.granted", "consent.withdrawn"]);
  });

  it("refuses to grant Walrus memory consent before Stage 6, but allows withdrawal", async () => {
    const code = await pgErrorCode(
      asUser(db, alice, (c) => c.query("select set_consent('memory_financial', true, 'settings')")),
    );
    expect(code).toBe("55000");
    await asUser(db, alice, (c) =>
      c.query("select set_consent('memory_financial', false, 'settings')"),
    );
  });

  it("rejects unknown categories and sources", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select set_consent('everything', true, 'settings')")),
      ),
    ).toBe("22023");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select set_consent('ai_processing', true, 'hacker')")),
      ),
    ).toBe("22023");
  });

  it("only changes the caller's consent, never another user's", async () => {
    await asUser(db, alice, (c) =>
      c.query("select set_consent('ai_processing', true, 'settings')"),
    );
    const { rows } = await db.pool.query(
      "select granted from consent_state where user_id = $1 and category = 'ai_processing'",
      [bob],
    );
    expect(rows).toEqual([{ granted: false }]);
  });
});

describe("security event logging", () => {
  it("accepts allow-listed events and rejects anything else", async () => {
    await asUser(db, alice, (c) => c.query("select log_security_event('auth.signed_in')"));
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select log_security_event('admin.granted')")),
      ),
    ).toBe("22023");
  });

  it("logs AI preference changes automatically", async () => {
    await asUser(db, bob, (c) => c.query("update user_preferences set ai_enabled = true"));
    const { rows } = await asUser(db, bob, (c) =>
      c.query("select metadata from audit_log where action = 'privacy.ai_preference_changed'"),
    );
    expect(rows).toEqual([{ metadata: { ai_enabled: true } }]);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { rows } = await asUser(db, alice, (c) =>
        c.query<{ ok: boolean }>("select consume_rate_limit('delete_account', 3, 3600) as ok"),
      );
      results.push(rows[0]!.ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("keeps each user's buckets separate", async () => {
    const { rows } = await asUser(db, bob, (c) =>
      c.query<{ ok: boolean }>("select consume_rate_limit('delete_account', 3, 3600) as ok"),
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it("rejects invalid parameters", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select consume_rate_limit('Bad Action!', 3, 60)")),
      ),
    ).toBe("22023");
    expect(
      await pgErrorCode(asUser(db, alice, (c) => c.query("select consume_rate_limit('x', 0, 60)"))),
    ).toBe("22023");
  });
});

describe("AI quota", () => {
  it("is not allowed until AI is enabled AND consent is granted", async () => {
    const carol = await createUser(db, "carol@example.com");
    const status = () =>
      asUser(db, carol, (c) => c.query("select * from ai_quota_status()")).then((r) => r.rows[0]);

    expect(await status()).toMatchObject({ ai_enabled: false, ai_consent: false, allowed: false });
    await asUser(db, carol, (c) => c.query("update user_preferences set ai_enabled = true"));
    expect(await status()).toMatchObject({ ai_enabled: true, ai_consent: false, allowed: false });
    await asUser(db, carol, (c) =>
      c.query("select set_consent('ai_processing', true, 'settings')"),
    );
    expect(await status()).toMatchObject({ allowed: true, requests_today: 0 });
  });

  it("blocks once the daily request limit is reached", async () => {
    const dave = await createUser(db, "dave@example.com");
    await asUser(db, dave, async (c) => {
      await c.query("update user_preferences set ai_enabled = true");
      await c.query("select set_consent('ai_processing', true, 'settings')");
    });
    await asService(db, (c) =>
      c.query("update ai_usage_limits set daily_request_limit = 2 where user_id = $1", [dave]),
    );
    for (let i = 0; i < 2; i += 1) {
      await asService(db, (c) => c.query("select record_ai_usage($1, 5, 5)", [dave]));
    }
    const { rows } = await asUser(db, dave, (c) => c.query("select * from ai_quota_status()"));
    expect(rows[0]).toMatchObject({ requests_today: 2, daily_request_limit: 2, allowed: false });
  });

  it("refuses negative token counts", async () => {
    expect(
      await pgErrorCode(
        asService(db, (c) => c.query("select record_ai_usage($1, -1, 0)", [alice])),
      ),
    ).toBe("22023");
  });
});

describe("offline sync idempotency", () => {
  it("rejects a second receipt with the same client mutation id", async () => {
    const mutationId = randomUUID();
    const insert = () =>
      asUser(db, alice, (c) =>
        c.query(
          `insert into sync_receipts (user_id, client_mutation_id, entity, record_id, operation, result)
           values ($1, $2, 'transactions', $3, 'create', 'applied')`,
          [alice, mutationId, randomUUID()],
        ),
      );
    await insert();
    expect(await pgErrorCode(insert())).toBe("23505");
  });

  it("lets two users use the same mutation id independently", async () => {
    const mutationId = randomUUID();
    for (const uid of [alice, bob]) {
      await asUser(db, uid, (c) =>
        c.query(
          `insert into sync_receipts (user_id, client_mutation_id, entity, record_id, operation, result)
           values ($1, $2, 'transactions', $3, 'create', 'applied')`,
          [uid, mutationId, randomUUID()],
        ),
      );
    }
  });
});

describe("account deletion", () => {
  it("deleting the auth user removes every row belonging to that user", async () => {
    const erin = await createUser(db, "erin@example.com", { display_name: "Erin" });
    await asUser(db, erin, async (c) => {
      await c.query("select set_consent('ai_processing', true, 'settings')");
      await c.query("select log_security_event('auth.signed_in')");
      await c.query("select record_data_export('json', 10)");
      await c.query("select consume_rate_limit('export_data', 5, 60)");
      const device = randomUUID();
      await c.query("insert into user_devices (id, user_id) values ($1, $2)", [device, erin]);
      await c.query(
        `insert into sync_receipts (user_id, client_mutation_id, device_id, entity, record_id, operation, result)
         values ($1, $2, $3, 'transactions', $4, 'create', 'applied')`,
        [erin, randomUUID(), device, randomUUID()],
      );
    });
    await asService(db, (c) => c.query("select record_ai_usage($1, 1, 1)", [erin]));

    // What the server does: log an anonymised record, then delete the auth user.
    const subjectHash = createHash("sha256").update(erin).digest("hex");
    await asService(db, async (c) => {
      await c.query("insert into account_deletion_log (subject_hash) values ($1)", [subjectHash]);
      await c.query("delete from auth.users where id = $1", [erin]);
      await c.query(
        "update account_deletion_log set outcome = 'completed', completed_at = now() where subject_hash = $1",
        [subjectHash],
      );
    });

    const { rows: tables } = await db.pool.query<{ table_name: string; column_name: string }>(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name in ('user_id')
      union all select 'profiles', 'id'`);
    for (const { table_name, column_name } of tables) {
      const { rowCount } = await db.pool.query(
        `select 1 from public.${table_name} where ${column_name} = $1`,
        [erin],
      );
      expect({ table: table_name, rows: rowCount }).toEqual({ table: table_name, rows: 0 });
    }
    const { rowCount: rateRows } = await db.pool.query(
      "select 1 from rate_limit_buckets where bucket_key like $1",
      [`${erin}%`],
    );
    expect(rateRows).toBe(0);

    // The deletion log keeps no personal data — only the hash and outcome.
    const { rows: log } = await db.pool.query(
      "select * from account_deletion_log where subject_hash = $1",
      [subjectHash],
    );
    expect(log[0]).toMatchObject({ outcome: "completed" });
    expect(JSON.stringify(log[0])).not.toContain("erin");
    expect(JSON.stringify(log[0])).not.toContain(erin);
  });

  it("deleting one user leaves other users untouched", async () => {
    const before = await db.pool.query("select count(*)::int as n from profiles where id = $1", [
      alice,
    ]);
    expect(before.rows[0]).toEqual({ n: 1 });
  });
});
