# Building a finance app that remembers what you decided: AVEN on Walrus Memory

_Technical write-up — AVEN hackathon submission_

Most budgeting apps have the memory of a goldfish. They tell you, every month, that you spent
too much on food, as if you had never been told before and never answered. If you said "no,
that cut is too aggressive" last month, the app doesn't know. So it asks again, and you stop
listening.

AVEN is a personal finance app built around one idea: **a recommendation should be shaped by
the decisions you've already made.** To do that honestly, it needs long-term memory that is
private, durable and inspectable — and it must never invent numbers. This post explains how
AVEN uses **Walrus Memory** for that memory, **Tatum** for read-only access to **Sui Mainnet**,
and a deterministic engine to tie them together.

## The loop

```
your records ─► analyse ─► recall from Walrus ─► recommend + explain
      ▲                                                  │
      │                                    accept / decline / change
      └── next time ◄── recall ◄── Walrus ◄── remember(outcome)
```

1. AVEN analyses your own records: spending per category against its usual level and your
   budget, recurring payments and subscriptions, when income arrives, your savings rate, and
   whether goals are on pace.
2. Before suggesting anything, it **recalls your memories from Walrus**.
3. It builds suggestions — "Bring Food down to $450 a month", "Review Netflix", "Save $300 a
   month" — each with the numbers it used.
4. You accept, decline or change the amount. That answer is written to Walrus.
5. Next time, the recalled answer changes the suggestion — and the card says so.

## Why the engine is deterministic

There is no language model in AVEN's numbers. The analysis is plain TypeScript with explicit
rules: the "typical" month is a median over completed months; a category is "overspending" if it
broke its budget in two of the last three months or is projected to exceed it. Projections
treat fixed charges correctly — a rent payment on the 1st is not multiplied across the month
(our tests caught exactly that bug). Every explanation is generated from those same figures, so
it can't drift from the truth.

## Walrus Memory: what we store and how

AVEN uses the official MemWal SDK (`@mysten-incubation/memwal` 0.1.12) against the hosted
Mainnet relayer. The relayer embeds, encrypts and stores each memory on Walrus; AVEN talks to it
only from the server.

**Memories are structured text.** Free-form summaries are great for semantic search but bad for
deterministic learning, so each memory has machine-readable header lines and a plain sentence:

```
AVEN-MEMORY v1
kind: recommendation_outcome
category: memory_financial
observed_on: 2026-11-01
fact.action: rejected
fact.rec_kind: reduce_category_spend
fact.subject_key: cat:…
fact.subject_name: Food
fact.suggested_pct: 10
---
Rejected the suggestion "Bring Food down to 450 USD a month" for 2026-11.
```

`recall()` finds memories by meaning; AVEN then parses the header lines exactly. Anything that
isn't a well-formed AVEN memory is ignored, never guessed at.

**Writes are tracked like jobs.** `remember()` returns a job id; AVEN polls `getRememberStatus()`
until the relayer reports `done` with a Walrus **blob id**, retrying rate-limited or failed
writes up to five times with fresh idempotency keys and content dedupe on. Supabase keeps only
bookkeeping — label, content hash, job id, blob id, status — so the memory list can show status
without duplicating the content. The actual text is read back from Walrus on demand.

**Isolation.** One MemWal account serves all users, so each user needs a private namespace that
no request can choose. AVEN derives it on the server:
`aven-production-u-` + the first 32 hex characters of `HMAC-SHA256(secret, userId)`. MemWal
matches namespaces exactly, so recall can't cross users, and user ids never appear in on-chain
metadata.

**What learning looks like.** From recalled outcomes AVEN builds signals:

- declined a 10% cut once → next time it suggests 5% and says why;
- declined twice → stops suggesting it, and lists it under "not suggested because of your history";
- changed the amount → your number becomes the target;
- accepted and met the target → a small further step; accepted but missed → keep the target;
- saved a savings target → replaces the default (that target exists **only** in Walrus).

Each changed card carries a `memory_influence` record: the blob id, the memory's sentence and
the effect — visible under "Why this changed".

## Honesty about deletion

MemWal SDK 0.1.12 has no delete call for real relayers. Rather than pretend, AVEN:

- tells users **before** they allow memory that memories can't be deleted from Walrus;
- implements "forget" as permanent suppression — by blob id **and** content hash, so even a
  memory forgotten before its blob id is known never comes back, and re-deriving the same fact
  doesn't revive it;
- records account deletion as `retained_unreachable` with counts only — the namespace was
  derived from the deleted user id with a server secret, so AVEN can no longer reach it.

A sensitive-content guard runs before every write: no emails, card or account numbers, IBANs,
keys, credentials or phone numbers can reach Walrus, even through a bug.

## Sui through Tatum — and why we didn't use JSON-RPC

The plan said "Tatum JSON-RPC". Checking current docs showed that Sui's JSON-RPC is deprecated
and was switched off on Sui Foundation Mainnet nodes in late July 2026; the official SDK marks
`SuiJsonRpcClient` deprecated. So AVEN uses `@mysten/sui`'s `SuiGrpcClient` over native gRPC to
Tatum's Mainnet gateway, with the API key as `x-api-key` metadata — server-side only. It reads
the checkpoint, balances, coin metadata and transactions sent by a wallet. gRPC-web and the old
JSON-RPC endpoint stay available as configuration fallbacks, and a verification script records
which transports your Tatum plan actually serves.

On-chain data is shown separately from AVEN's records. To record a Sui transaction in AVEN, the
user confirms it; a database function refuses a digest that was already imported and asks for
confirmation if a transaction with the same account, amount and date already exists. AVEN has
no price feed, so the user enters the value in their currency — it never invents an exchange
rate. AVEN never holds keys or sends anything.

## Testing what we can, and saying what we can't

- Unit tests run AVEN's real memory service and the full learning loop against the **official
  `MemWalMock`** from the SDK: decline → gentler; decline twice → withheld; changed amount → new
  target; user B can never recall user A's memories.
- Database tests on PostgreSQL check RLS and two-user isolation for every new table, the
  irreversible "forget", the outbox CHECK, import de-duplication and one-time answers.
- Playwright drives the real UI against real Postgres.
- **Live Mainnet behaviour is verified separately** by `npm run verify:walrus`: with explicit
  authorisation it writes clearly-labelled AVEN memories to Walrus Mainnet, waits for blob ids,
  recalls them, cross-checks `listMemories()`, and writes an evidence file. Only memories the
  relayer reports as done with a blob id are counted.

## What's next

Subscriptions with renewal reminders, shared expenses, and incoming-transfer history for Sui
wallets — each feeding the same memory and learning loop.

_Source: https://github.com/Chima30/aven · Demo: [[DEMO_VIDEO_URL]]_
