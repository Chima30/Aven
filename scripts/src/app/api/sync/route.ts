import { NextResponse, type NextRequest } from "next/server";
import { applyMutation } from "@/lib/finance/mutate";
import { applyLifeMutation } from "@/lib/life/mutate";
import { lifeSyncMutationSchema } from "@/lib/life/schemas";
import { syncMutationSchema, syncRequestSchema } from "@/lib/finance/schemas";
import { publicEnv } from "@/lib/env";
import type { SyncResult } from "@/lib/offline/types";
import { originCheckFromRequest } from "@/lib/security/origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Offline sync endpoint. Receives a batch of queued changes from the
 * browser's IndexedDB outbox and applies them, in order, with the user's own
 * session: transactions through apply_finance_mutation(), planning and
 * wellbeing quick entries through apply_life_mutation().
 *
 * Responses:
 *   200 { results: SyncResult[] }  — one result per mutation, same order
 *   401                            — session expired (client keeps everything queued)
 *   400 / 403 / 429                — client keeps everything queued and retries later
 */
export async function POST(request: NextRequest) {
  if (!originCheckFromRequest(request, [publicEnv().NEXT_PUBLIC_SITE_URL])) {
    return NextResponse.json({ error: "cross_site" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  if (!(await consumeRateLimit(supabase, "sync"))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
  }

  const { batchId, deviceId, mutations, offlineCount } = parsed.data;
  const results: SyncResult[] = [];
  let appliedOffline = 0;
  for (const raw of mutations) {
    // Each change is validated on its own: an invalid one is rejected (and kept on
    // the device for the user to fix) without blocking the others.
    const isLife =
      typeof raw === "object" &&
      raw !== null &&
      (raw as { entity?: unknown }).entity !== "transaction";
    const check = isLife
      ? lifeSyncMutationSchema.safeParse(raw)
      : syncMutationSchema.safeParse(raw);
    if (!check.success) {
      const issue = check.error.issues[0];
      results.push({
        status: "rejected",
        message: issue?.message ?? "Some of the details are not valid.",
      });
      continue;
    }
    const m = check.data;
    try {
      const input = {
        mutationId: m.mutationId,
        operation: m.operation,
        recordId: m.recordId,
        payload: m.payload as Record<string, unknown>,
        baseVersion: m.baseVersion,
        deviceId,
      };
      const r =
        m.entity === "transaction"
          ? await applyMutation(supabase, { ...input, entity: m.entity })
          : await applyLifeMutation(supabase, { ...input, entity: m.entity });
      if (r.status === "applied") {
        results.push({ status: "applied", serverVersion: r.server_version ?? null });
        appliedOffline += 1;
      } else if (r.status === "conflict") {
        results.push({
          status: "conflict",
          serverVersion: r.server_version ?? null,
          message: r.message ?? "This change conflicts with the server copy.",
          record: r.record ?? null,
        });
      } else {
        results.push({
          status: "rejected",
          message: r.message ?? "The server refused this change.",
        });
      }
    } catch {
      // Infrastructure failure part-way: report the batch as failed so the
      // client retries. Already-applied mutations replay safely (idempotent).
      return NextResponse.json({ error: "server_error" }, { status: 503 });
    }
  }

  if (offlineCount > 0 && appliedOffline > 0) {
    await supabase.rpc("record_sync_completed", {
      p_batch_id: batchId,
      p_applied: Math.min(appliedOffline, offlineCount),
    });
  }

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
