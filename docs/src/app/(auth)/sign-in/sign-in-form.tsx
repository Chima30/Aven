"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { resendConfirmationAction, signInAction } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initialFormState);
  const [resendState, resend] = useActionState(resendConfirmationAction, initialFormState);
  const email = state.values?.email ?? "";

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="email" label="Email" error={state.fieldErrors?.email}>
          {(a11y) => (
            <Input
              {...a11y}
              type="email"
              autoComplete="email"
              inputMode="email"
              defaultValue={email}
              required
            />
          )}
        </Field>
        <Field id="password" label="Password" error={state.fieldErrors?.password}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="current-password" required />}
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-accent text-sm font-medium hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton size="lg" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      {state.values?.unconfirmed ? (
        <form action={resend} className="border-line flex flex-col gap-3 border-t pt-5">
          <input type="hidden" name="email" value={email} />
          <FormMessage state={resendState} />
          <SubmitButton variant="secondary" pendingLabel="Sending…">
            Resend confirmation email
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
