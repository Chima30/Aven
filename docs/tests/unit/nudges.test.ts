import { describe, expect, it } from "vitest";
import { decideDelivery, isQuietNow } from "@/lib/nudges/engine";
import {
  isWithinWindow,
  minutesOfDayInZone,
  nextLocalTime,
  parseTimeOfDay,
} from "@/lib/nudges/time";
import type { NudgeEvent, NudgeSettings } from "@/lib/nudges/types";

const settings = (overrides: Partial<NudgeSettings> = {}): NudgeSettings => ({
  inAppEnabled: true,
  dailyDigestEnabled: true,
  dailyDigestTime: "08:00",
  weeklyDigestEnabled: true,
  weeklyDigestDay: 0,
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  pauseNonessential: false,
  maxNudgesPerDay: 3,
  timeZone: "Africa/Lagos", // UTC+1, no DST
  categoryFrequency: {
    subscriptions: "immediate",
    budgets: "daily_digest",
    savings: "weekly_digest",
  },
  ...overrides,
});

const event = (overrides: Partial<NudgeEvent> = {}): NudgeEvent => ({
  id: "e1",
  category: "subscriptions",
  source: "system",
  occurredAt: new Date(),
  ...overrides,
});

// 14:00 in Lagos = 13:00 UTC; 23:30 in Lagos = 22:30 UTC.
const afternoon = new Date("2026-11-02T13:00:00Z");
const lateNight = new Date("2026-11-02T22:30:00Z");

describe("time helpers", () => {
  it("parses Postgres time values", () => {
    expect(parseTimeOfDay("22:00")).toBe(1320);
    expect(parseTimeOfDay("07:30:00")).toBe(450);
    expect(() => parseTimeOfDay("25:00")).toThrow();
  });

  it("handles windows that cross midnight", () => {
    expect(isWithinWindow(23 * 60, 1320, 420)).toBe(true);
    expect(isWithinWindow(3 * 60, 1320, 420)).toBe(true);
    expect(isWithinWindow(12 * 60, 1320, 420)).toBe(false);
    expect(isWithinWindow(7 * 60, 1320, 420)).toBe(false); // end is exclusive
    expect(isWithinWindow(13 * 60, 12 * 60, 14 * 60)).toBe(true);
  });

  it("uses the user's time zone, not the server's", () => {
    expect(minutesOfDayInZone(lateNight, "Africa/Lagos")).toBe(23 * 60 + 30);
    expect(minutesOfDayInZone(lateNight, "Asia/Tokyo")).toBe(7 * 60 + 30);
  });

  it("finds the next local time, including across DST changes", () => {
    const next = nextLocalTime(lateNight, "Africa/Lagos", 7 * 60);
    expect(next.toISOString()).toBe("2026-11-03T06:00:00.000Z");
    // US DST ends on 2026-11-01 at 02:00 local. 07:00 that morning is EST (UTC-5).
    const ny = nextLocalTime(new Date("2026-11-01T03:00:00Z"), "America/New_York", 7 * 60);
    expect(ny.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
});

describe("decideDelivery", () => {
  it("delivers an immediate nudge during the day", () => {
    expect(decideDelivery(event(), settings(), { now: afternoon, deliveredToday: 0 })).toEqual({
      action: "deliver_now",
    });
  });

  it("defers immediate nudges until quiet hours end", () => {
    const decision = decideDelivery(event(), settings(), { now: lateNight, deliveredToday: 0 });
    expect(decision).toMatchObject({ action: "defer", reason: "quiet_hours" });
    if (decision.action === "defer")
      expect(decision.until.toISOString()).toBe("2026-11-03T06:00:00.000Z");
  });

  it("never lets an AI-created event bypass quiet hours, even if it claims to be user-scheduled", () => {
    const decision = decideDelivery(event({ source: "ai", userScheduled: true }), settings(), {
      now: lateNight,
      deliveredToday: 0,
    });
    expect(decision.action).toBe("defer");
  });

  it("never lets an AI-created event bypass the daily limit", () => {
    const decision = decideDelivery(event({ source: "ai", userScheduled: true }), settings(), {
      now: afternoon,
      deliveredToday: 3,
    });
    expect(decision).toEqual({ action: "bundle", digest: "daily", reason: "daily_limit_reached" });
  });

  it("delivers reminders the user explicitly scheduled, even in quiet hours", () => {
    const decision = decideDelivery(event({ source: "user", userScheduled: true }), settings(), {
      now: lateNight,
      deliveredToday: 10,
    });
    expect(decision).toEqual({ action: "deliver_now" });
  });

  it("bundles digest categories", () => {
    expect(
      decideDelivery(event({ category: "budgets" }), settings(), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "bundle", digest: "daily", reason: "category_frequency" });
    expect(
      decideDelivery(event({ category: "savings" }), settings(), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "bundle", digest: "weekly", reason: "category_frequency" });
  });

  it("falls back to the other digest, or suppresses when no digest is enabled", () => {
    expect(
      decideDelivery(event({ category: "budgets" }), settings({ dailyDigestEnabled: false }), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toMatchObject({ action: "bundle", digest: "weekly" });
    expect(
      decideDelivery(
        event({ category: "budgets" }),
        settings({ dailyDigestEnabled: false, weeklyDigestEnabled: false }),
        { now: afternoon, deliveredToday: 0 },
      ),
    ).toEqual({ action: "suppress", reason: "no_digest_enabled" });
  });

  it("respects categories that are switched off", () => {
    expect(
      decideDelivery(event(), settings({ categoryFrequency: { subscriptions: "off" } }), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "suppress", reason: "category_off" });
  });

  it("respects the pause switch for non-essential nudges", () => {
    expect(
      decideDelivery(event(), settings({ pauseNonessential: true }), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "suppress", reason: "paused" });
  });

  it("always delivers account security notices", () => {
    const decision = decideDelivery(
      event({ category: "account_security" }),
      settings({ pauseNonessential: true, inAppEnabled: false }),
      { now: lateNight, deliveredToday: 99 },
    );
    expect(decision).toEqual({ action: "deliver_now" });
  });

  it("suppresses when in-app notifications are disabled", () => {
    expect(
      decideDelivery(event(), settings({ inAppEnabled: false }), {
        now: afternoon,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "suppress", reason: "in_app_disabled" });
  });

  it("delivers immediately during quiet hours when quiet hours are off", () => {
    expect(
      decideDelivery(event(), settings({ quietHoursEnabled: false }), {
        now: lateNight,
        deliveredToday: 0,
      }),
    ).toEqual({ action: "deliver_now" });
  });

  it("reports quiet status for previews", () => {
    expect(isQuietNow(settings(), lateNight)).toBe(true);
    expect(isQuietNow(settings(), afternoon)).toBe(false);
  });
});
