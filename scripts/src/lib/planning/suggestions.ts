import "server-only";
import { after } from "next/server";
import { planningMemoryCandidates } from "@/lib/life/memory-candidates";
import {
  lifeMemoryState,
  recallCategory,
  recordSuggestionNotifications,
  rememberInBackground,
  type MemorySuggestion,
} from "@/lib/life/memory";
import { planningSuggestionsFrom } from "@/lib/life/suggestion-rules";
import type { HabitCheckInRow, HabitRow } from "@/lib/supabase/database.types";
import { startOfWeek } from "@/lib/time/zoned";
import { loadPlanningBasics } from "./queries";

export interface PlanningSuggestions {
  memory: "active" | "unavailable" | "no_consent" | "paused";
  items: MemorySuggestion[];
}

/**
 * Planning context in Walrus Memory: writes pattern summaries in the
 * background and turns recalled memories into suggestions (needs the
 * "Remember planning preferences" consent).
 */
export async function planningSuggestions(
  userId: string,
  data: {
    habits: HabitRow[];
    checkIns: HabitCheckInRow[];
    prefs: { daily_review_enabled: boolean; daily_review_time: string };
    timeZone: string;
    today: string;
  },
): Promise<PlanningSuggestions> {
  const { supabase, weekStart } = await loadPlanningBasics();
  const state = await lifeMemoryState(supabase, userId, "memory_planning");
  if (state.state !== "active") return { memory: state.state, items: [] };

  const [{ data: notif }, { data: cats }] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("notification_category_preferences").select("category, frequency"),
  ]);
  const candidates = planningMemoryCandidates({
    today: data.today,
    timeZone: data.timeZone,
    habits: data.habits,
    checkIns: data.checkIns,
    notifications: notif,
    categoriesOff: (cats ?? []).filter((c) => c.frequency === "off").map((c) => c.category),
    dailyReviewTime: data.prefs.daily_review_enabled ? data.prefs.daily_review_time : null,
  });
  const write = rememberInBackground(state, userId, candidates);
  if (write) after(write);

  const recalled = await recallCategory(supabase, userId, state, "memory_planning", [
    "habit pattern usually done consistency missed",
    "routine timing preferred part of day planning time",
  ]);
  const items = planningSuggestionsFrom(recalled, data.habits, data.checkIns, data.today);
  if (items.length > 0) {
    const week = startOfWeek(data.today, weekStart);
    after(() =>
      recordSuggestionNotifications(userId, week, data.timeZone, items).catch(() => undefined),
    );
  }
  return { memory: "active", items };
}
