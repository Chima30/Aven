/** Optional server-side provider contract. No provider is registered in this release. */
export interface CompanionFact {
  id: string;
  label: string;
  value: string;
}
export interface CompanionProvider {
  /** Implementations must keep credentials server-side; values come from deterministic services. */
  explain(input: {
    question: string;
    facts: readonly CompanionFact[];
    signal: AbortSignal;
  }): Promise<{ explanation: string; factIds: string[] }>;
}
export type CompanionResult =
  | { status: "disabled" | "not_configured" | "unavailable" }
  | { status: "explained"; explanation: string; factIds: string[] };

/** Read-only and explicitly authorized. This function offers no tools or mutation capability. */
export async function explainWithCompanion(input: {
  enabled: boolean;
  consentGranted: boolean;
  question: string;
  facts: readonly CompanionFact[];
  provider: CompanionProvider | null;
  timeoutMs?: number;
}): Promise<CompanionResult> {
  if (!input.enabled || !input.consentGranted) return { status: "disabled" };
  if (!input.provider) return { status: "not_configured" };
  if (!input.question.trim() || input.question.length > 1000) return { status: "unavailable" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      input.provider.explain({
        question: input.question,
        facts: input.facts,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, input.timeoutMs ?? 8000);
      }),
    ]);
    const ids = new Set(input.facts.map((f) => f.id));
    if (
      !result.explanation.trim() ||
      result.explanation.length > 4000 ||
      !result.factIds.length ||
      result.factIds.some((id) => !ids.has(id))
    )
      return { status: "unavailable" };
    // Language remains untrusted provider output. Figures must be rendered from cited facts,
    // separately from the explanation, by any future UI. No financial values are returned here.
    return { status: "explained", explanation: result.explanation, factIds: result.factIds };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
