import type { Metadata } from "next";
import Link from "next/link";
import {
  ForgetAllForm,
  ForgetMemoryButton,
  RefreshMemoryButton,
  WalrusContents,
} from "@/components/intelligence/memory-actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getAppContext } from "@/lib/auth/session";
import { memwalConfig } from "@/lib/integrations/config";
import { canRecall } from "@/lib/memory/policy";
import { memoryRuntimeFor } from "@/lib/memory/runtime";
import { refreshMemoryJobs } from "@/lib/memory/service";
import { MEMORY_CAPABILITIES } from "@/lib/memory/store";
import { MEMORY_KIND_LABELS } from "@/lib/memory/types";
import { formatDateTime } from "@/lib/regional/format";
import type { MemoryRecordStatus } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Walrus Memory" };

const STATUS: Record<
  MemoryRecordStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  stored: { label: "Stored on Walrus", tone: "success" },
  submitted: { label: "Writing…", tone: "info" },
  queued: { label: "Waiting to retry", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  suppressed: { label: "Forgotten", tone: "neutral" },
};

export default async function MemoryPage() {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const runtime = await memoryRuntimeFor(supabase, user.id);

  // Advance any in-flight writes so the list shows Walrus' latest answer.
  if (runtime.available) {
    await refreshMemoryJobs(runtime.deps, user.id, { limit: 10, deadlineMs: 4_000 }).catch(
      () => undefined,
    );
  }

  const { data: records } = await supabase
    .from("memory_records")
    .select(
      "id, kind, label, status, job_status, blob_id, last_error, attempts, created_at, stored_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = records ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const regional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
  };
  const config = memwalConfig();
  const allowed = canRecall("memory_financial", runtime.ctx);
  const labels = Object.fromEntries(
    rows.filter((r) => r.blob_id).map((r) => [r.blob_id!, r.label]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Walrus Memory"
        description="Everything AVEN has remembered about your finances. The text of each memory lives on Walrus (Mainnet), encrypted; AVEN's database keeps only the label, status and Walrus blob id shown here."
        action={runtime.available ? <RefreshMemoryButton /> : undefined}
      />

      {config.status === "not_configured" ? (
        <Alert tone="warning" title="Walrus Memory isn't configured on this server">
          The site owner needs to add the MemWal settings described in docs/WALRUS_SETUP.md. Until
          then AVEN works normally but doesn&apos;t remember anything.
        </Alert>
      ) : config.status === "invalid" ? (
        <Alert tone="danger" title="Walrus Memory settings are invalid">
          {config.issues.join(" · ")}
        </Alert>
      ) : runtime.ctx.memoryPaused ? (
        <Alert tone="info" title="Memory is paused">
          AVEN isn&apos;t writing or reading memories. Turn pause off in{" "}
          <Link href="/settings/privacy" className="underline">
            Settings → Privacy
          </Link>
          .
        </Alert>
      ) : !allowed ? (
        <Alert tone="info" title="Memory is off">
          Allow “Remember financial context” in{" "}
          <Link href="/settings/privacy" className="underline">
            Settings → Privacy
          </Link>{" "}
          to let AVEN learn from your history and decisions.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {(["stored", "submitted", "queued", "failed"] as const).map((s) => (
          <div key={s} className="border-line bg-surface rounded-xl border px-4 py-3">
            <p className="text-ink-muted text-xs">{STATUS[s].label}</p>
            <p className="type-figure text-ink mt-1 text-2xl" data-testid={`memory-count-${s}`}>
              {counts[s] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Your memories"
          description="Newest first. “Forget” makes AVEN stop using a memory permanently."
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState
              title="No memories yet"
              description="Once memory is on, AVEN remembers patterns from completed months and your answers to its recommendations."
            />
          ) : (
            <ul className="divide-line divide-y" data-testid="memory-list">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-ink text-sm font-medium">{r.label}</p>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </div>
                    <p className="text-ink-muted mt-0.5 text-xs">
                      {MEMORY_KIND_LABELS[r.kind]} ·{" "}
                      {formatDateTime(new Date(r.created_at), regional)}
                      {r.job_status && r.status === "submitted"
                        ? ` · relayer: ${r.job_status}`
                        : ""}
                    </p>
                    {r.blob_id ? (
                      <p className="text-ink-subtle mt-0.5 font-mono text-[0.6875rem] break-all">
                        blob {r.blob_id}
                      </p>
                    ) : null}
                    {r.last_error && r.status !== "stored" && r.status !== "suppressed" ? (
                      <p className="text-warning mt-0.5 text-xs">{r.last_error}</p>
                    ) : null}
                  </div>
                  {r.status !== "suppressed" && runtime.available ? (
                    <ForgetMemoryButton id={r.id} label={r.label} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {runtime.available && allowed ? (
        <Card>
          <CardHeader
            title="Read back from Walrus"
            description="Fetches your memories from the Walrus Memory relayer right now, decrypted for your namespace only. Forgotten memories are filtered out."
          />
          <CardBody>
            <WalrusContents labels={labels} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="How deletion works" />
        <CardBody className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm">{MEMORY_CAPABILITIES.deletion}</p>
          {runtime.available && rows.some((r) => r.status !== "suppressed") ? (
            <ForgetAllForm />
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
