import { randomUUID } from "node:crypto";
import type pg from "pg";
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
 * Stage 5: Planning, Nudge Center and Wellbeing records.
 * Everything is written through apply_life_mutation(), as the real app does.
 */

let db: TestDb;
let alice: string;
let bob: string;

type Result = {
  status: "applied" | "conflict" | "rejected";
  server_version?: number;
  record?: Record<string, unknown>;
  message?: string;
  reason?: string;
  replayed?: boolean;
};

async function mutate(
  user: string,
  entity: string,
  operation: "create" | "update" | "delete",
  recordId: string,
  payload: Record<string, unknown>,
  baseVersion: number | null = null,
  mutationId = randomUUID(),
): Promise<Result> {
  return asUser(db, user, async (c: pg.PoolClient) => {
    const { rows } = await c.query<{ r: Result }>(
      "select apply_life_mutation($1, $2, $3, $4, $5, $6) as r",
      [mutationId, entity, operation, recordId, JSON.stringify(payload), baseVersion],
    );
    return rows[0]!.r;
  });
}

const consent = (user: string, granted: boolean) =>
  asUser(db, user, (c) =>
    c.query("select set_consent('wellbeing_data', $1, 'settings')", [granted]),
  );

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
});

afterAll(async () => {
  await db?.close();
});

describe("apply_life_mutation: tasks", () => {
  it("creates, completes (stamping completed_at once), conflicts on stale edits and deletes", async () => {
    const id = randomUUID();
    const created = await mutate(alice, "task", "create", id, {
      title: "Pay rent",
      priority: "high",
      due_on: "2026-11-05",
      due_time: "09:00",
    });
    expect(created).toMatchObject({ status: "applied", server_version: 1 });
    expect(created.record).toMatchObject({ status: "not_started", completed_at: null });

    const done = await mutate(alice, "task", "update", id, { status: "completed" }, 1);
    expect(done.status).toBe("applied");
    expect(done.record?.completed_at).toBeTruthy();

    const stale = await mutate(alice, "task", "update", id, { title: "Old edit" }, 1);
    expect(stale).toMatchObject({ status: "conflict", reason: "version", server_version: 2 });

    const events = await asUser(db, alice, (c) =>
      c.query("select kind from life_events where dedupe_key = $1", [`task_completed:${id}`]),
    );
    expect(events.rows).toEqual([{ kind: "task_completed" }]);

    expect((await mutate(alice, "task", "delete", id, {}, 2)).status).toBe("applied");
    expect((await mutate(alice, "task", "delete", id, {}, 3)).status).toBe("conflict");
  });

  it("replays a duplicate delivery instead of creating twice", async () => {
    const id = randomUUID();
    const mutationId = randomUUID();
    const first = await mutate(alice, "task", "create", id, { title: "Once" }, null, mutationId);
    const again = await mutate(alice, "task", "create", id, { title: "Once" }, null, mutationId);
    expect(first.status).toBe("applied");
    expect(again).toMatchObject({ status: "applied", replayed: true });
    const n = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from tasks where id = $1", [id]),
    );
    expect(n.rows[0].n).toBe(1);
  });

  it("ignores columns that aren't allowed (no user_id or version forging)", async () => {
    const id = randomUUID();
    const r = await mutate(alice, "task", "create", id, {
      title: "Mine",
      user_id: bob,
      version: 99,
      completed_at: "2020-01-01T00:00:00Z",
    });
    expect(r.record).toMatchObject({ user_id: alice, version: 1, completed_at: null });
  });

  it("refuses another user's category, and hides other users' records", async () => {
    const bobCategory = randomUUID();
    await mutate(bob, "task_category", "create", bobCategory, { name: "Bob's" });
    const r = await mutate(alice, "task", "create", randomUUID(), {
      title: "Sneaky",
      category_id: bobCategory,
    });
    expect(r).toMatchObject({ status: "rejected", message: "Not found." });

    const bobTask = randomUUID();
    await mutate(bob, "task", "create", bobTask, { title: "Bob only" });
    expect((await mutate(alice, "task", "update", bobTask, { title: "x" }, 1)).status).toBe(
      "conflict",
    );
    expect((await mutate(alice, "task", "create", bobTask, { title: "steal id" })).status).toBe(
      "rejected",
    );
    const seen = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from tasks where id = $1", [bobTask]),
    );
    expect(seen.rows[0].n).toBe(0);
  });

  it("rejects unknown entities and operations", async () => {
    expect(await pgErrorCode(mutate(alice, "transaction", "create", randomUUID(), {}))).toBe(
      "22023",
    );
    expect(await pgErrorCode(mutate(alice, "task_category", "delete", randomUUID(), {}))).toBe(
      "22023",
    );
  });

  it("users cannot write planning tables directly", async () => {
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("insert into tasks (id, user_id, title) values ($1, $2, 'x')", [
            randomUUID(),
            alice,
          ]),
        ),
      ),
    ).toBe("42501");
  });
});

