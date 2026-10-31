import type { Metadata } from "next";
import Link from "next/link";
import { MoneyAmount } from "@/components/finance/money-amount";
import { ProjectedBalanceNote } from "@/components/finance/projected-balances";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ACCOUNT_TYPE_LABEL } from "@/lib/finance/constants";
import { balancesByCurrency, loadFinanceBasics } from "@/lib/finance/queries";
import { CURRENCIES } from "@/lib/money/currencies";
import { NewAccountButton } from "./account-forms";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, accounts, regional } = await loadFinanceBasics();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const totals = balancesByCurrency(accounts);

  const row = (a: (typeof accounts)[number]) => (
    <li key={a.id}>
      <Link
        href={`/money/accounts/${a.id}`}
        className="hover:bg-surface-muted/50 flex items-center justify-between gap-4 px-5 py-4 transition-colors"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-ink truncate text-sm font-medium">{a.name}</span>
            {a.archived ? <Badge>Archived</Badge> : null}
          </span>
          <span className="text-ink-muted mt-0.5 block text-xs">
            {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency} · {a.transactionCount} transaction
            {a.transactionCount === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-right">
          <MoneyAmount minor={a.balanceMinor} currency={a.currency} locale={regional.locale} />
          <ProjectedBalanceNote
            userId={user.id}
            accountId={a.id}
            confirmedMinor={a.balanceMinor}
            currency={a.currency}
            locale={regional.locale}
          />
        </span>
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Accounts"
        description="Balances are calculated from each account's opening balance plus every recorded transaction."
        action={
          <NewAccountButton
            currencies={CURRENCIES.map((c) => ({ code: c.code, name: c.name }))}
            defaultCurrency={regional.defaultCurrency}
            defaultOpen={params.new === "1"}
          />
        }
      />

      {totals.length > 1 ? (
        <p className="text-ink-muted text-sm">
          Totals by currency:{" "}
          {totals.map((t, i) => (
            <span key={t.currency}>
              {i > 0 ? " · " : ""}
              <MoneyAmount
                minor={t.totalMinor}
                currency={t.currency}
                locale={regional.locale}
                className="text-ink"
              />
            </span>
          ))}
          . Currencies are never combined.
        </p>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          title="No active accounts"
          description="Add the places your money lives — cash, bank accounts, savings, cards or digital wallets — with today's balance."
        />
      ) : (
        <Card>
          <ul className="divide-line divide-y">{active.map(row)}</ul>
        </Card>
      )}

      {archived.length > 0 ? (
        <section aria-labelledby="archived-heading">
          <h2 id="archived-heading" className="type-section mb-3">
            Archived
          </h2>
          <Card>
            <ul className="divide-line divide-y">{archived.map(row)}</ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
