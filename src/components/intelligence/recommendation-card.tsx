"use client";

import { useActionState, useState } from "react";
import { respondToRecommendationAction } from "@/app/(app)/intelligence/actions";
import { Badge, FormMessage } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/forms";
import type { MemoryInfluence, RecommendationStatus } from "@/lib/supabase/database.types";

export interface RecommendationView {
  id: string;
  title: string;
  explanation: string;
  kindLabel: string;
  suggestedLabel: string | null;
  currency: string;
  memoryInfluence: MemoryInfluence[];
  status: RecommendationStatus;
  /** The user's own amount, when they changed it. */
  responseLabel: string | null;
  /** True once the decision is linked to a Walrus memory. */
  remembered: boolean;
}

const ANSWER: Record<Exclude<RecommendationStatus, "open">, string> = {
  accepted: "You accepted this",
  rejected: "You declined this",
  modified: "You changed the amount",
};

export function RecommendationCard({ rec }: { rec: RecommendationView }) {
  const [state, action] = useActionState(respondToRecommendationAction, initialFormState);
  useFormToast(state);
  const [modifying, setModifying] = useState(false);
  const done = state.status === "success" || rec.status !== "open";

  return (
    <li className="border-line bg-surface rounded-2xl border p-5" data-testid="recommendation">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{rec.kindLabel}</Badge>
        {rec.memoryInfluence.length > 0 ? <Badge tone="info">Shaped by your memory</Badge> : null}
      </div>
      <h3 className="text-ink mt-3 text-base font-semibold">{rec.title}</h3>
      <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">{rec.explanation}</p>

      {rec.memoryInfluence.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="text-accent cursor-pointer">
            Why this changed (from Walrus Memory)
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rec.memoryInfluence.map((m) => (
              <li
                key={`${m.blob_id}-${m.effect}`}
                className="bg-surface-muted/60 rounded-lg px-3 py-2"
              >
                <p className="text-ink">{m.effect}</p>
                <p className="text-ink-muted mt-0.5 text-xs">Memory: “{m.memory}”</p>
                <p className="text-ink-subtle mt-0.5 font-mono text-[0.6875rem] break-all">
                  blob {m.blob_id}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {done ? (
        <div className="mt-4 flex flex-col gap-2">
          {state.status === "success" ? <FormMessage state={state} /> : null}
          {rec.status !== "open" ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                tone={
                  rec.status === "accepted"
                    ? "success"
                    : rec.status === "rejected"
                      ? "neutral"
                      : "info"
                }
              >
                {ANSWER[rec.status]}
                {rec.status === "modified" && rec.responseLabel ? `: ${rec.responseLabel}` : ""}
              </Badge>
              {rec.remembered ? <Badge tone="accent">Saved to Walrus Memory</Badge> : null}
            </p>
          ) : null}
        </div>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={rec.id} />
          {state.status === "error" && state.message ? <FormMessage state={state} /> : null}
          {modifying ? (
            <Field
              id={`amount-${rec.id}`}
              label={`Your amount (${rec.currency})`}
              error={state.fieldErrors?.amount}
            >
              {(a11y) => (
                <Input {...a11y} name="amount" inputMode="decimal" autoComplete="off" required />
              )}
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {modifying ? (
              <>
                <SubmitButton size="sm" name="action" value="modified" pendingLabel="Saving…">
                  Save my amount
                </SubmitButton>
                <button
                  type="button"
                  className="text-ink-muted hover:text-ink h-8 px-3 text-sm"
                  onClick={() => setModifying(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <SubmitButton size="sm" name="action" value="accepted" pendingLabel="Saving…">
                  Accept
                </SubmitButton>
                {rec.suggestedLabel ? (
                  <button
                    type="button"
                    className="border-line-strong bg-surface text-ink hover:bg-surface-muted h-8 rounded-xl border px-3 text-sm font-medium"
                    onClick={() => setModifying(true)}
                  >
                    Change amount
                  </button>
                ) : null}
                <SubmitButton
                  size="sm"
                  variant="ghost"
                  name="action"
                  value="rejected"
                  pendingLabel="Saving…"
                >
                  Decline
                </SubmitButton>
              </>
            )}
          </div>
        </form>
      )}
    </li>
  );
}
