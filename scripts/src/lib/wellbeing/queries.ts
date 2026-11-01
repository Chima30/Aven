import "server-only";
import { cache } from "react";
import { loadPlanningBasics } from "@/lib/planning/queries";
import type {
  ActivityLogRow,
  MealLogRow,
  MoodLogRow,
  SleepLogRow,
  WaterLogRow,
  WellbeingPreferencesRow,
} from "@/lib/supabase/database.types";
import { addDays } from "@/lib/time/zoned";

export const DEFAULT_WELLBEING_PREFS: Omit<WellbeingPreferencesRow, "user_id" | "updated_at"> = {
  water_unit: "ml",
  water_target_ml: 2000,
  distance_unit: "km",
  sleep_target_minutes: 480,
};

/** Signed-in user, regional settings, wellbeing consent and preferences. */
export const loadWellbeingBasics = cache(async () => {
  const basics = await loadPlanningBasics();
  const [{ data: consent }, { data: prefs }] = await Promise.all([
    basics.supabase
      .from("consent_state")
      .select("granted")
      .eq("category", "wellbeing_data")
      .maybeSingle(),
    basics.supabase
      .from("wellbeing_preferences")
      .select("*")
      .eq("user_id", basics.user.id)
      .maybeSingle(),
  ]);
  const measurementDefault = prefs ?? {
    ...DEFAULT_WELLBEING_PREFS,
    ...(basics.locale === "en-US"
      ? { water_unit: "fl_oz" as const, distance_unit: "mi" as const }
      : {}),
  };
  return { ...basics, consented: consent?.granted === true, prefs: measurementDefault };
});

/** Logs from the last `days` local days (inclusive of today). Real records only. */
export async function loadWellbeingLogs(days: number) {
  const { supabase, today } = await loadWellbeingBasics();
  const since = addDays(today, -(days - 1));
  const [sleep, water, meals, activity, moods] = await Promise.all([
    supabase
      .from("sleep_logs")
      .select("*")
      .gte("wake_date", since)
      .order("wake_date", { ascending: false })
      .order("woke_at", { ascending: false })
      .limit(400),
    supabase
      .from("water_logs")
      .select("*")
      .gte("local_date", since)
      .order("logged_at", { ascending: false })
      .limit(2000),
    supabase
      .from("meal_logs")
      .select("*")
      .gte("local_date", since)
      .order("eaten_at", { ascending: false })
      .limit(1000),
    supabase
      .from("activity_logs")
      .select("*")
      .gte("on_date", since)
      .order("on_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("mood_logs")
      .select("*")
      .gte("local_date", since)
      .order("logged_at", { ascending: false })
      .limit(1000),
  ]);
  return {
    since,
    sleep: (sleep.data ?? []) as SleepLogRow[],
    water: (water.data ?? []) as WaterLogRow[],
    meals: (meals.data ?? []) as MealLogRow[],
    activity: (activity.data ?? []) as ActivityLogRow[],
    moods: (moods.data ?? []) as MoodLogRow[],
  };
}

export const MEAL_LABEL: Record<MealLogRow["meal_type"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const ACTIVITY_LABEL: Record<ActivityLogRow["activity_type"], string> = {
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
  gym: "Gym",
  swimming: "Swimming",
  sports: "Sports",
  home_workout: "Home workout",
  other: "Other",
};

/** Dates from `from` to `to` inclusive, oldest first. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
