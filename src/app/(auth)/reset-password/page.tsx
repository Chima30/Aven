import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ButtonLink } from "@/components/ui/button";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE, verifyRecoveryToken } from "@/lib/auth/recovery";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  const token = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const fromResetEmail = user
    ? verifyRecoveryToken(token, user.id, serverEnv().SUPABASE_SECRET_KEY)
    : false;
  if (user && !fromResetEmail) {
    // Signed in, but not via a reset email: changing the password requires the current one.
    return (
      <AuthCard
        title="Change your password in Settings"
        description="For your security, this page only works from a password-reset email. While signed in, change your password in Settings → Security, which asks for your current password."
      >
        <ButtonLink href="/settings/security" size="lg" className="w-full">
          Go to Security settings
        </ButtonLink>
      </AuthCard>
    );
  }
  if (!user) {
    return (
      <AuthCard
        title="This link has expired"
        description="Password reset links work once and expire after an hour. Request a new one to continue."
      >
        <ButtonLink href="/forgot-password" size="lg" className="w-full">
          Request a new link
        </ButtonLink>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Choose a new password"
      description="After saving, you'll be signed out of every other device."
      footer={
        <Link href="/overview" className="text-accent font-medium hover:underline">
          Cancel
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
