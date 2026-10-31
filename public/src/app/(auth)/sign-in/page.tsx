import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/feedback";
import { safeRedirectPath } from "@/lib/security/redirects";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const signedOut = params.signed_out;
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your AVEN account."
      footer={
        <>
          New to AVEN?{" "}
          <Link href="/sign-up" className="text-accent font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {signedOut === "everywhere" ? (
        <Alert tone="success" className="mb-5">
          You&apos;ve been signed out on every device.
        </Alert>
      ) : signedOut ? (
        <Alert tone="success" className="mb-5">
          You&apos;ve been signed out.
        </Alert>
      ) : null}
      {params.error === "config" ? (
        <Alert tone="danger" className="mb-5" title="AVEN isn't configured yet">
          The Supabase environment variables are missing on this deployment. See docs/DEPLOYMENT.md.
        </Alert>
      ) : null}
      <SignInForm next={next} />
    </AuthCard>
  );
}
