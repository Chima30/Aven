"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AmountError, decimalSeparatorFor, parsePositiveAmount } from "@/lib/finance/amount-input";
import { localToday } from "@/lib/finance/periods";
import { applyMutation } from "@/lib/finance/mutate";
import { formValue, type FormState } from "@/lib/forms";
import { outcomeMemoryCandidate, savingsTargetCandidate } from "@/lib/intelligence/memories";
import {
  forgetAllMemories,
  forgetMemory,
  recallMemories,
  refreshMemoryJobs,
  rememberCandidate,
} from "@/lib/memory/service";
import { memoryRuntimeFor } from "@/lib/memory/runtime";
import { canRecall } from "@/lib/memory/policy";
import type { MemoryCategory } from "@/lib/memory/types";
import { correctionCandidate } from "@/lib/life/memory-candidates";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrency, isCurrencyCode, type CurrencyCode } from "@/lib/money/currencies";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};
const RATE_LIMITED: FormState = {
  status: "error",
  message: "That's a lot of requests in a short time. Please wait a few minutes.",
};

async function session() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

/* ------------------------------------------------------------- Memory */

const idSchema = z.uuid();

export async function forgetMemoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const id = idSchema.safeParse(formValue(formData, "id"));
  if (!id.success) return { status: "error", message: "That memory wasn't found." };
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available) {
    return { status: "error", message: "Walrus Memory isn't configured on this server." };
  }
  const result = await forgetMemory(runtime.deps, ctx.user.id, id.data);
  revalidatePath("/intelligence/memory");
  if (result === "not_found") return { status: "error", message: "That memory wasn't found." };
  return {
    status: "success",
    message: "Forgotten. AVEN will never use this memory again.",
  };
}

export async function forgetAllMemoriesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  if (formValue(formData, "confirmation").trim().toUpperCase() !== "FORGET") {
    return { status: "error", fieldErrors: { confirmation: "Type FORGET to confirm." } };
  }
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available) {
    return { status: "error", message: "Walrus Memory isn't configured on this server." };
  }
  const count = await forgetAllMemories(runtime.deps, ctx.user.id);
  revalidatePath("/intelligence/memory");
  revalidatePath("/intelligence");
  return {
    status: "success",
    message: `${count} memor${count === 1 ? "y" : "ies"} forgotten. AVEN will never use them again.`,
  };
}

export async function refreshMemoryAction(): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  if (!(await consumeRateLimit(ctx.supabase, "memory_read"))) return RATE_LIMITED;
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available) {
    return { status: "error", message: "Walrus Memory isn't configured on this server." };
  }
  const summary = await refreshMemoryJobs(runtime.deps, ctx.user.id, { deadlineMs: 20_000 });
  revalidatePath("/intelligence/memory");
  return {
    status: "success",
    message:
      summary.checked === 0
        ? "Nothing is waiting — every memory is up to date."
        : `Checked ${summary.checked}: ${summary.stored} confirmed on Walrus, ${summary.stillPending} still in progress, ${summary.resubmitted} retried, ${summary.failed} failed.`,
  };
}

export type WalrusContentsState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; items: Array<{ blobId: string; text: string }> };

/** Reads memory contents back FROM WALRUS (proves the text lives there, not in Supabase). */
export async function loadWalrusContentsAction(): Promise<WalrusContentsState> {
  const ctx = await session();
  if (!ctx) return { status: "error", message: SESSION_EXPIRED.message! };
  if (!(await consumeRateLimit(ctx.supabase, "memory_read"))) {
    return { status: "error", message: RATE_LIMITED.message! };
  }
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available) return { status: "error", message: "Walrus Memory isn't configured." };
  const categories = (["memory_financial", "memory_planning", "memory_wellbeing"] as const).filter(
    (c) => canRecall(c, runtime.ctx),
  );
  if (categories.length === 0) {
    return {
      status: "error",
      message: "Memory is paused or not allowed, so AVEN won't read from Walrus.",
    };
  }
  const QUERIES: Record<(typeof categories)[number], string> = {
    memory_financial: "AVEN memory financial summary recommendation savings budget income",
    memory_planning: "AVEN memory planning habit routine review focus reminder preference",
    memory_wellbeing: "AVEN memory wellbeing sleep water activity meals mood routine",
  };
  try {
    const batches = await Promise.all(
      categories.map((c) =>
        recallMemories(runtime.deps, ctx.user.id, QUERIES[c], runtime.ctx, {
          limit: 50,
          categories: [c],
        }),
      ),
    );
    const seen = new Set<string>();
    const items: Array<{ blobId: string; text: string }> = [];
    for (const m of batches.flat()) {
      if (seen.has(m.blobId)) continue;
      seen.add(m.blobId);
      items.push({ blobId: m.blobId, text: m.summary });
    }
    return { status: "success", items };
  } catch {
    return { status: "error", message: "Walrus Memory couldn't be reached. Try again shortly." };
  }
}

