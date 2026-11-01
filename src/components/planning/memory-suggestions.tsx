import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";

export function MemorySuggestions({
  suggestions,
  consentLabel = "Remember planning preferences",
}: {
  suggestions: {
    memory: "active" | "unavailable" | "no_consent" | "paused";
    items: Array<{
      id: string;
      title: string;
      body: string;
      actionUrl: string;
      memory: { blobId: string; summary: string };
    }>;
  };
  consentLabel?: string;
}) {
  if (suggestions.memory === "unavailable") return null;
  if (suggestions.memory !== "active") {
    return (
      <p className="text-ink-subtle text-xs">
        {suggestions.memory === "paused" ? (
          "Memory is paused, so AVEN isn't learning your patterns."
        ) : (
          <>
            Want suggestions based on your patterns? Allow “{consentLabel}” in{" "}
            <Link href="/settings/privacy" className="underline">
              Settings → Privacy
            </Link>
            .
          </>
        )}
      </p>
    );
  }
  if (suggestions.items.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Suggestions from your patterns"
        description="Based on summaries AVEN keeps in Walrus Memory. Nothing changes unless you choose to."
        action={<Badge tone="info">From memory</Badge>}
      />
      <CardBody>
        <ul className="flex flex-col gap-3" data-testid="memory-suggestions">
          {suggestions.items.map((s) => (
            <li key={s.id} className="bg-surface-muted/60 rounded-lg px-3 py-2.5 text-sm">
              <p className="text-ink font-medium">{s.title}</p>
              <p className="text-ink-muted mt-0.5">{s.body}</p>
              <p className="text-ink-subtle mt-1 text-xs">
                Memory: “{s.memory.summary}” ·{" "}
                <span className="font-mono break-all">blob {s.memory.blobId}</span>
              </p>
              <Link href={s.actionUrl} className="text-accent mt-1 inline-block text-xs underline">
                Review
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
