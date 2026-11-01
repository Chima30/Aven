import type { Metadata } from "next";
import Link from "next/link";
import { EventActions, EventDialog, type EventEditView } from "@/components/planning/event-forms";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import {
  dayLabel,
  EVENT_CATEGORY_LABEL,
  loadOccurrences,
  loadPlanningBasics,
  timeIn,
  WEEKDAY_SHORT,
} from "@/lib/planning/queries";
import { occursOnDay, type Occurrence } from "@/lib/planning/recurrence";
import type { CalendarEventRow } from "@/lib/supabase/database.types";
import {
  addDays,
  addMonthsToDate,
  isIsoDate,
  localDate,
  localMinutes,
  minutesToTime,
  startOfMonth,
  startOfWeek,
} from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Calendar" };

type View = "month" | "week" | "day";

function toEditView(e: CalendarEventRow, tz: string): EventEditView {
  const start = e.starts_at ? new Date(e.starts_at) : null;
  const end = e.ends_at ? new Date(e.ends_at) : null;
  return {
    id: e.id,
    version: e.version,
    title: e.title,
    description: e.description,
    category: e.category,
    allDay: e.all_day,
    date: e.all_day ? e.start_date! : localDate(start!, tz),
    endDate: e.all_day ? e.end_date! : localDate(end!, tz),
    startTime: start ? minutesToTime(localMinutes(start, tz)) : "09:00",
    endTime: end ? minutesToTime(localMinutes(end, tz)) : "10:00",
    recurrence: e.recurrence,
    recurrenceInterval: e.recurrence_interval,
    recurrenceWeekdays: e.recurrence_weekdays,
    recurrenceUntil: e.recurrence_until,
    reminderMinutes: e.reminder_minutes,
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { today, timeZone, locale, weekStart, nowMs } = await loadPlanningBasics();
  const view: View = params.view === "week" || params.view === "day" ? params.view : "month";
  const date = typeof params.date === "string" && isIsoDate(params.date) ? params.date : today;

  let from: string;
  let to: string;
  if (view === "month") {
    from = startOfWeek(startOfMonth(date), weekStart);
    to = addDays(from, 41);
  } else if (view === "week") {
    from = startOfWeek(date, weekStart);
    to = addDays(from, 6);
  } else {
    from = date;
    to = date;
  }
  const { occurrences, events } = await loadOccurrences(from, to);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const days = Array.from({ length: view === "month" ? 42 : view === "week" ? 7 : 1 }, (_, i) =>
    addDays(from, i),
  );
  const onDay = (d: string) => occurrences.filter((o) => occursOnDay(o, d, timeZone));

  const step = (dir: -1 | 1) =>
    view === "month"
      ? (addMonthsToDate(startOfMonth(date), dir) ?? date)
      : addDays(date, dir * (view === "week" ? 7 : 1));
  const link = (v: View, d: string) => `/planning/calendar?view=${v}&date=${d}`;
  const title =
    view === "month"
      ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(`${startOfMonth(date)}T12:00:00Z`),
        )
      : view === "week"
        ? `${dayLabel(from, locale)} – ${dayLabel(to, locale)}`
        : dayLabel(date, locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

  const upcoming = occurrences
    .filter((o) => (o.allDay ? o.endDate! >= today : o.end!.getTime() >= nowMs))
    .slice(0, 8);

  const occurrenceLine = (o: Occurrence, withActions: boolean) => {
    const e = eventById.get(o.eventId);
    return (
      <li
        key={o.key}
        className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">
            <span className="text-ink-muted type-figure mr-2 text-xs">
              {o.allDay
                ? "All day"
                : `${timeIn(o.start!, timeZone, locale)}–${timeIn(o.end!, timeZone, locale)}`}
            </span>
            {o.title}
          </p>
          <p className="text-ink-subtle mt-0.5 flex flex-wrap gap-1 text-xs">
            <Badge>{EVENT_CATEGORY_LABEL[o.category]}</Badge>
            {o.recurring ? <Badge tone="info">Repeats</Badge> : null}
            {o.moved ? <Badge tone="warning">Moved</Badge> : null}
            {o.reminderMinutes !== null ? <Badge tone="accent">Reminder</Badge> : null}
          </p>
        </div>
        {withActions && e ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <EventDialog
              event={toEditView(e, timeZone)}
              defaultDate={o.occurrenceDate}
              variant="ghost"
              size="sm"
              timeZone={timeZone}
            />
            <EventActions
              eventId={e.id}
              version={e.version}
              occurrenceDate={o.occurrenceDate}
              recurring={o.recurring}
              title={o.title}
            />
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Planning"
        title="Calendar"
        description={`Your events in ${timeZone}. Repeating events are calculated, never copied, so they can't duplicate.`}
        action={<EventDialog defaultDate={date} timeZone={timeZone} />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={link(view, step(-1))}
            className="border-line hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm"
            aria-label="Previous"
          >
            ←
          </Link>
          <Link
            href={link(view, today)}
            className="border-line hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm"
          >
            Today
          </Link>
          <Link
            href={link(view, step(1))}
            className="border-line hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm"
            aria-label="Next"
          >
            →
          </Link>
          <h2 className="type-section text-ink ml-2" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex gap-1" role="navigation" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((v) => (
            <Link
              key={v}
              href={link(v, date)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm capitalize",
                view === v ? "bg-primary text-primary-fg" : "text-ink-muted hover:bg-surface-muted",
              )}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <Card>
          <CardBody className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-px text-center">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="text-ink-subtle py-1 text-xs font-semibold">
                  {WEEKDAY_SHORT[(weekStart + i) % 7]}
                </div>
              ))}
            </div>
            <div className="bg-line grid grid-cols-7 gap-px overflow-hidden rounded-lg">
              {days.map((d) => {
                const items = onDay(d);
                const inMonth = d.slice(0, 7) === date.slice(0, 7);
                return (
                  <Link
                    key={d}
                    href={link("day", d)}
                    className={cn(
                      "bg-surface hover:bg-surface-muted min-h-20 p-1.5 text-left sm:min-h-24",
                      !inMonth && "bg-surface-muted/50 text-ink-subtle",
                    )}
                    aria-label={`${dayLabel(d, locale)}: ${items.length} event${items.length === 1 ? "" : "s"}`}
                  >
                    <span
                      className={cn(
                        "type-figure inline-flex size-6 items-center justify-center rounded-full text-xs",
                        d === today && "bg-accent font-semibold text-white",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <ul className="mt-1 hidden flex-col gap-0.5 sm:flex">
                      {items.slice(0, 3).map((o) => (
                        <li
                          key={o.key}
                          className="bg-accent-soft text-ink truncate rounded px-1 text-[0.6875rem]"
                        >
                          {o.allDay ? "" : `${timeIn(o.start!, timeZone, locale)} `}
                          {o.title}
                        </li>
                      ))}
                      {items.length > 3 ? (
                        <li className="text-ink-subtle text-[0.6875rem]">
                          +{items.length - 3} more
                        </li>
                      ) : null}
                    </ul>
                    {items.length > 0 ? (
                      <span
                        className="bg-accent mt-1 block size-1.5 rounded-full sm:hidden"
                        aria-hidden="true"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((d) => {
            const items = onDay(d);
            return (
              <Card key={d}>
                <CardBody>
                  <div className="mb-2 flex items-center justify-between">
                    <h3
                      className={cn(
                        "text-sm font-semibold",
                        d === today ? "text-accent" : "text-ink",
                      )}
                    >
                      {dayLabel(d, locale, { weekday: "long", day: "numeric", month: "short" })}
                      {d === today ? " · Today" : ""}
                    </h3>
                    {view === "week" ? (
                      <Link href={link("day", d)} className="text-ink-muted hover:text-ink text-xs">
                        Open day
                      </Link>
                    ) : null}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-ink-subtle text-sm">Nothing scheduled.</p>
                  ) : (
                    <ul className="divide-line divide-y" data-testid="day-events">
                      {items.map((o) => occurrenceLine(o, true))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardBody>
          <h3 className="type-section text-ink mb-3">Coming up</h3>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing coming up" description="Add an event to see it here." />
          ) : (
            <ul className="divide-line divide-y">
              {upcoming.map((o) => occurrenceLine(o, false))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
