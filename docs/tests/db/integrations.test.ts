import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asService,
  asUser,
  createTestDatabase,
  createUser,
  pgErrorCode,
  type TestDb,
} from "./harness";

/**
 * Stage 3–4 database rules: Walrus memory bookkeeping, Sui wallets, confirmed
 * on-chain imports with duplicate detection, and recommendation responses.
 */

let db: TestDb;
let alice: string;
let bob: string;
let aliceAccount: string;
let aliceWallet: string;
let bobWallet: string;

const hash = (ch: string) => ch.repeat(64);
const DIGEST = "5".repeat(43);

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  aliceAccount = randomUUID();
  await asUser(db, alice, (c) =>
    c.query("select apply_finance_mutation($1, 'financial_account', 'create', $2, $3)", [
      randomUUID(),
      aliceAccount,
      JSON.stringify({ name: "Wallet", account_type: "digital_wallet", currency_code: "USD" }),
    ]),
  );
  aliceWallet = await asUser(
    db,
    alice,
    async (c) =>
      (
        await c.query<{ id: string }>(
          "insert into sui_wallets (user_id, address, label) values ($1, $2, 'Main') returning id",
          [alice, `0x${"1".repeat(64)}`],
        )
      ).rows[0]!.id,
  );
  bobWallet = await asUser(
    db,
    bob,
    async (c) =>
      (
        await c.query<{ id: string }>(
          "insert into sui_wallets (user_id, address) values ($1, $2) returning id",
          [bob, `0x${"2".repeat(64)}`],
        )
      ).rows[0]!.id,
  );
});

afterAll(async () => {
  await db?.close();
});

describe("memory_records (Walrus bookkeeping)", () => {
  it("users can read but never write their memory records", async () => {
    await asService(db, (c) =>
      c.query(
        `insert into memory_records (user_id, category, kind, label, content_hash, pending_text)
         values ($1, 'memory_financial', 'preference', 'Pref', $2, 'AVEN-MEMORY v1')`,
        [alice, hash("c")],
      ),
    );
    const rows = await asUser(db, alice, (c) => c.query("select id, status from memory_records"));
    expect(rows.rows).toHaveLength(1);
    const id = rows.rows[0].id;
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            "insert into memory_records (user_id, category, kind, label, content_hash) values ($1, 'memory_financial', 'preference', 'x', $2)",
            [alice, hash("d")],
          ),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update memory_records set status = 'stored', blob_id = 'fake' where id = $1", [
            id,
          ]),
        ),
      ),
    ).toBe("42501");
    expect(await pgErrorCode(asUser(db, alice, (c) => c.query("delete from memory_records")))).toBe(
      "42501",
    );
  });

  it("enforces dedupe per user, a blob id when stored, and an erased outbox", async () => {
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            "insert into memory_records (user_id, category, kind, label, content_hash) values ($1, 'memory_financial', 'preference', 'dup', $2)",
            [alice, hash("c")],
          ),
        ),
      ),
    ).toBe("23505");
    // Same content for another user is fine (different namespace).
    await asService(db, (c) =>
      c.query(
        "insert into memory_records (user_id, category, kind, label, content_hash) values ($1, 'memory_financial', 'preference', 'Pref', $2)",
        [bob, hash("c")],
      ),
    );
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            "update memory_records set status = 'stored' where user_id = $1 and content_hash = $2",
            [alice, hash("c")],
          ),
        ),
      ),
    ).toBe("23514"); // stored without blob id
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            "update memory_records set status = 'stored', blob_id = 'b' where user_id = $1 and content_hash = $2",
            [alice, hash("c")],
          ),
        ),
      ),
    ).toBe("23514"); // pending_text not erased
    await asService(db, (c) =>
      c.query(
        "update memory_records set status = 'stored', blob_id = 'b', pending_text = null where user_id = $1 and content_hash = $2",
        [alice, hash("c")],
      ),
    );
  });

  it("a forgotten memory can never be restored", async () => {
    await asService(db, (c) =>
      c.query(
        "update memory_records set status = 'suppressed', suppressed_at = now() where user_id = $1 and content_hash = $2",
        [alice, hash("c")],
      ),
    );
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            "update memory_records set status = 'stored', suppressed_at = null where user_id = $1",
            [alice],
          ),
        ),
      ),
    ).toBe("22023");
  });

  it("rejects unknown kinds and categories", async () => {
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            "insert into memory_records (user_id, category, kind, label, content_hash) values ($1, 'memory_financial', 'raw_transaction', 'x', $2)",
            [alice, hash("e")],
          ),
        ),
      ),
    ).toBe("23514");
  });
});

