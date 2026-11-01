import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_DELAY_MS, MAX_ATTEMPTS, MAX_DELAY_MS, backoffDelay } from "@/lib/offline/backoff";
import { getOrCreateDeviceId, openAvenDb, wipeLocalData, type AvenDb } from "@/lib/offline/db";
import { Outbox, STALE_SYNCING_MS } from "@/lib/offline/outbox";
import { SyncEngine } from "@/lib/offline/sync-engine";
import type { OutboxEntry, SyncResult } from "@/lib/offline/types";

let db: AvenDb;
let now: number;
const clock = { now: () => now };
const USER = "user-a";

beforeEach(async () => {
  db = await openAvenDb(`test-${randomUUID()}`);
  now = 1_000_000;
});

const outbox = () => new Outbox(db, clock, () => 0.5);
const newEntry = (overrides: Partial<OutboxEntry> = {}) => ({
  userId: USER,
  entity: "transactions",
  operation: "create" as const,
  recordId: randomUUID(),
  payload: { note: "coffee" },
  baseVersion: null,
  ...overrides,
});

describe("backoff", () => {
  it("grows exponentially and is capped", () => {
    expect(backoffDelay(1, () => 0.999)).toBeLessThanOrEqual(BASE_DELAY_MS);
    expect(backoffDelay(4, () => 0.999)).toBeLessThanOrEqual(BASE_DELAY_MS * 8);
    expect(backoffDelay(50, () => 0.999)).toBeLessThanOrEqual(MAX_DELAY_MS);
    expect(backoffDelay(50, () => 0)).toBeGreaterThanOrEqual(BASE_DELAY_MS / 2);
  });
});

describe("Outbox", () => {
  it("queues entries as pending with unique mutation ids", async () => {
    const box = outbox();
    const a = await box.enqueue(newEntry());
    const b = await box.enqueue(newEntry());
    expect(a.status).toBe("pending");
    expect(a.mutationId).not.toBe(b.mutationId);
    expect(await box.summary(USER)).toEqual({ pending: 2, syncing: 0, synced: 0, failed: 0 });
  });

  it("keeps users' queues separate", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.enqueue(newEntry({ userId: "user-b" }));
    expect((await box.list(USER)).length).toBe(1);
    expect((await box.claimDue("user-b")).every((e) => e.userId === "user-b")).toBe(true);
  });

  it("claims due entries in creation order and marks them syncing", async () => {
    const box = outbox();
    const first = await box.enqueue(newEntry());
    now += 10;
    const second = await box.enqueue(newEntry());
    const claimed = await box.claimDue(USER);
    expect(claimed.map((e) => e.mutationId)).toEqual([first.mutationId, second.mutationId]);
    expect((await box.summary(USER)).syncing).toBe(2);
    // A second claim does not hand out the same entries twice.
    expect(await box.claimDue(USER)).toEqual([]);
  });

  it("reclaims entries stuck in syncing after a crash", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.claimDue(USER);
    now += STALE_SYNCING_MS + 1;
    expect((await box.claimDue(USER)).length).toBe(1);
  });

  it("schedules retries with backoff and gives up after MAX_ATTEMPTS", async () => {
    const box = outbox();
    const entry = await box.enqueue(newEntry());
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      await box.claimDue(USER);
      await box.markRetry(entry.mutationId, "offline");
      const current = (await box.get(entry.mutationId))!;
      expect(current.status).toBe("pending");
      expect(current.nextAttemptAt).toBeGreaterThan(now);
      expect(await box.claimDue(USER)).toEqual([]); // not due yet
      now = current.nextAttemptAt;
    }
    await box.claimDue(USER);
    await box.markRetry(entry.mutationId, "offline");
    expect((await box.get(entry.mutationId))!).toMatchObject({
      status: "failed",
      lastError: { kind: "exhausted" },
    });
  });

  it("only lets the user discard failed entries, never pending ones", async () => {
    const box = outbox();
    const entry = await box.enqueue(newEntry());
    await expect(box.discard(entry.mutationId)).rejects.toThrow();
    await box.markFailed(entry.mutationId, "rejected", "bad data");
    await box.discard(entry.mutationId);
    expect(await box.get(entry.mutationId)).toBeUndefined();
  });

  it("lets the user retry a failed entry", async () => {
    const box = outbox();
    const entry = await box.enqueue(newEntry());
    await box.markFailed(entry.mutationId, "exhausted", "x");
    await box.retry(entry.mutationId);
    expect((await box.get(entry.mutationId))!).toMatchObject({
      status: "pending",
      attempts: 0,
      lastError: null,
    });
  });

  it("prunes old synced entries only", async () => {
    const box = outbox();
    const a = await box.enqueue(newEntry());
    await box.enqueue(newEntry());
    await box.markSynced(a.mutationId, 1);
    now += 10_000;
    expect(await box.pruneSynced(USER, 5_000)).toBe(1);
    expect(await box.summary(USER)).toEqual({ pending: 1, syncing: 0, synced: 0, failed: 0 });
  });

  it("wipes all local data on sign-out", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    const device = await getOrCreateDeviceId(db);
    expect(await getOrCreateDeviceId(db)).toBe(device);
    await wipeLocalData(db);
    expect(await box.list(USER)).toEqual([]);
    expect(await getOrCreateDeviceId(db)).not.toBe(device);
  });
});

