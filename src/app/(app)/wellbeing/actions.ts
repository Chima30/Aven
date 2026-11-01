"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { SESSION_EXPIRED, lifeContext, zodState } from "@/lib/life/action-helpers";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { waterToMl, type WaterUnit } from "@/lib/wellbeing/units";

const prefsSchema = z.object({
  water_unit: z.enum(["ml", "l", "fl_oz"]),
  water_target: z.coerce.number().positive("Enter a daily target."),
  distance_unit: z.enum(["km", "mi"]),
  sleep_target_hours: z.coerce.number().min(3, "At least 3 hours.").max(15, "At most 15 hours."),
});

export async function saveWellbeingPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await lifeContext();
  if (!ctx) return SESSION_EXPIRED;
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = prefsSchema.safeParse(values);
  if (!parsed.success) return zodState(parsed.error, values);
  const targetMl = waterToMl(parsed.data.water_target, parsed.data.water_unit as WaterUnit);
  if (targetMl < 250 || targetMl > 10000) {
    return {
      status: "error",
      fieldErrors: { water_target: "Choose a target between 250 ml and 10 L." },
      values,
    };
  }
  if (!(await consumeRateLimit(ctx.supabase, "life_write"))) {
    return { status: "error", message: "Please wait a moment and try again." };
  }
  const { error } = await ctx.supabase.from("wellbeing_preferences").upsert({
    user_id: ctx.userId,
    water_unit: parsed.data.water_unit,
    water_target_ml: targetMl,
    distance_unit: parsed.data.distance_unit,
    sleep_target_minutes: Math.round(parsed.data.sleep_target_hours * 60),
  });
  if (error)
    return {
      status: "error",
      message: "Your settings couldn't be saved. Please try again.",
      values,
    };
  revalidatePath("/wellbeing", "layout");
  return { status: "success", message: "Wellbeing settings saved." };
}
