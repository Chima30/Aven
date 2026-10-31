import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import {
  AddWalletForm,
  ImportTransactionDialog,
  RemoveWalletButton,
} from "@/components/sui/wallet-forms";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { localToday } from "@/lib/finance/periods";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { formatUnits, shortAddress } from "@/lib/sui/address";
import { SuiProviderError, type ActivityItem } from "@/lib/sui/reader";
import { suiRuntime } from "@/lib/sui/runtime";
import { SUI_ERROR_COPY, type WalletBalance } from "@/lib/sui/service";

export const metadata: Metadata = { title: "Sui wallets" };

type WalletData =
  | {
      ok: true;
      balances: WalletBalance[];
      activity: ActivityItem[] | null;
      activityError: string | null;
    }
  | { ok: false; error: string };

export default async function WalletsPage() {
  const { supabase, accounts, categories, regional } = await loadFinanceBasics();
  const [{ data: wallets }, { data: imports }] = await Promise.all([
    supabase.from("sui_wallets").select("*").order("created_at"),
    supabase.from("chain_imports").select("tx_digest"),
  ]);
  const imported = new Set((imports ?? []).map((i) => i.tx_digest));
  const runtime = suiRuntime();
  const allowed =
    runtime.available &&
    (wallets?.length ?? 0) > 0 &&
    (await consumeRateLimit(supabase, "chain_read"));

  const data = new Map<string, WalletData>();
  if (runtime.available && allowed) {
    await Promise.all(
      (wallets ?? []).map(async (w) => {
        try {
          const balances = await runtime.service.walletBalances(w.address);
          let activity: ActivityItem[] | null = null;
          let activityError: string | null = null;
          try {
            activity = await runtime.service.sentActivity(w.address, 10);
          } catch (error) {
            const kind = error instanceof SuiProviderError ? error.kind : "unknown";
            activityError =
              kind === "unsupported"
                ? "Transaction history isn't available from the configured Tatum endpoint."
                : SUI_ERROR_COPY[kind];
          }
          data.set(w.id, { ok: true, balances, activity, activityError });
        } catch (error) {
          const kind = error instanceof SuiProviderError ? error.kind : "unknown";
          data.set(w.id, { ok: false, error: SUI_ERROR_COPY[kind] });
        }
      }),
    );
  }

  let chain: { checkpoint: string | null; epoch: string | null } | null = null;
  if (runtime.available && allowed) {
    chain = await runtime.service.chainInfo().catch(() => null);
  }

  const activeAccounts = accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const activeCategories = categories
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const dateFormatter = new Intl.DateTimeFormat(regional.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: regional.timeZone,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Sui wallets"
        description="Read-only view of public Sui Mainnet addresses, via Tatum. On-chain data is shown separately from your AVEN records and only becomes an AVEN transaction when you record it."
        action={
          chain?.checkpoint ? (
            <Badge tone="success">
              Mainnet checkpoint {Number(chain.checkpoint).toLocaleString(regional.locale)}
            </Badge>
          ) : undefined
        }
      />

      {!runtime.available ? (
        <Alert
          tone={runtime.reason === "invalid_config" ? "danger" : "warning"}
          title="Sui access isn't configured"
        >
          {runtime.reason === "invalid_config"
            ? `The server's Tatum settings are invalid: ${runtime.issues?.join(" · ")}`
            : "The site owner needs to add a Tatum API key (docs/TATUM_SETUP.md). You can still save addresses now."}
        </Alert>
      ) : runtime.available && (wallets?.length ?? 0) > 0 && !allowed ? (
        <Alert tone="warning" title="Slow down a little">
          You&apos;ve refreshed wallet data many times recently. Balances will load again in a few
          minutes.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Add a wallet"
          description="Up to 5 public addresses. AVEN never asks for keys and cannot move funds."
        />
        <CardBody>
          <AddWalletForm />
        </CardBody>
      </Card>

      {(wallets ?? []).length === 0 ? (
        <EmptyState
          title="No wallets yet"
          description="Add a public Sui address to see its balances and activity here."
        />
      ) : (
        (wallets ?? []).map((w) => {
          const d = data.get(w.id);
          return (
            <Card key={w.id}>
              <CardHeader
                title={w.label ?? shortAddress(w.address)}
                description={<span className="font-mono text-xs break-all">{w.address}</span>}
                action={<RemoveWalletButton id={w.id} label={w.label ?? shortAddress(w.address)} />}
              />
              <CardBody className="flex flex-col gap-5">
                {!d ? (
                  <p className="text-ink-muted text-sm">On-chain data unavailable.</p>
                ) : !d.ok ? (
                  <Alert tone="warning">{d.error}</Alert>
                ) : (
                  <>
                    <section>
                      <h3 className="type-eyebrow text-ink-subtle mb-2">On-chain balances</h3>
                      {d.balances.length === 0 ? (
                        <p className="text-ink-muted text-sm">No coins held.</p>
                      ) : (
                        <ul className="flex flex-col gap-1 text-sm" data-testid="sui-balances">
                          {d.balances.map((b) => (
                            <li key={b.coinType} className="flex justify-between gap-4">
                              <span className="text-ink">
                                {b.symbol}
                                {b.decimals === 0 && b.symbol !== "SUI" ? (
                                  <span className="text-ink-subtle text-xs"> (raw units)</span>
                                ) : null}
                              </span>
                              <span className="type-figure text-ink">
                                {formatUnits(b.balance, b.decimals)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h3 className="type-eyebrow text-ink-subtle mb-2">
                        Recent transactions sent from this wallet
                      </h3>
                      {d.activityError ? (
                        <p className="text-ink-muted text-sm">{d.activityError}</p>
                      ) : !d.activity || d.activity.length === 0 ? (
                        <p className="text-ink-muted text-sm">
                          No transactions sent from this address yet.
                        </p>
                      ) : (
                        <ul className="divide-line divide-y text-sm">
                          {d.activity.map((a) => {
                            const sui = a.changes.find((c) => c.coinType.endsWith("::sui::SUI"));
                            const summary =
                              a.changes.length === 0
                                ? "no balance change"
                                : a.changes
                                    .map((c) =>
                                      c.coinType.endsWith("::sui::SUI")
                                        ? `${formatUnits(c.amount, 9)} SUI`
                                        : `${c.amount} ${c.coinType.split("::").pop()}`,
                                    )
                                    .join(", ");
                            const date = a.timestampMs ? new Date(a.timestampMs) : null;
                            return (
                              <li
                                key={a.digest}
                                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="text-ink">
                                    {summary}{" "}
                                    {!a.success ? <Badge tone="danger">Failed</Badge> : null}
                                  </p>
                                  <p className="text-ink-subtle font-mono text-[0.6875rem] break-all">
                                    {date ? `${dateFormatter.format(date)} · ` : ""}
                                    {a.digest}
                                  </p>
                                </div>
                                {imported.has(a.digest) ? (
                                  <Badge tone="success">In AVEN</Badge>
                                ) : a.success && activeAccounts.length > 0 ? (
                                  <ImportTransactionDialog
                                    walletId={w.id}
                                    digest={a.digest}
                                    defaultDate={
                                      date ? localToday(regional.timeZone, date) : regional.today
                                    }
                                    defaultKind={
                                      sui && sui.amount.startsWith("-") ? "expense" : "income"
                                    }
                                    changeSummary={summary}
                                    accounts={activeAccounts}
                                    categories={activeCategories}
                                  />
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <p className="text-ink-subtle mt-2 text-xs">
                        Incoming transfers show up in balances. The transaction list covers
                        transactions this address sent.
                      </p>
                    </section>
                  </>
                )}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
