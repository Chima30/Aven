import { SectionNav, type SectionTab } from "@/components/ui/section-nav";

const TABS: SectionTab[] = [
  { href: "/money", label: "Overview", exact: true },
  { href: "/money/transactions", label: "Transactions" },
  { href: "/money/accounts", label: "Accounts" },
  { href: "/money/budgets", label: "Budgets" },
  { href: "/money/goals", label: "Savings goals" },
  { href: "/money/categories", label: "Categories" },
  { href: "/money/wallets", label: "Sui wallets" },
  { href: "/money/sync", label: "Sync" },
];

export function MoneyNav() {
  return <SectionNav label="Money" tabs={TABS} />;
}
