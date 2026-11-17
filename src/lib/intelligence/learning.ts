import type { RecalledMemory } from "@/lib/memory/types";
import type { RecommendationKind } from "@/lib/supabase/database.types";

/**
 * Turns remembered decisions into learning signals for the recommendation
 * engine. This is the "learning" in AVEN: what the user accepted, rejected or
 * changed before, their savings target, and which categories keep being
 * flagged — parsed deterministically, never inferred by an AI model.
 *
 * Two sources, merged without double counting:
 *   - memories RECALLED FROM WALRUS (long-term memory, needs memory consent);
 *   - the user's own answered recommendations stored in AVEN ("decision
 *     history"), used when the user keeps "Learn from my decisions" on.
 * A decision that has a Walrus memory is counted once, from Walrus.
 */

export type OutcomeAction = "accepted" | "rejected" | "modified";

/** Where a remembered decision came from — kept so every effect can be traced. */
export interface DecisionSource {
  source: "walrus" | "decision_history";
  /** Walrus blob id (null for decision history). */
  blobId: string | null;
  summary: string;
  observedOn: string;
  createdAt: string | null;
  /** The recommendation the decision was about, when known. */
  recommendationId: string | null;
}

/** An answered recommendation from AVEN's own records (see loadDecisionHistory). */
export interface LocalDecision {
  recommendationId: string;
  kind: RecommendationKind;
  subjectKey: string;
  month: string;
  action: OutcomeAction;
  title: string;
  suggestedMinor: number | null;
  chosenMinor: number | null;
  suggestedPct: number | null;
  respondedAt: string;
}

export function fromRecalled(m: RecalledMemory, recommendationId: string | null = null) {
  return {
    source: "walrus",
    blobId: m.blobId,
    summary: m.summary,
    observedOn: m.observedOn,
    createdAt: m.createdAt,
    recommendationId,
  } satisfies DecisionSource;
}

const ACTION_VERB: Record<OutcomeAction, string> = {
  accepted: "Accepted",
  rejected: "Declined",
  modified: "Changed",
};

export function fromLocal(d: LocalDecision): DecisionSource {
  return {
    source: "decision_history",
    blobId: null,
    summary: `${ACTION_VERB[d.action]} "${d.title}" (${d.month}).`.slice(0, 200),
    observedOn: d.respondedAt.slice(0, 10),
    createdAt: d.respondedAt,
    recommendationId: d.recommendationId,
  };
}

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
    memory: DecisionSource;
  } | null;
  memories: DecisionSource[];
}

export interface LearningSignals {
  /** Keyed by `${kind}|${subjectKey}`. */
  outcomes: Map<string, OutcomeHistory>;
  savingsTarget: { pct: number; memory: RecalledMemory } | null;
  /** Rejections of new-budget suggestions across all categories. */
  budgetSuggestionRejections: { count: number; memories: DecisionSource[] };
  /** How many times each category was remembered as overspent, keyed by category key. */
  overspendHistory: Map<string, { months: Set<string>; memories: RecalledMemory[] }>;
  /** Number of AVEN memories recalled and parsed (for transparency). */
  recalledCount: number;
  /** Number of decisions used from AVEN's own decision history (not already in Walrus). */
  localDecisionCount: number;
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
  a: { month: string; memory: { createdAt: string | null; observedOn: string } },
  b: { month: string; memory: { createdAt: string | null; observedOn: string } },
) {
  if (a.month !== b.month) return a.month > b.month;
  return (a.memory.createdAt ?? a.memory.observedOn) > (b.memory.createdAt ?? b.memory.observedOn);
}

export function deriveSignals(
  memories: RecalledMemory[],
  options: {
    /** Answered recommendations from AVEN's records (empty when learning from decisions is off). */
    decisions?: LocalDecision[];
    /** Walrus blob id → the recommendation that memory records (from memory_records links). */
    blobToRecommendation?: ReadonlyMap<string, string>;
  } = {},
): LearningSignals {
  const signals: LearningSignals = {
    outcomes: new Map(),
    savingsTarget: null,
    budgetSuggestionRejections: { count: 0, memories: [] },
    overspendHistory: new Map(),
    recalledCount: memories.length,
    localDecisionCount: 0,
  };
  const links = options.blobToRecommendation ?? new Map<string, string>();
  const counted = new Set<string>();
  const looseKey = (kind: string, subject: string, month: string, action: string, s: unknown) =>
    `${kind}|${subject}|${month}|${action}|${s ?? ""}`;

  const addOutcome = (
    kind: RecommendationKind,
    subject: string,
    action: OutcomeAction,
    month: string,
    values: {
      suggestedMinor: number | null;
      chosenMinor: number | null;
      suggestedPct: number | null;
    },
    source: DecisionSource,
  ) => {
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
    h.memories.push(source);
    const candidate = { action, month, ...values, memory: source };
    if (!h.last || newer(candidate, h.last)) h.last = candidate;
    signals.outcomes.set(key, h);
    if (kind === "set_category_budget" && action === "rejected") {
      signals.budgetSuggestionRejections.count += 1;
      signals.budgetSuggestionRejections.memories.push(source);
    }
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
      const recommendationId = links.get(m.blobId) ?? null;
      const values = {
        suggestedMinor: int(m.facts.suggested_minor),
        chosenMinor: int(m.facts.chosen_minor),
        suggestedPct: num(m.facts.suggested_pct),
      };
      if (recommendationId) counted.add(`rec:${recommendationId}`);
      counted.add(looseKey(kind, subject, month, action, values.suggestedMinor));
      addOutcome(kind, subject, action, month, values, fromRecalled(m, recommendationId));
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

  // Decisions from AVEN's own records that Walrus didn't already provide.
  for (const d of options.decisions ?? []) {
    if (counted.has(`rec:${d.recommendationId}`)) continue;
    if (counted.has(looseKey(d.kind, d.subjectKey, d.month, d.action, d.suggestedMinor))) continue;
    counted.add(`rec:${d.recommendationId}`);
    signals.localDecisionCount += 1;
    addOutcome(
      d.kind,
      d.subjectKey,
      d.action,
      d.month,
      {
        suggestedMinor: d.suggestedMinor,
        chosenMinor: d.chosenMinor,
        suggestedPct: d.suggestedPct,
      },
      fromLocal(d),
    );
  }
  return signals;
}
