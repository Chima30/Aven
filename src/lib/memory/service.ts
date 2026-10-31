import type { MemoryJobStatus, MemoryRecordRow } from "@/lib/supabase/database.types";
import type { MemoryClient } from "./client";
import {
  formatMemoryText,
  memoryContentHash,
  memoryLabel,
  parseMemoryText,
  UnsafeMemoryContentError,
} from "./format";
import { canRecall, evaluateMemoryCandidate, type MemoryPolicyContext } from "./policy";
import type { MemoryCandidate, MemoryCategory, RecalledMemory } from "./types";

/**
 * Walrus Memory service: the ONLY code that writes to or recalls from MemWal.
 *
 * Every write passes evaluateMemoryCandidate() (consent, pause, durability,
 * sensitive-content guard) immediately before the SDK call. Every recall
 * drops forgotten memories and categories without consent. Dependencies are
 * injected so tests run the same logic against the official MemWalMock.
 */

export const MAX_ATTEMPTS = 5;

export type NewMemoryRecord = Pick<
  MemoryRecordRow,
  "user_id" | "category" | "kind" | "label" | "content_hash" | "pending_text"
> & { source_refs: Array<{ table: string; id: string }> };

export type MemoryRecordPatch = Partial<
  Pick<
    MemoryRecordRow,
    | "status"
    | "job_id"
    | "job_status"
    | "blob_id"
    | "pending_text"
    | "attempts"
    | "last_error"
    | "submitted_at"
    | "stored_at"
    | "suppressed_at"
  >
>;

/** Persistence for memory bookkeeping (Supabase in production, in-memory in tests). */
export interface MemoryRepository {
  findByHash(userId: string, contentHash: string): Promise<MemoryRecordRow | null>;
  /** Inserts, or returns the existing row if (user_id, content_hash) already exists. */
  insert(row: NewMemoryRecord): Promise<MemoryRecordRow>;
  update(userId: string, id: string, patch: MemoryRecordPatch): Promise<void>;
  get(userId: string, id: string): Promise<MemoryRecordRow | null>;
  listForProcessing(userId: string, limit: number): Promise<MemoryRecordRow[]>;
  suppressed(userId: string): Promise<{ blobIds: Set<string>; hashes: Set<string> }>;
  suppressAll(userId: string, at: string): Promise<number>;
}

export interface MemoryServiceDeps {
  client: MemoryClient;
  repo: MemoryRepository;
  /** The authenticated user's namespace (see namespace.ts). */
  namespace: string;
  now?: () => Date;
}

export type RememberOutcome =
  | { status: "skipped"; reason: string }
  | { status: "duplicate"; record: MemoryRecordRow }
  | { status: "submitted"; record: MemoryRecordRow; jobId: string }
  | { status: "queued"; record: MemoryRecordRow; error: string }
  | { status: "failed"; record: MemoryRecordRow; error: string };

const JOB_STATUSES = new Set<MemoryJobStatus>([
  "pending",
  "running",
  "uploaded",
  "done",
  "failed",
  "not_found",
]);

function nowIso(deps: MemoryServiceDeps) {
  return (deps.now?.() ?? new Date()).toISOString();
}

/** Error text safe to store and show: no secrets, short. */
export function describeMemwalError(error: unknown): { message: string; rateLimited: boolean } {
  const name = error instanceof Error ? error.name : "";
  if (name === "MemWalRateLimitedError") {
    return {
      message: "The Walrus Memory relayer is rate limiting requests; AVEN will retry.",
      rateLimited: true,
    };
  }
  if (name === "TimeoutError" || /timed? ?out/i.test(String((error as Error)?.message ?? ""))) {
    return {
      message: "The Walrus Memory relayer did not respond in time; AVEN will retry.",
      rateLimited: false,
    };
  }
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/[0-9a-f]{40,}/gi, "[redacted]")
    .replace(/suiprivkey1\w+/gi, "[redacted]")
    .slice(0, 300);
  return { message: message || "Walrus Memory request failed.", rateLimited: false };
}

