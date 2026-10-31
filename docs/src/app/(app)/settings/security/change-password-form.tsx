"use client";

import { useActionState, useEffect, useRef } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/schemas";
import { changePasswordAction } from "../actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useFormToast(state);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  return (
    <Card>
      <form ref={formRef} action={action} noValidate>
        <CardHeader
          title="Change password"
          description="We'll check your current password first, then sign out your other devices."
        />
        <CardBody className="flex flex-col gap-5">
          {state.status === "error" ? <FormMessage state={state} /> : null}
          <Field
            id="currentPassword"
            label="Current password"
            error={state.fieldErrors?.currentPassword}
          >
            {(a11y) => <PasswordInput {...a11y} autoComplete="current-password" required />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="password"
              label="New password"
              hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
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
          </div>
        </CardBody>
        <CardFooter>
          <SubmitButton pendingLabel="Checking…">Change password</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
