import type { ConsentCategory } from "@/lib/supabase/database.types";

/**
 * Walrus Memory integration boundary (design only in Stage 1 — NO writes).
 *
 * Supabase remains the authoritative store for complete records. The memory
 * layer holds short, meaningful SUMMARIES derived from them, each tied to a
 * consent category. See docs/MEMORY.md for the full design.
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

export type MemoryKind = "pattern" | "preference" | "goal" | "decision" | "correction";

/** A proposed memory produced by the (future) memory processor. */
export interface MemoryCandidate {
  category: MemoryCategory;
  kind: MemoryKind;
  /** Plain-language summary, e.g. "Usually pays rent on the 1st". Never a raw record. */
  summary: string;
  /** References back to the Supabase rows this was derived from (ids only, no content). */
  sourceRefs: ReadonlyArray<{ table: string; id: string }>;
  /** Temporary facts ("spent a lot today") must not become long-term memory. */
  durability: "temporary" | "long_term";
  /** If this replaces an earlier memory (a correction), its id. */
  supersedes?: string;
}

/** A stored memory, as the app will see it. */
export interface MemoryRecord {
  id: string;
  userId: string;
  category: MemoryCategory;
  kind: MemoryKind;
  summary: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "superseded" | "revoked" | "deletion_requested" | "deleted";
}

/**
 * Storage backend contract. The Walrus implementation will be written in
 * Stage 6 ONLY after its SDK, encryption, access-revocation and deletion
 * behaviour have been verified against official documentation.
 */
export interface MemoryStore {
  readonly backend: "disabled" | "walrus";
  write(userId: string, candidate: MemoryCandidate): Promise<MemoryRecord>;
  search(
    userId: string,
    query: { categories: MemoryCategory[]; text?: string; limit: number },
  ): Promise<MemoryRecord[]>;
  correct(userId: string, memoryId: string, summary: string): Promise<MemoryRecord>;
  /** Must report honestly whether the backend CONFIRMED deletion. */
  delete(userId: string, memoryId: string): Promise<{ confirmed: boolean; detail: string }>;
}
