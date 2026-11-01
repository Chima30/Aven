import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserPreferencesRow } from "@/lib/supabase/database.types";

/**
 * Returns the signed-in user, verified with Supabase Auth (not just decoded
 * from the cookie), or null. Cached for the duration of one request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** For protected pages and actions: redirect to sign-in when there is no valid session. */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const query = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/sign-in${query}`);
  }
  return user;
}

export interface AppContext {
  user: User;
  profile: ProfileRow;
  preferences: UserPreferencesRow;
}

/**
 * The signed-in user's profile and preferences, read through RLS.
 * If the rows are missing (e.g. migrations not run), throws a clear error.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const [profile, preferences] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).single(),
  ]);
  if (profile.error || preferences.error || !profile.data || !preferences.data) {
    throw new Error(
      "Your AVEN profile could not be loaded. If this is a new deployment, check that all Supabase migrations have been run (docs/SUPABASE_SETUP.md).",
    );
  }
  return { user, profile: profile.data, preferences: preferences.data };
});
