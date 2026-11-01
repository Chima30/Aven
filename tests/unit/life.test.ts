import { describe, expect, it } from "vitest";
import { consecutiveMissed, habitHistory, habitStats, isScheduled } from "@/lib/planning/habits";
import { expandEvents, occursOnDay, seriesDates, type EventInput } from "@/lib/planning/recurrence";
import { buildDailySummary, runScheduler, type SchedulerInput } from "@/lib/nudges/scheduler";
import type { NudgeSettings } from "@/lib/nudges/types";
import {
  addDays,
  localDate,
  localMinutes,
  startOfWeek,
  weekday,
  zonedToInstant,
} from "@/lib/time/zoned";
import {
  distanceToMetres,
  formatDistance,
  formatWater,
  mlToUnit,
  sleepMinutes,
  waterToMl,
} from "@/lib/wellbeing/units";

describe("time zones", () => {
  it("converts local wall-clock times to instants", () => {
    expect(zonedToInstant("2026-11-01", 9 * 60, "Africa/Lagos").toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
    expect(zonedToInstant("2026-07-01", 9 * 60, "America/New_York").toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedToInstant("2026-12-01", 9 * 60, "America/New_York").toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("handles daylight-saving gaps and overlaps like Temporal 'compatible'", () => {
    // New York: 2026-03-08 02:30 doesn't exist → pushed to 03:30 EDT (07:30Z).
    expect(zonedToInstant("2026-03-08", 2 * 60 + 30, "America/New_York").toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
    // 2026-11-01 01:30 happens twice → the earlier (EDT, 05:30Z).
    expect(zonedToInstant("2026-11-01", 90, "America/New_York").toISOString()).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("knows local dates, weekdays and week starts", () => {
    const late = new Date("2026-10-31T23:30:00Z");
    expect(localDate(late, "Africa/Lagos")).toBe("2026-11-01");
    expect(localDate(late, "America/Los_Angeles")).toBe("2026-10-31");
    expect(localMinutes(late, "Africa/Lagos")).toBe(30);
    expect(weekday("2026-11-01")).toBe(0);
    expect(startOfWeek("2026-11-04", 1)).toBe("2026-11-02");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

const ev = (over: Partial<EventInput>): EventInput => ({
  id: "e1",
  title: "Standup",
  description: null,
  category: "work",
  all_day: false,
  starts_at: "2026-11-02T08:00:00Z", // 09:00 Lagos, a Monday
  ends_at: "2026-11-02T08:30:00Z",
  start_date: null,
  end_date: null,
  time_zone: "Africa/Lagos",
  recurrence: null,
  recurrence_interval: 1,
  recurrence_weekdays: null,
  recurrence_until: null,
  reminder_minutes: null,
  ...over,
});

describe("recurring events", () => {
  it("expands daily, weekly (chosen days, every N weeks), monthly and yearly series", () => {
    expect(
      seriesDates(ev({ recurrence: "daily", recurrence_interval: 2 }), "2026-11-02", "2026-11-09"),
    ).toEqual(["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08"]);
    expect(
      seriesDates(
        ev({ recurrence: "weekly", recurrence_weekdays: [1, 3] }),
        "2026-11-01",
        "2026-11-14",
      ),
    ).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
    expect(
      seriesDates(ev({ recurrence: "weekly", recurrence_interval: 2 }), "2026-11-01", "2026-11-30"),
    ).toEqual(["2026-11-02", "2026-11-16", "2026-11-30"]);
    // The 31st only exists in some months; it's skipped, never moved.
    expect(
      seriesDates(
        ev({
          starts_at: "2026-01-31T08:00:00Z",
          ends_at: "2026-01-31T09:00:00Z",
          recurrence: "monthly",
        }),
        "2026-01-01",
        "2026-05-31",
      ),
    ).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
    expect(
      seriesDates(
        ev({
          starts_at: "2024-02-29T08:00:00Z",
          ends_at: "2024-02-29T09:00:00Z",
          recurrence: "yearly",
        }),
        "2024-01-01",
        "2028-12-31",
      ),
    ).toEqual(["2024-02-29", "2028-02-29"]);
  });

  it("stops at the until date and starts no earlier than the first occurrence", () => {
    expect(
      seriesDates(
        ev({ recurrence: "daily", recurrence_until: "2026-11-04" }),
        "2026-10-01",
        "2026-11-30",
      ),
    ).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("keeps the wall-clock time across daylight saving and applies exceptions", () => {
    const ny = ev({
      starts_at: "2026-10-30T13:00:00Z", // 09:00 EDT
      ends_at: "2026-10-30T13:30:00Z",
      time_zone: "America/New_York",
      recurrence: "daily",
    });
    const occ = expandEvents(
      [ny],
      [
        {
          event_id: "e1",
          occurrence_date: "2026-10-31",
          cancelled: true,
          starts_at: null,
          ends_at: null,
          title: null,
        },
        {
          event_id: "e1",
          occurrence_date: "2026-11-03",
          cancelled: false,
          starts_at: "2026-11-03T16:00:00Z",
          ends_at: "2026-11-03T16:30:00Z",
          title: "Moved standup",
        },
      ],
      { from: "2026-10-30", to: "2026-11-03" },
    );
    expect(occ.map((o) => o.occurrenceDate)).toEqual([
      "2026-10-30",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(occ[0]!.start!.toISOString()).toBe("2026-10-30T13:00:00.000Z"); // 09:00 EDT
    expect(occ[1]!.start!.toISOString()).toBe("2026-11-01T14:00:00.000Z"); // 09:00 EST
    expect(occ[3]).toMatchObject({ title: "Moved standup", moved: true });
    // Occurrence keys are unique, so nothing is ever duplicated.
    expect(new Set(occ.map((o) => o.key)).size).toBe(occ.length);
  });

  it("shows multi-day and all-day events on every day they cover", () => {
    const trip = ev({
      all_day: true,
      starts_at: null,
      ends_at: null,
      start_date: "2026-11-05",
      end_date: "2026-11-07",
    });
    const [o] = expandEvents([trip], [], { from: "2026-11-06", to: "2026-11-06" });
    expect(o).toBeDefined();
    expect(occursOnDay(o!, "2026-11-07", "Africa/Lagos")).toBe(true);
    expect(occursOnDay(o!, "2026-11-08", "Africa/Lagos")).toBe(false);
  });
});

describe("habits", () => {
  const daily = {
    frequency: "daily" as const,
    weekdays: null,
    start_on: "2026-10-01",
    end_on: null,
  };
  const mwf = {
    frequency: "specific_days" as const,
    weekdays: [1, 3, 5],
    start_on: "2026-10-01",
    end_on: null,
  };
  const done = (dates: string[]) => dates.map((on_date) => ({ on_date, status: "done" as const }));

  it("schedules by weekday and active period", () => {
    expect(isScheduled(mwf, "2026-11-02")).toBe(true); // Monday
    expect(isScheduled(mwf, "2026-11-03")).toBe(false);
    expect(isScheduled(daily, "2026-09-30")).toBe(false);
  });

  it("counts streaks without breaking on today or rest days", () => {
    const today = "2026-11-05";
    const s = habitStats(daily, done(["2026-11-02", "2026-11-03", "2026-11-04"]), today);
    expect(s).toMatchObject({ currentStreak: 3, doneToday: false });
    const withRest = habitStats(
      daily,
      [
        ...done(["2026-11-02", "2026-11-04", "2026-11-05"]),
        { on_date: "2026-11-03", status: "skipped" },
      ],
      today,
    );
    expect(withRest.currentStreak).toBe(3);
    const broken = habitStats(daily, done(["2026-11-01", "2026-11-02", "2026-11-04"]), today);
    expect(broken.currentStreak).toBe(1);
    expect(broken.longestStreak).toBe(2);
  });

  it("only counts scheduled days for specific-day habits", () => {
    // Mon 2 Nov, Wed 4 Nov done; Tue/Thu not scheduled; Fri 6 Nov is today.
    const s = habitStats(mwf, done(["2026-11-02", "2026-11-04"]), "2026-11-06");
    expect(s.currentStreak).toBe(2);
    expect(consecutiveMissed(mwf, done(["2026-11-02", "2026-11-04"]), "2026-11-06")).toBe(0);
  });

  it("measures consistency and missed days over a window, gently", () => {
    const s = habitStats(daily, done(["2026-11-01", "2026-11-03"]), "2026-11-05", 5);
    // Window 1–5 Nov; 5th is today (not over): 1–4 scheduled, 2 done.
    expect(s).toMatchObject({ scheduledDays: 4, doneDays: 2, consistencyPct: 50 });
    expect(s.missedDays).toEqual(["2026-11-02", "2026-11-04"]);
    expect(consecutiveMissed(daily, [], "2026-10-05")).toBe(4);
    expect(
      habitHistory(daily, done(["2026-11-01"]), "2026-11-01", "2026-11-03", "2026-11-02").map(
        (d) => d.state,
      ),
    ).toEqual(["done", "pending", "future"]);
  });
});

describe("wellbeing units", () => {
  it("stores water in ml and converts for display", () => {
    expect(waterToMl(1.5, "l")).toBe(1500);
    expect(waterToMl(8, "fl_oz")).toBe(237);
    expect(mlToUnit(500, "fl_oz")).toBe(16.9);
    expect(formatWater(2250, "l")).toBe("2.25 L");
    expect(() => waterToMl(0, "ml")).toThrow();
  });

  it("stores distance in metres", () => {
    expect(distanceToMetres(5, "km")).toBe(5000);
    expect(distanceToMetres(3.1, "mi")).toBe(4989);
    expect(formatDistance(4989, "mi")).toBe("3.1 mi");
  });

  it("calculates sleep across midnight and daylight-saving changes", () => {
    expect(sleepMinutes(new Date("2026-10-31T22:30:00Z"), new Date("2026-11-01T06:15:00Z"))).toBe(
      465,
    );
    // New York, clocks go back at 02:00 on 1 Nov 2026: 23:00 → 07:00 local is 9 hours.
    const slept = zonedToInstant("2026-10-31", 23 * 60, "America/New_York");
    const woke = zonedToInstant("2026-11-01", 7 * 60, "America/New_York");
    expect(sleepMinutes(slept, woke)).toBe(540);
    expect(() => sleepMinutes(woke, slept)).toThrow();
  });
});

const settings: NudgeSettings = {
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
  timeZone: "Africa/Lagos",
  categoryFrequency: {
    planning: "immediate",
    routines: "immediate",
    budgets: "immediate",
    wellbeing: "daily_digest",
  },
};

function input(over: Partial<SchedulerInput> = {}): SchedulerInput {
  return {
    now: new Date("2026-11-04T09:30:00Z"), // 10:30 Lagos, Wednesday
    timeZone: "Africa/Lagos",
    weekStart: 1,
    settings,
    planning: {
      dailyReviewEnabled: true,
      dailyReviewTime: "20:30",
      weeklyReviewEnabled: true,
      weeklyReviewDay: 0,
      weeklyReviewTime: "18:00",
      weeklyFinanceReview: true,
    },
    tasks: [],
    occurrences: [],
    habits: [],
    checkIns: [],
    reviews: [],
    financeEvents: [],
    lifeEvents: [],
    deliveredToday: 0,
    bundledSince: [],
    wellbeing: null,
    ...over,
  };
}

const task = (over: object) => ({
  id: "t1",
  title: "Send invoice",
  status: "not_started" as const,
  priority: "medium" as const,
  due_on: null,
  due_time: null,
  remind_at: null,
  completed_at: null,
  ...over,
});

describe("Nudge Center scheduler", () => {
  it("sends a task reminder once its time has come, with a stable dedupe key", () => {
    const run = (now: string) => ({
      notifications: runScheduler(
        input({ now: new Date(now), tasks: [task({ remind_at: "2026-11-04T09:00:00Z" })] }),
      ).notifications.filter((n) => n.kind === "task_reminder"),
    });
    expect(run("2026-11-04T08:59:00Z").notifications).toEqual([]);
    const a = run("2026-11-04T09:05:00Z").notifications;
    const b = run("2026-11-04T09:20:00Z").notifications;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "task_reminder", status: "delivered" });
    expect(b[0]!.dedupe_key).toBe(a[0]!.dedupe_key); // the DB keeps only one
    // Completed tasks are never reminded.
    expect(
      runScheduler(
        input({ tasks: [task({ remind_at: "2026-11-04T09:00:00Z", status: "completed" })] }),
      ).notifications.filter((n) => n.kind === "task_reminder"),
    ).toEqual([]);
  });

  it("holds system nudges during quiet hours, but keeps reminders the user set", () => {
    const night = new Date("2026-11-04T22:30:00Z"); // 23:30 Lagos
    const due = runScheduler(
      input({ now: night, tasks: [task({ due_on: "2026-11-05", due_time: "01:00" })] }),
    ).notifications;
    expect(due[0]).toMatchObject({
      kind: "task_due",
      status: "scheduled",
      decision_reason: "quiet_hours",
    });
    expect(due[0]!.scheduled_for).toBe("2026-11-05T06:00:00.000Z"); // 07:00 Lagos
    const own = runScheduler(
      input({ now: night, tasks: [task({ remind_at: "2026-11-04T22:25:00Z" })] }),
    ).notifications;
    expect(own[0]).toMatchObject({ kind: "task_reminder", status: "delivered" });
  });

  it("respects category preferences, pause and the daily limit", () => {
    const t = [task({ remind_at: "2026-11-04T09:00:00Z" })];
    const off = runScheduler(
      input({ tasks: t, settings: { ...settings, categoryFrequency: { planning: "off" } } }),
    );
    expect(off.notifications[0]).toMatchObject({
      status: "suppressed",
      decision_reason: "category_off",
    });
    const paused = runScheduler(
      input({ tasks: t, settings: { ...settings, pauseNonessential: true } }),
    );
    expect(paused.notifications[0]).toMatchObject({
      status: "suppressed",
      decision_reason: "paused",
    });
    const digest = runScheduler(
      input({
        tasks: t,
        settings: { ...settings, categoryFrequency: { planning: "daily_digest" } },
      }),
    );
    expect(digest.notifications[0]).toMatchObject({ status: "bundled", digest: "daily" });
    const habits = [
      {
        id: "h1",
        name: "Read",
        category: "learning" as const,
        frequency: "daily" as const,
        weekdays: null,
        start_on: "2026-11-01",
        end_on: null,
        reminder_time: "10:00",
        time_zone: "Africa/Lagos",
      },
    ];
    const limited = runScheduler(input({ habits, deliveredToday: 3 }));
    // Habit reminders are user-scheduled, so the daily limit doesn't block them…
    expect(limited.notifications.find((n) => n.kind === "habit_reminder")?.status).toBe(
      "delivered",
    );
    // …but system nudges past the limit go into the daily summary.
    const limitedSystem = runScheduler(
      input({ deliveredToday: 3, tasks: [task({ due_on: "2026-11-04", due_time: "12:00" })] }),
    );
    expect(limitedSystem.notifications[0]).toMatchObject({
      status: "bundled",
      decision_reason: "daily_limit_reached",
    });
  });

  it("nudges gently after three missed scheduled days, at most once a week", () => {
    const habits = [
      {
        id: "h1",
        name: "Stretch",
        category: "fitness" as const,
        frequency: "daily" as const,
        weekdays: null,
        start_on: "2026-10-25",
        end_on: null,
        reminder_time: null,
        time_zone: "Africa/Lagos",
      },
    ];
    const out = runScheduler(input({ habits })).notifications;
    expect(out[0]).toMatchObject({
      kind: "habit_missed",
      category: "wellbeing",
      status: "bundled",
    });
    expect(out[0]!.body).toMatch(/No pressure/);
    expect(out[0]!.dedupe_key).toBe("habit_missed:h1:2026-11-02");
  });

  it("turns finance events into budget alerts and marks them processed", () => {
    const out = runScheduler(
      input({ financeEvents: [{ id: 7, kind: "budget_exceeded", payload: { name: "Food" } }] }),
    );
    expect(out.notifications[0]).toMatchObject({
      kind: "budget_exceeded",
      priority: "high",
      dedupe_key: "finance_event:7",
    });
    expect(out.processedFinanceEvents).toEqual([7]);
  });

  it("builds the daily summary only from real records, at the chosen time", () => {
    const occurrences = expandEvents(
      [
        ev({
          starts_at: "2026-11-04T13:00:00Z",
          ends_at: "2026-11-04T14:00:00Z",
          title: "Dentist",
        }),
      ],
      [],
      { from: "2026-11-04", to: "2026-11-04" },
    );
    const before = runScheduler(input({ now: new Date("2026-11-04T06:30:00Z"), occurrences }));
    expect(before.notifications.find((n) => n.kind === "daily_summary")).toBeUndefined();
    const at = runScheduler(
      input({
        now: new Date("2026-11-04T07:05:00Z"),
        occurrences,
        tasks: [
          task({ due_on: "2026-11-04" }),
          task({ id: "t2", title: "Old", due_on: "2026-11-01" }),
        ],
      }),
    );
    const summary = at.notifications.find((n) => n.kind === "daily_summary")!;
    expect(summary).toMatchObject({
      title: "Your day in AVEN",
      dedupe_key: "daily_summary:2026-11-04",
    });
    expect(summary.body).toContain("1 task due today: Send invoice");
    expect(summary.body).toContain("1 overdue task");
    expect(summary.body).toContain("14:00 Dentist");
    // Nothing real to report → no summary at all (nothing is invented).
    expect(
      buildDailySummary(
        input({ planning: { ...input().planning, dailyReviewEnabled: false } }),
        [],
      ),
    ).toBeNull();
  });

  it("is deterministic", () => {
    const i = input({ tasks: [task({ remind_at: "2026-11-04T09:00:00Z" })] });
    expect(runScheduler(i)).toEqual(runScheduler(i));
  });
});
