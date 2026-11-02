import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import { checkSui, checkWalrus, type CheckResult } from "@/lib/integrations/health";
import { emailConfig, cronSecret } from "@/lib/integrations/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Integrations" };

function StatusBadge({ result }: { result: CheckResult<unknown> }) {
  switch (result.status) {
    case "ok":
      return <Badge tone="success">Connected · {result.latencyMs} ms</Badge>;
    case "error":
      return <Badge tone="danger">Not reachable</Badge>;
    case "invalid":
      return <Badge tone="danger">Invalid settings</Badge>;
    case "not_configured":
      return <Badge tone="warning">Not configured</Badge>;
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="text-ink text-sm break-all sm:text-right">{value}</dd>
    </div>
  );
}

export default async function IntegrationsPage() {
  await getAppContext();
  const supabase = await createClient();
  const [walrus, sui, records] = await Promise.all([
    checkWalrus(),
    checkSui(),
    supabase.from("memory_records").select("status"),
  ]);
  const email = emailConfig();
  const scheduler = cronSecret() !== null;
  const counts = (records.data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Card>
        <CardHeader
          title="Walrus Memory (Mainnet)"
          description="Encrypted long-term memory"
          action={<StatusBadge result={walrus} />}
        />
        <CardBody className="flex flex-col gap-4">
          {walrus.status === "not_configured" ? (
            <Alert tone="warning">
              <p>Not set up yet.</p>
              <p className="text-ink-subtle mt-1 font-mono text-xs">
                Owner setup: MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_NAMESPACE_SECRET
              </p>
            </Alert>
          ) : walrus.status === "invalid" ? (
            <Alert tone="danger">{walrus.issues.join(" · ")}</Alert>
          ) : walrus.status === "error" ? (
            <Alert tone="danger" title="The relayer health check failed">
              {walrus.message}
            </Alert>
          ) : (
            <dl className="flex flex-col gap-2">
              <Row label="Relayer" value={walrus.detail.serverUrl} />
              <Row label="Relayer status" value={walrus.detail.relayerStatus} />
              <Row label="Relayer version" value={walrus.detail.version} />
              {walrus.detail.mode ? <Row label="Mode" value={walrus.detail.mode} /> : null}
              <Row
                label="Accepting writes"
                value={
                  walrus.detail.writeReady === null
                    ? "not reported"
                    : walrus.detail.writeReady
                      ? "yes"
                      : "no"
                }
              />
              <Row label="Namespace base" value={`${walrus.detail.namespaceBase}-u-…`} />
            </dl>
          )}
          <dl className="border-line flex flex-col gap-2 border-t pt-4">
            <Row label="Your memories stored on Walrus" value={counts.stored ?? 0} />
            <Row label="Being written" value={(counts.submitted ?? 0) + (counts.queued ?? 0)} />
            <Row label="Failed" value={counts.failed ?? 0} />
            <Row label="Forgotten" value={counts.suppressed ?? 0} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sui Mainnet via Tatum"
          description="Read-only wallet balances, via Tatum"
          action={<StatusBadge result={sui} />}
        />
        <CardBody>
          {sui.status === "not_configured" ? (
            <Alert tone="warning">
              <p>Not set up yet.</p>
              <p className="text-ink-subtle mt-1 font-mono text-xs">Owner setup: TATUM_API_KEY</p>
            </Alert>
          ) : sui.status === "invalid" ? (
            <Alert tone="danger">{sui.issues.join(" · ")}</Alert>
          ) : sui.status === "error" ? (
            <Alert tone="danger" title="The Sui check failed">
              {sui.message}
            </Alert>
          ) : (
            <dl className="flex flex-col gap-2">
              <Row label="Transport" value={sui.detail.transport} />
              <Row label="Latest checkpoint" value={sui.detail.checkpoint ?? "not reported"} />
              <Row label="Epoch" value={sui.detail.epoch ?? "not reported"} />
              <Row label="Chain identifier" value={sui.detail.chainId ?? "not reported"} />
              <Row label="Checked" value={new Date(sui.checkedAt).toUTCString()} />
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Email (SMTP)"
          description="Email copies of nudges, for people who turn it on"
          action={
            email.status === "configured" ? (
              <Badge tone="success">Configured</Badge>
            ) : email.status === "invalid" ? (
              <Badge tone="danger">Invalid settings</Badge>
            ) : (
              <Badge tone="warning">Not configured</Badge>
            )
          }
        />
        <CardBody>
          {email.status === "configured" ? (
            <dl className="flex flex-col gap-2">
              <Row label="Server" value={`${email.config.host}:${email.config.port}`} />
              <Row label="Sends as" value={email.config.from} />
            </dl>
          ) : email.status === "invalid" ? (
            <Alert tone="danger">{email.issues.join(" · ")}</Alert>
          ) : (
            <Alert tone="warning">
              <p>Not set up yet.</p>
              <p className="text-ink-subtle mt-1 font-mono text-xs">
                Owner setup: SMTP_HOST, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
              </p>
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Background scheduler"
          description="Reminders and summaries, even when AVEN is closed"
          action={
            scheduler ? (
              <Badge tone="success">Configured</Badge>
            ) : (
              <Badge tone="warning">Not configured</Badge>
            )
          }
        />
        <CardBody>
          {scheduler ? (
            <p className="text-ink-muted text-sm">Running every 15 minutes, plus a daily check.</p>
          ) : (
            <Alert tone="warning">
              <p>Not set up yet. Reminders are checked when someone opens AVEN.</p>
              <p className="text-ink-subtle mt-1 font-mono text-xs">Owner setup: CRON_SECRET</p>
            </Alert>
          )}
        </CardBody>
      </Card>
    </>
  );
}
