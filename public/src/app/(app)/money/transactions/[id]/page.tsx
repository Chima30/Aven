import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyAmount } from "@/components/finance/money-amount";
import { PendingTransactions } from "@/components/finance/pending-transactions";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { TRANSACTION_KIND_LABEL } from "@/lib/finance/constants";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { formatDate, formatDateTime } from "@/lib/regional/format";
import { TransactionActions } from "./transaction-actions";

export const metadata: Metadata = { title: "Transaction" };

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, supabase, accounts, categories, regional } = await loadFinanceBasics();
  const { data: t } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!t) notFound(); // RLS: another user's id simply isn't found

  const account = accounts.find((a) => a.id === t.account_id);
  const target = accounts.find((a) => a.id === t.transfer_account_id);
  const category = categories.find((c) => c.id === t.category_id);
  const fmt = {
    locale: regional.locale,
    timeZone: regional.timeZone,
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/money/transactions" className="text-accent text-sm hover:underline">
        ← Transactions
      </Link>
      <PendingTransactions
        userId={user.id}
        accounts={accounts}
        categories={categories}
        locale={regional.locale}
        decimal={regional.decimal}
        today={regional.today}
      />
      <Card>
        <CardBody className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={t.kind === "income" ? "success" : "neutral"}>
                  {TRANSACTION_KIND_LABEL[t.kind]}
                </Badge>
                <Badge tone="success">Synced</Badge>
              </div>
              <h1 className="type-page mt-3">
                {t.description || t.merchant || category?.name || TRANSACTION_KIND_LABEL[t.kind]}
              </h1>
              <p className="text-ink-muted mt-1 text-sm">
                {formatDate(new Date(`${t.occurred_on}T00:00:00Z`), { ...fmt, timeZone: "UTC" })}
              </p>
            </div>
            <p className="text-3xl">
              <MoneyAmount
                minor={t.amount_minor}
                currency={t.currency_code}
                locale={regional.locale}
                kind={t.kind}
              />
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{t.kind === "transfer" ? "From" : "Account"}</dt>
              <dd className="mt-0.5 font-medium">
                {account ? (
                  <Link href={`/money/accounts/${account.id}`} className="hover:underline">
                    {account.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {t.kind === "transfer" ? (
              <div>
                <dt className="text-ink-muted">To</dt>
                <dd className="mt-0.5 font-medium">
                  {target ? (
                    <Link href={`/money/accounts/${target.id}`} className="hover:underline">
                      {target.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-ink-muted">Category</dt>
                <dd className="mt-0.5 font-medium">{category?.name ?? "No category"}</dd>
              </div>
            )}
            <div>
              <dt className="text-ink-muted">
                {t.kind === "income" ? "Payer" : "Merchant or recipient"}
              </dt>
              <dd className="mt-0.5">{t.merchant ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Currency</dt>
              <dd className="mt-0.5">{t.currency_code}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">Notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{t.notes ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Recorded</dt>
              <dd className="mt-0.5">{formatDateTime(new Date(t.created_at), fmt)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Last changed</dt>
              <dd className="mt-0.5">
                {formatDateTime(new Date(t.updated_at), fmt)} · version {t.version}
              </dd>
            </div>
          </dl>
          <TransactionActions
            userId={user.id}
            transaction={t}
            accounts={accounts}
            categories={categories}
            decimal={regional.decimal}
            today={regional.today}
          />
        </CardBody>
      </Card>
    </div>
  );
}
