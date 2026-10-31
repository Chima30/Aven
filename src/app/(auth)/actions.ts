"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logSecurityEvent } from "@/lib/audit/log";
import { publicEnv } from "@/lib/env";
import { formValue, type FormState } from "@/lib/forms";
import { safeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_COOKIE_OPTIONS } from "@/lib/theme";
import {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/schemas";

/*
 * Authentication Server Actions.
 * Server Actions are POST-only and Next.js rejects calls whose Origin header
 * does not match the host, which protects these forms against CSRF.
 * Supabase Auth applies its own rate limits to sign-up, sign-in and email sending.
 */

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formValue(formData, "displayName"),
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  });
  const values = {
    displayName: formValue(formData, "displayName"),
    email: formValue(formData, "email"),
  };
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/overview`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." }, values };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        status: "error",
        message: "Too many attempts. Please wait a few minutes and try again.",
        values,
      };
    }
    // Other errors (including "already registered") fall through to the same
    // response as success, so the form cannot be used to discover who has an account.
    if (error.code !== "user_already_exists") {
      console.error(`[auth] sign-up failed: ${error.code ?? error.status ?? "unknown"}`);
      return {
        status: "error",
        message: "We couldn't create your account. Please try again.",
        values,
      };
    }
  }

  redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });
  const values = { email: formValue(formData, "email") };
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email address first. We can send the link again.",
        values: { ...values, unconfirmed: "1" },
      };
    }
    if (error?.status === 429) {
      return { status: "error", message: "Too many attempts. Please wait a few minutes.", values };
    }
    return { status: "error", message: "That email and password don't match an account.", values };
  }

  await logSecurityEvent(supabase, "auth.signed_in");

  // Carry the saved theme into a cookie so pages render in the right theme immediately.
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("theme")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (prefs?.theme) (await cookies()).set(THEME_COOKIE, prefs.theme, THEME_COOKIE_OPTIONS);

  redirect(safeRedirectPath(formValue(formData, "next")));
}

export async function resendConfirmationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formValue(formData, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/overview` },
  });
  if (error?.status === 429) {
    return { status: "error", message: "Please wait a minute before requesting another email." };
  }
  // Same message whether or not the address exists.
  return {
    status: "success",
    message: "If that address has an unconfirmed account, a new confirmation link is on its way.",
  };
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formValue(formData, "email") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
      values: { email: formValue(formData, "email") },
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  if (error?.status === 429) {
    return { status: "error", message: "Please wait a minute before requesting another email." };
  }
  if (error)
    console.error(`[auth] reset request failed: ${error.code ?? error.status ?? "unknown"}`);
  // Never reveal whether an account exists.
  return {
    status: "success",
    message:
      "If an account exists for that email, a password reset link is on its way. It expires in one hour.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      status: "error",
      message: "Your reset link has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return {
        status: "error",
        fieldErrors: { password: "Choose a password you haven't used here before." },
      };
    }
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." } };
    }
    return {
      status: "error",
      message: "We couldn't update your password. Please request a new link.",
    };
  }

  await logSecurityEvent(supabase, "auth.password_reset_completed");
  // Someone else may have had the old password: end every other session.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/overview?password_reset=1");
}
