"use client";

import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { ACCOUNT_TYPES } from "@/lib/finance/constants";
import { createAccountAction, setAccountArchivedAction, updateAccountAction } from "../actions";

export function NewAccountButton({
  currencies,
  defaultCurrency,
  defaultOpen,
}: {
  currencies: Array<{ code: string; name: string }>;
  defaultCurrency: string;
  defaultOpen?: boolean;
}) {
  return (
    <FormDialog
      label="Add account"
      title="New account"
      description="Enter the balance the account has today. AVEN never connects to banks or moves money."
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <ActionForm action={createAccountAction} submitLabel="Create account" onCancel={close}>
          {(state) => (
            <>
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    maxLength={80}
                    placeholder="e.g. GTBank current, Cash wallet"
                    required
                  />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="account_type" label="Type" error={state.fieldErrors?.account_type}>
                  {(a11y) => (
                    <Select {...a11y} defaultValue="bank">
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  id="currency_code"
                  label="Currency"
                  hint="Can't be changed later."
                  error={state.fieldErrors?.currency_code}
                >
                  {(a11y) => (
                    <Select {...a11y} defaultValue={defaultCurrency}>
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Field
                id="opening_balance"
                label="Current balance"
                hint="What's in the account today. Use a minus sign for money owed, e.g. on a credit card."
                error={
                  state.fieldErrors?.opening_balance ?? state.fieldErrors?.opening_balance_minor
                }
              >
                {(a11y) => (
                  <Input {...a11y} inputMode="decimal" placeholder="0.00" className="type-figure" />
                )}
              </Field>
              <Field
                id="description"
                label="Description (optional)"
                error={state.fieldErrors?.description}
              >
                {(a11y) => <Input {...a11y} maxLength={500} />}
              </Field>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function EditAccountButton({
  account,
  openingInput,
}: {
  account: {
    id: string;
    name: string;
    type: string;
    currency: string;
    version: number;
    description: string | null;
  };
  openingInput: string;
}) {
  return (
    <FormDialog label="Edit" variant="secondary" title="Edit account">
      {(close) => (
        <ActionForm
          action={updateAccountAction}
          submitLabel="Save changes"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="version" value={account.version} />
              <input type="hidden" name="currency_code" value={account.currency} />
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => <Input {...a11y} defaultValue={account.name} maxLength={80} required />}
              </Field>
              <Field id="account_type" label="Type">
                {(a11y) => (
                  <Select {...a11y} defaultValue={account.type}>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                id="opening_balance"
                label={`Opening balance (${account.currency})`}
                hint="The balance before your first recorded transaction. Changing it shifts the current balance by the same amount."
                error={state.fieldErrors?.opening_balance}
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    inputMode="decimal"
                    defaultValue={openingInput}
                    className="type-figure"
                  />
                )}
              </Field>
              <Field id="description" label="Description (optional)">
                {(a11y) => (
                  <Input {...a11y} maxLength={500} defaultValue={account.description ?? ""} />
                )}
              </Field>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function ArchiveAccountButton({
  id,
  version,
  archived,
}: {
  id: string;
  version: number;
  archived: boolean;
}) {
  return (
    <FormDialog
      label={archived ? "Restore" : "Archive"}
      variant="ghost"
      title={archived ? "Restore this account?" : "Archive this account?"}
      description={
        archived
          ? "It will appear in lists again and accept new transactions."
          : "It's hidden from totals and can't receive new transactions. Its history stays, and you can restore it any time."
      }
    >
      {(close) => (
        <ActionForm
          action={setAccountArchivedAction}
          submitLabel={archived ? "Restore account" : "Archive account"}
          variant={archived ? "primary" : "danger"}
          onSuccess={close}
          onCancel={close}
        >
          {() => (
            <>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="archived" value={archived ? "false" : "true"} />
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}
