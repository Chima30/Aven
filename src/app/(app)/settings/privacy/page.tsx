import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import Link from "next/link";
import { CONSENT_COPY, CONSENT_ORDER, WALRUS_MEMORY_DISCLOSURES } from "@/lib/consent/catalog";
import { memwalConfig } from "@/lib/integrations/config";
import { MEMORY_CAPABILITIES } from "@/lib/memory/store";
import { formatDateTime } from "@/lib/regional/format";
import { createClient } from "@/lib/supabase/server";
import { ConsentToggle } from "./consent-toggle";
import { PrivacyForm } from "./privacy-form";

export const metadata: Metadata = { title: "Privacy & consent" };

const CAPABILITY_LABELS: Record<keyof typeof MEMORY_CAPABILITIES, string> = {
  sdk: "SDK",
  relayer: "Where memories go",
  encryption: "Encryption and access",
  isolation: "Isolation between users",
  revocation: "Withdrawing and pausing",
  deletion: "Deletion",
};

export default async function PrivacyPage() {
  const { preferences } = await getAppContext();
  const memoryConfigured = memwalConfig().status === "configured";
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
                          disclosures={
                            copy.group === "memory" ? WALRUS_MEMORY_DISCLOSURES : undefined
                          }
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
          title="Walrus Memory"
          description="How AVEN's long-term memory works, including its limits."
          action={
            memoryConfigured ? (
              <Badge tone="success">Configured</Badge>
            ) : (
              <Badge tone="warning">Not configured on this server</Badge>
            )
          }
        />
        <CardBody>
          <dl className="flex flex-col gap-3">
            {(Object.keys(CAPABILITY_LABELS) as Array<keyof typeof CAPABILITY_LABELS>).map(
              (key) => (
                <div key={key} className="bg-surface-muted/60 rounded-lg px-3 py-2 text-sm">
                  <dt className="text-ink font-medium">{CAPABILITY_LABELS[key]}</dt>
                  <dd className="text-ink-muted mt-0.5">{MEMORY_CAPABILITIES[key]}</dd>
                </div>
              ),
            )}
          </dl>
          <p className="text-ink-muted mt-4 text-sm">
            See and manage every stored memory in{" "}
            <Link
              href="/intelligence/memory"
              className="text-accent underline-offset-2 hover:underline"
            >
              Intelligence → Memory
            </Link>
            .
          </p>
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
