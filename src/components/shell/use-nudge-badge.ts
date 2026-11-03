"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNudgeBadgeAction, markNudgesSeenAction } from "@/app/(app)/nudges/actions";

const REFRESH_MS = 60_000;

export const isNudgesPath = (pathname: string) =>
  pathname === "/nudges" || pathname.startsWith("/nudges/");

/**
 * How many unread notifications arrived since the user last opened the Nudge
 * Center. Opening it clears the count (and records that, so it stays clear on
 * other devices); new notifications after that start a fresh count.
 */
export function useNudgeBadge(): number {
  const pathname = usePathname();
  const onNudges = isNudgesPath(pathname);
  const [count, setCount] = useState(0);
  const wasOnNudges = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setCount(await getNudgeBadgeAction());
    } catch {
      // Offline or signed out: keep the last known count.
    }
  }, []);

  useEffect(() => {
    if (onNudges) {
      // Opening the Nudge Center clears the badge straight away.
      // (The hook returns 0 while it is open; the stored count is reset once
      // the visit is recorded, so it doesn't flash back on leaving.)
      wasOnNudges.current = true;
      void markNudgesSeenAction()
        .then(() => setCount(0))
        .catch(() => undefined);
      return;
    }
    if (wasOnNudges.current) {
      // Leaving: anything that arrived while it was open has been seen too.
      wasOnNudges.current = false;
      void markNudgesSeenAction()
        .catch(() => undefined)
        .then(refresh);
    } else {
      void refresh();
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [onNudges, refresh]);

  return onNudges ? 0 : count;
}

export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}
