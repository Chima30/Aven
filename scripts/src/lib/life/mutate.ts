import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { LifeEntity, MutationResult } from "@/lib/supabase/database.types";

export interface LifeMutationInput {
  mutationId: string;
  entity: LifeEntity;
  operation: "create" | "update" | "delete";
  recordId: string;
  payload: Record<string, unknown>;
  baseVersion?: number | null;
  deviceId?: string | null;
}

/**
 * Apply one planning/wellbeing mutation through the database's single write
 * path, with the signed-in user's session. Throws only on infrastructure
 * errors; rule violations come back as { status: "rejected" | "conflict" }.
 */
export async function applyLifeMutation(
  supabase: ServerSupabase,
  input: LifeMutationInput,
): Promise<MutationResult> {
  const { data, error } = await supabase.rpc("apply_life_mutation", {
    p_mutation_id: input.mutationId,
    p_entity: input.entity,
    p_operation: input.operation,
    p_record_id: input.recordId,
    p_payload: input.payload,
    p_base_version: input.baseVersion ?? null,
    p_device_id: input.deviceId ?? null,
  });
  if (error || !data) throw new Error(`Life mutation failed: ${error?.code ?? "no data"}`);
  return data;
}
