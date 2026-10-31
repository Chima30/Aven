import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Link problem" };

export default function AuthErrorPage() {
  return (
    <AuthCard
      title="That link didn't work"
      description="It may have expired, already been used, or been opened in a different browser from the one you signed up in."
    >
      <div className="flex flex-col gap-3">
        <ButtonLink href="/sign-in" size="lg">
          Sign in
        </ButtonLink>
        <ButtonLink href="/forgot-password" variant="secondary" size="lg">
          Reset password
        </ButtonLink>
      </div>
    </AuthCard>
  );
}
