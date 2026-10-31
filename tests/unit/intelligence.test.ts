import { MemWalMock } from "@mysten-incubation/memwal";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  analyzeFinances,
  median,
  niceCeil,
  niceRound,
  type FinanceInput,
  type TxInput,
} from "@/lib/intelligence/analysis";
import { deriveSignals } from "@/lib/intelligence/learning";
import {
  outcomeMemoryCandidate,
  savingsTargetCandidate,
  snapshotMemoryCandidates,
} from "@/lib/intelligence/memories";
import { buildRecommendations, type RecommendationDraft } from "@/lib/intelligence/recommend";
import { deriveUserNamespace } from "@/lib/memory/namespace";
import type { MemoryPolicyContext } from "@/lib/memory/policy";
import {
  recallMemories,
  refreshMemoryJobs,
  rememberCandidate,
  type MemoryServiceDeps,
} from "@/lib/memory/service";
import type { RecommendationRow } from "@/lib/supabase/database.types";
import { inMemoryRepo } from "./support/memory-repo";

const USER = "33333333-3333-4333-8333-333333333333";
const FOOD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOUSING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUBS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TRANSPORT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SALARY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NGN = (major: number) => major * 100;

let n = 0;
function tx(
  kind: TxInput["kind"],
  date: string,
  major: number,
  cat: string | null,
  catName: string | null,
  merchant: string | null = null,
): TxInput {
  n += 1;
  return {
    id: `t${n}`,
    kind,
    amountMinor: NGN(major),
    currency: "NGN",
    categoryId: cat,
    categoryName: catName,
    occurredOn: date,
    merchant,
    description: null,
  };
}

/** Six complete months (May–Oct 2026) plus half of November. */
function fixture(): FinanceInput {
  const txs: TxInput[] = [];
  for (let i = 6; i >= 1; i -= 1) {
    const m = addMonths("2026-11", -i);
    txs.push(tx("income", `${m}-25`, 300_000, SALARY, "Salary", "Employer Ltd"));
    txs.push(tx("expense", `${m}-01`, 100_000, HOUSING, "Housing", "Landlord"));
    txs.push(tx("expense", `${m}-05`, 4_500, SUBS, "Subscriptions", "Netflix"));
    txs.push(tx("expense", `${m}-12`, i <= 3 ? 50_000 : 38_000, FOOD, "Food"));
    txs.push(tx("expense", `${m}-14`, 20_000, TRANSPORT, "Transport"));
  }
  // November so far (day 15): Food on pace for ~60k.
  txs.push(tx("expense", "2026-11-01", 100_000, HOUSING, "Housing", "Landlord"));
  txs.push(tx("expense", "2026-11-05", 4_500, SUBS, "Subscriptions", "Netflix"));
  txs.push(tx("expense", "2026-11-10", 30_000, FOOD, "Food"));
  return {
    today: "2026-11-15",
    currency: "NGN",
    minorPerMajor: 100,
    transactions: txs,
    budgets: [
      {
        id: "budget-food",
        name: "Food",
        categoryId: FOOD,
        categoryName: "Food",
        currency: "NGN",
        limitMinor: NGN(40_000),
        startsOn: "2026-01-01",
        archived: false,
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "New laptop",
        currency: "NGN",
        targetMinor: NGN(1_000_000),
        targetDate: "2027-02-01",
        savedMinor: NGN(100_000),
        status: "active",
      },
    ],
  };
}

const allowed: MemoryPolicyContext = {
  grantedCategories: new Set(["memory_financial"]),
  memoryPaused: false,
  backendAvailable: true,
};

function find(recs: RecommendationDraft[], kind: RecommendationDraft["kind"]) {
  return recs.find((r) => r.kind === kind);
}

