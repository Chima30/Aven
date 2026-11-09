import type { MemoryRecordRow, RecommendationRow } from "@/lib/supabase/database.types";

/** A read model of existing durable records, not a second event store. */
export interface DecisionEvent {
  id: string;
  type: "recommended" | "decided" | "memory" | "adapted";
  at: string;
  recordId: string;
  label: string;
}

export function memoryStatusLabel(record: Pick<MemoryRecordRow, "status" | "blob_id"> | null) {
  if (!record) return "No linked memory";
  switch (record.status) {
    case "stored":
      return record.blob_id ? "Confirmed stored on Walrus" : "Storage reference unavailable";
    case "submitted":
      return "Submitted; awaiting Walrus confirmation";
    case "queued":
      return "Queued; not confirmed stored";
    case "failed":
      return "Memory write failed";
    case "suppressed":
      return "Forgotten by AVEN; encrypted Walrus data may remain";
  }
}

export function decisionEvents(
  rec: RecommendationRow,
  memories: MemoryRecordRow[],
  recommendations: RecommendationRow[],
): DecisionEvent[] {
  const events: DecisionEvent[] = [
    {
      id: `recommendation:${rec.id}`,
      type: "recommended",
      at: rec.created_at,
      recordId: rec.id,
      label: rec.title,
    },
  ];
  if (rec.status !== "open" && rec.responded_at)
    events.push({
      id: `decision:${rec.id}`,
      type: "decided",
      at: rec.responded_at,
      recordId: rec.id,
      label: rec.status,
    });
  const memory = memories.find((m) => m.id === rec.outcome_memory_id && m.user_id === rec.user_id);
  if (memory) {
    events.push({
      id: `memory:${memory.id}`,
      type: "memory",
      at: memory.created_at,
      recordId: memory.id,
      label: memoryStatusLabel(memory),
    });
    if (memory.blob_id)
      for (const later of recommendations) {
        if (
          later.user_id !== rec.user_id ||
          later.created_at <= (rec.responded_at ?? rec.created_at)
        )
          continue;
        if (later.memory_influence.some((m) => m.blob_id === memory.blob_id))
          events.push({
            id: `adaptation:${rec.id}:${later.id}`,
            type: "adapted",
            at: later.created_at,
            recordId: later.id,
            label: later.title,
          });
      }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
