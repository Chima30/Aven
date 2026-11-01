import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotMedicalNote, WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { DeleteLog, PendingLogs, SleepLogForm } from "@/components/wellbeing/log-forms";
import { Stat, TrendBars } from "@/components/wellbeing/trend-bars";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel, timeIn } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import { dateRange, loadWellbeingBasics, loadWellbeingLogs } from "@/lib/wellbeing/queries";
import { SCALE_LABELS, average, formatDuration, sumByDate } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Sleep" };

export default async function SleepPage() {
  const { user, today, timeZone, locale, prefs, consented } = await loadWellbeingBasics();
  const { sleep } = await loadWellbeingLogs(30);
  const days = dateRange(addDays(today, -13), today);
  const byDay = sumByDate(
    sleep,
    (s) => s.wake_date,
    (s) => s.duration_minutes,
  );
  const week = sleep.filter((s) => s.wake_date > addDays(today, -7));
  const avg = average(week.map((s) => s.duration_minutes));
  const onTarget = week.filter((s) => s.duration_minutes >= prefs.sleep_target_minutes).length;
  return (
    <>
      <PageHeader
        title="Sleep"
        description="Log when you fell asleep and woke up. Overnight sleep and clock changes are handled exactly."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <section className="grid grid-cols-3 gap-3">
        <Stat
          label="7-day average"
          value={avg === null ? "—" : formatDuration(Math.round(avg))}
          sub={`${week.length} night${week.length === 1 ? "" : "s"} logged`}
        />
        <Stat label="Target" value={formatDuration(prefs.sleep_target_minutes)} />
        <Stat label="Nights on target" value={week.length ? `${onTarget} / ${week.length}` : "—"} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {consented ? (
          <Card>
            <CardHeader title="Log sleep" />
            <CardBody className="flex flex-col gap-3">
              <SleepLogForm userId={user.id} timeZone={timeZone} />
              <PendingLogs userId={user.id} entities={["sleep_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Last 14 days" />
          <CardBody className="flex flex-col gap-4">
            <TrendBars
              caption="Sleep per night (by wake-up date)."
              days={days}
              values={byDay}
              format={formatDuration}
              target={prefs.sleep_target_minutes}
              dayLabel={(d) => dayLabel(d, locale, { day: "numeric", month: "short" })}
            />
            {sleep.length === 0 ? (
              <p className="text-ink-muted text-sm">No sleep logged yet.</p>
            ) : (
              <ul className="divide-line divide-y text-sm" data-testid="sleep-history">
                {sleep.slice(0, 30).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-ink font-medium">{formatDuration(s.duration_minutes)}</p>
                      <p className="text-ink-muted text-xs">
                        {timeIn(new Date(s.slept_at), timeZone, locale)} →{" "}
                        {timeIn(new Date(s.woke_at), timeZone, locale)}, woke{" "}
                        {dayLabel(s.wake_date, locale)}
                        {s.quality ? ` · ${SCALE_LABELS.sleep_rating[s.quality - 1]}` : ""}
                      </p>
                      {s.note ? <p className="text-ink-subtle text-xs">{s.note}</p> : null}
                    </div>
                    {consented ? (
                      <DeleteLog
                        userId={user.id}
                        entity="sleep_log"
                        id={s.id}
                        version={s.version}
                        label={`sleep on ${s.wake_date}`}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <NotMedicalNote />
    </>
  );
}
