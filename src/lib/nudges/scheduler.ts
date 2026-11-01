import {
  consecutiveMissed,
  habitStats,
  isScheduled,
  STREAK_MILESTONES,
} from "@/lib/planning/habits";
import type { Occurrence } from "@/lib/planning/recurrence";
import { occursOnDay } from "@/lib/planning/recurrence";
import type {
  HabitCheckInRow,
  HabitRow,
  NotificationKind,
  NotificationRow,
  TaskRow,
} from "@/lib/supabase/database.types";
import {
  addDays,
  localDate,
  localMinutes,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  weekday,
  zonedToInstant,
} from "@/lib/time/zoned";
import { decideDelivery } from "./engine";
import type { NotificationCategory, NudgeEvent, NudgeSettings } from "./types";

/**
 * The Nudge Center scheduler — deterministic and pure.
 *
 * It turns the user's REAL records into candidate notifications, then asks the
 * delivery engine (engine.ts) whether each one is delivered now, held until
 * quiet hours end, bundled into a summary, or suppressed by preferences.
 * Every candidate has a dedupe key for its occurrence, and the database
 * stores one notification per key, so running the scheduler any number of
 * times never sends the same reminder twice.
 */

export interface PlanningSchedule {
  dailyReviewEnabled: boolean;
  dailyReviewTime: string;
  weeklyReviewEnabled: boolean;
  weeklyReviewDay: number;
  weeklyReviewTime: string;
  weeklyFinanceReview: boolean;
}

