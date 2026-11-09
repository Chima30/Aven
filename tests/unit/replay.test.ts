import { describe, expect, it } from "vitest";
import { decisionEvents, memoryStatusLabel } from "@/lib/intelligence/replay";
import type { MemoryRecordRow, RecommendationRow } from "@/lib/supabase/database.types";

const rec = {
  id: "rec-1",
  user_id: "a",
  created_at: "2026-10-01",
  responded_at: "2026-10-02",
  title: "Food target",
  status: "rejected",
  outcome_memory_id: "m-1",
  memory_influence: [],
} as unknown as RecommendationRow;
const memory = {
  id: "m-1",
  user_id: "a",
  created_at: "2026-10-02",
  status: "submitted",
  blob_id: "blob-1",
} as MemoryRecordRow;
describe("decision replay", () => {
  it("never calls a pending write confirmed storage", () => {
    expect(memoryStatusLabel(memory)).toContain("awaiting");
    expect(memoryStatusLabel({ status: "queued", blob_id: null })).toContain("not confirmed");
    expect(memoryStatusLabel({ status: "suppressed", blob_id: "b" })).toContain("may remain");
  });
  it("links only later same-user recommendations with exact blob influence", () => {
    const later = {
      ...rec,
      id: "rec-2",
      created_at: "2026-11-01",
      memory_influence: [{ blob_id: "blob-1", memory: "", effect: "Gentler cut" }],
    };
    const events = decisionEvents(
      rec,
      [memory],
      [
        later,
        { ...later, id: "other", user_id: "b" },
        { ...later, id: "early", created_at: "2026-09-01" },
      ],
    );
    expect(events.filter((e) => e.type === "adapted").map((e) => e.recordId)).toEqual(["rec-2"]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
  it("does not infer learning from a decision or unrelated memory", () => {
    expect(decisionEvents(rec, [{ ...memory, user_id: "b" }], []).map((e) => e.type)).toEqual([
      "recommended",
      "decided",
    ]);
  });
});
