import { z } from "zod";
import type { LifeEntity } from "@/lib/supabase/database.types";
import { isIsoDate, isValidTimeZoneName } from "@/lib/time/zoned";

/**
 * Wire-format schemas for Planning and Wellbeing mutations. The same schemas
 * validate Server Action input and offline entries arriving at /api/sync; the
 * database (apply_life_mutation + CHECK constraints + triggers) validates again.
 */

const uuid = z.uuid();
const isoDate = z.string().refine(isIsoDate, "Use a valid date.");
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a valid time.");
const instant = z.iso.datetime({ offset: true, message: "Use a valid date and time." });
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const rating = z.number().int().min(1).max(5).nullable().optional();
const timeZone = z.string().refine(isValidTimeZoneName, "Unknown time zone.");
const weekdays = z.array(z.number().int().min(0).max(6)).min(1).max(7);

export const taskCategoryPayload = z.object({ name: text(40).min(1, "Give the category a name.") });

export const taskPayload = z.object({
  title: text(200).min(1, "Give the task a title."),
  description: optText(2000),
  status: z.enum(["not_started", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  category_id: uuid.nullable().optional(),
  due_on: isoDate.nullable().optional(),
  due_time: timeOfDay.nullable().optional(),
  remind_at: instant.nullable().optional(),
});

export const calendarEventPayload = z
  .object({
    title: text(200).min(1, "Give the event a title."),
    description: optText(2000),
    category: z
      .enum(["personal", "work", "health", "finance", "social", "learning", "other"])
      .optional(),
    all_day: z.boolean(),
    starts_at: instant.nullable().optional(),
    ends_at: instant.nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
    time_zone: timeZone,
    recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
    recurrence_interval: z.number().int().min(1).max(99).optional(),
    recurrence_weekdays: weekdays.nullable().optional(),
    recurrence_until: isoDate.nullable().optional(),
    reminder_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.all_day) {
      if (!v.start_date || !v.end_date)
        ctx.addIssue({ code: "custom", message: "Choose the dates." });
      else if (v.end_date < v.start_date)
        ctx.addIssue({ code: "custom", message: "The end date is before the start." });
    } else if (!v.starts_at || !v.ends_at) {
      ctx.addIssue({ code: "custom", message: "Choose a start and end time." });
    } else if (Date.parse(v.ends_at) < Date.parse(v.starts_at)) {
      ctx.addIssue({ code: "custom", message: "The event ends before it starts." });
    }
  });

export const eventExceptionPayload = z.object({
  event_id: uuid,
  occurrence_date: isoDate,
  cancelled: z.boolean(),
  starts_at: instant.nullable().optional(),
  ends_at: instant.nullable().optional(),
  title: optText(200),
});

export const habitPayload = z
  .object({
    name: text(80).min(1, "Give the habit a name."),
    description: optText(500),
    category: z
      .enum([
        "health",
        "fitness",
        "mind",
        "learning",
        "finance",
        "sleep",
        "hydration",
        "routine",
        "other",
      ])
      .optional(),
    frequency: z.enum(["daily", "specific_days"]),
    weekdays: weekdays.nullable().optional(),
    start_on: isoDate,
    end_on: isoDate.nullable().optional(),
    reminder_time: timeOfDay.nullable().optional(),
    time_zone: timeZone,
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "specific_days" && !v.weekdays?.length) {
      ctx.addIssue({ code: "custom", message: "Choose at least one day." });
    }
    if (v.end_on && v.end_on < v.start_on)
      ctx.addIssue({ code: "custom", message: "The end date is before the start." });
  });

export const checkInPayload = z.object({
  habit_id: uuid,
  on_date: isoDate,
  status: z.enum(["done", "skipped"]).optional(),
  note: optText(300),
});

export const reviewPayload = z.object({
  kind: z.enum(["daily", "weekly"]),
  period_start: isoDate,
  highlights: optText(4000),
  missed: optText(4000),
  next_focus: optText(4000),
  notes: optText(8000),
  rating,
});

