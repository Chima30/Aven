import "server-only";
import { cache } from "react";
import { getAppContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  AccountType,
  CategoryKind,
  DateFormatPreference,
  NumberFormatPreference,
} from "@/lib/supabase/database.types";
import { decimalSeparatorFor } from "./amount-input";
import { localToday } from "./periods";

/** Serializable shapes passed from Server to Client Components (no bigint). */
export interface AccountView {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  archived: boolean;
  version: number;
  openingMinor: string;
  description: string | null;
  balanceMinor: string;
  transactionCount: number;
  lastActivityOn: string | null;
  createdAt: string;
}

export interface CategoryView {
  id: string;
  kind: CategoryKind;
  name: string;
  archived: boolean;
  isDefault: boolean;
  version: number;
}

export interface FinanceRegional {
  locale: string;
  timeZone: string;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
  decimal: "." | ",";
  today: string;
  defaultCurrency: string;
}

export const loadFinanceBasics = cache(async () => {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const [accounts, balances, categories] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select("*")
      .order("archived_at", { nullsFirst: true })
      .order("name"),
    supabase.from("account_balances").select("*"),
    supabase.from("transaction_categories").select("*").order("name"),
  ]);
  if (accounts.error || balances.error || categories.error) {
    throw new Error(
      "Your money data could not be loaded. If you've just upgraded, check that the Stage 2 database upgrade has been run (docs/SUPABASE_SETUP.md).",
    );
  }
  const byAccount = new Map((balances.data ?? []).map((b) => [b.account_id, b]));
  const accountViews: AccountView[] = (accounts.data ?? []).map((a) => {
    const b = byAccount.get(a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.account_type,
      currency: a.currency_code,
      archived: a.archived_at !== null,
      version: a.version,
      openingMinor: String(a.opening_balance_minor),
      description: a.description,
      balanceMinor: b?.balance_minor ?? String(a.opening_balance_minor),
      transactionCount: b?.transaction_count ?? 0,
      lastActivityOn: b?.last_activity_on ?? null,
      createdAt: a.created_at,
    };
  });
  const categoryViews: CategoryView[] = (categories.data ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    archived: c.archived_at !== null,
    isDefault: c.is_default,
    version: c.version,
  }));
  const regional: FinanceRegional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
    decimal: decimalSeparatorFor(preferences.locale, preferences.number_format),
    today: localToday(preferences.time_zone),
    defaultCurrency: preferences.currency_code,
  };
  return { user, supabase, accounts: accountViews, categories: categoryViews, regional };
});

/** Sum balances of active accounts per currency (never across currencies). */
export function balancesByCurrency(
  accounts: AccountView[],
): Array<{ currency: string; totalMinor: string; count: number }> {
  const totals = new Map<string, { total: bigint; count: number }>();
  for (const a of accounts) {
    if (a.archived) continue;
    const t = totals.get(a.currency) ?? { total: 0n, count: 0 };
    t.total += BigInt(a.balanceMinor);
    t.count += 1;
    totals.set(a.currency, t);
  }
  return [...totals.entries()]
    .map(([currency, t]) => ({ currency, totalMinor: t.total.toString(), count: t.count }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