describe("calendar events", () => {
  it("validates shape and time zone, and only allows exceptions on recurring events", async () => {
    const single = randomUUID();
    const base = {
      title: "Dentist",
      starts_at: "2026-11-10T09:00:00Z",
      ends_at: "2026-11-10T10:00:00Z",
      time_zone: "Africa/Lagos",
    };
    expect((await mutate(alice, "calendar_event", "create", single, base)).status).toBe("applied");
    expect(
      (
        await mutate(alice, "calendar_event", "create", randomUUID(), {
          ...base,
          time_zone: "Mars/Olympus",
        })
      ).status,
    ).toBe("rejected");
    expect(
      (
        await mutate(alice, "calendar_event", "create", randomUUID(), {
          ...base,
          ends_at: "2026-11-09T10:00:00Z",
        })
      ).status,
    ).toBe("rejected");
    const allDay = await mutate(alice, "calendar_event", "create", randomUUID(), {
      title: "Holiday",
      all_day: true,
      start_date: "2026-12-24",
      end_date: "2026-12-26",
      time_zone: "Africa/Lagos",
    });
    expect(allDay.status).toBe("applied");

    // Exception on a non-recurring event is refused.
    const bad = await mutate(alice, "calendar_event_exception", "create", randomUUID(), {
      event_id: single,
      occurrence_date: "2026-11-10",
    });
    expect(bad.status).toBe("rejected");

    const weekly = randomUUID();
    const w = await mutate(alice, "calendar_event", "create", weekly, {
      ...base,
      title: "Gym",
      recurrence: "weekly",
      recurrence_weekdays: [1, 3],
    });
    expect(w.record).toMatchObject({ recurrence_weekdays: [1, 3] });
    const ex = await mutate(alice, "calendar_event_exception", "create", randomUUID(), {
      event_id: weekly,
      occurrence_date: "2026-11-11",
    });
    expect(ex.status).toBe("applied");
    // One exception per occurrence.
    const dup = await mutate(alice, "calendar_event_exception", "create", randomUUID(), {
      event_id: weekly,
      occurrence_date: "2026-11-11",
    });
    expect(dup).toMatchObject({ status: "rejected", reason: "exists" });
  });
});

