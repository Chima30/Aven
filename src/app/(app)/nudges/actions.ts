"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};
const markSchema = z.object({ id: z.uuid(), op: z.enum(["read", "unread", "dismiss", "restore"]) });

/**
 * Read state and dismissal only. RLS limits updates to the user's own rows and
 * column grants limit them to read_at / dismissed_at — content can't be edited.
 */
export async function markNotificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = markSchema.safeParse({ id: formData.get("id"), op: formData.get("op") });
  if (!parsed.success) return { status: "error", message: "That notification couldn't be found." };
  const supabase = await createClient();
  if (!(await consumeRateLimit(supabase, "notification_update"))) {
    return { status: "error", message: "Please wait a moment and try again." };
  }
  const now = new Date().toISOString();
  const patch =
    parsed.data.op === "read"
      ? { read_at: now }
      : parsed.data.op === "unread"
        ? { read_at: null }
        : parsed.data.op === "dismiss"
          ? { dismissed_at: now, read_at: now }
          : { dismissed_at: null };
  const { data, error } = await supabase
    .from("notifications")
    .update(patch)
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length)
    return { status: "error", message: "That notification couldn't be updated." };
  revalidatePath("/nudges", "layout");
  return {
    status: "success",
    message:
      parsed.data.op === "dismiss"
        ? "Dismissed."
        : parsed.data.op === "restore"
          ? "Restored to your inbox."
          : "Updated.",
  };
}

export async function markAllReadAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const supabase = await createClient();
  if (!(await consumeRateLimit(supabase, "notification_update"))) {
    return { status: "error", message: "Please wait a moment and try again." };
  }
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "delivered")
    .is("read_at", null);
  if (error) return { status: "error", message: "Couldn't mark everything as read." };
  revalidatePath("/nudges", "layout");
  return { status: "success", message: "All caught up." };
}

/**
 * Records that the user has opened the Nudge Center, which clears the unread
 * count in the sidebar. Individual notifications keep their own read state.
 */
export async function markNudgesSeenAction(): Promise<void> {
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return;
  await supabase
    .from("notification_preferences")
    .update({ nudges_seen_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/**
 * Unread notifications delivered since the user last opened the Nudge Center.
 * Read on the server (same origin) and limited to the user's own rows by RLS.
 */
export async function getNudgeBadgeAction(): Promise<number> {
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return 0;
  const user = { id: userId };
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("nudges_seen_at")
    .eq("user_id", user.id)
    .maybeSingle();
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "delivered")
    .is("dismissed_at", null)
    .is("read_at", null);
  if (prefs?.nudges_seen_at) {
    // Normalised to "…Z" so no "+00:00" offset has to survive the query string.
    query = query.gt("delivered_at", new Date(prefs.nudges_seen_at).toISOString());
  }
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/**
 * The signed-in user's id from the session token. getClaims() verifies the
 * token's signature locally when the project uses asymmetric JWT keys, so the
 * badge (polled from every open tab) doesn't cost a round trip to Supabase
 * Auth each time. RLS still checks every query.
 */
async function signedInUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return !error && typeof sub === "string" ? sub : null;
}
