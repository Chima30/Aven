/** Pure bigint simulation. No network, persistence, finance writes or AI. */
export interface ScenarioInput {
  balanceMinor: bigint;
  reservedMinor: bigint;
  monthlySavingMinor: bigint;
  additionalMonthlyMinor: bigint;
  purchaseMinor: bigint;
  months: number;
  goalRemainingMinor: bigint | null;
}
export function projectScenario(input: ScenarioInput) {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 120)
    throw new RangeError("Choose 1 to 120 months.");
  if (
    [
      input.reservedMinor,
      input.monthlySavingMinor,
      input.additionalMonthlyMinor,
      input.purchaseMinor,
    ].some((v) => v < 0n) ||
    (input.goalRemainingMinor !== null && input.goalRemainingMinor < 0n)
  )
    throw new RangeError("Assumptions must be zero or positive.");
  const available = input.balanceMinor - input.reservedMinor;
  const monthly = input.monthlySavingMinor + input.additionalMonthlyMinor;
  const monthsTo = (remaining: bigint | null, rate: bigint) =>
    remaining === null
      ? null
      : remaining === 0n
        ? 0n
        : rate > 0n
          ? (remaining + rate - 1n) / rate
          : null;
  return {
    availableMinor: available,
    afterPurchaseMinor: available - input.purchaseMinor,
    coversPurchase: available >= input.purchaseMinor,
    beforeMinor: available + input.monthlySavingMinor * BigInt(input.months),
    afterMinor: available - input.purchaseMinor + monthly * BigInt(input.months),
    goalMonthsBefore: monthsTo(input.goalRemainingMinor, input.monthlySavingMinor),
    // Purchase is paid from available cash; it never automatically reduces tracked goal progress.
    goalMonthsAfter: monthsTo(input.goalRemainingMinor, monthly),
  };
}

/** Never interpret another currency's goal as a goal in the scenario currency. */
export function goalsForScenario(
  goals: {
    id: string;
    name: string;
    currency: string;
    status: string;
    targetMinor: bigint | string | number;
    savedMinor: bigint | string | number;
  }[],
  currency: string,
) {
  return goals
    .filter((g) => g.status === "active" && g.currency === currency)
    .map((g) => ({
      id: g.id,
      name: g.name,
      remainingMinor: (BigInt(g.targetMinor) > BigInt(g.savedMinor)
        ? BigInt(g.targetMinor) - BigInt(g.savedMinor)
        : 0n
      ).toString(),
    }));
}

/** Potential monthly reduction, rounded down to whole minor units. It is an assumption, not savings already achieved. */
export function budgetReduction(limitMinor: bigint, percent: number) {
  if (limitMinor < 0n || !Number.isInteger(percent) || percent < 0 || percent > 100)
    throw new RangeError("Choose a whole budget reduction percentage from 0 to 100.");
  return (limitMinor * BigInt(percent)) / 100n;
}
