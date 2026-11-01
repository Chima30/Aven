import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { logSecurityEvent } from "@/lib/audit/log";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_OPTIONS, createRecoveryToken } from "@/lib/auth/recovery";
import { serverEnv } from "@/lib/env.server";
import { safeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

/**
 * Landing point for links in Supabase emails (confirm sign-up, reset password).
 *
 * Supports both formats:
 *   ?token_hash=…&type=…  (recommended email templates — see docs/SUPABASE_SETUP.md)
 *   ?code=…               (Supabase default templates, PKCE flow)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));
  const supabase = await createClient();

  let ok = false;
  let type: EmailOtpType | null = null;

  if (tokenHash && rawType && (OTP_TYPES as readonly string[]).includes(rawType)) {
    type = rawType as EmailOtpType;
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/auth-error?reason=link", request.url), { status: 303 });
  }

  const isRecovery = type === "recovery" || next === "/reset-password";
  if (!isRecovery) {
    await logSecurityEvent(supabase, "auth.email_confirmed");
    return NextResponse.redirect(new URL(next, request.url), { status: 303 });
  }

  // Prove this browser came from a reset email, so /reset-password may skip the current password.
  const { data } = await supabase.auth.getUser();
  const response = NextResponse.redirect(new URL("/reset-password", request.url), { status: 303 });
  if (data.user) {
    response.cookies.set(
      RECOVERY_COOKIE,
      createRecoveryToken(data.user.id, serverEnv().SUPABASE_SECRET_KEY),
      RECOVERY_COOKIE_OPTIONS,
    );
  }
  return response;
}
