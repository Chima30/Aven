import { habitStats, isScheduled } from "@/lib/planning/habits";
import type { MemoryCandidate } from "@/lib/memory/types";
import type {
  ActivityLogRow,
  HabitCheckInRow,
  HabitRow,
  MealLogRow,
  MoodLogRow,
  NotificationPreferencesRow,
  SleepLogRow,
  WaterLogRow,
  WellbeingPreferencesRow,
} from "@/lib/supabase/database.types";
import { addDays, localDate, localMinutes, minutesToTime } from "@/lib/time/zoned";

/**
 * Summaries — not copies of records — that AVEN may keep in Walrus Memory
 * for Planning, the Nudge Center and Wellbeing. Pure and deterministic.
 *
 * Values are put into BANDS (10% consistency, 15-minute sleep, 30-minute
 * bedtimes…) and computed over a window ENDING YESTERDAY, so the same habit
 * produces the same text day after day: the content hash dedupe then writes
 * a new memory only when the pattern really changes. No individual record,
 * note or free text is copied.
 */

const band = (v: number, size: number) => Math.round(v / size) * size;

export function partOfDay(
  minutes: number,
): "early morning" | "morning" | "afternoon" | "evening" | "night" {
  if (minutes < 6 * 60) return "early morning";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 22 * 60) return "evening";
  return "night";
}

function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function planningMemoryCandidates(input: {
  today: string;
  timeZone: string;
  habits: Pick<
    HabitRow,
    | "id"
    | "name"
    | "frequency"
    | "weekdays"
    | "start_on"
    | "end_on"
    | "reminder_time"
    | "archived_at"
  >[];
  checkIns: Pick<HabitCheckInRow, "habit_id" | "on_date" | "status" | "created_at">[];
  notifications: Pick<
    NotificationPreferencesRow,
    | "daily_digest_enabled"
    | "daily_digest_time"
    | "quiet_hours_enabled"
    | "quiet_hours_start"
    | "quiet_hours_end"
    | "pause_nonessential"
  > | null;
  categoriesOff: string[];
  dailyReviewTime: string | null;
}): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const yesterday = addDays(input.today, -1);
  const observedOn = yesterday;

  // Habit patterns (habits with at least 14 days of history).
  for (const h of input.habits.filter(
    (x) => !x.archived_at && x.start_on <= addDays(yesterday, -13),
  )) {
    const checks = input.checkIns.filter((c) => c.habit_id === h.id);
    const stats = habitStats(h, checks, yesterday, 28);
    if (stats.consistencyPct === null || stats.scheduledDays < 7) continue;
    const doneTimes = checks
      // Only check-ins made on the day itself say when the habit actually happens.
      .filter(
        (c) =>
          c.status === "done" && c.on_date === localDate(new Date(c.created_at), input.timeZone),
      )
      .map((c) => localMinutes(new Date(c.created_at), input.timeZone));
    const usual =
      doneTimes.length >= 5
        ? partOfDay(band(mode(doneTimes.map((m) => band(m, 60))) ?? 0, 60))
        : null;
    // The weekday most often missed (only if it stands out).
    const missedDays = stats.missedDays.map((d) => new Date(`${d}T12:00:00Z`).getUTCDay());
    const weakest = missedDays.length >= 3 ? mode(missedDays) : null;
    const consistency = band(stats.consistencyPct, 10);
    out.push({
      category: "memory_planning",
      kind: "habit_pattern",
      label: `Habit pattern · ${h.name}`,
      facts: {
        habit_key: h.id,
        habit_name: h.name,
        consistency_band_pct: consistency,
        usual_time: usual ?? "unknown",
        often_missed: weakest !== null ? WEEKDAY[weakest]! : "none",
        reminder_time: h.reminder_time ? h.reminder_time.slice(0, 5) : "none",
      },
      summary: `${h.name} is done about ${consistency}% of scheduled days${usual ? `, usually in the ${usual}` : ""}${weakest !== null ? `; most often missed on ${WEEKDAY[weakest]}` : ""}.`,
      observedOn,
      sourceRefs: [{ table: "habits", id: h.id }],
      durability: "long_term",
    });
  }

  // When the user tends to do their routines.
  const allTimes = input.checkIns
    .filter(
      (c) =>
        c.status === "done" &&
        c.on_date >= addDays(yesterday, -27) &&
        c.on_date <= yesterday &&
        c.on_date === localDate(new Date(c.created_at), input.timeZone),
    )
    .map((c) => partOfDay(localMinutes(new Date(c.created_at), input.timeZone)));
  const preferred = allTimes.length >= 10 ? mode(allTimes) : null;
  if (preferred) {
    out.push({
      category: "memory_planning",
      kind: "routine_preference",
      label: "Routine timing",
      facts: { preferred_part_of_day: preferred },
      summary: `The user usually completes routines in the ${preferred}.`,
      observedOn,
      sourceRefs: [{ table: "habit_check_ins", id: `window:${yesterday}` }],
      durability: "long_term",
    });
  }

  if (input.dailyReviewTime) {
    const part = partOfDay(
      Number(input.dailyReviewTime.slice(0, 2)) * 60 + Number(input.dailyReviewTime.slice(3, 5)),
    );
    out.push({
      category: "memory_planning",
      kind: "scheduling_preference",
      label: "Planning time",
      facts: {
        daily_review_part_of_day: part,
        daily_review_time: input.dailyReviewTime.slice(0, 5),
      },
      summary: `The user prefers to plan and review in the ${part} (daily review at ${input.dailyReviewTime.slice(0, 5)}).`,
      observedOn: input.today,
      sourceRefs: [{ table: "planning_preferences", id: "daily_review_time" }],
      durability: "long_term",
    });
  }

  if (input.notifications) {
    const n = input.notifications;
    out.push({
      category: "memory_planning",
      kind: "notification_preference",
      label: "Reminder preferences",
      facts: {
        daily_summary: n.daily_digest_enabled ? n.daily_digest_time.slice(0, 5) : "off",
        quiet_hours: n.quiet_hours_enabled
          ? `${n.quiet_hours_start.slice(0, 5)}-${n.quiet_hours_end.slice(0, 5)}`
          : "off",
        paused: n.pause_nonessential,
        categories_off: input.categoriesOff.length
          ? [...input.categoriesOff].sort().join(" ")
          : "none",
      },
      summary: `The user wants ${n.daily_digest_enabled ? `one daily summary at ${n.daily_digest_time.slice(0, 5)}` : "no daily summary"}${n.quiet_hours_enabled ? ` and quiet hours ${n.quiet_hours_start.slice(0, 5)} to ${n.quiet_hours_end.slice(0, 5)}` : ""}${input.categoriesOff.length ? `; has turned off ${input.categoriesOff.join(", ").replace(/_/g, " ")}` : ""}.`,
      observedOn: input.today,
      sourceRefs: [{ table: "notification_preferences", id: "settings" }],
      durability: "long_term",
    });
  }
  return out;
}

