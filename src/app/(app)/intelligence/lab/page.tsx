import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { WhatIfLab } from "@/components/intelligence/what-if-lab";
import { loadFinanceBasics, balancesByCurrency } from "@/lib/finance/queries";
import { goalsForScenario } from "@/lib/intelligence/scenario";
import { fetchAllPages } from "@/lib/supabase/paging";
export const metadata: Metadata = { title: "What-if Lab" };
export default async function LabPage() {
  const { accounts, supabase, regional } = await loadFinanceBasics();
  const [goals, progress, budgets] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("savings_goals")
        .select("id, name, currency_code, target_minor, status")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("savings_goal_progress")
        .select("goal_id, saved_minor")
        .order("goal_id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("budgets")
        .select("id, name, currency_code, limit_minor, starts_on, archived_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (
    goals.error ||
    progress.error ||
    budgets.error ||
    goals.truncated ||
    progress.truncated ||
    budgets.truncated
  )
    throw new Error("Scenario inputs could not be loaded completely. Please try again.");
  const saved = new Map(progress.data.map((g) => [g.goal_id, g.saved_minor]));
  const balance = balancesByCurrency(accounts).find((b) => b.currency === regional.defaultCurrency);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What-if Lab"
        description="Try a purchase or a savings change before making a real decision."
      />
      <WhatIfLab
        currency={regional.defaultCurrency}
        locale={regional.locale}
        balanceMinor={balance?.totalMinor ?? null}
        goals={goalsForScenario(
          goals.data.map((g) => ({
            id: g.id,
            name: g.name,
            currency: g.currency_code,
            targetMinor: g.target_minor,
            savedMinor: saved.get(g.id) ?? "0",
            status: g.status,
          })),
          regional.defaultCurrency,
        )}
        budgets={budgets.data
          .filter(
            (b) =>
              b.currency_code === regional.defaultCurrency &&
              b.archived_at === null &&
              b.starts_on <= regional.today,
          )
          .map((b) => ({ id: b.id, name: b.name, limitMinor: String(b.limit_minor) }))}
      />
    </div>
  );
}
