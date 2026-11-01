"use client";

import { useActionState } from "react";
import {
  addWalletAction,
  importChainTransactionAction,
  removeWalletAction,
} from "@/app/(app)/money/wallets/actions";
import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { FormMessage } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";

export function AddWalletForm() {
  const [state, action] = useActionState(addWalletAction, initialFormState);
  useFormToast(state);
  const v = state.status === "error" ? state.values : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <FormMessage state={state} /> : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field
          id="address"
          label="Sui Mainnet address"
          hint="Public address only (0x…). Never enter a private key or recovery phrase."
          error={state.fieldErrors?.address}
        >
          {(a11y) => (
            <Input
              {...a11y}
              defaultValue={v?.address}
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              className="font-mono"
            />
          )}
        </Field>
        <Field id="label" label="Label (optional)" error={state.fieldErrors?.label}>
          {(a11y) => (
            <Input
              {...a11y}
              defaultValue={v?.label}
              maxLength={60}
              placeholder="e.g. Main wallet"
            />
          )}
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Adding…">Add wallet</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveWalletButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(removeWalletAction, initialFormState);
  useFormToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        size="sm"
        variant="ghost"
        aria-label={`Remove wallet ${label}`}
        pendingLabel="Removing…"
      >
        Remove
      </SubmitButton>
    </form>
  );
}

export interface ImportOption {
  id: string;
  name: string;
}

export function ImportTransactionDialog({
  walletId,
  digest,
  defaultDate,
  defaultKind,
  changeSummary,
  accounts,
  categories,
}: {
  walletId: string;
  digest: string;
  defaultDate: string;
  defaultKind: "income" | "expense";
  changeSummary: string;
  accounts: Array<ImportOption & { currency: string }>;
  categories: Array<ImportOption & { kind: "income" | "expense" }>;
}) {
  return (
    <FormDialog
      label="Record in AVEN"
      size="sm"
      variant="secondary"
      title="Record this Sui transaction in AVEN"
      description={`On-chain change: ${changeSummary}. AVEN has no price feed, so enter what it was worth in the account's currency.`}
    >
      {(close) => (
        <ActionForm
          action={importChainTransactionAction}
          submitLabel="Import transaction"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => {
            const v = state.status === "error" ? state.values : undefined;
            return (
              <>
                <input type="hidden" name="walletId" value={walletId} />
                <input type="hidden" name="digest" value={digest} />
                <p className="text-ink-subtle font-mono text-xs break-all">tx {digest}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="kind" label="Type">
                    {(a11y) => (
                      <Select {...a11y} defaultValue={v?.kind ?? defaultKind}>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </Select>
                    )}
                  </Field>
                  <Field id="occurredOn" label="Date">
                    {(a11y) => (
                      <Input
                        {...a11y}
                        type="date"
                        defaultValue={v?.occurredOn ?? defaultDate}
                        required
                      />
                    )}
                  </Field>
                  <Field id="accountId" label="AVEN account" error={state.fieldErrors?.accountId}>
                    {(a11y) => (
                      <Select {...a11y} defaultValue={v?.accountId ?? accounts[0]?.id} required>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field
                    id="amount"
                    label="Amount in that account's currency"
                    error={state.fieldErrors?.amount}
                  >
                    {(a11y) => (
                      <Input
                        {...a11y}
                        inputMode="decimal"
                        autoComplete="off"
                        defaultValue={v?.amount}
                        required
                      />
                    )}
                  </Field>
                  <Field id="categoryId" label="Category (optional)">
                    {(a11y) => (
                      <Select {...a11y} defaultValue={v?.categoryId ?? ""}>
                        <option value="">No category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.kind})
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field id="description" label="Description">
                    {(a11y) => (
                      <Input
                        {...a11y}
                        maxLength={200}
                        defaultValue={v?.description ?? "Sui Mainnet transaction"}
                      />
                    )}
                  </Field>
                </div>
                {v?.needsConfirm === "yes" ? (
                  <label className="text-ink flex items-start gap-2 text-sm">
                    <input type="checkbox" name="confirmDuplicate" value="yes" className="mt-1" />
                    <span>Import anyway — this is a different transaction.</span>
                  </label>
                ) : null}
              </>
            );
          }}
        </ActionForm>
      )}
    </FormDialog>
  );
}