export function wellbeingMemoryCandidates(input: {
  today: string;
  timeZone: string;
  prefs: Pick<WellbeingPreferencesRow, "water_target_ml" | "sleep_target_minutes">;
  sleep: Pick<SleepLogRow, "slept_at" | "wake_date" | "duration_minutes">[];
  water: Pick<WaterLogRow, "local_date" | "amount_ml">[];
  activities: Pick<ActivityLogRow, "activity_type" | "duration_minutes" | "on_date">[];
  meals: Pick<MealLogRow, "meal_type" | "local_date">[];
  moods: Pick<MoodLogRow, "local_date" | "mood" | "energy" | "stress">[];
}): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const yesterday = addDays(input.today, -1);
  const from = addDays(yesterday, -13);
  const inWindow = (d: string) => d >= from && d <= yesterday;
  const src = [{ table: "wellbeing", id: `window:${yesterday}` }];

  const nights = input.sleep.filter((s) => inWindow(s.wake_date));
  if (nights.length >= 5) {
    const avg = nights.reduce((s, n) => s + n.duration_minutes, 0) / nights.length;
    const bed =
      band(
        nights.reduce((s, n) => {
          const m = localMinutes(new Date(n.slept_at), input.timeZone);
          return s + (m < 12 * 60 ? m + 24 * 60 : m); // after-midnight bedtimes count as late
        }, 0) / nights.length,
        30,
      ) %
      (24 * 60);
    const avgBand = band(avg, 15);
    out.push({
      category: "memory_wellbeing",
      kind: "sleep_pattern",
      label: "Sleep pattern",
      facts: {
        average_sleep_minutes: avgBand,
        usual_bedtime: minutesToTime(bed),
        target_minutes: input.prefs.sleep_target_minutes,
      },
      summary: `Recently sleeps about ${Math.floor(avgBand / 60)} h ${avgBand % 60} min a night, usually going to bed around ${minutesToTime(bed)}.`,
      observedOn: yesterday,
      sourceRefs: src,
      durability: "long_term",
    });
  }

  const waterDays = new Map<string, number>();
  for (const w of input.water.filter((x) => inWindow(x.local_date)))
    waterDays.set(w.local_date, (waterDays.get(w.local_date) ?? 0) + w.amount_ml);
  if (waterDays.size >= 5) {
    const onTarget = [...waterDays.values()].filter((v) => v >= input.prefs.water_target_ml).length;
    const pct = band((onTarget / waterDays.size) * 100, 10);
    out.push({
      category: "memory_wellbeing",
      kind: "water_pattern",
      label: "Water intake",
      facts: {
        target_met_band_pct: pct,
        logged_days: waterDays.size >= 10 ? "most" : "some",
        target_ml: input.prefs.water_target_ml,
      },
      summary: `Meets the daily water target on about ${pct}% of logged days.`,
      observedOn: yesterday,
      sourceRefs: src,
      durability: "long_term",
    });
  }

  const acts = input.activities.filter((a) => inWindow(a.on_date));
  if (acts.length >= 3) {
    const common = mode(acts.map((a) => a.activity_type))!;
    const perWeek = band(acts.reduce((s, a) => s + a.duration_minutes, 0) / 2, 15);
    out.push({
      category: "memory_wellbeing",
      kind: "activity_routine",
      label: "Activity routine",
      facts: { most_common: common, weekly_minutes_band: perWeek },
      summary: `Usually stays active through ${common.replace("_", " ")}, about ${perWeek} minutes a week.`,
      observedOn: yesterday,
      sourceRefs: src,
      durability: "long_term",
    });
  }

  const meals = input.meals.filter((m) => inWindow(m.local_date));
  if (meals.length >= 7) {
    const days = new Set(meals.map((m) => m.local_date)).size;
    const regular = (["breakfast", "lunch", "dinner"] as const).filter(
      (t) => meals.filter((m) => m.meal_type === t).length >= Math.ceil(days * 0.6),
    );
    out.push({
      category: "memory_wellbeing",
      kind: "meal_routine",
      label: "Meal routine",
      facts: { regular_meals: regular.length ? regular.join(" ") : "varies" },
      summary: regular.length
        ? `Regularly logs ${regular.join(", ")}.`
        : "Meal times vary from day to day.",
      observedOn: yesterday,
      sourceRefs: src,
      durability: "long_term",
    });
  }

  const moods = input.moods.filter((m) => inWindow(m.local_date));
  const avgOf = (k: "mood" | "energy" | "stress") => {
    const v = moods.map((m) => m[k]).filter((x): x is number => x !== null);
    return v.length >= 5 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const mood = avgOf("mood");
  const energy = avgOf("energy");
  if (mood !== null || energy !== null) {
    out.push({
      category: "memory_wellbeing",
      kind: "mood_pattern",
      label: "Mood and energy",
      facts: {
        typical_mood_1_to_5: mood ?? "unknown",
        typical_energy_1_to_5: energy ?? "unknown",
        typical_stress_1_to_5: avgOf("stress") ?? "unknown",
      },
      summary: `Over the last two weeks, mood has typically been ${mood ?? "?"}/5 and energy ${energy ?? "?"}/5 (self-reported).`,
      observedOn: yesterday,
      sourceRefs: src,
      durability: "long_term",
    });
  }

  out.push({
    category: "memory_wellbeing",
    kind: "wellbeing_goal",
    label: "Wellbeing targets",
    facts: {
      water_target_ml: input.prefs.water_target_ml,
      sleep_target_minutes: input.prefs.sleep_target_minutes,
    },
    summary: `Aims for ${input.prefs.water_target_ml / 1000} L of water a day and ${Math.floor(input.prefs.sleep_target_minutes / 60)} h ${input.prefs.sleep_target_minutes % 60} min of sleep.`,
    observedOn: input.today,
    sourceRefs: [{ table: "wellbeing_preferences", id: "targets" }],
    durability: "long_term",
  });
  return out;
}

