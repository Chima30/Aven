"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/schemas";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <Field
        id="password"
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, mixing letters with numbers or symbols.`}
        error={state.fieldErrors?.password}
      >
        {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" required />}
      </Field>
      <Field
        id="confirmPassword"
        label="Confirm new password"
        error={state.fieldErrors?.confirmPassword}
      >
        {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" required />}
      </Field>
      <SubmitButton size="lg" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
