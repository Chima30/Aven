# AVEN personal intelligence audit — 9 November 2026

Baseline: `bae7ab3da01e69020c3346e5b17c2d44899cec6e` (main).
Working branch: `codex/aven-personal-intelligence`.

## Scope and evidence

Source review covers route and module inventory, auth/proxy, database migrations and grants,
finance write paths, offline sync, intelligence generation/response, Walrus policy/runtime/
service/repository, Sui boundary, scheduler/email, exports, CI and test configuration.
This is a repository audit, not a penetration test or verification of the deployed database.
No production credentials, authenticated production session, or live integration evidence was
provided. Existing documentation is context, not proof of runtime success.

## Baseline verification

`npm ci --ignore-scripts`: installed 501 packages from the existing lockfile.
`npm run verify`: PASS (structure, secret scan, typecheck, lint, formatting, 272 unit tests
in 17 files, production build). No source changes preceded this run.
`npm run test:db`: BLOCKED by ECONNREFUSED on local 127.0.0.1:54329; 7 files failed,
1 test passed, 5 failed, 194 skipped. PostgreSQL and Docker are not installed here.
This does not demonstrate a schema failure. Database/RLS and signed-in e2e verification remain
required before merge. No live Walrus/Tatum tests run; they require credentials and may write
external memory. No production database operations or deployments performed.

## Feature inventory

| Capability                                  | Source implementation                                                    | Validation and limits                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Auth, recovery, settings, consent           | `(auth)/actions.ts`, auth callbacks, proxy, `lib/auth`, settings actions | Source present; unit security/recovery tests pass; actual Supabase auth not exercised                      |
| Accounts, transactions, budgets, goals      | `money/*`, `lib/finance`, finance SQL RPCs                               | Real forms and deterministic read/write logic; unit money/finance tests pass; DB suite blocked             |
| Transfers and calculations                  | bigint money utilities, account views, finance RPC                       | Currencies kept separate; analysis uses bounded JS integer totals rather than all-bigint; preserve limits  |
| Offline logging/sync                        | IndexedDB outbox, queues, `/api/sync`, service worker                    | Unit retry/conflict/isolation tests pass; full browser/DB flow not run                                     |
| Financial recommendations                   | `lib/intelligence/{analysis,recommend,server,learning}`                  | Deterministic implemented pipeline, unit tests pass; recommendations persisted per subject/month           |
| Decision learning                           | `respond_to_recommendation`, outcome memory, `deriveSignals`             | Actual reject/modify adaptation exists; not merely landing-page copy                                       |
| Walrus                                      | `lib/memory`, MemWal 0.1.12                                              | SDK-backed implementation and official mock tests; no live proof in this audit                             |
| Read-only Sui wallets                       | `money/wallets`, `lib/sui`, confirmed import RPC                         | Actual adapter and UI; mocked Sui tests pass; live endpoint not verified                                   |
| Planning                                    | Tasks, calendar recurrence, habits, reviews, life RPC/outbox             | Implemented; unit tests pass; DB/browser validation pending                                                |
| Wellbeing/Pulse Check                       | Sleep, water, meals, activity, mood, consent-checked life mutations      | Implemented; deterministic suggestions; no medical inference                                               |
| Nudge Center and emails                     | Scheduler, notification rules, cron route, SMTP adapter                  | Actual inbox/email paths; unit tests pass; email delivery not tested                                       |
| AI chat provider                            | None                                                                     | AI quota/preferences scaffolding exists; no working LLM integration to advertise                           |
| Decision Replay / AVEN Impact / What-if Lab | Absent at baseline                                                       | New functionality needed; reuse existing records and services                                              |
| Upcoming bill ledger                        | Absent                                                                   | Detected recurring charges are estimates, not confirmed obligations; planning events are not payable bills |
| Demo workspace                              | No isolated interactive learning workspace                               | Existing demo script is documentation, not a working sandbox                                               |

