import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { NavIcon } from "@/components/shell/nav-icon";
import { MoneyAmount } from "@/components/finance/money-amount";
import { balancesByCurrency, loadFinanceBasics } from "@/lib/finance/queries";
import { auditLabel } from "@/lib/audit/labels";
import { getAppContext } from "@/lib/auth/session";
import { getCurrency } from "@/lib/money/currencies";
import { formatDateTime } from "@/lib/regional/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

function greeting(timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const UPCOMING = [
  {
    icon: "money" as const,
    title: "Money",
    stage: 2,
    body: "Accounts, transactions, budgets and savings goals — with offline logging.",
  },
  {
    icon: "planning" as const,
    title: "Planning & Nudge Center",
    stage: 3,
    body: "Subscriptions, reminders, routines and your daily Pulse Check.",
  },
  {
    icon: "wellbeing" as const,
    title: "Wellbeing",
    stage: 5,
    body: "Sleep, water, meals, exercise and habits, private to you.",
  },
  {
    icon: "intelligence" as const,
    title: "Your agent",
    stage: 6,
    body: "Ask questions across AVEN, with memory you control.",
  },
];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, profile, preferences } = await getAppContext();
  const supabase = await createClient();
  const [{ data: activity }, { count: consentDecisions }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, action, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("consent_records").select("id", { count: "exact", head: true }),
  ]);

  const finance = await loadFinanceBasics();
  const moneyTotals = balancesByCurrency(finance.accounts);
  const regional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
  };
  const currency = getCurrency(preferences.currency_code);
  const name = profile.display_name ?? user.email?.split("@")[0] ?? "there";

  const checklist = [
    { done: Boolean(profile.country_code), label: "Add your country", href: "/settings" },
    {
      done: preferences.time_zone !== "UTC",
      label: "Set your time zone and currency",
      href: "/settings/regional",
    },
    {
      done: (consentDecisions ?? 0) > 0,
      label: "Review your privacy choices",
      href: "/settings/privacy",
    },
  ];
  const remaining = checklist.filter((c) => !c.done).length;

  return (
    <div className="flex flex-col gap-8">
      {params.password_reset ? (
        <Alert tone="success" title="Password updated">
          You&apos;ve been signed out of every other device.
        </Alert>
      ) : null}

      <PageHeader
        eyebrow="Overview"
        title={`${greeting(preferences.time_zone)}, ${name}.`}
        description="This is your home in AVEN. As each module launches, its summary will appear here — built only from information you add."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Set up your foundation"
            description="Every module uses these settings, so it's worth getting them right first."
            action={
              remaining === 0 ? (
                <Badge tone="success">Done</Badge>
              ) : (
                <Badge tone="info">{remaining} to go</Badge>
              )
            }
          />
          <CardBody>
            <ul className="flex flex-col gap-2">
              {checklist.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="border-line hover:bg-surface-muted flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        item.done
                          ? "bg-success flex size-5 items-center justify-center rounded-full text-[0.65rem] text-white"
                          : "border-line-strong size-5 rounded-full border-2"
                      }
                    >
                      {item.done ? "✓" : null}
                    </span>
                    <span
                      className={
                        item.done
                          ? "text-ink-muted decoration-line-strong line-through"
                          : "text-ink font-medium"
                      }
                    >
                      {item.label}
                    </span>
                    <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
                    <span aria-hidden="true" className="text-ink-subtle ml-auto">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your regional settings" />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-ink-muted">Currency</dt>
              <dd className="text-ink font-medium">
                {currency.code} · {currency.name}
              </dd>
              <dt className="text-ink-muted">Time zone</dt>
              <dd className="text-ink font-medium">{preferences.time_zone}</dd>
              <dt className="text-ink-muted">Formats</dt>
              <dd className="text-ink font-medium">{preferences.locale}</dd>
              <dt className="text-ink-muted">AI features</dt>
              <dd className="text-ink font-medium">{preferences.ai_enabled ? "On" : "Off"}</dd>
            </dl>
            <ButtonLink href="/settings/regional" variant="secondary" size="sm" className="mt-5">
              Change
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Money"
          description="Confirmed balances from the accounts you track, grouped by currency."
          action={
            <Link href="/money" className="text-accent text-sm font-medium hover:underline">
              Open Money
            </Link>
          }
        />
        <CardBody>
          {moneyTotals.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              description="Add your cash, bank accounts, cards or wallets to start tracking income and spending."
              action={
                <ButtonLink href="/money/accounts?new=1" size="sm">
                  Add an account
                </ButtonLink>
              }
            />
          ) : (
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              {moneyTotals.map((t) => (
                <div key={t.currency}>
                  <p className="text-ink-muted text-xs">
                    {t.currency} · {t.count} account{t.count === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-2xl">
                    <MoneyAmount
                      minor={t.totalMinor}
                      currency={t.currency}
                      locale={preferences.locale}
                    />
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="coming-heading">
        <h2 id="coming-heading" className="type-section">
          Coming to your overview
        </h2>
        <p className="text-ink-muted mt-1 text-sm">
          These modules aren&apos;t available yet. Nothing here is a placeholder balance or sample
          data.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {UPCOMING.map((m) => (
            <div
              key={m.title}
              className="border-line-strong flex gap-4 rounded-2xl border border-dashed p-5"
            >
              <span className="bg-surface-muted text-ink-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                <NavIcon name={m.icon} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-ink text-sm font-semibold">{m.title}</h3>
                  <Badge>Stage {m.stage}</Badge>
                </div>
                <p className="text-ink-muted mt-1 text-sm">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader
          title="Recent account activity"
          action={
            <Link
              href="/settings/security"
              className="text-accent text-sm font-medium hover:underline"
            >
              View all
            </Link>
          }
        />
        <CardBody>
          {activity && activity.length > 0 ? (
            <ul className="divide-line divide-y">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
                >
                  <span className="text-ink">{auditLabel(entry.action, entry.metadata)}</span>
                  <time dateTime={entry.created_at} className="text-ink-muted shrink-0">
                    {formatDateTime(new Date(entry.created_at), regional)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No activity yet"
              description="Sign-ins and privacy changes will be listed here."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
