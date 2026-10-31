import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * ADMIN client using the Supabase SECRET key. It BYPASSES Row Level Security.
 *
 * Allowed uses (keep this list short and reviewed — see docs/SECURITY.md):
 *   1. Deleting a user's auth account after server-verified re-authentication.
 *   2. Writing the anonymised account_deletion_log (and counting the user's memory
 *      records and wallets for its external_cleanup note).
 *   3. Writing memory_records (src/lib/memory/repository.ts): job ids, blob ids
 *      and statuses come from the MemWal relayer and must not be writable by
 *      users. Every query is filtered by the session's user id.
 *   4. Linking a recommendation to its outcome memory (outcome_memory_id).
 *
 * Never import this from a Client Component ("server-only" enforces it).
 * Never use it for normal reads/writes — use the user's session client instead.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}
