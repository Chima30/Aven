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
  /** For updates/deletes: the server copy the change was based on (for projections and conflict UI). */
  snapshot?: unknown;
  /** True when the change was made while the device was offline. */
  createdOffline?: boolean;
  /** When a conflict is reported: the server's current copy, so the user can compare. */
  conflictRecord?: unknown;
}

export type NewOutboxEntry<TPayload = unknown> = Pick<
  OutboxEntry<TPayload>,
  "userId" | "entity" | "operation" | "recordId" | "payload" | "baseVersion"
> &
  Partial<Pick<OutboxEntry<TPayload>, "snapshot" | "createdOffline">>;

/** What the server reported for one entry. */
export type SyncResult =
  | { status: "applied"; serverVersion: number | null }
  | { status: "duplicate"; serverVersion: number | null }
  | { status: "conflict"; serverVersion: number | null; message: string; record?: unknown }
  | { status: "rejected"; message: string }
  | { status: "auth_required" };

/**
 * Sends a batch of entries (oldest first) and returns one result per entry, in
 * the same order. Must THROW on network failure so the whole batch is retried.
 */
export type SyncTransport = (entries: OutboxEntry[]) => Promise<SyncResult[]>;

export interface OutboxSummary {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}
