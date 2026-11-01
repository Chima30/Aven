import type { CalendarEventExceptionRow, CalendarEventRow } from "@/lib/supabase/database.types";
import {
  addDays,
  addMonthsToDate,
  diffDays,
  localDate,
  localMinutes,
  startOfWeek,
  weekday,
  zonedToInstant,
} from "@/lib/time/zoned";

/**
 * Expands calendar events into the occurrences inside a date range.
 *
 * Recurring events are stored ONCE; occurrences are calculated here on read,
 * so they can never be duplicated in the database. A recurring event keeps
 * its wall-clock time in its own time zone (a 09:00 meeting stays at 09:00
 * across daylight-saving changes). Exceptions cancel or move one occurrence,
 * identified by the local date it would originally have started on.
 */

export type EventInput = Pick<
  CalendarEventRow,
  | "id"
  | "title"
  | "description"
  | "category"
  | "all_day"
  | "starts_at"
  | "ends_at"
  | "start_date"
  | "end_date"
  | "time_zone"
  | "recurrence"
  | "recurrence_interval"
  | "recurrence_weekdays"
  | "recurrence_until"
  | "reminder_minutes"
>;

export type ExceptionInput = Pick<
  CalendarEventExceptionRow,
  "event_id" | "occurrence_date" | "cancelled" | "starts_at" | "ends_at" | "title"
>;

export interface Occurrence {
  eventId: string;
  /** Stable key: event id + original local start date. */
  key: string;
  occurrenceDate: string;
  title: string;
  category: EventInput["category"];
  allDay: boolean;
  /** Timed events: exact instants. All-day: null. */
  start: Date | null;
  end: Date | null;
  /** All-day events: inclusive local dates. Timed: null. */
  startDate: string | null;
  endDate: string | null;
  recurring: boolean;
  moved: boolean;
  reminderMinutes: number | null;
}

const MAX_OCCURRENCES = 2000;

/** Local start dates of an event's series that fall in [from, to] (inclusive). */
export function seriesDates(event: EventInput, from: string, to: string): string[] {
  const first = event.all_day
    ? event.start_date!
    : localDate(new Date(event.starts_at!), event.time_zone);
  if (!event.recurrence) return first >= from && first <= to ? [first] : [];

  const last = event.recurrence_until && event.recurrence_until < to ? event.recurrence_until : to;
  const out: string[] = [];
  const n = Math.max(1, event.recurrence_interval);

  if (event.recurrence === "daily") {
    // Jump to the first occurrence on or after `from`.
    let offset = Math.max(0, diffDays(first, from));
    offset = Math.ceil(offset / n) * n;
    for (
      let d = addDays(first, offset);
      d <= last && out.length < MAX_OCCURRENCES;
      d = addDays(d, n)
    ) {
      out.push(d);
    }
  } else if (event.recurrence === "weekly") {
    const days = new Set(event.recurrence_weekdays ?? [weekday(first)]);
    const anchor = startOfWeek(first, 0);
    let d = from > first ? from : first;
    for (; d <= last && out.length < MAX_OCCURRENCES; d = addDays(d, 1)) {
      const weekIndex = Math.floor(diffDays(anchor, startOfWeek(d, 0)) / 7);
      if (weekIndex % n === 0 && days.has(weekday(d))) out.push(d);
    }
  } else {
    const step = event.recurrence === "monthly" ? n : n * 12;
    for (let i = 0; out.length < MAX_OCCURRENCES && i < 12 * 200; i += step) {
      const d = addMonthsToDate(first, i);
      if (d === null) continue; // skip months without that day (e.g. 31st, 29 Feb)
      if (d > last) break;
      if (d >= from) out.push(d);
    }
  }
  return out;
}

export function expandEvents(
  events: EventInput[],
  exceptions: ExceptionInput[],
  range: { from: string; to: string },
): Occurrence[] {
  const byEvent = new Map<string, Map<string, ExceptionInput>>();
  for (const ex of exceptions) {
    const m = byEvent.get(ex.event_id) ?? new Map<string, ExceptionInput>();
    m.set(ex.occurrence_date, ex);
    byEvent.set(ex.event_id, m);
  }
  const out: Occurrence[] = [];

  for (const e of events) {
    // Widen the window so multi-day events that started earlier still show.
    const spanDays = e.all_day
      ? diffDays(e.start_date!, e.end_date!)
      : Math.ceil((Date.parse(e.ends_at!) - Date.parse(e.starts_at!)) / 86_400_000);
    const dates = seriesDates(e, addDays(range.from, -spanDays - 1), range.to);
    const startMinutes = e.all_day ? 0 : localMinutes(new Date(e.starts_at!), e.time_zone);
    const durationMs = e.all_day ? 0 : Date.parse(e.ends_at!) - Date.parse(e.starts_at!);
    const exMap = byEvent.get(e.id);

    for (const d of dates) {
      const ex = exMap?.get(d);
      if (ex?.cancelled) continue;
      let occ: Occurrence;
      if (e.all_day) {
        const endDate = addDays(d, spanDays);
        occ = {
          eventId: e.id,
          key: `${e.id}:${d}`,
          occurrenceDate: d,
          title: ex?.title ?? e.title,
          category: e.category,
          allDay: true,
          start: null,
          end: null,
          startDate: d,
          endDate,
          recurring: e.recurrence !== null,
          moved: false,
          reminderMinutes: e.reminder_minutes,
        };
        if (endDate < range.from || d > range.to) continue;
      } else {
        const start = ex?.starts_at
          ? new Date(ex.starts_at)
          : e.recurrence
            ? zonedToInstant(d, startMinutes, e.time_zone)
            : new Date(e.starts_at!);
        const end = ex?.ends_at ? new Date(ex.ends_at) : new Date(start.getTime() + durationMs);
        occ = {
          eventId: e.id,
          key: `${e.id}:${d}`,
          occurrenceDate: d,
          title: ex?.title ?? e.title,
          category: e.category,
          allDay: false,
          start,
          end,
          startDate: null,
          endDate: null,
          recurring: e.recurrence !== null,
          moved: Boolean(ex && !ex.cancelled && ex.starts_at),
          reminderMinutes: e.reminder_minutes,
        };
      }
      out.push(occ);
    }
  }
  return out.sort(compareOccurrences);
}

/** Does a timed occurrence touch the local day `date` in `timeZone`? */
export function occursOnDay(o: Occurrence, date: string, timeZone: string): boolean {
  if (o.allDay) return o.startDate! <= date && o.endDate! >= date;
  const s = localDate(o.start!, timeZone);
  const e = localDate(new Date(Math.max(o.start!.getTime(), o.end!.getTime() - 1)), timeZone);
  return s <= date && e >= date;
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  const ak = a.allDay ? `${a.startDate}T00` : a.start!.toISOString();
  const bk = b.allDay ? `${b.startDate}T00` : b.start!.toISOString();
  return ak.localeCompare(bk) || a.title.localeCompare(b.title);
}
