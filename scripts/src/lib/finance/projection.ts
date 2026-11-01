import type { OutboxEntry } from "@/lib/offline/types";
import type { TransactionPayload } from "./schemas";

/**
 * Projected balances: server-confirmed balance + the effect of changes that
 * are still waiting on this device. The projection is ALWAYS shown labelled
 * as projected; the confirmed balance comes only from the server.
 */
export interface TxShape {
  kind: "income" | "expense" | "transfer";
  account_id: string;
  transfer_account_id: string | null;
  amount_minor: string | number;
}

/** Signed effect of one transaction on one account (0 if unrelated). */
export function effectOn(tx: TxShape, accountId: string): bigint {
  const amount = BigInt(tx.amount_minor);
  if (tx.kind === "income" && tx.account_id === accountId) return amount;
  if (tx.kind === "expense" && tx.account_id === accountId) return -amount;
  if (tx.kind === "transfer") {
    if (tx.account_id === accountId) return -amount;
    if (tx.transfer_account_id === accountId) return amount;
  }
  return 0n;
}

export type TransactionOutboxEntry = OutboxEntry<TransactionPayload>;

/** Net pending change an outbox entry would make to an account. */
export function pendingDelta(entry: TransactionOutboxEntry, accountId: string): bigint {
  if (entry.entity !== "transaction" || entry.status === "synced") return 0n;
  const before = entry.snapshot ? effectOn(entry.snapshot as TxShape, accountId) : 0n;
  switch (entry.operation) {
    case "create":
      return effectOn(entry.payload, accountId);
    case "update":
      return effectOn(entry.payload, accountId) - before;
    case "delete":
      return -before;
  }
}

export interface ProjectedBalance {
  accountId: string;
  confirmedMinor: bigint;
  pendingMinor: bigint;
  projectedMinor: bigint;
  pendingCount: number;
}

export function projectBalances(
  confirmed: ReadonlyArray<{ accountId: string; balanceMinor: bigint }>,
  entries: ReadonlyArray<TransactionOutboxEntry>,
): Map<string, ProjectedBalance> {
  const out = new Map<string, ProjectedBalance>();
  for (const { accountId, balanceMinor } of confirmed) {
    let pending = 0n;
    let count = 0;
    for (const entry of entries) {
      const delta = pendingDelta(entry, accountId);
      const touches =
        entry.status !== "synced" &&
        entry.entity === "transaction" &&
        (entry.payload?.account_id === accountId ||
          entry.payload?.transfer_account_id === accountId ||
          (entry.snapshot as TxShape | undefined)?.account_id === accountId ||
          (entry.snapshot as TxShape | undefined)?.transfer_account_id === accountId);
      pending += delta;
      if (touches) count += 1;
    }
    out.set(accountId, {
      accountId,
      confirmedMinor: balanceMinor,
      pendingMinor: pending,
      projectedMinor: balanceMinor + pending,
      pendingCount: count,
    });
  }
  return out;
}