describe("habits and check-ins", () => {
  it("one check-in per day, never in the future, never for someone else's habit", async () => {
    const habit = randomUUID();
    await mutate(alice, "habit", "create", habit, {
      name: "Read",
      start_on: "2026-01-01",
      time_zone: "Africa/Lagos",
    });
    const day = "2026-10-01";
    const first = await mutate(alice, "habit_check_in", "create", randomUUID(), {
      habit_id: habit,
      on_date: day,
    });
    expect(first.status).toBe("applied");
    expect(
      (
        await mutate(alice, "habit_check_in", "create", randomUUID(), {
          habit_id: habit,
          on_date: day,
        })
      ).status,
    ).toBe("rejected");
    expect(
      (
        await mutate(alice, "habit_check_in", "create", randomUUID(), {
          habit_id: habit,
          on_date: "2099-01-01",
        })
      ).message,
    ).toMatch(/future/);
    expect(
      (
        await mutate(alice, "habit_check_in", "create", randomUUID(), {
          habit_id: habit,
          on_date: "2025-12-31",
        })
      ).message,
    ).toMatch(/outside/);
    expect(
      (
        await mutate(bob, "habit_check_in", "create", randomUUID(), {
          habit_id: habit,
          on_date: day,
        })
      ).status,
    ).toBe("rejected");
    const ev = await asUser(db, alice, (c) =>
      c.query("select count(*)::int as n from life_events where kind = 'habit_checked_in'"),
    );
    expect(ev.rows[0].n).toBe(1);
  });

  it("specific-day habits need weekdays; archiving works", async () => {
    expect(
      (
        await mutate(alice, "habit", "create", randomUUID(), {
          name: "Gym",
          frequency: "specific_days",
          start_on: "2026-01-01",
          time_zone: "Africa/Lagos",
        })
      ).status,
    ).toBe("rejected");
    const id = randomUUID();
    await mutate(alice, "habit", "create", id, {
      name: "Gym",
      frequency: "specific_days",
      weekdays: [1, 3, 5],
      start_on: "2026-01-01",
      time_zone: "Africa/Lagos",
    });
    const archived = await mutate(alice, "habit", "update", id, { archived: true }, 1);
    expect(archived.record?.archived_at).toBeTruthy();
  });
});

describe("reviews are private and unique per period", () => {
  it("allows one daily review per day and hides it from others", async () => {
    const id = randomUUID();
    expect(
      (
        await mutate(alice, "review", "create", id, {
          kind: "daily",
          period_start: "2026-11-01",
          highlights: "Finished the report",
          rating: 4,
        })
      ).status,
    ).toBe("applied");
    expect(
      (
        await mutate(alice, "review", "create", randomUUID(), {
          kind: "daily",
          period_start: "2026-11-01",
        })
      ).status,
    ).toBe("rejected");
    const bobSees = await asUser(db, bob, (c) => c.query("select id from reviews"));
    expect(bobSees.rows).toEqual([]);
  });
});

describe("wellbeing needs consent", () => {
  it("refuses wellbeing records without consent, but always allows deleting them", async () => {
    const sleep = {
      slept_at: "2026-10-31T22:30:00Z",
      woke_at: "2026-11-01T06:15:00Z",
      wake_date: "2026-11-01",
      quality: 4,
    };
    const refused = await mutate(alice, "sleep_log", "create", randomUUID(), sleep);
    expect(refused).toMatchObject({ status: "rejected", reason: "consent" });

    await consent(alice, true);
    const id = randomUUID();
    const ok = await mutate(alice, "sleep_log", "create", id, sleep);
    expect(ok.status).toBe("applied");
    expect(ok.record?.duration_minutes).toBe(465); // 7h45 across midnight

    await consent(alice, false);
    expect((await mutate(alice, "sleep_log", "delete", id, {}, 1)).status).toBe("applied");
  });

  it("validates ranges and units", async () => {
    await consent(alice, true);
    expect(
      (
        await mutate(alice, "water_log", "create", randomUUID(), {
          amount_ml: 0,
          logged_at: "2026-11-01T08:00:00Z",
          local_date: "2026-11-01",
        })
      ).status,
    ).toBe("rejected");
    expect(
      (
        await mutate(alice, "sleep_log", "create", randomUUID(), {
          slept_at: "2026-11-01T06:00:00Z",
          woke_at: "2026-11-01T05:00:00Z",
          wake_date: "2026-11-01",
        })
      ).status,
    ).toBe("rejected");
    expect(
      (
        await mutate(alice, "mood_log", "create", randomUUID(), {
          logged_at: "2026-11-01T08:00:00Z",
          local_date: "2026-11-01",
        })
      ).status,
    ).toBe("rejected"); // nothing answered
    const pulse = await mutate(alice, "mood_log", "create", randomUUID(), {
      logged_at: "2026-11-01T08:00:00Z",
      local_date: "2026-11-01",
      mood: 4,
      source: "pulse_check",
    });
    expect(pulse.record).toMatchObject({ mood: 4, energy: null, source: "pulse_check" });
  });
});

