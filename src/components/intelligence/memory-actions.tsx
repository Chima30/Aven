"use client";

import { useActionState, useState } from "react";
import {
  forgetAllMemoriesAction,
  correctMemoryAction,
  forgetMemoryAction,
  loadWalrusContentsAction,
  refreshMemoryAction,
  type WalrusContentsState,
} from "@/app/(app)/intelligence/actions";
import { FormMessage } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";

export function ForgetMemoryButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(forgetMemoryAction, initialFormState);
  useFormToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        size="sm"
        variant="ghost"
        aria-label={`Forget: ${label}`}
        pendingLabel="Forgetting…"
      >
        Forget
      </SubmitButton>
    </form>
  );
}

/** Replace an inaccurate memory with the user's own correction. */
export function CorrectMemoryButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(correctMemoryAction, initialFormState);
  useFormToast(state);
  if (!open || state.status === "success") {
    return (
      <button
        type="button"
        className="text-ink-muted hover:text-ink px-2 text-sm underline"
        aria-label={`Correct: ${label}`}
        onClick={() => setOpen(true)}
      >
        Correct
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:w-72">
      <input type="hidden" name="id" value={id} />
      <Field
        id={`statement-${id}`}
        label="What's right instead?"
        error={state.fieldErrors?.statement}
      >
        {(a) => (
          <Input
            {...a}
            name="statement"
            maxLength={260}
            required
            autoFocus
            placeholder="e.g. I usually exercise in the evening"
          />
        )}
      </Field>
      <p className="text-ink-subtle text-xs">
        The original is forgotten; your correction is saved instead. Don&apos;t include passwords or
        account numbers.
      </p>
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save correction
        </SubmitButton>
        <button type="button" className="text-ink-muted text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RefreshMemoryButton() {
  const [state, action] = useActionState(refreshMemoryAction, initialFormState);
  useFormToast(state);
  return (
    <form action={action}>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Checking Walrus…">
        Check pending writes
      </SubmitButton>
    </form>
  );
}

export function ForgetAllForm() {
  const [state, action] = useActionState(forgetAllMemoriesAction, initialFormState);
  useFormToast(state);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.status !== "idle" && state.message ? <FormMessage state={state} /> : null}
      <Field
        id="confirmation"
        label="Type FORGET to stop AVEN using every memory"
        error={state.fieldErrors?.confirmation}
      >
        {(a11y) => <Input {...a11y} autoComplete="off" className="max-w-xs" />}
      </Field>
      <div>
        <SubmitButton variant="danger" size="sm" pendingLabel="Forgetting…">
          Forget all memories
        </SubmitButton>
      </div>
    </form>
  );
}

const initialContents: WalrusContentsState = { status: "idle" };

export function WalrusContents({ labels }: { labels: Record<string, string> }) {
  const [state, action] = useActionState(loadWalrusContentsAction, initialContents);
  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Reading from Walrus…">
          Read memories back from Walrus
        </SubmitButton>
      </form>
      {state.status === "error" ? (
        <FormMessage state={{ status: "error", message: state.message }} />
      ) : null}
      {state.status === "success" ? (
        state.items.length === 0 ? (
          <p className="text-ink-muted text-sm">
            Walrus returned no AVEN memories for your namespace yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="walrus-contents">
            {state.items.map((item) => (
              <li key={item.blobId} className="bg-surface-muted/60 rounded-lg px-3 py-2 text-sm">
                <p className="text-ink">{item.text}</p>
                <p className="text-ink-subtle mt-0.5 font-mono text-[0.6875rem] break-all">
                  {labels[item.blobId] ? `${labels[item.blobId]} · ` : ""}blob {item.blobId}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
