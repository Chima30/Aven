import { FinanceCacheWriter } from "@/components/finance/finance-cache-writer";
import { MoneyNav } from "@/components/finance/money-nav";
import { loadFinanceBasics } from "@/lib/finance/queries";

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const { user, accounts, categories, regional } = await loadFinanceBasics();
  return (
    <div className="flex flex-col gap-8">
      <FinanceCacheWriter
        userId={user.id}
        data={{
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            currency: a.currency,
            archived: a.archived,
          })),
          categories: categories.map((c) => ({
            id: c.id,
            kind: c.kind,
            name: c.name,
            archived: c.archived,
          })),
          decimal: regional.decimal,
          locale: regional.locale,
          defaultCurrency: regional.defaultCurrency,
        }}
      />
      <MoneyNav />
      {children}
    </div>
  );
}
