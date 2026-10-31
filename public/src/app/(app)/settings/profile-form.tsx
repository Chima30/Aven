"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { Field, Input, Select } from "@/components/ui/field";
import { updateProfileAction } from "./actions";

export function ProfileForm({
  displayName,
  countryCode,
  email,
  countries,
}: {
  displayName: string;
  countryCode: string;
  email: string;
  countries: Array<{ code: string; name: string }>;
}) {
  return (
    <SettingsForm
      title="Profile"
      description="How AVEN addresses you, and where you're based."
      action={updateProfileAction}
    >
      {(state) => (
        <>
          <Field id="displayName" label="Display name" error={state.fieldErrors?.displayName}>
            {(a11y) => (
              <Input
                {...a11y}
                defaultValue={displayName}
                maxLength={80}
                autoComplete="nickname"
                required
              />
            )}
          </Field>
          <Field
            id="countryCode"
            label="Country"
            hint="Used to suggest sensible defaults. It doesn't limit which currencies you can use."
            error={state.fieldErrors?.countryCode}
          >
            {(a11y) => (
              <Select {...a11y} defaultValue={countryCode}>
                <option value="">Not set</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="email"
            label="Email"
            hint="Your sign-in address. Changing it will be supported in a later stage."
          >
            {(a11y) => <Input {...a11y} name={undefined} value={email} readOnly disabled />}
          </Field>
        </>
      )}
    </SettingsForm>
  );
}
