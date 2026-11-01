import "server-only";
import { after } from "next/server";
import { wellbeingMemoryCandidates } from "@/lib/life/memory-candidates";
import {
  lifeMemoryState,
  recallCategory,
  recordSuggestionNotifications,
  rememberInBackground,
} from "@/lib/life/memory";
import { wellbeingSuggestionsFrom } from "@/lib/life/suggestion-rules";
import type { PlanningSuggestions } from "@/lib/planning/suggestions";
import { startOfWeek } from "@/lib/time/zoned";
import { loadWellbeingBasics, loadWellbeingLogs } from "./queries";

/**
 * Wellbeing context in Walrus Memory. Needs BOTH consents: "Store wellbeing
 * information" (to have logs at all) and "Remember wellbeing routines" (to
 * summarise them into memory). Only banded pattern summaries are stored.
 */
export async function wellbeingSuggestions(
  logs: Awaited<ReturnType<typeof loadWellbeingLogs>>,
): Promise<PlanningSuggestions> {
  const { supabase, user, today, timeZone, weekStart, prefs, consented } =
    await loadWellbeingBasics();
  const state = await lifeMemoryState(supabase, user.id, "memory_wellbeing");
  if (state.state !== "active" || !consented)
    return { memory: consented ? state.state : "no_consent", items: [] };

  const write = rememberInBackground(
    state,
    user.id,
    wellbeingMemoryCandidates({
      today,
      timeZone,
      prefs,
      sleep: logs.sleep,
      water: logs.water,
      activities: logs.activity,
      meals: logs.meals,
      moods: logs.moods,
    }),
  );
  if (write) after(write);

  const recalled = await recallCategory(supabase, user.id, state, "memory_wellbeing", [
    "sleep pattern bedtime average sleep",
    "water target hydration routine",
  ]);
  const { data: hydration } = await supabase
    .from("habits")
    .select("id")
    .eq("category", "hydration")
    .is("archived_at", null)
    .limit(1);
  const items = wellbeingSuggestionsFrom(recalled, prefs, (hydration ?? []).length > 0);
  if (items.length > 0) {
    after(() =>
      recordSuggestionNotifications(user.id, startOfWeek(today, weekStart), timeZone, items).catch(
        () => undefined,
      ),
    );
  }
  return { memory: "active", items };
}
