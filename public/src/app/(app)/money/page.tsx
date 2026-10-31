import type { Metadata } from "next";
import Link from "next/link";
import { AddTransaction } from "@/components/finance/add-transaction";
import { CashflowChart, CategoryBreakdown } from "@/components/finance/charts";
import { MoneyAmount } from "@/components/finance/money-amount";
import { PeriodPicker } from "@/components/finance/period-picker";
import { ProgressBar } from "@/components/finance/progress-bar";
import { ProjectedBalanceNote, UnsyncedNotice } from "@/components/finance/projected-balances";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ACCOUNT_TYPE_LABEL } from "@/lib/finance/constants";
import { percentOf } from "@/lib/finance/format";
import {
  isPeriodKey,
  monthStart,
  PERIODS,
  periodRange,
  type PeriodKey,
} from "@/lib/finance/periods";
import { balancesByCurrency, loadFinanceBasics } from "@/lib/finance/queries";
import { formatDate } from "@/lib/regional/format";

export const metadata: Metadata = { title: "Money" };

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const period: PeriodKey = isPeriodKey(params.period) ? params.period : "this_month";
  const { user, supabase, accounts, categories, regional } = await loadFinanceBasics();
  const { from, to } = periodRange(period, regional.today);
  const months = period === "this_year" || period === "last_12_months" ? 12 : 6;

  const [summary, byCategory, cashflow, budgets, goals, progress, recent] = await Promise.all([
    supabase.rpc("finance_summary", { p_from: from, p_to: to }),
    supabase.rpc("spending_by_category", { p_from: from, p_to: to }),
    supabase.rpc("monthly_cashflow", { p_months: months, p_today: regional.today }),
    supabase.rpc("budget_progress", { p_month: monthStart(regional.today) }),
    supabase
      .from("savings_goals")
      .select("*")
      .in("status", ["active", "paused"])
      .order("created_at"),
    supabase.from("savings_goal_progress").select("*"),
    supabase.rpc("list_transactions", { p_limit: 6 }),
  ]);

  const activeAccounts = accounts.filter((a) => !a.archived);
  const totals = balancesByCurrency(accounts);
  const regionalFmt = {
    locale: regional.locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };
  const saved = new Map((progress.data ?? []).map((p) => [p.goal_id, p.saved_minor]));
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";
  const summaryRows = summary.data ?? [];
  const currenciesWithFlow = [...new Set((cashflow.data ?? []).map((r) => r.currency_code))];

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Money"
          title="Your money, in one place"
          description="Start by adding the accounts you use: cash, bank accounts, cards or wallets."
        />
        <EmptyState
          title="No accounts yet"
          description="AVEN never connects to your bank or invents balances. Add an account with its current balance, then record income and expenses as they happen — even offline."
          action={<ButtonLink href="/money/accounts?new=1">Add your first account</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Money"
        title="Overview"
        description="Every figure here comes from records you've added. Different currencies are never added together."
        action={
          <AddTransaction
            userId={user.id}
            accounts={accounts}
            categories={categories}
            decimal={regional.decimal}
            today={regional.today}
          />
        }
      />
      <UnsyncedNotice userId={user.id} />

      <section aria-labelledby="balances-heading">
        <h2 id="balances-heading" className="sr-only">
          Balances by currency
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((t) => (
            <Card key={t.currency} className="p-5">
              <p className="type-eyebrow text-ink-subtle">Total in {t.currency}</p>
              <p className="mt-2 text-[1.75rem] leading-tight">
                <MoneyAmount minor={t.totalMinor} currency={t.currency} locale={regional.locale} />
              </p>
              <p className="text-ink-muted mt-1 text-xs">
                Across {t.count} active account{t.count === 1 ? "" : "s"} · confirmed
              </p>
            </Card>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="type-section">Cash flow · {periodLabel.toLowerCase()}</h2>
        <PeriodPicker current={period} basePath="/money" />
      </div>

      {summaryRows.length === 0 ? (
        <EmptyState
          title="No income or expenses in this period"
          description="Transfers between your own accounts aren't counted as income or spending."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {summaryRows.map((s) => (
            <Card key={s.currency_code} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-ink text-sm font-semibold">{s.currency_code}</p>
                <Badge>{s.transaction_count} transactions</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-ink-muted">Income</dt>
                  <dd className="mt-1">
                    <MoneyAmount
                      minor={s.income_minor}
                      currency={s.currency_code}
                      locale={regional.locale}
                      kind="income"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Expenses</dt>
                  <dd className="mt-1">
                    <MoneyAmount
                      minor={s.expense_minor}
                      currency={s.currency_code}
                      locale={regional.locale}
                      kind="expense"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Net</dt>
                  <dd className="mt-1">
                    <MoneyAmount
                      minor={s.net_minor}
                      currency={s.currency_code}
                      locale={regional.locale}
                    />
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Monthly trend"
            description={`Income and expenses over the last ${months} months.`}
          />
          <CardBody className="flex flex-col gap-8">
            {currenciesWithFlow.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Your trend will appear once you record income or expenses.
              </p>
            ) : (
              currenciesWithFlow.slice(0, 3).map((currency) => (
                <div key={currency}>
                  {currenciesWithFlow.length > 1 ? (
                    <p className="mb-3 text-sm font-semibold">{currency}</p>
                  ) : null}
                  <CashflowChart
                    currency={currency}
                    locale={regional.locale}
                    data={(cashflow.data ?? [])
                      .filter((r) => r.currency_code === currency)
                      .map((r) => ({
                        month: r.month,
                        incomeMinor: r.income_minor,
                        expenseMinor: r.expense_minor,
                      }))}
                  />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Spending by category" description={periodLabel} />
          <CardBody className="flex flex-col gap-8">
            {(byCategory.data ?? []).length === 0 ? (
              <p className="text-ink-muted text-sm">No expenses in this period.</p>
            ) : (
              [...new Set((byCategory.data ?? []).map((r) => r.currency_code))].map((currency) => (
                <div key={currency}>
                  <p className="mb-3 text-sm font-semibold">{currency}</p>
                  <CategoryBreakdown
                    currency={currency}
                    locale={regional.locale}
                    rows={(byCategory.data ?? [])
                      .filter((r) => r.currency_code === currency)
                      .map((r) => ({ name: r.category_name, minor: r.expense_minor }))}
                  />
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Budgets this month"
            action={
              <Link
                href="/money/budgets"
                className="text-accent text-sm font-medium hover:underline"
              >
                All budgets
              </Link>
            }
          />
          <CardBody>
            {(budgets.data ?? []).length === 0 ? (
              <EmptyState
                title="No budgets yet"
                description="Set a monthly limit for all spending or for one category."
                action={
                  <ButtonLink href="/money/budgets?new=1" variant="secondary" size="sm">
                    Create a budget
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-5">
                {(budgets.data ?? []).slice(0, 5).map((b) => {
                  const pct = percentOf(BigInt(b.spent_minor), BigInt(b.limit_minor));
                  return (
                    <li key={b.budget_id}>
                      <Link href={`/money/budgets/${b.budget_id}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-ink font-medium group-hover:underline">
                            {b.name}
                          </span>
                          <span className="text-ink-muted">
                            <MoneyAmount
                              minor={b.spent_minor}
                              currency={b.currency_code}
                              locale={regional.locale}
                              className="text-ink"
                            />{" "}
                            of{" "}
                            <MoneyAmount
                              minor={b.limit_minor}
                              currency={b.currency_code}
                              locale={regional.locale}
                            />
                          </span>
                        </div>
                        <ProgressBar
                          className="mt-2"
                          percent={pct}
                          warnAt={b.alert_threshold_pct}
                          label={`${b.name}: ${Math.round(pct)}% spent`}
                        />
                        {pct > 100 ? (
                          <p className="text-danger mt-1 text-xs font-medium">Over budget</p>
                        ) : null}
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
            title="Savings goals"
            action={
              <Link href="/money/goals" className="text-accent text-sm font-medium hover:underline">
                All goals
              </Link>
            }
          />
          <CardBody>
            {(goals.data ?? []).length === 0 ? (
              <EmptyState
                title="No savings goals yet"
                description="Track progress towards something you're saving for."
                action={
                  <ButtonLink href="/money/goals?new=1" variant="secondary" size="sm">
                    Create a goal
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-5">
                {(goals.data ?? []).slice(0, 5).map((g) => {
                  const s = saved.get(g.id) ?? "0";
                  const pct = percentOf(BigInt(s), BigInt(g.target_minor));
                  return (
                    <li key={g.id}>
                      <Link href={`/money/goals/${g.id}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-ink font-medium group-hover:underline">
                            {g.name}
                          </span>
                          <span className="text-ink-muted">{Math.min(100, Math.round(pct))}%</span>
                        </div>
                        <ProgressBar
                          className="mt-2"
                          tone="goal"
                          percent={pct}
                          label={`${g.name}: ${Math.round(pct)}% saved`}
                        />
                        <p className="text-ink-muted mt-1 text-xs">
                          <MoneyAmount
                            minor={s}
                            currency={g.currency_code}
                            locale={regional.locale}
                          />{" "}
                          of{" "}
                          <MoneyAmount
                            minor={g.target_minor}
                            currency={g.currency_code}
                            locale={regional.locale}
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader
            title="Accounts"
            action={
              <Link
                href="/money/accounts"
                className="text-accent text-sm font-medium hover:underline"
              >
                Manage
              </Link>
            }
          />
          <CardBody>
            <ul className="divide-line divide-y">
              {activeAccounts.map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/money/accounts/${a.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-sm font-medium">{a.name}</span>
                      <span className="text-ink-muted block text-xs">
                        {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}
                      </span>
                    </span>
                    <span className="text-right">
                      <MoneyAmount
                        minor={a.balanceMinor}
                        currency={a.currency}
                        locale={regional.locale}
                        className="text-sm"
                      />
                      <ProjectedBalanceNote
                        userId={user.id}
                        accountId={a.id}
                        confirmedMinor={a.balanceMinor}
                        currency={a.currency}
                        locale={regional.locale}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link
                href="/money/transactions"
                className="text-accent text-sm font-medium hover:underline"
              >
                All transactions
              </Link>
            }
          />
          <CardBody>
            {(recent.data ?? []).length === 0 ? (
              <p className="text-ink-muted text-sm">No transactions yet.</p>
            ) : (
              <ul className="divide-line divide-y">
                {(recent.data ?? []).map((t) => (
                  <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/money/transactions/${t.id}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="text-ink block truncate text-sm font-medium">
                          {t.description ||
                            t.merchant ||
                            t.category_name ||
                            (t.kind === "transfer" ? "Transfer" : "Transaction")}
                        </span>
                        <span className="text-ink-muted block text-xs">
                          {formatDate(new Date(`${t.occurred_on}T00:00:00Z`), regionalFmt)} ·{" "}
                          {t.account_name}
                          {t.kind === "transfer" ? ` → ${t.transfer_account_name}` : ""}
                        </span>
                      </span>
                      <MoneyAmount
                        minor={t.amount_minor}
                        currency={t.currency_code}
                        locale={regional.locale}
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
    </div>
  );
}
