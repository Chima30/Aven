# Walrus Memory architecture

Walrus Memory is meant to be AVEN's **long-term contextual intelligence layer**: meaningful,
consented summaries of habits, goals, routines, decisions and corrections that the personal
agent can recall across sessions. It isn't a preferences store, and it isn't a copy of the database.

**Stage 1 makes no Walrus writes and contains no Walrus code or credentials.** It defines the
boundary so Walrus can be added in Stage 6 without rebuilding AVEN.

## Responsibilities

| Store         | Holds                                                    | Authority                  |
| ------------- | -------------------------------------------------------- | -------------------------- |
| Supabase      | Complete records (transactions, logs, plans…)            | **Source of truth**        |
| Walrus Memory | Short derived summaries, each tied to a consent category | Derived, deletable context |

## Pipeline (Stage 6)

```
1 Observe   — authorised changes in Supabase (DB triggers → memory_outbox)
2 Identify  — is this potentially useful long-term context?
3 Extract   — summarise into a MemoryCandidate (pattern / preference / goal / decision / correction)
4 Classify  — temporary vs long-term (temporary is dropped)
5 Gate      — evaluateMemoryCandidate(): backend verified? memory paused? category consented?
6 Store     — MemoryStore.write() → Walrus; local index row in Supabase (id, category, status)
7 Retrieve  — agent asks MemoryStore.search() with only consented categories
8 Correct   — supersede old memory; user corrections become `correction` memories
```

Code that exists today: `src/lib/memory/types.ts` (`MemoryCandidate`, `MemoryRecord`,
`MemoryStore`), `src/lib/memory/policy.ts` (the gate, tested), `src/lib/memory/store.ts`
(`disabledMemoryStore` that throws on every call).

## Consent

Categories: `memory_financial`, `memory_shared_expenses`, `memory_wellbeing`, `memory_planning`,
`memory_interactions`. All start off. In the database they are marked `is_available = false`,
so `set_consent()` **refuses to grant them** until Stage 6 flips them on by migration.
Withdrawal is always allowed. `user_preferences.memory_paused` stops all new memories.

## What never goes into memory

Raw transactions, raw health logs, account numbers, passwords, anything from a category the
user hasn't granted, and temporary facts ("spent a lot today").

## Must be verified before any write (Stage 6 checklist)

Each item is shown to users as "Not yet verified" in Settings → Privacy until it is done:

1. Current official Walrus Memory SDK/docs, account setup and authentication.
2. Write and retrieval behaviour (real round-trip tests, not mocks).
3. Encryption: who can read stored memories, where keys live.
4. Access revocation when consent is withdrawn.
5. Deletion: of a single memory, and of everything on account deletion. **Deleting an AVEN
   database row is not assumed to delete the Walrus record.**
6. Retention guarantees and limits.

If any memory cannot reliably be deleted or have its access revoked, that limitation is
disclosed **before** the user is asked to enable the category.

## Deletion design

Account deletion today records `{"walrus": "not_applicable"}` in the anonymous deletion log.
From Stage 6, deletion will enqueue an `external_deletion_jobs` entry (not tied to the
profile, so it survives the cascade) per stored memory set, retried until Walrus confirms.
The user is only told external data is deleted once it is confirmed.
