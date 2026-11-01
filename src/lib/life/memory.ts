import "server-only";
import { decideDelivery } from "@/lib/nudges/engine";
import type { NudgeSettings } from "@/lib/nudges/types";
import { canRecall } from "@/lib/memory/policy";
import { memoryRuntimeFor, type MemoryRuntime } from "@/lib/memory/runtime";
import { recallMemories, refreshMemoryJobs, rememberCandidate } from "@/lib/memory/service";
import type { MemoryCandidate, MemoryCategory, RecalledMemory } from "@/lib/memory/types";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * The bridge between Planning/Wellbeing and the EXISTING Walrus Memory
 * integration (src/lib/memory). Nothing here talks to MemWal directly: writes
 * go through rememberCandidate() (policy gate, consent, dedupe, job tracking)
 * and reads through recallMemories() (namespace, consent and forget filters).
 */

export interface MemorySuggestion {
  id: string;
  title: string;
  body: string;
  actionUrl: string;
  memory: { blobId: string; summary: string };
}

export type LifeMemoryState =
  | { state: "active"; runtime: Extract<MemoryRuntime, { available: true }> }
  | { state: "unavailable" | "no_consent" | "paused" };

export async function lifeMemoryState(
  supabase: ServerSupabase,
  userId: string,
  category: MemoryCategory,
): Promise<LifeMemoryState> {
  const runtime = await memoryRuntimeFor(supabase, userId);
  if (!runtime.available) return { state: "unavailable" };
  if (runtime.ctx.memoryPaused) return { state: "paused" };
  if (!canRecall(category, runtime.ctx)) return { state: "no_consent" };
  return { state: "active", runtime };
}

/** Recall memories of one category (rate-limited; failures mean "no memories"). */
export async function recallCategory(
  supabase: ServerSupabase,
  userId: string,
  state: LifeMemoryState,
  category: MemoryCategory,
  queries: string[],
): Promise<RecalledMemory[]> {
  if (state.state !== "active") return [];
  if (!(await consumeRateLimit(supabase, "memory_read"))) return [];
  try {
    const batches = await Promise.all(
      queries.map((q) =>
        recallMemories(state.runtime.deps, userId, q, state.runtime.ctx, {
          limit: 20,
          categories: [category],
        }),
      ),
    );
    const byBlob = new Map<string, RecalledMemory>();
    for (const m of batches.flat()) if (!byBlob.has(m.blobId)) byBlob.set(m.blobId, m);
    return [...byBlob.values()];
  } catch (error) {
    console.error("[life-memory] recall failed:", error instanceof Error ? error.name : "error");
    return [];
  }
}

/**
 * Background job (run with after()): store pattern summaries. Content-hash
 * dedupe means an unchanged pattern is never written twice.
 */
export function rememberInBackground(
  state: LifeMemoryState,
  userId: string,
  candidates: MemoryCandidate[],
) {
  if (state.state !== "active" || candidates.length === 0) return null;
  const { deps, ctx } = state.runtime;
  return async () => {
    for (const c of candidates.slice(0, 10)) {
      try {
        await rememberCandidate(deps, userId, c, ctx);
      } catch (error) {
        console.error("[life-memory] write failed:", error instanceof Error ? error.name : "error");
      }
    }
    await refreshMemoryJobs(deps, userId, { deadlineMs: 15_000 }).catch(() => undefined);
  };
}

/**
 * Records memory-supported suggestions in the Nudge Center under the
 * "suggestions" category, subject to the same deterministic delivery rules
 * (category off → suppressed; digest → bundled). One per suggestion per week.
 */
export async function recordSuggestionNotifications(
  userId: string,
  week: string,
  timeZone: string,
  suggestions: MemorySuggestion[],
) {
  if (suggestions.length === 0) return;
  const admin = createAdminClient();
  const [{ data: prefs }, { data: cat }] = await Promise.all([
    admin.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("notification_category_preferences")
      .select("frequency")
      .eq("user_id", userId)
      .eq("category", "suggestions")
      .maybeSingle(),
  ]);
  if (!prefs) return;
  const settings: NudgeSettings = {
    inAppEnabled: prefs.in_app_enabled,
    dailyDigestEnabled: prefs.daily_digest_enabled,
    dailyDigestTime: prefs.daily_digest_time,
    weeklyDigestEnabled: prefs.weekly_digest_enabled,
    weeklyDigestDay: prefs.weekly_digest_day,
    quietHoursEnabled: prefs.quiet_hours_enabled,
    quietHoursStart: prefs.quiet_hours_start,
    quietHoursEnd: prefs.quiet_hours_end,
    pauseNonessential: prefs.pause_nonessential,
    maxNudgesPerDay: prefs.max_nudges_per_day,
    timeZone,
    categoryFrequency: { suggestions: cat?.frequency ?? "daily_digest" },
  };
  const now = new Date();
  const rows = suggestions.map((s) => {
    // AI-free and system-sourced: never user-scheduled, so quiet hours and limits apply.
    const d = decideDelivery(
      { id: s.id, category: "suggestions", source: "system", occurredAt: now },
      settings,
      { now, deliveredToday: 0 },
    );
    return {
      user_id: userId,
      category: "suggestions" as const,
      kind: "suggestion" as const,
      priority: "low" as const,
      title: s.title.slice(0, 120),
      body: `${s.body}\n\nBased on a memory from Walrus: “${s.memory.summary.slice(0, 200)}”`,
      action_url: s.actionUrl,
      related_type: null,
      related_id: null,
      dedupe_key: `suggestion:${s.id}:${week}`,
      status:
        d.action === "deliver_now"
          ? ("delivered" as const)
          : d.action === "defer"
            ? ("scheduled" as const)
            : d.action === "bundle"
              ? ("bundled" as const)
              : ("suppressed" as const),
      decision_reason: d.action === "deliver_now" ? null : d.reason,
      digest: d.action === "bundle" ? d.digest : null,
      scheduled_for: d.action === "defer" ? d.until.toISOString() : null,
      delivered_at: d.action === "deliver_now" ? now.toISOString() : null,
      expires_at: null,
    };
  });
  await admin
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
}
