"use client";

import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { GOAL_STATUS_LABEL } from "@/lib/finance/constants";
import {
  addGoalEntryAction,
  createGoalAction,
  deleteGoalEntryAction,
  updateGoalAction,
} from "../actions";

export function NewGoalButton({
  currencies,
  defaultCurrency,
  today,
  defaultOpen,
}: {
  currencies: Array<{ code: string; name: string }>;
  defaultCurrency: string;
  today: string;
  defaultOpen?: boolean;
}) {
  return (
    <FormDialog
      label="Create goal"
      title="New savings goal"
      description="Goals track progress. Recording a contribution doesn't move money or change any account balance."
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <ActionForm action={createGoalAction} submitLabel="Create goal" onCancel={close}>
          {(state) => (
            <>
              <input type="hidden" name="today" value={today} />
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    maxLength={80}
                    placeholder="e.g. Emergency fund, New laptop"
                    required
                  />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="currency_code" label="Currency" error={state.fieldErrors?.currency_code}>
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
                <Field
                  id="target"
                  label="Target amount"
                  error={state.fieldErrors?.target ?? state.fieldErrors?.target_minor}
                >
                  {(a11y) => (
                    <Input {...a11y} inputMode="decimal" className="type-figure" required />
                  )}
                </Field>
                <Field
                  id="starting"
                  label="Already saved (optional)"
                  error={state.fieldErrors?.starting}
                >
                  {(a11y) => <Input {...a11y} inputMode="decimal" className="type-figure" />}
                </Field>
                <Field
                  id="target_date"
                  label="Target date (optional)"
                  error={state.fieldErrors?.target_date}
                >
                  {(a11y) => <Input {...a11y} type="date" min={today} />}
                </Field>
              </div>
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

export function EditGoalButton({
  goal,
  targetInput,
}: {
  goal: {
    id: string;
    name: string;
    currency: string;
    version: number;
    targetDate: string | null;
    description: string | null;
    status: string;
  };
  targetInput: string;
}) {
  return (
    <FormDialog label="Edit" variant="secondary" title="Edit goal">
      {(close) => (
        <ActionForm
          action={updateGoalAction}
          submitLabel="Save changes"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <>
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="version" value={goal.version} />
              <input type="hidden" name="currency_code" value={goal.currency} />
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => <Input {...a11y} defaultValue={goal.name} maxLength={80} />}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="target"
                  label={`Target (${goal.currency})`}
                  error={state.fieldErrors?.target}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="decimal"
                      defaultValue={targetInput}
                      className="type-figure"
                    />
                  )}
                </Field>
                <Field id="target_date" label="Target date" error={state.fieldErrors?.target_date}>
                  {(a11y) => <Input {...a11y} type="date" defaultValue={goal.targetDate ?? ""} />}
                </Field>
                <Field id="status" label="Status" error={state.fieldErrors?.status}>
                  {(a11y) => (
                    <Select {...a11y} defaultValue={goal.status}>
                      {Object.entries(GOAL_STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Field id="description" label="Description">
                {(a11y) => (
                  <Input {...a11y} maxLength={500} defaultValue={goal.description ?? ""} />
                )}
              </Field>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function GoalEntryButton({
  goalId,
  currency,
  today,
  kind,
}: {
  goalId: string;
  currency: string;
  today: string;
  kind: "contribution" | "withdrawal";
}) {
  const contribution = kind === "contribution";
  return (
    <FormDialog
      label={contribution ? "Record contribution" : "Record withdrawal"}
      variant={contribution ? "primary" : "secondary"}
      title={contribution ? "Record a contribution" : "Record a withdrawal"}
      description="This is a tracking record. It doesn't move money between accounts or change any account balance."
    >
      {(close) => (
        <ActionForm
          action={addGoalEntryAction}
          submitLabel="Save"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <>
              <input type="hidden" name="goal_id" value={goalId} />
              <input type="hidden" name="currency_code" value={currency} />
              <input type="hidden" name="kind" value={kind} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="amount"
                  label={`Amount (${currency})`}
                  error={state.fieldErrors?.amount ?? state.fieldErrors?.amount_minor}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="decimal"
                      className="type-figure"
                      required
                      autoFocus
                    />
                  )}
                </Field>
                <Field id="occurred_on" label="Date" error={state.fieldErrors?.occurred_on}>
                  {(a11y) => <Input {...a11y} type="date" defaultValue={today} required />}
                </Field>
              </div>
              <Field id="note" label="Note (optional)" error={state.fieldErrors?.note}>
                {(a11y) => <Input {...a11y} maxLength={200} />}
              </Field>
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function DeleteGoalEntryButton({ id, goalId }: { id: string; goalId: string }) {
  return (
    <FormDialog
      label="Remove"
      variant="ghost"
      size="sm"
      title="Remove this entry?"
      description="The goal's saved amount will be recalculated."
    >
      {(close) => (
        <ActionForm
          action={deleteGoalEntryAction}
          submitLabel="Remove entry"
          variant="danger"
          onSuccess={close}
          onCancel={close}
        >
          {() => (
            <>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="goal_id" value={goalId} />
            </>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}
