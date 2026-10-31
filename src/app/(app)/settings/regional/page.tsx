import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/money/currencies";
import { applyNumberFormat, formatDate } from "@/lib/regional/format";
import { localeOptions, timeZoneOptions } from "@/lib/regional/options";
import { RegionalForm } from "./regional-form";

export const metadata: Metadata = { title: "Regional settings" };

export default async function RegionalSettingsPage() {
  const { preferences } = await getAppContext();
  const sample = new Date(Date.UTC(2026, 11, 31, 12));
  const base = { locale: preferences.locale, timeZone: "UTC", numberFormat: "locale" as const };
  const enUs = "1,234,567.89";
  return (
    <RegionalForm
      preferences={preferences}
      currencies={CURRENCIES.map((c) => ({ code: c.code, name: c.name }))}
      locales={localeOptions()}
      timeZones={timeZoneOptions()}
      examples={{
        date: {
          locale: formatDate(sample, { ...base, dateFormat: "locale" }),
          dmy: formatDate(sample, { ...base, dateFormat: "dmy" }),
          mdy: formatDate(sample, { ...base, dateFormat: "mdy" }),
          ymd: formatDate(sample, { ...base, dateFormat: "ymd" }),
        },
        number: {
          locale: new Intl.NumberFormat(preferences.locale, { minimumFractionDigits: 2 }).format(
            1234567.89,
          ),
          comma_dot: applyNumberFormat(enUs, "comma_dot"),
          dot_comma: applyNumberFormat(enUs, "dot_comma"),
          space_comma: applyNumberFormat(enUs, "space_comma"),
        },
      }}
    />
  );
}
