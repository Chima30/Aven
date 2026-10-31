import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MemoryRecordRow } from "@/lib/supabase/database.types";
import type { MemoryRecordPatch, MemoryRepository, NewMemoryRecord } from "./service";

/**
 * Supabase implementation of MemoryRepository.
 *
 * It uses the ADMIN client because memory_records holds evidence that came
 * from the MemWal relayer (job ids, blob ids, statuses); users can read their
 * rows but cannot write them, so these values cannot be forged from a
 * browser. EVERY query is filtered by the authenticated user's id, which the
 * caller takes from the verified session — never from request input.
 */
export function supabaseMemoryRepository(admin: SupabaseClient<Database>): MemoryRepository {
  const table = () => admin.from("memory_records");

  function fail(op: string, error: { message: string } | null): never {
    throw new Error(`memory_records ${op} failed${error ? `: ${error.message}` : ""}`);
  }

  return {
    async findByHash(userId, contentHash) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (error) fail("lookup", error);
      return data;
    },

    async insert(row: NewMemoryRecord) {
      const { data, error } = await table()
        .upsert(
          { ...row, status: "queued" },
          { onConflict: "user_id,content_hash", ignoreDuplicates: true },
        )
        .select("*")
        .maybeSingle();
      if (error) fail("insert", error);
      if (data) return data;
      // Already existed (concurrent insert): return the existing row.
      const existing = await this.findByHash(row.user_id, row.content_hash);
      if (!existing) fail("insert", null);
      return existing;
    },

    async update(userId, id, patch: MemoryRecordPatch) {
      const { error } = await table().update(patch).eq("user_id", userId).eq("id", id);
      if (error) fail("update", error);
    },

    async get(userId, id) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("get", error);
      return data;
    },

    async listForProcessing(userId, limit) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .or(
          "status.eq.queued,status.eq.submitted,and(status.eq.suppressed,job_id.not.is.null,blob_id.is.null)",
        )
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) fail("list", error);
      return (data ?? []) as MemoryRecordRow[];
    },

    async suppressed(userId) {
      const { data, error } = await table()
        .select("blob_id, content_hash")
        .eq("user_id", userId)
        .eq("status", "suppressed");
      if (error) fail("suppressed", error);
      const blobIds = new Set<string>();
      const hashes = new Set<string>();
      for (const row of data ?? []) {
        if (row.blob_id) blobIds.add(row.blob_id);
        hashes.add(row.content_hash);
      }
      return { blobIds, hashes };
    },

    async suppressAll(userId, at) {
      const { data, error } = await table()
        .update({ status: "suppressed", suppressed_at: at, pending_text: null })
        .eq("user_id", userId)
        .neq("status", "suppressed")
        .select("id");
      if (error) fail("suppress", error);
      return data?.length ?? 0;
    },
  };
}
