import type { Metadata } from "next";
import Link from "next/link";
import { ReviewForm, ReviewScheduleForm } from "@/components/planning/review-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { habitStats } from "@/lib/planning/habits";
import {
  dayLabel,
  loadHabits,
  loadOccurrences,
  loadPlanningBasics,
  loadPlanningPrefs,
  loadReviews,
  loadTasks,
} from "@/lib/planning/queries";
import { occursOnDay } from "@/lib/planning/recurrence";
import { addDays, isIsoDate, localDate, startOfWeek } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { today, timeZone, locale, weekStart } = await loadPlanningBasics();
  const kind = params.kind === "weekly" ? "weekly" : "daily";
  const raw =
    typeof params.date === "string" && isIsoDate(params.date) && params.date <= today
      ? params.date
      : today;
  const periodStart = kind === "weekly" ? startOfWeek(raw, weekStart) : raw;
  const periodEnd = kind === "weekly" ? addDays(periodStart, 6) : periodStart;

  const [reviews, { tasks }, { habits, checkIns }, prefs, upcoming] = await Promise.all([
    loadReviews(60),
    loadTasks(),
    loadHabits(40),
    loadPlanningPrefs(),
    loadOccurrences(addDays(periodEnd, 1), addDays(periodEnd, 7)),
  ]);
  const current = reviews.find((r) => r.kind === kind && r.period_start === periodStart) ?? null;

  // Context from REAL records for the period being reviewed.
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const d = localDate(new Date(iso), timeZone);
    return d >= periodStart && d <= periodEnd;
  };
  const completed = tasks.filter((t) => t.status === "completed" && inPeriod(t.completed_at));
  const nextDay = addDays(periodEnd, 1);
  const dueNext = tasks.filter(
    (t) =>
      (t.status === "not_started" || t.status === "in_progress") &&
      t.due_on &&
      t.due_on <= (kind === "daily" ? nextDay : addDays(periodEnd, 7)),
  );
  const habitLines = habits
    .filter((h) => !h.archived_at && h.start_on <= periodEnd)
    .map((h) => {
      const s = habitStats(
        h,
        checkIns.filter((c) => c.habit_id === h.id),
        periodEnd,
        kind === "weekly" ? 7 : 1,
      );
      return { name: h.name, done: s.doneDays, scheduled: s.scheduledDays };
    })
    .filter((h) => h.scheduled > 0);
  const commitments = upcoming.occurrences.filter((o) =>
    kind === "daily" ? occursOnDay(o, nextDay, timeZone) : true,
  );

  const link = (k: string, d: string) => `/planning/reviews?kind=${k}&date=${d}`;
  const prev = kind === "weekly" ? addDays(periodStart, -7) : addDays(periodStart, -1);
  const next = kind === "weekly" ? addDays(periodStart, 7) : addDays(periodStart, 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Planning"
        title="Reviews"
        description="A few private minutes to look back and plan ahead. Only you can read your reviews."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="navigation" aria-label="Review type">
          {(["daily", "weekly"] as const).map((k) => (
            <Link
              key={k}
              href={link(k, today)}
              aria-current={kind === k ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm capitalize",
                kind === k ? "bg-primary text-primary-fg" : "text-ink-muted hover:bg-surface-muted",
              )}
            >
              {k}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={link(kind, prev)}
            className="border-line hover:bg-surface-muted rounded-lg border px-3 py-1.5"
            aria-label="Previous"
          >
            ←
          </Link>
          <span className="text-ink font-medium">
            {kind === "weekly"
              ? `Week of ${dayLabel(periodStart, locale)}`
              : dayLabel(periodStart, locale, { weekday: "long", day: "numeric", month: "long" })}
          </span>
          {next <= today ? (
            <Link
              href={link(kind, next)}
              className="border-line hover:bg-surface-muted rounded-lg border px-3 py-1.5"
              aria-label="Next"
            >
              →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader
            title="From your records"
            description="Pulled from what you actually logged — nothing is guessed."
          />
          <CardBody className="flex flex-col gap-4 text-sm">
            <section>
              <h3 className="text-ink-muted mb-1 text-xs font-semibold">
                Completed tasks ({completed.length})
              </h3>
              {completed.length === 0 ? (
                <p className="text-ink-subtle">None.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5">
                  {completed.slice(0, 10).map((t) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-ink-muted mb-1 text-xs font-semibold">Habits</h3>
              {habitLines.length === 0 ? (
                <p className="text-ink-subtle">No scheduled habits.</p>
              ) : (
                <ul className="space-y-0.5">
                  {habitLines.map((h) => (
                    <li key={h.name}>
                      {h.name}: {h.done}/{h.scheduled}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-ink-muted mb-1 text-xs font-semibold">
                {kind === "daily" ? "Tomorrow" : "Coming up next week"}
              </h3>
              {commitments.length === 0 && dueNext.length === 0 ? (
                <p className="text-ink-subtle">Nothing scheduled yet.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5">
                  {commitments.slice(0, 8).map((o) => (
                    <li key={o.key}>
                      {o.title}
                      {o.allDay ? "" : ` · ${dayLabel(localDate(o.start!, timeZone), locale)}`}
                    </li>
                  ))}
                  {dueNext.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      Task: {t.title}
                      {t.due_on ? ` (due ${dayLabel(t.due_on, locale)})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {kind === "weekly" && prefs.weekly_finance_review ? (
              <section className="bg-surface-muted/60 rounded-lg p-3">
                <p className="text-ink">Finance check: how did your budgets do this week?</p>
                <Link href="/money/budgets" className="text-accent text-xs underline">
                  Open budgets
                </Link>
              </section>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={kind === "daily" ? "Daily review" : "Weekly review"}
            action={current ? <Badge tone="success">Saved</Badge> : undefined}
          />
          <CardBody>
            <ReviewForm
              key={`${kind}-${periodStart}-${current?.version ?? 0}`}
              kind={kind}
              periodStart={periodStart}
              review={current}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Past reviews" />
          <CardBody>
            {reviews.length === 0 ? (
              <p className="text-ink-subtle text-sm">No reviews yet.</p>
            ) : (
              <ul className="divide-line divide-y text-sm">
                {reviews.slice(0, 12).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <Link href={link(r.kind, r.period_start)} className="text-ink hover:underline">
                      {r.kind === "weekly"
                        ? `Week of ${dayLabel(r.period_start, locale)}`
                        : dayLabel(r.period_start, locale)}
                    </Link>
                    <span className="flex gap-1">
                      <Badge>{r.kind}</Badge>
                      {r.rating ? <Badge tone="accent">{r.rating}/5</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Review schedule"
            description="The Nudge Center reminds you at these times (in your time zone)."
          />
          <CardBody>
            <ReviewScheduleForm prefs={prefs} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
