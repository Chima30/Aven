"use client";

import { openAvenDb, wipeLocalData } from "./db";
import { Outbox } from "./outbox";
import type { OutboxSummary } from "./types";

/** Browser-only helpers for the offline layer. */
export const OUTBOX_CHANGED_EVENT = "aven:outbox-changed";

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export async function readOutboxSummary(userId: string): Promise<OutboxSummary | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await openAvenDb();
  try {
    return await new Outbox(db).summary(userId);
  } finally {
    db.close();
  }
}

/**
 * Remove everything AVEN keeps in this browser: the offline queue, device id
 * and any cached files. Called before sign-out and after account deletion.
 * Note: unsynced changes are lost — the UI warns before signing out if any exist.
 */
export async function clearLocalAvenData(): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openAvenDb();
      await wipeLocalData(db);
      db.close();
    } catch {
      // If IndexedDB is blocked (private mode), there is nothing stored.
    }
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("aven-")).map((k) => caches.delete(k)));
  }
}
