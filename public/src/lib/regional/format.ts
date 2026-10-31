import type { DateFormatPreference, NumberFormatPreference } from "@/lib/supabase/database.types";

export interface RegionalPrefs {
  locale: string;
  timeZone: string;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
}

/** Format a date (no time) honouring the user's date-format override and time zone. */
export function formatDate(date: Date, prefs: RegionalPrefs): string {
  if (prefs.dateFormat === "locale") {
    return new Intl.DateTimeFormat(prefs.locale, {
      timeZone: prefs.timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: prefs.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const [d, m, y] = [get("day"), get("month"), get("year")];
  switch (prefs.dateFormat) {
    case "dmy":
      return `${d}/${m}/${y}`;
    case "mdy":
      return `${m}/${d}/${y}`;
    case "ymd":
      return `${y}-${m}-${d}`;
  }
}

export function formatDateTime(date: Date, prefs: RegionalPrefs): string {
  const time = new Intl.DateTimeFormat(prefs.locale, {
    timeZone: prefs.timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDate(date, prefs)}, ${time}`;
}

const SEPARATORS: Record<
  Exclude<NumberFormatPreference, "locale">,
  { group: string; decimal: string }
> = {
  comma_dot: { group: ",", decimal: "." },
  dot_comma: { group: ".", decimal: "," },
  space_comma: { group: " ", decimal: "," },
};

/**
 * Re-punctuate a number already formatted by Intl (en-US style) to the user's
 * chosen separators. Works on decimal strings, so no float rounding occurs.
 */
export function applyNumberFormat(enUsFormatted: string, pref: NumberFormatPreference): string {
  if (pref === "locale") return enUsFormatted;
  const { group, decimal } = SEPARATORS[pref];
  return enUsFormatted.replace(/[,.]/g, (ch) => (ch === "," ? group : decimal));
}

/** Format a plain number for display. Integers and short decimals only. */
export function formatNumber(
  value: number,
  prefs: Pick<RegionalPrefs, "locale" | "numberFormat">,
): string {
  if (prefs.numberFormat === "locale") return new Intl.NumberFormat(prefs.locale).format(value);
  return applyNumberFormat(new Intl.NumberFormat("en-US").format(value), prefs.numberFormat);
}