async function submit(
  deps: MemoryServiceDeps,
  record: MemoryRecordRow,
  text: string,
): Promise<RememberOutcome> {
  const attempts = record.attempts + 1;
  try {
    const accepted = await deps.client.remember(text, deps.namespace, {
      // Unique per attempt; dedupe:true makes the relayer reuse an identical live memory.
      idempotencyKey: `aven-${record.id}-${attempts}`,
      dedupe: true,
    });
    const jobStatus = JOB_STATUSES.has(accepted.status as MemoryJobStatus)
      ? (accepted.status as MemoryJobStatus)
      : "pending";
    const patch: MemoryRecordPatch = {
      status: "submitted",
      job_id: accepted.job_id,
      job_status: jobStatus,
      attempts,
      last_error: null,
      submitted_at: nowIso(deps),
      pending_text: text,
    };
    await deps.repo.update(record.user_id, record.id, patch);
    return { status: "submitted", record: { ...record, ...patch }, jobId: accepted.job_id };
  } catch (error) {
    const { message } = describeMemwalError(error);
    const giveUp = attempts >= MAX_ATTEMPTS;
    const patch: MemoryRecordPatch = {
      status: giveUp ? "failed" : "queued",
      attempts,
      last_error: message,
      pending_text: giveUp ? null : text,
    };
    await deps.repo.update(record.user_id, record.id, patch);
    const next = { ...record, ...patch };
    return giveUp
      ? { status: "failed", record: next, error: message }
      : { status: "queued", record: next, error: message };
  }
}

/**
 * Stores one memory in Walrus (asynchronously: returns once the relayer has
 * accepted the job). Identical text is never written twice.
 */
export async function rememberCandidate(
  deps: MemoryServiceDeps,
  userId: string,
  candidate: MemoryCandidate,
  ctx: MemoryPolicyContext,
): Promise<RememberOutcome> {
  const decision = evaluateMemoryCandidate(candidate, ctx);
  if (!decision.allowed) return { status: "skipped", reason: decision.reason };

  let text: string;
  try {
    text = formatMemoryText(candidate);
  } catch (error) {
    if (error instanceof UnsafeMemoryContentError)
      return { status: "skipped", reason: "unsafe_content" };
    throw error;
  }
  const hash = memoryContentHash(text);

  const existing = await deps.repo.findByHash(userId, hash);
  if (existing) {
    if (existing.status === "queued" || existing.status === "failed") {
      return submit(
        deps,
        { ...existing, attempts: existing.status === "failed" ? 0 : existing.attempts },
        text,
      );
    }
    return { status: "duplicate", record: existing };
  }

  const record = await deps.repo.insert({
    user_id: userId,
    category: candidate.category,
    kind: candidate.kind,
    label: memoryLabel(candidate),
    content_hash: hash,
    pending_text: text,
    source_refs: candidate.sourceRefs.map((r) => ({ table: r.table, id: r.id })),
  });
  if (record.status !== "queued" || record.job_id) return { status: "duplicate", record };
  return submit(deps, record, text);
}

export interface RefreshSummary {
  checked: number;
  stored: number;
  resubmitted: number;
  failed: number;
  stillPending: number;
}

/**
 * Advances queued and in-flight memories: polls MemWal job status, records the
 * Walrus blob id when a job is done, and retries failed/rate-limited writes.
 */
