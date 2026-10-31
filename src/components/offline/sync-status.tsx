"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { OUTBOX_CHANGED_EVENT, readOutboxSummary } from "@/lib/offline/client";
import type { OutboxSummary } from "@/lib/offline/types";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Honest connection and sync indicator. Reads the real offline queue from
 * IndexedDB; it never claims something has synced when it has not.
 */
export function SyncStatus({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [summary, setSummary] = useState<OutboxSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      readOutboxSummary(userId)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => !cancelled && setSummary(null));
    refresh();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
      window.removeEventListener("online", refresh);
    };
  }, [userId]);

  const waiting = (summary?.pending ?? 0) + (summary?.syncing ?? 0);
  const failed = summary?.failed ?? 0;

  let tone: "ok" | "warn" | "bad" = "ok";
  let label = "Online";
  let detail = "Everything is saved to your account.";
  if (!online) {
    tone = "warn";
    label = "Offline";
    detail = waiting
      ? `${waiting} change${waiting === 1 ? "" : "s"} saved on this device, waiting to sync.`
      : "You're offline. Changes you can make offline will sync when you reconnect.";
  } else if (failed) {
    tone = "bad";
    label = `${failed} need${failed === 1 ? "s" : ""} attention`;
    detail = "Some changes could not be synced and need your decision.";
  } else if (waiting) {
    tone = "warn";
    label = `Syncing ${waiting}`;
    detail = `${waiting} change${waiting === 1 ? "" : "s"} still on this device only.`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      title={detail}
      className={cn(
        "border-line bg-surface text-ink-muted inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          tone === "ok" && "bg-success",
          tone === "warn" && "bg-warning",
          tone === "bad" && "bg-danger",
        )}
      />
      <span>{label}</span>
      {compact ? null : <span className="sr-only">{detail}</span>}
    </div>
  );
}
