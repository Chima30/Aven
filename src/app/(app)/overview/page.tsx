import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { CashflowArea } from "@/components/overview/cashflow-area";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { StatTile } from "@/components/ui/stat-tile";
import { NavIcon } from "@/components/shell/nav-icon";
import { getAppContext } from "@/lib/auth/session";
import { formatMinor } from "@/lib/finance/format";
import { monthStart } from "@/lib/finance/periods";
import { balancesByCurrency, loadFinanceBasics } from "@/lib/finance/queries";
import { getCurrency, isCurrencyCode } from "@/lib/money/currencies";
import { CATEGORY_LABEL } from "@/lib/nudges/labels";
import { runNudgeScheduler } from "@/lib/nudges/runner";
import { isScheduled } from "@/lib/planning/habits";
import { loadHabits, loadOccurrences, loadTasks, timeIn } from "@/lib/planning/queries";
import { occursOnDay } from "@/lib/planning/recurrence";
import { addDays, localDate } from "@/lib/time/zoned";
import { formatWater } from "@/lib/wellbeing/units";
import { loadWellbeingBasics } from "@/lib/wellbeing/queries";

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

/** Minor units → a plain number for chart geometry only (labels use exact formatting). */
function toNumber(minor: string, currency: string): number {
  const units = isCurrencyCode(currency) ? getCurrency(currency).minorUnits : 2;
  return Number(minor) / 10 ** units;
}

