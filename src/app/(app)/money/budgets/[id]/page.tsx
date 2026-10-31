import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { minorToInput } from "@/lib/finance/amount-input";
import { percentOf } from "@/lib/finance/format";
import { monthStart } from "@/lib/finance/periods";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { isCurrencyCode } from "@/lib/money/currencies";
import { ArchiveBudgetButton, EditBudgetButton } from "../budget-forms";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, regional } = await loadFinanceBasics();
  const [{ data: all }, { data: history }] = await Promise.all([
    supabase.rpc("budget_progress", {
      p_month: monthStart(regional.today),
      p_include_archived: true,
    }),
    supabase.rpc("budget_history", { p_budget_id: id, p_months: 12, p_today: regional.today }),
  ]);
  const b = (all ?? []).find((x) => x.budget_id === id);
  if (!b || !isCurrencyCode(b.currency_code)) notFound();
  const pct = percentOf(BigInt(b.spent_minor), BigInt(b.limit_minor));
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(regional.locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/money/budgets" className="text-accent text-sm hover:underline">
        ← Budgets
      </Link>
      {sp.created ? <Alert tone="success">Budget created.</Alert> : null}
      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex gap-2">
                <Badge>{b.category_name ?? "All spending"}</Badge>
                <Badge>{b.currency_code}</Badge>
                {b.archived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
              <h1 className="type-page mt-3">{b.name}</h1>
              <p className="text-ink-muted mt-1 text-sm">
                This month · warns at {b.alert_threshold_pct}%
              </p>
            </div>
            <div className="flex gap-3">
              <EditBudgetButton
                budget={{
                  id: b.budget_id,
                  name: b.name,
                  currency: b.currency_code,
                  version: b.version,
                  threshold: b.alert_threshold_pct,
                }}
                limitInput={minorToInput(b.limit_minor, b.currency_code, regional.decimal)}
              />
              <ArchiveBudgetButton id={b.budget_id} version={b.version} archived={b.archived} />
            </div>
          </div>
          <ProgressBar
            percent={pct}
            warnAt={b.alert_threshold_pct}
            label={`${Math.round(pct)}% of budget spent`}
          />
          <p className="text-ink-muted text-sm">
            <MoneyAmount
              minor={b.spent_minor}
              currency={b.currency_code}
              locale={regional.locale}
              className="text-ink"
            />{" "}
            spent of{" "}
            <MoneyAmount
              minor={b.limit_minor}
              currency={b.currency_code}
              locale={regional.locale}
            />{" "}
            · {Math.round(pct)}%
          </p>
          {pct > 100 ? (
            <Alert tone="danger">Spending has passed this month&apos;s limit.</Alert>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="History" description="Spending against the limit, month by month." />
        <CardBody>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-muted text-left">
                <th className="pb-2 font-medium">Month</th>
                <th className="pb-2 text-right font-medium">Spent</th>
                <th className="pb-2 text-right font-medium">Limit</th>
                <th className="pb-2 text-right font-medium">Used</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {(history ?? []).map((h) => {
                const p = percentOf(BigInt(h.spent_minor), BigInt(h.limit_minor));
                return (
                  <tr key={h.month}>
                    <td className="py-2.5">{monthLabel(h.month)}</td>
                    <td className="py-2.5 text-right">
                      <MoneyAmount
                        minor={h.spent_minor}
                        currency={b.currency_code}
                        locale={regional.locale}
                      />
                    </td>
                    <td className="text-ink-muted py-2.5 text-right">
                      <MoneyAmount
                        minor={h.limit_minor}
                        currency={b.currency_code}
                        locale={regional.locale}
                      />
                    </td>
                    <td
                      className={
                        p > 100 ? "text-danger py-2.5 text-right font-medium" : "py-2.5 text-right"
                      }
                    >
                      {Math.round(p)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-ink-muted mt-3 text-xs">
            History uses the current limit for every month.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
