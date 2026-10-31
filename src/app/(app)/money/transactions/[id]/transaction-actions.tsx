"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import {
  TransactionForm,
  type TxAccountOption,
  type TxCategoryOption,
} from "@/components/finance/transaction-form";
import { minorToInput } from "@/lib/finance/amount-input";
import { QueueBusyError, queueDelete } from "@/lib/finance/queue";
import { isCurrencyCode } from "@/lib/money/currencies";
import type { TransactionRow } from "@/lib/supabase/database.types";

export function TransactionActions({
  userId,
  transaction,
  accounts,
  categories,
  decimal,
  today,
}: {
  userId: string;
  transaction: TransactionRow;
  accounts: TxAccountOption[];
  categories: TxCategoryOption[];
  decimal: "." | ",";
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = transaction;
  if (!isCurrencyCode(t.currency_code)) return null;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await queueDelete(userId, t.id, t);
      toast(
        navigator.onLine
          ? "Deleting…"
          : "Deletion saved on this device. It will sync when you're online.",
        "success",
      );
      setConfirming(false);
      router.push("/money/transactions");
    } catch (e) {
      setError(e instanceof QueueBusyError ? e.message : "This device couldn't save the deletion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          className="text-danger hover:text-danger"
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      </div>
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit transaction"
        className="max-w-xl"
      >
        {editing ? (
          <TransactionForm
            userId={userId}
            accounts={accounts}
            categories={categories}
            decimal={decimal}
            today={today}
            server={t}
            initial={{
              recordId: t.id,
              kind: t.kind,
              accountId: t.account_id,
              transferAccountId: t.transfer_account_id,
              amountInput: minorToInput(t.amount_minor, t.currency_code, decimal),
              categoryId: t.category_id,
              description: t.description ?? "",
              merchant: t.merchant ?? "",
              notes: t.notes ?? "",
              occurredOn: t.occurred_on,
            }}
            onDone={() => setEditing(false)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this transaction?"
        description="It will be removed from your history and balances. If it was changed on another device in the meantime, AVEN will ask you before deleting."
      >
        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button variant="danger" onClick={remove} loading={busy}>
            Delete transaction
          </Button>
        </div>
      </Dialog>
    </>
  );
}
