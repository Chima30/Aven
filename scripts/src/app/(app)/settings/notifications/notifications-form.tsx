"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { Badge } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/lib/regional/options";
import type {
  NotificationCategory,
  NotificationFrequency,
  NotificationPreferencesRow,
} from "@/lib/supabase/database.types";
import { updateNotificationsAction } from "../actions";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  subscriptions: "Subscription renewals (later)",
  shared_expenses: "Shared expenses (later)",
  budgets: "Finance: budget alerts",
  savings: "Finance: savings progress",
  routines: "Habits and routines",
  wellbeing: "Wellbeing reminders",
  planning: "Planning: tasks, events and reviews",
  account_security: "Account security",
  suggestions: "Suggestions from your memory",
};

const hhmm = (t: string) => t.slice(0, 5);

export function NotificationsForm({
  prefs,
  categories,
}: {
  prefs: NotificationPreferencesRow;
  categories: Array<{ category: NotificationCategory; frequency: NotificationFrequency }>;
}) {
  return (
    <SettingsForm
      title="Nudges and Pulse Check"
      description="AVEN groups updates into calm summaries instead of constant alerts. These rules are enforced by the app itself — the AI assistant can never override them."
      action={updateNotificationsAction}
    >
      {(state) => (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-5">
            <h3 className="type-eyebrow text-ink-subtle">Where</h3>
            <Switch
              id="inAppEnabled"
              label="In-app notifications"
              description="Shown inside AVEN."
              defaultChecked={prefs.in_app_enabled}
            />
            <Switch
              id="emailChannel"
              name="_email"
              label="Email"
              badge={<Badge>Not available yet</Badge>}
              disabled
              defaultChecked={false}
            />
            <Switch
              id="pushChannel"
              name="_push"
              label="Push notifications"
              badge={<Badge>Not available yet</Badge>}
              disabled
              defaultChecked={false}
            />
          </section>

          <section className="border-line flex flex-col gap-5 border-t pt-6">
            <h3 className="type-eyebrow text-ink-subtle">Summaries</h3>
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <Switch
                id="dailyDigestEnabled"
                label="Daily summary"
                description="“Your day in AVEN”: one briefing built from your real tasks, events, habits and reviews."
                defaultChecked={prefs.daily_digest_enabled}
              />
              <Field id="dailyDigestTime" label="Time" error={state.fieldErrors?.dailyDigestTime}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="time"
                    defaultValue={hhmm(prefs.daily_digest_time)}
                    className="w-32"
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <Switch
                id="weeklyDigestEnabled"
                label="Weekly summary"
                description="A look back at your week and what's ahead."
                defaultChecked={prefs.weekly_digest_enabled}
              />
              <Field id="weeklyDigestDay" label="Day" error={state.fieldErrors?.weeklyDigestDay}>
                {(a11y) => (
                  <Select {...a11y} defaultValue={String(prefs.weekly_digest_day)} className="w-40">
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </section>

          <section className="border-line flex flex-col gap-5 border-t pt-6">
            <h3 className="type-eyebrow text-ink-subtle">Quiet time</h3>
            <Switch
              id="quietHoursEnabled"
              label="Quiet hours"
              description="Non-urgent nudges wait until quiet hours end. Reminders you schedule yourself for a specific time still arrive."
              defaultChecked={prefs.quiet_hours_enabled}
            />
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field id="quietHoursStart" label="From" error={state.fieldErrors?.quietHoursStart}>
                {(a11y) => (
                  <Input {...a11y} type="time" defaultValue={hhmm(prefs.quiet_hours_start)} />
                )}
              </Field>
              <Field id="quietHoursEnd" label="Until" error={state.fieldErrors?.quietHoursEnd}>
                {(a11y) => (
                  <Input {...a11y} type="time" defaultValue={hhmm(prefs.quiet_hours_end)} />
                )}
              </Field>
            </div>
            <Switch
              id="pauseNonessential"
              label="Pause non-essential nudges"
              description="Stops everything except account security notices until you switch this off."
              defaultChecked={prefs.pause_nonessential}
            />
            <Field
              id="maxNudgesPerDay"
              label="Most individual nudges per day"
              hint="Anything beyond this is folded into your daily Pulse Check."
              error={state.fieldErrors?.maxNudgesPerDay}
              className="max-w-xs [&_input]:w-28"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={prefs.max_nudges_per_day}
                  className="w-28"
                />
              )}
            </Field>
          </section>

          <section className="border-line border-t pt-6">
            <h3 className="type-eyebrow text-ink-subtle mb-4">By topic</h3>
            {state.fieldErrors?.categories ? (
              <p className="text-danger mb-3 text-xs font-medium">{state.fieldErrors.categories}</p>
            ) : null}
            <div className="divide-line border-line divide-y rounded-xl border">
              {categories.map(({ category, frequency }) => {
                const essential = category === "account_security";
                return (
                  <div
                    key={category}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <label
                      htmlFor={`category_${category}`}
                      className="text-ink flex items-center gap-2 text-sm font-medium"
                    >
                      {CATEGORY_LABELS[category]}
                      {essential ? <Badge tone="info">Always on</Badge> : null}
                    </label>
                    <Select
                      id={`category_${category}`}
                      name={`category_${category}`}
                      defaultValue={frequency}
                      className="h-9 sm:w-52"
                    >
                      <option value="immediate">Right away</option>
                      <option value="daily_digest">In daily Pulse Check</option>
                      <option value="weekly_digest">In weekly review</option>
                      {essential ? null : <option value="off">Off</option>}
                    </Select>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </SettingsForm>
  );
}
