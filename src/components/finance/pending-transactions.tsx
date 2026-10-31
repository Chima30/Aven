"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { minorToInput } from "@/lib/finance/amount-input";
import { formatMinor } from "@/lib/finance/format";
import type { TransactionPayload } from "@/lib/finance/schemas";
import { useTransactionOutbox } from "@/lib/finance/use-outbox";
import { getOutbox, notifyOutboxChanged } from "@/lib/offline/controller";
import { Outbox } from "@/lib/offline/outbox";
import type { OutboxEntry } from "@/lib/offline/types";
import { isCurrencyCode } from "@/lib/money/currencies";
import { TransactionForm, type TxAccountOption, type TxCategoryOption } from "./transaction-form";

const STATUS: Record<
  OutboxEntry["status"],
  { label: string; tone: "warning" | "info" | "danger" | "success" }
> = {
  pending: { label: "Pending", tone: "warning" },
  syncing: { label: "Syncing", tone: "info" },
  failed: { label: "Failed", tone: "danger" },
  synced: { label: "Synced", tone: "success" },
};

const OP_LABEL = { create: "New", update: "Edit", delete: "Delete" } as const;

/**
 * Changes saved on this device that haven't reached the server yet.
 * Shown separately from synced transactions and clearly labelled.
 */
export function PendingTransactions({
  userId,
  accounts,
  categories,
  locale,
  decimal,
  today,
  accountId,
}: {
  userId: string;
  accounts: TxAccountOption[];
  categories: TxCategoryOption[];
  locale: string;
  decimal: "." | ",";
  today: string;
  /** Only show changes touching this account. */
  accountId?: string;
}) {
  const all = useTransactionOutbox(userId);
  const toast = useToast();
  const [editing, setEditing] = useState<OutboxEntry<TransactionPayload> | null>(null);
  const entries = accountId
    ? all.filter(
        (e) =>
          e.payload?.account_id === accountId ||
          e.payload?.transfer_account_id === accountId ||
          (e.snapshot as { account_id?: string } | undefined)?.account_id === accountId,
      )
    : all;
  if (entries.length === 0) return null;

  const accountName = (id?: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "Unknown account";
  const categoryName = (id?: string | null) => categories.find((c) => c.id === id)?.name;

  async function cancel(entry: OutboxEntry) {
    const ok = await (await getOutbox()).cancelUnsent(entry.mutationId);
    notifyOutboxChanged();
    toast(
      ok
        ? "Change cancelled."
        : "This change may already have reached the server, so it can't be cancelled.",
      ok ? "success" : "error",
    );
  }

  return (
    <section
      aria-labelledby="pending-heading"
      className="border-warning/40 bg-warning-soft/40 rounded-2xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pending-heading" className="text-ink text-sm font-semibold">
          On this device · not yet synced ({entries.length})
        </h2>
        <Link href="/money/sync" className="text-accent text-sm font-medium hover:underline">
          Sync details
        </Link>
      </div>
      <p className="text-ink-muted mt-1 text-xs">
        These are saved locally and are not part of your confirmed balances until they sync.
      </p>
      <ul className="divide-line/70 mt-3 divide-y">
        {entries.map((e) => {
          const p =
            e.operation === "delete" ? (e.snapshot as TransactionPayload | undefined) : e.payload;
          const status = STATUS[e.status];
          const editable = Outbox.neverSent(e) && e.operation !== "delete";
          return (
            <li
              key={e.mutationId}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <Badge>{OP_LABEL[e.operation]}</Badge>
                  <span className="text-ink truncate text-sm font-medium">
                    {p?.description ||
                      categoryName(p?.category_id) ||
                      (p?.kind === "transfer" ? "Transfer" : "Transaction")}
                  </span>
                </div>
                <p className="text-ink-muted mt-0.5 text-xs">
                  {p?.occurred_on} · {accountName(p?.account_id)}
                  {p?.kind === "transfer" ? ` → ${accountName(p.transfer_account_id)}` : ""}
                  {e.lastError ? ` · ${e.lastError.message}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {p ? (
                  <span className="type-figure text-sm">
                    {p.kind === "income" ? "+" : p.kind === "expense" ? "−" : ""}
                    {formatMinor(p.amount_minor, p.currency_code, locale)}
                  </span>
                ) : null}
                {editable ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel(e)}>
                      Cancel
                    </Button>
                  </>
                ) : e.status === "failed" ? (
                  <Link
                    href="/money/sync"
                    className="text-danger text-sm font-medium hover:underline"
                  >
                    Review
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit unsynced transaction"
        className="max-w-xl"
      >
        {editing && isCurrencyCode(editing.payload.currency_code) ? (
          <TransactionForm
            userId={userId}
            accounts={accounts}
            categories={categories}
            decimal={decimal}
            today={today}
            server={(editing.snapshot as never) ?? null}
            initial={{
              recordId: editing.recordId,
              kind: editing.payload.kind,
              accountId: editing.payload.account_id,
              transferAccountId: editing.payload.transfer_account_id,
              amountInput: minorToInput(
                editing.payload.amount_minor,
                editing.payload.currency_code,
                decimal,
              ),
              categoryId: editing.payload.category_id,
              description: editing.payload.description ?? "",
              merchant: editing.payload.merchant ?? "",
              notes: editing.payload.notes ?? "",
              occurredOn: editing.payload.occurred_on,
            }}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
