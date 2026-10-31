import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import { checkSui, checkWalrus, type CheckResult } from "@/lib/integrations/health";
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
  const counts = (records.data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Card>
        <CardHeader
          title="Walrus Memory (Mainnet)"
          description="Long-term memory through the official MemWal SDK and the hosted MemWal relayer."
          action={<StatusBadge result={walrus} />}
        />
        <CardBody className="flex flex-col gap-4">
          {walrus.status === "not_configured" ? (
            <Alert tone="warning">
              MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID and MEMWAL_NAMESPACE_SECRET are not set on the
              server. See docs/WALRUS_SETUP.md.
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
          description="Read-only balances and activity for wallets you add. Uses Tatum's gRPC gateway (Sui JSON-RPC is deprecated)."
          action={<StatusBadge result={sui} />}
        />
        <CardBody>
          {sui.status === "not_configured" ? (
            <Alert tone="warning">
              TATUM_API_KEY is not set on the server. See docs/TATUM_SETUP.md.
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
    </>
  );
}
