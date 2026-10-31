import type { Metadata } from "next";
import { Alert } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import { isQuietNow } from "@/lib/nudges/engine";
import { NOTIFICATION_CATEGORIES } from "@/lib/nudges/types";
import { createClient } from "@/lib/supabase/server";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { user, preferences } = await getAppContext();
  const supabase = await createClient();
  const [{ data: prefs }, { data: categories }] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).single(),
    supabase.from("notification_category_preferences").select("category, frequency"),
  ]);
  if (!prefs)
    throw new Error("Notification preferences are missing. Check that all migrations have run.");

  const ordered = NOTIFICATION_CATEGORIES.map((c) => ({
    category: c,
    frequency: categories?.find((row) => row.category === c)?.frequency ?? "daily_digest",
  }));
  const quiet = isQuietNow(
    {
      inAppEnabled: prefs.in_app_enabled,
      dailyDigestEnabled: prefs.daily_digest_enabled,
      dailyDigestTime: prefs.daily_digest_time,
      weeklyDigestEnabled: prefs.weekly_digest_enabled,
      weeklyDigestDay: prefs.weekly_digest_day,
      quietHoursEnabled: prefs.quiet_hours_enabled,
      quietHoursStart: prefs.quiet_hours_start,
      quietHoursEnd: prefs.quiet_hours_end,
      pauseNonessential: prefs.pause_nonessential,
      maxNudgesPerDay: prefs.max_nudges_per_day,
      timeZone: preferences.time_zone,
      categoryFrequency: {},
    },
    new Date(),
  );

  return (
    <>
      <Alert tone="info" title="No notifications are sent yet">
        The Nudge Center is planned for a later release. Your choices here are saved now and will
        control it from day one. Times use your time zone ({preferences.time_zone}).
        {quiet ? " Your quiet hours are active right now." : ""}
      </Alert>
      <NotificationsForm prefs={prefs} categories={ordered} />
    </>
  );
}
