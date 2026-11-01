"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { SYNC_REPORT_EVENT, startSyncLoop } from "@/lib/offline/controller";
import type { SyncRunReport } from "@/lib/offline/sync-engine";

/**
 * Mounted once in the signed-in shell. Starts background syncing, refreshes
 * server data after changes land, and tells the user about the outcome.
 */
export function SyncBootstrap({ userId }: { userId: string }) {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!("indexedDB" in window)) return;
    const stop = startSyncLoop(userId);
    const onReport = (event: Event) => {
      const report = (event as CustomEvent<SyncRunReport>).detail;
      if (report.synced > 0) router.refresh();
      if (report.syncedOffline > 0) {
        toast(
          `${report.syncedOffline} offline change${report.syncedOffline === 1 ? "" : "s"} synced.`,
          "success",
        );
      }
      if (report.failed > 0) {
        toast(
          `${report.failed} change${report.failed === 1 ? "" : "s"} couldn't sync. Open Money → Sync to review.`,
          "error",
        );
      }
    };
    window.addEventListener(SYNC_REPORT_EVENT, onReport);
    return () => {
      stop();
      window.removeEventListener(SYNC_REPORT_EVENT, onReport);
    };
  }, [userId, router, toast]);

  return null;
}
