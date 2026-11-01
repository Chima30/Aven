"use client";

import { useActionState, useId } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";
import type { ConsentCategory } from "@/lib/supabase/database.types";
import { setConsentAction } from "../actions";

export function ConsentToggle({
  category,
  granted,
  available,
  title,
  disclosures,
}: {
  category: ConsentCategory;
  granted: boolean;
  available: boolean;
  title: string;
  /** Facts the user must acknowledge before granting (e.g. Walrus Memory limits). */
  disclosures?: readonly string[];
}) {
  const [state, action] = useActionState(setConsentAction, initialFormState);
  useFormToast(state);
  const ackId = useId();
  // Withdrawing is always possible; granting only when the feature is available.
  const canChange = granted || available;
  const needsAck = !granted && available && disclosures && disclosures.length > 0;
  return (
    <form action={action} className="flex flex-col items-end gap-2 sm:max-w-sm">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="granted" value={granted ? "false" : "true"} />
      {needsAck ? (
        <div className="border-line bg-surface-muted/50 w-full rounded-lg border p-3 text-left">
          <p className="text-ink text-xs font-semibold">Before you allow this</p>
          <ul className="text-ink-muted mt-2 list-disc space-y-1 pl-4 text-xs">
            {disclosures.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <label htmlFor={ackId} className="text-ink mt-3 flex items-start gap-2 text-xs">
            <input
              id={ackId}
              type="checkbox"
              name="acknowledged"
              value="yes"
              required
              className="mt-0.5"
            />
            <span>I understand, including that memories can&apos;t be deleted from Walrus.</span>
          </label>
        </div>
      ) : null}
      <SubmitButton
        size="sm"
        variant={granted ? "secondary" : "primary"}
        disabled={!canChange}
        aria-label={`${granted ? "Withdraw" : "Grant"}: ${title}`}
        pendingLabel="Saving…"
      >
        {granted ? "Withdraw" : available ? "Allow" : "Locked"}
      </SubmitButton>
      {state.status === "error" ? <p className="text-danger text-xs">{state.message}</p> : null}
    </form>
  );
}
