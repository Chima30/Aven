import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { minorToInput } from "@/lib/finance/amount-input";
import { GOAL_STATUS_LABEL } from "@/lib/finance/constants";
import { percentOf } from "@/lib/finance/format";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { isCurrencyCode } from "@/lib/money/currencies";
import { formatDate } from "@/lib/regional/format";
import { DeleteGoalEntryButton, EditGoalButton, GoalEntryButton } from "../goal-forms";

export const metadata: Metadata = { title: "Savings goal" };

export default async function GoalPage({
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
  const [{ data: g }, { data: progress }, { data: entries }] = await Promise.all([
    supabase.from("savings_goals").select("*").eq("id", id).maybeSingle(),
    supabase.from("savings_goal_progress").select("*").eq("goal_id", id).maybeSingle(),
    supabase
      .from("savings_goal_entries")
      .select("*")
      .eq("goal_id", id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!g || !isCurrencyCode(g.currency_code)) notFound();
  const saved = progress?.saved_minor ?? "0";
  const pct = percentOf(BigInt(saved), BigInt(g.target_minor));
  const remaining = BigInt(g.target_minor) - BigInt(saved);
  const fmt = {
    locale: regional.locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/money/goals" className="text-accent text-sm hover:underline">
        ← Savings goals
      </Link>
      {sp.created ? <Alert tone="success">Goal created.</Alert> : null}
      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex gap-2">
                <Badge>{g.currency_code}</Badge>
                <Badge tone={g.status === "active" ? "accent" : "neutral"}>
                  {GOAL_STATUS_LABEL[g.status]}
                </Badge>
              </div>
              <h1 className="type-page mt-3">{g.name}</h1>
              {g.description ? (
                <p className="text-ink-muted mt-1 text-sm">{g.description}</p>
              ) : null}
            </div>
            <EditGoalButton
              goal={{
                id: g.id,
                name: g.name,
                currency: g.currency_code,
                version: g.version,
                targetDate: g.target_date,
                description: g.description,
                status: g.status,
              }}
              targetInput={minorToInput(g.target_minor, g.currency_code, regional.decimal)}
            />
          </div>
          <div>
            <p className="text-[2rem] leading-tight">
              <MoneyAmount minor={saved} currency={g.currency_code} locale={regional.locale} />
              <span className="text-ink-muted text-base">
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
              label={`${Math.round(pct)}% saved`}
            />
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-ink-muted">Completed</dt>
                <dd className="type-figure mt-0.5">{Math.round(pct)}%</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Remaining</dt>
                <dd className="mt-0.5">
                  {remaining > 0n ? (
                    <MoneyAmount
                      minor={remaining}
                      currency={g.currency_code}
                      locale={regional.locale}
                    />
                  ) : (
                    "Target reached"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Target date</dt>
                <dd className="mt-0.5">
                  {g.target_date ? formatDate(new Date(`${g.target_date}T00:00:00Z`), fmt) : "None"}
                </dd>
              </div>
            </dl>
          </div>
          {g.status !== "archived" ? (
            <div className="flex flex-wrap gap-3">
              <GoalEntryButton
                goalId={g.id}
                currency={g.currency_code}
                today={regional.today}
                kind="contribution"
              />
              {BigInt(saved) > 0n ? (
                <GoalEntryButton
                  goalId={g.id}
                  currency={g.currency_code}
                  today={regional.today}
                  kind="withdrawal"
                />
              ) : null}
            </div>
          ) : null}
          <p className="text-ink-muted text-xs">
            Contributions and withdrawals are tracking records. They don&apos;t move money or change
            any account balance.
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contribution history" />
        <CardBody>
          {(entries ?? []).length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              description="Record a contribution whenever you put money aside for this goal."
            />
          ) : (
            <ul className="divide-line divide-y">
              {(entries ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {e.kind === "contribution" ? "Contribution" : "Withdrawal"}
                    </span>
                    <span className="text-ink-muted block text-xs">
                      {formatDate(new Date(`${e.occurred_on}T00:00:00Z`), fmt)}
                      {e.note ? ` · ${e.note}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <MoneyAmount
                      minor={e.amount_minor}
                      currency={g.currency_code}
                      locale={regional.locale}
                      kind={e.kind === "contribution" ? "income" : "expense"}
                      className="text-sm"
                    />
                    <DeleteGoalEntryButton id={e.id} goalId={g.id} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
