"use client";

import { useEffect, useState } from "react";
import type { CachedReferenceData } from "@/components/finance/finance-cache-writer";
import { TransactionForm } from "@/components/finance/transaction-form";
import { localToday } from "@/lib/finance/periods";
import { useTransactionOutbox } from "@/lib/finance/use-outbox";
import { getCache } from "@/lib/offline/db";
import { currentOfflineUser, sharedDb } from "@/lib/offline/controller";

/**
 * Offline transaction entry on the cached /offline page. Uses the accounts and
 * categories saved on this device the last time the user was online.
 */
export function OfflineQuickAdd() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "unavailable" }
    | { status: "ready"; userId: string; data: CachedReferenceData }
  >({ status: "loading" });

  useEffect(() => {
    if (!("indexedDB" in window)) {
      queueMicrotask(() => setState({ status: "unavailable" }));
      return;
    }
    void (async () => {
      const userId = await currentOfflineUser();
      if (!userId) return setState({ status: "unavailable" });
      const cached = await getCache<CachedReferenceData>(
        await sharedDb(),
        userId,
        "finance_reference",
      );
      if (!cached || cached.data.accounts.length === 0) return setState({ status: "unavailable" });
      setState({ status: "ready", userId, data: cached.data });
    })().catch(() => setState({ status: "unavailable" }));
  }, []);

  if (state.status === "loading") return null;
  if (state.status === "unavailable") {
    return (
      <p className="text-ink-muted mt-6 text-sm">
        To record transactions offline, open AVEN&apos;s Money section once while you&apos;re online
        on this device.
      </p>
    );
  }
  return <Ready userId={state.userId} data={state.data} />;
}

function Ready({ userId, data }: { userId: string; data: CachedReferenceData }) {
  const pending = useTransactionOutbox(userId);
  return (
    <section
      className="border-line bg-surface mt-10 w-full rounded-2xl border p-5 text-left sm:p-6"
      aria-labelledby="offline-add"
    >
      <h2 id="offline-add" className="type-section">
        Record a transaction offline
      </h2>
      <p className="text-ink-muted mt-1 text-sm">
        It&apos;s saved on this device and synced automatically next time you open AVEN online.
        {pending.length > 0
          ? ` ${pending.length} change${pending.length === 1 ? " is" : "s are"} waiting.`
          : ""}
      </p>
      <div className="mt-5">
        <TransactionForm
          userId={userId}
          accounts={data.accounts}
          categories={data.categories}
          decimal={data.decimal}
          today={localToday(Intl.DateTimeFormat().resolvedOptions().timeZone)}
        />
      </div>
    </section>
  );
}
