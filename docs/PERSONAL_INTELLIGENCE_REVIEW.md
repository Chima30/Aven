# Personal intelligence upgrade — review and setup

This change extends the existing AVEN application. It is not a rebuild. Production database,
auth settings, integration credentials and deployed application have not been changed.
Branch: `codex/aven-personal-intelligence`.

## Stage results

| Stage                     | Changes                                                                                                                                                                        | Checks actually executed                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1 — Audit                 | `PERSONAL_INTELLIGENCE_AUDIT.md`; routes, data boundaries and missing capabilities inventoried                                                                                 | Baseline verify passed: structure, secrets, types, lint, format, 272 unit tests, build. DB connection unavailable |
| 2 — Replay                | `intelligence/replay` page; paged history loader; stable recommendation/decision/memory/adaptation event ids; new-record aggregate provenance                                  | 275 unit tests; typecheck/lint passed. Initial format check caught audit Markdown formatting, then corrected      |
| 3 — Adaptation and memory | Fresh consent/pause checks before production submissions and retry SDK calls; no retries without policy loader; currency/future boundaries; accurate pending-vs-stored wording | 278 unit tests, typecheck; official MemWal mock, no live writes                                                   |
| 4 — Impact                | Saved decision counts, recorded completed-goal status, whole-month spending observations and methods                                                                           | 281 unit tests                                                                                                    |
| 5 — What-if Lab           | Existing account balance loader, actual budgets and bigint cash/goal projections; visible manual obligations reserve; no writes                                                | 285 unit tests, typecheck                                                                                         |
| 6 — Optional companion    | Provider contract, consent gate, timeout/failure/reference validation; integration design                                                                                      | 288 unit tests. No provider adapter, chat UI, external requests or live AI verification                           |
| 7 — Example workspace     | Public `/demo`, real analysis/recommendation/learning functions, tab-local example decisions, reset                                                                            | 289 unit tests; 10% rejection → 5% adaptation and modified-target reuse verified                                  |
| 8 — Review preparation    | Landing/navigation, planned-AI copy, forgotten-memory visibility, bounded source references, branch-specific deployment exclusion; browser test added                          | Final regression results recorded below                                                                           |

All existing auth, RLS, financial write RPCs, transaction queues, offline transport, Sui/Tatum
readers and SDK configuration remain in place. No dependency or database migration added.
New pages are read-only. Existing recommendation acceptance still uses its original budget
creation workflow; this upgrade does not add new writes to it.

## Using the changes locally

1. Check out this branch; use Node 22 (the existing CI version), then `npm ci`.
2. Keep existing `.env.local` configuration, or copy variable names from `.env.example`.
   Never put credential values in git or a review comment.
3. Run `npm run dev`. `/demo` is available without an account. Authenticated users can open
   Intelligence → Decision Replay, AVEN Impact or What-if Lab.
4. Replay/Impact initially have empty states. Answer existing recommendations to create history.
   Walrus outcomes can be pending; refresh the existing Memory page to inspect status.
5. No SQL is required by this upgrade. Do not apply `setup_all_in_one.sql` to an existing project.

