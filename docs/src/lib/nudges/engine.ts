import { isWithinWindow, minutesOfDayInZone, nextLocalTime, parseTimeOfDay } from "./time";
import {
  ESSENTIAL_CATEGORIES,
  type DeliveryDecision,
  type NudgeEvent,
  type NudgeSettings,
} from "./types";

/**
 * Deterministic delivery rules for the Nudge Center.
 *
 * These rules are the ONLY thing that decides whether and when a user is
 * notified. AI may later help write the wording of a Pulse Check, but it has
 * no input here: an AI-sourced event is treated exactly like a system event,
 * and can never claim to be user-scheduled.
 *
 * Order of rules:
 *   1. Essential categories (account security) are delivered in-app immediately.
 *   2. Category set to "off" → suppress.
 *   3. Non-essential nudges paused → suppress.
 *   4. In-app notifications disabled → suppress.
 *   5. Category set to a digest → bundle into that digest (or the other one).
 *   6. Immediate: quiet hours → defer until they end (unless the USER scheduled it).
 *   7. Immediate: daily limit reached → bundle into the daily digest.
 */
export function decideDelivery(
  event: NudgeEvent,
  settings: NudgeSettings,
  context: { now: Date; deliveredToday: number },
): DeliveryDecision {
  if (ESSENTIAL_CATEGORIES.has(event.category)) {
    return { action: "deliver_now" };
  }

  const frequency = settings.categoryFrequency[event.category] ?? "daily_digest";
  if (frequency === "off") return { action: "suppress", reason: "category_off" };
  if (settings.pauseNonessential) return { action: "suppress", reason: "paused" };
  if (!settings.inAppEnabled) return { action: "suppress", reason: "in_app_disabled" };

  if (frequency === "daily_digest" || frequency === "weekly_digest") {
    return bundle(
      settings,
      frequency === "daily_digest" ? "daily" : "weekly",
      "category_frequency",
    );
  }

  // frequency === "immediate"
  const userScheduled = event.source === "user" && event.userScheduled === true;
  if (settings.quietHoursEnabled && !userScheduled) {
    const start = parseTimeOfDay(settings.quietHoursStart);
    const end = parseTimeOfDay(settings.quietHoursEnd);
    const nowMinute = minutesOfDayInZone(context.now, settings.timeZone);
    if (isWithinWindow(nowMinute, start, end)) {
      return {
        action: "defer",
        until: nextLocalTime(context.now, settings.timeZone, end),
        reason: "quiet_hours",
      };
    }
  }

  if (context.deliveredToday >= settings.maxNudgesPerDay && !userScheduled) {
    if (settings.dailyDigestEnabled) {
      return { action: "bundle", digest: "daily", reason: "daily_limit_reached" };
    }
    return { action: "suppress", reason: "daily_limit_reached" };
  }

  return { action: "deliver_now" };
}

function bundle(
  settings: NudgeSettings,
  preferred: "daily" | "weekly",
  reason: "category_frequency",
): DeliveryDecision {
  const enabled = {
    daily: settings.dailyDigestEnabled,
    weekly: settings.weeklyDigestEnabled,
  };
  if (enabled[preferred]) return { action: "bundle", digest: preferred, reason };
  const other = preferred === "daily" ? "weekly" : "daily";
  if (enabled[other]) return { action: "bundle", digest: other, reason };
  return { action: "suppress", reason: "no_digest_enabled" };
}

/** Is the user currently inside their quiet hours? (Used for UI previews.) */
export function isQuietNow(settings: NudgeSettings, now: Date): boolean {
  if (!settings.quietHoursEnabled) return false;
  return isWithinWindow(
    minutesOfDayInZone(now, settings.timeZone),
    parseTimeOfDay(settings.quietHoursStart),
    parseTimeOfDay(settings.quietHoursEnd),
  );
}
