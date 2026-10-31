/**
 * Deterministic financial analysis.
 *
 * Every number here is computed from the user's own records in Supabase. No
 * AI model is involved, nothing is estimated from outside data, and the
 * same input always gives the same output (the clock is an input too).
 */

export interface TxInput {
  id: string;
  kind: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  occurredOn: string;
  merchant: string | null;
  description: string | null;
}

export interface BudgetInput {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  currency: string;
  limitMinor: number;
  startsOn: string;
  archived: boolean;
}

export interface GoalInput {
  id: string;
  name: string;
  currency: string;
  targetMinor: number;
  targetDate: string | null;
  savedMinor: number;
  status: "active" | "paused" | "completed" | "archived";
}

export interface FinanceInput {
  /** Local date (YYYY-MM-DD) in the user's time zone. */
  today: string;
  /** The currency analysed (the user's default currency). */
  currency: string;
  /** 10^minor_units of that currency (100 for NGN/USD, 1 for JPY, 1000 for KWD). */
  minorPerMajor: number;
  transactions: TxInput[];
  budgets: BudgetInput[];
  goals: GoalInput[];
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  /** Spend per month key (YYYY-MM), complete months and the current month. */
  monthly: Record<string, number>;
  /** Median spend over complete months with data (0 when none). */
  medianComplete: number;
  completeMonthsWithSpend: number;
  current: number;
  /** Current-month spend projected to month end (null early in the month). */
  projectedCurrent: number | null;
  budgetLimit: number | null;
  budgetId: string | null;
  /** Of the last 3 complete months, how many were over budget. */
  monthsOverBudget: number;
}

export interface OverspendFinding {
  category: CategoryStat;
  reason: "over_budget_repeatedly" | "projected_over_budget" | "above_usual";
  /** The level the spend is compared against (budget limit or usual median). */
  referenceMinor: number;
  /** The figure that is over (projection or last complete month). */
  observedMinor: number;
}

export interface RecurringItem {
  key: string;
  name: string;
  amountMinor: number;
  typicalDay: number;
  months: number;
  categoryId: string | null;
  categoryName: string | null;
  isSubscription: boolean;
}

export interface SavingsMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
  ratePct: number | null;
}

export interface GoalStat {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  progressPct: number;
  targetDate: string | null;
  monthsLeft: number | null;
  requiredMonthlyMinor: number | null;
  onTrack: boolean | null;
}

export interface FinancialSnapshot {
  currency: string;
  minorPerMajor: number;
  today: string;
  currentMonth: string;
  completeMonths: string[];
  daysElapsed: number;
  daysInMonth: number;
  categories: CategoryStat[];
  overspending: OverspendFinding[];
  recurring: RecurringItem[];
  income: { avgMonthlyMinor: number; typicalDay: number | null; monthsObserved: number } | null;
  savings: { months: SavingsMonth[]; avgRatePct: number | null; avgNetMinor: number | null };
  budgeting: { style: "none" | "light" | "structured"; budgetCount: number; coveragePct: number };
  goals: GoalStat[];
  otherCurrencies: string[];
  hasEnoughData: boolean;
  transactionCount: number;
}

