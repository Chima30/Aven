import { createHash } from "node:crypto";
import {
  MEMORY_CATEGORIES,
  MEMORY_KIND_LABELS,
  type MemoryCandidate,
  type MemoryCategory,
  type MemoryKind,
  type RecalledMemory,
} from "./types";

/**
 * The text format AVEN writes to Walrus Memory.
 *
 *   AVEN-MEMORY v1
 *   kind: recommendation_outcome
 *   category: memory_financial
 *   observed_on: 2026-11-02
 *   fact.category_name: Food
 *   fact.action: rejected
 *   ---
 *   Rejected a suggestion to cut Food spending by 10%.
 *
 * The header lines make every recalled memory machine-readable, so the
 * recommendation engine learns from what Walrus returns — deterministically,
 * with no AI model interpreting free text. The sentence after "---" gives
 * the relayer's semantic search something natural to embed.
 */
export const MEMORY_HEADER = "AVEN-MEMORY v1";
const MAX_FACTS = 16;
const MAX_VALUE_LENGTH = 120;
export const MAX_SUMMARY_LENGTH = 300;
export const MAX_LABEL_LENGTH = 160;

/**
 * Content that must never be written to long-term memory, even if a bug
 * tried to: credentials, card/account numbers, keys, emails and phone numbers.
 */
const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "an email address", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "a long number (card or account number)", re: /\d(?:[ -]?\d){11,}/ },
  { name: "an IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ },
  { name: "a key or address", re: /\b(?:0x)?[0-9a-f]{40,}\b/i },
  { name: "a private key", re: /suiprivkey1|-----BEGIN|sb_secret_|sk-ant-/i },
  {
    name: "a credential word",
    re: /\b(password|passcode|pin code|seed phrase|mnemonic|api[ _-]?key|secret key|cvv)\b/i,
  },
  { name: "a phone number", re: /\+\d{1,3}[ -]?\d{3,}[ -]?\d{3,}/ },
];

export class UnsafeMemoryContentError extends Error {
  constructor(what: string) {
    super(`Memory text looks like it contains ${what}; it was not stored.`);
    this.name = "UnsafeMemoryContentError";
  }
}

/** Returns the reason text is unsafe, or null if it may be stored. */
export function findUnsafeContent(text: string): string | null {
  // ISO dates are expected content; keep "2026-11-01 2026-11-30" from looking like a card number.
  const scrubbed = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<date>");
  for (const { name, re } of FORBIDDEN) if (re.test(scrubbed)) return name;
  return null;
}

function cleanValue(value: unknown): string {
  return String(value)
    .replace(/[\r\n|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VALUE_LENGTH);
}

/** Builds the exact text stored in Walrus. Throws if anything unsafe slips in. */
export function formatMemoryText(candidate: MemoryCandidate): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.observedOn)) {
    throw new Error("observedOn must be YYYY-MM-DD");
  }
  const entries = Object.entries(candidate.facts);
  if (entries.length > MAX_FACTS) throw new Error(`A memory may have at most ${MAX_FACTS} facts`);
  const lines = [
    MEMORY_HEADER,
    `kind: ${candidate.kind}`,
    `category: ${candidate.category}`,
    `observed_on: ${candidate.observedOn}`,
  ];
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw new Error(`Invalid fact key: ${key}`);
    lines.push(`fact.${key}: ${cleanValue(value)}`);
  }
  lines.push("---", cleanValue(candidate.summary).slice(0, MAX_SUMMARY_LENGTH));
  const text = lines.join("\n");
  const unsafe = findUnsafeContent(text);
  if (unsafe) throw new UnsafeMemoryContentError(unsafe);
  return text;
}

/** SHA-256 of the exact memory text (dedupe key). */
export function memoryContentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const KINDS = new Set(Object.keys(MEMORY_KIND_LABELS));
const CATEGORIES = new Set<string>(MEMORY_CATEGORIES);

/**
 * Parses a recalled memory. Returns null for anything that is not a
 * well-formed AVEN memory (it is then ignored, never guessed at).
 */
export function parseMemoryText(
  text: string,
  meta: { blobId: string; distance: number; createdAt?: string | null },
): RecalledMemory | null {
  const [head, ...rest] = text.split("\n---\n");
  if (!head || rest.length === 0) return null;
  const lines = head.split("\n");
  if (lines[0]?.trim() !== MEMORY_HEADER) return null;
  const fields = new Map<string, string>();
  const facts: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx <= 0) return null;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key.startsWith("fact.")) facts[key.slice(5)] = value;
    else fields.set(key, value);
  }
  const kind = fields.get("kind");
  const category = fields.get("category");
  const observedOn = fields.get("observed_on");
  if (!kind || !KINDS.has(kind) || !category || !CATEGORIES.has(category)) return null;
  if (!observedOn || !/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) return null;
  return {
    blobId: meta.blobId,
    kind: kind as MemoryKind,
    category: category as MemoryCategory,
    observedOn,
    facts,
    summary: rest.join("\n---\n").trim(),
    distance: meta.distance,
    createdAt: meta.createdAt ?? null,
  };
}

/** Label shown in the memory list (stored in Supabase, never the memory text). */
export function memoryLabel(candidate: MemoryCandidate): string {
  const label = cleanValue(candidate.label).slice(0, MAX_LABEL_LENGTH);
  return label || MEMORY_KIND_LABELS[candidate.kind];
}
