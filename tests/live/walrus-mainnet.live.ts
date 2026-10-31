import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemWal, delegateKeyToSuiAddress } from "@mysten-incubation/memwal";
import { describe, expect, it } from "vitest";
import { memwalConfig } from "@/lib/integrations/config";
import { savingsTargetCandidate } from "@/lib/intelligence/memories";
import { createMemwalClient } from "@/lib/memory/client";
import { deriveUserNamespace } from "@/lib/memory/namespace";
import type { MemoryPolicyContext } from "@/lib/memory/policy";
import {
  recallMemories,
  refreshMemoryJobs,
  rememberCandidate,
  type MemoryServiceDeps,
} from "@/lib/memory/service";
import type { MemoryCandidate } from "@/lib/memory/types";
import { inMemoryRepo } from "../unit/support/memory-repo";

/**
 * WALRUS MAINNET VERIFICATION — run only with YOUR credentials, on YOUR machine.
 *
 *   npm run verify:walrus
 *
 * 1. Always (when MEMWAL_* is set): a read-only relayer health check.
 * 2. Only when AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES is ALSO
 *    set: writes 11 AVEN-format memories to Walrus MAINNET through AVEN's own
 *    memory service, waits until the relayer reports each job done with a
 *    blob id, recalls them back, cross-checks them with listMemories(), and
 *    writes an evidence file to verification/.
 *
 * Only memories with status "stored" AND a Walrus blob id are counted. Failed
 * jobs, mocks and testnet writes are never counted. The memories are clearly
 * labelled as a verification run and use a dedicated namespace that no real
 * AVEN user can ever map to.
 */

const config = memwalConfig();
const configured = config.status === "configured";
const authorised = process.env.AVEN_WALRUS_MAINNET_CONFIRM === "I_AUTHORISE_MAINNET_WRITES";
// A fixed id that Supabase will never issue to a user (version-4 UUIDs are random).
const VERIFY_SUBJECT = "00000000-0000-4000-8000-00000000a7e0";
const allowed: MemoryPolicyContext = {
  grantedCategories: new Set(["memory_financial"]),
  memoryPaused: false,
  backendAvailable: true,
};

if (!configured) {
  console.warn(
    config.status === "invalid"
      ? `Walrus live checks skipped: invalid MEMWAL settings — ${config.issues.join("; ")}`
      : "Walrus live checks skipped: MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID / MEMWAL_NAMESPACE_SECRET are not set in .env.local.",
  );
} else if (!authorised) {
  console.warn(
    "Walrus MAINNET WRITE verification skipped. To authorise it, set AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES for this run.",
  );
}

function verificationCandidates(runId: string, today: string): MemoryCandidate[] {
  const base = (
    kind: MemoryCandidate["kind"],
    label: string,
    facts: MemoryCandidate["facts"],
    summary: string,
  ): MemoryCandidate => ({
    category: "memory_financial",
    kind,
    label: `Verification ${runId} · ${label}`,
    facts: { ...facts, verification_run: runId },
    summary: `Verification run ${runId}: ${summary}`,
    observedOn: today,
    sourceRefs: [{ table: "verification", id: runId }],
    durability: "long_term",
  });
  const target = savingsTargetCandidate(15, today);
  return [
    {
      ...target,
      label: `Verification ${runId} · Savings target`,
      facts: { ...target.facts, verification_run: runId },
      summary: `Verification run ${runId}: ${target.summary}`,
    },
    base(
      "budgeting_style",
      "Budgeting style",
      { style: "light", budget_count: 2 },
      "the user budgets lightly with 2 budgets.",
    ),
    base(
      "overspending_category",
      "Overspent category",
      { category_key: "verify-food", category_name: "Food", month: today.slice(0, 7) },
      "Food went over its budget this month.",
    ),
    base(
      "savings_performance",
      "Savings performance",
      { month: today.slice(0, 7), savings_rate_pct: 12 },
      "the user kept 12% of income.",
    ),
    base(
      "income_pattern",
      "Income pattern",
      { typical_day: 25 },
      "income usually arrives around day 25.",
    ),
    base(
      "subscription",
      "Subscription",
      { name: "Streaming service", typical_day: 5 },
      "a streaming subscription renews around day 5.",
    ),
    base(
      "recurring_expense",
      "Recurring expense",
      { name: "Rent", typical_day: 1 },
      "rent is paid around day 1.",
    ),
    base(
      "goal_progress",
      "Goal progress",
      { goal_key: "verify-goal", goal_name: "Emergency fund", progress_band_pct: 30 },
      "the emergency fund is at least 30% funded.",
    ),
    base(
      "recommendation",
      "Recommendation",
      { rec_kind: "reduce_category_spend", subject_name: "Food" },
      "AVEN suggested trimming Food spending by 10%.",
    ),
    base(
      "recommendation_outcome",
      "Outcome rejected",
      {
        rec_kind: "reduce_category_spend",
        subject_key: "cat:verify-food",
        subject_name: "Food",
        action: "rejected",
        suggested_pct: 10,
        month: today.slice(0, 7),
      },
      "the user declined a 10% Food cut.",
    ),
    base(
      "recommendation_outcome",
      "Outcome modified",
      {
        rec_kind: "increase_savings",
        subject_key: "savings",
        subject_name: "Savings",
        action: "modified",
        month: today.slice(0, 7),
      },
      "the user chose a smaller savings step.",
    ),
  ];
}

