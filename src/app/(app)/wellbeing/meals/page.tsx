import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WellbeingConsentNotice } from "@/components/wellbeing/consent-gate";
import { DeleteLog, MealLogForm, PendingLogs } from "@/components/wellbeing/log-forms";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel, timeIn } from "@/lib/planning/queries";
import { loadWellbeingBasics, loadWellbeingLogs, MEAL_LABEL } from "@/lib/wellbeing/queries";

export const metadata: Metadata = { title: "Meals" };

export default async function MealsPage() {
  const { user, timeZone, locale, consented } = await loadWellbeingBasics();
  const { meals } = await loadWellbeingLogs(14);
  const byDay = new Map<string, typeof meals>();
  for (const m of meals) byDay.set(m.local_date, [...(byDay.get(m.local_date) ?? []), m]);
  return (
    <>
      <PageHeader
        title="Meals"
        description="A simple food diary. AVEN records what you write and when — it never estimates calories or nutrition."
      />
      {!consented ? <WellbeingConsentNotice /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {consented ? (
          <Card>
            <CardHeader title="Log a meal" />
            <CardBody className="flex flex-col gap-3">
              <MealLogForm userId={user.id} timeZone={timeZone} />
              <PendingLogs userId={user.id} entities={["meal_log"]} />
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title="Last 14 days"
            description={`${meals.length} meal${meals.length === 1 ? "" : "s"} logged.`}
          />
          <CardBody>
            {meals.length === 0 ? (
              <p className="text-ink-muted text-sm">No meals logged yet.</p>
            ) : (
              <div className="flex flex-col gap-4" data-testid="meal-history">
                {[...byDay.entries()].map(([d, list]) => (
                  <section key={d}>
                    <h3 className="text-ink-subtle text-xs font-medium uppercase">
                      {dayLabel(d, locale)}
                    </h3>
                    <ul className="divide-line divide-y text-sm">
                      {list.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                          <div>
                            <p className="text-ink">
                              <span className="font-medium">{MEAL_LABEL[m.meal_type]}</span> ·{" "}
                              {m.description}
                            </p>
                            <p className="text-ink-muted text-xs">
                              {timeIn(new Date(m.eaten_at), timeZone, locale)}
                              {m.note ? ` · ${m.note}` : ""}
                            </p>
                          </div>
                          {consented ? (
                            <DeleteLog
                              userId={user.id}
                              entity="meal_log"
                              id={m.id}
                              version={m.version}
                              label={`${m.meal_type} on ${d}`}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
