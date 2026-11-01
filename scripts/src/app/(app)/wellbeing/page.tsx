import type { Metadata } from "next";
import Link from "next/link";
import { MemorySuggestions } from "@/components/planning/memory-suggestions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotMedicalNote, WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { PendingLogs, WaterQuickLog } from "@/components/wellbeing/log-forms";
import { Stat, TrendBars } from "@/components/wellbeing/trend-bars";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import { dateRange, loadWellbeingBasics, loadWellbeingLogs } from "@/lib/wellbeing/queries";
import { wellbeingSuggestions } from "@/lib/wellbeing/suggestions";
import {
  SCALE_LABELS,
  average,
  formatDuration,
  formatWater,
  sumByDate,
} from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Wellbeing" };

export default async function WellbeingDashboard() {
  const { user, today, timeZone, locale, prefs, consented } = await loadWellbeingBasics();
  const logs = await loadWellbeingLogs(30);
  const suggestions = await wellbeingSuggestions(logs);
  const days = dateRange(addDays(today, -6), today);
  const label = (d: string) => dayLabel(d, locale, { weekday: "short" });

  const waterByDay = sumByDate(
    logs.water,
    (w) => w.local_date,
    (w) => w.amount_ml,
  );
  const sleepByDay = sumByDate(
    logs.sleep,
    (s) => s.wake_date,
    (s) => s.duration_minutes,
  );
  const activityByDay = sumByDate(
    logs.activity,
    (a) => a.on_date,
    (a) => a.duration_minutes,
  );
  const moodByDay = new Map<string, number>();
  for (const d of days) {
    const avg = average(
      logs.moods.filter((m) => m.local_date === d && m.mood != null).map((m) => m.mood!),
    );
    if (avg !== null) moodByDay.set(d, avg);
  }
  const lastSleep = logs.sleep[0];
  const latestMood = logs.moods.find((m) => m.mood != null);
  const mealsToday = logs.meals.filter((m) => m.local_date === today).length;
  const hasAny =
    logs.sleep.length +
      logs.water.length +
      logs.meals.length +
      logs.activity.length +
      logs.moods.length >
    0;

  return (
    <>
      <PageHeader
        eyebrow="Wellbeing"
        title="How you're doing"
        description="Your own logs of sleep, water, meals, activity and mood — private to you, and never filled in for you."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <section aria-label="Today" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat
          label="Water today"
          value={formatWater(waterByDay.get(today) ?? 0, prefs.water_unit)}
          sub={`of ${formatWater(prefs.water_target_ml, prefs.water_unit)}`}
        />
        <Stat
          label="Last sleep"
          value={lastSleep ? formatDuration(lastSleep.duration_minutes) : "—"}
          sub={lastSleep ? `woke ${dayLabel(lastSleep.wake_date, locale)}` : "Nothing logged"}
        />
        <Stat
          label="Active today"
          value={activityByDay.has(today) ? formatDuration(activityByDay.get(today)!) : "—"}
        />
        <Stat label="Meals today" value={String(mealsToday)} />
        <Stat
          label="Latest mood"
          value={latestMood ? SCALE_LABELS.mood[latestMood.mood! - 1]! : "—"}
          sub={latestMood ? dayLabel(latestMood.local_date, locale) : undefined}
        />
      </section>
      {consented ? (
        <Card>
          <CardHeader
            title="Log water"
            description={`Target: ${formatWater(prefs.water_target_ml, prefs.water_unit)} a day.`}
          />
          <CardBody className="flex flex-col gap-3">
            <WaterQuickLog userId={user.id} timeZone={timeZone} unit={prefs.water_unit} />
            <PendingLogs
              userId={user.id}
              entities={["water_log", "sleep_log", "meal_log", "activity_log", "mood_log"]}
            />
          </CardBody>
        </Card>
      ) : null}
      <MemorySuggestions suggestions={suggestions} consentLabel="Remember wellbeing routines" />
      {hasAny ? (
        <div className="grid gap-4 md:grid-cols-2">
          <TrendCard title="Sleep" href="/wellbeing/sleep">
            <TrendBars
              caption="Hours slept, last 7 days."
              days={days}
              values={sleepByDay}
              format={formatDuration}
              target={prefs.sleep_target_minutes}
              dayLabel={label}
            />
          </TrendCard>
          <TrendCard title="Water" href="/wellbeing/water">
            <TrendBars
              caption="Water per day, last 7 days."
              days={days}
              values={waterByDay}
              format={(n) => formatWater(n, prefs.water_unit)}
              target={prefs.water_target_ml}
              dayLabel={label}
            />
          </TrendCard>
          <TrendCard title="Activity" href="/wellbeing/activity">
            <TrendBars
              caption="Active minutes per day, last 7 days."
              days={days}
              values={activityByDay}
              format={formatDuration}
              dayLabel={label}
            />
          </TrendCard>
          <TrendCard title="Mood" href="/wellbeing/mood">
            <TrendBars
              caption="Average mood per day (1–5), last 7 days."
              days={days}
              values={moodByDay}
              format={(n) => `${n} / 5`}
              max={5}
              dayLabel={label}
            />
          </TrendCard>
        </div>
      ) : (
        <p className="text-ink-muted text-sm">
          Nothing logged yet. Trends appear here once you start logging — AVEN never fills in
          missing days.
        </p>
      )}
      <NotMedicalNote />
    </>
  );
}

function TrendCard({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Link href={href} className="text-accent text-sm underline">
            Details
          </Link>
        }
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