export interface FinanceEventInput {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface LifeEventInput {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface WeeklyWellbeing {
  sleepNights: number;
  sleepAvgMinutes: number | null;
  waterDaysOnTarget: number;
  activityMinutes: number;
  checkIns: number;
}

export interface SchedulerInput {
  now: Date;
  timeZone: string;
  weekStart: number;
  settings: NudgeSettings;
  planning: PlanningSchedule;
  tasks: Array<
    Pick<
      TaskRow,
      "id" | "title" | "status" | "priority" | "due_on" | "due_time" | "remind_at" | "completed_at"
    >
  >;
  occurrences: Occurrence[];
  habits: Array<
    Pick<
      HabitRow,
      | "id"
      | "name"
      | "category"
      | "frequency"
      | "weekdays"
      | "start_on"
      | "end_on"
      | "reminder_time"
      | "time_zone"
    >
  >;
  checkIns: Array<Pick<HabitCheckInRow, "habit_id" | "on_date" | "status">>;
  reviews: Array<{ kind: "daily" | "weekly"; period_start: string }>;
  financeEvents: FinanceEventInput[];
  lifeEvents: LifeEventInput[];
  /** Individual (non-summary) notifications already delivered today. */
  deliveredToday: number;
  /** Notifications bundled since the last summary of each kind. */
  bundledSince: Array<{ title: string; digest: "daily" | "weekly" }>;
  /** Counts for the weekly summary — only when the user allows wellbeing data. */
  wellbeing: WeeklyWellbeing | null;
}

export type NotificationDraft = Pick<
  NotificationRow,
  | "category"
  | "kind"
  | "priority"
  | "title"
  | "body"
  | "action_url"
  | "related_type"
  | "related_id"
  | "dedupe_key"
  | "status"
  | "decision_reason"
  | "digest"
  | "scheduled_for"
  | "delivered_at"
  | "expires_at"
>;

export interface SchedulerOutput {
  notifications: NotificationDraft[];
  processedFinanceEvents: number[];
  processedLifeEvents: number[];
}

interface Candidate {
  category: NotificationCategory;
  kind: NotificationKind;
  priority: "low" | "normal" | "high";
  title: string;
  body: string | null;
  actionUrl: string | null;
  relatedType: string | null;
  relatedId: string | null;
  dedupeKey: string;
  source: NudgeEvent["source"];
  userScheduled: boolean;
  expiresAt: Date | null;
}

/** How long after its time a reminder is still worth sending. */
const LATE_LIMIT_MS = 6 * 3_600_000;
const SUMMARY_WINDOW_MIN = 6 * 60;
const TASK_DEADLINE_LEAD_MS = 3 * 3_600_000;
const MISSED_IN_A_ROW = 3;

function endOfLocalDay(date: string, timeZone: string): Date {
  return zonedToInstant(addDays(date, 1), 0, timeZone);
}

function fmtTime(d: Date, timeZone: string): string {
  return minutesToTime(localMinutes(d, timeZone));
}

export function buildCandidates(input: SchedulerInput): {
  candidates: Candidate[];
  processedFinanceEvents: number[];
  processedLifeEvents: number[];
} {
  const { now, timeZone } = input;
  const nowMs = now.getTime();
  const today = localDate(now, timeZone);
  const nowMinutes = localMinutes(now, timeZone);
  const out: Candidate[] = [];

  // 1. Task reminders the user set (exact time).
  for (const t of input.tasks) {
    if (t.status === "completed" || t.status === "cancelled") continue;
    if (t.remind_at) {
      const at = Date.parse(t.remind_at);
      if (at <= nowMs && nowMs - at <= LATE_LIMIT_MS) {
        out.push({
          category: "planning",
          kind: "task_reminder",
          priority: t.priority === "high" ? "high" : "normal",
          title: `Reminder: ${t.title}`,
          body: t.due_on
            ? `Due ${t.due_on}${t.due_time ? ` at ${t.due_time.slice(0, 5)}` : ""}.`
            : null,
          actionUrl: "/planning/tasks",
          relatedType: "task",
          relatedId: t.id,
          dedupeKey: `task_reminder:${t.id}:${t.remind_at}`,
          source: "user",
          userScheduled: true,
          expiresAt: null,
        });
      }
    }
    // 2. Deadline approaching (tasks with a due time, within the next 3 hours).
    if (t.due_on && t.due_time) {
      const due = zonedToInstant(t.due_on, timeToMinutes(t.due_time), timeZone).getTime();
      if (due > nowMs && due - nowMs <= TASK_DEADLINE_LEAD_MS) {
        out.push({
          category: "planning",
          kind: "task_due",
          priority: t.priority === "high" ? "high" : "normal",
          title: `Due soon: ${t.title}`,
          body: `Due today at ${t.due_time.slice(0, 5)}.`,
          actionUrl: "/planning/tasks",
          relatedType: "task",
          relatedId: t.id,
          dedupeKey: `task_due:${t.id}:${t.due_on}T${t.due_time.slice(0, 5)}`,
          source: "system",
          userScheduled: false,
          expiresAt: new Date(due),
        });
      }
    }
  }

  // 3. Event reminders (the user chose "remind me N minutes before").
  for (const o of input.occurrences) {
    if (o.reminderMinutes === null) continue;
    const start = o.allDay ? zonedToInstant(o.startDate!, 9 * 60, timeZone) : o.start!;
    const remindAt = start.getTime() - o.reminderMinutes * 60_000;
    if (
      remindAt <= nowMs &&
      nowMs < start.getTime() + 60_000 &&
      nowMs - remindAt <= LATE_LIMIT_MS
    ) {
      out.push({
        category: "planning",
        kind: "event_reminder",
        priority: "normal",
        title: o.allDay ? `Today: ${o.title}` : `${o.title} at ${fmtTime(start, timeZone)}`,
        body: o.allDay
          ? "All day."
          : o.reminderMinutes > 0
            ? `Starts in ${o.reminderMinutes} minutes.`
            : "Starting now.",
        actionUrl: `/planning/calendar?date=${o.occurrenceDate}`,
        relatedType: "calendar_event",
        relatedId: o.eventId,
        dedupeKey: `event_reminder:${o.key}`,
        source: "user",
        userScheduled: true,
        expiresAt: o.allDay ? endOfLocalDay(o.startDate!, timeZone) : o.end,
      });
    }
  }

  // 4. Habit reminders and repeated misses.
  const checkInsByHabit = new Map<string, Array<{ on_date: string; status: "done" | "skipped" }>>();
  for (const c of input.checkIns) {
    const list = checkInsByHabit.get(c.habit_id) ?? [];
    list.push({ on_date: c.on_date, status: c.status });
    checkInsByHabit.set(c.habit_id, list);
  }
  for (const h of input.habits) {
    const hToday = localDate(now, h.time_zone);
    const checks = checkInsByHabit.get(h.id) ?? [];
    const doneToday = checks.some((c) => c.on_date === hToday);
    if (h.reminder_time && isScheduled(h, hToday) && !doneToday) {
      const at = zonedToInstant(hToday, timeToMinutes(h.reminder_time), h.time_zone).getTime();
      if (at <= nowMs && nowMs - at <= LATE_LIMIT_MS) {
        out.push({
          category:
            h.category === "sleep" ||
            h.category === "hydration" ||
            h.category === "health" ||
            h.category === "fitness"
              ? "wellbeing"
              : "routines",
          kind: "habit_reminder",
          priority: "normal",
          title: `Time for: ${h.name}`,
          body: "Tap to check in when you've done it.",
          actionUrl: "/planning/habits",
          relatedType: "habit",
          relatedId: h.id,
          dedupeKey: `habit_reminder:${h.id}:${hToday}`,
          source: "user",
          userScheduled: true,
          expiresAt: endOfLocalDay(hToday, h.time_zone),
        });
      }
    }
    const missed = consecutiveMissed(h, checks, hToday);
    if (missed >= MISSED_IN_A_ROW) {
      // At most once per week per habit.
      const week = startOfWeek(hToday, input.weekStart);
      const wellbeing = ["sleep", "hydration", "health", "fitness"].includes(h.category);
      out.push({
        category: wellbeing ? "wellbeing" : "routines",
        kind: "habit_missed",
        priority: "low",
        title: `${h.name} hasn't happened for ${missed} scheduled days`,
        body: "No pressure — life gets busy. Would a different day or time fit better? You can change the schedule or pause the habit.",
        actionUrl: "/planning/habits",
        relatedType: "habit",
        relatedId: h.id,
        dedupeKey: `habit_missed:${h.id}:${week}`,
        source: "system",
        userScheduled: false,
        expiresAt: null,
      });
    }
  }

  // 5. Reviews the user scheduled.
  const p = input.planning;
  if (p.dailyReviewEnabled) {
    const at = timeToMinutes(p.dailyReviewTime);
    const written = input.reviews.some((r) => r.kind === "daily" && r.period_start === today);
    if (!written && nowMinutes >= at && nowMinutes - at <= SUMMARY_WINDOW_MIN) {
      out.push({
        category: "planning",
        kind: "review_due",
        priority: "low",
        title: "Your daily review",
        body: "A few minutes to note what went well and what needs attention tomorrow.",
        actionUrl: `/planning/reviews?kind=daily&date=${today}`,
        relatedType: null,
        relatedId: null,
        dedupeKey: `review_due:daily:${today}`,
        source: "user",
        userScheduled: true,
        expiresAt: endOfLocalDay(today, timeZone),
      });
    }
  }
  if (p.weeklyReviewEnabled && weekday(today) === p.weeklyReviewDay) {
    const at = timeToMinutes(p.weeklyReviewTime);
    const week = startOfWeek(today, input.weekStart);
    const written = input.reviews.some((r) => r.kind === "weekly" && r.period_start === week);
    if (!written && nowMinutes >= at && nowMinutes - at <= SUMMARY_WINDOW_MIN) {
      out.push({
        category: "planning",
        kind: "review_due",
        priority: "normal",
        title: "Your weekly review",
        body: p.weeklyFinanceReview
          ? "Look back at your week, set next week's priorities, and check your budgets in Money."
          : "Look back at your week and set next week's priorities.",
        actionUrl: `/planning/reviews?kind=weekly&date=${week}`,
        relatedType: null,
        relatedId: null,
        dedupeKey: `review_due:weekly:${week}`,
        source: "user",
        userScheduled: true,
        expiresAt: endOfLocalDay(today, timeZone),
      });
    }
  }

  // 6. Finance events (budgets and savings), produced by the finance write path.
  const processedFinanceEvents: number[] = [];
  for (const e of input.financeEvents) {
    processedFinanceEvents.push(e.id);
    const name = typeof e.payload.name === "string" ? e.payload.name : "A budget";
    if (e.kind === "budget_threshold_reached") {
      out.push(
        financeCandidate(
          e,
          "budgets",
          "budget_threshold",
          "normal",
          `${name} has reached ${String(e.payload.threshold_pct ?? "its alert")}%`,
          "You can review this month's spending in Money → Budgets.",
          "/money/budgets",
        ),
      );
    } else if (e.kind === "budget_exceeded") {
      out.push(
        financeCandidate(
          e,
          "budgets",
          "budget_exceeded",
          "high",
          `${name} is over budget`,
          "Open Money → Budgets to see what changed.",
          "/money/budgets",
        ),
      );
    } else if (e.kind === "savings_milestone_reached") {
      const goal = typeof e.payload.name === "string" ? e.payload.name : "A savings goal";
      out.push(
        financeCandidate(
          e,
          "savings",
          "savings_milestone",
          "low",
          `${goal} reached ${String(e.payload.milestone_pct ?? "a")}%`,
          "Nice progress.",
          "/money/goals",
        ),
      );
    }
  }

  // 7. Life events: quiet encouragement at streak milestones.
  const processedLifeEvents: number[] = [];
  for (const e of input.lifeEvents) {
    processedLifeEvents.push(e.id);
    if (e.kind !== "habit_checked_in") continue;
    const habit = input.habits.find((h) => h.id === e.payload.habit_id);
    if (!habit) continue;
    const stats = habitStats(
      habit,
      checkInsByHabit.get(habit.id) ?? [],
      localDate(now, habit.time_zone),
    );
    const milestone = STREAK_MILESTONES.find((m) => m === stats.currentStreak);
    if (milestone) {
      out.push({
        category: "routines",
        kind: "habit_streak",
        priority: "low",
        title: `${milestone} in a row: ${habit.name}`,
        body: "Steady progress.",
        actionUrl: "/planning/habits",
        relatedType: "habit",
        relatedId: habit.id,
        dedupeKey: `habit_streak:${habit.id}:${milestone}:${String(e.payload.on_date ?? today)}`,
        source: "system",
        userScheduled: false,
        expiresAt: null,
      });
    }
  }

  return { candidates: out, processedFinanceEvents, processedLifeEvents };
}

function financeCandidate(
  e: FinanceEventInput,
  category: NotificationCategory,
  kind: NotificationKind,
  priority: Candidate["priority"],
  title: string,
  body: string,
  actionUrl: string,
): Candidate {
  return {
    category,
    kind,
    priority,
    title: title.slice(0, 120),
    body,
    actionUrl,
    relatedType: "finance_event",
    relatedId: null,
    dedupeKey: `finance_event:${e.id}`,
    source: "system",
    userScheduled: false,
    expiresAt: null,
  };
}

/** Builds "Your day in AVEN" from real records. Returns null when there is nothing to say. */
export function buildDailySummary(
  input: SchedulerInput,
  bundledTitles: string[],
): { title: string; body: string } | null {
  const { now, timeZone } = input;
  const today = localDate(now, timeZone);
  const lines: string[] = [];
  const open = input.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const dueToday = open.filter((t) => t.due_on === today);
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  if (dueToday.length > 0) {
    lines.push(
      `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today: ${dueToday
        .slice(0, 3)
        .map((t) => t.title)
        .join(", ")}${dueToday.length > 3 ? "…" : ""}.`,
    );
  }
  if (overdue.length > 0)
    lines.push(`${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}.`);
  const events = input.occurrences.filter((o) => occursOnDay(o, today, timeZone));
  for (const o of events.slice(0, 4)) {
    lines.push(o.allDay ? `All day: ${o.title}.` : `${fmtTime(o.start!, timeZone)} ${o.title}.`);
  }
  if (events.length > 4)
    lines.push(`…and ${events.length - 4} more event${events.length - 4 === 1 ? "" : "s"}.`);
  const habitsToday = input.habits.filter((h) => isScheduled(h, localDate(now, h.time_zone)));
  const notDone = habitsToday.filter(
    (h) =>
      !input.checkIns.some((c) => c.habit_id === h.id && c.on_date === localDate(now, h.time_zone)),
  );
  if (notDone.length > 0) {
    lines.push(
      `Habits for today: ${notDone
        .slice(0, 4)
        .map((h) => h.name + (h.reminder_time ? ` (${h.reminder_time.slice(0, 5)})` : ""))
        .join(", ")}.`,
    );
  }
  if (
    input.planning.dailyReviewEnabled &&
    !input.reviews.some((r) => r.kind === "daily" && r.period_start === today)
  ) {
    lines.push(`Your daily review is set for ${input.planning.dailyReviewTime.slice(0, 5)}.`);
  }
  for (const t of bundledTitles.slice(0, 5)) lines.push(`• ${t}`);
  if (lines.length === 0) return null;
  return { title: "Your day in AVEN", body: lines.join("\n") };
}

export function buildWeeklySummary(
  input: SchedulerInput,
  bundledTitles: string[],
): { title: string; body: string } | null {
  const { now, timeZone } = input;
  const today = localDate(now, timeZone);
  const weekAgo = addDays(today, -7);
  const lines: string[] = [];
  const completed = input.tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completed_at &&
      localDate(new Date(t.completed_at), timeZone) > weekAgo,
  );
  lines.push(
    `${completed.length} task${completed.length === 1 ? "" : "s"} completed in the last 7 days.`,
  );
  const habitLines: string[] = [];
  for (const h of input.habits) {
    const stats = habitStats(
      h,
      input.checkIns.filter((c) => c.habit_id === h.id),
      localDate(now, h.time_zone),
      7,
    );
    if (stats.consistencyPct !== null)
      habitLines.push(`${h.name} ${stats.doneDays}/${stats.scheduledDays}`);
  }
  if (habitLines.length > 0) lines.push(`Habits this week: ${habitLines.slice(0, 5).join(", ")}.`);
  const upcoming = input.occurrences.filter((o) => {
    const d = o.allDay ? o.startDate! : localDate(o.start!, timeZone);
    return d > today && d <= addDays(today, 7);
  });
  if (upcoming.length > 0)
    lines.push(`${upcoming.length} event${upcoming.length === 1 ? "" : "s"} in the next 7 days.`);
  if (input.planning.weeklyFinanceReview)
    lines.push("Take a minute to check your budgets in Money.");
  const w = input.wellbeing;
  if (w && (w.sleepNights > 0 || w.activityMinutes > 0 || w.checkIns > 0)) {
    const parts: string[] = [];
    if (w.sleepNights > 0 && w.sleepAvgMinutes !== null) {
      parts.push(
        `sleep averaged ${Math.floor(w.sleepAvgMinutes / 60)} h ${Math.round(w.sleepAvgMinutes % 60)} min over ${w.sleepNights} night${w.sleepNights === 1 ? "" : "s"}`,
      );
    }
    if (w.waterDaysOnTarget > 0)
      parts.push(
        `water target met on ${w.waterDaysOnTarget} day${w.waterDaysOnTarget === 1 ? "" : "s"}`,
      );
    if (w.activityMinutes > 0) parts.push(`${w.activityMinutes} active minutes`);
    if (parts.length > 0) lines.push(`Wellbeing: ${parts.join(", ")}.`);
  }
  for (const t of bundledTitles.slice(0, 5)) lines.push(`• ${t}`);
  return { title: "Your week in AVEN", body: lines.join("\n") };
}

/** Runs the rules and the delivery engine. Pure: same input → same output. */
export function runScheduler(input: SchedulerInput): SchedulerOutput {
  const { now, timeZone, settings } = input;
  const today = localDate(now, timeZone);
  const { candidates, processedFinanceEvents, processedLifeEvents } = buildCandidates(input);
  const notifications: NotificationDraft[] = [];
  let deliveredToday = input.deliveredToday;
  const newlyBundled: Array<{ title: string; digest: "daily" | "weekly" }> = [];

  for (const c of candidates) {
    const decision = decideDelivery(
      {
        id: c.dedupeKey,
        category: c.category,
        source: c.source,
        userScheduled: c.userScheduled,
        occurredAt: now,
      },
      settings,
      { now, deliveredToday },
    );
    const base = {
      category: c.category,
      kind: c.kind,
      priority: c.priority,
      title: c.title.slice(0, 120),
      body: c.body,
      action_url: c.actionUrl,
      related_type: c.relatedType,
      related_id: c.relatedId,
      dedupe_key: c.dedupeKey,
      expires_at: c.expiresAt ? c.expiresAt.toISOString() : null,
    };
    if (decision.action === "deliver_now") {
      deliveredToday += 1;
      notifications.push({
        ...base,
        status: "delivered",
        decision_reason: null,
        digest: null,
        scheduled_for: null,
        delivered_at: now.toISOString(),
      });
    } else if (decision.action === "defer") {
      notifications.push({
        ...base,
        status: "scheduled",
        decision_reason: decision.reason,
        digest: null,
        scheduled_for: decision.until.toISOString(),
        delivered_at: null,
      });
    } else if (decision.action === "bundle") {
      newlyBundled.push({ title: c.title, digest: decision.digest });
      notifications.push({
        ...base,
        status: "bundled",
        decision_reason: decision.reason,
        digest: decision.digest,
        scheduled_for: null,
        delivered_at: null,
      });
    } else {
      notifications.push({
        ...base,
        status: "suppressed",
        decision_reason: decision.reason,
        digest: null,
        scheduled_for: null,
        delivered_at: null,
      });
    }
  }

  // Summaries at the user's chosen time (within a few hours of it).
  const summaryAllowed = settings.inAppEnabled && !settings.pauseNonessential;
  const digestMinute = timeToMinutes(settings.dailyDigestTime);
  const nowMinute = localMinutes(now, timeZone);
  const inWindow = nowMinute >= digestMinute && nowMinute - digestMinute <= SUMMARY_WINDOW_MIN;
  const bundled = [...input.bundledSince, ...newlyBundled];
  if (summaryAllowed && settings.dailyDigestEnabled && inWindow) {
    const summary = buildDailySummary(
      input,
      bundled.filter((b) => b.digest === "daily").map((b) => b.title),
    );
    if (summary) {
      notifications.push({
        category: "planning",
        kind: "daily_summary",
        priority: "normal",
        title: summary.title,
        body: summary.body,
        action_url: "/nudges",
        related_type: null,
        related_id: null,
        dedupe_key: `daily_summary:${today}`,
        status: "delivered",
        decision_reason: null,
        digest: null,
        scheduled_for: null,
        delivered_at: now.toISOString(),
        expires_at: null,
      });
    }
  }
  if (
    summaryAllowed &&
    settings.weeklyDigestEnabled &&
    inWindow &&
    weekday(today) === settings.weeklyDigestDay
  ) {
    const summary = buildWeeklySummary(
      input,
      bundled.filter((b) => b.digest === "weekly").map((b) => b.title),
    );
    if (summary) {
      notifications.push({
        category: "planning",
        kind: "weekly_summary",
        priority: "normal",
        title: summary.title,
        body: summary.body,
        action_url: "/nudges",
        related_type: null,
        related_id: null,
        dedupe_key: `weekly_summary:${startOfWeek(today, input.weekStart)}`,
        status: "delivered",
        decision_reason: null,
        digest: null,
        scheduled_for: null,
        delivered_at: now.toISOString(),
        expires_at: null,
      });
    }
  }

  return { notifications, processedFinanceEvents, processedLifeEvents };
}
