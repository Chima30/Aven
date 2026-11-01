import type { Outbox } from "./outbox";
import type { OutboxEntry, SyncTransport } from "./types";

export interface SyncRunReport {
  attempted: number;
  synced: number;
  failed: number;
  retrying: number;
  /** Synced entries that had been created while offline. */
  syncedOffline: number;
  stoppedReason: "offline" | "auth_required" | "already_running" | null;
}

export interface SyncEngineOptions {
  outbox: Outbox;
  transport: SyncTransport;
  userId: string;
  isOnline?: () => boolean;
  batchSize?: number;
}

/**
 * Processes the outbox for one user, oldest change first, in batches.
 *
 * Guarantees:
 * - Only one run at a time per engine (single-flight; the browser controller
 *   adds a cross-tab lock on top).
 * - A network failure stops the run and schedules a retry for the batch.
 * - "applied"/"duplicate" → synced; the server de-duplicates by mutation id,
 *   so a retry after a lost response never creates a second record.
 * - Conflicts and rejections are marked failed and kept for the user; nothing
 *   is overwritten and nothing is silently deleted.
 * - If the session has expired, entries are released untouched.
 */
export class SyncEngine {
  private running = false;

  constructor(private readonly options: SyncEngineOptions) {}

  async run(): Promise<SyncRunReport> {
    const report: SyncRunReport = {
      attempted: 0,
      synced: 0,
      failed: 0,
      retrying: 0,
      syncedOffline: 0,
      stoppedReason: null,
    };
    if (this.running) return { ...report, stoppedReason: "already_running" };
    const online = this.options.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
    if (!online()) return { ...report, stoppedReason: "offline" };

    this.running = true;
    const { outbox, transport, userId, batchSize = 25 } = this.options;
    try {
      // Keep going while there is due work, one batch at a time.
      for (let round = 0; round < 20; round += 1) {
        const batch = await outbox.claimDue(userId, batchSize);
        if (batch.length === 0) break;
        report.attempted += batch.length;

        let results;
        try {
          results = await transport(batch);
          if (results.length !== batch.length)
            throw new Error("Server returned an incomplete response");
        } catch (error) {
          for (const entry of batch) await outbox.markRetry(entry.mutationId, describe(error));
          report.retrying += batch.length;
          break;
        }

        let stop = false;
        for (let i = 0; i < batch.length; i += 1) {
          const entry = batch[i] as OutboxEntry;
          const result = results[i]!;
          if (stop) {
            await outbox.release(entry.mutationId);
            continue;
          }
          switch (result.status) {
            case "applied":
            case "duplicate":
              await outbox.markSynced(entry.mutationId, result.serverVersion);
              report.synced += 1;
              if (entry.createdOffline) report.syncedOffline += 1;
              break;
            case "conflict":
              await outbox.markFailed(
                entry.mutationId,
                "conflict",
                result.message,
                result.serverVersion,
                result.record ?? null,
              );
              report.failed += 1;
              break;
            case "rejected":
              await outbox.markFailed(entry.mutationId, "rejected", result.message);
              report.failed += 1;
              break;
            case "auth_required":
              await outbox.release(entry.mutationId);
              report.stoppedReason = "auth_required";
              stop = true;
              break;
          }
        }
        if (stop) break;
      }
      return report;
    } finally {
      this.running = false;
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "Network error";
}
