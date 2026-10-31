"use client";

import { useEffect, useState } from "react";
import { OUTBOX_EVENT, listEntries } from "@/lib/offline/controller";
import type { OutboxEntry } from "@/lib/offline/types";
import type { TransactionPayload } from "./schemas";

/** Live list of this user's unsynced transaction changes from IndexedDB. */
export function useTransactionOutbox(userId: string): OutboxEntry<TransactionPayload>[] {
  const [entries, setEntries] = useState<OutboxEntry<TransactionPayload>[]>([]);
  useEffect(() => {
    if (!("indexedDB" in window)) return;
    let cancelled = false;
    const refresh = () =>
      listEntries(userId)
        .then((all) => {
          if (cancelled) return;
          setEntries(
            all.filter(
              (e) => e.entity === "transaction" && e.status !== "synced",
            ) as OutboxEntry<TransactionPayload>[],
          );
        })
        .catch(() => undefined);
    refresh();
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(OUTBOX_EVENT, refresh);
    };
  }, [userId]);
  return entries;
}
