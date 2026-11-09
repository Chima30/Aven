import { expect, it } from "vitest";
import { deriveSignals } from "@/lib/intelligence/learning";
import type { RecalledMemory } from "@/lib/memory/types";

it("does not reuse monetary decisions across currencies or from the future", () => {
  const memory = {
    blobId: "a",
    kind: "recommendation_outcome",
    category: "memory_financial",
    observedOn: "2026-10-01",
    summary: "declined",
    createdAt: null,
    distance: 0,
    facts: {
      rec_kind: "increase_savings",
      subject_key: "savings",
      action: "rejected",
      month: "2026-10",
      currency: "NGN",
    },
  } as RecalledMemory;
  expect(deriveSignals([memory], { currency: "USD", today: "2026-11-09" }).outcomes.size).toBe(0);
  expect(deriveSignals([memory], { currency: "NGN", today: "2026-09-09" }).outcomes.size).toBe(0);
  expect(deriveSignals([memory], { currency: "NGN", today: "2026-11-09" }).outcomes.size).toBe(1);
});
