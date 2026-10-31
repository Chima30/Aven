"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { Field, Select } from "@/components/ui/field";
import { WEEKDAYS } from "@/lib/regional/options";
import type { UserPreferencesRow } from "@/lib/supabase/database.types";
import { updateRegionalAction } from "../actions";

interface Option {
  code: string;
  name: string;
}

export function RegionalForm({
  preferences,
  currencies,
  locales,
  timeZones,
  examples,
}: {
  preferences: UserPreferencesRow;
  currencies: Option[];
  locales: Option[];
  timeZones: string[];
  examples: { date: Record<string, string>; number: Record<string, string> };
}) {
  return (
    <SettingsForm
      title="Regional settings"
      description="Your default currency, time zone and how dates and numbers are shown. Each account and transaction will still keep its own currency."
      action={updateRegionalAction}
    >
      {(state) => (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="currencyCode"
            label="Default currency"
            hint="Used for new accounts and summaries. AVEN never adds different currencies together without an exchange rate."
            error={state.fieldErrors?.currencyCode}
            className="sm:col-span-2"
          >
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.currency_code}>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="timeZone"
            label="Time zone"
            hint="Reminders, quiet hours and daily summaries follow this time zone."
            error={state.fieldErrors?.timeZone}
            className="sm:col-span-2"
          >
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.time_zone}>
                {timeZones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="locale"
            label="Formatting locale"
            hint="AVEN's interface is in English for now."
            error={state.fieldErrors?.locale}
          >
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.locale}>
                {locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="weekStart" label="Week starts on" error={state.fieldErrors?.weekStart}>
            {(a11y) => (
              <Select {...a11y} defaultValue={String(preferences.week_start)}>
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="dateFormat" label="Date format" error={state.fieldErrors?.dateFormat}>
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.date_format}>
                <option value="locale">Match locale ({examples.date.locale})</option>
                <option value="dmy">Day/Month/Year ({examples.date.dmy})</option>
                <option value="mdy">Month/Day/Year ({examples.date.mdy})</option>
                <option value="ymd">Year-Month-Day ({examples.date.ymd})</option>
              </Select>
            )}
          </Field>
          <Field id="numberFormat" label="Number format" error={state.fieldErrors?.numberFormat}>
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.number_format}>
                <option value="locale">Match locale ({examples.number.locale})</option>
                <option value="comma_dot">{examples.number.comma_dot}</option>
                <option value="dot_comma">{examples.number.dot_comma}</option>
                <option value="space_comma">{examples.number.space_comma}</option>
              </Select>
            )}
          </Field>
          <Field
            id="measurementSystem"
            label="Measurement units"
            error={state.fieldErrors?.measurementSystem}
          >
            {(a11y) => (
              <Select {...a11y} defaultValue={preferences.measurement_system}>
                <option value="metric">Metric (kg, km, ml)</option>
                <option value="imperial">Imperial (lb, mi, fl oz)</option>
              </Select>
            )}
          </Field>
        </div>
      )}
    </SettingsForm>
  );
}
