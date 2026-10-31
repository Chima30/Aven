import { randomUUID } from "node:crypto";
import type { MemoryRecordRow } from "@/lib/supabase/database.types";
import type { MemoryRepository } from "@/lib/memory/service";

/** In-memory MemoryRepository with the same rules as the memory_records table. */
export function inMemoryRepo(): MemoryRepository & { rows: MemoryRecordRow[] } {
  const rows: MemoryRecordRow[] = [];
  const now = () => new Date().toISOString();
  return {
    rows,
    async findByHash(userId, hash) {
      return rows.find((r) => r.user_id === userId && r.content_hash === hash) ?? null;
    },
    async insert(row) {
      const existing = rows.find(
        (r) => r.user_id === row.user_id && r.content_hash === row.content_hash,
      );
      if (existing) return existing;
      const created: MemoryRecordRow = {
        id: randomUUID(),
        supersedes: null,
        status: "queued",
        job_id: null,
        job_status: null,
        blob_id: null,
        attempts: 0,
        last_error: null,
        created_at: now(),
        updated_at: now(),
        submitted_at: null,
        stored_at: null,
        suppressed_at: null,
        ...row,
      };
      rows.push(created);
      return created;
    },
    async update(userId, id, patch) {
      const row = rows.find((r) => r.user_id === userId && r.id === id);
      if (!row) return;
      if (row.status === "suppressed" && patch.status && patch.status !== "suppressed") {
        throw new Error("A forgotten memory cannot be restored");
      }
      Object.assign(row, patch, { updated_at: now() });
      if ((row.status === "stored" || row.status === "suppressed") && row.pending_text !== null) {
        throw new Error("memory_records_outbox_cleared violated");
      }
    },
    async get(userId, id) {
      return rows.find((r) => r.user_id === userId && r.id === id) ?? null;
    },
    async listForProcessing(userId, limit) {
      return rows
        .filter(
          (r) =>
            r.user_id === userId &&
            (r.status === "queued" ||
              r.status === "submitted" ||
              (r.status === "suppressed" && r.job_id !== null && r.blob_id === null)),
        )
        .slice(0, limit);
    },
    async suppressed(userId) {
      const s = rows.filter((r) => r.user_id === userId && r.status === "suppressed");
      return {
        blobIds: new Set(s.map((r) => r.blob_id).filter((b): b is string => !!b)),
        hashes: new Set(s.map((r) => r.content_hash)),
      };
    },
    async suppressAll(userId, at) {
      let n = 0;
      for (const r of rows) {
        if (r.user_id === userId && r.status !== "suppressed") {
          Object.assign(r, { status: "suppressed", suppressed_at: at, pending_text: null });
          n += 1;
        }
      }
      return n;
    },
  };
}
