"use client";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { addMonths } from "@/lib/intelligence/analysis";
import { demoRecommendations } from "@/lib/intelligence/demo";
import { outcomeMemoryCandidate } from "@/lib/intelligence/memories";
import { formatMinor } from "@/lib/finance/format";
import { parseMoney } from "@/lib/money/money";
import type { RecalledMemory } from "@/lib/memory/types";
import type { RecommendationRow } from "@/lib/supabase/database.types";

export function DecisionDemo() {
  const [turn, setTurn] = useState(0);
  const [memories, setMemories] = useState<RecalledMemory[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);
  const [amount, setAmount] = useState("52000");
  const [error, setError] = useState("");
  const period = addMonths("2026-11", turn);
  // Freeze the current recommendation after answering; only the NEXT scenario uses the new memory.
  const previousMemories = answered ? memories.slice(0, -1) : memories;
  const result = demoRecommendations(period, previousMemories);
  const rec = result.recommendations.find((r) => r.kind === "reduce_category_spend");
  const suppressed = result.suppressed.find((r) => r.kind === "reduce_category_spend");
  const fmt = (minor: number) => formatMinor(minor, "NGN", "en-NG");
  function decide(status: "accepted" | "rejected" | "modified") {
    if (!rec || answered) return;
    try {
      const chosen = status === "modified" ? Number(parseMoney(amount, "NGN").amountMinor) : null;
      if (chosen !== null && (!Number.isSafeInteger(chosen) || chosen <= 0))
        throw new Error("Enter a positive amount within the supported range.");
      const row = {
        id: `example-decision-${turn}`,
        kind: rec.kind,
        period,
        status,
        title: rec.title,
        suggested_minor: rec.suggestedMinor,
        response_minor: chosen,
        currency_code: "NGN",
      } as RecommendationRow;
      const candidate = outcomeMemoryCandidate(
        row,
        { key: rec.subjectKey, name: rec.subjectName },
        rec.suggestedPct,
        100,
      );
      const memory: RecalledMemory = {
        blobId: `example-local-memory-${turn}`,
        category: candidate.category,
        kind: candidate.kind,
        observedOn: candidate.observedOn,
        summary: candidate.summary,
        facts: Object.fromEntries(Object.entries(candidate.facts).map(([k, v]) => [k, String(v)])),
        createdAt: `${period}-15T12:00:00Z`,
        distance: 0,
      };
      setMemories([...memories, memory]);
      setLog([
        ...log,
        `${period}: ${status}${chosen !== null ? `; chose ${fmt(chosen)}` : ""}. ${rec.memoryInfluence.length ? "This advice used a prior local example memory." : "This advice used no prior memory."}`,
      ]);
      setAnswered(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the amount.");
    }
  }
  function reset() {
    setTurn(0);
    setAmount("52000");
    setMemories([]);
    setLog([]);
    setAnswered(false);
    setError("");
  }
  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="Example workspace · local simulation">
        All figures and records here are examples. This runs AVEN&apos;s real deterministic
        analysis, recommendation and learning rules. Memory is simulated in this tab; no Supabase
        writes, Walrus uploads or wallet requests occur. Reset or reload clears the session.
      </Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="The example situation" description={`Scenario month: ${period}`} />
          <CardBody className="text-ink-muted flex flex-col gap-2 text-sm">
            <p>
              Food budget: ₦50,000. Prior full-month food spending: ₦55,000. Current food spending
              by day 15: ₦35,000.
            </p>
            <p>Laptop goal: ₦250,000; ₦50,000 tracked so far.</p>
            <p>
              Upcoming example obligation: ₦30,000 rent reserve. This is an explicit demo
              assumption; the recommendation engine does not currently use a confirmed bill ledger.
            </p>
            <p>
              Decide below, then open the next scenario to see whether the recommendation changes.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What AVEN recommends" />
          <CardBody className="flex flex-col gap-4" aria-live="polite">
            {rec ? (
              <>
                <Badge>
                  {rec.memoryInfluence.length
                    ? "Changed by an example memory"
                    : "From the example records"}
                </Badge>
                <h2 className="text-ink font-medium">{rec.title}</h2>
                <p className="text-ink-muted text-sm">{rec.explanation}</p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={answered} onClick={() => decide("accepted")}>
                    Accept
                  </Button>
                  <Button
                    disabled={answered}
                    variant="secondary"
                    onClick={() => decide("rejected")}
                  >
                    Decline
                  </Button>
                </div>
                <label className="text-ink flex flex-col gap-1 text-sm" htmlFor="demo-amount">
                  Your food target (NGN)
                  <Input
                    id="demo-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    disabled={answered}
                  />
                </label>
                <Button disabled={answered} variant="secondary" onClick={() => decide("modified")}>
                  Use my amount
                </Button>
                {error ? <Alert tone="danger">{error}</Alert> : null}
              </>
            ) : (
              <p className="text-ink-muted">
                {suppressed?.reason ?? "Nothing to recommend in this scenario."}
              </p>
            )}
            <Button
              disabled={!answered && !suppressed}
              onClick={() => {
                setTurn(turn + 1);
                setAnswered(false);
              }}
            >
              Open next month&apos;s scenario
            </Button>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Decision Replay · example records"
          description="Stable local references; no live storage verification is available."
        />
        <CardBody className="flex flex-col gap-3">
          {log.length ? (
            <ol className="text-ink-muted flex flex-col gap-2 text-sm">
              {log.map((entry, i) => (
                <li key={i}>
                  <span className="text-ink-subtle font-mono text-xs">example-decision-{i}</span>
                  <p>{entry}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ink-muted text-sm">Make your first decision above.</p>
          )}
          {memories.map((m) => (
            <details key={m.blobId} className="text-sm">
              <summary className="text-accent cursor-pointer">Example memory: {m.blobId}</summary>
              <p className="text-ink-muted mt-2">{m.summary}</p>
              <p className="text-ink-subtle">
                Category: {m.category}. Example date: {m.observedOn}. Verification: unavailable;
                this is local simulation.
              </p>
            </details>
          ))}
          <p className="text-ink-muted text-sm">
            Measured financial result: unknown. Advancing a scenario does not create real-world
            savings.
          </p>
          <Button variant="ghost" onClick={reset}>
            Reset example workspace
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
