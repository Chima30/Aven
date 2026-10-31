"use client";

import Link from "next/link";
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

  const pending = summary?.pending ?? 0;
  const inFlight = summary?.syncing ?? 0;
  const failed = summary?.failed ?? 0;

  // Four states the user can rely on: Synced · Pending · Syncing · Failed (+ offline context).
  let tone: "ok" | "warn" | "bad" = "ok";
  let label = online ? "Synced" : "Offline";
  let detail = online
    ? "Everything you've entered has reached your account."
    : "You're offline. New transactions are saved on this device and sync when you reconnect.";
  if (failed) {
    tone = "bad";
    label = `${failed} failed`;
    detail = `${failed} change${failed === 1 ? "" : "s"} couldn't sync and need${failed === 1 ? "s" : ""} your decision.`;
  } else if (inFlight) {
    tone = "warn";
    label = `Syncing ${inFlight}`;
    detail = `Sending ${inFlight} change${inFlight === 1 ? "" : "s"} to the server.`;
  } else if (pending) {
    tone = "warn";
    label = online ? `${pending} pending` : `Offline · ${pending} pending`;
    detail = `${pending} change${pending === 1 ? " is" : "s are"} saved on this device only and ${online ? "will sync shortly" : "will sync when you reconnect"}.`;
  }

  return (
    <Link
      href="/money/sync"
      role="status"
      aria-live="polite"
      title={detail}
      className="border-line bg-surface text-ink-muted hover:text-ink inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          tone === "ok" && (online ? "bg-success" : "bg-ink-subtle"),
          tone === "warn" && "bg-warning",
          tone === "bad" && "bg-danger",
        )}
      />
      <span>{label}</span>
      {compact ? null : <span className="sr-only">{detail} Open sync details.</span>}
    </Link>
  );
}
