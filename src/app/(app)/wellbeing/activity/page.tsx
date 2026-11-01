import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { ActivityLogForm, DeleteLog, PendingLogs } from "@/components/wellbeing/log-forms";
import { Stat, TrendBars } from "@/components/wellbeing/trend-bars";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import {
  ACTIVITY_LABEL,
  dateRange,
  loadWellbeingBasics,
  loadWellbeingLogs,
} from "@/lib/wellbeing/queries";
import { formatDistance, formatDuration, sumByDate } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const { user, today, timeZone, locale, prefs, consented } = await loadWellbeingBasics();
  const { activity } = await loadWellbeingLogs(30);
  const days = dateRange(addDays(today, -13), today);
  const byDay = sumByDate(
    activity,
    (a) => a.on_date,
    (a) => a.duration_minutes,
  );
  const week = activity.filter((a) => a.on_date > addDays(today, -7));
  const weekMinutes = week.reduce((s, a) => s + a.duration_minutes, 0);
  const weekDistance = week.reduce((s, a) => s + (a.distance_m ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Activity"
        description="Walks, workouts and sport you log yourself. Distances are stored in metres and shown in your unit."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <section className="grid grid-cols-3 gap-3">
        <Stat
          label="Last 7 days"
          value={weekMinutes ? formatDuration(weekMinutes) : "—"}
          sub={`${week.length} session${week.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Distance (7 days)"
          value={weekDistance ? formatDistance(weekDistance, prefs.distance_unit) : "—"}
        />
        <Stat label="Active days (7)" value={String(new Set(week.map((a) => a.on_date)).size)} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {consented ? (
          <Card>
            <CardHeader title="Log activity" />
            <CardBody className="flex flex-col gap-3">
              <ActivityLogForm
                userId={user.id}
                timeZone={timeZone}
                distanceUnit={prefs.distance_unit}
              />
              <PendingLogs userId={user.id} entities={["activity_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Last 14 days" />
          <CardBody className="flex flex-col gap-4">
            <TrendBars
              caption="Active minutes per day."
              days={days}
              values={byDay}
              format={formatDuration}
              dayLabel={(d) => dayLabel(d, locale, { day: "numeric", month: "short" })}
            />
            {activity.length === 0 ? (
              <p className="text-ink-muted text-sm">No activity logged yet.</p>
            ) : (
              <ul className="divide-line divide-y text-sm" data-testid="activity-history">
                {activity.slice(0, 30).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-ink font-medium">
                        {ACTIVITY_LABEL[a.activity_type]} · {formatDuration(a.duration_minutes)}
                        {a.distance_m
                          ? ` · ${formatDistance(a.distance_m, prefs.distance_unit)}`
                          : ""}
                      </p>
                      <p className="text-ink-muted text-xs">
                        {dayLabel(a.on_date, locale)}
                        {a.intensity ? ` · ${a.intensity}` : ""}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </div>
                    {consented ? (
                      <DeleteLog
                        userId={user.id}
                        entity="activity_log"
                        id={a.id}
                        version={a.version}
                        label={`${a.activity_type} on ${a.on_date}`}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
