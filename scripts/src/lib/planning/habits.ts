import type { HabitCheckInRow, HabitRow } from "@/lib/supabase/database.types";
import { addDays, diffDays, weekday } from "@/lib/time/zoned";

/**
 * Habit schedules, streaks and consistency.
 *
 * All dates are LOCAL calendar dates in the habit's own time zone, so a
 * streak never breaks because a server or a trip crossed midnight elsewhere.
 * A "skipped" check-in is an intentional rest day: it neither counts as done
 * nor breaks a streak. Today never breaks a streak — it isn't over yet.
 */

export type HabitSchedule = Pick<HabitRow, "frequency" | "weekdays" | "start_on" | "end_on">;
export type CheckIn = Pick<HabitCheckInRow, "on_date" | "status">;

export function isScheduled(habit: HabitSchedule, date: string): boolean {
  if (date < habit.start_on) return false;
  if (habit.end_on && date > habit.end_on) return false;
  if (habit.frequency === "daily") return true;
  return (habit.weekdays ?? []).includes(weekday(date));
}

export interface HabitStats {
  /** Consecutive scheduled days completed, up to today (today counts only if done). */
  currentStreak: number;
  longestStreak: number;
  /** Over the window: done ÷ scheduled days that are over (rest days excluded). */
  consistencyPct: number | null;
  scheduledDays: number;
  doneDays: number;
  /** Scheduled past days with no check-in. */
  missedDays: string[];
  doneToday: boolean;
  scheduledToday: boolean;
}

export function habitStats(
  habit: HabitSchedule,
  checkIns: CheckIn[],
  today: string,
  windowDays = 30,
): HabitStats {
  const status = new Map(checkIns.map((c) => [c.on_date, c.status]));
  const scheduledToday = isScheduled(habit, today);
  const doneToday = status.get(today) === "done";

  // Current streak: walk back from today (or yesterday if today isn't done yet).
  let current = 0;
  let d = doneToday ? today : addDays(today, -1);
  for (let i = 0; i < 3660 && d >= habit.start_on; i += 1, d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    const s = status.get(d);
    if (s === "done") current += 1;
    else if (s === "skipped") continue;
    else break;
  }

  // Longest streak since the start.
  let longest = 0;
  let run = 0;
  const lastDay = habit.end_on && habit.end_on < today ? habit.end_on : today;
  for (let day = habit.start_on, i = 0; day <= lastDay && i < 3660; day = addDays(day, 1), i += 1) {
    if (!isScheduled(habit, day)) continue;
    const s = status.get(day);
    if (s === "done") {
      run += 1;
      longest = Math.max(longest, run);
    } else if (s === "skipped" || day === today) {
      continue;
    } else {
      run = 0;
    }
  }

  // Consistency and missed days over the window (days that are already over).
  const windowStart = maxDate(habit.start_on, addDays(today, -(windowDays - 1)));
  let scheduled = 0;
  let done = 0;
  const missed: string[] = [];
  for (let day = windowStart; day <= lastDay; day = addDays(day, 1)) {
    if (!isScheduled(habit, day)) continue;
    const s = status.get(day);
    if (day === today) {
      if (s === "done") {
        scheduled += 1;
        done += 1;
      }
      continue;
    }
    if (s === "skipped") continue;
    scheduled += 1;
    if (s === "done") done += 1;
    else missed.push(day);
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    consistencyPct: scheduled > 0 ? Math.round((done / scheduled) * 100) : null,
    scheduledDays: scheduled,
    doneDays: done,
    missedDays: missed,
    doneToday,
    scheduledToday,
  };
}

/** Number of scheduled days in a row, ending yesterday, without any check-in. */
export function consecutiveMissed(
  habit: HabitSchedule,
  checkIns: CheckIn[],
  today: string,
): number {
  const status = new Map(checkIns.map((c) => [c.on_date, c.status]));
  let n = 0;
  for (
    let d = addDays(today, -1), i = 0;
    d >= habit.start_on && i < 400;
    d = addDays(d, -1), i += 1
  ) {
    if (!isScheduled(habit, d)) continue;
    if (status.has(d)) break;
    n += 1;
  }
  return n;
}

/** Per-day status for a range (for weekly/monthly history grids). */
export function habitHistory(
  habit: HabitSchedule,
  checkIns: CheckIn[],
  from: string,
  to: string,
  today: string,
): Array<{
  date: string;
  state: "done" | "skipped" | "missed" | "pending" | "unscheduled" | "future";
}> {
  const status = new Map(checkIns.map((c) => [c.on_date, c.status]));
  const out: Array<{
    date: string;
    state: "done" | "skipped" | "missed" | "pending" | "unscheduled" | "future";
  }> = [];
  for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i += 1) {
    const s = status.get(d);
    if (s === "done" || s === "skipped") out.push({ date: d, state: s });
    else if (!isScheduled(habit, d)) out.push({ date: d, state: "unscheduled" });
    else if (d > today) out.push({ date: d, state: "future" });
    else if (d === today) out.push({ date: d, state: "pending" });
    else out.push({ date: d, state: "missed" });
  }
  return out;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** Streak lengths worth a quiet note of encouragement. */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export function daysBetween(a: string, b: string): number {
  return diffDays(a, b);
}
