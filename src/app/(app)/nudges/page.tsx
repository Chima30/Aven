import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { markAllReadAction } from "./actions";
import { NotificationItem } from "@/components/nudges/notification-item";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { CATEGORY_LABEL } from "@/lib/nudges/labels";
import { runNudgeScheduler } from "@/lib/nudges/runner";
import { NOTIFICATION_CATEGORIES } from "@/lib/nudges/types";
import { loadPlanningBasics, timeIn, dayLabel } from "@/lib/planning/queries";
import type { NotificationCategory } from "@/lib/supabase/database.types";
import { localDate } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Nudge Center" };

export default async function NudgeInbox({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; unread?: string }>;
}) {
  const { user, supabase, timeZone, locale, today } = await loadPlanningBasics();
  const params = await searchParams;
  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(params.category ?? "")
    ? (params.category as NotificationCategory)
    : null;
  const unreadOnly = params.unread === "1";

  // Catch up for this user straight after the response (the 15-minute background schedule covers everyone).
  after(() =>
    runNudgeScheduler({ source: "catch_up", userIds: [user.id], deadlineMs: 15_000 })
      .then(() => undefined)
      .catch(() => undefined),
  );

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("status", "delivered")
    .is("dismissed_at", null)
    .order("delivered_at", { ascending: false })
    .limit(100);
  if (category) query = query.eq("category", category);
  if (unreadOnly) query = query.is("read_at", null);
  const [
    { data: items },
    { data: summaries },
    { count: waiting },
    { data: status },
    { data: prefs },
  ] = await Promise.all([
    query,
    supabase
      .from("notifications")
      .select("*")
      .eq("kind", "daily_summary")
      .eq("status", "delivered")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled"),
    supabase.rpc("scheduler_status"),
    supabase
      .from("notification_preferences")
      .select("pause_nonessential, quiet_hours_enabled, in_app_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const list = (items ?? []).filter(
    (n) => n.kind !== "daily_summary" || n.id !== summaries?.[0]?.id,
  );
  const summary =
    summaries?.[0] && localDate(new Date(summaries[0].created_at), timeZone) === today
      ? summaries[0]
      : null;
  const unreadCount = list.filter((n) => !n.read_at).length;
  const lastRun = status?.[0];
  const when = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const date = localDate(d, timeZone);
    return `${date === today ? "Today" : dayLabel(date, locale)}, ${timeIn(d, timeZone, locale)}`;
  };
  const filterHref = (c: string | null, u = unreadOnly) => {
    const sp = new URLSearchParams();
    if (c) sp.set("category", c);
    if (u) sp.set("unread", "1");
    const s = sp.toString();
    return s ? `/nudges?${s}` : "/nudges";
  };

  return (
    <>
      <PageHeader
        title="Nudge Center"
        action={
          unreadCount > 0 ? (
            <InlineAction
              action={markAllReadAction}
              fields={{}}
              label="Mark all read"
              variant="secondary"
            />
          ) : null
        }
      />
      {prefs?.pause_nonessential ? (
        <Alert tone="warning" title="Nudges are paused">
          Only account security alerts are shown.{" "}
          <Link href="/settings/notifications" className="underline">
            Resume in preferences
          </Link>
          .
        </Alert>
      ) : null}

      {summary ? (
        <Card data-testid="daily-summary">
          <CardHeader title={summary.title} />
          <CardBody>
            <p className="text-ink-muted text-sm whitespace-pre-line">{summary.body}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Filter">
        <FilterChip href={filterHref(null)} active={!category}>
          All
        </FilterChip>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <FilterChip key={c} href={filterHref(c)} active={category === c}>
            {CATEGORY_LABEL[c]}
          </FilterChip>
        ))}
        <span className="text-line-strong">|</span>
        <FilterChip href={filterHref(category, !unreadOnly)} active={unreadOnly}>
          Unread only
        </FilterChip>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={category || unreadOnly ? "Nothing matches this filter" : "You're all caught up"}
          description="Nudges come from your tasks, events, habits, budgets and goals. Held-back ones are in History"
        />
      ) : (
        <ul className="divide-line divide-y" aria-label="Notifications">
          {list.map((n) => (
            <NotificationItem key={n.id} n={n} when={when(n.delivered_at ?? n.created_at)} />
          ))}
        </ul>
      )}

      <p className="text-ink-subtle text-xs" data-testid="scheduler-status">
        {lastRun
          ? `Last checked ${when(lastRun.last_run_at)}${lastRun.last_run_ok ? "" : " (will retry)"}`
          : "Checked each time you open AVEN"}
        {waiting ? ` · ${waiting} waiting for quiet hours to end` : ""}
      </p>
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-accent bg-accent/10 text-ink"
          : "border-line text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
