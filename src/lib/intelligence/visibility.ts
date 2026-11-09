import type { RecommendationRow } from "@/lib/supabase/database.types";

/** Historical decisions remain intact; open advice must not depend on unavailable memory. */
export function visibleRecommendations(
  rows: RecommendationRow[],
  memoryAvailable: boolean,
  suppressedBlobs: ReadonlySet<string | null>,
) {
  return rows
    .filter(
      (row) =>
        row.status !== "open" ||
        row.memory_influence.length === 0 ||
        (memoryAvailable && row.memory_influence.every((m) => !suppressedBlobs.has(m.blob_id))),
    )
    .map((row) => ({
      ...row,
      memory_influence: memoryAvailable
        ? row.memory_influence.filter((m) => !suppressedBlobs.has(m.blob_id))
        : [],
    }));
}
