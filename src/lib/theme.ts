import type { ThemePreference } from "@/lib/supabase/database.types";

/** Cookie used to render the right theme on the server (no flash of the wrong theme). */
export const THEME_COOKIE = "aven-theme";

/** Dark charcoal is AVEN's default look; "system" and "light" are opt-in. */
export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "system" ? value : "dark";
}

export const THEME_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};
