import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { SecurityEventAction } from "@/lib/supabase/database.types";

/**
 * Record a security event in the user's audit log. Best-effort: a logging
 * failure must never block sign-in or sign-out, but it is reported to the
 * server logs (without personal data).
 */
export async function logSecurityEvent(supabase: ServerSupabase, action: SecurityEventAction) {
  const { error } = await supabase.rpc("log_security_event", { p_action: action });
  if (error) console.error(`[audit] could not record ${action}: ${error.code ?? "unknown"}`);
}
