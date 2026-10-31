"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState, type FormState } from "@/lib/forms";

/** Client wrapper for a finance Server Action form: inline errors, toast and onSuccess. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  onSuccess,
  onCancel,
  children,
  className = "flex flex-col gap-5",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  onSuccess?: () => void;
  onCancel?: () => void;
  children: (state: FormState) => ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  useFormToast(state);
  const last = useRef(state);
  useEffect(() => {
    if (state !== last.current && state.status === "success") onSuccess?.();
    last.current = state;
  }, [state, onSuccess]);
  return (
    <form action={formAction} className={className} noValidate>
      {state.status === "error" && state.message ? <FormMessage state={state} /> : null}
      {children(state)}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-muted hover:bg-surface-muted hover:text-ink h-10 rounded-xl px-4 text-sm font-medium"
          >
            Cancel
          </button>
        ) : null}
        <SubmitButton variant={variant} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
