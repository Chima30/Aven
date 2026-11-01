import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expandEvents } from "@/lib/planning/recurrence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, NotificationCategory } from "@/lib/supabase/database.types";
import { addDays, localDate, startOfWeek, zonedToInstant } from "@/lib/time/zoned";
import { sendNudgeEmails } from "./email";
import { runScheduler, type SchedulerInput, type WeeklyWellbeing } from "./scheduler";
import type { NudgeSettings } from "./types";

/**
 * Runs the Nudge Center scheduler for every user (cron) or one user
 * (catch-up when they open the app). Uses the ADMIN client because it must
 * read many users' schedules; every query is filtered by the user being
 * processed, and the only writes are notifications (unique per dedupe key),
 * "processed" marks on events, and a scheduler_runs log row.
 *
 * Idempotent: running it twice in the same minute creates nothing new.
 */

type Admin = SupabaseClient<Database>;

const DEFAULT_PLANNING = {
  daily_review_enabled: true,
  daily_review_time: "20:30",
  weekly_review_enabled: true,
  weekly_review_day: 0,
  weekly_review_time: "18:00",
  weekly_finance_review: true,
};

export interface RunSummary {
  usersProcessed: number;
  notificationsCreated: number;
  released: number;
  errors: number;
}

export async function runNudgeScheduler(options: {
  source: "cron" | "github_actions" | "vercel_cron" | "manual" | "catch_up";
  userIds?: string[];
  now?: Date;
  deadlineMs?: number;
}): Promise<RunSummary> {
  const admin = createAdminClient();
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.deadlineMs ?? 50_000);
  const summary: RunSummary = {
    usersProcessed: 0,
    notificationsCreated: 0,
    released: 0,
    errors: 0,
  };

  const { data: run } = await admin
    .from("scheduler_runs")
    .insert({ trigger_source: options.source })
    .select("id")
    .single();

  // 1. Release notifications held for quiet hours whose time has come.
  {
    let q = admin
      .from("notifications")
      .update({ status: "delivered", delivered_at: now.toISOString() })
      .eq("status", "scheduled")
      .lte("scheduled_for", now.toISOString());
    if (options.userIds) q = q.in("user_id", options.userIds);
    const { data } = await q.select("id");
    summary.released = data?.length ?? 0;
  }

  // 2. Process users.
  const userIds = options.userIds ?? (await allUserIds(admin));
  let lastError: string | null = null;
  for (const userId of userIds) {
    if (Date.now() > deadline) break;
    try {
      summary.notificationsCreated += await processUser(admin, userId, now);
      summary.usersProcessed += 1;
    } catch (error) {
      summary.errors += 1;
      lastError = error instanceof Error ? error.message.slice(0, 300) : "error";
      console.error("[nudges] user processing failed:", lastError);
    }
  }

  if (run) {
    await admin
      .from("scheduler_runs")
      .update({
        finished_at: new Date().toISOString(),
        users_processed: summary.usersProcessed,
        notifications_created: summary.notificationsCreated + summary.released,
        error: lastError,
      })
      .eq("id", run.id);
  }
  return summary;
}

async function allUserIds(admin: Admin): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Could not list users");
    ids.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

