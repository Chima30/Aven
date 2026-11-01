"use client";

import { savePlanningPreferencesAction, saveReviewAction } from "@/app/(app)/planning/actions";
import { ActionForm } from "@/components/finance/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { ReviewRow } from "@/lib/supabase/database.types";

export function ReviewForm({
  kind,
  periodStart,
  review,
}: {
  kind: "daily" | "weekly";
  periodStart: string;
  review: ReviewRow | null;
}) {
  const daily = kind === "daily";
  return (
    <ActionForm action={saveReviewAction} submitLabel={review ? "Update review" : "Save review"}>
      {(state) => {
        const v = state.values ?? {};
        return (
          <>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="period_start" value={periodStart} />
            {review ? (
              <>
                <input type="hidden" name="id" value={review.id} />
                <input type="hidden" name="version" value={review.version} />
              </>
            ) : null}
            <Field
              id="highlights"
              label={daily ? "What did I accomplish?" : "What went well this week?"}
            >
              {(a) => (
                <Textarea
                  {...a}
                  defaultValue={v.highlights ?? review?.highlights ?? ""}
                  maxLength={4000}
                />
              )}
            </Field>
            <Field id="missed" label={daily ? "What did I miss?" : "What didn't happen, and why?"}>
              {(a) => (
                <Textarea {...a} defaultValue={v.missed ?? review?.missed ?? ""} maxLength={4000} />
              )}
            </Field>
            <Field
              id="next_focus"
              label={daily ? "What needs attention tomorrow?" : "Priorities for next week"}
            >
              {(a) => (
                <Textarea
                  {...a}
                  defaultValue={v.next_focus ?? review?.next_focus ?? ""}
                  maxLength={4000}
                />
              )}
            </Field>
            <label className="text-ink-muted flex items-start gap-2 text-sm">
              <input type="checkbox" name="remember_focus" className="mt-1" />
              <span>
                Remember this focus in Walrus Memory, so AVEN can take it into account later. Only
                this answer is saved — not the rest of your review. Needs “Remember planning
                preferences” in Settings → Privacy.
              </span>
            </label>
            <Field
              id="notes"
              label={daily ? "Anything else (optional)" : "Personal reflections (optional)"}
            >
              {(a) => (
                <Textarea {...a} defaultValue={v.notes ?? review?.notes ?? ""} maxLength={8000} />
              )}
            </Field>
            <Field id="rating" label={daily ? "How was my day?" : "How was my week?"}>
              {(a) => (
                <Select
                  {...a}
                  defaultValue={v.rating ?? (review?.rating ? String(review.rating) : "")}
                  className="w-48"
                >
                  <option value="">Skip</option>
                  <option value="1">1 · Hard</option>
                  <option value="2">2 · Tough</option>
                  <option value="3">3 · Okay</option>
                  <option value="4">4 · Good</option>
                  <option value="5">5 · Great</option>
                </Select>
              )}
            </Field>
            <p className="text-ink-subtle text-xs">
              Reviews are private: only you can read them. They&apos;re never sent to Walrus Memory
              or anyone else.
            </p>
          </>
        );
      }}
    </ActionForm>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ReviewScheduleForm({
  prefs,
}: {
  prefs: {
    daily_review_enabled: boolean;
    daily_review_time: string;
    weekly_review_enabled: boolean;
    weekly_review_day: number;
    weekly_review_time: string;
    weekly_finance_review: boolean;
  };
}) {
  return (
    <ActionForm
      action={savePlanningPreferencesAction}
      submitLabel="Save schedule"
      pendingLabel="Saving…"
    >
      {() => (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Switch
              id="daily_review_enabled"
              label="Daily review reminder"
              defaultChecked={prefs.daily_review_enabled}
            />
            <Field id="daily_review_time" label="Time">
              {(a) => (
                <Input
                  {...a}
                  type="time"
                  defaultValue={prefs.daily_review_time.slice(0, 5)}
                  className="w-32"
                />
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Switch
              id="weekly_review_enabled"
              label="Weekly review reminder"
              defaultChecked={prefs.weekly_review_enabled}
            />
            <Field id="weekly_review_day" label="Day">
              {(a) => (
                <Select {...a} defaultValue={String(prefs.weekly_review_day)} className="w-40">
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="weekly_review_time" label="Time">
              {(a) => (
                <Input
                  {...a}
                  type="time"
                  defaultValue={prefs.weekly_review_time.slice(0, 5)}
                  className="w-32"
                />
              )}
            </Field>
          </div>
          <Switch
            id="weekly_finance_review"
            label="Include a finance check in the weekly review"
            description="A reminder to look at your budgets in Money. No finance data is copied into the review."
            defaultChecked={prefs.weekly_finance_review}
          />
        </>
      )}
    </ActionForm>
  );
}
