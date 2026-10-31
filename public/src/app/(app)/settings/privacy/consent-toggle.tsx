"use client";

import { useActionState } from "react";
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
}: {
  category: ConsentCategory;
  granted: boolean;
  available: boolean;
  title: string;
}) {
  const [state, action] = useActionState(setConsentAction, initialFormState);
  useFormToast(state);
  // Withdrawing is always possible; granting only when the feature is available.
  const canChange = granted || available;
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="granted" value={granted ? "false" : "true"} />
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
