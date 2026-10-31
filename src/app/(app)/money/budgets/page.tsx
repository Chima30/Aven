import type { Metadata } from "next";
import Link from "next/link";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProgressBar } from "@/components/finance/progress-bar";
import { UnsyncedNotice } from "@/components/finance/projected-balances";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { percentOf } from "@/lib/finance/format";
import { monthStart } from "@/lib/finance/periods";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { NewBudgetButton } from "./budget-forms";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, supabase, accounts, categories, regional } = await loadFinanceBasics();
  const { data } = await supabase.rpc("budget_progress", {
    p_month: monthStart(regional.today),
    p_include_archived: true,
  });
  const budgets = data ?? [];
  const accountCurrencies = [...new Set(accounts.map((a) => a.currency))];
  const currencies =
    accountCurrencies.length > 0
      ? [...accountCurrencies, ...CURRENCY_CODES.filter((c) => !accountCurrencies.includes(c))]
      : [...CURRENCY_CODES];
  const monthName = new Intl.DateTimeFormat(regional.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(regional.today)}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Budgets"
        description={`Spending against your monthly limits for ${monthName}. Expenses only; transfers and income never count.`}
        action={
          <NewBudgetButton
            categories={categories.filter((c) => c.kind === "expense" && !c.archived)}
            currencies={currencies}
            defaultCurrency={regional.defaultCurrency}
            thisMonth={regional.today.slice(0, 7)}
            defaultOpen={params.new === "1"}
          />
        }
      />
      <UnsyncedNotice userId={user.id} />
      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Create a monthly limit for all your spending, or for one category like Food or Transport. AVEN will show how much is left."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const spent = BigInt(b.spent_minor);
            const limit = BigInt(b.limit_minor);
            const pct = percentOf(spent, limit);
            const remaining = limit - spent;
            return (
              <Link key={b.budget_id} href={`/money/budgets/${b.budget_id}`} className="group">
                <Card
                  className={
                    b.archived ? "p-5 opacity-70" : "p-5 transition-shadow group-hover:shadow-md"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-ink font-semibold">{b.name}</p>
                      <p className="text-ink-muted text-xs">
                        {b.category_name ?? "All spending"} · {b.currency_code}
                      </p>
                    </div>
                    {b.archived ? (
                      <Badge>Archived</Badge>
                    ) : pct > 100 ? (
                      <Badge tone="danger">Over budget</Badge>
                    ) : pct >= b.alert_threshold_pct ? (
                      <Badge tone="warning">{Math.round(pct)}% used</Badge>
                    ) : (
                      <Badge tone="success">On track</Badge>
                    )}
                  </div>
                  <ProgressBar
                    className="mt-4"
                    percent={pct}
                    warnAt={b.alert_threshold_pct}
                    label={`${b.name}: ${Math.round(pct)}% of budget spent`}
                  />
                  <div className="mt-3 flex justify-between text-sm">
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
                    <span className={remaining < 0n ? "text-danger font-medium" : "text-ink-muted"}>
                      {remaining < 0n ? "Over by " : ""}
                      <MoneyAmount
                        minor={remaining < 0n ? -remaining : remaining}
                        currency={b.currency_code}
                        locale={regional.locale}
                      />
                      {remaining >= 0n ? " left" : ""}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