export const LOOKBACK_MONTHS = 6;
const PROJECTION_MIN_DAYS = 7;
const ABOVE_USUAL_FACTOR = 1.25;
const SUBSCRIPTION_RE =
  /subscri|stream|membership|software|saas|netflix|spotify|prime|icloud|youtube/i;

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  return `${String(year).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return ty * 12 + tm - (fy * 12 + fm);
}

export function daysInMonthOf(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Rounds up to two significant figures, never below one major unit: 43,217 → 44,000. */
export function niceCeil(minor: number, minorPerMajor: number): number {
  if (minor <= 0) return 0;
  const magnitude = Math.max(minorPerMajor, 10 ** (Math.floor(Math.log10(minor)) - 1));
  return Math.ceil(minor / magnitude) * magnitude;
}

/** Rounds to two significant figures, never below one major unit. */
export function niceRound(minor: number, minorPerMajor: number): number {
  if (minor <= 0) return 0;
  const magnitude = Math.max(minorPerMajor, 10 ** (Math.floor(Math.log10(minor)) - 1));
  return Math.max(magnitude, Math.round(minor / magnitude) * magnitude);
}

function add(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError("Amount total is too large to analyse");
  return sum;
}

export function normaliseMerchant(tx: Pick<TxInput, "merchant" | "description">): string | null {
  const raw = (tx.merchant ?? tx.description ?? "").toLowerCase();
  const cleaned = raw
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 40) : null;
}

function displayName(tx: Pick<TxInput, "merchant" | "description">): string {
  return (tx.merchant ?? tx.description ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function detectRecurring(
  txs: TxInput[],
  completeMonths: Set<string>,
): Map<
  string,
  { name: string; amounts: number[]; days: number[]; months: Set<string>; tx: TxInput }
> {
  const groups = new Map<
    string,
    { name: string; amounts: number[]; days: number[]; months: Set<string>; tx: TxInput }
  >();
  for (const tx of txs) {
    const key = normaliseMerchant(tx);
    if (!key) continue;
    const month = monthKey(tx.occurredOn);
    if (!completeMonths.has(month)) continue;
    const g = groups.get(key) ?? {
      name: displayName(tx),
      amounts: [],
      days: [],
      months: new Set(),
      tx,
    };
    if (g.months.has(month)) continue; // one per month counts towards "recurring"
    g.amounts.push(tx.amountMinor);
    g.days.push(Number(tx.occurredOn.slice(8, 10)));
    g.months.add(month);
    groups.set(key, g);
  }
  return groups;
}

export function analyzeFinances(input: FinanceInput): FinancialSnapshot {
  const currentMonth = monthKey(input.today);
  const daysInMonth = daysInMonthOf(currentMonth);
  const daysElapsed = Number(input.today.slice(8, 10));
  const inCurrency = input.transactions.filter((t) => t.currency === input.currency);
  const otherCurrencies = [
    ...new Set(
      input.transactions.filter((t) => t.currency !== input.currency).map((t) => t.currency),
    ),
  ].sort();

  const firstMonth = inCurrency.reduce<string | null>(
    (min, t) => (min === null || monthKey(t.occurredOn) < min ? monthKey(t.occurredOn) : min),
    null,
  );
  const completeMonths: string[] = [];
  if (firstMonth) {
    for (let i = LOOKBACK_MONTHS; i >= 1; i -= 1) {
      const m = addMonths(currentMonth, -i);
      if (m >= firstMonth) completeMonths.push(m);
    }
  }
  const windowMonths = new Set([...completeMonths, currentMonth]);
  const windowTx = inCurrency.filter(
    (t) => windowMonths.has(monthKey(t.occurredOn)) && t.occurredOn <= input.today,
  );

  const completeSet = new Set(completeMonths);
  // Recurring expenses and subscriptions (complete months only, ≥3 months, stable amount and day)
  const recurring: RecurringItem[] = [];
  for (const [key, g] of detectRecurring(
    inCurrency.filter((t) => t.kind === "expense"),
    completeSet,
  )) {
    if (g.months.size < 3) continue;
    const med = median(g.amounts);
    const stable = g.amounts.every((a) => Math.abs(a - med) <= med * 0.1);
    const daySpread = Math.max(...g.days) - Math.min(...g.days);
    if (!stable || daySpread > 5 || med <= 0) continue;
    recurring.push({
      key,
      name: g.name || key,
      amountMinor: med,
      typicalDay: median(g.days),
      months: g.months.size,
      categoryId: g.tx.categoryId,
      categoryName: g.tx.categoryName,
      isSubscription: SUBSCRIPTION_RE.test(`${g.tx.categoryName ?? ""} ${g.name}`),
    });
  }
  recurring.sort((a, b) => b.amountMinor - a.amountMinor || a.key.localeCompare(b.key));

  // Fixed charges already paid this month are not "pace": projecting a rent paid on
  // day 1 across the month would wrongly double it.
  const recurringKeys = new Set(recurring.map((r) => r.key));
  const currentRecurringBy = new Map<string, number>();

  // Income / expense per month
  const incomeBy: Record<string, number> = {};
  const expenseBy: Record<string, number> = {};
  for (const m of windowMonths) {
    incomeBy[m] = 0;
    expenseBy[m] = 0;
  }
  const catMap = new Map<string, CategoryStat>();
  for (const t of windowTx) {
    const m = monthKey(t.occurredOn);
    if (t.kind === "income") incomeBy[m] = add(incomeBy[m]!, t.amountMinor);
    if (t.kind !== "expense") continue;
    expenseBy[m] = add(expenseBy[m]!, t.amountMinor);
    if (!t.categoryId) continue;
    const stat =
      catMap.get(t.categoryId) ??
      ({
        categoryId: t.categoryId,
        name: t.categoryName ?? "Uncategorised",
        monthly: {},
        medianComplete: 0,
        completeMonthsWithSpend: 0,
        current: 0,
        projectedCurrent: null,
        budgetLimit: null,
        budgetId: null,
        monthsOverBudget: 0,
      } satisfies CategoryStat);
    stat.monthly[m] = add(stat.monthly[m] ?? 0, t.amountMinor);
    catMap.set(t.categoryId, stat);
    if (m === currentMonth) {
      const key = normaliseMerchant(t);
      if (key && recurringKeys.has(key)) {
        currentRecurringBy.set(
          t.categoryId,
          add(currentRecurringBy.get(t.categoryId) ?? 0, t.amountMinor),
        );
      }
    }
  }

  const activeBudgets = input.budgets.filter((b) => !b.archived && b.currency === input.currency);
  const budgetByCategory = new Map(
    activeBudgets.filter((b) => b.categoryId).map((b) => [b.categoryId!, b]),
  );
  const lastThree = completeMonths.slice(-3);

  for (const stat of catMap.values()) {
    const completeValues = completeMonths.map((m) => stat.monthly[m] ?? 0);
    const withSpend = completeValues.filter((v) => v > 0);
    stat.completeMonthsWithSpend = withSpend.length;
    stat.medianComplete = median(completeValues.length > 0 ? completeValues : []);
    stat.current = stat.monthly[currentMonth] ?? 0;
    const fixed = currentRecurringBy.get(stat.categoryId) ?? 0;
    stat.projectedCurrent =
      daysElapsed >= PROJECTION_MIN_DAYS
        ? fixed + Math.round(((stat.current - fixed) * daysInMonth) / Math.max(daysElapsed, 1))
        : null;
    const budget = budgetByCategory.get(stat.categoryId);
    if (budget) {
      stat.budgetLimit = budget.limitMinor;
      stat.budgetId = budget.id;
      const startMonth = monthKey(budget.startsOn);
      stat.monthsOverBudget = lastThree.filter(
        (m) => m >= startMonth && (stat.monthly[m] ?? 0) > budget.limitMinor,
      ).length;
    }
  }
  const categories = [...catMap.values()].sort(
    (a, b) => b.medianComplete - a.medianComplete || a.name.localeCompare(b.name),
  );

  // Overspending
  const overspending: OverspendFinding[] = [];
  for (const c of categories) {
    if (c.budgetLimit !== null && c.monthsOverBudget >= 2) {
      const last = lastThree.at(-1);
      overspending.push({
        category: c,
        reason: "over_budget_repeatedly",
        referenceMinor: c.budgetLimit,
        observedMinor: last ? (c.monthly[last] ?? 0) : c.current,
      });
    } else if (
      c.budgetLimit !== null &&
      c.projectedCurrent !== null &&
      c.projectedCurrent > c.budgetLimit
    ) {
      overspending.push({
        category: c,
        reason: "projected_over_budget",
        referenceMinor: c.budgetLimit,
        observedMinor: c.projectedCurrent,
      });
    } else if (
      c.budgetLimit === null &&
      c.completeMonthsWithSpend >= 2 &&
      c.medianComplete > 0 &&
      c.projectedCurrent !== null &&
      c.projectedCurrent > c.medianComplete * ABOVE_USUAL_FACTOR
    ) {
      overspending.push({
        category: c,
        reason: "above_usual",
        referenceMinor: c.medianComplete,
        observedMinor: c.projectedCurrent,
      });
    }
  }

  // Income pattern
  const incomeMonths = completeMonths.filter((m) => (incomeBy[m] ?? 0) > 0);
  let income: FinancialSnapshot["income"] = null;
  if (incomeMonths.length >= 2) {
    const firstDays = incomeMonths.map((m) => {
      const days = windowTx
        .filter((t) => t.kind === "income" && monthKey(t.occurredOn) === m)
        .map((t) => Number(t.occurredOn.slice(8, 10)));
      return Math.min(...days);
    });
    const spread = Math.max(...firstDays) - Math.min(...firstDays);
    income = {
      avgMonthlyMinor: Math.round(
        incomeMonths.reduce((s, m) => add(s, incomeBy[m]!), 0) / incomeMonths.length,
      ),
      typicalDay: spread <= 5 ? median(firstDays) : null,
      monthsObserved: incomeMonths.length,
    };
  }

  // Savings performance
  const savingsMonths: SavingsMonth[] = completeMonths.map((m) => {
    const inc = incomeBy[m] ?? 0;
    const exp = expenseBy[m] ?? 0;
    return {
      month: m,
      income: inc,
      expense: exp,
      net: inc - exp,
      ratePct: inc > 0 ? Math.round(((inc - exp) / inc) * 1000) / 10 : null,
    };
  });
  const rated = savingsMonths.slice(-3).filter((s) => s.ratePct !== null);
  const savings = {
    months: savingsMonths,
    avgRatePct:
      rated.length > 0
        ? Math.round((rated.reduce((s, r) => s + r.ratePct!, 0) / rated.length) * 10) / 10
        : null,
    avgNetMinor:
      rated.length > 0 ? Math.round(rated.reduce((s, r) => s + r.net, 0) / rated.length) : null,
  };

  // Budgeting style: share of complete-month spend in budgeted categories
  const totalSpend = completeMonths.reduce((s, m) => add(s, expenseBy[m] ?? 0), 0);
  const budgetedSpend = categories
    .filter((c) => c.budgetLimit !== null)
    .reduce(
      (s, c) =>
        add(
          s,
          completeMonths.reduce((x, m) => add(x, c.monthly[m] ?? 0), 0),
        ),
      0,
    );
  const hasOverall = activeBudgets.some((b) => b.categoryId === null);
  const coveragePct = totalSpend > 0 ? Math.round((budgetedSpend / totalSpend) * 100) : 0;
  const budgeting = {
    style:
      activeBudgets.length === 0
        ? ("none" as const)
        : coveragePct >= 60 || hasOverall
          ? ("structured" as const)
          : ("light" as const),
    budgetCount: activeBudgets.length,
    coveragePct: hasOverall ? 100 : coveragePct,
  };

  // Goals
  const goals: GoalStat[] = input.goals
    .filter((g) => g.status === "active" && g.currency === input.currency && g.targetMinor > 0)
    .map((g) => {
      const remaining = Math.max(0, g.targetMinor - g.savedMinor);
      const monthsLeft = g.targetDate
        ? Math.max(0, monthsBetween(currentMonth, monthKey(g.targetDate)))
        : null;
      const requiredMonthly =
        monthsLeft !== null
          ? monthsLeft > 0
            ? Math.ceil(remaining / monthsLeft)
            : remaining
          : null;
      // On track if the average recent net saving covers the required monthly amount.
      const onTrack =
        requiredMonthly === null
          ? null
          : remaining === 0
            ? true
            : savings.avgNetMinor !== null && savings.avgNetMinor >= requiredMonthly;
      return {
        id: g.id,
        name: g.name,
        targetMinor: g.targetMinor,
        savedMinor: g.savedMinor,
        progressPct: Math.min(100, Math.floor((g.savedMinor / g.targetMinor) * 100)),
        targetDate: g.targetDate,
        monthsLeft,
        requiredMonthlyMinor: requiredMonthly,
        onTrack,
      };
    });

  return {
    currency: input.currency,
    minorPerMajor: input.minorPerMajor,
    today: input.today,
    currentMonth,
    completeMonths,
    daysElapsed,
    daysInMonth,
    categories,
    overspending,
    recurring,
    income,
    savings,
    budgeting,
    goals,
    otherCurrencies,
    hasEnoughData: completeMonths.some((m) => (expenseBy[m] ?? 0) > 0 || (incomeBy[m] ?? 0) > 0),
    transactionCount: windowTx.length,
  };
}
