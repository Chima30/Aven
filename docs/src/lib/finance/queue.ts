"use client";

import { enqueue, getOutbox, notifyOutboxChanged } from "@/lib/offline/controller";
import { Outbox } from "@/lib/offline/outbox";
import type { OutboxEntry } from "@/lib/offline/types";
import type { TransactionRow } from "@/lib/supabase/database.types";
import type { TransactionPayload } from "./schemas";

/*
 * Every transaction change goes through the IndexedDB outbox — online or not —
 * so there is exactly one code path, and nothing is lost if the network drops
 * mid-request. These helpers apply the "edit only where safe" rules:
 *
 *   • A change that has NEVER been sent can be edited or cancelled in place.
 *   • A change that MAY have reached the server (it was sent, the answer was lost)
 *     is left alone until it settles — the user is asked to wait.
 *   • Editing/deleting a synced transaction queues an update/delete that carries
 *     the server version it was based on, so the server can detect conflicts.
 */

export class QueueBusyError extends Error {
  constructor() {
    super("This transaction is still syncing. Try again in a moment.");
    this.name = "QueueBusyError";
  }
}

type ServerCopy = Pick<
  TransactionRow,
  | "id"
  | "version"
  | "kind"
  | "account_id"
  | "transfer_account_id"
  | "amount_minor"
  | "currency_code"
> &
  Partial<TransactionRow>;

async function unsyncedFor(userId: string, recordId: string): Promise<OutboxEntry[]> {
  const outbox = await getOutbox();
  return (await outbox.list(userId)).filter(
    (e) => e.entity === "transaction" && e.recordId === recordId && e.status !== "synced",
  );
}

export async function queueCreate(userId: string, payload: TransactionPayload): Promise<string> {
  const recordId = crypto.randomUUID();
  await enqueue({
    userId,
    entity: "transaction",
    operation: "create",
    recordId,
    payload,
    baseVersion: null,
  });
  return recordId;
}

/** Edit a transaction. `server` is the synced copy, or null if it only exists on this device. */
export async function queueUpdate(
  userId: string,
  recordId: string,
  payload: TransactionPayload,
  server: ServerCopy | null,
): Promise<void> {
  const outbox = await getOutbox();
  const open = await unsyncedFor(userId, recordId);
  const failed = open.filter((e) => e.status === "failed");
  const active = open.filter((e) => e.status !== "failed");

  if (active.length > 0) {
    const last = active[active.length - 1]!;
    if (active.every(Outbox.neverSent) && last.operation !== "delete") {
      // Fold the edit into the queued change that hasn't left the device yet.
      await outbox.replacePayload(last.mutationId, payload);
      notifyOutboxChanged();
      return;
    }
    throw new QueueBusyError();
  }
  if (!server) {
    // Only a failed local create exists: replace it with a fresh attempt.
    for (const f of failed) await outbox.discard(f.mutationId);
    await enqueue({
      userId,
      entity: "transaction",
      operation: "create",
      recordId,
      payload,
      baseVersion: null,
    });
    return;
  }
  await enqueue({
    userId,
    entity: "transaction",
    operation: "update",
    recordId,
    payload,
    baseVersion: server.version,
    snapshot: server,
  });
}

export async function queueDelete(
  userId: string,
  recordId: string,
  server: ServerCopy | null,
): Promise<void> {
  const outbox = await getOutbox();
  const open = (await unsyncedFor(userId, recordId)).filter((e) => e.status !== "failed");

  if (open.length > 0 && !open.every(Outbox.neverSent)) throw new QueueBusyError();
  // Cancel everything still waiting on this device for that record.
  let base = server?.version ?? null;
  for (const e of open) {
    if (e.operation === "update" && e.baseVersion) base = e.baseVersion;
    await outbox.cancelUnsent(e.mutationId);
  }
  if (!server) {
    notifyOutboxChanged();
    return; // it never reached the server — nothing more to do
  }
  await enqueue({
    userId,
    entity: "transaction",
    operation: "delete",
    recordId,
    payload: {},
    baseVersion: base ?? server.version,
    snapshot: server,
  });
}

/** Conflict resolution: keep my version → resend it on top of the server's latest version. */
export async function resolveKeepMine(entry: OutboxEntry<TransactionPayload>): Promise<void> {
  const outbox = await getOutbox();
  const server = entry.conflictRecord as ServerCopy | null | undefined;
  await outbox.discard(entry.mutationId);
  if (entry.operation === "delete") {
    if (server) {
      await enqueue({
        ...base(entry),
        operation: "delete",
        payload: {},
        baseVersion: server.version,
        snapshot: server,
      });
    }
    return;
  }
  if (server && entry.lastError?.kind === "conflict") {
    await enqueue({
      ...base(entry),
      operation: "update",
      payload: entry.payload,
      baseVersion: server.version,
      snapshot: server,
    });
  } else {
    // The server copy is gone (or never existed): recreate as a NEW transaction.
    await enqueue({
      ...base(entry),
      recordId: crypto.randomUUID(),
      operation: "create",
      payload: entry.payload,
      baseVersion: null,
    });
  }
}

/** Conflict resolution: accept the server's version and drop the local change. */
export async function resolveUseServer(entry: OutboxEntry): Promise<void> {
  await (await getOutbox()).discard(entry.mutationId);
  notifyOutboxChanged();
}

export async function retryFailed(entry: OutboxEntry): Promise<void> {
  await (await getOutbox()).retry(entry.mutationId);
  notifyOutboxChanged();
}

function base(entry: OutboxEntry) {
  return { userId: entry.userId, entity: entry.entity, recordId: entry.recordId };
}
