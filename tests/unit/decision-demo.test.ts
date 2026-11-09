import { expect, it } from "vitest";
import { demoRecommendations } from "@/lib/intelligence/demo";
import type { RecalledMemory } from "@/lib/memory/types";
it("uses real rules to soften a rejected example cut and honor a modified target", () => {
  const original = demoRecommendations("2026-11", []).recommendations.find(
    (r) => r.kind === "reduce_category_spend",
  )!;
  expect(original.suggestedPct).toBe(10);
  const memory: RecalledMemory = {
    blobId: "example-local",
    kind: "recommendation_outcome",
    category: "memory_financial",
    observedOn: "2026-11-01",
    createdAt: "2026-11-15",
    summary: "Example rejection",
    distance: 0,
    facts: {
      rec_kind: original.kind,
      subject_key: original.subjectKey,
      action: "rejected",
      month: "2026-11",
      suggested_pct: "10",
      currency: "NGN",
    },
  };
  const next = demoRecommendations("2026-12", [memory]).recommendations.find(
    (r) => r.kind === original.kind,
  )!;
  expect(next.suggestedPct).toBe(5);
  expect(next.memoryInfluence[0]?.blob_id).toBe(memory.blobId);
  const modified = {
    ...memory,
    facts: { ...memory.facts, action: "modified", chosen_minor: "5200000" },
  };
  expect(
    demoRecommendations("2026-12", [modified]).recommendations.find((r) => r.kind === original.kind)
      ?.suggestedMinor,
  ).toBe(5200000);
});
