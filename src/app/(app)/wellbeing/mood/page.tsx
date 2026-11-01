import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { NotMedicalNote, WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { DeleteLog, MoodLogForm, PendingLogs } from "@/components/wellbeing/log-forms";
import { TrendBars } from "@/components/wellbeing/trend-bars";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel, timeIn } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import { dateRange, loadWellbeingBasics, loadWellbeingLogs } from "@/lib/wellbeing/queries";
import { SCALE_LABELS, average } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Mood" };

export default async function MoodPage() {
  const { user, today, timeZone, locale, consented } = await loadWellbeingBasics();
  const { moods } = await loadWellbeingLogs(30);
  const days = dateRange(addDays(today, -13), today);
  const series = (key: "mood" | "energy" | "stress") => {
    const m = new Map<string, number>();
    for (const d of days) {
      const avg = average(
        moods.filter((x) => x.local_date === d && x[key] != null).map((x) => x[key]!),
      );
      if (avg !== null) m.set(d, avg);
    }
    return m;
  };
  const label = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });
  return (
    <>
      <PageHeader
        title="Mood, energy and stress"
        description="Quick private check-ins. Pulse Checks from the Nudge Center appear here too."
        action={
          <Link href="/nudges/pulse" className="text-accent text-sm underline">
            Take a Pulse Check
          </Link>
        }
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {consented ? (
          <Card>
            <CardHeader
              title="Check in"
              description="Answer any or all — skip whatever you like."
            />
            <CardBody className="flex flex-col gap-3">
              <MoodLogForm userId={user.id} timeZone={timeZone} />
              <PendingLogs userId={user.id} entities={["mood_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title="Last 14 days"
            description="Daily averages on a 1–5 scale. Days without a check-in stay empty."
          />
          <CardBody className="grid gap-5">
            <TrendBars
              caption="Mood (higher is better)."
              days={days}
              values={series("mood")}
              format={(n) => `${n} / 5`}
              max={5}
              dayLabel={label}
            />
            <TrendBars
              caption="Energy (higher is more)."
              days={days}
              values={series("energy")}
              format={(n) => `${n} / 5`}
              max={5}
              dayLabel={label}
            />
            <TrendBars
              caption="Stress (higher is more stressed)."
              days={days}
              values={series("stress")}
              format={(n) => `${n} / 5`}
              max={5}
              dayLabel={label}
            />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="History" />
        <CardBody>
          {moods.length === 0 ? (
            <p className="text-ink-muted text-sm">No check-ins yet.</p>
          ) : (
            <ul className="divide-line divide-y text-sm" data-testid="mood-history">
              {moods.slice(0, 40).map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-ink">
                      {[
                        m.mood ? `Mood: ${SCALE_LABELS.mood[m.mood - 1]}` : null,
                        m.energy ? `Energy: ${SCALE_LABELS.energy[m.energy - 1]}` : null,
                        m.stress ? `Stress: ${SCALE_LABELS.stress[m.stress - 1]}` : null,
                        m.sleep_rating
                          ? `Sleep: ${SCALE_LABELS.sleep_rating[m.sleep_rating - 1]}`
                          : null,
                        m.day_rating ? `Day: ${SCALE_LABELS.day_rating[m.day_rating - 1]}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Note only"}
                    </p>
                    <p className="text-ink-muted text-xs">
                      {dayLabel(m.local_date, locale)},{" "}
                      {timeIn(new Date(m.logged_at), timeZone, locale)}{" "}
                      {m.source === "pulse_check" ? <Badge tone="info">Pulse Check</Badge> : null}
                    </p>
                    {m.note ? <p className="text-ink-subtle mt-0.5 text-xs">{m.note}</p> : null}
                  </div>
                  {consented ? (
                    <DeleteLog
                      userId={user.id}
                      entity="mood_log"
                      id={m.id}
                      version={m.version}
                      label={`check-in on ${m.local_date}`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <NotMedicalNote />
    </>
  );
}
