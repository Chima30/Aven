import { MemWalMock } from "@mysten-incubation/memwal";
import { describe, expect, it, vi } from "vitest";
import { parseMemwalConfig } from "@/lib/integrations/config";
import type { MemoryClient } from "@/lib/memory/client";
import {
  findUnsafeContent,
  formatMemoryText,
  memoryContentHash,
  parseMemoryText,
  UnsafeMemoryContentError,
} from "@/lib/memory/format";
import { deriveUserNamespace } from "@/lib/memory/namespace";
import { evaluateMemoryCandidate, type MemoryPolicyContext } from "@/lib/memory/policy";
import {
  forgetAllMemories,
  forgetMemory,
  MAX_ATTEMPTS,
  recallMemories,
  refreshMemoryJobs,
  rememberCandidate,
  type MemoryServiceDeps,
} from "@/lib/memory/service";
import type { MemoryCandidate } from "@/lib/memory/types";
import { inMemoryRepo } from "./support/memory-repo";

/*
 * These tests run AVEN's real memory service against the OFFICIAL MemWalMock
 * from @mysten-incubation/memwal. They prove AVEN's logic (consent gating,
 * dedupe, job tracking, retries, isolation, forgetting). They are NOT evidence
 * of live Walrus Mainnet storage — that is `npm run verify:walrus`.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "test-namespace-secret-0123456789abcdef";

const candidate: MemoryCandidate = {
  category: "memory_financial",
  kind: "recommendation_outcome",
  label: "Recommendation rejected · Food",
  facts: {
    rec_kind: "reduce_category_spend",
    subject_key: "cat:abc",
    subject_name: "Food",
    action: "rejected",
    suggested_pct: 10,
    month: "2026-11",
  },
  summary: 'Rejected the suggestion "Bring Food down to 45000 NGN a month" for 2026-11.',
  observedOn: "2026-11-01",
  sourceRefs: [{ table: "recommendations", id: "r1" }],
  durability: "long_term",
};

const allowed: MemoryPolicyContext = {
  grantedCategories: new Set(["memory_financial"]),
  memoryPaused: false,
  backendAvailable: true,
};

function setup(userId = USER_A, client?: MemoryClient) {
  const mock = MemWalMock.create({ namespace: "unused" });
  const repo = inMemoryRepo();
  const deps: MemoryServiceDeps = {
    client: client ?? mock,
    repo,
    namespace: deriveUserNamespace("aven-test", SECRET, userId),
  };
  return { mock, repo, deps };
}

describe("memory text format", () => {
  it("round-trips through format and parse", () => {
    const text = formatMemoryText(candidate);
    expect(text.startsWith("AVEN-MEMORY v1\n")).toBe(true);
    const parsed = parseMemoryText(text, { blobId: "b1", distance: 0.1 });
    expect(parsed).toMatchObject({
      kind: "recommendation_outcome",
      category: "memory_financial",
      observedOn: "2026-11-01",
      facts: { action: "rejected", suggested_pct: "10", subject_name: "Food" },
    });
    expect(parsed?.summary).toContain("Rejected");
  });

  it("is deterministic (same facts → same text → same hash)", () => {
    const shuffled = {
      ...candidate,
      facts: Object.fromEntries(Object.entries(candidate.facts).reverse()),
    };
    expect(memoryContentHash(formatMemoryText(shuffled))).toBe(
      memoryContentHash(formatMemoryText(candidate)),
    );
  });

  it("ignores text that is not an AVEN memory", () => {
    expect(parseMemoryText("I love coffee", { blobId: "x", distance: 0 })).toBeNull();
    expect(
      parseMemoryText(
        "AVEN-MEMORY v1\nkind: hacked\ncategory: memory_financial\nobserved_on: 2026-01-01\n---\nx",
        {
          blobId: "x",
          distance: 0,
        },
      ),
    ).toBeNull();
  });

  it.each([
    ["email", "contact me at someone@example.com"],
    ["card number", "card 4111 1111 1111 1111"],
    ["account number", "account 0123456789012"],
    ["private key", "suiprivkey1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"],
    ["hex key", `key ${"ab".repeat(32)}`],
    ["password", "my password is hunter2"],
    ["seed phrase", "seed phrase words"],
  ])("refuses to store a %s", (_name, value) => {
    expect(findUnsafeContent(value)).not.toBeNull();
    expect(() => formatMemoryText({ ...candidate, summary: value })).toThrow(
      UnsafeMemoryContentError,
    );
  });

  it("does not mistake dates and normal amounts for card numbers", () => {
    expect(findUnsafeContent("from 2026-11-01 to 2026-11-30, spent 45000.00 NGN")).toBeNull();
  });
});

describe("per-user namespaces", () => {
  it("are deterministic, distinct per user and hide the user id", () => {
    const a = deriveUserNamespace("aven-production", SECRET, USER_A);
    expect(a).toBe(deriveUserNamespace("aven-production", SECRET, USER_A));
    expect(a).not.toBe(deriveUserNamespace("aven-production", SECRET, USER_B));
    expect(a).toMatch(/^aven-production-u-[0-9a-f]{32}$/);
    expect(a).not.toContain(USER_A.slice(0, 8));
    expect(deriveUserNamespace("aven-production", `${SECRET}x`, USER_A)).not.toBe(a);
  });

  it("rejects bad input", () => {
    expect(() => deriveUserNamespace("aven", SECRET, "not-a-uuid")).toThrow();
    expect(() => deriveUserNamespace("aven", "short", USER_A)).toThrow();
  });
});

describe("memory policy", () => {
  it.each([
    [{ ...allowed, backendAvailable: false }, "backend_unavailable"],
    [{ ...allowed, memoryPaused: true }, "memory_paused"],
    [{ ...allowed, grantedCategories: new Set<string>() }, "no_consent"],
  ])("blocks writes (%#)", (ctx, reason) => {
    expect(evaluateMemoryCandidate(candidate, ctx)).toEqual({ allowed: false, reason });
  });

  it("blocks unsafe facts even if the summary is fine", () => {
    const bad = { ...candidate, facts: { ...candidate.facts, note: "pin code 1234" } };
    expect(evaluateMemoryCandidate(bad, allowed)).toEqual({
      allowed: false,
      reason: "unsafe_content",
    });
  });
});

describe("memory service (official MemWalMock)", () => {
  it("writes, tracks the job to a Walrus blob id, and clears the outbox", async () => {
    const { deps, repo } = setup();
    const outcome = await rememberCandidate(deps, USER_A, candidate, allowed);
    expect(outcome.status).toBe("submitted");
    expect(repo.rows[0]).toMatchObject({ status: "submitted", attempts: 1 });
    expect(repo.rows[0]!.pending_text).toContain("AVEN-MEMORY v1");

    const summary = await refreshMemoryJobs(deps, USER_A);
    expect(summary.stored).toBe(1);
    expect(repo.rows[0]).toMatchObject({
      status: "stored",
      job_status: "done",
      pending_text: null,
    });
    expect(repo.rows[0]!.blob_id).toBeTruthy();
  });

  it("never writes the same memory twice", async () => {
    const { deps, mock } = setup();
    const spy = vi.spyOn(mock, "remember");
    await rememberCandidate(deps, USER_A, candidate, allowed);
    const second = await rememberCandidate(deps, USER_A, candidate, allowed);
    expect(second.status).toBe("duplicate");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not call the SDK at all without consent or while paused", async () => {
    const { deps, mock, repo } = setup();
    const spy = vi.spyOn(mock, "remember");
    expect(
      await rememberCandidate(deps, USER_A, candidate, {
        ...allowed,
        grantedCategories: new Set(),
      }),
    ).toEqual({ status: "skipped", reason: "no_consent" });
    expect(
      await rememberCandidate(deps, USER_A, candidate, { ...allowed, memoryPaused: true }),
    ).toEqual({
      status: "skipped",
      reason: "memory_paused",
    });
    expect(spy).not.toHaveBeenCalled();
    expect(repo.rows).toHaveLength(0);
  });

  it("queues on rate limiting and retries on refresh", async () => {
    const { deps, mock, repo } = setup();
    const rateLimited = Object.assign(new Error("429"), { name: "MemWalRateLimitedError" });
    const spy = vi.spyOn(mock, "remember").mockRejectedValueOnce(rateLimited);
    const outcome = await rememberCandidate(deps, USER_A, candidate, allowed);
    expect(outcome.status).toBe("queued");
    expect(repo.rows[0]!.last_error).toMatch(/rate limiting/);
    expect(repo.rows[0]!.pending_text).toBeTruthy();

    const first = await refreshMemoryJobs(deps, USER_A);
    expect(first.resubmitted).toBe(1);
    const second = await refreshMemoryJobs(deps, USER_A);
    expect(second.stored).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    // Each attempt uses its own idempotency key; content dedupe is always on.
    expect(spy.mock.calls[1]![2]).toMatchObject({
      idempotencyKey: expect.stringMatching(/-2$/),
      dedupe: true,
    });
  });

  it("gives up after the maximum number of attempts", async () => {
    const { deps, mock, repo } = setup();
    vi.spyOn(mock, "remember").mockRejectedValue(new Error("relayer down"));
    await rememberCandidate(deps, USER_A, candidate, allowed);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await refreshMemoryJobs(deps, USER_A);
    expect(repo.rows[0]).toMatchObject({
      status: "failed",
      pending_text: null,
      attempts: MAX_ATTEMPTS,
    });
  });

  it("refuses to link a job that the relayer reports in another namespace", async () => {
    const { deps, mock, repo } = setup();
    await rememberCandidate(deps, USER_A, candidate, allowed);
    vi.spyOn(mock, "getRememberStatus").mockResolvedValue({
      job_id: repo.rows[0]!.job_id!,
      status: "done",
      blob_id: "foreign",
      namespace: "someone-else",
    });
    await refreshMemoryJobs(deps, USER_A);
    expect(repo.rows[0]).toMatchObject({ status: "failed", blob_id: null });
  });

  it("recalls and parses the user's memories", async () => {
    const { deps } = setup();
    await rememberCandidate(deps, USER_A, candidate, allowed);
    await refreshMemoryJobs(deps, USER_A);
    const recalled = await recallMemories(deps, USER_A, "recommendation outcome rejected", allowed);
    expect(recalled).toHaveLength(1);
    expect(recalled[0]).toMatchObject({
      kind: "recommendation_outcome",
      facts: { action: "rejected" },
    });
  });

  it("isolates users: B can never recall A's memories", async () => {
    const shared = MemWalMock.create({ namespace: "unused" });
    const a = setup(USER_A, shared);
    const b = setup(USER_B, shared);
    await rememberCandidate(a.deps, USER_A, candidate, allowed);
    expect(
      await recallMemories(b.deps, USER_B, "recommendation outcome rejected Food", allowed),
    ).toEqual([]);
    expect(
      await recallMemories(a.deps, USER_A, "recommendation outcome rejected Food", allowed),
    ).toHaveLength(1);
  });

  it("does not recall without consent or while paused", async () => {
    const { deps, mock } = setup();
    await rememberCandidate(deps, USER_A, candidate, allowed);
    const spy = vi.spyOn(mock, "recall");
    expect(
      await recallMemories(deps, USER_A, "rejected", { ...allowed, memoryPaused: true }),
    ).toEqual([]);
    expect(
      await recallMemories(deps, USER_A, "rejected", { ...allowed, grantedCategories: new Set() }),
    ).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("forgotten memories are excluded from recall — even before their blob id is known", async () => {
    const { deps, repo } = setup();
    await rememberCandidate(deps, USER_A, candidate, allowed);
    // Forget while the job is still "submitted" (no blob id recorded yet).
    expect(repo.rows[0]!.blob_id).toBeNull();
    expect(await forgetMemory(deps, USER_A, repo.rows[0]!.id)).toBe("forgotten");
    expect(await recallMemories(deps, USER_A, "recommendation outcome rejected", allowed)).toEqual(
      [],
    );
    // A later refresh learns the blob id but keeps it forgotten.
    await refreshMemoryJobs(deps, USER_A);
    expect(repo.rows[0]).toMatchObject({ status: "suppressed" });
    expect(repo.rows[0]!.blob_id).toBeTruthy();
    // Re-deriving the same fact does not bring it back.
    expect((await rememberCandidate(deps, USER_A, candidate, allowed)).status).toBe("duplicate");
  });

  it("forget all suppresses every memory", async () => {
    const { deps, repo } = setup();
    await rememberCandidate(deps, USER_A, candidate, allowed);
    await rememberCandidate(deps, USER_A, { ...candidate, summary: "Another outcome." }, allowed);
    expect(await forgetAllMemories(deps, USER_A)).toBe(2);
    expect(repo.rows.every((r) => r.status === "suppressed")).toBe(true);
  });
});

describe("Walrus configuration", () => {
  const good = {
    MEMWAL_PRIVATE_KEY: "a".repeat(64),
    MEMWAL_ACCOUNT_ID: `0x${"b".repeat(64)}`,
    MEMWAL_NAMESPACE_SECRET: SECRET,
  };

  it("is optional", () => {
    expect(parseMemwalConfig({}).status).toBe("not_configured");
  });

  it("applies defaults for the relayer and namespace", () => {
    const result = parseMemwalConfig(good);
    expect(result).toMatchObject({
      status: "configured",
      config: { serverUrl: "https://relayer.memory.walrus.xyz", namespace: "aven-production" },
    });
  });

  it("reports invalid values without echoing them", () => {
    const result = parseMemwalConfig({ ...good, MEMWAL_PRIVATE_KEY: "not-a-key" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.issues.join(" ")).toContain("MEMWAL_PRIVATE_KEY");
      expect(result.issues.join(" ")).not.toContain("not-a-key");
    }
  });

  it("flags a partial configuration as invalid, not silently off", () => {
    expect(parseMemwalConfig({ MEMWAL_PRIVATE_KEY: good.MEMWAL_PRIVATE_KEY }).status).toBe(
      "invalid",
    );
  });

  it("rejects http relayers", () => {
    expect(parseMemwalConfig({ ...good, MEMWAL_SERVER_URL: "http://relayer.example" }).status).toBe(
      "invalid",
    );
  });
});
