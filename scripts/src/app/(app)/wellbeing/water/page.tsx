import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { DeleteLog, PendingLogs, WaterQuickLog } from "@/components/wellbeing/log-forms";
import { Stat, TrendBars } from "@/components/wellbeing/trend-bars";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel, timeIn } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import { dateRange, loadWellbeingBasics, loadWellbeingLogs } from "@/lib/wellbeing/queries";
import { formatWater, sumByDate } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Water" };

export default async function WaterPage() {
  const { user, today, timeZone, locale, prefs, consented } = await loadWellbeingBasics();
  const { water } = await loadWellbeingLogs(30);
  const days = dateRange(addDays(today, -13), today);
  const byDay = sumByDate(
    water,
    (w) => w.local_date,
    (w) => w.amount_ml,
  );
  const todayMl = byDay.get(today) ?? 0;
  const logged = days.filter((d) => byDay.has(d) && d !== today);
  const met = logged.filter((d) => byDay.get(d)! >= prefs.water_target_ml).length;
  const unit = prefs.water_unit;
  return (
    <>
      <PageHeader
        title="Water"
        description="Stored in millilitres, shown in your unit. Change units and the daily target in Wellbeing settings."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <section className="grid grid-cols-3 gap-3">
        <Stat
          label="Today"
          value={formatWater(todayMl, unit)}
          sub={`${Math.min(100, Math.round((todayMl / prefs.water_target_ml) * 100))}% of target`}
        />
        <Stat label="Daily target" value={formatWater(prefs.water_target_ml, unit)} />
        <Stat
          label="Target met (14 days)"
          value={logged.length ? `${met} / ${logged.length}` : "—"}
          sub="days with a log"
        />
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {consented ? (
          <Card>
            <CardHeader title="Log water" />
            <CardBody className="flex flex-col gap-3">
              <WaterQuickLog userId={user.id} timeZone={timeZone} unit={unit} />
              <PendingLogs userId={user.id} entities={["water_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Last 14 days" />
          <CardBody className="flex flex-col gap-4">
            <TrendBars
              caption="Water per day."
              days={days}
              values={byDay}
              format={(n) => formatWater(n, unit)}
              target={prefs.water_target_ml}
              dayLabel={(d) => dayLabel(d, locale, { day: "numeric", month: "short" })}
            />
            <ul className="divide-line divide-y text-sm" data-testid="water-history">
              {water
                .filter((w) => w.local_date === today)
                .map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="text-ink font-medium">{formatWater(w.amount_ml, unit)}</span>{" "}
                      <span className="text-ink-muted text-xs">
                        at {timeIn(new Date(w.logged_at), timeZone, locale)}
                      </span>
                    </span>
                    {consented ? (
                      <DeleteLog
                        userId={user.id}
                        entity="water_log"
                        id={w.id}
                        version={w.version}
                        label={`water at ${timeIn(new Date(w.logged_at), timeZone, locale)}`}
                      />
                    ) : null}
                  </li>
                ))}
            </ul>
            {todayMl === 0 ? (
              <p className="text-ink-muted text-sm">No water logged today.</p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