const correctionSchema = z.object({
  id: z.uuid(),
  statement: z
    .string()
    .trim()
    .min(3, "Say what's right instead.")
    .max(260, "Keep it under 260 characters."),
});

/**
 * Correct a memory: the inaccurate one is forgotten (never recalled again) and
 * the user's own statement is stored as a "correction" memory in its place.
 */
export async function correctMemoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = correctionSchema.safeParse({
    id: formValue(formData, "id"),
    statement: formValue(formData, "statement"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: { statement: parsed.error.issues[0]?.message ?? "Check the correction." },
    };
  }
  if (!(await consumeRateLimit(ctx.supabase, "memory_write"))) return RATE_LIMITED;
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available)
    return { status: "error", message: "Walrus Memory isn't configured on this server." };
  const { data: record } = await ctx.supabase
    .from("memory_records")
    .select("id, category, label")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!record) return { status: "error", message: "That memory wasn't found." };
  const { data: prefs } = await ctx.supabase
    .from("user_preferences")
    .select("time_zone")
    .maybeSingle();
  const forgotten = await forgetMemory(runtime.deps, ctx.user.id, record.id);
  if (forgotten === "not_found") return { status: "error", message: "That memory wasn't found." };
  const outcome = await rememberCandidate(
    runtime.deps,
    ctx.user.id,
    correctionCandidate(
      record.category as MemoryCategory,
      record.label,
      parsed.data.statement,
      localToday(prefs?.time_zone ?? "UTC"),
    ),
    runtime.ctx,
  );
  after(() =>
    refreshMemoryJobs(runtime.deps, ctx.user.id, { deadlineMs: 20_000 }).then(() => undefined),
  );
  revalidatePath("/intelligence/memory");
  if (outcome.status === "skipped") {
    return {
      status: "success",
      message:
        outcome.reason === "unsafe_content"
          ? "The old memory was forgotten. Your correction wasn't stored because it looked like it contained sensitive details."
          : "The old memory was forgotten. Your correction couldn't be stored right now (check consent and pause settings).",
    };
  }
  return {
    status: "success",
    message: "Corrected. The old memory is forgotten and your correction is being saved to Walrus.",
  };
}

const targetSchema = z.coerce.number().int().min(1).max(90);

export async function setSavingsTargetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = targetSchema.safeParse(formValue(formData, "targetPct"));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: { targetPct: "Enter a whole percentage from 1 to 90." },
    };
  }
  if (!(await consumeRateLimit(ctx.supabase, "memory_write"))) return RATE_LIMITED;
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  if (!runtime.available) {
    return {
      status: "error",
      message: "Saving a target needs Walrus Memory, which isn't configured.",
    };
  }
  const { data: prefs } = await ctx.supabase
    .from("user_preferences")
    .select("time_zone")
    .maybeSingle();
  const outcome = await rememberCandidate(
    runtime.deps,
    ctx.user.id,
    savingsTargetCandidate(parsed.data, localToday(prefs?.time_zone ?? "UTC")),
    runtime.ctx,
  );
  after(() =>
    refreshMemoryJobs(runtime.deps, ctx.user.id, { deadlineMs: 20_000 }).then(() => undefined),
  );
  revalidatePath("/intelligence");
  revalidatePath("/intelligence/memory");
  switch (outcome.status) {
    case "skipped":
      return {
        status: "error",
        message:
          outcome.reason === "no_consent"
            ? 'Allow "Remember financial context" in Settings → Privacy first.'
            : outcome.reason === "memory_paused"
              ? "Memory is paused. Un-pause it in Settings → Privacy first."
              : "This target couldn't be saved to memory.",
      };
    case "duplicate":
      return {
        status: "success",
        message: `Your ${parsed.data}% target is already in Walrus Memory.`,
      };
    case "submitted":
      return {
        status: "success",
        message: `Saving your ${parsed.data}% target to Walrus Memory. Your next suggestions will use it.`,
      };
    default:
      return {
        status: "error",
        message: `Walrus Memory didn't accept it yet (${outcome.error}). AVEN will retry.`,
      };
  }
}

/* ------------------------------------------------------ Recommendations */

const respondSchema = z.object({
  id: z.uuid(),
  action: z.enum(["accepted", "rejected", "modified"]),
  note: z.string().trim().max(300).optional(),
});

