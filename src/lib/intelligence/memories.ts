import type { MemoryCandidate } from "@/lib/memory/types";
import type { RecommendationRow } from "@/lib/supabase/database.types";
import { niceRound, type FinancialSnapshot } from "./analysis";

/**
 * Builds the memories AVEN writes to Walrus. Pure and deterministic, so the
 * same facts always produce the same text — and the content-hash dedupe
 * means re-running the analysis never writes a duplicate memory.
 *
 * Only facts about COMPLETED months (or stable patterns) become memories;
 * a half-finished month changes daily and would only create noise.
 * Amounts are rounded; no account names, balances or identifiers are used.
 */

const MAX_SNAPSHOT_MEMORIES = 8;

function money(minor: number, snapshot: FinancialSnapshot): string {
  // Major units with a fixed format (not locale-dependent) for stable text.
  const major = minor / snapshot.minorPerMajor;
  return `${Number.isInteger(major) ? major : major.toFixed(2)} ${snapshot.currency}`;
}

export function snapshotMemoryCandidates(snapshot: FinancialSnapshot): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const lastComplete = snapshot.completeMonths.at(-1);
  if (!lastComplete || !snapshot.hasEnoughData) return out;
  const observedOn = `${lastComplete}-01`;
  const r = (minor: number) => niceRound(minor, snapshot.minorPerMajor);
  const source = [{ table: "transactions", id: `period:${lastComplete}` }];

  // Savings performance for the last complete month.
  const lastSavings = snapshot.savings.months.find((m) => m.month === lastComplete);
  if (lastSavings && lastSavings.ratePct !== null) {
    out.push({
      category: "memory_financial",
      kind: "savings_performance",
      label: `Savings performance · ${lastComplete}`,
      facts: {
        month: lastComplete,
        savings_rate_pct: lastSavings.ratePct,
        net_minor: r(Math.abs(lastSavings.net)) * Math.sign(lastSavings.net),
        currency: snapshot.currency,
      },
      summary: `In ${lastComplete} the user kept ${lastSavings.ratePct}% of income (net ${money(r(Math.abs(lastSavings.net)) * Math.sign(lastSavings.net), snapshot)}).`,
      observedOn,
      sourceRefs: source,
      durability: "long_term",
    });
  }

  // Categories over budget (or well above usual) in the last complete month.
  for (const c of snapshot.categories) {
    const spent = c.monthly[lastComplete] ?? 0;
    const overBudget = c.budgetLimit !== null && spent > c.budgetLimit;
    if (!overBudget) continue;
    out.push({
      category: "memory_financial",
      kind: "overspending_category",
      label: `Overspent · ${c.name} · ${lastComplete}`,
      facts: {
        category_key: c.categoryId,
        category_name: c.name,
        month: lastComplete,
        spent_minor: r(spent),
        budget_minor: c.budgetLimit!,
        currency: snapshot.currency,
      },
      summary: `${c.name} went over its ${money(c.budgetLimit!, snapshot)} budget in ${lastComplete} (spent about ${money(r(spent), snapshot)}).`,
      observedOn,
      sourceRefs: [{ table: "budgets", id: c.budgetId! }],
      durability: "long_term",
    });
  }

  // Stable patterns (no month in the text, so they dedupe until they change).
  if (snapshot.income && snapshot.income.monthsObserved >= 2) {
    const amount = r(snapshot.income.avgMonthlyMinor);
    out.push({
      category: "memory_financial",
      kind: "income_pattern",
      label: "Income pattern",
      facts: {
        avg_monthly_income_minor: amount,
        typical_day: snapshot.income.typicalDay ?? "varies",
        currency: snapshot.currency,
      },
      summary:
        snapshot.income.typicalDay !== null
          ? `Income is about ${money(amount, snapshot)} a month and usually arrives around day ${snapshot.income.typicalDay}.`
          : `Income is about ${money(amount, snapshot)} a month; the arrival day varies.`,
      observedOn,
      sourceRefs: source,
      durability: "long_term",
    });
  }

  for (const item of snapshot.recurring.slice(0, 3)) {
    const amount = r(item.amountMinor);
    out.push({
      category: "memory_financial",
      kind: item.isSubscription ? "subscription" : "recurring_expense",
      label: `${item.isSubscription ? "Subscription" : "Recurring expense"} · ${item.name}`,
      facts: {
        name: item.name,
        amount_minor: amount,
        typical_day: item.typicalDay,
        currency: snapshot.currency,
      },
      summary: `${item.name} is a ${item.isSubscription ? "subscription" : "recurring expense"} of about ${money(amount, snapshot)} around day ${item.typicalDay} each month.`,
      observedOn,
      sourceRefs: source,
      durability: "long_term",
    });
  }

  out.push({
    category: "memory_financial",
    kind: "budgeting_style",
    label: "Budgeting style",
    facts: {
      style: snapshot.budgeting.style,
      budget_count: snapshot.budgeting.budgetCount,
      coverage_band:
        snapshot.budgeting.coveragePct >= 60
          ? "most"
          : snapshot.budgeting.coveragePct > 0
            ? "some"
            : "none",
    },
    summary:
      snapshot.budgeting.style === "none"
        ? "The user does not use budgets."
        : `The user budgets in a ${snapshot.budgeting.style} way with ${snapshot.budgeting.budgetCount} budget${snapshot.budgeting.budgetCount === 1 ? "" : "s"}.`,
    observedOn,
    sourceRefs: source,
    durability: "long_term",
  });

  for (const g of snapshot.goals.slice(0, 2)) {
    const band = Math.floor(g.progressPct / 10) * 10;
    out.push({
      category: "memory_financial",
      kind: "goal_progress",
      label: `Goal progress · ${g.name}`,
      facts: {
        goal_key: g.id,
        goal_name: g.name,
        month: lastComplete,
        progress_band_pct: band,
        on_track: g.onTrack === null ? "no_deadline" : g.onTrack ? "yes" : "no",
      },
      summary: `By ${lastComplete} the goal ${g.name} was at least ${band}% funded${g.onTrack === false ? " and behind schedule" : ""}.`,
      observedOn,
      sourceRefs: [{ table: "savings_goals", id: g.id }],
      durability: "long_term",
    });
  }

  return out.slice(0, MAX_SNAPSHOT_MEMORIES);
}

