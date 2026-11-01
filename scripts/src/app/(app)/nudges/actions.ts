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