function pctChange(now: bigint, before: bigint): number | null {
  if (before <= 0n) return null;
  return Math.round(Number(((now - before) * 1000n) / before) / 10);
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, profile, preferences } = await getAppContext();
  const finance = await loadFinanceBasics();
  const { supabase, regional } = finance;
  const tz = preferences.time_zone;
  const today = regional.today;
  const locale = preferences.locale;

  after(() =>
    runNudgeScheduler({ source: "catch_up", userIds: [user.id], deadlineMs: 15_000 })
      .then(() => undefined)
      .catch(() => undefined),
  );

  const thisMonth = monthStart(today);
  const lastMonth = monthStart(addDays(thisMonth, -1));
  const [
    summaryNow,
    summaryBefore,
    cashflow,
    { tasks },
    { occurrences },
    { habits, checkIns },
    nudges,
    { count: unread },
    consents,
    wellbeing,
  ] = await Promise.all([
    supabase.rpc("finance_summary", { p_from: thisMonth, p_to: today }),
    supabase.rpc("finance_summary", { p_from: lastMonth, p_to: addDays(thisMonth, -1) }),
    supabase.rpc("monthly_cashflow", { p_months: 6, p_today: today }),
    loadTasks(),
    loadOccurrences(today, addDays(today, 1)),
    loadHabits(14),
    supabase
      .from("notifications")
      .select("id, title, category, priority, action_url, delivered_at, read_at")
      .eq("status", "delivered")
      .is("dismissed_at", null)
      .order("delivered_at", { ascending: false })
      .limit(4),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .is("dismissed_at", null)
      .is("read_at", null),
    supabase.from("consent_records").select("id", { count: "exact", head: true }),
    loadWellbeingBasics(),
  ]);

  // ---- Money (never mixes currencies)
  const totals = balancesByCurrency(finance.accounts);
  const main = totals.find((t) => t.currency === preferences.currency_code) ?? totals[0] ?? null;
  const mainCurrency = main?.currency ?? preferences.currency_code;
  const pick = (rows: typeof summaryNow.data) =>
    (rows ?? []).find((r) => r.currency_code === mainCurrency);
  const spentNow = BigInt(pick(summaryNow.data)?.expense_minor ?? "0");
  const spentBefore = BigInt(pick(summaryBefore.data)?.expense_minor ?? "0");
  const incomeNow = BigInt(pick(summaryNow.data)?.income_minor ?? "0");
  const spentChange = pctChange(spentNow, spentBefore);
  const flow = (cashflow.data ?? []).filter((r) => r.currency_code === mainCurrency);
  const hasFlow = flow.some((r) => r.income_minor !== "0" || r.expense_minor !== "0");
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const points = flow.map((r) => ({
    label: monthLabel(r.month),
    income: toNumber(r.income_minor, mainCurrency),
    expense: toNumber(r.expense_minor, mainCurrency),
    incomeText: formatMinor(r.income_minor, mainCurrency, locale),
    expenseText: formatMinor(r.expense_minor, mainCurrency, locale),
  }));

  // ---- Planning (real records only)
  const open = tasks.filter((t) => t.status === "not_started" || t.status === "in_progress");
  const dueToday = open.filter((t) => t.due_on === today);
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const events = occurrences.filter((o) => occursOnDay(o, today, tz));
  const activeHabits = habits.filter((h) => !h.archived_at);
  const habitsToday = activeHabits.filter((h) =>
    isScheduled(h, localDate(new Date(), h.time_zone)),
  );
  const habitsDone = habitsToday.filter((h) =>
    checkIns.some(
      (c) =>
        c.habit_id === h.id &&
        c.on_date === localDate(new Date(), h.time_zone) &&
        c.status === "done",
    ),
  ).length;

  // ---- Wellbeing (only with consent)
  let water: number | null = null;
  if (wellbeing.consented) {
    const { data } = await supabase.from("water_logs").select("amount_ml").eq("local_date", today);
    water = (data ?? []).reduce((s, r) => s + r.amount_ml, 0);
  }

  const name = profile.display_name ?? user.email?.split("@")[0] ?? "there";
  const checklist = [
    { done: Boolean(profile.country_code), label: "Add your country", href: "/settings" },
    { done: tz !== "UTC", label: "Set your time zone and currency", href: "/settings/regional" },
    {
      done: (consents.count ?? 0) > 0,
      label: "Review your privacy choices",
      href: "/settings/privacy",
    },
  ];
  const remaining = checklist.filter((c) => !c.done);
  const dateLine = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date());

  const agenda = [
    ...events.map((o) => ({
      key: o.key,
      title: o.title,
      meta: o.allDay ? "All day" : timeIn(o.start!, tz, locale),
      kind: "Event",
    })),
    ...overdue.map((t) => ({ key: t.id, title: t.title, meta: "Overdue", kind: "Task" })),
    ...dueToday.map((t) => ({
      key: t.id,
      title: t.title,
      meta: t.due_time ? t.due_time.slice(0, 5) : "Today",
      kind: "Task",
    })),
  ].slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      {params.password_reset ? (
        <Alert tone="success" title="Password updated">
          You&apos;ve been signed out of every other device.
        </Alert>
      ) : null}

      <header className="flex flex-col gap-1">
        <p className="text-ink-subtle text-sm">{dateLine}</p>
        <h1 className="type-page text-ink">
          {greeting(tz)}, {name}
        </h1>
      </header>

      {remaining.length > 0 ? (
        <section
          aria-label="Finish setting up"
          className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4"
        >
          <p className="text-ink mr-auto text-sm font-medium">
            {remaining.length} quick step{remaining.length === 1 ? "" : "s"} left to set up AVEN
          </p>
          {remaining.map((c) => (
            <ButtonLink key={c.label} href={c.href} size="sm" variant="secondary">
              {c.label}
            </ButtonLink>
          ))}
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="At a glance">
        <StatTile
          label="Balance"
          href="/money"
          value={main ? formatMinor(main.totalMinor, main.currency, locale) : "—"}
          note={
            main
              ? `${main.count} account${main.count === 1 ? "" : "s"}${totals.length > 1 ? ` · +${totals.length - 1} other currenc${totals.length === 2 ? "y" : "ies"}` : ""}`
              : "Add an account to start"
          }
        />
        <StatTile
          label="Spent this month"
          href="/money/transactions"
          value={formatMinor(spentNow.toString(), mainCurrency, locale)}
          chip={
            spentChange === null
              ? undefined
              : {
                  text: `${spentChange > 0 ? "+" : ""}${spentChange}%`,
                  tone: spentChange > 0 ? "down" : spentChange < 0 ? "up" : "neutral",
                }
          }
          note={
            spentChange === null
              ? `Income ${formatMinor(incomeNow.toString(), mainCurrency, locale)}`
              : "vs all of last month"
          }
        />
        <StatTile
          label="Today's plan"
          href="/planning"
          value={`${dueToday.length + events.length}`}
          chip={overdue.length ? { text: `${overdue.length} overdue`, tone: "down" } : undefined}
          note={`${dueToday.length} task${dueToday.length === 1 ? "" : "s"} · ${events.length} event${events.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Habits today"
          href="/planning/habits"
          value={habitsToday.length ? `${habitsDone}/${habitsToday.length}` : "—"}
          chip={
            habitsToday.length && habitsDone === habitsToday.length
              ? { text: "All done", tone: "up" }
              : undefined
          }
          note={
            habitsToday.length
              ? `${habitsToday.length - habitsDone} left`
              : activeHabits.length
                ? "Rest day"
                : "No habits yet"
          }
        />
      </div>

      <Card>
        <CardHeader
          title="Cash flow"
          description={hasFlow ? `Income and spending, last 6 months · ${mainCurrency}` : undefined}
          action={
            <Link href="/money" className="text-ink-muted hover:text-ink text-sm transition-colors">
              Open Money →
            </Link>
          }
        />
        <CardBody>
          {hasFlow ? (
            <>
              <div className="text-ink-muted mb-4 flex gap-5 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-accent h-0.5 w-4 rounded" /> Income
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-ink-muted h-0.5 w-4 rounded" /> Spending
                </span>
              </div>
              <CashflowArea
                data={points}
                caption={`Monthly income and spending in ${mainCurrency}`}
              />
            </>
          ) : (
            <EmptyState
              title="Your trend starts with your first transaction"
              description="Record income or spending and this chart fills in month by month."
              action={
                <ButtonLink href="/money/transactions" size="sm">
                  Add a transaction
                </ButtonLink>
              }
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            title="Today"
            action={
              <Link
                href="/planning"
                className="text-ink-muted hover:text-ink text-sm transition-colors"
              >
                Planning →
              </Link>
            }
          />
          <CardBody>
            {agenda.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Nothing scheduled. Add a task or event in{" "}
                <Link href="/planning" className="text-ink underline">
                  Planning
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {agenda.map((a) => (
                  <li
                    key={a.key}
                    className="hover:bg-surface-muted flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        a.meta === "Overdue"
                          ? "bg-danger size-2 rounded-full"
                          : a.kind === "Event"
                            ? "bg-info size-2 rounded-full"
                            : "bg-accent size-2 rounded-full"
                      }
                    />
                    <span className="text-ink min-w-0 flex-1 truncate text-sm">{a.title}</span>
                    <span
                      className={
                        a.meta === "Overdue"
                          ? "text-danger text-xs"
                          : "text-ink-subtle text-xs tabular-nums"
                      }
                    >
                      {a.meta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Nudges"
            description={unread ? `${unread} unread` : undefined}
            action={
              <Link
                href="/nudges"
                className="text-ink-muted hover:text-ink text-sm transition-colors"
              >
                Inbox →
              </Link>
            }
          />
          <CardBody>
            {(nudges.data ?? []).length === 0 ? (
              <p className="text-ink-muted text-sm">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(nudges.data ?? []).map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.action_url ?? "/nudges"}
                      className="hover:bg-surface-muted flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          n.read_at
                            ? "bg-line-strong mt-1.5 size-2 shrink-0 rounded-full"
                            : "bg-accent mt-1.5 size-2 shrink-0 rounded-full"
                        }
                      />
                      <span className="min-w-0">
                        <span className="text-ink block truncate text-sm">{n.title}</span>
                        <span className="text-ink-subtle text-xs">
                          {CATEGORY_LABEL[n.category]}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/wellbeing"
          icon="wellbeing"
          title="Wellbeing"
          text={
            water !== null
              ? `${formatWater(water, wellbeing.prefs.water_unit)} of water today`
              : "Sleep, water, meals, activity and mood"
          }
        />
        <QuickLink
          href="/nudges/pulse"
          icon="nudges"
          title="Pulse Check"
          text="A private 30-second check-in"
        />
        <QuickLink
          href="/intelligence"
          icon="intelligence"
          title="Intelligence"
          text="Explained suggestions from your own data"
        />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: "wellbeing" | "nudges" | "intelligence";
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      data-reveal
      className="border-line bg-surface lift group flex items-center gap-4 rounded-2xl border p-4"
    >
      <span className="bg-surface-muted text-ink-muted group-hover:text-accent flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors">
        <NavIcon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="text-ink block text-sm font-medium">{title}</span>
        <span className="text-ink-subtle block truncate text-xs">{text}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-ink-subtle ml-auto transition-transform group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}
