import type { AccountType, GoalStatus, TransactionKind } from "@/lib/supabase/database.types";

/** Largest single stored amount, in minor units. Matches private.max_amount_minor(). */
export const MAX_AMOUNT_MINOR = 9_000_000_000_000_000n;

export const ACCOUNT_TYPES: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank account" },
  { value: "savings", label: "Savings account" },
  { value: "credit_card", label: "Credit card" },
  { value: "digital_wallet", label: "Digital wallet" },
  { value: "other", label: "Other" },
];

export const ACCOUNT_TYPE_LABEL = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label]),
) as Record<AccountType, string>;

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};