## Findings, ordered by priority

1. **High — retry consent gap.** `refreshMemoryJobs` calls `submit` on queued/failed jobs
   without a policy context; `refreshMemoryAction` invokes it even while paused or after
   consent withdrawal. `rememberCandidate` gates initial writes correctly. Consent withdrawal
   does not clear the queue in SQL. Fix retry policy checks before expanding memory use.
2. **High — retained memory influence.** Recommendation rows copy `memory_influence` summaries.
   `runIntelligence` uses insert-ignore on conflict, so a same-month recommendation survives
   recall failure, pause, consent withdrawal or forgetting. UI can still display an old summary
   and adaptation. Suppress unavailable memory evidence on display and distinguish historical
   generation from current retrieval. Do not claim revocation rewrites historic records.
3. **Medium — pending != stored.** Response action says “Saved to Walrus Memory” for submitted,
   queued and duplicate records; cards infer stored status from a foreign key. Link to bookkeeping
   state and distinguish queued/submitted/stored/failed/suppressed. Even stored does not prove
   successful recall or later influence.
4. **Medium — provenance gaps.** Evidence records aggregate numbers but not exact contributing
   transaction ids or observation windows. Stable recommendation/memory ids exist; decisions
   have exactly-once response timestamps. Capture versioned source references for new records;
   label historical missing provenance honestly. “Outcome” memory currently means user decision,
   not an observed financial result.
5. **Medium — learning scope.** Signals key by kind/subject, not currency; a changed default
   currency can reuse a savings decision in different units. Some rules use arbitrarily old
   decisions; future-dated records are not screened. Scope amounts by currency/date and add tests.
6. **Medium — stale/open suggestions.** Monthly deduplication intentionally freezes a suggestion.
   New recalls can change a computed draft without changing an existing stored card. Preserve
   history; make adaptation time boundaries explicit rather than overwriting the old suggestion.
7. **Medium — impact cannot imply causation.** No durable observed outcome ledger exists.
   Decisions can be counted now; before/after spending requires complete comparable periods,
   known scope and timing, and an observation label. Zero logged expenses is not proof of zero
   real spending. Goals completed do not prove advice caused completion.
8. **Medium — paging.** Transactions and goal entries are paged, but several categories/budgets/
   goals/progress and suppressed memory lists are single queries, subject to Supabase's row cap.
   New dashboard loaders must page and visibly handle truncation/errors.
9. **Low — documentation drift.** Docs describe CSP without nonces although proxy implements
   nonces, describe fewer migrations than present, and understate scheduler admin access.
   Prefer source and test evidence over status labels in old docs.

## Preserved boundaries

- Verified session user controls namespaces and RLS-scoped queries; no browser-supplied user id.
- Finance mutations exclusively through existing RPC; transaction writes through IndexedDB queue.
- Sui reads stay separate from balances; importing requires existing explicit confirmation flow.
- Service worker caches static assets/offline shell, never private pages.
- Memory suppression is not deletion of encrypted Walrus blobs.
- Server credentials stay server-only; no AI arithmetic or inferred financial transactions.

## Implementation sequence

1. Audit and baseline (this report).
2. Replay: structured read model using stable existing ids; source provenance for new drafts;
   accurate memory status; no new tables required initially.
3. Adaptation: currency/date boundaries, consent-safe retries, historical evidence visibility.
4. Impact: honest record counts and complete-period observations; no claimed attributable savings.
5. What-if: bigint scenarios from balances, explicit reserve/obligation assumptions; never mutate
   finances. No claims of bill coverage without confirmed obligations.
6. Optional AI: provider abstraction and consent boundary; disabled with no configured provider.
7. Isolated example workspace using the real deterministic engine; label all data and mock status.
8. Navigation/landing polish, regression report and reviewable source diff. DB and full browser
   verification are merge gates. No merge, migration application or deployment is authorized.
