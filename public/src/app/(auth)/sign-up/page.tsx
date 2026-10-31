import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start with a secure foundation. You'll confirm your email before signing in."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
