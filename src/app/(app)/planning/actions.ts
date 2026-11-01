"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { lifeMemoryState, rememberInBackground } from "@/lib/life/memory";
import { reviewReflectionCandidate } from "@/lib/life/memory-candidates";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import {
  lifeContext,
  optStr,
  intOrNull,
  runLife,
  SESSION_EXPIRED,
  str,
  versionOf,
} from "@/lib/life/action-helpers";
import { isIsoDate, timeToMinutes, zonedToInstant } from "@/lib/time/zoned";

/*
 * Planning Server Actions. Every write goes through apply_life_mutation()
 * with the user's own session (see src/lib/life/action-helpers.ts). Times the
 * user types are interpreted in THEIR time zone, never the server's.
 */

const PLANNING_PATHS = [
  "/planning",
  "/planning/tasks",
  "/planning/calendar",
  "/planning/habits",
  "/planning/reviews",
];

function localInstant(date: string, time: string, timeZone: string): string | null {
  if (!isIsoDate(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return zonedToInstant(date, timeToMinutes(time), timeZone).toISOString();
}

/* ------------------------------------------------------------------ Tasks */

export async function saveTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const id = optStr(formData, "id");
  const values = Object.fromEntries(
    [
      "title",
      "description",
      "priority",
      "status",
      "category_id",
      "due_on",
      "due_time",
      "remind_on",
      "remind_time",
    ].map((k) => [k, str(formData, k)]),
  );
  const remindOn = str(formData, "remind_on");
  const remindTime = str(formData, "remind_time");
  let remindAt: string | null = null;
  if (remindOn || remindTime) {
    remindAt = localInstant(
      remindOn || values.due_on || ctx.today,
      remindTime || "09:00",
      ctx.timeZone,
    );
    if (!remindAt)
      return {
        status: "error",
        fieldErrors: { remind_on: "Choose a valid reminder date and time." },
        values,
      };
  }
  const payload = {
    title: values.title,
    description: optStr(formData, "description"),
    priority: values.priority || "medium",
    status: values.status || "not_started",
    category_id: optStr(formData, "category_id"),
    due_on: optStr(formData, "due_on"),
    due_time: values.due_on ? optStr(formData, "due_time") : null,
    remind_at: remindAt,
  };
  return runLife(ctx, {
    entity: "task",
    operation: id ? "update" : "create",
    recordId: id ?? undefined,
    baseVersion: id ? versionOf(formData) : null,
    payload,
    successMessage: id ? "Task updated." : "Task added.",
    revalidate: PLANNING_PATHS,
    values,
  });
}

export async function setTaskStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const status = z
    .enum(["not_started", "in_progress", "completed", "cancelled"])
    .safeParse(str(formData, "status"));
  if (!status.success) return { status: "error", message: "Unknown status." };
  return runLife(ctx, {
    entity: "task",
    operation: "update",
    recordId: str(formData, "id"),
    baseVersion: versionOf(formData),
    payload: { status: status.data },
    partial: true,
    successMessage: status.data === "completed" ? "Done — nice work." : "Task updated.",
    revalidate: PLANNING_PATHS,
  });
}

export async function deleteTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  return runLife(ctx, {
    entity: "task",
    operation: "delete",
    recordId: str(formData, "id"),
    baseVersion: versionOf(formData),
    payload: {},
    successMessage: "Task deleted.",
    revalidate: PLANNING_PATHS,
  });
}

export async function saveTaskCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const id = optStr(formData, "id");
  const archive = str(formData, "archive");
  if (id && archive) {
    return runLife(ctx, {
      entity: "task_category",
      operation: "update",
      recordId: id,
      baseVersion: versionOf(formData),
      payload: { archived: archive === "true" },
      successMessage: archive === "true" ? "Category archived." : "Category restored.",
      revalidate: PLANNING_PATHS,
      partial: true,
    });
  }
  const result = await runLife(ctx, {
    entity: "task_category",
    operation: id ? "update" : "create",
    recordId: id ?? undefined,
    baseVersion: id ? versionOf(formData) : null,
    payload: { name: str(formData, "name") },
    successMessage: id ? "Category renamed." : "Category added.",
    revalidate: PLANNING_PATHS,
    values: { name: str(formData, "name") },
  });
  if (result.message?.startsWith("That already exists")) {
    return {
      status: "error",
      fieldErrors: { name: "You already have a category with that name." },
    };
  }
  return result;
}

