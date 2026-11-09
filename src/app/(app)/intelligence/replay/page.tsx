import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { loadDecisionHistory } from "@/lib/intelligence/history";
import { decisionEvents, memoryStatusLabel } from "@/lib/intelligence/replay";

export const metadata: Metadata = { title: "Decision Replay" };

export default async function ReplayPage() {
  const history = await loadDecisionHistory();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Decision Replay"
        description="The recommendation, your decision, and the evidence of what happened next."
      />
      <Alert tone="info" title="Your record, with the gaps visible">
        This page reads saved records. It does not retrieve private memory contents from Walrus. A
        linked memory is not proof of a later outcome.
      </Alert>
      {history.truncated ? (
        <Alert tone="warning" title="Partial history">
          The newest records are shown. Counts and links may be incomplete.
        </Alert>
      ) : null}
      {history.recommendations.length === 0 ? (
        <EmptyState
          title="Your first decision starts here"
          description="Answer a recommendation in Insights. Its replay will appear here, even if memory is off."
        />
      ) : (
        history.recommendations.map((rec) => {
          const memory = history.memories.find((m) => m.id === rec.outcome_memory_id);
          const events = decisionEvents(rec, history.memories, history.recommendations);
          const sourceRefs = Array.isArray(rec.evidence.source_refs)
            ? (rec.evidence.source_refs as { table: string; id: string }[])
            : [];
          return (
            <Card key={rec.id}>
              <CardHeader title={rec.title} description={`${rec.period} · ${rec.currency_code}`} />
              <CardBody className="flex flex-col gap-4">
                <div>
                  <Badge>{rec.status}</Badge>
                  <p className="text-ink-muted mt-2 text-sm">{rec.explanation}</p>
                </div>
                <details className="text-sm">
                  <summary className="text-accent cursor-pointer">
                    What informed this recommendation?
                  </summary>
                  <p className="text-ink-muted mt-2">
                    {sourceRefs.length
                      ? `${sourceRefs.length} source references recorded when generated.`
                      : rec.evidence.provenance_version === 1
                        ? "Aggregate evidence was captured; no linked subject reference is present. Exact transaction lists are not retained."
                        : "This older recommendation has aggregate evidence only; exact contributing records were not captured."}
                  </p>
                  <pre className="bg-canvas mt-2 max-h-64 overflow-auto rounded-xl p-3 text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(rec.evidence, null, 2)}
                  </pre>
                </details>
                <ol className="border-line flex flex-col gap-4 border-l pl-4">
                  {events.map((event) => (
                    <li key={event.id}>
                      <p className="text-ink text-sm font-medium">
                        {event.type === "recommended"
                          ? "AVEN recommended"
                          : event.type === "decided"
                            ? "You decided"
                            : event.type === "memory"
                              ? "Memory record created"
                              : "Later recommendation used this memory"}
                      </p>
                      <p className="text-ink-muted text-sm">{event.label}</p>
                      <time className="text-ink-subtle text-xs" dateTime={event.at}>
                        {event.at}
                      </time>
                      <p className="text-ink-subtle font-mono text-xs break-all">{event.id}</p>
                    </li>
                  ))}
                </ol>
                <p className="text-ink-muted text-sm">
                  {memoryStatusLabel(memory ?? null)}.{" "}
                  {memory?.stored_at ? `Confirmed: ${memory.stored_at}.` : ""}
                </p>
                {history.memoryAllowed && memory?.status !== "suppressed" && memory?.blob_id ? (
                  <p className="text-ink-subtle font-mono text-xs break-all">
                    Walrus reference: {memory.blob_id}
                  </p>
                ) : null}
                {rec.memory_influence.length > 0 ? (
                  <div className="text-sm">
                    <p className="text-ink font-medium">Historical memory influence</p>
                    {history.memoryAllowed ? (
                      rec.memory_influence.map((m) => {
                        const active = history.memories.find(
                          (r) => r.blob_id === m.blob_id && r.status === "stored",
                        );
                        return (
                          <p key={`${m.blob_id}:${m.effect}`} className="text-ink-muted mt-1">
                            {active
                              ? m.effect
                              : "A memory influenced this at generation time; its details are now unavailable or forgotten."}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-ink-muted">
                        Memory is paused or permission is withdrawn. Historical memory details are
                        hidden.
                      </p>
                    )}
                    <p className="text-ink-subtle mt-1 text-xs">
                      Retrieval now: not attempted. Influence records describe generation time.
                    </p>
                  </div>
                ) : null}
                {rec.status === "modified" && rec.response_minor !== null ? (
                  <p className="text-ink-muted text-sm">
                    Your chosen amount: {rec.response_minor} minor units ({rec.currency_code}).
                  </p>
                ) : null}
                <p className="text-ink-subtle text-sm">
                  {events.some((e) => e.type === "adapted")
                    ? "A later recommendation records this memory as an influence."
                    : "No later recommendation using this decision is recorded yet."}{" "}
                  Financial outcome: not yet measured. Acceptance alone does not show that your
                  spending changed.
                </p>
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
