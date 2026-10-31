import type { Outbox } from "./outbox";
import type { SyncTransport } from "./types";

export interface SyncRunReport {
  attempted: number;
  synced: number;
  failed: number;
  retrying: number;
  stoppedReason: "offline" | "auth_required" | "already_running" | null;
}

export interface SyncEngineOptions {
  outbox: Outbox;
  transport: SyncTransport;
  userId: string;
  isOnline?: () => boolean;
}

/**
 * Processes the outbox for one user, oldest change first.
 *
 * Guarantees:
 * - Only one run at a time per engine (single-flight).
 * - A network failure stops the run (the network is probably down) and schedules a retry.
 * - "duplicate" from the server means the change already landed → marked synced, not re-sent.
 * - Conflicts and rejections are marked failed and left for the user; nothing is overwritten.
 * - If the session has expired, entries are released untouched until the user signs in again.
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
      stoppedReason: null,
    };
    if (this.running) return { ...report, stoppedReason: "already_running" };
    const online = this.options.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
    if (!online()) return { ...report, stoppedReason: "offline" };

    this.running = true;
    const { outbox, transport, userId } = this.options;
    try {
      const batch = await outbox.claimDue(userId);
      for (let i = 0; i < batch.length; i += 1) {
        const entry = batch[i]!;
        report.attempted += 1;
        let result;
        try {
          result = await transport(entry);
        } catch (error) {
          await outbox.markRetry(entry.mutationId, describe(error));
          report.retrying += 1;
          // Release the rest of the batch; they will be retried with the next run.
          for (const rest of batch.slice(i + 1)) await outbox.release(rest.mutationId);
          break;
        }

        switch (result.status) {
          case "applied":
          case "duplicate":
            await outbox.markSynced(entry.mutationId, result.serverVersion);
            report.synced += 1;
            break;
          case "conflict":
            await outbox.markFailed(
              entry.mutationId,
              "conflict",
              result.message,
              result.serverVersion,
            );
            report.failed += 1;
            break;
          case "rejected":
            await outbox.markFailed(entry.mutationId, "rejected", result.message);
            report.failed += 1;
            break;
          case "auth_required":
            for (const rest of batch.slice(i)) await outbox.release(rest.mutationId);
            report.stoppedReason = "auth_required";
            return report;
        }
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