/* ----------------------------------------------------------------- Events */

const REMINDERS = new Set(["", "0", "5", "10", "15", "30", "60", "120", "1440"]);

export async function saveEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const id = optStr(formData, "id");
  const values = Object.fromEntries(
    [
      "title",
      "description",
      "category",
      "date",
      "end_date",
      "start_time",
      "end_time",
      "recurrence",
      "recurrence_interval",
      "recurrence_until",
      "reminder",
    ].map((k) => [k, str(formData, k)]),
  );
  const allDay = formData.get("all_day") === "on";
  const date = values.date ?? "";
  if (!isIsoDate(date)) return { status: "error", fieldErrors: { date: "Choose a date." }, values };
  const endDate = values.end_date && isIsoDate(values.end_date) ? values.end_date : date;
  let timing: Record<string, unknown>;
  if (allDay) {
    timing = { all_day: true, start_date: date, end_date: endDate, starts_at: null, ends_at: null };
  } else {
    const startsAt = localInstant(date, values.start_time || "", ctx.timeZone);
    const endsAt = localInstant(endDate, values.end_time || "", ctx.timeZone);
    if (!startsAt)
      return { status: "error", fieldErrors: { start_time: "Choose a start time." }, values };
    if (!endsAt)
      return { status: "error", fieldErrors: { end_time: "Choose an end time." }, values };
    if (Date.parse(endsAt) < Date.parse(startsAt)) {
      return {
        status: "error",
        fieldErrors: { end_time: "The event ends before it starts." },
        values,
      };
    }
    timing = {
      all_day: false,
      starts_at: startsAt,
      ends_at: endsAt,
      start_date: null,
      end_date: null,
    };
  }
  const recurrence = values.recurrence || null;
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => formData.get(`wd${d}`) === "on");
  if (!REMINDERS.has(values.reminder ?? ""))
    return { status: "error", fieldErrors: { reminder: "Choose a reminder." }, values };
  const payload = {
    title: values.title,
    description: optStr(formData, "description"),
    category: values.category || "personal",
    ...timing,
    time_zone: ctx.timeZone,
    recurrence,
    recurrence_interval: recurrence
      ? Math.max(1, intOrNull(formData, "recurrence_interval") ?? 1)
      : 1,
    recurrence_weekdays: recurrence === "weekly" && weekdays.length > 0 ? weekdays : null,
    recurrence_until: recurrence ? optStr(formData, "recurrence_until") : null,
    reminder_minutes: values.reminder ? Number(values.reminder) : null,
  };
  return runLife(ctx, {
    entity: "calendar_event",
    operation: id ? "update" : "create",
    recordId: id ?? undefined,
    baseVersion: id ? versionOf(formData) : null,
    payload,
    successMessage: id ? "Event updated." : "Event added.",
    revalidate: PLANNING_PATHS,
    values,
  });
}

export async function deleteEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  return runLife(ctx, {
    entity: "calendar_event",
    operation: "delete",
    recordId: str(formData, "id"),
    baseVersion: versionOf(formData),
    payload: {},
    successMessage: "Event deleted.",
    revalidate: PLANNING_PATHS,
  });
}

/** Cancel one occurrence of a recurring event (the rest of the series stays). */
export async function cancelOccurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const date = str(formData, "occurrence_date");
  if (!isIsoDate(date)) return { status: "error", message: "Unknown occurrence." };
  return runLife(ctx, {
    entity: "calendar_event_exception",
    operation: "create",
    payload: { event_id: str(formData, "event_id"), occurrence_date: date, cancelled: true },
    successMessage: "This occurrence was removed. The rest of the series is unchanged.",
    revalidate: PLANNING_PATHS,
  });
}

/* ----------------------------------------------------------------- Habits */

