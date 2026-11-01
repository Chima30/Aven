"use client";

import { useEffect } from "react";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * Keeps this browser's theme cookie in step with the saved preference (for
 * example after signing in on a new device, or after the default changed).
 */
export function ThemeSync({ theme }: { theme: "system" | "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme === theme) return;
    root.dataset.theme = theme;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`;
  }, [theme]);
  return null;
}
