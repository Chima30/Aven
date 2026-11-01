import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotMedicalNote, WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { MoodLogForm, PendingLogs } from "@/components/wellbeing/log-forms";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel } from "@/lib/planning/queries";
import { addDays } from "@/lib/time/zoned";
import { loadWellbeingBasics } from "@/lib/wellbeing/queries";
import { SCALE_LABELS, average } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Pulse Check" };

const KEYS = ["mood", "energy", "stress", "sleep_rating", "day_rating"] as const;
const NAMES: Record<(typeof KEYS)[number], string> = {
  mood: "Mood",
  energy: "Energy",
  stress: "Stress",
  sleep_rating: "Sleep",
  day_rating: "Day",
};

export default async function PulseCheckPage() {
  const { user, supabase, timeZone, today, locale, consented } = await loadWellbeingBasics();
  const since = addDays(today, -27);
  const { data } = await supabase
    .from("mood_logs")
    .select("*")
    .eq("source", "pulse_check")
    .gte("local_date", since)
    .order("logged_at", { ascending: false })
    .limit(200);
  const checks = data ?? [];
  const recent = checks.filter((c) => c.local_date > addDays(today, -7));
  const earlier = checks.filter((c) => c.local_date <= addDays(today, -7));
  const patterns = KEYS.map((k) => {
    const now = average(recent.filter((c) => c[k] != null).map((c) => c[k]!));
    const before = average(earlier.filter((c) => c[k] != null).map((c) => c[k]!));
    return { k, now, before };
  }).filter((p) => p.now !== null);

  return (
    <>
      <PageHeader
        title="Pulse Check"
        description="An optional, private check-in — a few taps on how you're doing. Skip any question. It's never required and nothing is shared."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {consented ? (
          <Card>
            <CardHeader title="How are you, right now?" />
            <CardBody className="flex flex-col gap-3">
              <MoodLogForm userId={user.id} timeZone={timeZone} source="pulse_check" />
              <PendingLogs userId={user.id} entities={["mood_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title="Your patterns"
            description="Last 7 days compared with the 3 weeks before. Averages of your own answers (1–5)."
          />
          <CardBody>
            {patterns.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Patterns appear after your first Pulse Checks.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm" data-testid="pulse-patterns">
                {patterns.map((p) => {
                  const diff = p.before === null ? null : Math.round((p.now! - p.before) * 10) / 10;
                  return (
                    <li key={p.k} className="flex justify-between gap-3">
                      <span className="text-ink">{NAMES[p.k]}</span>
                      <span className="text-ink-muted tabular-nums">
                        {p.now} / 5 · {SCALE_LABELS[p.k][Math.round(p.now!) - 1]}
                        {diff === null
                          ? ""
                          : diff === 0
                            ? " · steady"
                            : ` · ${diff > 0 ? "+" : ""}${diff} vs before`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-ink-subtle mt-3 text-xs">
              {checks.length} Pulse Check{checks.length === 1 ? "" : "s"} in the last 4 weeks
              {checks[0] ? `, latest ${dayLabel(checks[0].local_date, locale)}` : ""}. Full history
              is in{" "}
              <Link href="/wellbeing/mood" className="underline">
                Wellbeing → Mood
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      </div>
      <NotMedicalNote />
    </>
  );
}
