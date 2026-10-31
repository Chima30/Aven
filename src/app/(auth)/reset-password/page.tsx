import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
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