describe("sui_wallets", () => {
  it("validates addresses and allows only label changes", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("insert into sui_wallets (user_id, address) values ($1, '0xABC')", [alice]),
        ),
      ),
    ).toBe("23514");
    await asUser(db, alice, (c) =>
      c.query("update sui_wallets set label = 'Renamed' where id = $1", [aliceWallet]),
    );
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update sui_wallets set address = $2 where id = $1", [
            aliceWallet,
            `0x${"3".repeat(64)}`,
          ]),
        ),
      ),
    ).toBe("42501");
  });

  it("isolates wallets between users", async () => {
    const seen = await asUser(db, alice, (c) => c.query("select id from sui_wallets"));
    expect(seen.rows.map((r) => r.id)).toEqual([aliceWallet]);
    const removed = await asUser(db, alice, (c) =>
      c.query("delete from sui_wallets where id = $1", [bobWallet]),
    );
    expect(removed.rowCount).toBe(0);
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("insert into sui_wallets (user_id, address) values ($1, $2)", [
            bob,
            `0x${"4".repeat(64)}`,
          ]),
        ),
      ),
    ).toBe("42501");
  });

  it("caps wallets at five per user", async () => {
    const carol = await createUser(db, "carol@example.com");
    await asUser(db, carol, async (c) => {
      for (let i = 0; i < 5; i += 1) {
        await c.query("insert into sui_wallets (user_id, address) values ($1, $2)", [
          carol,
          `0x${String(i).repeat(64)}`,
        ]);
      }
    });
    expect(
      await pgErrorCode(
        asUser(db, carol, (c) =>
          c.query("insert into sui_wallets (user_id, address) values ($1, $2)", [
            carol,
            `0x${"f".repeat(64)}`,
          ]),
        ),
      ),
    ).toBe("23514");
  });
});

describe("import_chain_transaction (confirmed on-chain imports)", () => {
  const payload = (amount: string, date = "2026-11-03") =>
    JSON.stringify({
      kind: "expense",
      account_id: aliceAccount,
      amount_minor: amount,
      currency_code: "USD",
      occurred_on: date,
      description: "Sui transfer",
    });
  const importAs = (user: string, wallet: string, digest: string, body: string, confirm = false) =>
    asUser(
      db,
      user,
      async (c) =>
        (
          await c.query<{ r: Record<string, unknown> }>(
            "select import_chain_transaction($1, $2, $3, $4, $5, $6) as r",
            [randomUUID(), wallet, digest, randomUUID(), body, confirm],
          )
        ).rows[0]!.r,
    );

  it("imports once per digest", async () => {
    const first = await importAs(alice, aliceWallet, DIGEST, payload("1500"));
    expect(first.status).toBe("imported");
    const again = await importAs(alice, aliceWallet, DIGEST, payload("1500", "2026-11-20"));
    expect(again).toMatchObject({
      status: "duplicate_digest",
      transaction_id: first.transaction_id,
    });
    const audit = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from audit_log where action = 'finance.chain_import'"),
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("asks for confirmation when a matching transaction already exists", async () => {
    // Same account, amount and (±1) day as the import above, but a different digest.
    const other = "6".repeat(43);
    const pending = await importAs(alice, aliceWallet, other, payload("1500", "2026-11-04"));
    expect(pending.status).toBe("possible_duplicate");
    expect((pending.matches as unknown[]).length).toBe(1);
    const confirmed = await importAs(
      alice,
      aliceWallet,
      other,
      payload("1500", "2026-11-04"),
      true,
    );
    expect(confirmed.status).toBe("imported");
  });

  it("refuses another user's wallet or account, and invalid digests", async () => {
    expect(await pgErrorCode(importAs(alice, bobWallet, "7".repeat(43), payload("10")))).toBe(
      "42501",
    );
    const bobUsingAliceAccount = await importAs(bob, bobWallet, "7".repeat(43), payload("10"));
    expect(bobUsingAliceAccount.status).toBe("rejected");
    expect(await pgErrorCode(importAs(alice, aliceWallet, "0OIl", payload("10")))).toBe("22023");
  });

  it("users cannot write chain_imports directly", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            "insert into chain_imports (user_id, wallet_id, tx_digest, transaction_id) values ($1, $2, $3, $4)",
            [alice, aliceWallet, "4".repeat(43), randomUUID()],
          ),
        ),
      ),
    ).toBe("42501");
  });

  it("deleting the AVEN transaction releases the digest for re-import", async () => {
    const digest = "3".repeat(43);
    const first = await importAs(alice, aliceWallet, digest, payload("999", "2026-10-01"));
    await asUser(db, alice, (c) =>
      c.query("select apply_finance_mutation($1, 'transaction', 'delete', $2, '{}'::jsonb, 1)", [
        randomUUID(),
        first.transaction_id,
      ]),
    );
    expect((await importAs(alice, aliceWallet, digest, payload("999", "2026-10-01"))).status).toBe(
      "imported",
    );
  });
});