/** Adapt a per-entry fake into the batch transport the engine uses. */
const perEntry =
  (fn: (e: OutboxEntry) => Promise<SyncResult>) =>
  async (entries: OutboxEntry[]): Promise<SyncResult[]> => {
    const out: SyncResult[] = [];
    for (const e of entries) out.push(await fn(e));
    return out;
  };

describe("SyncEngine", () => {
  /** Fake server that de-duplicates by mutationId, like public.sync_receipts. */
  function fakeServer() {
    const applied = new Map<string, number>();
    let version = 0;
    const transport = async (entry: OutboxEntry): Promise<SyncResult> => {
      const existing = applied.get(entry.mutationId);
      if (existing !== undefined) return { status: "duplicate", serverVersion: existing };
      version += 1;
      applied.set(entry.mutationId, version);
      return { status: "applied", serverVersion: version };
    };
    return { applied, transport };
  }

  it("syncs everything when online", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.enqueue(newEntry());
    const server = fakeServer();
    const report = await new SyncEngine({
      outbox: box,
      transport: perEntry(server.transport),
      userId: USER,
      isOnline: () => true,
    }).run();
    expect(report).toMatchObject({ attempted: 2, synced: 2, failed: 0 });
    expect(await box.summary(USER)).toEqual({ pending: 0, syncing: 0, synced: 2, failed: 0 });
  });

  it("does nothing while offline", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    const report = await new SyncEngine({
      outbox: box,
      transport: perEntry(fakeServer().transport),
      userId: USER,
      isOnline: () => false,
    }).run();
    expect(report.stoppedReason).toBe("offline");
    expect((await box.summary(USER)).pending).toBe(1);
  });

  it("never creates duplicates when a request is retried after a lost response", async () => {
    const box = outbox();
    const entry = await box.enqueue(newEntry());
    const server = fakeServer();
    let first = true;
    // The server applies the change, but the response is lost on the way back.
    const flaky = async (e: OutboxEntry) => {
      const result = await server.transport(e);
      if (first) {
        first = false;
        throw new Error("connection reset");
      }
      return result;
    };
    const engine = new SyncEngine({
      outbox: box,
      transport: perEntry(flaky),
      userId: USER,
      isOnline: () => true,
    });
    expect((await engine.run()).retrying).toBe(1);
    now = (await box.get(entry.mutationId))!.nextAttemptAt;
    expect((await engine.run()).synced).toBe(1);
    expect(server.applied.size).toBe(1);
    expect((await box.get(entry.mutationId))!.status).toBe("synced");
  });

  it("stops at the first network error and keeps order for the rest", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.enqueue(newEntry());
    const engine = new SyncEngine({
      outbox: box,
      transport: async () => {
        throw new Error("offline");
      },
      userId: USER,
      isOnline: () => true,
    });
    const report = await engine.run();
    expect(report).toMatchObject({ attempted: 2, retrying: 2, synced: 0 });
    const entries = await box.list(USER);
    // Nothing is lost or reordered: both stay pending and will be retried together.
    expect(entries.map((e) => e.status)).toEqual(["pending", "pending"]);
    expect(entries.map((e) => e.attempts)).toEqual([1, 1]);
  });

  it("marks conflicts as failed and never overwrites", async () => {
    const box = outbox();
    const entry = await box.enqueue(newEntry({ operation: "update", baseVersion: 3 }));
    const report = await new SyncEngine({
      outbox: box,
      transport: async () => [
        {
          status: "conflict",
          serverVersion: 5,
          message: "Changed on another device",
          record: { amount_minor: 9 },
        },
      ],
      userId: USER,
      isOnline: () => true,
    }).run();
    expect(report.failed).toBe(1);
    expect((await box.get(entry.mutationId))!).toMatchObject({
      status: "failed",
      serverVersion: 5,
      lastError: { kind: "conflict" },
      conflictRecord: { amount_minor: 9 },
    });
  });

  it("pauses without losing anything when the session has expired", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.enqueue(newEntry());
    const report = await new SyncEngine({
      outbox: box,
      transport: async (entries) => entries.map(() => ({ status: "auth_required" as const })),
      userId: USER,
      isOnline: () => true,
    }).run();
    expect(report.stoppedReason).toBe("auth_required");
    expect(await box.summary(USER)).toEqual({ pending: 2, syncing: 0, synced: 0, failed: 0 });
  });

  it("refuses to run twice at the same time", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    let release: () => void = () => undefined;
    const engine = new SyncEngine({
      outbox: box,
      transport: () =>
        new Promise<SyncResult[]>((resolve) => {
          release = () => resolve([{ status: "applied", serverVersion: 1 }]);
        }),
      userId: USER,
      isOnline: () => true,
    });
    const first = engine.run();
    await new Promise((r) => setTimeout(r, 20));
    expect((await engine.run()).stoppedReason).toBe("already_running");
    release();
    expect((await first).synced).toBe(1);
  });
});

