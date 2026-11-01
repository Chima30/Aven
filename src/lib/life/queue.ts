"use client";

import { enqueue } from "@/lib/offline/controller";
import type { OfflineLifeEntity } from "./schemas";

/**
 * Quick logging (habit check-ins, water, sleep, meals, activity, mood) and
 * task completion go through the same IndexedDB outbox as transactions, so
 * they work offline and sync exactly once. Edits carry the server version
 * they were based on, so the server reports a conflict instead of silently
 * overwriting a newer change.
 */
export async function queueLife(
  userId: string,
  entity: OfflineLifeEntity,
  operation: "create" | "update" | "delete",
  payload: Record<string, unknown>,
  options: { recordId?: string; baseVersion?: number | null; snapshot?: unknown } = {},
): Promise<string> {
  const recordId = options.recordId ?? crypto.randomUUID();
  await enqueue({
    userId,
    entity,
    operation,
    recordId,
    payload,
    baseVersion: operation === "create" ? null : (options.baseVersion ?? null),
    snapshot: options.snapshot,
    createdOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  });
  return recordId;
}

/** Plain-language description of a queued life entry (Sync center, pending lists). */
export function describeLifeEntry(
  entity: string,
  operation: string,
  payload: Record<string, unknown> | undefined,
): string {
  const p = payload ?? {};
  const verb = operation === "delete" ? "Delete" : operation === "update" ? "Update" : "Add";
  switch (entity) {
    case "task":
      return operation === "update"
        ? `Task marked ${String(p.status ?? "updated").replace("_", " ")}`
        : `${verb} task`;
    case "habit_check_in":
      return operation === "delete"
        ? "Undo habit check-in"
        : `Habit check-in for ${String(p.on_date ?? "")}`;
    case "water_log":
      return `${verb} water: ${String(p.amount_ml ?? "")} ml`;
    case "sleep_log":
      return `${verb} sleep (woke ${String(p.wake_date ?? "")})`;
    case "meal_log":
      return `${verb} ${String(p.meal_type ?? "meal")}: ${String(p.description ?? "")}`;
    case "activity_log":
      return `${verb} ${String(p.activity_type ?? "activity").replace("_", " ")}, ${String(p.duration_minutes ?? "")} min`;
    case "mood_log":
      return p.source === "pulse_check" ? "Pulse Check" : `${verb} mood check-in`;
    default:
      return `${verb} ${entity.replace(/_/g, " ")}`;
  }
}