/** What the database would hold after the user answers a draft. */
function answered(
  draft: RecommendationDraft,
  status: "accepted" | "rejected" | "modified",
  responseMinor: number | null = null,
): RecommendationRow {
  return {
    id: `rec-${draft.dedupeKey}`,
    user_id: USER,
    kind: draft.kind,
    dedupe_key: draft.dedupeKey,
    period: draft.period,
    title: draft.title,
    explanation: draft.explanation,
    currency_code: draft.currency,
    suggested_minor: draft.suggestedMinor,
    category_id: draft.categoryId,
    goal_id: draft.goalId,
    evidence: {},
    memory_influence: draft.memoryInfluence,
    status,
    response_minor: responseMinor,
    response_note: null,
    responded_at: new Date().toISOString(),
    outcome_memory_id: null,
    created_at: new Date().toISOString(),
  };
}

describe("analysis helpers", () => {
  it("rounds to friendly amounts", () => {
    expect(niceCeil(4_321_700, 100)).toBe(4_400_000);
    expect(niceRound(4_321_700, 100)).toBe(4_300_000);
    expect(niceCeil(50, 100)).toBe(100);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("financial analysis (deterministic)", () => {
  const snapshot = analyzeFinances(fixture());

  it("uses only completed months as history", () => {
    expect(snapshot.completeMonths).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(snapshot.currentMonth).toBe("2026-11");
    expect(snapshot.hasEnoughData).toBe(true);
  });

  it("finds a category over budget in at least 2 of the last 3 months", () => {
    const food = snapshot.overspending.find((o) => o.category.categoryId === FOOD);
    expect(food).toMatchObject({ reason: "over_budget_repeatedly", referenceMinor: NGN(40_000) });
    expect(food?.category.monthsOverBudget).toBe(3);
  });

  it("detects recurring payments and subscriptions", () => {
    const netflix = snapshot.recurring.find((r) => r.name === "Netflix");
    expect(netflix).toMatchObject({
      amountMinor: NGN(4_500),
      typicalDay: 5,
      isSubscription: true,
      months: 6,
    });
    expect(snapshot.recurring.find((r) => r.name === "Landlord")?.isSubscription).toBe(false);
  });

  it("measures income pattern and savings rate", () => {
    expect(snapshot.income).toMatchObject({
      avgMonthlyMinor: NGN(300_000),
      typicalDay: 25,
      monthsObserved: 6,
    });
    // Last 3 months: 300k − (100k + 4.5k + 50k + 20k) = 125.5k → 41.8%
    expect(snapshot.savings.avgRatePct).toBe(41.8);
  });

  it("flags goals that recent saving cannot reach on time", () => {
    expect(snapshot.goals[0]).toMatchObject({
      monthsLeft: 3,
      requiredMonthlyMinor: NGN(300_000),
      onTrack: false,
    });
  });

  it("ignores other currencies instead of converting them", () => {
    const input = fixture();
    input.transactions.push({ ...input.transactions[0]!, id: "usd", currency: "USD" });
    const s = analyzeFinances(input);
    expect(s.otherCurrencies).toEqual(["USD"]);
    expect(s.income?.avgMonthlyMinor).toBe(NGN(300_000));
  });

  it("is reproducible", () => {
    expect(analyzeFinances(fixture())).toEqual(analyzeFinances(fixture()));
  });
});

describe("recommendations without memory", () => {
  const snapshot = analyzeFinances(fixture());
  const { recommendations } = buildRecommendations(snapshot, deriveSignals([]), "en-NG");

  it("suggests a 10% cut for the overspent category, with its numbers", () => {
    const food = find(recommendations, "reduce_category_spend")!;
    expect(food.suggestedPct).toBe(10);
    expect(food.suggestedMinor).toBe(NGN(45_000));
    expect(food.explanation).toContain("3 of the last 3 months");
    expect(food.memoryInfluence).toEqual([]);
  });

  it("suggests reviewing the subscription and funding the goal", () => {
    expect(find(recommendations, "review_subscription")?.subjectName).toBe("Netflix");
    expect(find(recommendations, "goal_contribution")?.suggestedMinor).toBe(NGN(300_000));
  });

  it("does not ask for more savings when the default 10% target is already met", () => {
    expect(find(recommendations, "increase_savings")).toBeUndefined();
  });

  it("produces nothing without enough history", () => {
    const input = fixture();
    input.transactions = input.transactions.filter((t) => t.occurredOn >= "2026-11-01");
    expect(
      buildRecommendations(analyzeFinances(input), deriveSignals([]), "en-NG").recommendations,
    ).toEqual([]);
  });
});

describe("the learning loop through Walrus Memory (official MemWalMock)", () => {
  function memory() {
    const deps: MemoryServiceDeps = {
      client: MemWalMock.create({ namespace: "unused" }),
      repo: inMemoryRepo(),
      namespace: deriveUserNamespace("aven-test", "learning-secret-0123456789abcdefghij", USER),
    };
    return {
      deps,
      async remember(
        draft: RecommendationDraft,
        status: "accepted" | "rejected" | "modified",
        value: number | null = null,
      ) {
        const row = answered(draft, status, value);
        const c = outcomeMemoryCandidate(
          row,
          { key: draft.subjectKey, name: draft.subjectName },
          draft.suggestedPct,
          100,
        );
        expect((await rememberCandidate(deps, USER, c, allowed)).status).toBe("submitted");
        await refreshMemoryJobs(deps, USER);
      },
      async recall() {
        const all = await Promise.all(
          [
            "recommendation outcome accepted rejected changed suggestion",
            "monthly savings target savings performance income pattern",
          ].map((q) => recallMemories(deps, USER, q, allowed, { limit: 25 })),
        );
        const byBlob = new Map(all.flat().map((m) => [m.blobId, m]));
        return [...byBlob.values()];
      },
    };
  }

  it("a rejection recalled from Walrus makes the next suggestion gentler, and says why", async () => {
    const mem = memory();
    const first = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals([]), "en-NG").recommendations,
      "reduce_category_spend",
    )!;
    await mem.remember(first, "rejected");

    const recalled = await mem.recall();
    expect(recalled.some((m) => m.kind === "recommendation_outcome")).toBe(true);
    const next = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals(recalled), "en-NG")
        .recommendations,
      "reduce_category_spend",
    )!;
    expect(next.suggestedPct).toBe(5);
    expect(next.suggestedMinor).toBe(NGN(48_000)); // 5% below 50k, rounded
    expect(next.explanation).toMatch(/declined a 10% cut/);
    expect(next.memoryInfluence[0]?.blob_id).toBe(
      recalled.find((m) => m.kind === "recommendation_outcome")!.blobId,
    );
  });

  it("a second rejection stops the suggestion entirely", async () => {
    const mem = memory();
    const snapshot = analyzeFinances(fixture());
    const first = find(
      buildRecommendations(snapshot, deriveSignals([]), "en-NG").recommendations,
      "reduce_category_spend",
    )!;
    await mem.remember(first, "rejected");
    // The following month's (gentler) suggestion is also declined.
    const secondDraft = {
      ...find(
        buildRecommendations(snapshot, deriveSignals(await mem.recall()), "en-NG").recommendations,
        "reduce_category_spend",
      )!,
      period: "2026-12",
      dedupeKey: "reduce_category_spend:x:2026-12",
    };
    await mem.remember(secondDraft, "rejected");

    const result = buildRecommendations(snapshot, deriveSignals(await mem.recall()), "en-NG");
    expect(find(result.recommendations, "reduce_category_spend")).toBeUndefined();
    expect(result.suppressed.find((s) => s.kind === "reduce_category_spend")?.reason).toMatch(
      /declined spending cuts for Food 2 times/,
    );
  });

  it("a modified answer becomes the next target", async () => {
    const mem = memory();
    const first = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals([]), "en-NG").recommendations,
      "reduce_category_spend",
    )!;
    await mem.remember(first, "modified", NGN(47_000));
    const next = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals(await mem.recall()), "en-NG")
        .recommendations,
      "reduce_category_spend",
    )!;
    expect(next.suggestedMinor).toBe(NGN(47_000));
    expect(next.explanation).toMatch(/your own target/);
  });

  it("an accepted target that was met leads to a small next step", async () => {
    const mem = memory();
    const first = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals([]), "en-NG").recommendations,
      "reduce_category_spend",
    )!;
    // Accepted for September; October's Food spend (50k) did NOT meet 45k → keep the target.
    await mem.remember({ ...first, period: "2026-09" }, "accepted");
    const kept = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals(await mem.recall()), "en-NG")
        .recommendations,
      "reduce_category_spend",
    )!;
    expect(kept.suggestedMinor).toBe(NGN(45_000));
    expect(kept.explanation).toMatch(/keeps that target/);

    // Same acceptance, but October came in under target → next 5% step.
    const input = fixture();
    for (const t of input.transactions)
      if (t.categoryId === FOOD && t.occurredOn.startsWith("2026-10")) t.amountMinor = NGN(44_000);
    const step = find(
      buildRecommendations(analyzeFinances(input), deriveSignals(await mem.recall()), "en-NG")
        .recommendations,
      "reduce_category_spend",
    );
    expect(step?.explanation).toMatch(/You met your/);
  });

  it("a savings target stored only in Walrus changes the savings recommendation", async () => {
    const mem = memory();
    const snapshot = analyzeFinances(fixture());
    expect(
      find(
        buildRecommendations(snapshot, deriveSignals([]), "en-NG").recommendations,
        "increase_savings",
      ),
    ).toBeUndefined();
    expect(
      (await rememberCandidate(mem.deps, USER, savingsTargetCandidate(60, "2026-11-15"), allowed))
        .status,
    ).toBe("submitted");
    const signals = deriveSignals(await mem.recall());
    expect(signals.savingsTarget?.pct).toBe(60);
    const savings = find(
      buildRecommendations(snapshot, signals, "en-NG").recommendations,
      "increase_savings",
    )!;
    expect(savings.suggestedPct).toBe(60);
    expect(savings.suggestedMinor).toBe(NGN(180_000));
    expect(savings.memoryInfluence[0]?.effect).toMatch(/saved target of 60%/);
  });

  it("declining a subscription review is remembered and not asked again", async () => {
    const mem = memory();
    const sub = find(
      buildRecommendations(analyzeFinances(fixture()), deriveSignals([]), "en-NG").recommendations,
      "review_subscription",
    )!;
    await mem.remember(sub, "rejected");
    const result = buildRecommendations(
      analyzeFinances(fixture()),
      deriveSignals(await mem.recall()),
      "en-NG",
    );
    expect(find(result.recommendations, "review_subscription")).toBeUndefined();
    expect(result.suppressed.some((s) => s.kind === "review_subscription")).toBe(true);
  });
});

describe("pattern memories", () => {
  const candidates = snapshotMemoryCandidates(analyzeFinances(fixture()));

  it("are built from completed months, safely, and dedupe across runs", () => {
    const kinds = candidates.map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "savings_performance",
        "overspending_category",
        "income_pattern",
        "subscription",
        "budgeting_style",
        "goal_progress",
      ]),
    );
    expect(candidates.length).toBeLessThanOrEqual(8);
    for (const c of candidates) {
      expect(c.durability).toBe("long_term");
      expect(c.observedOn).toBe("2026-10-01");
      expect(evaluate(c)).toEqual({ allowed: true });
    }
    expect(snapshotMemoryCandidates(analyzeFinances(fixture()))).toEqual(candidates);
  });
});

import { evaluateMemoryCandidate } from "@/lib/memory/policy";
function evaluate(c: Parameters<typeof evaluateMemoryCandidate>[0]) {
  return evaluateMemoryCandidate(c, allowed);
}