describe("Outbox edits before sync", () => {
  it("lets an unsent change be edited or cancelled, but not one that may have reached the server", async () => {
    const box = outbox();
    const a = await box.enqueue(newEntry());
    expect(await box.replacePayload(a.mutationId, { note: "tea" })).toBe(true);
    expect((await box.get(a.mutationId))!.payload).toEqual({ note: "tea" });

    const b = await box.enqueue(newEntry());
    await box.claimDue(USER);
    await box.markRetry(b.mutationId, "lost response"); // may have been applied
    expect(await box.cancelUnsent(b.mutationId)).toBe(false);
    expect(await box.replacePayload(b.mutationId, {})).toBe(false);
    expect(await box.get(b.mutationId)).toBeDefined();
  });

  it("persists across reopening the database (survives a reload)", async () => {
    const name = `persist-${randomUUID()}`;
    const first = await openAvenDb(name);
    const entry = await new Outbox(first).enqueue(newEntry({ createdOffline: true }));
    first.close();
    const second = await openAvenDb(name);
    expect((await new Outbox(second).get(entry.mutationId))!).toMatchObject({
      status: "pending",
      createdOffline: true,
    });
    second.close();
  });

  it("syncs in batches and counts offline-created entries", async () => {
    const box = outbox();
    for (let i = 0; i < 5; i += 1) await box.enqueue(newEntry({ createdOffline: i < 2 }));
    const sizes: number[] = [];
    const report = await new SyncEngine({
      outbox: box,
      transport: async (entries) => {
        sizes.push(entries.length);
        return entries.map(() => ({ status: "applied" as const, serverVersion: 1 }));
      },
      userId: USER,
      isOnline: () => true,
      batchSize: 2,
    }).run();
    expect(sizes).toEqual([2, 2, 1]);
    expect(report).toMatchObject({ synced: 5, syncedOffline: 2 });
  });

  it("treats an incomplete server response as a network failure", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.enqueue(newEntry());
    const report = await new SyncEngine({
      outbox: box,
      transport: async () => [{ status: "applied", serverVersion: 1 }],
      userId: USER,
      isOnline: () => true,
    }).run();
    expect(report.retrying).toBe(2);
    expect((await box.summary(USER)).pending).toBe(2);
  });

  it("recovers entries orphaned in 'syncing' when the page went away mid-request", async () => {
    const box = outbox();
    await box.enqueue(newEntry());
    await box.claimDue(USER);
    expect((await box.summary(USER)).syncing).toBe(1);
    expect(await box.releaseOrphaned(USER)).toBe(1);
    expect((await box.claimDue(USER)).length).toBe(1);
  });
});
