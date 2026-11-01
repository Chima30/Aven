"use client";

import { getMeta, getOrCreateDeviceId, openAvenDb, setMeta, type AvenDb } from "./db";
import { Outbox } from "./outbox";
import { SyncEngine, type SyncRunReport } from "./sync-engine";
import { httpTransport } from "./transport";
import type { NewOutboxEntry, OutboxEntry } from "./types";

/**
 * Browser-side coordinator for the offline outbox.
 * - Opens IndexedDB once and shares it.
 * - Runs the sync engine on: enqueue, reconnect, tab focus, and every 10 s while work is waiting.
 * - Uses the Web Locks API (when available) so only one tab syncs at a time.
 * - Broadcasts "aven:outbox-changed" so every view can refresh its status.
 */
export const OUTBOX_EVENT = "aven:outbox-changed";
export const SYNC_REPORT_EVENT = "aven:sync-report";
const CURRENT_USER_KEY = "current_user";

let dbPromise: Promise<AvenDb> | null = null;
export function sharedDb(): Promise<AvenDb> {
  dbPromise ??= openAvenDb();
  return dbPromise;
}

export function notifyOutboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export async function rememberCurrentUser(userId: string) {
  await setMeta(await sharedDb(), CURRENT_USER_KEY, userId);
}

export async function currentOfflineUser(): Promise<string | undefined> {
  return getMeta(await sharedDb(), CURRENT_USER_KEY);
}

export async function getOutbox(): Promise<Outbox> {
  return new Outbox(await sharedDb());
}

export async function listEntries(userId: string): Promise<OutboxEntry[]> {
  return (await getOutbox()).list(userId);
}

export async function enqueue<T>(entry: NewOutboxEntry<T>): Promise<OutboxEntry<T>> {
  const created = await (
    await getOutbox()
  ).enqueue({
    ...entry,
    createdOffline: entry.createdOffline ?? (typeof navigator !== "undefined" && !navigator.onLine),
  });
  notifyOutboxChanged();
  void requestSync(entry.userId);
  return created;
}

const running = new Map<string, Promise<SyncRunReport | null>>();
const lockMisses = new Map<string, number>();

/**
 * Run a sync now. Only one tab syncs at a time (Web Locks). If the lock stays
 * busy — e.g. a previous page was frozen by the browser while holding it — the
 * lock is taken over after two short waits. That is safe because the server
 * de-duplicates every change by its mutation id: the lock is an optimisation,
 * not what prevents duplicates.
 */
export function requestSync(userId: string): Promise<SyncRunReport | null> {
  const existing = running.get(userId);
  if (existing) return existing;
  const job = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    const db = await sharedDb();
    const deviceId = await getOrCreateDeviceId(db);
    const outbox = new Outbox(db);
    const engine = new SyncEngine({ outbox, transport: httpTransport(deviceId), userId });
    const work = async () => {
      // Holding the lock means no request from another live page is in flight:
      // recover entries left "syncing" by a page that closed or navigated mid-sync.
      await outbox.releaseOrphaned(userId);
      return engine.run();
    };
    let report: SyncRunReport | null;
    if (typeof navigator !== "undefined" && "locks" in navigator) {
      const misses = lockMisses.get(userId) ?? 0;
      report =
        misses >= 2
          ? await navigator.locks.request("aven-sync", { steal: true }, work)
          : await navigator.locks.request("aven-sync", { ifAvailable: true }, async (lock) =>
              lock ? work() : null,
            );
      if (report === null && misses < 2) {
        lockMisses.set(userId, misses + 1);
        window.setTimeout(() => void requestSync(userId), 1500);
      } else {
        lockMisses.delete(userId);
      }
    } else {
      report = await work();
    }
    notifyOutboxChanged();
    if (report) window.dispatchEvent(new CustomEvent(SYNC_REPORT_EVENT, { detail: report }));
    return report;
  })().finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

/** Start background syncing for the signed-in user. Returns a cleanup function. */
export function startSyncLoop(userId: string): () => void {
  void rememberCurrentUser(userId);
  const run = () => void requestSync(userId);
  const onVisible = () => document.visibilityState === "visible" && run();
  window.addEventListener("online", run);
  window.addEventListener("pageshow", run); // restored from the back/forward cache
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(async () => {
    const summary = await (await getOutbox()).summary(userId);
    if (summary.pending > 0 || summary.syncing > 0) run();
  }, 10_000);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.removeEventListener("pageshow", run);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
