import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddTransaction } from "@/components/finance/add-transaction";
import { MoneyAmount } from "@/components/finance/money-amount";
import { PendingTransactions } from "@/components/finance/pending-transactions";
import { ProjectedBalanceNote } from "@/components/finance/projected-balances";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { minorToInput } from "@/lib/finance/amount-input";
import { ACCOUNT_TYPE_LABEL } from "@/lib/finance/constants";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { isCurrencyCode } from "@/lib/money/currencies";
import { formatDate } from "@/lib/regional/format";
import { ArchiveAccountButton, EditAccountButton } from "../account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, supabase, accounts, categories, regional } = await loadFinanceBasics();
  const account = accounts.find((a) => a.id === id);
  if (!account || !isCurrencyCode(account.currency)) notFound();

  const { data: rows } = await supabase.rpc("list_transactions", { p_account_id: id, p_limit: 25 });
  const fmt = {
    locale: regional.locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/money/accounts" className="text-accent text-sm hover:underline">
        ← Accounts
      </Link>
      {sp.created ? (
        <Alert tone="success">Account created. Record its transactions as they happen.</Alert>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{ACCOUNT_TYPE_LABEL[account.type]}</Badge>
              <Badge>{account.currency}</Badge>
              {account.archived ? <Badge tone="warning">Archived</Badge> : null}
            </div>
            <h1 className="type-page mt-3">{account.name}</h1>
            {account.description ? (
              <p className="text-ink-muted mt-1 text-sm">{account.description}</p>
            ) : null}
            <p className="text-ink-subtle mt-5 text-xs font-medium tracking-wide uppercase">
              Confirmed balance
            </p>
            <p className="mt-1 text-[2rem] leading-tight">
              <MoneyAmount
                minor={account.balanceMinor}
                currency={account.currency}
                locale={regional.locale}
              />
            </p>
            <ProjectedBalanceNote
              userId={user.id}
              accountId={account.id}
              confirmedMinor={account.balanceMinor}
              currency={account.currency}
              locale={regional.locale}
            />
            <p className="text-ink-muted mt-2 text-xs">
              Opening balance{" "}
              <MoneyAmount
                minor={account.openingMinor}
                currency={account.currency}
                locale={regional.locale}
              />{" "}
              + {account.transactionCount} transaction
              {account.transactionCount === 1 ? "" : "s"}. This is AVEN&apos;s record, not a figure
              from your bank.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!account.archived ? (
              <AddTransaction
                userId={user.id}
                accounts={accounts}
                categories={categories}
                decimal={regional.decimal}
                today={regional.today}
                defaultAccountId={account.id}
              />
            ) : null}
            <EditAccountButton
              account={account}
              openingInput={minorToInput(account.openingMinor, account.currency, regional.decimal)}
            />
            <ArchiveAccountButton
              id={account.id}
              version={account.version}
              archived={account.archived}
            />
          </div>
        </CardBody>
      </Card>

      <PendingTransactions
        userId={user.id}
        accounts={accounts}
        categories={categories}
        locale={regional.locale}
        decimal={regional.decimal}
        today={regional.today}
        accountId={account.id}
      />

      <Card>
        <CardHeader
          title="Recent transactions"
          action={
            <Link
              href={`/money/transactions?account=${account.id}&month=all`}
              className="text-accent text-sm font-medium hover:underline"
            >
              View all
            </Link>
          }
        />
        <CardBody>
          {(rows ?? []).length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Income, expenses and transfers for this account will appear here."
            />
          ) : (
            <ul className="divide-line divide-y">
              {(rows ?? []).map((t) => {
                const incoming = t.kind === "transfer" && t.transfer_account_id === account.id;
                return (
                  <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/money/transactions/${t.id}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {t.description ||
                            t.merchant ||
                            t.category_name ||
                            (t.kind === "transfer"
                              ? incoming
                                ? `From ${t.account_name}`
                                : `To ${t.transfer_account_name}`
                              : "Transaction")}
                        </span>
                        <span className="text-ink-muted block text-xs">
                          {formatDate(new Date(`${t.occurred_on}T00:00:00Z`), fmt)}
                        </span>
                      </span>
                      <MoneyAmount
                        minor={t.amount_minor}
                        currency={t.currency_code}
                        locale={regional.locale}
                        kind={t.kind === "transfer" ? (incoming ? "income" : "expense") : t.kind}
                        className="text-sm"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
