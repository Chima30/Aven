import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { RecommendationCard } from "@/components/intelligence/recommendation-card";
import { SavingsTargetForm } from "@/components/intelligence/savings-target-form";
import { MoneyAmount } from "@/components/finance/money-amount";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getAppContext } from "@/lib/auth/session";
import { formatMinor } from "@/lib/finance/format";
import { runIntelligence, type MemoryState } from "@/lib/intelligence/server";
import type { RecommendationKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Intelligence" };

const KIND_LABEL: Record<RecommendationKind, string> = {
  reduce_category_spend: "Spending",
  set_category_budget: "Budget",
  increase_savings: "Savings",
  review_subscription: "Subscription",
  goal_contribution: "Goal",
};

const STATUS_LABEL = {
  accepted: "Accepted",
  rejected: "Declined",
  modified: "Changed",
  open: "Open",
};

function MemoryBanner({ memory }: { memory: MemoryState }) {
  switch (memory.state) {
    case "active":
      return (
        <Alert tone="success" title="Learning from Walrus Memory">
          {memory.recalled === 0
            ? "No memories recalled yet. As you answer recommendations, AVEN remembers your decisions and adapts."
            : `${memory.recalled} memor${memory.recalled === 1 ? "y was" : "ies were"} recalled from Walrus and used below.`}
        </Alert>
      );
    case "no_consent":
      return (
        <Alert tone="info" title="Recommendations aren't learning from you yet">
          Allow “Remember financial context” in{" "}
          <Link className="underline" href="/settings/privacy">
            Settings → Privacy
          </Link>{" "}
          so AVEN can remember your answers in Walrus and adapt.
        </Alert>
      );
    case "paused":
      return (
        <Alert tone="info" title="Memory is paused">
          These suggestions use only this month&apos;s records, not your history.
        </Alert>
      );
    case "error":
      return (
        <Alert tone="warning" title="Walrus Memory unavailable">
          {memory.message}
        </Alert>
      );
    case "invalid_config":
      return (
        <Alert tone="danger" title="Walrus Memory is misconfigured">
          The server&apos;s MemWal settings are invalid. See Settings → Integrations.
        </Alert>
      );
    case "not_configured":
      return (
        <Alert tone="warning" title="Walrus Memory isn't configured">
          Suggestions work, but won&apos;t learn from your answers until the site owner configures
          Walrus Memory (docs/WALRUS_SETUP.md).
        </Alert>
      );
  }
}

export default async function IntelligencePage() {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const result = await runIntelligence(supabase, user.id, preferences);
  if (result.background) after(result.background);

  const { snapshot, signals } = result;
  const locale = preferences.locale;
  const fmt = (minor: number) => formatMinor(minor, snapshot.currency, locale);
  const lastSavings = snapshot.savings.months.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Insights & recommendations"
        description={`Calculated from your own ${snapshot.currency} records — no AI model and no outside data. Each suggestion explains its numbers; answer it and AVEN remembers.`}
      />
      <MemoryBanner memory={result.memory} />

      {!snapshot.hasEnoughData ? (
        <EmptyState
          title="Not enough history yet"
          description={`AVEN needs at least one complete month of ${snapshot.currency} transactions to analyse. Keep recording income and expenses in Money.`}
          action={
            <Link href="/money/transactions" className="text-accent text-sm underline">
              Go to transactions
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="recs-heading" className="flex flex-col gap-3">
            <h2 id="recs-heading" className="type-section text-ink">
              Recommendations for {snapshot.currentMonth}
            </h2>
            {result.current.length === 0 ? (
              <EmptyState
                title="Nothing to suggest right now"
                description="You're within your usual patterns. New suggestions appear as your month develops."
              />
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {result.current.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={{
                      id: r.id,
                      title: r.title,
                      explanation: r.explanation,
                      kindLabel: KIND_LABEL[r.kind],
                      suggestedLabel: r.suggested_minor !== null ? fmt(r.suggested_minor) : null,
                      currency: r.currency_code,
                      memoryInfluence: r.memory_influence,
                      status: r.status,
                      responseLabel:
                        r.status === "modified" && r.response_minor !== null
                          ? fmt(r.response_minor)
                          : null,
                      remembered: r.outcome_memory_id !== null,
                    }}
                  />
                ))}
              </ul>
            )}
            {result.suppressed.length > 0 ? (
              <Card>
                <CardHeader
                  title="Not suggested because of your history"
                  description="These were withheld based on what AVEN recalled from Walrus Memory."
                />
                <CardBody>
                  <ul className="flex flex-col gap-2 text-sm">
                    {result.suppressed.map((s) => (
                      <li
                        key={`${s.kind}-${s.subjectName}`}
                        className="bg-surface-muted/60 rounded-lg px-3 py-2"
                      >
                        <p className="text-ink">{s.reason}</p>
                        <p className="text-ink-subtle mt-0.5 font-mono text-[0.6875rem] break-all">
                          blob {s.memory.blob_id}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Spending this month"
                description={`Day ${snapshot.daysElapsed} of ${snapshot.daysInMonth}. Typical = median of your last ${snapshot.completeMonths.length} complete month${snapshot.completeMonths.length === 1 ? "" : "s"}.`}
              />
              <CardBody>
                {snapshot.categories.length === 0 ? (
                  <p className="text-ink-muted text-sm">No categorised spending yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-ink-muted text-left text-xs">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">So far</th>
                        <th className="pb-2 text-right font-medium">Typical</th>
                        <th className="pb-2 text-right font-medium">Budget</th>
                      </tr>
                    </thead>
                    <tbody className="divide-line divide-y">
                      {snapshot.categories.slice(0, 10).map((c) => {
                        const flagged = snapshot.overspending.some(
                          (o) => o.category.categoryId === c.categoryId,
                        );
                        return (
                          <tr key={c.categoryId}>
                            <td className="text-ink py-2">
                              {c.name} {flagged ? <Badge tone="warning">Watch</Badge> : null}
                            </td>
                            <td className="py-2 text-right">
                              <MoneyAmount
                                minor={String(c.current)}
                                currency={snapshot.currency}
                                locale={locale}
                              />
                            </td>
                            <td className="text-ink-muted py-2 text-right">
                              {fmt(c.medianComplete)}
                            </td>
                            <td className="text-ink-muted py-2 text-right">
                              {c.budgetLimit !== null ? fmt(c.budgetLimit) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Savings"
                description="Income minus spending, per complete month."
              />
              <CardBody className="flex flex-col gap-4">
                <ul className="flex flex-col gap-1.5 text-sm">
                  {snapshot.savings.months.slice(-3).map((m) => (
                    <li key={m.month} className="flex justify-between gap-4">
                      <span className="text-ink-muted">{m.month}</span>
                      <span className="text-ink">
                        {fmt(m.net)}{" "}
                        {m.ratePct !== null ? (
                          <span className="text-ink-muted">({m.ratePct}%)</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {lastSavings && snapshot.savings.avgRatePct !== null ? (
                  <p className="text-ink-muted text-sm">
                    3-month average:{" "}
                    <strong className="text-ink">{snapshot.savings.avgRatePct}%</strong> of income.
                  </p>
                ) : null}
                <div className="border-line border-t pt-4">
                  <p className="text-ink-muted mb-3 text-sm">
                    {signals.savingsTarget
                      ? `Your target recalled from Walrus: ${signals.savingsTarget.pct}% of income.`
                      : "No savings target in memory yet — AVEN assumes 10%."}{" "}
                    The target is stored only in Walrus Memory.
                  </p>
                  <SavingsTargetForm current={signals.savingsTarget?.pct ?? null} />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Patterns" description="Detected from completed months only." />
              <CardBody className="flex flex-col gap-3 text-sm">
                <p className="text-ink">
                  <span className="text-ink-muted">Income: </span>
                  {snapshot.income
                    ? `about ${fmt(snapshot.income.avgMonthlyMinor)} a month${snapshot.income.typicalDay !== null ? `, usually around day ${snapshot.income.typicalDay}` : ""}.`
                    : "not enough income history yet."}
                </p>
                <p className="text-ink">
                  <span className="text-ink-muted">Budgeting: </span>
                  {snapshot.budgeting.style === "none"
                    ? "no budgets yet."
                    : `${snapshot.budgeting.budgetCount} budget${snapshot.budgeting.budgetCount === 1 ? "" : "s"}, covering about ${snapshot.budgeting.coveragePct}% of spending.`}
                </p>
                <div>
                  <p className="text-ink-muted">Recurring payments:</p>
                  {snapshot.recurring.length === 0 ? (
                    <p className="text-ink">none detected (needs 3 months of similar charges).</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {snapshot.recurring.slice(0, 6).map((r) => (
                        <li key={r.key} className="text-ink flex justify-between gap-3">
                          <span>
                            {r.name} {r.isSubscription ? <Badge>Subscription</Badge> : null}
                          </span>
                          <span className="text-ink-muted">
                            {fmt(r.amountMinor)} · day {r.typicalDay}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {snapshot.otherCurrencies.length > 0 ? (
                  <p className="text-ink-subtle text-xs">
                    Transactions in {snapshot.otherCurrencies.join(", ")} aren&apos;t included; AVEN
                    never converts currencies.
                  </p>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Your recent answers"
                description="What you decided, and what AVEN remembers."
              />
              <CardBody>
                {result.answered.length === 0 ? (
                  <p className="text-ink-muted text-sm">
                    You haven&apos;t answered any recommendations yet.
                  </p>
                ) : (
                  <ul className="divide-line divide-y text-sm">
                    {result.answered.slice(0, 8).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="text-ink min-w-0">
                          {r.title}
                          {r.status === "modified" && r.response_minor !== null ? (
                            <span className="text-ink-muted"> → {fmt(r.response_minor)}</span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <Badge
                            tone={
                              r.status === "accepted"
                                ? "success"
                                : r.status === "rejected"
                                  ? "neutral"
                                  : "info"
                            }
                          >
                            {STATUS_LABEL[r.status]}
                          </Badge>
                          {r.outcome_memory_id ? <Badge tone="accent">In memory</Badge> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
