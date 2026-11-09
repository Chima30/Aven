import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { loadDecisionHistory } from "@/lib/intelligence/history";
import { decisionCounts, spendingObservation } from "@/lib/intelligence/impact";
import { loadFinanceInput } from "@/lib/intelligence/server";
import { createClient } from "@/lib/supabase/server";
import { localToday } from "@/lib/finance/periods";
import { formatMinor } from "@/lib/finance/format";

export const metadata: Metadata = { title: "AVEN Impact" };
export default async function ImpactPage() {
  const h = await loadDecisionHistory();
  const input = await loadFinanceInput(await createClient(), h.preferences);
  const counts = decisionCounts(h.recommendations);
  const metrics = [
    ["Recommendations made", counts.made],
    ["Accepted", counts.accepted],
    ["Declined", counts.rejected],
    ["Modified", counts.modified],
    ["Historically influenced by memory", counts.influenced],
    ["Goals marked completed", input.goals.filter((g) => g.status === "completed").length],
  ];
  const observations = h.recommendations.flatMap((rec) => {
    if (!rec.responded_at) return [];
    const observed = spendingObservation(
      rec,
      input.transactions,
      input.today,
      localToday(h.preferences.time_zone, new Date(rec.responded_at)),
    );
    return observed ? [{ rec, observed }] : [];
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AVEN Impact"
        description="What you decided, what your records show, and what remains unknown."
      />
      {h.truncated ? (
        <Alert tone="warning" title="Partial history">
          These metrics cover only the loaded records and may undercount older activity.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardHeader title={String(label)} />
            <CardBody>
              <p className="type-figure text-ink text-3xl">{value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Observed changes in recorded spending"
          description="Association over time; these figures do not prove AVEN caused the change."
        />
        <CardBody className="flex flex-col gap-4">
          {observations.length ? (
            observations.map(({ rec, observed }) => (
              <div key={rec.id} className="border-line rounded-xl border p-4">
                <h2 className="text-ink font-medium">{rec.title}</h2>
                <p className="text-ink-muted mt-2 text-sm">
                  {observed.before}:{" "}
                  {formatMinor(observed.beforeMinor, rec.currency_code, h.preferences.locale)} →{" "}
                  {observed.after}:{" "}
                  {formatMinor(observed.afterMinor, rec.currency_code, h.preferences.locale)}.
                </p>
                <p className="text-ink-muted text-sm">
                  Change:{" "}
                  {formatMinor(observed.changeMinor, rec.currency_code, h.preferences.locale)}{" "}
                  across {observed.recordCount} logged transactions. Recording may be incomplete.
                </p>
              </div>
            ))
          ) : (
            <EmptyState
              title="No comparable outcome yet"
              description="A spending recommendation needs an accepted or modified decision and recorded category expenses in both the full month before and the full month after your decision month."
            />
          )}
        </CardBody>
      </Card>
      <Alert tone="info" title="Estimated and unmeasurable outcomes">
        Scenario projections belong in What-if Lab. Attributable savings and habit improvement from
        advice are not measured here. An accepted recommendation or a completed goal alone does not
        establish impact.
      </Alert>
      <details className="text-ink-muted text-sm">
        <summary className="text-accent cursor-pointer">Calculation methods</summary>
        <p className="mt-2">
          Decision counts use saved recommendation statuses, once per recommendation id. Memory
          influence means a nonempty historical influence list, which can include preferences as
          well as decisions. Completed goals use their current recorded status. Spending compares
          the same category and currency in the month before the local response month and the month
          after it, only when both have expense entries and the later month has ended. Results cover
          the existing analysis lookback, use integer minor units, exclude transfers, and do not
          adjust for inflation, logging gaps or other causes.
        </p>
      </details>
    </div>
  );
}
