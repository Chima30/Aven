/**
 * Calendar-date and time-zone helpers (Intl only, no dependencies).
 *
 * Dates are ISO strings "YYYY-MM-DD" (a local calendar day, no zone).
 * Instants are JS Dates. Conversions always name the zone explicitly, so the
 * server's own zone never leaks into a user's schedule.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

/** The wall-clock parts of `instant` in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    dtf(timeZone)
      .formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    seconds: Number(parts.second),
  };
}

/** The local calendar date of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  return zonedParts(instant, timeZone).date;
}

/** Minutes since local midnight of `instant` in `timeZone`. */
export function localMinutes(instant: Date, timeZone: string): number {
  return zonedParts(instant, timeZone).minutes;
}

function utcMsOf(date: string, minutes: number): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
}

function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(new Date(ms), timeZone);
  return utcMsOf(p.date, p.minutes) + p.seconds * 1000 - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which the clock in `timeZone` shows `date` + `minutes`.
 * Like Temporal's "compatible" rule: a time that occurs twice (clocks go
 * back) resolves to the EARLIER instant; a time that doesn't exist (clocks go
 * forward) is pushed forward by the size of the gap.
 */
export function zonedToInstant(date: string, minutes: number, timeZone: string): Date {
  const target = utcMsOf(date, minutes);
  const before = offsetAt(target - 86_400_000, timeZone);
  const after = offsetAt(target + 86_400_000, timeZone);
  const candidates = [target - before, target - after].filter((t) => {
    const p = zonedParts(new Date(t), timeZone);
    return utcMsOf(p.date, p.minutes) === target;
  });
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  return new Date(target - before);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((utcMsOf(to, 0) - utcMsOf(from, 0)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** First day of the week containing `date`, for a week starting on `weekStart` (0–6). */
export function startOfWeek(date: string, weekStart: number): string {
  return addDays(date, -((weekday(date) - weekStart + 7) % 7));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function addMonthsToDate(date: string, months: number): string | null {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  if (d > daysInMonth(ny, nm)) return null; // e.g. the 31st in a 30-day month
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(value: string): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!m) throw new Error(`Invalid time: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${value}`);
  return h * 60 + min;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function isValidTimeZoneName(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
