import type {
  ConsentCategory,
  MemoryRecordKind,
  MemoryRecordRow,
} from "@/lib/supabase/database.types";

/**
 * Walrus Memory domain types.
 *
 * Walrus Memory (MemWal, Mainnet) is AVEN's long-term memory. Each memory is a
 * short, structured text written by AVEN's own deterministic code (never by an
 * AI model) and stored encrypted in Walrus. Supabase keeps only bookkeeping:
 * label, content hash, job id, blob id and status. See docs/MEMORY.md.
 */
export type MemoryCategory = Extract<
  ConsentCategory,
  | "memory_financial"
  | "memory_shared_expenses"
  | "memory_wellbeing"
  | "memory_planning"
  | "memory_interactions"
>;

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "memory_financial",
  "memory_shared_expenses",
  "memory_wellbeing",
  "memory_planning",
  "memory_interactions",
];

export type MemoryKind = MemoryRecordKind;

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  recurring_expense: "Recurring expense",
  budgeting_style: "Budgeting style",
  overspending_category: "Regularly overspent category",
  savings_target: "Monthly savings target",
  savings_performance: "Savings performance",
  goal_progress: "Goal progress",
  income_pattern: "Income pattern",
  subscription: "Subscription",
  recommendation: "Recommendation made",
  recommendation_outcome: "Recommendation outcome",
  preference: "Preference",
};

/** A fact value inside a memory. Kept small and single-line. */
export type MemoryFactValue = string | number | boolean;

/** A proposed memory produced by AVEN's deterministic memory processor. */
export interface MemoryCandidate {
  category: MemoryCategory;
  kind: MemoryKind;
  /** Short, non-sensitive label stored in Supabase for the memory list. */
  label: string;
  /** Machine-readable facts. Parsed back after recall; this is what AVEN learns from. */
  facts: Readonly<Record<string, MemoryFactValue>>;
  /** One plain-language sentence, e.g. "Rejected a suggestion to cut Food by 10%". */
  summary: string;
  /** The date the fact describes (YYYY-MM-DD). */
  observedOn: string;
  /** References back to the Supabase rows this was derived from (ids only, no content). */
  sourceRefs: ReadonlyArray<{ table: string; id: string }>;
  /** Temporary facts ("spent a lot today") must not become long-term memory. */
  durability: "temporary" | "long_term";
}

/** A memory recalled from Walrus and parsed back into structured form. */
export interface RecalledMemory {
  blobId: string;
  kind: MemoryKind;
  category: MemoryCategory;
  observedOn: string;
  facts: Record<string, string>;
  summary: string;
  /** Semantic distance reported by the relayer (lower is closer). */
  distance: number;
  createdAt: string | null;
}

export type MemoryRecord = MemoryRecordRow;
