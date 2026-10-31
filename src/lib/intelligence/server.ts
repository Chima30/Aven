import "server-only";
import { localToday } from "@/lib/finance/periods";
import { recallMemories, refreshMemoryJobs, rememberCandidate } from "@/lib/memory/service";
import { memoryRuntimeFor, type MemoryRuntime } from "@/lib/memory/runtime";
import { canRecall } from "@/lib/memory/policy";
import type { RecalledMemory } from "@/lib/memory/types";
import { getCurrency, isCurrencyCode } from "@/lib/money/currencies";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { RecommendationRow, UserPreferencesRow } from "@/lib/supabase/database.types";
import {
  LOOKBACK_MONTHS,
  addMonths,
  analyzeFinances,
  monthKey,
  type FinanceInput,
  type FinancialSnapshot,
} from "./analysis";
import { deriveSignals, type LearningSignals } from "./learning";
import { snapshotMemoryCandidates } from "./memories";
import { buildRecommendations, type SuppressedSuggestion } from "./recommend";

/** Queries used to recall what AVEN needs from Walrus before recommending. */
export const RECALL_QUERIES = [
  "recommendation outcome accepted rejected changed suggestion",
  "monthly savings target savings performance income pattern",
  "overspent category budget budgeting style subscription recurring expense",
] as const;

const PAGE = 1000;
const MAX_ROWS = 5000;

export async function loadFinanceInput(
  supabase: ServerSupabase,
  preferences: Pick<UserPreferencesRow, "currency_code" | "time_zone">,
  now: Date = new Date(),
): Promise<FinanceInput> {
  const today = localToday(preferences.time_zone, now);
  const from = `${addMonths(monthKey(today), -LOOKBACK_MONTHS)}-01`;

  const rows: Array<{
    id: string;
    kind: "income" | "expense" | "transfer";
    amount_minor: number;
    currency_code: string;
    category_id: string | null;
    occurred_on: string;
    merchant: string | null;
    description: string | null;
  }> = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, kind, amount_minor, currency_code, category_id, occurred_on, merchant, description",
      )
      .gte("occurred_on", from)
      .lte("occurred_on", today)
      .order("occurred_on", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Transactions could not be loaded for analysis.");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const [categories, budgets, goals, progress] = await Promise.all([
    supabase.from("transaction_categories").select("id, name"),
    supabase
      .from("budgets")
      .select("id, name, category_id, currency_code, limit_minor, starts_on, archived_at"),
    supabase
      .from("savings_goals")
      .select("id, name, currency_code, target_minor, target_date, status"),
    supabase.from("savings_goal_progress").select("goal_id, saved_minor"),
  ]);
  if (categories.error || budgets.error || goals.error || progress.error) {
    throw new Error("Budgets and goals could not be loaded for analysis.");
  }
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const saved = new Map((progress.data ?? []).map((p) => [p.goal_id, Number(p.saved_minor)]));
  const currency = preferences.currency_code;
  const minorUnits = isCurrencyCode(currency) ? getCurrency(currency).minorUnits : 2;

  return {
    today,
    currency,
    minorPerMajor: 10 ** minorUnits,
    transactions: rows.map((t) => ({
      id: t.id,
      kind: t.kind,
      amountMinor: t.amount_minor,
      currency: t.currency_code,
      categoryId: t.category_id,
      categoryName: t.category_id ? (categoryName.get(t.category_id) ?? null) : null,
      occurredOn: t.occurred_on,
      merchant: t.merchant,
      description: t.description,
    })),
    budgets: (budgets.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      categoryId: b.category_id,
      categoryName: b.category_id ? (categoryName.get(b.category_id) ?? null) : null,
      currency: b.currency_code,
      limitMinor: b.limit_minor,
      startsOn: b.starts_on,
      archived: b.archived_at !== null,
    })),
    goals: (goals.data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      currency: g.currency_code,
      targetMinor: g.target_minor,
      targetDate: g.target_date,
      savedMinor: saved.get(g.id) ?? 0,
      status: g.status,
    })),
  };
}

export type MemoryState =
  | { state: "not_configured" }
  | { state: "invalid_config" }
  | { state: "no_consent" }
  | { state: "paused" }
  | { state: "error"; message: string }
  | { state: "active"; recalled: number };

export interface IntelligenceResult {
  snapshot: FinancialSnapshot;
  signals: LearningSignals;
  recalled: RecalledMemory[];
  memory: MemoryState;
  /** This period's recommendations (open first, then answered), so answers stay visible. */
  current: RecommendationRow[];
  open: RecommendationRow[];
  answered: RecommendationRow[];
  suppressed: SuppressedSuggestion[];
  /** Work to run after the response is sent (writing pattern memories to Walrus). */
  background: (() => Promise<void>) | null;
}

