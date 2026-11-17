import type { RecommendationRow } from "@/lib/supabase/database.types";
import type { RecommendationDraft } from "./recommend";

/**
 * Same-month revisions.
 *
 * Recommendations are stored once per kind, subject and month. After the user
 * answers, AVEN may look again ONCE in the same month (revision 2), and only
 * when the numbers changed materially — so it can adapt to a new situation
 * without repeating itself:
 *
 *   - only after a decline or a change (an accepted plan is not re-asked);
 *   - only when the figure the advice is about grew by ≥ MATERIAL_CHANGE_PCT
 *     since the answer (spending projection, or the monthly amount a goal needs);
 *   - never a third time in the month.
 *
 * The revised draft is built by the normal engine, so it already reflects the
 * user's earlier answer through the learning signals (e.g. a gentler cut).
 */

export const MATERIAL_CHANGE_PCT = 10;

/** The evidence field a kind's advice depends on, if it can be revised at all. */
const WATCHED: Partial<Record<RecommendationDraft["kind"], string>> = {
  reduce_category_spend: "observed_minor",
  goal_contribution: "required_monthly_minor",
};

type Existing = Pick<RecommendationRow, "id" | "dedupe_key" | "status" | "evidence" | "kind">;

export interface RevisionResult {
  drafts: RecommendationDraft[];
  /** Why each revision was made (for the explanation and tests). */
  revised: Array<{ dedupeKey: string; previousId: string; from: number; to: number }>;
}

function figure(evidence: unknown, field: string): number | null {
  const v = (evidence as Record<string, unknown> | null)?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function applyRevisions(
  drafts: RecommendationDraft[],
  existing: Existing[],
  describe: (draft: RecommendationDraft, from: number, to: number) => string,
): RevisionResult {
  const byKey = new Map(existing.map((r) => [r.dedupe_key, r]));
  const revised: RevisionResult["revised"] = [];
  const out = drafts.map((draft) => {
    const first = byKey.get(draft.dedupeKey);
    if (!first || first.status === "open" || first.status === "accepted") return draft;
    if (byKey.has(`${draft.dedupeKey}:r2`)) return draft; // already revised this month
    const field = WATCHED[draft.kind];
    if (!field) return draft;
    const before = figure(first.evidence, field);
    const now = figure(draft.evidence, field);
    if (before === null || now === null || before <= 0) return draft;
    if (now < before * (1 + MATERIAL_CHANGE_PCT / 100)) return draft;
    revised.push({ dedupeKey: draft.dedupeKey, previousId: first.id, from: before, to: now });
    return {
      ...draft,
      dedupeKey: `${draft.dedupeKey}:r2`,
      revision: 2,
      explanation: `${describe(draft, before, now)} ${draft.explanation}`.slice(0, 2000),
      evidence: {
        ...draft.evidence,
        revised_from_id: first.id,
        revised_from_minor: before,
      },
    };
  });
  return { drafts: out, revised };
}
