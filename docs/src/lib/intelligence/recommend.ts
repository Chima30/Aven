import { formatMinor } from "@/lib/finance/format";
import type { MemoryInfluence, RecommendationKind } from "@/lib/supabase/database.types";
import {
  monthsBetween,
  niceCeil,
  niceRound,
  type FinancialSnapshot,
  type OverspendFinding,
} from "./analysis";
import { outcomeKey, type LearningSignals, type OutcomeHistory } from "./learning";

/**
 * Deterministic recommendations with explanations.
 *
 * Inputs: the snapshot (the user's own numbers) and learning signals recalled
 * from Walrus Memory. When a memory changes a recommendation, the change and
 * the memory are recorded in `memoryInfluence`, so the user can see exactly
 * why this suggestion differs from last time.
 */

export interface RecommendationDraft {
  kind: RecommendationKind;
  subjectKey: string;
  subjectName: string;
  dedupeKey: string;
  period: string;
  title: string;
  explanation: string;
  currency: string;
  suggestedMinor: number | null;
  suggestedPct: number | null;
  categoryId: string | null;
  goalId: string | null;
  evidence: Record<string, string | number | boolean | null>;
  memoryInfluence: MemoryInfluence[];
  priority: number;
}

export interface SuppressedSuggestion {
  kind: RecommendationKind;
  subjectName: string;
  reason: string;
  memory: MemoryInfluence;
}

export interface RecommendationResult {
  recommendations: RecommendationDraft[];
  suppressed: SuppressedSuggestion[];
}

export const DEFAULT_SAVINGS_TARGET_PCT = 10;
const BASE_CUT_PCT = 10;
const GENTLE_CUT_PCT = 5;
const MAX_RECOMMENDATIONS = 6;

function influence(m: { blobId: string; summary: string }, effect: string): MemoryInfluence {
  return { blob_id: m.blobId, memory: m.summary.slice(0, 200), effect };
}

/** Recent = answered this month or in the previous `months` months. */
function answeredWithin(h: OutcomeHistory | undefined, period: string, months: number) {
  return !!h?.last && monthsBetween(h.last.month, period) <= months;
}

