import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { HabitCheck, HabitDialog } from "@/components/planning/habit-forms";
import { EventDialog } from "@/components/planning/event-forms";
import { TaskCheck, TaskDialog } from "@/components/planning/task-forms";
import { MemorySuggestions } from "@/components/planning/memory-suggestions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { habitStats, isScheduled } from "@/lib/planning/habits";
import { runNudgeScheduler } from "@/lib/nudges/runner";
import {
  dayLabel,
  loadHabits,
  loadOccurrences,
  loadPlanningBasics,
  loadPlanningPrefs,
  loadReviews,
  loadTasks,
  timeIn,
} from "@/lib/planning/queries";
import { occursOnDay } from "@/lib/planning/recurrence";
import { planningSuggestions } from "@/lib/planning/suggestions";
import { addDays, localDate, timeToMinutes, zonedToInstant } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Planning" };

export default async function PlanningDashboard() {
  const { user, today, timeZone, locale, nowMs } = await loadPlanningBasics();
  const [{ tasks, categories }, { occurrences }, { habits, checkIns }, reviews, prefs] =
    await Promise.all([
      loadTasks(),
      loadOccurrences(today, addDays(today, 7)),
      loadHabits(40),
      loadReviews(5),
      loadPlanningPrefs(),
    ]);
  // Catch up on reminders for this user (the background schedule does this for everyone).
  after(() =>
    runNudgeScheduler({ source: "catch_up", userIds: [user.id], deadlineMs: 15_000 })
      .then(() => undefined)
      .catch(() => undefined),
  );

  const open = tasks.filter((t) => t.status === "not_started" || t.status === "in_progress");
  const dueToday = open.filter((t) => t.due_on === today);
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const todaysEvents = occurrences.filter((o) => occursOnDay(o, today, timeZone));
  const laterEvents = occurrences.filter((o) => !occursOnDay(o, today, timeZone)).slice(0, 6);
  const activeHabits = habits.filter((h) => !h.archived_at);
  const habitsToday = activeHabits.filter((h) =>
    isScheduled(h, localDate(new Date(), h.time_zone)),
  );
  const checkFor = (habitId: string, d: string) =>
    checkIns.find((c) => c.habit_id === habitId && c.on_date === d) ?? null;
  const doneCount = habitsToday.filter(
    (h) => checkFor(h.id, localDate(new Date(), h.time_zone))?.status === "done",
  ).length;

  // Next reminders the user set (real records only).
  const now = nowMs;
  const reminders = [
    ...open
      .filter((t) => t.remind_at && Date.parse(t.remind_at) > now)
      .map((t) => ({ at: new Date(t.remind_at!), label: t.title, kind: "Task" })),
    ...occurrences
      .filter(
        (o) =>
          o.reminderMinutes !== null &&
          !o.allDay &&
          o.start!.getTime() - o.reminderMinutes! * 60_000 > now,
      )
      .map((o) => ({
        at: new Date(o.start!.getTime() - o.reminderMinutes! * 60_000),
        label: o.title,
        kind: "Event",
      })),
    ...habitsToday
      .filter((h) => h.reminder_time && !checkFor(h.id, localDate(new Date(), h.time_zone)))
      .map((h) => ({
        at: zonedToInstant(
          localDate(new Date(), h.time_zone),
          timeToMinutes(h.reminder_time!),
          h.time_zone,
        ),
        label: h.name,
        kind: "Habit",
      }))
      .filter((r) => r.at.getTime() > now),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6);

  const suggestions = await planningSuggestions(user.id, {
    habits: activeHabits,
    checkIns,
    prefs,
    timeZone,
    today,
  });
  const empty = tasks.length === 0 && occurrences.length === 0 && habits.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Planning"
        title={`Today · ${dayLabel(today, locale, { weekday: "long", day: "numeric", month: "long" })}`}
        description="Your schedule, tasks and habits in one place."
        action={
          <div className="flex flex-wrap gap-2">
            <TaskDialog
              categories={categories.filter((c) => !c.archived_at)}
              today={today}
              label="Add task"
            />
            <EventDialog
              defaultDate={today}
              timeZone={timeZone}
              label="Add event"
              variant="secondary"
            />
          </div>
        }
      />

      {empty ? (
        <EmptyState
          title="A fresh start"
          description="Add a task, an event or a small habit. AVEN will remind you at the right time and gather everything into one daily summary."
          action={<HabitDialog today={today} label="Add a habit" variant="secondary" />}
        />
      ) : null}

      <MemorySuggestions suggestions={suggestions} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today's schedule"
            action={
              <Link
                href={`/planning/calendar?view=day&date=${today}`}
                className="text-accent text-sm"
              >
                Calendar
              </Link>
            }
          />
          <CardBody>
            {todaysEvents.length === 0 ? (
              <p className="text-ink-subtle text-sm">Nothing scheduled today.</p>
            ) : (
              <ul className="divide-line divide-y text-sm" data-testid="today-events">
                {todaysEvents.map((o) => (
                  <li key={o.key} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-ink-muted type-figure w-24 shrink-0 text-xs">
                      {o.allDay
                        ? "All day"
                        : `${timeIn(o.start!, timeZone, locale)}–${timeIn(o.end!, timeZone, locale)}`}
                    </span>
                    <span className="text-ink">{o.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {laterEvents.length > 0 ? (
              <>
                <h3 className="text-ink-muted mt-4 mb-1 text-xs font-semibold">Upcoming</h3>
                <ul className="text-sm">
                  {laterEvents.map((o) => (
                    <li key={o.key} className="text-ink-muted py-0.5">
                      {dayLabel(o.allDay ? o.startDate! : localDate(o.start!, timeZone), locale)}
                      {o.allDay ? "" : ` ${timeIn(o.start!, timeZone, locale)}`} ·{" "}
                      <span className="text-ink">{o.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Tasks"
            description={`${dueToday.length} due today${overdue.length ? ` · ${overdue.length} overdue` : ""}`}
            action={
              <Link href="/planning/tasks" className="text-accent text-sm">
                All tasks
              </Link>
            }
          />
          <CardBody>
            {dueToday.length + overdue.length === 0 ? (
              <p className="text-ink-subtle text-sm">
                {open.length > 0 ? "Nothing due today." : "No open tasks."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="today-tasks">
                {[...overdue, ...dueToday].slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <TaskCheck userId={user.id} task={t} />
                    <span className="text-ink min-w-0 flex-1 truncate">{t.title}</span>
                    {t.due_on && t.due_on < today ? (
                      <Badge tone="danger">Overdue</Badge>
                    ) : t.due_time ? (
                      <Badge>{t.due_time.slice(0, 5)}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Habits today"
            description={
              habitsToday.length ? `${doneCount} of ${habitsToday.length} done` : undefined
            }
            action={
              <Link href="/planning/habits" className="text-accent text-sm">
                All habits
              </Link>
            }
          />
          <CardBody>
            {habitsToday.length === 0 ? (
              <p className="text-ink-subtle text-sm">
                {activeHabits.length ? "No habits scheduled today — a rest day." : "No habits yet."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="today-habits">
                {habitsToday.map((h) => {
                  const day = localDate(new Date(), h.time_zone);
                  const stats = habitStats(
                    h,
                    checkIns.filter((c) => c.habit_id === h.id),
                    day,
                    7,
                  );
                  return (
                    <li key={h.id} className="flex items-center gap-3 text-sm">
                      <HabitCheck
                        userId={user.id}
                        habitId={h.id}
                        habitName={h.name}
                        date={day}
                        checkIn={checkFor(h.id, day)}
                        size="sm"
                      />
                      <span className="text-ink min-w-0 flex-1 truncate">{h.name}</span>
                      <span className="text-ink-subtle text-xs">
                        {stats.currentStreak > 0 ? `${stats.currentStreak} in a row · ` : ""}
                        {stats.consistencyPct !== null ? `${stats.consistencyPct}% this week` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Next reminders"
            action={
              <Link href="/nudges" className="text-accent text-sm">
                Nudge Center
              </Link>
            }
          />
          <CardBody>
            {reminders.length === 0 ? (
              <p className="text-ink-subtle text-sm">No reminders coming up.</p>
            ) : (
              <ul className="text-sm">
                {reminders.map((r, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1">
                    <span className="text-ink truncate">
                      <Badge>{r.kind}</Badge> {r.label}
                    </span>
                    <span className="text-ink-muted type-figure shrink-0 text-xs">
                      {localDate(r.at, timeZone) === today
                        ? ""
                        : `${dayLabel(localDate(r.at, timeZone), locale)} `}
                      {timeIn(r.at, timeZone, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-line mt-4 border-t pt-3">
              <h3 className="text-ink-muted mb-1 text-xs font-semibold">Recent reviews</h3>
              {reviews.length === 0 ? (
                <Link href="/planning/reviews" className="text-accent text-sm">
                  Write your first review
                </Link>
              ) : (
                <ul className="text-sm">
                  {reviews.slice(0, 3).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/planning/reviews?kind=${r.kind}&date=${r.period_start}`}
                        className="text-ink hover:underline"
                      >
                        {r.kind === "weekly" ? "Week of " : ""}
                        {dayLabel(r.period_start, locale)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {prefs.daily_review_enabled ? (
                <p className="text-ink-subtle mt-2 text-xs">
                  Daily review reminder at {prefs.daily_review_time.slice(0, 5)}.
                </p>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
