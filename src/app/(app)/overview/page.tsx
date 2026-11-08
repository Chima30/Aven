import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { AddTransaction } from "@/components/finance/add-transaction";
import { ProgressRing, SpendingDonut } from "@/components/finance/charts";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProgressBar } from "@/components/finance/progress-bar";
import { CashflowArea } from "@/components/overview/cashflow-area";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { StatTile } from "@/components/ui/stat-tile";
import { NavIcon } from "@/components/shell/nav-icon";
import { getAppContext } from "@/lib/auth/session";
import { formatMinor, percentOf } from "@/lib/finance/format";
import { monthStart } from "@/lib/finance/periods";
import { balancesByCurrency, loadFinanceBasics } from "@/lib/finance/queries";
import { getCurrency, isCurrencyCode } from "@/lib/money/currencies";
import { CATEGORY_LABEL } from "@/lib/nudges/labels";
import { runNudgeScheduler } from "@/lib/nudges/runner";
import { isScheduled } from "@/lib/planning/habits";
import { loadHabits, loadOccurrences, loadTasks, timeIn } from "@/lib/planning/queries";
import { occursOnDay } from "@/lib/planning/recurrence";
import { formatDate } from "@/lib/regional/format";
import { addDays, localDate } from "@/lib/time/zoned";
import { formatWater } from "@/lib/wellbeing/units";
import { loadWellbeingBasics } from "@/lib/wellbeing/queries";

