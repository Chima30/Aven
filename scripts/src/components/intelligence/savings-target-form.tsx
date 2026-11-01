"use client";

import { useActionState } from "react";
import { setSavingsTargetAction } from "@/app/(app)/intelligence/actions";
import { FormMessage } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";

export function SavingsTargetForm({ current }: { current: number | null }) {
  const [state, action] = useActionState(setSavingsTargetAction, initialFormState);
  useFormToast(state);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.status !== "idle" && state.message ? <FormMessage state={state} /> : null}
      <div className="flex items-end gap-3">
        <Field
          id="targetPct"
          label="Monthly savings target (% of income)"
          error={state.fieldErrors?.targetPct}
          className="w-56"
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="number"
              min={1}
              max={90}
              step={1}
              defaultValue={current ?? 10}
              required
            />
          )}
        </Field>
        <SubmitButton size="md" variant="secondary" pendingLabel="Saving…">
          Save to memory
        </SubmitButton>
      </div>
    </form>
  );
}
