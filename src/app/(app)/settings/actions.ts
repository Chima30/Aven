"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logSecurityEvent } from "@/lib/audit/log";
import { verifyPasswordForUser } from "@/lib/auth/reauth";
import { getCurrentUser } from "@/lib/auth/session";
import { formValue, type FormState } from "@/lib/forms";
import { NOTIFICATION_CATEGORIES } from "@/lib/nudges/types";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationCategory, NotificationFrequency } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_COOKIE_OPTIONS } from "@/lib/theme";
import {
  appearanceSchema,
  changePasswordSchema,
  consentSchema,
  deleteAccountSchema,
  fieldErrors,
  notificationSchema,
  profileSchema,
  regionalSchema,
} from "@/lib/validation/schemas";

/*
 * Settings Server Actions. Each one:
 *   1. verifies the session with Supabase Auth,
 *   2. validates input with Zod,
 *   3. writes through the USER'S session (RLS applies; the user id is never taken from the form).
 */

const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};
const SAVE_FAILED: FormState = {
  status: "error",
  message: "We couldn't save that. Please try again.",
};

async function session() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = profileSchema.safeParse({
    displayName: formValue(formData, "displayName"),
    countryCode: formValue(formData, "countryCode"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, country_code: parsed.data.countryCode })
    .eq("id", ctx.user.id);
  if (error) return SAVE_FAILED;
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

export async function updateRegionalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = regionalSchema.safeParse({
    currencyCode: formValue(formData, "currencyCode"),
    locale: formValue(formData, "locale"),
    timeZone: formValue(formData, "timeZone"),
    weekStart: formValue(formData, "weekStart"),
    dateFormat: formValue(formData, "dateFormat"),
    numberFormat: formValue(formData, "numberFormat"),
    measurementSystem: formValue(formData, "measurementSystem"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("user_preferences")
    .update({
      currency_code: d.currencyCode,
      locale: d.locale,
      time_zone: d.timeZone,
      week_start: d.weekStart,
      date_format: d.dateFormat,
      number_format: d.numberFormat,
      measurement_system: d.measurementSystem,
    })
    .eq("user_id", ctx.user.id);
  if (error) return SAVE_FAILED;
  revalidatePath("/", "layout");
  return { status: "success", message: "Regional settings saved." };
}

export async function updateAppearanceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = appearanceSchema.safeParse({ theme: formValue(formData, "theme") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase
    .from("user_preferences")
    .update({ theme: parsed.data.theme })
    .eq("user_id", ctx.user.id);
  if (error) return SAVE_FAILED;
  (await cookies()).set(THEME_COOKIE, parsed.data.theme, THEME_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return { status: "success", message: "Appearance saved." };
}

export async function updatePrivacyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const aiEnabled = formData.get("aiEnabled") === "on";
  const memoryPaused = formData.get("memoryPaused") === "on";
  const { error } = await ctx.supabase
    .from("user_preferences")
    .update({ ai_enabled: aiEnabled, memory_paused: memoryPaused })
    .eq("user_id", ctx.user.id);
  if (error) return SAVE_FAILED;
  revalidatePath("/", "layout");
  return { status: "success", message: "Privacy settings saved." };
}

export async function setConsentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = consentSchema.safeParse({
    category: formValue(formData, "category"),
    granted: formValue(formData, "granted"),
  });
  if (!parsed.success) return { status: "error", message: "That permission isn't recognised." };

  const { error } = await ctx.supabase.rpc("set_consent", {
    p_category: parsed.data.category,
    p_granted: parsed.data.granted,
    p_source: "settings",
  });
  if (error) {
    if (error.code === "55000") {
      return { status: "error", message: "This permission can't be switched on yet." };
    }
    return SAVE_FAILED;
  }
  revalidatePath("/settings/privacy");
  return {
    status: "success",
    message: parsed.data.granted ? "Permission granted." : "Permission withdrawn.",
  };
}

export async function updateNotificationsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;

  const categories: Record<string, string> = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    categories[category] = formValue(formData, `category_${category}`);
  }
  const parsed = notificationSchema.safeParse({
    inAppEnabled: formData.get("inAppEnabled"),
    dailyDigestEnabled: formData.get("dailyDigestEnabled"),
    dailyDigestTime: formValue(formData, "dailyDigestTime"),
    weeklyDigestEnabled: formData.get("weeklyDigestEnabled"),
    weeklyDigestDay: formValue(formData, "weeklyDigestDay"),
    quietHoursEnabled: formData.get("quietHoursEnabled"),
    quietHoursStart: formValue(formData, "quietHoursStart"),
    quietHoursEnd: formValue(formData, "quietHoursEnd"),
    pauseNonessential: formData.get("pauseNonessential"),
    maxNudgesPerDay: formValue(formData, "maxNudgesPerDay"),
    categories,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("notification_preferences")
    .update({
      in_app_enabled: d.inAppEnabled,
      daily_digest_enabled: d.dailyDigestEnabled,
      daily_digest_time: d.dailyDigestTime,
      weekly_digest_enabled: d.weeklyDigestEnabled,
      weekly_digest_day: d.weeklyDigestDay,
      quiet_hours_enabled: d.quietHoursEnabled,
      quiet_hours_start: d.quietHoursStart,
      quiet_hours_end: d.quietHoursEnd,
      pause_nonessential: d.pauseNonessential,
      max_nudges_per_day: d.maxNudgesPerDay,
    })
    .eq("user_id", ctx.user.id);
  if (error) return SAVE_FAILED;

  for (const [category, frequency] of Object.entries(d.categories)) {
    const { error: catError } = await ctx.supabase
      .from("notification_category_preferences")
      .update({ frequency: frequency as NotificationFrequency })
      .eq("user_id", ctx.user.id)
      .eq("category", category as NotificationCategory);
    if (catError) return SAVE_FAILED;
  }
  revalidatePath("/settings/notifications");
  return { status: "success", message: "Notification preferences saved." };
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formValue(formData, "currentPassword"),
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  if (!(await consumeRateLimit(ctx.supabase, "change_password"))) {
    return { status: "error", message: "Too many attempts. Please wait an hour and try again." };
  }
  if (!ctx.user.email) return { status: "error", message: "Your account has no email address." };

  const verified = await verifyPasswordForUser(
    ctx.user.id,
    ctx.user.email,
    parsed.data.currentPassword,
  );
  if (!verified) {
    return {
      status: "error",
      fieldErrors: { currentPassword: "That isn't your current password." },
    };
  }

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." } };
    }
    if (error.code === "reauthentication_needed") {
      return {
        status: "error",
        message:
          "Supabase requires an extra email confirmation for password changes on this project. Use “Forgot password” from the sign-in page instead.",
      };
    }
    return SAVE_FAILED;
  }
  await logSecurityEvent(ctx.supabase, "auth.password_changed");
  await ctx.supabase.auth.signOut({ scope: "others" });
  return { status: "success", message: "Password changed. Other devices have been signed out." };
}

/**
 * Permanent account deletion.
 *
 * Steps:
 *   1. Verify the session, the typed confirmation and the rate limit.
 *   2. Re-authenticate: check the password server-side and confirm it belongs to THIS user.
 *   3. Write an anonymised entry to account_deletion_log (hash only, no personal data).
 *   4. Delete the Supabase Auth user → every public.* row cascades away.
 *   5. Record the outcome, clear cookies and send the user to the home page.
 */
export async function deleteAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = deleteAccountSchema.safeParse({
    password: formValue(formData, "password"),
    confirmation: formValue(formData, "confirmation"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  if (!(await consumeRateLimit(ctx.supabase, "delete_account"))) {
    return { status: "error", message: "Too many attempts. Please wait an hour and try again." };
  }
  if (!ctx.user.email) return { status: "error", message: "Your account has no email address." };

  const verified = await verifyPasswordForUser(ctx.user.id, ctx.user.email, parsed.data.password);
  if (!verified) {
    return { status: "error", fieldErrors: { password: "That password is incorrect." } };
  }

  const admin = createAdminClient();
  const subjectHash = createHash("sha256").update(ctx.user.id).digest("hex");
  const { data: logRow, error: logError } = await admin
    .from("account_deletion_log")
    .insert({
      subject_hash: subjectHash,
      external_cleanup: { walrus: "not_applicable", ai_provider: "not_applicable" },
    })
    .select("id")
    .single();
  if (logError || !logRow) {
    console.error("[delete-account] could not write deletion log");
    return {
      status: "error",
      message: "We couldn't start the deletion. Nothing has been deleted. Please try again.",
    };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (deleteError) {
    await admin.from("account_deletion_log").update({ outcome: "failed" }).eq("id", logRow.id);
    console.error("[delete-account] auth deletion failed");
    return {
      status: "error",
      message: "We couldn't delete your account. Nothing has been deleted. Please try again.",
    };
  }

  await admin
    .from("account_deletion_log")
    .update({ outcome: "completed", completed_at: new Date().toISOString() })
    .eq("id", logRow.id);

  // The user no longer exists; clear this browser's auth and theme cookies.
  await ctx.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name === THEME_COOKIE) jar.delete(cookie.name);
  }
  redirect("/?account_deleted=1");
}
