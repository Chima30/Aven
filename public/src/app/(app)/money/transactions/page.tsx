import type { Metadata } from "next";
import Link from "next/link";
import { AddTransaction } from "@/components/finance/add-transaction";
import { MoneyAmount } from "@/components/finance/money-amount";
import { PendingTransactions } from "@/components/finance/pending-transactions";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { isValidIsoDate } from "@/lib/finance/periods";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { formatDate } from "@/lib/regional/format";
import type { TransactionKind } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 50;
const SORTS = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  amount_desc: "Largest amount",
  amount_asc: "Smallest amount",
} as const;
type SortKey = keyof typeof SORTS;

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, supabase, accounts, categories, regional } = await loadFinanceBasics();

  const q = one(params.q).slice(0, 100);
  const kindParam = one(params.kind);
  const kind = (["income", "expense", "transfer"] as const).includes(kindParam as TransactionKind)
    ? (kindParam as TransactionKind)
    : null;
  const accountId = accounts.some((a) => a.id === one(params.account)) ? one(params.account) : null;
  const categoryId = categories.some((c) => c.id === one(params.category))
    ? one(params.category)
    : null;
  const sort: SortKey = one(params.sort) in SORTS ? (one(params.sort) as SortKey) : "date_desc";
  const page = Math.max(1, Number(one(params.page)) || 1);

  // Date range: a month (default: this month), "all", or an explicit from/to.
  const customFrom = isValidIsoDate(one(params.from)) ? one(params.from) : null;
  const customTo = isValidIsoDate(one(params.to)) ? one(params.to) : null;
  const monthParam = one(params.month);
  const month =
    customFrom || customTo
      ? null
      : monthParam === "all"
        ? null
        : /^\d{4}-\d{2}$/.test(monthParam)
          ? monthParam
          : regional.today.slice(0, 7);
  const from = customFrom ?? (month ? `${month}-01` : null);
  const to =
    customTo ??
    (month
      ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
          .toISOString()
          .slice(0, 10)
      : null);

  const [list, summary] = await Promise.all([
    supabase.rpc("list_transactions", {
      p_q: q || null,
      p_kind: kind,
      p_account_id: accountId,
      p_category_id: categoryId,
      p_from: from,
      p_to: to,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    from && to
      ? supabase.rpc("finance_summary", { p_from: from, p_to: to })
      : Promise.resolve({ data: null }),
  ]);
  const rows = list.data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const fmt = {
    locale: regional.locale,
    timeZone: "UTC",
    dateFormat: regional.dateFormat,
    numberFormat: regional.numberFormat,
  };
  const monthLabel = month
    ? new Intl.DateTimeFormat(regional.locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${month}-01T00:00:00Z`))
    : customFrom || customTo
      ? "Custom dates"
      : "All time";

  const link = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const base: Record<string, string | null> = {
      q: q || null,
      kind,
      account: accountId,
      category: categoryId,
      sort: sort === "date_desc" ? null : sort,
      month: monthParam || null,
      from: customFrom,
      to: customTo,
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/money/transactions${s ? `?${s}` : ""}`;
  };

  // Group rows by date for scanning.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.occurred_on, [...(groups.get(r.occurred_on) ?? []), r]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Transactions"
        description="Income, expenses and transfers. Saved on this device first, then synced."
        action={
          accounts.length > 0 ? (
            <AddTransaction
              userId={user.id}
              accounts={accounts}
              categories={categories}
              decimal={regional.decimal}
              today={regional.today}
              defaultAccountId={accountId ?? undefined}
            />
          ) : (
            <ButtonLink href="/money/accounts?new=1">Add an account</ButtonLink>
          )
        }
      />

      <PendingTransactions
        userId={user.id}
        accounts={accounts}
        categories={categories}
        locale={regional.locale}
        decimal={regional.decimal}
        today={regional.today}
      />

      <Card className="p-4">
        <form
          method="get"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
          role="search"
          aria-label="Filter transactions"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-q">Search</Label>
            <Input id="f-q" name="q" defaultValue={q} placeholder="Description, merchant, notes…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-kind">Type</Label>
            <Select id="f-kind" name="kind" defaultValue={kind ?? ""}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expenses</option>
              <option value="transfer">Transfers</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-account">Account</Label>
            <Select id="f-account" name="account" defaultValue={accountId ?? ""}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-category">Category</Label>
            <Select id="f-category" name="category" defaultValue={categoryId ?? ""}>
              <option value="">All categories</option>
              {categories
                .filter((c) => !c.archived || c.id === categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind})
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-sort">Sort</Label>
            <Select id="f-sort" name="sort" defaultValue={sort}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <input type="hidden" name="month" value={monthParam} />
          <button type="submit" className={buttonClasses("secondary")}>
            Apply
          </button>
          <details className="sm:col-span-2 lg:col-span-6">
            <summary className="text-accent cursor-pointer text-sm">Custom date range</summary>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-from">From</Label>
                <Input id="f-from" name="from" type="date" defaultValue={customFrom ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-to">To</Label>
                <Input id="f-to" name="to" type="date" defaultValue={customTo ?? ""} />
              </div>
            </div>
          </details>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {month ? (
            <Link
              href={link({ month: shiftMonth(month, -1), page: null })}
              className={buttonClasses("ghost", "sm")}
              aria-label="Previous month"
            >
              ←
            </Link>
          ) : null}
          <h2 className="type-section">{monthLabel}</h2>
          {month ? (
            <Link
              href={link({ month: shiftMonth(month, 1), page: null })}
              className={buttonClasses("ghost", "sm")}
              aria-label="Next month"
            >
              →
            </Link>
          ) : null}
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href={link({ month: null, from: null, to: null })}
            className="text-accent hover:underline"
          >
            This month
          </Link>
          <span className="text-ink-subtle">·</span>
          <Link
            href={link({ month: "all", from: null, to: null })}
            className="text-accent hover:underline"
          >
            All time
          </Link>
        </div>
      </div>

      {summary.data && summary.data.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {summary.data.map((s) => (
            <div
              key={s.currency_code}
              className="border-line bg-surface flex flex-wrap gap-x-5 gap-y-1 rounded-xl border px-4 py-3 text-sm"
            >
              <span className="font-semibold">{s.currency_code}</span>
              <span className="text-ink-muted">
                In{" "}
                <MoneyAmount
                  minor={s.income_minor}
                  currency={s.currency_code}
                  locale={regional.locale}
                  kind="income"
                />
              </span>
              <span className="text-ink-muted">
                Out{" "}
                <MoneyAmount
                  minor={s.expense_minor}
                  currency={s.currency_code}
                  locale={regional.locale}
                  className="text-ink"
                />
              </span>
              <span className="text-ink-muted">
                Net{" "}
                <MoneyAmount
                  minor={s.net_minor}
                  currency={s.currency_code}
                  locale={regional.locale}
                  className="text-ink"
                />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={
            q || kind || accountId || categoryId
              ? "No transactions match these filters"
              : "No transactions in this period"
          }
          description={
            accounts.length === 0
              ? "Add an account first, then record your income and expenses."
              : "Use “Add transaction” to record one. It works offline too."
          }
        />
      ) : (
        <Card>
          <ul aria-label="Transactions">
            {[...groups.entries()].map(([date, items]) => (
              <li key={date}>
                <p className="border-line bg-surface-muted/60 text-ink-muted sticky top-14 border-b px-5 py-1.5 text-xs font-medium backdrop-blur lg:top-0">
                  {formatDate(new Date(`${date}T00:00:00Z`), fmt)}
                </p>
                <ul className="divide-line divide-y">
                  {items.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/money/transactions/${t.id}`}
                        className="hover:bg-surface-muted/50 flex items-center justify-between gap-4 px-5 py-3.5 transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="text-ink block truncate text-sm font-medium">
                            {t.description ||
                              t.merchant ||
                              t.category_name ||
                              (t.kind === "transfer" ? "Transfer" : "Transaction")}
                          </span>
                          <span className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                            <span>
                              {t.account_name}
                              {t.kind === "transfer" ? ` → ${t.transfer_account_name}` : ""}
                            </span>
                            {t.category_name ? <span>· {t.category_name}</span> : null}
                            {t.kind === "transfer" ? <Badge>Transfer</Badge> : null}
                          </span>
                        </span>
                        <MoneyAmount
                          minor={t.amount_minor}
                          currency={t.currency_code}
                          locale={regional.locale}
                          kind={t.kind}
                          className="text-sm"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {total > PAGE_SIZE ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <ButtonLink href={link({ page: String(page - 1) })} variant="secondary" size="sm">
                Previous
              </ButtonLink>
            ) : null}
            {page * PAGE_SIZE < total ? (
              <ButtonLink href={link({ page: String(page + 1) })} variant="secondary" size="sm">
                Next
              </ButtonLink>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