Required existing variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY`.
Optional existing memory variables: `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`,
`MEMWAL_SERVER_URL`, `MEMWAL_NAMESPACE`, `MEMWAL_NAMESPACE_SECRET`.
Keep the existing namespace and namespace secret to preserve access to old memories.
Optional existing Sui variables: `TATUM_API_KEY`, `TATUM_SUI_TRANSPORT`,
`TATUM_SUI_GRPC_HOST`, `TATUM_SUI_GRPC_WEB_URL`, `TATUM_SUI_RPC_URL`.
Existing scheduler/email variables remain in `.env.example`. No AI key is requested or used.

## Judge walkthrough

Open `/demo`, read the example-data notice and situation. Decline the initial 10% spending
cut. Open the next month's scenario and see a gentler 5% cut with its local example memory
reference. Change the target to 52000 NGN, advance again, and see that number reused. Inspect
Decision Replay and reset the workspace. No Supabase or Walrus writes are made by the demo.
Example rent is explicitly a reserve assumption, not evidence of a confirmed bill integration.
A simulated month passing does not create a measured financial outcome.

## Methods and honest limits

- Replay is a structured read model over existing durable records, not a new append-only event
  ledger. It can show exactly one decision per recommendation and recorded downstream blob
  influences. It cannot reconstruct events that were never captured.
- New recommendations retain linked subject ids, up to 40 transaction ids, source count,
  observation date and aggregate inputs. A truncation flag marks a longer source list. This is
  not a full immutable transaction snapshot; edits/deletions of source records can limit replay.
- Historical memory influence is not a fresh retrieval proof. Replay never secretly recalls
  memory contents. Memory metadata/reference display is gated by current financial consent
  and pause state. Forgotten summaries are not shown as active influences.
- Old recommendation explanations and decision history remain historical records; forgetting
  a memory does not erase all prior explanations containing related context.
- Open recommendations depending on unavailable or forgotten memory are withheld, not silently
  re-created. Monthly deduplication can therefore leave no replacement until a later period.
- Memory withdrawal prevents future retry SDK calls when fresh policy is checked; an upload
  already accepted by the relayer cannot be cancelled by AVEN. Walrus deletion is unavailable.
- Existing durable preferences have no new automatic age expiry. Currency/date scoping blocks
  mismatched and future decisions, but a full preference-expiration policy remains future work.
- Impact reports logged spending changes, not causal or verified real-world savings. Both
  periods require expense entries; incomplete recording can still bias observations. It does
  not measure habit improvement attributable to advice. Analysis lookback limits older results.
- History loaders page to 20,000 rows and show a partial-history warning if capped. What-if
  pages goals, goal progress and budgets, refusing incomplete inputs; existing account and
  other financial analysis loaders retain the caps noted in the audit.
- What-if uses synced recorded balances in the default currency. It excludes pending offline
  changes, bank reconciliation, FX, returns and unknown obligations. All baseline saving and
  reserve assumptions are editable. It offers no apply action and creates no financial records.
- Scenario goals are restricted to the selected currency and preserve exact saved amounts.
  Budget reductions use a selected real budget and a whole percentage, rounded down to minor
  units. They are hypothetical spending reductions, not savings created by changing a limit.
- Goal projections assume the entire entered monthly surplus is allocated to the selected goal.
  Goal progress is tracked separately; a purchase never silently changes its recorded progress.
- Optional AI is an extension contract only; it is not a released chatbot. Citation checks
  alone cannot guarantee truthful provider prose. See `OPTIONAL_COMPANION.md`.
- No live Walrus, Tatum, SMTP or Supabase Auth checks were run. Mock success is not Mainnet proof.
- Full database/RLS and signed-in desktop/mobile browser regression are required before merge.

## Deployment and review controls

`vercel.json` disables Git-triggered deployments for this branch alone using
`git.deploymentEnabled`. Main keeps its existing behavior. This permits source review without
creating a preview deployment. No merge, production migration or deployment is authorized.

Before approving release, run the existing DB/e2e suites in CI or an isolated PostgreSQL 16
instance, review the audit findings and new source diff, and exercise live integrations with
your own credentials separately. Never point DB tests at production: they create/drop test DBs.

## Final local regression

- `npm run verify`: PASS from a clean `.next` directory: structure, secrets, typecheck,
  ESLint, Prettier, **293 unit tests in 24 files**, and production build.
- Earlier incremental builds hit a local Turbopack persistence-cache error ("invalid digit
  found in string"). Removing the generated `.next` output and rerunning the complete verify
  command succeeded. No source workaround or dependency change was required.
- `npm run test:db`: attempted again; local PostgreSQL connection refused. 1 passed,
  5 failed during connection setup, 194 skipped; 7 test files affected. Not a passing DB run.
- `npm run test:e2e -- tests/e2e/decision-demo.spec.ts`: attempted; the test Supabase server
  could not start because PostgreSQL was unavailable. Browser test assertions did not execute.
- `npx playwright install chromium`: attempted; download returned invalid/truncated archives.
  No browser/mobile visual validation is claimed.
- Local production HTTP smoke: `/` and `/demo` returned 200; demo content was present.
  Replay/Impact/Lab returned 307 to sign-in with the expected missing-config guard, using no
  production credentials. This is not an authenticated workflow test.
- `git diff --check`: passed. No database files, lockfile or auth handlers changed.

The change is ready for source review, not approved for merge or deployment. Database and
browser CI must still pass; credentialed live integration checks remain separate.
