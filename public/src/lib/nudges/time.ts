/**
 * Time-zone helpers built on Intl (no extra dependencies).
 * All scheduling decisions are made in the USER'S time zone, not the server's.
 */

/** Minutes since local midnight (0–1439) for `date` in `timeZone`. */
export function minutesOfDayInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

/** Parse "HH:MM" or "HH:MM:SS" (as returned by Postgres `time`) into minutes. */
export function parseTimeOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time of day: ${value}`);
  return hours * 60 + minutes;
}

/**
 * Is `minute` inside the window [start, end)? Handles windows that cross
 * midnight, e.g. 22:00 → 07:00.
 */
export function isWithinWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

/**
 * The next instant (strictly after `from`) at which the local clock in
 * `timeZone` reads `targetMinute`. Steps forward minute-by-minute from a close
 * estimate, so daylight-saving transitions are handled correctly.
 */
export function nextLocalTime(from: Date, timeZone: string, targetMinute: number): Date {
  const current = minutesOfDayInZone(from, timeZone);
  let delta = targetMinute - current;
  if (delta <= 0) delta += 24 * 60;
  // Start from the whole minute, then correct for DST shifts (at most ±2 hours).
  const base = new Date(Math.floor(from.getTime() / 60_000) * 60_000);
  let candidate = new Date(base.getTime() + delta * 60_000);
  for (let i = 0; i < 180 && minutesOfDayInZone(candidate, timeZone) !== targetMinute; i += 1) {
    candidate = new Date(candidate.getTime() + 60_000);
  }
  return candidate;
}