export function memoryStateOf(runtime: MemoryRuntime): MemoryState | null {
  if (!runtime.available) {
    return { state: runtime.reason === "invalid_config" ? "invalid_config" : "not_configured" };
  }
  if (runtime.ctx.memoryPaused) return { state: "paused" };
  if (!canRecall("memory_financial", runtime.ctx)) return { state: "no_consent" };
  return null;
}

/** Recalls the user's AVEN memories from Walrus (all three queries, merged). */
export async function recallForRecommendations(
  runtime: Extract<MemoryRuntime, { available: true }>,
  userId: string,
): Promise<RecalledMemory[]> {
  const batches = await Promise.all(
    RECALL_QUERIES.map((q) => recallMemories(runtime.deps, userId, q, runtime.ctx, { limit: 25 })),
  );
  const byBlob = new Map<string, RecalledMemory>();
  for (const m of batches.flat()) if (!byBlob.has(m.blobId)) byBlob.set(m.blobId, m);
  return [...byBlob.values()];
}

/**
 * The full loop: load the user's records → recall memories from Walrus →
 * analyse → recommend (with explanations) → store this period's open
 * recommendations. Pattern memories from completed months are written to
 * Walrus in the background.
 */
export async function runIntelligence(
  supabase: ServerSupabase,
  userId: string,
  preferences: UserPreferencesRow,
): Promise<IntelligenceResult> {
  const input = await loadFinanceInput(supabase, preferences);
  const snapshot = analyzeFinances(input);
  const runtime = await memoryRuntimeFor(supabase, userId);

  let memory: MemoryState = memoryStateOf(runtime) ?? { state: "active", recalled: 0 };
  let recalled: RecalledMemory[] = [];
  if (runtime.available && memory.state === "active") {
    if (!(await consumeRateLimit(supabase, "memory_read"))) {
      memory = {
        state: "error",
        message:
          "You've refreshed a lot recently, so this view doesn't use your memory history for a few minutes.",
      };
    }
  }
  if (runtime.available && memory.state === "active") {
    try {
      recalled = await recallForRecommendations(runtime, userId);
      memory = { state: "active", recalled: recalled.length };
    } catch (error) {
      console.error(
        "[intelligence] Walrus recall failed:",
        error instanceof Error ? error.name : "error",
      );
      memory = {
        state: "error",
        message: "Walrus Memory couldn't be reached, so these suggestions don't use your history.",
      };
    }
  }

  const signals = deriveSignals(recalled);
  const { recommendations, suppressed } = buildRecommendations(
    snapshot,
    signals,
    preferences.locale,
  );

  if (recommendations.length > 0) {
    const { error } = await supabase.from("recommendations").upsert(
      recommendations.map((r) => ({
        user_id: userId,
        kind: r.kind,
        dedupe_key: r.dedupeKey,
        period: r.period,
        title: r.title,
        explanation: r.explanation,
        currency_code: r.currency,
        suggested_minor: r.suggestedMinor,
        category_id: r.categoryId,
        goal_id: r.goalId,
        evidence: {
          ...r.evidence,
          subject_key: r.subjectKey,
          subject_name: r.subjectName,
          suggested_pct: r.suggestedPct,
          priority: r.priority,
        },
        memory_influence: r.memoryInfluence,
      })),
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    if (error) console.error("[intelligence] could not store recommendations:", error.code);
  }

  const { data: rows } = await supabase
    .from("recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  const all = rows ?? [];
  const currentKeys = new Set(recommendations.map((r) => r.dedupeKey));
  const priority = (r: RecommendationRow) =>
    Number((r.evidence as { priority?: number }).priority ?? 0);
  const current = all
    .filter((r) => r.period === snapshot.currentMonth || currentKeys.has(r.dedupe_key))
    .sort(
      (a, b) =>
        Number(b.status === "open") - Number(a.status === "open") || priority(b) - priority(a),
    );
  const open = current.filter((r) => r.status === "open");
  const answered = all.filter((r) => r.status !== "open").slice(0, 20);

  let background: IntelligenceResult["background"] = null;
  if (runtime.available && memory.state !== "paused" && memory.state !== "no_consent") {
    const candidates = snapshotMemoryCandidates(snapshot);
    background = async () => {
      for (const candidate of candidates) {
        try {
          await rememberCandidate(runtime.deps, userId, candidate, runtime.ctx);
        } catch (error) {
          console.error(
            "[intelligence] memory write failed:",
            error instanceof Error ? error.name : "error",
          );
        }
      }
      await refreshMemoryJobs(runtime.deps, userId, { deadlineMs: 15_000 }).catch(() => undefined);
    };
  }

  return { snapshot, signals, recalled, memory, current, open, answered, suppressed, background };
}