/** Loads one user's schedule, runs the rules, stores notifications. Returns how many were created. */
export async function processUser(admin: Admin, userId: string, now: Date): Promise<number> {
  const [prefsR, notifR, catsR, planR, consentR] = await Promise.all([
    admin
      .from("user_preferences")
      .select("time_zone, week_start")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("notification_category_preferences")
      .select("category, frequency")
      .eq("user_id", userId),
    admin.from("planning_preferences").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("consent_state")
      .select("granted")
      .eq("user_id", userId)
      .eq("category", "wellbeing_data")
      .maybeSingle(),
  ]);
  const prefs = must(prefsR, "preferences");
  const notif = must(notifR, "notification preferences");
  if (!prefs || !notif) return 0;
  const tz = prefs.time_zone;
  const today = localDate(now, tz);
  const plan = must(planR, "planning preferences") ?? DEFAULT_PLANNING;
  const wellbeingAllowed = Boolean(must(consentR, "consent")?.granted);

  const settings: NudgeSettings = {
    inAppEnabled: notif.in_app_enabled,
    dailyDigestEnabled: notif.daily_digest_enabled,
    dailyDigestTime: notif.daily_digest_time,
    weeklyDigestEnabled: notif.weekly_digest_enabled,
    weeklyDigestDay: notif.weekly_digest_day,
    quietHoursEnabled: notif.quiet_hours_enabled,
    quietHoursStart: notif.quiet_hours_start,
    quietHoursEnd: notif.quiet_hours_end,
    pauseNonessential: notif.pause_nonessential,
    maxNudgesPerDay: notif.max_nudges_per_day,
    timeZone: tz,
    categoryFrequency: Object.fromEntries(
      (must(catsR, "categories") ?? []).map((c) => [c.category, c.frequency]),
    ) as NudgeSettings["categoryFrequency"],
  };

  const weekAgoIso = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const rangeFrom = addDays(today, -1);
  const rangeTo = addDays(today, 8);
  const startOfToday = zonedToInstant(today, 0, tz).toISOString();

  const [
    tasksR,
    doneR,
    eventsR,
    recurringR,
    exR,
    habitsR,
    checksR,
    reviewsR,
    finR,
    lifeR,
    deliveredR,
    lastSummaryR,
  ] = await Promise.all([
    admin
      .from("tasks")
      .select("id, title, status, priority, due_on, due_time, remind_at, completed_at")
      .eq("user_id", userId)
      .in("status", ["not_started", "in_progress"])
      .limit(500),
    admin
      .from("tasks")
      .select("id, title, status, priority, due_on, due_time, remind_at, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", weekAgoIso)
      .limit(500),
    admin
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .is("recurrence", null)
      .or(
        `and(starts_at.gte.${new Date(now.getTime() - 2 * 86_400_000).toISOString()},starts_at.lte.${new Date(now.getTime() + 9 * 86_400_000).toISOString()}),and(start_date.gte.${addDays(rangeFrom, -31)},start_date.lte.${rangeTo})`,
      )
      .limit(500),
    admin
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .not("recurrence", "is", null)
      .limit(500),
    admin
      .from("calendar_event_exceptions")
      .select("event_id, occurrence_date, cancelled, starts_at, ends_at, title")
      .eq("user_id", userId)
      .gte("occurrence_date", addDays(rangeFrom, -1))
      .lte("occurrence_date", rangeTo),
    admin
      .from("habits")
      .select("id, name, category, frequency, weekdays, start_on, end_on, reminder_time, time_zone")
      .eq("user_id", userId)
      .is("archived_at", null),
    admin
      .from("habit_check_ins")
      .select("habit_id, on_date, status")
      .eq("user_id", userId)
      .gte("on_date", addDays(today, -400)),
    admin
      .from("reviews")
      .select("kind, period_start")
      .eq("user_id", userId)
      .gte("period_start", addDays(today, -14)),
    admin
      .from("finance_events")
      .select("id, kind, payload")
      .eq("user_id", userId)
      .is("processed_at", null)
      .in("kind", ["budget_threshold_reached", "budget_exceeded", "savings_milestone_reached"])
      .limit(100),
    admin
      .from("life_events")
      .select("id, kind, payload")
      .eq("user_id", userId)
      .is("processed_at", null)
      .limit(200),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "delivered")
      .gte("delivered_at", startOfToday)
      .not("kind", "in", "(daily_summary,weekly_summary)"),
    admin
      .from("notifications")
      .select("created_at")
      .eq("user_id", userId)
      .eq("kind", "daily_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const events = [
    ...(must(eventsR, "events") ?? []),
    ...(must(recurringR, "recurring events") ?? []),
  ];
  const occurrences = expandEvents(events, must(exR, "exceptions") ?? [], {
    from: rangeFrom,
    to: rangeTo,
  });

  // Give finance events a readable name (budget or goal), looked up for THIS user only.
  const finEvents = must(finR, "finance events") ?? [];
  const budgetIds = finEvents
    .map((e) => (e.payload as { budget_id?: string }).budget_id)
    .filter((x): x is string => !!x);
  const goalIds = finEvents
    .map((e) => (e.payload as { goal_id?: string }).goal_id)
    .filter((x): x is string => !!x);
  const [budgetsR, goalsR] = await Promise.all([
    budgetIds.length
      ? admin.from("budgets").select("id, name").eq("user_id", userId).in("id", budgetIds)
      : Promise.resolve({ data: [], error: null }),
    goalIds.length
      ? admin.from("savings_goals").select("id, name").eq("user_id", userId).in("id", goalIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const names = new Map<string, string>([
    ...((budgetsR.data ?? []) as Array<{ id: string; name: string }>).map(
      (b) => [b.id, b.name] as const,
    ),
    ...((goalsR.data ?? []) as Array<{ id: string; name: string }>).map(
      (g) => [g.id, g.name] as const,
    ),
  ]);

  const lastSummaryAt =
    must(lastSummaryR, "last summary")?.created_at ??
    new Date(now.getTime() - 86_400_000).toISOString();
  const { data: bundled } = await admin
    .from("notifications")
    .select("title, digest")
    .eq("user_id", userId)
    .eq("status", "bundled")
    .gt("created_at", lastSummaryAt)
    .limit(50);

  let wellbeing: WeeklyWellbeing | null = null;
  if (wellbeingAllowed && notif.weekly_digest_enabled) {
    const from = addDays(today, -6);
    const [sleepR, waterR, actR, moodR, wpR] = await Promise.all([
      admin
        .from("sleep_logs")
        .select("duration_minutes")
        .eq("user_id", userId)
        .gte("wake_date", from),
      admin
        .from("water_logs")
        .select("local_date, amount_ml")
        .eq("user_id", userId)
        .gte("local_date", from),
      admin
        .from("activity_logs")
        .select("duration_minutes")
        .eq("user_id", userId)
        .gte("on_date", from),
      admin.from("mood_logs").select("id").eq("user_id", userId).gte("local_date", from),
      admin
        .from("wellbeing_preferences")
        .select("water_target_ml")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const sleeps = sleepR.data ?? [];
    const target = wpR.data?.water_target_ml ?? 2000;
    const water = new Map<string, number>();
    for (const w of waterR.data ?? [])
      water.set(w.local_date, (water.get(w.local_date) ?? 0) + w.amount_ml);
    wellbeing = {
      sleepNights: sleeps.length,
      sleepAvgMinutes: sleeps.length
        ? sleeps.reduce((s, x) => s + x.duration_minutes, 0) / sleeps.length
        : null,
      waterDaysOnTarget: [...water.values()].filter((v) => v >= target).length,
      activityMinutes: (actR.data ?? []).reduce((s, x) => s + x.duration_minutes, 0),
      checkIns: (moodR.data ?? []).length,
    };
  }

  const input: SchedulerInput = {
    now,
    timeZone: tz,
    weekStart: prefs.week_start,
    settings,
    planning: {
      dailyReviewEnabled: plan.daily_review_enabled,
      dailyReviewTime: plan.daily_review_time,
      weeklyReviewEnabled: plan.weekly_review_enabled,
      weeklyReviewDay: plan.weekly_review_day,
      weeklyReviewTime: plan.weekly_review_time,
      weeklyFinanceReview: plan.weekly_finance_review,
    },
    tasks: [...(must(tasksR, "tasks") ?? []), ...(must(doneR, "completed tasks") ?? [])],
    occurrences,
    habits: must(habitsR, "habits") ?? [],
    checkIns: must(checksR, "check-ins") ?? [],
    reviews: must(reviewsR, "reviews") ?? [],
    financeEvents: finEvents.map((e) => {
      const p = e.payload as Record<string, unknown>;
      const id = (p.budget_id ?? p.goal_id) as string | undefined;
      return { id: e.id, kind: e.kind, payload: { ...p, name: id ? names.get(id) : undefined } };
    }),
    lifeEvents: must(lifeR, "life events") ?? [],
    deliveredToday: deliveredR.count ?? 0,
    bundledSince: (bundled ?? [])
      .filter((b): b is { title: string; digest: "daily" | "weekly" } => b.digest !== null)
      .map((b) => ({ title: b.title, digest: b.digest })),
    wellbeing,
  };

  const out = runScheduler(input);
  let created = 0;
  if (out.notifications.length > 0) {
    const { data, error } = await admin
      .from("notifications")
      .upsert(
        out.notifications.map((n) => ({
          ...n,
          user_id: userId,
          category: n.category as NotificationCategory,
        })),
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(`notifications: ${error.message}`);
    created = data?.length ?? 0;
  }
  const processedAt = now.toISOString();
  if (out.processedFinanceEvents.length > 0) {
    await admin
      .from("finance_events")
      .update({ processed_at: processedAt })
      .eq("user_id", userId)
      .in("id", out.processedFinanceEvents);
  }
  if (out.processedLifeEvents.length > 0) {
    await admin
      .from("life_events")
      .update({ processed_at: processedAt })
      .eq("user_id", userId)
      .in("id", out.processedLifeEvents);
  }
  // 3. Email, only for users who turned it on (never blocks in-app delivery).
  if (notif.email_enabled) {
    try {
      await sendNudgeEmails(
        admin,
        userId,
        { email_enabled: true, email_mode: notif.email_mode === "all" ? "all" : "summaries" },
        now,
      );
    } catch (error) {
      console.error("[nudges] email step failed:", error instanceof Error ? error.name : "error");
    }
  }
  return created;
}

/** The current week's first day for a user (used by pages and summaries). */
export function weekStartFor(date: string, weekStart: number): string {
  return startOfWeek(date, weekStart);
}
