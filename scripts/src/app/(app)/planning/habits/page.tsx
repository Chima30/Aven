import type { Metadata } from "next";
import { ArchiveHabit, HabitCheck, HabitDialog } from "@/components/planning/habit-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { habitHistory, habitStats, isScheduled } from "@/lib/planning/habits";
import {
  dayLabel,
  HABIT_CATEGORY_LABEL,
  loadHabits,
  loadPlanningBasics,
  WEEKDAY_SHORT,
} from "@/lib/planning/queries";
import type { HabitRow } from "@/lib/supabase/database.types";
import { addDays, localDate } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Habits" };

function schedule(h: HabitRow): string {
  const days =
    h.frequency === "daily"
      ? "Every day"
      : (h.weekdays ?? []).map((d) => WEEKDAY_SHORT[d]).join(", ");
  return `${days}${h.reminder_time ? ` · reminder ${h.reminder_time.slice(0, 5)}` : ""}`;
}

const DOT: Record<string, string> = {
  done: "bg-accent",
  skipped: "bg-info/60",
  missed: "bg-line-strong",
  pending: "border-2 border-accent bg-transparent",
  unscheduled: "bg-transparent",
  future: "bg-surface-muted",
};

export default async function HabitsPage() {
  const { user, locale, today: userToday } = await loadPlanningBasics();
  const { habits, checkIns } = await loadHabits(120);
  const active = habits.filter((h) => !h.archived_at);
  const archived = habits.filter((h) => h.archived_at);
  const byHabit = new Map<string, typeof checkIns>();
  for (const c of checkIns) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Planning"
        title="Habits"
        description="Small routines, tracked kindly. Missing a day never resets your history, and rest days don't break a streak."
        action={<HabitDialog today={userToday} />}
      />

      {active.length === 0 ? (
        <EmptyState
          title="No habits yet"
          description="Start with one small thing you'd like to do regularly — reading, a walk, reviewing your spending."
        />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="habit-list">
          {active.map((h) => {
            const today = localDate(new Date(), h.time_zone);
            const checks = byHabit.get(h.id) ?? [];
            const stats = habitStats(h, checks, today, 30);
            const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
            const month = habitHistory(h, checks, addDays(today, -29), today, today);
            const checkFor = (d: string) => checks.find((c) => c.on_date === d) ?? null;
            return (
              <li key={h.id}>
                <Card>
                  <CardBody className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      {stats.scheduledToday ? (
                        <HabitCheck
                          userId={user.id}
                          habitId={h.id}
                          habitName={h.name}
                          date={today}
                          checkIn={checkFor(today)}
                        />
                      ) : (
                        <span
                          className="text-ink-subtle flex size-8 shrink-0 items-center justify-center text-xs"
                          title="Not scheduled today"
                        >
                          –
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-ink text-base font-semibold">{h.name}</h3>
                          <Badge>{HABIT_CATEGORY_LABEL[h.category]}</Badge>
                          {!stats.scheduledToday ? <Badge tone="neutral">Rest day</Badge> : null}
                        </div>
                        <p className="text-ink-muted mt-0.5 text-xs">{schedule(h)}</p>
                        {h.description ? (
                          <p className="text-ink-muted mt-1 text-sm">{h.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <HabitDialog habit={h} today={today} variant="ghost" size="sm" />
                        <ArchiveHabit habit={h} />
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-3 text-sm">
                      <div className="bg-surface-muted/60 rounded-lg px-3 py-2">
                        <dt className="text-ink-muted text-xs">Current streak</dt>
                        <dd
                          className="type-figure text-ink mt-0.5 font-semibold"
                          data-testid="streak"
                        >
                          {stats.currentStreak}
                        </dd>
                      </div>
                      <div className="bg-surface-muted/60 rounded-lg px-3 py-2">
                        <dt className="text-ink-muted text-xs">Longest</dt>
                        <dd className="type-figure text-ink mt-0.5 font-semibold">
                          {stats.longestStreak}
                        </dd>
                      </div>
                      <div className="bg-surface-muted/60 rounded-lg px-3 py-2">
                        <dt className="text-ink-muted text-xs">Last 30 days</dt>
                        <dd className="type-figure text-ink mt-0.5 font-semibold">
                          {stats.consistencyPct === null ? "—" : `${stats.consistencyPct}%`}
                          <span className="text-ink-subtle ml-1 text-xs font-normal">
                            ({stats.doneDays}/{stats.scheduledDays})
                          </span>
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <p className="text-ink-muted mb-2 text-xs font-semibold">This week</p>
                      <ol className="grid grid-cols-7 gap-1 text-center">
                        {week.map((d) => (
                          <li key={d} className="flex flex-col items-center gap-1">
                            <span
                              className={cn(
                                "text-[0.6875rem]",
                                d === today ? "text-accent font-semibold" : "text-ink-subtle",
                              )}
                            >
                              {dayLabel(d, locale, { weekday: "narrow" })}
                            </span>
                            {isScheduled(h, d) ? (
                              <HabitCheck
                                userId={user.id}
                                habitId={h.id}
                                habitName={h.name}
                                date={d}
                                checkIn={checkFor(d)}
                                size="sm"
                              />
                            ) : (
                              <span className="text-ink-subtle flex size-6 items-center justify-center text-xs">
                                ·
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <details>
                      <summary className="text-accent cursor-pointer text-sm">
                        Monthly history
                        {stats.missedDays.length > 0 ? ` · ${stats.missedDays.length} missed` : ""}
                      </summary>
                      <ol className="mt-3 grid grid-cols-10 gap-1.5" aria-label="Last 30 days">
                        {month.map((d) => (
                          <li
                            key={d.date}
                            title={`${d.date}: ${d.state}`}
                            className={cn("size-4 rounded-full", DOT[d.state])}
                          >
                            <span className="sr-only">{`${d.date}: ${d.state}`}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="text-ink-subtle mt-2 text-xs">
                        Filled = done · light blue = rest day · grey = missed · outlined = today.
                      </p>
                    </details>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <Card>
          <CardHeader title="Archived" description="Paused habits keep their history." />
          <CardBody>
            <ul className="divide-line divide-y text-sm">
              {archived.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-ink-muted">{h.name}</span>
                  <ArchiveHabit habit={h} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
