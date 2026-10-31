import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OutboxEntry, OutboxStatus } from "./types";

/**
 * IndexedDB layout for AVEN's offline data.
 *
 * - outbox : queued changes waiting to reach Supabase (the source of truth)
 * - meta   : small key/value facts such as this device's id
 *
 * localStorage is NOT used for queued data: it is synchronous, size-limited
 * and can be cleared without warning, which would silently lose changes.
 */
export const DB_NAME = "aven";
export const DB_VERSION = 2;

export interface AvenDbSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: {
      by_status: OutboxStatus;
      by_user: string;
      by_user_created: [string, number];
    };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
  /** Copies of reference data (accounts, categories) so transactions can be entered offline. */
  cache: {
    key: string;
    value: { key: string; userId: string; savedAt: number; data: unknown };
  };
}

export type AvenDb = IDBPDatabase<AvenDbSchema>;

export function openAvenDb(name: string = DB_NAME): Promise<AvenDb> {
  return openDB<AvenDbSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const outbox = db.createObjectStore("outbox", { keyPath: "mutationId" });
        outbox.createIndex("by_status", "status");
        outbox.createIndex("by_user", "userId");
        outbox.createIndex("by_user_created", ["userId", "createdAt"]);
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (oldVersion < 2) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      // Future versions add migrations here; never delete user data in an upgrade.
    },
  });
}

/** Stable per-browser device id (not personal data; regenerated after sign-out wipe). */
export async function getOrCreateDeviceId(db: AvenDb): Promise<string> {
  const existing = await db.get("meta", "device_id");
  if (existing) return existing.value;
  const id = crypto.randomUUID();
  await db.put("meta", { key: "device_id", value: id });
  return id;
}

/** Remove ALL local AVEN data. Called on sign-out so the next person on this device sees nothing. */
export async function wipeLocalData(db: AvenDb): Promise<void> {
  const tx = db.transaction(["outbox", "meta", "cache"], "readwrite");
  await Promise.all([
    tx.objectStore("outbox").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("cache").clear(),
    tx.done,
  ]);
}

export async function setMeta(db: AvenDb, key: string, value: string): Promise<void> {
  await db.put("meta", { key, value });
}

export async function getMeta(db: AvenDb, key: string): Promise<string | undefined> {
  return (await db.get("meta", key))?.value;
}

export async function putCache(
  db: AvenDb,
  userId: string,
  name: string,
  data: unknown,
): Promise<void> {
  await db.put("cache", { key: `${userId}:${name}`, userId, savedAt: Date.now(), data });
}

export async function getCache<T>(
  db: AvenDb,
  userId: string,
  name: string,
): Promise<{ data: T; savedAt: number } | undefined> {
  const row = await db.get("cache", `${userId}:${name}`);
  return row ? { data: row.data as T, savedAt: row.savedAt } : undefined;
}