export const sleepPayload = z
  .object({
    slept_at: instant,
    woke_at: instant,
    wake_date: isoDate,
    quality: rating,
    note: optText(500),
  })
  .superRefine((v, ctx) => {
    const ms = Date.parse(v.woke_at) - Date.parse(v.slept_at);
    if (!(ms > 0)) ctx.addIssue({ code: "custom", message: "Wake-up must be after bedtime." });
    else if (ms > 20 * 3_600_000)
      ctx.addIssue({ code: "custom", message: "That's longer than 20 hours." });
  });

export const waterPayload = z.object({
  amount_ml: z
    .number()
    .int()
    .min(1, "Enter an amount.")
    .max(5000, "That's more than 5 litres at once."),
  logged_at: instant,
  local_date: isoDate,
});

export const mealPayload = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: text(300).min(1, "Describe the meal."),
  eaten_at: instant,
  local_date: isoDate,
  note: optText(500),
});

export const activityPayload = z.object({
  activity_type: z.enum([
    "walking",
    "running",
    "cycling",
    "gym",
    "swimming",
    "sports",
    "home_workout",
    "other",
  ]),
  duration_minutes: z.number().int().min(1, "Enter the duration.").max(1440),
  distance_m: z.number().int().min(0).max(1_000_000).nullable().optional(),
  intensity: z.enum(["light", "moderate", "vigorous"]).nullable().optional(),
  on_date: isoDate,
  note: optText(500),
});

export const moodPayload = z
  .object({
    logged_at: instant,
    local_date: isoDate,
    mood: rating,
    energy: rating,
    stress: rating,
    sleep_rating: rating,
    day_rating: rating,
    note: optText(1000),
    source: z.enum(["wellbeing", "pulse_check"]).optional(),
  })
  .refine(
    (v) =>
      [v.mood, v.energy, v.stress, v.sleep_rating, v.day_rating].some((x) => x != null) ||
      (v.note ?? "").trim().length > 0,
    "Answer at least one question (you can skip the rest).",
  );

export const LIFE_PAYLOADS: Record<LifeEntity, z.ZodType<Record<string, unknown>>> = {
  task_category: taskCategoryPayload,
  task: taskPayload,
  calendar_event: calendarEventPayload,
  calendar_event_exception: eventExceptionPayload,
  habit: habitPayload,
  habit_check_in: checkInPayload,
  review: reviewPayload,
  sleep_log: sleepPayload,
  water_log: waterPayload,
  meal_log: mealPayload,
  activity_log: activityPayload,
  mood_log: moodPayload,
};

/** Entities the browser may queue offline (quick logging and task completion). */
export const OFFLINE_LIFE_ENTITIES = [
  "task",
  "habit_check_in",
  "water_log",
  "sleep_log",
  "meal_log",
  "activity_log",
  "mood_log",
] as const satisfies readonly LifeEntity[];

export type OfflineLifeEntity = (typeof OFFLINE_LIFE_ENTITIES)[number];

const lifeEntity = z.enum(OFFLINE_LIFE_ENTITIES);

/** One queued offline life mutation as sent to /api/sync. */
export const lifeSyncMutationSchema = z
  .object({
    mutationId: uuid,
    entity: lifeEntity,
    operation: z.enum(["create", "update", "delete"]),
    recordId: uuid,
    baseVersion: z.number().int().positive().nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((m, ctx) => {
    if (m.operation === "create" && m.baseVersion !== null) {
      ctx.addIssue({ code: "custom", message: "A new item can't have a version." });
    }
    if (m.operation !== "create" && m.baseVersion === null) {
      ctx.addIssue({ code: "custom", message: "An edit needs the version it was based on." });
    }
    if (m.operation === "delete") return;
    const schema = LIFE_PAYLOADS[m.entity];
    // Task edits from the queue are status changes; other updates send full payloads.
    const check =
      m.entity === "task" && m.operation === "update"
        ? z
            .object({ status: z.enum(["not_started", "in_progress", "completed", "cancelled"]) })
            .safeParse(m.payload)
        : schema.safeParse(m.payload);
    if (!check.success) {
      ctx.addIssue({
        code: "custom",
        message: check.error.issues[0]?.message ?? "Some of the details are not valid.",
      });
    }
  });

export type LifeSyncMutation = z.infer<typeof lifeSyncMutationSchema>;
