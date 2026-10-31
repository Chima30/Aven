import type { Metadata } from "next";
import Link from "next/link";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { GOAL_STATUS_LABEL } from "@/lib/finance/constants";
import { percentOf } from "@/lib/finance/format";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { CURRENCIES } from "@/lib/money/currencies";
import { formatDate } from "@/lib/regional/format";
import { NewGoalButton } from "./goal-forms";

export const metadata: Metadata = { title: "Savings goals" };

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { supabase, regional } = await loadFinanceBasics();
  const [{ data: goals }, { data: progress }] = await Promise.all([
    supabase.from("savings_goals").select("*").order("status").order("created_at"),
    supabase.from("savings_goal_progress").select("*"),
  ]);
  const saved = new Map((progress ?? []).map((p) => [p.goal_id, p.saved_minor]));
  const fmt = {
    locale: regional.locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Savings goals"
        description="Track progress towards what you're saving for. Contributions are records — they don't move money."
        action={
          <NewGoalButton
            currencies={CURRENCIES.map((c) => ({ code: c.code, name: c.name }))}
            defaultCurrency={regional.defaultCurrency}
            today={regional.today}
            defaultOpen={params.new === "1"}
          />
        }
      />
      {(goals ?? []).length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          description="Create a goal with a target amount and, if you like, a target date."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(goals ?? []).map((g) => {
            const s = saved.get(g.id) ?? "0";
            const pct = percentOf(BigInt(s), BigInt(g.target_minor));
            const remaining = BigInt(g.target_minor) - BigInt(s);
            return (
              <Link key={g.id} href={`/money/goals/${g.id}`} className="group">
                <Card
                  className={
                    g.status === "archived"
                      ? "p-5 opacity-70"
                      : "p-5 transition-shadow group-hover:shadow-md"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-ink-muted text-xs">
                        {g.currency_code}
                        {g.target_date
                          ? ` · by ${formatDate(new Date(`${g.target_date}T00:00:00Z`), fmt)}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      tone={pct >= 100 ? "success" : g.status === "active" ? "accent" : "neutral"}
                    >
                      {pct >= 100 ? "Target reached" : GOAL_STATUS_LABEL[g.status]}
                    </Badge>
                  </div>
                  <p className="mt-4 text-xl">
                    <MoneyAmount minor={s} currency={g.currency_code} locale={regional.locale} />
                    <span className="text-ink-muted text-sm">
                      {" "}
                      of{" "}
                      <MoneyAmount
                        minor={g.target_minor}
                        currency={g.currency_code}
                        locale={regional.locale}
                      />
                    </span>
                  </p>
                  <ProgressBar
                    className="mt-3"
                    tone="goal"
                    percent={pct}
                    label={`${g.name}: ${Math.round(pct)}% saved`}
                  />
                  <p className="text-ink-muted mt-2 text-xs">
                    {Math.round(pct)}% ·{" "}
                    {remaining > 0n ? (
                      <>
                        <MoneyAmount
                          minor={remaining}
                          currency={g.currency_code}
                          locale={regional.locale}
                        />{" "}
                        to go
                      </>
                    ) : (
                      "Done"
                    )}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
