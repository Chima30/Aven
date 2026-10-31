# Walrus Memory

Walrus Memory is AVEN's **long-term memory**: short, consented summaries of a user's financial
patterns and of the decisions they made about AVEN's recommendations. The text lives on
**Walrus Mainnet**, stored and encrypted by the hosted **MemWal relayer**, written and read with
the official SDK **`@mysten-incubation/memwal` 0.1.12**. The recommendation engine learns from
what it **recalls from Walrus**, not from a copy in Supabase.

## Who stores what

| Store                      | Holds                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Supabase (source of truth) | Complete finance records; recommendations inbox and answers                                                          |
| Walrus (via MemWal)        | **The memory text**, encrypted by the relayer                                                                        |
| Supabase `memory_records`  | Bookkeeping only: label, kind, SHA-256 content hash, job id, job status, blob id, status, errors                     |
|                            | + `pending_text`: an outbox copy while a write is queued/in flight, erased (CHECK-enforced) once stored or forgotten |

## SDK calls used (verified against the 0.1.12 type declarations)

| Call                                                    | Used for                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `MemWal.create({ key, accountId, serverUrl, … })`       | One server-side client per process                            |
| `remember(text, namespace, { idempotencyKey, dedupe })` | Submit a memory; returns `{ job_id, status }`                 |
| `getRememberStatus(jobId)`                              | Track `pending → running → uploaded → done` (+ `blob_id`)     |
| `recall({ query, namespace, limit })`                   | Semantic recall: `{ results: [{ blob_id, text, distance }] }` |
| `health()`                                              | Integrations page and `verify:walrus`                         |
| `listMemories({ namespace })`                           | Independent cross-check in `verify:walrus` only               |
| `MemWalMock`                                            | Official mock used by every automated test                    |

The SDK has **no delete/forget method** for real relayers (only `MemWalMock.forget`). See
"Deletion" below.

## Memory format

Written by AVEN's deterministic code (never by an AI model), so it can be parsed back exactly:

```
AVEN-MEMORY v1
kind: recommendation_outcome
category: memory_financial
observed_on: 2026-11-01
fact.action: rejected
fact.month: 2026-11
fact.rec_kind: reduce_category_spend
fact.subject_key: cat:<category id>
fact.subject_name: Food
fact.suggested_pct: 10
---
Rejected the suggestion "Bring Food down to 450 USD a month" for 2026-11.
```

Kinds: `recommendation_outcome`, `recommendation`, `savings_target`, `savings_performance`,
`overspending_category`, `income_pattern`, `recurring_expense`, `subscription`,
`budgeting_style`, `goal_progress`, `preference`. Recalled text that is not a well-formed AVEN
memory is ignored, never guessed at.

## Namespaces and isolation

All memories are written with AVEN's single MemWal account. Each user gets a private namespace:

```
${MEMWAL_NAMESPACE}-u-<first 32 hex of HMAC-SHA256(MEMWAL_NAMESPACE_SECRET, "aven-user:" + userId)>
```

- derived on the server from the **verified session's** user id — no request can choose it;
- MemWal matches namespaces exactly, so recall never crosses users (tested with the mock);
- Supabase user ids never appear in Walrus/Sui metadata.

## Pipeline

```
derive candidate ─► policy gate ─► format + hash ─► dedupe (user, hash) ─► remember()
   (completed months,     │ consent? paused? long-term?          │            │ job_id
    recommendation        │ summary ≤ 300? sources?              │            ▼
    answers, targets)     │ no emails, card/account numbers,     │      memory_records: submitted
                          │ keys, credentials, phone numbers     │            │ getRememberStatus()
                          ▼                                      ▼            ▼
                    skipped (no SDK call)                 duplicate     stored (blob_id), outbox erased
                                                                         or queued/failed → retry ≤ 5
```

Recall: `recall()` in the user's namespace → drop forgotten (by blob id **and** content hash) →
drop categories without consent → parse → learning signals (see INTELLIGENCE.md).

## Consent, pause and revocation

- `memory_financial` became available in migration `20261102000100` with policy version
  `2026-11-02`. Before allowing it, users see and must acknowledge the disclosures in
  `src/lib/consent/catalog.ts` (`WALRUS_MEMORY_DISCLOSURES`), checked again on the server.
- Other memory categories stay locked: their features don't exist yet.
- Withdrawing consent or pausing memory stops **all writes and all recall** immediately — the
  policy gate runs before every SDK call. Recall resumes only if consent is granted again.

## Deletion

- **Forget one / forget all:** marks rows `suppressed` (irreversible, trigger-enforced) and
  erases any outbox text. Recall filters suppressed blob ids and content hashes — including a
  memory forgotten before its blob id was known. Re-deriving the same fact does not revive it.
- **Encrypted copies remain on Walrus**: the SDK cannot delete them. This is disclosed before
  consent, on the memory page and in the privacy policy.
- **Account deletion** records in the anonymous deletion log:
  `{"walrus": {"status": "retained_unreachable", "memories_on_walrus": N, …}}`. The namespace
  was derived from the deleted user id with a server secret, so AVEN can no longer reach those
  memories. Nothing claims they were deleted.

## What never goes into memory

Raw transactions, balances, account or card numbers, IBANs, wallet keys or addresses,
passwords/PINs/seed phrases, emails, phone numbers, anything from a category the user hasn't
granted, and temporary facts. Enforced by `findUnsafeContent()` in the policy gate.

## Evidence

Automated tests use the official `MemWalMock` and prove logic only. Live Mainnet storage is
proven only by `npm run verify:walrus` (see WALRUS_SETUP.md), which writes evidence to
`verification/`.
