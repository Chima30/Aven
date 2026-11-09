# Repository audit — 9 November 2026

Done before the "Verifiable Personal Intelligence" upgrade (branch `claude/exciting-galileo-cuofwj`,
starting commit `bae7ab3`). It records what exists, what is tested and what is only advertised,
so later changes can be measured against it.

## Stack

Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind v4, Supabase (Postgres + RLS,
`@supabase/ssr` cookies), IndexedDB outbox for offline writes, `@mysten-incubation/memwal`
0.1.12 for Walrus Memory, `@mysten/sui` via Tatum for read-only Sui. No AI SDK.

## Landing-page claims vs the code

| Claim on the website                       | Status                                                                                                          | Evidence                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Accounts, transactions, budgets, goals     | Implemented, tested                                                                                             | `src/app/(app)/money/*`; `tests/db/finance.test.ts` (34), `tests/e2e/money.spec.ts`                     |
| Spending and savings intelligence          | Implemented, tested                                                                                             | `src/lib/intelligence/{analysis,recommend}.ts`; `tests/unit/intelligence.test.ts`                       |
| Decision learning                          | Implemented **only through Walrus recall**                                                                      | `learning.ts`; with Walrus off, not configured or not consented, answers are stored but nothing adapts  |
| Walrus Memory                              | Implemented; tested with the official `MemWalMock`                                                              | `src/lib/memory/*`; live Mainnet proof only via `npm run verify:walrus` (needs the owner's credentials) |
| Read-only Sui wallets                      | Implemented; tested with mocked Sui                                                                             | `src/lib/sui/*`, `money/wallets`; live check only via `npm run verify:tatum`                            |
| Calendar, tasks, habits, reviews           | Implemented, tested                                                                                             | `src/app/(app)/planning/*`; `tests/db/life.test.ts`, `tests/e2e/life.spec.ts`                           |
| Nudge Center, Pulse Check, email summaries | Implemented, tested (email sending needs SMTP settings)                                                         | `src/lib/nudges/*`; `tests/unit/{nudges,email}.test.ts`                                                 |
| Sleep, water, meals, activity, mood        | Implemented, tested                                                                                             | `src/app/(app)/wellbeing/*`                                                                             |
| Offline-first                              | Implemented, tested                                                                                             | `src/lib/offline/*`; `tests/unit/offline.test.ts`, offline e2e                                          |
| Consent and privacy controls               | Implemented, tested                                                                                             | `consent_records`, `src/lib/consent/catalog.ts`, `tests/unit/memory-consent-regional.test.ts`           |
| AI assistant                               | **Not implemented.** Consent `ai_processing` is "not available"; `ai_enabled`, `ai_usage_*` tables exist unused | `src/lib/consent/catalog.ts`, migration `20261031000300`                                                |

## Recommendation and memory architecture

```
records ─► analyzeFinances() ─► recall from Walrus ─► deriveSignals() ─► buildRecommendations()
                                                                              │ upsert (one per kind/subject/month)
                                                                              ▼
                                                             public.recommendations (inbox)
                                                                              │ respond_to_recommendation()
                                                                              ▼
                                       outcome memory ─► Walrus (memory_records row, blob id)
                                                                              │ recommendations.outcome_memory_id
```

- Recommendation rows already keep `evidence` (the numbers used) and `memory_influence`
  (`blob_id`, the memory sentence, the effect).
- The full chain decision → memory → later recommendation can be followed through ids:
  `memory_influence[].blob_id` → `memory_records.blob_id` → `recommendations.outcome_memory_id`.
  Nothing renders this chain today, and nothing records it as events.

### Gaps this upgrade addresses

1. **No adaptation without Walrus.** Judges (and most users) won't have memory configured or
   consented, so the core promise can't be seen.
2. **No adaptation within a month.** `dedupe_key = kind:subject:period` allows one
   recommendation per month, so a decision only matters next month.
3. **No outcome measurement.** "Accepted" is recorded, but whether it helped is never checked.
4. **No decision timeline.** No structured events, no replay, no impact view.
5. **No scenario planning** and **no assistant**.

## Routes (unchanged by the audit)

Public: `/`, `/privacy`, `/terms`, `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`,
`/reset-password`, `/auth-error`, `/offline`, `/auth/confirm`, `/auth/sign-out` (POST).
Signed in: `/overview`, `/money/*`, `/intelligence`, `/intelligence/memory`, `/planning/*`,
`/nudges/*`, `/wellbeing/*`, `/settings/*`. APIs: `POST /api/sync` (outbox), `/api/cron/nudges`
(CRON_SECRET), `POST /settings/data/export`.

## Critical workflows to preserve

Sign-up/sign-in/reset and server-verified re-auth · finance writes only via
`apply_finance_mutation()` · transaction changes only via the IndexedDB outbox + `/api/sync` ·
recommendation answers only via `respond_to_recommendation()` · memory writes only via
`evaluateMemoryCandidate()`/`rememberCandidate()` · consent checked before every memory call ·
RLS on every user-owned table · data export covering every user table.

## Baseline (before any change)

Run on this commit's code (identical tree to the redesign commit verified on 8 Nov 2026):
`npm run verify` ✅ (272 unit tests, build OK) · `npm run test:db` ✅ 200/200 ·
`npm run test:e2e` ✅ 92/92 (desktop + Pixel 7). Re-run on 9 Nov before any change: typecheck ✅, lint ✅, unit 272/272 ✅, database 200/200 ✅.
