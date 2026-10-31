import type { MemoryCandidate, MemoryCategory } from "./types";

export const MAX_MEMORY_SUMMARY_LENGTH = 500;

export interface MemoryPolicyContext {
  /** Categories the user has currently granted (from public.consent_state). */
  grantedCategories: ReadonlySet<string>;
  /** user_preferences.memory_paused */
  memoryPaused: boolean;
  /** True only once a verified backend exists (Stage 6). */
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
        | "no_source";
    };

/**
 * The gate every memory must pass before it can be stored.
 * Deterministic and testable; the AI cannot bypass it.
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
  if (summary.length === 0 || summary.length > MAX_MEMORY_SUMMARY_LENGTH) {
    return { allowed: false, reason: "invalid_summary" };
  }
  if (candidate.sourceRefs.length === 0) return { allowed: false, reason: "no_source" };
  return { allowed: true };
}
