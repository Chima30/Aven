import { addMonths, analyzeFinances, type FinanceInput } from "./analysis";
import { buildRecommendations } from "./recommend";
import { deriveSignals } from "./learning";
import type { RecalledMemory } from "@/lib/memory/types";

/** Explicit synthetic fixtures, used ONLY by the public /demo sandbox. */
export function demoInput(period: string): FinanceInput {
  const months = [-3, -2, -1, 0].map((n) => addMonths(period, n));
  return {
    today: `${period}-15`,
    currency: "NGN",
    minorPerMajor: 100,
    transactions: months.flatMap((month, i) => [
      {
        id: `example-income-${month}`,
        kind: "income" as const,
        amountMinor: 20000000,
        currency: "NGN",
        categoryId: null,
        categoryName: null,
        occurredOn: `${month}-01`,
        merchant: null,
        description: "Example salary",
      },
      {
        id: `example-food-${month}`,
        kind: "expense" as const,
        amountMinor: i === 3 ? 3500000 : 5500000,
        currency: "NGN",
        categoryId: "example-food",
        categoryName: "Food",
        occurredOn: `${month}-10`,
        merchant: null,
        description: "Example food expenses",
      },
    ]),
    budgets: [
      {
        id: "example-budget",
        name: "Food",
        categoryId: "example-food",
        categoryName: "Food",
        currency: "NGN",
        limitMinor: 5000000,
        startsOn: `${months[0]}-01`,
        archived: false,
      },
    ],
    goals: [
      {
        id: "example-goal",
        name: "Laptop",
        currency: "NGN",
        targetMinor: 25000000,
        targetDate: `${addMonths(period, 6)}-01`,
        savedMinor: 5000000,
        status: "active",
      },
    ],
  };
}
export function demoRecommendations(period: string, memories: RecalledMemory[]) {
  const input = demoInput(period);
  return buildRecommendations(
    analyzeFinances(input),
    deriveSignals(memories, { currency: "NGN", today: input.today }),
    "en-NG",
  );
}
