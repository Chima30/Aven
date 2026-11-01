import { MAX_SUMMARY_LENGTH, findUnsafeContent } from "./format";
import type { MemoryCandidate, MemoryCategory } from "./types";

/** @deprecated kept for compatibility; summaries are capped by MAX_SUMMARY_LENGTH. */
export const MAX_MEMORY_SUMMARY_LENGTH = MAX_SUMMARY_LENGTH;

export interface MemoryPolicyContext {
  /** Categories the user has currently granted (from public.consent_state). */
  grantedCategories: ReadonlySet<string>;
  /** user_preferences.memory_paused */
  memoryPaused: boolean;
  /** True only when Walrus Memory is configured on this server. */
  backendAvailable: boolean;
}

export type MemoryPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "backend_unavailable"
        | "memory_paused"
        | "no_consent"
        | "temporary"
        | "invalid_summary"
        | "no_source"
        | "unsafe_content";
    };

/**
 * The gate every memory must pass before it can be stored. Deterministic and
 * testable; no caller (and no AI) can bypass it, because the memory service
 * calls it immediately before every Walrus write.
 */
export function evaluateMemoryCandidate(
  candidate: MemoryCandidate,
  ctx: MemoryPolicyContext,
): MemoryPolicyDecision {
  if (!ctx.backendAvailable) return { allowed: false, reason: "backend_unavailable" };
  if (ctx.memoryPaused) return { allowed: false, reason: "memory_paused" };
  if (!ctx.grantedCategories.has(candidate.category satisfies MemoryCategory)) {
    return { allowed: false, reason: "no_consent" };
  }
  if (candidate.durability !== "long_term") return { allowed: false, reason: "temporary" };
  const summary = candidate.summary.trim();
  if (summary.length === 0 || summary.length > MAX_SUMMARY_LENGTH) {
    return { allowed: false, reason: "invalid_summary" };
  }
  if (candidate.sourceRefs.length === 0) return { allowed: false, reason: "no_source" };
  const everything = [
    candidate.label,
    candidate.summary,
    ...Object.entries(candidate.facts).map(([k, v]) => `${k} ${String(v)}`),
  ].join("\n");
  if (findUnsafeContent(everything)) return { allowed: false, reason: "unsafe_content" };
  return { allowed: true };
}

/** Recall is allowed under the same consent, pause and backend conditions. */
export function canRecall(category: MemoryCategory, ctx: MemoryPolicyContext): boolean {
  return ctx.backendAvailable && !ctx.memoryPaused && ctx.grantedCategories.has(category);
}
