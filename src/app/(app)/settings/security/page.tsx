import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { auditLabel } from "@/lib/audit/labels";
import { getAppContext } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/regional/format";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("audit_log")
    .select("id, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  const regional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
  };

  return (
    <>
      {params.error === "rate_limited" ? (
        <Alert tone="danger">Too many attempts. Please wait an hour and try again.</Alert>
      ) : null}
      {params.error === "sign_out_failed" ? (
        <Alert tone="danger" title="Not every device could be signed out">
          Supabase didn&apos;t confirm the request, so your other sessions may still be active.
          Please try again.
        </Alert>
      ) : null}

      <ChangePasswordForm />

      <Card>
        <CardHeader
          title="Sessions"
          description={`Signed in as ${user.email ?? "your account"}. Last sign-in ${
            user.last_sign_in_at
              ? formatDateTime(new Date(user.last_sign_in_at), regional)
              : "unknown"
          }.`}
        />
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-muted max-w-md text-sm">
            Lost a device, or signed in somewhere you don&apos;t trust? Signing out everywhere ends
            every session, including this one.
          </p>
          <div className="flex flex-wrap gap-3">
            <SignOutButton variant="secondary">Sign out here</SignOutButton>
            <SignOutButton scope="global" variant="danger">
              Sign out everywhere
            </SignOutButton>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Security activity"
          description="The last 30 security and privacy events on your account."
        />
        <CardBody>
          {events && events.length > 0 ? (
            <ul className="divide-line divide-y text-sm">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-ink">{auditLabel(e.action, e.metadata)}</span>
                  <time dateTime={e.created_at} className="text-ink-muted">
                    {formatDateTime(new Date(e.created_at), regional)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No activity yet"
              description="Security events will be listed here."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
