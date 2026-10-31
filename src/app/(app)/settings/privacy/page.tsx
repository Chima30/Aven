import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import { CONSENT_COPY, CONSENT_ORDER } from "@/lib/consent/catalog";
import { MEMORY_BACKEND_STATUS } from "@/lib/memory/store";
import { formatDateTime } from "@/lib/regional/format";
import { createClient } from "@/lib/supabase/server";
import { ConsentToggle } from "./consent-toggle";
import { PrivacyForm } from "./privacy-form";

export const metadata: Metadata = { title: "Privacy & consent" };

const VERIFICATION_LABELS: Record<keyof typeof MEMORY_BACKEND_STATUS.verified, string> = {
  sdkAndAuth: "Official SDK, account setup and authentication",
  encryption: "Encryption and who can read stored memories",
  retrieval: "Writing and retrieving memories",
  accessRevocation: "Revoking access when you withdraw consent",
  deletion: "Deleting memories, and deleting them with your account",
};

export default async function PrivacyPage() {
  const { preferences } = await getAppContext();
  const supabase = await createClient();
  const [{ data: categories }, { data: states }, { data: history }] = await Promise.all([
    supabase.from("consent_categories").select("*"),
    supabase.from("consent_state").select("*"),
    supabase
      .from("consent_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const regional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
  };
  const catalog = new Map((categories ?? []).map((c) => [c.category, c]));
  const current = new Map((states ?? []).map((s) => [s.category, s]));

  const groups = [
    { key: "ai", title: "AI assistant" },
    { key: "wellbeing", title: "Wellbeing information" },
    { key: "memory", title: "Long-term memory (Walrus)" },
  ] as const;

  return (
    <>
      <PrivacyForm aiEnabled={preferences.ai_enabled} memoryPaused={preferences.memory_paused} />

      <Card>
        <CardHeader
          title="Permissions"
          description="Every permission starts off. You can withdraw any of them at any time, and each change is recorded in your consent history."
        />
        <CardBody className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`consent-${group.key}`}>
              <h3 id={`consent-${group.key}`} className="type-eyebrow text-ink-subtle mb-3">
                {group.title}
              </h3>
              <ul className="divide-line border-line divide-y rounded-xl border">
                {CONSENT_ORDER.filter((c) => CONSENT_COPY[c].group === group.key).map(
                  (category) => {
                    const copy = CONSENT_COPY[category];
                    const info = catalog.get(category);
                    const state = current.get(category);
                    const granted = state?.granted ?? false;
                    const available = info?.is_available ?? false;
                    return (
                      <li
                        key={category}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-ink text-sm font-medium">{copy.title}</p>
                            {granted ? <Badge tone="success">Allowed</Badge> : <Badge>Off</Badge>}
                            {info?.is_sensitive ? <Badge tone="warning">Sensitive</Badge> : null}
                          </div>
                          <p className="text-ink-muted mt-1 text-sm">{copy.description}</p>
                          {!available ? (
                            <p className="text-ink-subtle mt-2 text-xs">{copy.unavailableNote}</p>
                          ) : null}
                          {state && granted ? (
                            <p className="text-ink-subtle mt-2 text-xs">
                              Allowed {formatDateTime(new Date(state.updated_at), regional)} ·
                              policy {state.policy_version}
                            </p>
                          ) : null}
                        </div>
                        <ConsentToggle
                          category={category}
                          granted={granted}
                          available={available}
                          title={copy.title}
                        />
                      </li>
                    );
                  },
                )}
              </ul>
            </section>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Memory status"
          description="What has — and hasn't — been verified before AVEN is allowed to store memories in Walrus."
          action={<Badge tone="neutral">Not active</Badge>}
        />
        <CardBody>
          <p className="text-ink-muted text-sm">
            No memories have been written. Your complete records stay in AVEN&apos;s main database;
            when memory launches it will only keep short summaries you have allowed, and you&apos;ll
            be able to review, correct and delete them.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {(Object.keys(VERIFICATION_LABELS) as Array<keyof typeof VERIFICATION_LABELS>).map(
              (key) => (
                <li
                  key={key}
                  className="bg-surface-muted/60 flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-ink">{VERIFICATION_LABELS[key]}</span>
                  {MEMORY_BACKEND_STATUS.verified[key] ? (
                    <Badge tone="success">Verified</Badge>
                  ) : (
                    <Badge tone="warning">Not yet verified</Badge>
                  )}
                </li>
              ),
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Consent history" description="The last 20 changes you made." />
        <CardBody>
          {history && history.length > 0 ? (
            <ul className="divide-line divide-y text-sm">
              {history.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-ink">
                    {r.granted ? "Allowed" : "Withdrew"}:{" "}
                    {CONSENT_COPY[r.category]?.title ?? r.category}
                  </span>
                  <time dateTime={r.created_at} className="text-ink-muted">
                    {formatDateTime(new Date(r.created_at), regional)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No changes yet"
              description="Every permission is currently off. Changes you make will be listed here."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
