import type { Metadata } from "next";
import Link from "next/link";
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
      <Alert tone="info" title="These settings control the Nudge Center">
        Nudges appear in the{" "}
        <Link href="/nudges" className="underline">
          Nudge Center
        </Link>{" "}
        inside AVEN (push notifications to your phone aren&apos;t available yet). Rules decide what
        you get; these choices decide when. Times use your time zone ({preferences.time_zone}).
        {quiet ? " Your quiet hours are active right now." : ""}
      </Alert>
      <NotificationsForm prefs={prefs} categories={ordered} />
    </>
  );
}
