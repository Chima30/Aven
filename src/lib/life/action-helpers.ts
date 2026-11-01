import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { localToday } from "@/lib/finance/periods";
import type { FormState } from "@/lib/forms";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { LifeEntity } from "@/lib/supabase/database.types";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { applyLifeMutation } from "./mutate";
import { LIFE_PAYLOADS } from "./schemas";

export const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};

export interface LifeContext {
  userId: string;
  supabase: ServerSupabase;
  timeZone: string;
  weekStart: number;
  today: string;
  measurement: "metric" | "imperial";
}

/** The signed-in user, their client, and their regional settings. User id comes from the session only. */
export async function lifeContext(): Promise<LifeContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("time_zone, week_start, measurement_system")
    .eq("user_id", user.id)
    .maybeSingle();
  const timeZone = prefs?.time_zone ?? "UTC";
  return {
    userId: user.id,
    supabase,
    timeZone,
    weekStart: prefs?.week_start ?? 1,
    today: localToday(timeZone),
    measurement: prefs?.measurement_system ?? "metric",
  };
}

export function zodState(error: z.ZodError, values?: Record<string, string>): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return {
    status: "error",
    message: Object.keys(fieldErrors).length
      ? undefined
      : (error.issues[0]?.message ?? "Check the form."),
    fieldErrors,
    values,
  };
}

/**
 * Validate, then write through apply_life_mutation() with the user's session.
 * Updates are partial: only the provided keys are checked against the schema.
 */
export async function runLife(
  ctx: LifeContext,
  input: {
    entity: LifeEntity;
    operation: "create" | "update" | "delete";
    recordId?: string;
    payload: Record<string, unknown>;
    baseVersion?: number | null;
    successMessage: string;
    revalidate: string[];
    values?: Record<string, string>;
    partial?: boolean;
  },
): Promise<FormState & { recordId?: string }> {
  if (!(await consumeRateLimit(ctx.supabase, "life_write"))) {
    return { status: "error", message: "That's a lot of changes at once. Please wait a moment." };
  }
  const onlyArchive = Object.keys(input.payload).every((k) => k === "archived");
  if (input.operation !== "delete" && !onlyArchive) {
    const schema = LIFE_PAYLOADS[input.entity];
    let check: ReturnType<typeof schema.safeParse>;
    if (input.partial) {
      try {
        check = (schema as unknown as z.ZodObject<z.ZodRawShape>)
          .partial()
          .safeParse(input.payload);
      } catch {
        check = schema.safeParse(input.payload);
      }
    } else {
      check = schema.safeParse(input.payload);
    }
    if (!check.success) return zodState(check.error, input.values);
  }
  const recordId = input.recordId ?? randomUUID();
  let result;
  try {
    result = await applyLifeMutation(ctx.supabase, {
      mutationId: randomUUID(),
      entity: input.entity,
      operation: input.operation,
      recordId,
      payload: input.payload,
      baseVersion: input.baseVersion ?? null,
    });
  } catch {
    return {
      status: "error",
      message: "We couldn't reach the server. Please try again.",
      values: input.values,
    };
  }
  if (result.status === "conflict") {
    return {
      status: "error",
      message:
        result.reason === "not_found"
          ? "This item no longer exists."
          : "This was changed somewhere else. Reload the page to see the latest version.",
      values: input.values,
    };
  }
  if (result.status === "rejected") {
    return {
      status: "error",
      message: result.message ?? "Some of the details are not valid.",
      values: input.values,
    };
  }
  for (const path of input.revalidate) revalidatePath(path);
  return { status: "success", message: input.successMessage, recordId };
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

export function intOrNull(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function versionOf(formData: FormData): number | null {
  const v = Number(str(formData, "version"));
  return Number.isInteger(v) && v > 0 ? v : null;
}
