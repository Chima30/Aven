import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { NOTIFICATION_CATEGORIES } from "@/lib/nudges/types";
import { COUNTRY_CODE_SET, isValidLocale, isValidTimeZone } from "@/lib/regional/options";

/**
 * Zod schemas for every form. Server Actions validate with these before
 * touching the database; the database has its own CHECK constraints too.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const PASSWORD_MIN_LENGTH = 10;

export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(72, "Use 72 characters or fewer.")
  .refine((v) => new Set(v).size >= 4, "Use a less repetitive password.")
  .refine((v) => /[A-Za-z]/.test(v) && /[^A-Za-z]/.test(v), "Mix letters with numbers or symbols.");

// For sign-in we only check presence; strength rules belong to sign-up.
const existingPassword = z.string().min(1, "Enter your password.").max(72);

export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(80, "Use 80 characters or fewer."),
  email,
  password: newPassword,
  acceptTerms: z.literal("on", { error: "Please accept the terms and privacy policy." }),
});

export const signInSchema = z.object({ email, password: existingPassword });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const changePasswordSchema = z
  .object({ currentPassword: existingPassword, password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    message: "Choose a password different from your current one.",
  });

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Use 80 characters or fewer."),
  countryCode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .refine((v) => v === null || COUNTRY_CODE_SET.has(v), "Choose a country from the list."),
});

export const regionalSchema = z.object({
  currencyCode: z.enum(CURRENCY_CODES as [string, ...string[]], {
    error: "Choose a supported currency.",
  }),
  locale: z.string().refine(isValidLocale, "Choose a valid locale."),
  timeZone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
  weekStart: z.coerce.number().int().min(0).max(6),
  dateFormat: z.enum(["locale", "dmy", "mdy", "ymd"]),
  numberFormat: z.enum(["locale", "comma_dot", "dot_comma", "space_comma"]),
  measurementSystem: z.enum(["metric", "imperial"]),
});

export const appearanceSchema = z.object({ theme: z.enum(["system", "light", "dark"]) });

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00.");
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true");

export const notificationSchema = z
  .object({
    inAppEnabled: checkbox,
    emailEnabled: checkbox,
    emailMode: z.enum(["summaries", "all"]).default("summaries"),
    dailyDigestEnabled: checkbox,
    dailyDigestTime: timeOfDay,
    weeklyDigestEnabled: checkbox,
    weeklyDigestDay: z.coerce.number().int().min(0).max(6),
    quietHoursEnabled: checkbox,
    quietHoursStart: timeOfDay,
    quietHoursEnd: timeOfDay,
    pauseNonessential: checkbox,
    maxNudgesPerDay: z.coerce.number().int().min(0).max(20),
    categories: z.record(
      z.enum(NOTIFICATION_CATEGORIES as [string, ...string[]]),
      z.enum(["immediate", "daily_digest", "weekly_digest", "off"]),
    ),
  })
  .refine((v) => v.quietHoursStart !== v.quietHoursEnd, {
    path: ["quietHoursEnd"],
    message: "Quiet hours must start and end at different times.",
  })
  .refine((v) => v.categories.account_security !== "off", {
    path: ["categories"],
    message: "Account security notices cannot be switched off.",
  });

export const consentSchema = z.object({
  category: z.enum([
    "ai_processing",
    "wellbeing_data",
    "memory_financial",
    "memory_shared_expenses",
    "memory_wellbeing",
    "memory_planning",
    "memory_interactions",
  ]),
  granted: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const DELETE_CONFIRMATION_PHRASE = "DELETE";

export const deleteAccountSchema = z.object({
  password: existingPassword,
  confirmation: z
    .string()
    .trim()
    .refine(
      (v) => v === DELETE_CONFIRMATION_PHRASE,
      `Type ${DELETE_CONFIRMATION_PHRASE} to confirm.`,
    ),
});

/** Turn Zod issues into { fieldName: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
