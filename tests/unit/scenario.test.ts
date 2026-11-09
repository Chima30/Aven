import { expect, it } from "vitest";
import { projectScenario } from "@/lib/intelligence/scenario";
const base = {
  balanceMinor: 50000000n,
  reservedMinor: 20000000n,
  monthlySavingMinor: 1000000n,
  additionalMonthlyMinor: 2000000n,
  purchaseMinor: 25000000n,
  months: 12,
  goalRemainingMinor: 25000000n,
};
it("projects a purchase and additional savings with exact minor-unit arithmetic", () => {
  expect(projectScenario(base)).toMatchObject({
    availableMinor: 30000000n,
    afterPurchaseMinor: 5000000n,
    coversPurchase: true,
    beforeMinor: 42000000n,
    afterMinor: 41000000n,
    goalMonthsBefore: 25n,
    goalMonthsAfter: 9n,
  });
});
it("handles debt, no saving rate, and funded goals without invented completion", () => {
  expect(
    projectScenario({
      ...base,
      balanceMinor: -1n,
      monthlySavingMinor: 0n,
      additionalMonthlyMinor: 0n,
    }),
  ).toMatchObject({ coversPurchase: false, goalMonthsAfter: null });
  expect(projectScenario({ ...base, goalRemainingMinor: 0n }).goalMonthsAfter).toBe(0n);
});
it("rejects negative assumptions and invalid horizons", () => {
  expect(() => projectScenario({ ...base, months: 1.5 })).toThrow();
  expect(() => projectScenario({ ...base, reservedMinor: -1n })).toThrow();
});
it("does not lose precision for large balances or mutate inputs", () => {
  const input = { ...base, balanceMinor: 90071992547409931n };
  expect(projectScenario(input).availableMinor).toBe(90071992527409931n);
  expect(input.balanceMinor).toBe(90071992547409931n);
});

it("scopes goals to the selected currency and preserves exact saved amounts", async () => {
  const { goalsForScenario } = await import("@/lib/intelligence/scenario");
  const goal = {
    id: "g",
    name: "Laptop",
    currency: "NGN",
    status: "active",
    targetMinor: "90071992547409935",
    savedMinor: "90071992547409931",
  };
  expect(
    goalsForScenario(
      [goal, { ...goal, id: "usd", currency: "USD" }, { ...goal, id: "done", status: "completed" }],
      "NGN",
    ),
  ).toEqual([{ id: "g", name: "Laptop", remainingMinor: "4" }]);
});
it("calculates budget cuts exactly and rejects invalid percentages", async () => {
  const { budgetReduction } = await import("@/lib/intelligence/scenario");
  expect(budgetReduction(5000000n, 10)).toBe(500000n);
  expect(budgetReduction(101n, 10)).toBe(10n);
  expect(() => budgetReduction(500n, 10.5)).toThrow();
  expect(() => budgetReduction(500n, 101)).toThrow();
});
