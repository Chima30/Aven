import { expect, it } from "vitest";
import { visibleRecommendations } from "@/lib/intelligence/visibility";
import type { RecommendationRow } from "@/lib/supabase/database.types";
const row = {
  id: "r",
  status: "open",
  memory_influence: [{ blob_id: "forgotten", memory: "private", effect: "kept target" }],
} as RecommendationRow;
it("does not present open memory-dependent advice after pause, withdrawal or forgetting", () => {
  expect(visibleRecommendations([row], false, new Set())).toEqual([]);
  expect(visibleRecommendations([row], true, new Set(["forgotten"]))).toEqual([]);
  expect(visibleRecommendations([row], true, new Set())).toHaveLength(1);
});
it("keeps answered history but hides unavailable influence summaries without mutating records", () => {
  const answered = { ...row, status: "accepted" as const };
  expect(visibleRecommendations([answered], false, new Set())[0]?.memory_influence).toEqual([]);
  expect(answered.memory_influence).toHaveLength(1);
});
