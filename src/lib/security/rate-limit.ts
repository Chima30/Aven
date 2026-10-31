import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Limits for sensitive actions (per user). */
export const RATE_LIMITS = {
  delete_account: { max: 5, windowSeconds: 60 * 60 },
  change_password: { max: 5, windowSeconds: 60 * 60 },
  export_data: { max: 10, windowSeconds: 60 * 60 },
  sign_out_everywhere: { max: 10, windowSeconds: 60 * 60 },
  sync: { max: 120, windowSeconds: 60 },
  finance_write: { max: 120, windowSeconds: 60 },
  // External providers: keep each user's share of AVEN's Walrus and Tatum quotas bounded.
  memory_write: { max: 60, windowSeconds: 60 * 60 },
  memory_read: { max: 60, windowSeconds: 60 * 10 },
  chain_read: { max: 60, windowSeconds: 60 * 10 },
  chain_import: { max: 30, windowSeconds: 60 * 60 },
  wallet_change: { max: 20, windowSeconds: 60 * 60 },
  recommendations: { max: 30, windowSeconds: 60 * 60 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/**
 * Consume one attempt. Returns false when the limit is exceeded.
 * FAILS CLOSED: if the database cannot be reached, the action is refused.
 */
export async function consumeRateLimit(
  supabase: ServerSupabase,
  action: RateLimitedAction,
): Promise<boolean> {
  const { max, windowSeconds } = RATE_LIMITS[action];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action: action,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[rate-limit] check failed for ${action}: ${error.code ?? "unknown"}`);
    return false;
  }
  return data === true;
}
