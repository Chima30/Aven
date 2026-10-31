import type { OutboxEntry, SyncResult, SyncTransport } from "./types";

/**
 * Browser transport: POSTs a batch to /api/sync with the user's cookies.
 * - Network failure or 5xx/429/400 → throws (the engine retries with backoff).
 * - 401 → every entry reports auth_required (kept queued until sign-in).
 */
export function httpTransport(
  deviceId: string | null,
  fetchImpl: typeof fetch = fetch,
): SyncTransport {
  return async (entries: OutboxEntry[]): Promise<SyncResult[]> => {
    const response = await fetchImpl("/api/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId: crypto.randomUUID(),
        deviceId,
        offlineCount: entries.filter((e) => e.createdOffline).length,
        mutations: entries.map((e) => ({
          mutationId: e.mutationId,
          entity: e.entity,
          operation: e.operation,
          recordId: e.recordId,
          baseVersion: e.baseVersion,
          payload: e.payload ?? {},
        })),
      }),
    });
    if (response.status === 401) return entries.map(() => ({ status: "auth_required" }));
    if (!response.ok) throw new Error(`Sync failed (${response.status})`);
    const body = (await response.json()) as { results?: SyncResult[] };
    if (!Array.isArray(body.results)) throw new Error("Malformed sync response");
    return body.results;
  };
}
