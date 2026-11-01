"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState, type FormState } from "@/lib/forms";

/** A one-button Server Action form (hidden fields + submit), with a toast for the result. */
export function InlineAction({
  action,
  fields,
  label,
  pendingLabel,
  variant = "ghost",
  size = "sm",
  ariaLabel,
  confirm,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string | number | null | undefined>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  ariaLabel?: string;
  /** Ask before submitting (native confirm is avoided; this is a second click). */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  useFormToast(state);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !(e.currentTarget.dataset.confirmed === "yes")) {
          e.preventDefault();
          e.currentTarget.dataset.confirmed = "yes";
          const btn = e.currentTarget.querySelector("button");
          if (btn) btn.textContent = confirm;
        }
      }}
    >
      {Object.entries(fields).map(([k, v]) =>
        v === null || v === undefined ? null : (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ),
      )}
      <SubmitButton
        size={size}
        variant={variant}
        pendingLabel={pendingLabel}
        aria-label={ariaLabel}
      >
        {label}
      </SubmitButton>
    </form>
  );
}
