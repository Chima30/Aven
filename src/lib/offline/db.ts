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
export const DB_VERSION = 1;

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
  const tx = db.transaction(["outbox", "meta"], "readwrite");
  await Promise.all([tx.objectStore("outbox").clear(), tx.objectStore("meta").clear(), tx.done]);
}
