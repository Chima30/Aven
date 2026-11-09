"use client";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { parseMoney } from "@/lib/money/money";
import { isCurrencyCode } from "@/lib/money/currencies";
import { formatMinor } from "@/lib/finance/format";
import { budgetReduction, projectScenario } from "@/lib/intelligence/scenario";

export function WhatIfLab({
  currency,
  locale,
  balanceMinor,
  goals,
  budgets,
}: {
  currency: string;
  locale: string;
  balanceMinor: string | null;
  goals: { id: string; name: string; remainingMinor: string }[];
  budgets: { id: string; name: string; limitMinor: string }[];
}) {
  const [budgetId, setBudgetId] = useState("");
  const [cutPct, setCutPct] = useState("10");
  let budgetSaving = 0n;
  const [reserve, setReserve] = useState("");
  const [monthly, setMonthly] = useState("");
  const [additional, setAdditional] = useState("0");
  const [purchase, setPurchase] = useState("0");
  const [months, setMonths] = useState("12");
  const [goalId, setGoalId] = useState("");
  let result: ReturnType<typeof projectScenario> | null = null;
  let error = "";
  try {
    if (balanceMinor === null)
      throw new Error("Add an active account in this currency before projecting cash.");
    if (!isCurrencyCode(currency)) throw new Error("Unsupported currency.");
    if (!reserve.trim() || !monthly.trim())
      throw new Error(
        "Enter your obligations reserve and monthly saving assumption, including zero if appropriate.",
      );
    const budget = budgets.find((b) => b.id === budgetId);
    budgetSaving = budget ? budgetReduction(BigInt(budget.limitMinor), Number(cutPct)) : 0n;
    const goal = goals.find((g) => g.id === goalId);
    result = projectScenario({
      balanceMinor: BigInt(balanceMinor),
      reservedMinor: parseMoney(reserve, currency).amountMinor,
      monthlySavingMinor: parseMoney(monthly, currency).amountMinor,
      additionalMonthlyMinor: parseMoney(additional, currency).amountMinor + budgetSaving,
      purchaseMinor: parseMoney(purchase, currency).amountMinor,
      months: Number(months),
      goalRemainingMinor: goal ? BigInt(goal.remainingMinor) : null,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Check your assumptions.";
  }
  const fmt = (value: bigint) => formatMinor(value, currency, locale);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Your assumptions"
          description={`All amounts in ${currency}. Use a dot for decimals. Nothing is saved or applied.`}
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm">
            Recorded active-account balance:{" "}
            {balanceMinor === null ? "unavailable" : fmt(BigInt(balanceMinor))}. Pending offline
            changes are not included. Refresh after syncing.
          </p>
          {(
            [
              [
                "reserve",
                "Money reserved for upcoming obligations and your safety buffer",
                reserve,
                setReserve,
              ],
              ["monthly", "Baseline monthly surplus available to save", monthly, setMonthly],
              [
                "additional",
                "Other extra cash freed each month (exclude the selected budget cut)",
                additional,
                setAdditional,
              ],
              ["purchase", "One-off purchase paid now", purchase, setPurchase],
            ] as const
          ).map(([id, label, value, setValue]) => (
            <label key={id} htmlFor={`lab-${id}`} className="text-ink flex flex-col gap-1 text-sm">
              {label}
              <Input
                id={`lab-${id}`}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          ))}
          <label className="text-ink flex flex-col gap-1 text-sm" htmlFor="lab-budget">
            Budget to reduce (optional)
            <select
              id="lab-budget"
              className="border-line bg-canvas rounded-xl border p-3"
              value={budgetId}
              onChange={(e) => setBudgetId(e.target.value)}
            >
              <option value="">No budget change</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {budgetId ? (
            <label className="text-ink flex flex-col gap-1 text-sm" htmlFor="lab-budget-cut">
              Budget reduction percentage
              <Input
                id="lab-budget-cut"
                type="number"
                min="0"
                max="100"
                step="1"
                value={cutPct}
                onChange={(e) => setCutPct(e.target.value)}
              />
            </label>
          ) : null}
          <label className="text-ink flex flex-col gap-1 text-sm" htmlFor="lab-months">
            Projection months
            <Input
              id="lab-months"
              type="number"
              min="1"
              max="120"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </label>
          <label className="text-ink flex flex-col gap-1 text-sm" htmlFor="lab-goal">
            Goal (assume all monthly surplus goes here)
            <select
              id="lab-goal"
              className="border-line bg-canvas rounded-xl border p-3"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No goal selected</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </CardBody>
      </Card>
      <div className="flex flex-col gap-4">
        <Alert tone="info" title="Scenario, not a forecast">
          AVEN has no confirmed bill ledger. Enter all upcoming obligations in the reserve yourself.
          No interest, exchange rates, future bills or investment returns are assumed. Reallocating
          money into savings alone does not create extra cash.
        </Alert>
        {result ? (
          <Card>
            <CardHeader
              title="Before and after"
              description={`Estimated after ${months} months if your assumptions hold`}
            />
            <CardBody className="flex flex-col gap-3 text-sm">
              {budgetId ? (
                <p>
                  Potential monthly spending reduction from the selected budget: {fmt(budgetSaving)}
                  . This assumes actual spending falls by that amount; changing a budget limit alone
                  does not save money.
                </p>
              ) : null}
              <p>Available after reserve: {fmt(result.availableMinor)}</p>
              <p>Immediately after purchase: {fmt(result.afterPurchaseMinor)}</p>
              <p>Baseline projection: {fmt(result.beforeMinor)}</p>
              <p>Scenario projection: {fmt(result.afterMinor)}</p>
              <Alert
                tone={result.coversPurchase ? "info" : "warning"}
                title={
                  result.coversPurchase
                    ? "Purchase fits the entered reserve"
                    : "Purchase exceeds available cash"
                }
              >
                This assessment covers only the obligations you entered, not every real-world
                commitment.
              </Alert>
              {goalId ? (
                <p>
                  Goal funding:{" "}
                  {result.goalMonthsBefore === null
                    ? "no baseline completion with this saving rate"
                    : `${result.goalMonthsBefore} baseline months`}{" "}
                  →{" "}
                  {result.goalMonthsAfter === null
                    ? "no completion with this saving rate"
                    : `${result.goalMonthsAfter} scenario months`}
                  . Goal funds are not added to your account balance. The purchase does not change
                  recorded goal entries.
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : (
          <Alert tone="info" title="More information needed">
            {error}
          </Alert>
        )}
      </div>
    </div>
  );
}