export const metadata: Metadata = { title: "Overview" };

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
    byCategory,
    budgets,
    goals,
    goalProgress,
    recent,
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
    supabase.rpc("spending_by_category", { p_from: thisMonth, p_to: today }),
    supabase.rpc("budget_progress", { p_month: thisMonth }),
    supabase
      .from("savings_goals")
      .select("*")
      .in("status", ["active", "paused"])
      .order("created_at"),
    supabase.from("savings_goal_progress").select("*"),
    supabase.rpc("list_transactions", { p_limit: 5 }),
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
  const netNow = incomeNow - spentNow;
  const categoryRows = (byCategory.data ?? [])
    .filter((r) => r.currency_code === mainCurrency)
    .map((r) => ({ name: r.category_name, minor: r.expense_minor }));
  const budgetRows = budgets.data ?? [];
  const budgetsOver = budgetRows.filter(
    (b) => BigInt(b.spent_minor) > BigInt(b.limit_minor),
  ).length;
  const savedByGoal = new Map((goalProgress.data ?? []).map((p) => [p.goal_id, p.saved_minor]));
  const goalRows = goals.data ?? [];
  const recentRows = recent.data ?? [];
  const regionalFmt = {
    locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(
      new Date(),
    ),
  );
  const greeting =
    hour < 5
      ? "Good evening"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const firstName = (profile.display_name ?? "").trim().split(/\s+/)[0] ?? "";
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

  const activeAccounts = finance.accounts.filter((a) => !a.archived);
  const otherTotals = totals.filter((t) => t.currency !== mainCurrency);
  const sectionLink = (href: string, text: string) => (
    <Link
      href={href}
      className="text-ink-muted hover:text-ink inline-flex h-8 items-center rounded-lg text-sm transition-colors"
    >
      {text} <span aria-hidden="true">&nbsp;→</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {params.password_reset ? (
        <Alert tone="success" title="Password updated">
          You&apos;ve been signed out of every other device.
        </Alert>
      ) : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="type-eyebrow text-ink-subtle">{dateLine}</p>
          <h1 className="type-page text-ink mt-1.5">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        {activeAccounts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/planning" variant="secondary">
              Plan today
            </ButtonLink>
            <AddTransaction
              userId={user.id}
              accounts={finance.accounts}
              categories={finance.categories}
              decimal={regional.decimal}
              today={today}
            />
          </div>
        ) : null}
      </header>

      {remaining.length > 0 ? (
        <section
          aria-label="Finish setting up"
          className="border-line bg-surface/70 shadow-elev-1 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5 sm:px-5"
        >
          <span className="icon-tile text-aurora size-8" aria-hidden="true">
            <NavIcon name="settings" className="size-4" />
          </span>
          <p className="text-ink mr-auto text-sm font-medium">
            {remaining.length} step{remaining.length === 1 ? "" : "s"} left to finish setting up
          </p>
          {remaining.map((c) => (
            <ButtonLink key={c.label} href={c.href} size="sm" variant="secondary">
              {c.label}
            </ButtonLink>
          ))}
        </section>
      ) : null}

      {/* Lead: balance + this month's flow, with spending mix beside it. */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card variant="hero" aria-label="Balance" className="overflow-hidden p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-muted flex items-center gap-2 text-sm">
              Total balance
              <span className="border-line-strong text-ink-muted rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide">
                {mainCurrency}
              </span>
            </p>
            {sectionLink("/money/accounts", "Accounts")}
          </div>
          {main ? (
            <>
              <p className="type-figure text-ink mt-3 text-[2rem] leading-none tracking-tight break-all min-[400px]:text-[2.25rem] sm:text-5xl">
                {formatMinor(main.totalMinor, main.currency, locale)}
              </p>
              <p className="text-ink-subtle mt-2.5 text-xs">
                Across {main.count} active account{main.count === 1 ? "" : "s"} · confirmed
              </p>
              {otherTotals.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Other currencies">
                  {otherTotals.map((t) => (
                    <li
                      key={t.currency}
                      className="border-line bg-surface-muted/60 type-figure text-ink-muted rounded-full border px-2.5 py-1 text-xs"
                    >
                      {formatMinor(t.totalMinor, t.currency, locale)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="mt-4">
              <p className="text-ink text-lg font-medium">Add an account to start</p>
              <p className="text-ink-muted mt-1 text-sm">
                Cash, bank, cards or wallets, with today&apos;s balance
              </p>
              <ButtonLink href="/money/accounts?new=1" className="mt-4" size="sm">
                Add your first account
              </ButtonLink>
            </div>
          )}
          <dl className="mt-6 grid gap-2 min-[520px]:grid-cols-3 sm:gap-3">
            {[
              { label: "Income", value: incomeNow, tone: "text-success", dot: "bg-success" },
              {
                label: "Spent",
                value: spentNow,
                tone: "text-ink",
                dot: "bg-ink-muted",
              },
              {
                label: "Net",
                value: netNow,
                tone: netNow < 0n ? "text-danger" : "text-ink",
                dot: "bg-aurora",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="border-line bg-canvas/35 flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 backdrop-blur-sm min-[520px]:block sm:px-4 sm:py-3"
              >
                <dt className="text-ink-subtle flex items-center gap-1.5 text-xs">
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${m.dot}`} />
                  {m.label}
                  <span className="sr-only"> this month</span>
                </dt>
                <dd
                  className={`type-figure truncate text-sm min-[520px]:mt-1 sm:text-base ${m.tone}`}
                >
                  {m.value < 0n ? "−" : ""}
                  {formatMinor(
                    (m.value < 0n ? -m.value : m.value).toString(),
                    mainCurrency,
                    locale,
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-ink-subtle mt-3 flex flex-wrap items-center gap-2 text-xs">
            This month so far
            {spentChange !== null ? (
              <span
                className={
                  spentChange > 0
                    ? "bg-danger-soft text-danger rounded-full px-2 py-0.5 font-medium tabular-nums"
                    : "bg-success-soft text-success rounded-full px-2 py-0.5 font-medium tabular-nums"
                }
              >
                Spending {spentChange > 0 ? "+" : ""}
                {spentChange}% vs last month
              </span>
            ) : null}
          </p>
        </Card>

        <Card variant="glass" aria-labelledby="mix-heading" className="flex flex-col">
          <CardHeader
            title={<span id="mix-heading">Where it went</span>}
            description={`Spending by category · this month · ${mainCurrency}`}
          />
          <CardBody className="flex flex-1 items-center">
            {categoryRows.length > 0 ? (
              <SpendingDonut rows={categoryRows} currency={mainCurrency} locale={locale} />
            ) : (
              <p className="text-ink-muted w-full py-6 text-center text-sm">
                No spending recorded this month
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Cash flow"
          description={hasFlow ? `Income and spending, last 6 months · ${mainCurrency}` : undefined}
          action={sectionLink("/money", "Open Money")}
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
              title="No transactions yet"
              description="Record income or spending and this chart fills in month by month"
              action={
                <ButtonLink href="/money/transactions" size="sm">
                  Add a transaction
                </ButtonLink>
              }
            />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="At a glance">
        <StatTile
          label="Today's plan"
          href="/planning"
          icon={<NavIcon name="planning" className="size-4" />}
          accent="info"
          value={`${dueToday.length + events.length}`}
          chip={overdue.length ? { text: `${overdue.length} overdue`, tone: "down" } : undefined}
          note={`${dueToday.length} task${dueToday.length === 1 ? "" : "s"} · ${events.length} event${events.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Habits today"
          href="/planning/habits"
          icon={<NavIcon name="wellbeing" className="size-4" />}
          accent="aurora"
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
        <StatTile
          label="Budgets on track"
          href="/money/budgets"
          icon={<NavIcon name="money" className="size-4" />}
          accent="accent"
          value={
            budgetRows.length ? `${budgetRows.length - budgetsOver}/${budgetRows.length}` : "—"
          }
          chip={budgetsOver ? { text: `${budgetsOver} over`, tone: "down" } : undefined}
          note={budgetRows.length ? "This month" : "No budgets yet"}
        />
        <StatTile
          label="Unread nudges"
          href="/nudges"
          icon={<NavIcon name="nudges" className="size-4" />}
          accent="warning"
          value={`${unread ?? 0}`}
          note={unread ? "Waiting in your inbox" : "All caught up"}
        />
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Budgets" action={sectionLink("/money/budgets", "All")} />
          <CardBody>
            {budgetRows.length === 0 ? (
              <EmptyState
                title="No budgets yet"
                description="Set a monthly limit for all spending or for one category"
                action={
                  <ButtonLink href="/money/budgets?new=1" variant="secondary" size="sm">
                    Create a budget
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {budgetRows.slice(0, 4).map((b) => {
                  const pct = percentOf(BigInt(b.spent_minor), BigInt(b.limit_minor));
                  return (
                    <li key={b.budget_id}>
                      <Link href={`/money/budgets/${b.budget_id}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-ink truncate font-medium group-hover:underline">
                            {b.name}
                          </span>
                          <span
                            className={
                              pct > 100
                                ? "text-danger shrink-0 text-xs font-medium tabular-nums"
                                : "text-ink-muted shrink-0 text-xs tabular-nums"
                            }
                          >
                            {pct > 100 ? "Over · " : ""}
                            {Math.round(pct)}%
                          </span>
                        </div>
                        <ProgressBar
                          className="mt-2"
                          percent={pct}
                          warnAt={b.alert_threshold_pct}
                          label={`${b.name}: ${Math.round(pct)}% spent`}
                        />
                        <p className="text-ink-subtle mt-1.5 text-xs">
                          <MoneyAmount
                            minor={b.spent_minor}
                            currency={b.currency_code}
                            locale={locale}
                            className="text-ink-muted"
                          />{" "}
                          of{" "}
                          <MoneyAmount
                            minor={b.limit_minor}
                            currency={b.currency_code}
                            locale={locale}
                          />
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Savings goals" action={sectionLink("/money/goals", "All")} />
          <CardBody>
            {goalRows.length === 0 ? (
              <EmptyState
                title="No savings goals yet"
                description="Track progress towards something you're saving for"
                action={
                  <ButtonLink href="/money/goals?new=1" variant="secondary" size="sm">
                    Create a goal
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-1">
                {goalRows.slice(0, 4).map((g) => {
                  const saved = savedByGoal.get(g.id) ?? "0";
                  const pct = percentOf(BigInt(saved), BigInt(g.target_minor));
                  return (
                    <li key={g.id}>
                      <Link
                        href={`/money/goals/${g.id}`}
                        className="hover:bg-surface-muted/60 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
                      >
                        <span className="relative flex items-center justify-center">
                          <ProgressRing percent={pct} />
                          <span className="text-ink absolute text-[0.625rem] font-semibold tabular-nums">
                            {Math.min(100, Math.round(pct))}%
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-ink block truncate text-sm font-medium">
                            {g.name}
                          </span>
                          <span className="text-ink-subtle block truncate text-xs">
                            <MoneyAmount
                              minor={saved}
                              currency={g.currency_code}
                              locale={locale}
                              className="text-ink-muted"
                            />{" "}
                            of{" "}
                            <MoneyAmount
                              minor={g.target_minor}
                              currency={g.currency_code}
                              locale={locale}
                            />
                          </span>
                        </span>
                        <span className="sr-only">{Math.round(pct)}% saved</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent transactions"
            action={sectionLink("/money/transactions", "All")}
          />
          <CardBody>
            {recentRows.length === 0 ? (
              <p className="text-ink-muted text-sm">No transactions yet</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {recentRows.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/money/transactions/${t.id}`}
                      className="hover:bg-surface-muted/60 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          t.kind === "income"
                            ? "icon-tile text-success size-9 shrink-0 text-sm"
                            : t.kind === "transfer"
                              ? "icon-tile text-info size-9 shrink-0 text-sm"
                              : "icon-tile text-ink-muted size-9 shrink-0 text-sm"
                        }
                      >
                        {t.kind === "income" ? "↙" : t.kind === "transfer" ? "⇄" : "↗"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block truncate text-sm font-medium">
                          {t.description ||
                            t.merchant ||
                            t.category_name ||
                            (t.kind === "transfer" ? "Transfer" : "Transaction")}
                        </span>
                        <span className="text-ink-subtle block truncate text-xs">
                          {formatDate(new Date(`${t.occurred_on}T00:00:00Z`), regionalFmt)} ·{" "}
                          {t.account_name}
                        </span>
                      </span>
                      <MoneyAmount
                        minor={t.amount_minor}
                        currency={t.currency_code}
                        locale={locale}
                        kind={t.kind}
                        className="text-sm"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Today" action={sectionLink("/planning", "Planning")} />
          <CardBody>
            {agenda.length === 0 ? (
              <p className="text-ink-muted text-sm">Nothing scheduled today</p>
            ) : (
              <ul className="-mx-2 flex flex-col gap-0.5">
                {agenda.map((a) => (
                  <li
                    key={a.key}
                    className="hover:bg-surface-muted/60 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        a.meta === "Overdue"
                          ? "bg-danger size-2 shrink-0 rounded-full shadow-[0_0_8px_var(--danger)]"
                          : a.kind === "Event"
                            ? "bg-info size-2 shrink-0 rounded-full"
                            : "bg-accent size-2 shrink-0 rounded-full"
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
            action={sectionLink("/nudges", "Inbox")}
          />
          <CardBody>
            {(nudges.data ?? []).length === 0 ? (
              <p className="text-ink-muted text-sm">All caught up</p>
            ) : (
              <ul className="-mx-2 flex flex-col gap-0.5">
                {(nudges.data ?? []).map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.action_url ?? "/nudges"}
                      className="hover:bg-surface-muted/60 flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors"
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
          text="A short private check-in"
        />
        <QuickLink
          href="/intelligence"
          icon="intelligence"
          title="Intelligence"
          text="Suggestions with the working shown"
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
      className="border-line bg-surface shadow-elev-1 lift group flex items-center gap-4 rounded-2xl border p-4"
    >
      <span className="icon-tile text-ink-muted group-hover:text-accent size-10 shrink-0 transition-colors">
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