/** A user-approved reflection from a review (only the "next focus" in their own words). */
export function reviewReflectionCandidate(
  kind: "daily" | "weekly",
  periodStart: string,
  nextFocus: string,
): MemoryCandidate {
  return {
    category: "memory_planning",
    kind: "review_reflection",
    label: `${kind === "weekly" ? "Weekly" : "Daily"} review focus · ${periodStart}`,
    facts: { review_kind: kind, period_start: periodStart },
    summary: `Focus noted in the ${kind} review: ${nextFocus.replace(/\s+/g, " ").slice(0, 240)}`,
    observedOn: periodStart,
    sourceRefs: [{ table: "reviews", id: `${kind}:${periodStart}` }],
    durability: "long_term",
  };
}

/** A correction the user wrote for a memory they found inaccurate. */
export function correctionCandidate(
  category: MemoryCandidate["category"],
  correctsLabel: string,
  statement: string,
  today: string,
): MemoryCandidate {
  return {
    category,
    kind: "correction",
    label: `Correction · ${correctsLabel}`.slice(0, 160),
    facts: { corrects: correctsLabel.slice(0, 100) },
    summary: `User correction: ${statement.replace(/\s+/g, " ").slice(0, 260)}`,
    observedOn: today,
    sourceRefs: [{ table: "memory_records", id: "correction" }],
    durability: "long_term",
  };
}

export { isScheduled };
