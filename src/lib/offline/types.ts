/**
 * Offline queue ("outbox") contract.
 *
 * Every change made while offline becomes one OutboxEntry, identified by a
 * client-generated `mutationId` (UUID). The server stores that id in
 * public.sync_receipts with a unique constraint, so sending the same entry
 * twice can never create a duplicate record.
 *
 * Lifecycle:
 *   pending ──claim──▶ syncing ──applied/duplicate──▶ synced
 *      ▲                  │
 *      └──network error───┤ (retry with backoff until MAX_ATTEMPTS)
 *                         └──conflict / rejected / exhausted──▶ failed
 *
 * A failed entry is NEVER discarded automatically. The user decides whether
 * to retry, edit or discard it.
 */
export type OutboxStatus = "pending" | "syncing" | "synced" | "failed";

export type FailureKind =
  /** The server's copy changed since this edit was made. Needs a human decision. */
  | "conflict"
  /** The server refused the data (e.g. validation). Retrying unchanged will not help. */
  | "rejected"
  /** Too many network failures. The user can retry manually. */
  | "exhausted";

export type OutboxOperation = "create" | "update" | "delete";

export interface OutboxEntry<TPayload = unknown> {
  mutationId: string;
  /** The signed-in user who made the change. Entries never sync under another account. */
  userId: string;
  entity: string;
  operation: OutboxOperation;
  recordId: string;
  payload: TPayload;
  /** Server version the edit was based on (null for creates). Used for conflict detection. */
  baseVersion: number | null;
  status: OutboxStatus;
  attempts: number;
  /** Epoch ms; entry is not retried before this time. */
  nextAttemptAt: number;
  lastError: { kind: FailureKind | "network"; message: string } | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  serverVersion: number | null;
}

export type NewOutboxEntry<TPayload = unknown> = Pick<
  OutboxEntry<TPayload>,
  "userId" | "entity" | "operation" | "recordId" | "payload" | "baseVersion"
>;

/** What the server reported for one entry. */
export type SyncResult =
  | { status: "applied"; serverVersion: number }
  | { status: "duplicate"; serverVersion: number | null }
  | { status: "conflict"; serverVersion: number; message: string }
  | { status: "rejected"; message: string }
  | { status: "auth_required" };

/** Sends one entry to the server. Must THROW on network failure. */
export type SyncTransport = (entry: OutboxEntry) => Promise<SyncResult>;

export interface OutboxSummary {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}