export async function refreshMemoryJobs(
  deps: MemoryServiceDeps,
  userId: string,
  options: { limit?: number; deadlineMs?: number } = {},
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    checked: 0,
    stored: 0,
    resubmitted: 0,
    failed: 0,
    stillPending: 0,
  };
  const deadline = Date.now() + (options.deadlineMs ?? 20_000);
  const records = await deps.repo.listForProcessing(userId, options.limit ?? 20);

  for (const record of records) {
    if (Date.now() > deadline) break;
    summary.checked += 1;

    if (record.status === "queued") {
      if (!record.pending_text) continue;
      const outcome = await submit(deps, record, record.pending_text);
      if (outcome.status === "submitted") summary.resubmitted += 1;
      else if (outcome.status === "failed") summary.failed += 1;
      else summary.stillPending += 1;
      continue;
    }
    if (!record.job_id) continue;

    let job;
    try {
      job = await deps.client.getRememberStatus(record.job_id);
    } catch (error) {
      await deps.repo.update(userId, record.id, { last_error: describeMemwalError(error).message });
      summary.stillPending += 1;
      continue;
    }

    // A forgotten memory whose job finished: keep it suppressed, but learn its blob id
    // so recall can exclude it.
    if (record.status === "suppressed") {
      if (job.status === "done" && job.blob_id) {
        await deps.repo.update(userId, record.id, { blob_id: job.blob_id, job_status: "done" });
      }
      continue;
    }

    if (job.status === "done" && job.blob_id) {
      if (job.namespace && job.namespace !== deps.namespace) {
        // Never attribute a memory from another namespace to this user.
        await deps.repo.update(userId, record.id, {
          status: "failed",
          job_status: "done",
          pending_text: null,
          last_error: "The relayer reported a different namespace for this job; it was not linked.",
        });
        summary.failed += 1;
        continue;
      }
      await deps.repo.update(userId, record.id, {
        status: "stored",
        job_status: "done",
        blob_id: job.blob_id,
        stored_at: nowIso(deps),
        pending_text: null,
        last_error: null,
      });
      summary.stored += 1;
    } else if (job.status === "failed" || job.status === "not_found") {
      const error = job.error
        ? describeMemwalError(new Error(job.error)).message
        : `Job ${job.status}`;
      if (record.pending_text && record.attempts < MAX_ATTEMPTS) {
        await deps.repo.update(userId, record.id, { job_status: job.status, last_error: error });
        const outcome = await submit(deps, record, record.pending_text);
        if (outcome.status === "submitted") summary.resubmitted += 1;
        else if (outcome.status === "failed") summary.failed += 1;
        else summary.stillPending += 1;
      } else {
        await deps.repo.update(userId, record.id, {
          status: "failed",
          job_status: job.status,
          pending_text: null,
          last_error: error,
        });
        summary.failed += 1;
      }
    } else {
      if (record.job_status !== job.status) {
        await deps.repo.update(userId, record.id, { job_status: job.status });
      }
      summary.stillPending += 1;
    }
  }
  return summary;
}

/**
 * Recalls memories relevant to `query` from the user's namespace, drops any
 * the user has forgotten or any category without consent, and parses the rest.
 * Malformed or non-AVEN texts are ignored.
 */
export async function recallMemories(
  deps: MemoryServiceDeps,
  userId: string,
  query: string,
  ctx: MemoryPolicyContext,
  options: { limit?: number; categories?: MemoryCategory[] } = {},
): Promise<RecalledMemory[]> {
  const categories = options.categories ?? ["memory_financial"];
  if (!categories.some((c) => canRecall(c, ctx))) return [];
  const [result, suppressed] = await Promise.all([
    deps.client.recall({ query, namespace: deps.namespace, limit: options.limit ?? 20 }),
    deps.repo.suppressed(userId),
  ]);
  const memories: RecalledMemory[] = [];
  const seen = new Set<string>();
  for (const hit of result.results) {
    if (suppressed.blobIds.has(hit.blob_id)) continue;
    if (suppressed.hashes.has(memoryContentHash(hit.text))) continue;
    const parsed = parseMemoryText(hit.text, {
      blobId: hit.blob_id,
      distance: hit.distance,
      createdAt: hit.created_at ?? null,
    });
    if (!parsed || !canRecall(parsed.category, ctx) || !categories.includes(parsed.category))
      continue;
    if (seen.has(hit.blob_id)) continue;
    seen.add(hit.blob_id);
    memories.push(parsed);
  }
  return memories;
}

/** "Forget": AVEN permanently stops using the memory. Walrus deletion is not available. */
export async function forgetMemory(
  deps: MemoryServiceDeps,
  userId: string,
  recordId: string,
): Promise<"forgotten" | "not_found" | "already_forgotten"> {
  const record = await deps.repo.get(userId, recordId);
  if (!record) return "not_found";
  if (record.status === "suppressed") return "already_forgotten";
  await deps.repo.update(userId, recordId, {
    status: "suppressed",
    suppressed_at: nowIso(deps),
    pending_text: null,
  });
  return "forgotten";
}

export async function forgetAllMemories(
  deps: Pick<MemoryServiceDeps, "repo" | "now">,
  userId: string,
) {
  return deps.repo.suppressAll(userId, (deps.now?.() ?? new Date()).toISOString());
}
