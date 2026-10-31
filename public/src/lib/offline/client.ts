"use client";

import { wipeLocalData } from "./db";
import { OUTBOX_EVENT, getOutbox, sharedDb } from "./controller";
import type { OutboxSummary } from "./types";

/** Browser-only helpers for the offline layer. */
export const OUTBOX_CHANGED_EVENT = OUTBOX_EVENT;

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export async function readOutboxSummary(userId: string): Promise<OutboxSummary | null> {
  if (!isIndexedDbAvailable()) return null;
  return (await getOutbox()).summary(userId);
}

/**
 * Remove everything AVEN keeps in this browser: the offline queue, device id
 * and any cached files. Called before sign-out and after account deletion.
 * Note: unsynced changes are lost — the UI warns before signing out if any exist.
 */
export async function clearLocalAvenData(): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      await wipeLocalData(await sharedDb());
    } catch {
      // If IndexedDB is blocked (private mode), there is nothing stored.
    }
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("aven-")).map((k) => caches.delete(k)));
  }
}