describe("notifications", () => {
  it("users can only mark their own notifications read or dismissed", async () => {
    const id = randomUUID();
    await asService(db, (c) =>
      c.query(
        `insert into notifications (id, user_id, category, kind, title, dedupe_key, status, delivered_at)
         values ($1, $2, 'planning', 'task_due', 'Task due', 'k1', 'delivered', now())`,
        [id, alice],
      ),
    );
    await asUser(db, alice, (c) =>
      c.query("update notifications set read_at = now() where id = $1", [id]),
    );
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update notifications set title = 'hacked' where id = $1", [id]),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query(
            `insert into notifications (user_id, category, kind, title, dedupe_key, status, delivered_at)
             values ($1, 'planning', 'task_due', 'x', 'k2', 'delivered', now())`,
            [alice],
          ),
        ),
      ),
    ).toBe("42501");
    const bobUpdate = await asUser(db, bob, (c) =>
      c.query("update notifications set dismissed_at = now() where id = $1", [id]),
    );
    expect(bobUpdate.rowCount).toBe(0);
    // Dedupe: the same key can't be inserted twice.
    expect(
      await pgErrorCode(
        asService(db, (c) =>
          c.query(
            `insert into notifications (user_id, category, kind, title, dedupe_key, status, delivered_at)
             values ($1, 'planning', 'task_due', 'again', 'k1', 'delivered', now())`,
            [alice],
          ),
        ),
      ),
    ).toBe("23505");
  });

  it("new users get the suggestions notification category", async () => {
    const carol = await createUser(db, "carol@example.com");
    const rows = await asUser(db, carol, (c) =>
      c.query(
        "select frequency from notification_category_preferences where category = 'suggestions'",
      ),
    );
    expect(rows.rows).toEqual([{ frequency: "daily_digest" }]);
  });

  it("users see only when the scheduler last ran, never the run log itself", async () => {
    await asService(db, (c) =>
      c.query(
        "insert into scheduler_runs (trigger_source, finished_at, users_processed) values ('github_actions', now(), 3)",
      ),
    );
    const status = await asUser(db, alice, (c) => c.query("select * from scheduler_status()"));
    expect(status.rows).toHaveLength(1);
    expect(Object.keys(status.rows[0]).sort()).toEqual(["last_run_at", "last_run_ok"]);
    expect(status.rows[0].last_run_ok).toBe(true);
    expect(
      await pgErrorCode(asUser(db, alice, (c) => c.query("select * from scheduler_runs"))),
    ).toBe("42501");
  });
});

describe("email notifications (stage 6)", () => {
  it("users can opt in to email and choose what's sent, but can't touch delivery bookkeeping", async () => {
    const before = await asUser(db, alice, (c) =>
      c.query("select email_enabled, email_mode from notification_preferences"),
    );
    expect(before.rows[0]).toEqual({ email_enabled: false, email_mode: "summaries" });
    await asUser(db, alice, (c) =>
      c.query("update notification_preferences set email_enabled = true, email_mode = 'all'"),
    );
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) =>
          c.query("update notification_preferences set email_mode = 'spam'"),
        ),
      ),
    ).toBe("23514");
    expect(
      await pgErrorCode(
        asUser(db, alice, (c) => c.query("update notifications set emailed_at = now()")),
      ),
    ).toBe("42501");
    // Bob's preference is untouched by Alice's updates.
    const bob2 = await asService(db, (c) =>
      c.query("select email_enabled from notification_preferences where user_id = $1", [bob]),
    );
    expect(bob2.rows[0]).toEqual({ email_enabled: false });
  });

  it("new users default to the dark theme", async () => {
    const dave = await createUser(db, "dave@example.com");
    const { rows } = await asUser(db, dave, (c) => c.query("select theme from user_preferences"));
    expect(rows).toEqual([{ theme: "dark" }]);
  });
});
