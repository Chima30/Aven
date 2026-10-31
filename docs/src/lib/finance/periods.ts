/** Reporting periods, computed from the user's LOCAL date (never the server's). */
export type PeriodKey =
  "this_month" | "last_month" | "last_3_months" | "this_year" | "last_12_months";

export const PERIODS: ReadonlyArray<{ key: PeriodKey; label: string }> = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "this_year", label: "This year" },
  { key: "last_12_months", label: "Last 12 months" },
];

export function isPeriodKey(value: unknown): value is PeriodKey {
  return PERIODS.some((p) => p.key === value);
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function periodRange(key: PeriodKey, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number, number];
  const month = m - 1;
  switch (key) {
    case "this_month":
      return { from: iso(y, month, 1), to: iso(y, month + 1, 0) };
    case "last_month":
      return { from: iso(y, month - 1, 1), to: iso(y, month, 0) };
    case "last_3_months":
      return { from: iso(y, month - 2, 1), to: iso(y, month + 1, 0) };
    case "this_year":
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "last_12_months":
      return { from: iso(y, month - 11, 1), to: iso(y, month + 1, 0) };
  }
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
