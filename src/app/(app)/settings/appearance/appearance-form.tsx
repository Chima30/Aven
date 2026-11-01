"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { cn } from "@/lib/cn";
import type { ThemePreference } from "@/lib/supabase/database.types";
import { updateAppearanceAction } from "../actions";

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string }> = [
  {
    value: "system",
    label: "Match my device",
    description: "Switches automatically with your system setting.",
  },
  { value: "light", label: "Light", description: "Clean and bright, for daytime." },
  { value: "dark", label: "Dark", description: "AVEN's signature charcoal. The default." },
];

export function AppearanceForm({ theme }: { theme: ThemePreference }) {
  return (
    <SettingsForm
      title="Appearance"
      description="Choose how AVEN looks on this and your other devices."
      action={updateAppearanceAction}
    >
      {() => (
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "border-line hover:bg-surface-muted flex cursor-pointer flex-col gap-3 rounded-xl border p-3 transition-colors",
                  "has-[:checked]:border-accent has-[:checked]:ring-accent/25 has-[:checked]:ring-2",
                )}
              >
                <span
                  aria-hidden="true"
                  data-theme={o.value === "system" ? undefined : o.value}
                  className={cn(
                    "border-line flex h-16 overflow-hidden rounded-lg border",
                    o.value === "system" && "bg-[linear-gradient(90deg,#f3f3f1_50%,#09090a_50%)]",
                  )}
                >
                  {o.value !== "system" ? (
                    <span className="bg-canvas flex flex-1 gap-1.5 p-2">
                      <span className="bg-primary w-5 rounded" />
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="bg-ink/70 h-2 w-3/4 rounded" />
                        <span className="bg-accent h-2 w-1/2 rounded" />
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="theme"
                    value={o.value}
                    defaultChecked={theme === o.value}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="text-ink block text-sm font-medium">{o.label}</span>
                    <span className="text-ink-muted block text-xs">{o.description}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </SettingsForm>
  );
}
