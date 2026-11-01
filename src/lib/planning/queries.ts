import "server-only";
import { cache } from "react";
import { getAppContext } from "@/lib/auth/session";
import { localToday } from "@/lib/finance/periods";
import { createClient } from "@/lib/supabase/server";
import type {
  CalendarEventExceptionRow,
  CalendarEventRow,
  HabitCheckInRow,
  HabitRow,
  PlanningPreferencesRow,
  ReviewRow,
  TaskCategoryRow,
  TaskRow,
} from "@/lib/supabase/database.types";
import { addDays } from "@/lib/time/zoned";
import { expandEvents, type Occurrence } from "./recurrence";

/** Reads go through the user's session, so RLS decides what is visible. */

export const DEFAULT_PLANNING_PREFS: Omit<PlanningPreferencesRow, "user_id" | "updated_at"> = {
  daily_review_enabled: true,
  daily_review_time: "20:30:00",
  weekly_review_enabled: true,
  weekly_review_day: 0,
  weekly_review_time: "18:00:00",
  weekly_finance_review: true,
};

export const loadPlanningBasics = cache(async () => {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const timeZone = preferences.time_zone;
  return {
    user,
    supabase,
    timeZone,
    locale: preferences.locale,
    weekStart: preferences.week_start,
    today: localToday(timeZone),
    /** One "now" per request, so a page renders consistently. */
    nowMs: Date.now(),
  };
});

export async function loadTasks(): Promise<{ tasks: TaskRow[]; categories: TaskCategoryRow[] }> {
  const { supabase } = await loadPlanningBasics();
  const [tasks, categories] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("created_at")
      .limit(1000),
    supabase.from("task_categories").select("*").order("name"),
  ]);
  if (tasks.error || categories.error) {
    throw new Error(
      "Planning data could not be loaded. Check that the Stage 5 database upgrade has been run (docs/SUPABASE_SETUP.md).",
    );
  }
  return { tasks: tasks.data ?? [], categories: categories.data ?? [] };
}

export async function loadOccurrences(
  from: string,
  to: string,
): Promise<{ occurrences: Occurrence[]; events: CalendarEventRow[] }> {
  const { supabase } = await loadPlanningBasics();
  const [single, recurring, exceptions] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .is("recurrence", null)
      .or(
        `and(starts_at.gte.${addDays(from, -15)}T00:00:00Z,starts_at.lte.${addDays(to, 2)}T00:00:00Z),and(start_date.gte.${addDays(from, -32)},start_date.lte.${to})`,
      )
      .limit(2000),
    supabase.from("calendar_events").select("*").not("recurrence", "is", null).limit(500),
    supabase
      .from("calendar_event_exceptions")
      .select("*")
      .gte("occurrence_date", addDays(from, -32))
      .lte("occurrence_date", to),
  ]);
  if (single.error || recurring.error || exceptions.error) {
    throw new Error(
      "Calendar could not be loaded. Check that the Stage 5 database upgrade has been run.",
    );
  }
  // De-duplicate by id (a row can only ever be one kind, but be defensive).
  const byId = new Map<string, CalendarEventRow>();
  for (const e of single.data ?? []) if (e.recurrence === null) byId.set(e.id, e);
  for (const e of recurring.data ?? []) if (e.recurrence !== null) byId.set(e.id, e);
  const events = [...byId.values()];
  return {
    events,
    occurrences: expandEvents(events, (exceptions.data ?? []) as CalendarEventExceptionRow[], {
      from,
      to,
    }),
  };
}

export async function loadHabits(
  sinceDays = 120,
): Promise<{ habits: HabitRow[]; checkIns: HabitCheckInRow[] }> {
  const { supabase, today } = await loadPlanningBasics();
  const [habits, checkIns] = await Promise.all([
    supabase
      .from("habits")
      .select("*")
      .order("archived_at", { nullsFirst: true })
      .order("created_at"),
    supabase
      .from("habit_check_ins")
      .select("*")
      .gte("on_date", addDays(today, -sinceDays))
      .limit(5000),
  ]);
  if (habits.error || checkIns.error) throw new Error("Habits could not be loaded.");
  return { habits: habits.data ?? [], checkIns: checkIns.data ?? [] };
}

export async function loadReviews(limit = 30): Promise<ReviewRow[]> {
  const { supabase } = await loadPlanningBasics();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Reviews could not be loaded.");
  return data ?? [];
}

export async function loadPlanningPrefs() {
  const { supabase } = await loadPlanningBasics();
  const { data } = await supabase.from("planning_preferences").select("*").maybeSingle();
  return { ...DEFAULT_PLANNING_PREFS, ...(data ?? {}) };
}

export const TASK_STATUS_LABEL: Record<TaskRow["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const EVENT_CATEGORY_LABEL: Record<CalendarEventRow["category"], string> = {
  personal: "Personal",
  work: "Work",
  health: "Health",
  finance: "Finance",
  social: "Social",
  learning: "Learning",
  other: "Other",
};

export const HABIT_CATEGORY_LABEL: Record<HabitRow["category"], string> = {
  health: "Health",
  fitness: "Fitness",
  mind: "Mind",
  learning: "Learning",
  finance: "Finance",
  sleep: "Sleep",
  hydration: "Hydration",
  routine: "Routine",
  other: "Other",
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Format an instant as HH:MM in a zone. */
export function timeIn(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
}

/** "Wed 4 Nov" for a local date string. */
export function dayLabel(
  date: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
