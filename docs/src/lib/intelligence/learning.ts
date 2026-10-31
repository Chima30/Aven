import type { RecalledMemory } from "@/lib/memory/types";
import type { RecommendationKind } from "@/lib/supabase/database.types";

/**
 * Turns memories RECALLED FROM WALRUS into learning signals for the
 * recommendation engine. This is the "learning" in AVEN: what the user
 * accepted, rejected or changed before, their savings target, and which
 * categories keep being flagged — read back from Walrus Memory, parsed
 * deterministically, never inferred by an AI model.
 */

export type OutcomeAction = "accepted" | "rejected" | "modified";

export interface OutcomeHistory {
  accepted: number;
  rejected: number;
  modified: number;
  /** The most recent outcome (by month, then memory date). */
  last: {
    action: OutcomeAction;
    month: string;
    suggestedMinor: number | null;
    chosenMinor: number | null;
    suggestedPct: number | null;
    memory: RecalledMemory;
  } | null;
  memories: RecalledMemory[];
}

export interface LearningSignals {
  /** Keyed by `${kind}|${subjectKey}`. */
  outcomes: Map<string, OutcomeHistory>;
  savingsTarget: { pct: number; memory: RecalledMemory } | null;
  /** Rejections of new-budget suggestions across all categories. */
  budgetSuggestionRejections: { count: number; memories: RecalledMemory[] };
  /** How many times each category was remembered as overspent, keyed by category key. */
  overspendHistory: Map<string, { months: Set<string>; memories: RecalledMemory[] }>;
  /** Number of AVEN memories recalled and parsed (for transparency). */
  recalledCount: number;
}

export function outcomeKey(kind: RecommendationKind, subjectKey: string): string {
  return `${kind}|${subjectKey}`;
}

function int(value: string | undefined): number | null {
  if (value === undefined || !/^-?\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function num(value: string | undefined): number | null {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

function newer(
  a: { month: string; memory: RecalledMemory },
  b: { month: string; memory: RecalledMemory },
) {
  if (a.month !== b.month) return a.month > b.month;
  return (a.memory.createdAt ?? a.memory.observedOn) > (b.memory.createdAt ?? b.memory.observedOn);
}

export function deriveSignals(memories: RecalledMemory[]): LearningSignals {
  const signals: LearningSignals = {
    outcomes: new Map(),
    savingsTarget: null,
    budgetSuggestionRejections: { count: 0, memories: [] },
    overspendHistory: new Map(),
    recalledCount: memories.length,
  };

  for (const m of memories) {
    if (m.kind === "recommendation_outcome") {
      const kind = m.facts.rec_kind as RecommendationKind | undefined;
      const subject = m.facts.subject_key;
      const action = m.facts.action as OutcomeAction | undefined;
      const month = m.facts.month ?? m.observedOn.slice(0, 7);
      if (!kind || !subject || !action || !["accepted", "rejected", "modified"].includes(action)) {
        continue;
      }
      const key = outcomeKey(kind, subject);
      const h =
        signals.outcomes.get(key) ??
        ({
          accepted: 0,
          rejected: 0,
          modified: 0,
          last: null,
          memories: [],
        } satisfies OutcomeHistory);
      h[action] += 1;
      h.memories.push(m);
      const candidate = {
        action,
        month,
        suggestedMinor: int(m.facts.suggested_minor),
        chosenMinor: int(m.facts.chosen_minor),
        suggestedPct: num(m.facts.suggested_pct),
        memory: m,
      };
      if (!h.last || newer(candidate, h.last)) h.last = candidate;
      signals.outcomes.set(key, h);
      if (kind === "set_category_budget" && action === "rejected") {
        signals.budgetSuggestionRejections.count += 1;
        signals.budgetSuggestionRejections.memories.push(m);
      }
    } else if (m.kind === "savings_target") {
      const pct = num(m.facts.target_pct);
      if (pct === null || pct <= 0 || pct > 90) continue;
      if (
        !signals.savingsTarget ||
        newer(
          { month: m.observedOn, memory: m },
          {
            month: signals.savingsTarget.memory.observedOn,
            memory: signals.savingsTarget.memory,
          },
        )
      ) {
        signals.savingsTarget = { pct, memory: m };
      }
    } else if (m.kind === "overspending_category") {
      const key = m.facts.category_key;
      const month = m.facts.month;
      if (!key || !month) continue;
      const h = signals.overspendHistory.get(key) ?? { months: new Set<string>(), memories: [] };
      if (!h.months.has(month)) {
        h.months.add(month);
        h.memories.push(m);
      }
      signals.overspendHistory.set(key, h);
    }
  }
  return signals;
}
