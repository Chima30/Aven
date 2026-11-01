import { backoffDelay, MAX_ATTEMPTS } from "./backoff";
import type { AvenDb } from "./db";
import type { FailureKind, NewOutboxEntry, OutboxEntry, OutboxSummary } from "./types";

/** An entry stuck in "syncing" longer than this is assumed abandoned (tab closed mid-sync). */
export const STALE_SYNCING_MS = 2 * 60_000;

export interface Clock {
  now(): number;
}
const systemClock: Clock = { now: () => Date.now() };

/**
 * The outbox: a durable queue of offline changes stored in IndexedDB.
 * All methods are scoped to one user id.
 */
export class Outbox {
  constructor(
    private readonly db: AvenDb,
    private readonly clock: Clock = systemClock,
    private readonly random: () => number = Math.random,
  ) {}

  async enqueue<T>(input: NewOutboxEntry<T>): Promise<OutboxEntry<T>> {
    const now = this.clock.now();
    const entry: OutboxEntry<T> = {
      ...input,
      createdOffline: input.createdOffline ?? false,
      mutationId: crypto.randomUUID(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      serverVersion: null,
    };
    await this.db.add("outbox", entry as OutboxEntry);
    return entry;
  }

  async get(mutationId: string): Promise<OutboxEntry | undefined> {
    return this.db.get("outbox", mutationId);
  }

  /** All entries for a user, oldest first (the order they must be applied in). */
  async list(userId: string): Promise<OutboxEntry[]> {
    return this.db.getAllFromIndex(
      "outbox",
      "by_user_created",
      IDBKeyRange.bound([userId, -Infinity], [userId, Infinity]),
    );
  }

  async summary(userId: string): Promise<OutboxSummary> {
    const summary: OutboxSummary = { pending: 0, syncing: 0, synced: 0, failed: 0 };
    for (const entry of await this.list(userId)) summary[entry.status] += 1;
    return summary;
  }

  /**
   * Atomically move due "pending" entries to "syncing" and return them in order.
   * Stale "syncing" entries (from a crashed tab) are reclaimed — safe because
   * the server de-duplicates by mutationId.
   */
  async claimDue(userId: string, limit = Infinity): Promise<OutboxEntry[]> {
    const now = this.clock.now();
    const tx = this.db.transaction("outbox", "readwrite");
    const index = tx.store.index("by_user_created");
    const claimed: OutboxEntry[] = [];
    let cursor = await index.openCursor(IDBKeyRange.bound([userId, -Infinity], [userId, Infinity]));
    while (cursor) {
      const entry = cursor.value;
      const due = entry.status === "pending" && entry.nextAttemptAt <= now;
      const stale = entry.status === "syncing" && now - entry.updatedAt > STALE_SYNCING_MS;
      if ((due || stale) && claimed.length < limit) {
        const updated: OutboxEntry = { ...entry, status: "syncing", updatedAt: now };
        await cursor.update(updated);
        claimed.push(updated);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return claimed;
  }

  /**
   * Put every "syncing" entry back to "pending". Only safe when the caller holds
   * the cross-tab sync lock, i.e. nothing can really be in flight (for example,
   * the page was reloaded or navigated away mid-request). Re-sending is safe
   * because the server de-duplicates by mutation id.
   */
  async releaseOrphaned(userId: string): Promise<number> {
    let released = 0;
    for (const entry of await this.list(userId)) {
      if (entry.status === "syncing") {
        await this.update(entry.mutationId, (e) => ({
          ...e,
          status: "pending",
          nextAttemptAt: this.clock.now(),
        }));
        released += 1;
      }
    }
    return released;
  }

  async markSynced(mutationId: string, serverVersion: number | null): Promise<void> {
    await this.update(mutationId, (e) => ({
      ...e,
      status: "synced",
      lastError: null,
      syncedAt: this.clock.now(),
      serverVersion,
    }));
  }

  /** Network-type failure: schedule another attempt, or give up after MAX_ATTEMPTS. */
  async markRetry(mutationId: string, message: string): Promise<void> {
    await this.update(mutationId, (e) => {
      const attempts = e.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        return { ...e, attempts, status: "failed", lastError: { kind: "exhausted", message } };
      }
      return {
        ...e,
        attempts,
        status: "pending",
        nextAttemptAt: this.clock.now() + backoffDelay(attempts, this.random),
        lastError: { kind: "network", message },
      };
    });
  }

  /** Put an entry back to pending without counting an attempt (e.g. signed out mid-sync). */
  async release(mutationId: string): Promise<void> {
    await this.update(mutationId, (e) => ({ ...e, status: "pending" }));
  }

  async markFailed(
    mutationId: string,
    kind: FailureKind,
    message: string,
    serverVersion: number | null = null,
    conflictRecord?: unknown,
  ): Promise<void> {
    await this.update(mutationId, (e) => ({
      ...e,
      status: "failed",
      lastError: { kind, message },
      serverVersion: serverVersion ?? e.serverVersion,
      ...(conflictRecord === undefined ? {} : { conflictRecord }),
    }));
  }

  /**
   * True when a pending entry has certainly NOT reached the server: it has
   * never been sent. Only then may it be changed in place or cancelled.
   */
  static neverSent(entry: OutboxEntry): boolean {
    return entry.status === "pending" && entry.attempts === 0 && entry.lastError === null;
  }

  /** Edit a queued change that has never been sent (e.g. fix a typo before it syncs). */
  async replacePayload<T>(mutationId: string, payload: T): Promise<boolean> {
    const entry = await this.get(mutationId);
    if (!entry || !Outbox.neverSent(entry)) return false;
    await this.update(mutationId, (e) => ({ ...e, payload }));
    return true;
  }

  /** Cancel a queued change that has never been sent. Returns false if it might have reached the server. */
  async cancelUnsent(mutationId: string): Promise<boolean> {
    const entry = await this.get(mutationId);
    if (!entry || !Outbox.neverSent(entry)) return false;
    await this.db.delete("outbox", mutationId);
    return true;
  }

  /** User-initiated retry of a failed entry. */
  async retry(mutationId: string): Promise<void> {
    await this.update(mutationId, (e) => {
      if (e.status !== "failed") return e;
      return {
        ...e,
        status: "pending",
        attempts: 0,
        nextAttemptAt: this.clock.now(),
        lastError: null,
      };
    });
  }

  /** User-initiated discard. Only failed entries can be discarded, never pending ones silently. */
  async discard(mutationId: string): Promise<void> {
    const entry = await this.get(mutationId);
    if (!entry) return;
    if (entry.status !== "failed") {
      throw new Error("Only failed changes can be discarded.");
    }
    await this.db.delete("outbox", mutationId);
  }

  /** Housekeeping: remove synced entries older than `maxAgeMs`. */
  async pruneSynced(userId: string, maxAgeMs: number): Promise<number> {
    const cutoff = this.clock.now() - maxAgeMs;
    let removed = 0;
    for (const entry of await this.list(userId)) {
      if (entry.status === "synced" && (entry.syncedAt ?? 0) < cutoff) {
        await this.db.delete("outbox", entry.mutationId);
        removed += 1;
      }
    }
    return removed;
  }

  private async update(mutationId: string, change: (e: OutboxEntry) => OutboxEntry): Promise<void> {
    const tx = this.db.transaction("outbox", "readwrite");
    const entry = await tx.store.get(mutationId);
    if (!entry) throw new Error(`Outbox entry not found: ${mutationId}`);
    await tx.store.put({ ...change(entry), updatedAt: this.clock.now() });
    await tx.done;
  }
}
