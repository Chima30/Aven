"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/schemas";
import { signUpAction } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <Field
        id="displayName"
        label="What should we call you?"
        error={state.fieldErrors?.displayName}
      >
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="given-name"
            maxLength={80}
            defaultValue={state.values?.displayName}
            required
          />
        )}
      </Field>
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        {(a11y) => (
          <Input
            {...a11y}
            type="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={state.values?.email}
            required
          />
        )}
      </Field>
      <Field
        id="password"
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, mixing letters with numbers or symbols.`}
        error={state.fieldErrors?.password}
      >
        {(a11y) => (
          <PasswordInput
            {...a11y}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <label className="text-ink-muted flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="border-line-strong mt-0.5 size-4 shrink-0 rounded accent-[var(--accent)]"
            aria-invalid={Boolean(state.fieldErrors?.acceptTerms)}
            required
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-accent font-medium hover:underline">
              terms
            </Link>{" "}
            and have read the{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-accent font-medium hover:underline"
            >
              privacy policy
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <p className="text-danger text-xs font-medium">{state.fieldErrors.acceptTerms}</p>
        ) : null}
      </div>
      <SubmitButton size="lg" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
