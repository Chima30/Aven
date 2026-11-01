# Testing

## Suites

| Command                                       | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Needs                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `npm run check:secrets`                       | No key-shaped strings (Supabase, Anthropic, JWT, PEM, `suiprivkey`, MemWal/Tatum/namespace assignments) or `.env` files committed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                              |
| `npm run typecheck` / `lint` / `format:check` | TypeScript strict, ESLint, Prettier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                              |
| `npm test`                                    | **Unit (210):** Stage 1–2 suites, plus: Walrus memory format round-trip and sensitive-content guard; HMAC namespaces; policy gate; **memory service against the official `MemWalMock`** (write → job → blob id, dedupe, no SDK call without consent/paused, rate-limit queue + retry, give-up after 5, namespace-mismatch refusal, recall, **cross-user isolation**, forget before/after blob id, forget all); MemWal/Tatum config validation; **analysis** (completed months, overspending, recurring/subscriptions, fixed-charge projection, income, savings rate, goals, currencies); **recommendations and the learning loop through `MemWalMock`** (decline → gentler, decline twice → withheld, change → your target, accept + met → next step, savings target from Walrus, subscription kept); Sui address/amount utils, error classification, core client mapping, caching | —                              |
| `npm run test:db`                             | **Database (146), real PostgreSQL 16:** Stage 1–2 suites, plus: RLS + two-user isolation for `memory_records`, `sui_wallets`, `chain_imports`, `recommendations`; memory records read-only for users, per-user dedupe, blob id required when stored, outbox erased, forget irreversible; wallet format/limit/label-only; `import_chain_transaction` (once per digest, near-duplicate confirmation, foreign wallet/account refused, invalid digest, released after delete); `respond_to_recommendation` (once, validated, isolated, no pre-answered inserts); financial memory consent available with new policy version, others locked; Stage 2 → 3 → 4 upgrade bundles                                                                                                                                                                                                            | PostgreSQL                     |
| `npm run test:e2e`                            | **Browser (74 = 37 × desktop + mobile):** Stage 1–2 flows, plus: an explained recommendation, **decline** and **change amount** recorded (DB checked); honest empty and "not configured" states on Intelligence, Walrus Memory and Integrations; memory consent blocked until disclosures are acknowledged, other memory categories locked; Sui wallet validation (rejects a private-key-shaped input), save, remove; new routes redirect signed-out visitors                                                                                                                                                                                                                                                                                                                                                                                                                      | PostgreSQL, build with e2e env |
| `npm run verify:tatum` _(optional, live)_     | Real Sui Mainnet read through Tatum with **your** key; evidence in `verification/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | your Tatum key                 |
| `npm run verify:walrus` _(optional, live)_    | Relayer health; with explicit authorisation, **≥ 10 real Walrus Mainnet memories** stored, recalled and listed; evidence in `verification/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | your MemWal credentials        |

### About the fake Supabase used in e2e

`tests/e2e/support/fake-supabase.mjs` imitates only the HTTP layer of Supabase
(a subset of PostgREST and GoTrue). Every query runs on a real PostgreSQL database with
AVEN's real migrations, as the `authenticated` role with the user's JWT claims, so RLS
and every database function behave as in production. It does **not** test real Supabase
Auth (sign-up emails, password checks, token refresh) or PostgREST itself.

## Results — email, redesign and motion, executed 1 Nov 2026

Unit 249 / 249 · Database 197 / 197 · build ✅ · end-to-end 84 / 84 (two consecutive full runs) ·
lint, types, formatting, secret scan clean · `npm audit --omit=dev` 0 vulnerabilities.
New: email selection/escaping/subject/SMTP-settings tests, stage 6 grants and upgrade bundle,
dark default theme, no email address or "Stage N" text in the app shell. A test race in the
offline-conflict e2e (navigating away before the offline edit was stored) was fixed.

## Results — Planning, Nudge Center & Wellbeing phase, executed 1 Nov 2026 on branch `stage-life`

