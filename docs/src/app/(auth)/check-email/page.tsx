import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email } = await searchParams;
  const address = typeof email === "string" && email.length <= 254 ? email : null;
  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          If {address ? <strong className="text-ink">{address}</strong> : "that address"} can be
          used for a new account, we&apos;ve sent a confirmation link to it. Open it on this device
          to finish setting up AVEN.
        </>
      }
      footer={
        <Link href="/sign-in" className="text-accent font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ul className="text-ink-muted list-disc space-y-2 pl-5 text-sm">
        <li>
          The link expires after a while — if it does, sign in and we&apos;ll offer to resend it.
        </li>
        <li>Can&apos;t find it? Check your spam or promotions folder.</li>
        <li>Already have an account with this email? Sign in instead.</li>
      </ul>
    </AuthCard>
  );
}
