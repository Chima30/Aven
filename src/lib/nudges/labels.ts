import type { NotificationCategory, NotificationRow } from "@/lib/supabase/database.types";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  subscriptions: "Subscriptions",
  shared_expenses: "Shared expenses",
  budgets: "Budgets",
  savings: "Savings",
  routines: "Habits",
  wellbeing: "Wellbeing",
  planning: "Planning",
  account_security: "Account security",
  suggestions: "Suggestions",
};

/** Why a nudge was held back, in plain words. */
export function decisionLabel(
  n: Pick<NotificationRow, "status" | "decision_reason" | "digest" | "scheduled_for">,
): string | null {
  if (n.status === "delivered") return null;
  if (n.status === "scheduled") return "Waiting for your quiet hours to end";
  if (n.status === "bundled")
    return `Included in your ${n.digest === "weekly" ? "weekly" : "daily"} summary instead`;
  switch (n.decision_reason) {
    case "category_off":
      return "Not shown: you turned this category off";
    case "paused":
      return "Not shown: non-essential nudges were paused";
    case "in_app_disabled":
      return "Not shown: in-app notifications are off";
    case "daily_limit_reached":
      return "Not shown: your daily limit was reached";
    case "no_digest_enabled":
      return "Not shown: summaries are switched off";
    default:
      return "Not shown because of your notification settings";
  }
}