export async function saveHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const id = optStr(formData, "id");
  const values = Object.fromEntries(
    ["name", "description", "category", "frequency", "start_on", "end_on", "reminder_time"].map(
      (k) => [k, str(formData, k)],
    ),
  );
  const frequency = values.frequency === "specific_days" ? "specific_days" : "daily";
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => formData.get(`wd${d}`) === "on");
  return runLife(ctx, {
    entity: "habit",
    operation: id ? "update" : "create",
    recordId: id ?? undefined,
    baseVersion: id ? versionOf(formData) : null,
    payload: {
      name: values.name,
      description: optStr(formData, "description"),
      category: values.category || "routine",
      frequency,
      weekdays: frequency === "specific_days" ? weekdays : null,
      start_on: values.start_on || ctx.today,
      end_on: optStr(formData, "end_on"),
      reminder_time: optStr(formData, "reminder_time"),
      time_zone: ctx.timeZone,
    },
    successMessage: id ? "Habit updated." : "Habit added.",
    revalidate: PLANNING_PATHS,
    values,
  });
}

export async function archiveHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const archived = str(formData, "archived") === "true";
  return runLife(ctx, {
    entity: "habit",
    operation: "update",
    recordId: str(formData, "id"),
    baseVersion: versionOf(formData),
    payload: { archived },
    partial: true,
    successMessage: archived ? "Habit archived. Its history is kept." : "Habit restored.",
    revalidate: PLANNING_PATHS,
  });
}

/* ---------------------------------------------------------------- Reviews */

export async function saveReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const id = optStr(formData, "id");
  const values = Object.fromEntries(
    ["highlights", "missed", "next_focus", "notes", "rating"].map((k) => [k, str(formData, k)]),
  );
  const kind = str(formData, "kind") === "weekly" ? "weekly" : "daily";
  const rating = intOrNull(formData, "rating");
  const result = await runLife(ctx, {
    entity: "review",
    operation: id ? "update" : "create",
    recordId: id ?? undefined,
    baseVersion: id ? versionOf(formData) : null,
    payload: {
      kind,
      period_start: str(formData, "period_start"),
      highlights: optStr(formData, "highlights"),
      missed: optStr(formData, "missed"),
      next_focus: optStr(formData, "next_focus"),
      notes: optStr(formData, "notes"),
      rating,
    },
    successMessage: "Review saved privately.",
    revalidate: PLANNING_PATHS,
    values,
  });
  // Opt-in, per review: only the "next focus" answer becomes a memory, and
  // only with the planning-memory consent (the policy gate checks again).
  const focus = optStr(formData, "next_focus");
  if (result.status === "success" && formData.get("remember_focus") === "on" && focus) {
    const state = await lifeMemoryState(ctx.supabase, ctx.userId, "memory_planning");
    const write = rememberInBackground(state, ctx.userId, [
      reviewReflectionCandidate(kind, str(formData, "period_start"), focus),
    ]);
    if (write) {
      after(write);
      return { ...result, message: "Review saved. Your focus is being saved to Walrus Memory." };
    }
    return {
      ...result,
      message:
        state.state === "no_consent"
          ? "Review saved. To remember the focus, allow “Remember planning preferences” in Settings → Privacy."
          : "Review saved. Memory isn't available right now, so the focus wasn't remembered.",
    };
  }
  return result;
}

const planningPrefsSchema = z.object({
  daily_review_enabled: z.boolean(),
  daily_review_time: z.string().regex(/^\d{2}:\d{2}$/),
  weekly_review_enabled: z.boolean(),
  weekly_review_day: z.coerce.number().int().min(0).max(6),
  weekly_review_time: z.string().regex(/^\d{2}:\d{2}$/),
  weekly_finance_review: z.boolean(),
});

export async function savePlanningPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = planningPrefsSchema.safeParse({
    daily_review_enabled: formData.get("daily_review_enabled") === "on",
    daily_review_time: str(formData, "daily_review_time"),
    weekly_review_enabled: formData.get("weekly_review_enabled") === "on",
    weekly_review_day: str(formData, "weekly_review_day"),
    weekly_review_time: str(formData, "weekly_review_time"),
    weekly_finance_review: formData.get("weekly_finance_review") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Check the review times." };
  const { error } = await ctx.supabase
    .from("planning_preferences")
    .upsert({ user_id: ctx.userId, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { status: "error", message: "Your review schedule couldn't be saved." };
  revalidatePath("/planning/reviews");
  revalidatePath("/planning");
  return { status: "success", message: "Review schedule saved." };
}
