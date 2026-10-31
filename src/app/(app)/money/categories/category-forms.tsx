"use client";

import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { createCategoryAction, updateCategoryAction } from "../actions";

export function NewCategoryButton() {
  return (
    <FormDialog label="Add category" title="New category">
      {(close) => (
        <ActionForm
          action={createCategoryAction}
          submitLabel="Add category"
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
              <Field id="kind" label="Type" error={state.fieldErrors?.kind}>
                {(a11y) => (
                  <Select {...a11y} defaultValue="expense">
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </Select>
                )}
              </Field>
              <Field id="name" label="Name" error={state.fieldErrors?.name}>
                {(a11y) => <Input {...a11y} maxLength={50} required />}
              </Field>
            </div>
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

export function CategoryRowActions({
  id,
  name,
  version,
  archived,
}: {
  id: string;
  name: string;
  version: number;
  archived: boolean;
}) {
  return (
    <div className="flex gap-1">
      {!archived ? (
        <FormDialog label="Rename" variant="ghost" size="sm" title="Rename category">
          {(close) => (
            <ActionForm
              action={updateCategoryAction}
              submitLabel="Save"
              onSuccess={close}
              onCancel={close}
            >
              {(state) => (
                <>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="version" value={version} />
                  <Field id="name" label="Name" error={state.fieldErrors?.name}>
                    {(a11y) => <Input {...a11y} defaultValue={name} maxLength={50} required />}
                  </Field>
                </>
              )}
            </ActionForm>
          )}
        </FormDialog>
      ) : null}
      <FormDialog
        label={archived ? "Restore" : "Archive"}
        variant="ghost"
        size="sm"
        title={archived ? `Restore “${name}”?` : `Archive “${name}”?`}
        description={
          archived
            ? "It will be available for new transactions again."
            : "It won't be offered for new transactions. Past transactions keep it."
        }
      >
        {(close) => (
          <ActionForm
            action={updateCategoryAction}
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
    </div>
  );
}
