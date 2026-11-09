import { expect, it, vi } from "vitest";
import { explainWithCompanion } from "@/lib/intelligence/companion";
const facts = [{ id: "budget-1", label: "Recorded spending", value: "100 NGN" }];
it("does not send data without both switches, and stays unconfigured by default", async () => {
  const explain = vi.fn();
  expect(
    await explainWithCompanion({
      enabled: true,
      consentGranted: false,
      provider: { explain },
      question: "Why?",
      facts,
    }),
  ).toEqual({ status: "disabled" });
  expect(explain).not.toHaveBeenCalled();
  expect(
    await explainWithCompanion({
      enabled: true,
      consentGranted: true,
      provider: null,
      question: "Why?",
      facts,
    }),
  ).toEqual({ status: "not_configured" });
});
it("rejects unknown evidence and handles provider failure", async () => {
  const input = { enabled: true, consentGranted: true, question: "Why?", facts };
  expect(
    (
      await explainWithCompanion({
        ...input,
        provider: { explain: async () => ({ explanation: "Invented", factIds: ["unknown"] }) },
      })
    ).status,
  ).toBe("unavailable");
  expect(
    (
      await explainWithCompanion({
        ...input,
        provider: {
          explain: async () => {
            throw new Error("private provider error");
          },
        },
      })
    ).status,
  ).toBe("unavailable");
});
it("times out even a provider that ignores abort", async () => {
  const result = await explainWithCompanion({
    enabled: true,
    consentGranted: true,
    question: "Why?",
    facts,
    timeoutMs: 5,
    provider: { explain: () => new Promise(() => {}) },
  });
  expect(result.status).toBe("unavailable");
});
