import type { NotificationCategory, NotificationFrequency } from "@/lib/supabase/database.types";

export type { NotificationCategory, NotificationFrequency };

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "subscriptions",
  "shared_expenses",
  "budgets",
  "savings",
  "routines",
  "wellbeing",
  "planning",
  "account_security",
  "suggestions",
];

/** Categories that can never be switched off or paused. */
export const ESSENTIAL_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "account_security",
]);

/** An event that MIGHT become a nudge. Produced by deterministic app rules. */
export interface NudgeEvent {
  id: string;
  category: NotificationCategory;
  /** Who created it. AI-created events can never bypass quiet hours or limits. */
  source: "system" | "user" | "ai";
  /**
   * True only for reminders the user explicitly scheduled for a specific time
   * ("remind me at 23:00"). Ignored unless source === "user".
   */
  userScheduled?: boolean;
  occurredAt: Date;
}

export interface NudgeSettings {
  inAppEnabled: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  pauseNonessential: boolean;
  maxNudgesPerDay: number;
  timeZone: string;
  categoryFrequency: Partial<Record<NotificationCategory, NotificationFrequency>>;
}

export type DeliveryDecision =
  | { action: "deliver_now" }
  | { action: "defer"; until: Date; reason: "quiet_hours" }
  | { action: "bundle"; digest: "daily" | "weekly"; reason: BundleReason }
  | { action: "suppress"; reason: SuppressReason };

export type BundleReason = "category_frequency" | "daily_limit_reached";
export type SuppressReason =
  "category_off" | "paused" | "in_app_disabled" | "no_digest_enabled" | "daily_limit_reached";
