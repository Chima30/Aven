import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { FinanceEntity, MutationResult } from "@/lib/supabase/database.types";

export interface MutationInput {
  mutationId: string;
  entity: FinanceEntity;
  operation: "create" | "update" | "delete";
  recordId: string;
  payload: Record<string, unknown>;
  baseVersion?: number | null;
  deviceId?: string | null;
}

/**
 * Apply one finance mutation through the database's single write path,
 * using the signed-in user's session. Throws only for infrastructure errors
 * (network/database); rule violations come back as { status: "rejected" }.
 */
export async function applyMutation(
  supabase: ServerSupabase,
  input: MutationInput,
): Promise<MutationResult> {
  const { data, error } = await supabase.rpc("apply_finance_mutation", {
    p_mutation_id: input.mutationId,
    p_entity: input.entity,
    p_operation: input.operation,
    p_record_id: input.recordId,
    p_payload: input.payload,
    p_base_version: input.baseVersion ?? null,
    p_device_id: input.deviceId ?? null,
  });
  if (error || !data) {
    throw new Error(`Finance mutation failed: ${error?.code ?? "no data"}`);
  }
  return data;
}
