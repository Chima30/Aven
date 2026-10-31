"use client";

import { formatMinor } from "@/lib/finance/format";
import { projectBalances } from "@/lib/finance/projection";
import { useTransactionOutbox } from "@/lib/finance/use-outbox";

/**
 * Shows "Projected" next to a confirmed balance when this device holds
 * unsynced changes for the account. Renders nothing when there are none.
 */
export function ProjectedBalanceNote({
  userId,
  accountId,
  confirmedMinor,
  currency,
  locale,
}: {
  userId: string;
  accountId: string;
  confirmedMinor: string;
  currency: string;
  locale: string;
}) {
  const entries = useTransactionOutbox(userId);
  const projection = projectBalances(
    [{ accountId, balanceMinor: BigInt(confirmedMinor) }],
    entries,
  ).get(accountId);
  if (!projection || projection.pendingCount === 0) return null;
  return (
    <p className="text-warning mt-1 text-xs">
      Projected {formatMinor(projection.projectedMinor, currency, locale)} · includes{" "}
      {projection.pendingCount} unsynced change{projection.pendingCount === 1 ? "" : "s"}
    </p>
  );
}

/** Banner for pages that show server totals while unsynced changes exist. */
export function UnsyncedNotice({ userId }: { userId: string }) {
  const entries = useTransactionOutbox(userId);
  if (entries.length === 0) return null;
  return (
    <p
      role="status"
      className="border-warning/40 bg-warning-soft/50 text-ink rounded-xl border px-4 py-2.5 text-sm"
    >
      {entries.length} transaction change{entries.length === 1 ? " is" : "s are"} saved on this
      device but not synced yet, so {entries.length === 1 ? "it isn't" : "they aren't"} included in
      the totals below.
    </p>
  );
}
