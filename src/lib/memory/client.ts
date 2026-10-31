import "server-only";
import {
  MemWal,
  type HealthResult,
  type RecallParams,
  type RecallResult,
  type RememberAcceptedResult,
  type RememberJobStatus,
  type RememberOptions,
} from "@mysten-incubation/memwal";
import type { MemwalConfig } from "@/lib/integrations/config";

/**
 * The subset of the official MemWal SDK (@mysten-incubation/memwal) that AVEN
 * uses. Both the real `MemWal` client and the SDK's own `MemWalMock` satisfy
 * it, so tests exercise exactly the same calls as production.
 *
 * Verified against @mysten-incubation/memwal 0.1.12 type declarations:
 *   remember(text, namespace, { idempotencyKey, dedupe }) → { job_id, status }
 *   getRememberStatus(jobId) → { status: pending|running|uploaded|done|failed|not_found, blob_id? }
 *   recall({ query, namespace, limit }) → { results: [{ blob_id, text, distance, created_at? }] }
 *   health() → { status, version, write_ready? }
 * The SDK has NO delete/forget method for real relayers (only the mock has one).
 */
export interface MemoryClient {
  health(): Promise<HealthResult>;
  remember(
    text: string,
    namespace: string,
    options?: RememberOptions,
  ): Promise<RememberAcceptedResult>;
  getRememberStatus(jobId: string): Promise<RememberJobStatus>;
  recall(params: RecallParams): Promise<RecallResult>;
}

let cached: { key: string; client: MemWal } | undefined;

/** One SDK client per server process (the delegate key never leaves the server). */
export function createMemwalClient(config: MemwalConfig): MemoryClient {
  const cacheKey = `${config.accountId}|${config.serverUrl}|${config.namespace}`;
  if (cached?.key === cacheKey) return cached.client;
  const client = MemWal.create({
    key: config.privateKey,
    accountId: config.accountId,
    serverUrl: config.serverUrl,
    // Every call passes an explicit per-user namespace; this default is never relied on.
    namespace: `${config.namespace}-unused-default`,
    requestTimeoutMs: 15_000,
    recallTimeoutMs: 10_000,
    preflightTimeoutMs: 8_000,
  });
  cached = { key: cacheKey, client };
  return client;
}