export function buildRecommendations(
  snapshot: FinancialSnapshot,
  signals: LearningSignals,
  locale: string,
): RecommendationResult {
  const period = snapshot.currentMonth;
  const fmt = (minor: number) => formatMinor(Math.round(minor), snapshot.currency, locale);
  const recs: RecommendationDraft[] = [];
  const suppressed: SuppressedSuggestion[] = [];
  if (!snapshot.hasEnoughData) return { recommendations: [], suppressed: [] };

  const base = (
    kind: RecommendationKind,
    subjectKey: string,
    subjectName: string,
  ): Pick<
    RecommendationDraft,
    "kind" | "subjectKey" | "subjectName" | "dedupeKey" | "period" | "currency"
  > => ({
    kind,
    subjectKey,
    subjectName,
    dedupeKey: `${kind}:${subjectKey}:${period}`,
    period,
    currency: snapshot.currency,
  });

  // 1. Reduce spending in overspent categories --------------------------------
  for (const finding of snapshot.overspending) {
    const c = finding.category;
    const subjectKey = `cat:${c.categoryId}`;
    const history = signals.outcomes.get(outcomeKey("reduce_category_spend", subjectKey));
    const overspendMemory = signals.overspendHistory.get(c.categoryId);
    const memoryInfluence: MemoryInfluence[] = [];
    let priority =
      50 +
      Math.min(
        30,
        Math.round((finding.observedMinor / Math.max(1, finding.referenceMinor) - 1) * 100),
      );

    if (history && history.rejected >= 2 && history.last?.action === "rejected") {
      suppressed.push({
        kind: "reduce_category_spend",
        subjectName: c.name,
        reason: `You've declined spending cuts for ${c.name} ${history.rejected} times, so AVEN won't suggest another one.`,
        memory: influence(history.last.memory, "Suggestion withheld"),
      });
      continue;
    }

    const baseline =
      finding.reason === "above_usual"
        ? finding.referenceMinor
        : Math.max(finding.observedMinor, finding.referenceMinor);
    let pct = BASE_CUT_PCT;
    let target: number;
    let lead = "";

    if (history?.last?.action === "rejected") {
      pct = GENTLE_CUT_PCT;
      target = niceRound(baseline * (1 - pct / 100), snapshot.minorPerMajor);
      lead = `Last time you declined a ${history.last.suggestedPct ?? BASE_CUT_PCT}% cut, so this suggests a gentler ${pct}%.`;
      memoryInfluence.push(
        influence(
          history.last.memory,
          `Cut reduced from ${history.last.suggestedPct ?? BASE_CUT_PCT}% to ${pct}%`,
        ),
      );
    } else if (history?.last?.action === "modified" && history.last.chosenMinor !== null) {
      target = history.last.chosenMinor;
      pct = baseline > 0 ? Math.max(0, Math.round((1 - target / baseline) * 100)) : 0;
      lead = `Last time you set your own target of ${fmt(target)}, so AVEN uses your number instead of its own.`;
      memoryInfluence.push(
        influence(history.last.memory, `Target set to your earlier choice of ${fmt(target)}`),
      );
    } else if (history?.last?.action === "accepted" && history.last.suggestedMinor !== null) {
      const previousTarget = history.last.suggestedMinor;
      const lastComplete = snapshot.completeMonths.at(-1);
      const actual = lastComplete ? (c.monthly[lastComplete] ?? 0) : null;
      if (
        actual !== null &&
        history.last.month <= (lastComplete ?? "") &&
        actual <= previousTarget
      ) {
        pct = GENTLE_CUT_PCT;
        target = niceRound(
          Math.min(baseline, previousTarget) * (1 - pct / 100),
          snapshot.minorPerMajor,
        );
        lead = `You met your ${fmt(previousTarget)} target last month — this is a small next step of ${pct}%.`;
        memoryInfluence.push(influence(history.last.memory, "Target met, so a further 5% step"));
      } else {
        target = previousTarget;
        pct = baseline > 0 ? Math.max(0, Math.round((1 - target / baseline) * 100)) : 0;
        lead = `You agreed to aim for ${fmt(previousTarget)} before. AVEN keeps that target rather than asking for more.`;
        memoryInfluence.push(
          influence(history.last.memory, "Kept your previously accepted target"),
        );
      }
    } else {
      target = niceRound(baseline * (1 - pct / 100), snapshot.minorPerMajor);
    }

    if (overspendMemory && overspendMemory.months.size >= 2) {
      priority += 15;
      memoryInfluence.push(
        influence(
          overspendMemory.memories.at(-1)!,
          `Flagged in ${overspendMemory.months.size} earlier months, so ranked higher`,
        ),
      );
    }

    recs.push({
      ...base("reduce_category_spend", subjectKey, c.name),
      title: `Bring ${c.name} down to ${fmt(target)} a month`,
      explanation: [
        lead,
        describeOverspend(finding, fmt),
        `A target of ${fmt(target)} is ${pct}% below that.`,
      ]
        .filter(Boolean)
        .join(" "),
      suggestedMinor: target,
      suggestedPct: pct,
      categoryId: c.categoryId,
      goalId: null,
      evidence: {
        reason: finding.reason,
        reference_minor: finding.referenceMinor,
        observed_minor: finding.observedMinor,
        median_minor: c.medianComplete,
        budget_limit_minor: c.budgetLimit,
        months_over_budget: c.monthsOverBudget,
      },
      memoryInfluence,
      priority,
    });
  }

  // 2. Set a budget for a large, unbudgeted category ---------------------------
  const avgExpense =
    snapshot.savings.months.length > 0
      ? snapshot.savings.months.reduce((s, m) => s + m.expense, 0) / snapshot.savings.months.length
      : 0;
  const budgetRejections = signals.budgetSuggestionRejections;
  const flagged = new Set(snapshot.overspending.map((o) => o.category.categoryId));
  const unbudgeted = snapshot.categories
    .filter(
      (c) =>
        c.budgetLimit === null &&
        !flagged.has(c.categoryId) &&
        c.completeMonthsWithSpend >= 2 &&
        avgExpense > 0 &&
        c.medianComplete >= avgExpense * 0.1,
    )
    .slice(0, 2);
  for (const c of unbudgeted) {
    const subjectKey = `cat:${c.categoryId}`;
    const history = signals.outcomes.get(outcomeKey("set_category_budget", subjectKey));
    if (budgetRejections.count >= 2) {
      suppressed.push({
        kind: "set_category_budget",
        subjectName: c.name,
        reason: `You've turned down new budgets ${budgetRejections.count} times, so AVEN won't propose more.`,
        memory: influence(budgetRejections.memories.at(-1)!, "Budget suggestions paused"),
      });
      continue;
    }
    if (history?.last?.action === "rejected" && answeredWithin(history, period, 2)) {
      suppressed.push({
        kind: "set_category_budget",
        subjectName: c.name,
        reason: `You declined a ${c.name} budget recently; AVEN will wait before asking again.`,
        memory: influence(history.last.memory, "Waiting before asking again"),
      });
      continue;
    }
    const memoryInfluence: MemoryInfluence[] = [];
    let limit = niceCeil(c.medianComplete, snapshot.minorPerMajor);
    let lead = "";
    if (history?.last?.action === "modified" && history.last.chosenMinor !== null) {
      limit = history.last.chosenMinor;
      lead = `You preferred ${fmt(limit)} last time, so AVEN suggests that.`;
      memoryInfluence.push(
        influence(history.last.memory, `Limit set to your earlier choice of ${fmt(limit)}`),
      );
    }
    recs.push({
      ...base("set_category_budget", subjectKey, c.name),
      title: `Set a ${fmt(limit)} monthly budget for ${c.name}`,
      explanation: [
        lead,
        `${c.name} is one of your largest categories without a budget: a typical month is ${fmt(c.medianComplete)} (median of ${snapshot.completeMonths.length} months).`,
        "A budget lets AVEN warn you before it runs over.",
      ]
        .filter(Boolean)
        .join(" "),
      suggestedMinor: limit,
      suggestedPct: null,
      categoryId: c.categoryId,
      goalId: null,
      evidence: {
        median_minor: c.medianComplete,
        months: snapshot.completeMonths.length,
        avg_monthly_expense_minor: Math.round(avgExpense),
      },
      memoryInfluence,
      priority: 30,
    });
  }

  // 3. Savings rate ------------------------------------------------------------
  const income = snapshot.income;
  if (income && income.avgMonthlyMinor > 0 && snapshot.savings.avgRatePct !== null) {
    const memoryInfluence: MemoryInfluence[] = [];
    let targetPct = DEFAULT_SAVINGS_TARGET_PCT;
    if (signals.savingsTarget) {
      targetPct = signals.savingsTarget.pct;
      memoryInfluence.push(
        influence(signals.savingsTarget.memory, `Uses your saved target of ${targetPct}%`),
      );
    }
    const history = signals.outcomes.get(outcomeKey("increase_savings", "savings"));
    const current = snapshot.savings.avgRatePct;
    let skip = false;
    let lead = "";
    if (history && history.rejected >= 2 && history.last?.action === "rejected") {
      suppressed.push({
        kind: "increase_savings",
        subjectName: "Savings",
        reason: `You've declined savings increases ${history.rejected} times; set a savings target to bring them back.`,
        memory: influence(history.last.memory, "Suggestion withheld"),
      });
      skip = true;
    } else if (history?.last?.action === "rejected") {
      const softened = Math.max(current + 1, Math.round((current + targetPct) / 2));
      memoryInfluence.push(
        influence(
          history.last.memory,
          `Step reduced to ${softened}% after you declined ${history.last.suggestedPct ?? targetPct}%`,
        ),
      );
      lead = `You declined the last savings step, so this aims halfway to ${targetPct}%.`;
      targetPct = softened;
    } else if (history?.last?.action === "modified" && history.last.chosenMinor !== null) {
      const chosenPct = Math.round((history.last.chosenMinor / income.avgMonthlyMinor) * 100);
      memoryInfluence.push(
        influence(
          history.last.memory,
          `Uses the ${fmt(history.last.chosenMinor)} a month you chose`,
        ),
      );
      lead = `Last time you chose to save ${fmt(history.last.chosenMinor)} a month.`;
      targetPct = Math.max(1, chosenPct);
    }
    if (!skip && current < targetPct) {
      const monthly = niceRound((income.avgMonthlyMinor * targetPct) / 100, snapshot.minorPerMajor);
      recs.push({
        ...base("increase_savings", "savings", "Savings"),
        title: `Save ${fmt(monthly)} a month (${targetPct}% of income)`,
        explanation: [
          lead,
          `Over your last ${Math.min(3, snapshot.savings.months.length)} complete months you kept ${current}% of your income on average (income about ${fmt(income.avgMonthlyMinor)} a month).`,
          `Reaching ${targetPct}% means keeping about ${fmt(monthly)} each month.`,
        ]
          .filter(Boolean)
          .join(" "),
        suggestedMinor: monthly,
        suggestedPct: targetPct,
        categoryId: null,
        goalId: null,
        evidence: {
          avg_rate_pct: current,
          target_pct: targetPct,
          avg_income_minor: income.avgMonthlyMinor,
        },
        memoryInfluence,
        priority: 40 + Math.min(20, Math.round(targetPct - current)),
      });
    }
  }

  // 4. Review subscriptions ------------------------------------------------------
  for (const s of snapshot.recurring.filter((r) => r.isSubscription).slice(0, 3)) {
    const subjectKey = `sub:${s.key}`;
    const history = signals.outcomes.get(outcomeKey("review_subscription", subjectKey));
    if (history?.last) {
      if (history.last.action === "rejected") {
        suppressed.push({
          kind: "review_subscription",
          subjectName: s.name,
          reason: `You said ${s.name} is worth keeping, so AVEN won't ask again.`,
          memory: influence(history.last.memory, "Not asked again"),
        });
      }
      continue;
    }
    recs.push({
      ...base("review_subscription", subjectKey, s.name),
      title: `Review ${s.name} (${fmt(s.amountMinor)} a month)`,
      explanation: `${s.name} has charged about ${fmt(s.amountMinor)} around day ${s.typicalDay} for ${s.months} months in a row — ${fmt(s.amountMinor * 12)} a year. Keep it if you use it; decline this and AVEN will remember.`,
      suggestedMinor: s.amountMinor,
      suggestedPct: null,
      categoryId: s.categoryId,
      goalId: null,
      evidence: { months: s.months, typical_day: s.typicalDay, amount_minor: s.amountMinor },
      memoryInfluence: [],
      priority: 20,
    });
  }

  // 5. Goals behind schedule -----------------------------------------------------
  for (const g of snapshot.goals) {
    if (g.onTrack !== false || g.requiredMonthlyMinor === null) continue;
    const subjectKey = `goal:${g.id}`;
    const history = signals.outcomes.get(outcomeKey("goal_contribution", subjectKey));
    if (history?.last?.action === "rejected" && answeredWithin(history, period, 1)) {
      suppressed.push({
        kind: "goal_contribution",
        subjectName: g.name,
        reason: `You declined a plan for ${g.name} recently.`,
        memory: influence(history.last.memory, "Waiting before asking again"),
      });
      continue;
    }
    const memoryInfluence: MemoryInfluence[] = [];
    let monthly = niceCeil(g.requiredMonthlyMinor, snapshot.minorPerMajor);
    let lead = "";
    if (history?.last?.action === "modified" && history.last.chosenMinor !== null) {
      monthly = history.last.chosenMinor;
      lead = `You chose ${fmt(monthly)} a month last time.`;
      memoryInfluence.push(
        influence(history.last.memory, `Uses your earlier choice of ${fmt(monthly)}`),
      );
    }
    recs.push({
      ...base("goal_contribution", subjectKey, g.name),
      title: `Put ${fmt(monthly)} a month towards ${g.name}`,
      explanation: [
        lead,
        `${g.name} is ${g.progressPct}% funded (${fmt(g.savedMinor)} of ${fmt(g.targetMinor)}) with ${g.monthsLeft} month${g.monthsLeft === 1 ? "" : "s"} left.`,
        `Reaching it on time needs about ${fmt(g.requiredMonthlyMinor)} a month; your recent average net saving is ${snapshot.savings.avgNetMinor !== null ? fmt(snapshot.savings.avgNetMinor) : "unknown"}.`,
      ]
        .filter(Boolean)
        .join(" "),
      suggestedMinor: monthly,
      suggestedPct: null,
      categoryId: null,
      goalId: g.id,
      evidence: {
        required_monthly_minor: g.requiredMonthlyMinor,
        months_left: g.monthsLeft,
        progress_pct: g.progressPct,
      },
      memoryInfluence,
      priority: 35,
    });
  }

  recs.sort((a, b) => b.priority - a.priority || a.dedupeKey.localeCompare(b.dedupeKey));
  return { recommendations: recs.slice(0, MAX_RECOMMENDATIONS), suppressed };
}

function describeOverspend(finding: OverspendFinding, fmt: (n: number) => string): string {
  const c = finding.category;
  switch (finding.reason) {
    case "over_budget_repeatedly":
      return `${c.name} went over its ${fmt(finding.referenceMinor)} budget in ${c.monthsOverBudget} of the last 3 months.`;
    case "projected_over_budget":
      return `At this pace ${c.name} will reach about ${fmt(finding.observedMinor)} this month, over its ${fmt(finding.referenceMinor)} budget.`;
    case "above_usual":
      return `At this pace ${c.name} will reach about ${fmt(finding.observedMinor)} this month; a typical month is ${fmt(finding.referenceMinor)}.`;
  }
}
