"use client";

import { useActionState, useState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/validation/schemas";
import { deleteAccountAction } from "../actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  // Local browser data is cleared on the next page, only AFTER the server confirms deletion,
  // so a mistyped password can never wipe unsynced offline changes.
  const [state, action] = useActionState(deleteAccountAction, initialFormState);

  return (
    <Card className="border-danger/30">
      <CardHeader
        title="Delete your account"
        description="Permanently delete your AVEN account and everything stored with it. This can't be undone."
      />
      <CardBody>
        <ul className="text-ink-muted list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Your profile, preferences, consent history, security log and all other AVEN records are
            deleted.
          </li>
          <li>Anything AVEN stored in this browser is cleared.</li>
          <li>
            We keep only an anonymous note that a deletion happened — no name, email or account id.
          </li>
          <li>
            Walrus Memory: the MemWal SDK can&apos;t delete from Walrus. Any encrypted memories stay
            there, but AVEN loses the link to them and will never read or use them again. The
            deletion note records how many there were — nothing else.
          </li>
          <li>
            Your saved Sui wallet addresses and import links are deleted. Nothing on Sui changes.
          </li>
          <li>Nothing has been sent to an AI provider.</li>
        </ul>
        <Button variant="danger" className="mt-6" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </CardBody>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account permanently?"
        description="Enter your password and type DELETE to confirm. We'll export nothing automatically — download your data first if you want a copy."
      >
        <form action={action} className="flex flex-col gap-4" noValidate>
          <FormMessage state={state} />
          <Field id="delete-password" label="Password" error={state.fieldErrors?.password}>
            {(a11y) => (
              <PasswordInput {...a11y} name="password" autoComplete="current-password" required />
            )}
          </Field>
          <Field
            id="delete-confirmation"
            label={
              <>
                Type <strong>{DELETE_CONFIRMATION_PHRASE}</strong> to confirm
              </>
            }
            error={state.fieldErrors?.confirmation}
          >
            {(a11y) => (
              <Input {...a11y} name="confirmation" autoComplete="off" spellCheck={false} required />
            )}
          </Field>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <SubmitButton variant="danger" pendingLabel="Deleting…">
              Delete permanently
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
