import { habitStats } from "@/lib/planning/habits";
import type { RecalledMemory } from "@/lib/memory/types";
import type {
  HabitCheckInRow,
  HabitRow,
  WellbeingPreferencesRow,
} from "@/lib/supabase/database.types";
import { timeToMinutes } from "@/lib/time/zoned";
import { partOfDay } from "./memory-candidates";
import type { MemorySuggestion } from "./memory";

/**
 * Deterministic suggestions from memories RECALLED FROM WALRUS plus the
 * user's current records. No AI: each rule is explicit, every suggestion
 * names the memory it came from, and nothing happens unless the user acts.
 * Wording avoids pressure and never gives medical advice.
 */

const PART_TIME: Record<string, string> = {
  "early morning": "06:30",
  morning: "08:00",
  afternoon: "13:00",
  evening: "19:00",
  night: "21:30",
};

const blob = (m: RecalledMemory) => ({ blobId: m.blobId, summary: m.summary });

export function planningSuggestionsFrom(
  memories: RecalledMemory[],
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
  >[],
  checkIns: Pick<HabitCheckInRow, "habit_id" | "on_date" | "status">[],
  today: string,
): MemorySuggestion[] {
  const out: MemorySuggestion[] = [];
  const active = new Map(habits.filter((h) => !h.archived_at).map((h) => [h.id, h]));
  const routine = memories.find((m) => m.kind === "routine_preference");

  for (const m of memories.filter((x) => x.kind === "habit_pattern")) {
    const h = active.get(m.facts.habit_key ?? "");
    if (!h) continue;
    const consistency = Number(m.facts.consistency_band_pct);
    const now = habitStats(
      h,
      checkIns.filter((c) => c.habit_id === h.id),
      today,
      14,
    );
    if (!(consistency <= 60) || (now.consistencyPct !== null && now.consistencyPct > 70)) continue;
    const usual = m.facts.usual_time;
    if (
      usual &&
      usual !== "unknown" &&
      h.reminder_time &&
      partOfDay(timeToMinutes(h.reminder_time)) !== usual
    ) {
      out.push({
        id: `move_reminder:${h.id}:${usual}`,
        title: `Move the ${h.name} reminder to the ${usual}?`,
        body: `You usually do ${h.name} in the ${usual}, but the reminder is set for ${h.reminder_time.slice(0, 5)}. A reminder around ${PART_TIME[usual]} may fit your day better.`,
        actionUrl: "/planning/habits",
        memory: blob(m),
      });
    } else if (m.facts.often_missed && m.facts.often_missed !== "none" && h.frequency === "daily") {
      out.push({
        id: `rest_day:${h.id}:${m.facts.often_missed}`,
        title: `Make ${m.facts.often_missed} a rest day for ${h.name}?`,
        body: `${m.facts.often_missed} is when ${h.name} is most often missed. Choosing specific days keeps your streak honest without pressure.`,
        actionUrl: "/planning/habits",
        memory: blob(m),
      });
    }
  }

  if (routine) {
    const part = routine.facts.preferred_part_of_day;
    for (const h of active.values()) {
      if (h.reminder_time || out.length >= 4) continue;
      const stats = habitStats(
        h,
        checkIns.filter((c) => c.habit_id === h.id),
        today,
        14,
      );
      if (stats.consistencyPct !== null && stats.consistencyPct < 60 && part && PART_TIME[part]) {
        out.push({
          id: `add_reminder:${h.id}:${part}`,
          title: `Add a ${part} reminder for ${h.name}?`,
          body: `You tend to complete routines in the ${part}. A gentle reminder around ${PART_TIME[part]} could help.`,
          actionUrl: "/planning/habits",
          memory: blob(routine),
        });
      }
    }
  }
  return out.slice(0, 4);
}

export function wellbeingSuggestionsFrom(
  memories: RecalledMemory[],
  prefs: Pick<WellbeingPreferencesRow, "water_target_ml" | "sleep_target_minutes">,
  hasHydrationHabit: boolean,
): MemorySuggestion[] {
  const out: MemorySuggestion[] = [];
  const sleep = memories.find((m) => m.kind === "sleep_pattern");
  if (sleep) {
    const avg = Number(sleep.facts.average_sleep_minutes);
    if (Number.isFinite(avg) && avg < prefs.sleep_target_minutes - 30) {
      out.push({
        id: `sleep_routine:${sleep.facts.usual_bedtime}`,
        title: "A wind-down routine for your sleep target?",
        body: `Your recent nights average about ${Math.floor(avg / 60)} h ${Math.round(avg % 60)} min against a ${Math.floor(prefs.sleep_target_minutes / 60)} h target. Some people find a regular wind-down time helps — you could add it as a habit with a reminder. This isn't medical advice.`,
        actionUrl: "/planning/habits",
        memory: blob(sleep),
      });
    }
  }
  const water = memories.find((m) => m.kind === "water_pattern");
  if (water && Number(water.facts.target_met_band_pct) <= 50 && !hasHydrationHabit) {
    out.push({
      id: `hydration_habit`,
      title: "A midday water reminder?",
      body: `You meet your water target on about ${water.facts.target_met_band_pct}% of logged days. A hydration habit with an afternoon reminder could make it easier.`,
      actionUrl: "/planning/habits",
      memory: blob(water),
    });
  }
  return out;
}
