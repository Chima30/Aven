"use client";

import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { createBudgetAction, setBudgetArchivedAction, updateBudgetAction } from "../actions";

export function NewBudgetButton({
  categories,
  currencies,
  defaultCurrency,
  thisMonth,
  defaultOpen,
}: {
  categories: Array<{ id: string; name: string }>;
  currencies: string[];
  defaultCurrency: string;
  thisMonth: string;
  defaultOpen?: boolean;
}) {
  return (
    <FormDialog
      label="Create budget"
      title="New monthly budget"
      description="Only expenses count towards a budget — never income or transfers between your accounts."
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <ActionForm action={createBudgetAction} submitLabel="Create budget" onCancel={close}>
          {(state) => (
            <>
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => (
                  <Input {...a11y} maxLength={80} placeholder="e.g. Food, Everything" required />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="category_id" label="Tracks" error={state.fieldErrors?.category_id}>
                  {(a11y) => (
                    <Select {...a11y} defaultValue="">
                      <option value="">All spending</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  id="currency_code"
                  label="Currency"
                  hint="Only expenses in this currency count."
                  error={state.fieldErrors?.currency_code}
                >
                  {(a11y) => (
                    <Select
                      {...a11y}
                      defaultValue={
                        currencies.includes(defaultCurrency) ? defaultCurrency : currencies[0]
                      }
                    >
                      {currencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  id="limit"
                  label="Monthly limit"
                  error={state.fieldErrors?.limit ?? state.fieldErrors?.limit_minor}
                >
                  {(a11y) => (
                    <Input {...a11y} inputMode="decimal" className="type-figure" required />
                  )}
                </Field>
                <Field
                  id="alert_threshold_pct"
                  label="Warn me at (%)"
                  error={state.fieldErrors?.alert_threshold_pct}
                >
                  {(a11y) => <Input {...a11y} type="number" min={1} max={100} defaultValue={80} />}
                </Field>
                <Field
                  id="starts_month"
                  label="Starting month"
                  error={state.fieldErrors?.starts_on}
                >
                  {(a11y) => <Input {...a11y} type="month" defaultValue={thisMonth} required />}
                </Field>
              </div>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function EditBudgetButton({
  budget,
  limitInput,
}: {
  budget: { id: string; name: string; currency: string; version: number; threshold: number };
  limitInput: string;
}) {
  return (
    <FormDialog label="Edit" variant="secondary" title="Edit budget">
      {(close) => (
        <ActionForm
          action={updateBudgetAction}
          submitLabel="Save changes"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <>
              <input type="hidden" name="id" value={budget.id} />
              <input type="hidden" name="version" value={budget.version} />
              <input type="hidden" name="currency_code" value={budget.currency} />
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => <Input {...a11y} defaultValue={budget.name} maxLength={80} />}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="limit"
                  label={`Monthly limit (${budget.currency})`}
                  error={state.fieldErrors?.limit}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="decimal"
                      defaultValue={limitInput}
                      className="type-figure"
                    />
                  )}
                </Field>
                <Field
                  id="alert_threshold_pct"
                  label="Warn me at (%)"
                  error={state.fieldErrors?.alert_threshold_pct}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={budget.threshold}
                    />
                  )}
                </Field>
              </div>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function ArchiveBudgetButton({
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
      title={archived ? "Restore this budget?" : "Archive this budget?"}
      description={
        archived ? "It will track spending again." : "It stops tracking. Its history is kept."
      }
    >
      {(close) => (
        <ActionForm
          action={setBudgetArchivedAction}
          submitLabel={archived ? "Restore" : "Archive"}
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