| Check                                   | Result                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project structure guard / secret scan   | ✅ OK / ✅ no secrets                                                                                                                                                                                                                                                        |
| TypeScript (strict) · ESLint · Prettier | ✅ 0 errors · ✅ 0 errors, 0 warnings · ✅ formatted                                                                                                                                                                                                                         |
| Unit tests                              | ✅ 241 / 241 (new: time zones and DST, recurrence + exceptions, streaks, units, scheduler rules and summaries, memory candidates, memory-based suggestions, Nudge labels, nav, cron endpoint auth)                                                                           |
| Database tests (PostgreSQL 16)          | ✅ 194 / 194 (new: `apply_life_mutation` for every entity, ownership guards, wellbeing consent in the DB, notifications read/dismiss only, `scheduler_status()`, RLS + two-user isolation for all 16 new user-owned tables, stage 4 → 5 upgrade bundle, 44-table full setup) |
| Production build                        | ✅ succeeded                                                                                                                                                                                                                                                                 |
| End-to-end (desktop + Pixel 7)          | ✅ 84 / 84 (new: nav without LATER labels; create + complete a task through the outbox; wellbeing consent gate, water in fl oz stored as ml, Pulse Check; Nudge inbox read/dismiss and history reasons; cross-user isolation in the UI)                                      |
| `npm audit --omit=dev`                  | ✅ 0 vulnerabilities                                                                                                                                                                                                                                                         |

In e2e the fake Supabase has no service role, so the per-user catch-up scheduler logs
"JWT required" and does nothing; notifications for the Nudge Center test are inserted the way
the scheduler would. The scheduler's rules are covered by unit tests and its writes by DB tests.

**Not verified here:** the GitHub Actions schedule and Vercel Cron calling your deployed site
(needs your `CRON_SECRET`), and planning/wellbeing memories on Walrus Mainnet (needs your MemWal
credentials and the new consents).

## Results, actually executed 31 Oct 2026 on branch `stage3` (hackathon build)

| Check                                                | Result                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project structure guard                              | ✅ OK                                                                                                                                                                                                                                            |
| Secret scan                                          | ✅ No secrets found                                                                                                                                                                                                                              |
| TypeScript (strict)                                  | ✅ 0 errors                                                                                                                                                                                                                                      |
| ESLint                                               | ✅ 0 errors, 0 warnings                                                                                                                                                                                                                          |
| Prettier                                             | ✅ all files formatted                                                                                                                                                                                                                           |
| Unit tests (Vitest)                                  | ✅ 210 / 210 passed                                                                                                                                                                                                                              |
| Database tests (Vitest + PostgreSQL 16)              | ✅ 146 / 146 passed (incl. schema-vs-types drift test)                                                                                                                                                                                           |
| Production build (`next build`, Next 16.4.3)         | ✅ succeeded                                                                                                                                                                                                                                     |
| End-to-end (Playwright, Chromium, desktop + Pixel 7) | ✅ 74 / 74 passed, two consecutive full runs                                                                                                                                                                                                     |
| `npm audit --omit=dev`                               | ✅ 0 vulnerabilities                                                                                                                                                                                                                             |
| Live Walrus Mainnet / Tatum checks                   | ⏳ **Not run** — this build environment can't reach the relayer or Tatum, and they need your credentials. Code paths were exercised offline (all three Sui transports attempted real connections; the Walrus health call attempted the relayer). |

Bugs the new tests found and that were fixed: linear month-end projection doubled fixed charges
(rent on the 1st looked like overspending); answered recommendations vanished before their
confirmation could be shown.

## Not verified (needs your Supabase project / GitHub / Vercel / credentials)

- **Walrus Mainnet**: real `remember` / job completion / `recall` / `listMemories` — run
  `npm run verify:walrus` (writes need `AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES`).
- **Tatum Sui Mainnet**: which transport your plan serves, real balances and transaction
  listing — run `npm run verify:tatum` (try `TATUM_VERIFY_ALL_TRANSPORTS=1`).
- The import action's live re-check of a digest on Sui (needs Tatum).

- Real Supabase Auth flows: sign-up email, sign-in, password reset email, sign out everywhere,
  account deletion via the Admin API.
- The migrations and upgrade on real Supabase. They are tested on PostgreSQL 16 with a shim of
  the Supabase pieces they use; Supabase runs PostgreSQL 15+ and `security_invoker` views
  need 15+.
- PostgREST-specific behaviour (the e2e stand-in imitates it).
- GitHub Actions and Vercel deployment (first run when you push).
- Real devices: installing the PWA and offline entry on iOS Safari and Android Chrome.

## Running database tests locally (developers)

```bash
# any PostgreSQL 15+ that you can create databases on
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
```
