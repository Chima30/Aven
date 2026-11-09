import { expect, it } from "vitest";
import { decisionCounts, spendingObservation } from "@/lib/intelligence/impact";
import type { RecommendationRow } from "@/lib/supabase/database.types";
import type { TxInput } from "@/lib/intelligence/analysis";
const rec = {
  kind: "reduce_category_spend",
  category_id: "food",
  responded_at: "2026-09-15",
  currency_code: "NGN",
  status: "accepted",
  memory_influence: [],
} as unknown as RecommendationRow;
const tx = (date: string, amount: number, currency = "NGN") =>
  ({
    occurredOn: date,
    kind: "expense",
    categoryId: "food",
    amountMinor: amount,
    currency,
  }) as TxInput;
it("counts decisions separately from memory influences", () => {
  expect(decisionCounts([rec, { ...rec, status: "modified" }])).toMatchObject({
    made: 2,
    accepted: 1,
    modified: 1,
    influenced: 0,
  });
});
it("compares whole months without mixing currencies or decision-month spending", () => {
  const result = spendingObservation(
    rec,
    [
      tx("2026-08-10", 100),
      tx("2026-10-10", 80),
      tx("2026-10-11", 999, "USD"),
      tx("2026-09-10", 300),
    ],
    "2026-11-09",
    "2026-09-15",
  );
  expect(result?.changeMinor).toBe(-20n);
});
it("does not treat missing logs, rejection, or a partial month as measured success", () => {
  expect(spendingObservation(rec, [tx("2026-08-01", 100)], "2026-11-09", "2026-09-15")).toBeNull();
  expect(
    spendingObservation(
      rec,
      [tx("2026-08-01", 100), tx("2026-10-01", 80)],
      "2026-10-09",
      "2026-09-15",
    ),
  ).toBeNull();
  expect(
    spendingObservation({ ...rec, status: "rejected" }, [], "2026-11-09", "2026-09-15"),
  ).toBeNull();
});
