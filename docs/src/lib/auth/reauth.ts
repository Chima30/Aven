import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Server-verified re-authentication.
 *
 * Checks a password against Supabase Auth using a throw-away client that
 * stores nothing and sets no cookies, then confirms the password belongs to
 * the SAME user as the current session. Used before account deletion and
 * password changes.
 *
 * Note: a successful check creates a short-lived session on Supabase's side
 * which is immediately signed out again.
 */
export async function verifyPasswordForUser(
  expectedUserId: string,
  email: string,
  password: string,
): Promise<boolean> {
  const env = publicEnv();
  const verifier = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;
  const matches = data.user.id === expectedUserId;
  // End the temporary verification session only (not the user's real sessions).
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return matches;
}
