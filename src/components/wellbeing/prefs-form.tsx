"use client";

import { saveWellbeingPreferencesAction } from "@/app/(app)/wellbeing/actions";
import { ActionForm } from "@/components/finance/action-form";
import { Field, Input, Select } from "@/components/ui/field";

export function WellbeingPrefsForm({ values }: { values: Record<string, string> }) {
  return (
    <ActionForm action={saveWellbeingPreferencesAction} submitLabel="Save settings">
      {(state) => {
        const v = { ...values, ...(state.values ?? {}) };
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="water_unit" label="Water unit">
              {(a) => (
                <Select {...a} defaultValue={v.water_unit}>
                  <option value="ml">Millilitres (ml)</option>
                  <option value="l">Litres (L)</option>
                  <option value="fl_oz">US fluid ounces (fl oz)</option>
                </Select>
              )}
            </Field>
            <Field
              id="water_target"
              label="Daily water target"
              hint="In the unit you chose."
              error={state.fieldErrors?.water_target}
            >
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={v.water_target}
                  required
                />
              )}
            </Field>
            <Field id="distance_unit" label="Distance unit">
              {(a) => (
                <Select {...a} defaultValue={v.distance_unit}>
                  <option value="km">Kilometres</option>
                  <option value="mi">Miles</option>
                </Select>
              )}
            </Field>
            <Field
              id="sleep_target_hours"
              label="Sleep target (hours)"
              error={state.fieldErrors?.sleep_target_hours}
            >
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  step="0.25"
                  min="3"
                  max="15"
                  defaultValue={v.sleep_target_hours}
                  required
                />
              )}
            </Field>
          </div>
        );
      }}
    </ActionForm>
  );
}
