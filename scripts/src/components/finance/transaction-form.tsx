"use client";

import { useId, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { AmountError, parsePositiveAmount } from "@/lib/finance/amount-input";
import { QueueBusyError, queueCreate, queueUpdate } from "@/lib/finance/queue";
import { transactionPayloadSchema, type TransactionPayload } from "@/lib/finance/schemas";
import { isCurrencyCode } from "@/lib/money/currencies";
import type { TransactionKind, TransactionRow } from "@/lib/supabase/database.types";

export interface TxAccountOption {
  id: string;
  name: string;
  currency: string;
  archived: boolean;
}
export interface TxCategoryOption {
  id: string;
  kind: "income" | "expense";
  name: string;
  archived: boolean;
}

export interface TransactionFormInitial {
  recordId: string;
  kind: TransactionKind;
  accountId: string;
  transferAccountId: string | null;
  amountInput: string;
  categoryId: string | null;
  description: string;
  merchant: string;
  notes: string;
  occurredOn: string;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const KINDS: Array<{ value: TransactionKind; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

/**
 * Quick transaction entry. Saves to this device first (IndexedDB outbox),
 * then syncs to the server immediately if online — the same path either way.
 */
export function TransactionForm({
  userId,
  accounts,
  categories,
  decimal,
  today,
  initial,
  server,
  defaultAccountId,
  onDone,
}: {
  userId: string;
  accounts: TxAccountOption[];
  categories: TxCategoryOption[];
  decimal: "." | ",";
  today: string;
  /** Present when editing. */
  initial?: TransactionFormInitial;
  /** The synced server copy when editing a synced transaction; null for device-only ones. */
  server?: Pick<
    TransactionRow,
    | "id"
    | "version"
    | "kind"
    | "account_id"
    | "transfer_account_id"
    | "amount_minor"
    | "currency_code"
  > | null;
  defaultAccountId?: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const uid = useId();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const editing = Boolean(initial);

  // Archived accounts can't receive new transactions, unless the edited transaction already uses them.
  const usable = accounts.filter(
    (a) => !a.archived || a.id === initial?.accountId || a.id === initial?.transferAccountId,
  );
  const firstAccount = usable.find((a) => a.id === defaultAccountId) ?? usable[0];

  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? "expense");
  const [accountId, setAccountId] = useState(initial?.accountId ?? firstAccount?.id ?? "");
  const [transferId, setTransferId] = useState(initial?.transferAccountId ?? "");
  const [amount, setAmount] = useState(initial?.amountInput ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [moreOpen, setMoreOpen] = useState(Boolean(initial?.merchant || initial?.notes));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const account = usable.find((a) => a.id === accountId);
  const currency = account?.currency ?? "";
  const destinations = usable.filter(
    (a) => a.id !== accountId && a.currency === currency && !a.archived,
  );
  const kindCategories = useMemo(
    () =>
      kind === "transfer"
        ? []
        : categories.filter(
            (c) => c.kind === kind && (!c.archived || c.id === initial?.categoryId),
          ),
    [categories, kind, initial?.categoryId],
  );

  if (usable.length === 0) {
    return (
      <Alert tone="info" title="Add an account first">
        Transactions are recorded against an account, such as cash, a bank account or a card.
      </Alert>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (!account || !isCurrencyCode(currency)) {
      setErrors({ account_id: "Choose an account." });
      return;
    }
    let minor: bigint;
    try {
      minor = parsePositiveAmount(amount, currency, decimal).amountMinor;
    } catch (error) {
      setErrors({ amount: error instanceof AmountError ? error.message : "Enter a valid amount." });
      return;
    }
    const parsed = transactionPayloadSchema.safeParse({
      kind,
      account_id: accountId,
      transfer_account_id: kind === "transfer" ? transferId || null : null,
      amount_minor: minor.toString(),
      currency_code: currency,
      category_id: kind === "transfer" ? null : categoryId || null,
      description,
      merchant,
      notes,
      occurred_on: occurredOn,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      setErrors(next);
      return;
    }
    const payload: TransactionPayload = parsed.data;
    setSaving(true);
    try {
      if (initial) {
        await queueUpdate(userId, initial.recordId, payload, server ?? null);
      } else {
        await queueCreate(userId, payload);
      }
      toast(
        navigator.onLine
          ? editing
            ? "Change saved. Syncing…"
            : "Transaction saved. Syncing…"
          : "Saved on this device. It will sync when you're back online.",
        "success",
      );
      if (!editing) {
        // Keep type, account and date for fast consecutive entries.
        setAmount("");
        setDescription("");
        setMerchant("");
        setNotes("");
      }
      onDone?.();
    } catch (error) {
      setFormError(
        error instanceof QueueBusyError
          ? error.message
          : "This device couldn't save the transaction. Check that your browser allows site storage.",
      );
    } finally {
      setSaving(false);
    }
  }

  const id = (name: string) => `${uid}-${name}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {!online ? (
        <Alert tone="warning" title="You're offline">
          This will be saved on this device and synced automatically when you reconnect.
        </Alert>
      ) : null}
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <fieldset>
        <legend className="type-label text-ink mb-2">Type</legend>
        <div className="bg-surface-muted grid grid-cols-3 gap-1 rounded-xl p-1">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-colors",
                kind === k.value
                  ? "bg-surface text-ink ring-line shadow-sm ring-1"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={`${uid}-kind`}
                value={k.value}
                checked={kind === k.value}
                onChange={() => {
                  setKind(k.value);
                  setCategoryId("");
                }}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id={id("amount")}
        label={`Amount${currency ? ` (${currency})` : ""}`}
        error={errors.amount ?? errors.amount_minor}
      >
        {(a11y) => (
          <Input
            {...a11y}
            inputMode="decimal"
            autoComplete="off"
            placeholder={decimal === "," ? "0,00" : "0.00"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="type-figure h-14 text-2xl"
            autoFocus={!editing}
            required
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={id("account")}
          label={kind === "transfer" ? "From account" : "Account"}
          error={errors.account_id}
        >
          {(a11y) => (
            <Select
              {...a11y}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setTransferId("");
              }}
            >
              {usable.map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={a.archived && a.id !== initial?.accountId}
                >
                  {a.name} · {a.currency}
                  {a.archived ? " (archived)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {kind === "transfer" ? (
          <Field
            id={id("to")}
            label="To account"
            hint={
              destinations.length === 0
                ? `Transfers need another ${currency} account.`
                : "Only accounts in the same currency."
            }
            error={errors.transfer_account_id}
          >
            {(a11y) => (
              <Select {...a11y} value={transferId} onChange={(e) => setTransferId(e.target.value)}>
                <option value="">Choose…</option>
                {destinations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field id={id("category")} label="Category" error={errors.category_id}>
            {(a11y) => (
              <Select {...a11y} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field id={id("date")} label="Date" error={errors.occurred_on}>
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              required
            />
          )}
        </Field>

        <Field id={id("description")} label="Description" error={errors.description}>
          {(a11y) => (
            <Input
              {...a11y}
              maxLength={200}
              placeholder={
                kind === "income"
                  ? "e.g. October salary"
                  : kind === "transfer"
                    ? "e.g. Move to savings"
                    : "e.g. Groceries"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className="text-accent text-sm font-medium hover:underline"
        >
          {moreOpen ? "Hide extra details" : "Add merchant or notes"}
        </button>
        {moreOpen ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field
              id={id("merchant")}
              label={kind === "income" ? "Payer" : "Merchant or recipient"}
              error={errors.merchant}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  maxLength={120}
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
              )}
            </Field>
            <Field id={id("notes")} label="Notes" error={errors.notes}>
              {(a11y) => (
                <Input
                  {...a11y}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onDone ? (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving}>
          {editing ? "Save changes" : "Save transaction"}
        </Button>
      </div>
    </form>
  );
}