const ACTION_VERB = { accepted: "Accepted", rejected: "Rejected", modified: "Changed" } as const;

/** The memory written when the user answers a recommendation. */
export function outcomeMemoryCandidate(
  rec: RecommendationRow,
  subject: { key: string; name: string },
  suggestedPct: number | null,
  minorPerMajor: number,
): MemoryCandidate {
  const action = rec.status as "accepted" | "rejected" | "modified";
  const facts: Record<string, string | number> = {
    rec_kind: rec.kind,
    subject_key: subject.key,
    subject_name: subject.name,
    action,
    month: rec.period,
    currency: rec.currency_code,
  };
  if (rec.suggested_minor !== null) facts.suggested_minor = rec.suggested_minor;
  if (suggestedPct !== null) facts.suggested_pct = suggestedPct;
  if (action === "modified" && rec.response_minor !== null) facts.chosen_minor = rec.response_minor;
  const amount = (minor: number) => {
    const major = minor / minorPerMajor;
    return `${Number.isInteger(major) ? major : major.toFixed(2)} ${rec.currency_code}`;
  };
  const chosen =
    action === "modified" && rec.response_minor !== null
      ? `; chose ${amount(rec.response_minor)} instead`
      : "";
  return {
    category: "memory_financial",
    kind: "recommendation_outcome",
    label: `Recommendation ${action} · ${subject.name}`,
    facts,
    summary: `${ACTION_VERB[action]} the suggestion "${rec.title}" for ${rec.period}${chosen}.`,
    observedOn: `${rec.period}-01`,
    sourceRefs: [{ table: "recommendations", id: rec.id }],
    durability: "long_term",
  };
}

/** The memory written when the user sets a monthly savings target (stored only in Walrus). */
export function savingsTargetCandidate(targetPct: number, today: string): MemoryCandidate {
  return {
    category: "memory_financial",
    kind: "savings_target",
    label: `Monthly savings target · ${targetPct}%`,
    facts: { target_pct: targetPct, set_on: today },
    summary: `The user's monthly savings target is ${targetPct}% of income (set ${today}).`,
    observedOn: today,
    sourceRefs: [{ table: "user_preferences", id: "savings_target" }],
    durability: "long_term",
  };
}