export async function respondToRecommendationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = respondSchema.safeParse({
    id: formValue(formData, "id"),
    action: formValue(formData, "action"),
    note: formValue(formData, "note") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "That response wasn't recognised." };
  if (!(await consumeRateLimit(ctx.supabase, "recommendations"))) return RATE_LIMITED;

  const { data: rec } = await ctx.supabase
    .from("recommendations")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!rec) return { status: "error", message: "That recommendation wasn't found." };
  if (rec.status !== "open")
    return { status: "error", message: "You've already answered this one." };

  let valueMinor: number | null = null;
  if (parsed.data.action === "modified") {
    const { data: prefs } = await ctx.supabase
      .from("user_preferences")
      .select("locale, number_format")
      .maybeSingle();
    if (!isCurrencyCode(rec.currency_code))
      return { status: "error", message: "Unsupported currency." };
    try {
      const amount = parsePositiveAmount(
        formValue(formData, "amount"),
        rec.currency_code as CurrencyCode,
        prefs ? decimalSeparatorFor(prefs.locale, prefs.number_format) : ".",
      );
      valueMinor = Number(amount.amountMinor);
    } catch (error) {
      const message = error instanceof AmountError ? error.message : "Enter an amount.";
      return { status: "error", fieldErrors: { amount: message } };
    }
  }

  const { data: updated, error } = await ctx.supabase.rpc("respond_to_recommendation", {
    p_id: rec.id,
    p_action: parsed.data.action,
    p_value_minor: valueMinor,
    p_note: parsed.data.note ?? null,
  });
  if (error || !updated) {
    return {
      status: "error",
      message:
        error?.code === "55000"
          ? "You've already answered this one."
          : "Your answer couldn't be saved.",
    };
  }

  // Accepting (or adjusting) a "set a budget" suggestion creates that budget.
  let extra = "";
  if (
    rec.kind === "set_category_budget" &&
    rec.category_id &&
    (parsed.data.action === "accepted" || parsed.data.action === "modified")
  ) {
    const limit = parsed.data.action === "modified" ? valueMinor : rec.suggested_minor;
    const { data: category } = await ctx.supabase
      .from("transaction_categories")
      .select("name")
      .eq("id", rec.category_id)
      .maybeSingle();
    if (limit && category) {
      try {
        const result = await applyMutation(ctx.supabase, {
          mutationId: randomUUID(),
          entity: "budget",
          operation: "create",
          recordId: randomUUID(),
          payload: {
            name: category.name,
            category_id: rec.category_id,
            currency_code: rec.currency_code,
            limit_minor: limit,
            alert_threshold_pct: 80,
            starts_on: `${rec.period}-01`,
          },
        });
        extra =
          result.status === "applied"
            ? " The budget has been created."
            : ` (The budget couldn't be created automatically${result.message ? `: ${result.message}` : ""}.)`;
        if (result.status === "applied") revalidatePath("/money/budgets");
      } catch {
        extra = " (The budget couldn't be created automatically.)";
      }
    }
  }

  // Remember the decision in Walrus so the next recommendation learns from it.
  const runtime = await memoryRuntimeFor(ctx.supabase, ctx.user.id);
  let memoryNote = " Memory is off, so AVEN won't learn from this answer.";
  if (runtime.available) {
    const evidence = rec.evidence as {
      subject_key?: string;
      subject_name?: string;
      suggested_pct?: number | null;
    };
    const minorPerMajor = isCurrencyCode(rec.currency_code)
      ? 10 ** getCurrency(rec.currency_code).minorUnits
      : 100;
    const candidate = outcomeMemoryCandidate(
      updated,
      {
        key: evidence.subject_key ?? rec.dedupe_key.split(":").slice(1, -1).join(":"),
        name: evidence.subject_name ?? rec.title,
      },
      typeof evidence.suggested_pct === "number" ? evidence.suggested_pct : null,
      minorPerMajor,
    );
    try {
      const outcome = await rememberCandidate(runtime.deps, ctx.user.id, candidate, runtime.ctx);
      if (
        outcome.status === "submitted" ||
        outcome.status === "duplicate" ||
        outcome.status === "queued"
      ) {
        memoryNote = " Saved to Walrus Memory — your next suggestions will take it into account.";
        await createAdminClient()
          .from("recommendations")
          .update({ outcome_memory_id: outcome.record.id })
          .eq("id", rec.id)
          .eq("user_id", ctx.user.id);
      } else if (outcome.status === "skipped") {
        memoryNote =
          outcome.reason === "memory_paused"
            ? " Memory is paused, so this wasn't remembered."
            : outcome.reason === "no_consent"
              ? " Allow financial memory in Settings → Privacy so AVEN can learn from answers like this."
              : "";
      } else {
        memoryNote = " Walrus Memory couldn't be reached; AVEN will retry saving this.";
      }
    } catch (e) {
      console.error("[recommendation] memory write failed:", e instanceof Error ? e.name : "error");
      memoryNote = " Walrus Memory couldn't be reached; this answer wasn't remembered.";
    }
    after(() =>
      refreshMemoryJobs(runtime.deps, ctx.user.id, { deadlineMs: 20_000 }).then(() => undefined),
    );
  }

  revalidatePath("/intelligence");
  const verb = {
    accepted: "Accepted.",
    rejected: "Declined.",
    modified: "Updated with your amount.",
  }[parsed.data.action];
  return { status: "success", message: `${verb}${extra}${memoryNote}` };
}
