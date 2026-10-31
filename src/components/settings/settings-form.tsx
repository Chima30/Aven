"use client";

import { useActionState, type ReactNode } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState, type FormState } from "@/lib/forms";

/** A settings card wrapping one Server Action form, with toast + inline errors. */
export function SettingsForm({
  title,
  description,
  action,
  submitLabel = "Save changes",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel?: string;
  children: (state: FormState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  useFormToast(state);
  return (
    <Card>
      <form action={formAction} noValidate>
        <CardHeader title={title} description={description} />
        <CardBody className="flex flex-col gap-5">
          {state.status === "error" ? <FormMessage state={state} /> : null}
          {children(state)}
        </CardBody>
        <CardFooter>
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