describe.skipIf(!configured)("Walrus Memory relayer (read-only)", () => {
  it("answers /health through the official SDK", async () => {
    if (config.status !== "configured") return;
    const health = await createMemwalClient(config.config).health();
    console.info(
      `Relayer ${config.config.serverUrl}: status=${health.status} version=${health.version} write_ready=${String(health.write_ready)}`,
    );
    expect(health.status).toBeTruthy();
  });
});

describe.skipIf(!configured || !authorised)("Walrus Mainnet write verification", () => {
  it("stores, confirms and recalls at least 10 real AVEN memories", async () => {
    if (config.status !== "configured") return;
    const c = config.config;
    const runId = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
    const today = new Date().toISOString().slice(0, 10);
    const client = createMemwalClient(c);
    const repo = inMemoryRepo();
    const namespace = deriveUserNamespace(
      `${c.namespace}-verify`,
      c.namespaceSecret,
      VERIFY_SUBJECT,
    );
    const deps: MemoryServiceDeps = { client, repo, namespace };
    const startedAt = new Date().toISOString();
    const health = await client.health();

    const candidates = verificationCandidates(runId, today);
    for (const candidate of candidates) {
      const outcome = await rememberCandidate(deps, VERIFY_SUBJECT, candidate, allowed);
      console.info(`remember ${candidate.kind}: ${outcome.status}`);
    }

    // Poll until every job is done (or 10 minutes pass).
    const deadline = Date.now() + 10 * 60_000;
    while (
      Date.now() < deadline &&
      repo.rows.some((r) => r.status === "submitted" || r.status === "queued")
    ) {
      await new Promise((r) => setTimeout(r, 5_000));
      const s = await refreshMemoryJobs(deps, VERIFY_SUBJECT, { deadlineMs: 60_000 });
      console.info(`jobs: ${s.stored} newly stored, ${s.stillPending} pending, ${s.failed} failed`);
    }

    const stored = repo.rows.filter((r) => r.status === "stored" && r.blob_id);

    // Read back from Walrus through AVEN's recall path.
    const recalled = await recallMemories(
      deps,
      VERIFY_SUBJECT,
      `Verification run ${runId}`,
      allowed,
      { limit: 50 },
    );
    const recalledBlobs = new Set(recalled.map((m) => m.blobId));

    // Independent cross-check with the relayer's memory listing.
    const listed = new Set<string>();
    try {
      const raw = MemWal.create({
        key: c.privateKey,
        accountId: c.accountId,
        serverUrl: c.serverUrl,
        namespace,
      });
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const res = await raw.listMemories({ namespace, limit: 100, cursor });
        for (const m of res.memories) listed.add(m.blob_id);
        if (!res.has_more || !res.next_cursor) break;
        cursor = res.next_cursor;
      }
    } catch (error) {
      console.warn(
        `listMemories cross-check unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const sdkVersion = JSON.parse(
      readFileSync(
        join(process.cwd(), "node_modules/@mysten-incubation/memwal/package.json"),
        "utf8",
      ),
    ).version as string;
    const evidence = {
      kind: "aven-walrus-mainnet-verification",
      run_id: runId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      network: "mainnet",
      relayer: c.serverUrl,
      relayer_health: health,
      sdk: `@mysten-incubation/memwal ${sdkVersion}`,
      memwal_account_id: c.accountId,
      delegate_sui_address: await delegateKeyToSuiAddress(c.privateKey),
      namespace,
      counting_rule:
        "Counted only if the relayer reported the remember job as done with a Walrus blob id. Failed jobs, mocks and testnet writes are not counted.",
      totals: {
        attempted: candidates.length,
        stored_on_walrus: stored.length,
        failed: repo.rows.filter((r) => r.status === "failed").length,
        recalled_back: stored.filter((r) => recalledBlobs.has(r.blob_id!)).length,
        listed_by_relayer:
          listed.size > 0 ? stored.filter((r) => listed.has(r.blob_id!)).length : null,
      },
      memories: repo.rows.map((r) => ({
        kind: r.kind,
        label: r.label,
        status: r.status,
        job_id: r.job_id,
        job_status: r.job_status,
        blob_id: r.blob_id,
        attempts: r.attempts,
        submitted_at: r.submitted_at,
        stored_at: r.stored_at,
        recalled_back: r.blob_id ? recalledBlobs.has(r.blob_id) : false,
        listed_by_relayer: r.blob_id && listed.size > 0 ? listed.has(r.blob_id) : null,
        last_error: r.last_error,
      })),
    };
    mkdirSync(join(process.cwd(), "verification"), { recursive: true });
    const file = join(process.cwd(), "verification", `walrus-mainnet-${runId}.json`);
    writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
    console.info(
      `Evidence written to ${file}: ${stored.length} memories stored on Walrus Mainnet.`,
    );

    expect(stored.length).toBeGreaterThanOrEqual(10);
  });
});
