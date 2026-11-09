import "server-only";
import { getAppContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/paging";

/** Read-only: viewing Replay or Impact must never generate advice or write memory. */
export async function loadDecisionHistory() {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const [recommendations, memories, consent] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recommendations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("memory_records")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("consent_state")
      .select("granted")
      .eq("category", "memory_financial")
      .maybeSingle(),
  ]);
  if (recommendations.error || memories.error || consent.error)
    throw new Error("Decision history could not be loaded. Please try again.");
  return {
    user,
    preferences,
    recommendations: recommendations.data,
    memories: memories.data,
    truncated: recommendations.truncated || memories.truncated,
    memoryAllowed: !preferences.memory_paused && consent.data?.granted === true,
  };
}