describe("recommendations", () => {
  const insert = (user: string, key: string, extra = "") =>
    asUser(
      db,
      user,
      async (c) =>
        (
          await c.query<{ id: string }>(
            `insert into recommendations (user_id, kind, dedupe_key, period, title, explanation, currency_code, suggested_minor${extra ? ", category_id" : ""})
           values ($1, 'reduce_category_spend', $2, '2026-11', 'Cut Food', 'Because.', 'USD', 4500${extra ? ", $3" : ""}) returning id`,
            extra ? [user, key, extra] : [user, key],
          )
        ).rows[0]!.id,
    );

  it("records a decision exactly once, through the function only", async () => {
    const id = await insert(alice, "reduce_category_spend:cat:x:2026-11");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update recommendations set status = 'accepted' where id = $1", [id]),
        ),
      ),
    ).toBe("42501");
    const answered = await asUser(
      db,
      alice,
      async (c) =>
        (
          await c.query(
            "select respond_to_recommendation($1, 'modified', 4000, 'too strict') as r",
            [id],
          )
        ).rows[0].r,
    );
    expect(answered).toMatchObject({
      status: "modified",
      response_minor: 4000,
      response_note: "too strict",
    });
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("select respond_to_recommendation($1, 'accepted')", [id])),
      ),
    ).toBe("55000");
  });

  it("validates responses", async () => {
    const id = await insert(alice, "reduce_category_spend:cat:y:2026-11");
    for (const sql of [
      "select respond_to_recommendation($1, 'modified')",
      "select respond_to_recommendation($1, 'maybe')",
    ]) {
      expect(await pgErrorCode(asUser(db, alice, (c) => c.query(sql, [id])))).toBe("22023");
    }
  });

  it("isolates users and dedupes per period", async () => {
    const id = await insert(alice, "reduce_category_spend:cat:z:2026-11");
    expect(
      await pgErrorCode(
        asUser(db, bob, (c) => c.query("select respond_to_recommendation($1, 'rejected')", [id])),
      ),
    ).toBe("42501");
    expect(await pgErrorCode(insert(alice, "reduce_category_spend:cat:z:2026-11"))).toBe("23505");
    // Bob can't create a recommendation owned by Alice.
    expect(await pgErrorCode(insertFor(bob, alice))).toBe("42501");
  });

  async function insertFor(actor: string, owner: string) {
    return asUser(db, actor, (c) =>
      c.query(
        `insert into recommendations (user_id, kind, dedupe_key, period, title, explanation, currency_code)
         values ($1, 'increase_savings', 'increase_savings:savings:2026-11', '2026-11', 't', 'e', 'USD')`,
        [owner],
      ),
    );
  }

  it("cannot be created already answered", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            `insert into recommendations (user_id, kind, dedupe_key, period, title, explanation, currency_code, status, responded_at)
             values ($1, 'increase_savings', 'k:answered:2026-11', '2026-11', 't', 'e', 'USD', 'accepted', now())`,
            [alice],
          ),
        ),
      ),
    ).toBe("42501");
  });
});
