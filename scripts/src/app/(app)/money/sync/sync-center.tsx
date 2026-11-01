"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatMinor } from "@/lib/finance/format";
import { resolveKeepMine, resolveUseServer, retryFailed } from "@/lib/finance/queue";
import type { TransactionPayload } from "@/lib/finance/schemas";
import { useTransactionOutbox } from "@/lib/finance/use-outbox";
import { describeLifeEntry } from "@/lib/life/queue";
import { requestSync } from "@/lib/offline/controller";
import type { OutboxEntry } from "@/lib/offline/types";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

type Tx = Partial<TransactionPayload> & { amount_minor?: string | number; version?: number };

/** Accessible sync status area: what's waiting, what failed, and how to resolve it. */
export function SyncCenter({
  userId,
  accounts,
  locale,
}: {
  userId: string;
  accounts: Array<{ id: string; name: string }>;
  locale: string;
}) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const entries = useTransactionOutbox(userId, "all");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const waiting = entries.filter((e) => e.status === "pending" || e.status === "syncing");
  const failed = entries.filter((e) => e.status === "failed");
  const name = (id?: string | null) => accounts.find((a) => a.id === id)?.name ?? "—";

  async function syncNow() {
    setBusy(true);
    const report = await requestSync(userId).catch(() => null);
    setBusy(false);
    if (!report)
      toast(online ? "Sync is already running in another tab." : "You're offline.", "info");
    else if (report.retrying > 0)
      toast("Couldn't reach the server. AVEN will keep trying.", "error");
    else
      toast(
        report.synced > 0
          ? `${report.synced} change${report.synced === 1 ? "" : "s"} synced.`
          : "Nothing to sync.",
        "success",
      );
  }

  const describeTx = (tx?: Tx) =>
    tx
      ? `${tx.occurred_on ?? ""} · ${tx.description || tx.kind || "Transaction"} · ${tx.amount_minor !== undefined && tx.currency_code ? formatMinor(tx.amount_minor, tx.currency_code, locale) : ""} · ${name(tx.account_id)}`
      : "—";

  const describe = describeTx;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <dl className="grid grid-cols-3 gap-6 text-sm" aria-live="polite">
            <div>
              <dt className="text-ink-muted">Connection</dt>
              <dd className="mt-1 font-semibold">{online ? "Online" : "Offline"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Pending</dt>
              <dd className="type-figure mt-1 font-semibold">{waiting.length}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Failed</dt>
              <dd
                className={
                  failed.length
                    ? "type-figure text-danger mt-1 font-semibold"
                    : "type-figure mt-1 font-semibold"
                }
              >
                {failed.length}
              </dd>
            </div>
          </dl>
          <Button onClick={syncNow} loading={busy} disabled={!online || waiting.length === 0}>
            Sync now
          </Button>
        </CardBody>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          title="Everything is synced"
          description="Everything saved on this device has reached your account."
        />
      ) : null}

      {waiting.length > 0 ? (
        <Card>
          <CardHeader
            title="Waiting to sync"
            description={
              online
                ? "These will be sent automatically."
                : "These will be sent when you're back online."
            }
          />
          <CardBody>
            <ul className="divide-line divide-y text-sm">
              {waiting.map((e) => (
                <li
                  key={e.mutationId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate">
                    {e.entity === "transaction"
                      ? describe(e.operation === "delete" ? (e.snapshot as Tx) : e.payload)
                      : describeLifeEntry(
                          e.entity,
                          e.operation,
                          e.payload as unknown as Record<string, unknown>,
                        )}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>{e.operation}</Badge>
                    <Badge tone={e.status === "syncing" ? "info" : "warning"}>
                      {e.status === "syncing" ? "Syncing" : "Pending"}
                    </Badge>
                    {e.attempts > 0 ? (
                      <span className="text-ink-muted text-xs">
                        {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {failed.length > 0 ? (
        <Card className="border-danger/30">
          <CardHeader
            title="Needs your decision"
            description="Nothing here has been deleted or overwritten. Choose what to keep."
          />
          <CardBody className="flex flex-col gap-4">
            {failed.map((e) => (
              <FailedEntry key={e.mutationId} entry={e} describe={describe} />
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function FailedEntry({
  entry,
  describe,
}: {
  entry: OutboxEntry<TransactionPayload>;
  describe: (tx?: Tx) => string;
}) {
  const toast = useToast();
  const kind = entry.lastError?.kind;
  const server = entry.conflictRecord as Tx | null | undefined;
  const mine = (entry.operation === "delete" ? entry.snapshot : entry.payload) as Tx;
  const isLife = entry.entity !== "transaction";
  const label = (tx?: Tx) =>
    isLife
      ? describeLifeEntry(entry.entity, entry.operation, tx as unknown as Record<string, unknown>)
      : describe(tx);

  const act = async (fn: () => Promise<void>, message: string) => {
    await fn();
    toast(message, "success");
  };

  return (
    <div className="border-line rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger">
          {kind === "conflict"
            ? "Conflict"
            : kind === "exhausted"
              ? "Couldn't reach server"
              : "Refused by server"}
        </Badge>
        <Badge>{entry.operation}</Badge>
      </div>
      <p className="text-ink mt-2 text-sm">{entry.lastError?.message}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="bg-surface-muted/60 rounded-lg p-3">
          <dt className="text-ink-muted text-xs font-semibold">Your change (this device)</dt>
          <dd className="mt-1 break-words">
            {entry.operation === "delete" && !isLife ? `Delete: ${label(mine)}` : label(mine)}
          </dd>
        </div>
        {kind === "conflict" ? (
          <div className="bg-surface-muted/60 rounded-lg p-3">
            <dt className="text-ink-muted text-xs font-semibold">Server copy now</dt>
            <dd className="mt-1 break-words">
              {server ? `${label(server)} · version ${server.version}` : "Deleted on the server"}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {kind === "exhausted" ? (
          <Button size="sm" onClick={() => act(() => retryFailed(entry), "Retrying.")}>
            Try again
          </Button>
        ) : null}
        {kind === "conflict" ? (
          <Button
            size="sm"
            onClick={() => act(() => resolveKeepMine(entry), "Your version will be sent.")}
          >
            {entry.operation === "delete"
              ? "Delete anyway"
              : server
                ? "Keep my version"
                : "Recreate as new"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => act(() => resolveUseServer(entry), "Your change was discarded.")}
        >
          {kind === "conflict" ? "Keep server version" : "Discard my change"}
        </Button>
      </div>
      {kind === "rejected" ? (
        <Alert tone="info" className="mt-3">
          The server refused this change, so retrying it unchanged won&apos;t help. Discard it and
          enter it again with corrected details.
        </Alert>
      ) : null}
    </div>
  );
}
